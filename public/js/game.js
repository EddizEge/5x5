const GamePage = {
  currentBranch: null,
  branchIndex: 0,
  visualFootballActive: false,
  footballV2Active: false,
  visualShooterActive: false,
  branchIcons: {
    'lol': '🎮',
    'valorant': '🎯',
    'cs': '🔫',
    'futbol': '⚽',
    'fifa': '🕹️'
  },
  branchNames: {
    'lol': 'League of Legends',
    'valorant': 'Valorant',
    'cs': 'Counter-Strike',
    'futbol': 'Halı Saha',
    'fifa': 'FIFA'
  },

  renderDraft(picks) {
    const myPicks = picks[App.user.id] || [];
    
    let html = `
      <div style="text-align: center;">
        <h2 style="margin-bottom: 0.5rem;">Takım Seçimleri Tamamlandı!</h2>
        <p style="color: var(--text-secondary); margin-bottom: 2rem;">İşte senin rastgele oluşturulan 5 kişilik takımın:</p>
        
        <div class="draft-grid">
          ${myPicks.map((pick, i) => `
            <div class="draft-card" style="animation-delay: ${i * 0.1}s">
              <div class="draft-emoji">${pick.avatar_emoji || pick.emoji || '👤'}</div>
              <div class="draft-name">${pick.character_name || pick.name || 'Bilinmeyen'}</div>
              <div class="draft-age">${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? 'Genel Kart' : `${pick.age} Yaş`}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? '' : (pick.era_label || pick.eraLabel || '')}</div>
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top: 3rem;">
          <p style="margin-bottom: 1rem; color: var(--text-muted);">Diğer oyuncular takımlarını inceliyor...</p>
          ${LobbyPage.currentLobby?.created_by == App.user.id ? `
            <button class="btn btn-primary" id="btn-next-branch" style="max-width: 300px;">İlk Branşa Geç 🚀</button>
          ` : '<p>Lobi kurucusunun oyunu başlatması bekleniyor...</p>'}
        </div>
      </div>
    `;
    return html;
  },

  renderActiveDraft(data) {
    const myOptions = data.options[App.user.id] || [];
    let html = `
      <div style="text-align: center; padding: 2rem; max-width: 800px; margin: 0 auto;">
        <h2 style="margin-bottom: 0.5rem; color: var(--primary-light);">Draft Aşaması: ${data.round}. Seçim</h2>
        <p style="color: var(--text-muted);">Takımını kurmak için kartını seç!</p>
        
        <div style="font-size: 3rem; font-weight: bold; color: var(--accent); margin-top: 1rem; font-family: 'JetBrains Mono', monospace;" id="draft-timer">
          ${data.timeRemaining}
        </div>
        
        <div class="draft-progress-container">
          <div class="draft-progress-bar" id="draft-progress" style="width: ${(data.timeRemaining / 15) * 100}%"></div>
        </div>
        
        <div style="display: flex; gap: 2rem; justify-content: center; flex-wrap: wrap; margin-top: 2rem;" id="draft-options-container">
          ${myOptions.map(c => `
            <div class="card draft-option-card" style="cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" onclick="GamePage.selectDraftPick(${c.id}, this)">
              <div style="font-size: 4rem; margin-bottom: 1rem;">${c.avatar_emoji || '👤'}</div>
              <h3 style="margin-bottom: 0.5rem;">${c.character_name}</h3>
              <div style="color: var(--text-muted); font-size: 0.9rem;">${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? 'Genel Kart' : `${c.age} Yaş`}</div>
              <div style="color: var(--primary); font-size: 0.8rem; margin-top: 0.5rem;">${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? '' : (c.era_label || '')}</div>
            </div>
          `).join('')}
        </div>
        
        <div id="draft-waiting-msg" style="display: none; margin-top: 3rem; color: var(--text-secondary); font-size: 1.2rem;">
          Seçim yapıldı, diğer oyuncular bekleniyor...
        </div>
      </div>
      
      <style>
        .draft-progress-container {
          width: 100%;
          max-width: 500px;
          height: 6px;
          background: var(--bg-tertiary);
          border-radius: 10px;
          margin: 1rem auto;
          overflow: hidden;
          display: flex;
          justify-content: center;
        }
        .draft-progress-bar {
          height: 100%;
          background: var(--success);
          transition: width 1s linear, background-color 1s ease;
          border-radius: 10px;
        }
        .draft-option-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(124, 58, 237, 0.2);
          border-color: var(--primary-light);
        }
        .draft-option-card.selected {
          border-color: var(--accent);
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.3);
          transform: scale(1.05);
        }
      </style>
    `;
    return html;
  },

  selectDraftPick(id, el) {
    if (this.hasPicked) return;
    this.hasPicked = true;
    
    // UI update
    document.querySelectorAll('.draft-option-card').forEach(c => c.style.opacity = '0.5');
    el.style.opacity = '1';
    el.classList.add('selected');
    document.getElementById('draft-waiting-msg').style.display = 'block';
    
    // Emit selection
    App.socket.emit('draft-pick', { code: App.lobbyCode, characterEraId: id });
  },

  updateDraftTimer(time) {
    const timerEl = document.getElementById('draft-timer');
    const barEl = document.getElementById('draft-progress');
    
    if (timerEl) {
      timerEl.textContent = time;
      if (time <= 5) timerEl.style.color = 'var(--danger)';
    }
    
    if (barEl) {
      const percentage = (time / 15) * 100;
      barEl.style.width = percentage + '%';
      
      if (time > 8) {
         barEl.style.backgroundColor = 'var(--success)';
      } else if (time > 4) {
         barEl.style.backgroundColor = 'var(--accent)';
      } else {
         barEl.style.backgroundColor = 'var(--danger)';
      }
    }
  },

  renderDraftRoundEnd(data) {
    // Show a quick summary of the round maybe, or just wait for next round start
    const timerEl = document.getElementById('draft-timer');
    if (timerEl) {
      timerEl.textContent = "Tur Bitti!";
      timerEl.style.color = "var(--success)";
    }
  },

  bindActiveDraft() {
    this.hasPicked = false;
  },

  renderBranch(branchData) {
    if (window.footballVis) {
      if (typeof window.footballVis.stop === 'function') window.footballVis.stop();
      window.footballVis = null;
    }
    if (window.shooterVis) {
      if (typeof window.shooterVis.stop === 'function') window.shooterVis.stop();
      window.shooterVis = null;
    }
    if (window.footballV2Match) {
      if (typeof window.footballV2Match.stop === 'function') window.footballV2Match.stop();
      window.footballV2Match = null;
    }

    this.currentBranch = branchData.branch;
    this.footballV2Active = branchData.footballV2 === true &&
      (branchData.branch === 'futbol' || branchData.branch === 'fifa');
    this.visualFootballActive = !this.footballV2Active && branchData.visualBeta === true &&
      (branchData.branch === 'futbol' || branchData.branch === 'fifa');
    this.visualShooterActive = branchData.visualBeta === true &&
      branchData.branch === 'cs';
    const visualLayoutClass = this.visualFootballActive || this.footballV2Active
      ? 'beta-football-branch-layout'
      : (this.visualShooterActive ? 'beta-shooter-branch-layout' : '');
    const icon = this.branchIcons[branchData.branch] || '🎮';
    const name = this.branchNames[branchData.branch] || branchData.branch;
    
    // Initial overall standings
    const overallHtml = (branchData.standings || []).map((s, i) => `
      <tr class="rank-${i + 1}">
        <td style="text-align: center; font-weight: bold;">${i === 0 ? '👑' : i + 1}</td>
        <td>${s.display_name || s.displayName}</td>
        <td style="text-align: center; font-weight: bold; color: var(--accent);">${s.total_points || 0}</td>
      </tr>
    `).join('');

    return `
      <div class="${visualLayoutClass}" style="display: flex; gap: 1rem; width: 100%; padding: 0 1rem; margin: 0 auto; flex-wrap: wrap;">
        
        <!-- Sol: Maç Puan Tablosu -->
        <div style="flex: 1; min-width: 220px; max-width: 300px; background: var(--bg-tertiary); padding: 1rem 0.5rem; border-radius: 8px;">
           <h4 style="color: var(--primary-light); text-align: center; margin-bottom: 1rem; font-size: 0.95rem;">Maç Puan Tablosu</h4>
           <table class="scoreboard compact" id="live-branch-scoreboard">
             <thead>
               <tr>
                 <th style="width: 20px; text-align: center;">Sıra</th>
                 <th>Oyuncu</th>
                 <th style="text-align: center;">G</th>
                 <th style="text-align: center;">M</th>
                 <th style="text-align: center; color: var(--accent);">Puan</th>
               </tr>
             </thead>
             <tbody>
               <!-- Maçlar bitince dolacak -->
               <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1rem;">Simülasyon devam ediyor...</td></tr>
             </tbody>
           </table>
        </div>
        
        <!-- Orta: Simülasyon Terminali -->
        <div class="simulation-container" style="flex: 2; min-width: 400px;">
          <div class="branch-header">
            <div class="branch-icon">${icon}</div>
            <div class="branch-title">${name}</div>
            <p style="color: var(--text-secondary); margin-top: 0.5rem;">Maçlar Simüle Ediliyor...</p>
          </div>
          
          <div id="tactics-configuration-panel" style="display: none; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; text-align: left; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
             <!-- Dinamik Taktik Ekranı -->
          </div>
          
          <div class="live-scoreboard" style="display: ${this.visualFootballActive || this.footballV2Active || this.visualShooterActive ? 'none' : 'flex'}; justify-content: center; gap: 2rem; margin-bottom: 1.5rem; align-items: center; background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;">
            <div style="font-size: 1.2rem; color: var(--primary-light); flex: 1; text-align: right;" id="team1-name">Takım 1</div>
            <div style="font-size: 2.5rem; font-weight: bold; color: var(--accent); width: 40px; text-align: center;" id="live-score-t1">0</div>
            <div style="font-size: 1.5rem;">-</div>
            <div style="font-size: 2.5rem; font-weight: bold; color: var(--accent); width: 40px; text-align: center;" id="live-score-t2">0</div>
            <div style="font-size: 1.2rem; color: var(--danger); flex: 1; text-align: left;" id="team2-name">Takım 2</div>
          </div>

          <div id="shared-stats-container" style="display: none; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;"></div>
          <div id="detailed-scoreboard" style="display: none; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
             <div id="t1-details" style="flex: 1; min-width: 250px; background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; overflow-x: auto;"></div>
             <div id="t2-details" style="flex: 1; min-width: 250px; background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; overflow-x: auto;"></div>
          </div>
          
          ${this.visualFootballActive && window.FootballMatchViewer
            ? window.FootballMatchViewer.render(branchData.branch)
            : ''}
          ${this.footballV2Active && window.FootballV2Lab
            ? window.FootballV2Lab.render({ rootId: 'football-v2-live-match' })
            : ''}
          ${this.visualShooterActive && window.ShooterMatchViewer
            ? window.ShooterMatchViewer.render()
            : ''}

          <div class="simulation-terminal ${this.visualFootballActive ? 'fm-commentary-terminal' : (this.visualShooterActive ? 'sv-commentary-terminal' : '')}" id="sim-terminal">
            <div class="simulation-line">Sistem başlatılıyor...</div>
            <div class="simulation-line">Eşleşmeler hazırlanıyor...</div>
          </div>
          
          <div id="branch-actions-container" style="display: none; text-align: center; margin-top: 2rem;">
             <div id="ready-timer-display" style="display: none; font-size: 1.5rem; font-weight: bold; color: var(--accent); margin-bottom: 1rem;">
               Otomatik Başlıyor: <span id="ready-timer-seconds">15</span>
             </div>
             <button class="btn btn-primary" id="btn-branch-ready" style="max-width: 300px;">Sıradaki Karşılaşmaya Geç</button>
          </div>

          ${LobbyPage.currentLobby?.created_by == App.user.id ? `
            <div style="margin-top: 1rem; text-align: center;" id="speed-controls-wrapper">
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">Simülasyon Hızı</p>
              <div style="display: flex; gap: 0.5rem; justify-content: center;">
                <button class="btn btn-sm btn-primary" onclick="GamePage.setSpeed(1)" id="speed-btn-1">Yavaş (1x)</button>
                <button class="btn btn-sm btn-secondary" onclick="GamePage.setSpeed(2)" id="speed-btn-2">Orta (2x)</button>
                <button class="btn btn-sm btn-secondary" onclick="GamePage.setSpeed(4)" id="speed-btn-4">Hızlı (4x)</button>
                <button class="btn btn-sm btn-secondary" onclick="GamePage.setSpeed(5)" id="speed-btn-5">Çok Hızlı (5x)</button>
                <button class="btn btn-sm btn-secondary" onclick="GamePage.setSpeed(20)" id="speed-btn-20">Işık Hızı (20x)</button>
              </div>
            </div>
          ` : `
            <div style="margin-top: 1rem; text-align: center;" id="speed-controls-wrapper">
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">Mevcut Simülasyon Hızı</p>
              <div class="badge" id="current-speed-display" style="background: var(--bg-tertiary); padding: 0.5rem 1rem;">Yavaş (1x)</div>
            </div>
          `}
        </div>

        <!-- Sağ: Genel Puan Tablosu -->
        <div style="flex: 1; min-width: 220px; max-width: 300px; background: var(--bg-tertiary); padding: 1rem 0.5rem; border-radius: 8px;">
           <h4 style="color: var(--accent); text-align: center; margin-bottom: 1rem; font-size: 0.95rem;">Genel Puan Tablosu</h4>
           <table class="scoreboard compact" id="live-overall-scoreboard">
             <thead>
               <tr>
                 <th style="width: 20px; text-align: center;">Sıra</th>
                 <th>Oyuncu</th>
                 <th style="text-align: center; color: var(--accent);">Toplam</th>
               </tr>
             </thead>
             <tbody>
               ${overallHtml}
             </tbody>
           </table>
        </div>
      </div>
    `;
  },
  
  setSpeed(speed) {
    if (App.lobbyCode) {
      App.socket.emit('set-speed', { code: App.lobbyCode, speed });
    }
  },
  
  updateSpeedUI(speed) {
    window.currentSimulationSpeed = speed;
    if (window.footballV2Match?.setSpeed) window.footballV2Match.setSpeed(speed);
    if (window.shooterVis?.setSpeed) window.shooterVis.setSpeed(speed);
    if (LobbyPage.currentLobby?.created_by == App.user.id) {
      [1, 2, 4, 5, 20].forEach(i => {
        const btn = document.getElementById('speed-btn-' + i);
        if (btn) {
          if (i === speed) {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
          } else {
            btn.classList.add('btn-secondary');
            btn.classList.remove('btn-primary');
          }
        }
      });
    } else {
      const display = document.getElementById('current-speed-display');
      if (display) {
         if (speed === 1) display.textContent = 'Yavaş (1x)';
         else if (speed === 2) display.textContent = 'Orta (2x)';
         else if (speed === 4) display.textContent = 'Hızlı (4x)';
         else if (speed === 5) display.textContent = 'Çok Hızlı (5x)';
         else if (speed === 20) display.textContent = 'Işık Hızı (20x)';
      }
    }
  },

  renderFootballV2Match(data) {
    if (!this.footballV2Active || !window.FootballV2Lab || !data?.match) return;
    if (window.footballV2Match?.stop) window.footballV2Match.stop();
    const root = document.getElementById('football-v2-live-match');
    if (!root) return;
    window.footballV2Match = window.FootballV2Lab.mount('football-v2-live-match');
    window.footballV2Match.setSpeed(window.currentSimulationSpeed || 1);
    window.footballV2Match.load(data.match);
    const terminal = document.getElementById('sim-terminal');
    if (terminal) {
      terminal.classList.add('fm-commentary-terminal');
      terminal.innerHTML = '';
      [
        '🧠 Futbol V2 tam maç dünya durumu alındı.',
        `${data.player1Name} ${data.match.score[1]} - ${data.match.score[2]} ${data.player2Name}`,
        `Seed: ${data.match.seed}`
      ].forEach(text => {
        const line = document.createElement('div');
        line.className = 'simulation-line';
        line.textContent = text;
        terminal.appendChild(line);
      });
    }
  },

  showTacticsPanel(data) {
     this.tacticsData = data;
     
     const liveScoreboard = document.querySelector('.live-scoreboard');
     if (liveScoreboard) liveScoreboard.style.display = 'none';
     const sharedStats = document.getElementById('shared-stats-container');
     if (sharedStats) sharedStats.style.display = 'none';
     const detailedScoreboard = document.getElementById('detailed-scoreboard');
     if (detailedScoreboard) detailedScoreboard.style.display = 'none';
     const visualPitch = document.getElementById('visual-pitch');
     if (visualPitch) visualPitch.style.display = 'none';
     const footballViewer = document.getElementById('football-manager-viewer');
     if (footballViewer) footballViewer.style.display = 'none';
     const footballV2Viewer = document.getElementById('football-v2-live-match');
     if (footballV2Viewer) footballV2Viewer.style.display = 'none';
     const simTerminal = document.getElementById('sim-terminal');
     if (simTerminal) simTerminal.style.display = 'none';
     const speedControls = document.getElementById('speed-controls-wrapper');
     if (speedControls) speedControls.style.display = 'none';
     
     const panel = document.getElementById('tactics-configuration-panel');
     if (!panel) return;
     panel.style.display = 'block';
     
     const myPicks = data.picks[App.user.id] || [];
     const branch = data.branch;
     const timerText = (data.timeRemaining !== null && data.timeRemaining !== undefined) ? data.timeRemaining + 's' : 'Süre Sınırı Yok';
     
     let tacticsHtml = '';
     
     if (branch === 'lol') {
        const lanes = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
        tacticsHtml = `
           <h3 style="color: var(--primary-light); margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
              <span>🎮 League of Legends Koridor & Oyun Tarzı Seçimi</span>
              <span id="tactics-timer" style="color: var(--accent); font-weight: bold; background: rgba(0,0,0,0.4); padding: 0.3rem 0.8rem; border-radius: 20px; border: 1px solid var(--border);">${timerText}</span>
           </h3>
           
           <div style="margin-bottom: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">Takım Oyun Stili:</label>
              <div style="display: flex; gap: 1rem;">
                 <label class="card-radio" style="flex: 1; padding: 1rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="lol-style" value="agresif" checked onchange="GamePage.updateDynamicRatings()" style="margin-right: 0.5rem;"> <strong>Agresif</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Erken oyunda koridorları ittirir, skora oynar.</div>
                 </label>
                 <label class="card-radio" style="flex: 1; padding: 1rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="lol-style" value="pasif" onchange="GamePage.updateDynamicRatings()" style="margin-right: 0.5rem;"> <strong>Pasif</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Güvenli oynar, minyon biçmeye ve geç oyuna odaklanır.</div>
                 </label>
              </div>
           </div>
           
           <div style="margin-bottom: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 1rem; color: var(--accent);">Koridor Dağılımı (Mevkiler):</label>
              <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                 ${myPicks.map((pick, i) => `
                    <div style="display: flex; flex-direction: column; background: rgba(0,0,0,0.2); padding: 0.8rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); gap: 0.5rem;">
                       <div style="display: flex; align-items: center; justify-content: space-between;">
                          <span style="font-weight: 500;">${pick.avatar_emoji || '👤'} ${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? '' : `${pick.age} yaş `}${pick.character_name}</span>
                          <select class="lol-lane-select input" data-era-id="${pick.character_era_id}" onchange="GamePage.updateDynamicRatings()" style="width: 150px; background: var(--bg-tertiary); border: 1px solid var(--border); color: #fff; padding: 0.3rem 0.5rem; border-radius: 4px;">
                             ${lanes.map((lane, j) => `<option value="${lane}" ${i === j ? 'selected' : ''}>${lane}</option>`).join('')}
                          </select>
                       </div>
                       <div id="final-rating-${pick.character_era_id}" style="font-size: 0.85rem; color: var(--accent);">Hesaplanıyor...</div>
                    </div>
                 `).join('')}
              </div>
           </div>
        `;
     }
     else if (branch === 'valorant') {
        const roles = ['Sentinel', 'Duelist', 'Smoker', 'Öncü'];
        tacticsHtml = `
           <h3 style="color: var(--primary-light); margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
              <span>🎯 Valorant Rol & Oyun Tarzı Seçimi</span>
              <span id="tactics-timer" style="color: var(--accent); font-weight: bold; background: rgba(0,0,0,0.4); padding: 0.3rem 0.8rem; border-radius: 20px; border: 1px solid var(--border);">${timerText}</span>
           </h3>
           
           <div style="margin-bottom: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">Takım Oyun Stili:</label>
              <div style="display: flex; gap: 1rem;">
                 <label class="card-radio" style="flex: 1; padding: 1rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="valorant-style" value="agresif" checked onchange="GamePage.updateDynamicRatings()" style="margin-right: 0.5rem;"> <strong>Agresif</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Hızlı girişler yapar, agresif peekler.</div>
                 </label>
                 <label class="card-radio" style="flex: 1; padding: 1rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="valorant-style" value="pasif" onchange="GamePage.updateDynamicRatings()" style="margin-right: 0.5rem;"> <strong>Pasif</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Info toplayıp yavaş oynar, default kurar.</div>
                 </label>
              </div>
           </div>
           
           <div style="margin-bottom: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 1rem; color: var(--accent);">Karakter Rolleri (Birden fazla aynı rol seçilebilir):</label>
              <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                 ${myPicks.map((pick, i) => `
                    <div style="display: flex; flex-direction: column; background: rgba(0,0,0,0.2); padding: 0.8rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); gap: 0.5rem;">
                       <div style="display: flex; align-items: center; justify-content: space-between;">
                          <span style="font-weight: 500;">${pick.avatar_emoji || '👤'} ${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? '' : `${pick.age} yaş `}${pick.character_name}</span>
                          <select class="valorant-role-select input" data-era-id="${pick.character_era_id}" onchange="GamePage.updateDynamicRatings()" style="width: 150px; background: var(--bg-tertiary); border: 1px solid var(--border); color: #fff; padding: 0.3rem 0.5rem; border-radius: 4px;">
                             ${roles.map((role, j) => `<option value="${role}" ${i % roles.length === j ? 'selected' : ''}>${role}</option>`).join('')}
                          </select>
                       </div>
                       <div id="final-rating-${pick.character_era_id}" style="font-size: 0.85rem; color: var(--accent);">Hesaplanıyor...</div>
                    </div>
                 `).join('')}
              </div>
           </div>
        `;
     }
     else if (branch === 'cs') {
        tacticsHtml = `
           <h3 style="color: var(--primary-light); margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
              <span>🔫 CS:GO / CS2 Taktik Ayarı</span>
              <span id="tactics-timer" style="color: var(--accent); font-weight: bold; background: rgba(0,0,0,0.4); padding: 0.3rem 0.8rem; border-radius: 20px; border: 1px solid var(--border);">${timerText}</span>
           </h3>
           
           <div style="margin-bottom: 2rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 1rem; color: var(--accent);">Oyun Stili (Agresiflik Ayarı):</label>
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                 <label class="card-radio" style="padding: 1.2rem; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="cs-style" value="agresif" checked onchange="GamePage.updateDynamicRatings()" style="margin-right: 0.8rem; transform: scale(1.2);"> <strong style="font-size: 1.1rem;">🔥 Agresif Hücum</strong>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.4rem; padding-left: 2rem;">Hızlı rushlar, agresif AWP peekleri ve yüksek tempolu düellolar odaklı oyun stili.</div>
                 </label>
                 <label class="card-radio" style="padding: 1.2rem; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="cs-style" value="pasif" onchange="GamePage.updateDynamicRatings()" style="margin-right: 0.8rem; transform: scale(1.2);"> <strong style="font-size: 1.1rem;">🛡️ Kontrollü Pasif</strong>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.4rem; padding-left: 2rem;">Utility (bomba) kullanımı öncelikli, alan kontrolü ve trade-kill odaklı sakin oyun stili.</div>
                 </label>
              </div>
           </div>

           <div style="margin-bottom: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 1rem; color: var(--accent);">Oyuncu Güç Durumu:</label>
              <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                 ${myPicks.map(pick => `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 0.8rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                       <span style="font-weight: 500;">${pick.avatar_emoji || '👤'} ${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? '' : `${pick.age} yaş `}${pick.character_name}</span>
                       <div id="final-rating-${pick.character_era_id}" style="font-size: 0.85rem; color: var(--accent);">Hesaplanıyor...</div>
                    </div>
                 `).join('')}
              </div>
           </div>
        `;
     }
     else if (branch === 'futbol') {
        tacticsHtml = `
           <h3 style="color: var(--primary-light); margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
              <span>⚽ Halı Saha Oyun Stili & Diziliş Seçimi</span>
              <span id="tactics-timer" style="color: var(--accent); font-weight: bold; background: rgba(0,0,0,0.4); padding: 0.3rem 0.8rem; border-radius: 20px; border: 1px solid var(--border);">${timerText}</span>
           </h3>
           
           <div style="margin-bottom: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">Takım Stili & Diziliş Seçimi:</label>
              <div style="display: flex; gap: 1rem;">
                 <label class="card-radio" style="flex: 1; padding: 0.8rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="futbol-style" value="defansif" onchange="GamePage.updateHalisahaSlots('defansif'); GamePage.updateDynamicRatings();" style="margin-right: 0.3rem;"> <strong>Defansif</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">3 Defans - 1 Orta - 1 Hücum</div>
                 </label>
                 <label class="card-radio" style="flex: 1; padding: 0.8rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="futbol-style" value="dengeli" checked onchange="GamePage.updateHalisahaSlots('dengeli'); GamePage.updateDynamicRatings();" style="margin-right: 0.3rem;"> <strong>Dengeli</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">2 Defans - 2 Orta - 1 Hücum</div>
                 </label>
                 <label class="card-radio" style="flex: 1; padding: 0.8rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="futbol-style" value="ofansif" onchange="GamePage.updateHalisahaSlots('ofansif'); GamePage.updateDynamicRatings();" style="margin-right: 0.3rem;"> <strong>Ofansif</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">2 Defans - 1 Orta - 2 Hücum</div>
                 </label>
              </div>
           </div>
           
           <div style="margin-bottom: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 1rem; color: var(--accent);">Oyuncuları Mevkilere Yerleştir:</label>
              <div id="halisaha-slots-container" style="display: flex; flex-direction: column; gap: 0.8rem;">
                 <!-- Diziliş slotları dinamik dolacak -->
              </div>
           </div>

           <div style="margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 0.8rem; color: var(--accent);">Oyuncu Nihai Güç Değerleri:</label>
              <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                 ${myPicks.map(pick => `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.1); padding: 0.6rem 0.8rem; border-radius: 6px;">
                       <span>${pick.avatar_emoji || '👤'} ${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? '' : `${pick.age} yaş `}${pick.character_name}</span>
                       <div id="final-rating-${pick.character_era_id}" style="font-size: 0.85rem; color: var(--accent);">Hesaplanıyor...</div>
                    </div>
                 `).join('')}
              </div>
           </div>
        `;
     }
     else if (branch === 'fifa') {
        const positions = ['LB (Sol Bek)', 'LCB (Stoper)', 'RCB (Stoper)', 'RB (Sağ Bek)', 'LDM (Ön Libero)', 'RDM (Ön Libero)', 'LAM (Sol Ofansif)', 'CAM (Oyun Kurucu)', 'RAM (Sağ Ofansif)', 'ST (Forvet)'];
        const defaultPositions = ['LB (Sol Bek)', 'LCB (Stoper)', 'CAM (Oyun Kurucu)', 'ST (Forvet)', 'LDM (Ön Libero)'];
        tacticsHtml = `
           <h3 style="color: var(--primary-light); margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
              <span>🕹️ FIFA 4-2-3-1 Taktik & Diziliş Seçimi</span>
              <span id="tactics-timer" style="color: var(--accent); font-weight: bold; background: rgba(0,0,0,0.4); padding: 0.3rem 0.8rem; border-radius: 20px; border: 1px solid var(--border);">${timerText}</span>
           </h3>
           
           <div style="margin-bottom: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">Takım Stili:</label>
              <div style="display: flex; gap: 1rem;">
                 <label class="card-radio" style="flex: 1; padding: 0.8rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="fifa-style" value="defansif" onchange="GamePage.updateDynamicRatings()" style="margin-right: 0.3rem;"> <strong>Defansif</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Yarı sahada bekler, kontra atak arar.</div>
                 </label>
                 <label class="card-radio" style="flex: 1; padding: 0.8rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="fifa-style" value="dengeli" checked onchange="GamePage.updateDynamicRatings()" style="margin-right: 0.3rem;"> <strong>Dengeli</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Kademeli hücum, standart oyun temposu.</div>
                 </label>
                 <label class="card-radio" style="flex: 1; padding: 0.8rem; text-align: center; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); display: block;">
                    <input type="radio" name="fifa-style" value="ofansif" onchange="GamePage.updateDynamicRatings()" style="margin-right: 0.3rem;"> <strong>Ofansif</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Tam saha baskı, hücum ağırlıklı oyun stili.</div>
                 </label>
              </div>
           </div>
           
           <div style="margin-bottom: 1.5rem;">
              <label style="display: block; font-weight: bold; margin-bottom: 1rem; color: var(--accent);">4-2-3-1 Diziliş Yerleşimi (Sahanın Üzerinde):</label>
              
              <!-- Mini Futbol Sahası Görseli -->
              <div style="width: 100%; height: 260px; background: radial-gradient(circle, #2e7d32 10%, #1b5e20 90%); border: 2px solid rgba(255,255,255,0.2); border-radius: 8px; position: relative; margin-bottom: 1.5rem; overflow: hidden; box-shadow: inset 0 0 30px rgba(0,0,0,0.5);">
                 <!-- Saha Çizgileri -->
                 <div style="position: absolute; left: 50%; top: 0; width: 2px; height: 100%; background: rgba(255,255,255,0.2);"></div>
                 <div style="position: absolute; left: 50%; top: 50%; width: 60px; height: 60px; border: 2px solid rgba(255,255,255,0.2); border-radius: 50%; transform: translate(-50%, -50%);"></div>
                 <div style="position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; background: rgba(255,255,255,0.4); border-radius: 50%; transform: translate(-50%, -50%);"></div>
                 
                 <!-- Ceza Sahaları -->
                 <div style="position: absolute; left: 0; top: 25%; width: 40px; height: 50%; border: 2px solid rgba(255,255,255,0.2); border-left: none; background: rgba(255,255,255,0.03);"></div>
                 <div style="position: absolute; right: 0; top: 25%; width: 40px; height: 50%; border: 2px solid rgba(255,255,255,0.2); border-right: none; background: rgba(255,255,255,0.03);"></div>
                 
                 <!-- Taktiksel Mevkilerin Etiketleri ve Yerleşimi -->
                 <div style="position: absolute; left: 4%; top: 43%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;" title="Kaleci">GK</div>
                 <div style="position: absolute; left: 20%; top: 15%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;">LB</div>
                 <div style="position: absolute; left: 18%; top: 38%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;">LCB</div>
                 <div style="position: absolute; left: 18%; top: 58%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;">RCB</div>
                 <div style="position: absolute; left: 20%; top: 80%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;">RB</div>
                 
                 <div style="position: absolute; left: 42%; top: 30%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;">LDM</div>
                 <div style="position: absolute; left: 42%; top: 66%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;">RDM</div>
                 
                 <div style="position: absolute; left: 68%; top: 15%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;">LAM</div>
                 <div style="position: absolute; left: 68%; top: 48%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;">CAM</div>
                 <div style="position: absolute; left: 68%; top: 80%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;">RAM</div>
                 
                 <div style="position: absolute; left: 88%; top: 48%; font-size: 0.7rem; color: #fff; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 3px;" title="Forvet">ST</div>
              </div>
              
              <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                 ${myPicks.map((pick, i) => `
                    <div style="display: flex; flex-direction: column; background: rgba(0,0,0,0.2); padding: 0.8rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); gap: 0.5rem;">
                       <div style="display: flex; align-items: center; justify-content: space-between;">
                          <span style="font-weight: 500;">${pick.avatar_emoji || '👤'} ${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? '' : `${pick.age} yaş `}${pick.character_name}</span>
                          <select class="fifa-pos-select input" data-era-id="${pick.character_era_id}" onchange="GamePage.updateDynamicRatings()" style="width: 180px; background: var(--bg-tertiary); border: 1px solid var(--border); color: #fff; padding: 0.3rem 0.5rem; border-radius: 4px;">
                             ${positions.map((pos) => `<option value="${pos}" ${defaultPositions[i] === pos ? 'selected' : ''}>${pos}</option>`).join('')}
                          </select>
                       </div>
                       <div id="final-rating-${pick.character_era_id}" style="font-size: 0.85rem; color: var(--accent);">Hesaplanıyor...</div>
                    </div>
                 `).join('')}
              </div>
           </div>
        `;
     }
     
     tacticsHtml += `
        <div style="text-align: center; margin-top: 2rem;">
           <button class="btn btn-primary" id="btn-confirm-tactics" onclick="GamePage.confirmTactics()" style="max-width: 250px;">Taktiği Onayla ⚔️</button>
           <p id="tactics-submitted-badge" style="display: none; color: var(--success); font-weight: bold; margin-top: 1rem; font-size: 1rem;">
              Taktiğin başarıyla kaydedildi! Diğer oyuncular bekleniyor...
           </p>
           <div id="tactics-submissions-status" style="margin-top: 1rem; color: var(--text-muted); font-size: 0.85rem;"></div>
        </div>
     `;
     
     panel.innerHTML = tacticsHtml;
     
     if (branch === 'futbol') {
        this.updateHalisahaSlots('dengeli');
     }
     
     // İlk güç durumunu hesapla ve yaz
     setTimeout(() => this.updateDynamicRatings(), 50);
  },

  updateHalisahaSlots(style) {
     const myPicks = this.tacticsData.picks[App.user.id] || [];
     const container = document.getElementById('halisaha-slots-container');
     if (!container) return;
     
     let slots = [];
     if (style === 'defansif') {
        slots = ['Defans (Sol)', 'Defans (Stoper)', 'Defans (Sağ)', 'Orta Saha', 'Forvet'];
     } else if (style === 'dengeli') {
        slots = ['Defans (Sol)', 'Defans (Sağ)', 'Orta Saha (Defansif)', 'Orta Saha (Ofansif)', 'Forvet'];
     } else if (style === 'ofansif') {
        slots = ['Defans (Sol Bek)', 'Defans (Sağ Bek)', 'Orta Saha', 'Forvet (Sol)', 'Forvet (Sağ)'];
     }
     
     container.innerHTML = slots.map((slotName, i) => `
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 0.8rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
           <strong style="color: var(--accent); font-size: 0.9rem;">${slotName}</strong>
           <select class="halisaha-slot-select input" data-slot-index="${i}" onchange="GamePage.updateDynamicRatings()" style="width: 220px; background: var(--bg-tertiary); border: 1px solid var(--border); color: #fff; padding: 0.3rem 0.5rem; border-radius: 4px;">
              ${myPicks.map((pick, j) => `
                 <option value="${pick.character_era_id}" ${i === j ? 'selected' : ''}>
                    ${pick.avatar_emoji || '👤'} ${pick.character_name} ${(LobbyPage.currentLobby?.is_beta === 1 || LobbyPage.currentLobby?.is_beta === 2) ? '' : `(Güç: ${pick.rating_futbol})`}
                 </option>
              `).join('')}
           </select>
        </div>
     `).join('');
  },

  updateDynamicRatings() {
     const branch = this.tacticsData.branch;
     let styleVal = 'dengeli';
     
     if (branch === 'lol') {
        const styleInput = document.querySelector('input[name="lol-style"]:checked');
        styleVal = styleInput ? styleInput.value : 'agresif';
     } else if (branch === 'valorant') {
        const styleInput = document.querySelector('input[name="valorant-style"]:checked');
        styleVal = styleInput ? styleInput.value : 'agresif';
     } else if (branch === 'cs') {
        const styleInput = document.querySelector('input[name="cs-style"]:checked');
        styleVal = styleInput ? styleInput.value : 'agresif';
     } else if (branch === 'futbol') {
        const styleInput = document.querySelector('input[name="futbol-style"]:checked');
        styleVal = styleInput ? styleInput.value : 'dengeli';
     } else if (branch === 'fifa') {
        const styleInput = document.querySelector('input[name="fifa-style"]:checked');
        styleVal = styleInput ? styleInput.value : 'dengeli';
     }
     
     const myPicks = this.tacticsData.picks[App.user.id] || [];
     const modifiers = this.tacticsData.modifiers || [];
     
     myPicks.forEach(pick => {
        const eraId = pick.character_era_id;
        const baseRating = parseInt(pick['rating_' + branch]) || 50;
        
        // style modifier
        const styleKey = 'style_' + styleVal;
        const styleModObj = modifiers.find(m => m.character_era_id === eraId && m.modifier_key === styleKey);
        const styleMod = styleModObj ? styleModObj.modifier_value : 0;
        
        // role modifier
        let roleVal = '';
        if (branch === 'lol') {
           const select = document.querySelector(`.lol-lane-select[data-era-id="${eraId}"]`);
           if (select) roleVal = select.value;
        } else if (branch === 'valorant') {
           const select = document.querySelector(`.valorant-role-select[data-era-id="${eraId}"]`);
           if (select) roleVal = select.value;
        } else if (branch === 'futbol') {
           const selects = document.querySelectorAll('.halisaha-slot-select');
           selects.forEach((select, idx) => {
              if (select.value == eraId) {
                 const styleInput = document.querySelector('input[name="futbol-style"]:checked');
                 const currentStyle = styleInput ? styleInput.value : 'dengeli';
                 let slots = [];
                 if (currentStyle === 'defansif') {
                    slots = ['defans', 'defans', 'defans', 'orta', 'hücum'];
                 } else if (currentStyle === 'dengeli') {
                    slots = ['defans', 'defans', 'orta', 'orta', 'hücum'];
                 } else if (currentStyle === 'ofansif') {
                    slots = ['defans', 'defans', 'orta', 'hücum', 'hücum'];
                 }
                 roleVal = slots[idx];
              }
           });
        } else if (branch === 'fifa') {
           const select = document.querySelector(`.fifa-pos-select[data-era-id="${eraId}"]`);
           if (select) {
              roleVal = select.value.split(' ')[0];
           }
        }
        
        const roleModObj = roleVal ? modifiers.find(m => m.character_era_id === eraId && m.modifier_key === roleVal) : null;
        const roleMod = roleModObj ? roleModObj.modifier_value : 0;
        
        const finalRating = baseRating + styleMod + roleMod;
        
        const ratingEl = document.getElementById(`final-rating-${eraId}`);
        if (ratingEl) {
           let signStyle = styleMod >= 0 ? `+${styleMod}` : `${styleMod}`;
           let signRole = roleMod >= 0 ? `+${roleMod}` : `${roleMod}`;
            if (LobbyPage.currentLobby?.is_beta === 1 || LobbyPage.currentLobby?.is_beta === 2) {
               ratingEl.innerHTML = `Nihai Güç: <span style="color:var(--accent); font-weight:bold; font-size:1rem;">🔒 Gizli</span>`;
           } else {
              ratingEl.innerHTML = `Nihai Güç: <span style="color:var(--success); font-weight:bold; font-size:1rem;">${finalRating}</span> <span style="font-size:0.75rem; color:var(--text-muted); margin-left:5px;">(${baseRating} taban, ${signRole} Rol, ${signStyle} Stil)</span>`;
           }
        }
     });
  },

  hideTacticsPanel() {
     this.simulationQueue = [];
     this.isProcessingQueue = false;
     this.simulationGeneration = (this.simulationGeneration || 0) + 1;
     this.currentSimulationSessionId = null;
     const panel = document.getElementById('tactics-configuration-panel');
     if (panel) panel.style.display = 'none';
     
     const liveScoreboard = document.querySelector('.live-scoreboard');
     if (liveScoreboard) liveScoreboard.style.display = this.visualFootballActive || this.footballV2Active || this.visualShooterActive ? 'none' : 'flex';
     const detailedScoreboard = document.getElementById('detailed-scoreboard');
     if (detailedScoreboard) detailedScoreboard.style.display = this.visualFootballActive || this.footballV2Active || this.visualShooterActive ? 'none' : 'flex';
     const footballViewer = document.getElementById('football-manager-viewer');
     if (footballViewer) footballViewer.style.display = '';
     const footballV2Viewer = document.getElementById('football-v2-live-match');
     if (footballV2Viewer) footballV2Viewer.style.display = '';
     const simTerminal = document.getElementById('sim-terminal');
     if (simTerminal) {
        simTerminal.style.display = 'block';
        simTerminal.innerHTML = `
           <div class="simulation-line">Sistem başlatılıyor...</div>
           <div class="simulation-line">Eşleşmeler hazırlanıyor...</div>
        `;
     }
      const speedControls = document.getElementById('speed-controls-wrapper');
      if (speedControls) speedControls.style.display = 'block';
   },

   updateTacticsTimer(timeRemaining) {
      const timer = document.getElementById('tactics-timer');
      if (timer) {
         if (timeRemaining === null || timeRemaining === undefined) {
            timer.style.display = 'none';
            return;
         }
         timer.textContent = timeRemaining + 's';
         if (timeRemaining <= 5) {
            timer.style.color = 'var(--danger)';
            timer.style.animation = 'pulse 1s infinite';
         }
      }
   },

   updateTacticsSubmissionStatus(data) {
      const statusDiv = document.getElementById('tactics-submissions-status');
      if (statusDiv) {
         statusDiv.textContent = `Taktiklerini Onaylayanlar: ${data.submittedCount} / ${data.totalCount}`;
      }
   },

   confirmTactics() {
      const branch = this.tacticsData.branch;
      const tactics = { style: '', roles: {} };
      
      if (branch === 'lol') {
         const styleInput = document.querySelector('input[name="lol-style"]:checked');
         tactics.style = styleInput ? styleInput.value : 'agresif';
         
         const selects = document.querySelectorAll('.lol-lane-select');
         const rolesList = [];
         selects.forEach(s => {
            const eraId = s.getAttribute('data-era-id');
            const val = s.value;
            tactics.roles[eraId] = val;
            rolesList.push(val);
         });
         
         if (new Set(rolesList).size !== 5) {
            App.showToast('Lütfen her koridora benzersiz bir karakter yerleştirin!', 'error');
            return;
         }
      }
      else if (branch === 'valorant') {
         const styleInput = document.querySelector('input[name="valorant-style"]:checked');
         tactics.style = styleInput ? styleInput.value : 'agresif';
         
         const selects = document.querySelectorAll('.valorant-role-select');
         selects.forEach(s => {
            const eraId = s.getAttribute('data-era-id');
            tactics.roles[eraId] = s.value;
         });
      }
      else if (branch === 'cs') {
         const styleInput = document.querySelector('input[name="cs-style"]:checked');
         tactics.style = styleInput ? styleInput.value : 'agresif';
      }
      else if (branch === 'futbol') {
         const styleInput = document.querySelector('input[name="futbol-style"]:checked');
         tactics.style = styleInput ? styleInput.value : 'dengeli';
         
         const selects = document.querySelectorAll('.halisaha-slot-select');
         const assignedIds = [];
         selects.forEach((s, idx) => {
            const eraId = s.value;
            tactics.roles[eraId] = 'SLOT_' + idx;
            assignedIds.push(eraId);
         });
         
         if (new Set(assignedIds).size !== 5) {
            App.showToast('Lütfen her slotta farklı bir karakter seçin!', 'error');
            return;
         }
      }
      else if (branch === 'fifa') {
         const styleInput = document.querySelector('input[name="fifa-style"]:checked');
         tactics.style = styleInput ? styleInput.value : 'dengeli';
         
         const selects = document.querySelectorAll('.fifa-pos-select');
         const assignedPositions = [];
         selects.forEach(s => {
            const eraId = s.getAttribute('data-era-id');
            const val = s.value;
            tactics.roles[eraId] = val;
            assignedPositions.push(val);
         });
         
         if (new Set(assignedPositions).size !== 5) {
            App.showToast('Lütfen her oyuncuyu farklı bir mevkiye yerleştirin!', 'error');
            return;
          }
       }
       
       App.socket.emit('submit-tactics', {
          code: App.lobbyCode,
          tactics: tactics
       });
       
       const btn = document.getElementById('btn-confirm-tactics');
       if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
       }
       
       const badge = document.getElementById('tactics-submitted-badge');
       if (badge) badge.style.display = 'block';
    },

    startSimulationMatch(data) {
       this.simulationGeneration = (this.simulationGeneration || 0) + 1;
       this.currentSimulationSessionId = data.matchSessionId || null;
       this.simulationQueue = [];
       this.isProcessingQueue = false;

       const actionsContainer = document.getElementById('branch-actions-container');
       if (actionsContainer) actionsContainer.style.display = 'none';

       if (this.visualShooterActive && window.ShooterMatchViewer) {
          if (window.shooterVis?.stop) window.shooterVis.stop();
          window.shooterVis = window.ShooterMatchViewer.reset
            ? window.ShooterMatchViewer.reset('shooter-map-viewer')
            : window.ShooterMatchViewer.mount();
          if (window.shooterVis) {
             window.shooterVis.setSpeed(window.currentSimulationSpeed || 1);
             window.shooterVis.update(data);
          }
       }

       const s1El = document.getElementById('live-score-t1');
       const s2El = document.getElementById('live-score-t2');
       const p1El = document.getElementById('team1-name');
       const p2El = document.getElementById('team2-name');
       if (s1El) s1El.textContent = data.score1 ?? 0;
       if (s2El) s2El.textContent = data.score2 ?? 0;
       if (p1El) p1El.textContent = data.player1Name || '';
       if (p2El) p2El.textContent = data.player2Name || '';
    },

    finishSimulationMatch(data) {
       if (
         data.matchSessionId
         && this.currentSimulationSessionId
         && data.matchSessionId !== this.currentSimulationSessionId
       ) return;
       this.addSimulationLine({ ...data, __matchEnd: true });
    },

    addSimulationLine(data) {
       if (
         data?.matchSessionId
         && this.currentSimulationSessionId
         && data.matchSessionId !== this.currentSimulationSessionId
       ) return;
       if (!this.simulationQueue) {
           this.simulationQueue = [];
           this.isProcessingQueue = false;
       }
       const generation = this.simulationGeneration || 0;
       this.simulationQueue.push({ data, generation });
       if (!this.isProcessingQueue) {
           this.processSimulationQueue(generation);
       }
    },

    async processSimulationQueue(generation = this.simulationGeneration || 0) {
        if (generation !== (this.simulationGeneration || 0)) return;
        if (this.simulationQueue.length === 0) {
            this.isProcessingQueue = false;
            return;
        }
        this.isProcessingQueue = true;
        
        const queued = this.simulationQueue.shift();
        if (!queued || queued.generation !== generation) {
            this.processSimulationQueue(generation);
            return;
        }
        const data = queued.data;
        await this.executeSimulationLine(data);
        if (generation !== (this.simulationGeneration || 0)) return;
        this.processSimulationQueue(generation);
    },

    async executeSimulationLine(data) {
            if (data?.__matchEnd) {
              if (window.shooterVis?.finishMatch) window.shooterVis.finishMatch();
              if (window.shooterVis?.updateHeader) window.shooterVis.updateHeader(data);
              this.renderMatchEnd(data);
              this.renderMatchEndInline(data);
              return;
            }
            const text = typeof data === 'string' ? data : data.text;
            const visualUpdates = [];
            
            // Update Visual Pitch Timer
            if (text) {
                const minuteMatch = text.match(/⏱️\s*(\d+)'/);
                const timerEl = document.getElementById('visual-pitch-timer');
                if (timerEl) {
                    if (minuteMatch) {
                        timerEl.textContent = `⏱️ ${minuteMatch[1]}'`;
                    } else if (text.includes('Penaltı') || text.includes('penaltı')) {
                        timerEl.textContent = `⏱️ Penaltılar`;
                    }
                }
            }

            const s1El = document.getElementById('live-score-t1');
            const s2El = document.getElementById('live-score-t2');
            const p1El = document.getElementById('team1-name');
            const p2El = document.getElementById('team2-name');
            
            if (s1El && data.score1 !== undefined && data.score1 !== null) s1El.textContent = data.score1;
            if (s2El && data.score2 !== undefined && data.score2 !== null) s2El.textContent = data.score2;
            if (p1El && data.player1Name) p1El.textContent = data.player1Name;
            if (p2El && data.player2Name) p2El.textContent = data.player2Name;

            if (this.visualFootballActive && data.visualBeta !== false && window.FootballMatchViewer) {
              if (!window.footballVis) {
                window.footballVis = window.FootballMatchViewer.mount();
              }
              if (window.footballVis) {
                visualUpdates.push(window.footballVis.update(data));
              }
            }
            if (this.visualShooterActive && data.visualBeta !== false && window.ShooterMatchViewer) {
              if (!window.shooterVis) {
                window.shooterVis = window.ShooterMatchViewer.mount();
              }
              if (window.shooterVis) {
                visualUpdates.push(window.shooterVis.update(data));
              }
            }
            if (visualUpdates.length) await Promise.all(visualUpdates);

            // Render detailed stats if available
            const t1Div = document.getElementById('t1-details');
            const t2Div = document.getElementById('t2-details');
            const sharedStats = document.getElementById('shared-stats-container');
            
            if (data.state && (data.branch === 'lol' || data.branch === 'valorant' || data.branch === 'cs' || data.branch === 'futbol' || data.branch === 'fifa')) {
              const detailed = document.getElementById('detailed-scoreboard');
              if (detailed && !this.visualFootballActive && !this.visualShooterActive) {
                detailed.style.display = 'flex';
                
                const renderTeam = (tState, isT1) => `
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
                    <strong style="color: ${isT1 ? 'var(--primary-light)' : 'var(--danger)'}; font-size: 1.1rem;">${tState.name}</strong>
                    ${data.branch === 'lol' ? `
                    <div style="display: flex; gap: 0.5rem; font-size: 0.8rem; font-weight: bold;">
                      <div style="background: rgba(234,179,8,0.15); color: #facc15; border: 1px solid rgba(234,179,8,0.5); padding: 2px 8px; border-radius: 4px;" title="Kule">🗼 Kule: ${tState.towers || 0}</div>
                      <div style="background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.5); padding: 2px 8px; border-radius: 4px;" title="Ejderha">🐉 Ejder: ${tState.dragons || 0}</div>
                      <div style="background: rgba(168,85,247,0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.5); padding: 2px 8px; border-radius: 4px;" title="Baron">👁️ Baron: ${tState.barons || 0}</div>
                    </div>
                    ` : ''}
                  </div>
                  <table style="width: 100%; text-align: center; font-size: 0.85rem; border-collapse: collapse;">
                    <thead>
                      <tr style="color: var(--text-muted); font-size: 0.75rem; border-bottom: 1px solid var(--border);">
                        <th style="text-align: left; padding: 0.5rem;">Oyuncu</th>
                        ${(data.branch === 'futbol' || data.branch === 'fifa') ? `
                        <th title="Gol">Gol</th>
                        <th title="Asist">Asist</th>
                        <th title="Faul">Faul</th>
                        <th title="Maç Puanı">Rating</th>
                        ` : `
                        <th title="Kill / Ölüm / Asist">KDA</th>
                        <th title="${data.branch === 'lol' ? 'Minyon (Farm)' : (data.branch === 'valorant' ? 'Çatışma Skoru (ACS)' : 'Raunt Başına Hasar (ADR)')}">${data.branch === 'lol' ? 'CS' : (data.branch === 'valorant' ? 'ACS' : 'ADR')}</th>
                        `}
                      </tr>
                    </thead>
                    <tbody>
                      ${tState.players.map(p => `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                          <td style="text-align: left; padding: 0.4rem;">${p.emoji} ${p.name}</td>
                          ${(data.branch === 'futbol' || data.branch === 'fifa') ? `
                          <td style="font-weight: bold; color: var(--success);">${p.k}</td>
                          <td style="font-weight: bold; color: var(--accent);">${p.a}</td>
                          <td style="color: var(--text-muted);">${p.fouls || 0}</td>
                          <td style="font-weight: bold; color: var(--secondary);">${typeof p.rating === 'number' ? p.rating.toFixed(1) : (p.rating || '6.0')}</td>
                          ` : `
                          <td style="font-weight: bold;">${p.k}/${p.d}/${p.a}</td>
                          <td>${p.cs}</td>
                          `}
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                `;

                if (sharedStats && (data.branch === 'futbol' || data.branch === 'fifa') && data.state.t1 && data.state.t2) {
                  sharedStats.style.display = 'block';
                  const t1 = data.state.t1;
                  const t2 = data.state.t2;
                  
                  const possBar = `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: bold;">
                      <span style="color: var(--primary-light);">${t1.stats.poss || 50}%</span>
                      <span style="color: var(--text-muted);">Topa Sahip Olma</span>
                      <span style="color: var(--danger);">${t2.stats.poss || 50}%</span>
                    </div>
                    <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--bg-secondary);">
                      <div style="width: ${t1.stats.poss || 50}%; background: var(--primary-light); transition: width 0.3s;"></div>
                      <div style="width: ${t2.stats.poss || 50}%; background: var(--danger); transition: width 0.3s;"></div>
                    </div>
                  `;

                  const shotsBar = `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: bold;">
                      <span style="color: var(--primary-light);">${t1.stats.shots || 0} (${t1.stats.shotsOnTarget || 0})</span>
                      <span style="color: var(--text-muted);">Şut (İsabetli)</span>
                      <span style="color: var(--danger);">${t2.stats.shots || 0} (${t2.stats.shotsOnTarget || 0})</span>
                    </div>
                    <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--bg-secondary);">
                      <div style="width: ${t1.stats.shots === 0 ? 50 : (t1.stats.shots / (t1.stats.shots + t2.stats.shots) * 100)}%; background: var(--primary-light); transition: width 0.3s;"></div>
                      <div style="width: ${t2.stats.shots === 0 ? 50 : (t2.stats.shots / (t1.stats.shots + t2.stats.shots) * 100)}%; background: var(--danger); transition: width 0.3s;"></div>
                    </div>
                  `;

                  const xgBar = `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: bold;">
                      <span style="color: var(--primary-light);">${(t1.stats.xg || 0).toFixed(2)}</span>
                      <span style="color: var(--text-muted);">Gol Beklentisi (xG)</span>
                      <span style="color: var(--danger);">${(t2.stats.xg || 0).toFixed(2)}</span>
                    </div>
                    <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--bg-secondary);">
                      <div style="width: ${t1.stats.xg === 0 && t2.stats.xg === 0 ? 50 : (t1.stats.xg / (t1.stats.xg + t2.stats.xg) * 100)}%; background: var(--primary-light); transition: width 0.3s;"></div>
                      <div style="width: ${t1.stats.xg === 0 && t2.stats.xg === 0 ? 50 : (t2.stats.xg / (t1.stats.xg + t2.stats.xg) * 100)}%; background: var(--danger); transition: width 0.3s;"></div>
                    </div>
                  `;
                  
                  sharedStats.innerHTML = possBar + '<div style="height: 0.5rem;"></div>' + shotsBar + '<div style="height: 0.5rem;"></div>' + xgBar;
                } else if (sharedStats) {
                  sharedStats.style.display = 'none';
                }

                if (t1Div && data.state.t1) t1Div.innerHTML = renderTeam(data.state.t1, true);
                if (t2Div && data.state.t2) t2Div.innerHTML = renderTeam(data.state.t2, false);
              }
            }

            const terminal = document.getElementById('sim-terminal');
            if (terminal) {
                const div = document.createElement('div');
                div.className = 'simulation-line';
                div.style.marginBottom = '0.5rem';
                
                let lineText = text;


                if (lineText) {
                    const appendText = () => {
                        if (lineText.includes('🔥 PENTAKILL 🔥') || lineText.includes('💥 KUSURSUZ ACE! 💥') || lineText.includes('⚽ GOOOL! ⚽')) {
                          const parts = lineText.split('|');
                          let color = '#ff4500';
                          let shadowColor = '255, 69, 0';
                          
                          if (data.teamId === 1) {
                            color = '#3b82f6';
                            shadowColor = '59, 130, 246';
                          } else if (data.teamId === 2) {
                            color = '#ef4444';
                            shadowColor = '239, 68, 68';
                          } else if (lineText.includes('GOOOL')) {
                            color = '#10b981';
                            shadowColor = '16, 185, 129';
                          }
                          
                          div.innerHTML = `<span style="color: ${color}; font-size: 1.5rem; font-weight: 900; text-transform: uppercase; text-shadow: 0 0 10px ${color};">${parts[0]}</span> <br> <span style="font-size: 1.2rem; font-weight: bold; color: #fff;">${parts[1]}</span>`;
                          div.style.textAlign = 'center';
                          div.style.padding = '1rem';
                          div.style.border = `2px solid ${color}`;
                          div.style.backgroundColor = `rgba(${shadowColor}, 0.15)`;
                          div.style.boxShadow = `0 0 15px rgba(${shadowColor}, 0.5)`;
                          div.style.margin = '1rem 0';
                          div.style.borderRadius = '8px';
                        } else if (lineText.startsWith('---') || lineText.startsWith('===')) {
                          div.style.color = 'var(--secondary)';
                          div.style.fontWeight = 'bold';
                          div.style.marginTop = '1rem';
                          div.textContent = lineText;
                        } else if (lineText.startsWith('🏆') || lineText.startsWith('💥')) {
                          div.style.color = 'var(--accent)';
                          div.style.fontWeight = 'bold';
                          div.style.fontSize = '1.1rem';
                          div.textContent = lineText;
                        } else {
                          div.textContent = lineText;
                          if (data.teamId === 1) {
                            div.style.color = '#60a5fa';
                          } else if (data.teamId === 2) {
                            div.style.color = '#f87171';
                          } else {
                            if (lineText.includes('FIRST BLOOD')) div.style.color = '#ef4444';
                            if (lineText.includes('QUADRA KILL')) div.style.color = '#f97316';
                            if (lineText.includes('Triple Kill')) div.style.color = '#f59e0b';
                            if (lineText.includes('Double Kill')) div.style.color = '#eab308';
                            if (lineText.includes('BARON') || lineText.includes('Ejder')) div.style.color = '#c084fc';
                            if (lineText.includes('Kule')) div.style.color = '#fcd34d';
                          }
                        }
                        terminal.appendChild(div);
                        terminal.scrollTop = terminal.scrollHeight;
                    };
                    
                    appendText();
                }
            }
            const speed = window.currentSimulationSpeed || 1;
            const delay = 180 / speed;
            await new Promise(resolve => setTimeout(resolve, delay));
    },

  renderMatchEnd(data) {
    const container = document.getElementById('match-stats-container');
    if (!container) return;
    
    const player1 = data.player1Name || data.player1 || 'Takım 1';
    const player2 = data.player2Name || data.player2 || 'Takım 2';
    
    // Create a mini toast/alert for the match end
    App.showToast(`${player1} vs ${player2} maçı bitti!`, 'info');
    this.totalPlayers = LobbyPage.currentLobby?.players?.length || 5;

  },

  renderMatchEndInline(data) {
    const { liveRankings, isLastMatch } = data;
    
    // Update left scoreboard (Branch Standings)
    const branchTbody = document.querySelector('#live-branch-scoreboard tbody');
    if (branchTbody) {
       branchTbody.innerHTML = liveRankings.map((r, i) => `
         <tr class="rank-${i + 1}">
           <td style="text-align: center; font-weight: bold; font-size: 0.9rem;">
             ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
           </td>
           <td style="font-weight: ${i < 3 ? 'bold' : 'normal'}; font-size: 0.85rem;">${r.display_name || r.displayName} ${r.user_id === App.user.id || r.userId === App.user.id ? '(Sen)' : ''}</td>
           <td style="text-align: center; color: var(--success); font-size: 0.85rem;">${r.wins}</td>
           <td style="text-align: center; color: var(--danger); font-size: 0.85rem;">${r.losses}</td>
           <td style="text-align: center; font-weight: bold; color: var(--text-muted); font-size: 0.9rem;">-</td>
         </tr>
       `).join('');
    }

    if (!isLastMatch) {
       const actionsContainer = document.getElementById('branch-actions-container');
       const btnReady = document.getElementById('btn-branch-ready');
       const timerDisplay = document.getElementById('ready-timer-display');
       if (actionsContainer && btnReady) {
          if (timerDisplay) timerDisplay.style.display = 'none'; // hide previous timer
          actionsContainer.style.display = 'block';
          const realCount = LobbyPage.currentLobby?.players?.filter(p => !p.username?.startsWith('bot_')).length || 1;
          btnReady.textContent = `Sıradaki Maça Geç (0/${realCount})`;
          btnReady.disabled = false;
          btnReady.style.opacity = '1';
          btnReady.style.cursor = 'pointer';
          
          btnReady.onclick = () => {
            App.socket.emit('branch-ready', { code: App.lobbyCode });
            btnReady.disabled = true;
            btnReady.style.opacity = '0.5';
            btnReady.style.cursor = 'not-allowed';
          };
       }
    }
  },

  renderBranchResultsInline(data) {
    const { rankings, overallStandings, isLastBranch } = data;
    this.totalPlayers = rankings.length;

    // Update left scoreboard (Branch Standings)
    const branchTbody = document.querySelector('#live-branch-scoreboard tbody');
    if (branchTbody) {
       branchTbody.innerHTML = rankings.map((r, i) => `
         <tr class="rank-${i + 1}">
           <td style="text-align: center; font-weight: bold; font-size: 0.9rem;">
             ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
           </td>
           <td style="font-weight: ${i < 3 ? 'bold' : 'normal'}; font-size: 0.85rem;">${r.display_name || r.displayName} ${r.user_id === App.user.id || r.userId === App.user.id ? '(Sen)' : ''}</td>
           <td style="text-align: center; color: var(--success); font-size: 0.85rem;">${r.wins}</td>
           <td style="text-align: center; color: var(--danger); font-size: 0.85rem;">${r.losses}</td>
           <td style="text-align: center; font-weight: bold; color: var(--accent); font-size: 0.9rem;">+${r.points}</td>
         </tr>
       `).join('');
    }

    // Update right scoreboard (Overall Standings)
    const overallTbody = document.querySelector('#live-overall-scoreboard tbody');
    if (overallTbody) {
       overallTbody.innerHTML = overallStandings.map((r, i) => `
         <tr class="rank-${i + 1}">
           <td style="text-align: center; font-weight: bold; font-size: 0.9rem;">
             ${i === 0 ? '👑' : i + 1}
           </td>
           <td style="font-weight: ${i === 0 ? 'bold' : 'normal'}; font-size: 0.85rem;">${r.display_name} ${r.user_id === App.user.id ? '(Sen)' : ''}</td>
           <td style="text-align: center; font-weight: bold; color: var(--accent); font-size: 0.9rem;">${r.total_points}</td>
         </tr>
       `).join('');
    }

    // Hide speed controls
    const speedControls = document.getElementById('speed-controls-wrapper');
    if (speedControls) speedControls.style.display = 'none';

    // Show ready button
    const actionsContainer = document.getElementById('branch-actions-container');
    const btnReady = document.getElementById('btn-branch-ready');
    const timerDisplay = document.getElementById('ready-timer-display');
    
    if (actionsContainer && btnReady) {
       if (timerDisplay) timerDisplay.style.display = 'none'; // hide previous timer
       actionsContainer.style.display = 'block';
       const btnText = isLastBranch ? 'Oyunu Bitir' : 'Sıradaki Karşılaşmaya Geç';
       const realCount = LobbyPage.currentLobby?.players?.filter(p => !p.username?.startsWith('bot_')).length || 1;
       btnReady.textContent = `${btnText} (0/${realCount})`;
       btnReady.disabled = false;
       btnReady.style.opacity = '1';
       btnReady.style.cursor = 'pointer';
       
       btnReady.onclick = () => {
         App.socket.emit('branch-ready', { code: App.lobbyCode });
         btnReady.disabled = true;
         btnReady.style.opacity = '0.5';
         btnReady.style.cursor = 'not-allowed';
       };
    }
    
    App.showToast('Karşılaşmalar bitti!', 'success');
  },

  renderBranchResults(data) {
    // Eskiden kullanılıyordu, artık renderBranchResultsInline kullanılıyor
    return '';
  },

  renderFinalResults(data) {
    const { rankings, branchDetails } = data;
    const winner = rankings[0];
    
    let branchHtml = '';
    if (branchDetails) {
       branchHtml = `
          <h2 style="text-align: left; margin-bottom: 1rem; padding-left: 1rem; border-left: 4px solid var(--secondary);">Branş Detayları</h2>
          <div style="display: flex; flex-direction: column; gap: 2rem; margin-bottom: 3rem;">
             ${Object.keys(branchDetails).map(br => `
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; width: 100%;">
                  <h4 style="text-align: center; color: var(--primary-light); margin-bottom: 1rem;">
                     ${this.branchIcons[br]} ${this.branchNames[br]}
                  </h4>
                  <table class="scoreboard" style="font-size: 0.9rem; margin-bottom: 1.5rem;">
                     <thead>
                       <tr><th style="text-align:center;">Sıra</th><th>Oyuncu</th><th style="text-align:center;">G</th><th style="text-align:center;">M</th><th style="text-align:center; color: var(--accent);">Puan</th></tr>
                     </thead>
                     <tbody>
                       ${branchDetails[br].rankings.map((s, i) => `
                         <tr>
                           <td style="text-align: center;">${i+1}</td>
                           <td>${s.displayName}</td>
                           <td style="text-align: center; color: var(--success);">${s.wins}</td>
                           <td style="text-align: center; color: var(--danger);">${s.losses}</td>
                           <td style="text-align: center; font-weight: bold; color: var(--accent);">+${s.points}</td>
                         </tr>
                       `).join('')}
                     </tbody>
                  </table>
                  
                  <div style="max-height: 350px; overflow-y: auto; background: #000; padding: 1rem; border-radius: 8px; font-family: var(--font-mono); font-size: 0.85rem; border: 1px solid #113311; box-shadow: inset 0 0 10px rgba(0,255,0,0.05); color: var(--success);">
                    <h5 style="color: var(--secondary); margin-bottom: 1rem; text-align: center; font-size: 1rem; border-bottom: 1px solid #113311; padding-bottom: 0.5rem;">Maç Geçmişi & Özetler</h5>
                    ${branchDetails[br].matches.map(m => {
                      const finalLine = m.lines.slice().reverse().find(l => typeof l !== 'string' && l.state);
                      let scoreboardHtml = '';
                      
                      const renderTeamScoreboard = (tState, isT1, branch) => `
                        <div style="margin-bottom: 0.5rem;">
                          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem;">
                            <strong style="${isT1 ? 'color: var(--primary-light)' : 'color: var(--danger)'}; font-size: 0.95rem;">${tState.name}</strong>
                            ${branch === 'lol' ? `
                            <div style="display: flex; gap: 0.3rem; font-size: 0.7rem; font-weight: bold;">
                              <div style="background: rgba(234,179,8,0.15); color: #facc15; padding: 2px 4px; border-radius: 4px;" title="Kule">🗼 ${tState.towers || 0}</div>
                              <div style="background: rgba(239,68,68,0.15); color: #f87171; padding: 2px 4px; border-radius: 4px;" title="Ejder">🐉 ${tState.dragons || 0}</div>
                              <div style="background: rgba(168,85,247,0.15); color: #c084fc; padding: 2px 4px; border-radius: 4px;" title="Baron">👁️ ${tState.barons || 0}</div>
                            </div>` : ''}
                          </div>
                          <table style="width: 100%; text-align: center; font-size: 0.75rem; border-collapse: collapse;">
                            <thead>
                              <tr style="color: var(--text-muted); font-size: 0.7rem; border-bottom: 1px solid var(--border);">
                                <th style="text-align: left; padding: 0.2rem;">Oyuncu</th>
                                ${(branch === 'futbol' || branch === 'fifa') ? `
                                <th>Gol</th><th>Asist</th><th>Faul</th><th>Puan</th>
                                ` : `
                                <th>KDA</th><th>${branch === 'lol' ? 'CS' : (branch === 'valorant' ? 'ACS' : 'ADR')}</th>
                                `}
                              </tr>
                            </thead>
                            <tbody>
                              ${tState.players.map(p => `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                                  <td style="text-align: left; padding: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;" title="${p.name}">${p.emoji} ${p.name}</td>
                                  ${(branch === 'futbol' || branch === 'fifa') ? `
                                  <td style="color: var(--success); font-weight: bold;">${p.k}</td>
                                  <td style="color: var(--accent); font-weight: bold;">${p.a}</td>
                                  <td style="color: ${p.fouls > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${p.fouls}</td>
                                  <td style="font-weight: bold; color: ${p.rating >= 8.0 ? 'var(--primary-light)' : (p.rating >= 6.5 ? 'var(--success)' : 'var(--danger)')}">${p.rating.toFixed(1)}</td>
                                  ` : `
                                  <td style="font-weight: bold;"><span style="color: var(--success)">${p.k}</span>/<span style="color: var(--danger)">${p.d}</span>/<span style="color: var(--accent)">${p.a}</span></td>
                                  <td>${p.cs}</td>
                                  `}
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        </div>
                      `;

                      if (finalLine && finalLine.state) {
                         scoreboardHtml = `
                            <div style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; background: rgba(0,0,0,0.4); padding: 0.8rem; border-radius: 8px; border: 1px solid var(--bg-secondary);">
                               <div style="flex: 1; min-width: 250px; overflow-x: auto;">${renderTeamScoreboard(finalLine.state.t1, true, br)}</div>
                               <div style="flex: 1; min-width: 250px; overflow-x: auto; border-left: 1px dashed var(--border); padding-left: 1rem;">${renderTeamScoreboard(finalLine.state.t2, false, br)}</div>
                            </div>
                         `;
                      }
                      
                      const allLinesHtml = m.lines.map(l => {
                         const text = typeof l === 'string' ? l : l.text;
                         if (!text) return '';
                         let color = '#a3e635';
                         if (text.startsWith('---') || text.startsWith('===')) color = 'var(--secondary)';
                         else if (text.startsWith('🏆') || text.startsWith('💥')) color = 'var(--accent)';
                         return `<div style="margin-bottom: 0.3rem; color: ${color};">${text}</div>`;
                      }).join('');
                      
                      return `
                        <div style="margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 2px solid #113311;">
                          <div style="text-align: center; font-weight: bold; font-size: 1.1rem; margin-bottom: 1rem; background: rgba(255,255,255,0.05); padding: 0.6rem; border-radius: 4px;">
                            <span style="color: ${m.winnerName === m.player1 ? 'var(--success)' : 'var(--danger)'}">${m.player1}</span> 
                            <span style="color: var(--accent); margin: 0 1rem; font-size: 1.3rem;">${m.score1} - ${m.score2}</span> 
                            <span style="color: ${m.winnerName === m.player2 ? 'var(--success)' : 'var(--danger)'}">${m.player2}</span>
                          </div>
                          ${scoreboardHtml}
                          <div style="max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.6); padding: 0.8rem; border-radius: 4px; border: 1px solid #1a331a; font-size: 0.8rem;">
                            ${allLinesHtml}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
             `).join('')}
          </div>
       `;
    }
    
    let html = `
      <div class="confetti-container" id="confetti"></div>
      <div style="max-width: 900px; margin: 0 auto; text-align: center;">
        <h1 style="color: var(--accent); font-size: 3rem; text-shadow: 0 0 20px rgba(245, 158, 11, 0.5); margin-bottom: 0.5rem;">
          🏆 TURNUVA ŞAMPİYONU 🏆
        </h1>
        <h2 style="font-size: 2.5rem; margin-bottom: 2rem;">${winner.display_name}</h2>
        
        <div class="card" style="margin-bottom: 3rem; background: rgba(245, 158, 11, 0.1); border-color: var(--accent);">
          <div style="font-size: 1.2rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Toplam Puan</div>
          <div style="font-size: 4rem; font-weight: 800; color: var(--accent);">${winner.total_points}</div>
        </div>
        
        <h3 style="text-align: left; margin-bottom: 1rem; padding-left: 1rem; border-left: 4px solid var(--primary);">Genel Sıralama</h3>
        <table class="scoreboard" style="margin-bottom: 3rem;">
          <thead>
            <tr>
              <th style="width: 50px; text-align: center;">Sıra</th>
              <th>Oyuncu</th>
              <th style="text-align: center; color: var(--accent); font-size: 1.1rem;">TOPLAM PUAN</th>
            </tr>
          </thead>
          <tbody>
            ${rankings.map((r, i) => `
              <tr class="rank-${i + 1}">
                <td style="text-align: center; font-weight: bold; font-size: 1.2rem;">
                  ${i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>
                <td style="font-weight: ${i === 0 ? 'bold' : 'normal'};">${r.display_name} ${r.user_id === App.user.id ? '(Sen)' : ''}</td>
                <td style="text-align: center; font-weight: bold; color: var(--accent); font-size: 1.1rem;">${r.total_points}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        ${branchHtml}
        
        <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 3rem;">
           <button class="btn btn-secondary" onclick="App.showDashboard()">Ana Ekrana Dön</button>
           ${LobbyPage.currentLobby?.created_by == App.user.id ? `
              <button class="btn btn-primary" onclick="App.returnToLobby()">Lobiye Dön</button>
           ` : ''}
        </div>
      </div>
    `;
    
    // Trigger fake confetti
    setTimeout(() => {
      const c = document.getElementById('confetti');
      if (c) {
        for(let i=0; i<100; i++) {
          const el = document.createElement('div');
          el.style.position = 'absolute';
          el.style.width = '10px'; el.style.height = '10px';
          el.style.backgroundColor = ['#f59e0b', '#7c3aed', '#06b6d4', '#10b981', '#ef4444'][Math.floor(Math.random()*5)];
          el.style.left = Math.random() * 100 + '%';
          el.style.top = '-10px';
          el.style.transform = `rotate(${Math.random()*360}deg)`;
          el.style.transition = `top ${2+Math.random()*3}s linear, transform 2s ease`;
          c.appendChild(el);
          
          setTimeout(() => {
            el.style.top = '100%';
            el.style.transform = `rotate(${Math.random()*360}deg) scale(0)`;
          }, 50);
        }
      }
    }, 500);
    
    return html;
  },

  updateReadyCount(data) {
     const btn = document.getElementById('btn-branch-ready');
     if (btn) {
        let text = btn.textContent.split(' (')[0];
        btn.textContent = `${text} (${data.readyCount}/${data.totalCount})`;
     }
  },

  updateReadyTimer(data) {
     const timerDiv = document.getElementById('ready-timer-display');
     const secondsSpan = document.getElementById('ready-timer-seconds');
     if (timerDiv && secondsSpan) {
        timerDiv.style.display = 'block';
        secondsSpan.textContent = data.timeRemaining;
        
        if (data.timeRemaining <= 5) {
           secondsSpan.style.color = 'var(--danger)';
        }
     }
  },

  bind() {
    if (this.visualFootballActive && window.FootballMatchViewer) {
      if (window.footballVis && typeof window.footballVis.stop === 'function') {
        window.footballVis.stop();
      }
      window.footballVis = window.FootballMatchViewer.mount();
    }
    if (this.visualShooterActive && window.ShooterMatchViewer) {
      if (window.shooterVis && typeof window.shooterVis.stop === 'function') {
        window.shooterVis.stop();
      }
      window.shooterVis = window.ShooterMatchViewer.mount();
    }
    if (this.footballV2Active) {
      window.footballV2Match = null;
    }

    const btnNext = document.getElementById('btn-next-branch');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        App.socket.emit('next-branch', { code: App.lobbyCode });
        btnNext.disabled = true;
      });
    }
  }
};
