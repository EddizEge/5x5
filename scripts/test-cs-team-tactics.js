const assert = require('node:assert/strict');
const {
  ROLE_ORDER,
  assignRoundRoles,
  evaluateMidRoundCall,
  taskForRole
} = require('../server/simulation/cs-team-tactics');

function player(id, rolePreference, weapon = 'AK-47', utility = []) {
  return {
    id,
    teamId: 1,
    rating: 78,
    armor: 100,
    weapon,
    utility,
    rolePreference
  };
}

const squad = [
  player('p1', 'entry'),
  player('p2', 'support', 'AK-47', ['smoke', 'flash', 'flash']),
  player('p3', 'awp', 'AWP'),
  player('p4', 'lurk'),
  player('p5', 'anchor')
];
const assignments = assignRoundRoles(squad, 'T');
assert.equal(assignments.length, 5);
assert.deepEqual(assignments.map(item => item.role).sort(), [...ROLE_ORDER].sort());
assert.equal(new Set(assignments.map(item => item.id)).size, 5);
assert.equal(assignments.find(item => item.id === 'p3').role, 'awp');
assert.equal(assignments.find(item => item.id === 'p2').role, 'support');

for (const assignment of assignments) {
  assert(assignment.initialTask);
  assert(taskForRole(assignment.role, { side: 'T', phase: 'postplant' }));
  assert(taskForRole(assignment.role, {
    side: 'CT',
    phase: 'postplant',
    decision: 'retake'
  }));
}

const regroup = evaluateMidRoundCall({
  tick: 60,
  maxTick: 120,
  currentPlan: 'long',
  aliveAttackers: 5,
  entryAlive: true,
  bombDropped: false,
  entryTradeDistance: 18,
  knownDefendersAtTarget: 0
});
assert.equal(regroup.call, 'regroup');
assert.equal(regroup.reason, 'trade-gap');

const rotate = evaluateMidRoundCall({
  tick: 60,
  maxTick: 120,
  currentPlan: 'long',
  aliveAttackers: 5,
  entryAlive: true,
  bombDropped: false,
  entryTradeDistance: 8,
  knownDefendersAtTarget: 3,
  rng: () => 0
});
assert.equal(rotate.call, 'rotate');
assert.equal(rotate.targetPlan, 'b');

const recommit = evaluateMidRoundCall({
  tick: 72,
  maxTick: 120,
  currentPlan: 'short',
  aliveAttackers: 3,
  entryAlive: true,
  bombDropped: false,
  entryTradeDistance: 9,
  knownDefendersAtTarget: 0,
  rng: () => 0.9
});
assert.equal(recommit.call, 'recommit');

console.log(JSON.stringify({
  roles: assignments.map(item => item.role),
  uniquePlayers: new Set(assignments.map(item => item.id)).size,
  calls: [regroup.call, rotate.call, recommit.call],
  deterministic: true
}));
