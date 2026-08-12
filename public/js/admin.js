const AdminPage = {
  activeTab: 'characters',
  characters: [],
  users: [],
  tacticsBranch: 'lol',
  eras: [],
  modifiers: [],
  testSimulationSpeed: 1,
  adminFootballVis: null,
  adminShooterVis: null,
  adminFootballV2Lab: null,
  adminCsMapReporter: null,
  testRunToken: 0,

  render() {
    return `
      <div>
        <h2 style="margin-bottom: 2rem; color: var(--primary-light);">⚙️ Admin Paneli</h2>
        
        <div class="tabs">
          <div class="tab ${this.activeTab === 'characters' ? 'active' : ''}" onclick="AdminPage.switchTab('characters')">Karakterler & Dönemler</div>
          ${Number(App.user.is_admin) === 1 ? `<div class="tab ${this.activeTab === 'users' ? 'active' : ''}" onclick="AdminPage.switchTab('users')">Kullanıcı Yönetimi</div>` : ''}
          ${Number(App.user.is_admin) === 1 ? `<div class="tab ${this.activeTab === 'test' ? 'active' : ''}" onclick="AdminPage.switchTab('test')">🧪 Simülasyon Testi</div>` : ''}
          ${Number(App.user.is_admin) === 1 ? `<div class="tab ${this.activeTab === 'cs_map_reporter' ? 'active' : ''}" onclick="AdminPage.switchTab('cs_map_reporter')">🗺️ CS Harita Editörü</div>` : ''}
          <div class="tab ${this.activeTab === 'tactics_beta' ? 'active' : ''}" onclick="AdminPage.switchTab('tactics_beta')">📊 Taktiksel Değişimler</div>
        </div>
        
        <div id="admin-content">
          <div class="spinner" style="margin: 3rem auto;"></div>
        </div>
      </div>
    `;
  },

  switchTab(tab) {
    if (this.adminFootballV2Lab?.stop) this.adminFootballV2Lab.stop();
    if (this.adminFootballVis?.stop) this.adminFootballVis.stop();
    if (this.adminShooterVis?.stop) this.adminShooterVis.stop();
    if (this.adminCsMapReporter?.destroy) this.adminCsMapReporter.destroy();
    this.adminCsMapReporter = null;
    this.activeTab = tab;
    document.getElementById('main-content').innerHTML = this.render();
    this.loadData();
  },

  async loadData() {
    try {
      if (this.activeTab === 'characters') {
        const res = await API.getCharacters();
        this.characters = res.characters || res;
        document.getElementById('admin-content').innerHTML = this.renderCharacters();
      } else if (this.activeTab === 'users') {
        const res = await API.getUsers();
        this.users = res.users || res;
        document.getElementById('admin-content').innerHTML = this.renderUsers();
      } else if (this.activeTab === 'test') {
        document.getElementById('admin-content').innerHTML = this.renderTestTab();
      } else if (this.activeTab === 'cs_map_reporter') {
        if (!window.CsMapReporter) throw new Error('CS Harita Editörü yüklenemedi.');
        document.getElementById('admin-content').innerHTML = window.CsMapReporter.render();
        this.adminCsMapReporter = window.CsMapReporter.mount();
      } else if (this.activeTab === 'tactics_beta') {
        const res = await API.getTacticsModifiers();
        this.eras = res.eras || [];
        this.modifiers = res.modifiers || [];
        document.getElementById('admin-content').innerHTML = this.renderTacticsBeta();
      }
    } catch (err) {
      document.getElementById('admin-content').innerHTML = `<div style="color:var(--danger)">Hata: ${err.message}</div>`;
    }
  },

  renderCharacters() {
    return `
      <div style="margin-bottom: 2rem;">
        <button class="btn btn-primary" style="width: auto;" onclick="AdminPage.showCharacterModal()">+ Yeni Karakter Ekle</button>
      </div>
      
      <div class="admin-grid">
        ${this.characters.map(char => `
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 1rem;">
              <h3 style="margin: 0;">${char.avatar_emoji} ${char.name}</h3>
              <div>
                <button class="btn btn-sm btn-secondary" onclick='AdminPage.showEditCharacterModal(${JSON.stringify(char).replace(/'/g, "&#39;")})'>✏️ Düzenle</button>
                <button class="btn btn-sm btn-danger" onclick="AdminPage.deleteCharacter(${char.id})">Sil</button>
              </div>
            </div>
            
            <div style="margin-top: 1rem;">
              ${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? `
                ${char.eras && char.eras.length > 0 ? char.eras.map(era => `
                  <div class="era-item">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 0.6rem;">
                      <span style="color: var(--accent); font-weight: bold; font-size: 0.95rem; display: flex; align-items: center; gap: 0.4rem;">📊 Karakter Güçleri</span>
                      <button class="btn btn-sm btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.8rem;" onclick='AdminPage.showEditEraModal(${JSON.stringify(era).replace(/'/g, "&#39;")})'>✏️ Güçleri Düzenle</button>
                    </div>
                    ${this.renderRatingBar('LoL', era.rating_lol)}
                    ${this.renderRatingBar('VAL', era.rating_valorant)}
                    ${this.renderRatingBar('CS', era.rating_cs)}
                    ${this.renderRatingBar('FUT', era.rating_futbol)}
                    ${this.renderRatingBar('FIFA', era.rating_fifa)}
                  </div>
                `).join('') : '<p style="color:var(--text-muted); font-size:0.85rem; margin-top: 0.5rem;">Güç puanları tanımlanmamış.</p>'}
              ` : `
                <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                  <h4 style="color: var(--text-secondary); margin: 0;">Dönemler (${char.eras ? char.eras.length : 0})</h4>
                  <button class="btn btn-sm btn-secondary" onclick="AdminPage.showEraModal(${char.id})">+ Ekle</button>
                </div>
                
                ${char.eras && char.eras.length > 0 ? char.eras.map(era => `
                  <div class="era-item">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                      <strong>${era.age} Yaş <span style="color:var(--text-muted); font-size:0.85rem;">${era.era_label || ''}</span></strong>
                      <div>
                        <button class="btn btn-sm btn-secondary" style="padding: 0.2rem 0.5rem; margin-right: 0.5rem;" onclick='AdminPage.showEditEraModal(${JSON.stringify(era).replace(/'/g, "&#39;")})'>✏️</button>
                        <button class="btn btn-sm btn-danger" style="padding: 0.2rem 0.5rem;" onclick="AdminPage.deleteEra(${era.id})">x</button>
                      </div>
                    </div>
                    
                    ${this.renderRatingBar('LoL', era.rating_lol)}
                    ${this.renderRatingBar('VAL', era.rating_valorant)}
                    ${this.renderRatingBar('CS', era.rating_cs)}
                    ${this.renderRatingBar('FUT', era.rating_futbol)}
                    ${this.renderRatingBar('FIFA', era.rating_fifa)}
                  </div>
                `).join('') : '<p style="color:var(--text-muted); font-size:0.85rem; margin-top: 0.5rem;">Henüz dönem eklenmemiş.</p>'}
              `}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderRatingBar(label, value) {
    const v = parseInt(value) || 0;
    let bgStyle = '';
    
    if (v < 40) {
      bgStyle = 'background: var(--danger);';
    } else if (v < 70) {
      bgStyle = 'background: var(--accent);';
    } else if (v <= 80) {
      bgStyle = 'background: var(--success);';
    } else {
      // 80 ile 100 arasında Yeşil'den Neon Mor'a (Violet) efsanevi geçiş
      // 80 -> Yeşil (HUE 142), 100 -> Efsanevi Mor (HUE 275)
      const p = (v - 80) / 20;
      const hue = 142 + p * 133;
      const saturation = 70 + p * 15;
      const lightness = 45 + p * 15;
      const glowOpacity = 0.3 + p * 0.4;
      bgStyle = `background: hsl(${hue}, ${saturation}%, ${lightness}%); box-shadow: 0 0 12px hsla(${hue}, ${saturation}%, ${lightness}%, ${glowOpacity});`;
    }

    return `
      <div class="rating-row">
        <div class="rating-label">${label}</div>
        <div class="rating-bar-bg">
          <div class="rating-bar" style="width: ${v}%; ${bgStyle}"></div>
        </div>
        <div style="width: 30px; text-align: right; font-weight: bold; color: var(--text-primary);">${v}</div>
      </div>
    `;
  },

  renderUserTable(usersList) {
    if (usersList.length === 0) {
      return `<p style="color: var(--text-muted); padding: 1rem 0; font-style: italic;">Bu sunucuda kayıtlı kullanıcı bulunmamaktadır.</p>`;
    }
    return `
      <table class="scoreboard" style="margin-bottom: 0;">
        <thead>
          <tr>
            <th>ID</th>
            <th>Kullanıcı Adı</th>
            <th>Görünen Ad</th>
            <th>Kayıt Tarihi</th>
            <th>Rol</th>
            <th>Sunucu</th>
            <th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          ${usersList.map(u => `
            <tr>
              <td>${u.id}</td>
              <td>${u.username}</td>
              <td>${u.display_name}</td>
              <td>${new Date(u.created_at).toLocaleDateString('tr-TR')}</td>
              <td>
                ${Number(App.user.is_admin) === 1 && u.id !== App.user.id && u.id !== 1 && u.username !== 'admin' ? `
                  <select class="input" style="width: auto; display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.85rem; background: var(--bg-tertiary); color: #fff; border: 1px solid var(--border);" onchange="AdminPage.changeUserRole(${u.id}, this.value)">
                    <option value="0" ${Number(u.is_admin) === 0 ? 'selected' : ''}>Oyuncu</option>
                    <option value="2" ${Number(u.is_admin) === 2 ? 'selected' : ''}>Server Admin</option>
                    <option value="1" ${Number(u.is_admin) === 1 ? 'selected' : ''}>Süper Admin</option>
                  </select>
                ` : `
                  <span class="badge" style="background: ${u.is_admin ? 'var(--primary-glow)' : 'var(--bg-tertiary)'}; color: ${u.is_admin ? 'var(--primary-light)' : 'var(--text-muted)'}; padding: 0.3rem 0.6rem; border-radius: 4px;">
                    ${Number(u.is_admin) === 1 ? 'Süper Admin' : (Number(u.is_admin) === 2 ? 'Server Admin' : 'Oyuncu')}
                  </span>
                `}
              </td>
              <td>
                ${Number(App.user.is_admin) === 1 && Number(u.is_admin) !== 1 && u.id !== 1 && u.username !== 'admin' ? `
                  <select class="input" style="width: auto; display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.85rem; background: var(--bg-tertiary); color: #fff; border: 1px solid var(--border);" onchange="AdminPage.changeUserServer(${u.id}, this.value)">
                    <option value="OIMSFKTS" ${u.server === 'OIMSFKTS' ? 'selected' : ''}>OIMSFKTS</option>
                    <option value="YENİ SERVER" ${u.server === 'YENİ SERVER' ? 'selected' : ''}>YENİ SERVER</option>
                  </select>
                ` : `
                  <span class="badge" style="background: var(--bg-tertiary); color: var(--text-secondary); padding: 0.3rem 0.6rem; border-radius: 4px;">
                    ${Number(u.is_admin) === 1 ? 'Ortak (Tüm)' : u.server}
                  </span>
                `}
              </td>
              <td>
                ${u.id !== App.user.id ? `
                  ${Number(App.user.is_admin) === 1 && u.id !== 1 && u.username !== 'admin' ? `
                    <button class="btn btn-sm btn-danger" onclick="AdminPage.deleteUser(${u.id}, '${u.username}')" style="margin-right: 0.5rem;">Sil</button>
                  ` : ''}
                ` : '<span style="color:var(--text-muted);font-size:0.8rem;margin-right:1rem;">Kendin</span>'}
                ${(u.id !== 1 && u.username !== 'admin') || u.id === App.user.id ? `
                  <button class="btn btn-sm btn-primary" onclick="AdminPage.showPasswordModal(${u.id}, '${u.username}')">Şifre Değiştir</button>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  renderUsers() {
    const superAdmins = this.users.filter(u => Number(u.is_admin) === 1);
    const oimsUsers = this.users.filter(u => Number(u.is_admin) !== 1 && u.server === 'OIMSFKTS');
    const yeniUsers = this.users.filter(u => Number(u.is_admin) !== 1 && u.server === 'YENİ SERVER');

    return `
      <div style="display: flex; flex-direction: column; gap: 2rem; margin-top: 1rem;">
        <div class="card" style="background: rgba(20, 20, 30, 0.6); padding: 1.5rem; border: 1px solid rgba(124, 58, 237, 0.2);">
          <h3 style="color: var(--accent); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">👑 Süper Adminler <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">(Tüm sunucularda geçerlidir)</span></h3>
          ${this.renderUserTable(superAdmins)}
        </div>
        
        <div class="card" style="background: rgba(20, 20, 30, 0.4); padding: 1.5rem; border: 1px solid var(--border);">
          <h3 style="color: var(--secondary); margin-bottom: 1rem;">🌐 OIMSFKTS Sunucusu Kullanıcıları</h3>
          ${this.renderUserTable(oimsUsers)}
        </div>
        
        <div class="card" style="background: rgba(20, 20, 30, 0.4); padding: 1.5rem; border: 1px solid var(--border);">
          <h3 style="color: var(--secondary); margin-bottom: 1rem;">🌐 YENİ SERVER Sunucusu Kullanıcıları</h3>
          ${this.renderUserTable(yeniUsers)}
        </div>
      </div>
    `;
  },

  showCharacterModal() {
    const html = `
      <h3 style="margin-bottom: 1.5rem;">Yeni Karakter Ekle</h3>
      <div class="form-group">
        <label>Karakter Adı (Gerçek Kişi)</label>
        <input type="text" id="char-name" class="input" placeholder="Örn: Ege">
      </div>
      <div class="form-group">
        <label>Avatar Emojisi</label>
        <input type="text" id="char-emoji" class="input" placeholder="Örn: 🎮" maxlength="2">
      </div>
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button class="btn btn-secondary" onclick="App.closeModal()" style="flex: 1;">İptal</button>
        <button class="btn btn-primary" onclick="AdminPage.saveCharacter()" style="flex: 1;">Kaydet</button>
      </div>
    `;
    App.showModal(html);
  },

  async saveCharacter() {
    const name = document.getElementById('char-name').value;
    const emoji = document.getElementById('char-emoji').value || '👤';
    if (!name) return App.showToast('İsim gerekli', 'error');
    
    try {
      App.showLoading();
      await API.createCharacter({ name, avatar_emoji: emoji });
      App.closeModal();
      this.loadData();
      App.showToast('Karakter eklendi', 'success');
    } catch(err) { App.showToast(err.message, 'error'); } finally { App.hideLoading(); }
  },

  showEditCharacterModal(char) {
    const html = `
      <h3 style="margin-bottom: 1.5rem;">Karakteri Düzenle</h3>
      <div class="form-group">
        <label>Karakter Adı (Gerçek Kişi)</label>
        <input type="text" id="edit-char-name" class="input" value="${char.name}">
      </div>
      <div class="form-group">
        <label>Avatar Emojisi</label>
        <input type="text" id="edit-char-emoji" class="input" value="${char.avatar_emoji}" maxlength="2">
      </div>
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button class="btn btn-secondary" onclick="App.closeModal()" style="flex: 1;">İptal</button>
        <button class="btn btn-primary" onclick="AdminPage.updateCharacter(${char.id})" style="flex: 1;">Güncelle</button>
      </div>
    `;
    App.showModal(html);
  },

  async updateCharacter(id) {
    const name = document.getElementById('edit-char-name').value;
    const emoji = document.getElementById('edit-char-emoji').value || '👤';
    if (!name) return App.showToast('İsim gerekli', 'error');
    
    try {
      App.showLoading();
      await API.updateCharacter(id, { name, avatar_emoji: emoji });
      App.closeModal();
      this.loadData();
      App.showToast('Karakter güncellendi', 'success');
    } catch(err) { App.showToast(err.message, 'error'); } finally { App.hideLoading(); }
  },

  async deleteCharacter(id) {
    if(!confirm('Bu karakteri ve tüm dönemlerini silmek istediğine emin misin?')) return;
    try {
      App.showLoading();
      await API.deleteCharacter(id);
      this.loadData();
      App.showToast('Silindi', 'success');
    } catch(err) { App.showToast(err.message, 'error'); } finally { App.hideLoading(); }
  },

  showEraModal(charId) {
    const html = `
      <h3 style="margin-bottom: 1.5rem;">Yeni Dönem Ekle</h3>
      <div style="display: flex; gap: 1rem;">
        <div class="form-group" style="flex: 1;">
          <label>Yaş</label>
          <input type="number" id="era-age" class="input" placeholder="Örn: 16" min="10" max="99">
        </div>
        <div class="form-group" style="flex: 2;">
          <label>Etiket (Opsiyonel)</label>
          <input type="text" id="era-label" class="input" placeholder="Örn: Lise Dönemi">
        </div>
      </div>
      
      <div style="margin-top: 1rem;">
        <h4 style="color:var(--text-secondary); margin-bottom: 0.5rem; border-bottom:1px solid var(--border); padding-bottom:0.5rem;">Yetenek Puanları (0-100)</h4>
        
        ${['lol', 'valorant', 'cs', 'futbol', 'fifa'].map(b => `
          <div class="form-group" style="margin-bottom: 0.8rem; display: flex; align-items: center; gap: 1rem;">
            <label style="width: 80px; margin: 0;">${b.toUpperCase()}</label>
            <input type="range" id="rating-${b}" min="0" max="100" value="50" style="flex: 1;" oninput="document.getElementById('val-${b}').innerText = this.value">
            <span id="val-${b}" style="width: 30px; text-align: right; font-weight: bold;">50</span>
          </div>
        `).join('')}
      </div>
      
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button class="btn btn-secondary" onclick="App.closeModal()" style="flex: 1;">İptal</button>
        <button class="btn btn-primary" onclick="AdminPage.saveEra(${charId})" style="flex: 1;">Kaydet</button>
      </div>
    `;
    App.showModal(html);
  },

  async saveEra(charId) {
    const age = document.getElementById('era-age').value;
    if(!age) return App.showToast('Yaş gerekli', 'error');
    
    const data = {
      age,
      era_label: document.getElementById('era-label').value,
      rating_lol: document.getElementById('rating-lol').value,
      rating_valorant: document.getElementById('rating-valorant').value,
      rating_cs: document.getElementById('rating-cs').value,
      rating_futbol: document.getElementById('rating-futbol').value,
      rating_fifa: document.getElementById('rating-fifa').value
    };
    
    try {
      App.showLoading();
      await API.createEra(charId, data);
      App.closeModal();
      this.loadData();
      App.showToast('Dönem eklendi', 'success');
    } catch(err) { App.showToast(err.message, 'error'); } finally { App.hideLoading(); }
  },

  showEditEraModal(era) {
    const isYeniServer = localStorage.getItem('5x5_active_server') === 'YENİ SERVER';
    const html = `
      <h3 style="margin-bottom: 1.5rem;">${isYeniServer ? 'Karakter Güçlerini Düzenle' : 'Dönemi Düzenle'}</h3>
      ${isYeniServer ? `
        <input type="hidden" id="edit-era-age" value="0">
        <input type="hidden" id="edit-era-label" value="">
      ` : `
        <div style="display: flex; gap: 1rem;">
          <div class="form-group" style="flex: 1;">
            <label>Yaş</label>
            <input type="number" id="edit-era-age" class="input" value="${era.age}" min="10" max="99">
          </div>
          <div class="form-group" style="flex: 2;">
            <label>Etiket (Opsiyonel)</label>
            <input type="text" id="edit-era-label" class="input" value="${era.era_label || ''}">
          </div>
        </div>
      `}
      
      <div style="margin-top: 1rem;">
        <h4 style="color:var(--text-secondary); margin-bottom: 0.5rem; border-bottom:1px solid var(--border); padding-bottom:0.5rem;">Yetenek Puanları (0-100)</h4>
        
        ${['lol', 'valorant', 'cs', 'futbol', 'fifa'].map(b => `
          <div class="form-group" style="margin-bottom: 0.8rem; display: flex; align-items: center; gap: 1rem;">
            <label style="width: 80px; margin: 0;">${b.toUpperCase()}</label>
            <input type="range" id="edit-rating-${b}" min="0" max="100" value="${era['rating_' + b] || 50}" style="flex: 1;" oninput="document.getElementById('edit-val-${b}').innerText = this.value">
            <span id="edit-val-${b}" style="width: 30px; text-align: right; font-weight: bold;">${era['rating_' + b] || 50}</span>
          </div>
        `).join('')}
      </div>
      
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button class="btn btn-secondary" onclick="App.closeModal()" style="flex: 1;">İptal</button>
        <button class="btn btn-primary" onclick="AdminPage.updateEra(${era.id})" style="flex: 1;">Güncelle</button>
      </div>
    `;
    App.showModal(html);
  },

  async updateEra(id) {
    const isYeniServer = localStorage.getItem('5x5_active_server') === 'YENİ SERVER';
    let age = 0;
    let era_label = '';
    
    if (!isYeniServer) {
      age = document.getElementById('edit-era-age').value;
      if(!age) return App.showToast('Yaş gerekli', 'error');
      era_label = document.getElementById('edit-era-label').value;
    }
    
    const data = {
      age,
      era_label,
      rating_lol: document.getElementById('edit-rating-lol').value,
      rating_valorant: document.getElementById('edit-rating-valorant').value,
      rating_cs: document.getElementById('edit-rating-cs').value,
      rating_futbol: document.getElementById('edit-rating-futbol').value,
      rating_fifa: document.getElementById('edit-rating-fifa').value
    };
    
    try {
      App.showLoading();
      await API.updateEra(id, data);
      App.closeModal();
      this.loadData();
      App.showToast('Dönem güncellendi', 'success');
    } catch(err) { App.showToast(err.message, 'error'); } finally { App.hideLoading(); }
  },

  async deleteEra(id) {
    if(!confirm('Dönemi silmek istediğine emin misin?')) return;
    try {
      App.showLoading();
      await API.deleteEra(id);
      this.loadData();
    } catch(err) { App.showToast(err.message, 'error'); } finally { App.hideLoading(); }
  },

  async changeUserRole(id, role) {
    try {
      App.showLoading();
      await API.toggleAdmin(id, { is_admin: parseInt(role) });
      App.showToast('Kullanıcı rolü başarıyla güncellendi', 'success');
      this.loadData();
    } catch(err) { App.showToast(err.message, 'error'); } finally { App.hideLoading(); }
  },

  async changeUserServer(id, server) {
    try {
      App.showLoading();
      await API.changeUserServer(id, { server });
      App.showToast('Kullanıcı sunucusu başarıyla değiştirildi', 'success');
      this.loadData();
    } catch(err) { App.showToast(err.message, 'error'); } finally { App.hideLoading(); }
  },

  async deleteUser(id, username) {
    if (!confirm(`"${username}" isimli kullanıcıyı tamamen silmek istediğinize emin misiniz? (Bu işlem geri alınamaz!)`)) return;
    try {
      App.showLoading();
      await API.deleteUser(id);
      App.showToast('Kullanıcı başarıyla silindi', 'success');
      this.loadData();
    } catch(err) { App.showToast(err.message, 'error'); } finally { App.hideLoading(); }
  },

  showPasswordModal(userId, username) {
    const html = `
      <h3 style="margin-bottom: 1.5rem;">Şifre Değiştir: ${username}</h3>
      <p style="color: var(--text-muted); margin-bottom: 1rem;">Uyarı: Şifreler şifrelenmiş olarak tutulduğu için eski şifre görüntülenemez, ancak üzerine yazarak yenilenebilir.</p>
      <div class="form-group">
        <label>Yeni Şifre</label>
        <input type="password" id="new-user-password" class="input" placeholder="En az 6 karakter">
      </div>
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button class="btn btn-secondary" onclick="App.closeModal()" style="flex: 1;">İptal</button>
        <button class="btn btn-primary" onclick="AdminPage.changeUserPassword(${userId})" style="flex: 1;">Kaydet</button>
      </div>
    `;
    App.showModal(html);
  },

  async changeUserPassword(userId) {
    const password = document.getElementById('new-user-password').value;
    if (!password || password.length < 6) return App.showToast('Şifre en az 6 karakter olmalıdır', 'error');
    
    try {
      App.showLoading();
      await API.changeUserPassword(userId, { password });
      App.closeModal();
      App.showToast('Kullanıcı şifresi başarıyla güncellendi', 'success');
    } catch(err) {
      App.showToast(err.message, 'error');
    } finally {
      App.hideLoading();
    }
  },

  renderTestTab() {
    return `
      <div class="card" style="width: 100%; margin: 0 auto;">
        <h3 style="margin-bottom: 1rem;">Branş Seç ve Test Et</h3>
        <p style="color: var(--text-muted); margin-bottom: 2rem;">Rastgele 10 karakter seçilerek bir maç simüle edilir.</p>
        <div class="admin-test-launcher">
          <select id="test-branch-select" class="input" style="flex: 1;" onchange="AdminPage.updateTestSimulationMode()">
            <option value="lol">🎮 League of Legends</option>
            <option value="valorant">🎯 Valorant</option>
            <option value="cs">🔫 Counter-Strike</option>
            <option value="futbol">⚽ Halı Saha</option>
            <option value="fifa">🕹️ FIFA</option>
          </select>
          <button class="btn btn-primary" type="button" data-admin-test-mode="standard" onclick="AdminPage.runTestSimulation(false)" style="width: auto;">Testi Başlat 🚀</button>
          <button id="btn-admin-beta-test" class="btn btn-secondary" type="button" data-admin-test-mode="beta" onclick="AdminPage.runTestSimulation(true)" style="width: auto; background: rgba(16, 185, 129, 0.1); border-color: var(--success); color: var(--success);">Beta Testi 🧪</button>
        </div>
        <p id="admin-beta-test-hint" style="color: var(--text-muted); margin: -1.25rem 0 1.25rem; font-size: 0.82rem;">
          Halı Saha ve FIFA seçildiğinde Beta Testi, Futbol V2 tam maç motorunu kullanır.
        </p>
        <div class="admin-test-seed-row">
          <label for="test-simulation-seed">Tekrar oynatma seed’i</label>
          <input id="test-simulation-seed" type="text" maxlength="128" placeholder="Boş bırakırsan otomatik oluşturulur">
          <small>Aynı seed, aynı kadroyu ve aynı simülasyon akışını tekrar üretir.</small>
        </div>
        <div class="admin-football-v2-launch">
          <div>
            <strong>🧠 Beta Futbol V2 · Paket 8</strong>
            <span>Canlı istatistik, planlı hücumlar ve gerçek gol-sevinç-santra akışı</span>
          </div>
          <div class="admin-football-v2-actions">
            <button class="btn btn-secondary" type="button" data-admin-test-mode="football-v2" onclick="AdminPage.runTestSimulation('football-v2')">30 sn Lab</button>
            <button class="btn btn-secondary" type="button" data-admin-test-mode="football-v2-full" onclick="AdminPage.runTestSimulation('football-v2-full')">Tam Maç V2</button>
            <button class="btn btn-primary" type="button" data-admin-test-mode="football-v2-compare" onclick="AdminPage.runTestSimulation('football-v2-compare')">A/B Karşılaştır</button>
          </div>
        </div>

        <div class="admin-beta-visual-toolbar" id="admin-beta-visual-toolbar" style="display:none;">
          <div>
            <strong id="admin-beta-visual-title">Beta Görsel Testi</strong>
            <span>Beta lobisindeki motorun birebir önizlemesi</span>
          </div>
          <div class="admin-test-speed-controls" aria-label="Test simülasyonu hızı">
            <button type="button" class="active" data-test-speed="1" onclick="AdminPage.setTestSimulationSpeed(1)">1x</button>
            <button type="button" data-test-speed="2" onclick="AdminPage.setTestSimulationSpeed(2)">2x</button>
            <button type="button" data-test-speed="4" onclick="AdminPage.setTestSimulationSpeed(4)">4x</button>
          </div>
        </div>

        <div id="admin-football-viewer-host"></div>
        <section class="admin-cs-telemetry" id="admin-cs-telemetry" style="display:none;"></section>
        
        <div class="live-scoreboard hidden" id="test-scoreboard" style="display: flex; justify-content: center; gap: 2rem; margin-bottom: 1rem; align-items: center; background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 1.2rem; color: var(--primary-light); flex: 1; text-align: right;">Mavi Takım</div>
          <div style="font-size: 2.5rem; font-weight: bold; color: var(--accent); width: 40px; text-align: center;" id="test-score-t1">0</div>
          <div style="font-size: 1.5rem;">-</div>
          <div style="font-size: 2.5rem; font-weight: bold; color: var(--accent); width: 40px; text-align: center;" id="test-score-t2">0</div>
          <div style="font-size: 1.2rem; color: var(--danger); flex: 1; text-align: left;">Kırmızı Takım</div>
        </div>

        <div id="shared-stats-container" style="display: none; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;"></div>
        <div id="test-detailed-scoreboard" style="display: none; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
           <div id="test-t1-details" style="flex: 1; min-width: 300px; background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; overflow-x: auto;"></div>
           <div id="test-t2-details" style="flex: 1; min-width: 300px; background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; overflow-x: auto;"></div>
        </div>

        <div class="simulation-terminal hidden" id="test-terminal" style="height: 500px; margin-top: 1rem;"></div>
      </div>
    `;
  },

  updateTestSimulationMode() {
    const branch = document.getElementById('test-branch-select')?.value;
    const betaButton = document.getElementById('btn-admin-beta-test');
    const hint = document.getElementById('admin-beta-test-hint');
    const footballV2 = branch === 'futbol' || branch === 'fifa';

    if (betaButton) {
      betaButton.textContent = footballV2 ? 'Futbol V2 Beta Testi 🧠' : 'Beta Testi 🧪';
    }
    if (hint) {
      hint.textContent = footballV2
        ? 'Bu branşın Beta Testi artık Futbol V2 tam maç dünya motorunu çalıştırır.'
        : 'Halı Saha ve FIFA seçildiğinde Beta Testi, Futbol V2 tam maç motorunu kullanır.';
    }
  },

  setTestSimulationSpeed(speed) {
    this.testSimulationSpeed = Number(speed) || 1;
    document.querySelectorAll('[data-test-speed]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.testSpeed) === this.testSimulationSpeed);
    });
    if (this.adminFootballVis?.setSpeed) this.adminFootballVis.setSpeed(this.testSimulationSpeed);
    if (this.adminShooterVis?.setSpeed) this.adminShooterVis.setSpeed(this.testSimulationSpeed);
    if (this.adminFootballV2Lab?.setSpeed) this.adminFootballV2Lab.setSpeed(this.testSimulationSpeed);
  },

  renderCsBetaTelemetry(telemetry) {
    if (!telemetry) return '';
    const percent = value => `%${Math.round((Number(value) || 0) * 100)}`;
    const metrics = telemetry.metrics || {};
    const payload = telemetry.payload || {};
    const balance = telemetry.balance || {};
    const issues = telemetry.criticalIssues || [];
    const cards = [
      ['T RAUNT', percent(metrics.attackerWinRate)],
      ['PLANT', percent(metrics.plantRate)],
      ['DEFUSE / PLANT', percent(metrics.defusePerPlant)],
      ['SAVE / PLANT', percent(metrics.savePerPlant)],
      ['UTILITY / RAUNT', Number(metrics.utilityPerRound || 0).toFixed(2)],
      ['FULL BUY', percent(metrics.fullBuyShare)],
      ['VERİ BOYUTU', `${Number(payload.resultKilobytes || 0).toLocaleString('tr-TR')} KB`],
      ['ORT. OYUNCU SNAPSHOT', Number(payload.averagePlayersPerEvent || 0).toFixed(2)]
    ].map(([label, value]) => `
      <div class="admin-cs-telemetry-card">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join('');
    const checks = (balance.checks || []).map(check => `
      <span class="${check.pass ? 'pass' : 'review'}">
        ${check.pass ? '✓' : '!'} ${check.key}
      </span>
    `).join('');
    return `
      <header>
        <div>
          <strong>CS BETA 5L · SAĞLIK VE DENGE</strong>
          <small>${telemetry.version || 'release'} · ${telemetry.performance?.simulationMs || 0} ms üretim</small>
        </div>
        <b class="${telemetry.status === 'pass' && balance.status === 'pass' ? 'pass' : 'review'}">
          ${telemetry.status === 'pass' && balance.status === 'pass' ? 'YAYINA HAZIR' : 'İNCELEME GEREKİYOR'}
        </b>
      </header>
      <div class="admin-cs-telemetry-grid">${cards}</div>
      <div class="admin-cs-telemetry-checks">${checks}</div>
      <div class="admin-cs-telemetry-integrity ${issues.length ? 'has-issues' : ''}">
        ${issues.length
          ? `<strong>${issues.length} kritik bulgu</strong><span>${issues.slice(0, 4).join(' · ')}</span>`
          : '<strong>0 kritik bulgu</strong><span>Duvar/görüş, teleport, plant, çift ölüm ve envanter kontrolleri temiz.</span>'}
      </div>
    `;
  },

  async runFootballV2Lab(mode = 'lab') {
    const runToken = ++this.testRunToken;
    const branch = document.getElementById('test-branch-select')?.value;
    if (!['futbol', 'fifa'].includes(branch)) {
      App.showToast('Futbol V2 Lab için Halı Saha veya FIFA seçilmeli.', 'error');
      return;
    }
    if (!window.FootballV2Lab) {
      App.showToast('Futbol V2 laboratuvar oynatıcısı yüklenemedi.', 'error');
      return;
    }
    const globalChatBody = document.getElementById('global-chat-body');
    if (globalChatBody && !globalChatBody.classList.contains('hidden')) {
      App.toggleGlobalChat();
    }

    if (this.adminFootballVis?.stop) this.adminFootballVis.stop();
    if (this.adminShooterVis?.stop) this.adminShooterVis.stop();
    if (this.adminFootballV2Lab?.stop) this.adminFootballV2Lab.stop();
    this.adminFootballVis = null;
    this.adminShooterVis = null;
    this.adminFootballV2Lab = null;

    const seedInput = document.getElementById('test-simulation-seed');
    const requestedSeed = seedInput?.value?.trim() || '';
    const terminal = document.getElementById('test-terminal');
    const scoreboard = document.getElementById('test-scoreboard');
    const detailed = document.getElementById('test-detailed-scoreboard');
    const sharedStats = document.getElementById('shared-stats-container');
    const visualToolbar = document.getElementById('admin-beta-visual-toolbar');
    const visualTitle = document.getElementById('admin-beta-visual-title');
    const visualHost = document.getElementById('admin-football-viewer-host');

    scoreboard.classList.add('hidden');
    scoreboard.style.display = 'none';
    detailed.style.display = 'none';
    sharedStats.style.display = 'none';
    terminal.classList.add('hidden');
    terminal.innerHTML = '';
    visualToolbar.style.display = 'flex';
    const branchLabel = branch === 'fifa' ? 'FIFA 11v11' : 'Halı Saha 5+1';
    const isFullMatch = mode === 'full';
    if (visualTitle) {
      visualTitle.textContent = `🧠 Futbol V2 · ${branchLabel} ${isFullMatch ? 'Tam Maç' : 'Hareket Laboratuvarı'}`;
    }
    visualHost.innerHTML = window.FootballV2Lab.render({ rootId: 'admin-football-v2-lab' });

    try {
      App.showLoading();
      const data = await API.testFootballV2Lab(branch, requestedSeed, mode);
      if (runToken !== this.testRunToken || !visualHost?.isConnected) return;
      if (seedInput && data.lab?.seed) seedInput.value = data.lab.seed;
      this.adminFootballV2Lab = window.FootballV2Lab.mount('admin-football-v2-lab');
      this.adminFootballV2Lab.setSpeed(this.testSimulationSpeed);
      this.adminFootballV2Lab.load(data.lab);
      App.showToast(`${branchLabel} V2 ${isFullMatch ? 'tam maçı' : 'hareket laboratuvarı'} başladı`, 'success');
    } catch (err) {
      visualHost.innerHTML = `<div class="card" style="margin-top:1rem; color:var(--danger);">V2 Laboratuvarı başlatılamadı: ${err.message}</div>`;
      App.showToast(err.message, 'error');
    } finally {
      App.hideLoading();
    }
  },

  renderFootballV2Comparison(data) {
    const legacy = data.legacy;
    const v2 = data.v2;
    const comparison = data.comparison;
    const formatMb = bytes => `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} MB`;
    const formatMs = value => `${Number(value || 0).toFixed(1)} ms`;
    return `
      <section class="admin-football-v2-comparison" aria-label="Eski Beta ve Futbol V2 karşılaştırması">
        <header>
          <div>
            <span>AYNI KADRO · AYNI SEED</span>
            <h4>Eski Beta ↔ Futbol V2</h4>
          </div>
          <code>${data.seed}</code>
        </header>
        <div class="admin-football-v2-comparison__grid">
          <article class="is-legacy">
            <span>ESKİ BETA</span>
            <strong>${legacy.score[1]} - ${legacy.score[2]}</strong>
            <small>${legacy.lineCount} anlatım satırı · ${formatMs(legacy.performance.simulationMs)}</small>
            <small>Tahmini veri ${formatMb(legacy.performance.estimatedPayloadBytes)}</small>
          </article>
          <article class="is-v2">
            <span>FUTBOL V2 TAM MAÇ</span>
            <strong>${v2.score[1]} - ${v2.score[2]}</strong>
            <small>${v2.telemetry.shots} şut · ${Number(v2.telemetry.xg).toFixed(2)} xG · ${formatMs(v2.performance?.simulationMs)}</small>
            <small>${v2.snapshotRate} Hz snapshot · ${formatMb(v2.performance?.estimatedPayloadBytes)}</small>
          </article>
        </div>
        <div class="admin-football-v2-comparison__checks">
          <span class="${comparison.v2TeleportCount === 0 ? 'is-good' : 'is-bad'}">Işınlanma: ${comparison.v2TeleportCount}</span>
          <span class="${comparison.v2BallDiscontinuities === 0 ? 'is-good' : 'is-bad'}">Top süreksizliği: ${comparison.v2BallDiscontinuities}</span>
          <span>Gol farkı: ${comparison.v2TotalGoals - comparison.legacyTotalGoals >= 0 ? '+' : ''}${comparison.v2TotalGoals - comparison.legacyTotalGoals}</span>
          <span>Kazanan ${comparison.sameWinner ? 'aynı' : 'farklı'}</span>
        </div>
      </section>
    `;
  },

  async runFootballV2Comparison() {
    const runToken = ++this.testRunToken;
    const branch = document.getElementById('test-branch-select')?.value;
    if (!['futbol', 'fifa'].includes(branch)) {
      App.showToast('A/B karşılaştırması için Halı Saha veya FIFA seçilmeli.', 'error');
      return;
    }
    if (!window.FootballV2Lab) {
      App.showToast('Futbol V2 oynatıcısı yüklenemedi.', 'error');
      return;
    }

    if (this.adminFootballVis?.stop) this.adminFootballVis.stop();
    if (this.adminShooterVis?.stop) this.adminShooterVis.stop();
    if (this.adminFootballV2Lab?.stop) this.adminFootballV2Lab.stop();
    this.adminFootballVis = null;
    this.adminShooterVis = null;
    this.adminFootballV2Lab = null;

    const seedInput = document.getElementById('test-simulation-seed');
    const requestedSeed = seedInput?.value?.trim() || '';
    const terminal = document.getElementById('test-terminal');
    const scoreboard = document.getElementById('test-scoreboard');
    const detailed = document.getElementById('test-detailed-scoreboard');
    const sharedStats = document.getElementById('shared-stats-container');
    const visualToolbar = document.getElementById('admin-beta-visual-toolbar');
    const visualTitle = document.getElementById('admin-beta-visual-title');
    const visualHost = document.getElementById('admin-football-viewer-host');
    const branchLabel = branch === 'fifa' ? 'FIFA 11v11' : 'Halı Saha 5+1';

    scoreboard.classList.add('hidden');
    scoreboard.style.display = 'none';
    detailed.style.display = 'none';
    sharedStats.style.display = 'none';
    terminal.classList.add('hidden');
    visualToolbar.style.display = 'flex';
    if (visualTitle) visualTitle.textContent = `⚖️ ${branchLabel} · Eski Beta / V2 A/B`;
    visualHost.innerHTML = '<div class="card" style="margin-top:1rem;">Aynı kadro ve seed ile iki motor hazırlanıyor…</div>';

    try {
      App.showLoading();
      const data = await API.compareFootballV2(branch, requestedSeed);
      if (runToken !== this.testRunToken || !visualHost?.isConnected) return;
      if (seedInput && data.seed) seedInput.value = data.seed;
      visualHost.innerHTML = `
        ${this.renderFootballV2Comparison(data)}
        ${window.FootballV2Lab.render({ rootId: 'admin-football-v2-lab' })}
      `;
      this.adminFootballV2Lab = window.FootballV2Lab.mount('admin-football-v2-lab');
      this.adminFootballV2Lab.setSpeed(this.testSimulationSpeed);
      this.adminFootballV2Lab.load(data.v2);
      App.showToast(`${branchLabel} A/B karşılaştırması hazır`, 'success');
    } catch (err) {
      visualHost.innerHTML = `<div class="card" style="margin-top:1rem; color:var(--danger);">A/B karşılaştırması hazırlanamadı: ${err.message}</div>`;
      App.showToast(err.message, 'error');
    } finally {
      App.hideLoading();
    }
  },

  async runTestSimulation(isBeta = false) {
    if (isBeta === 'football-v2') {
      await this.runFootballV2Lab('lab');
      return;
    }
    if (isBeta === 'football-v2-full') {
      await this.runFootballV2Lab('full');
      return;
    }
    if (isBeta === 'football-v2-compare') {
      await this.runFootballV2Comparison();
      return;
    }
    const selectedBranch = document.getElementById('test-branch-select')?.value;
    if (isBeta === true && (selectedBranch === 'futbol' || selectedBranch === 'fifa')) {
      await this.runFootballV2Lab('full');
      return;
    }
    const runToken = ++this.testRunToken;
    let terminal = null;
    try {
    if (this.adminFootballVis?.stop) this.adminFootballVis.stop();
    if (this.adminShooterVis?.stop) this.adminShooterVis.stop();
    if (this.adminFootballV2Lab?.stop) this.adminFootballV2Lab.stop();
    this.adminFootballVis = null;
    this.adminShooterVis = null;
    this.adminFootballV2Lab = null;

    const branch = document.getElementById('test-branch-select').value;
    const seedInput = document.getElementById('test-simulation-seed');
    const requestedSeed = seedInput?.value?.trim() || '';
    const footballBetaTest = isBeta && (branch === 'futbol' || branch === 'fifa') && window.FootballMatchViewer;
    const shooterBetaTest = isBeta && branch === 'cs' && window.ShooterMatchViewer;
    const visualBetaTest = Boolean(footballBetaTest || shooterBetaTest);
    terminal = document.getElementById('test-terminal');
    const scoreboard = document.getElementById('test-scoreboard');
    const detailed = document.getElementById('test-detailed-scoreboard');
    const visualToolbar = document.getElementById('admin-beta-visual-toolbar');
    const visualHost = document.getElementById('admin-football-viewer-host');
    const csTelemetryHost = document.getElementById('admin-cs-telemetry');
    const visualTitle = document.getElementById('admin-beta-visual-title');
    
    terminal.classList.remove('hidden');
    scoreboard.classList.remove('hidden');
    scoreboard.style.display = visualBetaTest ? 'none' : 'flex';
    detailed.style.display = 'none'; // reset
    visualToolbar.style.display = visualBetaTest ? 'flex' : 'none';
    if (visualTitle) {
      visualTitle.textContent = shooterBetaTest ? '🔫 CS Dust II Beta Görsel Testi' : '⚽ Beta Futbol Görsel Testi';
    }
    visualHost.innerHTML = footballBetaTest
      ? window.FootballMatchViewer.render(branch, {
          rootId: 'admin-football-viewer',
          contextLabel: 'BETA TESTİ'
        })
      : (shooterBetaTest
        ? window.ShooterMatchViewer.render({
            rootId: 'admin-shooter-viewer',
            contextLabel: 'BETA TESTİ'
          })
        : '');
    if (csTelemetryHost) {
      csTelemetryHost.style.display = 'none';
      csTelemetryHost.innerHTML = '';
    }
    if (footballBetaTest) {
      this.adminFootballVis = window.FootballMatchViewer.mount('admin-football-viewer');
    } else if (shooterBetaTest) {
      this.adminShooterVis = window.ShooterMatchViewer.mount('admin-shooter-viewer');
    }
    if (visualBetaTest) {
      this.setTestSimulationSpeed(this.testSimulationSpeed);
      terminal.classList.add('fm-commentary-terminal');
      terminal.classList.toggle('sv-commentary-terminal', shooterBetaTest);
      terminal.style.height = '230px';
    } else {
      terminal.classList.remove('fm-commentary-terminal');
      terminal.classList.remove('sv-commentary-terminal');
      terminal.style.height = '500px';
    }
    document.getElementById('test-score-t1').textContent = '0';
    document.getElementById('test-score-t2').textContent = '0';
    terminal.innerHTML = `<div class="simulation-line">Simülasyon arka planda hazırlanıyor... ${isBeta ? '(🧪 BETA)' : ''}</div>`;
    
      App.showLoading();
      const data = await API.testSimulation(branch, isBeta, requestedSeed);
      App.hideLoading();
      if (seedInput && data.result?.seed) seedInput.value = data.result.seed;
      if (csTelemetryHost && shooterBetaTest && data.result?.csBetaTelemetry) {
        csTelemetryHost.innerHTML = this.renderCsBetaTelemetry(data.result.csBetaTelemetry);
        csTelemetryHost.style.display = 'block';
      }
      
      terminal.innerHTML = '';
      const lines = data.result.lines;
      const t1Div = document.getElementById('test-t1-details');
      const t2Div = document.getElementById('test-t2-details');
      const sharedStats = document.getElementById('shared-stats-container');
      
      const playLines = async () => {
          for (let i = 0; i < lines.length; i++) {
              if (runToken !== this.testRunToken || !terminal?.isConnected) return;
              const lineObj = lines[i];
              const text = typeof lineObj === 'string' ? lineObj : lineObj.text;

              if (lineObj.s1 !== undefined) document.getElementById('test-score-t1').textContent = lineObj.s1;
              if (lineObj.s2 !== undefined) document.getElementById('test-score-t2').textContent = lineObj.s2;

              if (visualBetaTest && this.adminFootballVis) {
                await this.adminFootballVis.update({
                  ...lineObj,
                  score1: lineObj.s1,
                  score2: lineObj.s2,
                  branch,
                  visualBeta: true,
                  visualSpeed: this.testSimulationSpeed,
                  player1Name: data.team1.displayName,
                  player2Name: data.team2.displayName
                });
              }
              if (visualBetaTest && this.adminShooterVis) {
                await this.adminShooterVis.update({
                  ...lineObj,
                  score1: lineObj.s1,
                  score2: lineObj.s2,
                  branch,
                  visualBeta: true,
                  visualSpeed: this.testSimulationSpeed,
                  player1Name: data.team1.displayName,
                  player2Name: data.team2.displayName
                });
              }

              if (lineObj.state && (branch === 'lol' || branch === 'valorant' || branch === 'cs' || branch === 'futbol' || branch === 'fifa')) {
                detailed.style.display = visualBetaTest ? 'none' : 'flex';
                
                const renderTeam = (tState, isT1) => `
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
                    <strong style="color: ${isT1 ? 'var(--primary-light)' : 'var(--danger)'}; font-size: 1.1rem;">${tState.name}</strong>
                    ${branch === 'lol' ? `
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
                        <th>R</th>
                        <th>${branch === 'lol' || branch === 'valorant' || branch === 'cs' ? 'K/D/A' : (branch === 'futbol' || branch === 'fifa' ? 'G/A' : 'Skor')}</th>
                        ${branch === 'lol' ? '<th>CS</th><th>DMG</th>' : ''}
                        ${branch === 'valorant' ? '<th>HS%</th>' : ''}
                        ${branch === 'cs' ? '<th>ADR</th>' : ''}
                        ${branch === 'futbol' ? '<th>Kurtarış</th><th>Top Kapma</th>' : ''}
                        ${branch === 'fifa' ? '<th>İsabetli Şut</th>' : ''}
                      </tr>
                    </thead>
                    <tbody>
                      ${tState.players.map(p => `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                          <td style="text-align: left; padding: 0.5rem;">
                            <span style="font-size: 1.1rem; margin-right: 0.25rem;">${p.emoji}</span>
                            <span>${p.name || p.idName}</span>
                          </td>
                          <td style="color: ${p.rating > 7.0 ? 'var(--success)' : (p.rating > 5.0 ? 'var(--primary-light)' : 'var(--text-muted)')}">${typeof p.rating === 'number' ? p.rating.toFixed(1) : p.rating}</td>
                          <td style="font-weight: bold; letter-spacing: 1px;">
                            ${branch === 'lol' || branch === 'valorant' || branch === 'cs' ? 
                              `<span style="color:var(--success)">${p.k || 0}</span>/<span style="color:var(--danger)">${p.d || 0}</span>/<span style="color:var(--accent)">${p.a || 0}</span>` : 
                              (branch === 'futbol' || branch === 'fifa' ? `<span style="color:var(--success)">${p.k || 0}</span>/<span style="color:var(--accent)">${p.a || 0}</span>` : '')
                            }
                          </td>
                          ${branch === 'lol' ? `<td>${p.cs || 0}</td><td>-</td>` : ''}
                          ${branch === 'valorant' ? `<td>-</td>` : ''}
                          ${branch === 'cs' ? `<td>-</td>` : ''}
                          ${branch === 'futbol' ? `<td>-</td><td>-</td>` : ''}
                          ${branch === 'fifa' ? `<td>-</td>` : ''}
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                `;
                
                if (branch === 'futbol' || branch === 'fifa') {
                  sharedStats.style.display = visualBetaTest ? 'none' : 'flex';
                  const t1 = lineObj.state.t1;
                  const t2 = lineObj.state.t2;
                  
                  const possBar = `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: bold;">
                      <span style="color: var(--primary-light);">${t1.stats.poss}%</span>
                      <span style="color: var(--text-muted);">Topla Oynama</span>
                      <span style="color: var(--danger);">${t2.stats.poss}%</span>
                    </div>
                    <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--bg-secondary);">
                      <div style="width: ${t1.stats.poss}%; background: var(--primary-light); transition: width 0.3s;"></div>
                      <div style="width: ${t2.stats.poss}%; background: var(--danger); transition: width 0.3s;"></div>
                    </div>
                  `;
                  
                  const shotsBar = `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: bold;">
                      <span style="color: var(--primary-light);">${t1.stats.shotsOnTarget} / ${t1.stats.shots}</span>
                      <span style="color: var(--text-muted);">İsabetli / Şut</span>
                      <span style="color: var(--danger);">${t2.stats.shotsOnTarget} / ${t2.stats.shots}</span>
                    </div>
                    <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--bg-secondary);">
                      <div style="width: ${t1.stats.shots === 0 ? 50 : (t1.stats.shots / (t1.stats.shots + t2.stats.shots) * 100)}%; background: var(--primary-light); transition: width 0.3s;"></div>
                      <div style="width: ${t2.stats.shots === 0 ? 50 : (t2.stats.shots / (t1.stats.shots + t2.stats.shots) * 100)}%; background: var(--danger); transition: width 0.3s;"></div>
                    </div>
                  `;

                  const xgBar = `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: bold;">
                      <span style="color: var(--primary-light);">${t1.stats.xg.toFixed(2)}</span>
                      <span style="color: var(--text-muted);">Gol Beklentisi (xG)</span>
                      <span style="color: var(--danger);">${t2.stats.xg.toFixed(2)}</span>
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

                if (t1Div && lineObj.state.t1) t1Div.innerHTML = renderTeam(lineObj.state.t1, true);
                if (t2Div && lineObj.state.t2) t2Div.innerHTML = renderTeam(lineObj.state.t2, false);
              }

              const line = document.createElement('div');
              line.className = 'simulation-line';
              line.style.marginBottom = '0.5rem';

              let lineText = text;


              if (lineText) {
                  const appendText = () => {
                      if (lineText.startsWith('---') || lineText.startsWith('===')) {
                        line.style.color = 'var(--secondary)';
                        line.style.fontWeight = 'bold';
                        line.style.marginTop = '1rem';
                        line.textContent = lineText;
                      } else if (lineText.startsWith('🏆') || lineText.startsWith('💥')) {
                        line.style.color = 'var(--accent)';
                        line.style.fontWeight = 'bold';
                        line.style.fontSize = '1.1rem';
                        line.textContent = lineText;
                      } else if (lineText.includes('🔥 PENTAKILL 🔥') || lineText.includes('💥 KUSURSUZ ACE! 💥') || lineText.includes('⚽ GOOOL! ⚽')) {
                        const parts = lineText.split('|');
                        let color = lineText.includes('GOOOL') ? (lineObj.teamId === 1 ? '#3b82f6' : (lineObj.teamId === 2 ? '#ef4444' : '#10b981')) : '#ff4500'; 
                        let shadowColor = lineText.includes('GOOOL') ? (lineObj.teamId === 1 ? '59, 130, 246' : (lineObj.teamId === 2 ? '239, 68, 68' : '16, 185, 129')) : '255, 69, 0';
                        line.innerHTML = `<span style="color: ${color}; font-size: 1.5rem; font-weight: 900; text-transform: uppercase; text-shadow: 0 0 10px ${color};">${parts[0]}</span> <br> <span style="font-size: 1.2rem; font-weight: bold; color: #fff;">${parts[1]}</span>`;
                        line.style.textAlign = 'center';
                        line.style.padding = '1rem';
                        line.style.border = `2px solid ${color}`;
                        line.style.backgroundColor = `rgba(${shadowColor}, 0.15)`;
                        line.style.boxShadow = `0 0 15px rgba(${shadowColor}, 0.5)`;
                        line.style.margin = '1rem 0';
                        line.style.borderRadius = '8px';
                      } else {
                        line.textContent = lineText;
                        if (lineObj.teamId === 1) line.style.color = '#60a5fa'; 
                        else if (lineObj.teamId === 2) line.style.color = '#f87171';

                        if (lineText.includes('FIRST BLOOD')) line.style.color = '#ef4444';
                        if (lineText.includes('QUADRA KILL')) line.style.color = '#f97316';
                        if (lineText.includes('Triple Kill')) line.style.color = '#f59e0b';
                        if (lineText.includes('Double Kill')) line.style.color = '#eab308';
                        if (lineText.includes('BARON') || lineText.includes('Ejder')) line.style.color = '#c084fc';
                        if (lineText.includes('Kule')) line.style.color = '#fcd34d';
                      }
                      terminal.appendChild(line);
                      terminal.scrollTop = terminal.scrollHeight;
                  };
                  
                  appendText();
              }
              
              const lineDelay = shooterBetaTest
                ? (lineObj.visualEvent ? 0 : Math.max(8, Math.round(30 / this.testSimulationSpeed)))
                : visualBetaTest
                  ? Math.max(25, Math.round(150 / this.testSimulationSpeed))
                  : 180;
              if (lineDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, lineDelay));
              }
          }
          if (runToken !== this.testRunToken || !terminal?.isConnected) return;
          App.showToast('Test simülasyonu bitti', 'success');
      };
      await playLines();
      
    } catch (err) {
      App.hideLoading();
      if (terminal) {
        terminal.classList.remove('hidden');
        terminal.innerHTML += '<div class="simulation-line highlight" style="color:var(--danger)">HATA: ' + err.message + '</div>';
      }
      App.showToast(err.message, 'error');
    }
  },

  renderTacticsBeta() {
     const branch = this.tacticsBranch;
     const getKeysForBranch = (b) => {
        if (b === 'lol') return ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT', 'style_agresif', 'style_pasif'];
        if (b === 'valorant') return ['Sentinel', 'Duelist', 'Smoker', 'Öncü', 'style_agresif', 'style_pasif'];
        if (b === 'cs') return ['style_agresif', 'style_pasif'];
        if (b === 'futbol') return ['defans', 'orta', 'hücum', 'style_defansif', 'style_dengeli', 'style_ofansif'];
        if (b === 'fifa') return ['LB', 'LCB', 'RCB', 'RB', 'LDM', 'RDM', 'LAM', 'CAM', 'RAM', 'ST', 'style_defansif', 'style_dengeli', 'style_ofansif'];
        return [];
     };
     
     const keys = getKeysForBranch(branch);
     
     const getModifierValue = (eraId, b, key) => {
        const mod = this.modifiers.find(m => m.character_era_id === eraId && m.branch === b && m.modifier_key === key);
        return mod ? mod.modifier_value : 0;
     };

     return `
       <div style="background: var(--bg-secondary); border-radius: 8px; padding: 1.5rem; border: 1px solid var(--border);">
          <h3 style="margin-top: 0; color: var(--accent); margin-bottom: 1.5rem;">📊 Taktiksel Değişim Değerleri</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">
             Buradan her karakter dönemi için seçilen rol/mevki veya oyun tarzına göre alacağı artı veya eksi güç değişimini ayarlayabilirsin.
          </p>
          
          <div class="tabs sub-tabs" style="margin-bottom: 1.5rem; background: var(--bg-tertiary); border-radius: 6px; padding: 0.2rem; display: flex; gap: 0.5rem;">
             <div class="tab ${branch === 'lol' ? 'active' : ''}" onclick="AdminPage.switchTacticsBranch('lol')" style="flex: 1; text-align: center; padding: 0.5rem; font-size: 0.9rem; cursor: pointer; border-radius: 4px;">🎮 LoL</div>
             <div class="tab ${branch === 'valorant' ? 'active' : ''}" onclick="AdminPage.switchTacticsBranch('valorant')" style="flex: 1; text-align: center; padding: 0.5rem; font-size: 0.9rem; cursor: pointer; border-radius: 4px;">🎯 Valorant</div>
             <div class="tab ${branch === 'cs' ? 'active' : ''}" onclick="AdminPage.switchTacticsBranch('cs')" style="flex: 1; text-align: center; padding: 0.5rem; font-size: 0.9rem; cursor: pointer; border-radius: 4px;">🔫 CS</div>
             <div class="tab ${branch === 'futbol' ? 'active' : ''}" onclick="AdminPage.switchTacticsBranch('futbol')" style="flex: 1; text-align: center; padding: 0.5rem; font-size: 0.9rem; cursor: pointer; border-radius: 4px;">⚽ Halı Saha</div>
             <div class="tab ${branch === 'fifa' ? 'active' : ''}" onclick="AdminPage.switchTacticsBranch('fifa')" style="flex: 1; text-align: center; padding: 0.5rem; font-size: 0.9rem; cursor: pointer; border-radius: 4px;">🕹️ FIFA</div>
          </div>

          <div style="margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
             <input type="text" id="tactics-search" class="input" placeholder="Karakter Ara..." oninput="AdminPage.filterTacticsCards()" style="max-width: 300px; font-size: 0.95rem;">
             <span style="color: var(--text-muted); font-size: 0.85rem;">${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? 'Toplam Karakter' : 'Toplam Karakter Dönemi'}: ${this.eras.length}</span>
          </div>

          <div class="admin-grid">
             ${this.eras.map(era => `
                <div class="card tactics-card" data-name="${era.name}" style="padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between;">
                   <div>
                      <div style="display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.8rem; margin-bottom: 1rem;">
                         <span style="font-size: 2rem;">${era.avatar_emoji || '👤'}</span>
                         <div>
                            <h3 style="margin: 0; font-size: 1.1rem; color: #fff;">${era.name}</h3>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">${localStorage.getItem('5x5_active_server') === 'YENİ SERVER' ? 'Genel Kart' : `${era.age} Yaş - ${era.era_label || 'Standart'}`}</span>
                         </div>
                      </div>
                      
                      <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                         ${keys.map(key => `
                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.15); padding: 0.4rem 0.8rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.02);">
                               <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: bold;">${key.replace('style_', 'STİL: ')}</span>
                               <input type="number" class="input tactics-input-${era.era_id}" data-key="${key}" value="${getModifierValue(era.era_id, branch, key)}" style="width: 70px; text-align: center; padding: 0.2rem; font-size: 0.85rem; background: var(--bg-tertiary); border: 1px solid var(--border); color: #fff;" placeholder="0">
                            </div>
                         `).join('')}
                      </div>
                   </div>
                   
                   <button class="btn btn-sm btn-primary" onclick="AdminPage.saveEraModifiers(${era.era_id})" style="width: 100%; margin-top: 1.2rem; font-size: 0.85rem;">Kaydet 💾</button>
                </div>
             `).join('')}
          </div>
       </div>
     `;
  },

  switchTacticsBranch(branch) {
     this.tacticsBranch = branch;
     document.getElementById('admin-content').innerHTML = this.renderTacticsBeta();
  },

  filterTacticsCards() {
     const query = document.getElementById('tactics-search').value.toLowerCase();
     const cards = document.querySelectorAll('.tactics-card');
     cards.forEach(card => {
        const name = card.getAttribute('data-name').toLowerCase();
        if (name.includes(query)) {
           card.style.display = 'flex';
        } else {
           card.style.display = 'none';
        }
     });
  },

  async saveEraModifiers(eraId) {
     const inputs = document.querySelectorAll(`.tactics-input-${eraId}`);
     const modifiers = [];
     inputs.forEach(input => {
        const key = input.getAttribute('data-key');
        const val = parseInt(input.value) || 0;
        modifiers.push({
           character_era_id: eraId,
           branch: this.tacticsBranch,
           modifier_key: key,
           modifier_value: val
        });
     });
     
     try {
        App.showLoading();
        await API.saveTacticsModifier({ modifiers });
        App.showToast('Taktiksel güç değişimleri başarıyla kaydedildi!', 'success');
        
        const res = await API.getTacticsModifiers();
        this.modifiers = res.modifiers || [];
     } catch (err) {
        App.showToast(err.message, 'error');
     } finally {
        App.hideLoading();
     }
  },

  bind() {}
};

window.AdminPage = AdminPage;
