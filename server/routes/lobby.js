const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../auth');

// Tüm lobi rotaları için kimlik doğrulama gerekli
router.use(authMiddleware);

// Yeni lobi oluştur
router.post('/create', (req, res) => {
  try {
    const isBeta = req.body.is_beta !== undefined ? parseInt(req.body.is_beta) : 0;
    const isQuick = req.body.is_quick ? 1 : 0;
    // Aktif sunucuyu al (admin değilse kendi sunucusu zorunlu)
    const activeServer = req.user.is_admin === 1 ? (req.headers['x-server'] || req.user.server || 'OIMSFKTS') : req.user.server;

    // Rastgele 6 karakterli büyük harf alfanümerik kod oluştur
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const result = db.prepare('INSERT INTO lobbies (code, created_by, is_beta, is_quick, server) VALUES (?, ?, ?, ?, ?)').run(code, req.user.id, isBeta, isQuick, activeServer);
    const lobbyId = result.lastInsertRowid;

    // Oluşturucuyu otomatik olarak lobiye ekle
    db.prepare('INSERT INTO lobby_players (lobby_id, user_id) VALUES (?, ?)').run(lobbyId, req.user.id);

    const lobby = db.prepare('SELECT id, code, status, created_by, is_beta, is_quick, server FROM lobbies WHERE id = ?').get(lobbyId);

    res.json({ lobby });
  } catch (err) {
    console.error('Lobi oluşturulurken hata:', err);
    res.status(500).json({ error: 'Lobi oluşturulamadı' });
  }
});

// Lobi bilgilerini getir (oyuncularla birlikte)
router.get('/:code', (req, res) => {
  try {
    const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(req.params.code);

    if (!lobby) {
      return res.status(404).json({ error: 'Lobi bulunamadı' });
    }

    // Aktif sunucu kontrolü (Kullanıcı kendi sunucusunda olmayan lobileri göremez)
    const activeServer = req.user.is_admin === 1 ? (req.headers['x-server'] || req.user.server || 'OIMSFKTS') : req.user.server;
    if (lobby.server !== activeServer) {
      return res.status(403).json({ error: 'Bu lobiye erişim yetkiniz yok (Farklı Sunucu)' });
    }

    // Lobi oyuncularını kullanıcı bilgileriyle birlikte getir
    const players = db.prepare(
      `SELECT lp.id, u.id AS user_id, u.username, u.display_name, lp.is_ready
       FROM lobby_players lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.lobby_id = ?`
    ).all(lobby.id);

    res.json({ lobby: { ...lobby, players } });
  } catch (err) {
    console.error('Lobi bilgileri getirilirken hata:', err);
    res.status(500).json({ error: 'Lobi bilgileri getirilemedi' });
  }
});

// Lobiye katıl
router.post('/:code/join', (req, res) => {
  try {
    const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(req.params.code);

    if (!lobby) {
      return res.status(404).json({ error: 'Lobi bulunamadı' });
    }

    // Aktif sunucu kontrolü (Kullanıcı kendi sunucusunda olmayan lobilere katılamaz)
    const activeServer = req.user.is_admin === 1 ? (req.headers['x-server'] || req.user.server || 'OIMSFKTS') : req.user.server;
    if (lobby.server !== activeServer) {
      return res.status(403).json({ error: 'Bu lobiye katılamazsınız (Farklı Sunucu)' });
    }

    // Kullanıcının zaten lobide olup olmadığını kontrol et
    const existingPlayer = db.prepare(
      'SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?'
    ).get(lobby.id, req.user.id);

    if (existingPlayer) {
      return res.status(400).json({ error: 'Zaten bu lobidesiniz' });
    }

    // Lobi durumunu kontrol et
    if (lobby.status !== 'waiting') {
      return res.status(400).json({ error: 'Lobi artık katılıma açık değil' });
    }

    db.prepare('INSERT INTO lobby_players (lobby_id, user_id) VALUES (?, ?)').run(lobby.id, req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Lobiye katılırken hata:', err);
    res.status(500).json({ error: 'Lobiye katılınamadı' });
  }
});

// Lobiden ayrıl
router.post('/:code/leave', (req, res) => {
  try {
    const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(req.params.code);

    if (!lobby) {
      return res.status(404).json({ error: 'Lobi bulunamadı' });
    }

    db.prepare('DELETE FROM lobby_players WHERE lobby_id = ? AND user_id = ?').run(lobby.id, req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Lobiden ayrılırken hata:', err);
    res.status(500).json({ error: 'Lobiden ayrılınamadı' });
  }
});

// Lobiyi sil (sadece oluşturucu silebilir)
router.delete('/:code', (req, res) => {
  try {
    const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(req.params.code);

    if (!lobby) {
      return res.status(404).json({ error: 'Lobi bulunamadı' });
    }

    // Sadece lobi oluşturucusu silebilir
    if (req.user.id !== lobby.created_by) {
      return res.status(403).json({ error: 'Sadece lobi oluşturucusu lobiyi silebilir' });
    }

    // Lobiyi sil (CASCADE oyuncuları da siler)
    db.prepare('DELETE FROM lobbies WHERE id = ?').run(lobby.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Lobi silinirken hata:', err);
    res.status(500).json({ error: 'Lobi silinemedi' });
  }
});

module.exports = router;
