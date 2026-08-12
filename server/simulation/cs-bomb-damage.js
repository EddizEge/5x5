// Counter-Strike 2 changed official-map C4 damage in July 2026:
// the blast is a rapidly expanding, map-baked shockwave that follows spaces,
// loses energy around corners and does not pass straight through walls.
// Dust II's extracted nav graph is used as the baked propagation surface here.

const RADAR_WORLD_SCALE = 45.056;
const SHOCKWAVE_SPEED_WORLD_PER_SECOND = 2400;
const MAX_PROPAGATION_WORLD = 2250;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function segmentWorldDistance(first, second) {
  const dx = (second.x - first.x) * RADAR_WORLD_SCALE;
  const dy = (second.y - first.y) * RADAR_WORLD_SCALE;
  const dz = (Number(second.z) || 0) - (Number(first.z) || 0);
  return Math.hypot(dx, dy, dz);
}

function propagationDistanceWorld(path, from, to) {
  if (!Array.isArray(path) || !path.length) return Infinity;
  let total = segmentWorldDistance(from, path[0]);
  for (let index = 1; index < path.length; index += 1) {
    total += segmentWorldDistance(path[index - 1], path[index]);
  }
  total += segmentWorldDistance(path[path.length - 1], to);
  return total;
}

function rawShockwaveDamage(distanceWorld) {
  if (!Number.isFinite(distanceWorld) || distanceWorld >= MAX_PROPAGATION_WORLD) return 0;
  // Calibrated to the CS close-range lethality and rapidly dissipating outer
  // wave. Path distance supplies the current CS2 wall/corner attenuation.
  const normalized = (Math.max(0, distanceWorld) - 110) / 910;
  const damage = 500 * Math.exp(-(normalized * normalized));
  return damage < 1 ? 0 : damage;
}

function applyExplosionArmor(rawDamage, armor) {
  const safeRaw = Math.max(0, Number(rawDamage) || 0);
  const armorBefore = clamp(Math.round(Number(armor) || 0), 0, 100);
  if (!safeRaw || !armorBefore) {
    return {
      healthDamage: Math.ceil(safeRaw),
      armorDamage: 0
    };
  }

  let healthDamage = safeRaw * 0.5;
  let armorDamage = (safeRaw - healthDamage) * 0.5;
  if (armorDamage > armorBefore) {
    const absorbedDamage = armorBefore * 2;
    healthDamage = safeRaw - absorbedDamage;
    armorDamage = armorBefore;
  }
  return {
    healthDamage: Math.max(0, Math.ceil(healthDamage)),
    armorDamage: Math.max(0, Math.ceil(armorDamage))
  };
}

function calculateBombDamage({
  bombPosition,
  playerPosition,
  playerHealth = 100,
  playerArmor = 0,
  path = []
}) {
  const propagationDistance = propagationDistanceWorld(path, bombPosition, playerPosition);
  const rawDamage = rawShockwaveDamage(propagationDistance);
  const mitigated = applyExplosionArmor(rawDamage, playerArmor);
  const healthDamage = Math.min(
    Math.max(0, Math.round(Number(playerHealth) || 0)),
    mitigated.healthDamage
  );
  return {
    propagationModel: 'cs2-2026-nav-shockwave-v1',
    distanceWorld: Number(propagationDistance.toFixed(1)),
    rawDamage: Number(rawDamage.toFixed(2)),
    healthDamage,
    armorDamage: Math.min(Math.max(0, Number(playerArmor) || 0), mitigated.armorDamage),
    lethal: healthDamage >= Math.max(1, Number(playerHealth) || 0),
    arrivalMs: Math.round(
      propagationDistance / SHOCKWAVE_SPEED_WORLD_PER_SECOND * 1000
    )
  };
}

module.exports = {
  RADAR_WORLD_SCALE,
  SHOCKWAVE_SPEED_WORLD_PER_SECOND,
  MAX_PROPAGATION_WORLD,
  segmentWorldDistance,
  propagationDistanceWorld,
  rawShockwaveDamage,
  applyExplosionArmor,
  calculateBombDamage
};
