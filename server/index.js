// ==============================================
// 🎮 5x5 Turnuva Oyunu - Ana Sunucu
// ==============================================

// .env dosyasını yükle
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Express uygulamasını oluştur
const app = express();
const server = http.createServer(app);

// Socket.io sunucusunu oluştur (CORS tüm kaynaklara açık)
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

// Middleware'leri ekle
app.use(cors());
app.use(express.json());

// Veritabanı bağlantısı
const db = require('./db');

// Statik dosyaları sun (public klasörü)
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Rotaları
try {
  app.use('/api/auth', require('./routes/auth'));
} catch (err) {
  console.warn('⚠️ Auth rotası yüklenemedi:', err.message);
}

try {
  app.use('/api/admin', require('./routes/admin'));
} catch (err) {
  console.warn('⚠️ Admin rotası yüklenemedi:', err.message);
}

try {
  app.use('/api/lobby', require('./routes/lobby'));
} catch (err) {
  console.warn('⚠️ Lobby rotası yüklenemedi:', err.message);
}

try {
  app.use('/api/game', require('./routes/game'));
} catch (err) {
  console.warn('⚠️ Game rotası yüklenemedi:', err.message);
}

// Socket.io kurulumu
const { setupSocket } = require('./socket');
setupSocket(io, db);

// SPA fallback - tanınmayan tüm GET istekleri index.html'e yönlendirilir
app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, function () {
  console.log('🎮 5x5 Sunucu ' + PORT + ' portunda çalışıyor');
});

module.exports = { app, server };
