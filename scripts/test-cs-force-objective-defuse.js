const assert = require('node:assert/strict');
const { createDust2RoundDirector } = require('../server/simulation/shooter-ai');
const { ShooterWorld } = require('../server/simulation/shooter-world');
const { evaluatePlantOpportunity } = require('../server/simulation/cs-round-decisions');
const { createSeededRng } = require('../server/simulation/seeded-rng');

function team(prefix) {
  return Array.from({ length: 5 }, (_, index) => ({
    name: `${prefix}-${index + 1}`,
    avatar_emoji: '🎯',
    rating_cs: 76 + index
  }));
}

function loadout(buyType, side) {
  return Array.from({ length: 5 }, () => ({
    buyType,
    weapon: side === 'T' ? 'Glock-18' : 'USP-S',
    armor: 0,
    helmet: false,
    hasDefuseKit: false,
    utility: []
  }));
}

const planter = {
  alive: true,
  hasBomb: true,
  position: { x: 0, y: 0 }
};
const earlyMustAttempt = evaluatePlantOpportunity({
  planter,
  attackers: [planter],
  defenders: [],
  plantPosition: { x: 0, y: 0 },
  roundProgress: 0.22,
  mustAttempt: true,
  hasLineOfSight: () => false
});
assert.equal(earlyMustAttempt.allowed, true);
assert.equal(earlyMustAttempt.reason, 'must-attempt-site-secured');

const stats = {
  rounds: 0,
  plants: 0,
  passiveTimeouts: 0,
  regulationRetreats: 0,
  modes: { pistol: 0, eco: 0 }
};

for (const mode of ['pistol', 'eco']) {
  for (let index = 0; index < 30; index += 1) {
    const team1Attacker = index % 2 === 0;
    const loadouts = {
      1: loadout(mode, team1Attacker ? 'T' : 'CT'),
      2: loadout(mode, team1Attacker ? 'CT' : 'T')
    };
    const director = createDust2RoundDirector({
      team1: team('Mavi'),
      team2: team('Kirmizi'),
      round: mode === 'pistol' ? 1 : 3,
      team1Attacker,
      isPistol: mode === 'pistol',
      getRating: character => character.rating_cs,
      rng: createSeededRng(`force-objective-${mode}-${index}`),
      loadouts,
      includeDebugTelemetry: true
    });
    assert.equal(director.world.roundPhase.forceObjectiveTempo, true);
    const result = director.simulateRound();
    const planted = result.events.some(event => event.kind === 'plant');
    stats.rounds += 1;
    stats.plants += planted ? 1 : 0;
    stats.modes[mode] += planted ? 1 : 0;
    stats.regulationRetreats += director.world.behaviorTimeline.filter(event =>
      event.state === 'retreat'
      && event.tick < (director.bombPlantTick ?? director.world.maxTick)
      && director.players.find(player => player.id === event.id)?.teamId === director.attackerTeamId
    ).length;
    if (
      result.reason === 'time-expired'
      && director.bombCarrier?.alive
      && director.bombCarrier.hasBomb
    ) {
      stats.passiveTimeouts += 1;
    }
  }
}

assert.equal(stats.passiveTimeouts, 0, 'Pistol/eko roundunda yaşayan C4 taşıyıcısı objective denemeden süre tüketti.');
assert.equal(stats.regulationRetreats, 0, 'Must-attempt roundunda T oyuncusu objective yerine save/retreat yaptı.');
assert(stats.modes.pistol >= 24, `Pistol plant denemesi düşük: ${stats.modes.pistol}/30`);
assert(stats.modes.eco >= 24, `Eko plant denemesi düşük: ${stats.modes.eco}/30`);

const defuseDirector = createDust2RoundDirector({
  team1: team('T'),
  team2: team('CT'),
  round: 5,
  team1Attacker: true,
  isPistol: false,
  getRating: character => character.rating_cs,
  rng: createSeededRng('active-defuse-contest'),
  includeDebugTelemetry: true
});
const defuser = defuseDirector.alivePlayers(defuseDirector.defenderTeamId)[0];
const directThreat = defuseDirector.alivePlayers(defuseDirector.attackerTeamId)[0];
defuseDirector.plantPosition = { ...defuseDirector.plantTarget() };
defuseDirector.plantedSite = defuseDirector.plan === 'b' || defuseDirector.plan === 'midB' ? 'B' : 'A';
defuseDirector.postPlantDecision = {
  decision: 'retake',
  actor: defuser,
  metrics: { fakeDefusePlanned: false }
};
defuseDirector.bombPlantTick = defuseDirector.world.tick;
defuseDirector.bombDeadlineTick = defuseDirector.world.tick + 200;
defuser.position = { ...defuseDirector.plantPosition };
directThreat.position = {
  ...defuseDirector.plantPosition,
  x: defuseDirector.plantPosition.x + 6
};
const originalTrace = defuseDirector.world.traceForPair.bind(defuseDirector.world);
defuseDirector.world.traceForPair = (observer, target) => (
  observer === directThreat && target === defuser
    ? { visible: true, collisionMesh: true }
    : originalTrace(observer, target)
);
assert.equal(
  defuseDirector.defuseEligibility(defuser),
  false,
  'Açık görüşteki T oyuncusunun önünde defuse başlatıldı.'
);

defuseDirector.defuseEligibility = () => true;
defuseDirector.world.emitSound = () => ({
  heardBy: [{ id: directThreat.id }],
  directHearers: 1
});
const attemptVisual = defuseDirector.startDefuseAttempt(defuser);
assert(attemptVisual, 'Defuse test denemesi başlamadı.');
assert.equal(
  defuseDirector.defuseAttempt.reactingAttackers.length,
  defuseDirector.alivePlayers(defuseDirector.attackerTeamId).length,
  'Defuse bilgisi yaşayan T takımının tamamına yayılmadı.'
);
assert(
  defuseDirector.alivePlayers(defuseDirector.attackerTeamId)
    .every(player => player.roundTask === 'stop-active-defuse'),
  'T oyuncuları aktif defuse durdurma görevine geçmedi.'
);
defuseDirector.activeDefuseThreats = () => [directThreat];
defuseDirector.world.tick = defuseDirector.defuseAttempt.endTick;
const interrupted = defuseDirector.resolveDefuseTimer();
assert.equal(interrupted.contested, true);
assert.equal(defuseDirector.defuseAttempt, null);

const collisionPlayers = [
  { id: 't', teamId: 1, side: 'T', char: 'T', name: 'T', alive: true, rating: 80, health: 100, armor: 0, weapon: 'Glock-18', utility: [], position: { x: 0.2, y: 0, z: 0, areaId: 1 } },
  { id: 'ct', teamId: 2, side: 'CT', char: 'CT', name: 'CT', alive: true, rating: 80, health: 100, armor: 0, weapon: 'USP-S', utility: [], position: { x: -0.2, y: 0, z: 0, areaId: 1 } }
];
const collisionWorld = new ShooterWorld({
  players: collisionPlayers,
  motionPlans: new Map(collisionPlayers.map(player => [player.id, [{ t: 0, ...player.position }]])),
  rng: createSeededRng('enemy-collision')
});
collisionPlayers[0].lastPosition = { x: -1, y: 0, z: 0, areaId: 1 };
collisionPlayers[1].lastPosition = { x: 1, y: 0, z: 0, areaId: 1 };
collisionWorld.resolvePlayerSeparation();
assert(
  Math.hypot(
    collisionPlayers[0].position.x - collisionPlayers[1].position.x,
    collisionPlayers[0].position.y - collisionPlayers[1].position.y
  ) >= collisionPlayers[0].radius + collisionPlayers[1].radius,
  'Rakip oyuncular birbirinin içinden geçti.'
);

collisionPlayers[0].position = { x: 0.2, y: 0, z: -120, areaId: 1 };
collisionPlayers[1].position = { x: -0.2, y: 0, z: 120, areaId: 2 };
collisionPlayers[0].lastPosition = { ...collisionPlayers[0].position };
collisionPlayers[1].lastPosition = { ...collisionPlayers[1].position };
collisionWorld.resolvePlayerSeparation();
assert.equal(collisionPlayers[0].position.x, 0.2);
assert.equal(collisionPlayers[1].position.x, -0.2);

console.log(JSON.stringify({
  ...stats,
  sharedDefuseReactors: attemptVisual.reactingAttackers.length,
  activeDefuseInterrupted: interrupted.contested,
  enemyCollisionBlocked: true
}));
