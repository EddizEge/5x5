const assert = require('node:assert/strict');
const { ShooterWorld } = require('../server/simulation/shooter-world');
const graph = require('../server/simulation/data/dust2-nav.json');

const start = graph.landmarks.tSpawn;
const point = {
  x: start.x,
  y: start.y,
  z: start.z,
  areaId: start.id || start.areaId
};
const makePlayer = (id, teamId, xOffset = 0) => ({
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

const players = [
  makePlayer('thrower', 1, -0.25),
  makePlayer('target', 2, 0.25)
];
const motionPlans = new Map(players.map(player => [
  player.id,
  [
    { ...player.position, t: 0 },
    { ...player.position, t: 4000 }
  ]
]));
const utility = [
  { id: 'flash-test', type: 'flash', ...point, ownerId: 'thrower', detonateTick: 1 },
  { id: 'he-test', type: 'he', ...point, ownerId: 'thrower', detonateTick: 2 },
  { id: 'fire-test', type: 'molotov', ...point, ownerId: 'thrower', detonateTick: 3 },
  { id: 'smoke-test', type: 'smoke', ...point, ownerId: 'thrower', detonateTick: 4 }
];

const world = new ShooterWorld({
  players,
  motionPlans,
  durationMs: 4000,
  utility,
  rng: () => 0.5
});

world.advanceOneTick();
const flash = world.takeUtilityEvent();
assert.equal(flash.utility.type, 'flash');
assert.equal(flash.affected.length, 2);
assert(players.every(player => player.blindedUntilTick > world.tick));
assert.equal(world.eligibleContact(players[0], players[1]), null);

world.advanceOneTick();
const he = world.takeUtilityEvent();
assert.equal(he.utility.type, 'he');
assert(he.affected.every(result => result.damage > 0));
assert(players.every(player => player.health < 100 && player.armor < 100));

world.advanceOneTick();
const fire = world.takeUtilityEvent();
assert.equal(fire.utility.type, 'molotov');
assert(fire.affected.every(result => result.damage > 0));
assert(players.every(player =>
  player.behavior === 'retreat' && player.behaviorSource === 'utility-fire'
));

world.advanceOneTick();
const smoke = world.takeUtilityEvent();
assert.equal(smoke.utility.type, 'smoke');
assert.equal(world.activeSmokes().length, 1);
assert.equal(world.traceForPair(players[0], players[1]).reason, 'smoke');
assert.equal(
  smoke.utility.activeUntilTick - smoke.tick,
  31,
  'Regulation smoke süresi CS saatinde 18 saniyeye karşılık gelmeli.'
);

const smokeOnlyPlayers = [
  makePlayer('smoke-observer', 1, -0.5),
  makePlayer('smoke-target', 2, 0.5)
];
const smokeOnlyMotion = new Map(smokeOnlyPlayers.map(player => [
  player.id,
  [
    { ...player.position, t: 0 },
    { ...player.position, t: 4000 }
  ]
]));
const smokeOnlyWorld = new ShooterWorld({
  players: smokeOnlyPlayers,
  motionPlans: smokeOnlyMotion,
  durationMs: 4000,
  utility: [
    { id: 'smoke-cache-test', type: 'smoke', ...point, detonateTick: 1 }
  ],
  rng: () => 0.5
});
smokeOnlyWorld.advanceOneTick();
assert.equal(
  smokeOnlyWorld.traceForPair(smokeOnlyPlayers[0], smokeOnlyPlayers[1]).reason,
  'smoke'
);
smokeOnlyPlayers[0].position.x = point.x + 6;
smokeOnlyPlayers[1].position.x = point.x + 7;
assert.equal(
  smokeOnlyWorld.traceForPair(smokeOnlyPlayers[0], smokeOnlyPlayers[1]).visible,
  true,
  'Oyuncular smoke hattından çıktıktan sonra eski smoke görüş sonucu önbellekte kalmamalı.'
);
smokeOnlyWorld.tick = smokeOnlyWorld.smokes[0].activeUntilTick + 1;
smokeOnlyPlayers[0].facing = { x: 1, y: 0 };
smokeOnlyWorld.updatePerception();
smokeOnlyWorld.updatePerception();
smokeOnlyWorld.updatePerception();
smokeOnlyPlayers[0].behavior = 'hold';
assert(
  smokeOnlyWorld.eligibleContact(smokeOnlyPlayers[0], smokeOnlyPlayers[1]),
  'Smoke bittikten sonra oyuncu yeniden görüş teması ve ateş yetkisi kazanmalı.'
);

const snapshot = world.snapshot();
assert(snapshot.every(player => player.blinded));
assert(snapshot.every(player => player.inFire));

console.log(JSON.stringify({
  utilityEvents: [flash, he, fire, smoke].map(event => event.utility.type),
  flashAffected: flash.affected.length,
  heDamage: he.affected.reduce((sum, result) => sum + result.damage, 0),
  fireDamage: fire.affected.reduce((sum, result) => sum + result.damage, 0),
  smokeBlocksSight: true,
  smokeClearsOnWorldClock: true,
  postSmokeContactRestored: true,
  deterministic: true
}));
