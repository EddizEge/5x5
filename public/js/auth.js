const AuthPage = {
  isLogin: true,

  render() {
    return `
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-logo">5X5</div>
          <p class="auth-subtitle">Simülasyon Savaşları</p>
          
          <form id="auth-form">
            <div class="form-group">
              <label>Kullanıcı Adı</label>
              <input type="text" id="username" class="input" required autocomplete="off">
            </div>
            
            ${!this.isLogin ? `
            <div class="form-group" id="display-name-group">
              <label>Görünen Ad</label>
              <input type="text" id="displayName" class="input" required autocomplete="off">
            </div>
            ` : ''}
            
            <div class="form-group">
              <label>Şifre</label>
              <input type="password" id="password" class="input" required>
            </div>
            
            <div class="form-group">
              <label>Sunucu</label>
              <select id="server-select" class="input" style="background: var(--bg-tertiary); color: #fff; width: 100%; height: 42px; border-radius: 4px; border: 1px solid var(--border); padding: 0 0.8rem; font-family: inherit;">
                <option value="OIMSFKTS">OIMSFKTS</option>
                <option value="YENİ SERVER">YENİ SERVER</option>
              </select>
            </div>
            
            <button type="submit" class="btn btn-primary" style="margin-top: 1rem;">
              ${this.isLogin ? 'Giriş Yap' : 'Kayıt Ol'}
            </button>
          </form>
          
          <div class="toggle-link" id="toggle-auth">
            ${this.isLogin ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}
          </div>
        </div>
      </div>
    `;
  },

  bind() {
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = document.getElementById('username').value;
      const pass = document.getElementById('password').value;
      const server = document.getElementById('server-select').value;
      
      try {
        App.showLoading();
        let data;
        
        if (this.isLogin) {
          data = await API.login(user, pass, server);
        } else {
          const display = document.getElementById('displayName').value;
          data = await API.register(user, pass, display, server);
        }
        
        API.setToken(data.token);
        localStorage.setItem('5x5_active_server', data.user.server);
        App.user = data.user;
        App.setupSocket();
        App.showDashboard();
        App.showToast(`Hoş geldin, ${App.user.display_name}!`, 'success');
        
      } catch (err) {
        App.showToast(err.message, 'error');
      } finally {
        App.hideLoading();
      }
    });

    document.getElementById('toggle-auth').addEventListener('click', () => {
      this.isLogin = !this.isLogin;
      App.showAuth();
    });
  }
};
