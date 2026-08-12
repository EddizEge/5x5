const FOOTBALL_V2_BRANCHES = new Set(['futbol', 'fifa']);

function isFootballV2BetaLobby({ branch, isBeta, enabled } = {}) {
  const rolloutEnabled = enabled === undefined
    ? process.env.FOOTBALL_V2_BETA_LOBBY !== 'false'
    : enabled !== false;

  return rolloutEnabled && Number(isBeta) === 1 && FOOTBALL_V2_BRANCHES.has(branch);
}

module.exports = {
  FOOTBALL_V2_BRANCHES,
  isFootballV2BetaLobby
};
