const fs = require('fs');
const path = require('path');

const graph = require('./data/dust2-nav.json');

const TRIANGLE_BYTES = 36;
const CELL_SIZE = 256;
const RADAR_WORLD_SCALE = graph.transform.width * graph.transform.scale / 100;
const collisionPath = path.join(__dirname, 'data', 'de_dust2.tri');

let meshBuffer = null;
let meshFloats = null;
let triangleBounds = null;
let triangleVisitStamps = null;
let queryStamp = 0;
let triangleCount = 0;
let spatialIndex = null;

const keyForCell = (x, y, z) => `${x}:${y}:${z}`;

function radarToWorld(point, zOffset = 0) {
  return {
    x: point.x * RADAR_WORLD_SCALE + graph.transform.posX,
    y: graph.transform.posY - point.y * RADAR_WORLD_SCALE,
    z: (Number(point.z) || 0) + zOffset
  };
}

function ensureMesh() {
  if (spatialIndex) return true;
  if (!fs.existsSync(collisionPath)) return false;

  meshBuffer = fs.readFileSync(collisionPath);
  if (meshBuffer.length % TRIANGLE_BYTES !== 0) {
    throw new Error('Invalid Dust II collision mesh length.');
  }

  triangleCount = meshBuffer.length / TRIANGLE_BYTES;
  meshFloats = new Float32Array(
    meshBuffer.buffer,
    meshBuffer.byteOffset,
    meshBuffer.length / Float32Array.BYTES_PER_ELEMENT
  );
  triangleBounds = new Float32Array(triangleCount * 6);
  triangleVisitStamps = new Uint32Array(triangleCount);
  spatialIndex = new Map();

  for (let triangleId = 0; triangleId < triangleCount; triangleId += 1) {
    const offset = triangleId * 9;
    const x1 = meshFloats[offset];
    const y1 = meshFloats[offset + 1];
    const z1 = meshFloats[offset + 2];
    const x2 = meshFloats[offset + 3];
    const y2 = meshFloats[offset + 4];
    const z2 = meshFloats[offset + 5];
    const x3 = meshFloats[offset + 6];
    const y3 = meshFloats[offset + 7];
    const z3 = meshFloats[offset + 8];

    const minX = Math.floor(Math.min(x1, x2, x3) / CELL_SIZE);
    const maxX = Math.floor(Math.max(x1, x2, x3) / CELL_SIZE);
    const minY = Math.floor(Math.min(y1, y2, y3) / CELL_SIZE);
    const maxY = Math.floor(Math.max(y1, y2, y3) / CELL_SIZE);
    const minZ = Math.floor(Math.min(z1, z2, z3) / CELL_SIZE);
    const maxZ = Math.floor(Math.max(z1, z2, z3) / CELL_SIZE);
    const boundsOffset = triangleId * 6;
    triangleBounds[boundsOffset] = Math.min(x1, x2, x3);
    triangleBounds[boundsOffset + 1] = Math.max(x1, x2, x3);
    triangleBounds[boundsOffset + 2] = Math.min(y1, y2, y3);
    triangleBounds[boundsOffset + 3] = Math.max(y1, y2, y3);
    triangleBounds[boundsOffset + 4] = Math.min(z1, z2, z3);
    triangleBounds[boundsOffset + 5] = Math.max(z1, z2, z3);

    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
          const key = keyForCell(cellX, cellY, cellZ);
          if (!spatialIndex.has(key)) spatialIndex.set(key, []);
          spatialIndex.get(key).push(triangleId);
        }
      }
    }
  }

  return true;
}

function candidatesAlongSegment(start, end) {
  const cells = new Set();
  const maxDelta = Math.max(
    Math.abs(end.x - start.x),
    Math.abs(end.y - start.y),
    Math.abs(end.z - start.z)
  );
  const steps = Math.max(1, Math.ceil(maxDelta / (CELL_SIZE / 2)));

  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    cells.add(keyForCell(
      Math.floor((start.x + (end.x - start.x) * progress) / CELL_SIZE),
      Math.floor((start.y + (end.y - start.y) * progress) / CELL_SIZE),
      Math.floor((start.z + (end.z - start.z) * progress) / CELL_SIZE)
    ));
  }

  return cells;
}

function segmentIntersectsTriangle(start, end, triangleId) {
  const offset = triangleId * 9;
  const v0x = meshFloats[offset];
  const v0y = meshFloats[offset + 1];
  const v0z = meshFloats[offset + 2];
  const e1x = meshFloats[offset + 3] - v0x;
  const e1y = meshFloats[offset + 4] - v0y;
  const e1z = meshFloats[offset + 5] - v0z;
  const e2x = meshFloats[offset + 6] - v0x;
  const e2y = meshFloats[offset + 7] - v0y;
  const e2z = meshFloats[offset + 8] - v0z;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;

  const hx = dy * e2z - dz * e2y;
  const hy = dz * e2x - dx * e2z;
  const hz = dx * e2y - dy * e2x;
  const determinant = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(determinant) < 1e-7) return false;

  const inverse = 1 / determinant;
  const sx = start.x - v0x;
  const sy = start.y - v0y;
  const sz = start.z - v0z;
  const u = inverse * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return false;

  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = inverse * (dx * qx + dy * qy + dz * qz);
  if (v < 0 || u + v > 1) return false;

  const progress = inverse * (e2x * qx + e2y * qy + e2z * qz);
  return progress > 0.001 && progress < 0.999;
}

function traceWorldSegment(start, end) {
  if (!ensureMesh()) {
    return { clear: null, meshAvailable: false, testedTriangles: 0 };
  }

  const candidateCells = candidatesAlongSegment(start, end);
  const segmentBounds = {
    minX: Math.min(start.x, end.x),
    maxX: Math.max(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxY: Math.max(start.y, end.y),
    minZ: Math.min(start.z, end.z),
    maxZ: Math.max(start.z, end.z)
  };
  let testedTriangles = 0;
  queryStamp += 1;
  if (queryStamp >= 0xffffffff) {
    triangleVisitStamps.fill(0);
    queryStamp = 1;
  }

  for (const cellKey of candidateCells) {
    for (const triangleId of spatialIndex.get(cellKey) || []) {
      if (triangleVisitStamps[triangleId] === queryStamp) continue;
      triangleVisitStamps[triangleId] = queryStamp;
      const boundsOffset = triangleId * 6;
      if (
        triangleBounds[boundsOffset] > segmentBounds.maxX
        || triangleBounds[boundsOffset + 1] < segmentBounds.minX
        || triangleBounds[boundsOffset + 2] > segmentBounds.maxY
        || triangleBounds[boundsOffset + 3] < segmentBounds.minY
        || triangleBounds[boundsOffset + 4] > segmentBounds.maxZ
        || triangleBounds[boundsOffset + 5] < segmentBounds.minZ
      ) continue;
      testedTriangles += 1;
      if (segmentIntersectsTriangle(start, end, triangleId)) {
        return {
          clear: false,
          meshAvailable: true,
          triangleId,
          testedTriangles
        };
      }
    }
  }

  return { clear: true, meshAvailable: true, testedTriangles };
}

function traceRadarSegment(from, to, options = {}) {
  const start = radarToWorld(from, options.fromZOffset || 0);
  const end = radarToWorld(to, options.toZOffset || 0);
  return traceWorldSegment(start, end);
}

function isMovementClear(from, to, radius = 0.44) {
  if (!ensureMesh()) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return true;

  const perpendicular = {
    x: -dy / length * radius,
    y: dx / length * radius
  };
  const offsets = [
    { x: 0, y: 0 },
    perpendicular,
    { x: -perpendicular.x, y: -perpendicular.y }
  ];

  for (const offset of offsets) {
    const shiftedFrom = { ...from, x: from.x + offset.x, y: from.y + offset.y };
    const shiftedTo = { ...to, x: to.x + offset.x, y: to.y + offset.y };
    const torso = traceRadarSegment(shiftedFrom, shiftedTo, {
      fromZOffset: 38,
      toZOffset: 38
    });
    const head = traceRadarSegment(shiftedFrom, shiftedTo, {
      fromZOffset: 62,
      toZOffset: 62
    });
    if (torso.clear === false || head.clear === false) return false;
  }

  return true;
}

function meshStats() {
  const available = ensureMesh();
  return {
    available,
    triangleCount: available ? triangleCount : 0,
    cellCount: available ? spatialIndex.size : 0,
    radarWorldScale: RADAR_WORLD_SCALE
  };
}

module.exports = {
  radarToWorld,
  traceWorldSegment,
  traceRadarSegment,
  isMovementClear,
  meshStats
};
