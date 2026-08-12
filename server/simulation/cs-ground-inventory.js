const { getWeapon, starterWeapon } = require('./cs-weapon-catalog');
const { CS_ECONOMY_RULES } = require('./cs-economy-rules');

const PRIMARY_CATEGORIES = new Set(['smg', 'rifle', 'sniper', 'shotgun']);
const ROLE_TAGS = Object.freeze({
  awp: ['sniper', 'long-range', 'scoped'],
  entry: ['entry', 'close-range', 'multi-kill'],
  support: ['precision', 'long-range', 'full-buy'],
  lurk: ['silenced', 'precision', 'one-tap'],
  anchor: ['anchor', 'multi-kill', 'close-range']
});

function initialReserveAmmo(weaponOrName) {
  const weapon = typeof weaponOrName === 'string'
    ? getWeapon(weaponOrName)
    : weaponOrName;
  const magazines = weapon.category === 'sniper'
    ? 3
    : weapon.category === 'shotgun'
      ? 4
      : weapon.category === 'pistol'
        ? 4
        : 3;
  return weapon.magazineSize * magazines;
}

function isPrimaryWeapon(name) {
  return PRIMARY_CATEGORIES.has(getWeapon(name)?.category);
}

function utilityCapacity(player, type) {
  if ((player.utility || []).length >= 4) return false;
  const owned = (player.utility || []).filter(item => item === type).length;
  return owned < (type === 'flash' ? 2 : 1);
}

function roleFit(player, weapon) {
  const desired = ROLE_TAGS[player.roundRole || player.rolePreference] || [];
  const tags = new Set([weapon.category, ...(weapon.tacticalTags || [])]);
  return desired.reduce((score, tag) => score + (tags.has(tag) ? 1 : 0), 0);
}

class GroundInventoryRegistry {
  constructor({ round = 1 } = {}) {
    this.round = round;
    this.sequence = 0;
    this.items = new Map();
    this.pickups = [];
  }

  createItem(payload) {
    const item = {
      id: `r${this.round}-ground-${++this.sequence}`,
      kind: 'ground-equipment',
      status: 'ground',
      pickedBy: null,
      pickedTick: null,
      availableTick: payload.tick || 0,
      ...payload
    };
    this.items.set(item.id, item);
    return item;
  }

  publicItem(item) {
    return {
      id: item.id,
      kind: item.kind,
      itemType: item.itemType,
      label: item.label,
      weapon: item.weapon || null,
      utility: item.utility || null,
      value: item.value,
      magazineAmmo: item.magazineAmmo ?? null,
      reserveAmmo: item.reserveAmmo ?? null,
      originTeamId: item.originTeamId,
      droppedBy: item.droppedBy,
      status: item.status,
      pickedBy: item.pickedBy,
      x: item.x,
      y: item.y,
      z: item.z,
      tick: item.tick
    };
  }

  detachWeapon(player, tick, position) {
    if (!isPrimaryWeapon(player.weapon)) return null;
    let item = player.weaponEntityId
      ? this.items.get(player.weaponEntityId)
      : null;
    if (item) {
      item.status = 'ground';
      item.pickedBy = null;
      item.pickedTick = null;
      item.availableTick = tick;
      Object.assign(item, position, {
        magazineAmmo: Math.max(0, Number(player.ammo) || 0),
        reserveAmmo: Math.max(0, Number(player.reserveAmmo) || 0),
        droppedBy: player.id,
        tick
      });
    } else {
      const weapon = getWeapon(player.weapon);
      item = this.createItem({
        itemType: 'weapon',
        label: weapon.name,
        weapon: weapon.name,
        value: weapon.price || 0,
        magazineAmmo: Math.max(0, Number(player.ammo) || 0),
        reserveAmmo: Math.max(0, Number(player.reserveAmmo) || 0),
        originTeamId: player.teamId,
        droppedBy: player.id,
        tick,
        ...position
      });
    }
    player.weaponEntityId = null;
    player.weapon = starterWeapon(player.side).name;
    player.ammo = 0;
    player.reserveAmmo = 0;
    return item;
  }

  dropPlayerEquipment(player, tick) {
    if (!player || player.equipmentDetached) return [];
    player.equipmentDetached = true;
    const position = {
      x: Number(player.position.x.toFixed(3)),
      y: Number(player.position.y.toFixed(3)),
      z: Number((player.position.z || 0).toFixed(1))
    };
    const dropped = [];
    const weapon = this.detachWeapon(player, tick, position);
    if (weapon) dropped.push(weapon);

    const utilityEntities = [...(player.utilityEntityIds || [])];
    for (const utility of [...(player.utility || [])]) {
      const entityIndex = utilityEntities.findIndex(entry => entry.type === utility);
      const entity = entityIndex >= 0
        ? this.items.get(utilityEntities.splice(entityIndex, 1)[0].itemId)
        : null;
      if (entity) {
        Object.assign(entity, position, {
          status: 'ground',
          pickedBy: null,
          pickedTick: null,
          availableTick: tick,
          droppedBy: player.id,
          tick
        });
        dropped.push(entity);
      } else {
        dropped.push(this.createItem({
          itemType: 'utility',
          label: utility,
          utility,
          value: CS_ECONOMY_RULES.utility[utility] || 0,
          originTeamId: player.teamId,
          droppedBy: player.id,
          tick,
          ...position
        }));
      }
    }
    player.utility = [];
    player.utilityEntityIds = [];

    if (player.hasDefuseKit && player.side === 'CT') {
      const kitEntity = player.defuseKitEntityId
        ? this.items.get(player.defuseKitEntityId)
        : null;
      if (kitEntity) {
        Object.assign(kitEntity, position, {
          status: 'ground',
          pickedBy: null,
          pickedTick: null,
          availableTick: tick,
          droppedBy: player.id,
          tick
        });
        dropped.push(kitEntity);
      } else {
        dropped.push(this.createItem({
          itemType: 'defuse-kit',
          label: 'Defuse Kit',
          value: CS_ECONOMY_RULES.defuseKit,
          originTeamId: player.teamId,
          droppedBy: player.id,
          tick,
          ...position
        }));
      }
      player.hasDefuseKit = false;
      player.defuseKitEntityId = null;
    }
    return dropped.map(item => this.publicItem(item));
  }

  candidateScore(player, item) {
    if (item.status !== 'ground') return -Infinity;
    if (item.itemType === 'defuse-kit') {
      return player.side === 'CT' && !player.hasDefuseKit ? 540 : -Infinity;
    }
    if (item.itemType === 'utility') {
      return utilityCapacity(player, item.utility) ? item.value + 180 : -Infinity;
    }
    const incoming = getWeapon(item.weapon);
    const current = getWeapon(player.weapon);
    if (!isPrimaryWeapon(incoming.name)) return -Infinity;
    const incomingAmmoRatio = (
      Number(item.magazineAmmo || 0) + Number(item.reserveAmmo || 0)
    ) / Math.max(1, incoming.magazineSize * 4);
    const currentAmmoRatio = (
      Number(player.ammo || 0) + Number(player.reserveAmmo || 0)
    ) / Math.max(1, current.magazineSize * 4);
    const currentValue = isPrimaryWeapon(current.name) ? current.price : 0;
    const fitDelta = roleFit(player, incoming) - roleFit(player, current);
    const upgrade = incoming.price - currentValue;
    if (currentValue > 0 && upgrade < -250 && fitDelta <= 0) return -Infinity;
    return upgrade
      + fitDelta * 280
      + incomingAmmoRatio * 220
      + (1 - Math.min(1, currentAmmoRatio)) * 180
      + 420;
  }

  pickup(player, item, tick) {
    if (!player?.alive || item.status !== 'ground') return null;
    let swapped = null;
    if (item.itemType === 'weapon') {
      swapped = this.detachWeapon(player, tick, {
        x: item.x,
        y: item.y,
        z: item.z
      });
      if (swapped) swapped.availableTick = tick + 14;
      player.weapon = item.weapon;
      player.ammo = item.magazineAmmo;
      player.reserveAmmo = item.reserveAmmo;
      player.weaponEntityId = item.id;
    } else if (item.itemType === 'utility') {
      if (!utilityCapacity(player, item.utility)) return null;
      player.utility.push(item.utility);
      player.utilityEntityIds = [...(player.utilityEntityIds || []), {
        itemId: item.id,
        type: item.utility
      }];
    } else if (item.itemType === 'defuse-kit') {
      if (player.side !== 'CT' || player.hasDefuseKit) return null;
      player.hasDefuseKit = true;
      player.defuseKitEntityId = item.id;
    } else {
      return null;
    }

    item.status = 'inventory';
    item.pickedBy = player.id;
    item.pickedTick = tick;
    const pickup = {
      item: this.publicItem(item),
      actor: {
        id: player.id,
        name: player.name,
        teamId: player.teamId
      },
      swapped: swapped ? this.publicItem(swapped) : null,
      carriedForTeammate: item.itemType === 'weapon'
        && roleFit(player, getWeapon(item.weapon)) === 0
        && item.value >= 1700,
      tick
    };
    this.pickups.push(pickup);
    return pickup;
  }

  activeItems() {
    return [...this.items.values()]
      .filter(item => item.status === 'ground')
      .map(item => this.publicItem(item));
  }

  summary(players = []) {
    const aliveIds = new Set(players.filter(player => player.alive).map(player => player.id));
    const teams = {
      1: { droppedValue: 0, recoveredValue: 0, preservedValue: 0, lostValue: 0, pickups: 0 },
      2: { droppedValue: 0, recoveredValue: 0, preservedValue: 0, lostValue: 0, pickups: 0 }
    };
    for (const item of this.items.values()) {
      teams[item.originTeamId].droppedValue += item.value;
      if (item.status === 'inventory' && item.pickedBy && aliveIds.has(item.pickedBy)) {
        const owner = players.find(player => player.id === item.pickedBy);
        if (owner) {
          teams[owner.teamId].recoveredValue += item.value;
          teams[owner.teamId].preservedValue += item.value;
          teams[owner.teamId].pickups += 1;
        }
        if (!owner || owner.teamId !== item.originTeamId) {
          teams[item.originTeamId].lostValue += item.value;
        }
      } else {
        teams[item.originTeamId].lostValue += item.value;
      }
    }
    return {
      itemCount: this.items.size,
      pickups: this.pickups.map(entry => ({
        itemId: entry.item.id,
        item: entry.item.label,
        itemType: entry.item.itemType,
        value: entry.item.value,
        actor: entry.actor,
        carriedForTeammate: entry.carriedForTeammate
      })),
      groundItems: this.activeItems(),
      teams
    };
  }
}

module.exports = {
  GroundInventoryRegistry,
  initialReserveAmmo,
  isPrimaryWeapon,
  roleFit
};
