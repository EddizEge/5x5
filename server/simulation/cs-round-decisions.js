const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (first, second) => Math.hypot(
  first.position.x - second.x,
  first.position.y - second.y
);

function evaluatePlantOpportunity({
  planter,
  attackers,
  defenders,
  plantPosition,
  roundProgress,
  timeCritical = false,
  mustAttempt = false,
  hasLineOfSight
}) {
  if (!planter?.alive || !planter.hasBomb) {
    return { allowed: false, reason: 'bomb-carrier-unavailable' };
  }
  const earliestPlantProgress = mustAttempt ? 0.2 : 0.38;
  if (roundProgress < earliestPlantProgress && !timeCritical) {
    return { allowed: false, reason: 'too-early' };
  }

  const support = attackers.filter(player =>
    player.alive
    && player !== planter
    && distance(player, planter.position) <= 13
  ).length;
  const closeThreats = defenders.filter(player =>
    player.alive
    && distance(player, plantPosition) <= 10.5
    && hasLineOfSight(player, planter)
  );
  if (closeThreats.length) {
    return {
      allowed: false,
      reason: 'site-contested',
      closeThreats: closeThreats.length,
      support
    };
  }
  if (
    support === 0
    && attackers.filter(player => player.alive).length > 2
    && !timeCritical
    && !mustAttempt
  ) {
    return { allowed: false, reason: 'no-support', support };
  }
  return {
    allowed: true,
    reason: mustAttempt ? 'must-attempt-site-secured' : 'site-secured',
    support,
    closeThreats: 0
  };
}

function choosePostPlantDecision({
  attackers,
  defenders,
  plantPosition,
  bombWindowMs = 6200,
  pathDistance,
  smokeCover = false,
  mustContest = false,
  rng = Math.random
}) {
  const aliveAttackers = attackers.filter(player => player.alive);
  const aliveDefenders = defenders.filter(player => player.alive);
  if (!aliveDefenders.length) {
    return {
      decision: 'save',
      reason: 'no-defenders',
      actor: null,
      metrics: { attackersAlive: aliveAttackers.length, defendersAlive: 0 }
    };
  }

  const candidates = aliveDefenders
    .map(player => {
      const routeDistance = pathDistance(player.position, plantPosition);
      const travelMs = clamp(Math.round(routeDistance * 72), 420, bombWindowMs);
      const defuseSeconds = player.hasDefuseKit ? 5 : 10;
      const defuseMs = Math.round(bombWindowMs * (defuseSeconds / 40));
      return {
        player,
        routeDistance,
        travelMs,
        defuseMs,
        defuseSeconds,
        totalMs: travelMs + defuseMs
      };
    })
    .sort((first, second) => first.totalMs - second.totalMs);
  const best = candidates[0];
  const attackersAlive = aliveAttackers.length;
  const defendersAlive = aliveDefenders.length;
  const disadvantage = attackersAlive - defendersAlive;
  const reachable = best.totalMs <= bombWindowMs * 0.9;
  const nearestAttacker = aliveAttackers.length
    ? Math.min(...aliveAttackers.map(player => distance(player, plantPosition)))
    : Infinity;
  const lowHealth = aliveDefenders.reduce((sum, player) => sum + player.health, 0)
    / Math.max(1, defendersAlive) < 43;
  const severeDisadvantage = disadvantage >= 3
    || (defendersAlive === 1 && attackersAlive >= 3)
    || (defendersAlive <= 2 && attackersAlive >= 4);
  const ninjaWindow = reachable
    && defendersAlive <= 2
    && attackersAlive >= 1
    && (smokeCover || nearestAttacker >= 7 || best.player.hasDefuseKit);
  const ninjaChance = clamp(
    0.06
      + (best.player.hasDefuseKit ? 0.12 : 0)
      + (smokeCover ? 0.18 : 0)
      + (nearestAttacker >= 12 ? 0.08 : 0)
      - Math.max(0, disadvantage) * 0.03,
    0.04,
    0.36
  );

  let decision = 'retake';
  let reason = 'retake-viable';
  if (!reachable && mustContest) {
    decision = 'retake';
    reason = 'no-save-round';
  } else if (!reachable) {
    decision = 'save';
    reason = 'insufficient-time';
  } else if (severeDisadvantage && ninjaWindow && rng() < ninjaChance) {
    decision = 'ninja';
    reason = 'ninja-window';
  } else if (!mustContest && severeDisadvantage && rng() < (lowHealth ? 0.58 : 0.28)) {
    decision = 'save';
    reason = 'severe-disadvantage';
  } else if (ninjaWindow && rng() < ninjaChance * 0.35) {
    decision = 'ninja';
    reason = 'ninja-window';
  }

  return {
    decision,
    reason,
    actor: best.player,
    metrics: {
      attackersAlive,
      defendersAlive,
      disadvantage,
      reachable,
      mustContest: Boolean(mustContest),
      smokeCover,
      lowHealth,
      nearestAttacker: Number.isFinite(nearestAttacker)
        ? Number(nearestAttacker.toFixed(2))
        : null,
      routeDistance: Number(best.routeDistance.toFixed(2)),
      travelMs: best.travelMs,
      defuseMs: best.defuseMs,
      defuseSeconds: best.defuseSeconds,
      totalMs: best.totalMs,
      bombWindowMs,
      hasDefuseKit: Boolean(best.player.hasDefuseKit)
    }
  };
}

module.exports = {
  evaluatePlantOpportunity,
  choosePostPlantDecision
};
