const { getWeapon } = require('./cs-weapon-catalog');
const { initialReserveAmmo } = require('./cs-ground-inventory');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function accuracyFor({ weapon, rating, health = 100, distance, behavior, shotIndex }) {
  const rangePressure = Math.max(0, distance - weapon.effectiveRange)
    / Math.max(8, weapon.effectiveRange);
  const ratingBonus = (rating - 70) / 220;
  const behaviorBonus = behavior === 'hold'
    ? 0.04
    : behavior === 'peek'
      ? 0.025
      : behavior === 'engage'
        ? 0.01
        : -0.035;
  const sprayPenalty = weapon.category === 'sniper'
    ? 0
    : Math.max(0, shotIndex - 1) * 0.025;
  const healthRatio = clamp((Number(health) || 0) / 100, 0, 1);
  const survivalPressure = (1 - healthRatio) * 0.11;
  return clamp(
    weapon.baseAccuracy + ratingBonus + behaviorBonus
      - rangePressure * 0.28
      - sprayPenalty
      - survivalPressure,
    0.16,
    0.96
  );
}

function headshotChance({ weapon, rating, health = 100, behavior }) {
  const weaponBias = weapon.category === 'sniper' ? -0.05 : weapon.category === 'pistol' ? 0.02 : 0;
  const holdBonus = behavior === 'hold' ? 0.02 : 0;
  const healthPenalty = (1 - clamp((Number(health) || 0) / 100, 0, 1)) * 0.045;
  return clamp(
    0.13 + (rating - 65) / 260 + weaponBias + holdBonus - healthPenalty,
    0.06,
    0.38
  );
}

function shotDamage({ weapon, distance, headshot, armored }) {
  const distanceScale = Math.pow(
    weapon.rangeModifier,
    Math.max(0, distance) / Math.max(1, weapon.effectiveRange)
  );
  const raw = weapon.damage * (headshot ? weapon.headMultiplier : 1) * distanceScale;
  const healthScale = armored ? 0.5 + weapon.armorPenetration * 0.5 : 1;
  const healthDamage = Math.max(1, Math.round(raw * healthScale));
  const armorDamage = armored
    ? Math.max(1, Math.round((raw - healthDamage) * 0.52))
    : 0;
  return { healthDamage, armorDamage };
}

function resolveBurst({ shooter, target, distance, behavior, rng = Math.random }) {
  const weapon = getWeapon(shooter.weapon);
  const hpBefore = target.health;
  const armorBefore = target.armor;
  let reloads = 0;
  if (shooter.ammo <= 0) {
    const reserve = Math.max(0, Number(
      shooter.reserveAmmo ?? initialReserveAmmo(weapon)
    ));
    const loaded = Math.min(weapon.magazineSize, reserve);
    shooter.ammo = loaded;
    shooter.reserveAmmo = reserve - loaded;
    reloads = loaded > 0 ? 1 : 0;
  }

  const desired = weapon.burstMin
    + Math.floor(rng() * (weapon.burstMax - weapon.burstMin + 1));
  const shots = Math.max(0, Math.min(desired, shooter.ammo));
  let hits = 0;
  let headshots = 0;
  let damageDone = 0;
  let armorDamageDone = 0;
  let fatalHeadshot = false;

  for (let shotIndex = 0; shotIndex < shots && target.health > 0; shotIndex += 1) {
    shooter.ammo -= 1;
    const hit = rng() <= accuracyFor({
      weapon,
      rating: shooter.rating,
      health: shooter.health,
      distance,
      behavior,
      shotIndex
    });
    if (!hit) continue;

    const headshot = rng() <= headshotChance({
      weapon,
      rating: shooter.rating,
      health: shooter.health,
      behavior
    });
    const armored = target.armor > 0 && (!headshot || target.helmet);
    const damage = shotDamage({ weapon, distance, headshot, armored });
    const appliedHealth = Math.min(target.health, damage.healthDamage);
    const appliedArmor = Math.min(target.armor, damage.armorDamage);
    target.health -= appliedHealth;
    target.armor -= appliedArmor;
    hits += 1;
    headshots += headshot ? 1 : 0;
    damageDone += appliedHealth;
    armorDamageDone += appliedArmor;
    if (target.health <= 0) fatalHeadshot = headshot;
  }

  const burst = {
    shots,
    hits,
    headshots,
    damage: damageDone,
    armorDamage: armorDamageDone,
    hpAfter: target.health,
    armorAfter: target.armor,
    ammoAfter: shooter.ammo
  };
  return {
    weapon: weapon.name,
    category: weapon.category,
    hpBefore,
    hpAfter: target.health,
    armorBefore,
    armorAfter: target.armor,
    shots,
    hits,
    headshots,
    damage: damageDone,
    armorDamage: armorDamageDone,
    accuracy: shots ? Number((hits / shots).toFixed(3)) : 0,
    fatalHeadshot,
    reloads,
    magazineAfter: shooter.ammo,
    reserveAfter: shooter.reserveAmmo,
    killed: target.health <= 0,
    bursts: [burst]
  };
}

function resolveElimination({ shooter, target, distance, behavior, rng = Math.random }) {
  const weapon = getWeapon(shooter.weapon);
  const hpBefore = target.health;
  const armorBefore = target.armor;
  const bursts = [];
  let totalShots = 0;
  let totalHits = 0;
  let totalHeadshots = 0;
  let totalDamage = 0;
  let totalArmorDamage = 0;
  let reloads = 0;
  let fatalHeadshot = false;
  let burstIndex = 0;

  while (target.health > 0 && burstIndex < 30) {
    burstIndex += 1;
    if (shooter.ammo <= 0) {
      const reserve = Math.max(0, Number(
        shooter.reserveAmmo ?? initialReserveAmmo(weapon)
      ));
      const loaded = Math.min(weapon.magazineSize, reserve);
      shooter.ammo = loaded;
      shooter.reserveAmmo = reserve - loaded;
      if (loaded > 0) reloads += 1;
    }
    const desired = weapon.burstMin
      + Math.floor(rng() * (weapon.burstMax - weapon.burstMin + 1));
    const shots = Math.max(0, Math.min(desired, shooter.ammo));
    if (shots <= 0) break;
    const burst = {
      shots,
      hits: 0,
      headshots: 0,
      damage: 0,
      armorDamage: 0,
      hpAfter: target.health,
      armorAfter: target.armor,
      ammoAfter: shooter.ammo
    };

    for (let shotIndex = 0; shotIndex < shots && target.health > 0; shotIndex += 1) {
      shooter.ammo -= 1;
      totalShots += 1;
      const forcedFinish = burstIndex === 30;
      const hit = forcedFinish || rng() <= accuracyFor({
        weapon,
        rating: shooter.rating,
        health: shooter.health,
        distance,
        behavior,
        shotIndex
      });
      if (!hit) continue;

      const headshot = forcedFinish || rng() <= headshotChance({
        weapon,
        rating: shooter.rating,
        health: shooter.health,
        behavior
      });
      const armored = target.armor > 0 && (!headshot || target.helmet);
      const damage = shotDamage({ weapon, distance, headshot, armored });
      const appliedHealth = Math.min(target.health, damage.healthDamage);
      const appliedArmor = Math.min(target.armor, damage.armorDamage);
      target.health -= appliedHealth;
      target.armor -= appliedArmor;
      burst.hits += 1;
      burst.headshots += headshot ? 1 : 0;
      burst.damage += appliedHealth;
      burst.armorDamage += appliedArmor;
      totalHits += 1;
      totalHeadshots += headshot ? 1 : 0;
      totalDamage += appliedHealth;
      totalArmorDamage += appliedArmor;
      if (target.health <= 0) fatalHeadshot = headshot;
    }

    burst.hpAfter = target.health;
    burst.armorAfter = target.armor;
    burst.ammoAfter = shooter.ammo;
    bursts.push(burst);
  }

  return {
    weapon: weapon.name,
    category: weapon.category,
    hpBefore,
    hpAfter: target.health,
    armorBefore,
    armorAfter: target.armor,
    shots: totalShots,
    hits: totalHits,
    headshots: totalHeadshots,
    damage: totalDamage,
    armorDamage: totalArmorDamage,
    accuracy: totalShots ? Number((totalHits / totalShots).toFixed(3)) : 0,
    fatalHeadshot,
    reloads,
    magazineAfter: shooter.ammo,
    reserveAfter: shooter.reserveAmmo,
    bursts
  };
}

module.exports = {
  accuracyFor,
  headshotChance,
  shotDamage,
  resolveBurst,
  resolveElimination
};
