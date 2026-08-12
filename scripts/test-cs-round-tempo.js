const assert = require('node:assert/strict');
const { simulateMatch } = require('../server/simulation/engine');

function team(prefix, ratingOffset = 0) {
  return {
    displayName: `${prefix} Takımı`,
    style: 'dengeli',
    characters: Array.from({ length: 5 }, (_, index) => ({
      name: `${prefix}-${index + 1}`,
      avatar_emoji: '🎯',
      rating_cs: 76 + ratingOffset + index
    }))
  };
}

const result = simulateMatch(
  team('Mavi'),
  team('Kırmızı', 1),
  'cs',
  true,
  true,
  { seed: 'cs-tempo-baseline', includeDebugTelemetry: true }
);
const events = result.lines.map(line => line.visualEvent).filter(Boolean);
const starts = events.filter(event => event.type === 'round-start');
const plants = events.filter(event => event.type === 'plant');
const ends = events.filter(event => event.type === 'round-end');
const plantSeconds = plants.map(event => event.timeLeft).sort((a, b) => a - b);
const latePlants = plantSeconds.filter(value => value <= 20).length;
const medianPlantSeconds = plantSeconds[Math.floor(plantSeconds.length / 2)] || 0;
const behaviors = starts.flatMap(event => event.behaviorTimeline || []);
const openingAssignments = starts.flatMap(event => event.ctOpeningAssignments || []);

assert(starts.length >= 16, `Beklenenden kısa maç: ${starts.length} raund.`);
assert(plants.length >= Math.floor(starts.length * 0.5), 'T plant temposu yeniden çöktü.');
assert(
  latePlants / Math.max(1, plants.length) <= 0.25,
  `Plantlar son 20 saniyeye yığıldı: ${latePlants}/${plants.length}`
);
assert(medianPlantSeconds >= 23, `Ortanca plant çok geç: ${medianPlantSeconds}s kaldı.`);
assert(
  ends.filter(event => event.reason === 'time-expired').length / starts.length <= 0.25,
  'Süre bitimi raundları tempo kabul sınırını aştı.'
);
assert.equal(openingAssignments.length, starts.length * 5);
assert(
  openingAssignments.every(assignment => assignment.durationMs > 0 && assignment.durationMs <= 2200),
  'CT rapor açılış rotalarından biri zamanında tamamlanmıyor.'
);
assert(behaviors.some(entry => entry.source === 'ct-opening-sprint'));
assert(behaviors.some(entry => entry.source === 't-opening-exit'));

console.log(JSON.stringify({
  rounds: starts.length,
  plants: plants.length,
  latePlants,
  medianPlantSeconds,
  timeExpired: ends.filter(event => event.reason === 'time-expired').length,
  maxCtOpeningMs: Math.max(...openingAssignments.map(item => item.durationMs))
}));
