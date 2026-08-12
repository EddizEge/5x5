const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');

// Tüm admin rotaları için kimlik doğrulama ve admin yetkisi gerekli
router.use(authMiddleware);
router.use(adminMiddleware);

// Server Admin yetki kontrol yardımcısı
function verifyServerAccess(req, resourceType, id) {
  if (Number(req.user.is_admin) === 1) return true; // Süper admin her şeye erişebilir
  const activeServer = req.user.server || 'OIMSFKTS';
  
  if (resourceType === 'character') {
    const char = db.prepare('SELECT server FROM characters WHERE id = ?').get(id);
    return char && char.server === activeServer;
  } else if (resourceType === 'era') {
    const era = db.prepare('SELECT character_id FROM character_eras WHERE id = ?').get(id);
    if (!era) return false;
    const char = db.prepare('SELECT server FROM characters WHERE id = ?').get(era.character_id);
    return char && char.server === activeServer;
  }
  return false;
}

function buildFootballTestTeams(activeServer, branch, simulationSeed, labels = {}) {
  const { createSeededRng } = require('../simulation/seeded-rng');
  const eras = db.prepare(`
    SELECT ce.*, c.name, c.avatar_emoji
    FROM character_eras ce
    JOIN characters c ON ce.character_id = c.id
    WHERE c.server = ?
    ORDER BY ce.id
  `).all(activeServer);

  if (eras.length < 10) {
    throw new Error('Futbol karşılaştırması için en az 10 karakter dönemi gerekli.');
  }

  const rosterRng = createSeededRng(`${simulationSeed}:football-roster`);
  for (let index = eras.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rosterRng() * (index + 1));
    [eras[index], eras[swapIndex]] = [eras[swapIndex], eras[index]];
  }
  const selectedEras = eras.slice(0, 10).map(player => ({
    ...player,
    character_era_id: player.id,
    rating: Number(branch === 'fifa' ? player.rating_fifa : player.rating_futbol) || 70
  }));

  return {
    team1: {
      userId: 1,
      displayName: labels.team1 || 'Mavi Takım',
      style: 'dengeli',
      characters: selectedEras.slice(0, 5)
    },
    team2: {
      userId: 2,
      displayName: labels.team2 || 'Kırmızı Takım',
      style: 'dengeli',
      characters: selectedEras.slice(5, 10)
    }
  };
}

// Tüm karakterleri dönemlerine göre listele
router.get('/characters', (req, res) => {
  try {
    const activeServer = Number(req.user.is_admin) === 1 ? (req.headers['x-server'] || req.user.server || 'OIMSFKTS') : req.user.server;
    const characters = db.prepare('SELECT * FROM characters WHERE server = ?').all(activeServer);

    // Her karakter için dönemlerini getir
    const getEras = db.prepare('SELECT * FROM character_eras WHERE character_id = ?');
    const charactersWithEras = characters.map((character) => {
      const eras = getEras.all(character.id);
      return { ...character, eras };
    });

    res.json({ characters: charactersWithEras });
  } catch (err) {
    console.error('Karakterler listelenirken hata:', err);
    res.status(500).json({ error: 'Karakterler getirilemedi' });
  }
});

// Yeni karakter oluştur
router.post('/characters', (req, res) => {
  try {
    const { name, avatar_emoji } = req.body;
    const activeServer = Number(req.user.is_admin) === 1 ? (req.headers['x-server'] || req.user.server || 'OIMSFKTS') : req.user.server;

    const result = db.prepare('INSERT INTO characters (name, avatar_emoji, server) VALUES (?, ?, ?)').run(name, avatar_emoji, activeServer);
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);

    res.json({ character });
  } catch (err) {
    console.error('Karakter oluşturulurken hata:', err);
    res.status(500).json({ error: 'Karakter oluşturulamadı' });
  }
});

// Karakter güncelle
router.put('/characters/:id', (req, res) => {
  try {
    if (!verifyServerAccess(req, 'character', req.params.id)) {
      return res.status(403).json({ error: 'Bu karaktere erişim yetkiniz yok (Farklı Sunucu)' });
    }

    const { name, avatar_emoji } = req.body;

    db.prepare('UPDATE characters SET name = ?, avatar_emoji = ? WHERE id = ?').run(name, avatar_emoji, req.params.id);
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);

    res.json({ character });
  } catch (err) {
    console.error('Karakter güncellenirken hata:', err);
    res.status(500).json({ error: 'Karakter güncellenemedi' });
  }
});

// Karakter sil (CASCADE dönemleri de siler)
router.delete('/characters/:id', (req, res) => {
  try {
    if (!verifyServerAccess(req, 'character', req.params.id)) {
      return res.status(403).json({ error: 'Bu karaktere erişim yetkiniz yok (Farklı Sunucu)' });
    }

    db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Karakter silinirken hata:', err);
    res.status(500).json({ error: 'Karakter silinemedi' });
  }
});

// Karakter için yeni dönem oluştur
router.post('/characters/:id/eras', (req, res) => {
  try {
    if (!verifyServerAccess(req, 'character', req.params.id)) {
      return res.status(403).json({ error: 'Bu karaktere erişim yetkiniz yok (Farklı Sunucu)' });
    }

    const { age, era_label, rating_lol, rating_valorant, rating_cs, rating_futbol, rating_fifa } = req.body;

    const result = db.prepare(
      'INSERT INTO character_eras (character_id, age, era_label, rating_lol, rating_valorant, rating_cs, rating_futbol, rating_fifa) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.params.id, age, era_label, rating_lol, rating_valorant, rating_cs, rating_futbol, rating_fifa);

    const era = db.prepare('SELECT * FROM character_eras WHERE id = ?').get(result.lastInsertRowid);

    res.json({ era });
  } catch (err) {
    console.error('Dönem oluşturulurken hata:', err);
    res.status(500).json({ error: 'Dönem oluşturulamadı' });
  }
});

// Dönem güncelle
router.put('/eras/:id', (req, res) => {
  try {
    if (!verifyServerAccess(req, 'era', req.params.id)) {
      return res.status(403).json({ error: 'Bu döneme erişim yetkiniz yok (Farklı Sunucu)' });
    }

    const { age, era_label, rating_lol, rating_valorant, rating_cs, rating_futbol, rating_fifa } = req.body;

    // Sadece gönderilen alanları güncelle
    const fields = [];
    const values = [];

    if (age !== undefined) { fields.push('age = ?'); values.push(age); }
    if (era_label !== undefined) { fields.push('era_label = ?'); values.push(era_label); }
    if (rating_lol !== undefined) { fields.push('rating_lol = ?'); values.push(rating_lol); }
    if (rating_valorant !== undefined) { fields.push('rating_valorant = ?'); values.push(rating_valorant); }
    if (rating_cs !== undefined) { fields.push('rating_cs = ?'); values.push(rating_cs); }
    if (rating_futbol !== undefined) { fields.push('rating_futbol = ?'); values.push(rating_futbol); }
    if (rating_fifa !== undefined) { fields.push('rating_fifa = ?'); values.push(rating_fifa); }

    if (fields.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE character_eras SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const era = db.prepare('SELECT * FROM character_eras WHERE id = ?').get(req.params.id);

    res.json({ era });
  } catch (err) {
    console.error('Dönem güncellenirken hata:', err);
    res.status(500).json({ error: 'Dönem güncellenemedi' });
  }
});

// Dönem sil
router.delete('/eras/:id', (req, res) => {
  try {
    if (!verifyServerAccess(req, 'era', req.params.id)) {
      return res.status(403).json({ error: 'Bu döneme erişim yetkiniz yok (Farklı Sunucu)' });
    }

    db.prepare('DELETE FROM character_eras WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Dönem silinirken hata:', err);
    res.status(500).json({ error: 'Dönem silinemedi' });
  }
});

// Tüm kullanıcıları listele (şifre hariç)
router.get('/users', (req, res) => {
  try {
    if (Number(req.user.is_admin) !== 1) {
      return res.status(403).json({ error: 'Bu işlem için Süper Admin yetkisi gerekli' });
    }
    const users = db.prepare("SELECT id, username, display_name, is_admin, server, created_at FROM users WHERE username NOT LIKE 'bot_%'").all();

    res.json({ users });
  } catch (err) {
    console.error('Kullanıcılar listelenirken hata:', err);
    res.status(500).json({ error: 'Kullanıcılar getirilemedi' });
  }
});

// Kullanıcı admin/rol durumunu değiştir (Sadece Süper Admin)
router.put('/users/:id/admin', (req, res) => {
  try {
    if (Number(req.user.is_admin) !== 1) {
      return res.status(403).json({ error: 'Bu işlem için Süper Admin yetkisi gerekli' });
    }

    const { is_admin } = req.body;
    if (is_admin === undefined || ![0, 1, 2].includes(Number(is_admin))) {
      return res.status(400).json({ error: 'Geçersiz rol seçimi' });
    }

    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Kendi rolünüzü değiştiremezsiniz' });
    }

    // Asıl admin kullanıcısının (id: 1 veya username: 'admin') rolünün değiştirilmesini engelle
    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }
    const systemAdminUsername = process.env.ADMIN_USERNAME || 'admin';
    if (Number(req.params.id) === 1 || targetUser.username === systemAdminUsername) {
      return res.status(400).json({ error: 'Asıl admin kullanıcısının rolünü değiştiremezsiniz' });
    }

    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(Number(is_admin), req.params.id);
    const user = db.prepare('SELECT id, username, display_name, is_admin, server, created_at FROM users WHERE id = ?').get(req.params.id);

    res.json({ user });
  } catch (err) {
    console.error('Admin durumu güncellenirken hata:', err);
    res.status(500).json({ error: 'Admin durumu güncellenemedi' });
  }
});

// Kullanıcı sunucusunu değiştir (Sadece Süper Admin)
router.put('/users/:id/server', (req, res) => {
  try {
    if (Number(req.user.is_admin) !== 1) {
      return res.status(403).json({ error: 'Bu işlem için Süper Admin yetkisi gerekli' });
    }
    
    const { server } = req.body;
    if (server !== 'OIMSFKTS' && server !== 'YENİ SERVER') {
      return res.status(400).json({ error: 'Geçersiz sunucu adı' });
    }

    const targetUser = db.prepare('SELECT username, is_admin FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    // Süper adminlerin sunucusu değiştirilemez (onlar ortaktır)
    if (Number(targetUser.is_admin) === 1) {
      return res.status(400).json({ error: 'Süper Adminlerin sunucusunu değiştiremezsiniz' });
    }

    db.prepare('UPDATE users SET server = ? WHERE id = ?').run(server, req.params.id);
    const user = db.prepare('SELECT id, username, display_name, is_admin, server, created_at FROM users WHERE id = ?').get(req.params.id);

    res.json({ user });
  } catch (err) {
    console.error('Kullanıcı sunucusu güncellenirken hata:', err);
    res.status(500).json({ error: 'Kullanıcı sunucusu güncellenemedi' });
  }
});

// Kullanıcı sil (Sadece Süper Admin)
router.delete('/users/:id', (req, res) => {
  try {
    if (Number(req.user.is_admin) !== 1) {
      return res.status(403).json({ error: 'Bu işlem için Süper Admin yetkisi gerekli' });
    }
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
    }

    // Asıl admin kullanıcısının silinmesini engelle
    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }
    const systemAdminUsername = process.env.ADMIN_USERNAME || 'admin';
    if (Number(req.params.id) === 1 || targetUser.username === systemAdminUsername) {
      return res.status(400).json({ error: 'Asıl admin kullanıcısını silemezsiniz' });
    }

    db.transaction(() => {
      // 1. Kullanıcının doğrudan katıldığı maçları ve skorları sil
      db.prepare('DELETE FROM matches WHERE player1_id = ? OR player2_id = ? OR winner_id = ?').run(req.params.id, req.params.id, req.params.id);
      db.prepare('DELETE FROM tournament_scores WHERE user_id = ?').run(req.params.id);
      db.prepare('DELETE FROM draft_picks WHERE user_id = ?').run(req.params.id);
      db.prepare('DELETE FROM lobby_players WHERE user_id = ?').run(req.params.id);

      // 2. Kullanıcının oluşturduğu lobileri ve bunlara bağlı turnuva, maç vb. verileri bulup sil
      const userLobbies = db.prepare('SELECT id FROM lobbies WHERE created_by = ?').all(req.params.id);
      for (const lobby of userLobbies) {
         // Lobiye bağlı maçları sil
         db.prepare('DELETE FROM matches WHERE tournament_id IN (SELECT id FROM tournaments WHERE lobby_id = ?)').run(lobby.id);
         // Lobiye bağlı turnuva skorlarını sil
         db.prepare('DELETE FROM tournament_scores WHERE tournament_id IN (SELECT id FROM tournaments WHERE lobby_id = ?)').run(lobby.id);
         // Lobiye bağlı turnuvaları sil
         db.prepare('DELETE FROM tournaments WHERE lobby_id = ?').run(lobby.id);
         // Lobiye bağlı draft seçimlerini sil
         db.prepare('DELETE FROM draft_picks WHERE lobby_id = ?').run(lobby.id);
         // Lobiye bağlı oyuncuları sil
         db.prepare('DELETE FROM lobby_players WHERE lobby_id = ?').run(lobby.id);
         // Lobinin kendisini sil
         db.prepare('DELETE FROM lobbies WHERE id = ?').run(lobby.id);
      }

      // 3. Son olarak kullanıcı kaydını sil
      db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    })();

    res.json({ success: true });
  } catch (err) {
    console.error('Kullanıcı silinirken hata:', err);
    res.status(500).json({ error: 'Kullanıcı silinemedi' });
  }
});

// Kullanıcı şifresini değiştir
router.put('/users/:id/password', (req, res) => {
  try {
    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    const systemAdminUsername = process.env.ADMIN_USERNAME || 'admin';
    const isTargetMainAdmin = Number(req.params.id) === 1 || targetUser.username === systemAdminUsername;

    // Asıl admin şifresini sadece kendisi değiştirebilir
    if (isTargetMainAdmin && req.user.id !== Number(req.params.id)) {
      return res.status(403).json({ error: 'Asıl admin kullanıcısının şifresini sadece kendisi değiştirebilir' });
    }

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' });
    }
    
    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.params.id);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Şifre güncellenirken hata:', err);
    res.status(500).json({ error: 'Şifre güncellenemedi' });
  }
});

// Beta Futbol V2 - tek dünya durumlu laboratuvar veya tam maç
router.post('/football-v2-lab', (req, res) => {
  try {
    if (Number(req.user.is_admin) !== 1) {
      return res.status(403).json({ error: 'Bu işlem için Süper Admin yetkisi gerekli' });
    }

    const { branch, seed, mode } = req.body;
    if (!['futbol', 'fifa'].includes(branch)) {
      return res.status(400).json({ error: 'Futbol V2 Hareket Laboratuvarı yalnızca Halı Saha ve FIFA için açık.' });
    }

    const { simulateFootballV2Lab } = require('../simulation/football-v2-world');
    const { createSimulationSeed } = require('../simulation/seeded-rng');
    const activeServer = req.headers['x-server'] || req.user.server || 'OIMSFKTS';
    const simulationSeed = typeof seed === 'string' && seed.trim()
      ? seed.trim().slice(0, 128)
      : createSimulationSeed('football-v2-lab');
    const matchMode = mode === 'full' ? 'full' : 'lab';
    const { team1, team2 } = buildFootballTestTeams(activeServer, branch, simulationSeed, {
      team1: `Mavi Takım (V2 ${matchMode === 'full' ? 'Tam Maç' : 'Lab'})`,
      team2: `Kırmızı Takım (V2 ${matchMode === 'full' ? 'Tam Maç' : 'Lab'})`
    });
    const lab = simulateFootballV2Lab({
      team1,
      team2,
      seed: simulationSeed,
      branch,
      mode: matchMode,
      measurePerformance: matchMode === 'full'
    });

    res.json({ lab, team1, team2 });
  } catch (err) {
    console.error('Futbol V2 laboratuvar hatası:', err);
    res.status(500).json({ error: 'Futbol V2 hareket laboratuvarı hazırlanamadı' });
  }
});

// Paket 7 - aynı kadro ve seed ile Eski Beta / V2 tam maç karşılaştırması
router.post('/football-v2-compare', (req, res) => {
  try {
    if (Number(req.user.is_admin) !== 1) {
      return res.status(403).json({ error: 'Bu işlem için Süper Admin yetkisi gerekli' });
    }

    const { branch, seed } = req.body;
    if (!['futbol', 'fifa'].includes(branch)) {
      return res.status(400).json({ error: 'A/B karşılaştırması yalnızca Halı Saha ve FIFA için açık.' });
    }

    const { simulateFootballV2Lab } = require('../simulation/football-v2-world');
    const { simulateMatch } = require('../simulation/engine');
    const { createSimulationSeed } = require('../simulation/seeded-rng');
    const activeServer = req.headers['x-server'] || req.user.server || 'OIMSFKTS';
    const simulationSeed = typeof seed === 'string' && seed.trim()
      ? seed.trim().slice(0, 128)
      : createSimulationSeed('football-v2-compare');
    const { team1, team2 } = buildFootballTestTeams(activeServer, branch, simulationSeed, {
      team1: 'Mavi Takım',
      team2: 'Kırmızı Takım'
    });

    const legacyHeapBefore = process.memoryUsage().heapUsed;
    const legacyStartedAt = process.hrtime.bigint();
    const legacyResult = simulateMatch(
      structuredClone(team1),
      structuredClone(team2),
      branch,
      true,
      true,
      { seed: simulationSeed }
    );
    const legacyEndedAt = process.hrtime.bigint();
    const legacyBytes = Buffer.byteLength(JSON.stringify(legacyResult));
    const v2 = simulateFootballV2Lab({
      team1,
      team2,
      seed: simulationSeed,
      branch,
      mode: 'full',
      measurePerformance: true
    });
    const legacy = {
      score: { 1: legacyResult.team1Score, 2: legacyResult.team2Score },
      winner: legacyResult.winner,
      lineCount: legacyResult.lines.length,
      spatialTelemetry: legacyResult.spatialTelemetry || null,
      performance: {
        simulationMs: Math.round((Number(legacyEndedAt - legacyStartedAt) / 1e6) * 100) / 100,
        heapDeltaBytes: process.memoryUsage().heapUsed - legacyHeapBefore,
        estimatedPayloadBytes: legacyBytes
      }
    };
    const v2Winner = v2.score[1] >= v2.score[2] ? 1 : 2;

    res.json({
      seed: simulationSeed,
      branch,
      team1,
      team2,
      legacy,
      v2,
      comparison: {
        legacyWinner: legacy.winner,
        v2Winner,
        sameWinner: legacy.winner === v2Winner,
        legacyTotalGoals: legacy.score[1] + legacy.score[2],
        v2TotalGoals: v2.score[1] + v2.score[2],
        v2Shots: v2.telemetry.shots,
        v2Xg: v2.telemetry.xg,
        v2TeleportCount: v2.telemetry.teleportCount,
        v2BallDiscontinuities: v2.telemetry.ballDiscontinuities
      }
    });
  } catch (err) {
    console.error('Futbol V2 A/B karşılaştırma hatası:', err);
    res.status(500).json({ error: err.message || 'Futbol V2 karşılaştırması hazırlanamadı' });
  }
});

// Test simülasyonu
router.post('/test-simulation', (req, res) => {
  try {
    if (Number(req.user.is_admin) !== 1) {
      return res.status(403).json({ error: 'Bu işlem için Süper Admin yetkisi gerekli' });
    }
    const { branch, is_beta, seed } = req.body;
    const { simulateMatch } = require('../simulation/engine');
    const { createSeededRng, createSimulationSeed } = require('../simulation/seeded-rng');
    const activeServer = req.headers['x-server'] || req.user.server || 'OIMSFKTS';
    const simulationSeed = typeof seed === 'string' && seed.trim()
      ? seed.trim().slice(0, 128)
      : createSimulationSeed(branch);

    // Seed ile aynı test kadrosu ve aynı maç akışı tekrar üretilebilir.
    const eras = db.prepare(`
      SELECT ce.*, c.name, c.avatar_emoji 
      FROM character_eras ce 
      JOIN characters c ON ce.character_id = c.id 
      WHERE c.server = ?
      ORDER BY ce.id
    `).all(activeServer);

    if (eras.length < 10) {
      return res.status(400).json({ error: 'Yeterli karakter dönemi yok. Önce en az 10 karakter dönemi ekleyin.' });
    }

    const rosterRng = createSeededRng(`${simulationSeed}:roster`);
    for (let index = eras.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rosterRng() * (index + 1));
      [eras[index], eras[swapIndex]] = [eras[swapIndex], eras[index]];
    }
    const selectedEras = eras.slice(0, 10);

    const team1 = {
      userId: 1,
      displayName: 'Mavi Takım (Test)',
      characters: selectedEras.slice(0, 5)
    };

    const team2 = {
      userId: 2,
      displayName: 'Kırmızı Takım (Test)',
      characters: selectedEras.slice(5, 10)
    };

    const simulationStartedAt = process.hrtime.bigint();
    const result = simulateMatch(
      team1,
      team2,
      branch,
      is_beta === true,
      is_beta === true,
      { seed: simulationSeed }
    );
    if (branch === 'cs' && is_beta === true && result.csBetaTelemetry) {
      result.csBetaTelemetry.performance = {
        simulationMs: Number(
          (Number(process.hrtime.bigint() - simulationStartedAt) / 1e6).toFixed(1)
        )
      };
    }

    res.json({ result, team1, team2 });
  } catch (err) {
    console.error('Test simülasyon hatası:', err);
    res.status(500).json({ error: 'Simülasyon test edilemedi' });
  }
});

// Taktiksel güç değişimlerini listele
router.get('/tactics-modifiers', (req, res) => {
  try {
    const activeServer = Number(req.user.is_admin) === 1 ? (req.headers['x-server'] || req.user.server || 'OIMSFKTS') : req.user.server;
    const eras = db.prepare(`
      SELECT ce.id as era_id, ce.character_id, ce.age, ce.era_label, c.name, c.avatar_emoji,
             ce.rating_lol, ce.rating_valorant, ce.rating_cs, ce.rating_futbol, ce.rating_fifa
      FROM character_eras ce
      JOIN characters c ON ce.character_id = c.id
      WHERE c.server = ?
      ORDER BY c.name ASC, ce.age ASC
    `).all(activeServer);

    const modifiers = db.prepare('SELECT * FROM character_era_tactics_modifiers').all();
    res.json({ eras, modifiers });
  } catch (err) {
    console.error('Taktiksel değişimler listelenirken hata:', err);
    res.status(500).json({ error: 'Taktiksel değişimler getirilemedi' });
  }
});

// Taktiksel güç değişimi kaydet/güncelle
router.post('/tactics-modifiers', (req, res) => {
  try {
    const runTx = db.transaction(() => {
      const saveOne = (eraId, br, key, val) => {
        // Server Admin yetki kontrolü
        if (Number(req.user.is_admin) !== 1) {
           const era = db.prepare('SELECT character_id FROM character_eras WHERE id = ?').get(eraId);
           if (!era) return;
           const char = db.prepare('SELECT server FROM characters WHERE id = ?').get(era.character_id);
           if (!char || char.server !== req.user.server) {
              throw new Error('Yetkisiz sunucu işlemi (Farklı Sunucu)');
           }
        }

        db.prepare('DELETE FROM character_era_tactics_modifiers WHERE character_era_id = ? AND branch = ? AND modifier_key = ?')
          .run(eraId, br, key);
        
        if (val !== 0 && val !== '' && val !== null && !isNaN(val)) {
          db.prepare('INSERT INTO character_era_tactics_modifiers (character_era_id, branch, modifier_key, modifier_value) VALUES (?, ?, ?, ?)')
            .run(eraId, br, key, parseInt(val));
        }
      };

      if (Array.isArray(req.body.modifiers)) {
        for (const item of req.body.modifiers) {
          saveOne(item.character_era_id, item.branch, item.modifier_key, item.modifier_value);
        }
      } else {
        const { character_era_id, branch, modifier_key, modifier_value } = req.body;
        saveOne(character_era_id, branch, modifier_key, modifier_value);
      }
    });
    
    runTx();
    res.json({ success: true });
  } catch (err) {
    console.error('Taktiksel değişim güncellenirken hata:', err);
    res.status(500).json({ error: 'Taktiksel değişim güncellenemedi' });
  }
});

module.exports = router;
