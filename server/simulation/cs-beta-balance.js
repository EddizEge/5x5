const CS_BETA_BALANCE_TARGETS = Object.freeze({
  attackerWinRate: Object.freeze({ min: 0.38, max: 0.62 }),
  plantRate: Object.freeze({ min: 0.45, max: 0.85 }),
  defusePerPlant: Object.freeze({ min: 0.18, max: 0.56 }),
  savePerPlant: Object.freeze({ min: 0.008, max: 0.2 }),
  utilityPerRound: Object.freeze({ min: 2.2, max: 5.5 }),
  fullBuyShare: Object.freeze({ min: 0.48, max: 0.82 }),
  forceBuyShare: Object.freeze({ min: 0.06, max: 0.34 }),
  averageRounds: Object.freeze({ min: 16, max: 28 })
});

function within(value, target) {
  return Number.isFinite(value) && value >= target.min && value <= target.max;
}

function evaluateCsBetaBalance(metrics) {
  const checks = Object.entries(CS_BETA_BALANCE_TARGETS).map(([key, target]) => ({
    key,
    value: Number(metrics[key] || 0),
    min: target.min,
    max: target.max,
    pass: within(Number(metrics[key] || 0), target)
  }));
  return {
    status: checks.every(check => check.pass) ? 'pass' : 'review',
    checks,
    failed: checks.filter(check => !check.pass).map(check => check.key)
  };
}

module.exports = {
  CS_BETA_BALANCE_TARGETS,
  evaluateCsBetaBalance
};
