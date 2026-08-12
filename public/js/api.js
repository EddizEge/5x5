const API = {
  BASE: '',
  token: localStorage.getItem('5x5_token'),

  setToken(token) {
    this.token = token;
    localStorage.setItem('5x5_token', token);
  },

  clearToken() {
    this.token = null;
    localStorage.removeItem('5x5_token');
  },

  async request(method, url, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const activeServer = localStorage.getItem('5x5_active_server') || (typeof App !== 'undefined' && App.user ? App.user.server : 'OIMSFKTS');
    headers['X-Server'] = encodeURIComponent(activeServer);

    try {
      const res = await fetch(this.BASE + url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Bir hata oluştu');
      }
      
      return data;
    } catch (err) {
      if (err.message.includes('Unexpected token')) {
        throw new Error('Sunucu hatası veya bağlantı problemi.');
      }
      throw err;
    }
  },

  // Auth
  login: (username, password, server) => API.request('POST', '/api/auth/login', { username, password, server }),
  register: (username, password, displayName, server) => API.request('POST', '/api/auth/register', { username, password, displayName, server }),
  getMe: () => API.request('GET', '/api/auth/me'),

  // Admin
  getCharacters: () => API.request('GET', '/api/admin/characters'),
  createCharacter: (data) => API.request('POST', '/api/admin/characters', data),
  updateCharacter: (id, data) => API.request('PUT', `/api/admin/characters/${id}`, data),
  deleteCharacter: (id) => API.request('DELETE', `/api/admin/characters/${id}`),
  
  createEra: (charId, data) => API.request('POST', `/api/admin/characters/${charId}/eras`, data),
  updateEra: (id, data) => API.request('PUT', `/api/admin/eras/${id}`, data),
  deleteEra: (id) => API.request('DELETE', `/api/admin/eras/${id}`),
  
  getUsers: () => API.request('GET', '/api/admin/users'),
  toggleAdmin: (id, data) => API.request('PUT', `/api/admin/users/${id}/admin`, data),
  changeUserServer: (id, data) => API.request('PUT', `/api/admin/users/${id}/server`, data),
  changeUserPassword: (id, data) => API.request('PUT', `/api/admin/users/${id}/password`, data),
  deleteUser: (id) => API.request('DELETE', `/api/admin/users/${id}`),
  testSimulation: (branch, isBeta = false, seed = '') => API.request('POST', '/api/admin/test-simulation', {
    branch,
    is_beta: isBeta,
    seed
  }),
  testFootballV2Lab: (branch = 'futbol', seed = '', mode = 'lab') => API.request('POST', '/api/admin/football-v2-lab', {
    branch,
    seed,
    mode
  }),
  compareFootballV2: (branch = 'futbol', seed = '') => API.request('POST', '/api/admin/football-v2-compare', {
    branch,
    seed
  }),
  getTacticsModifiers: () => API.request('GET', '/api/admin/tactics-modifiers'),
  saveTacticsModifier: (data) => API.request('POST', '/api/admin/tactics-modifiers', data),

  // Lobby
  createLobby: (isBeta = 0, isQuick = false) => {
    const betaVal = typeof isBeta === 'boolean' ? (isBeta ? 1 : 0) : isBeta;
    return API.request('POST', '/api/lobby/create', { is_beta: betaVal, is_quick: isQuick });
  },
  getLobby: (code) => API.request('GET', `/api/lobby/${code}`),
  joinLobby: (code) => API.request('POST', `/api/lobby/${code}/join`),
  leaveLobby: (code) => API.request('POST', `/api/lobby/${code}/leave`),

  // Game
  getDraft: (id) => API.request('GET', `/api/game/${id}/draft`),
  getScores: (id) => API.request('GET', `/api/game/${id}/scores`),
  getMatches: (id) => API.request('GET', `/api/game/${id}/matches`)
};
