const assert = require('assert');
const { simulateMatch } = require('../server/simulation/engine');
const {
  BOOST_ONLY_ASCENT_KEYS,
  collisionStats,
  canTraverseNavEdge,
  routeThrough,
  traceLineOfSight,
  toTimedMotion,
  validateMotion
} = require('../server/simulation/dust2-navigation');
const {
  ATTACK_ROUTES,
  selectAttackPlan,
  T_SPAWN_AREA_IDS,
  CT_SPAWN_AREA_IDS,
  DEFENDER_ROUTES
} = require('../server/simulation/shooter-ai');
const {
  T_POSTPLANT_POSITIONS
} = require('../server/simulation/cs-dust2-tactical-catalog');
const dust2Graph = require('../server/simulation/data/dust2-nav.json');
const VALID_POSTPLANT_ROLES = new Set([
  ...T_POSTPLANT_POSITIONS.A,
  ...T_POSTPLANT_POSITIONS.B
].map(position => position.role));

function team(prefix, ratingOffset = 0) {
  return {
    displayName: `${prefix} Takımı`,
    style: 'dengeli',
    characters: Array.from({ length: 5 }, (_, index) => ({
      name: `${prefix}-${index + 1}`,
      avatar_emoji: index % 2 ? '🛡️' : '🎯',
      rating_cs: 74 + ratingOffset + index
    }))
  };
}

function visualEvents(result) {
  return result.lines.map(line => line.visualEvent).filter(Boolean);
}

function routeElapsedAt(samples, atMs) {
  if (!samples?.length) return null;
  if (atMs <= samples[0][0]) return samples[0][1];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    if (atMs > next[0]) continue;
    const duration = Math.max(1, next[0] - previous[0]);
    const progress = Math.max(0, Math.min(1, (atMs - previous[0]) / duration));
    return previous[1] + (next[1] - previous[1]) * progress;
  }
  return samples[samples.length - 1][1];
}

function pointInBombsite(position, siteKey) {
  return dust2Graph.bombsites[siteKey].polygons.some(polygon => {
    const xs = polygon.map(point => point[0]);
    const ys = polygon.map(point => point[1]);
    return position.x >= Math.min(...xs)
      && position.x <= Math.max(...xs)
      && position.y >= Math.min(...ys)
      && position.y <= Math.max(...ys);
  });
}

const stats = collisionStats();
assert.equal(stats.available, true, 'Dust II collision mesh is missing.');
assert.equal(stats.triangleCount, 513783, 'Unexpected Dust II triangle count.');
assert.equal(dust2Graph.landmarks.aSite.id, 1852);
assert.equal(dust2Graph.landmarks.bSite.id, 2071);
assert.equal(dust2Graph.bombsites.A.source, 'Valve func_bomb_target');
assert.equal(dust2Graph.bombsites.B.source, 'Valve func_bomb_target');

const longRoute = routeThrough(ATTACK_ROUTES.long);
const shortRoute = routeThrough(ATTACK_ROUTES.short);
const longAreaIds = new Set(longRoute.map(node => node.id));
const shortAreaIds = new Set(shortRoute.map(node => node.id));
assert(longAreaIds.has(dust2Graph.landmarks.longDoors.id));
assert(longAreaIds.has(dust2Graph.landmarks.longA.id));
assert(!longAreaIds.has(dust2Graph.landmarks.short.id));
assert(shortAreaIds.has(dust2Graph.landmarks.short.id));
assert(!shortAreaIds.has(dust2Graph.landmarks.longDoors.id));
assert(!longRoute.some((node, index) =>
  index > 0 && longRoute[index - 1].id === 1671 && node.id === 1755
), 'Long A rotası tek yönlü düşüş duvarını tersine tırmanıyor.');
assert(longRoute.length < 140, 'Long A rotası gereksiz geri dönüş içeriyor.');
assert(shortRoute.length < 110, 'Short A rotası gereksiz geri dönüş içeriyor.');
assert.equal(
  selectAttackPlan(() => 0.85, 'full'),
  'b',
  'Silahlı CT karşısında düz Mid AWP hattı gereğinden sık seçiliyor.'
);
assert.equal(
  selectAttackPlan(() => 0.85, 'eco'),
  'midB',
  'CT eco olduğunda Mid baskısı ekonomi bilgisini kullanmıyor.'
);
for (let index = 1; index < longRoute.length; index += 1) {
  assert(
    !BOOST_ONLY_ASCENT_KEYS.has(`${longRoute[index - 1].id}:${longRoute[index].id}`),
    'Long A rotası raporda işaretlenen duvar/boost yükseltisini normal yürüyüş olarak kullandı.'
  );
}
const configuredRoutes = [
  ...Object.values(ATTACK_ROUTES).map(keys => routeThrough(keys)),
  ...Object.values(DEFENDER_ROUTES).flat().map(keys => routeThrough(keys))
];
for (const route of configuredRoutes) {
  assert(route.length, 'Yapılandırılmış Dust II rotalarından biri oluşturulamadı.');
  for (let lane = 1; lane <= 5; lane += 1) {
    assert(
      validateMotion(toTimedMotion(route, lane, 6600)),
      `Dust II rotasında duvar kesen hareket bulundu (lane ${lane}).`
    );
  }
  for (let index = 1; index < route.length; index += 1) {
    assert(
      canTraverseNavEdge(route[index - 1], route[index]),
      `Dust II rotası tırmanılamaz dikey kenar içeriyor: ${route[index - 1].id}->${route[index].id}`
    );
  }
}
assert.equal(new Set(CT_SPAWN_AREA_IDS).size, 5, 'CT spawn beş ayrı nav başlangıcı taşımalı.');
assert.equal(new Set(T_SPAWN_AREA_IDS).size, 5, 'T spawn beş ayrı nav başlangıcı taşımalı.');

const deterministicSeed = 'cs-spatial-determinism';
const first = simulateMatch(team('Mavi'), team('Kırmızı', 1), 'cs', true, true, {
  seed: deterministicSeed,
  includeDebugTelemetry: true
});
const second = simulateMatch(team('Mavi'), team('Kırmızı', 1), 'cs', true, true, {
  seed: deterministicSeed,
  includeDebugTelemetry: true
});
assert.deepEqual(first, second, 'The same seed must replay the same match.');

let matches = 0;
let rounds = 0;
let kills = 0;
let motionPlans = 0;
let resolvedRounds = 0;
const plants = { A: 0, B: 0 };
const roundReasons = {};
const postPlantDecisions = { retake: 0, save: 0, ninja: 0 };
let bombDrops = 0;
let bombPickups = 0;
let bombEscapes = 0;
let buyPhases = 0;
let economySummaries = 0;
let explainableBuyPlans = 0;
let purchaseTimelineRecords = 0;
let coordinatedDrops = 0;
const buyTypes = {};
const attackPlans = {};
const combatStats = {
  shots: 0,
  hits: 0,
  damage: 0,
  armorDamage: 0,
  headshotKills: 0,
  weapons: {}
};
const behaviorCounts = {};
let retreatSegments = 0;
let damageEvents = 0;
let partialDamageEvents = 0;
let crossfireEvents = 0;
let blastEvents = 0;
let blastDamage = 0;
let blastDeaths = 0;
let escapeCombatEvents = 0;
let plantUrgencyRecords = 0;
let postPlantSetupAssignments = 0;
let postPlantCrossfirePairs = 0;
let retakePlanAssignments = 0;
let retakeTradeAssignments = 0;
let fakeDefusePlans = 0;
let defuseAttempts = 0;
let realDefuseAttempts = 0;
let fakeDefuseAttempts = 0;
let defuseReactionRecords = 0;
let missedSafePlants = 0;
const utilityEvents = { smoke: 0, flash: 0, he: 0, molotov: 0, incendiary: 0 };
let utilityDecisionEvents = 0;
const utilityDecisionReasons = {};
let utilityCombos = 0;
let intelDrivenUtility = 0;
let preservedUtilityPlayers = 0;
let utilityDamage = 0;
let flashBlinds = 0;
let fireRetreats = 0;
let soundTimelineRecords = 0;
let informationUpdates = 0;
let delayedTeamCalls = 0;
let fakeIntelUpdates = 0;
let fakeInvestigations = 0;
let fakeDrivenUtility = 0;
let silentApproachRecords = 0;
let soundCueEvents = 0;
let fakePlantCues = 0;
let groundEquipmentDrops = 0;
let groundEquipmentPickups = 0;
let groundRecoveredValue = 0;
let groundLostValue = 0;
const soundTypes = {};
const batchSize = Number(process.env.CS_SPATIAL_MATCHES) || 20;
for (let index = 0; index < batchSize; index += 1) {
  const result = simulateMatch(team('Mavi'), team('Kırmızı', 1), 'cs', true, true, {
    seed: `cs-spatial-batch-${index}`,
    includeDebugTelemetry: true
  });
  assert(!result.lines.some(line => line.text?.includes('Maç simülasyonunda bir hata oluştu')));

  let lastRound = 0;
  let lastTick = 0;
  let matchRoundEnds = 0;
  const plantedByRound = new Map();
  const decisionByRound = new Map();
  const roundStartsByRound = new Map();
  const realDefuseRounds = new Set();
  const escapeRounds = new Set();
  const buyPhaseRounds = new Set();
  const economySummaryRounds = new Set();
  const utilityDecisionsByRound = new Map();
  const lastUtilityDecisionByTeam = new Map();
  for (const event of visualEvents(result)) {
    if (event.players) {
      const weaponOwners = event.players
        .filter(player => player.alive && player.weaponEntityId)
        .map(player => player.weaponEntityId);
      assert.equal(
        new Set(weaponOwners).size,
        weaponOwners.length,
        'Aynı dünya silahı iki yaşayan oyuncunun envanterinde görünüyor.'
      );
      for (const player of event.players) {
        assert(Number(player.ammo) >= 0);
        assert(Number(player.reserveAmmo) >= 0);
      }
    }
    if (event.type === 'equipment-drop') {
      groundEquipmentDrops += (event.items || []).length;
      assert((event.items || []).every(item =>
        item.id
        && item.kind === 'ground-equipment'
        && item.status === 'ground'
        && !String(item.id).includes('bomb')
      ));
    }
    if (event.type === 'ground-pickup') {
      groundEquipmentPickups += 1;
      assert(event.item?.id && event.item.status === 'inventory');
      assert(!(event.groundItems || []).some(item => item.id === event.item.id));
      const actor = event.actorState
        || (event.players || []).find(player => player.id === event.actor?.id);
      assert(actor?.alive, 'Yerdeki ekipmanı ölü oyuncu alamaz.');
      if (event.item.itemType === 'weapon') {
        assert.equal(actor.weapon, event.item.weapon);
        assert.equal(actor.ammo, event.item.magazineAmmo);
        assert.equal(actor.reserveAmmo, event.item.reserveAmmo);
        assert.equal(actor.weaponEntityId, event.item.id);
      }
    }
    if (event.type === 'round-start') {
      roundStartsByRound.set(event.round, event);
      rounds += 1;
      attackPlans[event.attackPlan] = (attackPlans[event.attackPlan] || 0) + 1;
      motionPlans += event.motionPlans.length;
      assert.equal(event.motionPlans.length, 10);
      assert.equal(event.tickRate, 20);
      assert.equal(event.behaviorVersion, 1);
      assert(Array.isArray(event.behaviorTimeline));
      assert(event.behaviorTimeline.length >= 10);
      assert.equal(event.soundModelVersion, 1);
      assert(Array.isArray(event.soundTimeline));
      assert(Array.isArray(event.informationTimeline));
      for (const sound of event.soundTimeline) {
        soundTimelineRecords += 1;
        soundTypes[sound.type] = (soundTypes[sound.type] || 0) + 1;
        assert([
          'run', 'walk', 'gunfire', 'reload', 'utility',
          'bomb-drop', 'bomb-pickup', 'plant', 'defuse'
        ].includes(sound.type), `Bilinmeyen ses türü: ${sound.type}`);
        assert(sound.radius > 0);
        assert(sound.tick >= 0);
        for (const listener of sound.heardBy) {
          assert(listener.confidence > 0 && listener.confidence <= 1);
          assert(listener.distance <= sound.radius * 1.13);
        }
      }
      for (const update of event.informationTimeline) {
        informationUpdates += 1;
        assert.equal(update.type, 'team-call');
        assert(update.delayTicks >= 1, 'Takım çağrısı anlık iletilmemeli.');
        assert(update.confidence > 0 && update.confidence < 1);
        delayedTeamCalls += 1;
        if (update.fake) fakeIntelUpdates += 1;
      }
      assert.equal(event.routeTimelineVersion, 1);
      assert.equal(event.routeTimelines.length, 10);
      const bombCarriers = event.players.filter(player => player.hasBomb);
      assert.equal(bombCarriers.length, 1, 'Raund başında tam bir C4 taşıyıcısı olmalı.');
      assert.equal(bombCarriers[0].teamId, event.attackerTeamId);
      assert.equal(event.bombCarrierId, bombCarriers[0].id);
      const ctStarts = event.players
        .filter(player => player.side === 'CT')
        .map(player => player.areaId);
      const tStarts = event.players
        .filter(player => player.side === 'T')
        .map(player => player.areaId);
      assert.equal(new Set(ctStarts).size, 5, 'CT oyuncuları spawn alanında üst üste başladı.');
      assert.equal(new Set(tStarts).size, 5, 'T oyuncuları spawn alanında üst üste başladı.');
      ctStarts.forEach(areaId =>
        assert(CT_SPAWN_AREA_IDS.includes(areaId), `Beklenmeyen CT spawn alanı: ${areaId}`)
      );
      tStarts.forEach(areaId =>
        assert(T_SPAWN_AREA_IDS.includes(areaId), `Beklenmeyen T spawn alanı: ${areaId}`)
      );
      for (const player of event.players) {
        if (player.hasDefuseKit) assert.equal(player.teamId, event.defenderTeamId);
        assert(player.money >= 0 && player.money <= 16000);
        assert(player.equipmentValue >= 0);
      }
      const reservedByOwner = new Map();
      for (const utility of event.utility || []) {
        assert(utility.purpose);
        assert(utility.earliestTick <= utility.latestTick);
        const owner = event.players.find(player => player.id === utility.ownerId);
        assert(owner, 'Utility planının sahibi raund kadrosunda yok.');
        const key = `${owner.id}:${utility.type}`;
        reservedByOwner.set(key, (reservedByOwner.get(key) || 0) + 1);
        assert(
          owner.utility.filter(item => item === utility.type).length >= reservedByOwner.get(key),
          'Planlanan utility raund başında envanterden erken tüketildi.'
        );
      }
      for (const timeline of event.routeTimelines) {
        assert(timeline.samples.length >= 1);
        let previousTime = -1;
        for (const [atMs, routeElapsedMs] of timeline.samples) {
          assert(atMs >= previousTime);
          assert(atMs >= 0 && atMs <= event.roundDurationMs);
          assert(routeElapsedMs >= 0 && routeElapsedMs <= event.roundDurationMs);
          previousTime = atMs;
        }
      }
      const previousByPlayer = new Map();
      for (const record of event.behaviorTimeline) {
        behaviorCounts[record.state] = (behaviorCounts[record.state] || 0) + 1;
        if (record.source === 'plant-urgency') plantUrgencyRecords += 1;
        if (record.source === 'defuse-reaction') defuseReactionRecords += 1;
        if (record.source === 'silent-approach') silentApproachRecords += 1;
        assert(record.atMs >= 0 && record.atMs <= event.roundDurationMs);
        assert(record.routeElapsedMs >= 0 && record.routeElapsedMs <= event.roundDurationMs);
        const previous = previousByPlayer.get(record.id);
        if (previous) {
          assert(record.tick >= previous.tick);
          if (previous.state === 'retreat' && record.routeElapsedMs < previous.routeElapsedMs) {
            retreatSegments += 1;
          }
        }
        if (record.state === 'engage' || record.state === 'retreat') {
          assert([
            'vision',
            'crossfire',
            'return-fire',
            'defuse-reaction',
            'low-health',
            'heavy-damage',
            'utility-he',
            'utility-fire'
          ].includes(record.source), `Geçersiz temas davranışı: ${JSON.stringify(record)}`);
          assert(record.targetId, `Temas davranışının hedefi yok: ${JSON.stringify(record)}`);
        }
        if (record.state === 'investigate') {
          assert(['vision', 'sound', 'team-call'].includes(record.source));
          assert(record.targetId);
          if (record.infoFake) fakeInvestigations += 1;
        }
        previousByPlayer.set(record.id, record);
      }
      lastRound = event.round;
      lastTick = 0;
    }
    if (event.type === 'kill') {
      kills += 1;
      if (escapeRounds.has(event.round)) escapeCombatEvents += 1;
      assert(event.combat, 'Kill olayı combat özeti taşımıyor.');
      assert(event.combat.hpBefore > 0 && event.combat.hpBefore <= 100);
      assert.equal(event.combat.hpAfter, 0);
      assert(event.combat.damage > 0 && event.combat.damage <= event.combat.hpBefore);
      assert(event.combat.shots >= event.combat.hits);
      assert(event.combat.hits >= 1);
      assert(event.combat.accuracy > 0 && event.combat.accuracy <= 1);
      assert.equal(event.headshot, event.combat.fatalHeadshot);
      const deadTarget = event.players.find(player => player.id === event.target.id);
      assert(deadTarget && deadTarget.alive === false && deadTarget.health === 0);
      const firingActor = event.players.find(player => player.id === event.actor.id);
      assert(firingActor && firingActor.weapon === event.weapon);
      assert.equal(firingActor.ammo, event.combat.magazineAfter);
      if (event.bombDropped) {
        bombDrops += 1;
        assert(event.bombPosition);
        assert.equal(deadTarget.hasBomb, false);
      }
      combatStats.shots += event.combat.shots;
      combatStats.hits += event.combat.hits;
      combatStats.damage += event.combat.damage;
      combatStats.armorDamage += event.combat.armorDamage;
      combatStats.headshotKills += event.combat.fatalHeadshot ? 1 : 0;
      combatStats.weapons[event.weapon] = (combatStats.weapons[event.weapon] || 0) + 1;
      assert.equal(event.perception?.los, true);
      assert.equal(event.perception?.collisionMesh, true);
      assert(Number.isFinite(event.perception?.testedTriangles));
      assert(['engage', 'peek', 'hold'].includes(event.perception?.behavior));
      assert.equal(event.round, lastRound);
      assert(event.tick >= lastTick);
      const roundStart = visualEvents(result).find(candidate =>
        candidate.type === 'round-start' && candidate.round === event.round
      );
      assert(event.motionTimeMs >= 0 && event.motionTimeMs <= roundStart.roundDurationMs);
      for (const player of event.players || []) {
        const timeline = roundStart.routeTimelines.find(candidate => candidate.id === player.id);
        const routeElapsed = routeElapsedAt(timeline?.samples, event.motionTimeMs);
        assert(Number.isFinite(routeElapsed), `Missing authoritative route sample for ${player.id} at ${event.motionTimeMs}ms.`);
        assert(
          Math.abs(routeElapsed - player.routeElapsedMs) <= 105,
          `Route sample drift for ${player.id} at ${event.motionTimeMs}ms.`
        );
      }
      lastTick = event.tick;
    }
    if (event.type === 'damage') {
      damageEvents += 1;
      if (escapeRounds.has(event.round)) escapeCombatEvents += 1;
      if (event.crossfire) crossfireEvents += 1;
      assert(event.combat, 'Hasar olayı combat özeti taşımıyor.');
      assert(event.combat.hpBefore > 0 && event.combat.hpBefore <= 100);
      assert(event.combat.hpAfter > 0 && event.combat.hpAfter <= event.combat.hpBefore);
      assert(event.combat.damage >= 0 && event.combat.damage < event.combat.hpBefore);
      assert(event.combat.shots >= event.combat.hits);
      if (event.combat.damage > 0) partialDamageEvents += 1;
      const target = event.players.find(player => player.id === event.target.id);
      assert(target?.alive);
      assert.equal(target.health, event.combat.hpAfter);
      const actor = event.players.find(player => player.id === event.actor.id);
      assert(actor?.alive);
      assert.equal(actor.ammo, event.combat.magazineAfter);
      assert.equal(event.perception?.los, true);
      assert.equal(event.perception?.collisionMesh, true);
      combatStats.shots += event.combat.shots;
      combatStats.hits += event.combat.hits;
      combatStats.damage += event.combat.damage;
      combatStats.armorDamage += event.combat.armorDamage;
      assert(event.tick >= lastTick);
      lastTick = event.tick;
    }
    if (event.type === 'plant') {
      assert(['A', 'B'].includes(event.site));
      assert.equal(event.plantSource, 'Valve func_bomb_target');
      assert.equal(event.bombTime, 40);
      assert.equal(event.bombDurationMs, 12000);
      assert(
        event.plantApproachDistance <= 1.35,
        `${event.site} planter siteye ulaşmadan C4 kurdu: ${JSON.stringify({
          distance: event.plantApproachDistance,
          actor: event.actor,
          actorState: event.players.find(player => player.id === event.actor?.id),
          rerouted: event.planterRerouted,
          routeElapsedMs: event.planterRouteElapsedMs,
          motionTimeMs: event.motionTimeMs
        })}`
      );
      assert(pointInBombsite(event.position, event.site), `${event.site} plant bombsite dışında.`);
      assert(dust2Graph.bombsites[event.site].plantNodeIds.some(nodeId => {
        const node = dust2Graph.nodes.find(candidate => candidate.id === nodeId);
        return node?.x === event.position.x && node?.y === event.position.y;
      }), `${event.site} plant yürünebilir güvenli düğümde değil.`);
      plants[event.site] += 1;
      plantedByRound.set(event.round, event.position);
      assert.equal(event.soundIntel?.type, 'plant');
      assert.equal(event.soundIntel?.fake, false);
    }
    if (event.type === 'sound-cue') {
      soundCueEvents += 1;
      assert(event.sound?.type);
      assert(event.directHearers >= 0);
      assert.equal(event.heardBy.length, event.directHearers);
      if (event.fake && event.sound.type === 'plant') fakePlantCues += 1;
    }
    if (event.type === 'bomb-pickup') {
      bombPickups += 1;
      assert(event.pickupDistance <= 10.5);
      const carrier = event.players.find(player => player.id === event.actor.id);
      assert(carrier?.alive && carrier.hasBomb);
      assert.equal(carrier.teamId, event.attackerTeamId);
      for (const player of event.players) {
        assert(player.money >= 0 && player.money <= 16000);
        assert(player.equipmentValue >= 0);
        if (player.hasDefuseKit) assert.equal(player.side, 'CT');
      }
    }
    if (event.type === 'buy-phase') {
      buyPhases += 1;
      assert(!buyPhaseRounds.has(event.round), 'Aynı raundda birden fazla satın alma fazı oluştu.');
      buyPhaseRounds.add(event.round);
      assert(event.economy?.teams?.[1]);
      assert(event.economy?.teams?.[2]);
      assert.equal(
        event.economy.purchaseTimeline.length,
        event.economy.purchases.length,
        'Her satın alma kayıtlı bir mağaza zaman çizelgesi olayı taşımalı.'
      );
      purchaseTimelineRecords += event.economy.purchaseTimeline.length;
      coordinatedDrops += event.economy.drops.length;
      event.economy.drops.forEach(drop => {
        assert(drop.fromPlayerId && drop.toPlayerId && drop.fromPlayerId !== drop.toPlayerId);
        assert.equal(drop.reasonCode, 'AWP_TEAM_DROP');
        assert.equal(drop.item, 'AWP');
      });
      for (const teamId of [1, 2]) {
        const teamEconomy = event.economy.teams[teamId];
        assert(['pistol', 'eco', 'half', 'force', 'full', 'hero'].includes(teamEconomy.buyType));
        buyTypes[teamEconomy.buyType] = (buyTypes[teamEconomy.buyType] || 0) + 1;
        assert(teamEconomy.reasonCodes.length > 0);
        assert(['pistol', 'eco', 'half', 'force', 'full', 'hero'].includes(
          teamEconomy.expectedOpponentBuy
        ));
        explainableBuyPlans += 1;
        assert(teamEconomy.teamMoney >= 0 && teamEconomy.teamMoney <= 80000);
        assert(teamEconomy.teamEquipmentValue >= 0);
        assert.equal(teamEconomy.players.length, 5);
        teamEconomy.players.forEach(player => {
          assert(player.money >= 0 && player.money <= 16000);
          if (player.hasDefuseKit) assert.equal(player.side, 'CT');
          assert(['awp', 'entry', 'support', 'lurk', 'anchor'].includes(
            player.rolePreference
          ));
          assert(player.utility.length <= 4);
          assert(player.utility.filter(item => item === 'flash').length <= 2);
          for (const utilityItem of ['smoke', 'he', 'molotov', 'incendiary']) {
            assert(player.utility.filter(item => item === utilityItem).length <= 1);
          }
        });
      }
    }
    if (event.type === 'economy-summary') {
      economySummaries += 1;
      assert(!economySummaryRounds.has(event.round), 'Aynı raundda birden fazla ekonomi özeti oluştu.');
      economySummaryRounds.add(event.round);
      assert(event.summary?.teams?.[1]);
      assert(event.summary?.teams?.[2]);
      assert(event.summary?.groundInventory?.teams?.[1]);
      assert(event.summary?.groundInventory?.teams?.[2]);
      groundRecoveredValue += Number(event.summary.groundInventory.teams[1].recoveredValue || 0)
        + Number(event.summary.groundInventory.teams[2].recoveredValue || 0);
      groundLostValue += Number(event.summary.groundInventory.teams[1].lostValue || 0)
        + Number(event.summary.groundInventory.teams[2].lostValue || 0);
      for (const teamId of [1, 2]) {
        const teamEconomy = event.summary.teams[teamId];
        assert(teamEconomy.teamMoney >= 0 && teamEconomy.teamMoney <= 80000);
        teamEconomy.players.forEach(player => {
          assert(player.money >= 0 && player.money <= 16000);
          if (player.hasDefuseKit) assert.equal(player.side, 'CT');
          if (player.savedFromPreviousRound && player.utility.length > 0) {
            preservedUtilityPlayers += 1;
          }
        });
      }
    }
    if (event.type === 'utility-decision') {
      utilityDecisionEvents += 1;
      assert.equal(event.action, 'deploy');
      assert(event.actor?.id);
      assert(event.utility?.id && event.utility?.type);
      assert(event.decision?.reasonCode);
      assert(event.decision.reason);
      assert(event.decision.confidence >= 0 && event.decision.confidence <= 1);
      assert(event.decision.metrics);
      assert(['regulation', 'postplant'].includes(event.decision.metrics.phase));
      const key = `${event.round}:${event.utility.id}`;
      utilityDecisionsByRound.set(key, event);
      utilityDecisionReasons[event.decision.reasonCode] =
        (utilityDecisionReasons[event.decision.reasonCode] || 0) + 1;
      if (event.decision.combo === 'smoke-flash') utilityCombos += 1;
      if (
        event.decision.metrics.knownEnemiesNearTarget > 0
        || event.decision.metrics.visibleEnemies > 0
        || event.decision.metrics.soundOrCallIntel > 0
      ) {
        intelDrivenUtility += 1;
      }
      if (event.decision.metrics.fakeIntel > 0) fakeDrivenUtility += 1;
      const teamKey = `${event.round}:${event.teamId}`;
      const decisionTick = Number.isFinite(event.sourceTick) ? event.sourceTick : event.tick;
      const previousTick = lastUtilityDecisionByTeam.get(teamKey);
      if (Number.isFinite(previousTick)) {
        assert(decisionTick - previousTick >= 6, 'Takım utilityleri aynı anda üst üste kullanıldı.');
      }
      lastUtilityDecisionByTeam.set(teamKey, decisionTick);
    }
    if (event.type === 'utility') {
      assert(['smoke', 'flash', 'he', 'molotov', 'incendiary'].includes(event.utility?.type));
      utilityEvents[event.utility.type] += 1;
      assert(event.actor?.id);
      assert(Number.isFinite(event.position?.x) && Number.isFinite(event.position?.y));
      assert(event.motionTimeMs >= 0);
      assert(Array.isArray(event.affected));
      assert(
        utilityDecisionsByRound.has(`${event.round}:${event.utility.id}`),
        'Utility karar olayı üretilmeden patladı.'
      );
      for (const result of event.affected) {
        assert(result.player?.id);
        if (event.utility.type === 'flash') {
          assert(result.blindMs > 0);
          flashBlinds += 1;
        } else {
          assert(result.damage >= 0);
          utilityDamage += result.damage;
          if (['molotov', 'incendiary'].includes(event.utility.type)) fireRetreats += 1;
          assert(result.healthAfter >= 0 && result.healthAfter <= result.healthBefore);
        }
      }
    }
    if (event.type === 'tactical-decision') {
      assert(plantedByRound.has(event.round), 'Post-plant kararı planttan önce üretildi.');
      assert(['retake', 'save', 'ninja'].includes(event.decision));
      assert(event.metrics);
      assert(event.metrics.bombWindowMs > 0);
      assert(Array.isArray(event.attackerSetup));
      assert(Array.isArray(event.retakePlan));
      assert.equal(
        event.attackerSetup.length,
        event.metrics.attackersAlive,
        'Yaşayan her T bir post-plant görevi almalı.'
      );
      assert.equal(
        new Set(event.attackerSetup.map(assignment => assignment.id)).size,
        event.attackerSetup.length,
        'Aynı T oyuncusuna iki post-plant görevi verildi.'
      );
      event.attackerSetup.forEach(assignment => {
        assert(VALID_POSTPLANT_ROLES.has(assignment.role));
        assert(assignment.positionId);
        assert(Number.isInteger(assignment.anchorAreaId));
        assert(Number.isInteger(assignment.watchAreaId));
        assert(assignment.anchor && assignment.watch);
        assert(assignment.routeDistance >= 0);
      });
      const setupPairs = new Set(
        event.attackerSetup.map(assignment => assignment.pairId).filter(Boolean)
      );
      postPlantSetupAssignments += event.attackerSetup.length;
      postPlantCrossfirePairs += setupPairs.size;
      if (event.decision === 'retake') {
        assert.equal(
          event.retakePlan.length,
          event.metrics.defendersAlive,
          'Yaşayan her CT bir retake görevi almalı.'
        );
        assert.equal(
          new Set(event.retakePlan.map(assignment => assignment.id)).size,
          event.retakePlan.length,
          'Aynı CT oyuncusuna iki retake görevi verildi.'
        );
        event.retakePlan.forEach(assignment => {
          assert(['defuser', 'fake-defuser', 'entry', 'trade', 'cover', 'flank']
            .includes(assignment.role));
          assert(assignment.ingress && assignment.target);
        });
        if (event.metrics.defendersAlive >= 4) {
          assert(event.retakePlan.some(assignment => assignment.role === 'entry'));
          assert(event.retakePlan.some(assignment => assignment.role === 'trade'));
        }
        retakePlanAssignments += event.retakePlan.length;
        retakeTradeAssignments += event.retakePlan
          .filter(assignment => assignment.role === 'trade' || assignment.followsId)
          .length;
        if (event.metrics.fakeDefusePlanned) {
          fakeDefusePlans += 1;
          assert(event.retakePlan.some(assignment => assignment.role === 'fake-defuser'));
          assert(event.retakePlan.some(assignment => assignment.role !== 'fake-defuser'));
        }
      } else {
        assert.equal(event.retakePlan.length, 0);
      }
      postPlantDecisions[event.decision] += 1;
      decisionByRound.set(event.round, event.decision);
    }
    if (event.type === 'defuse-attempt') {
      defuseAttempts += 1;
      assert(plantedByRound.has(event.round), 'Defuse denemesi planttan önce başladı.');
      assert.equal(event.siteThreats, 0, 'CT aktif site tehdidi varken defuse başlattı.');
      assert(event.remainingBombSeconds > 0 && event.remainingBombSeconds <= 40);
      assert.deepEqual(event.position, plantedByRound.get(event.round));
      const actor = event.players.find(player => player.id === event.actor.id);
      assert(actor?.alive && actor.side === 'CT');
      assert(Math.hypot(actor.x - event.position.x, actor.y - event.position.y) <= 2.2);
      if (event.fake) {
        fakeDefuseAttempts += 1;
        assert.equal(event.defuseSeconds, 0);
      } else {
        realDefuseAttempts += 1;
        realDefuseRounds.add(event.round);
        assert.equal(event.defuseSeconds, event.hasDefuseKit ? 5 : 10);
        assert(event.remainingBombSeconds >= event.defuseSeconds);
      }
      const aliveAttackers = event.players.filter(player =>
        player.alive && player.teamId === event.attackerTeamId
      );
      const directDefuseHearers = event.soundIntel?.heardBy?.length || 0;
      assert.equal(
        event.reactingAttackers.length,
        directDefuseHearers > 0 ? aliveAttackers.length : 0,
        'Defuse sesini bir T duyduğunda bilgi yaşayan tüm T oyuncularına paylaşılmalı.'
      );
      assert.equal(new Set(event.reactingAttackers).size, event.reactingAttackers.length);
    }
    if (event.type === 'bomb-escape') {
      bombEscapes += 1;
      assert(plantedByRound.has(event.round));
      assert(event.actors.length > 0);
      assert.equal(event.bombTimeLeft, 7);
      assert(event.bombDeadlineMotionMs >= event.motionTimeMs);
      assert(event.bombDeadlineMotionMs - event.motionTimeMs <= 2200);
      event.actors.forEach(actor => {
        assert(actor.currentDamage >= 0);
        assert(actor.predictedDamage >= 0);
        assert(actor.health > 0);
      });
      escapeRounds.add(event.round);
    }
    if (event.type === 'explode' || event.type === 'defuse') {
      const planted = plantedByRound.get(event.round);
      assert(planted, `${event.type} öncesinde plant olayı bulunamadı.`);
      assert.deepEqual(event.position, planted, `${event.type} bombanın plant konumunu korumadı.`);
      assert(pointInBombsite(event.position, event.site), `${event.type} bombsite dışında.`);
      if (event.type === 'explode') {
        blastEvents += 1;
        assert.equal(event.propagationModel, 'cs2-2026-nav-shockwave-v1');
        assert(Array.isArray(event.blast) && event.blast.length > 0);
        for (const result of event.blast) {
          assert.equal(result.propagationModel, 'cs2-2026-nav-shockwave-v1');
          assert(result.distanceWorld >= 0);
          assert(result.arrivalMs >= 0);
          assert(result.damage >= 0);
          assert(result.healthAfter >= 0 && result.healthAfter <= result.healthBefore);
          blastDamage += result.damage;
          blastDeaths += result.killed ? 1 : 0;
          const state = event.players.find(player => player.id === result.player.id);
          assert(state);
          assert.equal(state.health, result.healthAfter);
          assert.equal(state.alive, !result.killed);
        }
      }
    }
    if (event.type === 'round-end') {
      matchRoundEnds += 1;
      resolvedRounds += 1;
      const resolution = event.resolution;
      assert(resolution, 'Beta CS round-end world-state çözümü taşımıyor.');
      assert.equal(resolution.source, 'world-state');
      assert.equal(resolution.winnerTeamId, event.winnerTeamId);
      assert.equal(resolution.reason, event.reason);
      assert(['elimination', 'time-expired', 'defused', 'bomb-exploded'].includes(event.reason));
      roundReasons[event.reason] = (roundReasons[event.reason] || 0) + 1;

      const losingAlive = event.winnerTeamId === 1
        ? resolution.team2Alive
        : resolution.team1Alive;
      if (event.reason === 'elimination') assert.equal(losingAlive, 0);
      if (event.reason === 'time-expired') {
        assert.equal(resolution.bombPlanted, false);
        assert.equal(event.winnerTeamId, event.defenderTeamId);
        const roundStart = roundStartsByRound.get(event.round);
        const siteKey = ['b', 'midB'].includes(roundStart.attackPlan) ? 'B' : 'A';
        const plantNodes = dust2Graph.bombsites[siteKey].plantNodeIds
          .map(nodeId => dust2Graph.nodes.find(node => node.id === nodeId))
          .filter(Boolean);
        const carrier = event.players.find(player =>
          player.alive
          && player.teamId === roundStart.attackerTeamId
          && player.hasBomb
        );
        if (carrier) {
          const nearestPlantDistance = Math.min(...plantNodes.map(node =>
            Math.hypot(carrier.x - node.x, carrier.y - node.y)
          ));
          const visibleCloseThreats = event.players.filter(player => {
            if (!player.alive || player.teamId !== roundStart.defenderTeamId) return false;
            const plantDistance = Math.min(...plantNodes.map(node =>
              Math.hypot(player.x - node.x, player.y - node.y)
            ));
            return plantDistance <= 10.5 && traceLineOfSight(
              {
                x: player.x,
                y: player.y,
                z: player.z,
                areaId: player.areaId
              },
              {
                x: carrier.x,
                y: carrier.y,
                z: carrier.z,
                areaId: carrier.areaId
              },
              { maxDistance: 34 }
            ).visible;
          });
          if (nearestPlantDistance <= 2.2 && visibleCloseThreats.length === 0) {
            missedSafePlants += 1;
          }
        }
      }
      if (event.reason === 'defused') {
        assert.equal(resolution.bombPlanted, true);
        assert.equal(event.winnerTeamId, event.defenderTeamId);
        assert(resolution.objectiveControl);
        assert(resolution.objectiveControl.nearestDefenderDistance <= 2.2);
        assert.equal(resolution.objectiveControl.contested, false);
        assert.equal(resolution.objectiveControl.startedUncontested, true);
        assert([5, 10].includes(resolution.objectiveControl.defuseSeconds));
        assert(realDefuseRounds.has(event.round), 'Defuse sonucu fiziksel deneme olmadan üretildi.');
      }
      if (event.reason === 'bomb-exploded') {
        assert.equal(resolution.bombPlanted, true);
        assert.equal(event.winnerTeamId, event.attackerTeamId);
        assert(escapeRounds.has(event.round), 'Patlama öncesi kaçış olayı eksik.');
      }
      if (resolution.bombPlanted) {
        assert(resolution.postPlantDecision);
        assert.equal(
          resolution.postPlantDecision.decision,
          decisionByRound.get(event.round)
        );
      }
      if (decisionByRound.get(event.round) === 'save') {
        assert(
          ['bomb-exploded', 'elimination'].includes(event.reason),
          'Save kararı yalnızca bomba patlaması veya CT ekibinin yolda elenmesiyle bitebilir.'
        );
        assert.equal(event.winnerTeamId, event.attackerTeamId);
      }
    }
  }
  assert.equal(matchRoundEnds, result.team1Score + result.team2Score);
  assert.equal(buyPhaseRounds.size, matchRoundEnds);
  assert.equal(economySummaryRounds.size, matchRoundEnds);
  assert.equal(result.winner, result.team1Score > result.team2Score ? 1 : 2);
  matches += 1;
}

const normal = simulateMatch(team('Mavi'), team('Kırmızı'), 'cs', false, false, {
  seed: 'cs-spatial-normal-isolation'
});
assert.equal(visualEvents(normal).length, 0, 'Non-beta CS must not emit visual events.');
for (const requiredState of ['advance', 'walk', 'hold', 'peek', 'engage']) {
  assert((behaviorCounts[requiredState] || 0) > 0, `Missing behavior state: ${requiredState}`);
}
assert(plants.A > 0, 'A bombsite plant senaryosu oluşmadı.');
assert(plants.B > 0, 'B bombsite plant senaryosu oluşmadı.');
const totalPostPlantDecisions = Object.values(postPlantDecisions)
  .reduce((sum, count) => sum + count, 0);
assert.equal(
  totalPostPlantDecisions,
  plants.A + plants.B,
  'Her plant sonrası tam olarak bir post-plant kararı üretilmeli'
);
assert(postPlantDecisions.retake > 0, 'Toplu simülasyonda en az bir retake kararı oluşmalı');
if (batchSize >= 10) {
  assert(postPlantDecisions.save > 0, 'Geniş toplu simülasyonda en az bir save kararı oluşmalı');
}
const plantRate = (plants.A + plants.B) / resolvedRounds;
assert(plantRate >= 0.25 && plantRate <= 0.9, `Plant oranı hedef dışında: ${plantRate}`);
assert.equal(buyPhases, resolvedRounds, 'Her raundda bir satın alma fazı oluşmalı');
assert.equal(economySummaries, resolvedRounds, 'Her raundda bir ekonomi özeti oluşmalı');
assert.equal(explainableBuyPlans, resolvedRounds * 2);
assert(purchaseTimelineRecords > 0, 'Mağaza satın alma zaman çizelgesi boş kaldı.');
assert((buyTypes.pistol || 0) > 0, 'Tabanca satın alma fazı oluşmadı');
assert(
  (buyTypes.full || 0) + (buyTypes.force || 0) + (buyTypes.half || 0) > 0,
  'Silahlı satın alma kararları oluşmadı'
);
assert((attackPlans.long || 0) > 0, 'Long A hücum planı hiç seçilmedi.');
assert((attackPlans.short || 0) > 0, 'Short A hücum planı hiç seçilmedi.');
assert(damageEvents > 0, 'Ölümle bitmeyen çatışma olayı oluşmadı.');
assert(partialDamageEvents > 0, 'Kalıcı kısmi HP hasarı oluşmadı.');
if (batchSize >= 3) {
  assert(crossfireEvents > 0, 'Çoklu peek/çapraz ateş olayı oluşmadı.');
  assert(plantUrgencyRecords > 0, 'Son süre C4/plant önceliği hiç devreye girmedi.');
  assert(escapeCombatEvents > 0, 'Bomba kaçışı sırasında hiçbir görüş teması çatışmaya dönüşmedi.');
  assert(postPlantSetupAssignments > 0, 'T post-plant görevleri hiç üretilmedi.');
  assert(postPlantCrossfirePairs > 0, 'T çapraz post-plant çifti hiç kurulmadı.');
  assert(retakePlanAssignments > 0, 'Koordineli CT retake görevi hiç üretilmedi.');
  assert(retakeTradeAssignments > 0, 'CT entry-trade eşleşmesi hiç üretilmedi.');
  assert(groundEquipmentDrops > 0, 'Ölümler yerde ekipman üretmedi.');
  assert(groundEquipmentPickups > 0, 'Güvenli yerde silah/ekipman pickup kararı oluşmadı.');
  assert(groundRecoveredValue > 0, 'Ekonomi özeti korunan yer ekipmanını açıklamadı.');
  assert(groundLostValue > 0, 'Ekonomi özeti kaybolan yer ekipmanını açıklamadı.');
}
if (batchSize >= 10) {
  assert(fakeDefusePlans > 0, 'Geniş simülasyonda fake defuse planı hiç üretilmedi.');
  assert(utilityEvents.smoke > 0, 'Sis bombası hiç kullanılmadı.');
  assert(utilityEvents.flash > 0, 'Flash hiç kullanılmadı.');
  assert(utilityEvents.he > 0, 'HE bombası hiç kullanılmadı.');
  assert(
    utilityEvents.molotov + utilityEvents.incendiary > 0,
    'Yanıcı utility hiç kullanılmadı.'
  );
  assert(utilityDecisionEvents > 0, 'Bağlamsal utility kararı hiç üretilmedi.');
  assert(intelDrivenUtility > 0, 'Rakip bilgisine dayalı utility kullanılmadı.');
  assert(
    (utilityDecisionReasons['execute-cover'] || 0)
      + (utilityDecisionReasons['entry-support'] || 0)
      + (utilityDecisionReasons['reported-execute-lineup'] || 0) > 0,
    'Takım execute koordinasyonu utility kararına yansımadı.'
  );
  assert(preservedUtilityPlayers > 0, 'Kullanılmayan utility hayatta kalan oyuncuyla korunmadı.');
}
assert.equal(blastEvents, roundReasons['bomb-exploded'] || 0);
assert.equal(missedSafePlants, 0, 'Güvenli plant düğümündeki C4 taşıyıcısı süreyi bitirdi.');
assert(realDefuseAttempts > 0, 'Fiziksel defuse denemesi hiç oluşmadı.');
assert(defuseReactionRecords > 0, 'T oyuncuları defuse bilgisine hiç reaksiyon vermedi.');
assert(soundTimelineRecords > 0, 'Ses zaman çizelgesi boş kaldı.');
assert(delayedTeamCalls > 0, 'Gecikmeli takım çağrısı oluşmadı.');
assert(silentApproachRecords > 0, 'Sessiz yaklaşım kararı oluşmadı.');
assert((soundTypes.run || 0) > 0, 'Koşu sesi oluşmadı.');
assert((soundTypes.walk || 0) > 0, 'Yürüme sesi oluşmadı.');
assert((soundTypes.gunfire || 0) > 0, 'Silah sesi oluşmadı.');
assert((soundTypes.plant || 0) > 0, 'Plant sesi oluşmadı.');
assert((soundTypes.defuse || 0) > 0, 'Defuse sesi oluşmadı.');
if (batchSize >= 10) {
  assert(fakePlantCues > 0, 'Geniş simülasyonda fake plant oluşmadı.');
  assert(fakeIntelUpdates > 0, 'Fake ses bilgisi takıma hiç aktarılmadı.');
  assert(fakeInvestigations > 0, 'Fake ses yanlış araştırma/rotate üretmedi.');
  assert(soundCueEvents > 0, 'Canlı ses bilgi olayı oluşmadı.');
}

console.log(JSON.stringify({
  matches,
  rounds,
  resolvedRounds,
  motionPlans,
  kills,
  plants,
  plantRate: Number(plantRate.toFixed(3)),
  postPlantDecisions,
  bombDrops,
  bombPickups,
  bombEscapes,
  buyPhases,
  economySummaries,
  explainableBuyPlans,
  purchaseTimelineRecords,
  coordinatedDrops,
  buyTypes,
  attackPlans,
  roundReasons,
  combatStats,
  damageEvents,
  partialDamageEvents,
  crossfireEvents,
  blastEvents,
  blastDamage,
  blastDeaths,
  escapeCombatEvents,
  plantUrgencyRecords,
  postPlantSetupAssignments,
  postPlantCrossfirePairs,
  retakePlanAssignments,
  retakeTradeAssignments,
  fakeDefusePlans,
  defuseAttempts,
  realDefuseAttempts,
  fakeDefuseAttempts,
  defuseReactionRecords,
  missedSafePlants,
  utilityEvents,
  utilityDecisionEvents,
  utilityDecisionReasons,
  utilityCombos,
  intelDrivenUtility,
  preservedUtilityPlayers,
  utilityDamage,
  flashBlinds,
  fireRetreats,
  soundTimelineRecords,
  informationUpdates,
  delayedTeamCalls,
  fakeIntelUpdates,
  fakeInvestigations,
  fakeDrivenUtility,
  silentApproachRecords,
  soundCueEvents,
  fakePlantCues,
  groundEquipmentDrops,
  groundEquipmentPickups,
  groundRecoveredValue,
  groundLostValue,
  soundTypes,
  behaviorCounts,
  retreatSegments,
  deterministic: true,
  collision: stats,
  normalVisualEvents: 0
}));
