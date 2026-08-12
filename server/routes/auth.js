// ============================================
// 5x5 Oyun Backend - Kimlik Doğrulama Route'ları
// Kayıt, giriş ve kullanıcı bilgisi endpoint'leri
// ============================================

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, authMiddleware } = require('../auth');

const router = express.Router();

// ============================================
// POST /register - Yeni kullanıcı kaydı
// ============================================
router.post('/register', (req, res) => {
  try {
    const { username, password, displayName, server } = req.body;

    // Zorunlu alan kontrolü
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Kullanıcı adı, şifre ve görünen isim zorunludur' });
    }

    // Sunucu seçimi kontrolü (Varsayılan OIMSFKTS)
    const serverVal = server || 'OIMSFKTS';
    if (serverVal !== 'OIMSFKTS' && serverVal !== 'YENİ SERVER') {
      return res.status(400).json({ error: 'Geçersiz sunucu seçimi' });
    }

    // Kullanıcı adı uzunluk kontrolü
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Kullanıcı adı 3-30 karakter arasında olmalıdır' });
    }

    // Şifre uzunluk kontrolü
    if (password.length < 6) {
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' });
    }

    // Kullanıcı adının benzersiz olup olmadığını kontrol et
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
    }

    // Şifreyi hash'le (salt rounds: 10)
    const passwordHash = bcrypt.hashSync(password, 10);

    // Kullanıcıyı veritabanına ekle
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, display_name, server)
      VALUES (?, ?, ?, ?)
    `).run(username, passwordHash, displayName, serverVal);

    // Oluşturulan kullanıcı bilgilerini al
    const newUser = {
      id: result.lastInsertRowid,
      username: username,
      display_name: displayName,
      is_admin: 0,
      server: serverVal,
    };

    // JWT token oluştur
    const token = generateToken(newUser);

    return res.status(201).json({
      token: token,
      user: newUser,
    });
  } catch (err) {
    console.error('[Auth Route] Kayıt hatası:', err.message);
    return res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu' });
  }
});

// ============================================
// POST /login - Kullanıcı girişi
// ============================================
router.post('/login', (req, res) => {
  try {
    const { username, password, server } = req.body;

    // Zorunlu alan kontrolü
    if (!username || !password || !server) {
      return res.status(400).json({ error: 'Kullanıcı adı, şifre ve sunucu seçimi zorunludur' });
    }

    // Kullanıcıyı veritabanında ara
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }

    // Admin olmayanlar için sunucu kontrolü
    if (Number(user.is_admin) !== 1 && user.server !== server) {
      return res.status(401).json({ error: 'Bu sunucuda hesabınız bulunmamaktadır. Lütfen doğru sunucuyu seçin.' });
    }

    // Şifre doğrulama
    const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }

    // Admin kullanıcısı giriş yaparken hangi sunucuyu seçtiyse o sunucuyla token oluşturalım
    const userWithActiveServer = {
      ...user,
      server: Number(user.is_admin) === 1 ? server : user.server
    };

    // JWT token oluştur
    const token = generateToken(userWithActiveServer);

    // Kullanıcı bilgilerini döndür (şifre hash'i hariç)
    return res.json({
      token: token,
      user: {
        id: userWithActiveServer.id,
        username: userWithActiveServer.username,
        display_name: userWithActiveServer.display_name,
        is_admin: userWithActiveServer.is_admin,
        server: userWithActiveServer.server,
      },
    });
  } catch (err) {
    console.error('[Auth Route] Giriş hatası:', err.message);
    return res.status(500).json({ error: 'Giriş sırasında bir hata oluştu' });
  }
});

// ============================================
// GET /me - Mevcut kullanıcı bilgilerini getir
// ============================================
router.get('/me', authMiddleware, (req, res) => {
  try {
    // Token'dan gelen kullanıcı ID'si ile veritabanından bilgileri al
    const user = db.prepare('SELECT id, username, display_name, is_admin, server, created_at FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    // Token'daki aktif sunucuyu döndürelim (özellikle admin için)
    user.server = req.user.server;

    return res.json({ user: user });
  } catch (err) {
    console.error('[Auth Route] Kullanıcı bilgisi hatası:', err.message);
    return res.status(500).json({ error: 'Kullanıcı bilgileri alınırken bir hata oluştu' });
  }
});

module.exports = router;
