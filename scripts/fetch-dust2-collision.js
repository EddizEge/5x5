// Dust II çarpışma ağını (de_dust2.tri) Awpy'nin yayımladığı paketten indirir ve SHA-256 ile doğrular.
// Valve haritasından türetilen bu dosya depoda tutulmaz; Docker derlemesi bu betiği çalıştırır.
// Kullanım: node scripts/fetch-dust2-collision.js [yerel tris.zip yolu]

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'server', 'simulation', 'data');
const targetPath = path.join(dataDir, 'de_dust2.tri');
const metadata = JSON.parse(fs.readFileSync(path.join(dataDir, 'de_dust2-collision.json'), 'utf8'));
const ENTRY_NAME = 'de_dust2.tri';

function isExpected(buffer) {
  return buffer.length === metadata.byteLength
    && crypto.createHash('sha256').update(buffer).digest('hex') === metadata.sha256;
}

function downloadToFile(url, destination, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      const { statusCode, headers } = response;
      if (statusCode >= 300 && statusCode < 400 && headers.location && redirectsLeft > 0) {
        response.resume();
        resolve(downloadToFile(new URL(headers.location, url).toString(), destination, redirectsLeft - 1));
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${statusCode}`));
        return;
      }
      const output = fs.createWriteStream(destination);
      response.pipe(output);
      output.on('finish', () => output.close(resolve));
      output.on('error', reject);
      response.on('error', reject);
    }).on('error', reject);
  });
}

function readAt(fd, position, length) {
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(fd, buffer, 0, length, position);
  if (bytesRead !== length) throw new Error('Zip dosyası beklenenden kısa.');
  return buffer;
}

// Zip64 ek alanı yalnız 0xFFFFFFFF ile işaretlenen alanları, sabit sırayla taşır.
function applyZip64Extra(extra, entry) {
  for (let offset = 0; offset + 4 <= extra.length;) {
    const headerId = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    if (headerId === 0x0001) {
      let cursor = offset + 4;
      for (const field of ['uncompressedSize', 'compressedSize', 'localHeaderOffset']) {
        if (entry[field] === 0xffffffff) {
          entry[field] = Number(extra.readBigUInt64LE(cursor));
          cursor += 8;
        }
      }
      return;
    }
    offset += 4 + size;
  }
}

function extractEntry(zipPath, entryName) {
  const fd = fs.openSync(zipPath, 'r');
  try {
    const fileSize = fs.fstatSync(fd).size;
    const tailLength = Math.min(fileSize, 22 + 0xffff);
    const tail = readAt(fd, fileSize - tailLength, tailLength);
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error('Zip dizin sonu bulunamadı.');

    let entryCount = tail.readUInt16LE(eocd + 10);
    let directoryOffset = tail.readUInt32LE(eocd + 16);
    if (directoryOffset === 0xffffffff || entryCount === 0xffff) {
      const locator = eocd - 20;
      if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) throw new Error('Zip64 dizini bulunamadı.');
      const zip64 = readAt(fd, Number(tail.readBigUInt64LE(locator + 8)), 56);
      if (zip64.readUInt32LE(0) !== 0x06064b50) throw new Error('Zip64 dizini bozuk.');
      entryCount = Number(zip64.readBigUInt64LE(32));
      directoryOffset = Number(zip64.readBigUInt64LE(48));
    }

    let position = directoryOffset;
    for (let index = 0; index < entryCount; index += 1) {
      const header = readAt(fd, position, 46);
      if (header.readUInt32LE(0) !== 0x02014b50) throw new Error('Zip dizin kaydı bozuk.');
      const nameLength = header.readUInt16LE(28);
      const extraLength = header.readUInt16LE(30);
      const commentLength = header.readUInt16LE(32);
      const name = readAt(fd, position + 46, nameLength).toString('utf8');
      const entry = {
        method: header.readUInt16LE(10),
        compressedSize: header.readUInt32LE(20),
        uncompressedSize: header.readUInt32LE(24),
        localHeaderOffset: header.readUInt32LE(42)
      };
      applyZip64Extra(readAt(fd, position + 46 + nameLength, extraLength), entry);
      position += 46 + nameLength + extraLength + commentLength;
      if (path.posix.basename(name) !== entryName) continue;

      const local = readAt(fd, entry.localHeaderOffset, 30);
      if (local.readUInt32LE(0) !== 0x04034b50) throw new Error('Zip yerel başlığı bozuk.');
      const dataOffset = entry.localHeaderOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const compressed = readAt(fd, dataOffset, entry.compressedSize);
      if (entry.method === 0) return compressed;
      if (entry.method === 8) return zlib.inflateRawSync(compressed);
      throw new Error(`Desteklenmeyen sıkıştırma yöntemi: ${entry.method}`);
    }
    throw new Error(`${entryName} zip içinde bulunamadı.`);
  } finally {
    fs.closeSync(fd);
  }
}

async function main() {
  if (fs.existsSync(targetPath) && isExpected(fs.readFileSync(targetPath))) {
    console.log('[dust2] Çarpışma ağı zaten hazır ve doğrulandı.');
    return;
  }

  const localZip = process.argv[2];
  const zipPath = localZip
    ? path.resolve(localZip)
    : path.join(os.tmpdir(), `awpy-tris-${process.pid}.zip`);
  try {
    if (!localZip) {
      console.log(`[dust2] İndiriliyor: ${metadata.source}`);
      await downloadToFile(metadata.source, zipPath);
    }
    const mesh = extractEntry(zipPath, ENTRY_NAME);
    if (!isExpected(mesh)) throw new Error('SHA-256 veya boyut doğrulaması başarısız.');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(`${targetPath}.tmp`, mesh);
    fs.renameSync(`${targetPath}.tmp`, targetPath);
    console.log(`[dust2] ${ENTRY_NAME} doğrulandı ve kuruldu (${metadata.triangleCount} üçgen).`);
  } finally {
    if (!localZip) fs.rmSync(zipPath, { force: true });
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[dust2] Çarpışma ağı kurulamadı: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { extractEntry };
