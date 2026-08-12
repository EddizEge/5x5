// ============================================
// 5x5 Oyun Backend - JWT Kimlik Doğrulama
// jsonwebtoken ile token yönetimi ve middleware
// ============================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Ortam değişkeni yoksa kalıcı, kurulum-özel bir anahtar üret.
// data/ Git tarafından yok sayıldığı için bu dosya hiçbir zaman yayın paketine girmez.
function loadJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
    return process.env.JWT_SECRET.trim();
  }

  const dataDir = path.join(__dirname, '..', 'data');
  const secretPath = path.join(dataDir, '.jwt-secret');
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(48).toString('hex'), {
      encoding: 'utf8',
      mode: 0o600,
    });
    console.warn('[Auth] JWT_SECRET tanımlı değil; bu kuruluma özel anahtar üretildi.');
  }

  return fs.readFileSync(secretPath, 'utf8').trim();
}

const JWT_SECRET = loadJwtSecret();

/**
 * Kullanıcı için JWT token oluşturur
 * @param {Object} user - Kullanıcı nesnesi (id, username, is_admin)
 * @returns {string} JWT token (7 gün geçerli)
 */
function generateToken(user) {
  try {
    const payload = {
      id: user.id,
      username: user.username,
      is_admin: Number(user.is_admin),
      server: user.server || 'OIMSFKTS',
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    return token;
  } catch (err) {
    console.error('[Auth] Token oluşturma hatası:', err.message);
    throw err;
  }
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * JWT token doğrulama middleware'i
 * Authorization header'dan Bearer token'ı okur ve doğrular
 * Başarılı olursa req.user'a decoded payload atar
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Authorization header kontrolü
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Yetkilendirme token\'ı gerekli' });
    }

    // Token'ı ayıkla
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Geçersiz token formatı' });
    }

    // Token'ı doğrula ve decode et
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    if (req.headers['x-server']) {
      try {
        req.headers['x-server'] = decodeURIComponent(req.headers['x-server']);
      } catch (e) {
        console.error('[Auth] x-server header decode hatası:', e.message);
      }
    }
    next();
  } catch (err) {
    // Token süresi dolmuş veya geçersiz
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token süresi dolmuş, lütfen tekrar giriş yapın' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Geçersiz token' });
    }
    console.error('[Auth] Token doğrulama hatası:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}

const db = require('./db');

/**
 * Admin yetki kontrolü middleware'i
 * authMiddleware'den sonra kullanılmalı
 * Veritabanından güncel admin durumunu kontrol eder
 */
function adminMiddleware(req, res, next) {
  try {
    // Kullanıcı bilgisi kontrolü (authMiddleware çalışmış olmalı)
    if (!req.user) {
      return res.status(401).json({ error: 'Önce giriş yapmalısınız' });
    }

    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
    if (!user || (Number(user.is_admin) !== 1 && Number(user.is_admin) !== 2)) {
      return res.status(403).json({ error: 'Bu işlem için admin yetkisi gerekli' });
    }

    next();
  } catch (err) {
    console.error('[Auth] Admin yetki kontrolü hatası:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}

module.exports = { generateToken, verifyToken, authMiddleware, adminMiddleware };
