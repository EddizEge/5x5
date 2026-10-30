// ============================================
// 5x5 Oyun Backend - Veritabanı Kurulumu
// better-sqlite3 ile SQLite veritabanı yönetimi
// ============================================

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// Veritabanı dosya yolunu belirle
const dbDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, '5x5.db');

// Data klasörünü oluştur (yoksa)
try {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('[DB] Data klasörü hazır:', dbDir);
} catch (err) {
  console.error('[DB] Data klasörü oluşturulamadı:', err.message);
  throw err;
}

// Veritabanı bağlantısını oluştur
let db;
try {
  db = new Database(dbPath);
  console.log('[DB] Veritabanı bağlantısı kuruldu:', dbPath);
} catch (err) {
  console.error('[DB] Veritabanı bağlantısı başarısız:', err.message);
  throw err;
}

// WAL modu ve foreign key desteğini etkinleştir
try {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log('[DB] WAL modu ve foreign key desteği etkinleştirildi');
} catch (err) {
  console.error('[DB] Pragma ayarları uygulanamadı:', err.message);
  throw err;
}

// ============================================
// Tablo Oluşturma
// ============================================
try {
  // Kullanıcılar tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Karakterler tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '👤'
    );
  `);

  // Karakter dönemleri tablosu (yaş ve beceri puanları)
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_eras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      age INTEGER NOT NULL,
      era_label TEXT,
      rating_lol INTEGER DEFAULT 50,
      rating_valorant INTEGER DEFAULT 50,
      rating_cs INTEGER DEFAULT 50,
      rating_futbol INTEGER DEFAULT 50,
      rating_fifa INTEGER DEFAULT 50,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // Lobiler tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS lobbies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'waiting',
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_beta INTEGER DEFAULT 0,
      is_quick INTEGER DEFAULT 0,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);
  
  // Eski veritabanları için is_beta kolonunu ekle
  try {
    db.exec('ALTER TABLE lobbies ADD COLUMN is_beta INTEGER DEFAULT 0;');
  } catch(e) {
    // Zaten varsa hata verir, görmezden gel
  }

  // Eski veritabanları için is_quick kolonunu ekle
  try {
    db.exec('ALTER TABLE lobbies ADD COLUMN is_quick INTEGER DEFAULT 0;');
  } catch(e) {
    // Zaten varsa hata verir, görmezden gel
  }

  // Lobi oyuncuları tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS lobby_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lobby_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      is_ready INTEGER DEFAULT 0,
      FOREIGN KEY (lobby_id) REFERENCES lobbies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Draft seçimleri tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS draft_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lobby_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      character_era_id INTEGER NOT NULL,
      pick_order INTEGER NOT NULL,
      role TEXT,
      FOREIGN KEY (lobby_id) REFERENCES lobbies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (character_era_id) REFERENCES character_eras(id)
    );
  `);

  // Eski veritabanları için role kolonunu ekle
  try {
    db.exec('ALTER TABLE draft_picks ADD COLUMN role TEXT;');
  } catch(e) {
    // Görmezden gel
  }

  // Eski veritabanları için style kolonunu ekle
  try {
    db.exec('ALTER TABLE lobby_players ADD COLUMN style TEXT;');
  } catch(e) {
    // Görmezden gel
  }

  // Sunucu (Server) seçimi için kolonları ekle
  try {
    db.exec("ALTER TABLE users ADD COLUMN server TEXT DEFAULT 'OIMSFKTS';");
  } catch(e) {}
  try {
    db.exec("ALTER TABLE characters ADD COLUMN server TEXT DEFAULT 'OIMSFKTS';");
  } catch(e) {}
  try {
    db.exec("ALTER TABLE lobbies ADD COLUMN server TEXT DEFAULT 'OIMSFKTS';");
  } catch(e) {}

  // Taktiksel güç değişimleri tablosu (Beta)
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_era_tactics_modifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_era_id INTEGER NOT NULL,
      branch TEXT NOT NULL,
      modifier_key TEXT NOT NULL,
      modifier_value INTEGER DEFAULT 0,
      FOREIGN KEY (character_era_id) REFERENCES character_eras(id) ON DELETE CASCADE,
      UNIQUE(character_era_id, branch, modifier_key)
    );
  `);

  // Turnuvalar tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lobby_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      current_branch TEXT DEFAULT 'lol',
      current_branch_index INTEGER DEFAULT 0,
      FOREIGN KEY (lobby_id) REFERENCES lobbies(id)
    );
  `);

  // Maçlar tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      branch TEXT NOT NULL,
      player1_id INTEGER NOT NULL,
      player2_id INTEGER NOT NULL,
      winner_id INTEGER,
      result_json TEXT,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (player1_id) REFERENCES users(id),
      FOREIGN KEY (player2_id) REFERENCES users(id)
    );
  `);

  // Turnuva skorları tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      branch TEXT NOT NULL,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      rank INTEGER,
      points INTEGER DEFAULT 0,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Sohbet Mesajları Tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      lobby_code TEXT,
      server TEXT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  console.log('[DB] Tüm tablolar başarıyla oluşturuldu');
} catch (err) {
  console.error('[DB] Tablo oluşturma hatası:', err.message);
  throw err;
}

// ============================================
// İlk Admin Kullanıcısı
// ============================================

// Eski sürümlerin README'de yazan varsayılan parolası; artık hiçbir kurulumda kabul edilmez.
const LEGACY_DEFAULT_ADMIN_PASSWORD = '5x5admin';

// ADMIN_PASSWORD verilmezse kuruluma özel rastgele parola üretilir ve yalnızca data/ altına yazılır.
function resolveAdminPassword() {
  const configured = (process.env.ADMIN_PASSWORD || '').trim();
  if (configured && configured !== LEGACY_DEFAULT_ADMIN_PASSWORD) return configured;

  const password = crypto.randomBytes(18).toString('base64url');
  const passwordPath = path.join(dbDir, '.admin-initial-password');
  fs.writeFileSync(passwordPath, `${password}\n`, { encoding: 'utf8', mode: 0o600 });
  console.warn(`[DB] ADMIN_PASSWORD tanımlı değil; admin parolası üretildi ve ${passwordPath} dosyasına yazıldı.`);
  return password;
}

try {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';

  // Admin kullanıcısının var olup olmadığını kontrol et
  const existingAdmin = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(adminUsername);

  if (!existingAdmin) {
    const hashedPassword = bcrypt.hashSync(resolveAdminPassword(), 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, display_name, is_admin)
      VALUES (?, ?, ?, 1)
    `).run(adminUsername, hashedPassword, 'Admin');
    console.log('[DB] İlk admin kullanıcısı oluşturuldu:', adminUsername);
  } else if (bcrypt.compareSync(LEGACY_DEFAULT_ADMIN_PASSWORD, existingAdmin.password_hash)) {
    // Herkese açık eski varsayılan parolayla kalmış hesap açılışta yeni parolaya geçirilir.
    const hashedPassword = bcrypt.hashSync(resolveAdminPassword(), 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashedPassword, existingAdmin.id);
    console.warn('[DB] Admin hesabı eski varsayılan parolayı kullanıyordu; parola değiştirildi.');
  } else {
    console.log('[DB] Admin kullanıcısı zaten mevcut, atlanıyor');
  }
} catch (err) {
  console.error('[DB] İlk admin oluşturulurken hata:', err.message);
  throw err;
}

// ============================================
// Örnek Karakterler ve Dönemler
// ============================================

/**
 * Rastgele beceri puanı üretir (30-95 arası)
 * @returns {number} 30 ile 95 arasında rastgele bir tam sayı
 */
function randomRating() {
  return Math.floor(Math.random() * 66) + 30;
}

function seedServerCharacters(serverName) {
  // Tamamen genel demo karakterleri: [isim, emoji, [[yaş, dönem_etiketi], ...]]
  const sampleCharacters = [
    ['Oyuncu 01', '🎮', [[18, 'Genç'], [24, 'Prime']]],
    ['Oyuncu 02', '👾', [[18, 'Genç'], [24, 'Prime']]],
    ['Oyuncu 03', '🎯', [[18, 'Genç'], [24, 'Prime']]],
    ['Oyuncu 04', '⚡', [[18, 'Genç'], [24, 'Prime']]],
    ['Oyuncu 05', '🔥', [[18, 'Genç'], [24, 'Prime']]],
    ['Oyuncu 06', '🐺', [[18, 'Genç'], [24, 'Prime']]],
    ['Oyuncu 07', '🦁', [[18, 'Genç'], [24, 'Prime']]],
    ['Oyuncu 08', '🎪', [[18, 'Genç'], [24, 'Prime']]],
    ['Oyuncu 09', '🌟', [[18, 'Genç'], [24, 'Prime']]],
    ['Oyuncu 10', '🎸', [[18, 'Genç'], [24, 'Prime']]],
  ];

  // Prepared statement'ları hazırla (performans için)
  const insertCharacter = db.prepare('INSERT INTO characters (name, avatar_emoji, server) VALUES (?, ?, ?)');
  const insertEra = db.prepare(`
    INSERT INTO character_eras (character_id, age, era_label, rating_lol, rating_valorant, rating_cs, rating_futbol, rating_fifa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Transaction içinde toplu ekleme yap (hız ve tutarlılık için)
  const insertAll = db.transaction(() => {
    for (const [name, emoji, eras] of sampleCharacters) {
      // Karakteri ekle
      const result = insertCharacter.run(name, emoji, serverName);
      const characterId = result.lastInsertRowid;

      // Her dönem için beceri puanlarıyla birlikte ekle
      for (const [age, eraLabel] of eras) {
        insertEra.run(
          characterId,
          age,
          eraLabel,
          randomRating(), // LoL puanı
          randomRating(), // Valorant puanı
          randomRating(), // CS puanı
          randomRating(), // Futbol puanı
          randomRating()  // FIFA puanı
        );
      }
    }
  });

  insertAll();
  console.log(`[DB] ${serverName} için örnek karakterler ve dönemler eklendi (10 karakter)`);
}

const shouldSeedDemoData = /^(1|true|yes)$/i.test(process.env.SEED_DEMO_DATA || 'false');

if (shouldSeedDemoData) {
  try {
    // OIMSFKTS sunucusu için karakter kontrolü ve ekleme
    const characterCountOims = db.prepare("SELECT COUNT(*) as count FROM characters WHERE server = 'OIMSFKTS'").get();
    if (characterCountOims.count === 0) {
      seedServerCharacters('OIMSFKTS');
    } else {
      console.log('[DB] OIMSFKTS sunucusu için karakterler zaten mevcut');
    }

    // YENİ SERVER için genel, tek kartlık demo kadrosu
    const hasSingleEraDemoCharacter = db.prepare(`
      SELECT e.id FROM character_eras e
      JOIN characters c ON c.id = e.character_id
      WHERE c.server = 'YENİ SERVER' AND c.name = 'Demo 01'
      GROUP BY c.id
      HAVING COUNT(e.id) = 1
    `).get();
    if (!hasSingleEraDemoCharacter) {
      const yeniCharacters = [
        ['Demo 01', '🎮', [[0, 'Genel']]],
        ['Demo 02', '⚽', [[0, 'Genel']]],
        ['Demo 03', '🎯', [[0, 'Genel']]],
        ['Demo 04', '⚡', [[0, 'Genel']]],
        ['Demo 05', '👤', [[0, 'Genel']]],
        ['Demo 06', '🔥', [[0, 'Genel']]],
        ['Demo 07', '🛡️', [[0, 'Genel']]],
        ['Demo 08', '🚀', [[0, 'Genel']]],
        ['Demo 09', '🌮', [[0, 'Genel']]],
        ['Demo 10', '🤝', [[0, 'Genel']]],
        ['Demo 11', '🌿', [[0, 'Genel']]],
        ['Demo 12', '🌟', [[0, 'Genel']]],
      ];

      db.transaction(() => {
        const insertCharacter = db.prepare('INSERT INTO characters (name, avatar_emoji, server) VALUES (?, ?, ?)');
        const insertEra = db.prepare(`
          INSERT INTO character_eras (character_id, age, era_label, rating_lol, rating_valorant, rating_cs, rating_futbol, rating_fifa)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const [name, emoji, eras] of yeniCharacters) {
          const result = insertCharacter.run(name, emoji, 'YENİ SERVER');
          const characterId = result.lastInsertRowid;

          for (const [age, eraLabel] of eras) {
            insertEra.run(characterId, age, eraLabel, 50, 50, 50, 50, 50);
          }
        }
      })();
      console.log('[DB] YENİ SERVER için genel demo karakterleri eklendi (12 karakter)');
    } else {
      console.log('[DB] YENİ SERVER demo karakterleri zaten mevcut');
    }
  } catch (err) {
    console.error('[DB] Örnek veri ekleme hatası:', err.message);
    throw err;
  }
} else {
  console.log('[DB] Boş kurulum: demo karakterleri eklenmedi (SEED_DEMO_DATA=false)');
}

// Veritabanı instance'ını dışa aktar
module.exports = db;
