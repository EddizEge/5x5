const {
  traceLineOfSight,
  distanceToSegment
} = require('./dust2-navigation');
const {
  evaluateUtilityDecision
} = require('./cs-utility-decisions');
const {
  getSoundProfile,
  evaluateHearing,
  estimateSoundPosition,
  teamCallDelay,
  fuseIntel
} = require('./cs-sound-intelligence');
const { GroundInventoryRegistry } = require('./cs-ground-inventory');
const { T_NO_HOLD_ZONES } = require('./cs-dust2-tactical-catalog');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const BEHAVIOR_SPEEDS = Object.freeze({
  advance: 1,
  walk: 0.92,
  investigate: 0.82,
  hold: 0,
  peek: 0.68,
  engage: 0,
  retreat: -0.72,
  dead: 0
});
const UTILITY_DEFAULTS = Object.freeze({
  // CS saatinde yaklaşık 18 saniye. 115 saniyelik regulation penceresinin
  // 9.8 saniyelik dünya karşılığı için başlangıç değeri 31 tick'tir.
  smoke: { radius: 4.7, durationTicks: 31 },
  flash: { radius: 16.5, durationTicks: 0 },
  he: { radius: 8.2, durationTicks: 0 },
  molotov: { radius: 5.6, durationTicks: 52 },
  incendiary: { radius: 5.6, durationTicks: 52 }
});

function interpolate(points, elapsed) {
  if (!points?.length) return null;
  if (elapsed <= points[0].t) return { ...points[0], next: points[1] || points[0] };
  const last = points[points.length - 1];
  if (elapsed >= last.t) return { ...last, next: last };

  let low = 0;
  let high = points.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].t <= elapsed) low = middle;
    else high = middle;
  }

  const from = points[low];
  const to = points[high];
  const progress = clamp((elapsed - from.t) / Math.max(1, to.t - from.t), 0, 1);
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    z: from.z + (to.z - from.z) * progress,
    areaId: progress < 0.5 ? from.areaId : to.areaId,
    next: to
  };
}

class ShooterWorld {
  constructor({
    players,
    motionPlans,
    durationMs = 9800,
    smokes = [],
    utility = null,
    round = 1,
    rng = Math.random,
    attackPlan = null
  }) {
    this.tickRate = 20;
    this.tickMs = 1000 / this.tickRate;
    this.durationMs = durationMs;
    this.regulationDurationMs = durationMs;
    this.maxTick = Math.ceil(durationMs / this.tickMs);
    this.tick = 0;
    this.players = players;
    this.motionPlans = motionPlans;
    this.random = rng;
    this.attackPlan = attackPlan;
    this.attackerTeamId = this.players.find(player => player.side === 'T')?.teamId || 1;
    this.defenderTeamId = this.attackerTeamId === 1 ? 2 : 1;
    this.roundPhase = {
      phase: 'regulation',
      plantPosition: null,
      postPlantDecision: null,
      mustContestRound: false,
      forceObjectiveTempo: false
    };
    this.lastUtilityByTeam = new Map();
    const utilityPlan = utility || smokes;
    this.utilities = utilityPlan.map((item, index) => {
      const defaults = UTILITY_DEFAULTS[item.type] || UTILITY_DEFAULTS.smoke;
      const scheduledTick = Number.isFinite(item.detonateTick)
        ? item.detonateTick
        : 18 + index * 8;
      const contextual = Boolean(item.purpose);
      return {
        ...defaults,
        ...item,
        id: item.id || `utility-${index + 1}`,
        contextual,
        earliestTick: item.earliestTick ?? scheduledTick,
        latestTick: item.latestTick ?? scheduledTick,
        detonateTick: contextual ? null : scheduledTick,
        activeFromTick: contextual ? null : scheduledTick,
        activeUntilTick: contextual
          ? null
          : scheduledTick + (item.durationTicks ?? defaults.durationTicks),
        deployed: !contextual,
        detonated: false,
        nextDecisionTick: item.earliestTick ?? scheduledTick,
        decision: null,
        lastDamageTick: null
      };
    });
    this.smokes = this.utilities.filter(item => item.type === 'smoke');
    this.pendingUtilityEvents = [];
    this.pendingGroundEvents = [];
    this.groundInventory = new GroundInventoryRegistry({ round });
    this.visibleTicks = new Map();
    this.memory = new Map();
    this.pendingTeamCalls = [];
    this.teamCallCooldown = new Map();
    this.soundTimeline = [];
    this.informationTimeline = [];
    this.lastFootstepTick = new Map();
    this.lastRecordedSoundTick = new Map();
    this.lineOfSightCache = new Map();
    this.lineOfSightSmokePhase = 'clear';
    this.behaviorTimeline = [];
    this.roleTaskTimeline = [];
    this.teamTacticsTimeline = [];
    this.executeState = {
      status: 'forming',
      committedTick: null
    };
    this.lastTacticsSampleTick = -Infinity;
    this.routeTimelines = this.players.map(player => ({
      id: player.id,
      samples: [[0, 0]]
    }));
    this.routeSamplesByPlayer = new Map(
      this.routeTimelines.map(timeline => [timeline.id, timeline.samples])
    );
    this.positionTimelines = this.players.map(player => ({
      id: player.id,
      samples: [[0, player.position.x, player.position.y]]
    }));
    this.positionSamplesByPlayer = new Map(
      this.positionTimelines.map(timeline => [timeline.id, timeline.samples])
    );
    this.objectiveRunnerId = null;
    this.objectiveTarget = null;
    this.objectiveSource = 'objective';

    for (const player of this.players) {
      player.facing = { x: 0, y: -1 };
      player.routeFacing = { x: 0, y: -1 };
      player.velocity = 0;
      player.lastPosition = { ...player.position };
      player.radius = 0.44;
      player.routeElapsedMs = 0;
      player.lastRouteElapsedMs = 0;
      player.behavior = 'advance';
      player.behaviorSource = 'route';
      player.behaviorTarget = null;
      player.behaviorUntilTick = 16 + Math.floor(this.random() * 9);
      player.behaviorLockUntilTick = 0;
      player.behaviorLockState = null;
      player.behaviorLockSource = null;
      player.behaviorLockTarget = null;
      player.nextAngleCheckTick = 36 + Math.floor(this.random() * 24);
      player.blindedUntilTick = 0;
      player.flashIntensity = 0;
      player.inFireUntilTick = 0;
      player.teammateBlockedTicks = 0;
      player.teammatePassThroughUntilTick = 0;
      player.lastHeardSound = null;
      this.recordBehavior(player);
    }
  }

  activeSmokes() {
    return this.smokes.filter(smoke =>
      smoke.detonated
      &&
      this.tick >= smoke.activeFromTick && this.tick <= smoke.activeUntilTick
    );
  }

  activeFires() {
    return this.utilities.filter(item =>
      ['molotov', 'incendiary'].includes(item.type)
      && item.detonated
      && this.tick >= item.activeFromTick
      && this.tick <= item.activeUntilTick
    );
  }

  utilityDurationTicks(utility) {
    if (utility?.type !== 'smoke') return utility?.durationTicks || 0;
    const isPostPlant = this.roundPhase.phase === 'postplant';
    const logicalWindowSeconds = isPostPlant ? 40 : 115;
    const worldWindowMs = isPostPlant
      ? Number(this.roundPhase.bombWindowMs) || 6200
      : this.regulationDurationMs;
    return Math.max(
      1,
      Math.round(
        (worldWindowMs / this.tickMs) * (18 / logicalWindowSeconds)
      )
    );
  }

  utilityTrace(position, utility, maxDistance) {
    return traceLineOfSight(position, utility, {
      smokes: [],
      maxDistance,
      maxVerticalDelta: 120
    }).visible;
  }

  applyFlash(utility) {
    const affected = [];
    for (const player of this.players.filter(candidate => candidate.alive)) {
      const range = distance(player.position, utility);
      if (range > utility.radius || !this.utilityTrace(player.position, utility, utility.radius + 1)) {
        continue;
      }
      const dx = utility.x - player.position.x;
      const dy = utility.y - player.position.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      const facingDot = player.facing.x * (dx / length) + player.facing.y * (dy / length);
      const distanceFactor = clamp(1 - range / utility.radius, 0, 1);
      const facingFactor = clamp((facingDot + 1) / 2, 0.18, 1);
      const intensity = clamp(distanceFactor * 0.7 + facingFactor * 0.3, 0.18, 1);
      const blindTicks = Math.round(5 + intensity * 31);
      player.blindedUntilTick = Math.max(player.blindedUntilTick, this.tick + blindTicks);
      player.flashIntensity = Math.max(player.flashIntensity, intensity);
      this.visibleTicks.forEach((_, key) => {
        if (key.startsWith(`${player.id}:`)) this.visibleTicks.set(key, 0);
      });
      affected.push({
        player: { id: player.id, name: player.name, teamId: player.teamId },
        distance: Number(range.toFixed(2)),
        intensity: Number(intensity.toFixed(2)),
        blindMs: Math.round(blindTicks * this.tickMs)
      });
    }
    return affected;
  }

  applyHe(utility) {
    const affected = [];
    for (const player of this.players.filter(candidate => candidate.alive)) {
      const range = distance(player.position, utility);
      if (range > utility.radius || !this.utilityTrace(player.position, utility, utility.radius + 1)) {
        continue;
      }
      const falloff = Math.pow(clamp(1 - range / utility.radius, 0, 1), 1.35);
      const rawDamage = Math.round(8 + 78 * falloff);
      const healthBefore = player.health;
      const armorBefore = player.armor;
      const healthDamage = Math.min(
        player.health,
        Math.max(1, Math.round(rawDamage * (player.armor > 0 ? 0.72 : 1)))
      );
      const armorDamage = player.armor > 0
        ? Math.min(player.armor, Math.round(rawDamage * 0.34))
        : 0;
      player.health = Math.max(0, player.health - healthDamage);
      player.armor = Math.max(0, player.armor - armorDamage);
      const killed = player.health <= 0;
      if (killed) this.markDead(player);
      else if (healthDamage >= 28 || player.health <= 38) {
        this.setBehavior(
          player,
          'retreat',
          this.behaviorDuration(14, 26),
          'utility-he',
          utility
        );
      }
      affected.push({
        player: { id: player.id, name: player.name, teamId: player.teamId },
        healthBefore,
        healthAfter: player.health,
        armorBefore,
        armorAfter: player.armor,
        damage: healthDamage,
        armorDamage,
        distance: Number(range.toFixed(2)),
        killed
      });
    }
    return affected;
  }

  applyFireTick(utility) {
    if (utility.lastDamageTick && this.tick - utility.lastDamageTick < 4) return [];
    utility.lastDamageTick = this.tick;
    const affected = [];
    for (const player of this.players.filter(candidate => candidate.alive)) {
      const range = distance(player.position, utility);
      if (range > utility.radius) continue;
      const damage = Math.min(player.health, Math.max(2, Math.round(8 - range * 0.75)));
      const healthBefore = player.health;
      player.health = Math.max(0, player.health - damage);
      player.inFireUntilTick = Math.max(player.inFireUntilTick, this.tick + 7);
      const killed = player.health <= 0;
      if (killed) this.markDead(player);
      else {
        this.lockBehavior(
          player,
          'retreat',
          this.tick + 12,
          'utility-fire',
          utility
        );
      }
      affected.push({
        player: { id: player.id, name: player.name, teamId: player.teamId },
        healthBefore,
        healthAfter: player.health,
        armorBefore: player.armor,
        armorAfter: player.armor,
        damage,
        armorDamage: 0,
        distance: Number(range.toFixed(2)),
        killed
      });
    }
    return affected;
  }

  setRoundPhase(phase, context = {}) {
    this.roundPhase = {
      ...this.roundPhase,
      ...context,
      phase
    };
    for (const utility of this.utilities) {
      if (!utility.contextual || utility.deployed || utility.detonated) continue;
      utility.nextDecisionTick = Math.min(
        utility.nextDecisionTick || this.tick + 1,
        this.tick + 1
      );
    }
  }

  setPlayerTask(player, task, phase = this.roundPhase.phase, source = 'phase') {
    if (!player || !task || player.roundTask === task) return false;
    player.roundTask = task;
    this.roleTaskTimeline.push({
      id: player.id,
      teamId: player.teamId,
      side: player.side,
      role: player.roundRole,
      task,
      phase,
      source,
      tick: this.tick,
      atMs: Math.round(this.tick * this.tickMs)
    });
    return true;
  }

  recordRoleTasks(phase = this.roundPhase.phase, decision = null) {
    for (const player of this.players) {
      this.roleTaskTimeline.push({
        id: player.id,
        teamId: player.teamId,
        side: player.side,
        role: player.roundRole,
        task: player.roundTask,
        phase,
        decision,
        source: 'phase-assignment',
        tick: this.tick,
        atMs: Math.round(this.tick * this.tickMs)
      });
    }
  }

  rolePlayer(teamId, role) {
    return this.players.find(player =>
      player.alive && player.teamId === teamId && player.roundRole === role
    ) || null;
  }

  routeProgress(player) {
    const route = this.motionPlans.get(player.id) || [];
    const routeEnd = route[route.length - 1]?.t || this.durationMs;
    return clamp(player.routeElapsedMs / Math.max(1, routeEnd), 0, 1);
  }

  entryTradePair() {
    const entry = this.rolePlayer(this.attackerTeamId, 'entry');
    const support = this.rolePlayer(this.attackerTeamId, 'support');
    if (!entry) return { entry: null, trade: support, distance: null };
    const candidates = this.players
      .filter(player =>
        player.alive
        && player.teamId === this.attackerTeamId
        && player !== entry
        && player.roundRole !== 'lurk'
      )
      .sort((first, second) => {
        if (first === support) return -1;
        if (second === support) return 1;
        return distance(entry.position, first.position) - distance(entry.position, second.position);
      });
    const trade = candidates[0] || null;
    return {
      entry,
      trade,
      distance: trade ? distance(entry.position, trade.position) : null
    };
  }

  updateTeamTactics() {
    const pair = this.entryTradePair();
    const forceObjectiveTempo = Boolean(this.roundPhase.forceObjectiveTempo);
    if (this.tick - this.lastTacticsSampleTick >= 8) {
      this.lastTacticsSampleTick = this.tick;
      this.teamTacticsTimeline.push({
        tick: this.tick,
        atMs: Math.round(this.tick * this.tickMs),
        phase: this.roundPhase.phase,
        executeStatus: this.executeState.status,
        entryId: pair.entry?.id || null,
        tradeId: pair.trade?.id || null,
        entryTradeDistance: Number.isFinite(pair.distance)
          ? Number(pair.distance.toFixed(2))
          : null,
        aliveAttackers: this.players.filter(player =>
          player.alive && player.teamId === this.attackerTeamId
        ).length,
        aliveDefenders: this.players.filter(player =>
          player.alive && player.teamId === this.defenderTeamId
        ).length
      });
    }
    if (this.roundPhase.phase !== 'regulation') return;

    for (const player of this.players.filter(candidate =>
      candidate.alive && candidate.teamId === this.attackerTeamId
    )) {
      const transitZone = T_NO_HOLD_ZONES.find(zone =>
        zone.plans.includes(this.attackPlan)
        && player.position.x >= zone.minX
        && player.position.x <= zone.maxX
        && player.position.y >= zone.minY
        && player.position.y <= zone.maxY
      );
      if (
        !transitZone
        || player.id === this.objectiveRunnerId
        || this.visibleEnemies(player).length > 0
        || this.knownEnemies(player).some(entry => entry.memory.confidence >= 0.66)
      ) {
        continue;
      }
      if (['hold', 'peek'].includes(player.behavior)) {
        this.setPlayerTask(player, 'clear-long-transit', 'regulation', 'reported-no-hold-zone');
        this.setBehavior(player, 'advance', 8, 'reported-no-hold-zone', player.behaviorTarget);
      }
    }

    if (pair.entry && pair.trade) {
      const entryProgress = this.routeProgress(pair.entry);
      const canOverrideEntry = pair.entry.behaviorLockUntilTick <= this.tick
        && pair.entry.id !== this.objectiveRunnerId
        && this.visibleEnemies(pair.entry).length === 0;
      const canOverrideTrade = pair.trade.behaviorLockUntilTick <= this.tick
        && pair.trade.id !== this.objectiveRunnerId
        && this.visibleEnemies(pair.trade).length === 0;
      if (
        this.executeState.status !== 'committed'
        && entryProgress >= 0.42
        && pair.distance > 14
      ) {
        if (this.executeState.status !== 'waiting-trade') {
          this.executeState.status = 'waiting-trade';
          this.teamTacticsTimeline.push({
            tick: this.tick,
            atMs: Math.round(this.tick * this.tickMs),
            phase: 'regulation',
            event: 'execute-wait',
            executeStatus: this.executeState.status,
            entryId: pair.entry.id,
            tradeId: pair.trade.id,
            entryTradeDistance: Number(pair.distance.toFixed(2))
          });
        }
        this.setPlayerTask(pair.entry, 'wait-for-trade', 'regulation', 'execute-spacing');
        this.setPlayerTask(pair.trade, 'close-trade-gap', 'regulation', 'execute-spacing');
        if (canOverrideEntry) {
          this.setBehavior(pair.entry, 'hold', 5, 'execute-wait', pair.trade.position);
        }
        if (canOverrideTrade) {
          this.setBehavior(pair.trade, 'advance', 5, 'trade-close', pair.entry.position);
        }
      } else if (
        entryProgress >= (forceObjectiveTempo ? 0.42 : 0.5)
        && pair.distance <= 14
      ) {
        if (this.executeState.status !== 'committed') {
          this.executeState.status = 'committed';
          this.executeState.committedTick = this.tick;
          this.teamTacticsTimeline.push({
            tick: this.tick,
            atMs: Math.round(this.tick * this.tickMs),
            phase: 'regulation',
            event: 'execute-commit',
            executeStatus: this.executeState.status,
            entryId: pair.entry.id,
            tradeId: pair.trade.id,
            entryTradeDistance: Number(pair.distance.toFixed(2))
          });
        }
        this.setPlayerTask(pair.entry, 'open-site', 'regulation', 'execute-commit');
        this.setPlayerTask(pair.trade, 'trade-entry', 'regulation', 'execute-commit');
        if (canOverrideEntry) {
          this.setBehavior(pair.entry, 'advance', 5, 'execute-entry', pair.entry.behaviorTarget);
        }
        if (canOverrideTrade) {
          this.setBehavior(pair.trade, 'advance', 5, 'trade-follow', pair.entry.position);
        }
      }
    }

    const lurk = this.rolePlayer(this.attackerTeamId, 'lurk');
    if (
      lurk
      && lurk.behaviorLockUntilTick <= this.tick
      && lurk.id !== this.objectiveRunnerId
      && this.visibleEnemies(lurk).length === 0
      && this.tick >= 28
    ) {
      this.setPlayerTask(
        lurk,
        forceObjectiveTempo ? 'force-site-commit' : 'cut-rotation',
        'regulation',
        forceObjectiveTempo ? 'must-attempt-round' : 'role-discipline'
      );
      this.setBehavior(
        lurk,
        forceObjectiveTempo ? 'advance' : 'walk',
        5,
        forceObjectiveTempo ? 'must-attempt-round' : 'lurk-control',
        lurk.behaviorTarget
      );
    }

    const anchor = this.rolePlayer(this.defenderTeamId, 'anchor');
    if (
      anchor
      && anchor.behaviorLockUntilTick <= this.tick
      && this.routeProgress(anchor) >= 0.5
      && this.visibleEnemies(anchor).length === 0
      && this.knownEnemies(anchor).every(entry => entry.memory.confidence < 0.66)
    ) {
      this.setPlayerTask(anchor, 'site-anchor', 'regulation', 'role-discipline');
      this.setBehavior(anchor, 'hold', 5, 'anchor-hold', anchor.behaviorTarget);
    }

    for (const awper of this.players.filter(player =>
      player.alive && player.roundRole === 'awp'
    )) {
      if (forceObjectiveTempo && awper.teamId === this.attackerTeamId) continue;
      const openingAngleExpired = this.executeState.status === 'committed'
        || this.tick / Math.max(1, this.maxTick) >= 0.58
        || Number.isFinite(awper.awpCommitReleasedTick);
      if (
        openingAngleExpired
        || awper.behaviorLockUntilTick > this.tick
        || awper.id === this.objectiveRunnerId
        || this.routeProgress(awper) < 0.48
        || this.visibleEnemies(awper).length > 0
      ) {
        continue;
      }
      this.setPlayerTask(awper, 'long-angle', 'regulation', 'role-discipline');
      this.setBehavior(
        awper,
        'hold',
        5,
        'awp-angle',
        awper.awpWatch || awper.behaviorTarget
      );
    }
  }

  utilityDecisionContext(utility, owner) {
    const allies = this.players.filter(player => player.alive && player.teamId === owner.teamId);
    const enemies = this.players.filter(player => player.alive && player.teamId !== owner.teamId);
    const objectiveTarget = this.roundPhase.phase === 'postplant'
      && this.roundPhase.plantPosition
      ? this.roundPhase.plantPosition
      : utility;
    const intel = [];

    for (const enemy of enemies) {
      let best = null;
      for (const ally of allies) {
        const memory = this.memory.get(this.pairKey(ally, enemy));
        if (!memory || memory.confidence <= 0.08) continue;
        if (!best || memory.confidence > best.confidence) best = memory;
      }
      if (!best) continue;
      const targetDistance = distance(best, objectiveTarget);
      if (targetDistance > 13.5) continue;
      intel.push({
        enemy,
        ...best,
        targetDistance
      });
    }
    intel.sort((first, second) => second.confidence - first.confidence);
    const visibleEnemyIds = new Set();
    for (const ally of allies) {
      for (const enemy of enemies) {
        const visibleFor = this.visibleTicks.get(this.pairKey(ally, enemy)) || 0;
        if (visibleFor >= this.reactionTicks(ally, enemy)) visibleEnemyIds.add(enemy.id);
      }
    }
    const alliesNearTarget = allies.filter(player =>
      distance(player.position, objectiveTarget) <= 11.5
    ).length;
    const alliesApproaching = allies.filter(player => {
      const range = distance(player.position, objectiveTarget);
      return range > 11.5 && range <= 24 && player.velocity > 0.32;
    }).length;
    const teamUtilityRemaining = allies.reduce(
      (sum, player) => sum + (player.utility || []).length,
      0
    );
    const bestIntel = intel[0] || null;

    return {
      phase: this.roundPhase.phase,
      plantPosition: this.roundPhase.plantPosition,
      postPlantDecision: this.roundPhase.postPlantDecision,
      attackerTeamId: this.attackerTeamId,
      defenderTeamId: this.defenderTeamId,
      ownerDistance: distance(owner.position, objectiveTarget),
      alliesNearTarget,
      alliesApproaching,
      knownEnemiesNearTarget: intel.length,
      visibleEnemies: visibleEnemyIds.size,
      soundOrCallIntel: intel.filter(entry =>
        entry.source === 'sound' || entry.source === 'team-call'
      ).length,
      fakeIntel: intel.filter(entry => entry.fake).length,
      bestIntelConfidence: bestIntel?.confidence || 0,
      bestIntelTarget: bestIntel
        ? { x: bestIntel.x, y: bestIntel.y, z: utility.z }
        : null,
      friendlyFlashRisk: utility.type === 'flash'
        ? allies.filter(player => distance(player.position, objectiveTarget) <= 7.5).length
        : 0,
      teamUtilityRemaining,
      lastTeamUtility: this.lastUtilityByTeam.get(owner.teamId) || null
    };
  }

  utilityPayload(utility) {
    return {
      id: utility.id,
      type: utility.type,
      x: utility.x,
      y: utility.y,
      z: utility.z,
      radius: utility.radius,
      activeUntilTick: utility.activeUntilTick,
      purpose: utility.purpose || 'scheduled',
      callout: utility.callout || null,
      reportSetupId: utility.reportSetupId || null,
      tacticalTiming: utility.tacticalTiming || null,
      decision: utility.decision
    };
  }

  deployContextualUtility(utility, owner) {
    if (!owner) {
      utility.deployed = true;
      utility.cancelled = true;
      return;
    }
    const lastTeamUtility = this.lastUtilityByTeam.get(owner.teamId);
    if (lastTeamUtility && this.tick - lastTeamUtility.tick < 6) {
      utility.nextDecisionTick = lastTeamUtility.tick + 6;
      return;
    }
    const context = this.utilityDecisionContext(utility, owner);
    const decision = evaluateUtilityDecision({
      utility,
      owner,
      tick: this.tick,
      context
    });
    utility.decision = decision;
    if (decision.action === 'cancel') {
      utility.deployed = true;
      utility.cancelled = true;
      return;
    }
    if (decision.action !== 'deploy') {
      utility.nextDecisionTick = this.tick + Math.max(2, decision.retryInTicks || 8);
      return;
    }
    const inventoryIndex = owner.utility?.indexOf(utility.type) ?? -1;
    if (inventoryIndex < 0) {
      utility.deployed = true;
      utility.cancelled = true;
      return;
    }
    owner.utility.splice(inventoryIndex, 1);
    if (decision.target) {
      utility.x = Number(decision.target.x.toFixed(3));
      utility.y = Number(decision.target.y.toFixed(3));
      if (Number.isFinite(decision.target.z)) utility.z = decision.target.z;
    }
    utility.deployed = true;
    utility.deployedTick = this.tick;
    utility.detonateTick = this.tick + 4;
    utility.durationTicks = this.utilityDurationTicks(utility);
    utility.activeFromTick = utility.detonateTick;
    utility.activeUntilTick = utility.detonateTick + utility.durationTicks;
    this.lastUtilityByTeam.set(owner.teamId, {
      tick: this.tick,
      type: utility.type,
      id: utility.id
    });
    this.pendingUtilityEvents.push({
      type: 'utility-decision',
      action: 'deploy',
      utility: this.utilityPayload(utility),
      decision,
      actor: { id: owner.id, name: owner.name, teamId: owner.teamId },
      from: { ...owner.position },
      tick: this.tick
    });
    this.emitSound({
      type: 'utility',
      sourcePlayer: owner,
      position: owner.position,
      visual: false,
      label: utility.type
    });
  }

  processUtilities() {
    for (const utility of this.utilities) {
      const owner = this.players.find(player => player.id === utility.ownerId) || null;
      if (
        utility.contextual
        && !utility.deployed
        && !utility.cancelled
        && this.tick >= utility.nextDecisionTick
      ) {
        this.deployContextualUtility(utility, owner);
      }
      if (
        utility.deployed
        && !utility.cancelled
        && !utility.detonated
        && this.tick >= utility.detonateTick
      ) {
        utility.detonated = true;
        let affected = [];
        if (utility.type === 'flash') affected = this.applyFlash(utility);
        if (utility.type === 'he') affected = this.applyHe(utility);
        if (['molotov', 'incendiary'].includes(utility.type)) {
          affected = this.applyFireTick(utility);
        }
        this.pendingUtilityEvents.push({
          type: 'utility',
          action: 'detonate',
          utility: this.utilityPayload(utility),
          actor: owner
            ? { id: owner.id, name: owner.name, teamId: owner.teamId }
            : null,
          from: owner ? { ...owner.position } : null,
          affected,
          tick: this.tick
        });
      }
      if (
        utility.detonated
        && ['molotov', 'incendiary'].includes(utility.type)
        && this.tick <= utility.activeUntilTick
      ) {
        const damage = this.applyFireTick(utility);
        if (damage.some(entry => entry.killed)) {
          this.pendingUtilityEvents.push({
            type: 'utility',
            action: 'burn',
            utility: this.utilityPayload(utility),
            actor: this.players.find(player => player.id === utility.ownerId) || null,
            from: null,
            affected: damage,
            tick: this.tick
          });
        }
      }
    }
  }

  takeUtilityEvent() {
    return this.pendingUtilityEvents.shift() || null;
  }

  takeGroundEvent() {
    return this.pendingGroundEvents.shift() || null;
  }

  takePendingWorldEvent() {
    const utilityEvent = this.takeUtilityEvent();
    if (utilityEvent) {
      return {
        ...utilityEvent,
        sourceTick: utilityEvent.tick,
        tick: this.tick,
        motionTimeMs: Math.round(this.tick * this.tickMs),
        players: this.snapshot()
      };
    }
    const groundEvent = this.takeGroundEvent();
    if (groundEvent) {
      const players = this.snapshot();
      const sourceActor = (groundEvent.players || [])
        .find(player => player.id === groundEvent.actor?.id);
      const currentActor = players.find(player => player.id === groundEvent.actor?.id);
      return {
        ...groundEvent,
        actorState: sourceActor || currentActor || null,
        sourceTick: groundEvent.tick,
        tick: this.tick,
        motionTimeMs: Math.round(this.tick * this.tickMs),
        players,
        groundItems: groundEvent.groundItems || this.groundInventory.activeItems()
      };
    }
    return null;
  }

  processGroundPickups() {
    if (this.tick % 4 !== 0) return;
    const groundItems = [...this.groundInventory.items.values()]
      .filter(item => item.status === 'ground' && item.availableTick <= this.tick);
    if (!groundItems.length) return;
    const players = this.players
      .filter(player =>
        player.alive
        && !['engage', 'peek', 'retreat'].includes(player.behavior)
        && this.visibleEnemies(player).length === 0
        && this.knownEnemies(player).every(entry => entry.memory.confidence < 0.64)
      )
      .sort((first, second) => second.rating - first.rating);

    for (const player of players) {
      const candidate = groundItems
        .filter(item =>
          item.status === 'ground'
          && distance(player.position, item) <= 3.1
        )
        .map(item => ({
          item,
          score: this.groundInventory.candidateScore(player, item)
        }))
        .filter(entry => entry.score > 0)
        .sort((first, second) => second.score - first.score)[0];
      if (!candidate) continue;
      const pickup = this.groundInventory.pickup(player, candidate.item, this.tick);
      if (!pickup) continue;
      this.pendingGroundEvents.push({
        type: 'ground-pickup',
        ...pickup,
        position: {
          x: candidate.item.x,
          y: candidate.item.y,
          z: candidate.item.z
        },
        groundItems: this.groundInventory.activeItems(),
        players: this.snapshot(),
        tick: this.tick
      });
    }
  }

  advanceOneTick() {
    this.tick += 1;
    this.deliverTeamCalls();
    this.processUtilities();
    if (this.tick % 2 === 0) this.updatePerception();
    if (this.tick % 4 === 0) {
      this.updateBehaviors();
      this.updateTeamTactics();
    }

    for (const player of this.players) {
      if (!player.alive) continue;
      const routeSpeed = BEHAVIOR_SPEEDS[player.behavior] ?? BEHAVIOR_SPEEDS.walk;
      const previousRouteElapsed = player.routeElapsedMs;
      player.lastRouteElapsedMs = previousRouteElapsed;
      player.routeElapsedMs = clamp(
        player.routeElapsedMs + this.tickMs * routeSpeed,
        0,
        this.durationMs
      );
      const position = interpolate(this.motionPlans.get(player.id), player.routeElapsedMs);
      if (!position) continue;
      const previous = { ...player.position };
      const candidate = {
        x: position.x,
        y: position.y,
        z: position.z,
        areaId: position.areaId
      };
      // Motion plans are validated against explicit nav-area adjacency before
      // the round starts. Adjacent nav polygons share a traversable border;
      // re-testing each interpolated point incorrectly blocked tiny authored
      // gaps, stairs and level changes on Dust II.
      player.lastPosition = previous;
      player.position = candidate;
      player.velocity = distance(previous, candidate) / (this.tickMs / 1000);
      const facingLength = Math.hypot(position.next.x - candidate.x, position.next.y - candidate.y);
      if (facingLength > 0.001) {
        player.facing = {
          x: (position.next.x - candidate.x) / facingLength,
          y: (position.next.y - candidate.y) / facingLength
        };
        player.routeFacing = { ...player.facing };
      }
      this.applyBehaviorFacing(player);
    }

    this.resolvePlayerSeparation();
    this.processGroundPickups();
    this.processMovementSounds();
    if (this.tick % 4 === 0 || this.tick === this.maxTick) {
      for (const player of this.players) {
        this.routeSamplesByPlayer.get(player.id)?.push([
          Math.round(this.tick * this.tickMs),
          Math.round(player.routeElapsedMs)
        ]);
      }
    }
    if (this.tick % 2 === 0 || this.tick === this.maxTick) this.recordPositionSamples();
    this.decayMemory();
  }

  resolvePlayerSeparation() {
    const alive = this.players.filter(player => player.alive);
    const blockedThisTick = new Set();
    for (let a = 0; a < alive.length; a += 1) {
      for (let b = a + 1; b < alive.length; b += 1) {
        const first = alive[a];
        const second = alive[b];
        const verticalSeparation = Math.abs(
          Number(first.position.z || 0) - Number(second.position.z || 0)
        );
        // Dust II Mid/Short ve Tunnels/B gibi üst üste binen katlar radarda
        // aynı X/Y noktasını paylaşabilir. Farklı kattaki oyuncular birbirini
        // fiziksel olarak bloke etmez.
        if (verticalSeparation > 48) continue;
        const minimum = first.radius + second.radius;
        if (distance(first.position, second.position) >= minimum) continue;
        const teammates = first.teamId === second.teamId;
        if (
          teammates
          && (
            first.teammatePassThroughUntilTick > this.tick
            || second.teammatePassThroughUntilTick > this.tick
          )
        ) {
          continue;
        }
        if (!teammates) {
          const previousSeparation = distance(first.lastPosition, second.lastPosition);
          if (previousSeparation >= minimum) {
            first.position = { ...first.lastPosition };
            first.routeElapsedMs = first.lastRouteElapsedMs;
            first.velocity = 0;
            second.position = { ...second.lastPosition };
            second.routeElapsedMs = second.lastRouteElapsedMs;
            second.velocity = 0;
            continue;
          }

          // İki rakip dar bir objective girişinde zaten iç içe doğmuşsa
          // geçmiş konuma dönmek ikisini de aynı noktada sonsuza dek tutar.
          // Bu yakın temas artık hareketi durdurup iki tarafı birbirine
          // döndürür; görüş reaksiyonu birikince normal çatışma motoru çözer.
          for (const [player, opponent] of [[first, second], [second, first]]) {
            player.velocity = 0;
            player.facing = {
              x: opponent.position.x - player.position.x,
              y: opponent.position.y - player.position.y
            };
            if (player.behaviorSource !== 'defuse-active') {
              this.setBehavior(player, 'engage', 12, 'return-fire', opponent);
            }
          }
          continue;
        }
        let blocked;
        if (teammates && this.objectiveRunnerId === first.id) blocked = second;
        else if (teammates && this.objectiveRunnerId === second.id) blocked = first;
        else if (teammates) {
          blocked = this.routeProgress(first) <= this.routeProgress(second) ? first : second;
        } else {
          blocked = first.velocity <= second.velocity ? first : second;
        }
        if (teammates) {
          blocked.teammateBlockedTicks = (blocked.teammateBlockedTicks || 0) + 1;
          if (blocked.teammateBlockedTicks >= 8) {
            blocked.teammateBlockedTicks = 0;
            blocked.teammatePassThroughUntilTick = this.tick + 8;
            continue;
          }
          blockedThisTick.add(blocked.id);
        }
        blocked.position = { ...blocked.lastPosition };
        blocked.routeElapsedMs = blocked.lastRouteElapsedMs;
        blocked.velocity = 0;
      }
    }
    for (const player of alive) {
      if (!blockedThisTick.has(player.id) && player.teammatePassThroughUntilTick <= this.tick) {
        player.teammateBlockedTicks = 0;
      }
    }
  }

  behaviorDuration(minTicks, maxTicks) {
    return minTicks + Math.floor(this.random() * (maxTicks - minTicks + 1));
  }

  recordBehavior(player) {
    this.behaviorTimeline.push({
      id: player.id,
      tick: this.tick,
      atMs: Math.round(this.tick * this.tickMs),
      routeElapsedMs: Math.round(player.routeElapsedMs),
      state: player.behavior,
      source: player.behaviorSource,
      targetId: player.behaviorTarget?.id || null,
      targetX: Number.isFinite(player.behaviorTarget?.x)
        ? Number(player.behaviorTarget.x.toFixed(3))
        : null,
      targetY: Number.isFinite(player.behaviorTarget?.y)
        ? Number(player.behaviorTarget.y.toFixed(3))
        : null,
      infoConfidence: Number.isFinite(player.behaviorTarget?.confidence)
        ? Number(player.behaviorTarget.confidence.toFixed(3))
        : null,
      infoFake: Boolean(player.behaviorTarget?.fake),
      soundType: player.behaviorTarget?.soundType || null
    });
  }

  setBehavior(player, state, durationTicks, source, target = null) {
    const targetId = target?.id || null;
    const changed = player.behavior !== state
      || player.behaviorSource !== source
      || (player.behaviorTarget?.id || null) !== targetId;
    player.behavior = state;
    player.behaviorSource = source;
    player.behaviorTarget = target;
    player.behaviorUntilTick = this.tick + Math.max(1, durationTicks);
    if (changed) this.recordBehavior(player);
  }

  lockBehavior(player, state, untilTick, source, target = null) {
    if (!player?.alive) return false;
    player.behaviorLockUntilTick = Math.max(this.tick + 1, untilTick);
    player.behaviorLockState = state;
    player.behaviorLockSource = source;
    player.behaviorLockTarget = target;
    this.setBehavior(
      player,
      state,
      player.behaviorLockUntilTick - this.tick,
      source,
      target
    );
    return true;
  }

  unlockBehavior(player) {
    if (!player) return;
    player.behaviorLockUntilTick = 0;
    player.behaviorLockState = null;
    player.behaviorLockSource = null;
    player.behaviorLockTarget = null;
  }

  visibleEnemies(player) {
    return this.players
      .filter(target =>
        target.alive
        && target.teamId !== player.teamId
        && (this.visibleTicks.get(this.pairKey(player, target)) || 0) > 0
      )
      .sort((first, second) =>
        distance(player.position, first.position) - distance(player.position, second.position)
      );
  }

  knownEnemies(player) {
    const known = [];
    for (const target of this.players) {
      if (!target.alive || target.teamId === player.teamId) continue;
      const memory = this.memory.get(this.pairKey(player, target));
      if (!memory || memory.confidence <= 0.08) continue;
      known.push({ target, memory });
    }
    known.sort((first, second) => {
      const confidenceDelta = second.memory.confidence - first.memory.confidence;
      if (Math.abs(confidenceDelta) > 0.08) return confidenceDelta;
      return distance(player.position, first.memory) - distance(player.position, second.memory);
    });
    return known;
  }

  behaviorTarget(target, point = target?.position) {
    if (!target || !point) return null;
    return {
      id: target.id,
      x: point.x,
      y: point.y,
      confidence: Number.isFinite(point.confidence) ? point.confidence : null,
      fake: Boolean(point.fake),
      soundType: point.soundType || null
    };
  }

  updateBehaviors() {
    for (const player of this.players) {
      if (!player.alive) continue;
      this.updateBehavior(player);
    }
  }

  updateBehavior(player) {
    if (player.id === this.objectiveRunnerId) {
      this.setBehavior(
        player,
        'advance',
        4,
        this.objectiveSource || 'objective',
        this.objectiveTarget
      );
      return;
    }
    if (player.behaviorLockUntilTick > this.tick) {
      this.setBehavior(
        player,
        player.behaviorLockState || 'hold',
        player.behaviorLockUntilTick - this.tick,
        player.behaviorLockSource || 'locked',
        player.behaviorLockTarget || player.behaviorTarget
      );
      return;
    }
    if (player.behaviorLockUntilTick) this.unlockBehavior(player);
    const mustPushObjective = this.roundPhase.phase === 'regulation'
      && this.roundPhase.forceObjectiveTempo
      && player.teamId === this.attackerTeamId;
    const visible = this.visibleEnemies(player);
    if (visible.length) {
      const target = visible[0];
      const targetPoint = this.behaviorTarget(target);
      const nearbyAllies = this.players.filter(candidate =>
        candidate.alive
        && candidate.teamId === player.teamId
        && candidate !== player
        && distance(candidate.position, player.position) <= 9
      ).length;
      const outnumbered = visible.length >= 2 && nearbyAllies + 1 < visible.length;
      const healthPressure = 1 - clamp(player.health / 100, 0, 1);
      const criticallyHurt = player.health <= 38;
      const retreatChance = clamp(
        0.26
          + visible.length * 0.08
          + healthPressure * 0.56
          - (player.rating - 60) / 220,
        0.18,
        0.9
      );

      if (
        !mustPushObjective
        &&
        player.behavior === 'retreat'
        && this.tick < player.behaviorUntilTick
      ) {
        player.behaviorTarget = targetPoint;
        return;
      }

      if (
        !mustPushObjective
        && (outnumbered || criticallyHurt)
        && this.random() < retreatChance
      ) {
        this.setBehavior(
          player,
          'retreat',
          this.behaviorDuration(criticallyHurt ? 18 : 10, criticallyHurt ? 32 : 20),
          'vision',
          targetPoint
        );
        return;
      }

      this.setBehavior(
        player,
        'engage',
        this.behaviorDuration(6, 12),
        'vision',
        targetPoint
      );
      return;
    }

    if (
      !mustPushObjective
      && player.behavior === 'retreat'
      && this.tick < player.behaviorUntilTick
    ) return;

    // Round basinda oyuncular daha kendi cikis koridorundayken uzak bir ses,
    // takim cagrisi veya rutin aci kontrolu yuzunden durmamalidir. Dogrudan
    // gorus temasi yukarida cozulur; temas yoksa CT raporla belirlenen ilk
    // savunma noktasina, T ise T Spawn cikisina kadar kosmaya devam eder.
    const openingProgress = this.routeProgress(player);
    const openingSprintThreshold = player.teamId === this.defenderTeamId ? 0.54 : 0.27;
    if (
      this.roundPhase.phase === 'regulation'
      && openingProgress < openingSprintThreshold
    ) {
      this.setBehavior(
        player,
        'advance',
        4,
        player.teamId === this.defenderTeamId ? 'ct-opening-sprint' : 't-opening-exit',
        null
      );
      return;
    }

    const known = this.knownEnemies(player);
    if (known.length) {
      const { target, memory } = known[0];
      const lastKnownTarget = this.behaviorTarget(target, memory);
      if (mustPushObjective) {
        this.setBehavior(
          player,
          'advance',
          this.behaviorDuration(6, 10),
          'must-attempt-intel',
          lastKnownTarget
        );
        return;
      }
      if (
        this.tick < player.behaviorUntilTick
        && ['investigate', 'hold', 'peek'].includes(player.behavior)
        && (player.behaviorTarget?.id || null) === target.id
      ) {
        player.behaviorTarget = lastKnownTarget;
        return;
      }

      const lastKnownDistance = distance(player.position, memory);
      if (lastKnownDistance <= 9.5) {
        if (player.behavior === 'hold') {
          this.setBehavior(
            player,
            'peek',
            this.behaviorDuration(4, 7),
            memory.source,
            lastKnownTarget
          );
        } else {
          this.setBehavior(
            player,
            'hold',
            this.behaviorDuration(4, 9),
            memory.source,
            lastKnownTarget
          );
        }
      } else {
        this.setBehavior(
          player,
          'investigate',
          this.behaviorDuration(10, 18),
          memory.source,
          lastKnownTarget
        );
      }
      return;
    }

    player.behaviorTarget = null;
    if (
      mustPushObjective
      && ['hold', 'peek', 'retreat'].includes(player.behavior)
    ) {
      this.setBehavior(player, 'advance', 8, 'must-attempt-round');
      return;
    }
    if (this.tick < player.behaviorUntilTick) return;

    if (player.behavior === 'hold') {
      this.setBehavior(player, 'peek', this.behaviorDuration(5, 9), 'angle-check');
      return;
    }
    if (['peek', 'retreat', 'engage'].includes(player.behavior)) {
      player.nextAngleCheckTick = this.tick + this.behaviorDuration(30, 55);
      this.setBehavior(player, 'walk', this.behaviorDuration(12, 22), 'route');
      return;
    }

    const route = this.motionPlans.get(player.id) || [];
    const routeEnd = route[route.length - 1]?.t || this.durationMs;
    if (player.routeElapsedMs >= routeEnd - 120) {
      this.setBehavior(player, 'hold', this.behaviorDuration(18, 32), 'position');
      return;
    }

    if (!mustPushObjective && this.tick >= player.nextAngleCheckTick) {
      player.nextAngleCheckTick = this.tick + this.behaviorDuration(38, 70);
      this.setBehavior(player, 'hold', this.behaviorDuration(4, 8), 'angle-check');
      return;
    }

    const routeRemainingMs = Math.max(0, routeEnd - player.routeElapsedMs);
    const silentApproach = this.roundPhase.phase === 'regulation'
      && routeRemainingMs <= 2400
      && !player.lastHeardSound?.fake;
    if (silentApproach && !mustPushObjective) {
      this.setBehavior(
        player,
        'walk',
        this.behaviorDuration(12, 24),
        'silent-approach'
      );
      return;
    }

    const earlyRound = this.tick < 40;
    this.setBehavior(
      player,
      earlyRound ? 'advance' : 'walk',
      this.behaviorDuration(12, 24),
      'route'
    );
  }

  applyBehaviorFacing(player) {
    const target = player.behaviorTarget
      || (
        player.awpWatch && ['hold', 'peek'].includes(player.behavior)
          ? player.awpWatch
          : null
      );
    if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
      const dx = target.x - player.position.x;
      const dy = target.y - player.position.y;
      const length = Math.hypot(dx, dy);
      if (length >= 0.001) player.facing = { x: dx / length, y: dy / length };
      return;
    }
    if (player.side === 'CT' && ['hold', 'peek'].includes(player.behavior)) {
      player.facing = {
        x: -player.routeFacing.x,
        y: -player.routeFacing.y
      };
    }
  }

  advancePlayerToObjective(player, target, radius = 1.35) {
    if (!player?.alive || !target) return Infinity;
    const route = this.motionPlans.get(player.id) || [];
    const routeEndMs = route[route.length - 1]?.t || player.routeElapsedMs;
    const routeRemainingMs = Math.max(0, routeEndMs - player.routeElapsedMs);
    const worldRemainingMs = Math.max(0, (this.maxTick - this.tick) * this.tickMs);
    if (
      player.behaviorLockSource === 'utility-fire'
      && player.inFireUntilTick <= this.tick
    ) {
      this.unlockBehavior(player);
    }
    if (worldRemainingMs < routeRemainingMs + 2400) {
      const extensionMs = routeRemainingMs + 2400 - worldRemainingMs;
      this.maxTick += Math.ceil(extensionMs / this.tickMs);
      this.durationMs = this.maxTick * this.tickMs;
    }
    this.setObjectivePriority(player, target, 'objective');

    for (let attempt = 0; attempt < 3 && distance(player.position, target) > radius; attempt += 1) {
      while (
        this.tick < this.maxTick
        && distance(player.position, target) > radius
      ) {
        this.advanceOneTick();
      }
      if (distance(player.position, target) > radius && attempt < 2) {
        this.extendRound(1400);
      }
    }

    const remaining = distance(player.position, target);
    this.clearObjectivePriority(player);
    return remaining;
  }

  setObjectivePriority(player, target, source = 'objective') {
    if (!player?.alive || !target) return false;
    this.objectiveRunnerId = player.id;
    this.objectiveTarget = {
      id: `${source}-${player.id}`,
      x: target.x,
      y: target.y
    };
    this.objectiveSource = source;
    this.setBehavior(player, 'advance', 4, source, this.objectiveTarget);
    return true;
  }

  clearObjectivePriority(player = null) {
    if (player && this.objectiveRunnerId !== player.id) return;
    this.objectiveRunnerId = null;
    this.objectiveTarget = null;
    this.objectiveSource = 'objective';
  }

  pairKey(observer, target) {
    return `${observer.id}:${target.id}`;
  }

  withinFieldOfView(observer, target, halfAngleDegrees = 82) {
    const dx = target.position.x - observer.position.x;
    const dy = target.position.y - observer.position.y;
    const length = Math.hypot(dx, dy);
    if (!length) return true;
    const dot = observer.facing.x * (dx / length) + observer.facing.y * (dy / length);
    return dot >= Math.cos(halfAngleDegrees * Math.PI / 180);
  }

  reactionTicks(observer, target) {
    const rangePenalty = distance(observer.position, target.position) > 18 ? 2 : 0;
    return clamp(7 - Math.floor((observer.rating - 55) / 9) + rangePenalty, 2, 8);
  }

  traceForPair(observer, target) {
    const activeSmokes = this.activeSmokes();
    const smokePhase = activeSmokes.map(smoke => smoke.id).sort().join(',') || 'clear';
    if (smokePhase !== this.lineOfSightSmokePhase) {
      this.lineOfSightSmokePhase = smokePhase;
      this.lineOfSightCache.clear();
    }
    const scopedLongRange = ['AWP', 'SSG 08'].includes(observer.weapon);
    const maxDistance = scopedLongRange ? 52 : 34;
    const maxVerticalDelta = scopedLongRange
      ? (observer.awpMaxVerticalDelta || 150)
      : 95;
    const firstArea = observer.position.areaId || 0;
    const secondArea = target.position.areaId || 0;
    const areaPair = firstArea < secondArea
      ? `${firstArea}:${secondArea}`
      : `${secondArea}:${firstArea}`;
    const key = `${areaPair}:${scopedLongRange ? `scoped-${maxVerticalDelta}` : 'standard'}`;
    if (!this.lineOfSightCache.has(key)) {
      const trace = traceLineOfSight(observer.position, target.position, {
        smokes: [],
        maxDistance,
        maxVerticalDelta
      });
      if (trace.reason !== 'range') this.lineOfSightCache.set(key, trace);
    }
    const staticTrace = this.lineOfSightCache.get(key)
      || traceLineOfSight(observer.position, target.position, {
        smokes: [],
        maxDistance,
        maxVerticalDelta
      });
    if (!staticTrace.visible) return staticTrace;
    const blockingSmoke = activeSmokes.find(smoke =>
      distanceToSegment(smoke, observer.position, target.position)
        <= (smoke.radius || 4.7)
    );
    if (blockingSmoke) {
      return {
        visible: false,
        reason: 'smoke',
        distance: staticTrace.distance,
        collisionMesh: true,
        smokeId: blockingSmoke.id
      };
    }
    return staticTrace;
  }

  scheduleTeamCall(reporter, target, memory) {
    if (!reporter?.alive || !target?.alive || !memory) return 0;
    const cooldownKey = this.pairKey(reporter, target);
    const lastCallTick = this.teamCallCooldown.get(cooldownKey) ?? -Infinity;
    if (this.tick - lastCallTick < 22) return 0;
    this.teamCallCooldown.set(cooldownKey, this.tick);

    const soundType = memory.soundType || 'run';
    let scheduled = 0;
    for (const teammate of this.players) {
      if (!teammate.alive || teammate === reporter || teammate.teamId !== reporter.teamId) {
        continue;
      }
      const delay = teamCallDelay(soundType, this.random)
        + Math.floor(distance(reporter.position, teammate.position) / 14);
      this.pendingTeamCalls.push({
        reporterId: reporter.id,
        receiverId: teammate.id,
        targetId: target.id,
        createdTick: this.tick,
        deliverTick: this.tick + Math.max(1, delay),
        x: memory.x,
        y: memory.y,
        z: memory.z || target.position.z || 0,
        confidence: clamp(memory.confidence * 0.78, 0.14, 0.88),
        soundType,
        fake: Boolean(memory.fake),
        maxAgeTicks: Math.max(18, Math.round((memory.maxAgeTicks || 48) * 0.82))
      });
      scheduled += 1;
    }
    return scheduled;
  }

  deliverTeamCalls() {
    if (!this.pendingTeamCalls.length) return;
    const remaining = [];
    for (const call of this.pendingTeamCalls) {
      if (call.deliverTick > this.tick) {
        remaining.push(call);
        continue;
      }
      const receiver = this.players.find(player => player.id === call.receiverId);
      const reporter = this.players.find(player => player.id === call.reporterId);
      const target = this.players.find(player => player.id === call.targetId);
      // Çağrı çıktıktan sonra raporlayan oyuncu ölse bile söylenmiş bilgi yok olmaz.
      if (!receiver?.alive || !reporter || !target?.alive) continue;
      const memory = this.rememberPosition(
        receiver,
        target,
        'team-call',
        call.confidence,
        call,
        {
          soundType: call.soundType,
          fake: call.fake,
          maxAgeTicks: call.maxAgeTicks,
          reporterId: reporter.id,
          delayTicks: this.tick - call.createdTick
        }
      );
      this.informationTimeline.push({
        type: 'team-call',
        tick: this.tick,
        atMs: Math.round(this.tick * this.tickMs),
        reporterId: reporter.id,
        receiverId: receiver.id,
        targetId: target.id,
        confidence: Number(call.confidence.toFixed(3)),
        resultingConfidence: Number(memory.confidence.toFixed(3)),
        soundType: call.soundType,
        delayTicks: this.tick - call.createdTick,
        fake: call.fake,
        corrected: Boolean(memory.corrected)
      });
    }
    this.pendingTeamCalls = remaining;
  }

  emitSound({
    type,
    sourcePlayer,
    position = sourcePlayer?.position,
    fake = false,
    visual = false,
    share = true,
    label = null
  }) {
    if (!sourcePlayer || !position) return null;
    const profile = getSoundProfile(type);
    const heardBy = [];

    for (const observer of this.players) {
      if (!observer.alive || observer.teamId === sourcePlayer.teamId) continue;
      const range = distance(observer.position, position);
      const directTrace = traceLineOfSight(observer.position, position, {
        smokes: [],
        maxDistance: profile.radius * 1.2,
        maxVerticalDelta: 160
      });
      const hearing = evaluateHearing({
        type,
        distance: range,
        observerRating: observer.rating,
        occluded: !directTrace.visible,
        fake,
        rng: this.random
      });
      if (!hearing.heard) continue;
      const estimate = estimateSoundPosition(position, hearing.errorRadius, this.random);
      const memory = this.rememberPosition(
        observer,
        sourcePlayer,
        'sound',
        hearing.confidence,
        estimate,
        {
          soundType: type,
          fake,
          maxAgeTicks: hearing.maxAgeTicks,
          occluded: !directTrace.visible
        }
      );
      observer.lastHeardSound = {
        type,
        tick: this.tick,
        confidence: memory.confidence,
        fake
      };
      const callsScheduled = share && memory.confidence > 0.08
        ? this.scheduleTeamCall(observer, sourcePlayer, memory)
        : 0;
      heardBy.push({
        id: observer.id,
        teamId: observer.teamId,
        distance: Number(range.toFixed(2)),
        // Bu alan o an duyulan sesin güvenidir. Hafızadaki çelişkili eski
        // bilgi ayrı olarak sıfıra kadar zayıflayabilir.
        confidence: Number(hearing.confidence.toFixed(3)),
        resultingConfidence: Number(memory.confidence.toFixed(3)),
        estimatedX: memory.x,
        estimatedY: memory.y,
        occluded: !directTrace.visible,
        callsScheduled
      });
    }

    const record = {
      id: `sound-${this.tick}-${this.soundTimeline.length + 1}`,
      type,
      label,
      tick: this.tick,
      atMs: Math.round(this.tick * this.tickMs),
      sourceId: sourcePlayer.id,
      sourceTeamId: sourcePlayer.teamId,
      position: {
        x: Number(position.x.toFixed(3)),
        y: Number(position.y.toFixed(3)),
        z: Number(position.z || 0)
      },
      fake,
      radius: profile.radius,
      heardBy,
      directHearers: heardBy.length
    };
    const isMovementSound = type === 'run' || type === 'walk';
    const recordKey = `${sourcePlayer.id}:${type}`;
    const lastRecordedTick = this.lastRecordedSoundTick.get(recordKey) ?? -Infinity;
    const shouldRecord = !isMovementSound
      || heardBy.length > 0 && this.tick - lastRecordedTick >= 30;
    if (shouldRecord) {
      this.soundTimeline.push(record);
      this.lastRecordedSoundTick.set(recordKey, this.tick);
    }
    if (visual) {
      this.pendingUtilityEvents.push({
        type: 'sound-cue',
        sound: record,
        actor: {
          id: sourcePlayer.id,
          name: sourcePlayer.name,
          teamId: sourcePlayer.teamId
        },
        tick: this.tick
      });
    }
    return record;
  }

  processMovementSounds() {
    for (const player of this.players) {
      if (!player.alive || player.velocity <= 0.12) continue;
      const soundType = player.behavior === 'walk' ? 'walk' : 'run';
      const interval = soundType === 'walk' ? 28 : 14;
      // Koşudan sessiz yürüyüşe geçiş ilk yürüme adımını eski koşu
      // kadansıyla bastırmamalı; iki hareket tipinin saatini ayrı tut.
      const cadenceKey = `${player.id}:${soundType}`;
      const lastTick = this.lastFootstepTick.get(cadenceKey) ?? -Infinity;
      if (this.tick - lastTick < interval) continue;
      this.lastFootstepTick.set(cadenceKey, this.tick);
      this.emitSound({
        type: soundType,
        sourcePlayer: player,
        visual: false,
        share: soundType === 'run'
      });
    }
  }

  updatePerception() {
    const alive = this.players.filter(player => player.alive);
    for (const observer of alive) {
      if (observer.blindedUntilTick > this.tick) {
        for (const target of alive) {
          if (observer.teamId !== target.teamId) {
            this.visibleTicks.set(this.pairKey(observer, target), 0);
          }
        }
        continue;
      }
      for (const target of alive) {
        if (observer.teamId === target.teamId) continue;
        const key = this.pairKey(observer, target);
        const trace = this.withinFieldOfView(observer, target)
          ? this.traceForPair(observer, target)
          : { visible: false, reason: 'fov', collisionMesh: true };
        const los = trace.visible;

        if (los) {
          const ticks = (this.visibleTicks.get(key) || 0) + 2;
          this.visibleTicks.set(key, ticks);
          const memory = this.remember(observer, target, 'vision', 1);
          if (ticks >= this.reactionTicks(observer, target)) {
            this.scheduleTeamCall(observer, target, memory);
          }
        } else {
          this.visibleTicks.set(key, 0);
        }
      }
    }
  }

  rememberPosition(observer, target, source, confidence, position, metadata = {}) {
    const key = this.pairKey(observer, target);
    const incoming = {
      targetId: target.id,
      source,
      confidence,
      tick: this.tick,
      x: Number(position.x.toFixed(3)),
      y: Number(position.y.toFixed(3)),
      z: Number(position.z || target.position.z || 0),
      soundType: metadata.soundType || null,
      fake: Boolean(metadata.fake),
      maxAgeTicks: metadata.maxAgeTicks || (
        source === 'vision' ? 92 : source === 'team-call' ? 58 : 38
      ),
      occluded: Boolean(metadata.occluded),
      reporterId: metadata.reporterId || null,
      delayTicks: metadata.delayTicks || 0
    };
    const memory = fuseIntel(this.memory.get(key), incoming);
    this.memory.set(key, memory);
    return memory;
  }

  remember(observer, target, source, confidence, metadata = {}) {
    const error = source === 'team-call' ? 0.65 : 0;
    return this.rememberPosition(
      observer,
      target,
      source,
      confidence,
      {
        x: target.position.x + (this.random() - 0.5) * error * 2,
        y: target.position.y + (this.random() - 0.5) * error * 2,
        z: target.position.z || 0
      },
      metadata
    );
  }

  decayMemory() {
    for (const [key, memory] of this.memory) {
      const age = this.tick - memory.tick;
      const maxAge = memory.maxAgeTicks
        || (memory.source === 'vision' ? 92 : memory.source === 'team-call' ? 64 : 38);
      memory.confidence = Math.max(0, memory.confidence - 1 / maxAge);
      if (age > maxAge || memory.confidence <= 0) this.memory.delete(key);
    }
  }

  eligibleContact(observer, target) {
    if (observer.behaviorSource === 'defuse-active') return null;
    if (observer.blindedUntilTick > this.tick) return null;
    const key = this.pairKey(observer, target);
    const visibleFor = this.visibleTicks.get(key) || 0;
    if (visibleFor < this.reactionTicks(observer, target)) return null;
    if (!['engage', 'peek', 'hold'].includes(observer.behavior)) return null;
    const trace = this.traceForPair(observer, target);
    if (!trace.visible) return null;
    return {
      source: 'vision',
      los: true,
      collisionMesh: trace.collisionMesh,
      testedTriangles: trace.testedTriangles || 0,
      behavior: observer.behavior,
      behaviorSource: observer.behaviorSource,
      visibleForMs: Math.round(visibleFor * this.tickMs),
      distance: Number(distance(observer.position, target.position).toFixed(2)),
      lastKnown: this.memory.get(key) || null
    };
  }

  findContact(killerTeamId, killerCandidates, victimCandidates, preferredKiller, preferredVictim) {
    const killers = killerCandidates
      .map(char => this.players.find(player => player.char === char))
      .filter(player => player?.alive && player.teamId === killerTeamId);
    const victims = victimCandidates
      .map(char => this.players.find(player => player.char === char))
      .filter(player => player?.alive && player.teamId !== killerTeamId);

    const scored = [];
    for (const killer of killers) {
      for (const victim of victims) {
        const perception = this.eligibleContact(killer, victim);
        if (!perception) continue;
        let score = 100 - perception.distance;
        if (killer.char === preferredKiller) score += 18;
        if (victim.char === preferredVictim) score += 12;
        score += killer.rating * 0.08;
        score += killer.health * 0.12;
        score -= (100 - killer.health) * 0.08;
        scored.push({ killer, victim, perception, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0] || null;
  }

  findAnyContact(team1Candidates, team2Candidates) {
    const first = this.findContact(1, team1Candidates, team2Candidates);
    const second = this.findContact(2, team2Candidates, team1Candidates);
    if (!first) return second;
    if (!second) return first;

    const firstVisible = this.visibleTicks.get(this.pairKey(first.killer, first.victim)) || 0;
    const secondVisible = this.visibleTicks.get(this.pairKey(second.killer, second.victim)) || 0;
    const contactScore = contact => (
      contact.killer.rating * 0.42
      + contact.killer.health * 0.18
      - contact.perception.distance * 0.55
      + (contact.perception.behavior === 'peek' ? 2.5 : 0)
      + (contact.perception.behavior === 'hold' ? 1.5 : 0)
    );
    const firstScore = contactScore(first) + firstVisible * 0.75;
    const secondScore = contactScore(second) + secondVisible * 0.75;
    const firstChance = clamp(
      0.5 + (firstScore - secondScore) / 55,
      0.18,
      0.82
    );
    return this.random() < firstChance ? first : second;
  }

  plantReady(
    attackerTeamId,
    plantTarget,
    radius = 1.8,
    eligiblePlanterIds = null,
    plantEligibility = null
  ) {
    if (!plantTarget) return null;
    return this.players
      .filter(player =>
        player.alive
        && player.teamId === attackerTeamId
        && (!eligiblePlanterIds || eligiblePlanterIds.includes(player.id))
        && distance(player.position, plantTarget) <= radius
        && (!plantEligibility || plantEligibility(player))
      )
      .sort((first, second) =>
        distance(first.position, plantTarget) - distance(second.position, plantTarget)
      )[0] || null;
  }

  advanceUntilRoundEvent({
    team1Candidates,
    team2Candidates,
    attackerTeamId,
    plantTarget,
    canPlant = false,
    eligiblePlanterIds = null,
    plantEligibility = null,
    defenderTeamId = null,
    defuseTarget = null,
    canDefuse = false,
    eligibleDefuserIds = null,
    defuseEligibility = null,
    timerTick = null
  }) {
    const alreadyPending = this.takePendingWorldEvent();
    if (alreadyPending) return alreadyPending;
    while (this.tick < this.maxTick) {
      this.advanceOneTick();
      const pending = this.takePendingWorldEvent();
      if (pending) return pending;
      if (canPlant) {
        const planter = this.plantReady(
          attackerTeamId,
          plantTarget,
          1.8,
          eligiblePlanterIds,
          plantEligibility
        );
        if (planter) {
          return {
            type: 'plant-ready',
            actor: planter.char,
            teamId: attackerTeamId,
            tick: this.tick,
            motionTimeMs: Math.round(this.tick * this.tickMs),
            players: this.snapshot()
          };
        }
      }

      const contact = this.findAnyContact(team1Candidates, team2Candidates);
      if (contact) {
        return {
          type: 'contact',
          killer: contact.killer.char,
          victim: contact.victim.char,
          killerTeamId: contact.killer.teamId,
          perception: contact.perception,
          tick: this.tick,
          motionTimeMs: Math.round(this.tick * this.tickMs),
          players: this.snapshot()
        };
      }
      if (canDefuse && defenderTeamId && defuseTarget) {
        const defuser = this.plantReady(
          defenderTeamId,
          defuseTarget,
          2.2,
          eligibleDefuserIds,
          defuseEligibility
        );
        if (defuser) {
          return {
            type: 'defuse-ready',
            actor: defuser.char,
            teamId: defenderTeamId,
            tick: this.tick,
            motionTimeMs: Math.round(this.tick * this.tickMs),
            players: this.snapshot()
          };
        }
      }
      if (Number.isFinite(timerTick) && this.tick >= timerTick) {
        return {
          type: 'timer-expired',
          tick: this.tick,
          motionTimeMs: Math.round(this.tick * this.tickMs),
          players: this.snapshot()
        };
      }
    }
    return {
      type: 'time-expired',
      tick: this.tick,
      motionTimeMs: Math.round(this.tick * this.tickMs),
      players: this.snapshot()
    };
  }

  extendRound(extraDurationMs) {
    const extraTicks = Math.max(1, Math.ceil(extraDurationMs / this.tickMs));
    this.maxTick = Math.max(this.maxTick, this.tick + extraTicks);
    this.durationMs = this.maxTick * this.tickMs;
  }

  advanceTicks(count) {
    const targetTick = Math.min(this.maxTick, this.tick + Math.max(0, count));
    while (this.tick < targetTick) this.advanceOneTick();
    return this.snapshot();
  }

  advanceUntilContact(options) {
    while (this.tick < this.maxTick) {
      this.advanceOneTick();
      const contact = this.findContact(
        options.killerTeamId,
        options.killerCandidates,
        options.victimCandidates,
        options.preferredKiller,
        options.preferredVictim
      );
      if (contact) {
        return {
          killer: contact.killer.char,
          victim: contact.victim.char,
          perception: contact.perception,
          tick: this.tick,
          motionTimeMs: Math.round(this.tick * this.tickMs),
          players: this.snapshot()
        };
      }
    }
    return null;
  }

  markDead(player) {
    if (!player?.alive) return [];
    const groundDrops = this.groundInventory.dropPlayerEquipment(player, this.tick);
    this.setPlayerTask(player, 'eliminated', this.roundPhase.phase, 'eliminated');
    player.alive = false;
    player.health = 0;
    player.velocity = 0;
    this.unlockBehavior(player);
    this.clearObjectivePriority(player);
    this.setBehavior(player, 'dead', 1, 'eliminated');
    if (groundDrops.length) {
      this.pendingGroundEvents.push({
        type: 'equipment-drop',
        actor: { id: player.id, name: player.name, teamId: player.teamId },
        items: groundDrops,
        position: {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z
        },
        tick: this.tick
      });
    }
    return groundDrops;
  }

  recordPositionSamples() {
    const atMs = Math.round(this.tick * this.tickMs);
    for (const player of this.players) {
      const samples = this.positionSamplesByPlayer.get(player.id);
      if (!samples || samples[samples.length - 1]?.[0] === atMs) continue;
      samples.push([
        atMs,
        Number(player.position.x.toFixed(3)),
        Number(player.position.y.toFixed(3))
      ]);
    }
  }

  snapshot() {
    this.recordPositionSamples();
    return this.players.map(player => ({
      id: player.id,
      teamId: player.teamId,
      alive: player.alive,
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
      openingAssignmentId: player.openingAssignmentId || null,
      openingLane: player.openingLane || null,
      utility: [...(player.utility || [])],
      savedFromPreviousRound: player.savedFromPreviousRound,
      side: player.side,
      x: Number(player.position.x.toFixed(3)),
      y: Number(player.position.y.toFixed(3)),
      z: Number((player.position.z || 0).toFixed(1)),
      areaId: player.position.areaId || null,
      facingX: Number(player.facing.x.toFixed(3)),
      facingY: Number(player.facing.y.toFixed(3)),
      behavior: player.behavior,
      behaviorSource: player.behaviorSource,
      routeElapsedMs: Math.round(player.routeElapsedMs),
      knownEnemies: this.knownEnemies(player).length,
      lastHeardSound: player.lastHeardSound
        ? {
            type: player.lastHeardSound.type,
            confidence: Number(player.lastHeardSound.confidence.toFixed(3)),
            fake: player.lastHeardSound.fake,
            ageTicks: this.tick - player.lastHeardSound.tick
          }
        : null,
      blinded: player.blindedUntilTick > this.tick,
      blindRemainingMs: Math.max(0, Math.round((player.blindedUntilTick - this.tick) * this.tickMs)),
      inFire: player.inFireUntilTick > this.tick
    }));
  }
}

module.exports = {
  ShooterWorld,
  interpolate,
  BEHAVIOR_SPEEDS
};
