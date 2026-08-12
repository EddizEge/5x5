const assert = require('node:assert/strict');
const {
  evaluateUtilityDecision
} = require('../server/simulation/cs-utility-decisions');

const owner = { id: 'support', teamId: 1, alive: true };
const baseUtility = {
  id: 'utility-1',
  type: 'flash',
  purpose: 'entry-support',
  earliestTick: 20,
  latestTick: 160
};
const context = overrides => ({
  phase: 'regulation',
  plantPosition: null,
  postPlantDecision: null,
  attackerTeamId: 1,
  defenderTeamId: 2,
  ownerDistance: 12,
  alliesNearTarget: 2,
  alliesApproaching: 2,
  knownEnemiesNearTarget: 0,
  visibleEnemies: 0,
  soundOrCallIntel: 0,
  bestIntelConfidence: 0,
  bestIntelTarget: null,
  friendlyFlashRisk: 1,
  teamUtilityRemaining: 5,
  lastTeamUtility: null,
  ...overrides
});
const decide = (utility, overrides = {}, ownerOverride = {}) =>
  evaluateUtilityDecision({
    utility: { ...baseUtility, ...utility },
    owner: { ...owner, ...ownerOverride },
    tick: overrides.tick ?? 80,
    context: context(overrides)
  });

const entryFlash = decide({ type: 'flash' });
assert.equal(entryFlash.action, 'deploy');
assert.equal(entryFlash.reasonCode, 'entry-support');

const friendlyRisk = decide(
  { type: 'flash' },
  { alliesApproaching: 0, knownEnemiesNearTarget: 0, friendlyFlashRisk: 4 }
);
assert.equal(friendlyRisk.action, 'hold');
assert.equal(friendlyRisk.reasonCode, 'friendly-flash-risk');

const smokeFlash = decide(
  { type: 'flash' },
  {
    knownEnemiesNearTarget: 1,
    bestIntelConfidence: 0.82,
    bestIntelTarget: { x: 20, y: 30, z: 4 },
    lastTeamUtility: { type: 'smoke', tick: 66 }
  }
);
assert.equal(smokeFlash.action, 'deploy');
assert.equal(smokeFlash.reasonCode, 'combo-smoke-flash');
assert.equal(smokeFlash.targetSource, 'team-intel');

const stackedHe = decide(
  { type: 'he', purpose: 'stack-read' },
  {
    knownEnemiesNearTarget: 3,
    bestIntelConfidence: 0.7,
    bestIntelTarget: { x: 22, y: 31, z: 4 }
  }
);
assert.equal(stackedHe.action, 'deploy');
assert.equal(stackedHe.reasonCode, 'stack-read');

const delayedRush = decide(
  { type: 'incendiary', purpose: 'rush-delay' },
  {
    knownEnemiesNearTarget: 2,
    soundOrCallIntel: 1,
    bestIntelConfidence: 0.72
  },
  { teamId: 2 }
);
assert.equal(delayedRush.action, 'deploy');
assert.equal(delayedRush.reasonCode, 'rush-delay');

const retakeSmoke = decide(
  { type: 'smoke', purpose: 'retake-cover' },
  {
    phase: 'postplant',
    postPlantDecision: 'retake',
    plantPosition: { x: 50, y: 50, z: 2 }
  },
  { teamId: 2 }
);
assert.equal(retakeSmoke.action, 'deploy');
assert.equal(retakeSmoke.reasonCode, 'retake-cover');

const saveUtility = decide(
  { type: 'flash', purpose: 'retake-entry' },
  { phase: 'postplant', postPlantDecision: 'save' },
  { teamId: 2 }
);
assert.equal(saveUtility.action, 'hold');
assert.equal(saveUtility.reasonCode, 'save-decision');

const unavailable = decide({ type: 'he' }, {}, { alive: false });
assert.equal(unavailable.action, 'cancel');
assert.equal(unavailable.reasonCode, 'owner-unavailable');

assert.deepEqual(
  decide({ type: 'flash' }, { knownEnemiesNearTarget: 1, bestIntelConfidence: 0.8 }),
  decide({ type: 'flash' }, { knownEnemiesNearTarget: 1, bestIntelConfidence: 0.8 })
);

console.log(JSON.stringify({
  decisions: {
    entryFlash: entryFlash.reasonCode,
    friendlyRisk: friendlyRisk.reasonCode,
    smokeFlash: smokeFlash.reasonCode,
    stackedHe: stackedHe.reasonCode,
    delayedRush: delayedRush.reasonCode,
    retakeSmoke: retakeSmoke.reasonCode,
    saveUtility: saveUtility.reasonCode,
    unavailable: unavailable.reasonCode
  },
  deterministic: true
}));
