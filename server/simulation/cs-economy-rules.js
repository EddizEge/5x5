const CS_ECONOMY_RULES = Object.freeze({
  startMoney: 800,
  maxMoney: 16000,
  roundWin: 3250,
  bombExplosionWin: 3500,
  lossBonuses: Object.freeze([1400, 1900, 2400, 2900, 3400]),
  plantLossBonus: 800,
  plantPersonalReward: 300,
  defusePersonalReward: 300,
  ctSharedKillReward: 50,
  armor: Object.freeze({
    kevlar: 650,
    helmetUpgrade: 350,
    full: 1000
  }),
  defuseKit: 400,
  utility: Object.freeze({
    smoke: 300,
    flash: 200,
    he: 300,
    molotov: 400,
    incendiary: 500
  })
});

const clampMoney = value => Math.max(
  0,
  Math.min(CS_ECONOMY_RULES.maxMoney, Math.round(Number(value) || 0))
);

function lossBonus(index) {
  const bounded = Math.max(
    0,
    Math.min(CS_ECONOMY_RULES.lossBonuses.length - 1, Number(index) || 0)
  );
  return CS_ECONOMY_RULES.lossBonuses[bounded];
}

module.exports = {
  CS_ECONOMY_RULES,
  clampMoney,
  lossBonus
};
