// Authoritative CS2 de_dust2 bomb-target volumes.
//
// Source: func_bomb_target model collision bounds extracted from the current
// Valve de_dust2.vpk with ValveResourceFormat. World coordinates are converted
// to this project's 0..100 radar coordinate system at build time.
const WORLD_BOMBSITE_VOLUMES = Object.freeze({
  A: Object.freeze({
    designation: '0',
    floorZ: Object.freeze([90, 110]),
    volumes: Object.freeze([
      Object.freeze({ min: Object.freeze([976, 2448, 96]), max: Object.freeze([1072, 2624, 136]) }),
      Object.freeze({ min: Object.freeze([1072, 2336, 96]), max: Object.freeze([1248, 2624, 192]) })
    ])
  }),
  B: Object.freeze({
    designation: '1',
    floorZ: Object.freeze([-5, 25]),
    volumes: Object.freeze([
      Object.freeze({ min: Object.freeze([-1728, 2496, 0]), max: Object.freeze([-1344, 2864, 96]) })
    ])
  })
});

const round = (value, digits = 3) => Number(Number(value).toFixed(digits));

function worldRectToRadar(volume, transform) {
  const denominator = transform.scale * transform.width;
  const xMin = (volume.min[0] - transform.posX) / denominator * 100;
  const xMax = (volume.max[0] - transform.posX) / denominator * 100;
  const yMin = (transform.posY - volume.max[1]) / denominator * 100;
  const yMax = (transform.posY - volume.min[1]) / denominator * 100;
  return [
    [round(xMin), round(yMin)],
    [round(xMax), round(yMin)],
    [round(xMax), round(yMax)],
    [round(xMin), round(yMax)]
  ];
}

function pointInRect(node, polygon) {
  const xs = polygon.map(point => point[0]);
  const ys = polygon.map(point => point[1]);
  return node.x >= Math.min(...xs)
    && node.x <= Math.max(...xs)
    && node.y >= Math.min(...ys)
    && node.y <= Math.max(...ys);
}

function polygonAreaAndCenter(polygon) {
  const xs = polygon.map(point => point[0]);
  const ys = polygon.map(point => point[1]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  return {
    area: (xMax - xMin) * (yMax - yMin),
    x: (xMin + xMax) / 2,
    y: (yMin + yMax) / 2
  };
}

function buildBombsites(nodes, transform) {
  return Object.fromEntries(Object.entries(WORLD_BOMBSITE_VOLUMES).map(([siteKey, definition]) => {
    const polygons = definition.volumes.map(volume => worldRectToRadar(volume, transform));
    const plantNodes = nodes.filter(node =>
      node.z >= definition.floorZ[0]
      && node.z <= definition.floorZ[1]
      && polygons.some(polygon => pointInRect(node, polygon))
    );

    if (!plantNodes.length) {
      throw new Error(`${siteKey} bombsite hacminde yürünebilir plant düğümü bulunamadı.`);
    }

    const weighted = polygons
      .map(polygonAreaAndCenter)
      .reduce((sum, item) => ({
        area: sum.area + item.area,
        x: sum.x + item.x * item.area,
        y: sum.y + item.y * item.area
      }), { area: 0, x: 0, y: 0 });
    const target = { x: weighted.x / weighted.area, y: weighted.y / weighted.area };
    const center = plantNodes
      .slice()
      .sort((a, b) =>
        Math.hypot(a.x - target.x, a.y - target.y)
        - Math.hypot(b.x - target.x, b.y - target.y)
      )[0];

    return [siteKey, {
      source: 'Valve func_bomb_target',
      designation: definition.designation,
      worldVolumes: definition.volumes,
      polygons,
      plantNodeIds: plantNodes.map(node => node.id).sort((a, b) => a - b),
      center: { id: center.id, x: center.x, y: center.y, z: center.z }
    }];
  }));
}

function bombsiteSvgMarkup(bombsites) {
  return Object.entries(bombsites)
    .flatMap(([siteKey, site]) => site.polygons.map((polygon, index) => {
      const points = polygon.map(point => point.join(',')).join(' ');
      return `<polygon data-site="${siteKey}" data-volume="${index}" points="${points}"/>`;
    }))
    .join('');
}

module.exports = {
  WORLD_BOMBSITE_VOLUMES,
  buildBombsites,
  bombsiteSvgMarkup
};
