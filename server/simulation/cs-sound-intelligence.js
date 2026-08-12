const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const SOUND_PROFILES = Object.freeze({
  run: Object.freeze({
    radius: 14,
    baseConfidence: 0.5,
    positionError: 3.1,
    maxAgeTicks: 42,
    callDelayTicks: [5, 11]
  }),
  walk: Object.freeze({
    radius: 2.6,
    baseConfidence: 0.24,
    positionError: 4.4,
    maxAgeTicks: 22,
    callDelayTicks: [8, 15]
  }),
  gunfire: Object.freeze({
    radius: 32,
    baseConfidence: 0.84,
    positionError: 1.35,
    maxAgeTicks: 64,
    callDelayTicks: [3, 7]
  }),
  reload: Object.freeze({
    radius: 10,
    baseConfidence: 0.62,
    positionError: 2.2,
    maxAgeTicks: 46,
    callDelayTicks: [4, 9]
  }),
  utility: Object.freeze({
    radius: 24,
    baseConfidence: 0.76,
    positionError: 1.75,
    maxAgeTicks: 56,
    callDelayTicks: [3, 8]
  }),
  'bomb-drop': Object.freeze({
    radius: 20,
    baseConfidence: 0.8,
    positionError: 1.45,
    maxAgeTicks: 70,
    callDelayTicks: [2, 6]
  }),
  'bomb-pickup': Object.freeze({
    radius: 7,
    baseConfidence: 0.5,
    positionError: 2.7,
    maxAgeTicks: 34,
    callDelayTicks: [5, 10]
  }),
  plant: Object.freeze({
    radius: 18,
    baseConfidence: 0.88,
    positionError: 0.85,
    maxAgeTicks: 84,
    callDelayTicks: [2, 5]
  }),
  defuse: Object.freeze({
    radius: 28,
    baseConfidence: 0.93,
    positionError: 0.65,
    maxAgeTicks: 76,
    callDelayTicks: [1, 4]
  })
});

function getSoundProfile(type) {
  return SOUND_PROFILES[type] || SOUND_PROFILES.run;
}

function evaluateHearing({
  type,
  distance,
  observerRating = 75,
  occluded = false,
  fake = false,
  rng = Math.random
}) {
  const profile = getSoundProfile(type);
  const awareness = clamp(0.92 + (observerRating - 70) / 250, 0.86, 1.12);
  const effectiveRadius = profile.radius * awareness * (occluded ? 0.88 : 1);
  if (distance > effectiveRadius) {
    return {
      heard: false,
      confidence: 0,
      errorRadius: 0,
      effectiveRadius,
      maxAgeTicks: profile.maxAgeTicks
    };
  }

  const proximity = clamp(1 - distance / Math.max(0.01, effectiveRadius), 0, 1);
  const certainty = profile.baseConfidence
    * (0.52 + proximity * 0.48)
    * (occluded ? 0.88 : 1)
    * (fake ? 0.97 : 1);
  const errorRadius = profile.positionError
    * (1.35 - proximity * 0.55)
    * (occluded ? 1.28 : 1)
    * (0.9 + rng() * 0.2);

  return {
    heard: true,
    confidence: clamp(certainty, 0.12, 0.96),
    errorRadius,
    effectiveRadius,
    maxAgeTicks: profile.maxAgeTicks
  };
}

function estimateSoundPosition(position, errorRadius, rng = Math.random) {
  const angle = rng() * Math.PI * 2;
  const magnitude = errorRadius * (0.35 + rng() * 0.65);
  return {
    x: Number((position.x + Math.cos(angle) * magnitude).toFixed(3)),
    y: Number((position.y + Math.sin(angle) * magnitude).toFixed(3)),
    z: Number(position.z || 0)
  };
}

function teamCallDelay(type, rng = Math.random) {
  const [minimum, maximum] = getSoundProfile(type).callDelayTicks;
  return minimum + Math.floor(rng() * (maximum - minimum + 1));
}

function fuseIntel(previous, incoming) {
  if (!previous || incoming.source === 'vision') {
    return {
      ...incoming,
      confirmations: incoming.source === 'vision' ? 3 : 1
    };
  }

  const separation = Math.hypot(previous.x - incoming.x, previous.y - incoming.y);
  const consistent = separation <= (
    incoming.source === 'team-call' ? 5.2 : 4.2
  );
  if (consistent) {
    const confirmations = Math.min(5, (previous.confirmations || 1) + 1);
    const incomingWeight = clamp(0.45 + incoming.confidence * 0.25, 0.45, 0.68);
    return {
      ...incoming,
      x: Number((previous.x * (1 - incomingWeight) + incoming.x * incomingWeight).toFixed(3)),
      y: Number((previous.y * (1 - incomingWeight) + incoming.y * incomingWeight).toFixed(3)),
      confidence: clamp(
        Math.max(previous.confidence, incoming.confidence) + 0.06 * confirmations,
        0,
        incoming.source === 'team-call' ? 0.9 : 0.96
      ),
      confirmations,
      corrected: Boolean(previous.fake && !incoming.fake)
    };
  }

  if (incoming.confidence >= previous.confidence + 0.12) {
    return {
      ...incoming,
      confirmations: 1,
      corrected: Boolean(previous.fake && !incoming.fake)
    };
  }

  return {
    ...previous,
    confidence: clamp(previous.confidence - 0.035, 0, 1),
    conflicted: true,
    conflictTick: incoming.tick
  };
}

module.exports = {
  SOUND_PROFILES,
  getSoundProfile,
  evaluateHearing,
  estimateSoundPosition,
  teamCallDelay,
  fuseIntel
};
