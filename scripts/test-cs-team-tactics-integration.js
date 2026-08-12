const assert = require('node:assert/strict');
const { simulateMatch } = require('../server/simulation/engine');
const { ROLE_ORDER } = require('../server/simulation/cs-team-tactics');

function team(prefix, ratingOffset = 0) {
  return {
    displayName: `${prefix} Takımı`,
    style: 'dengeli',
    characters: Array.from({ length: 5 }, (_, index) => ({
      name: `${prefix}-${index + 1}`,
      avatar_emoji: index % 2 ? '🛡️' : '🎯',
      rating_cs: 75 + ratingOffset + index
    }))
  };
}

function visualEvents(result) {
  return result.lines.map(line => line.visualEvent).filter(Boolean);
}

const stats = {
  matches: 0,
  rounds: 0,
  roleTaskRecords: 0,
  tacticSamples: 0,
  executeWaits: 0,
  executeCommits: 0,
  midRoundCalls: { rotate: 0, regroup: 0, recommit: 0 },
  postPlantAssignments: 0,
  retakeAssignments: 0,
  roleSources: {
    'execute-wait': 0,
    'trade-close': 0,
    'execute-entry': 0,
    'trade-follow': 0,
    'lurk-control': 0,
    'anchor-hold': 0,
    'awp-angle': 0,
    'awp-reposition': 0,
    'awp-team-commit': 0,
    'ct-opening-sprint': 0,
    't-opening-exit': 0
  }
};

const batchSize = Number(process.env.CS_TEAM_TACTICS_MATCHES) || 5;
for (let index = 0; index < batchSize; index += 1) {
  const result = simulateMatch(team('Mavi'), team('Kırmızı', 1), 'cs', true, true, {
    seed: `cs-team-tactics-${index}`,
    includeDebugTelemetry: true
  });
  assert(!result.lines.some(line => line.text?.includes('Maç simülasyonunda bir hata oluştu')));

  let currentRoundStart = null;
  for (const event of visualEvents(result)) {
    if (event.type === 'round-start') {
      currentRoundStart = event;
      stats.rounds += 1;
      assert.equal(event.teamTacticsVersion, 1);
      assert.equal(event.roleAssignments.length, 10);
      assert.equal(event.players.length, 10);
      assert(event.players.every(player => player.roundRole && player.roundTask));
      assert.equal(event.ctOpeningAssignments.length, 5);
      for (const assignment of event.ctOpeningAssignments) {
        assert(
          assignment.durationMs > 0 && assignment.durationMs <= 2200,
          `CT acilis rotasi gec tamamlaniyor: ${assignment.routeId} ${assignment.durationMs}ms`
        );
      }
      for (const teamId of [1, 2]) {
        const teamRoles = event.roleAssignments
          .filter(item => item.teamId === teamId)
          .map(item => item.role)
          .sort();
        assert.deepEqual(teamRoles, [...ROLE_ORDER].sort());
      }
      stats.roleTaskRecords += event.roleTaskTimeline.length;
      stats.tacticSamples += event.teamTacticsTimeline.length;
      for (const record of event.teamTacticsTimeline) {
        if (record.event === 'execute-wait') {
          stats.executeWaits += 1;
          assert(record.entryTradeDistance > 14);
        }
        if (record.event === 'execute-commit') {
          stats.executeCommits += 1;
          assert(
            record.entryTradeDistance <= 14,
            `Entry trade desteğinden kopuk execute başlattı: ${record.entryTradeDistance}`
          );
        }
      }
      for (const record of event.behaviorTimeline) {
        if (Object.hasOwn(stats.roleSources, record.source)) {
          stats.roleSources[record.source] += 1;
        }
      }
    }
    if (event.type === 'mid-round-call') {
      stats.midRoundCalls[event.call] += 1;
      assert(event.assignments.length >= 2);
      assert(event.assignments.every(item => item.roundRole && item.roundTask));
      assert(event.players.filter(player => player.alive).every(player => player.roundTask));
    }
    if (event.type === 'tactical-decision') {
      stats.postPlantAssignments += (event.attackerSetup || []).length;
      stats.retakeAssignments += (event.retakePlan || []).length;
      assert((event.attackerSetup || []).every(item => item.roundRole && item.roundTask));
      assert((event.retakePlan || []).every(item => item.roundRole && item.roundTask));
      if ([1, 12, 13, 24].includes(event.round) || event.round > 24) {
        assert.notEqual(event.decision, 'save', `R${event.round} save kararı üretti.`);
        assert.equal(event.metrics.mustContest, true);
      }
      assert(
        !(currentRoundStart?.behaviorTimeline || []).some(record =>
          record.source === 'awp-reposition' && record.tick >= event.tick
        ),
        'AWP post-plant objective görevi yerine eski açıya reposition oldu.'
      );
    }
    if (event.players) {
      assert(
        event.players.filter(player => player.alive).every(player => player.roundRole && player.roundTask),
        `${event.type} olayında görevsiz yaşayan oyuncu var.`
      );
    }
  }
  stats.matches += 1;
}

assert(stats.rounds > 0);
assert(stats.roleTaskRecords >= stats.rounds * 10);
assert(stats.tacticSamples > 0);
assert(stats.executeWaits > 0);
assert(stats.executeCommits > 0);
assert(Object.values(stats.midRoundCalls).reduce((sum, value) => sum + value, 0) > 0);
if (batchSize >= 10) assert(stats.midRoundCalls.rotate > 0);
assert(stats.postPlantAssignments > 0);
assert(stats.retakeAssignments > 0);
assert(stats.roleSources['lurk-control'] > 0);
assert(stats.roleSources['anchor-hold'] > 0);
assert(stats.roleSources['awp-angle'] > 0);
assert(stats.roleSources['awp-team-commit'] > 0);
assert(stats.roleSources['ct-opening-sprint'] > 0);
assert(stats.roleSources['t-opening-exit'] > 0);

console.log(JSON.stringify(stats));
