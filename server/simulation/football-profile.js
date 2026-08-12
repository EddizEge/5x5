const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function roleGroup(player, branch) {
  if (player?.isGoalkeeper) return 'goalkeeper';
  const raw = String(player?.visualRole || player?.role || '').toUpperCase().split(' ')[0];
  if (['LB', 'LCB', 'RCB', 'RB'].includes(raw) || raw.includes('DEFANS')) return 'defender';
  if (['LDM', 'RDM'].includes(raw)) return 'holding-midfielder';
  if (['LAM', 'CAM', 'RAM'].includes(raw)) return 'attacking-midfielder';
  if (raw === 'ST' || raw.includes('HÜCUM') || raw.includes('FORVET')) return 'attacker';
  if (raw.includes('ORTA')) return 'midfielder';

  if (branch === 'futbol') {
    const slotMatch = String(player?.role || '').match(/\d+/);
    if (slotMatch) {
      const slot = Number(slotMatch[0]);
      if (slot <= 1) return 'defender';
      if (slot <= 3) return 'midfielder';
      return 'attacker';
    }
  }
  return 'midfielder';
}

const ROLE_MODIFIERS = {
  goalkeeper: {
    passing: -3, vision: -7, dribbling: -12, finishing: -18,
    defending: 4, pace: -12, reaction: 8, composure: 5, goalkeeping: 14
  },
  defender: {
    passing: 1, vision: -2, dribbling: -5, finishing: -11,
    defending: 9, pace: 0, reaction: 4, composure: 2, goalkeeping: -20
  },
  'holding-midfielder': {
    passing: 6, vision: 5, dribbling: 1, finishing: -5,
    defending: 6, pace: 0, reaction: 4, composure: 4, goalkeeping: -20
  },
  midfielder: {
    passing: 7, vision: 8, dribbling: 3, finishing: -2,
    defending: 2, pace: 1, reaction: 3, composure: 4, goalkeeping: -20
  },
  'attacking-midfielder': {
    passing: 5, vision: 7, dribbling: 6, finishing: 4,
    defending: -5, pace: 4, reaction: 4, composure: 5, goalkeeping: -20
  },
  attacker: {
    passing: -1, vision: 2, dribbling: 7, finishing: 9,
    defending: -10, pace: 5, reaction: 4, composure: 6, goalkeeping: -20
  }
};

function stableVariation(player, skill) {
  const identity = player?.id || player?.character_era_id ||
    player?.name || player?.character_name || player?.idName || 'player';
  const hash = hashString(`${identity}:${skill}`);
  return (hash % 7) - 3;
}

function createFootballProfile(player, branch, rawRating) {
  const numericRating = Number(rawRating);
  const overall = clamp(Number.isFinite(numericRating) ? numericRating : 50, 20, 110);
  const archetype = roleGroup(player, branch);
  const modifiers = ROLE_MODIFIERS[archetype] || ROLE_MODIFIERS.midfielder;
  const skill = key => Math.round(clamp(
    overall + (modifiers[key] || 0) + stableVariation(player, key),
    20,
    100
  ));

  return {
    overall: Math.round(overall),
    archetype,
    passing: skill('passing'),
    vision: skill('vision'),
    dribbling: skill('dribbling'),
    finishing: skill('finishing'),
    defending: skill('defending'),
    pace: skill('pace'),
    reaction: skill('reaction'),
    composure: skill('composure'),
    goalkeeping: skill('goalkeeping')
  };
}

function normalizedSkill(profile, key) {
  return clamp(((Number(profile?.[key]) || 20) - 20) / 80, 0, 1);
}

module.exports = {
  createFootballProfile,
  normalizedSkill,
  roleGroup
};
