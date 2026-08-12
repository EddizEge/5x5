const { createSeededRng } = require('./seeded-rng');
const { buildFootballV2Stats } = require('./football-v2-stats');

const WORLD_TICK_RATE = 20;
const SNAPSHOT_RATE = 10;
const FULL_MATCH_SNAPSHOT_RATE = 3;
const DEFAULT_DURATION_SECONDS = 30;
const FULL_MATCH_MINUTES = Object.freeze({
  futbol: 50,
  fifa: 90
});
const FULL_MATCH_SIMULATION_SECONDS = Object.freeze({
  futbol: 570,
  fifa: 330
});
const FULL_MATCH_PLAYBACK_SECONDS = Object.freeze({
  futbol: 240,
  fifa: 180
});
const DT = 1 / WORLD_TICK_RATE;
const ROLE_REPLAN_TICKS = WORLD_TICK_RATE / 2;
const DECISION_TICKS = WORLD_TICK_RATE / 4;
const ROLE_MIN_DWELL_TICKS = Math.round(WORLD_TICK_RATE * 1.5);
const ROLE_ASSIGNMENT_IMPROVEMENT = 18;
const TRANSITION_TICKS = Math.round(WORLD_TICK_RATE * 1.25);
const GOAL_CELEBRATION_TICKS = Math.round(WORLD_TICK_RATE * 4);
const KICKOFF_READY_TICKS = Math.round(WORLD_TICK_RATE * 1.15);
const ATTACK_PLAN_MAX_TICKS = Math.round(WORLD_TICK_RATE * 9);
const FIELD = Object.freeze({
  minX: 3,
  maxX: 97,
  minY: 7,
  maxY: 93
});
const GOAL = Object.freeze({
  leftLineX: 0,
  rightLineX: 100,
  netDepth: 1.2,
  fifaMinY: 43.5,
  fifaMaxY: 56.5,
  futbolMinY: 40.5,
  futbolMaxY: 59.5
});
const PHASE_NAMES = Object.freeze({
  'attack-transition': 'hücuma geçiş',
  'defense-transition': 'geri koşu',
  'build-up': 'geriden kurulum',
  progression: 'oyunu ilerletme',
  'final-third': 'son bölge',
  'settled-defense': 'yerleşik savunma'
});
const FIFA_FORMATION = Object.freeze([
  { position: 'LB', x: 22, y: 15 },
  { position: 'LCB', x: 18, y: 38 },
  { position: 'RCB', x: 18, y: 62 },
  { position: 'RB', x: 22, y: 85 },
  { position: 'LDM', x: 35, y: 35 },
  { position: 'RDM', x: 35, y: 65 },
  { position: 'LAM', x: 50, y: 20 },
  { position: 'CAM', x: 52, y: 50 },
  { position: 'RAM', x: 50, y: 80 },
  { position: 'ST', x: 66, y: 50 }
]);
const FIFA_CHARACTER_SLOTS = Object.freeze([1, 4, 6, 7, 9]);
const FIFA_MARKING_ROLES = Object.freeze([
  'midfield-left',
  'midfield-center',
  'midfield-right',
  'back-left',
  'back-center-left',
  'back-center-right',
  'back-right'
]);
const ATTACK_PLAN_NAMES = Object.freeze({
  'central-combination': 'merkez kombinasyonu',
  'wide-overlap': 'kanat bindirmesi',
  'through-ball': 'savunma arkası koşu',
  'switch-play': 'ters kanat',
  cutback: 'geriye çıkarma',
  counter: 'hızlı hücum',
  recycle: 'yeniden kurulum'
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function length(vector) {
  return Math.hypot(vector.x, vector.y);
}

function normalize(vector) {
  const magnitude = length(vector);
  if (magnitude < 0.0001) return { x: 0, y: 0 };
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function limit(vector, maximum) {
  const magnitude = length(vector);
  if (magnitude <= maximum || magnitude < 0.0001) return vector;
  const ratio = maximum / magnitude;
  return { x: vector.x * ratio, y: vector.y * ratio };
}

function normalizeAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function rotateAngleTowards(current, target, maximumTurn) {
  return current + clamp(normalizeAngle(target - current), -maximumTurn, maximumTurn);
}

function goalMouth(branch) {
  return branch === 'fifa'
    ? { minY: GOAL.fifaMinY, maxY: GOAL.fifaMaxY }
    : { minY: GOAL.futbolMinY, maxY: GOAL.futbolMaxY };
}

function chooseWeighted(world, candidates) {
  const total = candidates.reduce((sum, candidate) => sum + Math.max(0, candidate.weight), 0);
  if (total <= 0) return candidates[0]?.value || null;
  let roll = world.rng() * total;
  for (const candidate of candidates) {
    roll -= Math.max(0, candidate.weight);
    if (roll <= 0) return candidate.value;
  }
  return candidates[candidates.length - 1]?.value || null;
}

function chooseAttackPlan(world, teamId, reason = 'possession') {
  const state = world.attackPlans[teamId];
  const phase = phaseForTeam(world, teamId);
  const progress = teamId === 1 ? world.ball.x : 100 - world.ball.x;
  const previous = state.type;
  const recent = state.history.slice(-2);
  const candidates = [
    { value: 'central-combination', weight: phase === 'progression' ? 4.2 : 2.7 },
    { value: 'wide-overlap', weight: Math.abs(world.ball.y - 50) > 18 ? 4.4 : 2.8 },
    { value: 'through-ball', weight: progress > 38 ? 4.1 : 2.1 },
    { value: 'switch-play', weight: Math.abs(world.ball.y - 50) > 14 ? 3.8 : 2.2 },
    { value: 'cutback', weight: progress > 68 ? 4.5 : 0.8 },
    { value: 'counter', weight: phase === 'attack-transition' ? 5.4 : 1.4 },
    { value: 'recycle', weight: progress < 42 ? 3.7 : 1.6 }
  ].map(candidate => ({
    ...candidate,
    weight: recent.includes(candidate.value)
      ? candidate.weight * (candidate.value === previous ? 0.08 : 0.28)
      : candidate.weight
  }));
  const type = chooseWeighted(world, candidates) || 'central-combination';
  const targetLane = type === 'switch-play'
    ? world.ball.y < 50 ? 'right' : 'left'
    : type === 'wide-overlap'
      ? world.rng() < 0.5 ? 'left' : 'right'
      : type === 'cutback'
        ? world.ball.y < 50 ? 'left' : 'right'
        : 'center';
  if (previous === type) world.telemetry.repeatedAttackPlans += 1;
  state.type = type;
  state.targetLane = targetLane;
  state.sinceTick = world.tick;
  state.sequenceIndex = 0;
  state.lastPasserId = null;
  state.lastReceiverId = null;
  state.history.push(type);
  state.history = state.history.slice(-5);
  world.telemetry.attackPlans += 1;
  world.telemetry.attackPlanTypes[type] = (world.telemetry.attackPlanTypes[type] || 0) + 1;
  if (world.tick > 0) {
    world.events.push({
      t: round(world.tick * DT, 2),
      type: 'attack-plan',
      teamId,
      plan: type,
      lane: targetLane,
      reason,
      text: `${teamId === 1 ? 'Mavi Takım' : 'Kırmızı Takım'} ${ATTACK_PLAN_NAMES[type]} planına geçti.`
    });
  }
  return state;
}

function ensureAttackPlan(world, teamId) {
  const state = world.attackPlans[teamId];
  if (
    !state.type ||
    world.tick - state.sinceTick >= ATTACK_PLAN_MAX_TICKS ||
    state.sequenceIndex >= 6
  ) {
    return chooseAttackPlan(world, teamId, state.type ? 'plan-complete' : 'possession');
  }
  return state;
}

function segmentCrossingAtX(from, to, x) {
  const dx = to.x - from.x;
  if (Math.abs(dx) < 0.0001) return null;
  const progress = (x - from.x) / dx;
  if (progress < 0 || progress > 1) return null;
  return {
    progress,
    x,
    y: from.y + (to.y - from.y) * progress
  };
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function stablePlayerId(teamId, player, index) {
  const sourceId = player.id ?? player.character_era_id ?? index + 1;
  return `t${teamId}-${sourceId}-${index}`;
}

function stableIdentityNumber(value) {
  return String(value ?? '')
    .split('')
    .reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 10007, 17);
}

function createPlayerState(teamId, character, index, position, branch) {
  const direction = teamId === 1 ? 1 : -1;
  const ratingKey = branch === 'fifa' ? 'rating_fifa' : 'rating_futbol';
  const rating = clamp(Number(character.rating ?? character[ratingKey] ?? 70), 20, 100);
  const identityOffset = (
    (stableIdentityNumber(character.id ?? character.character_era_id ?? index + 1) * 17 + index * 11) % 7
  ) - 3;
  const attackingSlot = branch === 'fifa' ? index >= 6 : index >= 2;
  const defensiveSlot = branch === 'fifa' ? index <= 5 : index <= 1;
  const initialX = teamId === 1 ? position.x : 100 - position.x;
  return {
    id: stablePlayerId(teamId, character, index),
    sourceId: character.id ?? character.character_era_id ?? index + 1,
    teamId,
    direction,
    branch,
    name: character.name || `Oyuncu ${index + 1}`,
    emoji: character.avatar_emoji || '⚽',
    rating,
    positionCode: position.position || `P${index + 1}`,
    isBot: Boolean(character.isBot),
    isGoalkeeper: false,
    naturalIndex: index,
    position: { x: initialX, y: position.y },
    previousPosition: { x: initialX, y: position.y },
    velocity: { x: 0, y: 0 },
    target: { x: initialX, y: position.y },
    zone: { x: initialX, y: position.y, rx: 5, ry: 8 },
    role: 'shape',
    markTargetId: null,
    responsibility: 'shape',
    previousRole: 'shape',
    roleSinceTick: 0,
    roleDurations: {},
    roleStints: [],
    roleSwitchCount: 0,
    maxSpeed: 6.6 + ((rating - 50) / 50) * 1.45,
    maxAcceleration: 17 + ((rating - 50) / 50) * 2.5,
    reaction: clamp(0.34 - ((rating - 50) / 50) * 0.08, 0.22, 0.38),
    dribbling: clamp(rating + (attackingSlot ? 4 : -2) + identityOffset, 20, 100),
    defending: clamp(rating + (defensiveSlot ? 5 : -4) - identityOffset, 20, 100),
    strength: clamp(rating + (defensiveSlot ? 3 : 0) + identityOffset * 0.7, 20, 100),
    composure: clamp(rating + (attackingSlot ? 2 : 0) - identityOffset * 0.5, 20, 100),
    finishing: clamp(rating + (attackingSlot ? 6 : -7) + identityOffset * 0.8, 20, 100),
    goalkeeping: 20,
    shieldingUntilTick: 0,
    stunnedUntilTick: 0,
    goalkeeperDecision: null
  };
}

function createOutfieldPlayers(teamId, characters, branch) {
  if (branch === 'fifa') {
    let characterIndex = 0;
    return FIFA_FORMATION.map((position, slotIndex) => {
      const usesCharacter = FIFA_CHARACTER_SLOTS.includes(slotIndex);
      const character = usesCharacter
        ? characters[characterIndex++]
        : {
            id: `bot-${teamId}-${position.position}`,
            name: `Bot ${position.position}`,
            avatar_emoji: '◦',
            rating: 64,
            isBot: true
          };
      return createPlayerState(teamId, character, slotIndex, position, branch);
    });
  }

  const initialX = [18, 20, 31, 37, 39];
  const initialY = [32, 68, 50, 22, 78];
  return characters.slice(0, 5).map((character, index) => createPlayerState(
    teamId,
    character,
    index,
    { x: initialX[index], y: initialY[index], position: `HS${index + 1}` },
    branch
  ));
}

function createGoalkeeper(teamId, branch) {
  const x = teamId === 1 ? 5.5 : 94.5;
  return {
    id: `t${teamId}-keeper`,
    sourceId: `keeper-${teamId}`,
    teamId,
    direction: teamId === 1 ? 1 : -1,
    branch,
    name: 'Bot Kaleci',
    emoji: '🧤',
    rating: 66,
    positionCode: 'GK',
    isBot: true,
    isGoalkeeper: true,
    naturalIndex: branch === 'fifa' ? 10 : 5,
    position: { x, y: 50 },
    previousPosition: { x, y: 50 },
    velocity: { x: 0, y: 0 },
    target: { x, y: 50 },
    zone: { x, y: 50, rx: 1.4, ry: 12 },
    role: 'goalkeeper',
    markTargetId: null,
    responsibility: 'goalkeeper',
    previousRole: 'goalkeeper',
    roleSinceTick: 0,
    roleDurations: {},
    roleStints: [],
    roleSwitchCount: 0,
    maxSpeed: 5.2,
    maxAcceleration: 15,
    reaction: 0.28,
    dribbling: 38,
    defending: 62,
    strength: 70,
    composure: 64,
    finishing: 24,
    goalkeeping: branch === 'fifa' ? 74 : 70,
    shieldingUntilTick: 0,
    stunnedUntilTick: 0,
    goalkeeperDecision: 'line'
  };
}

function zonePoint(zone, xOffset = 0, yOffset = 0) {
  return {
    x: clamp(zone.x + zone.rx * xOffset, FIELD.minX, FIELD.maxX),
    y: clamp(zone.y + zone.ry * yOffset, FIELD.minY, FIELD.maxY)
  };
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return distance(point, start);
  const progress = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1
  );
  return distance(point, {
    x: start.x + dx * progress,
    y: start.y + dy * progress
  });
}

function lanePressure(point, from, opponents) {
  return opponents.reduce((total, opponent) => {
    const laneDistance = pointSegmentDistance(opponent.position, from, point);
    return total + Math.max(0, 5.5 - laneDistance);
  }, 0);
}

function choosePointInsideZone(player, zone, teammates, opponents, ball, attacking) {
  const samples = [
    [0, 0],
    [-0.65, 0],
    [0.65, 0],
    [0, -0.65],
    [0, 0.65],
    [-0.55, -0.55],
    [-0.55, 0.55],
    [0.55, -0.55],
    [0.55, 0.55]
  ];

  let best = zonePoint(zone);
  let bestScore = Number.POSITIVE_INFINITY;

  samples.forEach(([xOffset, yOffset]) => {
    const candidate = zonePoint(zone, xOffset, yOffset);
    const travelCost = distance(player.position, candidate) * 0.38;
    const nearestMate = teammates
      .filter(teammate => teammate.id !== player.id)
      .reduce((minimum, teammate) => Math.min(minimum, distance(teammate.position, candidate)), 100);
    const spacingPenalty = nearestMate < 8 ? (8 - nearestMate) * 4.2 : 0;
    const passLanePenalty = attacking ? lanePressure(candidate, ball, opponents) * 0.8 : 0;
    const goalSidePenalty = attacking
      ? 0
      : Math.max(0, player.direction * (candidate.x - ball.x)) * 1.4;
    const score = travelCost + spacingPenalty + passLanePenalty + goalSidePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return best;
}

function fifaAttackingZones(teamId, ball, phase) {
  const direction = teamId === 1 ? 1 : -1;
  const transitionBoost = phase === 'attack-transition' ? 6 : 0;
  const finalThirdDrop = phase === 'final-third' ? 5 : 0;
  const supportX = clamp(ball.x - direction * 8, 16, 84);
  const wideX = clamp(ball.x + direction * (5 + transitionBoost), 20, 82);
  const runX = clamp(ball.x + direction * (15 - finalThirdDrop), 28, 88);
  const holdingX = clamp(ball.x - direction * 20, 14, 86);
  const restX = clamp(ball.x - direction * 31, 12, 88);
  return [
    { role: 'support-left', x: supportX, y: clamp(ball.y - 12, 24, 58), rx: 5, ry: 7 },
    { role: 'support-right', x: supportX, y: clamp(ball.y + 12, 42, 76), rx: 5, ry: 7 },
    { role: 'wide-left', x: wideX, y: 14, rx: 7, ry: 5.5 },
    { role: 'wide-right', x: wideX, y: 86, rx: 7, ry: 5.5 },
    { role: 'runner-left', x: runX, y: 34, rx: 6, ry: 8 },
    { role: 'runner-right', x: runX, y: 66, rx: 6, ry: 8 },
    { role: 'holding-left', x: holdingX, y: 36, rx: 5.5, ry: 8 },
    { role: 'holding-right', x: holdingX, y: 64, rx: 5.5, ry: 8 },
    { role: 'rest-defense', x: restX, y: 50, rx: 5, ry: 12 }
  ];
}

function applyAttackPlanToZones(zones, teamId, ball, plan, branch) {
  if (!plan?.type) return zones;
  const direction = teamId === 1 ? 1 : -1;
  const targetY = plan.targetLane === 'left'
    ? 18
    : plan.targetLane === 'right'
      ? 82
      : 50;
  return zones.map(zone => {
    const adjusted = { ...zone };
    const isWide = zone.role === 'wide-outlet' || zone.role.startsWith('wide-');
    const isRunner = zone.role === 'depth-run' || zone.role.startsWith('runner-');
    const isSupport = zone.role === 'close-support' || zone.role.startsWith('support-');
    if (plan.type === 'wide-overlap' && isWide) {
      adjusted.x = clamp(zone.x + direction * 8, 14, 88);
      adjusted.y = targetY;
    } else if (plan.type === 'switch-play' && isWide) {
      adjusted.x = clamp(zone.x + direction * 4, 14, 86);
      adjusted.y = targetY;
      adjusted.ry = Math.min(adjusted.ry, 5);
    } else if (plan.type === 'through-ball' && isRunner) {
      adjusted.x = clamp(zone.x + direction * (branch === 'fifa' ? 8 : 6), 18, 91);
      adjusted.y = clamp(50 + (zone.y - 50) * 0.55, 28, 72);
    } else if (plan.type === 'central-combination' && isSupport) {
      adjusted.y = clamp(50 + (zone.y - 50) * 0.45, 34, 66);
      adjusted.x = clamp(ball.x - direction * 5, 14, 86);
    } else if (plan.type === 'cutback') {
      if (isWide) {
        adjusted.x = clamp(ball.x + direction * 7, 14, 91);
        adjusted.y = targetY;
      } else if (isSupport) {
        adjusted.x = clamp(ball.x - direction * 8, 14, 88);
        adjusted.y = clamp(50 + (zone.y - 50) * 0.35, 38, 62);
      }
    } else if (plan.type === 'counter' && isRunner) {
      adjusted.x = clamp(zone.x + direction * 10, 18, 92);
    } else if (plan.type === 'recycle' && (isSupport || zone.role.startsWith('holding-'))) {
      adjusted.x = clamp(ball.x - direction * 12, 12, 88);
      adjusted.y = clamp(50 + (zone.y - 50) * 0.75, 24, 76);
    }
    return adjusted;
  });
}

function attackingZones(teamId, ball, phase, branch, plan = null) {
  if (branch === 'fifa') {
    return applyAttackPlanToZones(
      fifaAttackingZones(teamId, ball, phase),
      teamId,
      ball,
      plan,
      branch
    );
  }
  const direction = teamId === 1 ? 1 : -1;
  const supportSide = ball.y < 50 ? 1 : -1;
  const isTransition = phase === 'attack-transition';
  const isFinalThird = phase === 'final-third';
  const supportDepth = isTransition ? 10 : isFinalThird ? 10.5 : 8;
  const runDepth = isTransition ? 13 : isFinalThird ? 10 : 17;
  const safetyDepth = isTransition ? 26 : isFinalThird ? 32 : 28;
  return applyAttackPlanToZones([
    {
      role: 'close-support',
      x: clamp(ball.x - direction * supportDepth, 14, 86),
      y: clamp(ball.y + supportSide * 10, 18, 82),
      rx: 4.5,
      ry: 7
    },
    {
      role: 'wide-outlet',
      x: clamp(ball.x + direction * 3, 16, 84),
      y: ball.y < 50 ? 87 : 13,
      rx: 7,
      ry: 6
    },
    {
      role: 'depth-run',
      x: clamp(ball.x + direction * runDepth, 22, 86),
      y: clamp(50 + (ball.y - 50) * 0.34, 28, 72),
      rx: 7.5,
      ry: 10
    },
    {
      role: 'rest-defense',
      x: clamp(ball.x - direction * safetyDepth, 17, 83),
      y: clamp(50 - (ball.y - 50) * 0.18, 34, 66),
      rx: 5.5,
      ry: 11
    }
  ], teamId, ball, plan, branch);
}

function threatScore(teamId, attacker, ball) {
  const ownGoalX = teamId === 1 ? 5.5 : 94.5;
  const goalDistance = Math.abs(attacker.position.x - ownGoalX);
  const centrality = 1 - Math.abs(attacker.position.y - 50) / 50;
  const ballConnection = Math.max(0, 24 - distance(attacker.position, ball));
  return (100 - goalDistance) * 1.15 + centrality * 8 + ballConnection * 0.35;
}

function chooseMarkTargets(world, teamId, attackers, owner) {
  const state = world.defensiveStates[teamId];
  const candidates = attackers
    .filter(attacker => attacker.id !== owner?.id)
    .map(attacker => ({
      attacker,
      score: threatScore(teamId, attacker, world.ball)
    }))
    .sort((left, right) => right.score - left.score);
  const used = new Set();
  const result = {};

  const chooseForRole = (role, filter = () => true) => {
    const eligible = candidates.filter(candidate => !used.has(candidate.attacker.id) && filter(candidate.attacker));
    const fallback = candidates.filter(candidate => !used.has(candidate.attacker.id));
    const pool = eligible.length ? eligible : fallback;
    if (!pool.length) return null;
    const previousTargetId = state.roles[role]?.targetId;
    const previous = pool.find(candidate => candidate.attacker.id === previousTargetId);
    const selected = previous && previous.score >= pool[0].score - 9 ? previous : pool[0];
    used.add(selected.attacker.id);
    result[role] = selected.attacker;
    return selected.attacker;
  };

  if (world.branch === 'fifa') {
    chooseForRole('midfield-left', attacker => attacker.position.y <= 38);
    chooseForRole('midfield-center', attacker => attacker.position.y > 30 && attacker.position.y < 70);
    chooseForRole('midfield-right', attacker => attacker.position.y >= 62);
    chooseForRole('back-left', attacker => attacker.position.y <= 28);
    chooseForRole('back-center-left', attacker => attacker.position.y > 20 && attacker.position.y <= 50);
    chooseForRole('back-center-right', attacker => attacker.position.y >= 50 && attacker.position.y < 80);
    chooseForRole('back-right', attacker => attacker.position.y >= 72);
    chooseForRole('cover');
  } else {
    chooseForRole('lane-top', attacker => attacker.position.y <= 48);
    chooseForRole('lane-bottom', attacker => attacker.position.y >= 52);
    chooseForRole('back-line');
    chooseForRole('cover');
  }
  return result;
}

function fifaDefendingZones(teamId, ball, phase, markTargets = {}, owner = null) {
  const direction = teamId === 1 ? 1 : -1;
  const transitionDrop = phase === 'defense-transition' ? 5 : 0;
  const midfieldX = clamp(ball.x - direction * (13 + transitionDrop), 15, 85);
  const backX = clamp(ball.x - direction * (25 + transitionDrop), 10, 90);
  const coverTarget = markTargets.cover;
  const markZone = (role, fallbackY, line, depth, rx = 5, ry = 7) => {
    const target = markTargets[role];
    const goalSideX = target
      ? target.position.x - direction * depth
      : line;
    return {
      role,
      x: clamp(line * 0.5 + goalSideX * 0.5, 8, 92),
      y: clamp(target ? target.position.y * 0.5 + fallbackY * 0.5 : fallbackY, 10, 90),
      rx,
      ry,
      markTargetId: target?.id || null,
      responsibility: target ? 'mark' : 'zone'
    };
  };
  return [
    {
      role: 'press',
      x: clamp(ball.x - direction * 2.5, 10, 90),
      y: ball.y,
      rx: 2.8,
      ry: 4,
      markTargetId: owner?.id || null,
      responsibility: 'press'
    },
    {
      role: 'cover',
      x: clamp(ball.x - direction * 9, 9, 91),
      y: coverTarget
        ? clamp(ball.y * 0.58 + coverTarget.position.y * 0.42, 18, 82)
        : clamp(ball.y + (ball.y < 50 ? 9 : -9), 18, 82),
      rx: 4,
      ry: 6,
      markTargetId: coverTarget?.id || null,
      responsibility: 'cover'
    },
    markZone('midfield-left', 24, midfieldX, 4, 5, 7),
    markZone('midfield-center', 50, midfieldX, 4, 5, 8),
    markZone('midfield-right', 76, midfieldX, 4, 5, 7),
    markZone('back-left', 16, backX, 6, 4.5, 6),
    markZone('back-center-left', 39, backX, 6, 4.5, 7),
    markZone('back-center-right', 61, backX, 6, 4.5, 7),
    markZone('back-right', 84, backX, 6, 4.5, 6),
    {
      role: 'sweeper',
      x: clamp(backX - direction * 7, 7, 93),
      y: clamp(50 + (ball.y - 50) * 0.16, 38, 62),
      rx: 3.5,
      ry: 9,
      markTargetId: null,
      responsibility: 'cover'
    }
  ];
}

function defendingZones(teamId, ball, phase, markTargets = {}, owner = null, branch = 'futbol') {
  if (branch === 'fifa') return fifaDefendingZones(teamId, ball, phase, markTargets, owner);
  const direction = teamId === 1 ? 1 : -1;
  const transitionDrop = phase === 'defense-transition' ? 4 : 0;
  const lineX = clamp(
    ball.x - direction * (15 + transitionDrop),
    9,
    91
  );
  const coverTarget = markTargets.cover;
  const markZone = (role, fallbackY, minY, maxY, depth) => {
    const target = markTargets[role];
    if (!target) {
      return {
        role,
        x: role === 'back-line'
          ? clamp(ball.x - direction * (24 + transitionDrop), 8, 92)
          : lineX,
        y: fallbackY,
        rx: role === 'back-line' ? 4.5 : 5.5,
        ry: role === 'back-line' ? 11 : 8.5,
        markTargetId: null,
        responsibility: 'zone'
      };
    }
    const goalSideX = target.position.x - direction * depth;
    const coordinatedX = role === 'back-line'
      ? goalSideX
      : lineX * 0.4 + goalSideX * 0.6;
    const ballSideDepth = role === 'back-line' ? 14 : 6;
    const goalSideBallX = ball.x - direction * ballSideDepth;
    const protectedX = role === 'back-line'
      ? direction === 1
        ? Math.min(coordinatedX, goalSideBallX)
        : Math.max(coordinatedX, goalSideBallX)
      : coordinatedX;
    return {
      role,
      x: clamp(protectedX, 8, 92),
      y: clamp(target.position.y * 0.35 + fallbackY * 0.65, minY, maxY),
      rx: role === 'back-line' ? 4.5 : 5,
      ry: role === 'back-line' ? 8 : 7,
      markTargetId: target.id,
      responsibility: 'mark'
    };
  };
  return [
    {
      role: 'press',
      x: clamp(ball.x - direction * 2.7, 10, 90),
      y: ball.y,
      rx: 2.8,
      ry: 4.5,
      markTargetId: owner?.id || null,
      responsibility: 'press'
    },
    {
      role: 'cover',
      x: clamp(ball.x - direction * 10.5, 8, 92),
      y: coverTarget
        ? clamp(ball.y * 0.65 + coverTarget.position.y * 0.35, 20, 80)
        : clamp(ball.y + (ball.y < 50 ? 8 : -8), 20, 80),
      rx: 4,
      ry: 7,
      markTargetId: coverTarget?.id || null,
      responsibility: 'cover'
    },
    markZone('lane-top', 23, 18, 32, 4),
    markZone('lane-bottom', 77, 68, 82, 4),
    markZone('back-line', clamp(50 + (ball.y - 50) * 0.2, 38, 62), 28, 72, 7)
  ];
}

function assignmentCost(player, zone, tick, { handoff = false } = {}) {
  const travel = distance(player.position, zone);
  const continuity = player.role === zone.role
    ? handoff ? -8 : zone.role === 'press' ? -8 : -18
    : handoff ? 9 : 34;
  const roleAge = tick - player.roleSinceTick;
  const earlySwitchPenalty = player.role !== zone.role && roleAge < ROLE_MIN_DWELL_TICKS
    ? handoff ? 10 : zone.role === 'press' ? 24 : 42
    : 0;
  const naturalPenalty = (
    zone.role === 'rest-defense' ||
    zone.role === 'back-line' ||
    zone.role === 'sweeper' ||
    zone.role.startsWith('back-') ||
    zone.role.startsWith('holding-')
  )
    ? Math.max(0, player.naturalIndex - 1) * 1.2
    : 0;
  return travel + continuity + earlySwitchPenalty + naturalPenalty;
}

function bestZoneAssignment(players, zones, tick, options) {
  const size = 1 << zones.length;
  const costs = Array(size).fill(Number.POSITIVE_INFINITY);
  const assignments = Array(size).fill(null);
  costs[0] = 0;
  assignments[0] = [];

  for (let mask = 0; mask < size; mask += 1) {
    const assigned = assignments[mask];
    if (!assigned) continue;
    const playerIndex = assigned.length;
    if (playerIndex >= players.length) continue;
    for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex += 1) {
      if (mask & (1 << zoneIndex)) continue;
      const nextMask = mask | (1 << zoneIndex);
      const nextCost = costs[mask] + assignmentCost(
        players[playerIndex],
        zones[zoneIndex],
        tick,
        options
      );
      if (nextCost < costs[nextMask] - 0.0001) {
        costs[nextMask] = nextCost;
        assignments[nextMask] = assigned.concat(zoneIndex);
      }
    }
  }

  const finalAssignment = assignments[size - 1];
  return {
    cost: costs[size - 1],
    zones: finalAssignment.map(zoneIndex => zones[zoneIndex])
  };
}

function assignZones(players, zones, tick, { force = false } = {}) {
  const zonesByRole = new Map(zones.map(zone => [zone.role, zone]));
  const currentRoles = players.map(player => player.role);
  const currentAssignmentValid = new Set(currentRoles).size === players.length &&
    currentRoles.every(role => zonesByRole.has(role));
  const best = bestZoneAssignment(
    players,
    zones,
    tick,
    { handoff: !currentAssignmentValid }
  );
  const bestPermutation = best.zones;
  const bestCost = best.cost;

  if (currentAssignmentValid && !force) {
    const currentPermutation = players.map(player => zonesByRole.get(player.role));
    const currentCost = players.reduce(
      (total, player, index) => total + assignmentCost(player, currentPermutation[index], tick),
      0
    );
    const changedPlayers = players.filter(
      (player, index) => player.role !== bestPermutation[index].role
    );
    const dwellReady = changedPlayers.every(
      player => tick - player.roleSinceTick >= ROLE_MIN_DWELL_TICKS
    );
    if (!dwellReady || bestCost > currentCost - ROLE_ASSIGNMENT_IMPROVEMENT) {
      return players.map((player, index) => ({
        player,
        zone: currentPermutation[index],
        assignmentReason: 'continuity'
      }));
    }
  }

  return players.map((player, index) => ({
    player,
    zone: bestPermutation[index],
    assignmentReason: currentAssignmentValid ? 'cost-improvement' : 'role-handoff'
  }));
}

function setPlayerRole(world, player, role, reason) {
  if (player.role === role) return false;
  const heldTicks = Math.max(0, world.tick - player.roleSinceTick);
  if (heldTicks > 0) {
    player.roleDurations[player.role] = (player.roleDurations[player.role] || 0) + heldTicks;
    player.roleStints.push({ role: player.role, ticks: heldTicks });
  }
  const previousRole = player.role;
  player.previousRole = previousRole;
  player.role = role;
  player.roleSinceTick = world.tick;
  player.roleSwitchCount += 1;
  world.telemetry.roleSwitches += 1;
  world.telemetry.roleChanges.push({
    tick: world.tick,
    t: round(world.tick * DT, 2),
    playerId: player.id,
    teamId: player.teamId,
    from: previousRole,
    to: role,
    reason
  });
  return true;
}

function phaseForTeam(world, teamId) {
  const attacking = world.possessionTeam === teamId;
  const transitionActive = world.tick - world.possessionChangedTick < TRANSITION_TICKS;
  if (!attacking) return transitionActive ? 'defense-transition' : 'settled-defense';
  if (transitionActive && world.tick > 0) return 'attack-transition';
  const direction = teamId === 1 ? 1 : -1;
  const progress = direction === 1 ? world.ball.x : 100 - world.ball.x;
  if (progress < 35) return 'build-up';
  if (progress < 72) return 'progression';
  return 'final-third';
}

function updateTeamPhase(world, teamId) {
  const nextPhase = phaseForTeam(world, teamId);
  const state = world.teamPhases[teamId];
  if (state.name === nextPhase) return false;
  if (state.name) {
    const heldTicks = Math.max(0, world.tick - state.sinceTick);
    world.telemetry.phaseDurations[state.name] =
      (world.telemetry.phaseDurations[state.name] || 0) + heldTicks;
  }
  const previousPhase = state.name;
  state.name = nextPhase;
  state.sinceTick = world.tick;
  if (previousPhase) {
    world.telemetry.phaseChanges += 1;
    world.events.push({
      t: round(world.tick * DT, 2),
      type: 'phase',
      teamId,
      phase: nextPhase,
      text: `${teamId === 1 ? 'Mavi Takım' : 'Kırmızı Takım'} ${PHASE_NAMES[nextPhase] || nextPhase} fazına geçti.`
    });
  }
  return true;
}

function updateGoalkeeperTarget(player, ball, world = null) {
  const baseX = player.teamId === 1 ? 5.5 : 94.5;
  const threatDistance = player.teamId === 1 ? ball.x : 100 - ball.x;
  const defendingShot = ball.mode === 'shot' && ball.shooterTeamId !== player.teamId;
  const decision = defendingShot
    ? 'shot-track'
    : threatDistance <= 20
      ? 'close-angle'
      : threatDistance <= 38
        ? 'set'
        : 'line';
  const approach = decision === 'close-angle'
    ? clamp((20 - threatDistance) * 0.18 + 1.4, 1.4, 4.2)
    : decision === 'set'
      ? 1.15
      : defendingShot
        ? 1.7
        : 0.25;
  const targetX = baseX + player.direction * approach;
  let targetY = clamp(50 + (ball.y - 50) * 0.23, 38, 62);
  if (defendingShot && Math.abs(ball.velocity.x) > 0.1) {
    const travelTime = (targetX - ball.x) / ball.velocity.x;
    if (travelTime >= 0) {
      targetY = clamp(ball.y + ball.velocity.y * travelTime, 36, 64);
    }
  }
  player.zone = {
    x: targetX,
    y: targetY,
    rx: 1.2,
    ry: 4
  };
  player.target = { x: player.zone.x, y: player.zone.y };
  if (world && player.goalkeeperDecision !== decision) {
    player.goalkeeperDecision = decision;
    world.telemetry.goalkeeperDecisionChanges += 1;
    if (world.tick > 0) {
      world.events.push({
        t: round(world.tick * DT, 2),
        type: 'keeper-decision',
        teamId: player.teamId,
        actor: player.id,
        decision,
        x: round(player.position.x),
        y: round(player.position.y),
        text: decision === 'shot-track'
          ? `${player.name} şut hattını okuyup vuruş noktasına kaydı.`
          : decision === 'close-angle'
            ? `${player.name} açıyı daraltmak için kalesinden çıktı.`
            : decision === 'set'
              ? `${player.name} ayaklarını ayarlayıp şuta hazırlandı.`
              : `${player.name} çizgi konumuna geri döndü.`
      });
    }
  }
}

function applyDefensiveAssignment(world, teamId, player, zone, assignmentReason) {
  const state = world.defensiveStates[teamId];
  const previous = state.roles[zone.role] || null;
  const roleChanged = setPlayerRole(world, player, zone.role, assignmentReason);
  const playerChanged = Boolean(previous && previous.playerId !== player.id);
  const targetChanged = Boolean(
    previous &&
    previous.targetId !== (zone.markTargetId || null)
  );

  if (world.tick > 0 && (playerChanged || targetChanged)) {
    world.telemetry.defensiveHandoffs += 1;
    if (zone.role === 'press' && playerChanged) world.telemetry.pressHandoffs += 1;
    if (zone.role === 'cover' && (playerChanged || targetChanged)) {
      world.telemetry.coverHandoffs += 1;
    }
    if (zone.responsibility === 'mark' && (playerChanged || targetChanged)) {
      world.telemetry.markingHandoffs += 1;
    }
    world.telemetry.handoffEvents.push({
      tick: world.tick,
      t: round(world.tick * DT, 2),
      teamId,
      role: zone.role,
      fromPlayerId: previous?.playerId || null,
      toPlayerId: player.id,
      fromTargetId: previous?.targetId || null,
      toTargetId: zone.markTargetId || null
    });
    if (playerChanged) {
      const target = zone.markTargetId
        ? world.players.find(candidate => candidate.id === zone.markTargetId)
        : null;
      world.events.push({
        t: round(world.tick * DT, 2),
        type: 'handoff',
        teamId,
        actor: player.id,
        target: zone.markTargetId || null,
        text: target
          ? `${player.name}, ${target.name} markajını devraldı.`
          : `${player.name}, ${zone.role} sorumluluğunu devraldı.`
      });
    }
  }

  player.zone = zone;
  player.markTargetId = zone.markTargetId || null;
  player.responsibility = zone.responsibility || zone.role;
  state.roles[zone.role] = {
    playerId: player.id,
    targetId: zone.markTargetId || null,
    sinceTick: roleChanged || playerChanged || targetChanged
      ? world.tick
      : previous?.sinceTick ?? world.tick
  };
}

function assignDefensiveZones(world, teamId, players, zones) {
  const pressZone = zones.find(zone => zone.role === 'press');
  const remainingZones = zones.filter(zone => zone.role !== 'press');
  const state = world.defensiveStates[teamId];
  const ranked = players
    .map(player => ({ player, gap: distance(player.position, world.ball) }))
    .sort((left, right) => left.gap - right.gap);
  const best = ranked[0];
  const currentPress = players.find(player => player.id === state.roles.press?.playerId);
  const currentGap = currentPress ? distance(currentPress.position, world.ball) : Number.POSITIVE_INFINITY;
  const currentCanContinue = currentPress &&
    (
      world.tick - currentPress.roleSinceTick < ROLE_MIN_DWELL_TICKS ||
      currentGap <= best.gap + 5
    );
  const pressPlayer = currentCanContinue ? currentPress : best.player;
  const rest = players.filter(player => player.id !== pressPlayer.id);
  const pressChanged = Boolean(currentPress && currentPress.id !== pressPlayer.id);
  if (pressChanged) {
    const vacatedRole = pressPlayer.role;
    const zonesByRole = new Map(remainingZones.map(zone => [zone.role, zone]));
    const directHandoff = rest.map(player => ({
      player,
      zone: zonesByRole.get(player.id === currentPress.id ? vacatedRole : player.role)
    }));
    const validHandoff = directHandoff.every(assignment => assignment.zone) &&
      new Set(directHandoff.map(assignment => assignment.zone.role)).size === remainingZones.length;
    if (validHandoff) {
      return [
        {
          player: pressPlayer,
          zone: pressZone,
          assignmentReason: 'press-handoff'
        },
        ...directHandoff.map(assignment => ({
          ...assignment,
          assignmentReason: assignment.player.id === currentPress.id
            ? 'cover-handoff'
            : 'responsibility-continuity'
        }))
      ];
    }
  }
  return [
    {
      player: pressPlayer,
      zone: pressZone,
      assignmentReason: currentCanContinue ? 'press-continuity' : 'press-handoff'
    },
    ...assignZones(rest, remainingZones, world.tick)
  ];
}

function updateTeamPlan(world, teamId) {
  const team = world.players.filter(player => player.teamId === teamId && !player.isGoalkeeper);
  const opponents = world.players.filter(player => player.teamId !== teamId && !player.isGoalkeeper);
  const keeper = world.players.find(player => player.teamId === teamId && player.isGoalkeeper);
  if (world.ball.mode === 'dead' && world.ball.restartKind === 'kickoff') {
    if (world.ball.restartPhase === 'kickoff-setup') {
      applyKickoffTeamShape(
        world,
        teamId,
        world.ball.restartTeamId,
        world.ball.restartTakerId,
        false
      );
    } else {
      updateGoalkeeperTarget(keeper, world.ball, world);
    }
    return;
  }
  const attacking = world.possessionTeam === teamId;
  const owner = world.ball.ownerId
    ? world.players.find(player => player.id === world.ball.ownerId)
    : null;
  const phaseChanged = updateTeamPhase(world, teamId);
  const phase = world.teamPhases[teamId].name;

  if (attacking && !owner) {
    updateGoalkeeperTarget(keeper, world.ball, world);
    return;
  }

  if (attacking && owner?.isGoalkeeper) {
    owner.role = 'goalkeeper';
    owner.responsibility = 'distribution';
    updateGoalkeeperTarget(owner, world.ball, world);
    return;
  }

  if (attacking && owner?.teamId === teamId) {
    setPlayerRole(world, owner, 'ball-carrier', 'possession-owner');
    owner.markTargetId = null;
    owner.responsibility = 'ball-carrier';
    const direction = owner.direction;
    const pressure = opponents.reduce(
      (minimum, opponent) => Math.min(minimum, distance(opponent.position, owner.position)),
      100
    );
    owner.zone = {
      x: clamp(owner.position.x + direction * (pressure < 7 ? 3.5 : 8), 12, 88),
      y: clamp(owner.position.y + (50 - owner.position.y) * 0.08, 16, 84),
      rx: 4,
      ry: 8
    };
    owner.target = choosePointInsideZone(owner, owner.zone, team, opponents, world.ball, true);

    const offBall = team.filter(player => player.id !== owner.id);
    const attackPlan = ensureAttackPlan(world, teamId);
    assignZones(
      offBall,
      attackingZones(teamId, world.ball, phase, world.branch, attackPlan),
      world.tick,
      {
      force: phaseChanged && world.tick === 0
      }
    ).forEach(({ player, zone, assignmentReason }) => {
      setPlayerRole(world, player, zone.role, assignmentReason);
      player.zone = zone;
      player.markTargetId = null;
      player.responsibility = zone.role;
      player.target = choosePointInsideZone(player, zone, team, opponents, world.ball, true);
    });
  } else {
    const attackingReference = owner ||
      world.players.find(player => player.id === world.ball.targetId) ||
      null;
    const markTargets = chooseMarkTargets(world, teamId, opponents, attackingReference);
    const zones = defendingZones(
      teamId,
      world.ball,
      phase,
      markTargets,
      attackingReference,
      world.branch
    );
    world.telemetry.defensivePlans += 1;
    assignDefensiveZones(world, teamId, team, zones).forEach(({ player, zone, assignmentReason }) => {
      applyDefensiveAssignment(world, teamId, player, zone, assignmentReason);
      player.target = choosePointInsideZone(player, zone, team, opponents, world.ball, false);
    });
  }

  updateGoalkeeperTarget(keeper, world.ball, world);
}

function nearestOpponentDistance(world, player) {
  return world.players
    .filter(opponent => opponent.teamId !== player.teamId && !opponent.isGoalkeeper)
    .reduce((minimum, opponent) => Math.min(minimum, distance(player.position, opponent.position)), 100);
}

function receiverScore(world, owner, receiver) {
  const opponents = world.players.filter(player => player.teamId !== owner.teamId && !player.isGoalkeeper);
  const passDistance = distance(owner.position, receiver.position);
  const maximumPassDistance = world.branch === 'fifa' ? 38 : 30;
  if (passDistance < 6 || passDistance > maximumPassDistance) return -100;
  const progress = owner.direction * (receiver.position.x - owner.position.x);
  const receiverSpace = nearestOpponentDistance(world, receiver);
  const pressure = lanePressure(receiver.position, owner.position, opponents);
  const roleBonus = receiver.role === 'close-support'
    ? 4
    : receiver.role.startsWith('support-')
      ? 4
    : receiver.role === 'wide-outlet'
      ? 3
      : receiver.role.startsWith('wide-')
        ? 3
      : receiver.role === 'depth-run'
        ? 5
        : receiver.role.startsWith('runner-')
          ? 5
        : receiver.role === 'rest-defense'
          ? -12
          : receiver.role.startsWith('holding-')
            ? -4
        : 0;
  const plan = world.attackPlans[owner.teamId];
  const lateralChange = Math.abs(receiver.position.y - owner.position.y);
  const receiverLane = receiver.position.y < 38
    ? 'left'
    : receiver.position.y > 62
      ? 'right'
      : 'center';
  const planBonus = plan?.type === 'through-ball'
    ? (receiver.role === 'depth-run' || receiver.role.startsWith('runner-') ? 11 : 0) +
      Math.max(0, progress - 6) * 0.35
    : plan?.type === 'wide-overlap'
      ? (receiver.role === 'wide-outlet' || receiver.role.startsWith('wide-') ? 10 : 0) +
        (receiverLane === plan.targetLane ? 6 : 0)
      : plan?.type === 'switch-play'
        ? lateralChange * 0.3 + (receiverLane === plan.targetLane ? 10 : -4)
      : plan?.type === 'central-combination'
        ? (receiverLane === 'center' ? 7 : 0) +
          (receiver.role === 'close-support' || receiver.role.startsWith('support-') ? 7 : 0)
      : plan?.type === 'cutback'
        ? (
          owner.direction * (owner.position.x - receiver.position.x) > 2 &&
          receiverLane === 'center'
            ? 15
            : -3
        )
      : plan?.type === 'counter'
        ? Math.max(0, progress) * 0.5 +
          (receiver.role === 'depth-run' || receiver.role.startsWith('runner-') ? 8 : 0)
      : plan?.type === 'recycle'
        ? (progress < 0 ? 9 : 0) + (receiverSpace > 8 ? 5 : 0)
        : 0;
  const oneTwoBonus = plan?.type === 'central-combination' &&
    plan.lastPasserId === receiver.id &&
    plan.lastReceiverId === owner.id
    ? 13
    : 0;
  return progress * 0.72 +
    receiverSpace * 0.48 +
    roleBonus +
    planBonus +
    oneTwoBonus -
    pressure * 1.35 -
    passDistance * 0.08;
}

function passIntentFor(world, owner, receiver) {
  const plan = world.attackPlans[owner.teamId];
  const progress = owner.direction * (receiver.position.x - owner.position.x);
  const lateralChange = Math.abs(receiver.position.y - owner.position.y);
  const ownerProgress = owner.teamId === 1 ? owner.position.x : 100 - owner.position.x;
  const receiverCentral = Math.abs(receiver.position.y - 50) <= 15;
  if (
    plan?.type === 'central-combination' &&
    plan.lastPasserId === receiver.id &&
    plan.lastReceiverId === owner.id
  ) return 'one-two';
  if (
    plan?.type === 'cutback' &&
    ownerProgress >= 60 &&
    progress < 1 &&
    receiverCentral
  ) return 'cutback';
  if (
    plan?.type === 'wide-overlap' &&
    ownerProgress >= 52 &&
    Math.abs(owner.position.y - 50) >= 16 &&
    progress >= -4 &&
    receiverCentral
  ) return 'cross';
  if (plan?.type === 'switch-play' || lateralChange >= (world.branch === 'fifa' ? 32 : 38)) {
    return 'switch';
  }
  if (
    plan?.type === 'through-ball' ||
    plan?.type === 'counter' ||
    receiver.role === 'depth-run' ||
    receiver.role.startsWith('runner-')
  ) return 'through';
  if (plan?.type === 'recycle' || progress < -4) return 'recycle';
  return 'short';
}

function startPass(world, owner, receiver) {
  const rawDistance = distance(owner.position, receiver.position);
  const leadTime = clamp(rawDistance / 31, 0.25, 0.95);
  const accuracyError = ((100 - owner.rating) / 100) * (world.branch === 'fifa' ? 2.2 : 1.6);
  const errorAngle = world.rng() * Math.PI * 2;
  const destination = {
    x: clamp(
      receiver.position.x + receiver.velocity.x * leadTime + Math.cos(errorAngle) * accuracyError,
      FIELD.minX,
      FIELD.maxX
    ),
    y: clamp(
      receiver.position.y + receiver.velocity.y * leadTime + Math.sin(errorAngle) * accuracyError,
      FIELD.minY,
      FIELD.maxY
    )
  };
  const direction = normalize({
    x: destination.x - world.ball.x,
    y: destination.y - world.ball.y
  });
  const passDistance = distance(world.ball, destination);
  const speed = clamp(23 + passDistance * 0.32 + (owner.rating - 65) * 0.06, 24, 36);
  world.ball.mode = 'pass';
  world.ball.ownerId = null;
  world.ball.targetId = receiver.id;
  world.ball.passerId = owner.id;
  world.ball.passerTeamId = owner.teamId;
  world.ball.target = destination;
  world.ball.origin = { x: world.ball.x, y: world.ball.y };
  world.ball.velocity = { x: direction.x * speed, y: direction.y * speed };
  world.ball.passStartedTick = world.tick;
  world.ball.looseStartedTick = null;
  world.ball.lastTouchedPlayerId = owner.id;
  world.ball.contactCooldownUntilTick = world.tick + 5;
  world.ball.postRebound = false;
  world.telemetry.passesAttempted += 1;
  world.telemetry.passDistanceTotal += passDistance;
  world.telemetry.passLanePressureTotal += lanePressure(
    destination,
    owner.position,
    world.players.filter(player => player.teamId !== owner.teamId && !player.isGoalkeeper)
  );
  const attackPlan = ensureAttackPlan(world, owner.teamId);
  const passIntent = passIntentFor(world, owner, receiver);
  world.telemetry.passIntents[passIntent] = (world.telemetry.passIntents[passIntent] || 0) + 1;
  attackPlan.sequenceIndex += 1;
  attackPlan.lastPasserId = owner.id;
  attackPlan.lastReceiverId = receiver.id;
  world.events.push({
    t: round(world.tick * DT, 2),
    type: 'pass',
    teamId: owner.teamId,
    actor: owner.id,
    target: receiver.id,
    intent: passIntent,
    attackPlan: attackPlan.type,
    fromX: round(world.ball.x),
    fromY: round(world.ball.y),
    toX: round(destination.x),
    toY: round(destination.y),
    passDistance: round(passDistance),
    ballSpeed: round(speed),
    text: passIntent === 'through'
      ? `${owner.name}, savunma arkasına koşan ${receiver.name} için ara pasını gönderdi.`
      : passIntent === 'switch'
        ? `${owner.name}, oyunun yönünü ${receiver.name} ile ters kanada çevirdi.`
        : passIntent === 'cross'
          ? `${owner.name}, kanattan ${receiver.name} yönüne ortasını yaptı.`
          : passIntent === 'cutback'
            ? `${owner.name}, son çizgiden ${receiver.name} için geriye çıkardı.`
            : passIntent === 'one-two'
              ? `${owner.name} ve ${receiver.name} duvar pasıyla savunmayı geçti.`
              : passIntent === 'recycle'
                ? `${owner.name}, hücumu yeniden kurmak için ${receiver.name} ile geriye döndü.`
                : `${owner.name}, hareketlenen ${receiver.name} için ${round(passDistance, 1)} birimlik pas çıkardı.`
  });
}

function startShield(world, owner, nearestOpponent) {
  const awayFromPressure = normalize({
    x: owner.position.x - nearestOpponent.position.x,
    y: owner.position.y - nearestOpponent.position.y
  });
  owner.shieldingUntilTick = world.tick + Math.round(WORLD_TICK_RATE * 0.65);
  owner.target = {
    x: clamp(owner.position.x + awayFromPressure.x * 1.8, FIELD.minX, FIELD.maxX),
    y: clamp(owner.position.y + awayFromPressure.y * 1.8, FIELD.minY, FIELD.maxY)
  };
  world.ball.shieldStartedTick = world.tick;
  world.telemetry.shieldActions += 1;
  world.events.push({
    t: round(world.tick * DT, 2),
    type: 'shield',
    teamId: owner.teamId,
    actor: owner.id,
    defender: nearestOpponent.id,
    x: round(world.ball.x),
    y: round(world.ball.y),
    text: `${owner.name}, ${nearestOpponent.name} baskısında vücudunu araya koyup topu sakladı.`
  });
}

function startDribbleTouch(world, owner, opponents, pressure) {
  const desiredVector = normalize({
    x: owner.target.x - owner.position.x,
    y: owner.target.y - owner.position.y
  });
  const baseDirection = length(owner.velocity) > 0.35
    ? Math.atan2(owner.velocity.y, owner.velocity.x)
    : (world.ball.lastDribbleDirection ?? (owner.direction === 1 ? 0 : Math.PI));
  const desiredDirection = length(desiredVector) > 0.1
    ? Math.atan2(desiredVector.y, desiredVector.x)
    : (owner.direction === 1 ? 0 : Math.PI);
  const nearestAhead = opponents
    .map(opponent => ({
      opponent,
      ahead: owner.direction * (opponent.position.x - owner.position.x),
      lateral: opponent.position.y - owner.position.y,
      gap: distance(opponent.position, owner.position)
    }))
    .filter(candidate => candidate.ahead > -1 && candidate.ahead < 9 && Math.abs(candidate.lateral) < 7)
    .sort((left, right) => left.gap - right.gap)[0];
  const evadeDirection = nearestAhead
    ? desiredDirection - Math.sign(nearestAhead.lateral || (world.rng() - 0.5)) * clamp(
      0.2 + (8 - nearestAhead.gap) * 0.055,
      0.2,
      0.62
    )
    : desiredDirection;
  const maxTurnDegrees = clamp(25 + (owner.dribbling - 50) * 0.26, 20, 48);
  const directionAngle = rotateAngleTowards(
    baseDirection,
    evadeDirection,
    maxTurnDegrees * Math.PI / 180
  );
  const actualTurnDegrees = Math.abs(normalizeAngle(directionAngle - baseDirection)) * 180 / Math.PI;
  const touchDistance = clamp(
    1.2 + (owner.dribbling - 50) * 0.009 + (pressure > 7 ? 0.22 : 0) - (pressure < 3 ? 0.18 : 0),
    1.05,
    1.9
  );
  const destination = {
    x: clamp(world.ball.x + Math.cos(directionAngle) * touchDistance, FIELD.minX, FIELD.maxX),
    y: clamp(world.ball.y + Math.sin(directionAngle) * touchDistance, FIELD.minY, FIELD.maxY)
  };
  const speed = clamp(5.8 + (owner.dribbling - 50) * 0.028 + touchDistance * 0.52, 5.4, 8.4);

  world.ball.mode = 'dribble';
  world.ball.ownerId = owner.id;
  world.ball.targetId = null;
  world.ball.passerId = owner.id;
  world.ball.passerTeamId = owner.teamId;
  world.ball.target = destination;
  world.ball.origin = { x: world.ball.x, y: world.ball.y };
  world.ball.velocity = {
    x: Math.cos(directionAngle) * speed,
    y: Math.sin(directionAngle) * speed
  };
  world.ball.dribbleStartedTick = world.tick;
  world.ball.lastDribbleDirection = directionAngle;
  world.ball.lastTouchedPlayerId = owner.id;
  world.ball.contactCooldownUntilTick = world.tick + 2;
  owner.target = destination;
  world.lastDribbleTick = world.tick;
  world.telemetry.dribbleAttempts += 1;
  world.telemetry.dribbleTouches += 1;
  world.telemetry.maxDribbleTurnDegrees = Math.max(
    world.telemetry.maxDribbleTurnDegrees,
    actualTurnDegrees
  );
  world.events.push({
    t: round(world.tick * DT, 2),
    type: 'dribble-touch',
    teamId: owner.teamId,
    actor: owner.id,
    fromX: round(world.ball.x),
    fromY: round(world.ball.y),
    toX: round(destination.x),
    toY: round(destination.y),
    touchDistance: round(touchDistance),
    turnDegrees: round(actualTurnDegrees),
    text: `${owner.name} topu ${round(touchDistance, 1)} birim önüne dokundurup yönünü ${round(actualTurnDegrees, 0)}° çevirdi.`
  });
}

function shotContext(world, owner, opponents, pressure) {
  const goalX = owner.direction === 1 ? GOAL.rightLineX : GOAL.leftLineX;
  const goalCenter = { x: goalX, y: 50 };
  const shotDistance = distance(owner.position, goalCenter);
  const lateral = Math.abs(owner.position.y - 50);
  const angleQuality = clamp(1 - lateral / 43, 0.12, 1);
  const centrality = clamp(1 - lateral / 34, 0, 1);
  const laneThreat = lanePressure(goalCenter, owner.position, opponents);
  const keeper = world.players.find(
    player => player.teamId !== owner.teamId && player.isGoalkeeper
  );
  const keeperSet = keeper
    ? clamp(1 - Math.abs(keeper.position.y - owner.position.y) / 32, 0.25, 1)
    : 0.65;
  const distanceFactor = world.branch === 'fifa'
    ? clamp((34 - shotDistance) / 22, 0, 1)
    : clamp((39 - shotDistance) / 27, 0, 1);
  const pressurePenalty = clamp((6.5 - pressure) / 6.5, 0, 1);
  const profileQuality = (owner.finishing * 0.68 + owner.composure * 0.32) / 100;
  const rawXg =
    0.025 +
    distanceFactor * 0.48 +
    angleQuality * 0.16 +
    centrality * 0.08 +
    profileQuality * 0.19 -
    pressurePenalty * 0.22 -
    laneThreat * 0.017 -
    keeperSet * 0.07;
  const xg = clamp(rawXg, 0.015, world.branch === 'fifa' ? 0.72 : 0.8);
  const utility = xg * 100 +
    Math.max(0, 24 - shotDistance) * 0.7 +
    Math.max(0, pressure - 5) * 0.55 -
    Math.max(0, shotDistance - 30) * 1.35;
  return {
    goalX,
    shotDistance,
    lateral,
    angleQuality,
    laneThreat,
    keeper,
    pressure,
    xg,
    utility
  };
}

function startShot(world, owner, context) {
  const mouth = goalMouth(world.branch);
  const keeperY = context.keeper?.position.y ?? 50;
  const preferredY = keeperY <= 50
    ? mouth.maxY - 2.2
    : mouth.minY + 2.2;
  const pressureError = Math.max(0, 5.5 - context.pressure) * 0.36;
  const profileError = ((100 - owner.finishing) / 100) * (world.branch === 'fifa' ? 4.8 : 6.2);
  const error = (world.rng() - world.rng()) * (profileError + pressureError + 2.4);
  const accuracyChance = clamp(
    0.42 +
    owner.finishing * 0.002 +
    owner.composure * 0.001 -
    Math.max(0, context.shotDistance - 20) * 0.006 -
    Math.max(0, 5 - context.pressure) * 0.018 +
    (context.isPenalty ? 0.15 : 0),
    0.36,
    context.isPenalty ? 0.88 : 0.74
  );
  let targetY = clamp(preferredY + error, mouth.minY - 5.5, mouth.maxY + 5.5);
  if (world.rng() > accuracyChance && targetY >= mouth.minY && targetY <= mouth.maxY) {
    const missHigh = preferredY >= 50;
    targetY = missHigh
      ? mouth.maxY + 0.7 + world.rng() * 4.2
      : mouth.minY - 0.7 - world.rng() * 4.2;
  }
  const targetX = context.goalX;
  const direction = normalize({
    x: targetX - world.ball.x,
    y: targetY - world.ball.y
  });
  const speed = clamp(
    35.5 + (owner.finishing - 50) * 0.055 + Math.min(3.4, context.shotDistance * 0.08),
    35,
    41.5
  );
  const onTarget = targetY >= mouth.minY && targetY <= mouth.maxY;

  world.ball.mode = 'shot';
  world.ball.ownerId = null;
  world.ball.targetId = null;
  world.ball.passerId = owner.id;
  world.ball.passerTeamId = owner.teamId;
  world.ball.shooterId = owner.id;
  world.ball.shooterTeamId = owner.teamId;
  world.ball.target = { x: targetX, y: targetY };
  world.ball.origin = { x: world.ball.x, y: world.ball.y };
  world.ball.velocity = { x: direction.x * speed, y: direction.y * speed };
  world.ball.shotStartedTick = world.tick;
  world.ball.shotDistance = context.shotDistance;
  world.ball.shotXg = context.xg;
  world.ball.shotOnTarget = onTarget;
  world.ball.shotOnTargetCounted = false;
  world.ball.isPenalty = Boolean(context.isPenalty);
  world.ball.lastTouchedPlayerId = owner.id;
  world.ball.contactCooldownUntilTick = world.tick + 4;
  world.ball.postRebound = false;
  world.lastShotTick = world.tick;
  world.telemetry.shots += 1;
  world.telemetry.shotDistanceTotal += context.shotDistance;
  world.telemetry.maxShotDistance = Math.max(
    world.telemetry.maxShotDistance,
    context.shotDistance
  );
  world.telemetry.xgTotal += context.xg;
  if (context.isPenalty) world.telemetry.penaltyShots += 1;
  if (context.shotDistance > (world.branch === 'fifa' ? 25 : 29)) {
    world.telemetry.longRangeShots += 1;
  }
  world.events.push({
    t: round(world.tick * DT, 2),
    type: 'shot',
    teamId: owner.teamId,
    actor: owner.id,
    fromX: round(world.ball.x),
    fromY: round(world.ball.y),
    toX: round(targetX),
    toY: round(targetY),
    shotDistance: round(context.shotDistance),
    pressure: round(context.pressure),
    xg: round(context.xg, 3),
    onTarget,
    isPenalty: Boolean(context.isPenalty),
    text: context.isPenalty
      ? `${owner.name} penaltı noktasından kaleciyi karşısına aldı ve vuruşunu yaptı.`
      : `${owner.name}, ${round(context.shotDistance, 1)} birimden ${round(context.xg, 2)} xG değerli şutunu çıkardı.`
  });
  if (context.keeper) updateGoalkeeperTarget(context.keeper, world.ball, world);
}

function distributeFromGoalkeeper(world, keeper) {
  const opponents = world.players.filter(
    player => player.teamId !== keeper.teamId && !player.isGoalkeeper
  );
  const receiver = world.players
    .filter(player => player.teamId === keeper.teamId && !player.isGoalkeeper)
    .map(player => ({
      player,
      score:
        nearestOpponentDistance(world, player) * 1.8 -
        distance(keeper.position, player.position) * 0.16 +
        keeper.direction * (player.position.x - keeper.position.x) * 0.3 -
        lanePressure(player.position, keeper.position, opponents) * 1.15
    }))
    .sort((left, right) => right.score - left.score)[0]?.player;
  if (!receiver) return;
  startPass(world, keeper, receiver);
  const event = world.events[world.events.length - 1];
  event.type = 'keeper-distribution';
  event.text = `${keeper.name} topu tuttu ve ${receiver.name} ile oyunu yeniden kurdu.`;
  world.telemetry.keeperDistributions += 1;
  world.lastPassTick = world.tick;
}

function makeOnBallDecision(world) {
  if (!['carried', 'keeper-held'].includes(world.ball.mode) || !world.ball.ownerId) return;
  const owner = world.players.find(player => player.id === world.ball.ownerId);
  if (!owner) return;
  if (owner.isGoalkeeper) {
    if (
      world.ball.mode === 'keeper-held' &&
      world.tick - world.ball.heldStartedTick >= WORLD_TICK_RATE * 0.7
    ) {
      distributeFromGoalkeeper(world, owner);
    }
    return;
  }
  const attackPlan = ensureAttackPlan(world, owner.teamId);
  const opponents = world.players.filter(player => player.teamId !== owner.teamId && !player.isGoalkeeper);
  const nearestOpponent = opponents
    .map(opponent => ({ opponent, gap: distance(opponent.position, owner.position) }))
    .sort((left, right) => left.gap - right.gap)[0];
  const pressure = nearestOpponent?.gap ?? 100;
  const progress = owner.teamId === 1 ? owner.position.x : 100 - owner.position.x;
  const teammates = world.players.filter(
    player => player.teamId === owner.teamId && !player.isGoalkeeper && player.id !== owner.id
  );
  const rankedReceivers = teammates
    .map(receiver => ({ receiver, score: receiverScore(world, owner, receiver) }))
    .sort((left, right) => right.score - left.score);
  const best = rankedReceivers[0];
  const passReady = world.tick - world.lastPassTick > WORLD_TICK_RATE * 1.55;
  const needsRelease = pressure < 7.5 || progress > 77;
  const shot = shotContext(world, owner, opponents, pressure);
  const shotReady = world.tick - world.lastShotTick > WORLD_TICK_RATE * 1.4;
  const maximumShotDistance = world.branch === 'fifa' ? 30 : 33;
  const shootThreshold = world.branch === 'fifa' ? 28 : 20;
  const shootBias = world.branch === 'fifa'
    ? clamp(0.17 + shot.xg * 0.58, 0.17, 0.52)
    : clamp(0.42 + shot.xg * 0.8, 0.42, 0.84);
  const planNeedsCombination = attackPlan.sequenceIndex < 1 &&
    !['counter', 'cutback'].includes(attackPlan.type) &&
    shot.xg < (world.branch === 'fifa' ? 0.52 : 0.34);
  if (
    shotReady &&
    shot.shotDistance <= maximumShotDistance &&
    shot.utility >= shootThreshold &&
    !planNeedsCombination &&
    world.rng() < shootBias
  ) {
    startShot(world, owner, shot);
    return;
  }

  const passThreshold = needsRelease ? 0 : 7.5;
  const hasViablePass = passReady && best && best.score > passThreshold;
  const basePassBias = pressure < 3
    ? 0.66
    : progress > 77
      ? 0.72
      : best?.score > 13
        ? 0.58
        : 0.38;
  const passBias = clamp(
    basePassBias +
      (world.branch === 'fifa' ? 0.04 : -0.04) +
      (attackPlan.type === 'central-combination' ? 0.12 : 0) +
      (attackPlan.type === 'switch-play' ? 0.16 : 0) +
      (attackPlan.type === 'wide-overlap' ? 0.1 : 0) +
      (attackPlan.type === 'through-ball' && best?.score > 10 ? 0.12 : 0) +
      (attackPlan.type === 'recycle' ? 0.18 : 0),
    0.36,
    0.88
  );

  if (hasViablePass && world.rng() < passBias) {
    startPass(world, owner, best.receiver);
    world.lastPassTick = world.tick;
    return;
  }

  const shieldReady = world.tick - world.ball.shieldStartedTick > WORLD_TICK_RATE * 0.9;
  if (nearestOpponent && pressure < 2.55 && shieldReady && world.rng() < 0.44) {
    startShield(world, owner, nearestOpponent.opponent);
    return;
  }

  const openLaneShift = opponents.reduce((shift, opponent) => {
    const ahead = owner.direction * (opponent.position.x - owner.position.x);
    if (ahead < 0 || ahead > 13) return shift;
    const verticalGap = opponent.position.y - owner.position.y;
    if (Math.abs(verticalGap) > 12) return shift;
    return shift - Math.sign(verticalGap || (world.rng() - 0.5)) * (12 - Math.abs(verticalGap)) * 0.18;
  }, 0);
  owner.zone = {
    x: clamp(owner.position.x + owner.direction * (pressure < 7 ? 3.5 : 8.5), 12, 88),
    y: clamp(owner.position.y + openLaneShift, 15, 85),
    rx: 3.5,
    ry: 6
  };
  owner.target = choosePointInsideZone(owner, owner.zone, teammates.concat(owner), opponents, world.ball, true);
  const dribbleReady = world.tick - world.lastDribbleTick > WORLD_TICK_RATE * 0.7;
  if (dribbleReady) startDribbleTouch(world, owner, opponents, pressure);
}

function oppositeTeam(teamId) {
  return teamId === 1 ? 2 : 1;
}

function lastTouchTeam(world) {
  const player = world.players.find(candidate => candidate.id === world.ball.lastTouchedPlayerId);
  return player?.teamId || world.ball.shooterTeamId || world.ball.passerTeamId || world.possessionTeam;
}

function restartEventText(kind, teamId) {
  const teamName = teamId === 1 ? 'Mavi Takım' : 'Kırmızı Takım';
  const labels = {
    'throw-in': 'taç atışı',
    corner: 'köşe vuruşu',
    'goal-kick': 'kale vuruşu',
    'free-kick': 'serbest vuruş',
    penalty: 'penaltı',
    kickoff: 'santra'
  };
  return `${teamName} ${labels[kind] || 'duran top'} kullanacak.`;
}

function chooseRestartTaker(world, kind, teamId, location) {
  const candidates = world.players.filter(player => player.teamId === teamId);
  if (kind === 'goal-kick') {
    return candidates.find(player => player.isGoalkeeper) || null;
  }
  if (kind === 'penalty') {
    return candidates
      .filter(player => !player.isGoalkeeper)
      .sort((left, right) => (
        right.finishing + right.composure * 0.35 -
        (left.finishing + left.composure * 0.35)
      ))[0] || null;
  }
  if (kind === 'kickoff') {
    return candidates
      .filter(player => !player.isGoalkeeper)
      .sort((left, right) => (
        right.naturalIndex - left.naturalIndex ||
        right.composure - left.composure
      ))[0] || null;
  }
  return candidates
    .filter(player => !player.isGoalkeeper)
    .sort((left, right) => (
      distance(left.position, location) - distance(right.position, location) ||
      right.rating - left.rating
    ))[0] || candidates[0] || null;
}

function kickoffBasePositions(branch) {
  return branch === 'fifa'
    ? [
        { x: 18, y: 16 },
        { x: 20, y: 38 },
        { x: 20, y: 62 },
        { x: 18, y: 84 },
        { x: 31, y: 34 },
        { x: 31, y: 66 },
        { x: 41, y: 20 },
        { x: 43, y: 50 },
        { x: 41, y: 80 },
        { x: 48, y: 50 }
      ]
    : [
        { x: 20, y: 30 },
        { x: 20, y: 70 },
        { x: 34, y: 50 },
        { x: 43, y: 26 },
        { x: 47, y: 68 }
      ];
}

function applyKickoffTeamShape(world, teamId, restartTeamId, takerId, placePlayers) {
  const outfield = world.players
    .filter(player => player.teamId === teamId && !player.isGoalkeeper)
    .sort((left, right) => left.naturalIndex - right.naturalIndex);
  const keeper = world.players.find(player => player.teamId === teamId && player.isGoalkeeper);
  const bases = kickoffBasePositions(world.branch);
  outfield.forEach((player, index) => {
    const base = bases[index] || bases[bases.length - 1];
    let anchor = teamId === 1
      ? { x: Math.min(49, base.x), y: base.y }
      : { x: Math.max(51, 100 - base.x), y: base.y };
    if (player.id === takerId && teamId === restartTeamId) {
      anchor = { x: teamId === 1 ? 49.1 : 50.9, y: 50 };
    } else if (teamId !== restartTeamId && Math.abs(anchor.x - 50) < 7) {
      anchor.x = teamId === 1 ? 43 : 57;
      anchor.y = clamp(base.y + (index % 2 === 0 ? -8 : 8), 14, 86);
    }
    setPlayerRole(
      world,
      player,
      player.id === takerId ? 'kickoff-taker' : 'kickoff-shape',
      'kickoff-setup'
    );
    player.markTargetId = null;
    player.responsibility = player.id === takerId ? 'kickoff-taker' : 'kickoff-shape';
    player.zone = { x: anchor.x, y: anchor.y, rx: 1.8, ry: 2.8 };
    player.target = { ...anchor };
    if (placePlayers) {
      player.position = { ...anchor };
      player.previousPosition = { ...anchor };
      player.velocity = { x: 0, y: 0 };
    }
  });
  if (keeper) {
    const anchor = { x: teamId === 1 ? 5.5 : 94.5, y: 50 };
    keeper.zone = { x: anchor.x, y: anchor.y, rx: 1.4, ry: 8 };
    keeper.target = { ...anchor };
    keeper.goalkeeperDecision = 'line';
    if (placePlayers) {
      keeper.position = { ...anchor };
      keeper.previousPosition = { ...anchor };
      keeper.velocity = { x: 0, y: 0 };
    }
  }
}

function placeKickoffFormation(world) {
  [1, 2].forEach(teamId => applyKickoffTeamShape(
    world,
    teamId,
    world.ball.restartTeamId,
    world.ball.restartTakerId,
    true
  ));
  const wrongHalfPlayers = world.players.filter(player => (
    !player.isGoalkeeper &&
    (player.teamId === 1 ? player.position.x > 50 : player.position.x < 50)
  )).length;
  world.telemetry.kickoffWrongHalfPlayers += wrongHalfPlayers;
  world.telemetry.kickoffPlacements += 1;
}

function scheduleGoalRestart(world, { scoringTeamId, teamId, actor = null }) {
  const taker = chooseRestartTaker(world, 'kickoff', teamId, { x: 50, y: 50 });
  world.ball.mode = 'dead';
  world.ball.ownerId = null;
  world.ball.targetId = null;
  world.ball.passerId = null;
  world.ball.passerTeamId = null;
  world.ball.target = null;
  world.ball.velocity = { x: 0, y: 0 };
  world.ball.restartKind = 'kickoff';
  world.ball.restartPhase = 'goal-celebration';
  world.ball.restartTeamId = teamId;
  world.ball.restartLocation = { x: 50, y: 50 };
  world.ball.restartTakerId = taker?.id || null;
  world.ball.restartEarliestTick = null;
  world.ball.restartAnnouncementTick = world.tick + GOAL_CELEBRATION_TICKS;
  world.ball.restartPlaced = false;
  world.ball.restartScheduledTick = world.tick;
  world.ball.restartedThisTick = false;
  world.possessionTeam = teamId;
  world.possessionChangedTick = world.tick;
  world.players.forEach(player => {
    if (player.isGoalkeeper) return;
    const scorer = world.players.find(candidate => candidate.id === actor);
    const target = player.teamId === scoringTeamId && scorer
      ? {
          x: clamp(scorer.position.x - scorer.direction * (2 + player.naturalIndex * 0.45), 8, 92),
          y: clamp(scorer.position.y + (player.naturalIndex - 2) * 1.4, 12, 88)
        }
      : { ...player.position };
    player.target = target;
  });
  world.telemetry.goalCelebrations += 1;
  world.events.push({
    t: round(world.tick * DT, 2),
    type: 'goal-celebration',
    teamId: scoringTeamId,
    actor,
    restartTeamId: teamId,
    text: `${scoringTeamId === 1 ? 'Mavi Takım' : 'Kırmızı Takım'} gol sevincini yaşarken rakip santra için hazırlanıyor.`
  });
}

function scheduleRestart(world, {
  kind,
  teamId,
  location,
  actor = null,
  victim = null,
  delaySeconds = 0.7
}) {
  const safeLocation = {
    x: clamp(location.x, FIELD.minX, FIELD.maxX),
    y: clamp(location.y, FIELD.minY, FIELD.maxY)
  };
  const taker = chooseRestartTaker(world, kind, teamId, safeLocation);
  world.ball.mode = 'dead';
  world.ball.ownerId = null;
  world.ball.targetId = null;
  world.ball.passerId = null;
  world.ball.passerTeamId = null;
  world.ball.target = null;
  world.ball.velocity = { x: 0, y: 0 };
  world.ball.restartKind = kind;
  world.ball.restartPhase = 'set-piece-wait';
  world.ball.restartTeamId = teamId;
  world.ball.restartLocation = safeLocation;
  world.ball.restartTakerId = taker?.id || null;
  world.ball.restartEarliestTick = world.tick + Math.round(WORLD_TICK_RATE * delaySeconds);
  world.ball.restartAnnouncementTick = world.tick;
  world.ball.restartPlaced = false;
  world.ball.restartScheduledTick = world.tick;
  world.ball.restartedThisTick = false;
  world.possessionTeam = teamId;
  world.possessionChangedTick = world.tick;
  if (taker) taker.target = { ...safeLocation };

  const telemetryKey = {
    'throw-in': 'throwIns',
    corner: 'corners',
    'goal-kick': 'goalKicks',
    'free-kick': 'freeKicks',
    penalty: 'penalties',
    kickoff: 'kickoffs'
  }[kind];
  if (telemetryKey) world.telemetry[telemetryKey] += 1;
  world.events.push({
    t: round(world.tick * DT, 2),
    type: kind,
    teamId,
    actor,
    victim,
    x: round(safeLocation.x),
    y: round(safeLocation.y),
    taker: taker?.id || null,
    text: restartEventText(kind, teamId)
  });
}

function clearRestartState(ball) {
  ball.restartKind = null;
  ball.restartPhase = null;
  ball.restartTeamId = null;
  ball.restartLocation = null;
  ball.restartTakerId = null;
  ball.restartEarliestTick = null;
  ball.restartAnnouncementTick = null;
  ball.restartPlaced = false;
  ball.restartScheduledTick = null;
}

function selectRestartReceiver(world, taker, kind) {
  const teammates = world.players.filter(
    player => player.teamId === taker.teamId && player.id !== taker.id && !player.isGoalkeeper
  );
  if (kind === 'corner') {
    const goalX = taker.teamId === 1 ? GOAL.rightLineX : GOAL.leftLineX;
    return teammates
      .sort((left, right) => (
        distance(left.position, { x: goalX, y: 50 }) -
        distance(right.position, { x: goalX, y: 50 }) ||
        right.finishing - left.finishing
      ))[0] || null;
  }
  return teammates
    .map(player => ({ player, score: receiverScore(world, taker, player) }))
    .sort((left, right) => right.score - left.score)[0]?.player || teammates[0] || null;
}

function updateSetPieceRestart(world) {
  const kind = world.ball.restartKind;
  const teamId = world.ball.restartTeamId;
  const location = world.ball.restartLocation;
  if (!kind || !teamId || !location) return;
  let taker = world.players.find(player => player.id === world.ball.restartTakerId);
  if (!taker) {
    taker = chooseRestartTaker(world, kind, teamId, location);
    world.ball.restartTakerId = taker?.id || null;
  }
  if (!taker) return;
  if (kind === 'kickoff' && world.ball.restartPhase === 'goal-celebration') {
    if (world.tick < world.ball.restartAnnouncementTick) return;
    placeKickoffFormation(world);
    world.ball.x = location.x;
    world.ball.y = location.y;
    world.ball.restartedThisTick = true;
    world.ball.discontinuityId += 1;
    world.ball.placementReason = 'kickoff-setup';
    world.ball.restartPlaced = true;
    world.ball.restartPhase = 'kickoff-setup';
    world.ball.restartEarliestTick = world.tick + KICKOFF_READY_TICKS;
    world.telemetry.kickoffs += 1;
    world.events.push({
      t: round(world.tick * DT, 2),
      type: 'kickoff',
      teamId,
      x: round(location.x),
      y: round(location.y),
      taker: taker.id,
      text: restartEventText('kickoff', teamId)
    });
    return;
  }
  taker.target = { ...location };
  taker.zone = { x: location.x, y: location.y, rx: 2.2, ry: 3.2 };
  if (world.tick < world.ball.restartEarliestTick) return;

  if (!world.ball.restartPlaced) {
    world.ball.x = location.x;
    world.ball.y = location.y;
    world.ball.restartedThisTick = true;
    world.ball.discontinuityId += 1;
    world.ball.placementReason = `${kind}-placement`;
    world.ball.restartPlaced = true;
  }
  if (distance(taker.position, location) > (taker.isGoalkeeper ? 3 : 2.6)) return;

  world.events.push({
    t: round(world.tick * DT, 2),
    type: 'restart-taken',
    teamId,
    actor: taker.id,
    restartKind: kind,
    x: round(location.x),
    y: round(location.y),
    text: `${taker.name} ${restartEventText(kind, teamId).replace(' kullanacak.', ' kullandı.')}`
  });
  world.telemetry.setPiecesTaken += 1;
  world.lastRestartTakenTick = world.tick;
  world.ball.lastTouchedPlayerId = taker.id;
  world.ball.x = location.x;
  world.ball.y = location.y;

  if (kind === 'penalty') {
    const opponents = world.players.filter(player => player.teamId !== teamId && !player.isGoalkeeper);
    const context = shotContext(world, taker, opponents, 100);
    context.shotDistance = distance(location, { x: context.goalX, y: 50 });
    context.xg = world.branch === 'fifa' ? 0.76 : 0.72;
    context.utility = 100;
    context.isPenalty = true;
    clearRestartState(world.ball);
    startShot(world, taker, context);
    return;
  }

  if (kind === 'free-kick') {
    const opponents = world.players.filter(player => player.teamId !== teamId && !player.isGoalkeeper);
    const context = shotContext(world, taker, opponents, 8);
    if (context.shotDistance <= (world.branch === 'fifa' ? 25 : 28) && world.rulesRng() < 0.46) {
      context.xg = clamp(context.xg * 0.82, 0.035, 0.32);
      context.utility = 80;
      clearRestartState(world.ball);
      startShot(world, taker, context);
      return;
    }
  }

  if (kind === 'kickoff') {
    chooseAttackPlan(world, teamId, 'kickoff');
  } else {
    ensureAttackPlan(world, teamId);
  }
  const receiver = selectRestartReceiver(world, taker, kind);
  clearRestartState(world.ball);
  if (!receiver) {
    takePossession(world, taker, 'restart');
    return;
  }
  startPass(world, taker, receiver);
  const passEvent = world.events[world.events.length - 1];
  passEvent.restartKind = kind;
  passEvent.text = `${taker.name}, ${receiver.name} ile ${kind === 'kickoff' ? 'santrayı' : 'duran topu'} oyuna soktu.`;
  world.lastPassTick = world.tick;
  updateTeamPlan(world, 1);
  updateTeamPlan(world, 2);
}

function isPenaltyAreaFoul(world, attackingTeamId, location) {
  const attackingRight = attackingTeamId === 1;
  const insideDepth = attackingRight ? location.x >= 82 : location.x <= 18;
  const halfWidth = world.branch === 'fifa' ? 24 : 28;
  return insideDepth && Math.abs(location.y - 50) <= halfWidth;
}

function maybeAwardFoul(world, owner, defender, relativeSpeed) {
  if (world.tick - world.lastFoulTick < WORLD_TICK_RATE * 5) return false;
  const foulChance = clamp(
    0.045 +
    (100 - defender.defending) * 0.0012 +
    Math.max(0, relativeSpeed - 3) * 0.009,
    0.045,
    0.19
  );
  if (world.rulesRng() > foulChance) return false;
  const location = { x: world.ball.x, y: world.ball.y };
  const penalty = isPenaltyAreaFoul(world, owner.teamId, location);
  world.lastFoulTick = world.tick;
  world.telemetry.fouls += 1;
  world.events.push({
    t: round(world.tick * DT, 2),
    type: 'foul',
    teamId: defender.teamId,
    awardedTeamId: owner.teamId,
    actor: defender.id,
    victim: owner.id,
    x: round(location.x),
    y: round(location.y),
    text: `${defender.name}, ${owner.name}'in ilerleyişini geç müdahaleyle durdurdu.`
  });
  const restartLocation = penalty
    ? { x: owner.teamId === 1 ? 86 : 14, y: 50 }
    : location;
  scheduleRestart(world, {
    kind: penalty ? 'penalty' : 'free-kick',
    teamId: owner.teamId,
    location: restartLocation,
    actor: owner.id,
    victim: defender.id,
    delaySeconds: penalty ? 1.15 : 0.75
  });
  return true;
}

function resolveBoundaryRestart(world) {
  const hitSideLine = world.ball.y <= FIELD.minY || world.ball.y >= FIELD.maxY;
  const hitGoalLine = world.ball.mode !== 'shot' &&
    !world.ball.postRebound &&
    (world.ball.x <= FIELD.minX || world.ball.x >= FIELD.maxX);
  if (!hitSideLine && !hitGoalLine) return false;

  world.ball.x = clamp(world.ball.x, FIELD.minX, FIELD.maxX);
  world.ball.y = clamp(world.ball.y, FIELD.minY, FIELD.maxY);
  const touchingTeam = lastTouchTeam(world);
  if (hitSideLine) {
    const teamId = oppositeTeam(touchingTeam);
    scheduleRestart(world, {
      kind: 'throw-in',
      teamId,
      location: {
        x: clamp(world.ball.x, FIELD.minX + 0.4, FIELD.maxX - 0.4),
        y: world.ball.y <= FIELD.minY ? FIELD.minY + 0.25 : FIELD.maxY - 0.25
      },
      actor: world.ball.lastTouchedPlayerId
    });
    return true;
  }

  const defendingTeam = world.ball.x <= FIELD.minX ? 1 : 2;
  const corner = touchingTeam === defendingTeam;
  scheduleRestart(world, {
    kind: corner ? 'corner' : 'goal-kick',
    teamId: corner ? oppositeTeam(defendingTeam) : defendingTeam,
    location: corner
      ? {
          x: world.ball.x <= FIELD.minX ? FIELD.minX + 0.2 : FIELD.maxX - 0.2,
          y: world.ball.y < 50 ? FIELD.minY + 0.2 : FIELD.maxY - 0.2
        }
      : {
          x: defendingTeam === 1 ? 10 : 90,
          y: 50
        },
    actor: world.ball.lastTouchedPlayerId
  });
  return true;
}

function takePossession(world, player, eventType = 'control') {
  const previousMode = world.ball.mode;
  const previousPasserId = world.ball.passerId;
  const previousPasserTeamId = world.ball.passerTeamId;
  const controlDistance = distance(world.ball, player.position);
  world.telemetry.maxOwnershipAttachDistance = Math.max(
    world.telemetry.maxOwnershipAttachDistance,
    controlDistance
  );
  if (controlDistance > 2.15) world.telemetry.invalidOwnershipTransitions += 1;
  world.ball.mode = 'carried';
  world.ball.ownerId = player.id;
  world.ball.targetId = null;
  world.ball.passerId = null;
  world.ball.passerTeamId = null;
  world.ball.target = null;
  world.ball.origin = null;
  world.ball.velocity = { x: 0, y: 0 };
  world.ball.looseStartedTick = null;
  world.ball.lastTouchedPlayerId = player.id;
  world.ball.contactCooldownUntilTick = world.tick + 3;
  world.ball.postRebound = false;
  const changedTeam = world.possessionTeam !== player.teamId;
  if (changedTeam) {
    world.possessionTeam = player.teamId;
    world.possessionChangedTick = world.tick;
    world.telemetry.possessionChanges += 1;
    chooseAttackPlan(world, player.teamId, eventType === 'interception' ? 'turnover' : 'possession');
  } else {
    ensureAttackPlan(world, player.teamId);
  }
  world.events.push({
    t: round(world.tick * DT, 2),
    type: eventType,
    teamId: player.teamId,
    actor: player.id,
    passerId: previousMode === 'pass' ? previousPasserId : null,
    passerTeamId: previousMode === 'pass' ? previousPasserTeamId : null,
    text: eventType === 'interception'
      ? `${player.name} pas yoluna girip topu gerçek kesişme noktasında kazandı.`
      : eventType === 'restart'
        ? `${player.name} duran top sonrasında oyunu yeniden başlattı.`
        : `${player.name} topu kontrol etti.`
  });
  updateTeamPlan(world, 1);
  updateTeamPlan(world, 2);
}

function segmentProgress(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return 0;
  return clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1
  );
}

function updateLooseBallPursuit(world) {
  [1, 2].forEach(teamId => {
    const closest = world.players
      .filter(player => player.teamId === teamId && !player.isGoalkeeper)
      .map(player => {
        const safetyRole = player.role === 'rest-defense' ||
          player.role === 'sweeper' ||
          player.role === 'back-line' ||
          player.role.startsWith('back-') ||
          player.role.startsWith('holding-');
        const widthRole = player.role === 'wide-outlet' || player.role.startsWith('wide-');
        return {
          player,
          gap: distance(player.position, world.ball),
          pursuitCost: distance(player.position, world.ball) +
            (safetyRole ? 18 : 0) +
            (widthRole ? 10 : 0)
        };
      })
      .sort((left, right) => left.pursuitCost - right.pursuitCost || left.gap - right.gap)[0];
    if (!closest) return;
    closest.player.target = {
      x: clamp(world.ball.x, FIELD.minX, FIELD.maxX),
      y: clamp(world.ball.y, FIELD.minY, FIELD.maxY)
    };
  });
}

function releaseLooseBall(world, {
  type,
  player = null,
  teamId = world.possessionTeam,
  speedMultiplier = 0.48,
  angleOffset = 0,
  text
}) {
  const currentSpeed = Math.max(4, length(world.ball.velocity));
  const currentDirection = length(world.ball.velocity) > 0.1
    ? Math.atan2(world.ball.velocity.y, world.ball.velocity.x)
    : (teamId === 1 ? 0 : Math.PI);
  const direction = currentDirection + angleOffset;
  world.ball.mode = 'loose';
  world.ball.ownerId = null;
  world.ball.targetId = null;
  world.ball.passerId = null;
  world.ball.passerTeamId = null;
  world.ball.target = null;
  world.ball.velocity = {
    x: Math.cos(direction) * currentSpeed * speedMultiplier,
    y: Math.sin(direction) * currentSpeed * speedMultiplier
  };
  world.ball.looseStartedTick = world.tick;
  world.ball.lastTouchedPlayerId = player?.id || null;
  world.ball.contactCooldownUntilTick = world.tick + 4;
  world.ball.postRebound = false;
  world.telemetry.looseBalls += 1;
  world.events.push({
    t: round(world.tick * DT, 2),
    type,
    teamId,
    actor: player?.id || null,
    x: round(world.ball.x),
    y: round(world.ball.y),
    ballSpeed: round(length(world.ball.velocity)),
    text
  });
  updateLooseBallPursuit(world);
}

function ballContactCandidates(world, from, to) {
  const intendedId = world.ball.targetId;
  return world.players
    .filter(player => world.ball.mode === 'shot'
      ? player.teamId !== world.ball.shooterTeamId
      : !player.isGoalkeeper)
    .filter(player => world.ball.mode === 'loose' || player.id !== world.ball.passerId)
    .filter(player => (
      player.id !== world.ball.lastTouchedPlayerId ||
      world.tick >= world.ball.contactCooldownUntilTick
    ))
    .map(player => {
      const isIntended = player.id === intendedId;
      const isOpponent = world.ball.passerTeamId &&
        player.teamId !== world.ball.passerTeamId;
      const radius = world.ball.mode === 'shot'
        ? player.isGoalkeeper
          ? world.branch === 'fifa' ? 2.65 : 3.35
          : 1.08
        : world.ball.mode === 'pass'
        ? isIntended ? 1.85 : isOpponent ? 1.12 : 1.35
        : world.ball.mode === 'dribble'
          ? isOpponent ? 1.62 : 0.9
          : 1.4;
      return {
        player,
        isIntended,
        isOpponent,
        gap: pointSegmentDistance(player.position, from, to),
        progress: segmentProgress(player.position, from, to),
        radius
      };
    })
    .filter(candidate => candidate.gap <= candidate.radius)
    .sort((left, right) => (
      left.progress - right.progress ||
      left.gap - right.gap ||
      left.player.id.localeCompare(right.player.id)
    ));
}

function countShotOnTarget(world) {
  if (world.ball.shotOnTarget && !world.ball.shotOnTargetCounted) {
    world.ball.shotOnTargetCounted = true;
    world.telemetry.shotsOnTarget += 1;
  }
}

function takeGoalkeeperPossession(world, keeper, shooter, eventType = 'save') {
  const controlDistance = distance(world.ball, keeper.position);
  const goalkeeperReach = world.branch === 'fifa' ? 2.7 : 3.4;
  world.telemetry.maxOwnershipAttachDistance = Math.max(
    world.telemetry.maxOwnershipAttachDistance,
    controlDistance
  );
  if (controlDistance > goalkeeperReach) world.telemetry.invalidOwnershipTransitions += 1;
  world.ball.mode = 'keeper-held';
  world.ball.ownerId = keeper.id;
  world.ball.targetId = null;
  world.ball.passerId = null;
  world.ball.passerTeamId = null;
  world.ball.target = null;
  world.ball.origin = null;
  world.ball.velocity = { x: 0, y: 0 };
  world.ball.heldStartedTick = world.tick;
  world.ball.lastTouchedPlayerId = keeper.id;
  world.ball.contactCooldownUntilTick = world.tick + 4;
  if (world.possessionTeam !== keeper.teamId) {
    world.possessionTeam = keeper.teamId;
    world.possessionChangedTick = world.tick;
    world.telemetry.possessionChanges += 1;
    chooseAttackPlan(world, keeper.teamId, 'goalkeeper-possession');
  }
  world.events.push({
    t: round(world.tick * DT, 2),
    type: eventType,
    teamId: keeper.teamId,
    actor: keeper.id,
    shooter: shooter?.id || null,
    x: round(world.ball.x),
    y: round(world.ball.y),
    text: eventType === 'keeper-claim'
      ? `${keeper.name} dışarı giden şutun önüne geçip topu kontrol etti.`
      : `${keeper.name} şut hattına ulaşıp topu kontrol etti.`
  });
  updateTeamPlan(world, 1);
  updateTeamPlan(world, 2);
}

function resolveShotContact(world, player) {
  const shooter = world.players.find(candidate => candidate.id === world.ball.shooterId);
  const speed = length(world.ball.velocity);
  if (player.isGoalkeeper) {
    const saveChance = clamp(
      0.68 +
      (player.goalkeeping - 70) * 0.009 -
      world.ball.shotXg * 0.28 -
      Math.max(0, speed - 38) * 0.012,
      0.38,
      0.9
    );
    if (world.rng() > saveChance) {
      world.ball.lastTouchedPlayerId = player.id;
      world.ball.contactCooldownUntilTick = world.tick + 5;
      return;
    }
    const onTarget = world.ball.shotOnTarget;
    countShotOnTarget(world);
    if (onTarget) world.telemetry.saves += 1;
    const catchChance = clamp(
      0.48 + (player.goalkeeping - 70) * 0.01 - world.ball.shotXg * 0.22,
      0.28,
      0.72
    );
    if (world.rng() <= catchChance) {
      world.telemetry.catches += 1;
      if (!onTarget) world.telemetry.keeperClaims += 1;
      takeGoalkeeperPossession(world, player, shooter, onTarget ? 'save' : 'keeper-claim');
      return;
    }
    world.telemetry.parries += 1;
    releaseLooseBall(world, {
      type: 'parry',
      player,
      teamId: player.teamId,
      speedMultiplier: 0.36,
      angleOffset: Math.PI * (0.65 + world.rng() * 0.3),
      text: `${player.name} şutu fiziksel temas noktasından oyun alanına çeldi.`
    });
    world.events[world.events.length - 1].shooter = shooter?.id || null;
    world.events[world.events.length - 1].onTarget = Boolean(onTarget);
    return;
  }

  const blockChance = clamp(
    0.62 + (player.defending - 70) * 0.008 - Math.max(0, speed - 37) * 0.012,
    0.32,
    0.86
  );
  if (world.rng() > blockChance) {
    world.ball.lastTouchedPlayerId = player.id;
    world.ball.contactCooldownUntilTick = world.tick + 5;
    return;
  }
  world.telemetry.blocks += 1;
  releaseLooseBall(world, {
    type: 'block',
    player,
    teamId: player.teamId,
    speedMultiplier: 0.4,
    angleOffset: Math.PI * (0.58 + world.rng() * 0.34),
    text: `${player.name} şut yoluna girip topu gerçek kesişme noktasında blokladı.`
  });
}

function controlProbability(world, player, speed, intended) {
  const pressure = nearestOpponentDistance(world, player);
  const ratingEffect = (player.rating - 70) * 0.0045;
  const speedPenalty = Math.max(0, speed - 13) * (intended ? 0.007 : 0.01);
  const pressurePenalty = Math.max(0, 5 - pressure) * (intended ? 0.025 : 0.035);
  return clamp(
    (intended ? 0.96 : 0.84) + ratingEffect - speedPenalty - pressurePenalty,
    intended ? 0.68 : 0.45,
    0.97
  );
}

function retainDribbleControl(world, owner) {
  world.ball.mode = 'carried';
  world.ball.ownerId = owner.id;
  world.ball.targetId = null;
  world.ball.passerId = null;
  world.ball.passerTeamId = null;
  world.ball.target = null;
  world.ball.origin = null;
  world.ball.velocity = { x: 0, y: 0 };
  world.ball.lastTouchedPlayerId = owner.id;
  world.ball.contactCooldownUntilTick = world.tick + 2;
}

function resolveDribbleDuel(world, defender) {
  const owner = world.players.find(player => player.id === world.ball.ownerId);
  if (!owner || defender.teamId === owner.teamId) return false;
  const shielding = owner.shieldingUntilTick >= world.tick;
  const relativeSpeed = length({
    x: owner.velocity.x - defender.velocity.x,
    y: owner.velocity.y - defender.velocity.y
  });
  const attackerScore =
    owner.dribbling * 0.58 +
    owner.composure * 0.18 +
    owner.strength * (shielding ? 0.34 : 0.12) +
    owner.maxSpeed * 2.2;
  const defenderScore =
    defender.defending * 0.56 +
    defender.strength * 0.26 +
    (100 - defender.reaction * 100) * 0.16 +
    relativeSpeed * 0.9;
  const keepChance = clamp(
    0.52 + (attackerScore - defenderScore) * 0.009 + (shielding ? 0.12 : 0),
    0.2,
    0.84
  );
  const looseChance = clamp(
    0.18 + relativeSpeed * 0.018 + (shielding ? 0.12 : 0),
    0.16,
    0.42
  );
  const roll = world.rng();

  world.telemetry.dribbleDuels += 1;
  if (shielding) world.telemetry.shoulderDuels += 1;
  if (maybeAwardFoul(world, owner, defender, relativeSpeed)) return true;

  if (roll <= keepChance) {
    world.telemetry.successfulDribbles += 1;
    if (shielding) world.telemetry.successfulShields += 1;
    defender.stunnedUntilTick = world.tick + Math.round(WORLD_TICK_RATE * 0.35);
    world.ball.lastTouchedPlayerId = defender.id;
    world.ball.contactCooldownUntilTick = world.tick + 6;
    world.events.push({
      t: round(world.tick * DT, 2),
      type: shielding ? 'shield-win' : 'dribble-beat',
      teamId: owner.teamId,
      actor: owner.id,
      defender: defender.id,
      x: round(world.ball.x),
      y: round(world.ball.y),
      text: shielding
        ? `${owner.name} omuz omuza temasta ${defender.name}'e topu göstermedi ve ayakta kaldı.`
        : `${owner.name}, ${defender.name}'i gerçek temas noktasında eksiltti.`
    });
    return true;
  }

  world.telemetry.failedDribbles += 1;
  if (roll <= keepChance + looseChance) {
    releaseLooseBall(world, {
      type: 'shoulder-duel',
      player: defender,
      teamId: defender.teamId,
      speedMultiplier: 0.42,
      angleOffset: (world.rng() - 0.5) * 1.1,
      text: `${owner.name} ile ${defender.name} omuz omuza girdi; top temas noktasından boşa çıktı.`
    });
    world.events[world.events.length - 1].victim = owner.id;
    return true;
  }

  world.lastTurnoverTick = world.tick;
  takePossession(world, defender, 'dribble-tackle');
  world.events[world.events.length - 1].victim = owner.id;
  return true;
}

function resolveBallContact(world, contact) {
  const speed = length(world.ball.velocity);
  const { player, isIntended, isOpponent } = contact;

  if (world.ball.mode === 'shot') {
    resolveShotContact(world, player);
    return;
  }

  if (world.ball.mode === 'dribble' && isOpponent) {
    resolveDribbleDuel(world, player);
    return;
  }

  if (world.ball.mode === 'pass' && isOpponent) {
    const interceptionChance = clamp(
      0.52 + (player.rating - 70) * 0.005 - Math.max(0, speed - 18) * 0.008,
      0.28,
      0.82
    );
    if (world.rng() <= interceptionChance) {
      world.telemetry.interceptions += 1;
      takePossession(world, player, 'interception');
      return;
    }
    world.telemetry.deflections += 1;
    const angleOffset = (world.rng() - 0.5) * 1.5 + (player.teamId === 1 ? -0.18 : 0.18);
    releaseLooseBall(world, {
      type: 'deflection',
      player,
      teamId: player.teamId,
      speedMultiplier: 0.55,
      angleOffset,
      text: `${player.name} pas yoluna ayağını uzattı; top ${round(world.ball.x, 1)}, ${round(world.ball.y, 1)} noktasından sekti.`
    });
    return;
  }

  const probability = controlProbability(world, player, speed, isIntended);
  if (world.rng() <= probability) {
    if (world.ball.mode === 'pass' && player.teamId === world.ball.passerTeamId) {
      world.telemetry.completedPasses += 1;
      world.telemetry.successfulControlDistanceTotal += distance(
        world.ball.origin || world.ball,
        world.ball
      );
    }
    takePossession(world, player, isIntended ? 'first-touch' : 'loose-ball');
    return;
  }

  world.telemetry.controlErrors += 1;
  const angleOffset = (world.rng() - 0.5) * 0.9;
  releaseLooseBall(world, {
    type: 'heavy-touch',
    player,
    teamId: player.teamId,
    speedMultiplier: 0.38,
    angleOffset,
    text: `${player.name} topu ${round(world.ball.x, 1)}, ${round(world.ball.y, 1)} noktasında önüne açtı; top hâlâ sahipsiz.`
  });
}

function resolveShotAtGoalLine(world, from, to) {
  const direction = world.ball.shooterTeamId === 1 ? 1 : -1;
  const goalLineX = direction === 1 ? GOAL.rightLineX : GOAL.leftLineX;
  const crossing = segmentCrossingAtX(from, to, goalLineX);
  if (!crossing) return false;
  const mouth = goalMouth(world.branch);
  const insideGoal = crossing.y >= mouth.minY && crossing.y <= mouth.maxY;
  const postGap = Math.min(
    Math.abs(crossing.y - mouth.minY),
    Math.abs(crossing.y - mouth.maxY)
  );
  const shooter = world.players.find(player => player.id === world.ball.shooterId);
  world.ball.x = crossing.x;
  world.ball.y = crossing.y;

  if (postGap <= 0.38) {
    world.telemetry.woodwork += 1;
    world.ball.mode = 'loose';
    world.ball.ownerId = null;
    world.ball.passerId = null;
    world.ball.passerTeamId = null;
    world.ball.target = null;
    world.ball.velocity = {
      x: -world.ball.velocity.x * 0.56,
      y: world.ball.velocity.y * 0.44 + (world.rng() - 0.5) * 5
    };
    world.ball.x = goalLineX - direction * 0.15;
    world.ball.postRebound = true;
    world.ball.looseStartedTick = world.tick;
    world.ball.contactCooldownUntilTick = world.tick + 4;
    world.telemetry.looseBalls += 1;
    world.events.push({
      t: round(world.tick * DT, 2),
      type: 'woodwork',
      teamId: world.ball.shooterTeamId,
      actor: shooter?.id || null,
      x: round(world.ball.x),
      y: round(world.ball.y),
      text: `${shooter?.name || 'Şutör'} direğe takıldı; top kale çizgisini geçmeden oyuna döndü.`
    });
    updateLooseBallPursuit(world);
    return true;
  }

  const restartTeamId = world.ball.shooterTeamId === 1 ? 2 : 1;
  if (insideGoal) {
    countShotOnTarget(world);
    world.score[world.ball.shooterTeamId] += 1;
    world.telemetry.goals += 1;
    world.ball.x = goalLineX + direction * 0.12;
    world.events.push({
      t: round(world.tick * DT, 2),
      type: 'goal',
      teamId: world.ball.shooterTeamId,
      actor: shooter?.id || null,
      x: round(world.ball.x),
      y: round(world.ball.y),
      score1: world.score[1],
      score2: world.score[2],
      xg: round(world.ball.shotXg, 3),
      isPenalty: Boolean(world.ball.isPenalty),
      text: `Gol! Top kale ağzından çizgiyi tamamen geçti: ${world.score[1]}-${world.score[2]}.`
    });
    scheduleGoalRestart(world, {
      scoringTeamId: world.ball.shooterTeamId,
      teamId: restartTeamId,
      actor: shooter?.id || null
    });
  } else {
    world.telemetry.misses += 1;
    world.events.push({
      t: round(world.tick * DT, 2),
      type: 'miss',
      teamId: world.ball.shooterTeamId,
      actor: shooter?.id || null,
      x: round(world.ball.x),
      y: round(world.ball.y),
      isPenalty: Boolean(world.ball.isPenalty),
      text: `${shooter?.name || 'Şutör'} kaleyi bulamadı; top kale ağzının dışından çizgiyi geçti.`
    });
    scheduleRestart(world, {
      kind: 'goal-kick',
      teamId: restartTeamId,
      location: { x: restartTeamId === 1 ? 10 : 90, y: 50 },
      actor: shooter?.id || null,
      delaySeconds: 0.75
    });
  }
  return true;
}

function updateBall(world) {
  const previous = { x: world.ball.x, y: world.ball.y };
  try {
    world.ball.restartedThisTick = false;
    if (world.ball.mode === 'dead') {
      updateSetPieceRestart(world);
      return;
    }
    if (['carried', 'keeper-held'].includes(world.ball.mode)) {
      const owner = world.players.find(player => player.id === world.ball.ownerId);
      if (!owner) return;
      const facing = length(owner.velocity) > 0.1 ? normalize(owner.velocity) : { x: owner.direction, y: 0 };
      const carriedTarget = {
        x: clamp(owner.position.x + facing.x * 0.8, FIELD.minX, FIELD.maxX),
        y: clamp(owner.position.y + facing.y * 0.8, FIELD.minY, FIELD.maxY)
      };
      const attachStep = limit({
        x: carriedTarget.x - world.ball.x,
        y: carriedTarget.y - world.ball.y
      }, 1.35);
      world.ball.x = clamp(world.ball.x + attachStep.x, FIELD.minX, FIELD.maxX);
      world.ball.y = clamp(world.ball.y + attachStep.y, FIELD.minY, FIELD.maxY);

      return;
    }

    const from = { x: world.ball.x, y: world.ball.y };
    const speedBeforeDrag = length(world.ball.velocity);
    const drag = world.ball.mode === 'shot'
      ? 0.72
      : world.ball.mode === 'pass'
        ? 1.15
      : world.ball.mode === 'dribble'
        ? 5.2
        : 3.4;
    const nextSpeed = Math.max(0, speedBeforeDrag - drag * DT);
    const direction = normalize(world.ball.velocity);
    const to = {
      x: world.ball.x + direction.x * nextSpeed * DT,
      y: world.ball.y + direction.y * nextSpeed * DT
    };
    world.ball.x = to.x;
    world.ball.y = to.y;
    world.ball.velocity = {
      x: direction.x * nextSpeed,
      y: direction.y * nextSpeed
    };
    if (
      world.ball.postRebound &&
      world.ball.x >= FIELD.minX &&
      world.ball.x <= FIELD.maxX
    ) {
      world.ball.postRebound = false;
    }

    const contacts = ballContactCandidates(world, from, to);
    if (contacts[0]) {
      world.ball.x = from.x + (to.x - from.x) * contacts[0].progress;
      world.ball.y = from.y + (to.y - from.y) * contacts[0].progress;
      resolveBallContact(world, contacts[0]);
      return;
    }

    if (world.ball.mode === 'shot' && resolveShotAtGoalLine(world, from, to)) return;
    if (resolveBoundaryRestart(world)) return;

    if (world.ball.mode === 'shot') {
      const shotAge = (world.tick - world.ball.shotStartedTick) * DT;
      if (shotAge > 2.4 || nextSpeed <= 8) {
        world.telemetry.misses += 1;
        const restartTeamId = world.ball.shooterTeamId === 1 ? 2 : 1;
        world.events.push({
          t: round(world.tick * DT, 2),
          type: 'miss',
          teamId: world.ball.shooterTeamId,
          actor: world.ball.shooterId,
          isPenalty: Boolean(world.ball.isPenalty),
          text: 'Şut kale çizgisine ulaşmadan hızını kaybetti.'
        });
        scheduleRestart(world, {
          kind: 'goal-kick',
          teamId: restartTeamId,
          location: { x: restartTeamId === 1 ? 10 : 90, y: 50 },
          actor: world.ball.shooterId
        });
      }
    } else if (world.ball.mode === 'pass') {
      const passAge = (world.tick - world.ball.passStartedTick) * DT;
      const targetGap = world.ball.target ? distance(world.ball, world.ball.target) : 100;
      if (passAge > 2.6 || (targetGap < 1.2 && nextSpeed < 22)) {
        world.telemetry.overhitPasses += 1;
        releaseLooseBall(world, {
          type: 'overhit',
          teamId: world.ball.passerTeamId || world.possessionTeam,
          speedMultiplier: 0.62,
          text: `Pas hedefe ulaşmadı; top ${round(world.ball.x, 1)}, ${round(world.ball.y, 1)} noktasında boşa çıktı.`
        });
      }
    } else if (world.ball.mode === 'dribble') {
      const owner = world.players.find(player => player.id === world.ball.ownerId);
      if (!owner) {
        releaseLooseBall(world, {
          type: 'heavy-dribble',
          teamId: world.possessionTeam,
          speedMultiplier: 0.65,
          text: 'Top sürme sırasında sahiplik kayboldu; top sahipsiz kaldı.'
        });
        return;
      }
      const dribbleAge = (world.tick - world.ball.dribbleStartedTick) * DT;
      const targetGap = world.ball.target ? distance(world.ball, world.ball.target) : 100;
      const ownerGap = distance(owner.position, world.ball);
      if (
        dribbleAge >= 0.18 &&
        ownerGap <= 1.85 &&
        (targetGap <= 0.5 || nextSpeed <= 4.3)
      ) {
        retainDribbleControl(world, owner);
      } else if (dribbleAge > 1.05 || ownerGap > 3.2) {
        world.telemetry.failedDribbles += 1;
        world.telemetry.heavyDribbleTouches += 1;
        releaseLooseBall(world, {
          type: 'heavy-dribble',
          player: owner,
          teamId: owner.teamId,
          speedMultiplier: 0.58,
          angleOffset: (world.rng() - 0.5) * 0.55,
          text: `${owner.name}'in dokunuşu açıldı; top oyuncuya geri yapışmadan boşa çıktı.`
        });
      }
    } else {
      updateLooseBallPursuit(world);
    }
  } finally {
    const ballStep = distance(previous, world.ball);
    const ballSpeed = length(world.ball.velocity);
    if (!world.ball.restartedThisTick) {
      world.telemetry.maxBallStep = Math.max(world.telemetry.maxBallStep, ballStep);
    } else {
      world.telemetry.markedBallPlacements += 1;
      world.telemetry.maxMarkedBallPlacement = Math.max(
        world.telemetry.maxMarkedBallPlacement,
        ballStep
      );
    }
    world.telemetry.maxBallSpeed = Math.max(world.telemetry.maxBallSpeed, ballSpeed);
    if (!world.ball.restartedThisTick && ballStep > 2.2) {
      world.telemetry.ballDiscontinuities += 1;
    }
  }
}

function separationForce(player, players) {
  return players.reduce((force, other) => {
    if (other.id === player.id || other.isGoalkeeper) return force;
    const currentDx = player.position.x - other.position.x;
    const currentDy = player.position.y - other.position.y;
    const currentGap = Math.hypot(currentDx, currentDy);
    const lookAhead = 0.42;
    const futureDx = (player.position.x + player.velocity.x * lookAhead) -
      (other.position.x + other.velocity.x * lookAhead);
    const futureDy = (player.position.y + player.velocity.y * lookAhead) -
      (other.position.y + other.velocity.y * lookAhead);
    const futureGap = Math.hypot(futureDx, futureDy);
    const useFuture = futureGap < currentGap;
    const dx = useFuture ? futureDx : currentDx;
    const dy = useFuture ? futureDy : currentDy;
    const gap = useFuture ? futureGap : currentGap;
    const desiredGap = other.teamId === player.teamId
      ? player.branch === 'fifa' ? 3.6 : 5.6
      : 2.4;
    if (gap < 0.001 || gap >= desiredGap) return force;
    const strength = (desiredGap - gap) / desiredGap;
    force.x += (dx / gap) * strength * (other.teamId === player.teamId ? 24 : 7);
    force.y += (dy / gap) * strength * (other.teamId === player.teamId ? 24 : 7);
    return force;
  }, { x: 0, y: 0 });
}

function movePlayer(player, players, world) {
  player.previousPosition = { ...player.position };
  const toTarget = {
    x: player.target.x - player.position.x,
    y: player.target.y - player.position.y
  };
  const targetDistance = length(toTarget);
  const arrivalRadius = player.isGoalkeeper ? 2.2 : 5.5;
  const defensiveRecovery = player.role === 'cover' ||
    player.role === 'lane-top' ||
    player.role === 'lane-bottom' ||
    player.role.startsWith('midfield-');
  const shapeRecovery = player.role === 'wide-outlet' ||
    player.role.startsWith('wide-');
  const safetySprint = player.role === 'rest-defense' ||
    player.role === 'back-line' ||
    player.role === 'sweeper' ||
    player.role.startsWith('back-') ||
    player.role.startsWith('holding-') ||
    defensiveRecovery ||
    shapeRecovery;
  const roleMaxSpeedBase = safetySprint
    ? Math.min(
      8.15,
      player.maxSpeed * (shapeRecovery ? 1.1 : 1.12)
    )
    : player.maxSpeed;
  const roleMaxSpeed = player.stunnedUntilTick >= world.tick
    ? roleMaxSpeedBase * 0.34
    : roleMaxSpeedBase;
  const desiredSpeed = roleMaxSpeed * clamp(targetDistance / arrivalRadius, 0, 1);
  const desiredVelocity = normalize(toTarget);
  desiredVelocity.x *= desiredSpeed;
  desiredVelocity.y *= desiredSpeed;

  const separation = player.isGoalkeeper ? { x: 0, y: 0 } : separationForce(player, players);
  const steering = {
    x: desiredVelocity.x - player.velocity.x + separation.x,
    y: desiredVelocity.y - player.velocity.y + separation.y
  };
  const acceleration = limit(steering, player.maxAcceleration);
  player.velocity.x += acceleration.x * DT;
  player.velocity.y += acceleration.y * DT;
  player.velocity = limit(player.velocity, roleMaxSpeed);

  player.position.x = clamp(player.position.x + player.velocity.x * DT, FIELD.minX, FIELD.maxX);
  player.position.y = clamp(player.position.y + player.velocity.y * DT, FIELD.minY, FIELD.maxY);

  const speed = length(player.velocity);
  world.telemetry.maxSpeed = Math.max(world.telemetry.maxSpeed, speed);
  world.telemetry.maxAcceleration = Math.max(world.telemetry.maxAcceleration, length(acceleration));
  const moved = distance(player.previousPosition, player.position);
  if (moved > roleMaxSpeed * DT + 0.08) world.telemetry.teleportCount += 1;
}

function updateTelemetry(world) {
  [1, 2].forEach(teamId => {
    const team = world.players.filter(player => player.teamId === teamId && !player.isGoalkeeper);
    for (let left = 0; left < team.length; left += 1) {
      for (let right = left + 1; right < team.length; right += 1) {
        world.telemetry.minSameTeamDistance = Math.min(
          world.telemetry.minSameTeamDistance,
          distance(team[left].position, team[right].position)
        );
      }
    }
    if (world.ball.mode !== 'dead') {
      const ys = team.map(player => player.position.y);
      const xs = team.map(player => player.position.x);
      world.telemetry.widthSamples += Math.max(...ys) - Math.min(...ys);
      world.telemetry.widthSampleCount += 1;
      world.telemetry.lengthSamples += Math.max(...xs) - Math.min(...xs);
      world.telemetry.lengthSampleCount += 1;
    }
  });

  const attackingTeam = world.players.filter(
    player => player.teamId === world.possessionTeam && !player.isGoalkeeper
  );
  const direction = world.possessionTeam === 1 ? 1 : -1;
  const hasRestDefense = attackingTeam.some(
    player => direction * (world.ball.x - player.position.x) >= 10
  );
  const attackingProgress = direction === 1 ? world.ball.x : 100 - world.ball.x;
  const isSettledPossession = world.tick - world.possessionChangedTick >= TRANSITION_TICKS;
  if (
    world.ball.mode !== 'dead' &&
    !hasRestDefense &&
    isSettledPossession &&
    attackingProgress >= 35
  ) {
    world.telemetry.restDefenseVacantTicks += 1;
  }

  const nearbyOutfieldPlayers = world.players.filter(
    player => !player.isGoalkeeper && distance(player.position, world.ball) <= 10
  ).length;
  world.telemetry.maxPlayersNearBall = Math.max(
    world.telemetry.maxPlayersNearBall,
    nearbyOutfieldPlayers
  );
  const clusteredPlayerLimit = world.branch === 'fifa' ? 8 : 5;
  if (
    world.ball.mode !== 'dead' &&
    world.tick - world.lastRestartTakenTick > WORLD_TICK_RATE * 2 &&
    nearbyOutfieldPlayers > clusteredPlayerLimit
  ) {
    world.telemetry.clusteredTicks += 1;
  }

  const defendingTeamId = world.possessionTeam === 1 ? 2 : 1;
  const defendingDirection = defendingTeamId === 1 ? 1 : -1;
  const defendingTeam = world.players.filter(
    player => player.teamId === defendingTeamId && !player.isGoalkeeper
  );
  const goalSideCover = defendingTeam.filter(
    player => defendingDirection * (world.ball.x - player.position.x) >= 1.5
  ).length;
  const requiredGoalSideCover = world.branch === 'fifa' ? 3 : 2;
  if (
    world.ball.mode !== 'dead' &&
    goalSideCover < requiredGoalSideCover &&
    isSettledPossession
  ) {
    world.telemetry.defensiveCoverVacantTicks += 1;
  }

  const defendersNearBall = defendingTeam.filter(
    player => distance(player.position, world.ball) <= 6.5
  );
  world.telemetry.maxDefendersNearBall = Math.max(
    world.telemetry.maxDefendersNearBall,
    defendersNearBall.length
  );
  const unexplainedBallCommitments = defendersNearBall.filter(player => {
    if (player.responsibility === 'press' || player.responsibility === 'cover') return false;
    const target = player.markTargetId
      ? world.players.find(candidate => candidate.id === player.markTargetId)
      : null;
    return !target || distance(target.position, world.ball) > 8;
  }).length;
  if (unexplainedBallCommitments > 2) world.telemetry.defensiveOvercommitTicks += 1;

  const pressCount = defendingTeam.filter(player => player.role === 'press').length;
  const coverCount = defendingTeam.filter(player => player.role === 'cover').length;
  const markTargetIds = defendingTeam
    .filter(player => player.responsibility === 'mark' && player.markTargetId)
    .map(player => player.markTargetId);
  const expectedMarkTargets = world.branch === 'fifa' ? FIFA_MARKING_ROLES.length : 3;
  const sweeperCount = defendingTeam.filter(player => player.role === 'sweeper').length;
  if (world.ball.mode !== 'dead' && (
    pressCount !== 1 ||
    coverCount !== 1 ||
    markTargetIds.length !== expectedMarkTargets ||
    (world.branch === 'fifa' && sweeperCount !== 1) ||
    new Set(markTargetIds).size !== markTargetIds.length
  )) {
    world.telemetry.invalidDefensiveShapeTicks += 1;
  }

  if (
    world.ball.mode !== 'dead' &&
    isSettledPossession &&
    world.tick - world.lastRestartTakenTick > WORLD_TICK_RATE * 3
  ) {
    defendingTeam.forEach(player => {
      if (player.responsibility !== 'mark' || !player.markTargetId) return;
      const target = world.players.find(candidate => candidate.id === player.markTargetId);
      if (!target) return;
      world.telemetry.markingDistanceSamples += distance(player.position, target.position);
      world.telemetry.markingDistanceSampleCount += 1;
    });
  }

  const ownGoalX = defendingTeamId === 1 ? 5.5 : 94.5;
  const dangerZoneDepth = world.branch === 'fifa' ? 25 : 30;
  const dangerousThreatUncovered = attackingTeam.some(attacker => {
    if (Math.abs(attacker.position.x - ownGoalX) > dangerZoneDepth) return false;
    if (Math.abs(attacker.position.y - 50) > 32) return false;
    const nearestDefender = defendingTeam.reduce(
      (minimum, defender) => Math.min(minimum, distance(defender.position, attacker.position)),
      100
    );
    return nearestDefender > 18;
  });
  if (world.ball.mode !== 'dead' && dangerousThreatUncovered && isSettledPossession) {
    world.telemetry.uncoveredThreatTicks += 1;
  }
}

function snapshot(world) {
  return {
    t: round(world.tick * DT, 2),
    score: { 1: world.score[1], 2: world.score[2] },
    possessionTeam: world.possessionTeam,
    phase: world.teamPhases[world.possessionTeam].name,
    teamPhases: {
      1: world.teamPhases[1].name,
      2: world.teamPhases[2].name
    },
    ball: {
      x: round(world.ball.x),
      y: round(world.ball.y),
      vx: round(world.ball.velocity.x),
      vy: round(world.ball.velocity.y),
      ownerId: world.ball.ownerId,
      targetId: world.ball.targetId,
      passerId: world.ball.passerId,
      mode: world.ball.mode,
      restartKind: world.ball.restartKind,
      restartPhase: world.ball.restartPhase,
      discontinuityId: world.ball.discontinuityId,
      placementReason: world.ball.placementReason
    },
    players: world.players.map(player => ({
      id: player.id,
      x: round(player.position.x),
      y: round(player.position.y),
      vx: round(player.velocity.x),
      vy: round(player.velocity.y),
      targetX: round(player.target.x),
      targetY: round(player.target.y),
      zoneX: round(player.zone.x),
      zoneY: round(player.zone.y),
      zoneRx: round(player.zone.rx),
      zoneRy: round(player.zone.ry),
      role: player.role,
      responsibility: player.responsibility,
      markTargetId: player.markTargetId,
      shielding: player.shieldingUntilTick >= world.tick,
      stunned: player.stunnedUntilTick >= world.tick,
      goalkeeperDecision: player.goalkeeperDecision
    }))
  };
}

function buildPlayerRoleTelemetry(world) {
  return world.players
    .filter(player => !player.isGoalkeeper)
    .map(player => {
      const activeTicks = Math.max(0, world.tick - player.roleSinceTick);
      const durations = { ...player.roleDurations };
      durations[player.role] = (durations[player.role] || 0) + activeTicks;
      const stints = activeTicks > 0
        ? player.roleStints.concat({ role: player.role, ticks: activeTicks })
        : player.roleStints.slice();
      const meaningfulStints = stints.filter(stint => stint.role !== 'shape' && stint.ticks > 0);
      const heldTicks = meaningfulStints.reduce((total, stint) => total + stint.ticks, 0);
      const shortestTicks = meaningfulStints.reduce(
        (minimum, stint) => Math.min(minimum, stint.ticks),
        Number.POSITIVE_INFINITY
      );
      return {
        playerId: player.id,
        teamId: player.teamId,
        name: player.name,
        switches: player.roleSwitchCount,
        averageRoleSeconds: round((heldTicks / Math.max(1, meaningfulStints.length)) * DT),
        shortestRoleSeconds: round(
          (Number.isFinite(shortestTicks) ? shortestTicks : 0) * DT
        ),
        roleSeconds: Object.fromEntries(
          Object.entries(durations)
            .filter(([role, ticks]) => role !== 'shape' && ticks > 0)
            .map(([role, ticks]) => [role, round(ticks * DT)])
        )
      };
    });
}

function buildPhaseDurations(world) {
  const durations = { ...world.telemetry.phaseDurations };
  [1, 2].forEach(teamId => {
    const state = world.teamPhases[teamId];
    if (!state.name) return;
    durations[state.name] = (durations[state.name] || 0) +
      Math.max(0, world.tick - state.sinceTick);
  });
  return Object.fromEntries(
    Object.entries(durations).map(([phase, ticks]) => [phase, round(ticks * DT)])
  );
}

function createWorld(team1, team2, seed, branch) {
  const players = [
    ...createOutfieldPlayers(1, team1.characters, branch),
    createGoalkeeper(1, branch),
    ...createOutfieldPlayers(2, team2.characters, branch),
    createGoalkeeper(2, branch)
  ];
  const initialOwner = players.find(
    player => player.teamId === 1 && player.naturalIndex === (branch === 'fifa' ? 7 : 2)
  );
  const world = {
    version: 'football-v2-lab-10',
    branch,
    seed,
    rng: createSeededRng(`${seed}:football-v2-world`),
    rulesRng: createSeededRng(`${seed}:football-v2-rules`),
    tick: 0,
    players,
    score: { 1: 0, 2: 0 },
    possessionTeam: 1,
    possessionChangedTick: 0,
    teamPhases: {
      1: { name: null, sinceTick: 0 },
      2: { name: null, sinceTick: 0 }
    },
    defensiveStates: {
      1: { roles: {} },
      2: { roles: {} }
    },
    attackPlans: {
      1: {
        type: null,
        targetLane: 'center',
        sinceTick: 0,
        sequenceIndex: 0,
        lastPasserId: null,
        lastReceiverId: null,
        history: []
      },
      2: {
        type: null,
        targetLane: 'center',
        sinceTick: 0,
        sequenceIndex: 0,
        lastPasserId: null,
        lastReceiverId: null,
        history: []
      }
    },
    lastPassTick: -WORLD_TICK_RATE * 2,
    lastDribbleTick: -WORLD_TICK_RATE,
    lastShotTick: -WORLD_TICK_RATE * 2,
    lastTurnoverTick: -WORLD_TICK_RATE * 2,
    lastFoulTick: -WORLD_TICK_RATE * 6,
    lastRestartTakenTick: -WORLD_TICK_RATE * 2,
    events: [],
    ball: {
      x: initialOwner.position.x,
      y: initialOwner.position.y,
      ownerId: initialOwner.id,
      targetId: null,
      passerId: null,
      passerTeamId: null,
      target: null,
      origin: null,
      mode: 'carried',
      velocity: { x: 0, y: 0 },
      passStartedTick: 0,
      shotStartedTick: 0,
      shooterId: null,
      shooterTeamId: null,
      shotDistance: 0,
      shotXg: 0,
      shotOnTarget: false,
      shotOnTargetCounted: false,
      isPenalty: false,
      heldStartedTick: 0,
      restartKind: null,
      restartPhase: null,
      restartTeamId: null,
      restartLocation: null,
      restartTakerId: null,
      restartEarliestTick: null,
      restartAnnouncementTick: null,
      restartPlaced: false,
      restartScheduledTick: null,
      restartedThisTick: false,
      discontinuityId: 0,
      placementReason: null,
      postRebound: false,
      dribbleStartedTick: 0,
      lastDribbleDirection: initialOwner.direction === 1 ? 0 : Math.PI,
      shieldStartedTick: -WORLD_TICK_RATE,
      looseStartedTick: null,
      lastTouchedPlayerId: initialOwner.id,
      contactCooldownUntilTick: 0
    },
    telemetry: {
      teleportCount: 0,
      maxSpeed: 0,
      maxAcceleration: 0,
      roleSwitches: 0,
      roleChanges: [],
      phaseChanges: 0,
      phaseDurations: {},
      defensivePlans: 0,
      defensiveHandoffs: 0,
      pressHandoffs: 0,
      coverHandoffs: 0,
      markingHandoffs: 0,
      handoffEvents: [],
      possessionChanges: 0,
      passesAttempted: 0,
      completedPasses: 0,
      interceptions: 0,
      deflections: 0,
      controlErrors: 0,
      looseBalls: 0,
      overhitPasses: 0,
      boundaryBounces: 0,
      passDistanceTotal: 0,
      passLanePressureTotal: 0,
      passIntents: {},
      attackPlans: 0,
      attackPlanTypes: {},
      repeatedAttackPlans: 0,
      successfulControlDistanceTotal: 0,
      maxBallSpeed: 0,
      maxBallStep: 0,
      ballDiscontinuities: 0,
      markedBallPlacements: 0,
      maxMarkedBallPlacement: 0,
      maxOwnershipAttachDistance: 0,
      invalidOwnershipTransitions: 0,
      dribbleAttempts: 0,
      dribbleTouches: 0,
      successfulDribbles: 0,
      failedDribbles: 0,
      dribbleDuels: 0,
      shoulderDuels: 0,
      shieldActions: 0,
      successfulShields: 0,
      heavyDribbleTouches: 0,
      maxDribbleTurnDegrees: 0,
      shots: 0,
      shotsOnTarget: 0,
      goals: 0,
      saves: 0,
      keeperClaims: 0,
      catches: 0,
      parries: 0,
      blocks: 0,
      misses: 0,
      woodwork: 0,
      longRangeShots: 0,
      shotDistanceTotal: 0,
      maxShotDistance: 0,
      xgTotal: 0,
      penaltyShots: 0,
      goalkeeperDecisionChanges: 0,
      keeperDistributions: 0,
      corners: 0,
      throwIns: 0,
      goalKicks: 0,
      freeKicks: 0,
      penalties: 0,
      kickoffs: 0,
      fouls: 0,
      setPiecesTaken: 0,
      goalCelebrations: 0,
      kickoffPlacements: 0,
      kickoffWrongHalfPlayers: 0,
      minSameTeamDistance: 100,
      widthSamples: 0,
      widthSampleCount: 0,
      lengthSamples: 0,
      lengthSampleCount: 0,
      restDefenseVacantTicks: 0,
      defensiveCoverVacantTicks: 0,
      clusteredTicks: 0,
      maxPlayersNearBall: 0,
      maxDefendersNearBall: 0,
      defensiveOvercommitTicks: 0,
      invalidDefensiveShapeTicks: 0,
      uncoveredThreatTicks: 0,
      markingDistanceSamples: 0,
      markingDistanceSampleCount: 0
    }
  };
  chooseAttackPlan(world, 1, 'match-start');
  updateTeamPlan(world, 1);
  updateTeamPlan(world, 2);
  return world;
}

function simulateFootballV2Lab({
  team1,
  team2,
  seed,
  durationSeconds,
  branch = 'futbol',
  mode = 'lab',
  measurePerformance = false
}) {
  if (!['futbol', 'fifa'].includes(branch)) {
    throw new Error('Football V2 laboratuvarı yalnızca Halı Saha ve FIFA branşlarını destekler.');
  }
  if (!team1?.characters || team1.characters.length < 5 || !team2?.characters || team2.characters.length < 5) {
    throw new Error('Football V2 laboratuvarı için iki takımda da en az 5 oyuncu gerekli.');
  }
  const matchMode = mode === 'full' ? 'full' : 'lab';
  const matchMinutes = matchMode === 'full'
    ? FULL_MATCH_MINUTES[branch]
    : DEFAULT_DURATION_SECONDS;
  const defaultDuration = matchMode === 'full'
    ? FULL_MATCH_PLAYBACK_SECONDS[branch]
    : DEFAULT_DURATION_SECONDS;
  const safeDuration = clamp(Number(durationSeconds) || defaultDuration, 10, 120);
  const playbackDuration = matchMode === 'full'
    ? clamp(Number(durationSeconds) || defaultDuration, 30, 300)
    : safeDuration;
  const simulationDuration = matchMode === 'full'
    ? FULL_MATCH_SIMULATION_SECONDS[branch]
    : safeDuration;
  const activeSnapshotRate = matchMode === 'full'
    ? FULL_MATCH_SNAPSHOT_RATE
    : SNAPSHOT_RATE;
  const heapBefore = measurePerformance ? process.memoryUsage().heapUsed : 0;
  const simulationStartedAt = measurePerformance ? process.hrtime.bigint() : 0n;
  const world = createWorld(team1, team2, seed, branch);
  const totalTicks = Math.round(simulationDuration * WORLD_TICK_RATE);
  const desiredSnapshotIntervals = Math.round(playbackDuration * activeSnapshotRate);
  const snapshots = [snapshot(world)];

  for (let tick = 1; tick <= totalTicks; tick += 1) {
    world.tick = tick;
    if (tick % ROLE_REPLAN_TICKS === 0) {
      updateTeamPlan(world, 1);
      updateTeamPlan(world, 2);
      if (world.ball.mode === 'loose') updateLooseBallPursuit(world);
    }
    if (tick % DECISION_TICKS === 0) makeOnBallDecision(world);
    world.players.forEach(player => movePlayer(player, world.players, world));
    updateBall(world);
    updateTelemetry(world);
    const expectedSnapshotIndex = Math.floor((tick / totalTicks) * desiredSnapshotIntervals);
    if (expectedSnapshotIndex >= snapshots.length) snapshots.push(snapshot(world));
  }

  const telemetry = {
    teleportCount: world.telemetry.teleportCount,
    maxSpeed: round(world.telemetry.maxSpeed),
    maxAcceleration: round(world.telemetry.maxAcceleration),
    roleSwitches: world.telemetry.roleSwitches,
    roleChanges: world.telemetry.roleChanges,
    playerRoles: buildPlayerRoleTelemetry(world),
    maxRoleSwitchesPerPlayer: Math.max(
      0,
      ...world.players.filter(player => !player.isGoalkeeper).map(player => player.roleSwitchCount)
    ),
    phaseChanges: world.telemetry.phaseChanges,
    phaseDurations: buildPhaseDurations(world),
    defensivePlans: world.telemetry.defensivePlans,
    defensiveHandoffs: world.telemetry.defensiveHandoffs,
    pressHandoffs: world.telemetry.pressHandoffs,
    coverHandoffs: world.telemetry.coverHandoffs,
    markingHandoffs: world.telemetry.markingHandoffs,
    handoffEvents: world.telemetry.handoffEvents,
    possessionChanges: world.telemetry.possessionChanges,
    passesAttempted: world.telemetry.passesAttempted,
    completedPasses: world.telemetry.completedPasses,
    interceptions: world.telemetry.interceptions,
    deflections: world.telemetry.deflections,
    controlErrors: world.telemetry.controlErrors,
    looseBalls: world.telemetry.looseBalls,
    overhitPasses: world.telemetry.overhitPasses,
    boundaryBounces: world.telemetry.boundaryBounces,
    averagePassDistance: round(
      world.telemetry.passDistanceTotal /
      Math.max(1, world.telemetry.passesAttempted)
    ),
    averagePassLanePressure: round(
      world.telemetry.passLanePressureTotal /
      Math.max(1, world.telemetry.passesAttempted)
    ),
    passIntents: { ...world.telemetry.passIntents },
    attackPlans: world.telemetry.attackPlans,
    attackPlanTypes: { ...world.telemetry.attackPlanTypes },
    repeatedAttackPlans: world.telemetry.repeatedAttackPlans,
    maxBallSpeed: round(world.telemetry.maxBallSpeed),
    maxBallStep: round(world.telemetry.maxBallStep),
    ballDiscontinuities: world.telemetry.ballDiscontinuities,
    markedBallPlacements: world.telemetry.markedBallPlacements,
    maxMarkedBallPlacement: round(world.telemetry.maxMarkedBallPlacement),
    maxOwnershipAttachDistance: round(world.telemetry.maxOwnershipAttachDistance),
    invalidOwnershipTransitions: world.telemetry.invalidOwnershipTransitions,
    dribbleAttempts: world.telemetry.dribbleAttempts,
    dribbleTouches: world.telemetry.dribbleTouches,
    successfulDribbles: world.telemetry.successfulDribbles,
    failedDribbles: world.telemetry.failedDribbles,
    dribbleDuels: world.telemetry.dribbleDuels,
    shoulderDuels: world.telemetry.shoulderDuels,
    shieldActions: world.telemetry.shieldActions,
    successfulShields: world.telemetry.successfulShields,
    heavyDribbleTouches: world.telemetry.heavyDribbleTouches,
    maxDribbleTurnDegrees: round(world.telemetry.maxDribbleTurnDegrees),
    shots: world.telemetry.shots,
    shotsOnTarget: world.telemetry.shotsOnTarget,
    goals: world.telemetry.goals,
    saves: world.telemetry.saves,
    keeperClaims: world.telemetry.keeperClaims,
    catches: world.telemetry.catches,
    parries: world.telemetry.parries,
    blocks: world.telemetry.blocks,
    misses: world.telemetry.misses,
    woodwork: world.telemetry.woodwork,
    longRangeShots: world.telemetry.longRangeShots,
    averageShotDistance: round(
      world.telemetry.shotDistanceTotal / Math.max(1, world.telemetry.shots)
    ),
    maxShotDistance: round(world.telemetry.maxShotDistance),
    xg: round(world.telemetry.xgTotal, 3),
    penaltyShots: world.telemetry.penaltyShots,
    goalkeeperDecisionChanges: world.telemetry.goalkeeperDecisionChanges,
    keeperDistributions: world.telemetry.keeperDistributions,
    corners: world.telemetry.corners,
    throwIns: world.telemetry.throwIns,
    goalKicks: world.telemetry.goalKicks,
    freeKicks: world.telemetry.freeKicks,
    penalties: world.telemetry.penalties,
    kickoffs: world.telemetry.kickoffs,
    fouls: world.telemetry.fouls,
    setPiecesTaken: world.telemetry.setPiecesTaken,
    goalCelebrations: world.telemetry.goalCelebrations,
    kickoffPlacements: world.telemetry.kickoffPlacements,
    kickoffWrongHalfPlayers: world.telemetry.kickoffWrongHalfPlayers,
    minSameTeamDistance: round(world.telemetry.minSameTeamDistance),
    averageTeamWidth: round(world.telemetry.widthSamples / Math.max(1, world.telemetry.widthSampleCount)),
    averageTeamLength: round(world.telemetry.lengthSamples / Math.max(1, world.telemetry.lengthSampleCount)),
    restDefenseVacantSeconds: round(world.telemetry.restDefenseVacantTicks * DT),
    defensiveCoverVacantSeconds: round(world.telemetry.defensiveCoverVacantTicks * DT),
    clusteredSeconds: round(world.telemetry.clusteredTicks * DT),
    maxPlayersNearBall: world.telemetry.maxPlayersNearBall,
    maxDefendersNearBall: world.telemetry.maxDefendersNearBall,
    defensiveOvercommitSeconds: round(world.telemetry.defensiveOvercommitTicks * DT),
    invalidDefensiveShapeSeconds: round(world.telemetry.invalidDefensiveShapeTicks * DT),
    uncoveredThreatSeconds: round(world.telemetry.uncoveredThreatTicks * DT),
    averageMarkingDistance: round(
      world.telemetry.markingDistanceSamples /
      Math.max(1, world.telemetry.markingDistanceSampleCount)
    ),
    frameCount: snapshots.length
  };

  const teams = [
    { id: 1, name: team1.displayName || 'Mavi Takım' },
    { id: 2, name: team2.displayName || 'Kırmızı Takım' }
  ];
  const roster = world.players.map(player => ({
    id: player.id,
    teamId: player.teamId,
    name: player.name,
    emoji: player.emoji,
    rating: player.rating,
    dribbling: player.dribbling,
    defending: player.defending,
    strength: round(player.strength),
    finishing: player.finishing,
    goalkeeping: player.goalkeeping,
    positionCode: player.positionCode,
    isBot: player.isBot,
    isGoalkeeper: player.isGoalkeeper
  }));
  const statistics = buildFootballV2Stats({
    players: roster,
    teams,
    events: world.events,
    snapshots
  });
  const playbackScale = playbackDuration / simulationDuration;
  const playbackSnapshots = matchMode === 'full'
    ? snapshots.map(frame => ({ ...frame, t: round(frame.t * playbackScale, 3) }))
    : snapshots;
  const playbackEvents = matchMode === 'full'
    ? world.events.map(event => ({ ...event, t: round(event.t * playbackScale, 3) }))
    : world.events;
  const playbackCommentary = matchMode === 'full'
    ? statistics.commentary.map(event => ({ ...event, t: round(event.t * playbackScale, 3) }))
    : statistics.commentary;
  statistics.commentary = playbackCommentary;

  const result = {
    version: world.version,
    branch: world.branch,
    seed,
    matchMode,
    matchMinutes,
    score: { 1: world.score[1], 2: world.score[2] },
    durationSeconds: playbackDuration,
    simulationDurationSeconds: simulationDuration,
    playbackScale: round(playbackScale, 4),
    worldTickRate: WORLD_TICK_RATE,
    snapshotRate: activeSnapshotRate,
    snapshotStrategy: matchMode === 'full' ? 'adaptive-3hz-full' : 'full-10hz',
    teams,
    roster,
    snapshots: playbackSnapshots,
    events: playbackEvents,
    telemetry,
    statistics,
    commentary: playbackCommentary
  };

  if (measurePerformance) {
    const simulationEndedAt = process.hrtime.bigint();
    const snapshotBytes = Buffer.byteLength(JSON.stringify(playbackSnapshots));
    const eventBytes = Buffer.byteLength(JSON.stringify(playbackEvents));
    const statisticsBytes = Buffer.byteLength(JSON.stringify(statistics));
    const rosterBytes = Buffer.byteLength(JSON.stringify(roster));
    result.performance = {
      simulationMs: round(Number(simulationEndedAt - simulationStartedAt) / 1e6, 2),
      heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
      snapshotBytes,
      eventBytes,
      statisticsBytes,
      estimatedPayloadBytes: snapshotBytes + eventBytes + statisticsBytes + rosterBytes,
      snapshotCount: playbackSnapshots.length,
      eventCount: playbackEvents.length,
      snapshotStrategy: result.snapshotStrategy
    };
  }

  return result;
}

module.exports = {
  simulateFootballV2Lab,
  WORLD_TICK_RATE,
  SNAPSHOT_RATE,
  FULL_MATCH_SNAPSHOT_RATE,
  FULL_MATCH_MINUTES
};
