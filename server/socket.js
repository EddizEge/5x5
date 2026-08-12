// ==============================================
// 🔌 Socket.io Yönetici Modülü
// 5x5 Turnuva Oyunu - Gerçek Zamanlı İletişim
// ==============================================

const { verifyToken } = require('./auth');
const { simulateMatch } = require('./simulation/engine');
const { simulateFootballV2Lab } = require('./simulation/football-v2-world');
const { createSimulationSeed } = require('./simulation/seeded-rng');
const { isFootballV2BetaLobby } = require('./simulation/football-v2-rollout');

// Aktif draft oturumları
const activeDrafts = {};

// Aktif simülasyon hızları
const activeSpeeds = {};

// Online kullanıcılar (userId -> socket)
const onlineUsers = new Map();

// Hazır olma durumu (Sıradaki branş için)
const branchReadyState = {};
const branchReadyTimers = {};
const matchReadyResolvers = {};
const activeTacticsSubmissions = {};
const tacticsResolvers = {};

// Branş sırası
const BRANCHES = ['lol', 'valorant', 'cs', 'futbol', 'fifa'];

// Branş görünen adları
const BRANCH_NAMES = {
  lol: 'League of Legends',
  valorant: 'Valorant',
  cs: 'Counter-Strike',
  futbol: 'Futbol',
  fifa: 'FIFA'
};

async function waitForV2Playback(code, durationSeconds) {
  let playedSeconds = 0;
  let previousTime = Date.now();
  while (playedSeconds < durationSeconds) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const now = Date.now();
    const elapsed = Math.max(0, (now - previousTime) / 1000);
    previousTime = now;
    playedSeconds += elapsed * Math.max(1, Number(activeSpeeds[code]) || 1);
  }
}

/**
 * Socket.io kurulumunu yapar
 * @param {Object} io - Socket.io sunucu örneği
 * @param {Object} db - Better-sqlite3 veritabanı bağlantısı
 */
function setupSocket(io, db) {
  // JWT doğrulama middleware'i
  io.use(function (socket, next) {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Yetkilendirme gerekli'));
    try {
      const decoded = verifyToken(token);
      const activeServer = socket.handshake.auth.server || decoded.server || 'OIMSFKTS';
      if (Number(decoded.is_admin) === 1) {
         decoded.server = activeServer;
      }
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Geçersiz token'));
    }
  });

  io.on('connection', function (socket) {
    const activeServer = socket.user.server || 'OIMSFKTS';
    console.log(`🔌 Kullanıcı bağlandı: ${socket.user.id} (${activeServer})`);
    onlineUsers.set(socket.user.id, socket);
    socket.join('server:' + activeServer);

    // Tüm gerçek kullanıcıları ve online olanları gönder (sunucu bazlı)
    try {
      const allUsers = db.prepare("SELECT id, username, display_name, is_admin FROM users WHERE username NOT LIKE 'bot_%' AND (server = ? OR is_admin = 1)").all(activeServer);
      socket.emit('users-list', allUsers);
      
      const serverOnlineUsers = Array.from(onlineUsers.values())
        .filter(s => (s.user.server || 'OIMSFKTS') === activeServer)
        .map(s => s.user.id);
      io.to('server:' + activeServer).emit('online-users-update', serverOnlineUsers);
      
      const inLobbyUsers = db.prepare('SELECT DISTINCT user_id FROM lobby_players').all().map(r => r.user_id);
      socket.emit('in-lobby-users-update', inLobbyUsers);
      
      // Son 100 genel sohbet mesajını veritabanından çek
      const chatHistory = db.prepare(`
         SELECT cm.id as id, cm.user_id as userId, u.display_name as senderName, cm.message as text, strftime('%s', cm.created_at) * 1000 as timestamp
         FROM chat_messages cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.type = 'global' AND cm.server = ?
         ORDER BY cm.created_at ASC LIMIT 100
      `).all(activeServer);
      socket.emit('global-chat-history', chatHistory);
    } catch (err) {
      console.error('Kullanıcı listesi gönderilirken hata:', err);
    }

    // ==========================================
    // 📩 Lobi Daveti İşlemi
    // ==========================================
    socket.on('invite-player', function(data) {
       const targetSocket = onlineUsers.get(data.targetUserId);
       if (targetSocket) {
          const senderUser = db.prepare('SELECT display_name FROM users WHERE id = ?').get(socket.user.id);
          targetSocket.emit('receive-invite', {
             lobbyCode: data.code,
             inviterName: senderUser ? senderUser.display_name : socket.user.username
          });
       }
    });

    // ==========================================
    // 💬 Sohbet (Chat) İşlemleri
    // ==========================================
    socket.on('global-chat-send', (data) => {
       const senderUser = db.prepare('SELECT display_name FROM users WHERE id = ?').get(socket.user.id);
       
       // Veritabanına kaydet
       const result = db.prepare('INSERT INTO chat_messages (type, server, user_id, message) VALUES (?, ?, ?, ?)').run('global', activeServer, socket.user.id, data.text);
       
       const msg = {
          id: result.lastInsertRowid.toString(),
          userId: socket.user.id,
          senderName: senderUser ? senderUser.display_name : socket.user.username,
          text: data.text,
          timestamp: Date.now()
       };
       io.to('server:' + activeServer).emit('global-chat-message', msg);
    });

    socket.on('lobby-chat-send', (data) => {
       const { code, text } = data;
       const senderUser = db.prepare('SELECT display_name FROM users WHERE id = ?').get(socket.user.id);
       
       // Veritabanına kaydet
       const result = db.prepare('INSERT INTO chat_messages (type, lobby_code, user_id, message) VALUES (?, ?, ?, ?)').run('lobby', code, socket.user.id, text);
       
       const msg = {
          id: result.lastInsertRowid.toString(),
          userId: socket.user.id,
          senderName: senderUser ? senderUser.display_name : socket.user.username,
          text: text,
          timestamp: Date.now()
       };
       io.to('lobby:' + code).emit('lobby-chat-message', msg);
    });

    socket.on('delete-chat-message', (data) => {
        if (Number(socket.user.is_admin) !== 1 && Number(socket.user.is_admin) !== 2) return;
        const { type, msgId, code } = data;
        if (type === 'global') {
           const activeServer = socket.user.server || 'OIMSFKTS';
           db.prepare('DELETE FROM chat_messages WHERE id = ? AND type = ?').run(msgId, 'global');
           io.to('server:' + activeServer).emit('chat-message-deleted', { type: 'global', msgId });
        } else if (type === 'lobby' && code) {
           db.prepare('DELETE FROM chat_messages WHERE id = ? AND type = ?').run(msgId, 'lobby');
           io.to('lobby:' + code).emit('chat-message-deleted', { type: 'lobby', msgId });
        }
     });

    // ==========================================
    // 🚪 Lobi İşlemleri
    // ==========================================
    socket.on('set-speed', function (data) {
      try {
        const { code, speed } = data;
        const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(code);
        if (!lobby) return;
        
        // activeSpeeds dictionary should store the multiplier (1, 2, 3)
        activeSpeeds[code] = speed;
        
        io.to('lobby:' + code).emit('speed-update', { speed });
      } catch (err) {
        console.error('❌ Hız değiştirme hatası:', err.message);
      }
    });

    // ==========================================
    // 📋 Lobiye Katılma
    // ==========================================
    socket.on('join-lobby', function (data) {
      try {
        const code = data.code;

        // Lobiyi veritabanından bul
        const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(code);
        if (!lobby) {
          socket.emit('error', { message: 'Lobi bulunamadı' });
          return;
        }

        // Socket'i lobi odasına ekle
        socket.join('lobby:' + code);

        // Lobi oyuncularını kullanıcı bilgileriyle birlikte getir
        const players = db.prepare(
          'SELECT lp.*, u.username, u.display_name FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?'
        ).all(lobby.id);

        // Odadaki herkese güncel oyuncu listesini gönder
        io.to('lobby:' + code).emit('lobby-update', { ...lobby, players: players });
        
        // Genel In-Lobby listesini güncelle
        const inLobbyUsers = db.prepare('SELECT DISTINCT user_id FROM lobby_players').all().map(r => r.user_id);
        io.emit('in-lobby-users-update', inLobbyUsers);
        
        // Lobi sohbet geçmişini gönder
        const lobbyHistory = db.prepare(`
           SELECT cm.id as id, cm.user_id as userId, u.display_name as senderName, cm.message as text, strftime('%s', cm.created_at) * 1000 as timestamp
           FROM chat_messages cm
           JOIN users u ON cm.user_id = u.id
           WHERE cm.type = 'lobby' AND cm.lobby_code = ?
           ORDER BY cm.created_at ASC LIMIT 100
        `).all(code);
        socket.emit('lobby-chat-history', lobbyHistory);
      } catch (err) {
        console.error('❌ Lobiye katılma hatası:', err.message);
        socket.emit('error', { message: 'Lobiye katılırken bir hata oluştu' });
      }
    });

    // ==========================================
    // 🤖 Bot Ekleme
    // ==========================================
    socket.on('add-bot', function (data) {
      try {
        const code = data.code;
        const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(code);
        if (!lobby || lobby.created_by !== socket.user.id) return;
        
        const botName = 'bot_' + Date.now() + Math.floor(Math.random()*1000);
        
        // Lobiye kayıtlı oyuncuları al
        const playersInLobby = db.prepare('SELECT u.id, u.display_name FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?').all(lobby.id);
        const inLobbyUserIds = playersInLobby.map(p => p.id);
        const usedDisplayNames = playersInLobby.map(p => p.display_name);

        // Sistemde kayıtlı, lobide olmayan ve bu sunucudaki gerçek kullanıcıları bul
        const placeholders = inLobbyUserIds.length > 0 ? inLobbyUserIds.map(() => '?').join(',') : '0';
        const query = "SELECT display_name FROM users WHERE username NOT LIKE 'bot_%' AND server = ? AND id NOT IN (" + placeholders + ")";
        const availableUsers = db.prepare(query).all(lobby.server, ...inLobbyUserIds);
        
        let selectedName = null;
        const shuffled = availableUsers.sort(() => 0.5 - Math.random());
        
        for (const u of shuffled) {
           const potentialBotName = '🤖 Bot (' + u.display_name + ')';
           if (!usedDisplayNames.includes(potentialBotName) && !usedDisplayNames.includes(u.display_name)) {
              selectedName = potentialBotName;
              break;
           }
        }

        if (!selectedName) {
           let botNum = 1;
           while (usedDisplayNames.includes('🤖 Bot ' + botNum)) {
              botNum++;
           }
           selectedName = '🤖 Bot ' + botNum;
        }

        const botDisplayName = selectedName;
        
        db.prepare('INSERT INTO users (username, password_hash, display_name, server) VALUES (?, ?, ?, ?)').run(botName, 'bot', botDisplayName, lobby.server);
        const botId = db.prepare('SELECT last_insert_rowid() as id').get().id;
        
        db.prepare('INSERT INTO lobby_players (lobby_id, user_id, is_ready) VALUES (?, ?, 1)').run(lobby.id, botId);
        
        const players = db.prepare('SELECT lp.*, u.username, u.display_name FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?').all(lobby.id);
        io.to('lobby:' + code).emit('lobby-update', { ...lobby, players: players });
      } catch (err) {
        console.error('❌ Bot ekleme hatası:', err.message);
      }
    });

    // ==========================================
    // ✅ Hazır Durumunu Değiştir
    // ==========================================
    socket.on('toggle-ready', function (data) {
      try {
        const code = data.code;

        // Lobiyi bul
        const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(code);
        if (!lobby) {
          socket.emit('error', { message: 'Lobi bulunamadı' });
          return;
        }

        // Oyuncunun lobi kaydını bul
        const player = db.prepare(
          'SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?'
        ).get(lobby.id, socket.user.id);

        if (!player) {
          socket.emit('error', { message: 'Oyuncu lobide bulunamadı' });
          return;
        }

        // Hazır durumunu tersine çevir
        db.prepare('UPDATE lobby_players SET is_ready = ? WHERE id = ?')
          .run(player.is_ready ? 0 : 1, player.id);

        // Güncel oyuncu listesini getir ve odaya gönder
        const players = db.prepare(
          'SELECT lp.*, u.username, u.display_name FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?'
        ).all(lobby.id);

        io.to('lobby:' + code).emit('lobby-update', { ...lobby, players: players });
      } catch (err) {
        console.error('❌ Hazır durumu değiştirme hatası:', err.message);
        socket.emit('error', { message: 'Hazır durumu değiştirilirken bir hata oluştu' });
      }
    });

    // ==========================================
    // 🚀 Oyunu Başlat (Draft Aşaması)
    // ==========================================
    socket.on('start-game', function (data) {
      try {
        const code = data.code;

        // Lobiyi bul
        const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(code);
        if (!lobby) {
          socket.emit('error', { message: 'Lobi bulunamadı' });
          return;
        }

        // Sadece lobi sahibi oyunu başlatabilir
        if (socket.user.id !== lobby.created_by) {
          socket.emit('error', { message: 'Sadece lobi sahibi oyunu başlatabilir' });
          return;
        }

        // Tüm oyuncuları getir
        const players = db.prepare(
          'SELECT lp.*, u.username, u.display_name FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?'
        ).all(lobby.id);

        // En az 2 oyuncu olmalı
        if (players.length < 2) {
          socket.emit('error', { message: 'Oyunu başlatmak için en az 2 oyuncu gerekli' });
          return;
        }

        // Tüm oyuncular hazır olmalı (botlar hariç)
        const realPlayers = players.filter(p => !p.username.startsWith('bot_'));
        const allReady = realPlayers.every(function (p) { return p.is_ready; });
        if (!allReady) {
          socket.emit('error', { message: 'Tüm oyuncular hazır olmalı' });
          return;
        }

        // Hızlı Oyun (Quick Game) Kontrolü
        if (lobby.is_quick === 1) {
          const allEras = db.prepare(
            'SELECT ce.*, c.name as character_name, c.avatar_emoji FROM character_eras ce JOIN characters c ON ce.character_id = c.id WHERE c.server = ?'
          ).all(lobby.server || 'OIMSFKTS');

          let pickIndex = 0;
          const draftResult = {};
          
          players.forEach(p => {
             const shuffledPicks = [...allEras].sort(() => 0.5 - Math.random()).slice(0, 5);
             draftResult[p.user_id] = shuffledPicks;
             
             shuffledPicks.forEach(era => {
                db.prepare(
                  'INSERT INTO draft_picks (lobby_id, user_id, character_era_id, pick_order) VALUES (?, ?, ?, ?)'
                ).run(lobby.id, p.user_id, era.id, pickIndex++);
             });
          });

          db.prepare('INSERT INTO tournaments (lobby_id) VALUES (?)').run(lobby.id);
          db.prepare('UPDATE lobbies SET status = ? WHERE id = ?').run('playing', lobby.id);

          io.to('lobby:' + lobby.code).emit('draft-result', { draft: draftResult });
          return;
        }

        // Lobi durumunu 'drafting' olarak güncelle
        db.prepare('UPDATE lobbies SET status = ? WHERE id = ?').run('drafting', lobby.id);

        // ---- Yeni Draft Sistemi ----
        const allEras = db.prepare(
          'SELECT ce.*, c.name as character_name, c.avatar_emoji FROM character_eras ce JOIN characters c ON ce.character_id = c.id WHERE c.server = ?'
        ).all(lobby.server || 'OIMSFKTS');

        // Karıştır
        const shuffled = allEras.sort(() => 0.5 - Math.random());

        activeDrafts[lobby.id] = {
           lobbyId: lobby.id,
           code: lobby.code,
           round: 1,
           players: players.map(p => p.user_id),
           picks: {},
           pool: shuffled,
           currentPicks: {},
           currentOptions: {},
           timer: null
        };

        players.forEach(p => activeDrafts[lobby.id].picks[p.user_id] = []);

        startDraftRound(lobby.id, io);

      } catch (err) {
        console.error('❌ Oyun başlatma hatası:', err.message);
        socket.emit('error', { message: 'Oyun başlatılırken bir hata oluştu' });
      }
    });

    socket.on('draft-pick', function (data) {
       try {
          const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(data.code);
          if (!lobby) return;
          const draft = activeDrafts[lobby.id];
          if (!draft) return;
          
          if (draft.currentPicks[socket.user.id]) return; // Zaten seçmiş
          
          const option = draft.currentOptions[socket.user.id].find(c => c.id === data.characterEraId);
          if (option) {
             draft.currentPicks[socket.user.id] = option;
             
             // Herkes seçti mi?
             const allPicked = draft.players.every(pid => draft.currentPicks[pid]);
             if (allPicked) {
                clearTimeout(draft.timer);
                clearInterval(draft.tickInterval);
                finishDraftRound(lobby.id, io, db);
             } else {
                // Sadece bildirim (isteyenlere)
                io.to('lobby:' + data.code).emit('draft-player-picked', { userId: socket.user.id });
             }
          }
       } catch(err) {
          console.error('❌ Seçim hatası:', err.message);
       }
    });

    function startDraftRound(lobbyId, io) {
       const draft = activeDrafts[lobbyId];
       if (!draft) return;
       
       if (draft.round > 5) {
          // Draft bitti, kaydet ve sonucu yolla
          let pickIndex = 0;
          for (const pid of draft.players) {
             for (const era of draft.picks[pid]) {
                db.prepare(
                  'INSERT INTO draft_picks (lobby_id, user_id, character_era_id, pick_order) VALUES (?, ?, ?, ?)'
                ).run(lobbyId, pid, era.id, pickIndex++);
             }
          }
          
          db.prepare('INSERT INTO tournaments (lobby_id) VALUES (?)').run(lobbyId);
          db.prepare('UPDATE lobbies SET status = ? WHERE id = ?').run('playing', lobbyId);
          
          // Format the final result like old one
          const draftResult = {};
          draft.players.forEach(pid => draftResult[pid] = draft.picks[pid]);
          io.to('lobby:' + draft.code).emit('draft-result', { draft: draftResult });
          delete activeDrafts[lobbyId];
          return;
       }
       
       draft.currentPicks = {};
       draft.currentOptions = {};
       
       if (draft.round === 1) {
          // İlk tur: Herkese tüm kartlar
          draft.players.forEach(pid => {
             draft.currentOptions[pid] = [...draft.pool];
          });
       } else {
          // 2-5. Turlar: Kendisinde olmayan 2 rastgele kart
          draft.players.forEach(pid => {
             let available = draft.pool.filter(c => !draft.picks[pid].find(p => p.id === c.id));
             available.sort(() => 0.5 - Math.random());
             draft.currentOptions[pid] = available.slice(0, 2);
          });
       }
       
       io.to('lobby:' + draft.code).emit('draft-round-start', {
          round: draft.round,
          options: draft.currentOptions,
          timeRemaining: 15
       });
       
       // Botlar için anında otomatik seçim
       draft.players.forEach(pid => {
          const user = db.prepare('SELECT username FROM users WHERE id = ?').get(pid);
          if (user && user.username.startsWith('bot_')) {
             const availableOpts = draft.currentOptions[pid];
             draft.currentPicks[pid] = availableOpts[Math.floor(Math.random() * availableOpts.length)];
          }
       });
       
       const allPickedNow = draft.players.every(pid => draft.currentPicks[pid]);
       if (allPickedNow) {
          finishDraftRound(lobbyId, io, db);
          return;
       }
       
       let timeLeft = 15;
       draft.tickInterval = setInterval(() => {
          timeLeft--;
          if (timeLeft <= 0) {
             clearInterval(draft.tickInterval);
          } else {
             io.to('lobby:' + draft.code).emit('draft-tick', { timeRemaining: timeLeft });
          }
       }, 1000);
       
       draft.timer = setTimeout(() => {
          clearInterval(draft.tickInterval);
          // Seçmeyenlere otomatik seç
          draft.players.forEach(pid => {
             if (!draft.currentPicks[pid]) {
                const availableOpts = draft.currentOptions[pid];
                draft.currentPicks[pid] = availableOpts[Math.floor(Math.random() * availableOpts.length)];
             }
          });
          finishDraftRound(lobbyId, io, db);
       }, 15000);
    }
    
    function finishDraftRound(lobbyId, io, db) {
       const draft = activeDrafts[lobbyId];
       if (!draft) return;
       
       draft.players.forEach(pid => {
          draft.picks[pid].push(draft.currentPicks[pid]);
       });
       
       io.to('lobby:' + draft.code).emit('draft-round-end', { round: draft.round, picks: draft.currentPicks });
       
       draft.round++;
       setTimeout(() => startDraftRound(lobbyId, io), 3000); // 3 saniye sonra yeni tur
    }

    // ==========================================
    // ⏭️ Sonraki Branş (Maç Simülasyonu)
    // ==========================================
    socket.on('next-branch', async function (data) {
        await runNextBranch(data.code, io, db, socket);
    });

    socket.on('submit-tactics', function (data) {
       try {
          const { code, tactics } = data;
          const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(code);
          if (!lobby) return;
          
          if (tactics.style) {
             db.prepare('UPDATE lobby_players SET style = ? WHERE lobby_id = ? AND user_id = ?').run(tactics.style, lobby.id, socket.user.id);
          }
          
          if (tactics.roles) {
             const updateStmt = db.prepare('UPDATE draft_picks SET role = ? WHERE lobby_id = ? AND user_id = ? AND character_era_id = ?');
             for (const [eraId, role] of Object.entries(tactics.roles)) {
                updateStmt.run(role, lobby.id, socket.user.id, parseInt(eraId));
             }
          }
          
          if (activeTacticsSubmissions[lobby.id]) {
             activeTacticsSubmissions[lobby.id].add(Number(socket.user.id));
             
             const realPlayers = db.prepare("SELECT lp.user_id FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ? AND u.username NOT LIKE 'bot_%'").all(lobby.id).map(r => Number(r.user_id));
             const onlineRealPlayers = realPlayers.filter(uid => {
                return Array.from(onlineUsers.keys()).some(k => Number(k) === uid);
             });
             const allSubmitted = onlineRealPlayers.every(uid => activeTacticsSubmissions[lobby.id].has(uid));
             
             console.log(`[Socket] Taktik onay durumu - Lobi: ${lobby.id}`);
             console.log(`  - Real Players in Lobby (DB):`, realPlayers);
             console.log(`  - Online Users (Keys):`, Array.from(onlineUsers.keys()));
             console.log(`  - Online Real Players:`, onlineRealPlayers);
             console.log(`  - Active Submissions:`, Array.from(activeTacticsSubmissions[lobby.id]));
             console.log(`  - Hepsi Onayladi mi (allSubmitted):`, allSubmitted);

             io.to('lobby:' + code).emit('player-tactics-submitted', { 
                userId: socket.user.id, 
                submittedCount: activeTacticsSubmissions[lobby.id].size, 
                totalCount: onlineRealPlayers.length 
             });
             
             if (allSubmitted) {
                if (tacticsResolvers[lobby.id]) {
                   console.log(`[Socket] allSubmitted true, resolver cagrilacak.`);
                   tacticsResolvers[lobby.id]();
                } else {
                   console.log(`[Socket] UYARI: tacticsResolvers[${lobby.id}] tanimsiz!`);
                }
             }
          } else {
             console.log(`[Socket] UYARI: activeTacticsSubmissions[${lobby.id}] tanimsiz! (Taktik asamasi aktif olmayabilir)`);
          }
       } catch (err) {
          console.error('❌ Taktik kaydetme hatası:', err.message);
       }
    });

    socket.on('branch-ready', async function (data) {
       try {
          const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(data.code);
          if (!lobby) return;
          
          if (!branchReadyState[lobby.id]) branchReadyState[lobby.id] = new Set();
          branchReadyState[lobby.id].add(socket.user.id);
          
          // Sadece gerçek oyuncuları say
          const playersCount = db.prepare("SELECT COUNT(*) as c FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ? AND u.username NOT LIKE 'bot_%'").get(lobby.id).c;
          const readyCount = branchReadyState[lobby.id].size;
          
          io.to('lobby:' + data.code).emit('branch-ready-update', { readyCount, totalCount: playersCount });
          
          const startBranchLogic = async () => {
             delete branchReadyState[lobby.id];
             if (branchReadyTimers[lobby.id]) {
                clearInterval(branchReadyTimers[lobby.id].interval);
                clearTimeout(branchReadyTimers[lobby.id].timeout);
                delete branchReadyTimers[lobby.id];
             }
             
             if (matchReadyResolvers[lobby.id]) {
                matchReadyResolvers[lobby.id]();
                delete matchReadyResolvers[lobby.id];
                return;
             }
             
             const tournament = db.prepare('SELECT * FROM tournaments WHERE lobby_id = ?').get(lobby.id);
             if (tournament.current_branch_index >= 5) {
                // Turnuvayı bitir
                db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('completed', tournament.id);
                db.prepare('UPDATE lobbies SET status = ? WHERE id = ?').run('completed', lobby.id);
                
                const totalPoints = db.prepare(
                  'SELECT user_id, SUM(points) as total_points FROM tournament_scores WHERE tournament_id = ? GROUP BY user_id ORDER BY total_points DESC'
                ).all(tournament.id);
                
                const allUsers = db.prepare('SELECT id, display_name FROM users').all();
                const userMap = {};
                allUsers.forEach(u => userMap[u.id] = u.display_name);

                const finalRankings = [];
                for (let f = 0; f < totalPoints.length; f++) {
                  const tp = totalPoints[f];
                  finalRankings.push({
                    user_id: tp.user_id,
                    username: userMap[tp.user_id] || 'Bilinmeyen',
                    display_name: userMap[tp.user_id] || 'Bilinmeyen',
                    total_points: tp.total_points
                  });
                }
                
                // Get all branch histories
                const allBranchScores = db.prepare('SELECT * FROM tournament_scores WHERE tournament_id = ?').all(tournament.id);
                const allMatches = db.prepare('SELECT * FROM matches WHERE tournament_id = ?').all(tournament.id);
                
                const branchDetails = {};
                for (const br of BRANCHES) {
                   const brScores = allBranchScores.filter(s => s.branch === br);
                   const brMatches = allMatches.filter(m => m.branch === br);
                   if (brScores.length === 0) continue;
                   
                   const stats = [];
                   for (const sc of brScores) {
                      const wins = brMatches.filter(m => m.winner_id === sc.user_id).length;
                      const totalPlayed = brMatches.filter(m => m.player1_id === sc.user_id || m.player2_id === sc.user_id).length;
                      stats.push({
                         userId: sc.user_id,
                         displayName: userMap[sc.user_id] || 'Bilinmeyen',
                         points: sc.points,
                         wins: wins,
                         losses: totalPlayed - wins
                      });
                   }
                   stats.sort((a, b) => b.points - a.points);
                   
                   const matchesWithDetails = brMatches.map(m => {
                      let parsedResult = {};
                      try { parsedResult = JSON.parse(m.result_json); } catch(e) {}
                      return {
                         player1: userMap[m.player1_id] || 'Bilinmeyen',
                         player2: userMap[m.player2_id] || 'Bilinmeyen',
                         winnerId: m.winner_id,
                         winnerName: userMap[m.winner_id] || 'Bilinmeyen',
                         lines: parsedResult.lines || [],
                         score1: parsedResult.team1Score || parsedResult.score1 || 0,
                         score2: parsedResult.team2Score || parsedResult.score2 || 0
                      };
                   });
                   
                   branchDetails[br] = {
                      rankings: stats,
                      matches: matchesWithDetails
                   };
                }

                io.to('lobby:' + data.code).emit('tournament-complete', { rankings: finalRankings, branchDetails });
             } else {
                await runNextBranch(data.code, io, db, null);
             }
          };

          if (readyCount === playersCount) {
             // %100 hazır, hemen başlat
             startBranchLogic();
          } else if (readyCount >= Math.ceil(playersCount / 2)) {
             // %50 hazır, 15 saniye say
             if (!branchReadyTimers[lobby.id]) {
                let timeLeft = 15;
                io.to('lobby:' + data.code).emit('branch-ready-timer', { timeRemaining: timeLeft });
                
                const interval = setInterval(() => {
                   timeLeft--;
                   if (timeLeft > 0) {
                      io.to('lobby:' + data.code).emit('branch-ready-timer', { timeRemaining: timeLeft });
                   }
                }, 1000);
                
                const timeout = setTimeout(() => {
                   startBranchLogic();
                }, 15000);
                
                branchReadyTimers[lobby.id] = { interval, timeout };
             }
          }
       } catch(err) {
          console.error('❌ Ready hatası:', err.message);
       }
    });

    async function runNextBranch(code, io, db, socket) {
      try {
        // Lobiyi bul
        const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(code);
        if (!lobby) {
          socket.emit('error', { message: 'Lobi bulunamadı' });
          return;
        }

        // Turnuvayı bul
        const tournament = db.prepare('SELECT * FROM tournaments WHERE lobby_id = ?').get(lobby.id);
        if (!tournament) {
          socket.emit('error', { message: 'Turnuva bulunamadı' });
          return;
        }

        // Mevcut branş indeksini kontrol et
        if (tournament.current_branch_index >= 5) {
          socket.emit('error', { message: 'Turnuva zaten tamamlandı' });
          return;
        }

        const branch = BRANCHES[tournament.current_branch_index];

        // Reset speed to 1x for this lobby on every branch transition
        activeSpeeds[code] = 1;
        io.to('lobby:' + code).emit('speed-update', { speed: 1 });

        // Lobideki tüm oyuncuları getir
        const players = db.prepare(
          'SELECT lp.*, u.username, u.display_name FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?'
        ).all(lobby.id);

        // Mevcut genel puan durumunu hesapla
        const currentTotalPoints = db.prepare(
          'SELECT u.display_name, COALESCE(SUM(ts.points), 0) as total_points FROM users u JOIN lobby_players lp ON u.id = lp.user_id LEFT JOIN tournament_scores ts ON u.id = ts.user_id AND ts.tournament_id = ? WHERE lp.lobby_id = ? GROUP BY u.id ORDER BY total_points DESC'
        ).all(tournament.id, lobby.id);

        io.to('lobby:' + code).emit('simulation-start', {
          branch: branch,
          branchName: BRANCH_NAMES[branch],
          standings: currentTotalPoints,
          visualBeta: lobby.is_beta === 1,
          footballV2: isFootballV2BetaLobby({
            branch,
            isBeta: lobby.is_beta
          })
        });

        // Her oyuncunun draft seçimlerini getir
        var playerPicks = {};
        for (var p = 0; p < players.length; p++) {
          var currentPlayer = players[p];
          var picks = db.prepare(
            'SELECT dp.*, ce.*, c.name as character_name, c.avatar_emoji FROM draft_picks dp JOIN character_eras ce ON dp.character_era_id = ce.id JOIN characters c ON ce.character_id = c.id WHERE dp.lobby_id = ? AND dp.user_id = ?'
          ).all(lobby.id, currentPlayer.user_id);
          playerPicks[currentPlayer.user_id] = picks;
        }

        // BETA LOBİLERİ VEYA TAKTİKSEL MOD LOBİLERİ İÇİN TAKTİK BELİRLEME AŞAMASI
        if (lobby.is_beta === 1 || lobby.is_beta === 2) {
           console.log(`[Socket] Taktiksel/Beta lobisi icin taktik asamasi basliyor. Lobi ID: ${lobby.id}`);
           const tacticsModifiers = db.prepare('SELECT * FROM character_era_tactics_modifiers WHERE branch = ?').all(branch);
           io.to('lobby:' + code).emit('tactics-phase-start', {
              branch: branch,
              branchName: BRANCH_NAMES[branch],
              timeRemaining: null,
              picks: playerPicks,
              modifiers: tacticsModifiers
           });

           activeTacticsSubmissions[lobby.id] = new Set();
           
           console.log(`[Socket] Lobi ${lobby.id} için taktiklerin girilmesi bekleniyor...`);
           await new Promise((resolve) => {
              tacticsResolvers[lobby.id] = () => {
                 console.log(`[Socket] Lobi ${lobby.id} için resolve tetiklendi, taktik asamasi bitiriliyor.`);
                 resolve();
              };
           });

           console.log(`[Socket] Lobi ${lobby.id} taktik asamasini bitirdi, temizlik yapiliyor.`);
           delete tacticsResolvers[lobby.id];
           delete activeTacticsSubmissions[lobby.id];
           
           // Taktik aşaması bitti
           io.to('lobby:' + code).emit('tactics-phase-end');

           // Seçimleri ve stilleri yeniden çekelim ki güncellenmiş taktikler/roller gelsin
           for (var p = 0; p < players.length; p++) {
             var currentPlayer = players[p];
             var picks = db.prepare(
               'SELECT dp.*, ce.*, c.name as character_name, c.avatar_emoji FROM draft_picks dp JOIN character_eras ce ON dp.character_era_id = ce.id JOIN characters c ON ce.character_id = c.id WHERE dp.lobby_id = ? AND dp.user_id = ?'
             ).all(lobby.id, currentPlayer.user_id);
             playerPicks[currentPlayer.user_id] = picks;
           }
           
           // Oyuncu listesini de güncelleyelim (style bilgisi için)
           players.length = 0;
           players.push(...db.prepare(
             'SELECT lp.*, u.username, u.display_name FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?'
           ).all(lobby.id));
        }

        // Round-robin eşleşmeler: her oyuncu diğer her oyuncuyla karşılaşır
        for (var i = 0; i < players.length; i++) {
          for (var j = i + 1; j < players.length; j++) {
            var p1 = players[i];
            var p2 = players[j];

            // Takım seçimlerini al
            var team1Picks = playerPicks[p1.user_id];
            var team2Picks = playerPicks[p2.user_id];

            // Maç simülasyonunu çalıştır
            const t1Data = { displayName: p1.display_name, style: p1.style || 'dengeli', characters: team1Picks };
            const t2Data = { displayName: p2.display_name, style: p2.style || 'dengeli', characters: team2Picks };
            if (branch === 'lol' || branch === 'valorant' || branch === 'cs') {
               if (t1Data.style === 'dengeli') t1Data.style = 'agresif';
               if (t2Data.style === 'dengeli') t2Data.style = 'agresif';
            }
            const useFootballV2 = isFootballV2BetaLobby({
              branch,
              isBeta: lobby.is_beta
            });
            var footballV2Match = null;
            var result;
            if (useFootballV2) {
              const matchSeed = createSimulationSeed(`football-v2-${tournament.id}-${branch}`);
              const normalizeV2Characters = characters => characters.map(character => ({
                ...character,
                name: character.name || character.character_name,
                rating: Number(branch === 'fifa' ? character.rating_fifa : character.rating_futbol) || 70
              }));
              footballV2Match = simulateFootballV2Lab({
                team1: { ...t1Data, characters: normalizeV2Characters(t1Data.characters) },
                team2: { ...t2Data, characters: normalizeV2Characters(t2Data.characters) },
                seed: matchSeed,
                branch,
                mode: 'full',
                measurePerformance: true
              });
              result = {
                winner: footballV2Match.score[1] >= footballV2Match.score[2] ? 1 : 2,
                team1Score: footballV2Match.score[1],
                team2Score: footballV2Match.score[2],
                lines: [],
                seed: matchSeed,
                footballV2: {
                  version: footballV2Match.version,
                  matchMode: footballV2Match.matchMode,
                  matchMinutes: footballV2Match.matchMinutes,
                  snapshotStrategy: footballV2Match.snapshotStrategy,
                  telemetry: footballV2Match.telemetry,
                  statistics: footballV2Match.statistics,
                  performance: footballV2Match.performance
                }
              };
            } else {
              result = simulateMatch(
                t1Data,
                t2Data,
                branch,
                lobby.is_beta === 1 || lobby.is_beta === 2,
                lobby.is_beta === 1
              );
            }

            // Kazananı belirle
            var winnerId;
            if (result.winner === 1) {
              winnerId = p1.user_id;
            } else {
              winnerId = p2.user_id;
            }

            // Maç sonucunu veritabanına kaydet. Kayıt kimliği aynı zamanda
            // istemcide eski maç kuyruğunun yeni karşılaşmaya sızmasını
            // engelleyen tekil görsel oturum kimliğidir.
            const savedMatch = db.prepare(
              'INSERT INTO matches (tournament_id, branch, player1_id, player2_id, winner_id, result_json) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(tournament.id, branch, p1.user_id, p2.user_id, winnerId, JSON.stringify(result));
            const matchSessionId = `${tournament.id}:${branch}:${savedMatch.lastInsertRowid}`;

            io.to('lobby:' + code).emit('simulation-match-start', {
              matchSessionId,
              branch,
              visualBeta: lobby.is_beta === 1,
              player1Id: p1.user_id,
              player2Id: p2.user_id,
              player1Name: p1.display_name,
              player2Name: p2.display_name,
              score1: 0,
              score2: 0
            });

            if (useFootballV2) {
              io.to('lobby:' + code).emit('football-v2-match', {
                match: { ...footballV2Match, presentationMode: 'live' },
                player1Name: p1.display_name,
                player2Name: p2.display_name
              });
              await waitForV2Playback(code, footballV2Match.durationSeconds);
            } else {
              for (var l = 0; l < result.lines.length; l++) {
                var lineObj = result.lines[l];
                const speed = activeSpeeds[code] || 1;
                const isBetaFootballVisual = lobby.is_beta === 1 && (branch === 'futbol' || branch === 'fifa');
                const isBetaShooterVisual = lobby.is_beta === 1 && branch === 'cs';
                let baseDelay = isBetaFootballVisual ? 1450 : (isBetaShooterVisual ? 1050 : 1200);
                let currentDelay = Math.floor(baseDelay / speed);
                await new Promise(function (resolve) { setTimeout(resolve, currentDelay); });
                io.to('lobby:' + code).emit('simulation-text', {
                  matchSessionId,
                  text: typeof lineObj === 'string' ? lineObj : lineObj.text,
                  score1: typeof lineObj === 'string' ? null : lineObj.s1,
                  score2: typeof lineObj === 'string' ? null : lineObj.s2,
                  state: typeof lineObj === 'string' ? null : lineObj.state,
                  visualEvent: typeof lineObj === 'string' ? null : lineObj.visualEvent,
                  teamId: typeof lineObj === 'string' ? null : lineObj.teamId,
                  branch: branch,
                  visualBeta: lobby.is_beta === 1,
                  player1Name: p1.display_name,
                  player2Name: p2.display_name
                });
              }
            }

            // Canlı tablo hesaplama
            const liveMatches = db.prepare('SELECT * FROM matches WHERE tournament_id = ? AND branch = ?').all(tournament.id, branch);
            const liveRankings = [];
            for (const p of players) {
               const pWins = liveMatches.filter(m => m.winner_id === p.user_id).length;
               const pPlayed = liveMatches.filter(m => m.player1_id === p.user_id || m.player2_id === p.user_id).length;
               liveRankings.push({
                  user_id: p.user_id,
                  display_name: p.display_name,
                  wins: pWins,
                  losses: pPlayed - pWins,
                  points: 0
               });
            }
            liveRankings.sort((a,b) => b.wins - a.wins);

            const isLastMatch = (i === players.length - 2 && j === players.length - 1);
            io.to('lobby:' + code).emit('simulation-match-end', {
               matchSessionId,
               branch,
               player1Id: p1.user_id,
               player2Id: p2.user_id,
               player1Name: p1.display_name,
               player2Name: p2.display_name,
               winnerId,
               score1: result.team1Score,
               score2: result.team2Score,
               liveRankings,
               isLastMatch
            });

            if (!isLastMatch) {
               branchReadyState[lobby.id] = new Set();
               await new Promise(resolve => {
                  matchReadyResolvers[lobby.id] = resolve;
               });
            }
          }
        }

        // ---- Bu branş için sıralama hesapla ----

        // Her oyuncunun galibiyet sayısını hesapla
        var winsPerPlayer = {};
        for (var p = 0; p < players.length; p++) {
          var playerId = players[p].user_id;
          var winCount = db.prepare(
            'SELECT COUNT(*) as wins FROM matches WHERE tournament_id = ? AND branch = ? AND winner_id = ?'
          ).get(tournament.id, branch, playerId);
          winsPerPlayer[playerId] = winCount.wins;
        }

        // Oyuncuları kurallara göre sırala
        // 1. Galibiyet
        // 2. İkili averaj (2 kişi eşitse)
        // 3. Mini lig averajı (3+ kişi eşitse)
        // 4. Takım toplam ratingi en düşük olan
        const branchMatches = db.prepare('SELECT * FROM matches WHERE tournament_id = ? AND branch = ?').all(tournament.id, branch);
        
        function getPlayerBranchRating(playerId) {
           const team = playerPicks[playerId] || [];
           let total = 0;
           for (const char of team) {
              total += (char['rating_' + branch] || 50);
           }
           return total;
        }

        const groupsByWins = {};
        for (const p of players) {
           const w = winsPerPlayer[p.user_id] || 0;
           if (!groupsByWins[w]) groupsByWins[w] = [];
           groupsByWins[w].push(p);
        }

        const sortedWinCounts = Object.keys(groupsByWins).map(Number).sort((a,b) => b - a);
        let sortedPlayers = [];
        
        for (const w of sortedWinCounts) {
           const group = groupsByWins[w];
           if (group.length === 1) {
              sortedPlayers.push(group[0]);
           } else if (group.length === 2) {
              const a = group[0], b = group[1];
              const h2h = branchMatches.find(m => (m.player1_id === a.user_id && m.player2_id === b.user_id) || (m.player1_id === b.user_id && m.player2_id === a.user_id));
              let winner = null;
              if (h2h) winner = h2h.winner_id;
              
              if (winner === a.user_id) {
                 sortedPlayers.push(a, b);
              } else if (winner === b.user_id) {
                 sortedPlayers.push(b, a);
              } else {
                 const rA = getPlayerBranchRating(a.user_id);
                 const rB = getPlayerBranchRating(b.user_id);
                 if (rA <= rB) sortedPlayers.push(a, b); else sortedPlayers.push(b, a);
              }
           } else {
              group.sort((a, b) => {
                 const getMiniWins = (pid) => branchMatches.filter(m => m.winner_id === pid && group.some(tp => tp.user_id === (m.player1_id === pid ? m.player2_id : m.player1_id))).length;
                 const mwA = getMiniWins(a.user_id);
                 const mwB = getMiniWins(b.user_id);
                 if (mwA !== mwB) return mwB - mwA;
                 
                 const rA = getPlayerBranchRating(a.user_id);
                 const rB = getPlayerBranchRating(b.user_id);
                 return rA - rB; // Lower rating comes first
              });
              sortedPlayers.push(...group);
           }
        }

        // Sıralamaya göre puan ver: [10, 5, 3, 1]
        var pointsByRank = [10, 5, 3, 1];
        var standings = [];

        for (var r = 0; r < sortedPlayers.length; r++) {
          var rankedPlayer = sortedPlayers[r];
          var points = (r < pointsByRank.length) ? pointsByRank[r] : pointsByRank[pointsByRank.length - 1];

          // Turnuva puanını veritabanına kaydet
          db.prepare(
            'INSERT INTO tournament_scores (tournament_id, user_id, branch, points) VALUES (?, ?, ?, ?)'
          ).run(tournament.id, rankedPlayer.user_id, branch, points);

          standings.push({
            user_id: rankedPlayer.user_id,
            username: rankedPlayer.username,
            display_name: rankedPlayer.display_name,
            wins: winsPerPlayer[rankedPlayer.user_id] || 0,
            losses: Math.max(
              0,
              branchMatches.filter(match =>
                match.player1_id === rankedPlayer.user_id
                || match.player2_id === rankedPlayer.user_id
              ).length - (winsPerPlayer[rankedPlayer.user_id] || 0)
            ),
            points: points
          });
        }

        // Turnuva branş indeksini güncelle
        var newBranchIndex = tournament.current_branch_index + 1;
        var nextBranch = (newBranchIndex < 5) ? BRANCHES[newBranchIndex] : BRANCHES[4];

        db.prepare(
          'UPDATE tournaments SET current_branch_index = ?, current_branch = ? WHERE id = ?'
        ).run(newBranchIndex, nextBranch, tournament.id);

        // Genel puan durumunu hesapla (bu branş dahil)
        const overallStandings = db.prepare(
          'SELECT u.id as user_id, u.display_name, COALESCE(SUM(ts.points), 0) as total_points FROM users u JOIN lobby_players lp ON u.id = lp.user_id LEFT JOIN tournament_scores ts ON u.id = ts.user_id AND ts.tournament_id = ? WHERE lp.lobby_id = ? GROUP BY u.id ORDER BY total_points DESC'
        ).all(tournament.id, lobby.id);

        // Sıradaki tur için ready stateni sıfırla
        branchReadyState[lobby.id] = new Set();

        // Branş tamamlandı bildirimi gönder
        io.to('lobby:' + code).emit('branch-complete', {
          branch: branch,
          branchName: BRANCH_NAMES[branch],
          rankings: standings,
          overallStandings: overallStandings,
          isLastBranch: (newBranchIndex >= 5)
        });

      } catch (err) {
        console.error('❌ Branş ilerleme hatası:', err.message);
        if(socket) socket.emit('error', { message: 'Branş ilerletilirken bir hata oluştu' });
      }
    }

    // (End of runNextBranch logic handled above)

    // ==========================================
    // 🚪 Lobi Ayrılma ve Atılma İşlemleri
    // ==========================================
    socket.on('reset-lobby', function (data) {
       try {
          const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(data.code);
          if (lobby && lobby.created_by === socket.user.id) {
             db.prepare('UPDATE lobbies SET status = ? WHERE id = ?').run('waiting', lobby.id);
             db.prepare('UPDATE lobby_players SET is_ready = 0 WHERE lobby_id = ?').run(lobby.id);
             
             // Clean up previous tournaments if needed, but not strictly necessary since game starts insert new tournaments.
             
             const players = db.prepare(
               'SELECT lp.id as lp_id, u.id AS user_id, u.username, u.display_name, lp.is_ready FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?'
             ).all(lobby.id);
             io.to('lobby:' + data.code).emit('lobby-update', { ...lobby, status: 'waiting', players: players });
              
             const inLobbyUsers = db.prepare('SELECT DISTINCT user_id FROM lobby_players').all().map(r => r.user_id);
             io.emit('in-lobby-users-update', inLobbyUsers);
          }
       } catch (err) {
          console.error('❌ Lobi sıfırlama hatası:', err.message);
       }
    });

    socket.on('leave-lobby', function (data) {
      try {
        const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(data.code);
        if (lobby) {
          db.prepare('DELETE FROM lobby_players WHERE lobby_id = ? AND user_id = ?').run(lobby.id, socket.user.id);
          const players = db.prepare(
            'SELECT lp.id as lp_id, u.id AS user_id, u.username, u.display_name, lp.is_ready FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?'
          ).all(lobby.id);
          socket.leave('lobby:' + data.code);
          io.to('lobby:' + data.code).emit('lobby-update', { ...lobby, players: players });
          
          const inLobbyUsers = db.prepare('SELECT DISTINCT user_id FROM lobby_players').all().map(r => r.user_id);
          io.emit('in-lobby-users-update', inLobbyUsers);
        }
      } catch (err) {
        console.error('❌ Lobiden ayrılma hatası:', err.message);
      }
    });

    socket.on('kick-player', function (data) {
      try {
        const lobby = db.prepare('SELECT * FROM lobbies WHERE code = ?').get(data.code);
        if (lobby && lobby.created_by === socket.user.id) {
          db.prepare('DELETE FROM lobby_players WHERE lobby_id = ? AND user_id = ?').run(lobby.id, data.userId);
          const players = db.prepare(
            'SELECT lp.*, u.username, u.display_name FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?'
          ).all(lobby.id);
          io.to('lobby:' + data.code).emit('lobby-update', { ...lobby, players: players });
          io.to('lobby:' + data.code).emit('kicked', { userId: data.userId });
          
          const inLobbyUsers = db.prepare('SELECT DISTINCT user_id FROM lobby_players').all().map(r => r.user_id);
          io.emit('in-lobby-users-update', inLobbyUsers);
        }
      } catch (err) {
        console.error('❌ Oyuncu atma hatası:', err.message);
      }
    });



    // ==========================================
    // 🧪 Hızlı Test Ekranı (Oyun Sonu UI Testi)
    // ==========================================
    socket.on('dev-test-end-screen', function (data) {
      try {
        const botCount = (data && data.botCount && data.botCount > 0 && data.botCount <= 20) ? data.botCount : 1;
        
        const dummyPlayers = [
          { id: socket.user.id, name: socket.user.display_name }
        ];
        
        for (let i = 1; i <= botCount; i++) {
           dummyPlayers.push({ id: 900 + i, name: `Yapay Zeka Bot ${i}` });
        }

        // Rastgele karakterler oluştur
        const allEras = db.prepare('SELECT ce.*, c.name as character_name, c.avatar_emoji FROM character_eras ce JOIN characters c ON ce.character_id = c.id WHERE c.server = ?').all(socket.user.server || 'OIMSFKTS');
        const getTeam = () => {
           let shuffled = [...allEras].sort(() => 0.5 - Math.random());
           return shuffled.slice(0, 5);
        };

        let branchDetails = {};
        let finalRankings = dummyPlayers.map(p => ({ user_id: p.id, username: p.name, display_name: p.name, total_points: 0 }));

        for (const branch of BRANCHES) {
           let branchMatches = [];
           let branchStats = {};
           dummyPlayers.forEach(p => branchStats[p.id] = { userId: p.id, displayName: p.name, wins: 0, losses: 0, points: 0 });

           for (let i = 0; i < dummyPlayers.length; i++) {
              for (let j = i + 1; j < dummyPlayers.length; j++) {
                 const p1 = dummyPlayers[i];
                 const p2 = dummyPlayers[j];
                 const team1 = getTeam();
                 const team2 = getTeam();
                 
                 const result = simulateMatch({ displayName: p1.name, characters: team1 }, { displayName: p2.name, characters: team2 }, branch, data.isBeta === true || data.isBeta === 1 || data.isBeta === 2);
                 const winnerId = result.winner === 1 ? p1.id : p2.id;
                 const loserId = result.winner === 1 ? p2.id : p1.id;
                 
                 branchStats[winnerId].wins++;
                 branchStats[loserId].losses++;

                 branchMatches.push({
                     player1: p1.name,
                     player2: p2.name,
                     winnerId: winnerId,
                     winnerName: winnerId === p1.id ? p1.name : p2.name,
                     lines: result.lines,
                     score1: result.team1Score || result.score1 || 0,
                     score2: result.team2Score || result.score2 || 0
                 });
              }
           }
           
           let sortedStats = Object.values(branchStats).sort((a,b) => b.wins - a.wins);
           const pointsArray = [10, 5, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
           sortedStats.forEach((st, idx) => {
               const pts = pointsArray[idx] || 0;
               st.points = pts;
               const fr = finalRankings.find(f => f.user_id === st.userId);
               if (fr) fr.total_points += pts;
           });

           branchDetails[branch] = {
               rankings: sortedStats,
               matches: branchMatches
           };
        }

        finalRankings.sort((a,b) => b.total_points - a.total_points);

        socket.emit('tournament-complete', { rankings: finalRankings, branchDetails });
      } catch (err) {
        console.error('Test ekranı hatası:', err);
      }
    });

    // ==========================================
    // 🔌 Bağlantı Kopması
    // ==========================================
    socket.on('disconnect', function () {
      console.log('🔌 Kullanıcı ayrıldı:', socket.user.id);
      onlineUsers.delete(socket.user.id);
      
      const activeServer = socket.user.server || 'OIMSFKTS';
      const serverOnlineUsers = Array.from(onlineUsers.values())
        .filter(s => (s.user.server || 'OIMSFKTS') === activeServer)
        .map(s => s.user.id);
      io.to('server:' + activeServer).emit('online-users-update', serverOnlineUsers);

      try {
        const playerEntries = db.prepare('SELECT lp.id, lp.lobby_id, l.code FROM lobby_players lp JOIN lobbies l ON lp.lobby_id = l.id WHERE lp.user_id = ?').all(socket.user.id);
        
        for (const entry of playerEntries) {
          db.prepare('DELETE FROM lobby_players WHERE id = ?').run(entry.id);
          
          const lobby = db.prepare('SELECT * FROM lobbies WHERE id = ?').get(entry.lobby_id);
          if (lobby) {
            const players = db.prepare(
              'SELECT lp.*, u.username, u.display_name FROM lobby_players lp JOIN users u ON lp.user_id = u.id WHERE lp.lobby_id = ?'
            ).all(lobby.id);
            io.to('lobby:' + entry.code).emit('lobby-update', { ...lobby, players: players });
          }
        }
        const inLobbyUsers = db.prepare('SELECT DISTINCT user_id FROM lobby_players').all().map(r => r.user_id);
        io.emit('in-lobby-users-update', inLobbyUsers);
      } catch(err) {
        console.error('❌ Disconnect işlenirken hata:', err.message);
      }
    });
  });
}

module.exports = { setupSocket };
