const LobbyPage = {
  currentLobby: null,

  renderDashboard() {
    setTimeout(() => this.updateGlobalPlayerList(), 0);
    return `
      <div style="display: flex; gap: 4rem; flex-wrap: wrap; justify-content: center; max-width: 1200px; margin: 0 auto; padding-right: 2rem;">
        <div style="flex: 2; min-width: 300px; max-width: 850px;">
          <h2 style="margin-bottom: 2rem;">Hoş geldin, <span style="color: var(--primary-light)">${App.user.display_name}</span> 👋</h2>
          
          <div class="dashboard-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
            <!-- Basit Mod -->
            <div class="card" style="text-align: center; padding: 2.5rem 1.5rem; display: flex; flex-direction: column; justify-content: space-between; border-color: rgba(255,255,255,0.05);">
              <div>
                <div style="font-size: 3.5rem; margin-bottom: 0.5rem;">🎮</div>
                <h3 style="color: var(--primary-light)">Basit Mod</h3>
                <p style="color: var(--text-secondary); margin: 0.8rem 0; font-size: 0.85rem; min-height: 40px;">Hızlı ve taktiksel ayar içermeyen klasik oyun modu.</p>
              </div>
              <div style="margin-top: 1rem;">
                <button class="btn btn-primary" id="btn-create-lobby" style="width: 100%; margin-bottom: 0.8rem;">Lobi Oluştur</button>
                <button class="btn btn-secondary" id="btn-create-quick-lobby" style="width: 100%; background: rgba(124, 58, 237, 0.1); border-color: var(--primary); color: var(--primary-light);">Hızlı Oyun Kur</button>
                ${App.user.is_admin === 1 ? `<button class="btn btn-secondary" onclick="const b=prompt('Kaç tane bot eklensin?', '1'); if(b && !isNaN(b)) App.socket.emit('dev-test-end-screen', { botCount: parseInt(b), isBeta: 0 })" style="width: 100%; margin-top: 0.5rem; background: rgba(245, 158, 11, 0.1); border: 1px solid var(--accent); color: var(--accent); font-size: 0.75rem; padding: 0.2rem 0.5rem;">⚡ Basit Test</button>` : ''}
              </div>
            </div>

            <!-- Taktiksel Mod -->
            <div class="card" style="text-align: center; padding: 2.5rem 1.5rem; display: flex; flex-direction: column; justify-content: space-between; border-color: var(--accent); position: relative;">
              <div style="position: absolute; top: -10px; right: -10px; background: linear-gradient(135deg, #ff4e50, #f9d423); color: #000; font-weight: 900; font-size: 0.75rem; padding: 0.3rem 0.8rem; border-radius: 20px; box-shadow: 0 0 15px rgba(255, 78, 80, 0.6); animation: pulse 1.5s infinite; letter-spacing: 1px; z-index: 10;">YENİ</div>
              <div>
                <div style="font-size: 3.5rem; margin-bottom: 0.5rem;">⚔️</div>
                <h3 style="color: var(--accent)">Taktiksel Mod</h3>
                <p style="color: var(--text-secondary); margin: 0.8rem 0; font-size: 0.85rem; min-height: 40px;">Karakter yetenekleri, stil seçimi ve rol atamaları içeren gelişmiş mod.</p>
              </div>
              <div style="margin-top: 1rem;">
                <button class="btn btn-primary" id="btn-create-tactical-lobby" style="width: 100%; margin-bottom: 0.8rem; background: var(--accent); border-color: var(--accent); color: #000; font-weight: bold;">Lobi Oluştur</button>
                <button class="btn btn-secondary" id="btn-create-quick-tactical-lobby" style="width: 100%; background: rgba(245, 158, 11, 0.1); border-color: var(--accent); color: var(--accent);">Hızlı Oyun Kur</button>
                ${App.user.is_admin === 1 ? `<button class="btn btn-secondary" onclick="const b=prompt('Kaç tane bot eklensin?', '1'); if(b && !isNaN(b)) App.socket.emit('dev-test-end-screen', { botCount: parseInt(b), isBeta: 2 })" style="width: 100%; margin-top: 0.5rem; background: rgba(245, 158, 11, 0.1); border: 1px solid var(--accent); color: var(--accent); font-size: 0.75rem; padding: 0.2rem 0.5rem;">⚡ Taktiksel Test</button>` : ''}
              </div>
            </div>

            <!-- Beta Lobisi -->
            <div class="card" style="text-align: center; padding: 2.5rem 1.5rem; display: flex; flex-direction: column; justify-content: space-between; border-color: var(--success);">
              <div>
                <div style="font-size: 3.5rem; margin-bottom: 0.5rem;">🧪</div>
                <h3 style="color: var(--success)">Beta Lobisi</h3>
                <p style="color: var(--text-secondary); margin: 0.8rem 0; font-size: 0.85rem; min-height: 40px;">Geliştirilmekte olan en yeni deneysel özellikleri test edin.</p>
              </div>
              <div style="margin-top: 1rem;">
                <button class="btn btn-secondary" id="btn-create-beta-lobby" style="width: 100%; margin-bottom: 0.8rem; background: rgba(16, 185, 129, 0.1); border-color: var(--success); color: var(--success);">Lobi Oluştur</button>
                <button class="btn btn-secondary" id="btn-create-quick-beta-lobby" style="width: 100%; background: rgba(16, 185, 129, 0.2); border-color: var(--success); color: var(--success-light);">Hızlı Oyun Kur</button>
                ${App.user.is_admin === 1 ? `<button class="btn btn-secondary" onclick="const b=prompt('Kaç tane bot eklensin?', '1'); if(b && !isNaN(b)) App.socket.emit('dev-test-end-screen', { botCount: parseInt(b), isBeta: 1 })" style="width: 100%; margin-top: 0.5rem; background: rgba(245, 158, 11, 0.1); border: 1px solid var(--accent); color: var(--accent); font-size: 0.75rem; padding: 0.2rem 0.5rem;">⚡ Beta Hızlı Test</button>` : ''}
              </div>
            </div>
            
            <!-- Lobiye Katıl -->
            <div class="card" style="text-align: center; padding: 2.5rem 1.5rem; display: flex; flex-direction: column; justify-content: space-between; border-color: rgba(255,255,255,0.05);">
              <div>
                <div style="font-size: 3.5rem; margin-bottom: 0.5rem;">🚪</div>
                <h3>Lobiye Katıl</h3>
                <p style="color: var(--text-secondary); margin: 0.8rem 0; font-size: 0.85rem; min-height: 40px;">Mevcut bir odanın 6 haneli kodunu girerek giriş yapın.</p>
              </div>
              <div style="margin-top: 1rem;">
                <div style="max-width: 260px; margin: 0 auto;">
                  <input type="text" id="join-code" class="input" placeholder="KODU GİRİN" maxlength="6" style="width: 100%; text-transform: uppercase; text-align: center; font-weight: bold; font-size: 1.3rem; letter-spacing: 2px; padding: 0.8rem; margin-bottom: 0.8rem; border-color: rgba(255, 255, 255, 0.15);">
                  <button class="btn btn-secondary" id="btn-join-lobby" style="width: 100%; padding: 0.8rem; font-weight: bold;">Lobiye Katıl</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style="flex: 1; min-width: 280px; max-width: 350px;" id="global-players-container">
           <!-- Player list will be rendered here -->
        </div>
      </div>
    `;
  },

  renderLobby(lobbyData) {
    this.currentLobby = lobbyData;
    const isCreator = lobbyData.created_by == App.user.id;
    const isMeReady = lobbyData.players.find(p => p.user_id == App.user.id)?.is_ready == 1;
    const realPlayers = lobbyData.players.filter(p => !p.username.startsWith('bot_'));
    const allReady = lobbyData.players.length >= 2 && realPlayers.every(p => p.is_ready == 1);
    
    let html = `
      <div style="display: flex; gap: 2rem; flex-wrap: wrap; justify-content: center; max-width: 1200px; margin: 0 auto;">
        <div style="flex: 2; min-width: 300px; max-width: 600px;">
          <div class="card" style="text-align: center;">
            <h3 style="color: var(--text-secondary)">LOBİ KODU 
              ${lobbyData.is_beta === 1 ? '<span class="badge" style="background: var(--success); color: #fff; padding: 0.2rem 0.5rem; font-size: 0.7rem; border-radius: 4px; margin-left: 10px; vertical-align: middle;">BETA</span>' : ''}
              ${lobbyData.is_beta === 2 ? '<span class="badge" style="background: var(--accent); color: #000; font-weight: bold; padding: 0.2rem 0.5rem; font-size: 0.7rem; border-radius: 4px; margin-left: 10px; vertical-align: middle;">TAKTİKSEL</span>' : ''}
              ${lobbyData.is_quick ? '<span class="badge" style="background: var(--primary); color: #fff; padding: 0.2rem 0.5rem; font-size: 0.7rem; border-radius: 4px; margin-left: 5px; vertical-align: middle;">HIZLI OYUN</span>' : ''}
            </h3>
            <div class="code-display" id="lobby-code-display" title="Kopyalamak için tıkla" style="cursor: pointer;">
              ${lobbyData.code}
            </div>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 2rem;">Kodu kopyalamak için üzerine tıkla</p>
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1rem;">
              <h3 style="margin: 0;">Oyuncular</h3>
              <span class="badge" style="background: var(--bg-tertiary); padding: 0.3rem 0.8rem; border-radius: 20px;">
                ${lobbyData.players.length} / 20
              </span>
            </div>
            
            <div class="player-list">
              ${lobbyData.players.map(p => `
                <div class="player-item">
                  <div style="display: flex; align-items: center;">
                    <div class="ready-dot ${p.is_ready ? 'ready' : ''}"></div>
                    <span style="font-weight: 500; ${p.user_id == App.user.id ? 'color: var(--primary-light)' : ''}">
                      ${p.display_name} ${p.user_id == lobbyData.created_by ? '👑' : ''}
                    </span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="color: ${p.is_ready ? 'var(--success)' : 'var(--text-muted)'}; font-size: 0.85rem;">
                      ${p.is_ready ? 'Hazır' : 'Bekleniyor...'}
                    </span>
                    ${(isCreator && p.user_id != App.user.id) ? `
                      <button class="btn btn-sm btn-danger" onclick="LobbyPage.kickPlayer(${p.user_id})" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">At</button>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
            
            <div style="margin-top: 2rem; display: flex; flex-wrap: wrap; gap: 1rem;">
              <button class="btn btn-danger" id="btn-leave-lobby" style="flex: 1; min-width: 120px;">Ayrıl</button>
              <button class="btn ${isMeReady ? 'btn-secondary' : 'btn-primary'}" id="btn-toggle-ready" style="flex: 2; min-width: 180px;">
                ${isMeReady ? 'Hazır Değilim' : 'Hazırım'}
              </button>
            </div>
            
            ${isCreator ? `
              <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <button class="btn btn-secondary" onclick="App.socket.emit('add-bot', { code: '${lobbyData.code}' })" style="width: 100%; background: rgba(6, 182, 212, 0.1); border: 1px solid var(--secondary); color: var(--secondary);">
                  🤖 Bot Ekle
                </button>
                <button class="btn btn-primary" id="btn-start-game" style="width: 100%; ${!allReady ? 'opacity:0.5; cursor:not-allowed;' : 'background:var(--success)'}" ${!allReady ? 'disabled' : ''}>
                  ${!allReady ? 'Oyuncuların hazır olması bekleniyor' : 'Oyunu Başlat 🚀'}
                </button>
              </div>
            ` : ''}
          </div>
        </div>
        <div style="flex: 1; min-width: 280px; max-width: 350px;" id="global-players-container">
           <!-- Player list will be rendered here -->
        </div>
      </div>
    `;
    setTimeout(() => this.updateGlobalPlayerList(), 0);
    return html;
  },

  bind() {
    // Dashboard events
    document.getElementById('btn-create-lobby')?.addEventListener('click', async () => {
      try {
        App.showLoading();
        const data = await API.createLobby(false, false);
        App.lobbyCode = data.lobby ? data.lobby.code : data.code;
        App.lobbyId = data.lobby ? data.lobby.id : data.id;
        App.socket.emit('join-lobby', { code: App.lobbyCode });
      } catch (err) {
        App.showToast(err.message, 'error');
        App.hideLoading();
      }
    });

    document.getElementById('btn-create-quick-lobby')?.addEventListener('click', async () => {
      try {
        App.showLoading();
        const data = await API.createLobby(false, true);
        App.lobbyCode = data.lobby ? data.lobby.code : data.code;
        App.lobbyId = data.lobby ? data.lobby.id : data.id;
        App.socket.emit('join-lobby', { code: App.lobbyCode });
      } catch (err) {
        App.showToast(err.message, 'error');
        App.hideLoading();
      }
    });

    document.getElementById('btn-create-beta-lobby')?.addEventListener('click', async () => {
      try {
        App.showLoading();
        const data = await API.createLobby(true, false);
        App.lobbyCode = data.lobby ? data.lobby.code : data.code;
        App.lobbyId = data.lobby ? data.lobby.id : data.id;
        App.socket.emit('join-lobby', { code: App.lobbyCode });
      } catch (err) {
        App.showToast(err.message, 'error');
        App.hideLoading();
      }
    });

    document.getElementById('btn-create-quick-beta-lobby')?.addEventListener('click', async () => {
      try {
        App.showLoading();
        const data = await API.createLobby(true, true);
        App.lobbyCode = data.lobby ? data.lobby.code : data.code;
        App.lobbyId = data.lobby ? data.lobby.id : data.id;
        App.socket.emit('join-lobby', { code: App.lobbyCode });
      } catch (err) {
        App.showToast(err.message, 'error');
        App.hideLoading();
      }
    });

    document.getElementById('btn-create-tactical-lobby')?.addEventListener('click', async () => {
      try {
        App.showLoading();
        const data = await API.createLobby(2, false);
        App.lobbyCode = data.lobby ? data.lobby.code : data.code;
        App.lobbyId = data.lobby ? data.lobby.id : data.id;
        App.socket.emit('join-lobby', { code: App.lobbyCode });
      } catch (err) {
        App.showToast(err.message, 'error');
        App.hideLoading();
      }
    });

    document.getElementById('btn-create-quick-tactical-lobby')?.addEventListener('click', async () => {
      try {
        App.showLoading();
        const data = await API.createLobby(2, true);
        App.lobbyCode = data.lobby ? data.lobby.code : data.code;
        App.lobbyId = data.lobby ? data.lobby.id : data.id;
        App.socket.emit('join-lobby', { code: App.lobbyCode });
      } catch (err) {
        App.showToast(err.message, 'error');
        App.hideLoading();
      }
    });

    document.getElementById('btn-join-lobby')?.addEventListener('click', async () => {
      const code = document.getElementById('join-code').value.trim().toUpperCase();
      if (code.length !== 6) return App.showToast('Lobi kodu 6 haneli olmalıdır', 'error');
      
      try {
        App.showLoading();
        await API.joinLobby(code);
        App.lobbyCode = code;
        App.socket.emit('join-lobby', { code });
      } catch (err) {
        App.showToast(err.message, 'error');
        App.hideLoading();
      }
    });

    // Lobby events
    document.getElementById('btn-toggle-ready')?.addEventListener('click', () => {
      if (App.lobbyCode) {
        App.socket.emit('toggle-ready', { code: App.lobbyCode });
      }
    });

    document.getElementById('btn-leave-lobby')?.addEventListener('click', async () => {
      if (App.lobbyCode) {
        App.showDashboard();
      }
    });

    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      if (App.lobbyCode) {
        App.socket.emit('start-game', { code: App.lobbyCode });
        App.showLoading();
      }
    });

    document.getElementById('lobby-code-display')?.addEventListener('click', (e) => {
      navigator.clipboard.writeText(e.target.innerText.trim());
      App.showToast('Lobi kodu kopyalandı', 'success');
    });
  },

  kickPlayer(userId) {
    if (confirm('Bu oyuncuyu lobiden atmak istediğinize emin misiniz?')) {
      App.socket.emit('kick-player', { code: App.lobbyCode, userId: parseInt(userId) });
    }
  },

  updateGlobalPlayerList() {
    const container = document.getElementById('global-players-container');
    if (!container) return;
    
    const allUsers = App.allUsers || [];
    const onlineIds = App.onlineUserIds || [];
    const inLobbyIds = App.inLobbyUserIds || [];
    
    const sorted = [...allUsers].sort((a, b) => {
       const aOnline = onlineIds.includes(a.id);
       const bOnline = onlineIds.includes(b.id);
       if (aOnline && !bOnline) return -1;
       if (!aOnline && bOnline) return 1;
       return a.display_name.localeCompare(b.display_name);
    });
    
    const onlineCount = allUsers.filter(u => onlineIds.includes(u.id)).length;
    const isLobbyLeader = this.currentLobby && this.currentLobby.created_by == App.user.id && App.currentPage === 'lobby';
    
    let html = `
      <div class="card" style="padding: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1rem;">
          <h3 style="margin: 0; font-size: 1.1rem;">Kayıtlı Oyuncular</h3>
          <span class="badge" style="background: var(--bg-tertiary); padding: 0.3rem 0.6rem; border-radius: 20px; font-size: 0.8rem; color: var(--success);">
            ${onlineCount} / ${allUsers.length} Çevrimiçi
          </span>
        </div>
        <div style="max-height: 400px; overflow-y: auto; padding-right: 0.5rem;" class="custom-scrollbar">
    `;
    
    if (sorted.length === 0) {
       html += `<p style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">Henüz kimse yok.</p>`;
    } else {
       sorted.forEach(u => {
          const isOnline = onlineIds.includes(u.id);
          const isMe = u.id === App.user.id;
          const isInLobby = inLobbyIds.includes(u.id);
          
          let actionBtn = '';
          if (isLobbyLeader && !isMe) {
             if (isInLobby) {
                actionBtn = `<span style="color: var(--accent); font-size: 0.8rem; font-weight: bold; margin-right: 0.5rem; text-shadow: 0 0 5px var(--accent);">Oyunda</span>`;
             } else {
                actionBtn = `<button class="btn btn-sm btn-secondary" onclick="LobbyPage.invitePlayer(${u.id})" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; min-width: auto; background: rgba(124, 58, 237, 0.2); border-color: var(--primary);">Davet Et</button>`;
             }
          } else if (!isMe && isInLobby) {
             actionBtn = `<span style="color: var(--accent); font-size: 0.8rem; font-weight: bold; margin-right: 0.5rem; text-shadow: 0 0 5px var(--accent);">Oyunda</span>`;
          }
          
          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${isOnline ? 'var(--success)' : 'var(--text-muted)'}; box-shadow: ${isOnline ? '0 0 8px var(--success)' : 'none'};"></div>
                <span style="font-size: 0.95rem; ${isOnline ? 'color: var(--text);' : 'color: var(--text-muted);'} ${isMe ? 'font-weight: bold; color: var(--primary-light);' : ''}">
                  ${u.display_name} ${isMe ? '(Sen)' : ''}
                </span>
              </div>
              ${actionBtn}
            </div>
          `;
       });
    }
    
    html += `
        </div>
      </div>
    `;
    container.innerHTML = html;
  },

  invitePlayer(userId) {
     if (this.currentLobby) {
        App.socket.emit('invite-player', { code: this.currentLobby.code, targetUserId: userId });
        App.showToast('Davet gönderildi!', 'success');
     }
  },

  async acceptInvite(code) {
     const joinCodeInput = document.getElementById('join-code');
     if (joinCodeInput) joinCodeInput.value = code;
     
     try {
        App.showLoading();
        await API.joinLobby(code);
        App.lobbyCode = code;
        App.socket.emit('join-lobby', { code });
     } catch (err) {
        App.showToast(err.message, 'error');
        App.hideLoading();
     }
  }
};
