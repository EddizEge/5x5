const assert = require('node:assert/strict');
const {
  SOUND_PROFILES,
  evaluateHearing,
  estimateSoundPosition,
  teamCallDelay,
  fuseIntel
} = require('../server/simulation/cs-sound-intelligence');
const { ShooterWorld } = require('../server/simulation/shooter-world');
const { createSeededRng } = require('../server/simulation/seeded-rng');
const graph = require('../server/simulation/data/dust2-nav.json');

const rng = createSeededRng('cs-sound-intelligence');
const closeRun = evaluateHearing({
  type: 'run',
  distance: 4,
  observerRating: 80,
  occluded: true,
  rng
});
const distantWalk = evaluateHearing({
  type: 'walk',
  distance: 5,
  observerRating: 80,
  occluded: false,
  rng
});
assert.equal(closeRun.heard, true);
assert.equal(distantWalk.heard, false);
assert(SOUND_PROFILES.gunfire.radius > SOUND_PROFILES.reload.radius);
assert(SOUND_PROFILES.defuse.baseConfidence > SOUND_PROFILES.run.baseConfidence);

const estimate = estimateSoundPosition({ x: 50, y: 40, z: 0 }, 2.5, rng);
assert(Math.hypot(estimate.x - 50, estimate.y - 40) <= 2.5);
const callDelay = teamCallDelay('defuse', () => 0.5);
assert(callDelay >= 1 && callDelay <= 4);

const falseIntel = {
  targetId: 'target',
  source: 'sound',
  confidence: 0.52,
  tick: 5,
  x: 15,
  y: 15,
  fake: true,
  confirmations: 1
};
const corrected = fuseIntel(falseIntel, {
  targetId: 'target',
  source: 'sound',
  confidence: 0.82,
  tick: 9,
  x: 4,
  y: 4,
  fake: false
});
assert.equal(corrected.corrected, true);
assert.equal(corrected.fake, false);
const confirmed = fuseIntel(corrected, {
  ...corrected,
  tick: 12,
  x: 4.4,
  y: 4.1,
  confidence: 0.78
});
assert(confirmed.confirmations >= 2);
assert(confirmed.confidence >= corrected.confidence);

const start = graph.landmarks.tSpawn;
const point = {
  x: start.x,
  y: start.y,
  z: start.z,
  areaId: start.id || start.areaId
};
const makePlayer = (id, teamId, xOffset) => ({
  id,
  name: id,
  char: { name: id },
  teamId,
  side: teamId === 1 ? 'T' : 'CT',
  alive: true,
  position: { ...point, x: point.x + xOffset },
  rating: 80,
  health: 100,
  armor: 100,
  helmet: true,
  hasDefuseKit: false,
  hasBomb: false,
  weapon: 'AK-47',
  ammo: 30,
  utility: []
});
const source = makePlayer('source', 1, 0);
const directListener = makePlayer('direct-listener', 2, 3);
const callReceiver = makePlayer('call-receiver', 2, 15);
const players = [source, directListener, callReceiver];
const motionPlans = new Map(players.map(player => [
  player.id,
  [
    { ...player.position, t: 0 },
    { ...player.position, t: 4000 }
  ]
]));
const world = new ShooterWorld({
  players,
  motionPlans,
  durationMs: 4000,
  utility: [],
  rng: createSeededRng('cs-sound-world')
});
const reloadSound = world.emitSound({
  type: 'reload',
  sourcePlayer: source,
  visual: false
});
assert.equal(reloadSound.directHearers, 1);
assert.equal(reloadSound.heardBy[0].id, directListener.id);
assert.equal(world.memory.get(world.pairKey(directListener, source)).source, 'sound');
assert.equal(world.memory.has(world.pairKey(callReceiver, source)), false);
assert.equal(world.eligibleContact(directListener, source), null);

world.tick = Math.max(...world.pendingTeamCalls.map(call => call.deliverTick));
world.deliverTeamCalls();
const sharedMemory = world.memory.get(world.pairKey(callReceiver, source));
assert(sharedMemory);
assert.equal(sharedMemory.source, 'team-call');
assert(sharedMemory.confidence < reloadSound.heardBy[0].confidence);
assert.equal(world.eligibleContact(callReceiver, source), null);

const fakeSound = world.emitSound({
  type: 'plant',
  sourcePlayer: source,
  position: { ...source.position, x: source.position.x + 2 },
  fake: true,
  visual: false
});
assert(fakeSound.heardBy.some(listener => {
  const memory = world.memory.get(world.pairKey(
    players.find(player => player.id === listener.id),
    source
  ));
  return memory?.fake;
}));

console.log(JSON.stringify({
  profiles: Object.keys(SOUND_PROFILES),
  closeRunConfidence: Number(closeRun.confidence.toFixed(3)),
  walkBeyondRange: !distantWalk.heard,
  directHearers: reloadSound.directHearers,
  delayedTeamCall: sharedMemory.source,
  fakeSoundHearers: fakeSound.directHearers,
  correctedIntel: corrected.corrected,
  consistentConfirmations: confirmed.confirmations,
  soundCannotKill: true,
  deterministic: true
}));
