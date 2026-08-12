// Exact Dust II walk graph generated from Awpy's parsed CS2 nav mesh.
// Runtime movement is restricted to connected nav-area centroids.

const graph = require('./data/dust2-nav.json');
const collision = require('./dust2-collision');

const nodes = new Map(graph.nodes.map(node => [node.id, node]));
const routeCache = new Map();
const spatialGrid = new Map();
const GRID_SIZE = 2;
const RADAR_WORLD_SCALE = graph.transform.width * graph.transform.scale / 100;
const MAX_STEEP_ASCENT_Z = 72;
const MAX_STEEP_ASCENT_RATIO = 1.05;
// Awpy keeps jump/boost connections beside normal walk links. These directed
// ascents cross the solid CT-spawn/A-platform ledge marked in the admin map
// report. Ordinary navigation cannot use them; a later boost action may opt
// into the documented endpoints explicitly.
const BOOST_ONLY_ASCENT_KEYS = new Set([
  '1546:1588',
  '1551:1588',
  '1560:1630',
  '1595:1630',
  '1442:1650',
  '1601:1650',
  '1603:1650',
  '1603:1652',
  '1603:1692',
  '1603:1698',
  '1606:1660',
  '1671:1755',
  '1731:1754',
  '1734:1754',
  '1734:1825',
  '1826:1763',
  '1836:1763',
  '1897:1763',
  '1902:1763',
  '1909:1763',
  '1787:1881',
  '1852:1881',
  '1912:1881',
  '1930:1881'
]);

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function gridKey(x, y) {
  return `${Math.floor(x / GRID_SIZE)}:${Math.floor(y / GRID_SIZE)}`;
}

for (const node of nodes.values()) {
  const xs = node.p.map(point => point[0]);
  const ys = node.p.map(point => point[1]);
  const minX = Math.floor(Math.min(...xs) / GRID_SIZE);
  const maxX = Math.floor(Math.max(...xs) / GRID_SIZE);
  const minY = Math.floor(Math.min(...ys) / GRID_SIZE);
  const maxY = Math.floor(Math.max(...ys) / GRID_SIZE);
  for (let gx = minX; gx <= maxX; gx += 1) {
    for (let gy = minY; gy <= maxY; gy += 1) {
      const key = `${gx}:${gy}`;
      if (!spatialGrid.has(key)) spatialGrid.set(key, []);
      spatialGrid.get(key).push(node);
    }
  }
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const xi = polygon[index][0];
    const yi = polygon[index][1];
    const xj = polygon[previous][0];
    const yj = polygon[previous][1];
    const intersects = ((yi > point.y) !== (yj > point.y))
      && point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function areasAt(point, zTolerance = 70) {
  const candidates = spatialGrid.get(gridKey(point.x, point.y)) || [];
  return candidates.filter(node => {
    if (Number.isFinite(point.z) && Math.abs(node.z - point.z) > zTolerance) return false;
    return pointInPolygon(point, node.p);
  });
}

function isWalkablePoint(point, zTolerance = 70) {
  return areasAt(point, zTolerance).length > 0;
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function traceLineOfSight(from, to, options = {}) {
  const maxDistance = Number(options.maxDistance) || 34;
  const totalDistance = distance(from, to);
  if (totalDistance > maxDistance) {
    return { visible: false, reason: 'range', distance: totalDistance, collisionMesh: true };
  }
  if (Math.abs((from.z || 0) - (to.z || 0)) > (options.maxVerticalDelta || 95)) {
    return { visible: false, reason: 'vertical', distance: totalDistance, collisionMesh: true };
  }

  for (const smoke of options.smokes || []) {
    if (distanceToSegment(smoke, from, to) <= (smoke.radius || 4.7)) {
      return { visible: false, reason: 'smoke', distance: totalDistance, collisionMesh: true };
    }
  }

  const collisionTrace = collision.traceRadarSegment(from, to, {
    fromZOffset: options.fromZOffset ?? 64,
    toZOffset: options.toZOffset ?? 60
  });
  if (collisionTrace.clear !== null) {
    return {
      visible: collisionTrace.clear,
      reason: collisionTrace.clear ? 'clear' : 'world',
      distance: totalDistance,
      collisionMesh: true,
      testedTriangles: collisionTrace.testedTriangles,
      triangleId: collisionTrace.triangleId
    };
  }

  // Development fallback for installations where the collision artifact is absent.
  const samples = Math.max(2, Math.ceil(totalDistance / 0.34));
  for (let index = 1; index < samples; index += 1) {
    const progress = index / samples;
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      z: (from.z || 0) + ((to.z || 0) - (from.z || 0)) * progress
    };
    if (!isWalkablePoint(point, 78)) {
      return { visible: false, reason: 'nav-fallback', distance: totalDistance, collisionMesh: false };
    }
  }
  return { visible: true, reason: 'clear', distance: totalDistance, collisionMesh: false };
}

function hasLineOfSight(from, to, options = {}) {
  return traceLineOfSight(from, to, options).visible;
}
const asNode = value => {
  if (!value) return null;
  if (typeof value === 'string') return nodes.get(graph.landmarks[value]?.id) || null;
  if (typeof value === 'number') return nodes.get(value) || null;
  if (value.id && nodes.has(value.id)) return nodes.get(value.id);
  // Hareket halindeki oyuncu zaten tek yetkili nav alanini tasir. Yalnizca
  // x/y/z merkezine gore yeniden tahmin yapmak Mid ve Tunnels gibi ust uste
  // binen katlarda oyuncuyu yanlis kata baglayabiliyordu.
  if (value.areaId && nodes.has(Number(value.areaId))) {
    return nodes.get(Number(value.areaId));
  }
  return nearestNode(value);
};

function nearestNode(point) {
  let best = null;
  let bestScore = Infinity;
  const desiredZ = Number.isFinite(point?.z) ? point.z : null;

  for (const node of nodes.values()) {
    const levelPenalty = desiredZ === null ? 0 : Math.abs(node.z - desiredZ) * 0.018;
    const score = distance(node, point) + levelPenalty;
    if (score < bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}

function reconstruct(cameFrom, currentId) {
  const path = [nodes.get(currentId)];
  while (cameFrom.has(currentId)) {
    currentId = cameFrom.get(currentId);
    path.unshift(nodes.get(currentId));
  }
  return path;
}

function canTraverseNavEdge(from, to) {
  if (!from || !to) return false;
  if (BOOST_ONLY_ASCENT_KEYS.has(`${from.id}:${to.id}`)) return false;
  const verticalRise = to.z - from.z;
  if (verticalRise <= MAX_STEEP_ASCENT_Z) return true;
  const horizontalWorldDistance = distance(from, to) * RADAR_WORLD_SCALE;
  const ascentRatio = verticalRise / Math.max(1, horizontalWorldDistance);

  // Source 2 nav connections can be one-way drops. The imported graph is
  // normalized for pathfinding, so reject only the impossible reverse climb:
  // a player may drop from the ledge, but cannot climb back through its wall.
  return ascentRatio <= MAX_STEEP_ASCENT_RATIO;
}

function findPath(from, to) {
  const start = asNode(from);
  const goal = asNode(to);
  if (!start || !goal) return [];
  if (start.id === goal.id) return [start];

  const key = `${start.id}:${goal.id}`;
  if (routeCache.has(key)) return routeCache.get(key);

  const open = new Set([start.id]);
  const cameFrom = new Map();
  const gScore = new Map([[start.id, 0]]);
  const fScore = new Map([[start.id, distance(start, goal)]]);

  while (open.size) {
    let currentId = null;
    let currentScore = Infinity;
    for (const id of open) {
      const score = fScore.get(id) ?? Infinity;
      if (score < currentScore) {
        currentId = id;
        currentScore = score;
      }
    }

    if (currentId === goal.id) {
      const result = reconstruct(cameFrom, currentId);
      routeCache.set(key, result);
      return result;
    }

    open.delete(currentId);
    const current = nodes.get(currentId);
    for (const neighborId of current.n) {
      const neighbor = nodes.get(neighborId);
      if (!neighbor) continue;
      if (!canTraverseNavEdge(current, neighbor)) continue;
      const verticalPenalty = Math.abs(neighbor.z - current.z) * 0.012;
      const tentative = (gScore.get(currentId) ?? Infinity)
        + distance(current, neighbor)
        + verticalPenalty;
      if (tentative >= (gScore.get(neighborId) ?? Infinity)) continue;
      cameFrom.set(neighborId, currentId);
      gScore.set(neighborId, tentative);
      fScore.set(neighborId, tentative + distance(neighbor, goal));
      open.add(neighborId);
    }
  }

  return [];
}

function routeThrough(keys) {
  const result = [];
  for (let index = 1; index < keys.length; index += 1) {
    // Never shift the cached canonical path in-place. Mutating it made the
    // same seeded match depend on which routes had been requested earlier.
    const segment = [...findPath(keys[index - 1], keys[index])];
    if (!segment.length) return [];
    if (result.length && result[result.length - 1].id === segment[0].id) segment.shift();
    result.push(...segment);
  }
  return result;
}

function playerLanePoint(node, laneIndex = 0, laneScale = 1) {
  const polygon = node.p || [];
  if (!polygon.length || laneIndex === 0) return { x: node.x, y: node.y, z: node.z, areaId: node.id };
  const corner = polygon[Math.abs(laneIndex) % polygon.length];
  const amount = (0.08 + (Math.abs(laneIndex) % 3) * 0.025) * laneScale;
  return {
    x: Number((node.x + (corner[0] - node.x) * amount).toFixed(3)),
    y: Number((node.y + (corner[1] - node.y) * amount).toFixed(3)),
    z: node.z,
    areaId: node.id
  };
}

function isRouteSegmentClear(from, to) {
  const previous = nodes.get(from.areaId);
  const next = nodes.get(to.areaId);
  const isConnected = previous
    && next
    && (previous.id === next.id || previous.n.includes(next.id));
  if (!isConnected) return false;
  if (!canTraverseNavEdge(previous, next)) return false;

  // Collision rays hit the solid faces beneath real stairs and ramps. A nav
  // edge with a sizeable height change is an explicit vertical connection;
  // flat movement still has to pass the Dust II wall-mesh check.
  if (Math.abs((to.z || 0) - (from.z || 0)) >= 48) return true;
  return collision.isMovementClear(from, to, 0.2) !== false;
}

function toTimedMotion(route, laneIndex = 0, durationMs = 9000) {
  if (!route.length) return [];
  const laneScales = laneIndex === 0 ? [0] : [1, 0.66, 0.33, 0];
  let points = route.map(node => playerLanePoint(node, laneIndex, 0));
  for (const laneScale of laneScales) {
    const candidate = route.map(node => playerLanePoint(node, laneIndex, laneScale));
    const clear = candidate.every((point, index) =>
      index === 0
      || isRouteSegmentClear(candidate[index - 1], point)
    );
    if (clear) {
      points = candidate;
      break;
    }
  }
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
  }
  const total = cumulative[cumulative.length - 1] || 1;
  return points.map((point, index) => ({
    ...point,
    t: Math.round(durationMs * cumulative[index] / total)
  }));
}

function validateMotion(points) {
  if (!Array.isArray(points) || !points.length) return false;
  for (let index = 0; index < points.length; index += 1) {
    const node = nodes.get(points[index].areaId);
    if (!node) return false;
    if (index === 0) continue;
    const previous = nodes.get(points[index - 1].areaId);
    if (!previous || (previous.id !== node.id && !previous.n.includes(node.id))) return false;
    if (!isRouteSegmentClear(points[index - 1], points[index])) return false;
  }
  return true;
}

module.exports = {
  graph,
  nearestNode,
  findPath,
  routeThrough,
  toTimedMotion,
  validateMotion,
  pointInPolygon,
  areasAt,
  isWalkablePoint,
  distanceToSegment,
  hasLineOfSight,
  traceLineOfSight,
  canTraverseNavEdge,
  BOOST_ONLY_ASCENT_KEYS,
  isMovementClear: collision.isMovementClear,
  collisionStats: collision.meshStats
};
