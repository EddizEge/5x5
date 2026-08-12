(() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const FALLBACK_SHAPE = [
    { x: 24, y: 26 },
    { x: 25, y: 74 },
    { x: 43, y: 34 },
    { x: 44, y: 68 },
    { x: 63, y: 50 }
  ];
  const FIFA_POSITIONS = {
    LB: { x: 25, y: 18 },
    LCB: { x: 27, y: 36 },
    RCB: { x: 27, y: 64 },
    RB: { x: 25, y: 82 },
    LDM: { x: 42, y: 37 },
    RDM: { x: 42, y: 63 },
    LAM: { x: 56, y: 24 },
    CAM: { x: 57, y: 50 },
    RAM: { x: 56, y: 76 },
    ST: { x: 67, y: 50 }
  };

  function render(branch, options = {}) {
    const branchName = branch === 'fifa' ? 'FIFA' : 'Halı Saha';
    const rootId = options.rootId || 'football-manager-viewer';
    const contextLabel = options.contextLabel || 'BETA LOBİSİ';
    return `
      <section class="fm-viewer" id="${rootId}" data-branch="${branch}" aria-label="${branchName} canlı görsel simülasyonu">
        <header class="fm-score-header">
          <div class="fm-team fm-team-blue">
            <span class="fm-shirt" aria-hidden="true">◆</span>
            <span class="fm-team-name" data-fm="team-1-name">Mavi Takım</span>
          </div>
          <div class="fm-score-center">
            <div class="fm-score" aria-label="Canlı skor">
              <span data-fm="score-1">0</span>
              <span class="fm-score-separator">-</span>
              <span data-fm="score-2">0</span>
            </div>
            <div class="fm-clock" data-fm="match-clock">00:00</div>
          </div>
          <div class="fm-team fm-team-red">
            <span class="fm-team-name" data-fm="team-2-name">Kırmızı Takım</span>
            <span class="fm-shirt" aria-hidden="true">◆</span>
          </div>
          <div class="fm-live-status" data-fm="live-status">
            <span class="fm-live-dot"></span>
            CANLI
          </div>
        </header>

        <div class="fm-viewer-body">
          <div class="fm-pitch-column">
            <div class="fm-pitch" data-fm="pitch">
              <div class="fm-pitch-markings" aria-hidden="true">
                <span class="fm-halfway-line"></span>
                <span class="fm-center-circle"></span>
                <span class="fm-center-spot"></span>
                <span class="fm-box fm-box-left"></span>
                <span class="fm-box fm-box-right"></span>
                <span class="fm-goal-box fm-goal-box-left"></span>
                <span class="fm-goal-box fm-goal-box-right"></span>
                <span class="fm-goal fm-goal-left"></span>
                <span class="fm-goal fm-goal-right"></span>
              </div>
              <svg class="fm-motion-layer" data-fm="motion-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line data-fm="pass-line" x1="50" y1="50" x2="50" y2="50"></line>
              </svg>
              <div class="fm-player-layer" data-fm="player-layer"></div>
              <div class="fm-ball" data-fm="ball" aria-label="Top"></div>
              <div class="fm-event-banner" data-fm="event-banner" aria-live="polite"></div>
              <div class="fm-phase-chip" data-fm="phase-chip">SANTRA</div>
            </div>
            <div class="fm-event-strip">
              <span class="fm-event-minute" data-fm="event-minute">0'</span>
              <span class="fm-event-team" data-fm="event-team">Maç Merkezi</span>
              <span class="fm-event-copy" data-fm="event-copy">Oyuncular sahaya çıkıyor...</span>
            </div>
          </div>

          <aside class="fm-stats" aria-label="Maç istatistikleri">
            <div class="fm-stats-heading">
              <span>MAÇ İSTATİSTİKLERİ</span>
              <span class="fm-beta-label">${contextLabel}</span>
            </div>
            ${statMarkup('possession', 'Topa Sahip Olma', '50%', '50%')}
            ${statMarkup('shots', 'Şut', '0', '0')}
            ${statMarkup('target', 'İsabetli Şut', '0', '0')}
            ${statMarkup('xg', 'xG', '0.00', '0.00')}
            ${statMarkup('passes', 'Başarılı Pas', '0/0', '0/0')}
            ${statMarkup('pass-accuracy', 'Pas İsabeti', '0%', '0%')}
            ${statMarkup('xpass-diff', 'Pas Beklenti Farkı', '+0.00', '+0.00')}
            ${statMarkup('action-value', 'Aksiyon Değeri', '+0.00', '+0.00')}
            ${statMarkup('dribbles', 'Başarılı Çalım', '0/0', '0/0')}
            ${statMarkup('def-actions', 'Savunma Aksiyonu', '0', '0')}
            ${statMarkup('big-chances', 'Net Fırsat', '0', '0')}
            ${statMarkup('corners', 'Korner', '0', '0')}
            ${statMarkup('fouls', 'Faul', '0', '0')}
            <div class="fm-last-events">
              <div class="fm-last-events-title">SON OLAYLAR</div>
              <div data-fm="last-events-list">
                <div class="fm-empty-event">Maçın başlaması bekleniyor...</div>
              </div>
            </div>
          </aside>
        </div>
        <section class="fm-player-ratings-panel" aria-label="Oyuncu performansları">
          <div class="fm-player-ratings-heading">
            <div>
              <strong>OYUNCU PERFORMANSLARI</strong>
              <span>Canlı 3.0–10.0 maç ratingi</span>
            </div>
            <span class="fm-rating-legend"><i></i> Forma göre canlı güncellenir</span>
          </div>
          <div class="fm-player-ratings-grid">
            <article class="fm-rating-team fm-rating-team-blue">
              <h4 data-fm="ratings-team-1-name">Mavi Takım</h4>
              <div class="fm-rating-list" data-fm="player-ratings-1"></div>
            </article>
            <article class="fm-rating-team fm-rating-team-red">
              <h4 data-fm="ratings-team-2-name">Kırmızı Takım</h4>
              <div class="fm-rating-list" data-fm="player-ratings-2"></div>
            </article>
          </div>
        </section>
      </section>
    `;
  }

  function statMarkup(key, label, left, right) {
    return `
      <div class="fm-stat-row">
        <div class="fm-stat-values">
          <strong class="blue" data-fm="${key}-1">${left}</strong>
          <span>${label}</span>
          <strong class="red" data-fm="${key}-2">${right}</strong>
        </div>
        <div class="fm-stat-bar">
          <span class="blue-bar" data-fm="${key}-bar-1" style="width:50%"></span>
          <span class="red-bar" data-fm="${key}-bar-2" style="width:50%"></span>
        </div>
      </div>
    `;
  }

  class Viewer {
    constructor(root) {
      this.root = root;
      this.branch = root.dataset.branch || 'futbol';
      this.playerLayer = this.get('player-layer');
      this.ball = this.get('ball');
      this.banner = this.get('event-banner');
      this.passLine = this.get('pass-line');
      this.players = new Map();
      this.teamSignature = '';
      this.eventHistory = [];
      this.timers = new Set();
      this.queue = Promise.resolve();
      this.stopped = false;
      this.speed = 1;
      this.possessionTeam = 0;
      this.phase = 'kickoff';
      this.phaseTeam = 0;
      this.sequenceTick = 0;
      this.attackPattern = 'balanced';
      this.penaltyMode = false;
      this.ballOwner = null;
      this.ballFlight = null;
      this.ballPosition = { x: 50, y: 50 };
      this.lastFiveASideShapeAt = 0;
      this.fiveASideShapeSignature = '';
      this.lastFrameAt = performance.now();
      this.motionFrame = null;
      this.root.classList.add('fm-agent-flow');
      this.startMotionLoop();
    }

    get(name) {
      return this.root.querySelector(`[data-fm="${name}"]`);
    }

    stop() {
      this.stopped = true;
      if (this.motionFrame) window.cancelAnimationFrame(this.motionFrame);
      this.timers.forEach(timer => window.clearTimeout(timer));
      this.timers.clear();
    }

    show() {
      this.root.style.display = '';
    }

    hide() {
      this.root.style.display = 'none';
    }

    setSpeed(speed) {
      this.speed = clamp(Number(speed) || 1, 0.5, 20);
      return this;
    }

    update(data) {
      if (this.stopped || !data) return Promise.resolve();
      this.setSpeed(data.visualSpeed || window.currentSimulationSpeed || this.speed);
      this.updateHeader(data);

      if (data.state?.t1 && data.state?.t2) {
        this.ensurePlayers(data.state);
        this.updateStats(data.state);
        this.updatePlayerPerformance(data.state);
        this.updatePlayerRatings(data.state);
      }

      if (data.text) {
        this.updateEventCopy(data.text, data.teamId);
        this.addHistory(data.text, data.teamId);
        if (data.text.startsWith('🏆')) {
          const liveStatus = this.get('live-status');
          if (liveStatus) {
            liveStatus.classList.add('fm-ended');
            liveStatus.innerHTML = '<span class="fm-live-dot"></span>BİTTİ';
          }
        }
      } else if (data.visualEvent) {
        this.updateEventCopy(this.eventDescription(data.visualEvent), data.visualEvent.teamId);
      }

      if (!data.visualEvent) return Promise.resolve();
      this.queue = this.queue
        .then(() => this.stopped ? null : this.playEvent(data.visualEvent))
        .catch(error => console.error('Futbol görsel simülasyon hatası:', error));
      return this.queue;
    }

    eventDescription(event) {
      const actor = this.displayName(event.actor);
      const target = this.displayName(event.target);
      const defender = this.displayName(event.defender);
      if (event.type === 'pass') {
        const passDescriptions = {
          recycle: `${actor} topu geriye oynayıp hücumu yeniden kuruyor.`,
          cross: `${actor} kanattan ceza alanına orta açtı.`,
          through: `${actor}, ${target} için savunma arkasına ara pası bıraktı.`,
          cutback: `${actor} son çizgiden topu geriye çevirdi.`,
          'one-two': `${actor} ile ${target} duvar pasına girdi.`,
          switch: `${actor} oyunun yönünü uzun pasla değiştirdi.`
        };
        return passDescriptions[event.passKind] || `${actor}, ${target} ile pas bağlantısı kurdu.`;
      }
      if (event.type === 'interception') return `${actor} pas arasına girdi ve topun yönünü değiştirdi.`;
      if (event.type === 'tackle') return `${actor} zamanında müdahaleyle topu kazandı.`;
      if (event.type === 'clearance') return `${actor} savunmada tehlikeyi uzaklaştırdı.`;
      if (event.type === 'shape-update') return `${actor} topu alırken takım genişleyip pas koridorlarını açtı.`;
      if (event.type === 'defensive-shape') return `${actor} öndeki baskıyı başlatırken savunma pas yollarını kapattı.`;
      if (event.type === 'support-run') {
        const labels = {
          overlap: `${actor} çizgiden bindirme yaparak pas seçeneği oluşturdu.`,
          underlap: `${actor} iç koridora koşu atarak savunmayı daralttı.`,
          'box-run': `${actor} topsuz koşuyla ceza alanına girdi.`,
          support: `${actor} top sahibine yakın destek verdi.`
        };
        return labels[event.runKind] || `${actor} hücuma destek koşusu yaptı.`;
      }
      if (event.type === 'contain') return `${actor} şut açısını kapatıp hücumu yavaşlattı.`;
      if (event.type === 'dribble') {
        if (event.won === false) return `${actor} birebirde savunmacıya takıldı.`;
        return event.dribbleKind === 'skill'
          ? `${actor} birebirde rakibini çalımla geçti.`
          : `${actor} topu sürerek baskı hattını aştı.`;
      }
      if (event.type === 'counter') return `${actor} topu kazanır kazanmaz ${target} ile hızlı hücuma çıktı.`;
      if (event.type === 'corner') return `${actor} köşe vuruşunda topu tehlikeli bölgeye gönderdi.`;
      if (event.type === 'block') return `${defender} şutun önüne set çekti.`;
      if (event.type === 'woodwork') return `${actor} vurdu, top direkten oyun alanına döndü.`;
      return 'Oyun devam ediyor...';
    }

    updateHeader(data) {
      this.setText('team-1-name', data.player1Name || data.state?.t1?.name || 'Mavi Takım');
      this.setText('team-2-name', data.player2Name || data.state?.t2?.name || 'Kırmızı Takım');
      this.setText('ratings-team-1-name', data.player1Name || data.state?.t1?.name || 'Mavi Takım');
      this.setText('ratings-team-2-name', data.player2Name || data.state?.t2?.name || 'Kırmızı Takım');
      if (data.score1 !== undefined && data.score1 !== null) this.setText('score-1', data.score1);
      if (data.score2 !== undefined && data.score2 !== null) this.setText('score-2', data.score2);

      const minute = data.visualEvent?.minute ?? this.extractMinute(data.text);
      const second = data.visualEvent?.second;
      if (minute !== null && minute !== undefined) {
        this.setText('match-clock', `${String(minute).padStart(2, '0')}:${String(second ?? 0).padStart(2, '0')}`);
        this.setText('event-minute', `${minute}'`);
      } else if (data.text && /penalt/i.test(data.text)) {
        this.setText('match-clock', 'PEN');
        this.setText('event-minute', 'PEN');
      }
    }

    ensurePlayers(state) {
      const teams = [state.t1.players || [], state.t2.players || []];
      const signature = teams.map((players, index) =>
        `${index}:${players.map(player =>
          `${player.idName || player.name}:${player.role || player.visualRole || ''}:${player.cardRating || ''}`
        ).join('|')}`
      ).join('::');
      if (signature === this.teamSignature) return;

      this.teamSignature = signature;
      this.players.clear();
      this.playerLayer.innerHTML = '';

      teams.forEach((players, teamIndex) => {
        const teamId = teamIndex + 1;
        const outfieldPlayers = players.filter(player => !player.isGoalkeeper);
        players.forEach((player, index) => {
          const home = this.calculateHome(player, outfieldPlayers, teamId, index);
          const marker = document.createElement('div');
          const cardRating = clamp(Number(player.cardRating) || 50, 20, 110);
          const profile = player.footballProfile || {};
          const profileValue = key => clamp(((Number(profile[key]) || cardRating) - 20) / 80, 0, 1);
          marker.className = `fm-player fm-player-team-${teamId}` +
            `${player.isBot ? ' fm-bot-player' : ''}` +
            `${player.isGoalkeeper ? ' fm-goalkeeper' : ''}` +
            `${!player.isBot && cardRating >= 85 ? ' fm-elite-player' : ''}` +
            `${!player.isBot && cardRating < 60 ? ' fm-developing-player' : ''}`;
          marker.dataset.team = String(teamId);
          marker.dataset.rating = String(Math.round(cardRating));
          marker.innerHTML = `
            <span class="fm-player-number">${player.isGoalkeeper ? 'K' : player.isBot ? 'B' : (Number(player.order) + 1 || index + 1)}</span>
            ${player.isBot ? '' : `<span class="fm-player-card-rating">${Math.round(cardRating)}</span>`}
            <span class="fm-player-label"></span>
          `;
          marker.querySelector('.fm-player-label').textContent = this.displayName(player);
          marker.title = this.playerTooltip(player);
          this.playerLayer.appendChild(marker);

          const seed = this.hashString(`${teamId}:${player.idName || player.name || index}`);
          const entry = {
            element: marker,
            player,
            teamId,
            home,
            position: { ...home },
            velocity: { x: 0, y: 0 },
            decisionTarget: { ...home },
            nextDecisionAt: 0,
            override: null,
            offBallRole: null,
            offBallOrder: 0,
            defensiveRole: null,
            defensiveOrder: 0,
            seed,
            personality: {
              aggression: 0.8 + ((seed % 16) / 100) + (profileValue('reaction') - 0.5) * 0.08,
              freedom: 0.65 + (((seed >> 2) % 18) / 100) + (profileValue('dribbling') - 0.5) * 0.16,
              reaction: clamp(590 - (Number(profile.reaction) || cardRating) * 3.25 + (seed % 75), 220, 570),
              pace: 0.86 + profileValue('pace') * 0.24,
              passing: profileValue('passing'),
              dribbling: profileValue('dribbling'),
              finishing: profileValue('finishing'),
              defending: profileValue('defending'),
              quality: clamp((cardRating - 20) / 80, 0, 1),
              side: seed % 2 === 0 ? 1 : -1
            }
          };
          this.players.set(this.playerKey(teamId, player), entry);
          this.movePlayer(entry, home.x, home.y, true);
        });
      });
      this.ballOwner = null;
      this.ballFlight = null;
      this.setBall(50, 50, true);
    }

    calculateHome(player, outfieldPlayers, teamId, originalIndex) {
      if (player.isGoalkeeper) return { x: teamId === 1 ? 5.5 : 94.5, y: 50 };
      const outfieldIndex = Math.max(0, outfieldPlayers.indexOf(player));
      let base = null;

      if (this.branch === 'fifa') {
        const role = String(player.visualRole || player.role || '').toUpperCase().split(' ')[0];
        base = FIFA_POSITIONS[role] ? { ...FIFA_POSITIONS[role] } : null;
      } else {
        const role = String(player.visualRole || '').toLowerCase();
        const roleGroup = outfieldPlayers.filter(candidate =>
          String(candidate.visualRole || '').toLowerCase() === role
        );
        const roleIndex = Math.max(0, roleGroup.indexOf(player));
        const lineX = role === 'defans' ? 25 : role === 'orta' ? 44 : role === 'hücum' ? 64 : null;
        if (lineX) {
          const count = Math.max(1, roleGroup.length);
          base = { x: lineX, y: 50 + (roleIndex - (count - 1) / 2) * Math.min(25, 58 / count) };
        }
      }

      base = base || { ...(FALLBACK_SHAPE[outfieldIndex] || FALLBACK_SHAPE[originalIndex % FALLBACK_SHAPE.length]) };
      return teamId === 1 ? base : { x: 100 - base.x, y: base.y };
    }

    updateStats(state) {
      const t1 = state.t1.stats || {};
      const t2 = state.t2.stats || {};
      const poss1 = clamp(Number(t1.poss) || 50, 0, 100);
      const poss2 = clamp(Number(t2.poss) || (100 - poss1), 0, 100);
      this.setText('possession-1', `${poss1}%`);
      this.setText('possession-2', `${poss2}%`);
      this.setBar('possession-bar-1', poss1);
      this.setBar('possession-bar-2', poss2);
      this.updateSplitStat('shots', Number(t1.shots) || 0, Number(t2.shots) || 0);
      this.updateSplitStat('target', Number(t1.shotsOnTarget) || 0, Number(t2.shotsOnTarget) || 0);
      this.updateSplitStat('xg', Number(t1.xg) || 0, Number(t2.xg) || 0, true);
      const detail1 = this.aggregatePlayerStats(state.t1.players || []);
      const detail2 = this.aggregatePlayerStats(state.t2.players || []);
      this.updateTextSplitStat(
        'passes',
        `${detail1.passesCompleted}/${detail1.passesAttempted}`,
        `${detail2.passesCompleted}/${detail2.passesAttempted}`,
        detail1.passesCompleted,
        detail2.passesCompleted
      );
      this.updateTextSplitStat(
        'pass-accuracy',
        `${detail1.passAccuracy}%`,
        `${detail2.passAccuracy}%`,
        detail1.passAccuracy,
        detail2.passAccuracy
      );
      this.updateSignedSplitStat('xpass-diff', detail1.passOverExpected, detail2.passOverExpected);
      this.updateSignedSplitStat('action-value', detail1.actionValue, detail2.actionValue);
      this.updateTextSplitStat(
        'dribbles',
        `${detail1.dribblesWon}/${detail1.dribblesAttempted}`,
        `${detail2.dribblesWon}/${detail2.dribblesAttempted}`,
        detail1.dribblesWon,
        detail2.dribblesWon
      );
      this.updateSplitStat('def-actions', detail1.defensiveActions, detail2.defensiveActions);
      this.updateSplitStat('big-chances', Number(t1.bigChances) || 0, Number(t2.bigChances) || 0);
      this.updateSplitStat('corners', Number(t1.corners) || 0, Number(t2.corners) || 0);
      this.updateSplitStat('fouls', detail1.fouls, detail2.fouls);
    }

    aggregatePlayerStats(players) {
      const totals = players.reduce((sum, player) => {
        sum.passesAttempted += Number(player.passesAttempted) || 0;
        sum.passesCompleted += Number(player.passesCompleted) || 0;
        sum.expectedPassesCompleted += Number(player.expectedPassesCompleted) || 0;
        sum.actionValue += Number(player.actionValue) || 0;
        sum.progressiveActions += Number(player.progressiveActions) || 0;
        sum.dribblesAttempted += Number(player.dribblesAttempted) || 0;
        sum.dribblesWon += Number(player.dribblesWon) || 0;
        sum.defensiveActions +=
          (Number(player.tackles) || 0) +
          (Number(player.interceptions) || 0) +
          (Number(player.clearances) || 0) +
          (Number(player.blocks) || 0);
        sum.fouls += Number(player.fouls) || 0;
        return sum;
      }, {
        passesAttempted: 0,
        passesCompleted: 0,
        expectedPassesCompleted: 0,
        actionValue: 0,
        progressiveActions: 0,
        dribblesAttempted: 0,
        dribblesWon: 0,
        defensiveActions: 0,
        fouls: 0
      });
      totals.passAccuracy = totals.passesAttempted
        ? Math.round((totals.passesCompleted / totals.passesAttempted) * 100)
        : 0;
      totals.passOverExpected = totals.passesCompleted - totals.expectedPassesCompleted;
      return totals;
    }

    updateSignedSplitStat(name, left, right) {
      const format = value => `${value >= 0 ? '+' : ''}${Number(value || 0).toFixed(2)}`;
      this.setText(`${name}-1`, format(left));
      this.setText(`${name}-2`, format(right));
      const scale = Math.max(0.35, Math.abs(left), Math.abs(right));
      const comparison = clamp((left - right) / (scale * 2), -1, 1);
      const leftWidth = 50 + comparison * 38;
      this.setBar(`${name}-bar-1`, leftWidth);
      this.setBar(`${name}-bar-2`, 100 - leftWidth);
    }

    updateTextSplitStat(name, leftText, rightText, leftValue, rightValue) {
      this.setText(`${name}-1`, leftText);
      this.setText(`${name}-2`, rightText);
      const total = leftValue + rightValue;
      const leftWidth = total > 0 ? (leftValue / total) * 100 : 50;
      this.setBar(`${name}-bar-1`, leftWidth);
      this.setBar(`${name}-bar-2`, 100 - leftWidth);
    }

    updateSplitStat(name, left, right, decimal = false) {
      this.setText(`${name}-1`, decimal ? left.toFixed(2) : left);
      this.setText(`${name}-2`, decimal ? right.toFixed(2) : right);
      const total = left + right;
      const leftWidth = total > 0 ? (left / total) * 100 : 50;
      this.setBar(`${name}-bar-1`, leftWidth);
      this.setBar(`${name}-bar-2`, 100 - leftWidth);
    }

    startMotionLoop() {
      const frame = timestamp => {
        if (this.stopped) return;
        const dt = clamp((timestamp - this.lastFrameAt) / 1000, 0.012, 0.07);
        this.lastFrameAt = timestamp;
        this.updateBallFlight(timestamp);
        this.updateAgents(timestamp, dt);
        this.motionFrame = window.requestAnimationFrame(frame);
      };
      this.motionFrame = window.requestAnimationFrame(frame);
    }

    updateAgents(now, dt) {
      if (!this.players.size) return;
      const entries = [...this.players.values()];
      if (this.branch === 'futbol') this.refreshFiveASideShapeAssignments(entries, now);
      this.root.dataset.possessionTeam = String(this.possessionTeam || 0);
      entries.forEach(entry => {
        if (entry.override && now >= entry.override.until) entry.override = null;
        if (entry.override) {
          entry.decisionTarget = this.resolveOverride(entry.override);
        } else if (now >= entry.nextDecisionAt) {
          entry.decisionTarget = this.makeDecision(entry, now);
          entry.nextDecisionAt = now + entry.personality.reaction;
        }

        const desired = this.applySeparation(entry, entry.decisionTarget, entries);
        const dx = desired.x - entry.position.x;
        const dy = desired.y - entry.position.y;
        const distance = Math.hypot(dx, dy);
        const hasOverride = Boolean(entry.override);
        const baseSpeed = entry.player.isGoalkeeper ? 4.1 : entry.player.isBot ? 6.1 : 6.8;
        const playbackScale = clamp(this.speed, 0.65, 4);
        const maxSpeed = baseSpeed * entry.personality.aggression * entry.personality.pace *
          playbackScale * (hasOverride ? 1.32 : 1);
        const slowRadius = hasOverride ? 2.8 : 5.8;
        const desiredSpeed = maxSpeed * clamp(distance / slowRadius, 0, 1);
        const desiredVelocity = distance > 0.28
          ? { x: (dx / distance) * desiredSpeed, y: (dy / distance) * desiredSpeed }
          : { x: 0, y: 0 };
        const steeringRate = (hasOverride ? 7.2 : 4.1) + entry.personality.quality * 1.15;
        const steering = 1 - Math.exp(-steeringRate * dt);
        entry.velocity.x += (desiredVelocity.x - entry.velocity.x) * steering;
        entry.velocity.y += (desiredVelocity.y - entry.velocity.y) * steering;
        if (distance <= 0.28) {
          entry.velocity.x *= Math.max(0, 1 - 9 * dt);
          entry.velocity.y *= Math.max(0, 1 - 9 * dt);
        }
        entry.position.x = clamp(entry.position.x + entry.velocity.x * dt, 2.2, 97.8);
        entry.position.y = clamp(entry.position.y + entry.velocity.y * dt, 5.2, 94.8);
      });

      this.enforceLiveSpacing(entries);
      this.enforceTeamWidth(entries);
      this.enforceTeamDepth(entries, dt);
      this.enforceLiveSpacing(entries);
      entries.forEach(entry => this.paintPlayer(entry));

      if (!this.ballFlight && this.ballOwner) {
        const direction = this.ballOwner.teamId === 1 ? 1 : -1;
        this.setBall(
          this.ballOwner.position.x + direction * 0.75,
          this.ballOwner.position.y + Math.sin(now / 150 + this.ballOwner.seed) * 0.22
        );
      }
    }

    makeDecision(entry, now) {
      const ballPoint = this.ballPosition;
      const hasBall = this.ballOwner === entry;
      const teamHasBall = this.possessionTeam === entry.teamId;
      const direction = entry.teamId === 1 ? 1 : -1;

      if (this.penaltyMode && entry.penaltyPosition) {
        return { ...entry.penaltyPosition };
      }

      if (entry.player.isGoalkeeper) {
        const danger = entry.teamId === 1 ? clamp((45 - ballPoint.x) / 45, 0, 1) : clamp((ballPoint.x - 55) / 45, 0, 1);
        return {
          x: entry.home.x + direction * (teamHasBall ? 2.2 : 0.7 + danger * 1.8),
          y: clamp(50 + (ballPoint.y - 50) * (0.16 + danger * 0.18), 39, 61)
        };
      }

      if (hasBall) {
        const shape = this.teamShapePoint(entry, true);
        const nearestOpponent = this.nearestPlayer(entry.teamId === 1 ? 2 : 1, entry.position, true);
        const opponentAhead = nearestOpponent &&
          direction * (nearestOpponent.position.x - entry.position.x) > -1 &&
          direction * (nearestOpponent.position.x - entry.position.x) < 8 &&
          Math.abs(nearestOpponent.position.y - entry.position.y) < 7;
        const escapeY = opponentAhead
          ? Math.sign(entry.position.y - nearestOpponent.position.y || entry.personality.side) * 3.4
          : 0;
        const goalDistance = direction === 1 ? 88 - entry.position.x : entry.position.x - 12;
        const advance = clamp(
          goalDistance * 0.18 * (0.86 + entry.personality.dribbling * 0.28),
          0.65,
          this.phase === 'final-third' ? 2.25 : 3.35
        );
        return {
          x: clamp(entry.position.x + direction * advance, 8, 92),
          y: clamp(entry.position.y * 0.72 + shape.y * 0.28 + escapeY, 10, 90)
        };
      }

      const shape = this.teamShapePoint(entry, teamHasBall);
      if (teamHasBall) {
        if (this.branch === 'futbol' && (entry.liveAttackRole || entry.offBallRole)) {
          return this.fiveASideAttackTarget(entry, shape);
        }
        if (entry.offBallTarget) {
          const origin = entry.offBallOrigin || this.ballPosition;
          const liveTarget = {
            x: entry.offBallTarget.x + (this.ballPosition.x - origin.x) * 0.2,
            y: entry.offBallTarget.y + (this.ballPosition.y - origin.y) * 0.14
          };
          return {
            x: clamp(shape.x * 0.22 + liveTarget.x * 0.78, 7, 93),
            y: clamp(shape.y * 0.18 + liveTarget.y * 0.82, 8, 92)
          };
        }
        const teammates = this.sortedTeamByDistance(entry.teamId, ballPoint, true);
        const supportRank = teammates.indexOf(entry);
        const roleProgress = entry.teamId === 1 ? entry.home.x : 100 - entry.home.x;

        const supportLimit = this.branch === 'fifa' ? 1 : 0;
        if (supportRank >= 0 && supportRank <= supportLimit) {
          const laneSide = entry.home.y <= 50 ? -1 : 1;
          const behind = 4.5 + supportRank * 2.2;
          const supportPoint = {
            x: ballPoint.x - direction * behind,
            y: ballPoint.y + laneSide * (7 + supportRank * 2.2)
          };
          return {
            x: clamp(shape.x * 0.74 + supportPoint.x * 0.26, 8, 92),
            y: clamp(shape.y * 0.7 + supportPoint.y * 0.3, 10, 90)
          };
        }

        if (roleProgress > 54 && this.phase === 'final-third') {
          const runDistance = 3.5 + (entry.seed % 3);
          return {
            x: clamp(shape.x + direction * runDistance, 8, 92),
            y: clamp(shape.y, 10, 90)
          };
        }
        return shape;
      }

      if (this.branch === 'futbol' && entry.liveDefensiveRole) {
        return this.fiveASideDefenseTarget(entry, shape);
      }

      if (entry.defensiveTarget) {
        const origin = entry.defensiveOrigin || this.ballPosition;
        const role = entry.defensiveRole || 'rest-defense';
        const ballShiftWeight = role === 'primary-press'
          ? 0.7
          : role === 'cover'
            ? 0.42
            : role.startsWith('pass-lane')
              ? 0.3
              : 0.18;
        const liveTarget = {
          x: entry.defensiveTarget.x + (this.ballPosition.x - origin.x) * ballShiftWeight,
          y: entry.defensiveTarget.y + (this.ballPosition.y - origin.y) * ballShiftWeight
        };
        if (entry.defensiveMark && role !== 'primary-press' && role !== 'cover') {
          const ownGoalDirection = -direction;
          const markGap = role === 'rest-defense'
            ? (this.branch === 'fifa' ? 4.2 : 5.2)
            : (this.branch === 'fifa' ? 2.2 : 2.8);
          const markPoint = {
            x: entry.defensiveMark.position.x + ownGoalDirection * markGap,
            y: entry.defensiveMark.position.y + entry.personality.side * 1.1
          };
          const markWeight = role === 'rest-defense' ? 0.56 : 0.44;
          liveTarget.x = liveTarget.x * (1 - markWeight) + markPoint.x * markWeight;
          liveTarget.y = liveTarget.y * (1 - markWeight) + markPoint.y * markWeight;

          if (role === 'rest-defense') {
            const minimumGoalSideGap = this.branch === 'fifa' ? 10.5 : 12;
            if (ownGoalDirection * (liveTarget.x - this.ballPosition.x) < minimumGoalSideGap) {
              liveTarget.x = this.ballPosition.x + ownGoalDirection * minimumGoalSideGap;
            }
          }
        }
        const targetWeight = role === 'rest-defense' ? 0.84 : 0.88;
        const resolvedTarget = {
          x: clamp(shape.x * (1 - targetWeight) + liveTarget.x * targetWeight, 7, 93),
          y: clamp(shape.y * (1 - targetWeight) + liveTarget.y * targetWeight, 9, 91)
        };
        if (role === 'rest-defense') {
          const ownGoalDirection = -direction;
          const minimumGoalSideGap = this.branch === 'fifa' ? 10.5 : 12;
          if (ownGoalDirection * (resolvedTarget.x - this.ballPosition.x) < minimumGoalSideGap) {
            resolvedTarget.x = clamp(
              this.ballPosition.x + ownGoalDirection * minimumGoalSideGap,
              7,
              93
            );
          }
        }
        return resolvedTarget;
      }

      const defenders = this.sortedTeamByDistance(entry.teamId, ballPoint, true);
      const pressRank = defenders.indexOf(entry);
      if (pressRank === 0) {
        const reactionGap = 1.4 + (entry.seed % 4) * 0.32;
        const pressPoint = {
          x: ballPoint.x - direction * reactionGap,
          y: ballPoint.y
        };
        return {
          x: clamp(this.leashToShape(pressPoint, shape, this.branch === 'fifa' ? 14 : 18).x, 7, 93),
          y: clamp(this.leashToShape(pressPoint, shape, this.branch === 'fifa' ? 14 : 18).y, 9, 91)
        };
      }
      if (pressRank === 1) {
        const coverPoint = {
          x: ballPoint.x - direction * 6.5,
          y: ballPoint.y + (entry.home.y <= 50 ? -5 : 5)
        };
        return {
          x: clamp(shape.x * 0.7 + coverPoint.x * 0.3, 7, 93),
          y: clamp(shape.y * 0.7 + coverPoint.y * 0.3, 9, 91)
        };
      }

      const mark = this.findMarkingTarget(entry);
      if (mark && this.distance(mark.position, entry.position) < (this.branch === 'fifa' ? 22 : 28)) {
        const markPoint = {
          x: mark.position.x - direction * (2.4 + (entry.seed % 3)),
          y: mark.position.y + entry.personality.side * 1.25
        };
        return {
          x: shape.x * 0.72 + markPoint.x * 0.28,
          y: shape.y * 0.72 + markPoint.y * 0.28
        };
      }
      return shape;
    }

    fiveASideAttackTarget(entry, shape) {
      const direction = entry.teamId === 1 ? 1 : -1;
      const ball = this.ballPosition;
      const role = entry.liveAttackRole || entry.offBallRole;
      const backend = entry.liveAttackTarget || entry.offBallTarget || shape;
      const homeSide = entry.home.y <= 50 ? -1 : 1;
      let tactical = shape;

      if (role === 'width-left' || role === 'width-right') {
        tactical = {
          x: ball.x - direction * (this.phase === 'final-third' ? 2 : 0.5),
          y: role === 'width-left' ? 17 : 83
        };
      } else if (role === 'runner') {
        tactical = {
          x: ball.x + direction * (this.phase === 'final-third' ? 7 : 9.5),
          y: clamp(50 - Math.sign(ball.y - 50 || homeSide) * 9, 25, 75)
        };
      } else if (role === 'support') {
        tactical = {
          x: ball.x - direction * 6.5,
          y: clamp(ball.y + homeSide * 10.5, 17, 83)
        };
      } else if (role === 'balance') {
        tactical = {
          x: entry.teamId === 1
            ? Math.min(ball.x - 20, 44)
            : Math.max(ball.x + 20, 56),
          y: clamp(50 + homeSide * 13, 25, 75)
        };
      }

      const tacticalWeight = role === 'balance' ? 0.92 : 0.84;
      return {
        x: clamp(tactical.x * tacticalWeight + backend.x * (1 - tacticalWeight), 7, 93),
        y: clamp(tactical.y * tacticalWeight + backend.y * (1 - tacticalWeight), 8, 92)
      };
    }

    fiveASideDefenseTarget(entry, shape) {
      const direction = entry.teamId === 1 ? 1 : -1;
      const ownGoalDirection = -direction;
      const ball = this.ballPosition;
      const role = entry.liveDefensiveRole || entry.defensiveRole || 'rest-defense';
      const order = Number(entry.liveDefensiveOrder ?? entry.defensiveOrder) || 0;
      const homeSide = entry.home.y <= 50 ? -1 : 1;
      let tactical;

      if (role === 'primary-press') {
        tactical = {
          x: ball.x + ownGoalDirection * 2.6,
          y: ball.y + homeSide * 2.2
        };
      } else if (role === 'cover') {
        tactical = {
          x: ball.x + ownGoalDirection * 8,
          y: ball.y - homeSide * 6.2
        };
      } else if (role.startsWith('pass-lane')) {
        tactical = {
          x: ball.x + ownGoalDirection * 11.5,
          y: clamp(50 + homeSide * 12, 18, 82)
        };
      } else {
        tactical = {
          x: ball.x + ownGoalDirection * (17 + Math.min(1, order) * 7),
          y: clamp(50 + homeSide * (order % 2 === 0 ? 18 : 8), 18, 82)
        };
      }

      if (entry.defensiveMark && role !== 'primary-press' && role !== 'cover') {
        const markPoint = {
          x: entry.defensiveMark.position.x + ownGoalDirection * (role === 'rest-defense' ? 5.5 : 3),
          y: entry.defensiveMark.position.y
        };
        const markWeight = role === 'rest-defense' ? 0.28 : 0.38;
        tactical.x = tactical.x * (1 - markWeight) + markPoint.x * markWeight;
        tactical.y = tactical.y * (1 - markWeight) + markPoint.y * markWeight;
      }

      const backend = entry.liveDefensiveTarget || entry.defensiveTarget || shape;
      const tacticalWeight = role === 'rest-defense' ? 0.9 : 0.82;
      return {
        x: clamp(tactical.x * tacticalWeight + backend.x * (1 - tacticalWeight), 7, 93),
        y: clamp(tactical.y * tacticalWeight + backend.y * (1 - tacticalWeight), 8, 92)
      };
    }

    refreshFiveASideShapeAssignments(entries, now) {
      if (this.penaltyMode || !this.ballOwner || !this.possessionTeam) return;
      const ownerKey = `${this.possessionTeam}:${this.playerKey(this.ballOwner.teamId, this.ballOwner.player)}:${this.phase}`;
      if (
        ownerKey === this.fiveASideShapeSignature &&
        now - this.lastFiveASideShapeAt < 420 / clamp(this.speed, 1, 4)
      ) return;
      this.fiveASideShapeSignature = ownerKey;
      this.lastFiveASideShapeAt = now;

      const ball = this.ballPosition;
      const attackingTeam = entries.filter(entry =>
        entry.teamId === this.possessionTeam &&
        !entry.player.isGoalkeeper &&
        entry !== this.ballOwner
      );
      const defendingTeamId = this.possessionTeam === 1 ? 2 : 1;
      const defendingTeam = entries.filter(entry =>
        entry.teamId === defendingTeamId && !entry.player.isGoalkeeper
      );
      const attackDirection = this.possessionTeam === 1 ? 1 : -1;
      const widthRole = ball.y <= 50 ? 'width-right' : 'width-left';
      const safetyX = this.possessionTeam === 1
        ? Math.min(ball.x - 20, 44)
        : Math.max(ball.x + 20, 56);
      const attackSlots = [
        {
          role: widthRole,
          order: 0,
          target: {
            x: ball.x - attackDirection * (this.phase === 'final-third' ? 2 : 0.5),
            y: widthRole === 'width-left' ? 17 : 83
          }
        },
        {
          role: 'runner',
          order: 0,
          target: {
            x: ball.x + attackDirection * (this.phase === 'final-third' ? 7 : 9.5),
            y: clamp(50 - Math.sign(ball.y - 50 || 1) * 9, 25, 75)
          }
        },
        {
          role: 'support',
          order: 0,
          target: {
            x: ball.x - attackDirection * 6.5,
            y: clamp(ball.y + (ball.y <= 50 ? 10.5 : -10.5), 17, 83)
          }
        },
        {
          role: 'balance',
          order: 0,
          target: {
            x: safetyX,
            y: clamp(50 + (ball.y <= 50 ? 13 : -13), 25, 75)
          }
        }
      ];

      const defendingDirection = defendingTeamId === 1 ? 1 : -1;
      const ownGoalDirection = -defendingDirection;
      const defenseSlots = [
        {
          role: 'primary-press',
          order: 0,
          target: { x: ball.x + ownGoalDirection * 2.6, y: ball.y }
        },
        {
          role: 'cover',
          order: 0,
          target: {
            x: ball.x + ownGoalDirection * 8,
            y: clamp(ball.y + (ball.y <= 50 ? 6.2 : -6.2), 16, 84)
          }
        },
        {
          role: 'pass-lane-1',
          order: 0,
          target: {
            x: ball.x + ownGoalDirection * 11.5,
            y: clamp(50 + (ball.y <= 50 ? 12 : -12), 18, 82)
          }
        },
        {
          role: 'rest-defense',
          order: 0,
          target: {
            x: ball.x + ownGoalDirection * 17,
            y: 31
          }
        },
        {
          role: 'rest-defense',
          order: 1,
          target: {
            x: ball.x + ownGoalDirection * 24,
            y: 69
          }
        }
      ];

      const assignUniqueSlots = (players, slots, previousRoleKey, prefix) => {
        if (!players.length || players.length !== slots.length) return;
        let best = null;
        const search = (playerIndex, availableSlots, chosen, totalCost) => {
          if (playerIndex >= players.length) {
            if (!best || totalCost < best.totalCost) best = { chosen: [...chosen], totalCost };
            return;
          }
          const entry = players[playerIndex];
          availableSlots.forEach((slot, slotIndex) => {
            const roleDepth = entry.teamId === 1 ? entry.home.x : 100 - entry.home.x;
            const rolePenalty = slot.role === 'runner'
              ? Math.max(0, 54 - roleDepth) * 0.08
              : slot.role === 'balance' || (slot.role === 'rest-defense' && slot.order === 1)
                ? Math.max(0, roleDepth - 38) * 0.1
                : slot.role === 'primary-press'
                  ? (1 - entry.personality.defending) * 2.4
                  : 0;
            const continuityPenalty = entry[previousRoleKey] && entry[previousRoleKey] !== slot.role
              ? 2.8
              : 0;
            const cost = this.distance(entry.position, slot.target) + rolePenalty + continuityPenalty;
            const nextSlots = availableSlots.filter((_, index) => index !== slotIndex);
            chosen.push({ entry, slot });
            search(playerIndex + 1, nextSlots, chosen, totalCost + cost);
            chosen.pop();
          });
        };
        search(0, slots, [], 0);
        best?.chosen.forEach(({ entry, slot }) => {
          entry[`${prefix}Role`] = slot.role;
          entry[`${prefix}Order`] = slot.order;
          entry[`${prefix}Target`] = {
            x: clamp(slot.target.x, 7, 93),
            y: clamp(slot.target.y, 8, 92)
          };
        });
      };

      entries.forEach(entry => {
        if (entry.player.isGoalkeeper) return;
        if (entry.teamId !== this.possessionTeam || entry === this.ballOwner) {
          entry.liveAttackRole = null;
          entry.liveAttackTarget = null;
        }
        if (entry.teamId !== defendingTeamId) {
          entry.liveDefensiveRole = null;
          entry.liveDefensiveTarget = null;
        }
      });
      assignUniqueSlots(attackingTeam, attackSlots, 'liveAttackRole', 'liveAttack');
      assignUniqueSlots(defendingTeam, defenseSlots, 'liveDefensiveRole', 'liveDefensive');
    }

    teamShapePoint(entry, teamHasBall) {
      const direction = entry.teamId === 1 ? 1 : -1;
      const ballShiftX = clamp((this.ballPosition.x - 50) * 0.12, -6.5, 6.5);
      const ballShiftY = clamp((this.ballPosition.y - 50) * 0.11, -5, 5);
      const phaseAdvance = teamHasBall
        ? this.phase === 'final-third' ? 6 : this.phase === 'build-up' ? 1.5 : 3.5
        : -2;
      const roleDepth = clamp(Math.abs(entry.home.x - 50) / 30, 0.45, 1);
      const compactness = teamHasBall
        ? (this.branch === 'fifa' ? 1.12 : 1.18)
        : (this.branch === 'fifa' ? 0.9 : 0.94);
      const role = String(entry.player.visualRole || entry.player.role || '').toLowerCase();
      const isDefender = /^(lb|lcb|rcb|rb|defans)/.test(role);
      const isMidfielder = /^(ldm|rdm|lam|cam|ram|orta)/.test(role);
      const isAttacker = /^(st|hücum|forvet)/.test(role);
      const rotationSign = ((entry.seed + this.sequenceTick) % 2 === 0 ? 1 : -1);
      const ballSide = this.ballPosition.y < 50 ? -1 : 1;
      let rotationX = 0;
      let rotationY = 0;

      if (teamHasBall) {
        if (isDefender) {
          const isWide = Math.abs(entry.home.y - 50) > 20;
          rotationX = isWide && Math.sign(entry.home.y - 50) === ballSide ? 2.6 : -0.7;
          rotationY = isWide ? Math.sign(entry.home.y - 50) * 2.2 : 0;
        } else if (isMidfielder) {
          rotationX = direction * (rotationSign > 0 ? 3.1 : -1.2);
          rotationY = rotationSign * (this.branch === 'fifa' ? 2.8 : 2.1);
        } else if (isAttacker) {
          rotationX = direction * (rotationSign > 0 ? 4.4 : -2.4);
          rotationY = -ballSide * (rotationSign > 0 ? 2.2 : -1.1);
        }

        if (this.attackPattern === 'cross' && isAttacker) {
          rotationX += direction * 3.4;
          rotationY += (50 - entry.home.y) * 0.16;
        } else if (this.attackPattern === 'switch' && (isMidfielder || isAttacker)) {
          rotationY += -ballSide * 3.2;
        } else if (this.attackPattern === 'through' && isAttacker) {
          rotationX += direction * 4.2;
        } else if (this.attackPattern === 'cutback' && isMidfielder) {
          rotationX += direction * 2.8;
          rotationY += (50 - entry.home.y) * 0.12;
        }
      } else if (isDefender) {
        rotationX = direction * -0.8;
      } else if (isMidfielder) {
        rotationY = ballSide * 1.2;
      }

      return {
        x: clamp(entry.home.x + ballShiftX + direction * phaseAdvance * roleDepth + rotationX, 7, 93),
        y: clamp(50 + (entry.home.y - 50) * compactness + ballShiftY + rotationY, 9, 91)
      };
    }

    leashToShape(point, shape, radius) {
      const dx = point.x - shape.x;
      const dy = point.y - shape.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= radius || distance <= 0.01) return point;
      return {
        x: shape.x + (dx / distance) * radius,
        y: shape.y + (dy / distance) * radius
      };
    }

    findMarkingTarget(entry) {
      const opponents = [...this.players.values()].filter(candidate =>
        candidate.teamId !== entry.teamId && !candidate.player.isGoalkeeper
      );
      return opponents.sort((a, b) => {
        const aScore = this.distance(a.position, entry.home) + this.distance(a.position, entry.position) * 0.35;
        const bScore = this.distance(b.position, entry.home) + this.distance(b.position, entry.position) * 0.35;
        return aScore - bScore;
      })[0] || null;
    }

    sortedTeamByDistance(teamId, point, excludeKeeper = false) {
      return [...this.players.values()]
        .filter(entry => entry.teamId === teamId && (!excludeKeeper || !entry.player.isGoalkeeper))
        .sort((a, b) => this.distance(a.position, point) - this.distance(b.position, point));
    }

    applySeparation(entry, target, entries) {
      const result = { x: target.x, y: target.y };
      let pushX = 0;
      let pushY = 0;
      entries.forEach(other => {
        if (other === entry || other.player.isGoalkeeper) return;
        const sameTeam = other.teamId === entry.teamId;
        const minimumDistance = sameTeam
          ? (this.branch === 'fifa' ? 4.2 : 5.8)
          : (this.branch === 'fifa' ? 1.55 : 2.05);
        let dx = entry.position.x - other.position.x;
        let dy = entry.position.y - other.position.y;
        let distance = Math.hypot(dx, dy);
        if (distance <= 0.01) {
          dx = ((entry.seed + other.seed) % 2 === 0 ? 1 : -1) * 0.35;
          dy = entry.personality.side || 1;
          distance = Math.hypot(dx, dy);
        }
        if (distance >= minimumDistance) return;
        const force = (minimumDistance - distance) / minimumDistance;
        pushX += (dx / distance) * force;
        pushY += (dy / distance) * force;
      });
      const pushMagnitude = Math.hypot(pushX, pushY);
      if (pushMagnitude > 0.01) {
        const cappedPush = Math.min(pushMagnitude, this.branch === 'fifa' ? 1.25 : 1.55);
        result.x += (pushX / pushMagnitude) * cappedPush;
        result.y += (pushY / pushMagnitude) * cappedPush;
      }
      return { x: clamp(result.x, 4, 96), y: clamp(result.y, 7, 93) };
    }

    enforceLiveSpacing(entries) {
      const outfieldPlayers = entries.filter(entry => !entry.player.isGoalkeeper);
      const minimumDistance = this.branch === 'fifa' ? 4.4 : 6.15;

      for (let iteration = 0; iteration < 3; iteration++) {
        for (let leftIndex = 0; leftIndex < outfieldPlayers.length; leftIndex++) {
          const left = outfieldPlayers[leftIndex];
          for (let rightIndex = leftIndex + 1; rightIndex < outfieldPlayers.length; rightIndex++) {
            const right = outfieldPlayers[rightIndex];
            if (left.teamId !== right.teamId) continue;

            let dx = left.position.x - right.position.x;
            let dy = left.position.y - right.position.y;
            let distance = Math.hypot(dx, dy);
            if (distance >= minimumDistance) continue;

            if (distance <= 0.02) {
              dx = ((left.seed + right.seed) % 2 === 0 ? 1 : -1) * 0.28;
              dy = Math.sign(left.home.y - right.home.y) ||
                (left.personality.side === right.personality.side ? left.personality.side : 1);
              distance = Math.hypot(dx, dy);
            }

            let axisX = dx / distance;
            let axisY = dy / distance;
            if (Math.abs(dy) < 1.4) {
              const laneDirection = Math.sign(left.home.y - right.home.y) ||
                (left.personality.side === right.personality.side ? left.personality.side : 1);
              axisX *= 0.28;
              axisY = laneDirection;
              const axisLength = Math.hypot(axisX, axisY);
              axisX /= axisLength;
              axisY /= axisLength;
            }

            const overlap = minimumDistance - distance;
            const leftWeight = left.override && !right.override ? 0.28 : right.override && !left.override ? 0.72 : 0.5;
            const rightWeight = 1 - leftWeight;
            left.position.x = clamp(left.position.x + axisX * overlap * leftWeight, 2.2, 97.8);
            left.position.y = clamp(left.position.y + axisY * overlap * leftWeight, 5.2, 94.8);
            right.position.x = clamp(right.position.x - axisX * overlap * rightWeight, 2.2, 97.8);
            right.position.y = clamp(right.position.y - axisY * overlap * rightWeight, 5.2, 94.8);
          }
        }
      }
    }

    enforceTeamWidth(entries) {
      if (this.penaltyMode) return;

      [1, 2].forEach(teamId => {
        const team = entries
          .filter(entry => entry.teamId === teamId && !entry.player.isGoalkeeper)
          .sort((left, right) => left.position.y - right.position.y);
        if (team.length < 3) return;

        const hasBall = this.possessionTeam === teamId;
        const minimumWidth = this.branch === 'fifa'
          ? (hasBall ? 60 : 50)
          : (hasBall ? 46 : 40);
        const low = team[0];
        const high = team[team.length - 1];
        const currentWidth = high.position.y - low.position.y;
        if (currentWidth >= minimumWidth) return;

        const shortfall = minimumWidth - currentWidth;
        const correction = Math.min(0.55, shortfall * 0.13);
        const secondaryCorrection = correction * 0.36;
        low.position.y = clamp(low.position.y - correction, 5.2, 94.8);
        high.position.y = clamp(high.position.y + correction, 5.2, 94.8);

        if (team.length >= 5) {
          team[1].position.y = clamp(team[1].position.y - secondaryCorrection, 5.2, 94.8);
          team[team.length - 2].position.y = clamp(
            team[team.length - 2].position.y + secondaryCorrection,
            5.2,
            94.8
          );
        }
      });
    }

    enforceTeamDepth(entries, dt) {
      if (this.branch !== 'futbol' || this.penaltyMode) return;
      [1, 2].forEach(teamId => {
        const team = entries.filter(entry =>
          entry.teamId === teamId && !entry.player.isGoalkeeper
        );
        if (!team.length) return;
        const direction = teamId === 1 ? 1 : -1;
        const hasBall = this.possessionTeam === teamId;
        const safety = hasBall
          ? team.find(entry => (entry.liveAttackRole || entry.offBallRole) === 'balance')
          : team
            .filter(entry => (entry.liveDefensiveRole || entry.defensiveRole) === 'rest-defense')
            .sort((a, b) =>
              Number(b.liveDefensiveOrder ?? b.defensiveOrder ?? 0) -
              Number(a.liveDefensiveOrder ?? a.defensiveOrder ?? 0)
            )[0];
        if (!safety) return;

        const desiredBackX = hasBall
          ? (teamId === 1
              ? Math.min(this.ballPosition.x - 20, 44)
              : Math.max(this.ballPosition.x + 20, 56))
          : this.ballPosition.x - direction * 22;
        const progressPastSafety = direction * (safety.position.x - desiredBackX);
        if (progressPastSafety <= 0) return;
        const correction = Math.min(progressPastSafety, (8.5 + progressPastSafety * 0.65) * dt);
        safety.position.x = clamp(safety.position.x - direction * correction, 5.5, 94.5);
        safety.velocity.x *= Math.max(0.15, 1 - 8 * dt);
      });
    }

    setOverride(entry, target, duration, offset = { x: 0, y: 0 }) {
      if (!entry) return;
      entry.override = {
        targetEntry: target?.position ? target : null,
        point: target?.position ? null : { x: target.x, y: target.y },
        offset,
        until: performance.now() + Math.max(120, duration)
      };
      entry.nextDecisionAt = entry.override.until;
    }

    resolveOverride(override) {
      const source = override.targetEntry?.position || override.point || this.ballPosition;
      return {
        x: clamp(source.x + (override.offset?.x || 0), 3, 97),
        y: clamp(source.y + (override.offset?.y || 0), 6, 94)
      };
    }

    clearOverride(entry) {
      if (!entry) return;
      entry.override = null;
      entry.nextDecisionAt = 0;
    }

    async playEvent(event) {
      const duration = event.isPenalty
        ? Math.max(850, Math.round(1700 / Math.sqrt(this.speed)))
        : Math.max(150, Math.round(930 / this.speed));
      if (event.type !== 'goal') this.ball.classList.remove('fm-ball-in-net');
      this.root.style.setProperty('--fm-motion-duration', `${Math.max(90, duration * 0.24)}ms`);
      const teamId = Number(event.teamId) || 1;
      const opponentTeam = teamId === 1 ? 2 : 1;
      const direction = teamId === 1 ? 1 : -1;
      const lane = clamp(Number(event.lane) || 50, 18, 82);
      const actor = this.findPlayer(teamId, event.actor);
      const target = this.findPlayer(teamId, event.target);
      const victim = this.findPlayer(opponentTeam, event.victim);
      const blocker = this.findPlayer(opponentTeam, event.defender);
      const defendingKeeper = this.getKeeper(opponentTeam);
      this.phase = event.phase || (event.type === 'pass' ? 'middle' : 'final-third');
      this.phaseTeam = teamId;
      if (event.type === 'pass' || event.type === 'dribble' || event.type === 'counter' ||
        event.type === 'corner' || event.type === 'support-run' || event.type === 'shape-update' ||
        event.type === 'defensive-shape') {
        this.sequenceTick++;
      }
      this.attackPattern = event.passKind || event.type || 'balanced';
      this.possessionTeam = event.type === 'contain' || event.type === 'defensive-shape'
        ? opponentTeam
        : teamId;
      this.setPhase(event.isPenalty ? 'PENALTI' : this.phaseLabel(this.phase), teamId);

      if (event.isPenalty) await this.preparePenalty(teamId, actor, lane, duration);

      if (event.type === 'shape-update') {
        const origin = {
          x: clamp(Number(event.ballX) || this.ballPosition.x, 3, 97),
          y: clamp(Number(event.ballY) || this.ballPosition.y, 6, 94)
        };
        this.sortedTeamByDistance(teamId, origin, true).forEach(entry => {
          entry.offBallRole = null;
          entry.offBallTarget = null;
          entry.offBallOrigin = null;
        });
        const assignments = Array.isArray(event.assignments) ? event.assignments : [];
        assignments.forEach((assignment, index) => {
          const runner = this.findPlayer(teamId, assignment.actor);
          if (!runner) return;
          const destination = {
            x: clamp(Number(assignment.toX) || runner.position.x, 7, 93),
            y: clamp(Number(assignment.toY) || runner.position.y, 8, 92)
          };
          runner.offBallRole = assignment.role || 'support';
          runner.offBallOrder = Number(assignment.order) || 0;
          runner.offBallTarget = destination;
          runner.offBallOrigin = origin;
          this.clearOverride(runner);
          this.markPlayer(runner, 'fm-player-supporting', duration * 1.35);
        });
        this.setPhase('SAHAYA YAYILIYOR', teamId);
        await this.delay(duration * 0.48);
        return;
      }

      if (event.type === 'defensive-shape') {
        const origin = {
          x: clamp(Number(event.ballX) || this.ballPosition.x, 3, 97),
          y: clamp(Number(event.ballY) || this.ballPosition.y, 6, 94)
        };
        this.sortedTeamByDistance(teamId, origin, true).forEach(entry => {
          entry.defensiveRole = null;
          entry.defensiveTarget = null;
          entry.defensiveOrigin = null;
          entry.defensiveMark = null;
          delete entry.element.dataset.defensiveRole;
        });
        const assignments = Array.isArray(event.assignments) ? event.assignments : [];
        assignments.forEach((assignment, index) => {
          const defenderEntry = this.findPlayer(teamId, assignment.actor);
          if (!defenderEntry) return;
          const role = assignment.role || 'rest-defense';
          const destination = {
            x: clamp(Number(assignment.toX) || defenderEntry.position.x, 7, 93),
            y: clamp(Number(assignment.toY) || defenderEntry.position.y, 8, 92)
          };
          defenderEntry.defensiveRole = role;
          defenderEntry.defensiveOrder = Number(assignment.order) || 0;
          defenderEntry.defensiveTarget = destination;
          defenderEntry.defensiveOrigin = origin;
          defenderEntry.defensiveMark = assignment.markTarget
            ? this.findPlayer(opponentTeam, assignment.markTarget)
            : null;
          this.clearOverride(defenderEntry);
          defenderEntry.element.dataset.defensiveRole = role;
          this.markPlayer(
            defenderEntry,
            role === 'primary-press' ? 'fm-player-pressing' : 'fm-player-marking',
            duration * 1.45
          );
        });
        if (victim) this.ballOwner = victim;
        this.setPhase('SAVUNMA YERLEŞİYOR', teamId);
        await this.delay(duration * 0.52);
        return;
      }

      if (event.type === 'support-run') {
        if (!actor) return;
        const destination = {
          x: clamp(Number(event.toX) || actor.position.x + direction * 4, 8, 92),
          y: clamp(Number(event.toY) || actor.position.y, 10, 90)
        };
        this.setOverride(actor, destination, duration * 1.65);
        this.markPlayer(actor, 'fm-player-supporting', duration * 1.55);
        const marker = this.nearestPlayer(opponentTeam, destination, true);
        if (marker) {
          this.setOverride(marker, actor, duration * 1.5, {
            x: -direction * 2.1,
            y: marker.personality.side * 1.3
          });
          this.markPlayer(marker, 'fm-player-marking', duration * 1.45);
        }
        const label = event.runKind === 'overlap'
          ? 'BİNDİRME'
          : event.runKind === 'underlap'
            ? 'İÇ KOŞU'
            : event.runKind === 'box-run'
              ? 'CEZA ALANI KOŞUSU'
              : 'YAKIN DESTEK';
        this.setPhase(label, teamId);
        await this.delay(duration * 0.56);
        return;
      }

      if (event.type === 'contain') {
        if (!actor) return;
        const ballCarrier = victim || this.ballOwner;
        if (ballCarrier) {
          this.ballOwner = ballCarrier;
          this.setOverride(actor, ballCarrier, duration * 1.35, {
            x: -direction * 1.35,
            y: actor.personality.side * 0.55
          });
          this.markPlayer(actor, 'fm-player-pressing', duration * 1.5);
          this.markPlayer(ballCarrier, 'fm-player-shielding', duration * 1.4);
          const coverPlayers = this.sortedTeamByDistance(teamId, ballCarrier.position, true)
            .filter(entry => entry !== actor)
            .slice(0, this.branch === 'fifa' ? 2 : 1);
          coverPlayers.forEach((coverPlayer, index) => {
            this.setOverride(coverPlayer, {
              x: ballCarrier.position.x - direction * (4.2 + index * 2.4),
              y: ballCarrier.position.y + coverPlayer.personality.side * (4.5 + index * 2)
            }, duration * 1.35);
            this.markPlayer(coverPlayer, 'fm-player-marking', duration * 1.3);
          });
        }
        this.possessionTeam = opponentTeam;
        this.setPhase('ŞUT AÇISI KAPANDI', teamId);
        this.showBanner('SAVUNMA YERLEŞTİ!', teamId, 'duel');
        await this.delay(duration * 0.72);
        return;
      }

      if (event.type === 'pass') {
        if (!actor || !target) return;
        const passInterrupted = event.completed === false || event.intercepted === true;
        const interceptor = passInterrupted
          ? this.findPlayer(opponentTeam, event.interceptor)
          : null;
        this.ballOwner = actor;
        this.possessionTeam = teamId;
        const progress = clamp(Number(event.progress) || 0.5, 0.08, 0.95);
        const desiredX = event.passKind === 'recycle'
          ? (teamId === 1 ? 27 : 73)
          : (teamId === 1 ? 16 + progress * 68 : 84 - progress * 68);
        const hasPlannedPoint = Number.isFinite(Number(event.toX)) && Number.isFinite(Number(event.toY));
        let receivePoint = hasPlannedPoint
          ? {
              x: clamp(Number(event.toX), 8, 92),
              y: clamp(Number(event.toY), 10, 90)
            }
          : {
          x: clamp(target.position.x * 0.42 + desiredX * 0.58, 8, 92),
          y: clamp(target.position.y * 0.68 + lane * 0.32, 10, 90)
            };
        if (event.passKind === 'cross') {
          if (!hasPlannedPoint) {
            receivePoint = {
              x: teamId === 1 ? 84 : 16,
              y: clamp(50 + (target.home.y - 50) * 0.18, 42, 58)
            };
          }
          this.setPhase('ORTA', teamId);
        } else if (event.passKind === 'through') {
          if (!hasPlannedPoint) {
            receivePoint = {
              x: teamId === 1 ? clamp(73 + progress * 12, 76, 85) : clamp(27 - progress * 12, 15, 24),
              y: clamp(lane * 0.7 + target.home.y * 0.3, 18, 82)
            };
          }
          this.setPhase('ARA PASI', teamId);
        } else if (event.passKind === 'cutback') {
          if (!hasPlannedPoint) {
            receivePoint = {
              x: teamId === 1 ? 78 : 22,
              y: clamp(50 + (target.home.y - 50) * 0.22, 40, 60)
            };
          }
          this.setPhase('GERİYE ÇEVİRDİ', teamId);
        } else if (event.passKind === 'switch') {
          if (!hasPlannedPoint) receivePoint.y = clamp(100 - lane, 16, 84);
          this.setPhase('YÖN DEĞİŞTİ', teamId);
        } else if (event.passKind === 'one-two') {
          if (!hasPlannedPoint) {
            receivePoint.x = clamp(receivePoint.x + direction * 3.6, 8, 92);
            receivePoint.y = clamp((receivePoint.y + actor.position.y) / 2, 12, 88);
          }
          this.setPhase('DUVAR PASI', teamId);
        }
        const hasInterceptionPoint = passInterrupted &&
          Number.isFinite(Number(event.interceptX)) &&
          Number.isFinite(Number(event.interceptY));
        const interceptionPoint = hasInterceptionPoint
          ? {
              x: clamp(Number(event.interceptX), 8, 92),
              y: clamp(Number(event.interceptY), 10, 90)
            }
          : receivePoint;
        this.setOverride(target, receivePoint, duration * 1.7);
        if (event.passKind === 'cross' || event.passKind === 'cutback') {
          const runners = this.sortedTeamByDistance(teamId, receivePoint, true)
            .filter(entry => entry !== actor && entry !== target)
            .slice(0, 2);
          runners.forEach((runner, index) => this.setOverride(runner, {
            x: receivePoint.x - direction * (3.5 + index * 3),
            y: clamp(45 + index * 10, 36, 64)
          }, duration * 1.6));
        }
        let passSetupDuration = duration * 0.34;
        if (event.passKind === 'cross' || event.passKind === 'cutback') {
          const sourcePoint = Number.isFinite(Number(event.fromX)) && Number.isFinite(Number(event.fromY))
            ? {
                x: clamp(Number(event.fromX), 8, 92),
                y: clamp(Number(event.fromY), 10, 90)
              }
            : {
                x: event.passKind === 'cutback'
                  ? (teamId === 1 ? 87 : 13)
                  : (teamId === 1 ? 79 : 21),
                y: lane
              };
          const sourceDistance = this.distance(actor.position, sourcePoint);
          const sourceSpeed = (actor.player.isBot ? 6.1 : 6.8) *
            actor.personality.aggression *
            clamp(this.speed, 0.65, 4) *
            1.2;
          passSetupDuration = clamp(
            (sourceDistance / Math.max(4, sourceSpeed)) * 1120,
            duration * 0.55,
            2200
          );
          this.setOverride(actor, sourcePoint, passSetupDuration * 1.1);
        }
        const presser = interceptor || this.nearestPlayer(opponentTeam, receivePoint, true);
        if (presser) {
          if (passInterrupted) {
            this.setOverride(presser, interceptionPoint, duration * 1.25);
          } else {
            this.setOverride(presser, target, duration * 1.55, {
              x: -direction * (2.2 + presser.personality.aggression),
              y: presser.personality.side * 1.1
            });
          }
          this.markPlayer(presser, 'fm-player-pressing', duration * 1.4);
        }
        this.markPlayer(actor, 'fm-player-active', duration * 0.95);
        if (event.passKind === 'cross' || event.passKind === 'cutback') {
          await this.waitForPlayerNear(actor, this.resolveOverride(actor.override), 3.4, passSetupDuration);
        } else {
          await this.delay(passSetupDuration);
        }
        const flightDestination = passInterrupted ? interceptionPoint : target;
        this.drawPass(actor.position, passInterrupted ? interceptionPoint : target.position);
        const passTempo = 1.08 - actor.personality.passing * 0.18;
        await this.launchBall(
          actor.position,
          flightDestination,
          duration * (event.passKind === 'cross' ? 0.84 : 0.68) * passTempo,
          passInterrupted ? null : target,
          event.passKind === 'cross' ? 2.6 : event.passKind === 'switch' ? 1.35 : 0.7
        );
        if (passInterrupted) {
          this.ballFlight = null;
          this.ballOwner = null;
          this.setBall(interceptionPoint.x, interceptionPoint.y);
          this.root.dataset.ballTransition = 'pass-interception';
          this.root.dataset.interceptX = interceptionPoint.x.toFixed(2);
          this.root.dataset.interceptY = interceptionPoint.y.toFixed(2);
          if (interceptor) this.markPlayer(interceptor, 'fm-player-intercepting', duration * 1.2);
          this.clearPass();
          return;
        }
        this.possessionTeam = teamId;
        this.ballOwner = target;
        this.markPlayer(target, 'fm-player-active', duration * 0.8);
        this.clearPass();
        return;
      }

      if (event.type === 'counter') {
        if (!actor || !target) return;
        this.ballOwner = actor;
        this.possessionTeam = teamId;
        this.setPhase('HIZLI HÜCUM', teamId);
        const runnerPoint = {
          x: clamp(target.position.x + direction * (this.branch === 'fifa' ? 12 : 15), 10, 90),
          y: clamp(lane * 0.58 + target.home.y * 0.42, 14, 86)
        };
        this.setOverride(target, runnerPoint, duration * 1.9);
        this.players.forEach(entry => {
          if (entry.teamId !== teamId || entry === actor || entry === target || entry.player.isGoalkeeper) return;
          const shape = this.teamShapePoint(entry, true);
          this.setOverride(entry, {
            x: clamp(shape.x + direction * (entry.seed % 2 === 0 ? 4.5 : 2), 8, 92),
            y: shape.y
          }, duration * 1.45);
        });
        this.setOverride(actor, {
          x: actor.position.x + direction * 4.2,
          y: actor.position.y
        }, duration);
        await this.delay(duration * 0.42);
        this.drawPass(actor.position, target.position);
        await this.launchBall(actor.position, target, duration * 0.7, target, 0.8);
        this.ballOwner = target;
        this.clearPass();
        return;
      }

      if (event.type === 'corner') {
        if (!actor || !target) return;
        const cornerY = lane < 50 ? 7 : 93;
        const cornerX = teamId === 1 ? 96 : 4;
        const boxX = teamId === 1 ? 86 : 14;
        this.penaltyMode = false;
        this.ballOwner = null;
        this.setPhase('KORNER', teamId);
        this.clearOverride(actor);
        this.movePlayer(actor, cornerX, cornerY, true);
        this.setBall(cornerX + (teamId === 1 ? 0.7 : -0.7), cornerY, true);

        const attackers = this.sortedTeamByDistance(teamId, { x: boxX, y: 50 }, true)
          .filter(entry => entry !== actor)
          .slice(0, this.branch === 'fifa' ? 4 : 3);
        const defenders = this.sortedTeamByDistance(opponentTeam, { x: boxX, y: 50 }, true)
          .slice(0, attackers.length);
        attackers.forEach((entry, index) => {
          const point = { x: boxX - direction * (index % 2) * 3, y: 38 + index * (24 / Math.max(1, attackers.length - 1)) };
          this.clearOverride(entry);
          this.movePlayer(entry, point.x, point.y, true);
        });
        defenders.forEach((entry, index) => {
          const mark = attackers[index];
          const point = mark ? { x: mark.position.x - direction * 1.8, y: mark.position.y + (index % 2 ? 1.2 : -1.2) } : { x: boxX, y: 50 };
          this.clearOverride(entry);
          this.movePlayer(entry, point.x, point.y, true);
        });
        const aerialTarget = attackers.find(entry => entry === target) || attackers[0] || target;
        await this.delay(duration * 0.34);
        this.drawPass({ x: cornerX, y: cornerY }, aerialTarget.position);
        await this.launchBall({ x: cornerX, y: cornerY }, aerialTarget, duration * 0.92, aerialTarget, 3.4);
        this.ballOwner = aerialTarget;
        this.setPhase('HAVA TOPU', teamId);
        this.clearPass();
        return;
      }

      if (event.type === 'dribble') {
        if (!actor) return;
        this.ballOwner = actor;
        this.possessionTeam = teamId;
        const defender = victim || this.nearestPlayer(opponentTeam, actor.position, true);
        const side = Number(event.side) < 0 ? -1 : 1;
        const feintPoint = {
          x: clamp(actor.position.x + direction * 1.8, 8, 92),
          y: clamp(actor.position.y + side * (event.dribbleKind === 'skill' ? 3.2 : 2.1), 10, 90)
        };
        const exitPoint = {
          x: Number.isFinite(Number(event.toX))
            ? clamp(Number(event.toX), 8, 92)
            : clamp(actor.position.x + direction * (event.dribbleKind === 'skill' ? 6.2 : 5.1), 8, 92),
          y: Number.isFinite(Number(event.toY))
            ? clamp(Number(event.toY), 10, 90)
            : clamp(actor.position.y + side * 1.15, 10, 90)
        };
        this.setOverride(actor, feintPoint, duration * 0.82);
        if (defender) {
          this.setOverride(defender, {
            x: feintPoint.x - direction * 0.8,
            y: feintPoint.y + side * 0.9
          }, duration * 0.82);
          this.markPlayer(defender, 'fm-player-under-pressure', duration * 1.25);
        }
        this.markPlayer(actor, 'fm-player-dribbling', duration * 1.55);
        this.setPhase(event.dribbleKind === 'skill' ? 'BİREBİR' : 'TOP SÜRÜYOR', teamId);
        await this.delay(duration * 0.46);
        if (event.won === false) {
          if (defender) {
            this.setOverride(defender, actor, duration * 0.82, {
              x: -direction * 0.55,
              y: defender.personality.side * 0.35
            });
            this.markPlayer(defender, 'fm-player-tackling', duration * 1.25);
          }
          this.setOverride(actor, {
            x: actor.position.x - direction * 1.6,
            y: actor.position.y + side * 1.2
          }, duration * 0.72);
          this.markPlayer(actor, 'fm-player-under-pressure', duration * 1.2);
          await this.delay(duration * 0.48);
          this.ballOwner = defender || null;
          this.possessionTeam = opponentTeam;
          this.setPhase('BASKI KAZANDI', opponentTeam);
          return;
        }
        this.setOverride(actor, exitPoint, duration * 0.92);
        if (defender) {
          this.setOverride(defender, {
            x: feintPoint.x - direction * 1.7,
            y: feintPoint.y - side * 1.8
          }, duration * 0.9);
        }
        await this.delay(duration * 0.58);
        this.ballOwner = actor;
        this.possessionTeam = teamId;
        return;
      }

      if (event.type === 'interception' || event.type === 'tackle') {
        if (!actor) return;
        const continuousTurnover = event.fromPass === true || event.fromDribble === true;
        const duelTarget = victim || this.ballOwner;
        if (!continuousTurnover && duelTarget) this.ballOwner = duelTarget;
        const plannedX = event.type === 'interception' ? event.interceptX : event.tackleX;
        const plannedY = event.type === 'interception' ? event.interceptY : event.tackleY;
        const duelPoint = Number.isFinite(Number(plannedX)) && Number.isFinite(Number(plannedY))
          ? { x: Number(plannedX), y: Number(plannedY) }
          : (duelTarget?.position || this.ballPosition);
        if (continuousTurnover) {
          this.ballFlight = null;
          this.ballOwner = null;
          this.setBall(duelPoint.x, duelPoint.y);
        }
        const duelDistance = this.distance(actor.position, duelPoint);
        const actorBaseSpeed = actor.player.isGoalkeeper ? 4.1 : actor.player.isBot ? 6.1 : 6.8;
        const actorSprintSpeed = actorBaseSpeed *
          actor.personality.aggression *
          actor.personality.pace *
          clamp(this.speed, 0.65, 4) *
          1.32;
        const recoveryDuration = continuousTurnover
          ? clamp(
              (duelDistance / Math.max(4, actorSprintSpeed)) * 1080,
              duration * 0.72,
              3200
            )
          : duration * 0.62;
        this.setOverride(
          actor,
          duelPoint,
          recoveryDuration * 1.18,
          continuousTurnover
            ? { x: 0, y: 0 }
            : { x: direction * 0.7, y: actor.personality.side * 0.5 }
        );
        if (victim) {
          this.setOverride(victim, {
            x: victim.position.x - direction * 1.5,
            y: victim.position.y + victim.personality.side * 1.4
          }, duration);
          this.markPlayer(victim, 'fm-player-under-pressure', duration * 1.2);
        }
        this.markPlayer(actor, event.type === 'tackle' ? 'fm-player-tackling' : 'fm-player-intercepting', duration * 1.5);
        if (continuousTurnover) {
          await this.waitForPlayerNear(actor, duelPoint, 1.15, recoveryDuration);
        } else {
          await this.delay(recoveryDuration);
        }
        this.ballFlight = null;
        this.ballOwner = actor;
        this.possessionTeam = teamId;
        delete this.root.dataset.ballTransition;
        delete this.root.dataset.interceptX;
        delete this.root.dataset.interceptY;
        this.setPhase(event.type === 'tackle' ? 'MÜDAHALE' : 'PAS ARASI', teamId);
        this.showBanner(event.type === 'tackle' ? 'TOP KAPMA!' : 'PAS ARASI!', teamId, 'duel');
        await this.delay(duration * 0.42);
        return;
      }

      if (event.type === 'clearance') {
        if (!actor) return;
        this.ballOwner = actor;
        this.possessionTeam = teamId;
        this.markPlayer(actor, 'fm-player-clearing', duration * 1.25);
        await this.delay(duration * 0.3);
        const clearanceTarget = {
          x: teamId === 1 ? clamp(actor.position.x + 29, 38, 76) : clamp(actor.position.x - 29, 24, 62),
          y: clamp(50 + (lane - 50) * 0.42, 24, 76)
        };
        this.drawPass(actor.position, clearanceTarget);
        await this.launchBall(actor.position, clearanceTarget, duration * 0.66, null);
        const receiver = this.nearestPlayer(teamId, clearanceTarget, true);
        this.ballOwner = receiver;
        this.possessionTeam = teamId;
        this.setPhase('UZAKLAŞTIRDI', teamId);
        this.clearPass();
        return;
      }

      if (event.type === 'foul') {
        const fouled = victim || this.nearestPlayer(opponentTeam, actor?.position || this.ballPosition, true);
        if (actor && fouled) {
          this.ballOwner = fouled;
          this.setOverride(actor, fouled, duration, { x: direction * 0.7, y: actor.personality.side * 0.5 });
          this.setOverride(fouled, {
            x: fouled.position.x - direction * 0.8,
            y: fouled.position.y + fouled.personality.side
          }, duration);
          this.markPlayer(actor, 'fm-player-foul', duration * 1.6);
        }
        await this.delay(duration * 0.62);
        this.showBanner('FAUL!', teamId, 'warning');
        this.possessionTeam = opponentTeam;
        this.ballOwner = fouled || null;
        this.setPhase('DURAN TOP', opponentTeam);
        await this.delay(duration * 0.48);
        return;
      }

      if (!actor) return;
      this.ballOwner = actor;
      this.possessionTeam = teamId;
      const hasPlannedShotPoint =
        Number.isFinite(Number(event.shotX)) &&
        Number.isFinite(Number(event.shotY));
      const shotPoint = event.isPenalty
        ? actor.position
        : hasPlannedShotPoint
          ? {
              x: clamp(Number(event.shotX), 8, 92),
              y: clamp(Number(event.shotY), 10, 90)
            }
        : {
            x: clamp(actor.position.x + direction * (2.1 - clamp(Number(event.pressure) || 0, 0, 1) * 0.45), 13, 87),
            y: clamp(
              actor.position.y * 0.78 +
              (Number.isFinite(Number(event.shotY)) ? Number(event.shotY) : lane) * 0.22,
              22,
              78
            )
          };
      const approachDistance = this.distance(actor.position, shotPoint);
      const approachSpeed = (actor.player.isBot ? 6.1 : 6.8) *
        actor.personality.aggression *
        clamp(this.speed, 0.65, 4) *
        1.2;
      const approachDuration = event.isPenalty
        ? duration * 0.72
        : clamp((approachDistance / Math.max(4, approachSpeed)) * 980, duration * 0.42, 2400);
      this.setOverride(actor, shotPoint, approachDuration * 1.15);
      const cover = blocker || this.nearestPlayer(opponentTeam, shotPoint, true);
      if (cover) {
        this.setOverride(
          cover,
          actor,
          approachDuration,
          event.oneOnOne
            ? { x: -direction * 4.2, y: cover.personality.side * 1.4 }
            : { x: direction * 1.5, y: cover.personality.side * 0.7 }
        );
      }

      const attackingRunners = this.sortedTeamByDistance(teamId, shotPoint, true)
        .filter(entry => entry !== actor)
        .slice(0, this.branch === 'fifa' ? 4 : 3);
      attackingRunners.forEach((runner, index) => {
        const isCloseSupport = index === attackingRunners.length - 1;
        const runnerPoint = isCloseSupport
          ? {
              x: shotPoint.x - direction * (5.5 + index),
              y: clamp(shotPoint.y + runner.personality.side * 8, 14, 86)
            }
          : {
              x: teamId === 1 ? 87 - index * 3.4 : 13 + index * 3.4,
              y: clamp(40 + index * (20 / Math.max(1, attackingRunners.length - 1)), 34, 66)
            };
        this.setOverride(runner, runnerPoint, approachDuration * 1.5);
        this.markPlayer(runner, 'fm-player-supporting', duration * 1.4);
      });

      const defendingCover = this.sortedTeamByDistance(opponentTeam, shotPoint, true)
        .filter(entry => entry !== cover)
        .slice(0, this.branch === 'fifa' ? 4 : 3);
      defendingCover.forEach((defenderEntry, index) => {
        const runner = attackingRunners[index];
        const coverPoint = runner
          ? {
              x: runner.position.x + direction * 1.7,
              y: runner.position.y + defenderEntry.personality.side * 0.8
            }
          : {
              x: shotPoint.x + direction * (4.2 + index * 2.2),
              y: clamp(shotPoint.y + defenderEntry.personality.side * (4 + index * 2), 18, 82)
            };
        this.setOverride(defenderEntry, coverPoint, approachDuration * 1.45);
        this.markPlayer(defenderEntry, 'fm-player-marking', duration * 1.35);
      });

      await this.waitForPlayerNear(actor, shotPoint, event.isPenalty ? 1.4 : 1.8, approachDuration * 1.05);
      this.setPhase(event.oneOnOne ? 'KARŞI KARŞIYA' : event.longRange ? 'UZAKTAN ŞUT' : 'ŞUT', teamId);
      this.markPlayer(actor, 'fm-player-shooting', duration * 1.3);
      const shotTempo = 1.08 - actor.personality.finishing * 0.18;
      const goalPoint = { x: teamId === 1 ? 99.25 : 0.75, y: clamp(lane, 34, 66) };
      const netPoint = {
        x: teamId === 1 ? 100.9 : -0.9,
        y: clamp(50 + (lane - 50) * 0.28, 44.5, 55.5)
      };

      if (event.type === 'block') {
        const blockTarget = cover || this.nearestPlayer(opponentTeam, actor.position, true);
        const impactPoint = blockTarget
          ? {
              x: blockTarget.position.x + direction * 0.6,
              y: blockTarget.position.y
            }
          : {
              x: actor.position.x + direction * 5,
              y: actor.position.y
            };
        if (blockTarget) {
          this.setOverride(blockTarget, impactPoint, duration * 0.7);
          this.markPlayer(blockTarget, 'fm-player-blocking', duration * 1.2);
        }
        this.drawPass(actor.position, impactPoint);
        await this.launchBall(actor.position, impactPoint, duration * 0.38 * shotTempo, null, 0.25);
        this.setBall(
          clamp(impactPoint.x - direction * 3.5, 3, 97),
          clamp(impactPoint.y + (lane < 50 ? 4 : -4), 7, 93)
        );
        this.showBanner('BLOKE!', opponentTeam, 'duel');
        this.ballOwner = null;
        this.possessionTeam = opponentTeam;
        this.setPhase('SEKEN TOP', opponentTeam);
        this.clearPass();
        return;
      }

      if (event.type === 'woodwork') {
        const postPoint = {
          x: teamId === 1 ? 98.7 : 1.3,
          y: lane < 50 ? 35.2 : 64.8
        };
        this.drawPass(actor.position, postPoint);
        await this.launchBall(actor.position, postPoint, duration * 0.48 * shotTempo, null, 0.55);
        this.showBanner('DİREK!', teamId, 'warning');
        this.setBall(
          clamp(postPoint.x - direction * 5.5, 3, 97),
          clamp(postPoint.y + (lane < 50 ? 3.5 : -3.5), 7, 93)
        );
        this.ballOwner = null;
        this.possessionTeam = opponentTeam;
        this.setPhase('DİREKTEN DÖNDÜ', teamId);
        this.clearPass();
        return;
      }

      if (event.type === 'goal') {
        if (defendingKeeper) {
          const diveY = lane < 50 ? clamp(lane + 11, 37, 67) : clamp(lane - 11, 33, 63);
          this.setOverride(defendingKeeper, { x: defendingKeeper.home.x, y: diveY }, duration);
          this.markPlayer(defendingKeeper, 'fm-keeper-dive', duration);
        }
        this.drawPass(actor.position, netPoint);
        await this.launchBall(actor.position, netPoint, duration * 0.56 * shotTempo, null, 0.34);
        this.setBall(netPoint.x, netPoint.y, true);
        this.ball.classList.add('fm-ball-in-net');
        this.showBanner('GOOOL!', teamId);
        this.root.classList.remove('fm-goal-flash');
        void this.root.offsetWidth;
        this.root.classList.add('fm-goal-flash');
        if (event.isPenalty) {
          this.ballOwner = null;
          this.penaltyMode = true;
          this.setPhase('PENALTI SERİSİ', teamId);
          await this.delay(duration * 0.72);
          this.clearPass();
          return;
        }
        this.celebrate(teamId, actor, duration);
        await this.delay(duration * 1.2);
        this.clearPass();
        await this.resetKickoff(opponentTeam, duration);
        return;
      }

      if (event.type === 'save') {
        const savePoint = { x: defendingKeeper?.home.x || goalPoint.x, y: clamp(lane, 37, 63) };
        if (defendingKeeper) {
          this.setOverride(defendingKeeper, savePoint, duration);
          this.markPlayer(defendingKeeper, 'fm-player-save', duration * 1.45);
        }
        this.drawPass(actor.position, savePoint);
        await this.launchBall(actor.position, savePoint, duration * 0.52 * shotTempo, defendingKeeper);
        this.showBanner('KURTARIŞ!', opponentTeam);
        if (event.isPenalty) {
          this.ballOwner = null;
          this.penaltyMode = true;
          this.setPhase('PENALTI SERİSİ', opponentTeam);
          await this.delay(duration * 0.5);
          this.clearPass();
          return;
        }
        this.possessionTeam = opponentTeam;
        this.ballOwner = defendingKeeper || null;
        this.setPhase('KALECİDE', opponentTeam);
        this.clearPass();
        return;
      }

      const missPoint = {
        x: teamId === 1 ? 101 : -1,
        y: lane < 50 ? 31.5 : 68.5
      };
      this.drawPass(actor.position, missPoint);
      await this.launchBall(actor.position, missPoint, duration * 0.5 * shotTempo, null);
      this.showBanner(event.isPenalty ? 'KAÇTI!' : 'AUT!', teamId, 'neutral');
      this.ballOwner = null;
      this.possessionTeam = opponentTeam;
      if (event.isPenalty) {
        this.penaltyMode = true;
        this.setPhase('PENALTI SERİSİ', opponentTeam);
        await this.delay(duration * 0.4);
      } else {
        this.setPhase('KALE VURUŞU', opponentTeam);
      }
      this.clearPass();
    }

    launchBall(from, destination, duration, receiver = null, arcHeight = 0.7) {
      const targetEntry = destination?.position ? destination : null;
      const targetPoint = targetEntry ? null : destination;
      this.ballOwner = null;
      this.ballFlight = {
        from: { x: from.x, y: from.y },
        targetEntry,
        targetPoint,
        receiver,
        arcHeight,
        startedAt: performance.now(),
        duration: Math.max(90, duration)
      };
      return this.delay(duration);
    }

    updateBallFlight(now) {
      if (!this.ballFlight) return;
      const flight = this.ballFlight;
      const target = flight.targetEntry?.position || flight.targetPoint || flight.from;
      const progress = clamp((now - flight.startedAt) / flight.duration, 0, 1);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const arc = Math.sin(progress * Math.PI) * (flight.arcHeight ?? 0.7);
      this.setBall(
        flight.from.x + (target.x - flight.from.x) * eased,
        flight.from.y + (target.y - flight.from.y) * eased - arc
      );
      if (progress >= 1) {
        this.ballOwner = flight.receiver || null;
        this.ballFlight = null;
      }
    }

    async preparePenalty(teamId, actor, lane, duration) {
      this.penaltyMode = true;
      this.players.forEach(entry => {
        if (entry === actor) return;
        if (entry.player.isGoalkeeper) {
          this.clearOverride(entry);
          entry.penaltyPosition = { x: entry.home.x, y: 50 };
          this.movePlayer(entry, entry.home.x, 50, true);
        } else {
          const order = Number(entry.player.order) || 0;
          const column = Math.floor(order / 5);
          const waitingX = entry.teamId === 1 ? 46 - column * 2.4 : 54 + column * 2.4;
          const waitingY = 20 + (order % 5) * 15;
          this.clearOverride(entry);
          entry.penaltyPosition = { x: waitingX, y: waitingY };
          this.movePlayer(entry, waitingX, waitingY, true);
        }
      });
      if (actor) {
        this.clearOverride(actor);
        actor.penaltyPosition = { x: teamId === 1 ? 84 : 16, y: 50 };
        this.movePlayer(actor, teamId === 1 ? 84 : 16, 50, true);
        this.ballOwner = null;
        this.setBall(teamId === 1 ? 88 : 12, 50, true);
        await this.delay(duration * 0.3);
        this.setOverride(actor, { x: teamId === 1 ? 87 : 13, y: lane }, duration);
      }
    }

    celebrate(teamId, scorer, duration) {
      const direction = teamId === 1 ? 1 : -1;
      const target = scorer?.position || { x: teamId === 1 ? 88 : 12, y: 50 };
      this.players.forEach(entry => {
        if (entry.teamId !== teamId || entry.player.isBot) return;
        const order = Number(entry.player.order) || 0;
        this.setOverride(entry, {
          x: target.x - direction * (2.5 + (order % 2) * 3),
          y: target.y + (order - 2) * 4
        }, duration * 1.7);
        this.markPlayer(entry, 'fm-player-celebrating', duration * 1.5);
      });
      this.setPhase('GOL SEVİNCİ', teamId);
    }

    async resetKickoff(kickoffTeam, duration) {
      this.penaltyMode = false;
      this.ball.classList.remove('fm-ball-in-net');
      this.phase = 'kickoff';
      this.phaseTeam = kickoffTeam;
      this.possessionTeam = kickoffTeam;
      this.ballFlight = null;
      this.ballOwner = null;
      this.setPhase('SANTRA', kickoffTeam);
      this.players.forEach(entry => {
        this.clearOverride(entry);
        entry.penaltyPosition = null;
        this.movePlayer(entry, entry.home.x, entry.home.y, true);
      });
      await this.delay(duration * 0.24);
      const kickoffPlayer = this.nearestPlayer(kickoffTeam, { x: 50, y: 50 }, true);
      if (kickoffPlayer) this.setOverride(kickoffPlayer, { x: kickoffTeam === 1 ? 48.2 : 51.8, y: 50 }, duration);
      this.setBall(50, 50);
      this.ballOwner = kickoffPlayer;
    }

    nearestPlayer(teamId, point, excludeKeeper = false) {
      return [...this.players.values()]
        .filter(entry => entry.teamId === teamId && (!excludeKeeper || !entry.player.isGoalkeeper))
        .sort((a, b) => this.distance(a.position, point) - this.distance(b.position, point))[0] || null;
    }

    getKeeper(teamId) {
      return [...this.players.values()].find(entry => entry.teamId === teamId && entry.player.isGoalkeeper) || null;
    }

    distance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    async waitForPlayerNear(entry, target, threshold, timeout) {
      const startedAt = performance.now();
      while (!this.stopped &&
        this.distance(entry.position, target) > threshold &&
        performance.now() - startedAt < timeout) {
        await this.delay(48);
      }
    }

    findPlayer(teamId, player) {
      if (!player) return null;
      const direct = this.players.get(this.playerKey(teamId, player));
      if (direct) return direct;
      const name = this.displayName(player);
      return [...this.players.values()].find(entry =>
        entry.teamId === teamId && this.displayName(entry.player) === name
      ) || null;
    }

    playerKey(teamId, player) {
      return `${teamId}:${player.idName || player.name || 'Bilinmeyen'}`;
    }

    displayName(player) {
      if (!player) return 'Bilinmeyen';
      return String(player.name || player.idName || 'Bilinmeyen').replace(/\s*\([^)]*\)\s*$/, '').trim();
    }

    playerTooltip(player) {
      const name = this.displayName(player);
      if (player?.isBot) return `${name} · Bot`;
      const profile = player?.footballProfile || {};
      const rating = Math.round(Number(player?.cardRating) || 50);
      return `${name} · GEN ${rating} · PAS ${profile.passing || rating} · DRİ ${profile.dribbling || rating} · ` +
        `BİT ${profile.finishing || rating} · SAV ${profile.defending || rating}`;
    }

    updatePlayerPerformance(state) {
      [state.t1?.players || [], state.t2?.players || []].forEach((players, teamIndex) => {
        players.forEach(player => {
          const entry = this.findPlayer(teamIndex + 1, player);
          if (!entry) return;
          const completed = Number(player.passesCompleted) || 0;
          const attempted = Number(player.passesAttempted) || 0;
          const dribbles = Number(player.dribblesWon) || 0;
          const tackles = (Number(player.tackles) || 0) + (Number(player.interceptions) || 0);
          entry.element.title = `${this.playerTooltip(player)} · Maç: ${Number(player.rating || 6).toFixed(1)} · ` +
            `Gol ${Number(player.k) || 0} · Asist ${Number(player.a) || 0} · Pas ${completed}/${attempted} · ` +
            `xPass farkı ${Number(player.passOverExpected || 0) >= 0 ? '+' : ''}${Number(player.passOverExpected || 0).toFixed(2)} · ` +
            `Aksiyon değeri ${Number(player.actionValue || 0) >= 0 ? '+' : ''}${Number(player.actionValue || 0).toFixed(2)} · ` +
            `Çalım ${dribbles} · Müdahale ${tackles}`;
        });
      });
    }

    updatePlayerRatings(state) {
      [state.t1?.players || [], state.t2?.players || []].forEach((players, teamIndex) => {
        const container = this.get(`player-ratings-${teamIndex + 1}`);
        if (!container) return;
        const sortedPlayers = [...players].sort((a, b) =>
          (Number(b.rating) || 6.5) - (Number(a.rating) || 6.5)
        );
        container.innerHTML = '';
        sortedPlayers.forEach((player, index) => {
          const row = document.createElement('div');
          const rating = clamp(Number(player.rating) || 6.5, 3, 10);
          const passesAttempted = Number(player.passesAttempted) || 0;
          const passesCompleted = Number(player.passesCompleted) || 0;
          const passAccuracy = passesAttempted ? Math.round((passesCompleted / passesAttempted) * 100) : 0;
          const defensiveActions =
            (Number(player.tackles) || 0) +
            (Number(player.interceptions) || 0) +
            (Number(player.clearances) || 0) +
            (Number(player.blocks) || 0);
          const isKeeper = Boolean(player.isGoalkeeper);
          const metrics = isKeeper
            ? [
                `🧤 ${Number(player.saves) || 0} Kurtarış`,
                `🥅 ${Number(player.goalsConceded) || 0} Yenen gol`
              ]
            : [
                `⚽ ${Number(player.k) || 0} Gol`,
                `🅰 ${Number(player.a) || 0} Asist`,
                `🎯 ${Number(player.shotsOnTarget) || 0}/${Number(player.shots) || 0} Şut`,
                `✓ %${passAccuracy} Pas`,
                `xP ${Number(player.passOverExpected || 0) >= 0 ? '+' : ''}${Number(player.passOverExpected || 0).toFixed(2)}`,
                `AV ${Number(player.actionValue || 0) >= 0 ? '+' : ''}${Number(player.actionValue || 0).toFixed(2)}`,
                `◇ ${Number(player.dribblesWon) || 0} Çalım`,
                `🛡 ${defensiveActions} Sav.`
              ];
          row.className = `fm-player-rating-row ${this.ratingClass(rating)}${index === 0 ? ' fm-rating-leader' : ''}`;

          const identity = document.createElement('div');
          identity.className = 'fm-rating-identity';
          const name = document.createElement('strong');
          name.textContent = this.displayName(player);
          const role = document.createElement('span');
          role.textContent = player.isGoalkeeper ? 'Kaleci' : String(player.visualRole || player.role || 'Oyuncu');
          identity.append(name, role);

          const details = document.createElement('div');
          details.className = 'fm-rating-details';
          details.setAttribute('aria-label', metrics.join(', '));
          metrics.forEach(metric => {
            const item = document.createElement('span');
            item.className = 'fm-rating-metric';
            item.textContent = metric;
            details.appendChild(item);
          });

          const badge = document.createElement('strong');
          badge.className = 'fm-live-rating';
          badge.textContent = rating.toFixed(1);

          const breakdown = player.ratingBreakdown || {};
          row.title = `Hücum ${Number(breakdown.attack || 0).toFixed(2)} · ` +
            `Pas ${Number(breakdown.distribution || 0).toFixed(2)} · ` +
            `xPass farkı ${Number(player.passOverExpected || 0).toFixed(2)} · ` +
            `Aksiyon değeri ${Number(player.actionValue || 0).toFixed(2)} · ` +
            `Top kullanımı ${Number(breakdown.possession || 0).toFixed(2)} · ` +
            `Savunma ${Number(breakdown.defense || 0).toFixed(2)} · ` +
            `Disiplin ${Number(breakdown.discipline || 0).toFixed(2)}`;
          row.append(identity, details, badge);
          container.appendChild(row);
        });
      });
    }

    ratingClass(rating) {
      if (rating >= 8.5) return 'fm-rating-excellent';
      if (rating >= 7.5) return 'fm-rating-great';
      if (rating >= 6.5) return 'fm-rating-good';
      if (rating >= 5.5) return 'fm-rating-average';
      return 'fm-rating-poor';
    }

    hashString(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return Math.abs(hash >>> 0);
    }

    movePlayer(entry, x, y, immediate = false) {
      if (!entry) return;
      entry.position = { x: clamp(x, 1, 99), y: clamp(y, 4, 96) };
      entry.velocity = entry.velocity || { x: 0, y: 0 };
      if (immediate) entry.element.classList.add('fm-no-transition');
      this.paintPlayer(entry);
      if (immediate) {
        void entry.element.offsetWidth;
        entry.element.classList.remove('fm-no-transition');
      }
    }

    paintPlayer(entry) {
      entry.element.style.left = `${entry.position.x}%`;
      entry.element.style.top = `${entry.position.y}%`;
      entry.element.dataset.liveAttackRole = entry.liveAttackRole || '';
      entry.element.dataset.liveDefensiveRole = entry.liveDefensiveRole || '';
      const speed = Math.hypot(entry.velocity.x, entry.velocity.y);
      entry.element.dataset.moving = speed > 0.8 ? '1' : '0';
    }

    setBall(x, y, immediate = false) {
      this.ballPosition = { x, y };
      if (immediate) this.ball.classList.add('fm-no-transition');
      this.ball.style.left = `${x}%`;
      this.ball.style.top = `${y}%`;
      if (immediate) {
        void this.ball.offsetWidth;
        this.ball.classList.remove('fm-no-transition');
      }
    }

    drawPass(from, to) {
      this.passLine.setAttribute('x1', from.x);
      this.passLine.setAttribute('y1', from.y);
      this.passLine.setAttribute('x2', to.x);
      this.passLine.setAttribute('y2', to.y);
      this.passLine.classList.remove('fm-pass-line-visible');
      void this.passLine.getBoundingClientRect();
      this.passLine.classList.add('fm-pass-line-visible');
    }

    clearPass() {
      this.passLine.classList.remove('fm-pass-line-visible');
    }

    markPlayer(entry, className, duration) {
      if (!entry) return;
      entry.element.classList.remove(className);
      void entry.element.offsetWidth;
      entry.element.classList.add(className);
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        entry.element.classList.remove(className);
      }, Math.max(150, duration));
      this.timers.add(timer);
    }

    showBanner(text, teamId, style = '') {
      this.banner.textContent = text;
      this.banner.className = `fm-event-banner fm-event-banner-visible fm-event-team-${teamId}${style ? ` fm-event-${style}` : ''}`;
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        this.banner.className = 'fm-event-banner';
      }, Math.max(500, 1300 / this.speed));
      this.timers.add(timer);
    }

    setPhase(label, teamId = 0) {
      const chip = this.get('phase-chip');
      if (!chip) return;
      chip.textContent = label;
      chip.dataset.team = String(teamId);
    }

    phaseLabel(phase) {
      if (phase === 'build-up') return 'GERİDEN OYUN';
      if (phase === 'final-third') return 'HÜCUM';
      if (phase === 'transition') return 'GEÇİŞ HÜCUMU';
      if (phase === 'set-piece') return 'DURAN TOP';
      return 'ORTA SAHA';
    }

    updateEventCopy(text, teamId) {
      const cleanText = String(text).replace(/\|/g, ' — ').replace(/═/g, '').trim();
      this.setText('event-copy', cleanText || 'Oyun devam ediyor...');
      this.setText('event-team', teamId === 1 ? 'Mavi Takım' : teamId === 2 ? 'Kırmızı Takım' : 'Maç Merkezi');
      const teamElement = this.get('event-team');
      if (teamElement) teamElement.dataset.team = String(teamId || 0);
    }

    addHistory(text, teamId) {
      const cleanText = String(text).replace(/\|/g, ' — ').replace(/═/g, '').trim();
      if (!cleanText) return;
      const minute = this.extractMinute(cleanText);
      this.eventHistory.unshift({ text: cleanText, teamId, minute });
      this.eventHistory = this.eventHistory.slice(0, 5);
      const list = this.get('last-events-list');
      if (!list) return;
      list.innerHTML = '';
      this.eventHistory.forEach(item => {
        const row = document.createElement('div');
        row.className = 'fm-history-row';
        row.dataset.team = String(item.teamId || 0);
        const minuteElement = document.createElement('span');
        minuteElement.textContent = item.minute !== null ? `${item.minute}'` : '•';
        const copyElement = document.createElement('span');
        copyElement.textContent = item.text.replace(/^⏱️\s*\d+'\.\s*Dakika:\s*/i, '');
        row.append(minuteElement, copyElement);
        list.appendChild(row);
      });
    }

    extractMinute(text) {
      if (!text) return null;
      const match = String(text).match(/⏱️\s*(\d+)'/);
      return match ? Number(match[1]) : null;
    }

    setText(name, value) {
      const element = this.get(name);
      if (element) element.textContent = String(value);
    }

    setBar(name, width) {
      const element = this.get(name);
      if (element) element.style.width = `${clamp(Number(width) || 0, 0, 100)}%`;
    }

    delay(milliseconds) {
      if (this.stopped) return Promise.resolve();
      return new Promise(resolve => {
        const timer = window.setTimeout(() => {
          this.timers.delete(timer);
          resolve();
        }, Math.max(16, milliseconds));
        this.timers.add(timer);
      });
    }
  }

  window.FootballMatchViewer = {
    render,
    mount(rootId = 'football-manager-viewer') {
      const root = document.getElementById(rootId);
      return root ? new Viewer(root) : null;
    }
  };
})();
