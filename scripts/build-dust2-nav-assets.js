// Builds the beta CS map and runtime graph from Awpy's parsed CS2 nav data.
// Source format: https://awpy.readthedocs.io/en/latest/examples/nav.html
// Usage:
//   node scripts/build-dust2-nav-assets.js <de_dust2.json> <map-data.json>

const fs = require('fs');
const path = require('path');
const { buildBombsites, bombsiteSvgMarkup } = require('./lib/dust2-bombsites');

const root = path.resolve(__dirname, '..');
const navSource = process.argv[2];
const mapDataSource = process.argv[3];

if (!navSource || !mapDataSource) {
  throw new Error('de_dust2.json ve map-data.json yolları gerekli.');
}

const source = JSON.parse(fs.readFileSync(navSource, 'utf8'));
const mapData = JSON.parse(fs.readFileSync(mapDataSource, 'utf8')).de_dust2;
const rawAreas = Object.values(source.areas);

const round = (value, digits = 3) => Number(Number(value).toFixed(digits));
const toRadar = point => ({
  x: ((point.x - mapData.pos_x) / mapData.scale) / 1024 * 100,
  y: ((mapData.pos_y - point.y) / mapData.scale) / 1024 * 100,
  z: point.z
});

const nodes = rawAreas.map(area => {
  const polygon = area.corners.map(toRadar);
  const center = polygon.reduce(
    (sum, point) => ({
      x: sum.x + point.x / polygon.length,
      y: sum.y + point.y / polygon.length,
      z: sum.z + point.z / polygon.length
    }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    id: area.area_id,
    x: round(center.x),
    y: round(center.y),
    z: round(center.z, 1),
    n: area.connections,
    p: polygon.map(point => [round(point.x), round(point.y)])
  };
});

const byId = new Map(nodes.map(node => [node.id, node]));
for (const node of nodes) {
  for (const neighborId of [...node.n]) {
    const neighbor = byId.get(neighborId);
    if (neighbor && !neighbor.n.includes(node.id)) neighbor.n.push(node.id);
  }
  node.n.sort((a, b) => a - b);
}

// Radar-space anchors are only semantic hints. Every anchor is snapped to a
// real nav polygon centroid below, so no runtime route can start inside a wall.
const anchorHints = {
  // Verified against the in-app Dust II annotation reports. CT spawn is the
  // lower floor under Short, not the visually overlapping upper catwalk.
  tSpawn: [43.945, 91.597],
  ctSpawn: [62.755, 18.796],
  topMid: [49.7, 68.4],
  xbox: [50.0, 57.0],
  midDoors: [48.0, 48.1],
  ctMid: [48.8, 37.8],
  catwalk: [61.3, 48.0],
  short: [68.2, 36.0],
  longDoors: [78.0, 67.1],
  longCorner: [89.0, 54.0],
  longA: [88.0, 37.0],
  aRamp: [83.8, 29.0],
  upperTunnels: [27.0, 69.0],
  lowerTunnels: [38.2, 58.8],
  tunnelExit: [20.8, 42.0],
  bDoors: [34.4, 35.0]
};

function nearestNode([x, y]) {
  let best = nodes[0];
  let bestDistance = Infinity;
  for (const node of nodes) {
    const distance = Math.hypot(node.x - x, node.y - y);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

const transform = {
  posX: mapData.pos_x,
  posY: mapData.pos_y,
  scale: mapData.scale,
  width: 1024,
  height: 1024
};
const bombsites = buildBombsites(nodes, transform);
const landmarks = {
  ...Object.fromEntries(
  Object.entries(anchorHints).map(([key, hint]) => {
    const node = nearestNode(hint);
    return [key, { id: node.id, x: node.x, y: node.y, z: node.z }];
  })
  ),
  aSite: bombsites.A.center,
  bSite: bombsites.B.center
};

const graph = {
  source: {
    provider: 'Awpy',
    map: 'de_dust2',
    navVersion: source.version,
    generatedAt: new Date().toISOString()
  },
  transform,
  landmarks,
  bombsites,
  nodes
};

const dataDir = path.join(root, 'server', 'simulation', 'data');
const assetDir = path.join(root, 'public', 'assets', 'shooter');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(assetDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'dust2-nav.json'), JSON.stringify(graph));

const polygonMarkup = nodes
  .slice()
  .sort((a, b) => a.z - b.z)
  .map(node => {
    const points = node.p.map(point => point.join(',')).join(' ');
    const level = node.z < -40 ? 'lower' : node.z > 80 ? 'upper' : 'main';
    return `<polygon class="nav-area ${level}" data-area="${node.id}" points="${points}"/>`;
  })
  .join('');

const labelMarkup = [
  ['A', landmarks.aSite, 'site'],
  ['B', landmarks.bSite, 'site'],
  ['T SPAWN', landmarks.tSpawn, 'major'],
  ['CT SPAWN', landmarks.ctSpawn, 'major'],
  ['MID', landmarks.midDoors, 'minor'],
  ['SHORT', landmarks.short, 'minor'],
  ['LONG', landmarks.longCorner, 'minor'],
  ['TUNNELS', landmarks.upperTunnels, 'minor']
].map(([label, point, kind]) =>
  `<text class="map-label ${kind}" x="${point.x}" y="${point.y}">${label}</text>`
).join('');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="floor" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#927653"/>
      <stop offset=".52" stop-color="#69563e"/>
      <stop offset="1" stop-color="#493d2f"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy=".45" stdDeviation=".6" flood-color="#000812" flood-opacity=".92"/>
    </filter>
  </defs>
  <rect width="100" height="100" fill="#02070b"/>
  <g filter="url(#shadow)">
    ${polygonMarkup}
  </g>
  <g class="site-rings">
    ${bombsiteSvgMarkup(bombsites)}
  </g>
  <g>${labelMarkup}</g>
  <style>
    .nav-area{fill:url(#floor);stroke:#bca884;stroke-width:.08;stroke-opacity:.36;vector-effect:non-scaling-stroke}
    .nav-area.lower{fill:#3e3932;opacity:.78}
    .nav-area.upper{fill:#a7895e}
    .site-rings polygon{fill:#e7a84c38;stroke:#f0b75d;stroke-width:.32;stroke-dasharray:1.2 .8}
    .map-label{fill:#dce7e9;font-family:Arial,sans-serif;font-weight:800;text-anchor:middle;paint-order:stroke;stroke:#081018;stroke-width:.65;stroke-linejoin:round}
    .map-label.site{fill:#ffc15d;font-size:3.1px}
    .map-label.major{fill:#f3e4c7;font-size:1.65px;letter-spacing:.12px}
    .map-label.minor{fill:#d5c4a9;font-size:1.35px;letter-spacing:.08px}
  </style>
</svg>`;

fs.writeFileSync(path.join(assetDir, 'dust2-nav.svg'), svg);

console.log(JSON.stringify({
  areas: nodes.length,
  directedConnections: nodes.reduce((sum, node) => sum + node.n.length, 0),
  landmarks
}, null, 2));
