// ============================================================
// Counter-Strike beta spatial round director (Dust II only)
// Movement plans are built on the real CS2 nav-area graph.
// ============================================================

const {
  graph,
  findPath,
  routeThrough,
  toTimedMotion,
  validateMotion
} = require('./dust2-navigation');
const { ShooterWorld } = require('./shooter-world');
const { starterWeapon, rifleWeapon, getWeapon } = require('./cs-weapon-catalog');
const { resolveBurst, resolveElimination } = require('./cs-combat');
const { initialReserveAmmo } = require('./cs-ground-inventory');
const { calculateBombDamage } = require('./cs-bomb-damage');
const {
  evaluatePlantOpportunity,
  choosePostPlantDecision
} = require('./cs-round-decisions');
const {
  assignRoundRoles,
  taskForRole,
  evaluateMidRoundCall
} = require('./cs-team-tactics');
const {
  awpSightlineFor,
  utilitySetupsForPlan,
  ctOpeningRoute,
  ctUtilitySetups,
  postPlantPositionsFor
} = require('./cs-dust2-tactical-catalog');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const DUST2 = Object.freeze(graph.landmarks);
const NAV_NODES = new Map(graph.nodes.map(node => [node.id, node]));
const BOMB_LOGICAL_SECONDS = 40;
const BOMB_WORLD_WINDOW_MS = 12000;
const BOMB_ESCAPE_SECONDS = 7;

function bombWorldMsForSeconds(seconds) {
  return Math.round(BOMB_WORLD_WINDOW_MS * (seconds / BOMB_LOGICAL_SECONDS));
}

const ATTACK_ROUTES = Object.freeze({
  long: ['tSpawn', 'longDoors', 'longCorner', 'longA', 'aRamp', 'aSite'],
  // Reported fast Short route: leave the corrected T floor through the right
  // corridor, curve around the exposed straight-Mid AWP line, then join Xbox.
  short: ['tSpawn', 157, 61, 51, 52, 35, 47, 291, 301, 557, 594, 621, 'short', 'aSite'],
  b: ['tSpawn', 'upperTunnels', 'tunnelExit', 'bSite'],
  midB: ['tSpawn', 'topMid', 'xbox', 'midDoors', 'ctMid', 'bDoors', 'bSite']
});

// Spawn markers in the imported radar data were semantic guesses rather than
// Valve spawn entities. Keep both teams on five distinct nav areas inside the
// report-verified real spawn floors.
const T_SPAWN_AREA_IDS = Object.freeze([352, 354, 433, 338, 382]);
const CT_SPAWN_AREA_IDS = Object.freeze([1450, 1451, 1644, 1444, 1645]);

const DEFENDER_ROUTES = Object.freeze({
  long: [
    ['ctSpawn', 'aRamp', 'longA'],
    ['ctSpawn', 'aSite'],
    ['ctSpawn', 'short'],
    ['ctSpawn', 'ctMid'],
    ['ctSpawn', 'bDoors', 'bSite']
  ],
  short: [
    ['ctSpawn', 'short'],
    ['ctSpawn', 'aSite'],
    ['ctSpawn', 'ctMid'],
    ['ctSpawn', 'bDoors'],
    ['ctSpawn', 'bSite']
  ],
  b: [
    ['ctSpawn', 'bDoors', 'bSite'],
    ['ctSpawn', 'bDoors'],
    ['ctSpawn', 'ctMid'],
    ['ctSpawn', 'short'],
    ['ctSpawn', 'aSite']
  ],
  midB: [
    ['ctSpawn', 'ctMid'],
    ['ctSpawn', 'bDoors'],
    ['ctSpawn', 'bSite'],
    ['ctSpawn', 'short'],
    ['ctSpawn', 'aSite']
  ]
});

const RETAKE_LANES = Object.freeze({
  A: Object.freeze([
    { lane: 'ramp', ingress: 'aRamp' },
    { lane: 'ramp', ingress: 'aRamp' },
    { lane: 'short', ingress: 'short' },
    { lane: 'short', ingress: 'short' },
    { lane: 'ct', ingress: 'ctSpawn' }
  ]),
  B: Object.freeze([
    { lane: 'doors', ingress: 'bDoors' },
    { lane: 'doors', ingress: 'bDoors' },
    { lane: 'tunnels', ingress: 'tunnelExit' },
    { lane: 'tunnels', ingress: 'tunnelExit' },
    { lane: 'mid', ingress: 'ctMid' }
  ])
});

function rawName(char) {
  return char?.name || char?.character_name || 'Bilinmeyen';
}

function rawEmoji(char) {
  return char?.emoji || char?.avatar_emoji || '●';
}

function copyPoint(point) {
  return {
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
    z: Number((point.z || 0).toFixed(1))
  };
}

function selectAttackPlan(rng = Math.random, defenderBuyType = 'unknown') {
  const roll = rng();
  const armedCt = ['half', 'force', 'full', 'hero'].includes(defenderBuyType);
  const weakCt = defenderBuyType === 'eco';
  const weights = armedCt
    ? [0.31, 0.34, 0.28, 0.07]
    : (weakCt ? [0.24, 0.24, 0.24, 0.28] : [0.28, 0.26, 0.28, 0.18]);
  if (roll < weights[0]) return 'long';
  if (roll < weights[0] + weights[1]) return 'short';
  if (roll < weights[0] + weights[1] + weights[2]) return 'b';
  return 'midB';
}

function loadoutBuyType(loadouts, teamId) {
  const counts = new Map();
  for (const player of loadouts?.[teamId] || []) {
    const buyType = player?.buyType || 'unknown';
    counts.set(buyType, (counts.get(buyType) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
}

function attackerRoute(plan, index) {
  if (index < 4) return ATTACK_ROUTES[plan];
  // Beşinci oyuncu farklı bilgi koridorunu tutabilir ancak ana takımın gittiği
  // bombsite'tan kopmaz. Eski ters-site rotaları planterı sık sık yalnız bıraktı.
  if (plan === 'long') return ['tSpawn', 'topMid', 'xbox', 'short', 'aSite'];
  if (plan === 'short') return ['tSpawn', 'topMid', 'xbox', 'short', 'aSite'];
  if (plan === 'b') return ['tSpawn', 'topMid', 'lowerTunnels', 'tunnelExit', 'bSite'];
  return ['tSpawn', 'upperTunnels', 'tunnelExit', 'bSite'];
}

class Dust2RoundDirector {
  constructor({
    team1,
    team2,
    round,
    team1Attacker,
    isPistol,
    score1 = 0,
    score2 = 0,
    getRating,
    rng,
    loadouts = null,
    includeDebugTelemetry = false
  }) {
    this.round = round;
    this.team1Attacker = Boolean(team1Attacker);
    this.attackerTeamId = this.team1Attacker ? 1 : 2;
    this.defenderTeamId = this.team1Attacker ? 2 : 1;
    this.isPistol = Boolean(isPistol);
    this.score1 = Number(score1) || 0;
    this.score2 = Number(score2) || 0;
    this.mustContestRound = this.isPistol
      || this.round === 12
      || this.round === 24
      || this.round > 24
      || Math.max(this.score1, this.score2) >= 12;
    this.getRating = getRating;
    this.rng = rng || Math.random;
    this.loadouts = loadouts;
    this.includeDebugTelemetry = Boolean(includeDebugTelemetry);
    this.attackerBuyType = loadoutBuyType(this.loadouts, this.attackerTeamId);
    this.defenderBuyType = loadoutBuyType(this.loadouts, this.defenderTeamId);
    this.forcePlantTempo = this.mustContestRound
      || ['pistol', 'eco'].includes(this.attackerBuyType);
    this.plan = selectAttackPlan(this.rng, this.defenderBuyType);
    this.attackPlanReason = ['half', 'force', 'full', 'hero'].includes(this.defenderBuyType)
      ? 'AVOID_STRAIGHT_MID_AWP'
      : (this.defenderBuyType === 'eco' ? 'PUNISH_WEAK_MID_BUY' : 'BALANCED_OPENING');
    this.eventIndex = 0;
    this.players = [];
    this.playerByChar = new Map();
    this.motionPlans = new Map();
    this.plantedSite = null;
    this.plantPosition = null;
    this.plantTargetNode = null;
    this.bombCarrier = null;
    this.bombDropPosition = null;
    this.postPlantDecision = null;
    this.postPlantSetup = [];
    this.postPlantCoordinationTimeline = [];
    this.lastPostPlantRecallTick = -Infinity;
    this.lastPlanterSupportTick = -Infinity;
    this.ctOpeningAssignments = [];
    this.twoCtLongOpening = false;
    this.retakePlan = [];
    this.defuseAttempt = null;
    this.fakePlantUsed = false;
    this.fakePlantCooldownTick = null;
    this.fakeDefuseUsed = false;
    this.ninjaFailed = false;
    this.bombPlantTick = null;
    this.bombDeadlineTick = null;
    this.escapeStartTick = null;
    this.lastPlantEvaluation = null;
    this.plantUrgencyCarrierId = null;
    this.plantUrgencyWindowOpened = false;
    this.midRoundCall = null;
    this.awpCommitReleaseTimeline = [];
    this.regulationDurationMs = 9800;
    this.roundDurationMs = this.regulationDurationMs;
    this.travelDurationMs = 5400;

    this.registerTeam(team1, 1);
    this.registerTeam(team2, 2);
    this.roleAssignments = this.assignRoles();
    this.applyReportedDefenderOpenings();
    this.applyOpeningAwpHolds();
    this.assignBombCarrier();
    this.utility = this.createOpeningUtility();
    this.world = new ShooterWorld({
      players: this.players,
      motionPlans: this.motionPlans,
      durationMs: this.roundDurationMs,
      utility: this.utility,
      round: this.round,
      rng: this.rng,
      attackPlan: this.plan
    });
    this.world.setRoundPhase('regulation', {
      mustContestRound: this.mustContestRound,
      forceObjectiveTempo: this.forcePlantTempo
    });
    this.plantUrgencyTick = Math.round(
      this.world.maxTick * (this.forcePlantTempo ? 0.12 : 0.26)
    );
    this.midRoundCheckTick = Math.round(this.world.maxTick * 0.44);
    this.applyPhaseTasks('regulation');
  }

  assignRoles() {
    const assignments = [];
    for (const teamId of [1, 2]) {
      const side = teamId === this.attackerTeamId ? 'T' : 'CT';
      const teamPlayers = this.players.filter(player => player.teamId === teamId);
      const teamAssignments = assignRoundRoles(teamPlayers, side);
      for (const assignment of teamAssignments) {
        const player = teamPlayers.find(candidate => candidate.id === assignment.id);
        if (!player) continue;
        player.roundRole = assignment.role;
        player.roundTask = assignment.initialTask;
        assignments.push(assignment);
      }
    }
    return assignments;
  }

  applyReportedDefenderOpenings() {
    const defenders = this.players.filter(player => player.teamId === this.defenderTeamId);
    if (!defenders.length) return;

    const lowerRushCandidates = defenders.filter(player => {
      const category = getWeapon(player.weapon)?.category;
      return category === 'smg' || player.buyType === 'eco';
    });
    const sendLowerRush = lowerRushCandidates.length > 0 && this.rng() < 0.34;
    const sendTwoLong = !sendLowerRush && this.plan === 'long' && this.rng() < 0.44;
    const fifthRouteId = sendLowerRush
      ? 'ct-lower-rush'
      : sendTwoLong
        ? 'ct-long-car'
        : ['b', 'midB'].includes(this.plan)
          ? 'ct-b-window'
          : 'ct-a-site-anchor';
    const routeIds = [
      'ct-long-pick',
      'ct-short-hold',
      'ct-b-anchor',
      'ct-mid-hold',
      fifthRouteId
    ];
    const remaining = [...defenders];
    const assignments = [];

    for (const routeId of routeIds) {
      const opening = ctOpeningRoute(routeId);
      if (!opening || !remaining.length) continue;
      const candidates = remaining
        .map(player => {
          const category = getWeapon(player.weapon)?.category;
          const conditionalPenalty = opening.conditional === 'smg-or-eco'
            && category !== 'smg'
            && player.buyType !== 'eco'
            ? 1000
            : 0;
          const roleBonus = opening.lane === 'mid' && player.roundRole === 'awp'
            ? -18
            : opening.lane === 'b' && player.roundRole === 'anchor'
              ? -13
              : opening.lane === 'long' && player.roundRole === 'entry'
                ? -9
                : 0;
          return {
            player,
            score: this.pathDistance(player.position, opening.endpointAreaId)
              + conditionalPenalty
              + roleBonus
          };
        })
        .sort((first, second) => first.score - second.score);
      const selected = candidates[0]?.player;
      if (!selected) continue;
      remaining.splice(remaining.indexOf(selected), 1);
      const route = findPath(selected.position, opening.endpointAreaId);
      const laneIndex = (selected.teamId === 1 ? 1 : -1)
        * (defenders.indexOf(selected) + 1);
      const durationMultiplier = opening.id === 'ct-long-pick'
        ? 0.33
        : opening.id === 'ct-lower-rush'
          ? 0.32
          : 0.39;
      const points = toTimedMotion(
        route,
        laneIndex,
        Math.round(this.travelDurationMs * durationMultiplier)
      );
      if (!points.length || !validateMotion(points)) continue;
      this.motionPlans.set(selected.id, points);
      selected.openingAssignmentId = opening.id;
      selected.openingLane = opening.lane;
      selected.openingTask = opening.task;
      selected.roundTask = opening.task;
      assignments.push({
        playerId: selected.id,
        routeId: opening.id,
        lane: opening.lane,
        endpointAreaId: opening.endpointAreaId,
        durationMs: points[points.length - 1]?.t || 0,
        conditional: opening.conditional || null
      });
    }

    this.ctOpeningAssignments = assignments;
    this.twoCtLongOpening = assignments.filter(item => item.lane === 'long').length >= 2;
  }

  applyOpeningAwpHolds() {
    for (const player of this.players) {
      if (
        player.roundRole !== 'awp'
        || !['AWP', 'SSG 08'].includes(player.weapon)
      ) continue;
      const sightline = awpSightlineFor({ side: player.side, plan: this.plan });
      if (!sightline) continue;
      const route = findPath(player.position, sightline.anchorAreaId);
      if (!route.length) continue;
      const teamPlayers = this.players.filter(candidate => candidate.teamId === player.teamId);
      const laneIndex = (player.teamId === 1 ? 1 : -1)
        * (teamPlayers.indexOf(player) + 1);
      const openingDuration = player.side === 'CT'
        ? Math.round(this.travelDurationMs * 0.37)
        : Math.round(this.travelDurationMs * 0.48);
      const points = toTimedMotion(route, laneIndex, openingDuration);
      if (!validateMotion(points)) continue;
      this.motionPlans.set(player.id, points);
      const openingAssignment = this.ctOpeningAssignments?.find(
        assignment => assignment.playerId === player.id
      );
      if (openingAssignment) {
        openingAssignment.durationMs = points[points.length - 1]?.t || openingDuration;
        openingAssignment.awpSightlineId = sightline.id;
      }
      player.awpSightlineId = sightline.id;
      player.awpSightlineLabel = sightline.label;
      player.awpWatch = copyPoint(sightline.watch);
      player.awpMaxVerticalDelta = sightline.maxVerticalDelta || 150;
      player.awpFallbackKey = sightline.fallback;
      player.roundTask = 'hold-reported-awp-line';
    }
  }

  applyPhaseTasks(phase, decision = null) {
    for (const player of this.players) {
      player.roundTask = phase === 'regulation' && player.openingTask
        ? player.openingTask
        : taskForRole(player.roundRole, {
            side: player.side,
            phase,
            decision
          });
    }
    this.world?.recordRoleTasks?.(phase, decision);
  }

  registerTeam(team, teamId) {
    const isAttacker = teamId === this.attackerTeamId;
    team.slice(0, 5).forEach((char, index) => {
      const routeKeys = isAttacker
        ? attackerRoute(this.plan, index)
        : DEFENDER_ROUTES[this.plan][index % DEFENDER_ROUTES[this.plan].length];
      const spawnAreaIds = isAttacker ? T_SPAWN_AREA_IDS : CT_SPAWN_AREA_IDS;
      const routedKeys = [
        spawnAreaIds[index % spawnAreaIds.length],
        ...routeKeys.slice(1)
      ];
      const navRoute = routeThrough(routedKeys);
      const laneIndex = (teamId === 1 ? 1 : -1) * (index + 1);
      const rating = this.getRating(char, 'cs');
      const side = isAttacker ? 'T' : 'CT';
      const loadout = this.loadouts?.[teamId]?.[index] || null;
      const weapon = loadout
        ? getWeapon(loadout.weapon)
        : (this.isPistol
          ? starterWeapon(side)
          : (rating >= 88 && this.rng() < 0.28 ? getWeapon('AWP') : rifleWeapon(side)));
      const pace = clamp(1.04 - (rating - 70) / 420, 0.94, 1.07);
      const points = toTimedMotion(navRoute, laneIndex, Math.round(this.travelDurationMs * pace));
      if (!validateMotion(points)) {
        throw new Error(`Dust II rota doğrulaması başarısız: ${routedKeys.join(' -> ')}`);
      }
      const start = points[0] || DUST2[isAttacker ? 'tSpawn' : 'ctSpawn'];
      const player = {
        id: `cs-${teamId}-${index}`,
        teamId,
        name: rawName(char),
        emoji: rawEmoji(char),
        alive: true,
        side,
        position: {
          ...copyPoint(start),
          areaId: start.areaId || start.id
        },
        rating,
        health: 100,
        armor: loadout ? loadout.armor : (this.isPistol ? 0 : 100),
        helmet: loadout ? loadout.helmet : !this.isPistol,
        hasDefuseKit: loadout
          ? Boolean(loadout.hasDefuseKit)
          : side === 'CT' && this.rng() < (this.isPistol ? 0.22 : 0.58),
        hasBomb: false,
        weapon: weapon.name,
        ammo: loadout?.ammo ?? weapon.magazineSize,
        reserveAmmo: loadout?.reserveAmmo ?? initialReserveAmmo(weapon),
        weaponEntityId: loadout?.weaponEntityId || null,
        money: loadout?.money ?? null,
        equipmentValue: loadout?.equipmentValue ?? null,
        buyType: loadout?.buyType || (this.isPistol ? 'pistol' : 'full'),
        rolePreference: loadout?.rolePreference || 'support',
        utility: [...(loadout?.utility || [])],
        savedFromPreviousRound: Boolean(loadout?.savedFromPreviousRound),
        routeLaneIndex: laneIndex,
        char
      };
      this.players.push(player);
      this.playerByChar.set(char, player);
      this.motionPlans.set(player.id, points);
    });
  }

  player(char) {
    return this.playerByChar.get(char) || null;
  }

  assignBombCarrier() {
    const target = this.plantTarget();
    const routeCandidates = this.players.filter(player => {
      if (player.teamId !== this.attackerTeamId) return false;
      const route = this.motionPlans.get(player.id) || [];
      return route[route.length - 1]?.areaId === target.id;
    });
    const candidates = routeCandidates.length
      ? routeCandidates
      : this.players.filter(player => player.teamId === this.attackerTeamId);
    const rolePriority = { support: 0, anchor: 1, entry: 2, awp: 4, lurk: 5 };
    const ordered = [...candidates].sort((first, second) => {
      const priorityDelta = (rolePriority[first.roundRole] ?? 3)
        - (rolePriority[second.roundRole] ?? 3);
      if (priorityDelta) return priorityDelta;
      return second.rating - first.rating;
    });
    const preferred = ordered.slice(0, Math.min(2, ordered.length));
    this.bombCarrier = preferred[Math.floor(this.rng() * preferred.length)] || null;
    if (this.bombCarrier) this.bombCarrier.hasBomb = true;
  }

  snapshot() {
    return this.players.map(player => ({
      id: player.id,
      teamId: player.teamId,
      name: player.name,
      emoji: player.emoji,
      alive: player.alive,
      side: player.side,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      areaId: player.position.areaId || null,
      health: player.health,
      armor: player.armor,
      helmet: player.helmet,
      hasDefuseKit: player.hasDefuseKit,
      hasBomb: player.hasBomb,
      weapon: player.weapon,
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo,
      weaponEntityId: player.weaponEntityId || null,
      money: player.money,
      equipmentValue: player.equipmentValue,
      buyType: player.buyType,
      rolePreference: player.rolePreference,
      roundRole: player.roundRole,
      roundTask: player.roundTask,
      utility: [...(player.utility || [])],
      savedFromPreviousRound: player.savedFromPreviousRound,
      behavior: player.behavior,
      behaviorSource: player.behaviorSource,
      routeElapsedMs: player.routeElapsedMs || 0,
      awpSightlineId: player.awpSightlineId || null,
      awpSightlineLabel: player.awpSightlineLabel || null,
      awpWatch: player.awpWatch ? copyPoint(player.awpWatch) : null,
      awpMaxVerticalDelta: player.awpMaxVerticalDelta || null,
      openingAssignmentId: player.openingAssignmentId || null,
      openingLane: player.openingLane || null
    }));
  }

  createOpeningUtility() {
    if (!this.loadouts && this.isPistol) return [];
    const siteKey = ['b', 'midB'].includes(this.plan) ? 'bSite' : 'aSite';
    const plan = [];
    const reservedInventory = new Map();
    const reserve = ({
      type,
      teamId,
      targetKey = null,
      target: explicitTarget = null,
      callout = null,
      earliestTick,
      latestTick,
      purpose,
      fallbackTypes = [],
      tacticalTiming = null,
      reportSetupId = null,
      maxOwnerDistance = null,
      ownerOpeningIds = []
    }) => {
      const acceptedTypes = [type, ...fallbackTypes];
      const owner = this.players
        .filter(player => player.teamId === teamId && player.alive)
        .sort((first, second) => {
          const openingDelta = Number(ownerOpeningIds.includes(second.openingAssignmentId))
            - Number(ownerOpeningIds.includes(first.openingAssignmentId));
          if (openingDelta) return openingDelta;
          const supportDelta = Number(second.roundRole === 'support')
            - Number(first.roundRole === 'support');
          if (supportDelta) return supportDelta;
          return second.rating - first.rating;
        })
        .find(player => acceptedTypes.some(item => {
          const owned = player.utility?.filter(current => current === item).length || 0;
          const reserved = reservedInventory.get(`${player.id}:${item}`) || 0;
          return owned > reserved;
        }));
      if (!owner) return;
      const inventoryType = acceptedTypes.find(item => {
        const owned = owner.utility.filter(current => current === item).length;
        const reserved = reservedInventory.get(`${owner.id}:${item}`) || 0;
        return owned > reserved;
      });
      const reservationKey = `${owner.id}:${inventoryType}`;
      reservedInventory.set(reservationKey, (reservedInventory.get(reservationKey) || 0) + 1);
      const target = explicitTarget || DUST2[targetKey];
      if (!target) return;
      plan.push({
        id: `r${this.round}-${inventoryType}-${plan.length + 1}`,
        type: inventoryType,
        x: target.x,
        y: target.y,
        z: target.z,
        earliestTick,
        latestTick,
        ownerId: owner.id,
        ownerName: owner.name,
        teamId: owner.teamId,
        purpose,
        callout: callout || targetKey,
        tacticalTiming,
        reportSetupId,
        maxOwnerDistance,
        ownerOpeningIds
      });
    };

    const availableReportSetups = utilitySetupsForPlan(this.plan);
    const selectedGroups = new Map();
    const reportedSetups = availableReportSetups.filter(setup => {
      if (!setup.selectionGroup) return true;
      if (!selectedGroups.has(setup.selectionGroup)) {
        const candidates = availableReportSetups
          .filter(candidate => candidate.selectionGroup === setup.selectionGroup);
        const deterministicIndex = (
          this.round
          + this.attackerTeamId
          + setup.selectionGroup.length
        ) % candidates.length;
        selectedGroups.set(
          setup.selectionGroup,
          candidates[deterministicIndex]
        );
      }
      return selectedGroups.get(setup.selectionGroup)?.id === setup.id;
    });
    for (const setup of reportedSetups) {
      reserve({
        type: setup.type,
        teamId: this.attackerTeamId,
        target: setup.target,
        callout: setup.callout,
        earliestTick: setup.earliestTick,
        latestTick: setup.latestTick,
        purpose: setup.purpose,
        fallbackTypes: setup.fallbackTypes || [],
        tacticalTiming: setup.timing,
        reportSetupId: setup.id,
        maxOwnerDistance: setup.maxOwnerDistance
      });
    }
    for (const setup of ctUtilitySetups({ twoLong: this.twoCtLongOpening })) {
      reserve({
        type: setup.type,
        teamId: this.defenderTeamId,
        target: setup.target,
        callout: setup.callout,
        earliestTick: setup.earliestTick,
        latestTick: setup.latestTick,
        purpose: setup.purpose,
        fallbackTypes: setup.fallbackTypes || [],
        tacticalTiming: setup.timing,
        reportSetupId: setup.id,
        maxOwnerDistance: setup.maxOwnerDistance,
        ownerOpeningIds: setup.ownerOpeningIds || []
      });
    }
    reserve({
      type: 'smoke', teamId: this.defenderTeamId, targetKey: siteKey,
      earliestTick: 58, latestTick: 230, purpose: 'retake-cover'
    });
    reserve({
      type: 'flash', teamId: this.defenderTeamId, targetKey: siteKey,
      earliestTick: 48, latestTick: 230, purpose: 'retake-entry'
    });
    return plan;
  }

  baseEvent(type, extra = {}) {
    this.eventIndex += 1;
    return {
      domain: 'shooter',
      branch: 'cs',
      map: 'dust2',
      mapRevision: 'awpy-nav-teamplay-reports-20260731',
      type,
      round: this.round,
      sequence: this.eventIndex,
      attackerTeamId: this.attackerTeamId,
      defenderTeamId: this.defenderTeamId,
      attackPlan: this.plan,
      attackPlanReason: this.attackPlanReason,
      defenderBuyType: this.defenderBuyType,
      timeLeft: Math.max(8, 115 - this.eventIndex * 9),
      ...extra
    };
  }

  roundStart({ score1, score2, economy1, economy2 }) {
    const event = this.baseEvent('round-start', {
      score1,
      score2,
      economy1,
      economy2,
      isPistol: this.isPistol,
      mustContestRound: this.mustContestRound,
      timeLeft: 115,
      roundDurationMs: this.roundDurationMs,
      regulationDurationMs: this.regulationDurationMs,
      players: this.snapshot(),
      motionPlans: [...this.motionPlans].map(([id, points]) => ({ id, points })),
      tickRate: this.world.tickRate,
      seedVersion: 2,
      collisionMesh: 'awpy-tri-17595823',
      behaviorVersion: 1,
      behaviorTimeline: this.world.behaviorTimeline,
      teamTacticsVersion: 1,
      roleAssignments: this.roleAssignments,
      soundModelVersion: 1,
      positionTimelineVersion: 1,
      positionTimelines: this.world.positionTimelines,
      routeTimelineVersion: 1,
      utility: this.utility,
      ctOpeningAssignments: this.ctOpeningAssignments,
      bombCarrierId: this.bombCarrier?.id || null,
      ...(this.includeDebugTelemetry
        ? {
            roleTaskTimeline: this.world.roleTaskTimeline,
            teamTacticsTimeline: this.world.teamTacticsTimeline,
            soundTimeline: this.world.soundTimeline,
            informationTimeline: this.world.informationTimeline,
            routeTimelines: this.world.routeTimelines
          }
        : {})
    });
    this.roundStartEvent = event;
    return event;
  }

  buyPhase(economy) {
    return this.baseEvent('buy-phase', {
      timeLeft: 115,
      economy,
      players: this.snapshot(),
      tick: this.world.tick,
      motionTimeMs: 0
    });
  }

  economySummary(summary) {
    return this.baseEvent('economy-summary', {
      summary,
      players: this.snapshot(),
      tick: this.world.tick,
      motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
      timeLeft: 0
    });
  }

  utilityEvent(worldEvent) {
    const utility = worldEvent.utility || {};
    const actor = worldEvent.actor
      ? this.players.find(player => player.id === worldEvent.actor.id)
      : null;
    let bombDropped = false;
    for (const result of worldEvent.affected || []) {
      if (!result.killed) continue;
      const casualty = this.players.find(player => player.id === result.player?.id);
      if (!casualty?.hasBomb) continue;
      casualty.hasBomb = false;
      this.bombCarrier = null;
      this.plantTargetNode = null;
      this.plantUrgencyCarrierId = null;
      this.bombDropPosition = copyPoint(casualty.position);
      this.world.emitSound({
        type: 'bomb-drop',
        sourcePlayer: casualty,
        position: this.bombDropPosition,
        visual: true,
        label: 'C4 drop'
      });
      bombDropped = true;
    }
    return this.baseEvent('utility', {
      action: worldEvent.action,
      teamId: actor?.teamId || utility.teamId || null,
      actor: actor
        ? { id: actor.id, name: actor.name, teamId: actor.teamId }
        : worldEvent.actor,
      utility,
      from: worldEvent.from ? copyPoint(worldEvent.from) : null,
      position: copyPoint(utility),
      affected: worldEvent.affected || [],
      bombDropped,
      bombPosition: bombDropped ? this.bombDropPosition : null,
      sourceTick: worldEvent.sourceTick,
      tick: worldEvent.tick,
      motionTimeMs: worldEvent.motionTimeMs,
      players: worldEvent.players || this.world.snapshot()
    });
  }

  utilityDecisionEvent(worldEvent) {
    const actor = worldEvent.actor
      ? this.players.find(player => player.id === worldEvent.actor.id)
      : null;
    return this.baseEvent('utility-decision', {
      action: worldEvent.action,
      teamId: actor?.teamId || worldEvent.actor?.teamId || null,
      actor: actor
        ? { id: actor.id, name: actor.name, teamId: actor.teamId }
        : worldEvent.actor,
      utility: worldEvent.utility,
      decision: worldEvent.decision,
      from: worldEvent.from ? copyPoint(worldEvent.from) : null,
      position: worldEvent.utility ? copyPoint(worldEvent.utility) : null,
      sourceTick: worldEvent.sourceTick,
      tick: worldEvent.tick,
      motionTimeMs: worldEvent.motionTimeMs,
      players: worldEvent.players || this.world.snapshot()
    });
  }

  groundInventoryEvent(worldEvent) {
    return this.baseEvent(worldEvent.type, {
      teamId: worldEvent.actor?.teamId || null,
      actor: worldEvent.actor || null,
      actorState: worldEvent.actorState || null,
      items: worldEvent.items || [],
      item: worldEvent.item || null,
      swapped: worldEvent.swapped || null,
      carriedForTeammate: Boolean(worldEvent.carriedForTeammate),
      position: worldEvent.position ? copyPoint(worldEvent.position) : null,
      groundItems: worldEvent.groundItems || this.world.groundInventory.activeItems(),
      tick: worldEvent.tick,
      motionTimeMs: worldEvent.motionTimeMs,
      players: worldEvent.players || this.world.snapshot()
    });
  }

  soundCueEvent(worldEvent) {
    const sound = worldEvent.sound || {};
    const actor = worldEvent.actor
      ? this.players.find(player => player.id === worldEvent.actor.id)
      : null;
    return this.baseEvent('sound-cue', {
      teamId: actor?.teamId || worldEvent.actor?.teamId || null,
      actor: actor
        ? { id: actor.id, name: actor.name, teamId: actor.teamId }
        : worldEvent.actor,
      sound,
      fake: Boolean(sound.fake),
      heardBy: sound.heardBy || [],
      directHearers: sound.directHearers || 0,
      position: sound.position ? copyPoint(sound.position) : null,
      tick: worldEvent.tick,
      motionTimeMs: Math.round(worldEvent.tick * this.world.tickMs),
      players: this.world.snapshot()
    });
  }

  prepareEncounter({
    killerTeamId,
    killerCandidates,
    victimCandidates,
    preferredKiller,
    preferredVictim
  }) {
    return this.world.advanceUntilContact({
      killerTeamId,
      killerCandidates,
      victimCandidates,
      preferredKiller,
      preferredVictim
    });
  }

  plantTarget() {
    const siteKey = this.plan === 'b' || this.plan === 'midB' ? 'B' : 'A';
    const bombsite = graph.bombsites?.[siteKey];
    return this.plantTargetNode
      || NAV_NODES.get(bombsite?.center?.id)
      || (siteKey === 'A' ? DUST2.aSite : DUST2.bSite);
  }

  nearestPlantNode(position) {
    if (!position) return null;
    const siteKey = this.plan === 'b' || this.plan === 'midB' ? 'B' : 'A';
    return (graph.bombsites?.[siteKey]?.plantNodeIds || [])
      .map(id => NAV_NODES.get(id))
      .filter(Boolean)
      .map(node => ({
        node,
        distance: Math.hypot(node.x - position.x, node.y - position.y)
      }))
      .sort((first, second) => first.distance - second.distance)[0] || null;
  }

  adoptNearbyPlantTarget(carrier, radius = 2.2) {
    const nearest = this.nearestPlantNode(carrier?.position);
    if (!nearest || nearest.distance > radius) return false;
    this.plantTargetNode = nearest.node;
    return true;
  }

  selectPlantTargetForCarrier(carrier = this.bombCarrier) {
    if (this.plantTargetNode || !carrier?.alive) return this.plantTarget();
    const siteKey = this.plan === 'b' || this.plan === 'midB' ? 'B' : 'A';
    const candidates = (graph.bombsites?.[siteKey]?.plantNodeIds || [])
      .map(id => NAV_NODES.get(id))
      .filter(Boolean)
      .map(node => ({
        node,
        distance: this.pathDistance(carrier.position, node)
      }))
      .filter(candidate => Number.isFinite(candidate.distance))
      .sort((first, second) => first.distance - second.distance);
    this.plantTargetNode = candidates[0]?.node
      || NAV_NODES.get(graph.bombsites?.[siteKey]?.center?.id)
      || (siteKey === 'A' ? DUST2.aSite : DUST2.bSite);
    return this.plantTargetNode;
  }

  routeEndsAt(player, target) {
    if (!player?.alive || !target?.id) return false;
    const route = this.motionPlans.get(player.id) || [];
    return Number(route[route.length - 1]?.areaId) === Number(target.id);
  }

  rerouteCarrierToPlant(carrier, options = {}) {
    if (!carrier?.alive || !carrier.hasBomb) return null;
    const siteKey = this.plan === 'b' || this.plan === 'midB' ? 'B' : 'A';
    const preferred = this.plantTargetNode;
    const candidates = (graph.bombsites?.[siteKey]?.plantNodeIds || [])
      .map(id => NAV_NODES.get(id))
      .filter(Boolean)
      .map(node => ({ node, distance: this.pathDistance(carrier.position, node) }))
      .filter(candidate => Number.isFinite(candidate.distance))
      .sort((first, second) => {
        if (first.node.id === preferred?.id) return -1;
        if (second.node.id === preferred?.id) return 1;
        return first.distance - second.distance;
      });

    for (const candidate of candidates) {
      if (!this.reroutePlayerToSite(carrier, candidate.node, {
        ...options,
        laneIndex: 0
      })) continue;
      this.plantTargetNode = candidate.node;
      return candidate.node;
    }
    return null;
  }

  alivePlayers(teamId) {
    return this.players.filter(player => player.alive && player.teamId === teamId);
  }

  aliveChars(teamId) {
    return this.alivePlayers(teamId).map(player => player.char);
  }

  selectAssist(killerChar) {
    const killer = this.player(killerChar);
    if (!killer || this.rng() > 0.58) return null;
    const helpers = this.alivePlayers(killer.teamId)
      .filter(player => player !== killer)
      .map(player => ({
        player,
        distance: Math.hypot(
          player.position.x - killer.position.x,
          player.position.y - killer.position.y
        )
      }))
      .filter(candidate => candidate.distance <= 12)
      .sort((first, second) => first.distance - second.distance);
    return helpers[0]?.player.char || null;
  }

  pathDistance(from, target) {
    const route = findPath(from, target);
    if (!route.length) return Infinity;
    return route.slice(1).reduce((sum, node, index) => {
      const previous = route[index];
      return sum + Math.hypot(node.x - previous.x, node.y - previous.y);
    }, 0);
  }

  plantEligibility(planter) {
    const roundProgress = this.world.tick / Math.max(1, this.world.maxTick);
    if (
      Number.isFinite(this.fakePlantCooldownTick)
      && this.world.tick < this.fakePlantCooldownTick
    ) {
      this.lastPlantEvaluation = {
        allowed: false,
        reason: 'fake-plant-window',
        metrics: {
          roundProgress,
          remainingTicks: this.fakePlantCooldownTick - this.world.tick
        }
      };
      return false;
    }
    if (
      planter?.inFireUntilTick > this.world.tick
      && roundProgress < 0.72
    ) {
      this.lastPlantEvaluation = {
        allowed: false,
        reason: 'fire-zone',
        metrics: { inFire: true, roundProgress }
      };
      return false;
    }
    const evaluation = evaluatePlantOpportunity({
      planter,
      attackers: this.alivePlayers(this.attackerTeamId),
      defenders: this.alivePlayers(this.defenderTeamId),
      plantPosition: this.plantTarget(),
      roundProgress,
      timeCritical: roundProgress >= (this.forcePlantTempo ? 0.38 : 0.62),
      mustAttempt: this.forcePlantTempo,
      hasLineOfSight: (defender, target) =>
        this.world.traceForPair(defender, target).visible
    });
    this.lastPlantEvaluation = evaluation;
    return evaluation.allowed;
  }

  shouldFakePlant(planter) {
    if (this.forcePlantTempo) return false;
    if (this.fakePlantUsed || !planter?.alive || !planter.hasBomb) return false;
    const roundProgress = this.world.tick / Math.max(1, this.world.maxTick);
    const remainingTicks = this.world.maxTick - this.world.tick;
    if (roundProgress < 0.42 || roundProgress > 0.8 || remainingTicks < 28) return false;
    if (this.alivePlayers(this.defenderTeamId).length < 1) return false;
    if (this.alivePlayers(this.attackerTeamId).length < 2) return false;
    const nearbySupport = this.alivePlayers(this.attackerTeamId).filter(player =>
      player !== planter
      && Math.hypot(
        player.position.x - planter.position.x,
        player.position.y - planter.position.y
      ) <= 22
    ).length;
    return nearbySupport >= 1 && this.rng() < 0.18;
  }

  startFakePlant(planter) {
    this.fakePlantUsed = true;
    const durationTicks = 6;
    this.fakePlantCooldownTick = this.world.tick + durationTicks;
    this.world.clearObjectivePriority(planter);
    this.world.lockBehavior(
      planter,
      'hold',
      this.fakePlantCooldownTick,
      'fake-plant',
      this.plantTarget()
    );
    const sound = this.world.emitSound({
      type: 'plant',
      sourcePlayer: planter,
      position: this.plantTarget(),
      fake: true,
      visual: false,
      label: 'fake plant'
    });
    return this.baseEvent('sound-cue', {
      teamId: this.attackerTeamId,
      actor: {
        id: planter.id,
        name: planter.name,
        teamId: planter.teamId
      },
      sound,
      fake: true,
      heardBy: sound?.heardBy || [],
      directHearers: sound?.directHearers || 0,
      position: copyPoint(this.plantTarget()),
      tick: this.world.tick,
      motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
      players: this.world.snapshot()
    });
  }

  ensurePlantUrgency() {
    const carrier = this.bombCarrier;
    if (!carrier?.alive || !carrier.hasBomb) {
      this.plantUrgencyCarrierId = null;
      return false;
    }
    const progress = this.world.tick / Math.max(1, this.world.maxTick);
    const urgencyStart = this.forcePlantTempo ? 0.12 : 0.26;
    if (progress < urgencyStart) return false;
    this.plantUrgencyWindowOpened = true;
    if (
      Number.isFinite(this.fakePlantCooldownTick)
      && this.world.tick < this.fakePlantCooldownTick
    ) {
      this.world.clearObjectivePriority(carrier);
      return false;
    }

    let target = this.selectPlantTargetForCarrier(carrier);
    const routeReady = this.routeEndsAt(carrier, target);
    if (this.plantUrgencyCarrierId !== carrier.id || !routeReady) {
      const remainingMs = Math.max(
        700,
        (this.world.maxTick - this.world.tick) * this.world.tickMs - 1200
      );
      target = this.rerouteCarrierToPlant(carrier, {
        durationPerDistance: 56,
        maximumDurationMs: Math.min(3600, remainingMs),
        laneIndex: 0
      });
      if (!target) {
        this.plantUrgencyCarrierId = null;
        this.world.clearObjectivePriority(carrier);
        return false;
      }
      this.plantUrgencyCarrierId = carrier.id;
    }
    this.world.setObjectivePriority(carrier, target, 'plant-urgency');
    return true;
  }

  ensurePlantSupport() {
    const carrier = this.bombCarrier;
    if (!carrier?.alive || !carrier.hasBomb || !this.world) return false;
    if (this.world.tick - this.lastPlanterSupportTick < 10) return false;
    const progress = this.world.tick / Math.max(1, this.world.maxTick);
    const target = this.selectPlantTargetForCarrier(carrier);
    const carrierDistance = this.pathDistance(carrier.position, target);
    if (progress < (this.forcePlantTempo ? 0.14 : 0.2) && carrierDistance > 34) return false;

    const attackers = this.alivePlayers(this.attackerTeamId);
    if (attackers.length < 2) return false;
    const desiredSupport = attackers.length >= 4 ? 2 : 1;
    const nearby = attackers.filter(player =>
      player !== carrier
      && this.pathDistance(player.position, carrier.position) <= 15.5
    );
    if (nearby.length >= desiredSupport) return false;

    const rolePriority = { entry: 0, support: 1, anchor: 2, lurk: 4, awp: 5 };
    const candidates = attackers
      .filter(player => player !== carrier && !nearby.includes(player))
      .filter(player => this.world.visibleEnemies(player).length === 0)
      .sort((first, second) => {
        const roleDelta = (rolePriority[first.roundRole] ?? 3)
          - (rolePriority[second.roundRole] ?? 3);
        if (roleDelta) return roleDelta;
        return this.pathDistance(first.position, carrier.position)
          - this.pathDistance(second.position, carrier.position);
      });
    const needed = Math.max(0, desiredSupport - nearby.length);
    const escorts = candidates.slice(0, needed);
    let routedEscorts = 0;
    for (const escort of escorts) {
      const rerouted = this.reroutePlayerThrough(escort, [carrier.position, target], {
        durationPerDistance: 70,
        maximumDurationMs: 3900,
        laneIndex: escort.routeLaneIndex
      });
      if (!rerouted) continue;
      this.world.setPlayerTask(escort, 'escort-planter', 'regulation', 'plant-support');
      this.world.setBehavior(escort, 'advance', 14, 'plant-support', carrier.position);
      routedEscorts += 1;
    }
    if (routedEscorts) this.lastPlanterSupportTick = this.world.tick;
    return routedEscorts > 0;
  }

  releaseOpeningAwpsForTeamCommit() {
    if (!this.world || this.world.roundPhase.phase !== 'regulation') return false;
    const progress = this.world.tick / Math.max(1, this.world.maxTick);
    const executeCommitted = this.world.executeState.status === 'committed';
    if (!executeCommitted && progress < 0.58) return false;

    const siteTarget = this.plantTarget();
    const released = [];
    for (const player of this.players.filter(candidate =>
      candidate.alive
      && candidate.roundRole === 'awp'
      && !Number.isFinite(candidate.awpCommitReleasedTick)
      && this.world.visibleEnemies(candidate).length === 0
    )) {
      const task = player.teamId === this.attackerTeamId
        ? 'support-site-commit'
        : 'rotate-to-site';
      const rerouted = this.reroutePlayerToSite(player, siteTarget, {
        durationPerDistance: player.teamId === this.attackerTeamId ? 74 : 70,
        maximumDurationMs: 3400
      });
      if (!rerouted) continue;
      player.awpCommitReleasedTick = this.world.tick;
      this.world.setPlayerTask(player, task, 'regulation', 'awp-team-commit');
      this.world.setBehavior(player, 'advance', 36, 'awp-team-commit', siteTarget);
      released.push({
        id: player.id,
        teamId: player.teamId,
        task,
        tick: this.world.tick,
        executeCommitted,
        progress: Number(progress.toFixed(3))
      });
    }
    if (released.length) this.awpCommitReleaseTimeline.push(...released);
    return released.length > 0;
  }

  recoverBomb() {
    if (this.bombCarrier?.alive && this.bombCarrier.hasBomb) return null;
    if (!this.bombDropPosition) return null;
    const candidate = this.alivePlayers(this.attackerTeamId)
      .map(player => ({
        player,
        distance: Math.hypot(
          player.position.x - this.bombDropPosition.x,
          player.position.y - this.bombDropPosition.y
        )
      }))
      .sort((first, second) => first.distance - second.distance)[0];
    if (!candidate || candidate.distance > 10.5) return null;
    candidate.player.hasBomb = true;
    this.bombCarrier = candidate.player;
    this.plantTargetNode = null;
    this.plantUrgencyCarrierId = null;
    const pickupPosition = copyPoint(this.bombDropPosition);
    this.bombDropPosition = null;
    const soundIntel = this.world.emitSound({
      type: 'bomb-pickup',
      sourcePlayer: candidate.player,
      position: pickupPosition,
      visual: false,
      label: 'C4 pickup'
    });
    return this.baseEvent('bomb-pickup', {
      teamId: this.attackerTeamId,
      actor: {
        id: candidate.player.id,
        name: candidate.player.name,
        teamId: candidate.player.teamId
      },
      pickupDistance: Number(candidate.distance.toFixed(2)),
      soundIntel,
      tick: this.world.tick,
      motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
      players: this.world.snapshot()
    });
  }

  knownDefendersAtTarget() {
    const targetPoint = this.plantTarget();
    const knownIds = new Set();
    for (const attacker of this.alivePlayers(this.attackerTeamId)) {
      for (const defender of this.alivePlayers(this.defenderTeamId)) {
        const memory = this.world.memory.get(this.world.pairKey(attacker, defender));
        if (
          memory?.confidence >= 0.55
          && Math.hypot(memory.x - targetPoint.x, memory.y - targetPoint.y) <= 14
        ) {
          knownIds.add(defender.id);
        }
      }
    }
    return knownIds.size;
  }

  maybeMidRoundCall() {
    if (this.midRoundCall) return null;
    const pair = this.world.entryTradePair();
    const decision = evaluateMidRoundCall({
      tick: this.world.tick,
      maxTick: this.world.maxTick,
      currentPlan: this.plan,
      aliveAttackers: this.alivePlayers(this.attackerTeamId).length,
      entryAlive: Boolean(pair.entry?.alive),
      bombDropped: Boolean(this.bombDropPosition && !this.bombCarrier),
      entryTradeDistance: pair.distance ?? Infinity,
      knownDefendersAtTarget: this.knownDefendersAtTarget(),
      alreadyCalled: false,
      rng: this.rng
    });
    if (!decision.call) {
      if (this.alivePlayers(this.attackerTeamId).length < 2) {
        this.midRoundCall = {
          ...decision,
          skipped: true,
          atTick: this.world.tick
        };
        return null;
      }
      decision.call = 'recommit';
      decision.reason = 'default-timing';
      decision.targetPlan = this.plan;
    }

    const fromPlan = this.plan;
    if (decision.call === 'rotate' && decision.targetPlan !== this.plan) {
      this.plan = decision.targetPlan;
      this.plantTargetNode = null;
      this.plantUrgencyCarrierId = null;
    }
    const target = this.plantTarget();
    const assignments = [];
    for (const player of this.alivePlayers(this.attackerTeamId)) {
      let targetPoint = target;
      let task = decision.call === 'regroup' ? 'regroup-team' : 'recommit-site';
      const isBombCarrier = player === this.bombCarrier && player.hasBomb;
      if (isBombCarrier) {
        targetPoint = this.selectPlantTargetForCarrier(player);
        task = 'commit-bombsite';
        const rerouted = this.reroutePlayerToSite(player, targetPoint, {
          durationPerDistance: 54,
          maximumDurationMs: 3400,
          laneIndex: 0
        });
        if (!rerouted) this.plantUrgencyCarrierId = null;
      } else if (decision.call === 'regroup') {
        targetPoint = this.bombDropPosition
          || pair.entry?.position
          || this.bombCarrier?.position
          || target;
        if (player === pair.entry) {
          task = 'hold-rally';
        } else if (player.roundRole === 'lurk') {
          task = 'hold-rotation-cut';
          targetPoint = player.position;
        } else {
          task = 'close-rally-gap';
          this.reroutePlayerToSite(player, targetPoint, {
            durationPerDistance: player.roundRole === 'support' ? 58 : 72,
            maximumDurationMs: 2600,
            laneIndex: player.routeLaneIndex
          });
        }
      } else if (decision.call === 'rotate') {
        task = player.roundRole === 'lurk' ? 'cut-new-rotation' : 'rotate-site';
        targetPoint = player.roundRole === 'lurk'
          ? (this.plan === 'b' ? DUST2.ctMid : DUST2.topMid)
          : target;
        this.reroutePlayerToSite(player, targetPoint, {
          durationPerDistance: player.roundRole === 'lurk' ? 88 : 68,
          maximumDurationMs: 4200,
          laneIndex: player.routeLaneIndex
        });
      } else if (decision.call === 'recommit') {
        this.reroutePlayerToSite(player, targetPoint, {
          durationPerDistance: player.roundRole === 'entry' ? 60 : 72,
          maximumDurationMs: 3200,
          laneIndex: player.routeLaneIndex
        });
      }
      this.world.setPlayerTask(player, task, 'regulation', 'mid-round-call');
      if (player.behaviorLockUntilTick <= this.world.tick) {
        this.world.setBehavior(
          player,
          player.roundRole === 'lurk'
            ? 'walk'
            : decision.call === 'regroup' && player === pair.entry
              ? 'hold'
              : 'advance',
          24,
          `mid-round-${decision.call}`,
          targetPoint
        );
      }
      assignments.push({
        id: player.id,
        name: player.name,
        role: player.roundRole,
        task,
        roundRole: player.roundRole,
        roundTask: task,
        alive: player.alive,
        target: copyPoint(targetPoint)
      });
    }
    if (this.bombCarrier?.alive && this.bombCarrier.hasBomb) {
      const carrierTarget = this.selectPlantTargetForCarrier(this.bombCarrier);
      if (this.routeEndsAt(this.bombCarrier, carrierTarget)) {
        this.world.setObjectivePriority(
          this.bombCarrier,
          carrierTarget,
          `mid-round-${decision.call}`
        );
      } else {
        this.plantUrgencyCarrierId = null;
        this.world.clearObjectivePriority(this.bombCarrier);
      }
    }
    this.midRoundCall = {
      ...decision,
      fromPlan,
      atTick: this.world.tick,
      assignments
    };
    return this.baseEvent('mid-round-call', {
      teamId: this.attackerTeamId,
      call: decision.call,
      reason: decision.reason,
      fromPlan,
      targetPlan: decision.targetPlan,
      metrics: decision.metrics,
      assignments,
      tick: this.world.tick,
      motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
      players: this.world.snapshot()
    });
  }

  escapeCandidates() {
    const siteKey = this.plantedSite || (this.plan === 'b' || this.plan === 'midB' ? 'B' : 'A');
    return siteKey === 'A'
      ? [
          DUST2.longDoors,
          DUST2.topMid,
          DUST2.ctMid,
          DUST2.ctSpawn,
          DUST2.upperTunnels,
          DUST2.tSpawn,
          DUST2.bSite
        ]
      : [
          DUST2.upperTunnels,
          DUST2.topMid,
          DUST2.tSpawn,
          DUST2.short,
          DUST2.ctMid,
          DUST2.ctSpawn,
          DUST2.longDoors,
          DUST2.aSite
        ];
  }

  bombDamageAt(player, position = player.position) {
    const wavePath = findPath(this.plantPosition, position);
    return calculateBombDamage({
      bombPosition: this.plantPosition,
      playerPosition: position,
      playerHealth: player.health,
      playerArmor: player.armor,
      path: wavePath
    });
  }

  chooseEscapeNode(player, bombTimeLeftSeconds = 7) {
    const maximumTravelMs = bombTimeLeftSeconds * 1000;
    return this.escapeCandidates()
      .map(target => {
        const route = findPath(player.position, target);
        if (!route.length) return null;
        const routeDistance = route.slice(1).reduce((sum, node, index) => {
          const previous = route[index];
          return sum + Math.hypot(node.x - previous.x, node.y - previous.y);
        }, 0);
        const travelMs = Math.round(routeDistance * 92);
        const prediction = this.bombDamageAt(player, target);
        const reachable = travelMs <= maximumTravelMs;
        const score = (reachable ? 0 : 100000)
          + (prediction.lethal ? 50000 : 0)
          + prediction.healthDamage * 220
          + travelMs * 0.7;
        return { target, route, travelMs, prediction, reachable, score };
      })
      .filter(Boolean)
      .sort((first, second) => first.score - second.score)[0] || null;
  }

  routePlayersToSafety(players, bombTimeLeftSeconds = 7) {
    const plans = [];
    const worldWindowMs = bombWorldMsForSeconds(bombTimeLeftSeconds);
    for (const player of players) {
      const currentRisk = this.bombDamageAt(player);
      if (!currentRisk.healthDamage) {
        this.world.setPlayerTask(
          player,
          player.roundRole === 'awp' ? 'save-awp' : 'hold-safe-exit',
          'postplant',
          'save-discipline'
        );
        plans.push({
          player,
          stayed: true,
          currentRisk,
          prediction: currentRisk,
          travelMs: 0
        });
        continue;
      }
      const choice = this.chooseEscapeNode(player, bombTimeLeftSeconds);
      if (!choice) continue;
      this.reroutePlayerToSite(player, choice.target, {
        durationPerDistance: 60,
        maximumDurationMs: worldWindowMs
      });
      this.world.setBehavior(
        player,
        'advance',
        Math.ceil(worldWindowMs / this.world.tickMs) + 12,
        'bomb-escape',
        choice.target
      );
      this.world.setPlayerTask(
        player,
        player.roundRole === 'awp' ? 'save-awp' : 'save-exit',
        'postplant',
        'save-discipline'
      );
      plans.push({
        player,
        stayed: false,
        currentRisk,
        prediction: choice.prediction,
        travelMs: choice.travelMs,
        reachable: choice.reachable,
        target: copyPoint(choice.target)
      });
    }
    return plans;
  }

  postPlantSiteKey() {
    return this.plantedSite || (this.plan === 'b' || this.plan === 'midB' ? 'B' : 'A');
  }

  repositionAwperAfterShot(player) {
    if (
      !player?.alive
      || player.roundRole !== 'awp'
      || player.weapon !== 'AWP'
      || this.world.roundPhase.phase !== 'regulation'
      || this.world.executeState.status === 'committed'
      || Number.isFinite(player.awpCommitReleasedTick)
      || this.world.tick - (player.lastAwpRepositionTick ?? -Infinity) < 18
    ) {
      return false;
    }
    const isAttacker = player.teamId === this.attackerTeamId;
    const targetKey = player.awpFallbackKey || (isAttacker
      ? {
          long: 'longDoors',
          short: 'topMid',
          b: 'upperTunnels',
          midB: 'topMid'
        }[this.plan]
      : ['long', 'short'].includes(this.plan)
        ? 'ctSpawn'
        : 'ctMid');
    const target = DUST2[targetKey] || DUST2.ctSpawn;
    this.reroutePlayerToSite(player, target, {
      durationPerDistance: 86,
      maximumDurationMs: 2600
    });
    player.lastAwpRepositionTick = this.world.tick;
    this.world.setPlayerTask(
      player,
      'reposition-after-shot',
      this.world.roundPhase.phase,
      'awp-discipline'
    );
    this.world.setBehavior(player, 'advance', 54, 'awp-reposition', target);
    return true;
  }

  coordinatePostPlantAttackers() {
    if (!this.plantPosition || !this.world) return false;
    if (this.world.tick - this.lastPostPlantRecallTick < 8) return false;
    const defenders = this.alivePlayers(this.defenderTeamId);
    const attackers = this.alivePlayers(this.attackerTeamId);
    if (defenders.length !== 1 || attackers.length < 2) return false;

    const lastDefender = defenders[0];
    const sharedIntel = attackers
      .map(reporter => ({
        reporter,
        memory: this.world.memory.get(this.world.pairKey(reporter, lastDefender))
      }))
      .filter(item => item.memory?.confidence >= 0.5)
      .sort((first, second) => second.memory.confidence - first.memory.confidence)[0];
    if (!sharedIntel) return false;

    this.world.scheduleTeamCall(sharedIntel.reporter, lastDefender, sharedIntel.memory);
    const intelNearSite = this.pathDistance(sharedIntel.memory, this.plantPosition) <= 24;
    if (!intelNearSite) return false;

    const ordered = attackers.sort((first, second) =>
      this.pathDistance(first.position, this.plantPosition)
      - this.pathDistance(second.position, this.plantPosition)
    );
    const siteGuard = ordered[0];
    const recalled = [];
    for (const player of ordered.slice(1)) {
      const siteDistance = this.pathDistance(player.position, this.plantPosition);
      const remoteLurk = player.roundRole === 'lurk' && siteDistance > 17;
      if (
        (!remoteLurk && siteDistance <= 25)
        || this.world.visibleEnemies(player).length > 0
        || player.behaviorLockUntilTick > this.world.tick
      ) {
        continue;
      }
      this.reroutePlayerToSite(player, this.plantPosition, {
        durationPerDistance: 67,
        maximumDurationMs: 3600
      });
      this.world.setPlayerTask(
        player,
        'postplant-recall-last-ct',
        'postplant',
        'shared-last-ct-info'
      );
      this.world.setBehavior(player, 'advance', 20, 'postplant-recall', this.plantPosition);
      recalled.push(player.id);
    }
    if (!recalled.length) return false;
    this.lastPostPlantRecallTick = this.world.tick;
    this.postPlantCoordinationTimeline.push({
      tick: this.world.tick,
      reporterId: sharedIntel.reporter.id,
      defenderId: lastDefender.id,
      confidence: Number(sharedIntel.memory.confidence.toFixed(3)),
      siteGuardId: siteGuard?.id || null,
      recalledIds: recalled
    });
    return true;
  }

  assignPostPlantSetup() {
    const siteKey = this.postPlantSiteKey();
    const available = postPlantPositionsFor(siteKey);
    const postPlantPriority = { anchor: 0, support: 1, entry: 2, awp: 3, lurk: 4 };
    const attackers = this.alivePlayers(this.attackerTeamId)
      .sort((first, second) => {
        const roleDelta = (postPlantPriority[first.roundRole] ?? 9)
          - (postPlantPriority[second.roundRole] ?? 9);
        if (roleDelta) return roleDelta;
        return this.pathDistance(first.position, this.plantPosition)
          - this.pathDistance(second.position, this.plantPosition);
      });
    const assignments = [];

    for (const player of attackers) {
      if (!available.length) break;
      const isScoped = ['AWP', 'SSG 08'].includes(player.weapon);
      const preferredRoles = {
        anchor: ['site-anchor'],
        lurk: ['crossfire', 'support', 'site-anchor'],
        support: ['support', 'crossfire'],
        awp: ['awp-', 'long-crossfire', 'tunnel-support', 'support', 'crossfire'],
        entry: ['crossfire', 'site-anchor']
      }[player.roundRole] || [];
      const eligible = available
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate }) => !candidate.awpOnly || isScoped);
      let selectedIndex = eligible.find(({ candidate }) =>
        preferredRoles.some(preferred => candidate.role.includes(preferred))
      )?.index ?? -1;
      if (selectedIndex < 0) {
        const scored = eligible.map(({ candidate, index }) => ({
          index,
          distance: this.pathDistance(
            player.position,
            NAV_NODES.get(candidate.anchorAreaId) || this.plantPosition
          )
        }));
        scored.sort((first, second) => first.distance - second.distance);
        selectedIndex = scored[0]?.index || 0;
      }

      const setup = available.splice(selectedIndex, 1)[0];
      const anchor = NAV_NODES.get(setup.anchorAreaId) || this.plantPosition;
      const watch = NAV_NODES.get(setup.watchAreaId) || this.plantPosition;
      const routeDistance = this.pathDistance(player.position, anchor);
      this.reroutePlayerToSite(player, anchor, {
        durationPerDistance: setup.awpOnly ? 84 : 74,
        maximumDurationMs: 4200
      });
      const source = setup.role === 'site-anchor'
          ? 'postplant-anchor'
          : 'postplant-crossfire';
      this.world.setBehavior(player, 'advance', 180, source, watch);
      this.world.setPlayerTask(
        player,
        `postplant-${setup.role}`,
        'postplant',
        'role-postplant'
      );
      assignments.push({
        player,
        roundRole: player.roundRole,
        roundTask: player.roundTask,
        role: setup.role,
        positionId: setup.id,
        anchorAreaId: setup.anchorAreaId,
        watchAreaId: setup.watchAreaId,
        lane: setup.lane,
        pairId: setup.pairId,
        source,
        anchor: copyPoint(anchor),
        watch: copyPoint(watch),
        routeDistance: Number(routeDistance.toFixed(2))
      });
    }

    this.postPlantSetup = assignments;
    return assignments;
  }

  planCoordinatedRetake() {
    const siteKey = this.postPlantSiteKey();
    const defenders = this.alivePlayers(this.defenderTeamId);
    const lanes = RETAKE_LANES[siteKey] || [];
    const preferredDefuser = this.postPlantDecision?.actor;
    const retakePriority = { entry: 0, support: 1, awp: 2, lurk: 3, anchor: 4 };
    const ordered = [...defenders].sort((first, second) => {
      if (first === preferredDefuser) return -1;
      if (second === preferredDefuser) return 1;
      const roleDelta = (retakePriority[first.roundRole] ?? 9)
        - (retakePriority[second.roundRole] ?? 9);
      if (roleDelta) return roleDelta;
      return this.pathDistance(first.position, this.plantPosition)
        - this.pathDistance(second.position, this.plantPosition);
    });
    const fakeDefusePlanned = this.postPlantDecision?.decision === 'retake'
      && ordered.length >= 2
      && this.alivePlayers(this.attackerTeamId).length >= 1
      && (
        Boolean(preferredDefuser?.hasDefuseKit)
        || this.rng() < 0.42
      )
      && this.rng() < 0.56;
    const assignments = [];

    ordered.forEach((player, index) => {
      const lane = lanes[index % Math.max(1, lanes.length)] || {
        lane: 'direct',
        ingress: siteKey === 'A' ? 'aRamp' : 'bDoors'
      };
      let role = player === preferredDefuser
        ? 'defuser'
        : {
            entry: 'entry',
            support: 'trade',
            awp: 'cover',
            lurk: 'flank',
            anchor: 'cover'
          }[player.roundRole] || (index === 0 ? 'defuser' : 'cover');
      const assignedRoles = new Set(assignments.map(item => item.role));
      if (index > 0 && ordered.length >= 4 && !assignedRoles.has('entry')) role = 'entry';
      else if (index > 1 && ordered.length >= 4 && !assignedRoles.has('trade')) role = 'trade';
      if (fakeDefusePlanned && player === preferredDefuser) role = 'fake-defuser';
      const ingress = DUST2[lane.ingress] || this.plantPosition;
      const routeTargets = lane.lane === 'ct'
        ? [ingress, siteKey === 'A' ? DUST2.aRamp : DUST2.bDoors, this.plantPosition]
        : [ingress, this.plantPosition];
      const durationPerDistance = role === 'entry'
        ? 72
        : role === 'trade'
          ? 78
          : role === 'flank'
            ? 92
            : 82;
      this.reroutePlayerThrough(player, routeTargets, {
        durationPerDistance,
        maximumDurationMs: 5200
      });
      const source = role === 'entry'
        ? 'retake-entry'
        : role === 'trade'
          ? 'retake-trade'
          : role === 'fake-defuser'
            ? 'fake-defuse'
            : role === 'flank'
              ? 'retake-flank'
              : 'retake-cover';
      this.world.setBehavior(
        player,
        role === 'trade' || role === 'cover' ? 'walk' : 'advance',
        180,
        source,
        this.plantPosition
      );
      this.world.setPlayerTask(
        player,
        `retake-${role}`,
        'postplant',
        'role-retake'
      );
      assignments.push({
        player,
        roundRole: player.roundRole,
        roundTask: player.roundTask,
        role,
        lane: lane.lane,
        source,
        ingress: copyPoint(ingress),
        target: copyPoint(this.plantPosition),
        hasDefuseKit: Boolean(player.hasDefuseKit),
        followsId: index > 0 && lanes[index - 1]?.lane === lane.lane
          ? ordered[index - 1].id
          : null
      });
    });

    this.retakePlan = assignments;
    this.postPlantDecision.metrics.fakeDefusePlanned = fakeDefusePlanned;
    this.postPlantDecision.metrics.retakeLanes = [...new Set(assignments.map(item => item.lane))];
    this.postPlantDecision.metrics.tradePlayers = assignments
      .filter(item => item.role === 'trade' || item.followsId)
      .length;
    return assignments;
  }

  startPostPlantPhase() {
    const target = this.plantTarget();
    const smokeCover = this.world.activeSmokes().some(smoke =>
      Math.hypot(smoke.x - target.x, smoke.y - target.y) <= 8
    );
    this.postPlantDecision = choosePostPlantDecision({
      attackers: this.alivePlayers(this.attackerTeamId),
      defenders: this.alivePlayers(this.defenderTeamId),
      plantPosition: target,
      bombWindowMs: BOMB_WORLD_WINDOW_MS,
      pathDistance: (from, to) => this.pathDistance(from, to),
      smokeCover,
      mustContest: this.mustContestRound,
      rng: this.rng
    });
    this.world.setRoundPhase('postplant', {
      plantPosition: copyPoint(target),
      postPlantDecision: this.postPlantDecision.decision,
      bombWindowMs: BOMB_WORLD_WINDOW_MS
    });
    this.applyPhaseTasks('postplant', this.postPlantDecision.decision);

    this.world.extendRound(BOMB_WORLD_WINDOW_MS);
    this.bombPlantTick = this.world.tick;
    this.bombDeadlineTick = this.world.maxTick;
    this.escapeStartTick = this.mustContestRound
      ? this.bombDeadlineTick
      : Math.max(
          this.world.tick,
          this.bombDeadlineTick
            - Math.ceil(bombWorldMsForSeconds(BOMB_ESCAPE_SECONDS) / this.world.tickMs)
        );
    this.roundDurationMs = this.world.durationMs;
    const actor = this.postPlantDecision.actor;
    const attackerSetup = this.assignPostPlantSetup();
    if (this.postPlantDecision.decision === 'retake') {
      this.planCoordinatedRetake();
    } else if (this.postPlantDecision.decision === 'ninja') {
      for (const defender of this.alivePlayers(this.defenderTeamId)) {
        if (defender === actor) {
          this.reroutePlayerToSite(defender, target);
          this.world.setBehavior(defender, 'advance', 140, 'ninja-defuse', target);
          this.world.setPlayerTask(defender, 'ninja-defuser', 'postplant', 'role-ninja');
        } else {
          this.routePlayersToSafety([defender]);
        }
      }
    } else {
      this.routePlayersToSafety(this.alivePlayers(this.defenderTeamId));
    }
    if (this.roundStartEvent) {
      this.roundStartEvent.roundDurationMs = this.roundDurationMs;
    }

    return this.baseEvent('tactical-decision', {
      teamId: this.defenderTeamId,
      decision: this.postPlantDecision.decision,
      decisionReason: this.postPlantDecision.reason,
      actor: actor ? { id: actor.id, name: actor.name, teamId: actor.teamId } : null,
      metrics: this.postPlantDecision.metrics,
      attackerSetup: attackerSetup.map(assignment => ({
        id: assignment.player.id,
        name: assignment.player.name,
        teamId: assignment.player.teamId,
        roundRole: assignment.roundRole,
        roundTask: assignment.roundTask,
        role: assignment.role,
        positionId: assignment.positionId,
        anchorAreaId: assignment.anchorAreaId,
        watchAreaId: assignment.watchAreaId,
        lane: assignment.lane,
        pairId: assignment.pairId,
        source: assignment.source,
        anchor: assignment.anchor,
        watch: assignment.watch,
        routeDistance: assignment.routeDistance
      })),
      postPlantCoordinationTimeline: this.postPlantCoordinationTimeline,
      retakePlan: this.retakePlan.map(assignment => ({
        id: assignment.player.id,
        name: assignment.player.name,
        teamId: assignment.player.teamId,
        roundRole: assignment.roundRole,
        roundTask: assignment.roundTask,
        role: assignment.role,
        lane: assignment.lane,
        source: assignment.source,
        ingress: assignment.ingress,
        target: assignment.target,
        hasDefuseKit: assignment.hasDefuseKit,
        followsId: assignment.followsId
      })),
      site: this.plantedSite,
      position: copyPoint(this.plantPosition),
      tick: this.world.tick,
      motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
      players: this.world.snapshot()
    });
  }

  runBombEscapeCombat(endTick) {
    const combatEvents = [];
    let nextContactTick = this.world.tick;
    while (this.world.tick < endTick) {
      this.world.advanceOneTick();
      if (this.world.tick < nextContactTick) continue;
      const contact = this.world.findAnyContact(
        this.aliveChars(1),
        this.aliveChars(2)
      );
      if (!contact) continue;
      const primary = {
        killer: contact.killer,
        victim: contact.victim,
        perception: contact.perception
      };
      combatEvents.push(...this.resolveFirefight(primary, { advanceWorld: false }));
      nextContactTick = this.world.tick + 4;
    }
    return combatEvents;
  }

  prepareBombEscape() {
    const bombTimeLeft = BOMB_ESCAPE_SECONDS;
    if (
      Number.isFinite(this.escapeStartTick)
      && this.world.tick < this.escapeStartTick
    ) {
      this.world.advanceTicks(this.escapeStartTick - this.world.tick);
    }
    const alive = this.players.filter(player => player.alive);
    const escapePlans = this.routePlayersToSafety(alive, bombTimeLeft);
    const escapeStartTick = this.world.tick;
    const escapeStartMs = Math.round(this.world.tick * this.world.tickMs);
    const playersAtEscapeStart = this.world.snapshot();
    const visual = this.baseEvent('bomb-escape', {
      teamId: this.attackerTeamId,
      decision: this.postPlantDecision?.decision || 'retake',
      actors: escapePlans.map(plan => ({
        id: plan.player.id,
        name: plan.player.name,
        teamId: plan.player.teamId,
        stayed: plan.stayed,
        health: plan.player.health,
        currentDamage: plan.currentRisk.healthDamage,
        predictedDamage: plan.prediction.healthDamage,
        lethalBeforeEscape: plan.currentRisk.lethal,
        lethalAfterEscape: plan.prediction.lethal,
        reachable: plan.reachable !== false,
        travelMs: plan.travelMs,
        target: plan.target || null
      })),
      site: this.plantedSite,
      position: copyPoint(this.plantPosition),
      tick: escapeStartTick,
      motionTimeMs: escapeStartMs,
      bombTimeLeft,
      bombDeadlineMotionMs: Math.round(
        (this.bombDeadlineTick ?? this.world.maxTick) * this.world.tickMs
      ),
      players: playersAtEscapeStart
    });
    const combatEvents = Number.isFinite(this.bombDeadlineTick)
      ? this.runBombEscapeCombat(this.bombDeadlineTick)
      : [];
    return { visual, combatEvents };
  }

  applyBombExplosion() {
    const affected = [];
    for (const player of this.players.filter(candidate => candidate.alive)) {
      const prediction = this.bombDamageAt(player);
      const healthBefore = player.health;
      const armorBefore = player.armor;
      player.health = Math.max(0, player.health - prediction.healthDamage);
      player.armor = Math.max(0, player.armor - prediction.armorDamage);
      const killed = player.health <= 0;
      if (killed) this.world.markDead(player);
      affected.push({
        player: {
          id: player.id,
          name: player.name,
          teamId: player.teamId
        },
        healthBefore,
        healthAfter: player.health,
        armorBefore,
        armorAfter: player.armor,
        damage: prediction.healthDamage,
        armorDamage: prediction.armorDamage,
        killed,
        lethal: prediction.lethal,
        distanceWorld: prediction.distanceWorld,
        arrivalMs: prediction.arrivalMs,
        propagationModel: prediction.propagationModel,
        position: copyPoint(player.position)
      });
    }
    return affected;
  }

  defuseEligibility(defuser) {
    if (
      !defuser?.alive
      || defuser.teamId !== this.defenderTeamId
      || this.postPlantDecision?.decision === 'save'
    ) {
      return false;
    }
    const requiredSeconds = defuser.hasDefuseKit ? 5 : 10;
    const remainingWorldMs = Math.max(
      0,
      ((this.bombDeadlineTick ?? this.world.maxTick) - this.world.tick) * this.world.tickMs
    );
    if (bombWorldMsForSeconds(requiredSeconds) > remainingWorldMs) return false;
    const activeSiteThreats = this.activeDefuseThreats(defuser);
    return activeSiteThreats.length === 0;
  }

  activeDefuseThreats(defuser = this.defuseAttempt?.actor) {
    if (!defuser?.alive || !this.plantPosition) return [];
    return this.alivePlayers(this.attackerTeamId).filter(attacker => {
      const weapon = getWeapon(attacker.weapon);
      const maximumDistance = weapon?.category === 'sniper' ? 52 : 34;
      const threatDistance = Math.hypot(
        attacker.position.x - defuser.position.x,
        attacker.position.y - defuser.position.y
      );
      if (threatDistance > maximumDistance) return false;
      return this.world.traceForPair(attacker, defuser).visible;
    });
  }

  startDefuseAttempt(defuser) {
    if (this.defuseAttempt || !this.defuseEligibility(defuser)) return null;
    if (
      !this.plantPosition
      || Math.hypot(
        defuser.position.x - this.plantPosition.x,
        defuser.position.y - this.plantPosition.y
      ) > 2.15
    ) {
      return null;
    }
    let plannedFake = !this.fakeDefuseUsed
      && this.postPlantDecision?.metrics?.fakeDefusePlanned
      && this.retakePlan.some(assignment =>
        assignment.player === defuser && assignment.role === 'fake-defuser'
      );
    const defuseSeconds = defuser.hasDefuseKit ? 5 : 10;
    const realDurationMs = bombWorldMsForSeconds(defuseSeconds);
    const fakeDurationMs = bombWorldMsForSeconds(1.2);
    const remainingWorldMs = Math.max(
      0,
      (this.bombDeadlineTick - this.world.tick) * this.world.tickMs
    );
    if (plannedFake && fakeDurationMs + realDurationMs > remainingWorldMs) {
      plannedFake = false;
    }
    const durationMs = plannedFake
      ? fakeDurationMs
      : realDurationMs;
    if (durationMs > remainingWorldMs) return null;
    const durationTicks = Math.max(2, Math.ceil(durationMs / this.world.tickMs));
    const attackers = this.alivePlayers(this.attackerTeamId);
    const reactingAttackers = [];
    const soundIntel = this.world.emitSound({
      type: 'defuse',
      sourcePlayer: defuser,
      position: this.plantPosition,
      fake: plannedFake,
      visual: false,
      label: plannedFake ? 'fake defuse' : 'defuse'
    });
    const directHearerIds = new Set(
      (soundIntel?.heardBy || []).map(listener => listener.id)
    );
    const sharedDefuseCall = directHearerIds.size > 0;

    for (const attacker of attackers) {
      if (!directHearerIds.has(attacker.id) && !sharedDefuseCall) continue;
      const visibleEnemies = this.world.visibleEnemies(attacker);
      if (!visibleEnemies.length) {
        this.reroutePlayerToSite(attacker, this.plantPosition, {
          durationPerDistance: 58,
          maximumDurationMs: Math.max(
            900,
            (this.world.maxTick - this.world.tick) * this.world.tickMs
          ),
          laneIndex: attacker.routeLaneIndex
        });
      }
      this.world.setPlayerTask(
        attacker,
        'stop-active-defuse',
        'postplant',
        directHearerIds.has(attacker.id) ? 'direct-defuse-audio' : 'shared-defuse-call'
      );
      this.world.setBehavior(
        attacker,
        visibleEnemies.length ? 'engage' : 'advance',
        durationTicks + 50,
        directHearerIds.has(attacker.id) ? 'defuse-reaction' : 'defuse-team-call',
        visibleEnemies[0] || this.plantPosition
      );
      reactingAttackers.push(attacker.id);
    }

    for (const cover of this.alivePlayers(this.defenderTeamId).filter(player => player !== defuser)) {
      this.world.setBehavior(
        cover,
        'hold',
        durationTicks + 12,
        'defuse-cover',
        this.plantPosition
      );
    }

    this.defuseAttempt = {
      actor: defuser,
      fake: plannedFake,
      startTick: this.world.tick,
      endTick: this.world.tick + durationTicks,
      durationMs,
      reactingAttackers,
      startedUncontested: true
    };
    this.world.lockBehavior(
      defuser,
      'hold',
      this.defuseAttempt.endTick,
      'defuse-active',
      this.plantPosition
    );

    return this.baseEvent('defuse-attempt', {
      teamId: this.defenderTeamId,
      actor: {
        id: defuser.id,
        name: defuser.name,
        teamId: defuser.teamId
      },
      fake: plannedFake,
      soundIntel,
      hasDefuseKit: Boolean(defuser.hasDefuseKit),
      defuseSeconds: plannedFake ? 0 : defuseSeconds,
      durationMs,
      remainingBombSeconds: Math.max(
        0,
        Math.ceil(
          BOMB_LOGICAL_SECONDS
            * (this.bombDeadlineTick - this.world.tick)
            / Math.max(1, this.bombDeadlineTick - this.bombPlantTick)
        )
      ),
      siteThreats: 0,
      reactingAttackers,
      site: this.plantedSite,
      position: copyPoint(this.plantPosition),
      tick: this.world.tick,
      motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
      players: this.world.snapshot()
    });
  }

  cancelDefuseAttempt() {
    if (!this.defuseAttempt) return;
    this.world.unlockBehavior(this.defuseAttempt.actor);
    this.defuseAttempt = null;
  }

  resolveDefuseTimer() {
    const attempt = this.defuseAttempt;
    if (!attempt) return null;
    this.world.unlockBehavior(attempt.actor);
    if (attempt.fake) {
      this.fakeDefuseUsed = true;
      if (attempt.actor.alive) {
        this.world.setBehavior(
          attempt.actor,
          'peek',
          this.world.behaviorDuration(5, 9),
          'fake-defuse',
          this.plantPosition
        );
      }
      this.defuseAttempt = null;
      return { fakeEnded: true };
    }

    const activeThreats = this.activeDefuseThreats(attempt.actor);
    if (activeThreats.length) {
      if (attempt.actor.alive) {
        this.world.setBehavior(
          attempt.actor,
          'peek',
          this.world.behaviorDuration(6, 10),
          'defuse-contested',
          activeThreats[0]
        );
      }
      this.defuseAttempt = null;
      return {
        interrupted: true,
        contested: true,
        threatIds: activeThreats.map(player => player.id)
      };
    }

    const actorDistance = attempt.actor.alive
      ? Math.hypot(
          attempt.actor.position.x - this.plantPosition.x,
          attempt.actor.position.y - this.plantPosition.y
        )
      : Infinity;
    this.defuseAttempt = null;
    if (!attempt.actor.alive || actorDistance > 2.2) return { interrupted: true };
    return {
      outcome: {
        winnerTeamId: this.defenderTeamId,
        reason: 'defused',
        actor: attempt.actor.char,
        objectiveControl: {
          nearestDefenderDistance: Number(actorDistance.toFixed(2)),
          contested: false,
          startedUncontested: attempt.startedUncontested,
          reactingAttackers: attempt.reactingAttackers.length,
          decision: this.postPlantDecision?.decision || 'retake',
          ninja: this.postPlantDecision?.decision === 'ninja' && !this.ninjaFailed,
          sitePressure: this.alivePlayers(this.attackerTeamId).filter(attacker =>
            Math.hypot(
              attacker.position.x - this.plantPosition.x,
              attacker.position.y - this.plantPosition.y
            ) <= 14
          ).length,
          attackersAlive: this.alivePlayers(this.attackerTeamId).length,
          defendersAlive: this.alivePlayers(this.defenderTeamId).length,
          attemptStartTick: attempt.startTick,
          defuseDurationMs: attempt.durationMs,
          defuseSeconds: attempt.actor.hasDefuseKit ? 5 : 10
        }
      }
    };
  }

  postPlantWinner() {
    const attackers = this.alivePlayers(this.attackerTeamId);
    const defenders = this.alivePlayers(this.defenderTeamId);
    if (!defenders.length) {
      return { winnerTeamId: this.attackerTeamId, reason: 'elimination' };
    }
    if (this.postPlantDecision?.decision === 'save') {
      return {
        winnerTeamId: this.attackerTeamId,
        reason: 'bomb-exploded',
        objectiveControl: {
          decision: 'save',
          attackersAlive: attackers.length,
          defendersAlive: defenders.length
        }
      };
    }

    const preferredDefuser = this.postPlantDecision?.actor;
    const defuser = defenders
      .map(player => ({
        player,
        distance: Math.hypot(
          player.position.x - this.plantPosition.x,
          player.position.y - this.plantPosition.y
        )
      }))
      .sort((first, second) => {
        if (first.player === preferredDefuser) return -1;
        if (second.player === preferredDefuser) return 1;
        return first.distance - second.distance;
      })[0];
    const contested = attackers.some(attacker => {
      const range = Math.hypot(
        attacker.position.x - defuser.player.position.x,
        attacker.position.y - defuser.player.position.y
      );
      return range <= 20 && this.world.traceForPair(attacker, defuser.player).visible;
    });
    const sitePressure = attackers.filter(attacker =>
      Math.hypot(
        attacker.position.x - this.plantPosition.x,
        attacker.position.y - this.plantPosition.y
      ) <= 14
    ).length;
    return {
      winnerTeamId: this.attackerTeamId,
      reason: 'bomb-exploded',
      objectiveControl: {
        nearestDefenderDistance: Number(defuser.distance.toFixed(2)),
        contested,
        decision: this.postPlantDecision?.decision || 'retake',
        ninja: false,
        sitePressure,
        attackersAlive: attackers.length,
        defendersAlive: defenders.length,
        defuseStarted: false
      }
    };
  }

  engagementContact(shooter, target, fallback = null, alerted = false) {
    if (!shooter?.alive || !target?.alive || shooter.teamId === target.teamId) return null;
    const eligible = this.world.eligibleContact(shooter, target);
    if (eligible) return eligible;
    if (fallback && fallback.killer === shooter && fallback.victim === target) {
      return fallback.perception;
    }

    const range = Math.hypot(
      shooter.position.x - target.position.x,
      shooter.position.y - target.position.y
    );
    if (range > 34) return null;
    const trace = this.world.traceForPair(shooter, target);
    const visibleTicks = this.world.visibleTicks.get(this.world.pairKey(shooter, target)) || 0;
    const supportReady = visibleTicks >= Math.max(2, this.world.reactionTicks(shooter, target) - 2);
    if (!trace.visible || (!alerted && !supportReady)) return null;
    return {
      source: 'vision',
      los: true,
      collisionMesh: trace.collisionMesh,
      testedTriangles: trace.testedTriangles || 0,
      behavior: shooter.behavior === 'hold' ? 'hold' : 'engage',
      behaviorSource: alerted ? 'return-fire' : 'crossfire',
      visibleForMs: Math.round(Math.max(visibleTicks, 2) * this.world.tickMs),
      distance: Number(range.toFixed(2)),
      lastKnown: null
    };
  }

  bestEngagementTarget(shooter, primary, alerted = false) {
    const enemies = this.players.filter(player =>
      player.alive && player.teamId !== shooter.teamId
    );
    return enemies
      .map(target => {
        const perception = this.engagementContact(shooter, target, primary, alerted);
        if (!perception) return null;
        const primaryTargetBonus = target === primary.victim || target === primary.killer ? 18 : 0;
        const lowHealthFinish = (100 - target.health) * 0.15;
        const score = primaryTargetBonus
          + lowHealthFinish
          + shooter.rating * 0.18
          + shooter.health * 0.08
          - perception.distance * 0.5;
        return { shooter, target, perception, score };
      })
      .filter(Boolean)
      .sort((first, second) => second.score - first.score)[0] || null;
  }

  engagementShooters(primary, wave = 0) {
    const center = primary.victim.position;
    const candidates = [];
    for (const shooter of this.players.filter(player => player.alive)) {
      const nearFight = Math.hypot(
        shooter.position.x - center.x,
        shooter.position.y - center.y
      ) <= 16;
      if (!nearFight && shooter !== primary.killer && shooter !== primary.victim) continue;
      const alerted = wave > 0 || shooter === primary.victim;
      const contact = this.bestEngagementTarget(shooter, primary, alerted);
      if (!contact) continue;
      const behaviorBonus = shooter.behavior === 'hold'
        ? 8
        : shooter.behavior === 'peek'
          ? 6
          : 0;
      contact.initiative = shooter.rating
        + shooter.health * 0.18
        + behaviorBonus
        + this.rng() * 12;
      if (wave === 0 && shooter === primary.killer) contact.initiative += 1000;
      candidates.push(contact);
    }

    const selected = [];
    for (const teamId of [primary.killer.teamId, primary.victim.teamId]) {
      selected.push(
        ...candidates
          .filter(candidate => candidate.shooter.teamId === teamId)
          .sort((first, second) => second.initiative - first.initiative)
          .slice(0, 4)
      );
    }
    return selected.sort((first, second) => second.initiative - first.initiative);
  }

  combatVisual({
    type,
    shooter,
    target,
    assist = null,
    perception,
    combat,
    bombDropped = false,
    groundDrops = [],
    engagementId,
    participantIds,
    crossfire,
    soundIntel = null
  }) {
    return this.baseEvent(type, {
      teamId: shooter.teamId,
      actor: {
        id: shooter.id,
        name: shooter.name,
        teamId: shooter.teamId,
        weapon: shooter.weapon,
        ammo: shooter.ammo,
        reserveAmmo: shooter.reserveAmmo
      },
      target: { id: target.id, name: target.name, teamId: target.teamId },
      assist: assist
        ? { id: assist.id, name: assist.name, teamId: assist.teamId }
        : null,
      weapon: combat.weapon,
      headshot: combat.fatalHeadshot,
      combat,
      bombDropped,
      bombPosition: bombDropped ? copyPoint(this.bombDropPosition) : null,
      groundDrops,
      groundItems: this.world.groundInventory.activeItems(),
      engagementId,
      participantIds,
      crossfire,
      soundIntel,
      tick: this.world.tick,
      motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
      timeLeft: Math.max(
        0,
        Math.round(115 * (1 - this.world.tick / Math.max(1, this.world.maxTick)))
      ),
      perception,
      sightline: {
        from: copyPoint(shooter.position),
        to: copyPoint(target.position)
      },
      players: this.world.snapshot(),
      remaining: {
        team1: this.alivePlayers(1).length,
        team2: this.alivePlayers(2).length
      }
    });
  }

  resolveFirefight(primary, options = {}) {
    const engagementId = `cs-${this.round}-${this.eventIndex + 1}`;
    const damageContributors = new Map();
    const events = [];
    const participants = new Set([primary.killer.id, primary.victim.id]);
    const healthAtStart = new Map(
      this.players.map(player => [player.id, player.health])
    );

    for (let wave = 0; wave < 2; wave += 1) {
      const contacts = this.engagementShooters(primary, wave);
      contacts.forEach(contact => participants.add(contact.shooter.id));
      for (const scheduled of contacts) {
        const shooter = scheduled.shooter;
        if (!shooter.alive || shooter.behavior === 'retreat') continue;
        const current = scheduled.target.alive
          ? scheduled
          : this.bestEngagementTarget(shooter, primary, true);
        if (!current?.target?.alive) continue;
        const target = current.target;
        const perception = this.engagementContact(
          shooter,
          target,
          primary,
          wave > 0 || shooter === primary.victim
        );
        if (!perception) continue;

        const combatBehaviorSource = ['crossfire', 'return-fire', 'vision'].includes(
          perception.behaviorSource
        )
          ? perception.behaviorSource
          : 'vision';
        this.world.setBehavior(
          shooter,
          'engage',
          this.world.behaviorDuration(6, 12),
          combatBehaviorSource,
          target
        );
        const combat = resolveBurst({
          shooter,
          target,
          distance: perception.distance,
          behavior: perception.behavior,
          rng: this.rng
        });
        const gunfireSound = this.world.emitSound({
          type: 'gunfire',
          sourcePlayer: shooter,
          position: shooter.position,
          visual: false,
          label: combat.weapon
        });
        const reloadSound = combat.reloads > 0
          ? this.world.emitSound({
              type: 'reload',
              sourcePlayer: shooter,
              position: shooter.position,
              visual: true,
              label: combat.weapon
            })
          : null;
        const contributors = damageContributors.get(target.id) || [];
        if (combat.damage > 0) contributors.push(shooter);
        damageContributors.set(target.id, contributors);

        let bombDropped = false;
        let groundDrops = [];
        let assist = null;
        if (target.health <= 0) {
          assist = [...contributors]
            .reverse()
            .find(candidate =>
              candidate !== shooter
              && candidate.teamId === shooter.teamId
            ) || null;
          if (target.hasBomb) {
            target.hasBomb = false;
            this.bombCarrier = null;
            this.plantTargetNode = null;
            this.plantUrgencyCarrierId = null;
            this.bombDropPosition = copyPoint(target.position);
            bombDropped = true;
          }
          const bombDropSound = bombDropped
            ? this.world.emitSound({
                type: 'bomb-drop',
                sourcePlayer: target,
                position: this.bombDropPosition,
                visual: true,
                label: 'C4 drop'
              })
            : null;
          groundDrops = this.world.markDead(target);
          if (bombDropSound) {
            gunfireSound.bombDrop = bombDropSound;
          }
        } else if (combat.damage > 0) {
          const targetMustPush = this.forcePlantTempo
            && this.world.roundPhase.phase === 'regulation'
            && target.teamId === this.attackerTeamId;
          this.world.setBehavior(
            target,
            target.health <= 38 && !targetMustPush ? 'retreat' : 'engage',
            this.world.behaviorDuration(
              target.health <= 38 && !targetMustPush ? 18 : 7,
              target.health <= 38 && !targetMustPush ? 32 : 13
            ),
            target.health <= 38 && !targetMustPush ? 'low-health' : 'return-fire',
            shooter
          );
        }

        const kind = target.health <= 0 ? 'kill' : 'damage';
        events.push({
          kind,
          shooter: shooter.char,
          target: target.char,
          killer: kind === 'kill' ? shooter.char : null,
          victim: kind === 'kill' ? target.char : null,
          assist: assist?.char || null,
          teamId: shooter.teamId,
          visual: this.combatVisual({
            type: kind,
            shooter,
            target,
            assist,
            perception,
            combat,
            bombDropped,
            groundDrops,
            engagementId,
            participantIds: [...participants],
            crossfire: participants.size >= 3,
            soundIntel: {
              gunfire: gunfireSound,
              reload: reloadSound,
              bombDrop: gunfireSound.bombDrop || null
            }
          })
        });
        this.repositionAwperAfterShot(shooter);
      }
      if (!this.alivePlayers(1).length || !this.alivePlayers(2).length) break;
    }

    for (const player of this.players.filter(candidate =>
      candidate.alive && participants.has(candidate.id)
    )) {
      const damageTaken = (healthAtStart.get(player.id) || player.health) - player.health;
      const lowHealth = player.health <= 38;
      const heavyDamage = damageTaken >= 45;
      const mustPushObjective = this.forcePlantTempo
        && this.world.roundPhase.phase === 'regulation'
        && player.teamId === this.attackerTeamId;
      if ((lowHealth || heavyDamage) && !mustPushObjective) {
        const nearestEnemy = this.players
          .filter(candidate => candidate.alive && candidate.teamId !== player.teamId)
          .sort((first, second) =>
            Math.hypot(
              player.position.x - first.position.x,
              player.position.y - first.position.y
            ) - Math.hypot(
              player.position.x - second.position.x,
              player.position.y - second.position.y
            )
          )[0] || null;
        if (nearestEnemy) {
          this.world.setBehavior(
            player,
            'retreat',
            this.world.behaviorDuration(18, 34),
            lowHealth ? 'low-health' : 'heavy-damage',
            nearestEnemy
          );
        }
      }
    }
    if (options.advanceWorld !== false) {
      this.world.advanceTicks(3 + Math.floor(this.rng() * 4));
    }
    return events;
  }

  simulateRound() {
    const events = [];
    const killCounts = {};
    let planted = false;
    let planterChar = null;
    let outcome = null;
    let safety = 0;
    let escapePrepared = false;

    while (!outcome && safety < 48) {
      safety += 1;
      const pickupEvent = this.recoverBomb();
      if (pickupEvent) {
        events.push({
          kind: 'bomb-pickup',
          actor: this.bombCarrier?.char || null,
          teamId: this.attackerTeamId,
          visual: pickupEvent
        });
      }
      if (!planted) {
        this.releaseOpeningAwpsForTeamCommit();
        this.ensurePlantSupport();
        this.ensurePlantUrgency();
      } else {
        this.coordinatePostPlantAttackers();
      }

      let team1Alive = this.aliveChars(1);
      let team2Alive = this.aliveChars(2);
      const attackers = this.aliveChars(this.attackerTeamId);
      const defenders = this.aliveChars(this.defenderTeamId);

      if (this.defuseAttempt) {
        const defuseThreats = this.activeDefuseThreats(this.defuseAttempt.actor);
        if (defuseThreats.length) {
          const defuser = this.defuseAttempt.actor;
          this.cancelDefuseAttempt();
          if (defuser?.alive) {
            this.world.setBehavior(
              defuser,
              'peek',
              this.world.behaviorDuration(6, 10),
              'defuse-contested',
              defuseThreats[0]
            );
          }
          continue;
        }
      }

      if (!defenders.length) {
        outcome = { winnerTeamId: this.attackerTeamId, reason: 'elimination' };
        break;
      }
      if (!attackers.length) {
        if (!planted) {
          outcome = { winnerTeamId: this.defenderTeamId, reason: 'elimination' };
          break;
        }
      }

      if (
        planted
        && this.postPlantDecision?.decision === 'ninja'
        && !this.ninjaFailed
        && !this.postPlantDecision.actor?.alive
      ) {
        this.ninjaFailed = true;
        this.postPlantDecision.actor = this.alivePlayers(this.defenderTeamId)
          .sort((first, second) =>
            this.pathDistance(first.position, this.plantPosition)
            - this.pathDistance(second.position, this.plantPosition)
          )[0] || null;
        this.planCoordinatedRetake();
      }
      if (
        planted
        && this.postPlantDecision?.decision === 'ninja'
        && !this.ninjaFailed
      ) {
        const ninjaChar = this.postPlantDecision.actor?.char;
        if (this.defenderTeamId === 1) {
          team1Alive = ninjaChar ? [ninjaChar] : [];
        } else {
          team2Alive = ninjaChar ? [ninjaChar] : [];
        }
      }

      const pendingTimerTicks = [
        this.defuseAttempt?.endTick,
        planted && !escapePrepared && !this.defuseAttempt ? this.escapeStartTick : null,
        !planted && !this.plantUrgencyWindowOpened ? this.plantUrgencyTick : null,
        !planted && !this.midRoundCall ? this.midRoundCheckTick : null
      ].filter(Number.isFinite);
      const nextTimerTick = pendingTimerTicks.length
        ? Math.min(...pendingTimerTicks)
        : null;
      let next = this.world.advanceUntilRoundEvent({
        team1Candidates: team1Alive,
        team2Candidates: team2Alive,
        attackerTeamId: this.attackerTeamId,
        plantTarget: this.plantTarget(),
        canPlant: !planted && Boolean(this.bombCarrier?.alive && this.bombCarrier.hasBomb),
        eligiblePlanterIds: this.bombCarrier?.hasBomb ? [this.bombCarrier.id] : [],
        plantEligibility: player => this.plantEligibility(player),
        defenderTeamId: this.defenderTeamId,
        defuseTarget: this.plantPosition,
        canDefuse: planted
          && !this.defuseAttempt
          && this.postPlantDecision?.decision !== 'save',
        eligibleDefuserIds: this.alivePlayers(this.defenderTeamId).map(player => player.id),
        defuseEligibility: player => this.defuseEligibility(player),
        timerTick: nextTimerTick
      });

      if (next.type === 'utility-decision') {
        const visual = this.utilityDecisionEvent(next);
        const actor = visual.actor
          ? this.players.find(player => player.id === visual.actor.id)
          : null;
        events.push({
          kind: 'utility-decision',
          actor: actor?.char || null,
          teamId: actor?.teamId || null,
          utility: next.utility?.type,
          decision: next.decision,
          visual
        });
        continue;
      }

      if (next.type === 'equipment-drop' || next.type === 'ground-pickup') {
        const visual = this.groundInventoryEvent(next);
        const actor = visual.actor
          ? this.players.find(player => player.id === visual.actor.id)
          : null;
        events.push({
          kind: next.type,
          actor: actor?.char || null,
          teamId: actor?.teamId || null,
          item: next.item?.label || null,
          items: next.items || [],
          visual
        });
        continue;
      }

      if (next.type === 'sound-cue') {
        const visual = this.soundCueEvent(next);
        events.push({
          kind: 'sound-cue',
          actor: visual.actor
            ? this.players.find(player => player.id === visual.actor.id)?.char || null
            : null,
          teamId: visual.teamId,
          sound: visual.sound?.type || null,
          fake: visual.fake,
          visual
        });
        continue;
      }

      if (next.type === 'utility') {
        const visual = this.utilityEvent(next);
        const utilityKills = (next.affected || []).filter(result => result.killed);
        const actor = visual.actor
          ? this.players.find(player => player.id === visual.actor.id)
          : null;
        for (const casualty of utilityKills) {
          if (actor) {
            const killerName = rawName(actor.char);
            killCounts[killerName] = (killCounts[killerName] || 0) + 1;
          }
        }
        events.push({
          kind: 'utility',
          actor: actor?.char || null,
          teamId: actor?.teamId || null,
          utility: next.utility?.type,
          casualties: utilityKills.map(result => result.player),
          visual
        });
        if (this.defuseAttempt && !this.defuseAttempt.actor.alive) {
          this.cancelDefuseAttempt();
        }
        continue;
      }

      if (next.type === 'contact') {
        const primary = {
          killer: this.player(next.killer),
          victim: this.player(next.victim),
          perception: next.perception
        };
        const firefight = this.resolveFirefight(primary);
        for (const combatEvent of firefight) {
          events.push(combatEvent);
          if (combatEvent.kind !== 'kill') continue;
          const killerName = rawName(combatEvent.killer);
          killCounts[killerName] = (killCounts[killerName] || 0) + 1;
        }
        if (this.defuseAttempt && !this.defuseAttempt.actor.alive) {
          this.cancelDefuseAttempt();
        }
        continue;
      }

      if (next.type === 'time-expired' && !planted) {
        const carrier = this.bombCarrier;
        this.adoptNearbyPlantTarget(carrier);
        const emergencyPlant = carrier?.alive
          && carrier.hasBomb
          && Math.hypot(
            carrier.position.x - this.plantTarget().x,
            carrier.position.y - this.plantTarget().y
          ) <= 2.2
          && this.plantEligibility(carrier);
        if (emergencyPlant) {
          next = {
            type: 'plant-ready',
            actor: carrier.char,
            teamId: this.attackerTeamId,
            tick: this.world.tick,
            motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
            players: this.world.snapshot(),
            emergency: true
          };
        }
      }

      if (next.type === 'plant-ready') {
        planterChar = next.actor;
        const planter = this.player(planterChar);
        if (this.shouldFakePlant(planter)) {
          const visual = this.startFakePlant(planter);
          events.push({
            kind: 'sound-cue',
            actor: planterChar,
            teamId: this.attackerTeamId,
            sound: 'plant',
            fake: true,
            visual
          });
          continue;
        }
        this.world.clearObjectivePriority(planter);
        this.plantUrgencyCarrierId = null;
        const visual = this.objective('plant', planterChar, this.attackerTeamId);
        if (!visual) {
          if (planter && !planter.alive && planter.hasBomb) {
            planter.hasBomb = false;
            this.bombCarrier = null;
            this.plantTargetNode = null;
            this.bombDropPosition = copyPoint(planter.position);
          }
          continue;
        }
        if (planter) planter.hasBomb = false;
        visual.soundIntel = planter
          ? this.world.emitSound({
              type: 'plant',
              sourcePlayer: planter,
              position: visual.position,
              fake: false,
              visual: false,
              label: 'plant'
            })
          : null;
        visual.plantDecision = this.lastPlantEvaluation;
        planted = true;
        events.push({
          kind: 'plant',
          actor: planterChar,
          teamId: this.attackerTeamId,
          visual
        });
        const decisionVisual = this.startPostPlantPhase();
        events.push({
          kind: 'decision',
          actor: this.postPlantDecision?.actor?.char || null,
          teamId: this.defenderTeamId,
          decision: this.postPlantDecision?.decision,
          visual: decisionVisual
        });
        continue;
      }

      if (next.type === 'defuse-ready') {
        const attemptVisual = this.startDefuseAttempt(this.player(next.actor));
        if (attemptVisual) {
          events.push({
            kind: 'defuse-attempt',
            actor: this.player(next.actor)?.char || null,
            teamId: this.defenderTeamId,
            visual: attemptVisual
          });
        }
        continue;
      }

      if (
        next.type === 'timer-expired'
        && !planted
        && !this.plantUrgencyWindowOpened
        && this.world.tick >= this.plantUrgencyTick
      ) {
        this.plantUrgencyWindowOpened = true;
        this.ensurePlantUrgency();
        this.ensurePlantSupport();
        continue;
      }

      if (
        next.type === 'timer-expired'
        && !planted
        && !this.midRoundCall
        && this.world.tick >= this.midRoundCheckTick
      ) {
        const visual = this.maybeMidRoundCall();
        if (visual) {
          events.push({
            kind: 'mid-round-call',
            actor: this.bombCarrier?.char || null,
            teamId: this.attackerTeamId,
            call: visual.call,
            visual
          });
        }
        continue;
      }

      if (
        next.type === 'timer-expired'
        && this.defuseAttempt
        && this.world.tick >= this.defuseAttempt.endTick
      ) {
        const timerResult = this.resolveDefuseTimer();
        if (timerResult?.outcome) {
          outcome = timerResult.outcome;
          break;
        }
        if (timerResult) continue;
      }

      if (
        next.type === 'timer-expired'
        && planted
        && !escapePrepared
        && Number.isFinite(this.escapeStartTick)
        && this.world.tick >= this.escapeStartTick
      ) {
        const preparedEscape = this.prepareBombEscape();
        events.push({
          kind: 'escape',
          teamId: this.attackerTeamId,
          visual: preparedEscape.visual
        });
        for (const combatEvent of preparedEscape.combatEvents) {
          events.push(combatEvent);
          if (combatEvent.kind !== 'kill') continue;
          const killerName = rawName(combatEvent.killer);
          killCounts[killerName] = (killCounts[killerName] || 0) + 1;
        }
        escapePrepared = true;
        continue;
      }

      outcome = planted
        ? (
            this.defuseAttempt
              ? {
                  winnerTeamId: this.attackerTeamId,
                  reason: 'bomb-exploded',
                  objectiveControl: {
                    decision: this.postPlantDecision?.decision || 'retake',
                    defuseInterruptedByTimer: true,
                    attackersAlive: this.alivePlayers(this.attackerTeamId).length,
                    defendersAlive: this.alivePlayers(this.defenderTeamId).length
                  }
                }
              : this.postPlantWinner()
          )
        : { winnerTeamId: this.defenderTeamId, reason: 'time-expired' };
    }

    if (!outcome) {
      outcome = planted
        ? this.postPlantWinner()
        : { winnerTeamId: this.defenderTeamId, reason: 'time-expired' };
    }

    if (outcome.reason === 'defused') {
      const actor = outcome.actor
        || this.alivePlayers(this.defenderTeamId)[0]?.char
        || null;
      events.push({
        kind: 'defuse',
        actor,
        teamId: this.defenderTeamId,
        visual: this.objective('defuse', actor, this.defenderTeamId)
      });
    } else if (outcome.reason === 'bomb-exploded') {
      if (!escapePrepared) {
        const preparedEscape = this.prepareBombEscape();
        events.push({
          kind: 'escape',
          teamId: this.attackerTeamId,
          visual: preparedEscape.visual
        });
        for (const combatEvent of preparedEscape.combatEvents) {
          events.push(combatEvent);
          if (combatEvent.kind !== 'kill') continue;
          const killerName = rawName(combatEvent.killer);
          killCounts[killerName] = (killCounts[killerName] || 0) + 1;
        }
        escapePrepared = true;
      }
      const actor = planterChar
        || this.alivePlayers(this.attackerTeamId)[0]?.char
        || null;
      const blast = this.applyBombExplosion();
      const explosionVisual = this.objective('explode', actor, this.attackerTeamId);
      explosionVisual.blast = blast;
      explosionVisual.propagationModel = 'cs2-2026-nav-shockwave-v1';
      explosionVisual.players = this.world.snapshot();
      events.push({
        kind: 'explode',
        actor,
        teamId: this.attackerTeamId,
        blast,
        visual: explosionVisual
      });
    }

    return {
      ...outcome,
      planted,
      planterChar,
      events,
      killCounts,
      remaining: {
        team1: this.aliveChars(1),
        team2: this.aliveChars(2)
      },
      remainingPlayers: this.world.snapshot(),
      groundInventory: this.world.groundInventory.summary(this.world.snapshot()),
      resolution: {
        source: 'world-state',
        bombPlanted: planted,
        reason: outcome.reason,
        winnerTeamId: outcome.winnerTeamId,
        team1Alive: this.alivePlayers(1).length,
        team2Alive: this.alivePlayers(2).length,
        tick: this.world.tick,
        motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
        objectiveControl: outcome.objectiveControl || null,
        postPlantDecision: this.postPlantDecision
          ? {
              decision: this.postPlantDecision.decision,
              reason: this.postPlantDecision.reason,
              metrics: this.postPlantDecision.metrics
            }
          : null
      }
    };
  }

  kill({ killer, victim, assist, killerTeamId, contact }) {
    const actor = this.player(killer);
    const target = this.player(victim);
    const helper = assist ? this.player(assist) : null;
    if (!actor || !target || !contact?.perception?.los) return null;

    const combat = resolveElimination({
      shooter: actor,
      target,
      distance: contact.perception.distance,
      behavior: contact.perception.behavior,
      rng: this.rng
    });
    let bombDropped = false;
    let groundDrops = [];
    if (target.health <= 0) {
      if (target.hasBomb) {
        target.hasBomb = false;
        this.bombCarrier = null;
        this.plantTargetNode = null;
        this.plantUrgencyCarrierId = null;
        this.bombDropPosition = copyPoint(target.position);
        bombDropped = true;
      }
      groundDrops = this.world.markDead(target);
    }

    return this.baseEvent('kill', {
      teamId: killerTeamId,
      actor: {
        id: actor.id,
        name: actor.name,
        teamId: actor.teamId,
        weapon: actor.weapon,
        ammo: actor.ammo,
        reserveAmmo: actor.reserveAmmo
      },
      target: { id: target.id, name: target.name, teamId: target.teamId },
      assist: helper ? { id: helper.id, name: helper.name, teamId: helper.teamId } : null,
      weapon: combat.weapon,
      headshot: combat.fatalHeadshot,
      combat,
      bombDropped,
      bombPosition: bombDropped ? copyPoint(this.bombDropPosition) : null,
      groundDrops,
      groundItems: this.world.groundInventory.activeItems(),
      tick: contact.tick,
      motionTimeMs: contact.motionTimeMs,
      timeLeft: Math.max(0, Math.round(115 * (1 - contact.motionTimeMs / this.roundDurationMs))),
      perception: contact.perception,
      sightline: {
        from: copyPoint(actor.position),
        to: copyPoint(target.position)
      },
      players: this.world.snapshot(),
      remaining: {
        team1: this.players.filter(player => player.teamId === 1 && player.alive).length,
        team2: this.players.filter(player => player.teamId === 2 && player.alive).length
      }
    });
  }

  reroutePlayerToSite(player, siteNode, options = {}) {
    const existing = this.motionPlans.get(player.id) || [];
    const elapsed = Math.round(player.routeElapsedMs || 0);
    const route = findPath(player.position, siteNode);
    if (!route.length) return false;
    const distance = route.slice(1).reduce((sum, node, index) => {
      const previous = route[index];
      return sum + Math.hypot(node.x - previous.x, node.y - previous.y);
    }, 0);
    const durationPerDistance = Number(options.durationPerDistance) || 92;
    const maximumDurationMs = Number(options.maximumDurationMs) || 8200;
    const duration = clamp(
      Math.round(distance * durationPerDistance),
      700,
      Math.max(700, maximumDurationMs)
    );
    const laneIndex = Number.isFinite(options.laneIndex)
      ? options.laneIndex
      : (player.hasBomb ? 0 : Number(player.routeLaneIndex) || 0);
    const segment = toTimedMotion(route, laneIndex, duration);
    const history = existing.filter(point => point.t < elapsed);
    const current = {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      areaId: route[0].id,
      t: elapsed
    };
    const candidate = [
      ...history,
      current,
      ...segment.slice(1).map(point => ({ ...point, t: elapsed + point.t }))
    ];
    if (!validateMotion(candidate)) return false;
    existing.splice(0, existing.length, ...candidate);
    return true;
  }

  reroutePlayerThrough(player, targets, options = {}) {
    const validTargets = (targets || []).filter(Boolean);
    if (!player?.alive || !validTargets.length) return false;
    const route = [];
    let cursor = player.position;
    for (const target of validTargets) {
      const segment = findPath(cursor, target);
      if (!segment.length) return false;
      route.push(...(route.length ? segment.slice(1) : segment));
      cursor = target;
    }
    if (route.length < 2) return false;

    const existing = this.motionPlans.get(player.id) || [];
    const elapsed = Math.round(player.routeElapsedMs || 0);
    const routeDistance = route.slice(1).reduce((sum, node, index) => {
      const previous = route[index];
      return sum + Math.hypot(node.x - previous.x, node.y - previous.y);
    }, 0);
    const durationPerDistance = Number(options.durationPerDistance) || 82;
    const maximumDurationMs = Number(options.maximumDurationMs) || 5200;
    const duration = clamp(
      Math.round(routeDistance * durationPerDistance),
      700,
      Math.max(700, maximumDurationMs)
    );
    const laneIndex = Number.isFinite(options.laneIndex)
      ? options.laneIndex
      : (player.hasBomb ? 0 : Number(player.routeLaneIndex) || 0);
    const segment = toTimedMotion(route, laneIndex, duration);
    const history = existing.filter(point => point.t < elapsed);
    const current = {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      areaId: route[0].id,
      t: elapsed
    };
    const candidate = [
      ...history,
      current,
      ...segment.slice(1).map(point => ({ ...point, t: elapsed + point.t }))
    ];
    if (!validateMotion(candidate)) return false;
    existing.splice(0, existing.length, ...candidate);
    return true;
  }

  objective(type, actorChar, teamId) {
    const plannedSiteKey = this.plan === 'b' || this.plan === 'midB' ? 'B' : 'A';
    const siteKey = type !== 'plant' && this.plantedSite
      ? this.plantedSite
      : plannedSiteKey;
    const bombsite = graph.bombsites?.[siteKey];
    const requestedActor = this.player(actorChar);
    let planterRerouted = false;
    let actor = requestedActor?.alive && requestedActor.teamId === teamId
      ? requestedActor
      : null;

    if (type === 'plant' || !this.plantPosition || this.plantedSite !== siteKey) {
      const selected = type === 'plant'
        ? this.plantTarget()
        : (
            NAV_NODES.get(bombsite?.center?.id)
            || (siteKey === 'A' ? DUST2.aSite : DUST2.bSite)
          );
      const routeCandidates = this.players
        .filter(player => {
          if (!player.alive || player.teamId !== teamId) return false;
          const route = this.motionPlans.get(player.id) || [];
          return route[route.length - 1]?.areaId === selected.id;
        })
        .sort((first, second) =>
          second.routeElapsedMs - first.routeElapsedMs
        );
      if (!actor || (type !== 'plant' && !routeCandidates.includes(actor))) {
        actor = routeCandidates[0]
          || actor
          || this.players.find(player => player.alive && player.teamId === teamId)
          || null;
      }
      const needsPrecisePlantRoute = type === 'plant'
        && Math.hypot(
          actor?.position.x - selected.x,
          actor?.position.y - selected.y
        ) > 1.35;
      if (actor && (!routeCandidates.includes(actor) || needsPrecisePlantRoute)) {
        planterRerouted = this.reroutePlayerToSite(actor, selected);
      }
      if (actor) {
        this.world.advancePlayerToObjective(actor, selected);
        this.roundDurationMs = this.world.durationMs;
        if (this.roundStartEvent) {
          this.roundStartEvent.roundDurationMs = this.roundDurationMs;
        }
      }
      if (
        type === 'plant'
        && (
          !actor?.alive
          || Math.hypot(
            actor.position.x - selected.x,
            actor.position.y - selected.y
          ) > 1.35
        )
      ) {
        return null;
      }
      this.plantedSite = siteKey;
      this.plantPosition = copyPoint(selected);
    }
    if (!actor) {
      actor = this.players.find(player => player.teamId === teamId && player.alive) || null;
    }
    // Başarılı defuse oyuncusu zaten gerçek C4 konumunda doğrulandı.
    // Olay üretilirken site merkezine yeniden rota vermek hem görüntüyü
    // sıçratıyor hem de farklı plant noktasını yanlış gösterebiliyordu.

    return this.baseEvent(type, {
      teamId,
      actor: actor ? { id: actor.id, name: actor.name, teamId: actor.teamId } : null,
      site: siteKey,
      position: copyPoint(this.plantPosition),
      plantZone: bombsite?.polygons || [],
      plantSource: bombsite?.source || 'landmark-fallback',
      plantApproachDistance: type === 'plant' && actor
        ? Number(Math.hypot(
          actor.position.x - this.plantPosition.x,
          actor.position.y - this.plantPosition.y
        ).toFixed(3))
        : null,
      planterRerouted: type === 'plant' ? planterRerouted : false,
      planterRouteElapsedMs: type === 'plant' && actor
        ? Math.round(actor.routeElapsedMs || 0)
        : null,
      bombTime: type === 'plant' ? BOMB_LOGICAL_SECONDS : 0,
      bombDurationMs: type === 'plant' ? BOMB_WORLD_WINDOW_MS : 0,
      tick: this.world.tick,
      motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
      timeLeft: Math.max(0, Math.round(115 * (1 - this.world.tick / this.world.maxTick))),
      players: this.world.snapshot()
    });
  }

  roundEnd(winnerTeamId, reason, resolution = null) {
    return this.baseEvent('round-end', {
      teamId: winnerTeamId,
      winnerTeamId,
      reason,
      tick: this.world.tick,
      motionTimeMs: Math.round(this.world.tick * this.world.tickMs),
      players: this.world.snapshot(),
      groundItems: this.world.groundInventory.activeItems(),
      groundInventory: this.world.groundInventory.summary(this.world.snapshot()),
      timeLeft: 0,
      resolution
    });
  }
}

function createDust2RoundDirector(options) {
  return new Dust2RoundDirector(options);
}

module.exports = {
  DUST2,
  ATTACK_ROUTES,
  selectAttackPlan,
  T_SPAWN_AREA_IDS,
  CT_SPAWN_AREA_IDS,
  DEFENDER_ROUTES,
  createDust2RoundDirector
};
