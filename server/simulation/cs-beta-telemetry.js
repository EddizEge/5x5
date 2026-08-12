const { evaluateCsBetaBalance } = require('./cs-beta-balance');

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let first = 0, second = polygon.length - 1; first < polygon.length; second = first++) {
    const a = polygon[first];
    const b = polygon[second];
    const crosses = ((a[1] > point.y) !== (b[1] > point.y))
      && point.x < ((b[0] - a[0]) * (point.y - a[1])) / ((b[1] - a[1]) || 1e-9) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function interpolatePosition(samples, elapsed) {
  if (!Array.isArray(samples) || !samples.length || !Number.isFinite(elapsed)) return null;
  if (elapsed <= samples[0][0]) return { x: samples[0][1], y: samples[0][2] };
  const last = samples[samples.length - 1];
  if (elapsed >= last[0]) return { x: last[1], y: last[2] };
  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle][0] <= elapsed) low = middle;
    else high = middle;
  }
  const from = samples[low];
  const to = samples[high];
  const progress = (elapsed - from[0]) / Math.max(1, to[0] - from[0]);
  return {
    x: from[1] + (to[1] - from[1]) * progress,
    y: from[2] + (to[2] - from[2]) * progress
  };
}

function fixed(value, digits = 3) {
  return Number((Number(value) || 0).toFixed(digits));
}

function buildCsBetaTelemetry(result) {
  const events = result.lines.map(line => line.visualEvent).filter(Boolean);
  const counts = {
    rounds: 0,
    attackerWins: 0,
    plants: 0,
    defuses: 0,
    explosions: 0,
    saves: 0,
    kills: 0,
    damageEvents: 0,
    utility: 0,
    pickups: 0,
    drops: 0,
    buys: { pistol: 0, eco: 0, half: 0, force: 0, full: 0, hero: 0 }
  };
  const utility = { smoke: 0, flash: 0, he: 0, molotov: 0, incendiary: 0 };
  const issues = [];
  const rounds = new Map();
  const playerState = new Map();
  const eventSizes = [];
  let fullSnapshots = 0;
  let deltaSnapshots = 0;
  let snapshotPlayers = 0;

  const roundState = round => {
    if (!rounds.has(round)) {
      rounds.set(round, {
        lastTick: -1,
        deaths: new Set(),
        planted: false,
        ended: false,
        positionTimelines: new Map()
      });
    }
    return rounds.get(round);
  };

  for (const event of events) {
    eventSizes.push(bytes(event));
    if (event.playerSnapshot === 'full') fullSnapshots += 1;
    if (event.playerSnapshot === 'delta') deltaSnapshots += 1;
    snapshotPlayers += event.players?.length || 0;
    const state = roundState(event.round);

    if (event.domain !== 'shooter' || event.branch !== 'cs' || event.map !== 'dust2') {
      issues.push(`R${event.round}: shooter alan kimliği bozuk (${event.type})`);
    }
    if (Number.isFinite(event.tick)) {
      if (event.tick < state.lastTick) {
        issues.push(`R${event.round}: olay tick'i geriye gitti (${event.type})`);
      }
      state.lastTick = Math.max(state.lastTick, event.tick);
    }

    if (event.type === 'round-start') {
      counts.rounds += 1;
      playerState.clear();
      state.positionTimelines = new Map(
        (event.positionTimelines || []).map(timeline => [timeline.id, timeline.samples])
      );
    }
    for (const player of event.players || []) {
      const previous = playerState.get(player.id) || {};
      playerState.set(player.id, { ...previous, ...player });
      if (Number.isFinite(player.x) && Number.isFinite(player.y)) {
        const expected = interpolatePosition(
          state.positionTimelines.get(player.id),
          Number(event.motionTimeMs || 0)
        );
        const routeDrift = expected
          ? Math.hypot(player.x - expected.x, player.y - expected.y)
          : 0;
        if (routeDrift > 1.35) {
          issues.push(
            `R${event.round}: ${player.id} rota dışı konum ${fixed(routeDrift, 2)}`
            + ` (${event.type})`
          );
        }
      }
    }
    const weaponOwners = new Map();
    for (const player of playerState.values()) {
      if (!player.alive || !player.weaponEntityId) continue;
      if (weaponOwners.has(player.weaponEntityId)) {
        issues.push(`R${event.round}: ${player.weaponEntityId} iki envanterde`);
      }
      weaponOwners.set(player.weaponEntityId, player.id);
    }

    const registerDeath = playerId => {
      if (!playerId) return;
      if (state.deaths.has(playerId)) issues.push(`R${event.round}: ${playerId} çift ölüm`);
      state.deaths.add(playerId);
    };

    if (event.type === 'kill') {
      counts.kills += 1;
      if (!event.perception?.los || !event.perception?.collisionMesh) {
        issues.push(`R${event.round}: LOS/çarpışma doğrulaması olmayan kill`);
      }
      if (state.deaths.has(event.actor?.id)) {
        issues.push(`R${event.round}: ölü oyuncu kill aldı (${event.actor?.id})`);
      }
      registerDeath(event.target?.id);
    }
    if (event.type === 'damage') counts.damageEvents += 1;
    if (event.type === 'utility') {
      counts.utility += 1;
      utility[event.utility?.type] = (utility[event.utility?.type] || 0) + 1;
      for (const affected of event.affected || []) {
        if (affected.killed) registerDeath(affected.player?.id);
      }
    }
    if (event.type === 'equipment-drop') counts.drops += event.items?.length || 0;
    if (event.type === 'ground-pickup') counts.pickups += 1;
    if (event.type === 'buy-phase') {
      for (const team of Object.values(event.economy?.teams || {})) {
        if (Object.hasOwn(counts.buys, team.buyType)) counts.buys[team.buyType] += 1;
      }
    }
    if (event.type === 'plant') {
      counts.plants += 1;
      state.planted = true;
      const validZone = (event.plantZone || []).some(polygon =>
        Array.isArray(polygon) && polygon.length >= 3 && pointInPolygon(event.position, polygon)
      );
      if (!validZone || Number(event.plantApproachDistance) > 1.5) {
        issues.push(`R${event.round}: geçersiz plant konumu`);
      }
    }
    if (event.type === 'defuse') {
      counts.defuses += 1;
      if (!state.planted) issues.push(`R${event.round}: plant olmadan defuse`);
    }
    if (event.type === 'explode') {
      counts.explosions += 1;
      if (!state.planted) issues.push(`R${event.round}: plant olmadan patlama`);
      for (const affected of event.blast || []) {
        if (affected.killed) registerDeath(affected.player?.id);
      }
    }
    if (event.type === 'tactical-decision' && event.decision === 'save') counts.saves += 1;
    if (event.type === 'round-end') {
      if (state.ended) issues.push(`R${event.round}: çift round-end`);
      state.ended = true;
      if (event.winnerTeamId === event.attackerTeamId) counts.attackerWins += 1;
      if (event.resolution?.source !== 'world-state') {
        issues.push(`R${event.round}: world-state dışı sonuç`);
      }
    }
  }

  for (const [round, state] of rounds) {
    if (!state.ended) issues.push(`R${round}: round-end eksik`);
  }

  const buyTotal = Object.values(counts.buys).reduce((sum, value) => sum + value, 0);
  const metrics = {
    attackerWinRate: fixed(counts.attackerWins / Math.max(1, counts.rounds)),
    plantRate: fixed(counts.plants / Math.max(1, counts.rounds)),
    defusePerPlant: fixed(counts.defuses / Math.max(1, counts.plants)),
    savePerPlant: fixed(counts.saves / Math.max(1, counts.plants)),
    utilityPerRound: fixed(counts.utility / Math.max(1, counts.rounds)),
    fullBuyShare: fixed(counts.buys.full / Math.max(1, buyTotal)),
    forceBuyShare: fixed(counts.buys.force / Math.max(1, buyTotal)),
    averageRounds: counts.rounds
  };
  const payloadBytes = bytes(result);
  const payload = {
    resultBytes: payloadBytes,
    resultKilobytes: fixed(payloadBytes / 1024, 1),
    lineCount: result.lines.length,
    visualEventCount: events.length,
    averageEventBytes: Math.round(
      eventSizes.reduce((sum, value) => sum + value, 0) / Math.max(1, eventSizes.length)
    ),
    maxEventBytes: Math.max(0, ...eventSizes),
    fullSnapshots,
    deltaSnapshots,
    snapshotPlayers,
    averagePlayersPerEvent: fixed(snapshotPlayers / Math.max(1, events.length), 2)
  };

  return {
    version: '5L-release-1',
    map: 'dust2',
    status: issues.length ? 'critical' : 'pass',
    counts,
    utility,
    metrics,
    balance: evaluateCsBetaBalance(metrics),
    payload,
    criticalIssues: issues
  };
}

module.exports = {
  buildCsBetaTelemetry
};
