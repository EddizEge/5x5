const assert = require('node:assert/strict');
const { isFootballV2BetaLobby } = require('../server/simulation/football-v2-rollout');

assert.equal(isFootballV2BetaLobby({ branch: 'futbol', isBeta: 1, enabled: true }), true);
assert.equal(isFootballV2BetaLobby({ branch: 'fifa', isBeta: '1', enabled: true }), true);
assert.equal(isFootballV2BetaLobby({ branch: 'cs', isBeta: 1, enabled: true }), false);
assert.equal(isFootballV2BetaLobby({ branch: 'futbol', isBeta: 0, enabled: true }), false);
assert.equal(isFootballV2BetaLobby({ branch: 'fifa', isBeta: 2, enabled: true }), false);
assert.equal(isFootballV2BetaLobby({ branch: 'futbol', isBeta: 1, enabled: false }), false);

console.log(JSON.stringify({
  betaFootballV2: ['futbol', 'fifa'],
  isolatedModes: [0, 2],
  rollbackGateVerified: true
}, null, 2));
