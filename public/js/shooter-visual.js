(() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const behaviorSpeeds = {
    advance: 1,
    walk: 0.92,
    investigate: 0.82,
    hold: 0,
    peek: 0.68,
    engage: 0,
    retreat: -0.72,
    dead: 0
  };
  const behaviorLabels = {
    advance: 'KOŞU',
    walk: 'SESSİZ',
    investigate: 'ARAŞTIR',
    hold: 'AÇI',
    peek: 'PEEK',
    engage: 'TEMAS',
    retreat: 'GERİ',
    dead: ''
  };

  function render(options = {}) {
    const rootId = options.rootId || 'shooter-map-viewer';
    const contextLabel = options.contextLabel || 'BETA LOBİSİ';

    return `
      <section class="sv-viewer" id="${rootId}" aria-label="Counter-Strike Dust II canlı görsel simülasyonu">
        <header class="sv-score-header">
          <div class="sv-team sv-team-blue">
            <span class="sv-team-side" data-sv="side-1">T</span>
            <span class="sv-team-name" data-sv="team-1-name">Mavi Takım</span>
            <strong class="sv-team-score" data-sv="score-1">0</strong>
          </div>
          <div class="sv-round-center">
            <span class="sv-beta-context">${contextLabel}</span>
            <strong data-sv="round-label">RAUNT 1</strong>
            <span class="sv-round-clock" data-sv="round-clock">01:55</span>
          </div>
          <div class="sv-team sv-team-red">
            <strong class="sv-team-score" data-sv="score-2">0</strong>
            <span class="sv-team-name" data-sv="team-2-name">Kırmızı Takım</span>
            <span class="sv-team-side" data-sv="side-2">CT</span>
          </div>
          <div class="sv-live-status" data-sv="live-status"><span></span> CANLI</div>
        </header>

        <div class="sv-economy-strip" data-sv="economy-strip">
          <div class="sv-economy-team blue">
            <b data-sv="buy-1">HAZIRLIK</b>
            <span data-sv="money-1">$4.000</span>
            <small data-sv="equipment-1">EKİPMAN $0</small>
          </div>
          <div class="sv-economy-label">TAKIM EKONOMİSİ</div>
          <div class="sv-economy-team red">
            <small data-sv="equipment-2">EKİPMAN $0</small>
            <span data-sv="money-2">$4.000</span>
            <b data-sv="buy-2">HAZIRLIK</b>
          </div>
        </div>

        <div class="sv-viewer-body">
          <div class="sv-map-column">
            <div class="sv-map" data-sv="map">
              <img class="sv-map-art" src="/assets/shooter/dust2-nav.svg?v=4" alt="" draggable="false">
              <svg class="sv-motion-layer" data-sv="motion-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line data-sv="bullet-line" x1="50" y1="50" x2="50" y2="50"></line>
              </svg>
              <div class="sv-smoke-layer" data-sv="smoke-layer"></div>
              <div class="sv-ground-layer" data-sv="ground-layer"></div>
              <div class="sv-player-layer" data-sv="player-layer"></div>
              <div class="sv-blast-wave" data-sv="blast-wave"></div>
              <div class="sv-bomb" data-sv="bomb" aria-label="C4">
                <strong>C4</strong>
                <span></span><span></span><span></span>
              </div>
              <div class="sv-map-banner" data-sv="map-banner" aria-live="polite"></div>
              <div class="sv-buy-overlay" data-sv="buy-overlay" aria-live="polite"></div>
              <div class="sv-phase" data-sv="phase">HAZIRLIK</div>
              <div class="sv-perception-badge" data-sv="perception-badge"></div>
              <div class="sv-nav-badge">CS2 NAV · 2248 ALAN</div>
            </div>
            <div class="sv-event-strip">
              <span class="sv-event-round" data-sv="event-round">R1</span>
              <span class="sv-event-copy" data-sv="event-copy">Oyuncular Dust II için hazırlanıyor...</span>
              <span class="sv-alive-score">
                <b class="blue" data-sv="alive-1">5</b>
                <small>HAYATTA</small>
                <b class="red" data-sv="alive-2">5</b>
              </span>
            </div>
          </div>

          <aside class="sv-sidebar">
            <div class="sv-sidebar-heading">
              <span>KILL FEED</span>
              <span class="sv-map-name">DUST II</span>
            </div>
            <div class="sv-kill-feed" data-sv="kill-feed">
              <div class="sv-empty">İlk temas bekleniyor...</div>
            </div>
            <div class="sv-roster-section">
              <div class="sv-roster-title blue">
                <span data-sv="roster-1-name">Mavi Takım</span>
                <small data-sv="roster-1-side">T</small>
              </div>
              <div data-sv="roster-1"></div>
            </div>
            <div class="sv-roster-section">
              <div class="sv-roster-title red">
                <span data-sv="roster-2-name">Kırmızı Takım</span>
                <small data-sv="roster-2-side">CT</small>
              </div>
              <div data-sv="roster-2"></div>
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  class Viewer {
    constructor(root) {
      this.root = root;
      this.playerLayer = this.get('player-layer');
      this.groundLayer = this.get('ground-layer');
      this.bulletLine = this.get('bullet-line');
      this.bomb = this.get('bomb');
      this.banner = this.get('map-banner');
      this.phase = this.get('phase');
      this.liveStatus = this.get('live-status');
      this.buyOverlay = this.get('buy-overlay');
      this.players = new Map();
      this.latestStats = new Map();
      this.killHistory = [];
      this.timers = new Set();
      this.pendingWaits = new Map();
      this.bannerTimer = null;
      this.flashTimer = null;
      this.queue = Promise.resolve();
      this.speed = 1;
      this.stopped = false;
      this.motionPlans = new Map();
      this.motionFrame = 0;
      this.motionElapsed = 0;
      this.motionLastAt = 0;
      this.motionDuration = 9800;
      this.regulationDuration = 9800;
      this.bombClock = null;
      this.motionResolve = null;
      this.behaviorTimelines = new Map();
      this.routeTimelines = new Map();
      this.positionTimelines = new Map();
      this.groundItems = new Map();
      this.persistentUtilityEffects = new Map();
    }

    get(name) {
      return this.root.querySelector(`[data-sv="${name}"]`);
    }

    stop() {
      this.stopped = true;
      this.stopMotion();
      this.timers.forEach(timer => window.clearTimeout(timer));
      this.timers.clear();
      this.pendingWaits.forEach(resolve => resolve());
      this.pendingWaits.clear();
      this.bannerTimer = null;
      this.flashTimer = null;
      this.clearTracers();
    }

    setSpeed(speed) {
      this.speed = clamp(Number(speed) || 1, 0.5, 20);
      return this;
    }

    update(data) {
      if (!data || this.stopped) return Promise.resolve();
      this.setSpeed(data.visualSpeed || window.currentSimulationSpeed || this.speed);
      this.updateHeader(data);
      if (data.state) this.captureStats(data.state);
      if (data.text) this.get('event-copy').textContent = data.text;
      if (data.text?.trim().startsWith('🏆')) {
        this.finishMatch();
      }

      const event = data.visualEvent;
      if (!event || event.domain !== 'shooter' || event.branch !== 'cs') {
        this.updateRosters();
        return Promise.resolve();
      }

      this.queue = this.queue
        .then(() => this.stopped ? null : this.playEvent(event))
        .catch(error => console.error('CS görsel simülasyon hatası:', error));
      return this.queue;
    }

    updateHeader(data) {
      if (data.player1Name) {
        this.get('team-1-name').textContent = data.player1Name;
        this.get('roster-1-name').textContent = data.player1Name;
      }
      if (data.player2Name) {
        this.get('team-2-name').textContent = data.player2Name;
        this.get('roster-2-name').textContent = data.player2Name;
      }
      if (data.score1 !== undefined && data.score1 !== null) this.get('score-1').textContent = data.score1;
      if (data.score2 !== undefined && data.score2 !== null) this.get('score-2').textContent = data.score2;
    }

    captureStats(state) {
      for (const team of [state.t1, state.t2]) {
        if (!team?.players) continue;
        team.players.forEach(player => {
          this.latestStats.set(player.name, {
            k: player.k || 0,
            d: player.d || 0,
            a: player.a || 0
          });
        });
      }
      this.updateRosters();
    }

    async playEvent(event) {
      this.get('round-label').textContent = `RAUNT ${event.round}`;
      this.get('event-round').textContent = `R${event.round}`;

      if (event.type === 'round-start') return this.startRound(event);
      if (event.type === 'buy-phase') return this.playBuyPhase(event);
      if (event.type === 'kill') return this.playKill(event);
      if (event.type === 'damage') return this.playDamage(event);
      if (event.type === 'utility-decision') return this.playUtilityDecision(event);
      if (event.type === 'mid-round-call') return this.playMidRoundCall(event);
      if (event.type === 'sound-cue') return this.playSoundCue(event);
      if (event.type === 'utility') return this.playUtility(event);
      if (event.type === 'equipment-drop') return this.playEquipmentDrop(event);
      if (event.type === 'ground-pickup') return this.playGroundPickup(event);
      if (event.type === 'plant') return this.playPlant(event);
      if (event.type === 'bomb-pickup') return this.playBombPickup(event);
      if (event.type === 'tactical-decision') return this.playTacticalDecision(event);
      if (event.type === 'defuse-attempt') return this.playDefuseAttempt(event);
      if (event.type === 'bomb-escape') return this.playBombEscape(event);
      if (event.type === 'explode') return this.playExplosion(event);
      if (event.type === 'defuse') return this.playDefuse(event);
      if (event.type === 'round-end') return this.finishRound(event);
      if (event.type === 'economy-summary') return this.playEconomySummary(event);
      return Promise.resolve();
    }

    updateEconomy(teams) {
      if (!teams) return;
      [1, 2].forEach(teamId => {
        const team = teams[teamId];
        if (!team) return;
        const buy = this.get(`buy-${teamId}`);
        const money = this.get(`money-${teamId}`);
        const equipment = this.get(`equipment-${teamId}`);
        if (buy) buy.textContent = String(team.buyType || 'hazırlık').toUpperCase();
        if (money) money.textContent = `$${Number(team.teamMoney || 0).toLocaleString('tr-TR')}`;
        if (equipment) {
          equipment.textContent = `EKİPMAN $${Number(team.teamEquipmentValue || 0).toLocaleString('tr-TR')}`;
        }
      });
    }

    economyReasonLabel(code) {
      const labels = {
        PISTOL_ROUND: 'TABANCA RAUNDU',
        CT_KIT_PRIORITY: 'KİT ÖNCELİĞİ',
        T_ENTRY_KEVLAR: 'ENTRY KEVLAR',
        SAVED_CORE: 'SİLAHLAR KORUNDU',
        FULL_UTILITY: 'TAM UTILITY',
        HERO_WEAPON: 'HERO SİLAH',
        PLAY_AROUND_SAVED_GUN: 'KORUNAN SİLAH ETRAFI',
        FULL_BUY_READY: 'FULL BUY HAZIR',
        T_RIFLE_CORE: 'TÜFEK ÇEKİRDEĞİ',
        MATCH_POINT_FORCE: 'MAÇ PUANI FORCE',
        NO_FUTURE_ROUND_FORCE: 'SONRAKİ RAUNT YOK · FORCE',
        FORCE_WITH_LOSS_BONUS: 'KAYIP BONUSU FORCE',
        SAVE_FOR_AWP: 'AWP İÇİN BİRİKTİR',
        HALF_BUY_NEXT_FULL: 'SONRAKİ RAUNDA FULL',
        ECO_REBUILD: 'EKONOMİYİ TOPARLA',
        ANTI_ECO_SMG: 'ANTI-ECO SMG'
      };
      return labels[code] || String(code || '').replaceAll('_', ' ');
    }

    economyRoleLabel(role) {
      const labels = {
        awp: 'AWP',
        entry: 'ENTRY',
        support: 'DESTEK',
        lurk: 'LURK',
        anchor: 'ANCHOR'
      };
      return labels[role] || 'OYUNCU';
    }

    roleTaskLabel(task) {
      const labels = {
        'long-angle': 'UZUN AÇI',
        'open-site': 'SİTE GİRİŞİ',
        'flash-and-trade': 'FLASH + TRADE',
        'cut-rotation': 'ROTASYON KES',
        'bomb-support': 'C4 DESTEK',
        'wait-for-trade': 'TRADE BEKLE',
        'close-trade-gap': 'MESAFEYİ KAPAT',
        'trade-entry': 'ENTRY TRADE',
        'reposition-after-shot': 'ATIŞ SONRASI KAÇ',
        'site-anchor': 'SİTE ANCHOR',
        'first-rotator': 'İLK ROTASYON',
        'utility-support': 'UTILITY DESTEK',
        'information-rotator': 'BİLGİ ROTASYONU',
        'rotation-cut': 'ROTASYON KES',
        'bomb-anchor': 'BOMBA ANCHOR',
        'trade-cover': 'TRADE KORU',
        'site-contact': 'SİTE TEMASI',
        'save-awp': 'AWP KORU',
        'save-exit': 'SİLAHI KORU',
        'hold-safe-exit': 'GÜVENLİ ÇIKIŞ',
        eliminated: 'ELENDİ'
      };
      if (labels[task]) return labels[task];
      if (String(task || '').startsWith('postplant-')) {
        return `POST · ${String(task).slice(10).replaceAll('-', ' ').toUpperCase()}`;
      }
      if (String(task || '').startsWith('retake-')) {
        return `RETAKE · ${String(task).slice(7).replaceAll('-', ' ').toUpperCase()}`;
      }
      return String(task || 'takım düzeni').replaceAll('-', ' ').toUpperCase();
    }

    utilitySummary(utility = []) {
      const labels = {
        smoke: 'S',
        flash: 'F',
        he: 'HE',
        molotov: 'M',
        incendiary: 'I'
      };
      return utility.length
        ? utility.map(item => labels[item] || item.slice(0, 2).toUpperCase()).join('·')
        : '—';
    }

    economyTeamCard(team) {
      const rows = (team?.players || []).map(player => `
        <div class="sv-buy-player" data-buy-player="${player.id}">
          <span class="sv-buy-player-name">
            <em>${this.economyRoleLabel(player.rolePreference)}</em>
            ${player.savedFromPreviousRound ? '💾 ' : ''}${player.name}
          </span>
          <b>${player.weapon}</b>
          <i>${player.helmet ? '🪖' : (player.armor > 0 ? '🛡' : '')}${player.hasDefuseKit ? ' 🧰' : ''}</i>
          <u>${this.utilitySummary(player.utility)}</u>
          <small>$${Number(player.money || 0).toLocaleString('tr-TR')}</small>
        </div>
      `).join('');
      const reasons = (team?.reasonCodes || [])
        .slice(0, 3)
        .map(code => `<span>${this.economyReasonLabel(code)}</span>`)
        .join('');
      const drops = (team?.drops || []).map(drop => `
        <div class="sv-buy-drop">↪ ${drop.fromPlayerName} → ${drop.toPlayerName}: <b>${drop.item}</b></div>
      `).join('');
      return `
        <div class="sv-buy-team team-${team?.teamId || 0}">
          <div class="sv-buy-team-head">
            <strong>${String(team?.buyType || 'hazırlık').toUpperCase()}</strong>
            <span>$${Number(team?.teamSpend || 0).toLocaleString('tr-TR')} HARCANDI</span>
          </div>
          <div class="sv-buy-context">
            <div>${reasons}</div>
            <small>RAKİP TAHMİNİ: ${String(team?.expectedOpponentBuy || '—').toUpperCase()}</small>
          </div>
          ${rows}
          ${drops}
        </div>
      `;
    }

    async playBuyPhase(event) {
      this.syncWorldSnapshot(event.players || []);
      this.updateEconomy(event.economy?.teams);
      this.phase.textContent = 'SATIN ALMA';
      const dropCount = (event.economy?.drops || []).length;
      this.get('event-copy').textContent = dropCount
        ? `Takımlar alışverişi koordine ediyor; ${dropCount} silah takım arkadaşına drop edildi.`
        : 'Takımlar ekonomi planına göre silah, zırh, kit ve utility alıyor.';
      if (this.buyOverlay) {
        this.buyOverlay.innerHTML = `
          <div class="sv-buy-title">
            <span>SATIN ALMA FAZI</span>
            <small data-buy-ticker>Takım kararları hazırlanıyor...</small>
          </div>
          <div class="sv-buy-grid">
            ${this.economyTeamCard(event.economy?.teams?.[1])}
            ${this.economyTeamCard(event.economy?.teams?.[2])}
          </div>
        `;
        this.buyOverlay.classList.add('show');
      }
      const timeline = (event.economy?.purchaseTimeline || event.economy?.purchases || [])
        .slice(0, 10);
      for (const purchase of timeline) {
        const row = this.buyOverlay?.querySelector(`[data-buy-player="${purchase.playerId}"]`);
        const ticker = this.buyOverlay?.querySelector('[data-buy-ticker]');
        this.buyOverlay?.querySelectorAll('.is-buying').forEach(node => node.classList.remove('is-buying'));
        row?.classList.add('is-buying');
        if (ticker) {
          ticker.textContent = purchase.isDrop
            ? `${purchase.playerName}, ${purchase.recipientName} için ${purchase.item} drop aldı`
            : `${purchase.playerName}: ${purchase.item} · -$${Number(purchase.price || 0).toLocaleString('tr-TR')}`;
        }
        await this.wait(35);
      }
      await this.wait(420);
      this.buyOverlay?.classList.remove('show');
    }

    async playEconomySummary(event) {
      const teams = event.summary?.teams;
      this.updateEconomy(teams);
      [1, 2].forEach(teamId => {
        (teams?.[teamId]?.players || []).forEach(player => {
          const current = this.players.get(player.id);
          if (!current) return;
          current.money = player.money;
          current.equipmentValue = player.equipmentValue;
          current.savedFromPreviousRound = player.savedFromPreviousRound;
          current.weapon = player.weapon;
          current.ammo = player.ammo;
          current.reserveAmmo = player.reserveAmmo;
          current.armor = player.armor;
          current.helmet = player.helmet;
          current.hasDefuseKit = player.hasDefuseKit;
          current.utility = player.utility || [];
        });
      });
      this.updateRosters();
      this.phase.textContent = 'EKONOMİ GÜNCELLENDİ';
      const ctShared = Number(event.summary?.awards?.ctSharedKillReward || 0);
      const ground = event.summary?.groundInventory;
      const recovered = Object.values(ground?.teams || {})
        .reduce((sum, team) => sum + Number(team.recoveredValue || 0), 0);
      const lost = Object.values(ground?.teams || {})
        .reduce((sum, team) => sum + Number(team.lostValue || 0), 0);
      this.get('event-copy').textContent = recovered || lost
        ? `Yerden alınan $${recovered.toLocaleString('tr-TR')} ekipman korundu; $${lost.toLocaleString('tr-TR')} ekipman kaybedildi.`
        : ctShared > 0
          ? `Raunt gelirleri hesaplandı; CT takımına T eliminasyonlarından oyuncu başı $${ctShared} paylaştırıldı.`
          : 'Raunt ödülleri, kill gelirleri ve kayıp bonusları hesaplandı.';
      this.showBanner('RAUNT GELİRLERİ HESAPLANDI', event.summary?.winnerTeamId, 900);
    }

    async startRound(event) {
      this.stopMotion();
      const hasExistingRound = this.motionPlans.size > 0;
      if (hasExistingRound) {
        this.phase.textContent = 'YENİ RAUNT';
        this.root.classList.add('sv-round-resetting');
        await this.wait(160);
      }
      this.root.classList.remove('sv-round-blue', 'sv-round-red', 'sv-map-explosion');
      this.clearSmokes();
      this.clearGroundItems();
      this.clearTracers();
      this.bomb.className = 'sv-bomb';
      this.bomb.style.display = 'none';
      this.banner.className = 'sv-map-banner';
      this.banner.textContent = '';
      this.get('perception-badge').className = 'sv-perception-badge';
      this.get('perception-badge').textContent = '';
      this.killHistory = [];
      this.renderKillFeed();
      this.ensurePlayers(event.players || []);
      this.setSides(event.attackerTeamId);
      this.phase.textContent = event.isPistol ? 'TABANCA RAUNDU' : 'RAUNT BAŞLANGICI';
      this.get('event-copy').textContent = this.planCopy(event.attackPlan);
      this.motionPlans = new Map((event.motionPlans || []).map(plan => [plan.id, plan.points || []]));
      this.behaviorTimelines = new Map();
      (event.behaviorTimeline || []).forEach(record => {
        if (!this.behaviorTimelines.has(record.id)) this.behaviorTimelines.set(record.id, []);
        this.behaviorTimelines.get(record.id).push(record);
      });
      this.routeTimelines = new Map(
        (event.routeTimelines || []).map(timeline => [timeline.id, timeline.samples || []])
      );
      this.positionTimelines = new Map(
        (event.positionTimelines || []).map(timeline => [timeline.id, timeline.samples || []])
      );
      this.motionDuration = Number(event.roundDurationMs) || 9800;
      this.regulationDuration = Number(event.regulationDurationMs) || 9800;
      this.bombClock = null;
      this.motionElapsed = 0;
      this.updateAlive();
      this.renderMotionFrame(0);
      if (hasExistingRound) {
        await this.wait(80);
        this.root.classList.remove('sv-round-resetting');
        await this.wait(100);
      }
      await this.wait(100);
      this.phase.textContent = 'HARİTA KONTROLÜ';
    }

    stopMotion() {
      if (this.motionFrame) window.cancelAnimationFrame(this.motionFrame);
      this.motionFrame = 0;
      if (this.motionResolve) {
        const resolve = this.motionResolve;
        this.motionResolve = null;
        resolve();
      }
    }

    renderMotionFrame(elapsed) {
      for (const [id, points] of this.motionPlans) {
        const entry = this.players.get(id);
        if (!entry?.alive || !points.length) continue;
        const behavior = this.behaviorAt(id, elapsed);
        const position = this.positionAt(id, elapsed)
          || this.interpolateMotion(
            points,
            this.routeElapsedAt(id, points, behavior, elapsed)
          );
        this.placePlayer(entry, position.x, position.y, position.nextX, position.nextY);
        this.applyBehavior(entry, behavior?.state || 'advance', behavior?.source || 'route');
        if (Number.isFinite(behavior?.targetX) && Number.isFinite(behavior?.targetY)) {
          this.face(entry, behavior.targetX, behavior.targetY);
        } else if (
          entry.side === 'CT'
          && ['hold', 'peek'].includes(behavior?.state)
        ) {
          this.face(
            entry,
            entry.x - (position.nextX - entry.x),
            entry.y - (position.nextY - entry.y)
          );
        }
      }
      this.syncPersistentUtilities(elapsed);
    }

    behaviorAt(id, elapsed) {
      const timeline = this.behaviorTimelines.get(id) || [];
      if (!timeline.length) return null;
      let low = 0;
      let high = timeline.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if ((timeline[middle].atMs || 0) <= elapsed) low = middle;
        else high = middle - 1;
      }
      if (timeline[low]?.state === 'dead' && low > 0) return timeline[low - 1];
      return timeline[low];
    }

    routeElapsedAt(id, points, behavior, worldElapsed) {
      const samples = this.routeTimelines.get(id) || [];
      if (samples.length) {
        if (worldElapsed <= samples[0][0]) return samples[0][1];
        const lastSample = samples[samples.length - 1];
        if (worldElapsed >= lastSample[0]) return lastSample[1];

        let low = 0;
        let high = samples.length - 1;
        while (low + 1 < high) {
          const middle = Math.floor((low + high) / 2);
          if (samples[middle][0] <= worldElapsed) low = middle;
          else high = middle;
        }
        const from = samples[low];
        const to = samples[high];
        const progress = clamp(
          (worldElapsed - from[0]) / Math.max(1, to[0] - from[0]),
          0,
          1
        );
        return from[1] + (to[1] - from[1]) * progress;
      }
      if (!behavior) return worldElapsed;
      const speed = behaviorSpeeds[behavior.state] ?? behaviorSpeeds.walk;
      const elapsedSinceState = Math.max(0, worldElapsed - (behavior.atMs || 0));
      const routeElapsed = (behavior.routeElapsedMs || 0) + elapsedSinceState * speed;
      return clamp(routeElapsed, 0, points[points.length - 1]?.t || this.motionDuration);
    }

    positionAt(id, worldElapsed) {
      const samples = this.positionTimelines.get(id) || [];
      if (!samples.length) return null;
      if (worldElapsed <= samples[0][0]) {
        const next = samples[1] || samples[0];
        return { x: samples[0][1], y: samples[0][2], nextX: next[1], nextY: next[2] };
      }
      const last = samples[samples.length - 1];
      if (worldElapsed >= last[0]) {
        return { x: last[1], y: last[2], nextX: last[1], nextY: last[2] };
      }
      let low = 0;
      let high = samples.length - 1;
      while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (samples[middle][0] <= worldElapsed) low = middle;
        else high = middle;
      }
      const from = samples[low];
      const to = samples[high];
      const progress = clamp(
        (worldElapsed - from[0]) / Math.max(1, to[0] - from[0]),
        0,
        1
      );
      return {
        x: from[1] + (to[1] - from[1]) * progress,
        y: from[2] + (to[2] - from[2]) * progress,
        nextX: to[1],
        nextY: to[2]
      };
    }

    interpolateMotion(points, elapsed) {
      if (elapsed <= points[0].t) {
        const next = points[1] || points[0];
        return { x: points[0].x, y: points[0].y, nextX: next.x, nextY: next.y };
      }
      const last = points[points.length - 1];
      if (elapsed >= last.t) return { x: last.x, y: last.y, nextX: last.x, nextY: last.y };

      let low = 0;
      let high = points.length - 1;
      while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (points[middle].t <= elapsed) low = middle;
        else high = middle;
      }
      const from = points[low];
      const to = points[high];
      const progress = clamp((elapsed - from.t) / Math.max(1, to.t - from.t), 0, 1);
      return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
        nextX: to.x,
        nextY: to.y
      };
    }

    placePlayer(entry, x, y, facingX = x, facingY = y) {
      const previousX = entry.x;
      const previousY = entry.y;
      entry.x = clamp(Number(x), 0, 100);
      entry.y = clamp(Number(y), 0, 100);
      entry.el.style.left = `${entry.x}%`;
      entry.el.style.top = `${entry.y}%`;
      const dx = facingX - previousX;
      const dy = facingY - previousY;
      if (Math.hypot(dx, dy) > 0.015) {
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        entry.el.style.setProperty('--sv-facing-angle', `${angle + 90}deg`);
      }
    }

    clearSmokes() {
      this.persistentUtilityEffects.clear();
      this.get('smoke-layer').innerHTML = '';
      this.root.classList.remove('sv-flash-pop');
    }

    clearGroundItems() {
      this.groundItems.clear();
      if (this.groundLayer) this.groundLayer.innerHTML = '';
    }

    groundItemIcon(item) {
      if (item.itemType === 'defuse-kit') return '🧰';
      if (item.itemType === 'utility') return '◆';
      return item.weapon === 'AWP' ? '⌖' : '⌁';
    }

    renderGroundItem(item) {
      if (!item?.id || !this.groundLayer) return;
      let marker = this.groundItems.get(item.id);
      if (!marker) {
        marker = document.createElement('span');
        marker.className = `sv-ground-item is-${item.itemType || 'equipment'}`;
        marker.dataset.groundItemId = item.id;
        marker.innerHTML = `<b></b><small></small>`;
        this.groundLayer.appendChild(marker);
        this.groundItems.set(item.id, marker);
      }
      marker.style.left = `${item.x}%`;
      marker.style.top = `${item.y}%`;
      marker.querySelector('b').textContent = this.groundItemIcon(item);
      marker.querySelector('small').textContent = item.label || item.weapon || 'Ekipman';
      marker.classList.remove('is-picked');
    }

    removeGroundItem(itemId) {
      const marker = this.groundItems.get(itemId);
      if (!marker) return;
      marker.classList.add('is-picked');
      const timer = window.setTimeout(() => {
        marker.remove();
        this.groundItems.delete(itemId);
        this.timers.delete(timer);
      }, this.duration(320));
      this.timers.add(timer);
    }

    async playEquipmentDrop(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      (event.items || []).forEach(item => this.renderGroundItem(item));
      this.syncWorldSnapshot(event.players || []);
      const labels = (event.items || []).map(item => item.label).join(', ');
      this.phase.textContent = 'YERDE EKİPMAN';
      this.get('event-copy').textContent =
        `${event.actor?.name || 'Oyuncu'} elendi; ${labels || 'ekipmanı'} ölüm noktasında kaldı.`;
    }

    async playGroundPickup(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.removeGroundItem(event.item?.id);
      if (event.swapped) this.renderGroundItem(event.swapped);
      this.syncWorldSnapshot(event.players || []);
      this.phase.textContent = 'GÜVENLİ PICKUP';
      this.get('event-copy').textContent =
        `${event.actor?.name || 'Oyuncu'} ${event.item?.label || 'ekipmanı'} aldı`
        + `${event.carriedForTeammate ? '; takım arkadaşı için raund sonuna taşıyor.' : '.'}`;
      this.updateRosters();
    }

    finishPersistentUtility(id, effect) {
      if (!effect?.isConnected || effect.classList.contains('is-ending')) return;
      effect.classList.add('is-ending');
      const timer = window.setTimeout(() => {
        effect.remove();
        this.persistentUtilityEffects.delete(id);
        this.timers.delete(timer);
      }, this.duration(360));
      this.timers.add(timer);
    }

    syncPersistentUtilities(elapsed = this.motionElapsed) {
      for (const [id, record] of this.persistentUtilityEffects) {
        if (elapsed < record.activeUntilMotionMs) continue;
        this.finishPersistentUtility(id, record.effect);
      }
    }

    renderUtility(utility, durationMs = 2400, startMotionMs = this.motionElapsed) {
      const layer = this.get('smoke-layer');
      utility.forEach(item => {
        const effect = document.createElement('span');
        const type = item.type === 'incendiary' ? 'molotov' : item.type;
        effect.className = `sv-utility-effect sv-${type}`;
        effect.dataset.utilityId = item.id || '';
        const size = clamp(Number(item.radius) || 4.7, 3.5, 14) * 2;
        effect.style.left = `${item.x}%`;
        effect.style.top = `${item.y}%`;
        effect.style.width = `${size}%`;
        effect.style.aspectRatio = '1';
        layer.appendChild(effect);
        const persistent = type === 'smoke' || type === 'molotov';
        if (persistent) {
          const activeUntilMotionMs = Number.isFinite(Number(item.activeUntilTick))
            ? Number(item.activeUntilTick) * 50
            : Number(startMotionMs) + Number(durationMs);
          this.persistentUtilityEffects.set(item.id, {
            effect,
            activeUntilMotionMs
          });
          this.syncPersistentUtilities(startMotionMs);
          return;
        }
        const timer = window.setTimeout(() => {
          effect.classList.add('is-ending');
          window.setTimeout(() => effect.remove(), this.duration(360));
          this.timers.delete(timer);
        }, this.duration(680));
        this.timers.add(timer);
      });
    }

    async playUtilityDecision(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      const labels = {
        smoke: 'SMOKE HAZIR',
        flash: 'FLASH HAZIR',
        he: 'HE HAZIR',
        molotov: 'MOLOTOF HAZIR',
        incendiary: 'YANICI HAZIR'
      };
      const metrics = event.decision?.metrics || {};
      const confidence = Math.round((event.decision?.confidence || 0) * 100);
      const info = metrics.knownEnemiesNearTarget > 0
        ? `${metrics.knownEnemiesNearTarget} rakip bilgisi`
        : `${metrics.alliesNearTarget || 0} yakın + ${metrics.alliesApproaching || 0} yaklaşan takım arkadaşı`;
      const combo = event.decision?.combo === 'smoke-flash'
        ? ' · SMOKE-FLASH ZİNCİRİ'
        : '';
      this.phase.textContent = labels[event.utility?.type] || 'UTILITY KARARI';
      this.get('event-copy').textContent =
        `${event.actor?.name || 'Oyuncu'}: ${event.decision?.reason || 'takım çağrısı'} · `
        + `${info} · %${confidence} güven${combo}`;
      this.showBanner(`${labels[event.utility?.type] || 'UTILITY'} · %${confidence}`, event.teamId, 720);
      this.updateRosters();
    }

    async playMidRoundCall(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      const call = event.call || 'recommit';
      const labels = {
        rotate: 'ROTATE',
        regroup: 'YENİDEN GRUPLAN',
        recommit: 'PLANA YÜKLEN'
      };
      const reasons = {
        'stack-read': 'hedefte yoğun savunma bilgisi',
        'space-read': 'diğer bomba bölgesindeki boşluk',
        'recover-bomb': 'düşen C4’ü güvenli alma',
        'entry-lost': 'entry kaybı',
        'trade-gap': 'entry–trade mesafesi',
        'clock-pressure': 'süre baskısı'
      };
      const assignmentCopy = (event.assignments || [])
        .filter(item => item.alive !== false)
        .slice(0, 5)
        .map(item => `${this.economyRoleLabel(item.roundRole)}: ${this.roleTaskLabel(item.roundTask)}`)
        .join(' · ');
      this.phase.textContent = `ORTA RAUNT · ${labels[call]}`;
      this.get('event-copy').textContent = call === 'rotate'
        ? `${event.fromPlan || 'İlk plan'} → ${event.targetPlan || 'yeni hedef'}; neden: ${reasons[event.reason] || event.reason || 'takım bilgisi'}. ${assignmentCopy}`
        : `${labels[call]} çağrısı; neden: ${reasons[event.reason] || event.reason || 'takım düzeni'}. ${assignmentCopy}`;
      this.showBanner(`IGL · ${labels[call]}`, event.teamId, 980);
      this.updateRosters();
    }

    async playSoundCue(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      const sound = event.sound || {};
      const labels = {
        run: 'KOŞU SESİ',
        walk: 'SESSİZ ADIM',
        gunfire: 'SİLAH SESİ',
        reload: 'ŞARJÖR SESİ',
        utility: 'UTILITY SESİ',
        'bomb-drop': 'C4 DÜŞTÜ',
        'bomb-pickup': 'C4 ALINDI',
        plant: event.fake ? 'FAKE PLANT' : 'PLANT SESİ',
        defuse: event.fake ? 'FAKE DEFUSE' : 'DEFUSE SESİ'
      };
      const label = labels[sound.type] || 'SES BİLGİSİ';
      if (event.position) {
        const pulse = document.createElement('span');
        pulse.className = `sv-sound-pulse${event.fake ? ' is-fake' : ''}`;
        pulse.style.left = `${event.position.x}%`;
        pulse.style.top = `${event.position.y}%`;
        const size = clamp(Number(sound.radius) || 12, 6, 32) * 2;
        pulse.style.width = `${size}%`;
        pulse.style.aspectRatio = '1';
        this.get('smoke-layer').appendChild(pulse);
        const timer = window.setTimeout(() => {
          pulse.remove();
          this.timers.delete(timer);
        }, this.duration(920));
        this.timers.add(timer);
      }
      const hearers = Number(event.directHearers || 0);
      const occluded = (event.heardBy || []).filter(listener => listener.occluded).length;
      this.phase.textContent = label;
      this.get('event-copy').textContent = event.fake
        ? `${event.actor?.name || 'Oyuncu'} yanıltıcı ses üretti; ${hearers} rakip yaklaşık konuma yöneldi.`
        : `${event.actor?.name || 'Oyuncu'}: ${label.toLocaleLowerCase('tr-TR')} · ${hearers} rakip duydu${occluded ? `, ${occluded} kişi duvar arkasından` : ''}.`;
      this.showBanner(`${label} · ${hearers} DUYAN`, event.teamId, 760);
    }

    async playUtility(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      const affected = event.affected || [];
      for (const result of affected) {
        const entry = this.players.get(result.player?.id);
        if (!entry || !Number.isFinite(result.healthBefore)) continue;
        this.updatePlayerVitals(entry, {
          health: result.healthBefore,
          armor: result.armorBefore
        });
      }
      const activeTicks = Math.max(
        12,
        Number(event.utility?.activeUntilTick || event.tick || 0) - Number(event.tick || 0)
      );
      this.renderUtility([event.utility], activeTicks * 50, event.motionTimeMs);
      const labels = {
        smoke: 'SİS PERDESİ',
        flash: 'FLASH',
        he: 'HE PATLAMASI',
        molotov: 'MOLOTOF ALANI',
        incendiary: 'YANICI ALAN'
      };
      const type = event.utility?.type || 'utility';
      const actorName = event.actor?.name || 'Oyuncu';
      this.phase.textContent = labels[type] || 'UTILITY';
      if (type === 'flash') {
        this.root.classList.remove('sv-flash-pop');
        void this.root.offsetWidth;
        this.root.classList.add('sv-flash-pop');
      }
      for (const result of affected) {
        const entry = this.players.get(result.player?.id);
        if (!entry) continue;
        if (result.damage > 0) this.showDamage(entry, result.damage, false);
        this.updatePlayerVitals(entry, {
          health: result.healthAfter,
          armor: result.armorAfter
        });
        if (result.killed) {
          entry.alive = false;
          entry.el.classList.add('is-dead');
          this.applyBehavior(entry, 'dead', `utility-${type}`);
        }
      }
      this.syncWorldSnapshot(event.players || []);
      const summary = type === 'flash'
        ? `${affected.length} oyuncu kör oldu; körlük süresince görüş teması ve ateş yetkisi kesildi.`
        : type === 'he'
          ? `${affected.length} oyuncu patlama alanında hasar aldı.`
          : ['molotov', 'incendiary'].includes(type)
            ? `${affected.length} oyuncu yanan alanı terk etmek için geri çekiliyor.`
            : 'Geçiş hattı sisle kapandı; görüş çizgisi kesildi.';
      this.get('event-copy').textContent = `${actorName}: ${summary}`;
      this.showBanner(labels[type] || 'UTILITY', event.teamId, 780);
      this.updateAlive();
      this.updateRosters();
      if (type === 'flash') {
        if (this.flashTimer) {
          window.clearTimeout(this.flashTimer);
          this.timers.delete(this.flashTimer);
        }
        const timer = window.setTimeout(() => {
          this.root.classList.remove('sv-flash-pop');
          this.timers.delete(timer);
          if (this.flashTimer === timer) this.flashTimer = null;
        }, this.duration(640));
        this.flashTimer = timer;
        this.timers.add(timer);
      }
      if (affected.some(result => result.killed)) await this.wait(260);
    }

    planCopy(plan) {
      const copy = {
        long: 'T ekibi Long A kontrolü için gerçek rota üzerinde dağılıyor.',
        short: 'T ekibi Mid üzerinden Short baskısı kuruyor.',
        b: 'T ekibi Upper Tunnels üzerinden B bölgesine ilerliyor.',
        midB: 'T ekibi Mid ve B Doors hattında split arıyor.'
      };
      return copy[plan] || 'İki takım Dust II üzerinde pozisyon alıyor.';
    }

    ensurePlayers(list) {
      const incoming = new Set(list.map(player => player.id));
      for (const [id, entry] of this.players) {
        if (!incoming.has(id)) {
          entry.el.remove();
          this.players.delete(id);
        }
      }

      list.forEach(player => {
        let entry = this.players.get(player.id);
        if (!entry) {
          const el = document.createElement('div');
          el.className = `sv-player ${player.teamId === 1 ? 'sv-blue-player' : 'sv-red-player'}`;
          el.dataset.playerId = player.id;
          const facing = document.createElement('span');
          facing.className = 'sv-facing';
          const avatar = document.createElement('span');
          avatar.className = 'sv-avatar';
          avatar.textContent = player.emoji || '●';
          const label = document.createElement('span');
          label.className = 'sv-player-label';
          label.textContent = player.name;
          const behavior = document.createElement('span');
          behavior.className = 'sv-player-behavior';
          const weapon = document.createElement('span');
          weapon.className = 'sv-player-weapon';
          const vitals = document.createElement('span');
          vitals.className = 'sv-player-vitals';
          const hpBar = document.createElement('i');
          hpBar.className = 'sv-player-hp';
          const armorBar = document.createElement('i');
          armorBar.className = 'sv-player-armor';
          vitals.append(hpBar, armorBar);
          el.append(facing, avatar, label, behavior, weapon, vitals);
          this.playerLayer.appendChild(el);
          entry = {
            ...player,
            el,
            behaviorEl: behavior,
            weaponEl: weapon,
            hpBar,
            armorBar,
            x: player.x,
            y: player.y
          };
          this.players.set(player.id, entry);
        }

        entry.name = player.name;
        entry.teamId = player.teamId;
        entry.side = player.side;
        entry.alive = player.alive !== false;
        entry.x = player.x;
        entry.y = player.y;
        entry.el.style.left = `${player.x}%`;
        entry.el.style.top = `${player.y}%`;
        entry.el.classList.toggle('is-dead', !entry.alive);
        entry.el.classList.toggle('sv-blue-player', player.teamId === 1);
        entry.el.classList.toggle('sv-red-player', player.teamId === 2);
        const label = entry.el.querySelector('.sv-player-label');
        const avatar = entry.el.querySelector('.sv-avatar');
        if (label) label.textContent = player.name;
        if (avatar) avatar.textContent = player.emoji || '●';
        this.updatePlayerVitals(entry, player);
        this.applyBehavior(entry, player.behavior || 'advance', player.behaviorSource || 'route');
      });
      this.updateRosters();
    }

    setSides(attackerTeamId) {
      const side1 = attackerTeamId === 1 ? 'T' : 'CT';
      const side2 = attackerTeamId === 2 ? 'T' : 'CT';
      this.get('side-1').textContent = side1;
      this.get('side-2').textContent = side2;
      this.get('roster-1-side').textContent = side1;
      this.get('roster-2-side').textContent = side2;
    }

    async playKill(event) {
      return this.playCombat(event, true);
    }

    async playDamage(event) {
      return this.playCombat(event, false);
    }

    async playCombat(event, lethal) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      const combat = event.combat || null;
      this.phase.textContent = event.crossfire
        ? `ÇAPRAZ ATEŞ · ${combat?.hits || 0}/${combat?.shots || 0}`
        : combat
          ? `${combat.weapon} · ${combat.hits}/${combat.shots} İSABET`
        : (event.perception?.los ? 'GÖRÜŞ TEMASI' : 'ÇATIŞMA');
      const actor = this.players.get(event.actor?.id);
      const target = this.players.get(event.target?.id);
      if (!actor || !target) return;
      if (combat) {
        target.alive = true;
        target.el.classList.remove('is-dead');
        this.updatePlayerVitals(target, {
          health: combat.hpBefore,
          armor: combat.armorBefore,
          weapon: target.weapon,
          ammo: target.ammo
        });
        this.updatePlayerVitals(actor, {
          health: actor.health,
          armor: actor.armor,
          weapon: event.weapon,
          ammo: combat.magazineAfter
        });
      }

      if (event.perception?.los) {
        this.showPerception(event.perception);
      }
      this.face(actor, target.x, target.y);
      this.face(target, actor.x, actor.y);
      const bursts = combat?.bursts?.length
        ? (combat.bursts.length <= 5
          ? combat.bursts
          : [...combat.bursts.slice(0, 4), combat.bursts[combat.bursts.length - 1]])
        : [{ shots: 1, hits: 1, damage: 100, hpAfter: 0, armorAfter: 0 }];
      for (const burst of bursts) {
        actor.el.classList.add('is-firing');
        this.showTracer(actor, target);
        await this.wait(170);
        actor.el.classList.remove('is-firing');
        if (burst.hits > 0) {
          this.updatePlayerVitals(target, {
            health: burst.hpAfter,
            armor: burst.armorAfter,
            weapon: target.weapon,
            ammo: target.ammo
          });
          this.showDamage(target, burst.damage, burst.headshots > 0);
        }
        await this.wait(70);
      }
      if (lethal) {
        target.alive = false;
        this.applyBehavior(target, 'dead', 'eliminated');
        target.el.classList.add('is-dead');
        this.addKill(event);
        this.get('event-copy').textContent = event.headshot
          ? `${actor.name}, ${target.name} oyuncusunu ${event.weapon || actor.weapon} ile kafa vuruşuyla öldürdü.`
          : `${actor.name}, ${target.name} oyuncusunu ${event.weapon || actor.weapon} ile öldürdü.`;
        if (!event.headshot && !event.crossfire) {
          this.showBanner(`${actor.name} → ${target.name}`, event.teamId, 560);
        }
        (event.groundDrops || []).forEach(item => this.renderGroundItem(item));
      } else {
        target.alive = true;
        target.el.classList.remove('is-dead');
        const hp = combat?.hpAfter ?? target.health;
        this.get('event-copy').textContent = combat?.damage > 0
          ? `${actor.name}, ${target.name} oyuncusuna ${combat.damage} hasar verdi; ${hp} HP kaldı.${hp <= 38 ? ' Oyuncu çatışmadan geri çekiliyor.' : ''}`
          : `${actor.name} ateş açtı ancak ${target.name} hasar almadı.`;
      }
      this.updateAlive();
      this.updateRosters();
      if (event.headshot) this.showBanner(lethal ? 'HEADSHOT' : 'KAFA İSABETİ', event.teamId, 720);
      if (event.crossfire && !event.headshot) this.showBanner('ÇAPRAZ ATEŞ', event.teamId, 560);
      await this.wait(event.headshot ? 430 : lethal ? 260 : 180);
    }

    async advanceMotionTo(targetElapsed) {
      const target = clamp(Number(targetElapsed) || 0, this.motionElapsed, this.motionDuration);
      if (target <= this.motionElapsed + 20) return;
      this.stopMotion();
      const start = this.motionElapsed;
      const delta = target - start;
      // 1x, dünya saatini gerçek zaman oranında oynatır. Uzun rotaları
      // yapay bir üst sınıra sıkıştırmak oyuncuları haritada sıçratıyor ve
      // görseli anlatıma yetişmeye zorlanıyormuş gibi gösteriyordu.
      await new Promise(resolve => {
        this.motionResolve = resolve;
        let previousFrameAt = performance.now();
        const frame = now => {
          if (this.stopped) {
            this.motionFrame = 0;
            this.motionResolve = null;
            resolve();
            return;
          }
          const realDelta = Math.max(0, now - previousFrameAt);
          previousFrameAt = now;
          this.motionElapsed = Math.min(target, this.motionElapsed + realDelta * this.speed);
          const progress = clamp((this.motionElapsed - start) / Math.max(1, delta), 0, 1);
          this.renderMotionFrame(this.motionElapsed);
          if (this.bombClock && this.motionElapsed >= this.bombClock.startMs) {
            const bombProgress = clamp(
              (this.motionElapsed - this.bombClock.startMs)
                / Math.max(1, this.bombClock.durationMs),
              0,
              1
            );
            this.setClock(Math.ceil(this.bombClock.seconds * (1 - bombProgress)));
          } else {
            this.setClock(Math.round(
              115 * (1 - this.motionElapsed / Math.max(1, this.regulationDuration))
            ));
          }
          if (progress < 1) {
            this.motionFrame = window.requestAnimationFrame(frame);
          } else {
            this.motionFrame = 0;
            this.motionResolve = null;
            resolve();
          }
        };
        this.motionFrame = window.requestAnimationFrame(frame);
      });
    }

    syncWorldSnapshot(players) {
      players.forEach(player => {
        const entry = this.players.get(player.id);
        if (!entry) return;
        this.placePlayer(
          entry,
          player.x,
          player.y,
          player.x + (player.facingX || 0),
          player.y + (player.facingY || 0)
        );
        const behavior = player.behavior === 'dead' && entry.alive
          ? (entry.behavior || 'hold')
          : (player.behavior || entry.behavior || 'hold');
        this.applyBehavior(entry, behavior, player.behaviorSource);
        this.updatePlayerVitals(entry, player);
      });
    }

    updatePlayerVitals(entry, state = {}) {
      if (!entry) return;
      entry.health = clamp(Number(state.health ?? entry.health ?? 100), 0, 100);
      entry.armor = clamp(Number(state.armor ?? entry.armor ?? 0), 0, 100);
      entry.weapon = state.weapon || entry.weapon || 'Pistol';
      entry.ammo = Number.isFinite(Number(state.ammo)) ? Number(state.ammo) : (entry.ammo || 0);
      entry.reserveAmmo = Number.isFinite(Number(state.reserveAmmo))
        ? Number(state.reserveAmmo)
        : (entry.reserveAmmo || 0);
      entry.hasBomb = Boolean(state.hasBomb ?? entry.hasBomb);
      entry.hasDefuseKit = Boolean(state.hasDefuseKit ?? entry.hasDefuseKit);
      entry.helmet = Boolean(state.helmet ?? entry.helmet);
      entry.money = state.money ?? entry.money ?? null;
      entry.equipmentValue = state.equipmentValue ?? entry.equipmentValue ?? null;
      entry.buyType = state.buyType || entry.buyType || null;
      entry.rolePreference = state.rolePreference || entry.rolePreference || null;
      entry.roundRole = state.roundRole || entry.roundRole || entry.rolePreference || null;
      entry.roundTask = state.roundTask || entry.roundTask || null;
      entry.utility = [...(state.utility || entry.utility || [])];
      entry.savedFromPreviousRound = Boolean(
        state.savedFromPreviousRound ?? entry.savedFromPreviousRound
      );
      entry.el?.classList.toggle('is-blinded', Boolean(state.blinded));
      entry.el?.classList.toggle('is-in-fire', Boolean(state.inFire));
      if (entry.hpBar) entry.hpBar.style.width = `${entry.health}%`;
      if (entry.armorBar) entry.armorBar.style.width = `${entry.armor}%`;
      if (entry.weaponEl) {
        entry.weaponEl.textContent = `${entry.hasBomb ? '💣 ' : ''}${entry.weapon} · ${entry.ammo}/${entry.reserveAmmo}`;
      }
      entry.el?.style.setProperty('--sv-hp-ratio', entry.health / 100);
    }

    showDamage(target, damage, headshot = false) {
      if (!target?.el || !damage) return;
      const popup = document.createElement('span');
      popup.className = `sv-damage-popup${headshot ? ' is-headshot' : ''}`;
      popup.textContent = `-${damage}${headshot ? ' HS' : ''}`;
      target.el.appendChild(popup);
      const timer = window.setTimeout(() => {
        popup.remove();
        this.timers.delete(timer);
      }, this.duration(620));
      this.timers.add(timer);
    }

    applyBehavior(entry, state, source = '') {
      if (!entry?.el) return;
      const states = Object.keys(behaviorLabels);
        states.forEach(name => entry.el.classList.toggle(`is-${name}`, name === state));
        entry.el.classList.toggle('is-bomb-escape', source === 'bomb-escape');
        entry.el.classList.toggle('is-plant-urgency', source === 'plant-urgency');
        entry.el.classList.toggle(
          'is-retake-role',
          source.startsWith('retake-')
            || source === 'fake-defuse'
            || source === 'defuse-active'
            || source === 'defuse-cover'
        );
        entry.el.classList.toggle('is-postplant-role', source.startsWith('postplant-')
          || source === 'defuse-reaction');
        entry.el.classList.toggle('is-fake-defuse', source === 'fake-defuse');
        entry.el.classList.toggle('is-silent-approach', source === 'silent-approach');
        entry.el.classList.toggle(
          'is-team-tactic',
          [
            'execute-wait',
            'execute-entry',
            'trade-close',
            'trade-follow',
            'lurk-control',
            'anchor-hold',
            'awp-angle',
            'awp-reposition',
            'ct-opening-sprint',
            't-opening-exit'
          ].includes(source)
            || source.startsWith('mid-round-')
        );
      entry.el.classList.toggle(
        'is-low-health-retreat',
        source === 'low-health' || source === 'heavy-damage'
      );
      entry.behavior = state;
      entry.behaviorSource = source;
      if (entry.behaviorEl) {
          const specialLabel = source === 'bomb-escape'
            ? 'KAÇIŞ'
            : source === 'plant-urgency'
              ? 'PLANT'
            : source === 'postplant-anchor'
              ? 'BOMBA'
            : source === 'postplant-crossfire'
              ? 'ÇAPRAZ'
            : source === 'postplant-lurk'
              ? 'LURK'
            : source === 'retake-entry'
              ? 'GİRİŞ'
            : source === 'retake-trade'
              ? 'TRADE'
            : source === 'retake-cover'
              ? 'DESTEK'
            : source === 'retake-flank'
              ? 'FLANK'
            : source === 'fake-defuse'
              ? 'FAKE'
            : source === 'defuse-active'
              ? 'İMHA'
            : source === 'defuse-cover'
              ? 'KORU'
            : source === 'defuse-reaction'
              ? 'DÖN'
            : source === 'silent-approach'
              ? 'SESSİZ'
            : source === 'fake-plant'
              ? 'FAKE PLANT'
            : source === 'execute-wait'
              ? 'TRADE BEKLE'
            : source === 'execute-entry'
              ? 'ENTRY'
            : source === 'trade-close'
              ? 'MESAFE KAPAT'
            : source === 'trade-follow'
              ? 'TRADE'
            : source === 'lurk-control'
              ? 'LURK'
            : source === 'anchor-hold'
              ? 'ANCHOR'
            : source === 'awp-angle'
              ? 'AWP AÇI'
            : source === 'awp-reposition'
              ? 'AWP KAÇ'
            : source === 'ct-opening-sprint'
              ? 'DAĞIL'
            : source === 't-opening-exit'
              ? 'ÇIKIŞ'
            : source.startsWith('mid-round-')
              ? 'IGL'
            : source === 'low-health' || source === 'heavy-damage'
              ? 'CAN AZ'
            : source === 'utility-fire'
              ? 'ATEŞTEN KAÇ'
            : source === 'utility-he'
              ? 'BOMBA'
            : null;
        entry.behaviorEl.textContent = specialLabel || behaviorLabels[state] || '';
        entry.behaviorEl.title = source
          ? `${specialLabel || behaviorLabels[state] || state} · ${source}`
          : state;
      }
    }

    showPerception(perception) {
      const badge = this.get('perception-badge');
      const distance = Number(perception.distance || 0).toFixed(1);
      const behavior = behaviorLabels[perception.behavior] || perception.behavior || 'TEMAS';
      badge.textContent = `${behavior} · LOS ✓ · ${distance}m · ${perception.visibleForMs || 0}ms`;
      badge.className = 'sv-perception-badge show';
      const timer = window.setTimeout(() => {
        badge.className = 'sv-perception-badge';
        this.timers.delete(timer);
      }, this.duration(1100));
      this.timers.add(timer);
    }

    async playPlant(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      this.bombClock = {
        startMs: Number(event.motionTimeMs) || this.motionElapsed,
        durationMs: Number(event.bombDurationMs) || 12000,
        seconds: Number(event.bombTime) || 40
      };
      this.setClock(this.bombClock.seconds);
      this.phase.textContent = `C4 KURULUYOR · ${event.site}`;
      this.positionBomb(event.position);
      this.bomb.classList.add('is-planted');
      this.get('event-copy').textContent = `${event.site} bölgesinde C4 kuruldu. CT retake başlatıyor.`;
      this.showBanner(`C4 KURULDU · ${event.site}`, event.teamId, 1050);
    }

    async playBombPickup(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      this.phase.textContent = 'C4 GERİ ALINDI';
      this.get('event-copy').textContent = `${event.actor?.name || 'T oyuncusu'} düşen C4'ü aldı; hücum devam ediyor.`;
      this.showBanner('C4 GERİ ALINDI', event.teamId, 820);
    }

    async playTacticalDecision(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      const labels = {
        retake: 'RETAKE',
        save: 'SAVE',
        ninja: 'NINJA DEFUSE'
      };
      const coordinatedRetake = event.decision === 'retake' && (event.retakePlan || []).length > 1;
      const forcedContest = event.decision === 'retake' && event.metrics?.mustContest;
      const label = forcedContest
        ? 'ÖLÜMÜNE RETAKE'
        : coordinatedRetake
          ? 'KOORDİNELİ RETAKE'
          : labels[event.decision] || 'CT KARARI';
      this.phase.textContent = label;
      const metrics = event.metrics || {};
      const timeSeconds = Math.round((metrics.totalMs || 0) / 100) / 10;
      const crossfirePairs = new Set(
        (event.attackerSetup || [])
          .map(assignment => assignment.pairId)
          .filter(Boolean)
      ).size;
      const retakeLanes = new Set(
        (event.retakePlan || [])
          .map(assignment => assignment.lane)
          .filter(Boolean)
      ).size;
      this.get('event-copy').textContent = event.decision === 'save'
        ? `T ekibi ${crossfirePairs} çapraz savunma kurdu; CT ${metrics.defendersAlive || 0}v${metrics.attackersAlive || 0} durumda silahlarını koruyor.`
        : event.decision === 'ninja'
          ? `${event.actor?.name || 'CT oyuncusu'} ${metrics.hasDefuseKit ? 'kit ile' : 'kitsiz'} gizlice C4'e yaklaşıyor.`
          : `${metrics.mustContest ? 'Bu raundda save yok; ' : ''}T ${crossfirePairs} çapraz kurdu; CT ${retakeLanes} girişten entry-trade düzeniyle geliyor${metrics.fakeDefusePlanned ? ' ve fake defuse hazırlıyor' : ''}. Tahmini ${timeSeconds.toFixed(1)} sn.`;
      this.showBanner(label, event.teamId, 980);
    }

    async playDefuseAttempt(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      this.phase.textContent = event.fake ? 'FAKE DEFUSE' : 'DEFUSE BAŞLADI';
      this.positionBomb(event.position);
      const reacting = (event.reactingAttackers || []).length;
      this.get('event-copy').textContent = event.fake
        ? `${event.actor?.name || 'CT oyuncusu'} C4'e fake dokundu; ${reacting} T oyuncusu bombaya dönüyor.`
        : `${event.actor?.name || 'CT oyuncusu'} site boşalınca ${event.hasDefuseKit ? 'kitli 5' : 'kitsiz 10'} saniyelik defuse'a oturdu; ${reacting} T oyuncusu sese reaksiyon veriyor.`;
      this.showBanner(event.fake ? 'FAKE DEFUSE' : 'DEFUSE BAŞLADI', event.teamId, 900);
    }

    async playBombEscape(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      this.phase.textContent = 'PATLAMADAN KAÇIŞ';
      const running = (event.actors || []).filter(actor => !actor.stayed);
      const trapped = running.filter(actor => actor.lethalAfterEscape || !actor.reachable);
      this.get('event-copy').textContent = trapped.length
        ? `${event.site} C4'ünden ${running.length} oyuncu kaçıyor; ${trapped.length} oyuncu güvenli mesafeye yetişemeyebilir.`
        : `${event.site} bölgesindeki C4 patlamak üzere; ${running.length} oyuncu güvenli koridora çıkıyor.`;
      this.showBanner('BOMBA ALANINDAN UZAKLAŞ', event.teamId, 920);
    }

    async playExplosion(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      this.phase.textContent = 'C4 PATLADI';
      this.positionBomb(event.position);
      const blast = [...(event.blast || [])].sort(
        (first, second) => (first.arrivalMs || 0) - (second.arrivalMs || 0)
      );
      for (const result of blast) {
        const entry = this.players.get(result.player?.id);
        if (!entry) continue;
        entry.alive = true;
        entry.el.classList.remove('is-dead');
        this.updatePlayerVitals(entry, {
          health: result.healthBefore,
          armor: result.armorBefore
        });
      }
      this.bomb.classList.add('is-exploding');
      this.root.classList.add('sv-map-explosion');
      const wave = this.get('blast-wave');
      wave.style.left = `${event.position?.x || 50}%`;
      wave.style.top = `${event.position?.y || 50}%`;
      wave.classList.remove('active');
      void wave.offsetWidth;
      wave.classList.add('active');
      this.showBanner('C4 PATLADI', event.teamId, 1250);
      let previousArrival = 0;
      for (const result of blast) {
        const arrival = Math.max(previousArrival, Number(result.arrivalMs) || 0);
        await this.wait(Math.min(260, arrival - previousArrival));
        previousArrival = arrival;
        const entry = this.players.get(result.player?.id);
        if (!entry || result.damage <= 0) continue;
        this.updatePlayerVitals(entry, {
          health: result.healthAfter,
          armor: result.armorAfter
        });
        this.showDamage(entry, result.damage, false);
        if (result.killed) {
          entry.alive = false;
          this.applyBehavior(entry, 'dead', 'c4-shockwave');
          entry.el.classList.add('is-dead');
        }
      }
      const killed = blast.filter(result => result.killed);
      this.get('event-copy').textContent = killed.length
        ? `Şok dalgasından kaçamayan ${killed.map(result => result.player.name).join(', ')} öldü.`
        : 'Şok dalgası koridorlarda zayıfladı; hayatta kalanlar güvenli mesafeye ulaştı.';
      this.updateAlive();
      this.updateRosters();
      await this.wait(920);
      this.root.classList.remove('sv-map-explosion');
      wave.classList.remove('active');
    }

    async playDefuse(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      this.phase.textContent = 'İMHA';
      this.positionBomb(event.position);
      this.bomb.classList.remove('is-planted');
      this.bomb.classList.add('is-defused');
      this.showBanner('BOMBA İMHA EDİLDİ', event.teamId, 1200);
      await this.wait(760);
    }

    async finishRound(event) {
      await this.advanceMotionTo(event.motionTimeMs);
      this.syncWorldSnapshot(event.players || []);
      this.stopMotion();
      this.phase.textContent = 'RAUNT SONU';
      this.clearSmokes();
      this.root.classList.toggle('sv-round-blue', event.winnerTeamId === 1);
      this.root.classList.toggle('sv-round-red', event.winnerTeamId === 2);
      const winnerName = event.winnerTeamId === 1
        ? this.get('team-1-name').textContent
        : this.get('team-2-name').textContent;
      this.showBanner(`${winnerName} RAUNDU KAZANDI`, event.winnerTeamId, 1250);
      this.setClock(0);
      await this.wait(820);
    }

    finishMatch() {
      this.stopMotion();
      this.phase.textContent = 'MAÇ SONU';
      if (this.liveStatus) {
        this.liveStatus.classList.add('is-finished');
        this.liveStatus.innerHTML = '<span></span> BİTTİ';
      }
    }

    face(entry, x, y) {
      const angle = Math.atan2(y - entry.y, x - entry.x) * 180 / Math.PI;
      entry.el.style.setProperty('--sv-facing-angle', `${angle + 90}deg`);
    }

    showTracer(actor, target) {
      if (!actor || !target || !this.bulletLine?.parentNode) return;
      const tracer = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tracer.classList.add('sv-tracer-shot', 'active');
      tracer.setAttribute('x1', actor.x);
      tracer.setAttribute('y1', actor.y);
      tracer.setAttribute('x2', target.x);
      tracer.setAttribute('y2', target.y);
      const tracerDuration = this.duration(420);
      tracer.style.animationDuration = `${tracerDuration}ms`;
      this.bulletLine.parentNode.appendChild(tracer);
      const timer = window.setTimeout(() => {
        tracer.remove();
        this.timers.delete(timer);
      }, tracerDuration + 30);
      this.timers.add(timer);
    }

    clearTracers() {
      this.bulletLine?.classList.remove('active');
      this.root.querySelectorAll('.sv-tracer-shot').forEach(tracer => tracer.remove());
    }

    positionBomb(position) {
      if (!position) return;
      this.bomb.style.display = '';
      this.bomb.style.left = `${position.x}%`;
      this.bomb.style.top = `${position.y}%`;
    }

    addKill(event) {
      this.killHistory.unshift({
        killer: event.actor?.name || 'Bilinmeyen',
        victim: event.target?.name || 'Bilinmeyen',
        weapon: event.weapon || 'Rifle',
        headshot: Boolean(event.headshot),
        teamId: event.teamId
      });
      this.killHistory = this.killHistory.slice(0, 5);
      this.renderKillFeed();
    }

    renderKillFeed() {
      const host = this.get('kill-feed');
      host.innerHTML = '';
      if (!this.killHistory.length) {
        const empty = document.createElement('div');
        empty.className = 'sv-empty';
        empty.textContent = 'İlk temas bekleniyor...';
        host.appendChild(empty);
        return;
      }
      this.killHistory.forEach(kill => {
        const row = document.createElement('div');
        row.className = `sv-kill-row team-${kill.teamId}`;
        const killer = document.createElement('b');
        killer.textContent = kill.killer;
        const weapon = document.createElement('span');
        weapon.textContent = `${kill.weapon}${kill.headshot ? ' ◉' : ''}`;
        const victim = document.createElement('strong');
        victim.textContent = kill.victim;
        row.append(killer, weapon, victim);
        host.appendChild(row);
      });
    }

    updateRosters() {
      [1, 2].forEach(teamId => {
        const host = this.get(`roster-${teamId}`);
        if (!host) return;
        host.innerHTML = '';
        const teamPlayers = [...this.players.values()]
          .filter(player => player.teamId === teamId)
          .sort((a, b) => a.id.localeCompare(b.id));
        teamPlayers.forEach(player => {
          const stats = this.latestStats.get(player.name) || { k: 0, d: 0, a: 0 };
          const row = document.createElement('div');
          row.className = `sv-roster-row${player.alive ? '' : ' is-dead'}`;
          row.dataset.playerId = player.id;
          const status = document.createElement('span');
          status.className = 'sv-roster-status';
          status.textContent = player.alive ? String(Math.round(player.health ?? 100)) : '×';
          const playerBlock = document.createElement('span');
          playerBlock.className = 'sv-roster-player-block';
          const name = document.createElement('span');
          name.className = 'sv-roster-player';
          const role = document.createElement('em');
          role.className = `sv-roster-role role-${player.roundRole || 'player'}`;
          role.textContent = this.economyRoleLabel(player.roundRole);
          name.append(role, document.createTextNode(player.name));
          const loadout = document.createElement('small');
          loadout.className = 'sv-roster-loadout';
          const money = player.money === null || player.money === undefined
            ? ''
            : `  $${Number(player.money).toLocaleString('tr-TR')}`;
          const saved = player.savedFromPreviousRound ? ' 💾' : '';
          loadout.textContent = `${player.hasBomb ? '💣 ' : ''}${player.weapon || 'Pistol'} · ${player.ammo ?? 0}/${player.reserveAmmo ?? 0}  🛡${Math.round(player.armor || 0)}${player.hasDefuseKit ? '  🧰' : ''}${saved}${money}`;
          const task = document.createElement('small');
          task.className = 'sv-roster-task';
          task.textContent = this.roleTaskLabel(player.roundTask);
          playerBlock.append(name, task, loadout);
          const kda = document.createElement('span');
          kda.className = 'sv-roster-kda';
          kda.textContent = `${stats.k}/${stats.d}/${stats.a}`;
          row.append(status, playerBlock, kda);
          host.appendChild(row);
        });
      });
    }

    updateAlive() {
      const alive1 = [...this.players.values()].filter(player => player.teamId === 1 && player.alive).length;
      const alive2 = [...this.players.values()].filter(player => player.teamId === 2 && player.alive).length;
      this.get('alive-1').textContent = alive1;
      this.get('alive-2').textContent = alive2;
    }

    setClock(seconds) {
      const value = Math.max(0, Number(seconds) || 0);
      const minutes = Math.floor(value / 60);
      const remainder = value % 60;
      this.get('round-clock').textContent = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }

    showBanner(text, teamId, baseDuration) {
      if (this.bannerTimer) {
        window.clearTimeout(this.bannerTimer);
        this.timers.delete(this.bannerTimer);
      }
      this.banner.textContent = text;
      this.banner.className = `sv-map-banner show team-${teamId || 0}`;
      const timer = window.setTimeout(() => {
        this.banner.className = 'sv-map-banner';
        this.timers.delete(timer);
        if (this.bannerTimer === timer) this.bannerTimer = null;
      }, this.duration(baseDuration));
      this.bannerTimer = timer;
      this.timers.add(timer);
    }

    duration(base) {
      return Math.max(16, Math.round(base / this.speed));
    }

    wait(base) {
      return new Promise(resolve => {
        const timer = window.setTimeout(() => {
          this.timers.delete(timer);
          this.pendingWaits.delete(timer);
          resolve();
        }, this.duration(base));
        this.timers.add(timer);
        this.pendingWaits.set(timer, resolve);
      });
    }
  }

  window.ShooterMatchViewer = {
    render,
    mount(rootId = 'shooter-map-viewer') {
      const root = document.getElementById(rootId);
      return root ? new Viewer(root) : null;
    },
    reset(rootId = 'shooter-map-viewer', options = {}) {
      const root = document.getElementById(rootId);
      if (!root) return null;
      root.outerHTML = render({ ...options, rootId });
      const freshRoot = document.getElementById(rootId);
      return freshRoot ? new Viewer(freshRoot) : null;
    }
  };
})();
