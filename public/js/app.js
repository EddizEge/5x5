const App = {
  user: null,
  socket: null,
  currentPage: null,
  lobbyCode: null,
  lobbyId: null,
  allUsers: [],
  onlineUserIds: [],
  inLobbyUserIds: [],

  async init() {
    if (API.token) {
      try {
        const data = await API.getMe();
        this.user = data; // the backend GET /me might return user directly depending on implementation
        if (data.user) this.user = data.user;
        if (this.user && !localStorage.getItem('5x5_active_server')) {
          localStorage.setItem('5x5_active_server', this.user.server || 'OIMSFKTS');
        }
        
        this.setupSocket();
        this.showDashboard();
      } catch (err) {
        API.clearToken();
        this.showAuth();
      }
    } else {
      this.showAuth();
    }
  },

  renderApp() {
    document.getElementById('app').innerHTML = `
      <nav class="navbar">
        <div class="navbar-brand" onclick="App.showDashboard()">
          <span class="logo">5X5</span>
        </div>
        <div class="navbar-menu">
          ${Number(this.user?.is_admin) === 1 ? `
            <select id="navbar-server-select" onchange="App.switchServer(this.value)" style="background: var(--bg-tertiary); color: var(--accent); border: 1px solid var(--border); border-radius: 4px; padding: 0.25rem 0.5rem; font-family: inherit; font-size: 0.85rem; font-weight: bold; cursor: pointer; margin-right: 0.8rem; outline: none; transition: border-color 0.2s;">
              <option value="OIMSFKTS" ${localStorage.getItem('5x5_active_server') === 'OIMSFKTS' ? 'selected' : ''}>OIMSFKTS</option>
              <option value="YENİ SERVER" ${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? 'selected' : ''}>YENİ SERVER</option>
            </select>
          ` : `
            <span style="font-size: 0.8rem; font-weight: bold; color: var(--accent); background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.2); padding: 4px 10px; border-radius: 4px; margin-right: 0.8rem; letter-spacing: 0.5px;">
              🌐 Sunucu: ${localStorage.getItem('5x5_active_server') || this.user?.server || 'OIMSFKTS'}
            </span>
          `}
          ${this.user?.is_admin ? '<button class="btn btn-sm btn-secondary" onclick="App.showAdmin()">⚙️ Admin</button>' : ''}
          <span class="user-info">👤 ${this.user?.display_name || this.user?.username}</span>
          <button class="btn btn-sm btn-danger" onclick="App.logout()">Çıkış</button>
        </div>
      </nav>
      <main id="main-content"></main>
      <div id="toast-container" class="toast-container"></div>
      <div id="loading-overlay" class="loading-overlay hidden">
        <div class="spinner"></div>
      </div>
      <div id="modal-overlay" class="modal-overlay hidden"></div>
      
      <!-- Chat Widgets -->
      <div id="global-chat-widget" class="chat-widget global-chat hidden">
        <div class="chat-header" onclick="App.toggleGlobalChat()">
          <span>💬 Genel Sohbet</span>
          <span id="global-chat-badge" class="chat-badge hidden">0</span>
        </div>
        <div class="chat-body" id="global-chat-body">
          <div class="chat-messages custom-scrollbar" id="global-chat-messages"></div>
          <div class="chat-input-wrapper">
            <input type="text" id="global-chat-input" placeholder="Mesaj yaz..." onkeypress="if(event.key==='Enter') App.sendGlobalChat()">
            <button onclick="App.sendGlobalChat()">Gönder</button>
          </div>
        </div>
      </div>
      
      <div id="lobby-chat-widget" class="chat-widget lobby-chat hidden">
        <div class="chat-header" onclick="App.toggleLobbyChat()">
          <span>🎮 Oyun Sohbeti</span>
          <span id="lobby-chat-badge" class="chat-badge hidden">0</span>
        </div>
        <div class="chat-body" id="lobby-chat-body">
          <div class="chat-messages custom-scrollbar" id="lobby-chat-messages"></div>
          <div class="chat-input-wrapper">
            <input type="text" id="lobby-chat-input" placeholder="Mesaj yaz..." onkeypress="if(event.key==='Enter') App.sendLobbyChat()">
            <button onclick="App.sendLobbyChat()">Gönder</button>
          </div>
        </div>
      </div>
    `;
  },

  showAuth() {
    this.currentPage = 'auth';
    document.getElementById('app').innerHTML = AuthPage.render();
    AuthPage.bind();
  },

  showDashboard() {
    if (this.lobbyCode && this.currentPage !== 'dashboard') {
      if (this.socket) this.socket.emit('leave-lobby', { code: this.lobbyCode });
      this.lobbyCode = null;
      this.lobbyId = null;
    }

    if(this.currentPage === 'auth') this.renderApp();
    if(this.currentPage === null) this.renderApp();
    
    this.currentPage = 'dashboard';
    document.getElementById('main-content').innerHTML = LobbyPage.renderDashboard();
    LobbyPage.bind();
    this.updateChatVisibility();
  },

  showLobby(lobbyData) {
    if(this.currentPage !== 'lobby' && this.currentPage !== 'dashboard') this.renderApp();
    this.currentPage = 'lobby';
    document.getElementById('main-content').innerHTML = LobbyPage.renderLobby(lobbyData);
    LobbyPage.bind();
    App.hideLoading();
    this.updateChatVisibility();
  },

  showDraft(picks) {
    this.currentPage = 'draft';
    document.getElementById('main-content').innerHTML = GamePage.renderDraft(picks);
    GamePage.bind();
    App.hideLoading();
    this.updateChatVisibility();
  },

  showActiveDraft(data) {
    this.currentPage = 'activeDraft';
    document.getElementById('main-content').innerHTML = GamePage.renderActiveDraft(data);
    GamePage.bindActiveDraft();
    App.hideLoading();
    this.updateChatVisibility();
  },

  showBranch(branchData) {
    this.currentPage = 'branch';
    document.getElementById('main-content').innerHTML = GamePage.renderBranch(branchData);
    GamePage.bind();
    App.hideLoading();
    this.updateChatVisibility();
  },

  showBranchResults(data) {
    this.currentPage = 'branchResults';
    document.getElementById('main-content').innerHTML = GamePage.renderBranchResults(data);
    GamePage.bind();
    App.hideLoading();
    this.updateChatVisibility();
  },

  showFinalResults(data) {
    this.currentPage = 'finalResults';
    document.getElementById('main-content').innerHTML = GamePage.renderFinalResults(data);
    GamePage.bind();
    App.hideLoading();
    this.updateChatVisibility();
  },

  showAdmin() {
    if (this.lobbyCode) {
      if (this.socket) this.socket.emit('leave-lobby', { code: this.lobbyCode });
      this.lobbyCode = null;
      this.lobbyId = null;
    }

    this.currentPage = 'admin';
    document.getElementById('main-content').innerHTML = AdminPage.render();
    AdminPage.loadData();
    this.updateChatVisibility();
  },

  returnToLobby() {
    this.socket.emit('reset-lobby', { code: this.lobbyCode });
  },

  setupSocket() {
    if (this.socket) this.socket.disconnect();
    
    const activeServer = localStorage.getItem('5x5_active_server') || (this.user ? this.user.server : 'OIMSFKTS');
    this.socket = io({
      auth: { 
        token: API.token,
        server: activeServer
      }
    });

    this.socket.on('connect', () => console.log('Socket connected'));
    
    this.socket.on('users-list', (users) => {
      App.allUsers = users;
      if (typeof LobbyPage !== 'undefined' && LobbyPage.updateGlobalPlayerList) LobbyPage.updateGlobalPlayerList();
    });

    this.socket.on('online-users-update', (onlineIds) => {
      App.onlineUserIds = onlineIds;
      if (typeof LobbyPage !== 'undefined' && LobbyPage.updateGlobalPlayerList) LobbyPage.updateGlobalPlayerList();
    });

    this.socket.on('in-lobby-users-update', (inLobbyIds) => {
      App.inLobbyUserIds = inLobbyIds;
      if (typeof LobbyPage !== 'undefined' && LobbyPage.updateGlobalPlayerList) LobbyPage.updateGlobalPlayerList();
    });

    this.socket.on('receive-invite', (data) => {
      const { lobbyCode, inviterName } = data;
      const html = `
        <div style="text-align: center; padding: 2rem;">
          <div style="font-size: 4rem; margin-bottom: 1rem; animation: pulse 2s infinite;">💌</div>
          <h2 style="color: var(--primary-light); margin-bottom: 1rem;">Oyun Daveti!</h2>
          <p style="font-size: 1.2rem; margin-bottom: 2rem;"><strong>${inviterName}</strong> seni oyun odasına davet ediyor.</p>
          <div style="display: flex; gap: 1rem; justify-content: center;">
             <button class="btn btn-danger" onclick="App.closeModal()" style="flex: 1;">Reddet</button>
             <button class="btn btn-primary" onclick="App.closeModal(); LobbyPage.acceptInvite('${lobbyCode}')" style="flex: 1;">Kabul Et 🚀</button>
          </div>
        </div>
      `;
      App.showModal(html);
    });
    
    this.socket.on('lobby-update', (data) => {
      // Data is lobby object with players
      App.showLobby(data);
    });

    this.socket.on('draft-result', (data) => {
      App.showDraft(data.draft);
    });

    this.socket.on('draft-round-start', (data) => {
      App.showActiveDraft(data);
    });

    this.socket.on('draft-tick', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.updateDraftTimer) GamePage.updateDraftTimer(data.timeRemaining);
    });

    this.socket.on('draft-round-end', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.renderDraftRoundEnd) GamePage.renderDraftRoundEnd(data);
    });

    this.socket.on('tactics-phase-start', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.showTacticsPanel) {
         GamePage.showTacticsPanel(data);
      }
    });

    this.socket.on('tactics-phase-timer', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.updateTacticsTimer) {
         GamePage.updateTacticsTimer(data.timeRemaining);
      }
    });

    this.socket.on('player-tactics-submitted', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.updateTacticsSubmissionStatus) {
         GamePage.updateTacticsSubmissionStatus(data);
      }
    });

    this.socket.on('tactics-phase-end', () => {
      if (typeof GamePage !== 'undefined' && GamePage.hideTacticsPanel) {
         GamePage.hideTacticsPanel();
      }
    });

    this.socket.on('simulation-start', (data) => {
      App.showBranch(data);
    });

    this.socket.on('simulation-text', (data) => {
      GamePage.addSimulationLine(data);
    });

    this.socket.on('simulation-match-start', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.startSimulationMatch) {
        GamePage.startSimulationMatch(data);
      }
    });

    this.socket.on('football-v2-match', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.renderFootballV2Match) {
        GamePage.renderFootballV2Match(data);
      }
    });

    this.socket.on('branch-complete', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.renderBranchResultsInline) {
         GamePage.renderBranchResultsInline(data);
      }
    });

    this.socket.on('simulation-match-end', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.finishSimulationMatch) {
         GamePage.finishSimulationMatch(data);
      }
    });

    this.socket.on('branch-ready-update', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.updateReadyCount) GamePage.updateReadyCount(data);
    });

    this.socket.on('branch-ready-timer', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.updateReadyTimer) GamePage.updateReadyTimer(data);
    });

    this.socket.on('tournament-complete', (data) => {
      App.showFinalResults(data);
    });

    this.socket.on('speed-update', (data) => {
      if (typeof GamePage !== 'undefined' && GamePage.updateSpeedUI) GamePage.updateSpeedUI(data.speed);
    });

    this.socket.on('kicked', (data) => {
      if (App.user && App.user.id === data.userId) {
        App.showToast('Lobiden atıldınız.', 'error');
        App.lobbyCode = null;
        App.showDashboard();
      }
    });

    this.socket.on('error', (data) => {
      App.showToast(data.message || data, 'error');
      App.hideLoading();
    });

    this.socket.on('global-chat-message', (msg) => {
       App.appendChatMessage('global', msg);
    });
    
    this.socket.on('global-chat-history', (msgs) => {
       const container = document.getElementById('global-chat-messages');
       if (container) {
          container.innerHTML = '';
          msgs.forEach(m => App.appendChatMessage('global', m, true));
       }
    });

    this.socket.on('lobby-chat-message', (msg) => {
       App.appendChatMessage('lobby', msg);
    });

    this.socket.on('lobby-chat-history', (msgs) => {
       const container = document.getElementById('lobby-chat-messages');
       if (container) {
          container.innerHTML = '';
          msgs.forEach(m => App.appendChatMessage('lobby', m, true));
       }
    });

    this.socket.on('chat-message-deleted', (data) => {
       const el = document.getElementById(`chat-msg-${data.type}-${data.msgId}`);
       if (el) el.remove();
    });
  },

  updateChatVisibility() {
     const globalWidget = document.getElementById('global-chat-widget');
     const lobbyWidget = document.getElementById('lobby-chat-widget');
     if (!globalWidget || !lobbyWidget) return;
     
     if (this.currentPage === 'auth') {
        globalWidget.classList.add('hidden');
        lobbyWidget.classList.add('hidden');
     } else if (this.currentPage === 'dashboard' || this.currentPage === 'admin') {
        globalWidget.classList.remove('hidden');
        lobbyWidget.classList.add('hidden');
     } else {
        globalWidget.classList.remove('hidden');
        lobbyWidget.classList.remove('hidden');
     }
  },

  toggleGlobalChat() {
    const body = document.getElementById('global-chat-body');
    body.classList.toggle('hidden');
    const badge = document.getElementById('global-chat-badge');
    badge.classList.add('hidden');
    badge.innerText = '0';
    if (!body.classList.contains('hidden')) {
       setTimeout(() => {
          const msgs = document.getElementById('global-chat-messages');
          if(msgs) msgs.scrollTop = msgs.scrollHeight;
          document.getElementById('global-chat-input')?.focus();
       }, 50);
    }
  },

  toggleLobbyChat() {
    const body = document.getElementById('lobby-chat-body');
    body.classList.toggle('hidden');
    const badge = document.getElementById('lobby-chat-badge');
    badge.classList.add('hidden');
    badge.innerText = '0';
    if (!body.classList.contains('hidden')) {
       setTimeout(() => {
          const msgs = document.getElementById('lobby-chat-messages');
          if(msgs) msgs.scrollTop = msgs.scrollHeight;
          document.getElementById('lobby-chat-input')?.focus();
       }, 50);
    }
  },

  sendGlobalChat() {
     const input = document.getElementById('global-chat-input');
     const text = input.value.trim();
     if (text && this.socket) {
        this.socket.emit('global-chat-send', { text });
        input.value = '';
     }
  },

  sendLobbyChat() {
     const input = document.getElementById('lobby-chat-input');
     const text = input.value.trim();
     if (text && this.socket && this.lobbyCode) {
        this.socket.emit('lobby-chat-send', { code: this.lobbyCode, text });
        input.value = '';
     }
  },
  
  deleteChatMessage(type, msgId) {
     if (this.socket) {
        this.socket.emit('delete-chat-message', { type, msgId, code: this.lobbyCode });
     }
  },

  appendChatMessage(type, msg, isHistory = false) {
     const container = document.getElementById(`${type}-chat-messages`);
     if (!container) return;
     
     const isMe = msg.userId === App.user.id;
     const isAdmin = App.user.is_admin === 1 || App.user.is_admin === 2;
     const div = document.createElement('div');
     div.className = `chat-message ${isMe ? 'me' : ''}`;
     div.id = `chat-msg-${type}-${msg.id}`;
     
     const timeStr = App.formatChatTime(msg.timestamp);
     
     let deleteBtn = '';
     if (isAdmin) {
        deleteBtn = `<button class="chat-delete-btn" title="Mesajı Sil" onclick="App.deleteChatMessage('${type}', '${msg.id}')">🗑️</button>`;
     }
     
     div.innerHTML = `
        <div class="msg-info">
           <span class="sender">${msg.senderName}</span>
           <span>${timeStr} ${deleteBtn}</span>
        </div>
        <div class="msg-text">${msg.text}</div>
     `;
     container.appendChild(div);
     
     if (!isHistory) {
        const body = document.getElementById(`${type}-chat-body`);
        if (body.classList.contains('hidden')) {
           const badge = document.getElementById(`${type}-chat-badge`);
           let current = parseInt(badge.innerText) || 0;
           badge.innerText = current + 1;
           badge.classList.remove('hidden');
        } else {
           container.scrollTop = container.scrollHeight;
        }
     } else {
        container.scrollTop = container.scrollHeight;
     }
  },

  formatChatTime(ts) {
     const d = new Date(ts);
     const today = new Date();
     if (d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
        return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
     }
     return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      if(this.currentPage === 'auth') {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
      } else return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    // Force reflow
    void toast.offsetWidth;
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  showModal(html) {
    const overlay = document.getElementById('modal-overlay');
    if(overlay) {
      overlay.innerHTML = `<div class="modal">${html}</div>`;
      overlay.classList.remove('hidden');
    }
  },

  closeModal() {
    document.getElementById('modal-overlay')?.classList.add('hidden');
  },

  showLoading() {
    document.getElementById('loading-overlay')?.classList.remove('hidden');
  },

  hideLoading() {
    document.getElementById('loading-overlay')?.classList.add('hidden');
  },

  logout() {
    API.clearToken();
    this.user = null;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.showAuth();
  },

  switchServer(serverName) {
    localStorage.setItem('5x5_active_server', serverName);
    if (this.user) {
       this.user.server = serverName;
    }
    
    // Soketi yeni sunucu handshake bilgisi ile yeniden kur
    this.setupSocket();
    
    // Arayüzü güncelle
    this.renderApp();
    if (this.currentPage === 'admin') {
       this.showAdmin();
    } else {
       this.showDashboard();
    }
    
    this.showToast(`Sunucu başarıyla değiştirildi: ${serverName}`, 'success');
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
