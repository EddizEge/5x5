const assert = require('assert');
const {
  evaluatePlantOpportunity,
  choosePostPlantDecision
} = require('../server/simulation/cs-round-decisions');

const player = (id, x, y, extra = {}) => ({
  id,
  alive: true,
  position: { x, y },
  health: 100,
  hasBomb: false,
  hasDefuseKit: false,
  ...extra
});

const site = { x: 50, y: 50 };
const planter = player('t1', 50, 50, { hasBomb: true });
const support = player('t2', 54, 50);
const distantDefender = player('ct1', 75, 75);

assert.equal(evaluatePlantOpportunity({
  planter,
  attackers: [planter, support],
  defenders: [distantDefender],
  plantPosition: site,
  roundProgress: 0.68,
  hasLineOfSight: () => false
}).allowed, true);

assert.equal(evaluatePlantOpportunity({
  planter: { ...planter, hasBomb: false },
  attackers: [planter, support],
  defenders: [distantDefender],
  plantPosition: site,
  roundProgress: 0.68,
  hasLineOfSight: () => false
}).reason, 'bomb-carrier-unavailable');

assert.equal(evaluatePlantOpportunity({
  planter,
  attackers: [planter, support],
  defenders: [player('ct-close', 54, 50)],
  plantPosition: site,
  roundProgress: 0.68,
  hasLineOfSight: () => true
}).reason, 'site-contested');

assert.equal(evaluatePlantOpportunity({
  planter,
  attackers: [planter, support],
  defenders: [distantDefender],
  plantPosition: site,
  roundProgress: 0.2,
  hasLineOfSight: () => false
}).reason, 'too-early');

assert.equal(evaluatePlantOpportunity({
  planter,
  attackers: [planter, player('t-far-1', 10, 10), player('t-far-2', 12, 10)],
  defenders: [distantDefender],
  plantPosition: site,
  roundProgress: 0.78,
  timeCritical: true,
  hasLineOfSight: () => false
}).allowed, true);

const longRouteSave = choosePostPlantDecision({
  attackers: [player('t1', 50, 50), player('t2', 52, 50)],
  defenders: [player('ct1', 5, 5)],
  plantPosition: site,
  bombWindowMs: 12000,
  pathDistance: () => 150,
  rng: () => 0.5
});
assert.equal(longRouteSave.decision, 'save');
assert.equal(longRouteSave.reason, 'insufficient-time');

const noSaveRoundRetake = choosePostPlantDecision({
  attackers: [player('t1', 50, 50), player('t2', 52, 50), player('t3', 54, 50)],
  defenders: [player('ct1', 5, 5, { health: 18 })],
  plantPosition: site,
  bombWindowMs: 12000,
  pathDistance: () => 150,
  mustContest: true,
  rng: () => 0.5
});
assert.equal(noSaveRoundRetake.decision, 'retake');
assert.equal(noSaveRoundRetake.reason, 'no-save-round');
assert.equal(noSaveRoundRetake.metrics.mustContest, true);

const ninja = choosePostPlantDecision({
  attackers: [
    player('t1', 66, 66),
    player('t2', 68, 68),
    player('t3', 70, 70)
  ],
  defenders: [player('ct1', 48, 50, { hasDefuseKit: true })],
  plantPosition: site,
  bombWindowMs: 12000,
  pathDistance: () => 4,
  smokeCover: true,
  rng: () => 0
});
assert.equal(ninja.decision, 'ninja');
assert.equal(ninja.metrics.hasDefuseKit, true);
assert.equal(ninja.metrics.defuseSeconds, 5);
assert.equal(ninja.metrics.defuseMs, 1500);

const retake = choosePostPlantDecision({
  attackers: [player('t1', 52, 50), player('t2', 55, 50)],
  defenders: [
    player('ct1', 45, 50, { hasDefuseKit: true }),
    player('ct2', 43, 50),
    player('ct3', 42, 50)
  ],
  plantPosition: site,
  bombWindowMs: 12000,
  pathDistance: () => 8,
  smokeCover: false,
  rng: () => 0.99
});
assert.equal(retake.decision, 'retake');
assert.equal(retake.metrics.reachable, true);
assert.equal(retake.metrics.defuseSeconds, 5);
assert.equal(retake.metrics.defuseMs, 1500);

const noKitRetake = choosePostPlantDecision({
  attackers: [player('t1', 52, 50)],
  defenders: [player('ct1', 46, 50)],
  plantPosition: site,
  bombWindowMs: 12000,
  pathDistance: () => 6,
  smokeCover: false,
  rng: () => 0.99
});
assert.equal(noKitRetake.metrics.defuseSeconds, 10);
assert.equal(noKitRetake.metrics.defuseMs, 3000);

console.log(JSON.stringify({
  plant: ['site-secured', 'site-contested', 'too-early', 'bomb-carrier-unavailable'],
  postPlant: {
    save: longRouteSave.reason,
    noSaveRound: noSaveRoundRetake.reason,
    ninja: ninja.reason,
    retake: retake.reason
  },
  deterministic: true
}));
