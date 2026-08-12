const assert = require('node:assert/strict');
const { createDust2RoundDirector, T_SPAWN_AREA_IDS } = require('../server/simulation/shooter-ai');
const { createSeededRng } = require('../server/simulation/seeded-rng');
const { findPath } = require('../server/simulation/dust2-navigation');

function team(prefix) {
  return Array.from({ length: 5 }, (_, index) => ({
    name: `${prefix}-${index + 1}`,
    avatar_emoji: '🎯',
    rating_cs: 78 + index
  }));
}

const exactAreaRoute = findPath(
  { x: 0, y: 0, z: 0, areaId: T_SPAWN_AREA_IDS[0] },
  'upperTunnels'
);
assert.equal(
  exactAreaRoute[0]?.id,
  T_SPAWN_AREA_IDS[0],
  'Rota bulucu oyuncunun yetkili areaId bilgisini yok saydı.'
);

const stats = {
  rounds: 0,
  plants: 0,
  timeExpired: 0,
  livingCarrierTimeouts: 0,
  carrierObjectiveMismatches: 0,
  plans: { long: 0, short: 0, b: 0, midB: 0 },
  plantsByPlan: { long: 0, short: 0, b: 0, midB: 0 }
};

for (let index = 0; index < 60; index += 1) {
  const director = createDust2RoundDirector({
    team1: team('Mavi'),
    team2: team('Kırmızı'),
    round: (index % 24) + 1,
    team1Attacker: index % 2 === 0,
    isPistol: index % 12 === 0,
    getRating: character => character.rating_cs,
    rng: createSeededRng(`plant-objective-${index}`),
    includeDebugTelemetry: true
  });
  const setObjectivePriority = director.world.setObjectivePriority.bind(director.world);
  director.world.setObjectivePriority = (player, target, source) => {
    if (player?.hasBomb && director.world.roundPhase.phase === 'regulation') {
      const route = director.motionPlans.get(player.id) || [];
      const routeEndAreaId = Number(route[route.length - 1]?.areaId);
      if (routeEndAreaId !== Number(target?.id)) stats.carrierObjectiveMismatches += 1;
    }
    return setObjectivePriority(player, target, source);
  };

  const result = director.simulateRound();
  const planted = result.events.some(event => event.kind === 'plant');
  stats.rounds += 1;
  stats.plants += planted ? 1 : 0;
  stats.plans[director.plan] += 1;
  stats.plantsByPlan[director.plan] += planted ? 1 : 0;
  if (result.reason === 'time-expired') {
    stats.timeExpired += 1;
    const carrier = director.bombCarrier;
    const contestedRoute = carrier?.alive && director.alivePlayers(director.defenderTeamId)
      .some(defender => Math.hypot(
        defender.position.x - carrier.position.x,
        defender.position.y - carrier.position.y
      ) <= 12);
    if (carrier?.alive && carrier.hasBomb && !contestedRoute) {
      stats.livingCarrierTimeouts += 1;
    }
  }
}

assert.equal(stats.carrierObjectiveMismatches, 0, 'C4 taşıyıcısına hedefe gitmeyen PLANT rotası atandı.');
assert.equal(stats.livingCarrierTimeouts, 0, 'Yaşayan C4 taşıyıcısı site rotasındayken süreyi tüketti.');
assert(stats.plants >= 45, `Plant üretimi beklenenden düşük: ${stats.plants}/${stats.rounds}`);
for (const plan of Object.keys(stats.plans)) {
  assert(stats.plans[plan] > 0, `${plan} planı test örnekleminde oluşmadı.`);
  assert(stats.plantsByPlan[plan] > 0, `${plan} planında hiç plant oluşmadı.`);
}

console.log(JSON.stringify(stats));
