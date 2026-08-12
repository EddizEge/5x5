const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../auth');

// Tüm oyun rotaları için kimlik doğrulama gerekli
router.use(authMiddleware);

// Draft sonuçlarını getir
router.get('/:lobbyId/draft', (req, res) => {
  try {
    const lobby = db.prepare('SELECT * FROM lobbies WHERE id = ?').get(req.params.lobbyId);
    if (!lobby) {
      return res.status(404).json({ error: 'Lobi bulunamadı' });
    }
    const activeServer = req.user.is_admin === 1 ? (req.headers['x-server'] || req.user.server || 'OIMSFKTS') : req.user.server;
    if (lobby.server !== activeServer) {
      return res.status(403).json({ error: 'Bu lobiye erişim yetkiniz yok (Farklı Sunucu)' });
    }

    // Draft seçimlerini karakter ve dönem bilgileriyle birlikte getir
    const picks = db.prepare(
      `SELECT dp.user_id, u.username, u.display_name,
              c.name AS character_name, c.avatar_emoji,
              ce.age, ce.era_label,
              ce.rating_lol, ce.rating_valorant, ce.rating_cs,
              ce.rating_futbol, ce.rating_fifa
       FROM draft_picks dp
       JOIN character_eras ce ON dp.character_era_id = ce.id
       JOIN characters c ON ce.character_id = c.id
       JOIN users u ON dp.user_id = u.id
       WHERE dp.lobby_id = ?`
    ).all(req.params.lobbyId);

    // Sonuçları kullanıcı bazında grupla
    const draft = {};
    picks.forEach((pick) => {
      if (!draft[pick.user_id]) {
        draft[pick.user_id] = {
          user: {
            id: pick.user_id,
            username: pick.username,
            display_name: pick.display_name
          },
          picks: []
        };
      }

      draft[pick.user_id].picks.push({
        character_name: pick.character_name,
        avatar_emoji: pick.avatar_emoji,
        age: pick.age,
        era_label: pick.era_label,
        rating_lol: pick.rating_lol,
        rating_valorant: pick.rating_valorant,
        rating_cs: pick.rating_cs,
        rating_futbol: pick.rating_futbol,
        rating_fifa: pick.rating_fifa
      });
    });

    res.json({ draft });
  } catch (err) {
    console.error('Draft sonuçları getirilirken hata:', err);
    res.status(500).json({ error: 'Draft sonuçları getirilemedi' });
  }
});

// Turnuva skorlarını getir
router.get('/:lobbyId/scores', (req, res) => {
  try {
    const lobby = db.prepare('SELECT * FROM lobbies WHERE id = ?').get(req.params.lobbyId);
    if (!lobby) {
      return res.status(404).json({ error: 'Lobi bulunamadı' });
    }
    const activeServer = req.user.is_admin === 1 ? (req.headers['x-server'] || req.user.server || 'OIMSFKTS') : req.user.server;
    if (lobby.server !== activeServer) {
      return res.status(403).json({ error: 'Bu lobiye erişim yetkiniz yok (Farklı Sunucu)' });
    }

    // Lobiye ait turnuvayı bul
    const tournament = db.prepare('SELECT * FROM tournaments WHERE lobby_id = ?').get(req.params.lobbyId);

    if (!tournament) {
      return res.status(404).json({ error: 'Turnuva bulunamadı' });
    }

    // Turnuva skorlarını kullanıcı bilgileriyle birlikte getir
    const scores = db.prepare(
      `SELECT ts.*, u.username, u.display_name
       FROM tournament_scores ts
       JOIN users u ON ts.user_id = u.id
       WHERE ts.tournament_id = ?`
    ).all(tournament.id);

    res.json({ scores });
  } catch (err) {
    console.error('Turnuva skorları getirilirken hata:', err);
    res.status(500).json({ error: 'Turnuva skorları getirilemedi' });
  }
});

// Maç geçmişini getir
router.get('/:lobbyId/matches', (req, res) => {
  try {
    const lobby = db.prepare('SELECT * FROM lobbies WHERE id = ?').get(req.params.lobbyId);
    if (!lobby) {
      return res.status(404).json({ error: 'Lobi bulunamadı' });
    }
    const activeServer = req.user.is_admin === 1 ? (req.headers['x-server'] || req.user.server || 'OIMSFKTS') : req.user.server;
    if (lobby.server !== activeServer) {
      return res.status(403).json({ error: 'Bu lobiye erişim yetkiniz yok (Farklı Sunucu)' });
    }

    // Lobiye ait turnuvayı bul
    const tournament = db.prepare('SELECT * FROM tournaments WHERE lobby_id = ?').get(req.params.lobbyId);

    if (!tournament) {
      return res.status(404).json({ error: 'Turnuva bulunamadı' });
    }

    // Turnuvaya ait tüm maçları getir
    const matches = db.prepare('SELECT * FROM matches WHERE tournament_id = ?').all(tournament.id);

    res.json({ matches });
  } catch (err) {
    console.error('Maç geçmişi getirilirken hata:', err);
    res.status(500).json({ error: 'Maç geçmişi getirilemedi' });
  }
});

module.exports = router;
