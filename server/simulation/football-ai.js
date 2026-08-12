const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const { createFootballProfile, normalizedSkill } = require('./football-profile');

const FIFA_POINTS = {
  GK: { x: 6, y: 50 },
  LB: { x: 24, y: 16 },
  LCB: { x: 27, y: 36 },
  RCB: { x: 27, y: 64 },
  RB: { x: 24, y: 84 },
  LDM: { x: 41, y: 36 },
  RDM: { x: 41, y: 64 },
  LAM: { x: 57, y: 22 },
  CAM: { x: 58, y: 50 },
  RAM: { x: 57, y: 78 },
  ST: { x: 69, y: 50 }
};

const FUTBOL_POINTS = [
  { x: 25, y: 30 },
  { x: 25, y: 70 },
  { x: 45, y: 34 },
  { x: 45, y: 66 },
  { x: 66, y: 50 }
];

function roleCode(player, index, branch) {
  const raw = String(player.visualRole || player.role || '').toUpperCase().split(' ')[0];
  if (branch === 'fifa' && FIFA_POINTS[raw]) return raw;
  if (player.isGoalkeeper) return 'GK';
  if (raw.includes('DEFANS') || raw === 'LB' || raw === 'LCB' || raw === 'RCB' || raw === 'RB') return 'DEF';
  if (raw.includes('ORTA') || raw === 'LDM' || raw === 'RDM' || raw === 'LAM' || raw === 'CAM' || raw === 'RAM') return 'MID';
  if (raw.includes('HÜCUM') || raw.includes('FORVET') || raw === 'ST') return 'ATT';
  const slotMatch = String(player.role || '').match(/\d+/);
  if (slotMatch) {
    const slot = Number(slotMatch[0]);
    return slot <= 1 ? 'DEF' : slot <= 3 ? 'MID' : 'ATT';
  }
  return index <= 1 ? 'DEF' : index <= 3 ? 'MID' : 'ATT';
}

function roleBand(player, index, branch) {
  const role = roleCode(player, index, branch);
  if (role === 'GK') return 0;
  if (role === 'DEF' || ['LB', 'LCB', 'RCB', 'RB'].includes(role)) return 1;
  if (role === 'MID' || ['LDM', 'RDM'].includes(role)) return 2;
  if (['LAM', 'CAM', 'RAM'].includes(role)) return 3;
  return 4;
}

function homePoint(player, index, teamId, branch) {
  let point;
  if (player.isGoalkeeper) {
    point = { x: 6, y: 50 };
  } else if (branch === 'fifa') {
    point = { ...(FIFA_POINTS[roleCode(player, index, branch)] || FUTBOL_POINTS[index % FUTBOL_POINTS.length]) };
  } else {
    point = { ...(FUTBOL_POINTS[index % FUTBOL_POINTS.length]) };
  }
  return teamId === 1 ? point : { x: 100 - point.x, y: point.y };
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.001) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function createFootballMatchState({
  branch,
  team1,
  team2,
  random = Math.random
}) {
  const positions = new Map();
  const homePositions = new Map();
  const teamByPlayer = new Map();
  const teams = { 1: team1, 2: team2 };

  [1, 2].forEach(teamId => {
    teams[teamId].forEach((player, index) => {
      const home = homePoint(player, index, teamId, branch);
      positions.set(player, { ...home });
      homePositions.set(player, { ...home });
      teamByPlayer.set(player, teamId);
    });
  });

  const state = {
    ball: { x: 50, y: 50 },
    possessionTeam: 0,
    lastCarrier: null,
    phase: 'kickoff',
    sequenceCount: 0,
    possessionChanges: 0,
    transitionStarts: 0,
    continuationStarts: 0,
    turnovers: 0,
    restarts: 0,
    kickoffResets: 0,
    cumulativeStartDisplacement: 0,
    onBallDecisions: 0,
    backwardPasses: 0,
    unnecessaryBackwardPasses: 0,
    forcedOneOnOneShots: 0,
    openLaneCarries: 0,
    offBallPlans: 0,
    spacingCorrections: 0,
    crowdedPlans: 0,
    wideRoleAssignments: 0,
    supportRoleAssignments: 0,
    safetyRoleAssignments: 0,
    cumulativeAttackingWidth: 0,
    cumulativeAttackingLength: 0,
    maximumAttackingLength: 0,
    backfieldShapeViolations: 0,
    minimumObservedSpacing: 100,
    defensivePlans: 0,
    defensiveOvercommitPlans: 0,
    primaryPressAssignments: 0,
    coverAssignments: 0,
    passLaneBlockAssignments: 0,
    restDefenseAssignments: 0,
    trackedThreatAssignments: 0,
    unguardedBackPlans: 0,
    defensiveSpacingCorrections: 0,
    cumulativeDefensiveWidth: 0,
    forcedAdvanceCarries: 0
  };

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pointOf = player => positions.get(player) || { x: 50, y: 50 };
  const setPoint = (player, point) => {
    if (!player || !point) return { ...state.ball };
    const next = {
      x: clamp(point.x, 6, 94),
      y: clamp(point.y, 9, 91)
    };
    positions.set(player, next);
    return { ...next };
  };

  function settleTeamShape(nextPossessionTeam) {
    [1, 2].forEach(teamId => {
      const direction = teamId === 1 ? 1 : -1;
      const attacking = teamId === nextPossessionTeam;
      teams[teamId].forEach(player => {
        const current = pointOf(player);
        const home = homePositions.get(player) || current;
        if (player.isGoalkeeper) {
          setPoint(player, {
            x: home.x + (state.ball.x - 50) * 0.035,
            y: 50 + (state.ball.y - 50) * 0.12
          });
          return;
        }
        const target = {
          x: home.x + (state.ball.x - 50) * 0.34 + direction * (attacking ? 2.8 : -1.6),
          y: home.y + (state.ball.y - 50) * 0.28
        };
        const blend = state.phase === 'transition' ? 0.3 : 0.2;
        setPoint(player, {
          x: current.x * (1 - blend) + target.x * blend,
          y: current.y * (1 - blend) + target.y * blend
        });
      });
    });
  }

  function preparePossession(teamId) {
    const previousTeam = state.possessionTeam;
    const changedTeam = previousTeam !== 0 && previousTeam !== teamId;
    if (changedTeam) {
      state.possessionChanges++;
      state.transitionStarts++;
      state.phase = 'transition';
    } else {
      state.phase = state.sequenceCount === 0 ? 'kickoff' : 'build-up';
    }
    state.sequenceCount++;
    settleTeamShape(teamId);

    const roster = teams[teamId].filter(player => !player.isGoalkeeper);
    const desiredBand = changedTeam ? 2.4 : 1.6;
    const carrier = roster
      .map((player, index) => {
        const current = pointOf(player);
        const band = roleBand(player, teams[teamId].indexOf(player), branch);
        const continuityBonus = player === state.lastCarrier && previousTeam === teamId ? -3.2 : 0;
        return {
          player,
          score:
            distance(current, state.ball) +
            Math.abs(band - desiredBand) * 2.6 +
            continuityBonus +
            random() * 2.8
        };
      })
      .sort((a, b) => a.score - b.score)[0]?.player || roster[0];

    if (carrier) {
      const start = pointOf(carrier);
      const home = homePositions.get(carrier) || start;
      const displacement = distance(start, home);
      state.cumulativeStartDisplacement += displacement;
      if (displacement > (branch === 'fifa' ? 5.5 : 4.5)) state.continuationStarts++;
      state.ball = { ...start };
      state.lastCarrier = carrier;
    }
    state.possessionTeam = teamId;
    return carrier;
  }

  function recordPossession(player, phase = 'build-up') {
    if (!player) return;
    const teamId = teamByPlayer.get(player) || state.possessionTeam;
    state.possessionTeam = teamId;
    state.lastCarrier = player;
    state.ball = { ...pointOf(player) };
    state.phase = phase;
  }

  function recordTurnover(player, point, reason = 'turnover') {
    if (!player) return;
    const nextTeam = teamByPlayer.get(player) || state.possessionTeam;
    if (state.possessionTeam && nextTeam !== state.possessionTeam) state.possessionChanges++;
    state.turnovers++;
    state.transitionStarts++;
    if (point) setPoint(player, point);
    state.ball = { ...pointOf(player) };
    state.possessionTeam = nextTeam;
    state.lastCarrier = player;
    state.phase = reason === 'clearance' ? 'loose-ball' : 'transition';
  }

  function recordSetPiece(teamId, point) {
    state.possessionTeam = teamId;
    state.lastCarrier = null;
    state.ball = {
      x: clamp(point?.x ?? state.ball.x, 1, 99),
      y: clamp(point?.y ?? state.ball.y, 2, 98)
    };
    state.phase = 'set-piece';
    state.restarts++;
  }

  function recordRestart(teamId, type = 'goal-kick') {
    state.possessionTeam = teamId;
    state.lastCarrier = null;
    state.restarts++;
    if (type === 'kickoff') {
      positions.forEach((_, player) => positions.set(player, { ...(homePositions.get(player) || { x: 50, y: 50 }) }));
      state.ball = { x: 50, y: 50 };
      state.phase = 'kickoff';
      state.kickoffResets++;
      return;
    }
    state.ball = teamId === 1 ? { x: 9, y: 50 } : { x: 91, y: 50 };
    state.phase = 'build-up';
    settleTeamShape(teamId);
  }

  function recordDecision(decision = {}) {
    state.onBallDecisions++;
    if (decision.type === 'pass' && decision.backward) state.backwardPasses++;
    if (decision.type === 'pass' && decision.backward && decision.openAdvance) {
      state.unnecessaryBackwardPasses++;
    }
    if (decision.type === 'shot' && decision.forcedOneOnOne) state.forcedOneOnOneShots++;
    if (decision.type === 'carry' && decision.openAdvance) {
      state.openLaneCarries++;
      if (decision.forcedAdvance) state.forcedAdvanceCarries++;
    }
  }

  function recordOffBallPlan(teamId, assignments = [], corrections = 0) {
    state.offBallPlans++;
    state.spacingCorrections += corrections;
    state.wideRoleAssignments += assignments.filter(assignment =>
      String(assignment.role || '').startsWith('width')
    ).length;
    state.supportRoleAssignments += assignments.filter(assignment =>
      assignment.role === 'support'
    ).length;
    state.safetyRoleAssignments += assignments.filter(assignment =>
      assignment.role === 'balance'
    ).length;
    const outfieldPoints = teams[teamId]
      .filter(player => !player.isGoalkeeper)
      .map(player => pointOf(player));
    const width = outfieldPoints.length
      ? Math.max(...outfieldPoints.map(point => point.y)) - Math.min(...outfieldPoints.map(point => point.y))
      : 0;
    state.cumulativeAttackingWidth += width;
    const length = outfieldPoints.length
      ? Math.max(...outfieldPoints.map(point => point.x)) - Math.min(...outfieldPoints.map(point => point.x))
      : 0;
    state.cumulativeAttackingLength += length;
    state.maximumAttackingLength = Math.max(state.maximumAttackingLength, length);
    const ownGoalDirection = teamId === 1 ? -1 : 1;
    const availableBackDepth = ownGoalDirection === 1
      ? 92 - state.ball.x
      : state.ball.x - 8;
    const requiredSafetyDepth = Math.max(0, Math.min(branch === 'futbol' ? 18 : 13, availableBackDepth) - 0.15);
    const hasSafetyPlayer = assignments.some(assignment =>
      assignment.role === 'balance' &&
      ownGoalDirection * (assignment.destination.x - state.ball.x) >= requiredSafetyDepth
    );
    if (!hasSafetyPlayer) state.backfieldShapeViolations++;
    let minimumSpacing = 100;
    for (let left = 0; left < outfieldPoints.length; left++) {
      for (let right = left + 1; right < outfieldPoints.length; right++) {
        minimumSpacing = Math.min(minimumSpacing, distance(outfieldPoints[left], outfieldPoints[right]));
      }
    }
    state.minimumObservedSpacing = Math.min(state.minimumObservedSpacing, minimumSpacing);
    const crowdedLimit = branch === 'fifa' ? 4 : 6;
    if (minimumSpacing < crowdedLimit) state.crowdedPlans++;
  }

  function recordDefensivePlan(teamId, ballPoint, assignments = [], corrections = 0) {
    state.defensivePlans++;
    state.defensiveSpacingCorrections += corrections;
    state.primaryPressAssignments += assignments.filter(assignment =>
      assignment.role === 'primary-press'
    ).length;
    state.coverAssignments += assignments.filter(assignment =>
      assignment.role === 'cover'
    ).length;
    state.passLaneBlockAssignments += assignments.filter(assignment =>
      String(assignment.role || '').startsWith('pass-lane')
    ).length;
    state.restDefenseAssignments += assignments.filter(assignment =>
      assignment.role === 'rest-defense'
    ).length;
    state.trackedThreatAssignments += assignments.filter(assignment =>
      assignment.markTarget
    ).length;

    const outfieldPoints = teams[teamId]
      .filter(player => !player.isGoalkeeper)
      .map(player => pointOf(player));
    const width = outfieldPoints.length
      ? Math.max(...outfieldPoints.map(point => point.y)) - Math.min(...outfieldPoints.map(point => point.y))
      : 0;
    state.cumulativeDefensiveWidth += width;

    const closeLimit = branch === 'fifa' ? 9 : 10.5;
    const ownGoalDirection = teamId === 1 ? -1 : 1;
    const availableBackDepth = ownGoalDirection === 1
      ? 93 - ballPoint.x
      : ballPoint.x - 7;
    const closeDefenders = outfieldPoints.filter(point => distance(point, ballPoint) < closeLimit).length;
    if (closeDefenders > 2 && availableBackDepth > closeLimit + 2) {
      state.defensiveOvercommitPlans++;
    }

    const requiredBackDepth = Math.max(
      0,
      Math.min(branch === 'fifa' ? 11 : 12, availableBackDepth) - 0.15
    );
    const protectedBackPlayers = assignments.filter(assignment =>
      assignment.role === 'rest-defense' &&
      ownGoalDirection * (assignment.destination.x - ballPoint.x) >= requiredBackDepth
    ).length;
    if (protectedBackPlayers < (branch === 'fifa' ? 4 : 2)) state.unguardedBackPlans++;
  }

  function telemetry() {
    return {
      sequences: state.sequenceCount,
      possessionChanges: state.possessionChanges,
      transitions: state.transitionStarts,
      turnovers: state.turnovers,
      restarts: state.restarts,
      kickoffResets: state.kickoffResets,
      continuationStarts: state.continuationStarts,
      continuationRate: state.sequenceCount
        ? parseFloat((state.continuationStarts / state.sequenceCount).toFixed(3))
        : 0,
      averageStartDisplacement: state.sequenceCount
        ? parseFloat((state.cumulativeStartDisplacement / state.sequenceCount).toFixed(2))
        : 0,
      onBallDecisions: state.onBallDecisions,
      backwardPasses: state.backwardPasses,
      unnecessaryBackwardPasses: state.unnecessaryBackwardPasses,
      forcedOneOnOneShots: state.forcedOneOnOneShots,
      openLaneCarries: state.openLaneCarries,
      forcedAdvanceCarries: state.forcedAdvanceCarries,
      offBallPlans: state.offBallPlans,
      spacingCorrections: state.spacingCorrections,
      crowdedPlans: state.crowdedPlans,
      crowdedPlanRate: state.offBallPlans
        ? parseFloat((state.crowdedPlans / state.offBallPlans).toFixed(3))
        : 0,
      wideRoleAssignments: state.wideRoleAssignments,
      supportRoleAssignments: state.supportRoleAssignments,
      safetyRoleAssignments: state.safetyRoleAssignments,
      averageAttackingWidth: state.offBallPlans
        ? parseFloat((state.cumulativeAttackingWidth / state.offBallPlans).toFixed(2))
        : 0,
      averageAttackingLength: state.offBallPlans
        ? parseFloat((state.cumulativeAttackingLength / state.offBallPlans).toFixed(2))
        : 0,
      maximumAttackingLength: parseFloat(state.maximumAttackingLength.toFixed(2)),
      backfieldShapeViolations: state.backfieldShapeViolations,
      backfieldShapeViolationRate: state.offBallPlans
        ? parseFloat((state.backfieldShapeViolations / state.offBallPlans).toFixed(3))
        : 0,
      minimumObservedSpacing: state.minimumObservedSpacing === 100
        ? 0
        : parseFloat(state.minimumObservedSpacing.toFixed(2)),
      defensivePlans: state.defensivePlans,
      defensiveOvercommitPlans: state.defensiveOvercommitPlans,
      defensiveOvercommitRate: state.defensivePlans
        ? parseFloat((state.defensiveOvercommitPlans / state.defensivePlans).toFixed(3))
        : 0,
      primaryPressAssignments: state.primaryPressAssignments,
      coverAssignments: state.coverAssignments,
      passLaneBlockAssignments: state.passLaneBlockAssignments,
      restDefenseAssignments: state.restDefenseAssignments,
      trackedThreatAssignments: state.trackedThreatAssignments,
      unguardedBackPlans: state.unguardedBackPlans,
      unguardedBackRate: state.defensivePlans
        ? parseFloat((state.unguardedBackPlans / state.defensivePlans).toFixed(3))
        : 0,
      defensiveSpacingCorrections: state.defensiveSpacingCorrections,
      averageDefensiveWidth: state.defensivePlans
        ? parseFloat((state.cumulativeDefensiveWidth / state.defensivePlans).toFixed(2))
        : 0
    };
  }

  return {
    positions,
    pointOf,
    setPoint,
    preparePossession,
    recordPossession,
    recordTurnover,
    recordSetPiece,
    recordRestart,
    recordDecision,
    recordOffBallPlan,
    recordDefensivePlan,
    telemetry,
    state
  };
}

function createFootballIntelligence({
  branch,
  attackers,
  defenders,
  teamId,
  ratingOf,
  profileOf = player => createFootballProfile(player, branch, ratingOf(player)),
  random = Math.random,
  sharedState = null
}) {
  const direction = teamId === 1 ? 1 : -1;
  const positions = sharedState?.positions || new Map();
  attackers.forEach((player, index) => {
    if (!positions.has(player)) positions.set(player, homePoint(player, index, teamId, branch));
  });
  defenders.forEach((player, index) => {
    if (!positions.has(player)) positions.set(player, homePoint(player, index, teamId === 1 ? 2 : 1, branch));
  });

  const outfieldAttackers = attackers.filter(player => !player.isGoalkeeper);
  const outfieldDefenders = defenders.filter(player => !player.isGoalkeeper);

  const pointOf = player => sharedState?.pointOf
    ? sharedState.pointOf(player)
    : positions.get(player) || { x: 50, y: 50 };
  const setPoint = (player, point) => {
    if (sharedState?.setPoint) return sharedState.setPoint(player, point);
    positions.set(player, {
      x: clamp(point.x, 6, 94),
      y: clamp(point.y, 9, 91)
    });
    return pointOf(player);
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const nearestDefender = point => outfieldDefenders
    .map(player => ({ player, point: pointOf(player), distance: distance(pointOf(player), point) }))
    .sort((a, b) => a.distance - b.distance)[0] || null;

  const pressureAt = point => {
    const ordered = outfieldDefenders
      .map(player => distance(pointOf(player), point))
      .sort((a, b) => a - b);
    const first = ordered[0] ?? 20;
    const second = ordered[1] ?? 24;
    return clamp((9.5 - first) / 8.5, 0, 1) * 0.72 +
      clamp((13 - second) / 11, 0, 1) * 0.28;
  };

  const laneOpenness = (start, end) => {
    const closest = outfieldDefenders.reduce((best, player) =>
      Math.min(best, pointSegmentDistance(pointOf(player), start, end)), 30);
    return clamp((closest - 1.2) / 7.5, 0, 1);
  };

  const progressAt = point => clamp(teamId === 1 ? (point.x - 16) / 72 : (84 - point.x) / 72, 0, 1);
  const threatAt = point => {
    const progress = progressAt(point);
    const centrality = clamp(1 - Math.abs(point.y - 50) / 48, 0.12, 1);
    const boxBonus = progress > 0.78 && centrality > 0.62
      ? (progress - 0.78) * 0.42
      : 0;
    return clamp(
      Math.pow(progress, 1.7) * (0.34 + centrality * 0.66) + boxBonus,
      0,
      1
    );
  };

  function buildDefensivePlan(ballPoint, lane = ballPoint.y, phase = 'middle', recordPlan = false) {
    const defendingTeamId = teamId === 1 ? 2 : 1;
    const closeLimit = branch === 'fifa' ? 9 : 10.5;
    const minimumSpacing = branch === 'fifa' ? 4.8 : 6.3;
    const defenderHome = player => homePoint(
      player,
      defenders.indexOf(player),
      defendingTeamId,
      branch
    );
    const available = outfieldDefenders.map(player => ({
      player,
      current: pointOf(player),
      home: defenderHome(player),
      band: roleBand(player, defenders.indexOf(player), branch)
    }));
    const anchorCount = Math.min(branch === 'fifa' ? 4 : 2, Math.max(0, available.length - 3));
    const anchors = [...available]
      .sort((left, right) =>
        left.band - right.band ||
        direction * (right.home.x - left.home.x) ||
        Math.abs(left.home.y - 50) - Math.abs(right.home.y - 50)
      )
      .slice(0, anchorCount);
    const remaining = available.filter(entry => !anchors.includes(entry));
    const assignments = [];
    const take = sorter => {
      if (!remaining.length) return null;
      const selected = [...remaining].sort(sorter)[0];
      remaining.splice(remaining.indexOf(selected), 1);
      return selected;
    };
    const addAssignment = (entry, role, destination, order = 0, markTarget = null) => {
      if (!entry) return;
      assignments.push({
        player: entry.player,
        role,
        order,
        markTarget,
        destination: {
          x: clamp(destination.x, 7, 93),
          y: clamp(destination.y, 10, 90)
        }
      });
    };

    const primary = take((left, right) => {
      const leftProfile = profileOf(left.player);
      const rightProfile = profileOf(right.player);
      const leftScore = distance(left.current, ballPoint) -
        normalizedSkill(leftProfile, 'defending') * 1.7 -
        normalizedSkill(leftProfile, 'reaction') * 1.1;
      const rightScore = distance(right.current, ballPoint) -
        normalizedSkill(rightProfile, 'defending') * 1.7 -
        normalizedSkill(rightProfile, 'reaction') * 1.1;
      return leftScore - rightScore;
    });
    addAssignment(primary, 'primary-press', {
      x: ballPoint.x + direction * (branch === 'fifa' ? 4.6 : 4.2),
      y: ballPoint.y + (primary?.home.y <= ballPoint.y
        ? -(branch === 'fifa' ? 4.5 : 4.2)
        : (branch === 'fifa' ? 4.5 : 4.2))
    });

    const coverTarget = {
      x: ballPoint.x + direction * (branch === 'fifa' ? 7.5 : 8.5),
      y: ballPoint.y + (ballPoint.y <= 50 ? 6.5 : -6.5)
    };
    const cover = take((left, right) =>
      distance(left.current, coverTarget) - distance(right.current, coverTarget)
    );
    addAssignment(cover, 'cover', coverTarget);

    const threateningTargets = outfieldAttackers
      .map(player => ({
        player,
        point: pointOf(player),
        score:
          progressAt(pointOf(player)) * 1.45 +
          clamp(1 - Math.abs(pointOf(player).y - 50) / 50, 0, 1) * 0.3 -
          distance(pointOf(player), ballPoint) * 0.006
      }))
      .filter(entry => distance(entry.point, ballPoint) > 4)
      .sort((left, right) => right.score - left.score);
    const markedThreats = new Set();
    const takeThreat = preferredIndex => {
      const preferred = threateningTargets[preferredIndex];
      if (preferred && !markedThreats.has(preferred.player)) {
        markedThreats.add(preferred.player);
        return preferred;
      }
      const availableThreat = threateningTargets.find(entry => !markedThreats.has(entry.player));
      if (availableThreat) markedThreats.add(availableThreat.player);
      return availableThreat || preferred || threateningTargets[0] || null;
    };
    const laneBlockCount = Math.min(branch === 'fifa' ? 2 : 1, remaining.length);
    for (let index = 0; index < laneBlockCount; index++) {
      const threat = takeThreat(index);
      if (!threat) break;
      let lanePoint = {
        x: ballPoint.x * 0.44 + threat.point.x * 0.56 + direction * 1.8,
        y: ballPoint.y * 0.44 + threat.point.y * 0.56
      };
      const laneDistance = distance(lanePoint, ballPoint);
      if (laneDistance < closeLimit + 1) {
        const dx = lanePoint.x - ballPoint.x;
        const dy = lanePoint.y - ballPoint.y;
        const length = Math.max(0.1, Math.hypot(dx, dy));
        lanePoint = {
          x: ballPoint.x + (dx / length) * (closeLimit + 1),
          y: ballPoint.y + (dy / length) * (closeLimit + 1)
        };
      }
      const blocker = take((left, right) =>
        distance(left.current, lanePoint) - distance(right.current, lanePoint)
      );
      addAssignment(blocker, `pass-lane-${index + 1}`, lanePoint, index, threat.player);
    }

    const restEntries = [...anchors, ...remaining];
    const baseLineGap = phase === 'transition'
      ? (branch === 'fifa' ? 18 : 19)
      : (branch === 'fifa' ? 15 : 16);
    restEntries
      .sort((left, right) => left.home.y - right.home.y)
      .forEach((entry, index) => {
        const threat = takeThreat(index + laneBlockCount);
        const depthGap = baseLineGap + (index === 0 ? (branch === 'fifa' ? 5 : 4) : 0);
        const lineX = clamp(ballPoint.x + direction * depthGap, 8, 92);
        const threatX = threat ? threat.point.x + direction * (branch === 'fifa' ? 5.5 : 6.5) : lineX;
        const threatY = threat?.point.y ?? entry.home.y;
        const destinationX = direction * (threatX - ballPoint.x) < depthGap
          ? lineX
          : threatX;
        addAssignment(entry, 'rest-defense', {
          x: destinationX,
          y: clamp(
            threatY * (branch === 'fifa' ? 0.32 : 0.18) +
              entry.home.y * (branch === 'fifa' ? 0.68 : 0.82) +
              (lane - 50) * 0.04,
            12,
            88
          )
        }, index, threat?.player || null);
      });

    let corrections = 0;
    for (let iteration = 0; iteration < 5; iteration++) {
      for (let leftIndex = 0; leftIndex < assignments.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < assignments.length; rightIndex++) {
          const left = assignments[leftIndex];
          const right = assignments[rightIndex];
          let dx = right.destination.x - left.destination.x;
          let dy = right.destination.y - left.destination.y;
          let gap = Math.hypot(dx, dy);
          if (gap >= minimumSpacing) continue;
          if (gap < 0.01) {
            dx = direction * 0.3;
            dy = (leftIndex + rightIndex) % 2 === 0 ? 1 : -1;
            gap = Math.hypot(dx, dy);
          }
          const overlap = minimumSpacing - gap + 0.12;
          const pushX = (dx / gap) * overlap * 0.25;
          const pushY = (dy / gap) * overlap * 0.75;
          const leftFixed = left.role === 'primary-press';
          const rightFixed = right.role === 'primary-press';
          if (!leftFixed) {
            left.destination.x = clamp(left.destination.x - pushX * (rightFixed ? 1 : 0.5), 7, 93);
            left.destination.y = clamp(left.destination.y - pushY * (rightFixed ? 1 : 0.5), 10, 90);
          }
          if (!rightFixed) {
            right.destination.x = clamp(right.destination.x + pushX * (leftFixed ? 1 : 0.5), 7, 93);
            right.destination.y = clamp(right.destination.y + pushY * (leftFixed ? 1 : 0.5), 10, 90);
          }
          corrections++;
        }
      }
    }

    assignments.forEach(assignment => {
      if (assignment.role === 'primary-press' || assignment.role === 'cover') return;
      const dx = assignment.destination.x - ballPoint.x;
      const dy = assignment.destination.y - ballPoint.y;
      const gap = Math.hypot(dx, dy);
      const requiredGap = closeLimit + 1.4;
      if (gap >= requiredGap) return;
      const safeDx = gap > 0.01 ? dx : direction;
      const safeDy = gap > 0.01 ? dy : (assignment.order % 2 === 0 ? -1 : 1);
      const safeLength = Math.max(0.1, Math.hypot(safeDx, safeDy));
      assignment.destination.x = clamp(
        ballPoint.x + (safeDx / safeLength) * requiredGap,
        7,
        93
      );
      assignment.destination.y = clamp(
        ballPoint.y + (safeDy / safeLength) * requiredGap,
        10,
        90
      );
      corrections++;
    });

    assignments
      .filter(assignment => assignment.role === 'rest-defense')
      .forEach(assignment => {
        const availableGoalSideDepth = direction === 1
          ? 93 - ballPoint.x
          : ballPoint.x - 7;
        const desiredGap = baseLineGap +
          (assignment.order === 0 ? (branch === 'fifa' ? 5 : 4) : 0);
        const requiredGap = Math.max(0, Math.min(desiredGap, availableGoalSideDepth) - 0.1);
        if (direction * (assignment.destination.x - ballPoint.x) >= requiredGap) return;
        assignment.destination.x = clamp(ballPoint.x + direction * requiredGap, 7, 93);
        corrections++;
      });

    assignments.forEach(assignment => setPoint(assignment.player, assignment.destination));
    if (recordPlan && sharedState?.recordDefensivePlan) {
      sharedState.recordDefensivePlan(defendingTeamId, ballPoint, assignments, corrections);
    }
    return assignments.map(assignment => ({ ...assignment, phase }));
  }

  function reactDefenders(ballPoint) {
    buildDefensivePlan(ballPoint, ballPoint.y, 'middle', false);
  }

  function planDefensiveRoles(carrier, lane = 50, phase = 'build-up') {
    const ballPoint = carrier?.x !== undefined && carrier?.y !== undefined
      ? carrier
      : pointOf(carrier);
    return buildDefensivePlan(ballPoint, lane, phase, true);
  }

  function chooseInitialCarrier() {
    const candidates = outfieldAttackers
      .map((player, index) => ({
        player,
        score: Math.abs(roleBand(player, index, branch) - 1.5) + random() * 0.8
      }))
      .sort((a, b) => a.score - b.score);
    return candidates[0]?.player || outfieldAttackers[0];
  }

  function chooseReceiver(carrier, progress, lane, isFinal) {
    const origin = pointOf(carrier);
    const carrierProfile = profileOf(carrier);
    const decisionNoise = 0.12 + (1 - normalizedSkill(carrierProfile, 'vision')) * 0.3;
    const carrierProgress = progressAt(origin);
    const carrierPressure = pressureAt(origin);
    const forwardProbe = {
      x: clamp(origin.x + direction * (branch === 'fifa' ? 11 : 13), 7, 93),
      y: clamp(origin.y * 0.72 + lane * 0.28, 11, 89)
    };
    const forwardLaneOpenness = laneOpenness(origin, forwardProbe);
    const availableForwardDistance = direction * (forwardProbe.x - origin.x);
    const openAdvance = availableForwardDistance > 4 &&
      carrierPressure < (branch === 'fifa' ? 0.34 : 0.39) &&
      forwardLaneOpenness > (branch === 'fifa' ? 0.42 : 0.4);
    const minimumProgress = openAdvance
      ? carrierProgress + (isFinal ? 0.09 : 0.045)
      : carrierProgress - (carrierPressure > 0.62 ? 0.12 : 0.035);
    const contextualProgress = clamp(Math.max(progress, minimumProgress), 0.08, 0.98);
    const desiredX = teamId === 1 ? 18 + contextualProgress * 70 : 82 - contextualProgress * 70;
    reactDefenders({ x: desiredX, y: lane });
    const candidates = outfieldAttackers
      .filter(player => player !== carrier)
      .map(player => {
        const index = attackers.indexOf(player);
        const band = roleBand(player, index, branch);
        const natural = pointOf(player);
        const target = {
          x: clamp(desiredX + direction * (band - 2) * 2.3, 10, 90),
          y: clamp(natural.y * 0.48 + lane * 0.52, 12, 88)
        };
        const space = 1 - pressureAt(target);
        const laneScore = laneOpenness(origin, target);
        const forwardGain = clamp(direction * (target.x - origin.x) / 30, -0.4, 1);
        const roleFit = 1 - Math.abs(band / 4 - contextualProgress);
        const finalRoleBonus = isFinal ? (band >= 3 ? 0.65 : -0.75) : 0;
        const receiverProfile = profileOf(player);
        const receivingQuality =
          normalizedSkill(receiverProfile, 'reaction') * 0.55 +
          normalizedSkill(receiverProfile, 'passing') * 0.45;
        const backwardPenalty = forwardGain < -0.025
          ? (openAdvance ? 4.8 + Math.abs(forwardGain) * 2.6 : (1 - carrierPressure) * 1.25)
          : 0;
        const progressiveBonus = openAdvance && forwardGain > 0.12
          ? 0.72 + Math.min(0.55, forwardGain * 0.5)
          : 0;
        const score = space * 1.6 + laneScore * 1.45 + forwardGain * 1.35 +
          roleFit * 0.85 + receivingQuality * 0.45 + finalRoleBonus +
          progressiveBonus - backwardPenalty + random() * decisionNoise;
        return {
          player,
          target,
          score,
          space,
          laneOpenness: laneScore,
          forwardGain,
          band,
          carrierPressure,
          forwardLaneOpenness,
          openAdvance
        };
      })
      .sort((a, b) => b.score - a.score);
    const progressiveCandidates = candidates.filter(candidate => candidate.forwardGain > 0.035);
    const decisionCandidates = openAdvance && progressiveCandidates.length
      ? progressiveCandidates
      : candidates;
    const finalThirdCandidates = decisionCandidates.filter(candidate => candidate.band >= 3);
    const selectedPool = isFinal
      ? (finalThirdCandidates.length ? finalThirdCandidates : decisionCandidates).slice(0, 2)
      : decisionCandidates.slice(0, openAdvance ? 2 : 3);
    const selected = selectedPool[Math.floor(random() * Math.max(1, selectedPool.length))] ||
      decisionCandidates[0] ||
      candidates[0];
    if (!selected) return null;
    if (openAdvance && selected.forwardGain <= 0.035) {
      const currentReceiverPoint = pointOf(selected.player);
      selected.target = {
        x: clamp(origin.x + direction * (branch === 'fifa' ? 7 : 9), 9, 91),
        y: clamp(currentReceiverPoint.y * 0.5 + lane * 0.5, 12, 88)
      };
      selected.forwardGain = clamp(direction * (selected.target.x - origin.x) / 30, -0.4, 1);
    }
    selected.breakaway = selected.band >= 3 &&
      progress > 0.68 &&
      selected.space > (branch === 'fifa' ? 0.76 : 0.68) &&
      selected.laneOpenness > (branch === 'fifa' ? 0.68 : 0.58) &&
      selected.forwardGain > 0.32;
    setPoint(selected.player, selected.target);
    reactDefenders(selected.target);
    selected.space = 1 - pressureAt(selected.target);
    selected.laneOpenness = laneOpenness(origin, selected.target);
    return selected;
  }

  function onBallDecision(carrier, buildQuality, lane) {
    const point = pointOf(carrier);
    const progress = progressAt(point);
    const pressure = pressureAt(point);
    const goalX = teamId === 1 ? 100 : 0;
    const distanceToGoal = Math.hypot(goalX - point.x, (50 - point.y) * 0.68);
    const forwardTarget = {
      x: clamp(point.x + direction * (branch === 'fifa' ? 11 : 13), 7, 93),
      y: clamp(point.y * 0.75 + lane * 0.25, 12, 88)
    };
    const forwardLaneOpenness = laneOpenness(point, forwardTarget);
    const availableForwardDistance = direction * (forwardTarget.x - point.x);
    const openAdvance = availableForwardDistance > 4 &&
      pressure < (branch === 'fifa' ? 0.34 : 0.39) &&
      forwardLaneOpenness > (branch === 'fifa' ? 0.42 : 0.4);
    const openGoal = progress > (branch === 'fifa' ? 0.72 : 0.78) &&
      distanceToGoal < (branch === 'fifa' ? 24 : 18.5) &&
      pressure < (branch === 'fifa' ? 0.22 : 0.2) &&
      forwardLaneOpenness > (branch === 'fifa' ? 0.58 : 0.56);
    const shot = shotContext(carrier, buildQuality, lane, openGoal);

    if (openGoal && shot.canShoot) {
      return { type: 'shot', shot, forcedOneOnOne: true, openAdvance, pressure, forwardLaneOpenness };
    }

    const longShotChance = branch === 'futbol'
      ? 0.004 +
        normalizedSkill(shot.shooterProfile, 'finishing') * 0.012 +
        normalizedSkill(shot.shooterProfile, 'composure') * 0.008
      : 0.02 +
        normalizedSkill(shot.shooterProfile, 'finishing') * 0.035 +
        normalizedSkill(shot.shooterProfile, 'composure') * 0.02;
    if (shot.longRangeEligible && random() < longShotChance) {
      return {
        type: 'shot',
        shot: {
          ...shot,
          canShoot: true,
          longRange: true,
          xg: clamp(
            shot.xg * (branch === 'futbol' ? 0.22 : 0.42),
            branch === 'fifa' ? 0.018 : 0.012,
            branch === 'futbol' ? 0.055 : 0.14
          )
        },
        forcedOneOnOne: false,
        openAdvance,
        pressure,
        forwardLaneOpenness
      };
    }

    const clearShot = shot.canShoot &&
      shot.distanceToGoal < (branch === 'fifa' ? 26 : 22) &&
      pressure < (branch === 'fifa' ? 0.2 : 0.24);
    if (clearShot && random() < (branch === 'fifa' ? 0.88 : 0.94)) {
      return { type: 'shot', shot, forcedOneOnOne: false, openAdvance, pressure, forwardLaneOpenness };
    }

    const carrierProfile = profileOf(carrier);
    const carryQuality =
      normalizedSkill(carrierProfile, 'dribbling') * 0.62 +
      normalizedSkill(carrierProfile, 'pace') * 0.38;
    const carryChance = branch === 'fifa'
      ? 0.34 + carryQuality * 0.22
      : 0.44 + carryQuality * 0.24;
    if (openAdvance && progress < 0.82 && random() < carryChance) {
      return { type: 'carry', shot, openAdvance, pressure, forwardLaneOpenness };
    }

    return { type: 'pass', shot, openAdvance, pressure, forwardLaneOpenness };
  }

  function chooseSupportRun(carrier, receiver, progress, lane) {
    const candidates = outfieldAttackers
      .filter(player => player !== carrier && player !== receiver)
      .map(player => {
        const index = attackers.indexOf(player);
        const band = roleBand(player, index, branch);
        const current = pointOf(player);
        const wide = Math.abs(current.y - 50) > 15;
        let runKind = 'support';
        if (progress > 0.68 && band >= 3) runKind = 'box-run';
        else if (wide && progress > 0.42) runKind = 'overlap';
        else if (band >= 2 && progress > 0.5) runKind = 'underlap';
        const destination = {
          x: clamp(pointOf(receiver).x + direction * (runKind === 'box-run' ? 5 : runKind === 'support' ? -6 : 2.5), 9, 91),
          y: clamp(
            runKind === 'overlap'
              ? (current.y < 50 ? lane - 12 : lane + 12)
              : runKind === 'underlap'
                ? 50 + (lane - 50) * 0.35
                : current.y * 0.55 + lane * 0.45,
            11,
            89
          )
        };
        const score = (1 - pressureAt(destination)) * 1.4 + band * 0.14 + random() * 0.45;
        return { player, runKind, destination, score };
      })
      .sort((a, b) => b.score - a.score);
    const selected = candidates[0] || null;
    if (selected) setPoint(selected.player, selected.destination);
    return selected;
  }

  function planOffBallRoles(carrier, lane = 50, phase = 'build-up') {
    const carrierPoint = pointOf(carrier);
    const available = outfieldAttackers.filter(player => player !== carrier);
    const assignments = [];
    const remaining = [...available];
    const take = selector => {
      if (!remaining.length) return null;
      const selected = [...remaining].sort(selector)[0];
      remaining.splice(remaining.indexOf(selected), 1);
      return selected;
    };
    const indexOf = player => attackers.indexOf(player);
    const bandOf = player => roleBand(player, indexOf(player), branch);
    const homeOf = player => homePoint(player, indexOf(player), teamId, branch);
    const addAssignment = (player, role, order = 0) => {
      if (!player) return;
      assignments.push({ player, role, order });
    };

    if (branch === 'futbol') {
      const widthRole = lane <= 50 ? 'width-right' : 'width-left';
      const safetyX = teamId === 1
        ? Math.min(carrierPoint.x - 20, 44)
        : Math.max(carrierPoint.x + 20, 56);
      const slots = [
        {
          role: widthRole,
          order: 0,
          destination: {
            x: carrierPoint.x - direction,
            y: widthRole === 'width-left' ? 18 : 82
          }
        },
        {
          role: 'runner',
          order: 0,
          destination: {
            x: carrierPoint.x + direction * 9,
            y: clamp(50 + (lane <= 50 ? 9 : -9), 24, 76)
          }
        },
        {
          role: 'support',
          order: 0,
          destination: {
            x: carrierPoint.x - direction * 6.5,
            y: clamp(carrierPoint.y + (lane <= 50 ? 11 : -11), 18, 82)
          }
        },
        {
          role: 'balance',
          order: 0,
          destination: {
            x: safetyX,
            y: clamp(50 + (carrierPoint.y <= 50 ? 13 : -13), 24, 76)
          }
        }
      ];
      const unassignedPlayers = [...remaining];
      const unassignedSlots = [...slots];
      while (unassignedPlayers.length && unassignedSlots.length) {
        let best = null;
        unassignedPlayers.forEach(player => {
          const playerPoint = pointOf(player);
          const playerBand = bandOf(player);
          unassignedSlots.forEach(slot => {
            const rolePenalty = slot.role === 'runner'
              ? (4 - playerBand) * 2.4
              : slot.role === 'balance'
                ? Math.max(0, playerBand - 1) * 2.8
                : slot.role === 'support'
                  ? Math.abs(playerBand - 2.5) * 1.2
                  : Math.abs(homeOf(player).y - slot.destination.y) * 0.08;
            const score = distance(playerPoint, slot.destination) + rolePenalty;
            if (!best || score < best.score) best = { player, slot, score };
          });
        });
        if (!best) break;
        assignments.push({
          player: best.player,
          role: best.slot.role,
          order: best.slot.order,
          destination: { ...best.slot.destination }
        });
        unassignedPlayers.splice(unassignedPlayers.indexOf(best.player), 1);
        unassignedSlots.splice(unassignedSlots.indexOf(best.slot), 1);
      }
      remaining.splice(0, remaining.length);
    } else {
      addAssignment(take((a, b) => homeOf(a).y - homeOf(b).y), 'width-left');
      addAssignment(take((a, b) => homeOf(b).y - homeOf(a).y), 'width-right');
      addAssignment(take((a, b) => bandOf(b) - bandOf(a)), 'runner', 0);
      addAssignment(take((a, b) => bandOf(b) - bandOf(a)), 'runner', 1);
      addAssignment(take((a, b) => bandOf(a) - bandOf(b)), 'balance', 0);
      addAssignment(take((a, b) => bandOf(a) - bandOf(b)), 'balance', 1);
      addAssignment(take((a, b) => bandOf(a) - bandOf(b)), 'balance', 2);
      remaining.forEach((player, index) => {
        addAssignment(
          player,
          index < 2 ? 'support' : (index % 2 === 0 ? 'half-space-left' : 'half-space-right'),
          index
        );
      });
    }

    const wideY = branch === 'fifa' ? { left: 15, right: 85 } : { left: 18, right: 82 };
    assignments.forEach(assignment => {
      if (assignment.destination) {
        assignment.destination = {
          x: clamp(assignment.destination.x, 8, 92),
          y: clamp(assignment.destination.y, 11, 89)
        };
        return;
      }
      const playerHome = homeOf(assignment.player);
      const band = bandOf(assignment.player);
      const side = playerHome.y <= 50 ? -1 : 1;
      let destination;
      if (assignment.role === 'width-left' || assignment.role === 'width-right') {
        destination = {
          x: carrierPoint.x + direction * (band >= 3 ? 5.5 : band === 2 ? 1.5 : -2),
          y: assignment.role === 'width-left' ? wideY.left : wideY.right
        };
      } else if (assignment.role === 'runner') {
        destination = {
          x: carrierPoint.x + direction * (11 + assignment.order * 4),
          y: clamp(50 + side * (assignment.order ? 15 : 8), 22, 78)
        };
      } else if (assignment.role === 'support') {
        destination = {
          x: carrierPoint.x - direction * (7 + assignment.order * 2.5),
          y: carrierPoint.y + side * (10 + assignment.order * 2)
        };
      } else if (assignment.role === 'balance') {
        destination = {
          x: carrierPoint.x - direction * (17 + assignment.order * 4),
          y: playerHome.y * 0.72 + 50 * 0.28
        };
      } else {
        destination = {
          x: carrierPoint.x + direction * (3 + assignment.order),
          y: assignment.role.endsWith('left') ? 34 : 66
        };
      }
      assignment.destination = {
        x: clamp(destination.x, 8, 92),
        y: clamp(destination.y, 11, 89)
      };
    });

    const minimumDistance = branch === 'fifa' ? 5.2 : 7.2;
    let corrections = 0;
    const nodes = [{ fixed: true, destination: carrierPoint }, ...assignments.map(assignment => ({
      fixed: false,
      assignment,
      destination: assignment.destination
    }))];
    for (let iteration = 0; iteration < 5; iteration++) {
      for (let left = 0; left < nodes.length; left++) {
        for (let right = left + 1; right < nodes.length; right++) {
          const a = nodes[left];
          const b = nodes[right];
          let dx = b.destination.x - a.destination.x;
          let dy = b.destination.y - a.destination.y;
          let gap = Math.hypot(dx, dy);
          if (gap >= minimumDistance) continue;
          if (gap < 0.01) {
            dx = direction * 0.35;
            dy = ((left + right) % 2 === 0 ? 1 : -1);
            gap = Math.hypot(dx, dy);
          }
          const required = minimumDistance - gap + 0.2;
          const pushX = (dx / gap) * required * 0.28;
          const pushY = (dy / gap) * required * 0.72;
          if (!a.fixed) {
            a.destination.x = clamp(a.destination.x - pushX * 0.5, 8, 92);
            a.destination.y = clamp(a.destination.y - pushY * 0.5, 11, 89);
          }
          if (!b.fixed) {
            b.destination.x = clamp(b.destination.x + pushX * (a.fixed ? 1 : 0.5), 8, 92);
            b.destination.y = clamp(b.destination.y + pushY * (a.fixed ? 1 : 0.5), 11, 89);
          }
          corrections++;
        }
      }
    }

    assignments.forEach(assignment => {
      setPoint(assignment.player, assignment.destination);
    });
    if (sharedState?.recordOffBallPlan) {
      sharedState.recordOffBallPlan(teamId, assignments, corrections);
    }
    return assignments.map(assignment => ({
      ...assignment,
      phase
    }));
  }

  function passInterceptionRisk(carrier, receiverMetrics) {
    if (!receiverMetrics) return { risk: 1, expectedSuccess: 0, defender: null };
    const origin = pointOf(carrier);
    const destination = pointOf(receiverMetrics.player);
    const defender = outfieldDefenders
      .map(player => ({
        player,
        point: pointOf(player),
        lineDistance: pointSegmentDistance(pointOf(player), origin, destination)
      }))
      .sort((a, b) => a.lineDistance - b.lineDistance)[0] || null;
    const passerProfile = profileOf(carrier);
    const receiverProfile = profileOf(receiverMetrics.player);
    const defenderProfile = defender ? profileOf(defender.player) : null;
    const passerQuality =
      normalizedSkill(passerProfile, 'passing') * 0.68 +
      normalizedSkill(passerProfile, 'vision') * 0.32;
    const receiverQuality =
      normalizedSkill(receiverProfile, 'reaction') * 0.58 +
      normalizedSkill(receiverProfile, 'composure') * 0.42;
    const defenderQuality = defenderProfile
      ? normalizedSkill(defenderProfile, 'defending') * 0.72 +
        normalizedSkill(defenderProfile, 'reaction') * 0.28
      : 0.4;
    const passDistance = distance(origin, destination);
    const carrierPressure = Number.isFinite(receiverMetrics.carrierPressure)
      ? receiverMetrics.carrierPressure
      : pressureAt(origin);
    const receivingPressure = 1 - receiverMetrics.space;
    const progressiveDifficulty = Math.max(0, receiverMetrics.forwardGain) * 0.04;
    const expectedSuccess = clamp(
      1 +
      (branch === 'futbol' ? 0.025 : 0) +
      passerQuality * 0.085 +
      receiverQuality * 0.04 -
      passDistance * (branch === 'futbol' ? 0.0018 : 0.0023) -
      (1 - receiverMetrics.laneOpenness) * 0.1 -
      carrierPressure * 0.05 -
      receivingPressure * 0.04 -
      defenderQuality * 0.02 -
      progressiveDifficulty * 0.625,
      branch === 'futbol' ? 0.68 : 0.58,
      0.992
    );
    return {
      risk: 1 - expectedSuccess,
      expectedSuccess,
      passDistance,
      carrierPressure,
      receivingPressure,
      defender: defender?.player || null
    };
  }

  function passInterceptionPoint(carrier, receiver, interceptor) {
    const origin = pointOf(carrier);
    const destination = pointOf(receiver);
    const defenderPoint = interceptor ? pointOf(interceptor) : {
      x: origin.x + (destination.x - origin.x) * 0.58,
      y: origin.y + (destination.y - origin.y) * 0.58
    };
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const lengthSquared = dx * dx + dy * dy;
    const projected = lengthSquared > 0.001
      ? ((defenderPoint.x - origin.x) * dx + (defenderPoint.y - origin.y) * dy) / lengthSquared
      : 0.5;
    // Top alıcıya ulaşmadan önce pas koridorunda kesilir. Uç noktalardan uzak
    // tutmak, hem pasörün ayağında hem alıcının üzerinde sonradan geri sıçramayı
    // engeller.
    const t = clamp(projected, 0.2, 0.82);
    return {
      x: clamp(origin.x + dx * t, 6, 94),
      y: clamp(origin.y + dy * t, 9, 91),
      progress: t
    };
  }

  function passActionValue(carrier, receiverMetrics, completed = true) {
    if (!carrier || !receiverMetrics?.player) return 0;
    const origin = pointOf(carrier);
    const destination = pointOf(receiverMetrics.player);
    const startThreat = threatAt(origin);
    const endThreat = threatAt(destination);
    if (!completed) {
      return -clamp(0.025 + startThreat * 0.24, 0.025, 0.28);
    }
    const progressionBonus = Math.max(0, receiverMetrics.forwardGain) * 0.075;
    const lineBreakBonus = receiverMetrics.forwardGain > 0.22
      ? receiverMetrics.laneOpenness * 0.035
      : 0;
    return clamp(
      endThreat - startThreat + progressionBonus + lineBreakBonus,
      -0.24,
      0.55
    );
  }

  function movementActionValue(origin, destination, completed = true) {
    if (!origin || !destination) return 0;
    const startThreat = threatAt(origin);
    if (!completed) return -clamp(0.035 + startThreat * 0.27, 0.035, 0.3);
    const endThreat = threatAt(destination);
    return clamp(endThreat - startThreat + Math.max(0, endThreat - startThreat) * 0.18, -0.2, 0.48);
  }

  function shotActionValue(shot) {
    if (!shot) return 0;
    const startThreat = threatAt(shot.point);
    return clamp(shot.xg - startThreat * 0.22, 0.01, 0.78);
  }

  function dribbleDuel(carrier) {
    const origin = pointOf(carrier);
    const nearest = nearestDefender(origin);
    if (!nearest) return { attempted: false, won: true, defender: null, pressure: 0 };
    const pressure = pressureAt(origin);
    const attackerProfile = profileOf(carrier);
    const defenderProfile = profileOf(nearest.player);
    const attackerQuality =
      normalizedSkill(attackerProfile, 'dribbling') * 0.78 +
      normalizedSkill(attackerProfile, 'pace') * 0.22;
    const defenderQuality =
      normalizedSkill(defenderProfile, 'defending') * 0.76 +
      normalizedSkill(defenderProfile, 'reaction') * 0.24;
    const attempted = nearest.distance < (branch === 'fifa' ? 9 : 11) || random() < 0.45;
    const winChance = clamp(0.58 + attackerQuality * 0.25 - defenderQuality * 0.21 - pressure * 0.13, 0.22, 0.86);
    return { attempted, won: !attempted || random() < winChance, defender: nearest.player, pressure };
  }

  function moveCarrierAfterDribble(carrier, lane, side) {
    const current = pointOf(carrier);
    return setPoint(carrier, {
      x: current.x + direction * (branch === 'fifa' ? 6 : 7.5),
      y: current.y * 0.65 + clamp(lane + side * 4, 16, 84) * 0.35
    });
  }

  function shotContext(carrier, buildQuality, lane, forceOneOnOne = false) {
    const point = pointOf(carrier);
    const progress = progressAt(point);
    const pressure = pressureAt(point);
    const goalX = teamId === 1 ? 100 : 0;
    const distanceToGoal = Math.hypot(goalX - point.x, (50 - point.y) * 0.68);
    const angleQuality = clamp(1 - Math.abs(point.y - 50) / 45, 0.18, 1);
    const shooterProfile = profileOf(carrier);
    const finishing = normalizedSkill(shooterProfile, 'finishing');
    const composure = normalizedSkill(shooterProfile, 'composure');
    const carrierIndex = attackers.indexOf(carrier);
    const shooterBand = roleBand(carrier, carrierIndex, branch);
    const inShootingZone = progress > (branch === 'fifa' ? 0.72 : 0.76) &&
      distanceToGoal < (branch === 'fifa' ? 29 : 22) &&
      angleQuality > (branch === 'fifa' ? 0.2 : 0.28);
    const canShoot = inShootingZone && (shooterBand >= 3 || forceOneOnOne);
    const longRangeEligible =
      !inShootingZone &&
      progress > (branch === 'fifa' ? 0.67 : 0.72) &&
      distanceToGoal < (branch === 'fifa' ? 34 : 27) &&
      pressure < (branch === 'fifa' ? 0.14 : 0.12) &&
      angleQuality > (branch === 'fifa' ? 0.28 : 0.52) &&
      shooterBand >= 3 &&
      finishing > (branch === 'fifa' ? 0.55 : 0.65) &&
      composure > (branch === 'fifa' ? 0.48 : 0.6);
    const oneOnOne = canShoot && (
      forceOneOnOne ||
      (
        distanceToGoal < (branch === 'fifa' ? 24 : 18.5) &&
        pressure < (branch === 'fifa' ? 0.22 : 0.2) &&
        angleQuality > (branch === 'fifa' ? 0.38 : 0.5)
      )
    );
    const base = branch === 'fifa' ? 0.075 : 0.17;
    let xg = clamp(
      base +
      progress * (branch === 'fifa' ? 0.16 : 0.2) +
      angleQuality * (branch === 'fifa' ? 0.1 : 0.12) +
      buildQuality * (branch === 'fifa' ? 0.12 : 0.14) +
      finishing * (branch === 'fifa' ? 0.13 : 0.16) +
      composure * (branch === 'fifa' ? 0.05 : 0.07) -
      pressure * (branch === 'fifa' ? 0.1 : 0.14) -
      clamp(
        (distanceToGoal - (branch === 'futbol' ? 12 : 18)) /
          (branch === 'futbol' ? 42 : 80),
        0,
        branch === 'futbol' ? 0.24 : 0.16
      ),
      branch === 'fifa' ? 0.025 : 0.06,
      branch === 'fifa' ? 0.48 : 0.88
    );
    if (oneOnOne) {
      xg = Math.max(
        xg,
        branch === 'fifa'
          ? 0.43 + finishing * 0.19 + composure * 0.05
          : 0.56 + finishing * 0.23 + composure * 0.07
      );
    }
    const cover = nearestDefender(point);
    return {
      canShoot,
      longRangeEligible,
      longRange: false,
      oneOnOne,
      point,
      progress,
      pressure,
      distanceToGoal,
      angleQuality,
      shooterBand,
      xg,
      shooterProfile,
      defender: cover?.player || null,
      lane: clamp(lane * 0.58 + point.y * 0.42, 30, 70)
    };
  }

  function defensiveContext(carrier) {
    const point = pointOf(carrier);
    const cover = nearestDefender(point);
    const attackerProfile = profileOf(carrier);
    const defenderProfile = cover ? profileOf(cover.player) : null;
    const attackerControl =
      normalizedSkill(attackerProfile, 'dribbling') * 0.62 +
      normalizedSkill(attackerProfile, 'composure') * 0.38;
    const defenderStrength = defenderProfile
      ? normalizedSkill(defenderProfile, 'defending') * 0.7 +
        normalizedSkill(defenderProfile, 'reaction') * 0.3
      : 0.4;
    return {
      defender: cover?.player || null,
      defenderProfile,
      attackerProfile,
      attackerControl,
      defenderStrength,
      edge: clamp(defenderStrength - attackerControl, -1, 1)
    };
  }

  function preparePossession() {
    return sharedState?.preparePossession
      ? sharedState.preparePossession(teamId)
      : chooseInitialCarrier();
  }

  function recordPossession(player, phase) {
    if (sharedState?.recordPossession) sharedState.recordPossession(player, phase);
  }

  function recordTurnover(player, point, reason) {
    if (sharedState?.recordTurnover) sharedState.recordTurnover(player, point, reason);
  }

  function recordSetPiece(possessionTeamId, point) {
    if (sharedState?.recordSetPiece) sharedState.recordSetPiece(possessionTeamId, point);
  }

  function recordRestart(possessionTeamId, type) {
    if (sharedState?.recordRestart) sharedState.recordRestart(possessionTeamId, type);
  }

  function recordDecision(decision) {
    if (sharedState?.recordDecision) sharedState.recordDecision(decision);
  }

  return {
    pointOf,
    setPoint,
    progressAt,
    threatAt,
    pressureAt,
    preparePossession,
    chooseInitialCarrier,
    chooseReceiver,
    onBallDecision,
    chooseSupportRun,
    planOffBallRoles,
    planDefensiveRoles,
    passInterceptionRisk,
    passInterceptionPoint,
    passActionValue,
    movementActionValue,
    shotActionValue,
    dribbleDuel,
    moveCarrierAfterDribble,
    shotContext,
    defensiveContext,
    recordPossession,
    recordTurnover,
    recordSetPiece,
    recordRestart,
    recordDecision,
    random
  };
}

module.exports = {
  clamp,
  createFootballIntelligence,
  createFootballMatchState,
  homePoint,
  roleBand
};
