const assert = require('assert');
const {
  GroundInventoryRegistry,
  initialReserveAmmo
} = require('../server/simulation/cs-ground-inventory');

const player = (overrides = {}) => ({
  id: 'cs-1-0',
  name: 'Entry',
  teamId: 1,
  side: 'T',
  alive: true,
  rating: 82,
  roundRole: 'entry',
  rolePreference: 'entry',
  position: { x: 42, y: 51, z: 10 },
  weapon: 'AK-47',
  ammo: 17,
  reserveAmmo: 53,
  weaponEntityId: null,
  utility: ['flash', 'smoke'],
  utilityEntityIds: [],
  hasDefuseKit: false,
  equipmentDetached: false,
  ...overrides
});

const registry = new GroundInventoryRegistry({ round: 5 });
const casualty = player();
const drops = registry.dropPlayerEquipment(casualty, 90);
const weaponDrop = drops.find(item => item.itemType === 'weapon');
assert(weaponDrop, 'Ana silah ölüm noktasında kalmalı');
assert.equal(weaponDrop.weapon, 'AK-47');
assert.equal(weaponDrop.magazineAmmo, 17);
assert.equal(weaponDrop.reserveAmmo, 53);
assert.equal(casualty.utility.length, 0);
assert.equal(registry.dropPlayerEquipment(casualty, 91).length, 0, 'Aynı ölüm iki kez drop üretemez');

const carrier = player({
  id: 'cs-2-0',
  name: 'AWPer',
  teamId: 2,
  side: 'CT',
  roundRole: 'awp',
  rolePreference: 'awp',
  weapon: 'USP-S',
  ammo: 8,
  reserveAmmo: 24,
  utility: [],
  position: { x: 42.5, y: 51, z: 10 }
});
const storedWeapon = registry.items.get(weaponDrop.id);
assert(registry.candidateScore(carrier, storedWeapon) > 0);
const pickup = registry.pickup(carrier, storedWeapon, 100);
assert(pickup);
assert.equal(carrier.weapon, 'AK-47');
assert.equal(carrier.ammo, 17);
assert.equal(carrier.reserveAmmo, 53);
assert.equal(carrier.weaponEntityId, weaponDrop.id);
assert.equal(storedWeapon.status, 'inventory');

const secondPlayer = player({
  id: 'cs-2-1',
  teamId: 2,
  side: 'CT',
  weapon: 'USP-S',
  utility: []
});
assert.equal(registry.pickup(secondPlayer, storedWeapon, 101), null, 'Aynı silah iki envantere giremez');

carrier.equipmentDetached = false;
carrier.position = { x: 55, y: 40, z: 12 };
const redrops = registry.dropPlayerEquipment(carrier, 150);
const sameWeapon = redrops.find(item => item.id === weaponDrop.id);
assert(sameWeapon, 'Taşınan silah ikinci ölümde aynı dünya kimliğiyle yere dönmeli');
assert.equal(storedWeapon.status, 'ground');
assert.equal(carrier.weaponEntityId, null);

const saver = player({
  id: 'cs-2-2',
  name: 'Saver',
  teamId: 2,
  side: 'CT',
  weapon: 'MP9',
  ammo: 22,
  reserveAmmo: initialReserveAmmo('MP9'),
  utility: [],
  position: { x: 55, y: 40, z: 12 }
});
assert(registry.pickup(saver, storedWeapon, 170));
const summary = registry.summary([casualty, carrier, secondPlayer, saver]);
assert(summary.teams[2].recoveredValue >= storedWeapon.value);
assert(summary.teams[1].lostValue >= storedWeapon.value);
assert.equal(summary.groundItems.some(item => item.id === storedWeapon.id), false);

console.log(JSON.stringify({
  droppedItems: drops.length,
  weaponEntityId: storedWeapon.id,
  retainedAmmo: `${saver.ammo}/${saver.reserveAmmo}`,
  duplicateOwnershipPrevented: true,
  deathDropIdempotent: true,
  economySummary: summary.teams
}));
