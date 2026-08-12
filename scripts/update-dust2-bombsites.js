// One-time/current-asset updater. The regular nav asset builder uses the same
// authoritative source module, so future rebuilds keep these exact plant zones.
const fs = require('fs');
const path = require('path');
const { buildBombsites, bombsiteSvgMarkup } = require('./lib/dust2-bombsites');

const root = path.resolve(__dirname, '..');
const graphPath = path.join(root, 'server', 'simulation', 'data', 'dust2-nav.json');
const svgPath = path.join(root, 'public', 'assets', 'shooter', 'dust2-nav.svg');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const bombsites = buildBombsites(graph.nodes, graph.transform);

graph.bombsites = bombsites;
graph.landmarks.aSite = bombsites.A.center;
graph.landmarks.bSite = bombsites.B.center;
graph.source.bombsites = 'Valve func_bomb_target volumes';
fs.writeFileSync(graphPath, JSON.stringify(graph));

let svg = fs.readFileSync(svgPath, 'utf8');
svg = svg.replace(
  /<g class="site-rings">[\s\S]*?<\/g>/,
  `<g class="site-rings">${bombsiteSvgMarkup(bombsites)}</g>`
);
svg = svg.replace(
  /<text class="map-label site" x="[^"]+" y="[^"]+">A<\/text>/,
  `<text class="map-label site" x="${bombsites.A.center.x}" y="${bombsites.A.center.y}">A</text>`
);
svg = svg.replace(
  /<text class="map-label site" x="[^"]+" y="[^"]+">B<\/text>/,
  `<text class="map-label site" x="${bombsites.B.center.x}" y="${bombsites.B.center.y}">B</text>`
);
svg = svg.replace(
  /\.site-rings circle\{[^}]+\}/,
  '.site-rings polygon{fill:#e7a84c38;stroke:#f0b75d;stroke-width:.32;stroke-dasharray:1.2 .8}'
);
fs.writeFileSync(svgPath, svg);

console.log(JSON.stringify({
  A: bombsites.A,
  B: bombsites.B
}, null, 2));
