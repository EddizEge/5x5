const assert = require('assert');
const {
  rawShockwaveDamage,
  applyExplosionArmor,
  calculateBombDamage,
  MAX_PROPAGATION_WORLD
} = require('../server/simulation/cs-bomb-damage');

assert(rawShockwaveDamage(200) > rawShockwaveDamage(900));
assert(rawShockwaveDamage(900) > rawShockwaveDamage(1600));
assert.equal(rawShockwaveDamage(MAX_PROPAGATION_WORLD + 1), 0);

const unarmored = applyExplosionArmor(220, 0);
const armored = applyExplosionArmor(220, 100);
assert.equal(unarmored.healthDamage, 220);
assert(armored.healthDamage < unarmored.healthDamage);
assert(armored.armorDamage > 0);

const bombPosition = { x: 70, y: 24, z: 0 };
const nearPosition = { x: 72, y: 24, z: 0 };
const farPosition = { x: 98, y: 24, z: 0 };
const near = calculateBombDamage({
  bombPosition,
  playerPosition: nearPosition,
  playerHealth: 100,
  playerArmor: 100,
  path: [bombPosition, nearPosition]
});
const far = calculateBombDamage({
  bombPosition,
  playerPosition: farPosition,
  playerHealth: 100,
  playerArmor: 100,
  path: [bombPosition, farPosition]
});
const aroundWall = calculateBombDamage({
  bombPosition,
  playerPosition: nearPosition,
  playerHealth: 100,
  playerArmor: 100,
  path: [
    bombPosition,
    { x: 70, y: 46, z: 0 },
    { x: 72, y: 46, z: 0 },
    nearPosition
  ]
});

assert.equal(near.lethal, true);
assert(near.healthDamage > far.healthDamage);
assert(near.healthDamage > aroundWall.healthDamage);
assert(near.arrivalMs < far.arrivalMs);
assert(near.arrivalMs < aroundWall.arrivalMs);
assert.equal(near.propagationModel, 'cs2-2026-nav-shockwave-v1');

console.log(JSON.stringify({
  near,
  far,
  aroundWall,
  cutoffWorld: MAX_PROPAGATION_WORLD,
  armorMitigation: armored
}));
