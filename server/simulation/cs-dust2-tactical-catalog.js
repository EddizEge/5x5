// Report-authored Dust II tactical knowledge.
// Coordinates are normalized radar positions from the admin map reports:
// "awp kesim noktaları.json", "t bombalar.json",
// "t tarafı rotalar ve pusma noktaları .json" and
// "ct hızlı round başı dağılım ve bazı bombalar.json" (30-31 July 2026).

const freezePoint = point => Object.freeze({
  x: Number(point.x),
  y: Number(point.y),
  z: Number(point.z || 0)
});

const AWP_SIGHTLINES = Object.freeze([
  Object.freeze({
    id: 't-pit-long-site',
    side: 'T',
    plans: Object.freeze(['long']),
    anchorAreaId: 670,
    watchAreaId: 867,
    anchor: freezePoint({ x: 87.342, y: 62.842, z: -134.5 }),
    watch: freezePoint({ x: 89.178, y: 54.554, z: -8.7 }),
    fallback: 'longDoors',
    label: 'Pit–Long kesimi (site için Long pozisyonuna geçiş)'
  }),
  Object.freeze({
    id: 'b-backsite-tunnels',
    side: 'CT',
    plans: Object.freeze(['b', 'midB']),
    anchorAreaId: 2215,
    watchAreaId: 1522,
    anchor: freezePoint({ x: 10.948, y: 6.831, z: 35 }),
    watch: freezePoint({ x: 10.948, y: 43.128, z: 32.7 }),
    fallback: 'bSite',
    label: 'B tünel kesimi'
  }),
  Object.freeze({
    id: 'a-backsite-long',
    side: 'CT',
    plans: Object.freeze(['long']),
    anchorAreaId: 2148,
    watchAreaId: 724,
    anchor: freezePoint({ x: 85.011, y: 7.272, z: 124 }),
    watch: freezePoint({ x: 84.129, y: 54.737, z: -8 }),
    fallback: 'aSite',
    label: 'A arka alan Long kesimi'
  }),
  Object.freeze({
    id: 'ct-lower-long-cross',
    side: 'CT',
    plans: Object.freeze(['short']),
    anchorAreaId: 1283,
    watchAreaId: 1807,
    anchor: freezePoint({ x: 49.302, y: 24.906, z: -124 }),
    watch: freezePoint({ x: 91.036, y: 24.024, z: 0 }),
    fallback: 'ctSpawn',
    label: 'CT alt koridor kesimi'
  }),
  Object.freeze({
    id: 'long-car-ramp-cross',
    side: 'T',
    plans: Object.freeze(['long']),
    anchorAreaId: 1758,
    watchAreaId: 1236,
    anchor: freezePoint({ x: 94.857, y: 26.081, z: 6 }),
    watch: freezePoint({ x: 51.653, y: 24.906, z: -123 }),
    fallback: 'longCorner',
    label: 'Long araba–A rampa kesimi'
  })
]);

const T_UTILITY_SETUPS = Object.freeze([
  Object.freeze({
    id: 'mid-to-b-ct-smoke',
    plans: Object.freeze(['midB']),
    type: 'smoke',
    target: freezePoint({ x: 51.288, y: 24.58, z: -125 }),
    callout: 'ct-mid-b-cross',
    purpose: 'reported-mid-to-b-ct-smoke',
    timing: 'opening',
    earliestTick: 10,
    latestTick: 92,
    maxOwnerDistance: 70
  }),
  Object.freeze({
    id: 'mid-cross-smoke',
    plans: Object.freeze(['short', 'midB']),
    type: 'smoke',
    target: freezePoint({ x: 47.272, y: 39.332, z: -96 }),
    callout: 'mid-cross',
    purpose: 'reported-mid-cross-smoke',
    timing: 'opening',
    earliestTick: 8,
    latestTick: 72,
    maxOwnerDistance: 75
  }),
  Object.freeze({
    id: 'a-ramp-ct-smoke',
    plans: Object.freeze(['long']),
    type: 'smoke',
    target: freezePoint({ x: 83.774, y: 24.123, z: 18 }),
    callout: 'a-ramp-ct',
    purpose: 'reported-a-ramp-smoke',
    timing: 'execute',
    earliestTick: 42,
    latestTick: 165,
    maxOwnerDistance: 42
  }),
  Object.freeze({
    id: 'b-door-smoke',
    plans: Object.freeze(['b', 'midB']),
    type: 'smoke',
    target: freezePoint({ x: 24.745, y: 23.286, z: 12 }),
    callout: 'b-doors',
    purpose: 'reported-b-door-smoke',
    timing: 'execute',
    earliestTick: 42,
    latestTick: 175,
    maxOwnerDistance: 42
  }),
  Object.freeze({
    id: 'a-short-denial',
    plans: Object.freeze(['long', 'short']),
    type: 'smoke',
    fallbackTypes: Object.freeze(['molotov']),
    target: freezePoint({ x: 63.893, y: 27.769, z: 101 }),
    callout: 'a-short',
    purpose: 'reported-short-denial',
    timing: 'postplant',
    earliestTick: 120,
    latestTick: 360,
    maxOwnerDistance: 38
  }),
  Object.freeze({
    id: 'a-site-fire-clear',
    plans: Object.freeze(['long', 'short']),
    type: 'molotov',
    target: freezePoint({ x: 72.52, y: 12.121, z: 100 }),
    callout: 'a-site-left',
    purpose: 'reported-site-clear',
    selectionGroup: 'a-site-damage',
    timing: 'execute',
    earliestTick: 58,
    latestTick: 190,
    maxOwnerDistance: 42
  }),
  Object.freeze({
    id: 'a-site-he-clear',
    plans: Object.freeze(['long', 'short']),
    type: 'he',
    target: freezePoint({ x: 79.28, y: 14.619, z: 100 }),
    callout: 'a-site-platform',
    purpose: 'reported-site-damage',
    selectionGroup: 'a-site-damage',
    timing: 'execute',
    earliestTick: 54,
    latestTick: 185,
    maxOwnerDistance: 42
  }),
  Object.freeze({
    id: 'long-entry-flash',
    plans: Object.freeze(['long']),
    type: 'flash',
    target: freezePoint({ x: 78.251, y: 61.497, z: 4 }),
    callout: 'long-doors-exit',
    purpose: 'reported-entry-flash',
    timing: 'execute',
    earliestTick: 24,
    latestTick: 150,
    maxOwnerDistance: 48
  }),
  Object.freeze({
    id: 'b-entry-flash',
    plans: Object.freeze(['b', 'midB']),
    type: 'flash',
    target: freezePoint({ x: 14.769, y: 30.637, z: 34 }),
    callout: 'b-site-entry',
    purpose: 'reported-entry-flash',
    timing: 'execute',
    earliestTick: 34,
    latestTick: 170,
    maxOwnerDistance: 42
  }),
  Object.freeze({
    id: 'b-postplant-window-flash',
    plans: Object.freeze(['b', 'midB']),
    type: 'flash',
    target: freezePoint({ x: 28.435, y: 18.44, z: 10 }),
    callout: 'b-window-doors',
    purpose: 'reported-postplant-flash',
    timing: 'postplant',
    earliestTick: 120,
    latestTick: 360,
    maxOwnerDistance: 44
  }),
  Object.freeze({
    id: 'a-ramp-popflash',
    plans: Object.freeze(['long']),
    type: 'flash',
    target: freezePoint({ x: 89.273, y: 14.178, z: 130 }),
    callout: 'a-site-ramp-pop',
    purpose: 'reported-entry-flash',
    timing: 'execute',
    earliestTick: 58,
    latestTick: 188,
    maxOwnerDistance: 48
  }),
  Object.freeze({
    id: 'a-short-popflash',
    plans: Object.freeze(['short']),
    type: 'flash',
    target: freezePoint({ x: 69.581, y: 23.583, z: 130 }),
    callout: 'a-site-short-pop',
    purpose: 'reported-entry-flash',
    timing: 'execute',
    earliestTick: 52,
    latestTick: 185,
    maxOwnerDistance: 42
  })
]);

const CT_OPENING_ROUTES = Object.freeze([
  Object.freeze({ id: 'ct-long-pick', endpointAreaId: 708, lane: 'long', task: 'opening-long-pick' }),
  Object.freeze({ id: 'ct-short-hold', endpointAreaId: 788, lane: 'short', task: 'opening-short-hold' }),
  Object.freeze({ id: 'ct-b-anchor', endpointAreaId: 1655, lane: 'b', task: 'opening-b-anchor' }),
  Object.freeze({ id: 'ct-mid-hold', endpointAreaId: 1077, lane: 'mid', task: 'opening-mid-hold' }),
  Object.freeze({ id: 'ct-long-car', endpointAreaId: 1685, lane: 'long', task: 'opening-long-car' }),
  Object.freeze({ id: 'ct-a-site-anchor', endpointAreaId: 1936, lane: 'a', task: 'opening-a-site-anchor' }),
  Object.freeze({ id: 'ct-b-window', endpointAreaId: 2052, lane: 'b', task: 'opening-b-window' }),
  Object.freeze({
    id: 'ct-lower-rush',
    endpointAreaId: 812,
    lane: 'lower',
    task: 'opening-lower-rush',
    conditional: 'smg-or-eco'
  })
]);

const CT_UTILITY_SETUPS = Object.freeze([
  Object.freeze({
    id: 'ct-long-opening-fire',
    ownerOpeningIds: Object.freeze(['ct-long-pick', 'ct-long-car']),
    type: 'incendiary',
    fallbackTypes: Object.freeze(['he']),
    target: freezePoint({ x: 69.315, y: 55.116, z: 2 }),
    callout: 'long-rush-delay',
    purpose: 'reported-ct-long-opening-delay',
    timing: 'opening',
    earliestTick: 18,
    latestTick: 92,
    maxOwnerDistance: 34
  }),
  Object.freeze({
    id: 'ct-b-sound-delay',
    ownerOpeningIds: Object.freeze(['ct-b-anchor', 'ct-b-window']),
    type: 'incendiary',
    fallbackTypes: Object.freeze(['smoke', 'he']),
    target: freezePoint({ x: 11.37, y: 34.698, z: 31.3 }),
    callout: 'b-tunnel-rush',
    purpose: 'reported-ct-b-sound-delay',
    timing: 'contact',
    earliestTick: 24,
    latestTick: 190,
    maxOwnerDistance: 36
  }),
  Object.freeze({
    id: 'ct-b-retake-flash',
    ownerOpeningIds: Object.freeze(['ct-b-anchor', 'ct-b-window', 'ct-mid-hold']),
    type: 'flash',
    target: freezePoint({ x: 22.04, y: 18.142, z: 4.7 }),
    callout: 'b-site-retake',
    purpose: 'reported-ct-b-retake-flash',
    timing: 'retake',
    earliestTick: 120,
    latestTick: 390,
    maxOwnerDistance: 42
  }),
  Object.freeze({
    id: 'ct-long-support-flash',
    ownerOpeningIds: Object.freeze(['ct-long-car', 'ct-long-pick']),
    type: 'flash',
    target: freezePoint({ x: 89.917, y: 48.678, z: 1.3 }),
    callout: 'long-pick-support',
    purpose: 'reported-ct-long-support-flash',
    timing: 'contact',
    earliestTick: 22,
    latestTick: 160,
    maxOwnerDistance: 32,
    requiresTwoLong: true
  })
]);

const T_POSTPLANT_POSITIONS = Object.freeze({
  A: Object.freeze([
    Object.freeze({ id: 'a-backsite', role: 'site-anchor', lane: 'site', anchorAreaId: 1985, watchAreaId: 1660, pairId: 'a-short' }),
    Object.freeze({ id: 'a-default', role: 'site-crossfire', lane: 'site', anchorAreaId: 1792, watchAreaId: 1665, pairId: 'a-ct' }),
    Object.freeze({ id: 'a-long-car', role: 'long-crossfire', lane: 'long', anchorAreaId: 1758, watchAreaId: 1430, pairId: 'a-long' }),
    Object.freeze({ id: 'a-short', role: 'short-crossfire', lane: 'short', anchorAreaId: 1886, watchAreaId: 1288, pairId: 'a-short' }),
    Object.freeze({ id: 'a-ramp', role: 'ramp-crossfire', lane: 'ramp', anchorAreaId: 1956, watchAreaId: 1783, pairId: 'a-ct' }),
    Object.freeze({ id: 'a-pit-awp', role: 'awp-pit', lane: 'long', anchorAreaId: 730, watchAreaId: 867, pairId: 'a-awp', awpOnly: true }),
    Object.freeze({ id: 'a-long-awp', role: 'awp-long', lane: 'long', anchorAreaId: 1040, watchAreaId: 1069, pairId: 'a-awp', awpOnly: true })
  ]),
  B: Object.freeze([
    Object.freeze({ id: 'b-backsite', role: 'site-anchor', lane: 'site', anchorAreaId: 2218, watchAreaId: 2116, pairId: 'b-tunnels' }),
    Object.freeze({ id: 'b-tunnel-cross', role: 'tunnel-crossfire', lane: 'tunnels', anchorAreaId: 1524, watchAreaId: 1425, pairId: 'b-tunnels' }),
    Object.freeze({ id: 'b-window', role: 'window-crossfire', lane: 'window', anchorAreaId: 2099, watchAreaId: 2029, pairId: 'b-doors' }),
    Object.freeze({ id: 'b-site-anchor', role: 'site-crossfire', lane: 'site', anchorAreaId: 2070, watchAreaId: 1625, pairId: 'b-doors' }),
    Object.freeze({ id: 'b-tunnel-deep', role: 'tunnel-support', lane: 'tunnels', anchorAreaId: 1751, watchAreaId: 1776, pairId: 'b-tunnels' }),
    Object.freeze({ id: 'b-doors', role: 'door-crossfire', lane: 'doors', anchorAreaId: 1499, watchAreaId: 1491, pairId: 'b-doors' }),
    Object.freeze({ id: 'b-platform', role: 'platform-crossfire', lane: 'site', anchorAreaId: 1950, watchAreaId: 1632, pairId: 'b-site' }),
    Object.freeze({ id: 'b-default', role: 'site-support', lane: 'site', anchorAreaId: 2062, watchAreaId: 2014, pairId: 'b-site' })
  ])
});

const T_NO_HOLD_ZONES = Object.freeze([
  Object.freeze({
    id: 'long-doors-transit',
    plans: Object.freeze(['long']),
    minX: 76.3,
    maxX: 84.2,
    minY: 56.5,
    maxY: 67.6
  })
]);

function awpSightlineFor({ side, plan }) {
  return AWP_SIGHTLINES.find(line =>
    line.side === side && line.plans.includes(plan)
  ) || null;
}

function utilitySetupsForPlan(plan) {
  return T_UTILITY_SETUPS.filter(setup => setup.plans.includes(plan));
}

function ctOpeningRoute(id) {
  return CT_OPENING_ROUTES.find(route => route.id === id) || null;
}

function ctUtilitySetups({ twoLong = false } = {}) {
  return CT_UTILITY_SETUPS.filter(setup => !setup.requiresTwoLong || twoLong);
}

function postPlantPositionsFor(site) {
  return [...(T_POSTPLANT_POSITIONS[site] || [])];
}

module.exports = {
  AWP_SIGHTLINES,
  T_UTILITY_SETUPS,
  CT_OPENING_ROUTES,
  CT_UTILITY_SETUPS,
  T_POSTPLANT_POSITIONS,
  T_NO_HOLD_ZONES,
  awpSightlineFor,
  utilitySetupsForPlan,
  ctOpeningRoute,
  ctUtilitySetups,
  postPlantPositionsFor
};
