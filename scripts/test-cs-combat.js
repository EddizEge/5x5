const assert = require('assert');
const { WEAPONS, starterWeapon, rifleWeapon } = require('../server/simulation/cs-weapon-catalog');
const {
  accuracyFor,
  shotDamage,
  resolveBurst,
  resolveElimination
} = require('../server/simulation/cs-combat');
const { createSeededRng } = require('../server/simulation/seeded-rng');

assert.equal(starterWeapon('T').name, 'Glock-18');
assert.equal(starterWeapon('CT').name, 'USP-S');
assert.equal(rifleWeapon('T').name, 'AK-47');
assert.equal(rifleWeapon('CT').name, 'M4A1-S');

const ak = WEAPONS['AK-47'];
const unarmored = shotDamage({ weapon: ak, distance: 12, headshot: false, armored: false });
const armored = shotDamage({ weapon: ak, distance: 12, headshot: false, armored: true });
assert(unarmored.healthDamage > armored.healthDamage);
assert.equal(unarmored.armorDamage, 0);
assert(armored.armorDamage > 0);
assert(
  accuracyFor({
    weapon: ak,
    rating: 80,
    health: 20,
    distance: 18,
    behavior: 'engage',
    shotIndex: 0
  }) < accuracyFor({
    weapon: ak,
    rating: 80,
    health: 100,
    distance: 18,
    behavior: 'engage',
    shotIndex: 0
  })
);

const burstShooter = {
  weapon: 'AK-47',
  ammo: 30,
  rating: 76,
  health: 100
};
const burstTarget = {
  health: 100,
  armor: 100,
  helmet: true
};
const burst = resolveBurst({
  shooter: burstShooter,
  target: burstTarget,
  distance: 24,
  behavior: 'engage',
  rng: createSeededRng('partial-burst')
});
assert.equal(burst.hpBefore, 100);
assert(burst.hpAfter >= 0 && burst.hpAfter <= 100);
assert.equal(burst.bursts.length, 1);
assert(burst.shots >= burst.hits);

for (const weaponName of Object.keys(WEAPONS)) {
  const weapon = WEAPONS[weaponName];
  const shooter = {
    weapon: weaponName,
    ammo: weapon.magazineSize,
    rating: 82
  };
  const target = {
    health: 100,
    armor: 100,
    helmet: true
  };
  const result = resolveElimination({
    shooter,
    target,
    distance: weapon.category === 'sniper' ? 35 : 18,
    behavior: 'hold',
    rng: createSeededRng(`combat-${weaponName}`)
  });
  assert.equal(result.weapon, weaponName);
  assert.equal(result.hpBefore, 100);
  assert.equal(result.hpAfter, 0);
  assert.equal(result.damage, 100);
  assert(result.shots >= result.hits);
  assert(result.hits >= 1);
  assert(result.accuracy > 0 && result.accuracy <= 1);
  assert(result.bursts.length >= 1);
  assert.equal(target.health, 0);
  assert(shooter.ammo >= 0 && shooter.ammo < weapon.magazineSize);
}

console.log(JSON.stringify({
  weapons: Object.keys(WEAPONS),
  armorMitigation: {
    unarmored: unarmored.healthDamage,
    armored: armored.healthDamage,
    armorDamage: armored.armorDamage
  },
  deterministic: true
}));
