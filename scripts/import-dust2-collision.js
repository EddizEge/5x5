const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('Usage: node scripts/import-dust2-collision.js <de_dust2.tri>');
  process.exit(1);
}

const resolvedSource = path.resolve(sourcePath);
const targetDir = path.join(__dirname, '..', 'server', 'simulation', 'data');
const targetPath = path.join(targetDir, 'de_dust2.tri');
const metadataPath = path.join(targetDir, 'de_dust2-collision.json');
const stat = fs.statSync(resolvedSource);

if (!stat.isFile() || stat.size === 0 || stat.size % 36 !== 0) {
  throw new Error('Dust II .tri file must contain 9 float32 values per triangle.');
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(resolvedSource, targetPath);

const hash = crypto.createHash('sha256');
const input = fs.createReadStream(resolvedSource);
input.on('data', chunk => hash.update(chunk));
input.on('end', () => {
  const metadata = {
    map: 'de_dust2',
    provider: 'Awpy',
    source: 'https://awpycs.com/17595823/tris.zip',
    patch: '17595823',
    encoding: '9 little-endian float32 values per triangle',
    triangleCount: stat.size / 36,
    byteLength: stat.size,
    sha256: hash.digest('hex'),
    importedAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify(metadata));
});

