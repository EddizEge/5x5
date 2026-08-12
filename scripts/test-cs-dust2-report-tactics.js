const assert = require('assert');
const {
  AWP_SIGHTLINES,
  T_UTILITY_SETUPS,
  CT_OPENING_ROUTES,
  CT_UTILITY_SETUPS,
  T_POSTPLANT_POSITIONS,
  awpSightlineFor,
  utilitySetupsForPlan,
  postPlantPositionsFor
} = require('../server/simulation/cs-dust2-tactical-catalog');
const { evaluateUtilityDecision } = require('../server/simulation/cs-utility-decisions');
const { createDust2RoundDirector, DUST2 } = require('../server/simulation/shooter-ai');
const { graph, traceLineOfSight } = require('../server/simulation/dust2-navigation');

assert.equal(AWP_SIGHTLINES.length, 5);
assert.equal(T_UTILITY_SETUPS.length, 12);
assert.equal(CT_OPENING_ROUTES.length, 8);
assert.equal(CT_UTILITY_SETUPS.length, 4);
assert.equal(T_POSTPLANT_POSITIONS.A.length, 7);
assert.equal(T_POSTPLANT_POSITIONS.B.length, 8);
assert.equal(awpSightlineFor({ side: 'CT', plan: 'long' }).id, 'a-backsite-long');
assert.equal(awpSightlineFor({ side: 'T', plan: 'long' }).id, 't-pit-long-site');
assert.equal(awpSightlineFor({ side: 'CT', plan: 'b' }).id, 'b-backsite-tunnels');
assert(AWP_SIGHTLINES.some(line => line.id === 'long-car-ramp-cross'));
assert(utilitySetupsForPlan('midB').some(setup => setup.id === 'mid-to-b-ct-smoke'));
assert(utilitySetupsForPlan('short').some(setup => setup.id === 'mid-cross-smoke'));
assert(utilitySetupsForPlan('b').some(setup => setup.id === 'b-door-smoke'));
assert(utilitySetupsForPlan('long').some(setup => setup.id === 'a-ramp-popflash'));
assert.deepEqual(postPlantPositionsFor('A').map(position => position.anchorAreaId), [1985, 1792, 1758, 1886, 1956, 730, 1040]);
assert.deepEqual(postPlantPositionsFor('B').map(position => position.anchorAreaId), [2218, 1524, 2099, 2070, 1751, 1499, 1950, 2062]);
for (const sightline of AWP_SIGHTLINES) {
  const trace = traceLineOfSight(sightline.anchor, sightline.watch, {
    maxDistance: 52,
    maxVerticalDelta: sightline.maxVerticalDelta || 150
  });
  assert.equal(trace.visible, true, `${sightline.id} collision mesh tarafından kapanıyor.`);
}
const navById = new Map(graph.nodes.map(node => [node.id, node]));
for (const position of [...T_POSTPLANT_POSITIONS.A, ...T_POSTPLANT_POSITIONS.B]) {
  const trace = traceLineOfSight(
    navById.get(position.anchorAreaId),
    navById.get(position.watchAreaId),
    { maxDistance: 52, maxVerticalDelta: 300 }
  );
  assert.equal(trace.visible, true, `${position.id} post-plant bakış yönü duvar içinde.`);
}

const baseContext = {
  phase: 'regulation',
  ownerDistance: 58,
  alliesNearTarget: 0,
  alliesApproaching: 0,
  knownEnemiesNearTarget: 0,
  visibleEnemies: 0,
  soundOrCallIntel: 0,
  fakeIntel: 0,
  bestIntelConfidence: 0,
  bestIntelTarget: null,
  friendlyFlashRisk: 0,
  teamUtilityRemaining: 8,
  postPlantDecision: null,
  lastTeamUtility: null,
  attackerTeamId: 1,
  defenderTeamId: 2,
  plantPosition: null
};
const owner = { id: 't-support', alive: true, teamId: 1 };
const ctOwner = { id: 'ct-support', alive: true, teamId: 2 };

const opening = evaluateUtilityDecision({
  utility: {
    type: 'smoke',
    purpose: 'reported-mid-cross-smoke',
    reportSetupId: 'mid-cross-smoke',
    tacticalTiming: 'opening',
    earliestTick: 8,
    latestTick: 72,
    maxOwnerDistance: 75
  },
  owner,
  tick: 8,
  context: baseContext
});
assert.equal(opening.action, 'deploy');
assert.equal(opening.reasonCode, 'reported-opening-lineup');

const waitingPostPlant = evaluateUtilityDecision({
  utility: {
    type: 'flash',
    purpose: 'reported-postplant-flash',
    reportSetupId: 'b-postplant-window-flash',
    tacticalTiming: 'postplant',
    earliestTick: 120,
    latestTick: 360,
    maxOwnerDistance: 44
  },
  owner,
  tick: 130,
  context: { ...baseContext, ownerDistance: 18 }
});
assert.equal(waitingPostPlant.action, 'hold');
assert.equal(waitingPostPlant.reasonCode, 'reported-timing-window');

const postPlant = evaluateUtilityDecision({
  utility: {
    type: 'flash',
    purpose: 'reported-postplant-flash',
    reportSetupId: 'b-postplant-window-flash',
    tacticalTiming: 'postplant',
    earliestTick: 120,
    latestTick: 360,
    maxOwnerDistance: 44
  },
  owner,
  tick: 160,
  context: {
    ...baseContext,
    phase: 'postplant',
    ownerDistance: 18,
    alliesNearTarget: 2,
    plantPosition: { x: 20, y: 12, z: 9 }
  }
});
assert.equal(postPlant.action, 'deploy');
assert.equal(postPlant.reasonCode, 'reported-postplant-lineup');

const ctOpening = evaluateUtilityDecision({
  utility: {
    type: 'incendiary',
    purpose: 'reported-ct-long-opening-delay',
    reportSetupId: 'ct-long-opening-fire',
    tacticalTiming: 'opening',
    earliestTick: 18,
    latestTick: 92,
    maxOwnerDistance: 34
  },
  owner: ctOwner,
  tick: 18,
  context: { ...baseContext, ownerDistance: 12 }
});
assert.equal(ctOpening.action, 'deploy');
assert.equal(ctOpening.reasonCode, 'reported-ct-opening');

const characters = Array.from({ length: 5 }, (_, index) => ({
  name: `P${index + 1}`,
  rating_cs: 90 - index
}));
function loadouts(side) {
  const rifle = side === 'T' ? 'AK-47' : 'M4A1-S';
  return Array.from({ length: 5 }, (_, index) => ({
    weapon: index === 0 ? 'AWP' : rifle,
    armor: 100,
    helmet: true,
    hasDefuseKit: side === 'CT',
    utility: ['smoke', 'flash', 'flash', 'he', side === 'T' ? 'molotov' : 'incendiary'],
    buyType: 'full',
    money: 0,
    equipmentValue: 5000,
    rolePreference: index === 0 ? 'awp' : index === 2 ? 'support' : 'entry'
  }));
}
let rngCalls = 0;
const director = createDust2RoundDirector({
  team1: characters,
  team2: characters,
  round: 2,
  team1Attacker: true,
  isPistol: false,
  getRating: character => character.rating_cs,
  rng: () => rngCalls++ === 0 ? 0.1 : 0.42,
  loadouts: { 1: loadouts('T'), 2: loadouts('CT') },
  includeDebugTelemetry: true
});
assert.equal(director.plan, 'long');
assert(director.players.some(player => player.awpSightlineId === 't-pit-long-site'));
assert(director.players.some(player => player.awpSightlineId === 'a-backsite-long'));
assert.equal(director.ctOpeningAssignments.length, 5);
assert.equal(new Set(director.ctOpeningAssignments.map(item => item.playerId)).size, 5);
assert(director.ctOpeningAssignments.some(item => item.routeId === 'ct-long-pick'));
assert(director.ctOpeningAssignments.some(item => item.routeId === 'ct-short-hold'));
assert(director.ctOpeningAssignments.some(item => item.routeId === 'ct-b-anchor'));
assert(director.ctOpeningAssignments.some(item => item.routeId === 'ct-mid-hold'));
assert(director.utility.some(utility => utility.reportSetupId === 'a-ramp-ct-smoke'));
assert(director.utility.some(utility => utility.reportSetupId === 'a-ramp-popflash'));
assert(director.utility.some(utility => utility.reportSetupId === 'ct-long-opening-fire'));
for (const player of director.players.filter(candidate => candidate.awpSightlineId)) {
  const motion = director.motionPlans.get(player.id);
  assert(motion?.length > 1);
  assert.equal(motion.at(-1).areaId, AWP_SIGHTLINES
    .find(line => line.id === player.awpSightlineId).anchorAreaId);
}

director.world.tick = 70;
director.bombCarrier.position = { ...DUST2.aSite, areaId: DUST2.aSite.id };
for (const player of director.players.filter(candidate =>
  candidate.teamId === director.attackerTeamId && candidate !== director.bombCarrier
)) {
  player.position = { ...DUST2.tSpawn, areaId: DUST2.tSpawn.id };
  player.behaviorLockUntilTick = 0;
}
assert.equal(director.ensurePlantSupport(), true);
assert(director.players.some(player => player.roundTask === 'escort-planter'));

director.plantedSite = 'A';
director.plantPosition = DUST2.aSite;
director.world.setRoundPhase('postplant', { plantPosition: DUST2.aSite });
const postPlantAssignments = director.assignPostPlantSetup();
assert.equal(new Set(postPlantAssignments.map(item => item.positionId)).size, postPlantAssignments.length);
assert(postPlantAssignments.every(item => T_POSTPLANT_POSITIONS.A.some(position => position.id === item.positionId)));
assert(postPlantAssignments.every(item =>
  !T_POSTPLANT_POSITIONS.A.find(position => position.id === item.positionId)?.awpOnly
  || ['AWP', 'SSG 08'].includes(item.player.weapon)
));

const livingDefenders = director.players.filter(player => player.teamId === director.defenderTeamId);
livingDefenders.slice(1).forEach(player => { player.alive = false; });
const lastDefender = livingDefenders[0];
lastDefender.position = { ...DUST2.aSite, areaId: DUST2.aSite.id };
const livingAttackers = director.players.filter(player => player.teamId === director.attackerTeamId);
livingAttackers[0].position = { ...DUST2.aSite, areaId: DUST2.aSite.id };
for (const player of livingAttackers.slice(1)) {
  player.position = { ...DUST2.tSpawn, areaId: DUST2.tSpawn.id };
  player.behaviorLockUntilTick = 0;
}
director.world.tick = 70;
director.world.rememberPosition(
  livingAttackers[0],
  lastDefender,
  'vision',
  0.94,
  lastDefender.position,
  { maxAgeTicks: 80 }
);
assert.equal(director.coordinatePostPlantAttackers(), true);
assert(director.postPlantCoordinationTimeline.at(-1).recalledIds.length >= 1);
assert(livingAttackers.slice(1).some(player => player.roundTask === 'postplant-recall-last-ct'));

console.log(JSON.stringify({
  awpSightlines: AWP_SIGHTLINES.map(line => line.id),
  utilitySetups: T_UTILITY_SETUPS.map(setup => setup.id),
  timing: {
    opening: opening.reasonCode,
    waitingPostPlant: waitingPostPlant.reasonCode,
    postPlant: postPlant.reasonCode,
    ctOpening: ctOpening.reasonCode
  },
  routedAwps: director.players
    .filter(player => player.awpSightlineId)
    .map(player => player.awpSightlineId),
  postPlantPositions: postPlantAssignments.map(item => item.positionId),
  recalled: director.postPlantCoordinationTimeline.at(-1).recalledIds
}));
