const ROLE_ORDER = Object.freeze(['awp', 'entry', 'support', 'lurk', 'anchor']);

const ROLE_LABELS = Object.freeze({
  awp: 'AWP',
  entry: 'ENTRY',
  support: 'SUPPORT',
  lurk: 'LURK',
  anchor: 'ANCHOR'
});

const TASKS = Object.freeze({
  T: Object.freeze({
    regulation: Object.freeze({
      awp: 'long-angle',
      entry: 'open-site',
      support: 'flash-and-trade',
      lurk: 'cut-rotation',
      anchor: 'bomb-support'
    }),
    postplant: Object.freeze({
      awp: 'postplant-long',
      entry: 'site-contact',
      support: 'trade-cover',
      lurk: 'rotation-cut',
      anchor: 'bomb-anchor'
    }),
    save: Object.freeze({
      awp: 'save-awp',
      entry: 'save-exit',
      support: 'save-exit',
      lurk: 'save-exit',
      anchor: 'save-exit'
    })
  }),
  CT: Object.freeze({
    regulation: Object.freeze({
      awp: 'long-angle',
      entry: 'first-rotator',
      support: 'utility-support',
      lurk: 'information-rotator',
      anchor: 'site-anchor'
    }),
    retake: Object.freeze({
      awp: 'retake-long-cover',
      entry: 'retake-entry',
      support: 'retake-trade',
      lurk: 'retake-flank',
      anchor: 'defuse-cover'
    }),
    ninja: Object.freeze({
      awp: 'ninja-cover',
      entry: 'ninja-cover',
      support: 'ninja-cover',
      lurk: 'ninja-cover',
      anchor: 'ninja-defuser'
    }),
    save: Object.freeze({
      awp: 'save-awp',
      entry: 'save-exit',
      support: 'save-exit',
      lurk: 'save-exit',
      anchor: 'save-exit'
    })
  })
});

function roleScore(player, role) {
  let score = player.rating || 70;
  if (player.rolePreference === role) score += 40;
  if (role === 'awp' && player.weapon === 'AWP') score += 80;
  if (role === 'support') score += (player.utility || []).length * 8;
  if (role === 'entry') score += Math.max(0, (player.rating || 70) - 72) * 0.35;
  if (role === 'anchor') score += player.armor ? 5 : 0;
  return score;
}

function assignRoundRoles(players, side) {
  const available = [...players];
  const assignments = [];
  for (const role of ROLE_ORDER) {
    available.sort((first, second) => {
      const scoreDelta = roleScore(second, role) - roleScore(first, role);
      if (Math.abs(scoreDelta) > 0.001) return scoreDelta;
      return String(first.id).localeCompare(String(second.id));
    });
    const player = available.shift();
    if (!player) continue;
    assignments.push({
      id: player.id,
      teamId: player.teamId,
      side,
      role,
      label: ROLE_LABELS[role],
      initialTask: TASKS[side].regulation[role]
    });
  }
  return assignments;
}

function taskForRole(role, { side, phase = 'regulation', decision = null }) {
  let taskPhase = phase;
  if (side === 'CT' && phase === 'postplant') {
    taskPhase = ['retake', 'save', 'ninja'].includes(decision) ? decision : 'retake';
  }
  if (side === 'T' && phase === 'postplant') taskPhase = 'postplant';
  return TASKS[side]?.[taskPhase]?.[role]
    || TASKS[side]?.regulation?.[role]
    || 'team-shape';
}

function evaluateMidRoundCall({
  tick,
  maxTick,
  currentPlan,
  aliveAttackers,
  entryAlive,
  bombDropped,
  entryTradeDistance,
  knownDefendersAtTarget,
  alreadyCalled,
  rng = Math.random
}) {
  const progress = tick / Math.max(1, maxTick);
  const metrics = {
    progress: Number(progress.toFixed(3)),
    aliveAttackers,
    entryAlive,
    bombDropped,
    entryTradeDistance: Number.isFinite(entryTradeDistance)
      ? Number(entryTradeDistance.toFixed(2))
      : null,
    knownDefendersAtTarget
  };
  if (alreadyCalled || progress < 0.38 || progress > 0.78 || aliveAttackers < 2) {
    return { call: null, reason: 'no-window', metrics };
  }
  if (bombDropped) {
    return { call: 'regroup', reason: 'recover-bomb', targetPlan: currentPlan, metrics };
  }
  if (!entryAlive) {
    return { call: 'regroup', reason: 'entry-lost', targetPlan: currentPlan, metrics };
  }
  if (entryTradeDistance > 15) {
    return { call: 'regroup', reason: 'trade-gap', targetPlan: currentPlan, metrics };
  }
  if (knownDefendersAtTarget >= 2 && rng() < 0.68) {
    const targetPlan = ['long', 'short'].includes(currentPlan) ? 'b' : 'short';
    return { call: 'rotate', reason: 'stack-read', targetPlan, metrics };
  }
  if (aliveAttackers >= 4 && progress <= 0.66 && rng() < 0.14) {
    const targetPlan = ['long', 'short'].includes(currentPlan) ? 'b' : 'short';
    return { call: 'rotate', reason: 'space-read', targetPlan, metrics };
  }
  if (progress >= 0.58) {
    return { call: 'recommit', reason: 'clock-pressure', targetPlan: currentPlan, metrics };
  }
  return { call: null, reason: 'hold-default', metrics };
}

module.exports = {
  ROLE_ORDER,
  ROLE_LABELS,
  TASKS,
  assignRoundRoles,
  taskForRole,
  evaluateMidRoundCall
};
