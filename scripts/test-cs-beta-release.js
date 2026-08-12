const assert = require('assert');
const { performance } = require('perf_hooks');
const { simulateMatch } = require('../server/simulation/engine');
const { evaluateCsBetaBalance } = require('../server/simulation/cs-beta-balance');

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

function events(result) {
  return result.lines.map(line => line.visualEvent).filter(Boolean);
}

const matchCount = Number(process.env.CS_BETA_RELEASE_MATCHES) || 12;
const totals = {
  rounds: 0,
  attackerWins: 0,
  plants: 0,
  defuses: 0,
  saves: 0,
  utility: 0,
  fullBuys: 0,
  forceBuys: 0,
  buys: 0,
  resultBytes: 0,
  maxEventBytes: 0
};
const startedAt = performance.now();

for (let index = 0; index < matchCount; index += 1) {
  const result = simulateMatch(
    team('Mavi'),
    team('Kırmızı', 1),
    'cs',
    true,
    true,
    { seed: `cs-beta-release-${index}` }
  );
  const telemetry = result.csBetaTelemetry;
  assert(telemetry, 'CS beta telemetry is missing.');
  assert.deepEqual(
    telemetry.criticalIssues,
    [],
    `Critical integrity issue for seed ${index}: ${telemetry.criticalIssues.join(', ')}`
  );
  assert.equal(
    events(result).filter(event => event.playerSnapshot === 'full').length,
    telemetry.payload.fullSnapshots
  );

  totals.rounds += telemetry.counts.rounds;
  totals.attackerWins += telemetry.counts.attackerWins;
  totals.plants += telemetry.counts.plants;
  totals.defuses += telemetry.counts.defuses;
  totals.saves += telemetry.counts.saves;
  totals.utility += telemetry.counts.utility;
  totals.fullBuys += telemetry.counts.buys.full;
  totals.forceBuys += telemetry.counts.buys.force;
  totals.buys += Object.values(telemetry.counts.buys).reduce((sum, value) => sum + value, 0);
  totals.resultBytes += telemetry.payload.resultBytes;
  totals.maxEventBytes = Math.max(totals.maxEventBytes, telemetry.payload.maxEventBytes);
}

const metrics = {
  attackerWinRate: totals.attackerWins / Math.max(1, totals.rounds),
  plantRate: totals.plants / Math.max(1, totals.rounds),
  defusePerPlant: totals.defuses / Math.max(1, totals.plants),
  savePerPlant: totals.saves / Math.max(1, totals.plants),
  utilityPerRound: totals.utility / Math.max(1, totals.rounds),
  fullBuyShare: totals.fullBuys / Math.max(1, totals.buys),
  forceBuyShare: totals.forceBuys / Math.max(1, totals.buys),
  averageRounds: totals.rounds / Math.max(1, matchCount)
};
const balance = evaluateCsBetaBalance(metrics);
assert.equal(
  balance.status,
  'pass',
  `Aggregate balance review required: ${balance.failed.join(', ')} `
    + JSON.stringify(
      Object.fromEntries(
        Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(3))])
      )
    )
);

const averageResultBytes = totals.resultBytes / Math.max(1, matchCount);
assert(
  averageResultBytes <= 12.5 * 1024 * 1024,
  `Average CS beta payload is too large: ${Math.round(averageResultBytes / 1024)} KB`
);
assert(
  totals.maxEventBytes <= 220 * 1024,
  `A CS beta event is too large: ${Math.round(totals.maxEventBytes / 1024)} KB`
);

const deterministicSeed = 'cs-beta-release-determinism';
const deterministicA = simulateMatch(
  team('Mavi'),
  team('Kırmızı', 1),
  'cs',
  true,
  true,
  { seed: deterministicSeed }
);
const deterministicB = simulateMatch(
  team('Mavi'),
  team('Kırmızı', 1),
  'cs',
  true,
  true,
  { seed: deterministicSeed }
);
assert.deepEqual(deterministicA, deterministicB, 'Release seed is not deterministic.');

const nonBeta = simulateMatch(
  team('Mavi'),
  team('Kırmızı', 1),
  'cs',
  true,
  false,
  { seed: 'cs-beta-release-isolation' }
);
assert.equal(events(nonBeta).length, 0, 'Shooter events leaked outside visual beta.');

const elapsedMs = Math.round(performance.now() - startedAt);
console.log(JSON.stringify({
  matches: matchCount,
  rounds: totals.rounds,
  metrics: Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(3))])
  ),
  payload: {
    averageKilobytes: Number((averageResultBytes / 1024).toFixed(1)),
    maxEventKilobytes: Number((totals.maxEventBytes / 1024).toFixed(1))
  },
  deterministic: true,
  betaIsolation: true,
  elapsedMs
}, null, 2));
