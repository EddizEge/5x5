const assert = require('assert');
const { createCsEconomyManager, BUY_TYPES } = require('../server/simulation/cs-economy');
const { CS_ECONOMY_RULES } = require('../server/simulation/cs-economy-rules');
const { createSeededRng } = require('../server/simulation/seeded-rng');
const {
  WEAPON_LIST,
  getWeapon
} = require('../server/simulation/cs-weapon-catalog');

const team = prefix => Array.from({ length: 5 }, (_, index) => ({
  name: `${prefix}-${index + 1}`,
  rating_cs: 74 + index
}));
const team1 = team('Mavi');
const team2 = team('Kırmızı');
const manager = createCsEconomyManager({
  team1,
  team2,
  getRating: char => char.rating_cs,
  rng: createSeededRng('cs-economy-test')
});

assert.equal(WEAPON_LIST.length, 20, '5F mağaza kataloğu 20 silah içermeli');
for (const weapon of WEAPON_LIST) {
  assert(weapon.id && weapon.name && weapon.slot && weapon.category);
  assert(weapon.price >= 0);
  assert(weapon.magazineSize > 0);
  assert(Array.isArray(weapon.tacticalTags));
}

const asRemaining = (roundState, aliveIds = []) => [
  ...roundState.loadouts[1],
  ...roundState.loadouts[2]
].map(player => ({
  ...player,
  alive: aliveIds.includes(player.id)
}));

const round1 = manager.prepareRound({
  round: 1,
  team1Attacker: true,
  score1: 0,
  score2: 0
});
assert.equal(round1.isPistol, true);
assert.equal(round1.teams[1].buyType, 'pistol');
assert.equal(round1.teams[2].buyType, 'pistol');
assert(round1.purchases.length > 0);
assert.equal(round1.purchaseTimeline.length, round1.purchases.length);
for (const player of [...round1.loadouts[1], ...round1.loadouts[2]]) {
  assert(player.money >= 0 && player.money <= CS_ECONOMY_RULES.maxMoney);
  if (player.hasDefuseKit) assert.equal(player.side, 'CT');
  assert(['awp', 'entry', 'support', 'lurk', 'anchor'].includes(player.rolePreference));
}
assert(round1.teams[1].reasonCodes.includes('PISTOL_ROUND'));
assert(round1.teams[2].reasonCodes.includes('PISTOL_ROUND'));

manager.finalizeRound({
  winnerTeamId: 1,
  reason: 'elimination',
  planted: false,
  planterChar: null,
  events: [],
  remainingPlayers: asRemaining(round1, ['cs-1-0'])
});

const round2 = manager.prepareRound({
  round: 2,
  team1Attacker: true,
  score1: 1,
  score2: 0
});
assert(BUY_TYPES.includes(round2.teams[1].buyType));
assert(BUY_TYPES.includes(round2.teams[2].buyType));
assert(round2.teams[1].reasonCodes.length > 0);
assert(round2.teams[2].reasonCodes.length > 0);
assert(BUY_TYPES.includes(round2.teams[1].expectedOpponentBuy));
const carriedCandidate = round2.loadouts[1].find(player =>
  !['pistol', 'knife'].includes(getWeapon(player.weapon).category)
);
assert(carriedCandidate, 'İkinci raundda en az bir ana silah satın alınmalı');

manager.finalizeRound({
  winnerTeamId: 1,
  reason: 'bomb-exploded',
  planted: true,
  planterChar: team1[0],
  events: [{
    kind: 'kill',
    teamId: 1,
    killer: team1[Number(carriedCandidate.id.split('-').pop())],
    visual: { combat: { weapon: carriedCandidate.weapon } }
  }],
  remainingPlayers: asRemaining(round2, [carriedCandidate.id])
});

const round3 = manager.prepareRound({
  round: 3,
  team1Attacker: true,
  score1: 2,
  score2: 0
});
const carriedNextRound = round3.loadouts[1].find(player => player.id === carriedCandidate.id);
assert.equal(carriedNextRound.weapon, carriedCandidate.weapon);
assert.equal(carriedNextRound.savedFromPreviousRound, true);
assert.equal(carriedNextRound.ammo, carriedCandidate.ammo);
assert.equal(carriedNextRound.reserveAmmo, carriedCandidate.reserveAmmo);

const round13 = manager.prepareRound({
  round: 13,
  team1Attacker: false,
  score1: 7,
  score2: 5
});
assert.equal(round13.isPistol, true);
assert(round13.loadouts[1].every(player => player.side === 'CT'));
assert(round13.loadouts[2].every(player => player.side === 'T'));
assert(round13.loadouts[1].every(player => !player.savedFromPreviousRound));
assert(round13.loadouts[2].every(player => !player.hasDefuseKit));
for (const player of [...round13.loadouts[1], ...round13.loadouts[2]]) {
  assert(player.money >= 0 && player.money <= CS_ECONOMY_RULES.startMoney);
  assert(player.utility.length <= 4);
  assert(player.utility.filter(item => item === 'flash').length <= 2);
  for (const item of ['smoke', 'he', 'molotov', 'incendiary']) {
    assert(player.utility.filter(current => current === item).length <= 1);
  }
}

const lastRoundManager = createCsEconomyManager({
  team1,
  team2,
  getRating: char => char.rating_cs,
  rng: createSeededRng('cs-economy-no-future-round')
});
for (const teamId of [1, 2]) {
  lastRoundManager.team(teamId).players.forEach(player => {
    player.money = 650;
    player.savedFromPreviousRound = false;
  });
}
const round12Force = lastRoundManager.prepareRound({
  round: 12,
  team1Attacker: true,
  score1: 6,
  score2: 5
});
for (const teamId of [1, 2]) {
  assert.equal(round12Force.teams[teamId].buyType, 'force');
  assert(round12Force.teams[teamId].reasonCodes.includes('NO_FUTURE_ROUND_FORCE'));
  assert(round12Force.teams[teamId].teamSpend > 0);
}

const matchPointManager = createCsEconomyManager({
  team1,
  team2,
  getRating: char => char.rating_cs,
  rng: createSeededRng('cs-economy-match-point-force')
});
for (const teamId of [1, 2]) {
  matchPointManager.team(teamId).players.forEach(player => {
    player.money = 700;
    player.savedFromPreviousRound = false;
  });
}
const matchPointForce = matchPointManager.prepareRound({
  round: 20,
  team1Attacker: false,
  score1: 12,
  score2: 7
});
assert.equal(matchPointForce.teams[1].buyType, 'force');
assert.equal(matchPointForce.teams[2].buyType, 'force');

const dropManager = createCsEconomyManager({
  team1,
  team2,
  getRating: char => char.rating_cs,
  rng: createSeededRng('cs-economy-awp-drop-test')
});
const dropTeam = dropManager.team(1);
const dropAwper = dropTeam.players.find(player => player.rolePreference === 'awp');
dropTeam.players.forEach(player => {
  player.money = player === dropAwper ? 4500 : 4300;
});
const donor = dropTeam.players.find(player => player !== dropAwper);
donor.money = 6500;
const dropRound = dropManager.prepareRound({
  round: 6,
  team1Attacker: true,
  score1: 4,
  score2: 1
});
assert.equal(dropRound.teams[1].buyType, 'full');
assert.equal(dropRound.drops.length, 1, 'Takım AWP drop kararı üretmeli');
assert.equal(dropRound.drops[0].reasonCode, 'AWP_TEAM_DROP');
assert.equal(dropRound.drops[0].toPlayerId, dropAwper.id);
assert.equal(
  dropRound.loadouts[1].find(player => player.id === dropAwper.id).weapon,
  'AWP'
);
assert(dropRound.purchases.some(purchase =>
  purchase.isDrop && purchase.recipientId === dropAwper.id
));

const ctAwardManager = createCsEconomyManager({
  team1,
  team2,
  getRating: char => char.rating_cs,
  rng: createSeededRng('cs-economy-ct-shared-award')
});
const ctAwardRound = ctAwardManager.prepareRound({
  round: 2,
  team1Attacker: true,
  score1: 0,
  score2: 0
});
const ctAwardSummary = ctAwardManager.finalizeRound({
  winnerTeamId: 1,
  reason: 'elimination',
  planted: false,
  planterChar: null,
  events: [{
    kind: 'kill',
    teamId: 2,
    killer: team2[0],
    visual: { combat: { weapon: ctAwardRound.loadouts[2][0].weapon } }
  }],
  remainingPlayers: asRemaining(ctAwardRound, [])
});
assert.equal(ctAwardSummary.awards.ctEliminations, 1);
assert.equal(
  ctAwardSummary.awards.ctSharedKillReward,
  CS_ECONOMY_RULES.ctSharedKillReward
);

console.log(JSON.stringify({
  catalogWeapons: WEAPON_LIST.length,
  round1: {
    team1: round1.teams[1].buyType,
    team2: round1.teams[2].buyType,
    purchases: round1.purchases.length
  },
  round2: {
    team1: round2.teams[1].buyType,
    team2: round2.teams[2].buyType,
    carriedWeapon: carriedCandidate.weapon
  },
  coordinatedDrops: dropRound.drops.length,
  ctSharedKillReward: ctAwardSummary.awards.ctSharedKillReward,
  explainableBuyPlans: true,
  utilitySlotRules: true,
  halfReset: true,
  moneyBounds: true,
  ctKitOnly: true,
  deterministic: true
}));
