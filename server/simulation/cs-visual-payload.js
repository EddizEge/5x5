const FULL_PLAYER_EVENT_TYPES = new Set([
  'round-start',
  'buy-phase',
  'defuse-attempt',
  'round-end'
]);

function playerVisualSignature(player) {
  return JSON.stringify({
    alive: player.alive,
    health: player.health,
    armor: player.armor,
    helmet: player.helmet,
    hasDefuseKit: player.hasDefuseKit,
    hasBomb: player.hasBomb,
    weapon: player.weapon,
    ammo: player.ammo,
    reserveAmmo: player.reserveAmmo,
    weaponEntityId: player.weaponEntityId || null,
    money: player.money,
    equipmentValue: player.equipmentValue,
    buyType: player.buyType,
    rolePreference: player.rolePreference,
    roundRole: player.roundRole,
    roundTask: player.roundTask,
    utility: player.utility,
    savedFromPreviousRound: player.savedFromPreviousRound,
    behavior: player.behavior,
    behaviorSource: player.behaviorSource,
    blinded: player.blinded,
    inFire: player.inFire
  });
}

function compactCsVisualEvent(event, cache) {
  if (!event?.players || !Array.isArray(event.players)) return event;
  if (event.type === 'round-start' || cache.round !== event.round) {
    cache.round = event.round;
    cache.players.clear();
  }

  if (event.type === 'round-start' && Array.isArray(event.motionPlans)) {
    event.motionPlans = event.motionPlans.map(plan => ({
      id: plan.id,
      // Görsel oynatıcı yalnız zaman ve radar X/Y koordinatlarını kullanır.
      // Nav areaId ile Z bilgisi sunucu doğrulamasında ve positionTimeline'da
      // kalır; her rota noktasında tekrar taşınması maç payloadını şişirir.
      points: (plan.points || []).map(point => ({
        t: Math.round(Number(point.t) || 0),
        x: Number(Number(point.x || 0).toFixed(3)),
        y: Number(Number(point.y || 0).toFixed(3))
      }))
    }));
  }

  const fullSnapshot = FULL_PLAYER_EVENT_TYPES.has(event.type);
  const mandatoryIds = new Set([
    event.actor?.id,
    event.target?.id,
    event.assist?.id,
    ...(event.affected || []).map(entry => entry.player?.id),
    ...(event.blast || []).map(entry => entry.player?.id),
    ...(event.actors || []).map(entry => entry.id)
  ].filter(Boolean));
  const players = [];
  for (const player of event.players) {
    const signature = playerVisualSignature(player);
    if (
      fullSnapshot
      || mandatoryIds.has(player.id)
      || cache.players.get(player.id) !== signature
    ) players.push(player);
    cache.players.set(player.id, signature);
  }
  event.players = players;
  event.playerSnapshot = fullSnapshot ? 'full' : 'delta';
  event.playerSnapshotCount = players.length;
  return event;
}

function createCsVisualPayloadCache() {
  return {
    round: null,
    players: new Map()
  };
}

module.exports = {
  FULL_PLAYER_EVENT_TYPES,
  compactCsVisualEvent,
  createCsVisualPayloadCache
};
