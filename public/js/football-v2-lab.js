(function footballV2LabModule() {
  const ROLE_LABELS = {
    'ball-carrier': 'TOP',
    'close-support': 'DESTEK',
    'wide-outlet': 'GENİŞLİK',
    'depth-run': 'KOŞU',
    'support-left': 'DESTEK SOL',
    'support-right': 'DESTEK SAĞ',
    'wide-left': 'GENİŞ SOL',
    'wide-right': 'GENİŞ SAĞ',
    'runner-left': 'KOŞU SOL',
    'runner-right': 'KOŞU SAĞ',
    'holding-left': 'DENGE SOL',
    'holding-right': 'DENGE SAĞ',
    'rest-defense': 'EMNİYET',
    press: 'BASKI',
    cover: 'KADEME',
    'lane-top': 'KORİDOR',
    'lane-bottom': 'KORİDOR',
    'back-line': 'HAT',
    'midfield-left': 'ORTA SOL',
    'midfield-center': 'ORTA MERKEZ',
    'midfield-right': 'ORTA SAĞ',
    'back-left': 'HAT SOL',
    'back-center-left': 'STOPER SOL',
    'back-center-right': 'STOPER SAĞ',
    'back-right': 'HAT SAĞ',
    sweeper: 'SÜPÜRÜCÜ',
    goalkeeper: 'KALECİ',
    shape: 'ŞEKİL'
  };

  const EVENT_LABELS = {
    pass: 'PAS',
    control: 'KONTROL',
    'first-touch': 'İLK KONTROL',
    interception: 'PAS ARASI',
    deflection: 'SEKME',
    'heavy-touch': 'AĞIR KONTROL',
    overhit: 'BOŞA PAS',
    'boundary-bounce': 'SINIR SEKME',
    tackle: 'MÜDAHALE',
    'dribble-touch': 'DOKUNUŞ',
    'dribble-beat': 'ÇALIM',
    'dribble-tackle': 'TOP KAPMA',
    shield: 'TOP SAKLAMA',
    'shield-win': 'OMUZU KOYDU',
    'shoulder-duel': 'OMUZ OMUZA',
    'heavy-dribble': 'TOP AÇILDI',
    shot: 'ŞUT',
    save: 'KURTARIŞ',
    'keeper-claim': 'KALECİ TOPLADI',
    parry: 'SEKTİRDİ',
    block: 'BLOK',
    goal: 'GOL',
    miss: 'AUT',
    woodwork: 'DİREK',
    foul: 'FAUL',
    'free-kick': 'SERBEST VURUŞ',
    penalty: 'PENALTI',
    corner: 'KORNER',
    'throw-in': 'TAÇ',
    'goal-kick': 'KALE VURUŞU',
    kickoff: 'SANTRA',
    'goal-celebration': 'GOL SEVİNCİ',
    'attack-plan': 'HÜCUM PLANI',
    'restart-taken': 'OYUNA GİRDİ',
    'keeper-decision': 'KALECİ KARARI',
    'keeper-distribution': 'KALECİ PASI',
    restart: 'YENİDEN BAŞLADI',
    'loose-ball': 'BOŞ TOP',
    phase: 'FAZ',
    handoff: 'DEVİR'
  };

  const PHASE_LABELS = {
    'attack-transition': 'HÜCUMA GEÇİŞ',
    'defense-transition': 'GERİ KOŞU',
    'build-up': 'GERİDEN KURULUM',
    progression: 'OYUNU İLERLETME',
    'final-third': 'SON BÖLGE',
    'settled-defense': 'YERLEŞİK SAVUNMA'
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function round(value, precision = 2) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  function createLiveTeamStats(team) {
    return {
      teamId: team.id,
      name: team.name,
      possession: 0,
      shots: 0,
      shotsOnTarget: 0,
      goals: 0,
      xg: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      passAccuracy: 0,
      dribblesAttempted: 0,
      dribblesCompleted: 0,
      defensiveActions: 0,
      corners: 0,
      throwIns: 0,
      goalKicks: 0,
      freeKicks: 0,
      penalties: 0,
      foulsCommitted: 0,
      foulsWon: 0
    };
  }

  function createLivePlayerStats(player) {
    return {
      playerId: player.id,
      teamId: player.teamId,
      name: player.name,
      positionCode: player.positionCode,
      isGoalkeeper: player.isGoalkeeper,
      rating: 6.5,
      goals: 0,
      assists: 0,
      shots: 0,
      shotsOnTarget: 0,
      xg: 0,
      xa: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      passAccuracy: 0,
      keyPasses: 0,
      dribblesAttempted: 0,
      dribblesCompleted: 0,
      tackles: 0,
      interceptions: 0,
      blocks: 0,
      saves: 0,
      keeperClaims: 0,
      goalsConceded: 0,
      foulsCommitted: 0,
      foulsWon: 0,
      penaltiesTaken: 0,
      penaltiesScored: 0,
      turnovers: 0
    };
  }

  function calculateLivePlayerRating(player) {
    const missedPasses = player.passesAttempted - player.passesCompleted;
    const failedDribbles = player.dribblesAttempted - player.dribblesCompleted;
    const attacking =
      player.goals * 1.18 +
      player.assists * 0.72 +
      player.shotsOnTarget * 0.1 +
      (player.goals - player.xg) * 0.34;
    const distribution =
      player.passesCompleted * 0.014 -
      missedPasses * 0.018 +
      player.keyPasses * 0.16 +
      player.xa * 0.34;
    const ballUse =
      player.dribblesCompleted * 0.08 -
      failedDribbles * 0.045 -
      player.turnovers * 0.035;
    const defending =
      player.tackles * 0.11 +
      player.interceptions * 0.12 +
      player.blocks * 0.1 +
      player.saves * 0.15 +
      player.keeperClaims * 0.04 -
      player.goalsConceded * 0.13;
    const discipline =
      player.foulsWon * 0.025 -
      player.foulsCommitted * 0.09 +
      player.penaltiesScored * 0.16 -
      Math.max(0, player.penaltiesTaken - player.penaltiesScored) * 0.42;
    return round(clamp(
      6.5 + attacking + distribution + ballUse + defending + discipline,
      3,
      10
    ), 1);
  }

  function createLiveStatisticsState(payload) {
    return {
      teams: new Map(payload.teams.map(team => [team.id, createLiveTeamStats(team)])),
      players: new Map(payload.roster.map(player => [player.id, createLivePlayerStats(player)])),
      roster: payload.roster,
      lastCompletedPass: new Map(),
      lastShot: new Map(),
      eventIndex: 0,
      snapshotIndex: 0,
      possessionSamples: 0
    };
  }

  function applyLiveStatisticsEvent(state, event) {
    const team = state.teams.get(event.teamId);
    const actor = state.players.get(event.actor);

    if (event.type === 'pass' || event.type === 'keeper-distribution') {
      if (team) team.passesAttempted += 1;
      if (actor) actor.passesAttempted += 1;
    }
    if (event.type === 'first-touch' && event.passerId) {
      const passer = state.players.get(event.passerId);
      const passerTeam = passer ? state.teams.get(passer.teamId) : null;
      if (passer) passer.passesCompleted += 1;
      if (passerTeam) passerTeam.passesCompleted += 1;
      if (passer) {
        state.lastCompletedPass.set(passer.teamId, {
          passerId: passer.playerId,
          receiverId: event.actor,
          t: event.t
        });
      }
    }
    if (event.type === 'shot') {
      const xg = Number(event.xg) || 0;
      if (team) {
        team.shots += 1;
        team.xg += xg;
      }
      if (actor) {
        actor.shots += 1;
        actor.xg += xg;
        if (event.isPenalty) actor.penaltiesTaken += 1;
      }
      const previousPass = state.lastCompletedPass.get(event.teamId);
      const assistedBy = previousPass && event.t - previousPass.t <= 8
        ? previousPass.passerId
        : null;
      if (assistedBy && assistedBy !== event.actor) {
        const creator = state.players.get(assistedBy);
        if (creator) {
          creator.keyPasses += 1;
          creator.xa += xg;
        }
      }
      state.lastShot.set(event.teamId, {
        shooterId: event.actor,
        assisterId: assistedBy,
        isPenalty: Boolean(event.isPenalty)
      });
    }
    if (event.type === 'goal') {
      const shot = state.lastShot.get(event.teamId);
      const shooter = state.players.get(event.actor || shot?.shooterId);
      if (team) {
        team.goals += 1;
        team.shotsOnTarget += 1;
      }
      if (shooter) {
        shooter.goals += 1;
        shooter.shotsOnTarget += 1;
        if (shot?.isPenalty) shooter.penaltiesScored += 1;
      }
      if (shot?.assisterId && shot.assisterId !== shooter?.playerId && !shot.isPenalty) {
        const assister = state.players.get(shot.assisterId);
        if (assister) assister.assists += 1;
      }
      const concedingKeeper = state.roster.find(
        player => player.teamId !== event.teamId && player.isGoalkeeper
      );
      const keeperStats = concedingKeeper ? state.players.get(concedingKeeper.id) : null;
      if (keeperStats) keeperStats.goalsConceded += 1;
    }
    if (event.type === 'save' || (event.type === 'parry' && event.onTarget)) {
      const shot = state.lastShot.get(event.teamId === 1 ? 2 : 1);
      const shooter = state.players.get(event.shooter || shot?.shooterId);
      const attackingTeam = shooter ? state.teams.get(shooter.teamId) : null;
      if (shooter) shooter.shotsOnTarget += 1;
      if (attackingTeam) attackingTeam.shotsOnTarget += 1;
      if (actor) actor.saves += 1;
    }
    if (event.type === 'keeper-claim' && actor) actor.keeperClaims += 1;
    if (event.type === 'block' && actor) {
      actor.blocks += 1;
      const defendingTeam = state.teams.get(actor.teamId);
      if (defendingTeam) defendingTeam.defensiveActions += 1;
    }
    if (event.type === 'interception' && actor) {
      actor.interceptions += 1;
      const defendingTeam = state.teams.get(actor.teamId);
      if (defendingTeam) defendingTeam.defensiveActions += 1;
    }
    if (event.type === 'dribble-tackle' && actor) {
      actor.tackles += 1;
      const defendingTeam = state.teams.get(actor.teamId);
      if (defendingTeam) defendingTeam.defensiveActions += 1;
    }
    if (event.type === 'dribble-beat') {
      if (team) {
        team.dribblesAttempted += 1;
        team.dribblesCompleted += 1;
      }
      if (actor) {
        actor.dribblesAttempted += 1;
        actor.dribblesCompleted += 1;
      }
    }
    if (event.type === 'dribble-tackle' || event.type === 'shoulder-duel') {
      const dribbler = state.players.get(event.victim);
      const dribblingTeam = dribbler ? state.teams.get(dribbler.teamId) : null;
      if (dribbler) dribbler.dribblesAttempted += 1;
      if (dribblingTeam) dribblingTeam.dribblesAttempted += 1;
    }
    if (['heavy-touch', 'overhit'].includes(event.type)) {
      const losingPlayer = state.players.get(event.passerId || event.victim || event.actor);
      if (losingPlayer) losingPlayer.turnovers += 1;
    }
    if (event.type === 'foul') {
      const offender = state.players.get(event.actor);
      const victim = state.players.get(event.victim);
      const offenderTeam = offender ? state.teams.get(offender.teamId) : null;
      const awardedTeam = state.teams.get(event.awardedTeamId);
      if (offender) offender.foulsCommitted += 1;
      if (victim) victim.foulsWon += 1;
      if (offenderTeam) offenderTeam.foulsCommitted += 1;
      if (awardedTeam) awardedTeam.foulsWon += 1;
    }
    if (event.type === 'corner' && team) team.corners += 1;
    if (event.type === 'throw-in' && team) team.throwIns += 1;
    if (event.type === 'goal-kick' && team) team.goalKicks += 1;
    if (event.type === 'free-kick' && team) team.freeKicks += 1;
    if (event.type === 'penalty' && team) team.penalties += 1;
  }

  function materializeLiveStatistics(state) {
    const possessionSamples = Math.max(1, state.possessionSamples);
    const teams = [...state.teams.values()].map(team => ({
      ...team,
      possession: round((team.possession / possessionSamples) * 100, 1),
      xg: round(team.xg, 2),
      passAccuracy: team.passesAttempted
        ? round((team.passesCompleted / team.passesAttempted) * 100, 1)
        : 0
    }));
    const players = [...state.players.values()].map(player => ({
      ...player,
      xg: round(player.xg, 2),
      xa: round(player.xa, 2),
      passAccuracy: player.passesAttempted
        ? round((player.passesCompleted / player.passesAttempted) * 100, 1)
        : 0,
      rating: calculateLivePlayerRating(player)
    })).sort((left, right) => (
      right.rating - left.rating ||
      right.goals - left.goals ||
      left.name.localeCompare(right.name, 'tr')
    ));
    return { teams, players };
  }

  class FootballV2LabPlayer {
    constructor(root) {
      this.root = root;
      this.pitch = root.querySelector('[data-v2-pitch]');
      this.ballElement = root.querySelector('[data-v2-ball]');
      this.playersLayer = root.querySelector('[data-v2-players]');
      this.zonesLayer = root.querySelector('[data-v2-zones]');
      this.clockElement = root.querySelector('[data-v2-clock]');
      this.statusElement = root.querySelector('[data-v2-status]');
      this.scoreElement = root.querySelector('[data-v2-score]');
      this.phaseElement = root.querySelector('[data-v2-phase]');
      this.eventList = root.querySelector('[data-v2-events]');
      this.telemetryRoot = root.querySelector('[data-v2-telemetry]');
      this.matchCenterRoot = root.querySelector('[data-v2-match-center]');
      this.playButton = root.querySelector('[data-v2-action="play"]');
      this.resetButton = root.querySelector('[data-v2-action="reset"]');
      this.debugToggle = root.querySelector('[data-v2-debug]');
      this.eyebrowElement = root.querySelector('[data-v2-eyebrow]');
      this.titleElement = root.querySelector('[data-v2-title]');
      this.descriptionElement = root.querySelector('[data-v2-description]');
      this.payload = null;
      this.roster = new Map();
      this.playerStats = new Map();
      this.playerElements = new Map();
      this.zoneElements = new Map();
      this.animationFrame = null;
      this.startedAt = 0;
      this.pausedAt = 0;
      this.speed = 1;
      this.isPlaying = false;
      this.isDebug = false;
      this.lastEventIndex = -1;
      this.liveStatisticsState = null;
      this.liveStatistics = null;
      this.lastStatisticsRenderSecond = -1;
      this.bindControls();
    }

    bindControls() {
      this.playButton?.addEventListener('click', () => {
        if (!this.payload) return;
        if (this.isPlaying) this.pause();
        else this.play();
      });
      this.resetButton?.addEventListener('click', () => this.reset());
      this.debugToggle?.addEventListener('change', event => {
        this.isDebug = Boolean(event.target.checked);
        this.root.classList.toggle('is-debug', this.isDebug);
      });
    }

    load(payload) {
      this.stop();
      this.payload = payload;
      const isFifa = payload.branch === 'fifa';
      const isFullMatch = payload.matchMode === 'full';
      this.root.classList.toggle('is-fifa', isFifa);
      this.root.classList.toggle('is-full-match', isFullMatch);
      this.root.classList.toggle('is-live-playback', payload.presentationMode === 'live');
      this.root.classList.remove('is-playback-finished');
      this.root.dataset.branch = payload.branch || 'futbol';
      this.root.dataset.mode = payload.matchMode || 'lab';
      if (this.eyebrowElement) {
        this.eyebrowElement.textContent = `BETA FUTBOL V2 · PAKET 8 · ${isFifa ? 'FIFA 11v11' : 'HALI SAHA 5+1'}`;
      }
      if (this.titleElement) {
        this.titleElement.textContent = isFullMatch
          ? `${isFifa ? '11v11' : '5+1'} Tam Maç Simülasyonu`
          : `${isFifa ? '11v11' : '5+1'} Hareket Laboratuvarı`;
      }
      if (this.descriptionElement) {
        this.descriptionElement.textContent = isFullMatch
          ? `${payload.matchMinutes || (isFifa ? 90 : 50)} maç dakikası, 20 Hz tek yetkili dünyada kesintisiz oynatılır.`
          : 'Duran toplar, anlatım, xG/xA ve oyuncu performansları gerçek saha temaslarından doğar.';
      }
      this.roster = new Map(payload.roster.map(player => [player.id, player]));
      this.lastEventIndex = -1;
      this.renderRoster();
      this.reset();
      this.play();
    }

    renderRoster() {
      this.playersLayer.innerHTML = '';
      this.zonesLayer.innerHTML = '';
      this.playerElements.clear();
      this.zoneElements.clear();

      this.payload.roster.forEach(player => {
        const marker = document.createElement('div');
        marker.className = `football-v2-player team-${player.teamId}${player.isGoalkeeper ? ' is-goalkeeper' : ''}${player.isBot ? ' is-bot' : ''}`;
        marker.dataset.playerId = player.id;
        marker.innerHTML = `
          <span class="football-v2-player__role" data-v2-role>${player.isGoalkeeper ? 'KALECİ' : 'ŞEKİL'}</span>
          <span class="football-v2-player__token">${player.isGoalkeeper ? 'K' : player.isBot ? 'B' : escapeHtml(player.name.slice(0, 1).toUpperCase())}</span>
          <span class="football-v2-player__rating">${escapeHtml(player.rating)}</span>
          <span class="football-v2-player__name">${escapeHtml(player.positionCode ? `${player.positionCode} · ${player.name}` : player.name)}</span>
          <span class="football-v2-player__vector" data-v2-vector></span>
        `;
        this.playersLayer.appendChild(marker);
        this.playerElements.set(player.id, marker);

        const zone = document.createElement('div');
        zone.className = `football-v2-zone team-${player.teamId}`;
        zone.dataset.zonePlayerId = player.id;
        zone.innerHTML = '<span data-v2-zone-label></span>';
        this.zonesLayer.appendChild(zone);
        this.zoneElements.set(player.id, zone);
      });
    }

    renderTelemetry(showFinal = false) {
      const telemetry = this.payload.telemetry;
      const isFifa = this.payload.branch === 'fifa';
      const averageRoleSeconds = telemetry.playerRoles?.length
        ? telemetry.playerRoles.reduce((total, player) => total + player.averageRoleSeconds, 0) /
          telemetry.playerRoles.length
        : 0;
      const passAccuracy = telemetry.passesAttempted
        ? (telemetry.completedPasses / telemetry.passesAttempted) * 100
        : 0;
      const performanceData = this.payload.performance;
      const durationFactor = Math.max(
        1,
        Number(this.payload.simulationDurationSeconds || this.payload.durationSeconds || 30) / 30
      );
      const safeCards = [
        ['Kadro', isFifa ? '11v11 · 5 kart + 6 bot' : '5+1 · bot kaleci', 'neutral'],
        ['Akış', this.payload.matchMode === 'full' ? `${this.payload.matchMinutes} dk tam maç` : '30 sn laboratuvar', 'neutral'],
        ['Snapshot', `${this.payload.snapshotRate} Hz · ${this.payload.snapshotStrategy || 'full'}`, 'neutral'],
        ...(performanceData ? [
          ['Sunucu üretimi', `${performanceData.simulationMs.toFixed(1)} ms`, performanceData.simulationMs < 1500 ? 'good' : 'bad'],
          ['Tahmini ağ yükü', `${(performanceData.estimatedPayloadBytes / 1024 / 1024).toFixed(2)} MB`, performanceData.estimatedPayloadBytes < 4 * 1024 * 1024 ? 'good' : 'bad'],
          ['Bellek farkı', `${(performanceData.heapDeltaBytes / 1024 / 1024).toFixed(2)} MB`, 'neutral']
        ] : []),
        ['Işınlanma', telemetry.teleportCount, telemetry.teleportCount === 0 ? 'good' : 'bad'],
        ['En yüksek hız', `${telemetry.maxSpeed.toFixed(2)} br/sn`, 'neutral'],
        ['En yüksek ivme', `${telemetry.maxAcceleration.toFixed(2)} br/sn²`, 'neutral'],
        ['Takım genişliği', telemetry.averageTeamWidth.toFixed(2), telemetry.averageTeamWidth >= 35 ? 'good' : 'bad'],
        ['Takım boyu', telemetry.averageTeamLength.toFixed(2), telemetry.averageTeamLength >= 18 ? 'good' : 'bad'],
        ['Minimum mesafe', telemetry.minSameTeamDistance.toFixed(2), telemetry.minSameTeamDistance >= 2 ? 'good' : 'bad'],
        ['Rol değişimi', telemetry.roleSwitches, telemetry.roleSwitches <= (isFifa ? 140 : 60) * durationFactor ? 'good' : 'bad'],
        ['Oyuncu başı azami', telemetry.maxRoleSwitchesPerPlayer, telemetry.maxRoleSwitchesPerPlayer <= 14 * durationFactor ? 'good' : 'bad'],
        ['Ort. görev süresi', `${averageRoleSeconds.toFixed(1)} sn`, averageRoleSeconds >= 2 ? 'good' : 'bad']
      ];
      const resultCards = [
        ['Kümelenme', `${telemetry.clusteredSeconds.toFixed(2)} sn`, telemetry.clusteredSeconds <= 2 * durationFactor ? 'good' : 'bad'],
        ['Geride boşluk', `${telemetry.restDefenseVacantSeconds.toFixed(2)} sn`, telemetry.restDefenseVacantSeconds <= 4 * durationFactor ? 'good' : 'bad'],
        ['Savunma koruması', `${telemetry.defensiveCoverVacantSeconds.toFixed(2)} sn`, telemetry.defensiveCoverVacantSeconds <= (isFifa ? 15 : 12) * durationFactor ? 'good' : 'bad'],
        ['Savunma devri', telemetry.defensiveHandoffs, 'neutral'],
        ['Baskı devri', telemetry.pressHandoffs, telemetry.pressHandoffs > 0 ? 'good' : 'bad'],
        ['Topa yığılma', `${telemetry.defensiveOvercommitSeconds.toFixed(2)} sn`, telemetry.defensiveOvercommitSeconds <= durationFactor ? 'good' : 'bad'],
        ['Açık tehdit', `${telemetry.uncoveredThreatSeconds.toFixed(2)} sn`, telemetry.uncoveredThreatSeconds <= (isFifa ? 5 : 4) * durationFactor ? 'good' : 'bad'],
        ['Ort. markaj', telemetry.averageMarkingDistance.toFixed(2), telemetry.averageMarkingDistance <= (isFifa ? 21 : 18) ? 'good' : 'bad'],
        ['Top değişimi', telemetry.possessionChanges, 'neutral'],
        ['Pas', `${telemetry.completedPasses}/${telemetry.passesAttempted} · %${passAccuracy.toFixed(0)}`, 'neutral'],
        ['Ort. pas boyu', telemetry.averagePassDistance.toFixed(2), 'neutral'],
        ['Pas arası', telemetry.interceptions, 'neutral'],
        ['Sekme', telemetry.deflections, 'neutral'],
        ['Kontrol hatası', telemetry.controlErrors, 'neutral'],
        ['Sahipsiz top', telemetry.looseBalls, 'neutral'],
        ['Dripling dokunuşu', telemetry.dribbleTouches, telemetry.dribbleTouches > 0 ? 'good' : 'bad'],
        ['Çalım', `${telemetry.successfulDribbles}/${telemetry.dribbleDuels}`, 'neutral'],
        ['Başarısız çalım', telemetry.failedDribbles, 'neutral'],
        ['Omuz omuza', telemetry.shoulderDuels, 'neutral'],
        ['Top saklama', `${telemetry.successfulShields}/${telemetry.shieldActions}`, 'neutral'],
        ['Açılan dokunuş', telemetry.heavyDribbleTouches, 'neutral'],
        ['Azami dönüş', `${telemetry.maxDribbleTurnDegrees.toFixed(1)}°`, telemetry.maxDribbleTurnDegrees <= 48.01 ? 'good' : 'bad'],
        ['Skor', `${this.payload.score[1]} - ${this.payload.score[2]}`, 'neutral'],
        ['Şut', `${telemetry.shotsOnTarget}/${telemetry.shots}`, telemetry.shots > 0 ? 'good' : 'bad'],
        ['xG', telemetry.xg.toFixed(2), 'neutral'],
        ['Gol', telemetry.goals, 'neutral'],
        ['Kurtarış / toplama', `${telemetry.saves}/${telemetry.keeperClaims || 0}`, 'neutral'],
        ['Tutuş / sektirme', `${telemetry.catches}/${telemetry.parries}`, 'neutral'],
        ['Blok', telemetry.blocks, 'neutral'],
        ['Aut / direk', `${telemetry.misses}/${telemetry.woodwork}`, 'neutral'],
        ['Ort. şut mesafesi', telemetry.averageShotDistance.toFixed(2), 'neutral'],
        ['Azami şut mesafesi', telemetry.maxShotDistance.toFixed(2), telemetry.maxShotDistance <= (isFifa ? 30.01 : 33.01) ? 'good' : 'bad'],
        ['Kaleci konum değişimi', telemetry.goalkeeperDecisionChanges, 'neutral'],
        ['Kaleci dağıtımı', telemetry.keeperDistributions, 'neutral'],
        ['Korner / taç', `${telemetry.corners}/${telemetry.throwIns}`, 'neutral'],
        ['Kale / serbest vuruş', `${telemetry.goalKicks}/${telemetry.freeKicks}`, 'neutral'],
        ['Faul / penaltı', `${telemetry.fouls}/${telemetry.penalties}`, 'neutral'],
        ['Santra', telemetry.kickoffs, 'neutral'],
        ['Kullanılan duran top', `${telemetry.setPiecesTaken}/${telemetry.corners + telemetry.throwIns + telemetry.goalKicks + telemetry.freeKicks + telemetry.penalties + telemetry.kickoffs}`, 'neutral'],
        ['Azami top hızı', `${telemetry.maxBallSpeed.toFixed(2)} br/sn`, 'neutral'],
        ['Top sıçraması', telemetry.ballDiscontinuities, telemetry.ballDiscontinuities === 0 ? 'good' : 'bad'],
        ['Sahiplik bağlama', telemetry.invalidOwnershipTransitions, telemetry.invalidOwnershipTransitions === 0 ? 'good' : 'bad']
      ];
      const cards = showFinal ? [...safeCards, ...resultCards] : safeCards;
      this.telemetryRoot.innerHTML = cards.map(([label, value, tone]) => `
        <div class="football-v2-metric is-${tone}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `).join('');
    }

    renderMatchCenter(statistics = this.liveStatistics) {
      if (!this.matchCenterRoot) return;
      if (!statistics?.teams?.length || !statistics?.players?.length) {
        this.matchCenterRoot.innerHTML = '';
        return;
      }
      const teamCards = statistics.teams.map(team => `
        <article class="football-v2-team-summary team-${team.teamId}">
          <header>
            <span>${escapeHtml(team.name)}</span>
            <strong>${escapeHtml(team.goals)}</strong>
          </header>
          <div>
            <span>Topa sahip olma <strong>%${escapeHtml(team.possession)}</strong></span>
            <span>Şut <strong>${escapeHtml(team.shotsOnTarget)}/${escapeHtml(team.shots)}</strong></span>
            <span>xG <strong>${escapeHtml(team.xg.toFixed(2))}</strong></span>
            <span>Pas <strong>${escapeHtml(team.passesCompleted)}/${escapeHtml(team.passesAttempted)} · %${escapeHtml(team.passAccuracy)}</strong></span>
            <span>Çalım <strong>${escapeHtml(team.dribblesCompleted)}/${escapeHtml(team.dribblesAttempted)}</strong></span>
            <span>Savunma <strong>${escapeHtml(team.defensiveActions)}</strong></span>
            <span>Korner / taç <strong>${escapeHtml(team.corners)}/${escapeHtml(team.throwIns)}</strong></span>
            <span>Faul <strong>${escapeHtml(team.foulsCommitted)}</strong></span>
          </div>
        </article>
      `).join('');
      const playerRows = statistics.players.map(player => {
        const roster = this.roster.get(player.playerId);
        const defensiveActions = player.tackles + player.interceptions + player.blocks;
        const ratingTone = player.rating >= 8
          ? 'is-excellent'
          : player.rating >= 7
            ? 'is-good'
            : player.rating < 6
              ? 'is-low'
              : '';
        return `
          <tr class="team-${player.teamId}${roster?.isBot ? ' is-bot' : ''}">
            <td>
              <span class="football-v2-player-cell__name">${escapeHtml(player.name)}</span>
              <small>${escapeHtml(player.positionCode)}${roster?.isBot ? ' · BOT' : ''}</small>
            </td>
            <td><strong class="football-v2-match-rating ${ratingTone}">${escapeHtml(player.rating.toFixed(1))}</strong></td>
            <td>${escapeHtml(player.goals)} / ${escapeHtml(player.assists)}</td>
            <td>${escapeHtml(player.shotsOnTarget)} / ${escapeHtml(player.shots)}</td>
            <td>${escapeHtml(player.xg.toFixed(2))} / ${escapeHtml(player.xa.toFixed(2))}</td>
            <td>${escapeHtml(player.passesCompleted)} / ${escapeHtml(player.passesAttempted)} · %${escapeHtml(player.passAccuracy)}</td>
            <td>${escapeHtml(player.dribblesCompleted)} / ${escapeHtml(player.dribblesAttempted)}</td>
            <td>${escapeHtml(defensiveActions)}</td>
            <td>${player.isGoalkeeper ? `${escapeHtml(player.saves)} K · ${escapeHtml(player.keeperClaims)} T` : escapeHtml(player.foulsCommitted)}</td>
          </tr>
        `;
      }).join('');
      this.matchCenterRoot.innerHTML = `
        <div class="football-v2-match-center__heading">
          <div>
          <span>PAKET 8 · CANLI OLAYLARDAN TÜREYEN VERİ</span>
            <h4>Maç Merkezi ve Oyuncu Notları</h4>
          </div>
          <small>${escapeHtml(this.lastEventIndex + 1)} canlı olay işlendi</small>
        </div>
        <div class="football-v2-team-summaries">${teamCards}</div>
        <div class="football-v2-player-table-wrap">
          <table class="football-v2-player-table">
            <thead>
              <tr>
                <th>Oyuncu</th>
                <th>Not</th>
                <th>G / A</th>
                <th>İsabet / Şut</th>
                <th>xG / xA</th>
                <th>Başarılı / Pas</th>
                <th>Çalım</th>
                <th>Savunma</th>
                <th>Faul / Kaleci</th>
              </tr>
            </thead>
            <tbody>${playerRows}</tbody>
          </table>
        </div>
      `;
    }

    resetLiveStatistics() {
      if (!this.payload) return;
      this.liveStatisticsState = createLiveStatisticsState(this.payload);
      this.liveStatistics = materializeLiveStatistics(this.liveStatisticsState);
      this.playerStats = new Map(
        this.liveStatistics.players.map(player => [player.playerId, player])
      );
      this.lastStatisticsRenderSecond = -1;
      this.renderMatchCenter();
    }

    updateLiveStatistics(elapsed, forceRender = false) {
      const state = this.liveStatisticsState;
      if (!state) return;
      let changed = false;
      while (
        state.snapshotIndex < this.payload.snapshots.length &&
        this.payload.snapshots[state.snapshotIndex].t <= elapsed
      ) {
        const snapshot = this.payload.snapshots[state.snapshotIndex];
        const team = state.teams.get(snapshot.possessionTeam);
        if (team) team.possession += 1;
        state.possessionSamples += 1;
        state.snapshotIndex += 1;
        changed = true;
      }
      while (
        state.eventIndex < this.payload.events.length &&
        this.payload.events[state.eventIndex].t <= elapsed
      ) {
        applyLiveStatisticsEvent(state, this.payload.events[state.eventIndex]);
        state.eventIndex += 1;
        changed = true;
      }
      const currentSecond = Math.floor(elapsed);
      if (!changed || (!forceRender && currentSecond === this.lastStatisticsRenderSecond)) return;
      this.liveStatistics = materializeLiveStatistics(state);
      this.playerStats = new Map(
        this.liveStatistics.players.map(player => [player.playerId, player])
      );
      this.lastStatisticsRenderSecond = currentSecond;
      this.renderMatchCenter();
    }

    setSpeed(speed) {
      const previousElapsed = this.elapsedSeconds();
      this.speed = clamp(Number(speed) || 1, 0.5, 20);
      if (this.isPlaying) {
        this.startedAt = performance.now() - (previousElapsed * 1000) / this.speed;
      } else {
        this.pausedAt = previousElapsed;
      }
    }

    elapsedSeconds() {
      if (!this.payload) return 0;
      if (!this.isPlaying) return this.pausedAt;
      return Math.max(0, ((performance.now() - this.startedAt) / 1000) * this.speed);
    }

    play() {
      if (!this.payload || this.isPlaying) return;
      if (this.pausedAt >= this.payload.durationSeconds) this.reset();
      this.startedAt = performance.now() - (this.pausedAt * 1000) / this.speed;
      this.isPlaying = true;
      this.statusElement.textContent = 'CANLI';
      this.statusElement.classList.remove('is-finished');
      this.playButton.textContent = 'Duraklat';
      this.loop();
    }

    pause() {
      if (!this.isPlaying) return;
      this.pausedAt = this.elapsedSeconds();
      this.isPlaying = false;
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
      this.root.classList.remove('is-playback-finished');
      this.statusElement.textContent = 'DURAKLATILDI';
      this.playButton.textContent = 'Devam Et';
    }

    reset() {
      this.isPlaying = false;
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
      this.pausedAt = 0;
      this.lastEventIndex = -1;
      this.resetLiveStatistics();
      this.renderTelemetry(false);
      if (this.eventList) this.eventList.innerHTML = '<div class="football-v2-event is-muted">Dünya akışı başlatılmaya hazır.</div>';
      if (this.payload?.snapshots?.[0]) this.renderFrame(this.payload.snapshots[0], this.payload.snapshots[0], 0);
      if (this.clockElement) this.clockElement.textContent = '00:00.0';
      if (this.scoreElement) this.scoreElement.textContent = '0 - 0';
      if (this.statusElement) {
        this.statusElement.textContent = 'HAZIR';
        this.statusElement.classList.remove('is-finished');
      }
      if (this.playButton) this.playButton.textContent = 'Başlat';
    }

    stop() {
      this.isPlaying = false;
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    loop() {
      if (!this.isPlaying || !this.payload) return;
      const elapsed = Math.min(this.elapsedSeconds(), this.payload.durationSeconds);
      const framePosition = elapsed * this.payload.snapshotRate;
      const leftIndex = Math.min(Math.floor(framePosition), this.payload.snapshots.length - 1);
      const rightIndex = Math.min(leftIndex + 1, this.payload.snapshots.length - 1);
      const mix = clamp(framePosition - leftIndex, 0, 1);
      this.renderFrame(this.payload.snapshots[leftIndex], this.payload.snapshots[rightIndex], mix);
      this.renderClock(elapsed);
      this.renderEvents(elapsed);
      this.updateLiveStatistics(elapsed);

      if (elapsed >= this.payload.durationSeconds) {
        this.isPlaying = false;
        this.pausedAt = this.payload.durationSeconds;
        this.statusElement.textContent = 'TAMAMLANDI';
        this.statusElement.classList.add('is-finished');
        this.playButton.textContent = 'Tekrar Oynat';
        this.root.classList.add('is-playback-finished');
        this.liveStatistics = this.payload.statistics;
        this.playerStats = new Map(
          (this.payload.statistics?.players || []).map(player => [player.playerId, player])
        );
        this.renderMatchCenter(this.liveStatistics);
        this.renderTelemetry(true);
        return;
      }
      this.animationFrame = requestAnimationFrame(() => this.loop());
    }

    renderClock(elapsed) {
      if (this.payload?.matchMode === 'full') {
        const totalMatchSeconds = Number(this.payload.matchMinutes || 90) * 60;
        const matchSeconds = Math.min(
          totalMatchSeconds,
          (elapsed / Math.max(1, this.payload.durationSeconds)) * totalMatchSeconds
        );
        const minutes = Math.floor(matchSeconds / 60);
        const seconds = Math.floor(matchSeconds % 60);
        this.clockElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        return;
      }
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed - minutes * 60;
      this.clockElement.textContent = `${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
    }

    renderEvents(elapsed) {
      const visibleEvents = this.payload.events.filter(event => event.t <= elapsed);
      if (visibleEvents.length - 1 === this.lastEventIndex) return;
      this.lastEventIndex = visibleEvents.length - 1;
      const recent = visibleEvents.slice(-5).reverse();
      this.eventList.innerHTML = recent.length
        ? recent.map(event => `
            <div class="football-v2-event team-${event.teamId}">
              <span>${this.payload.matchMode === 'full'
                ? `${Math.max(1, Math.ceil((event.t / this.payload.durationSeconds) * this.payload.matchMinutes))}'`
                : `${event.t.toFixed(1)}″`}</span>
              <strong>${escapeHtml(EVENT_LABELS[event.type] || event.type)}</strong>
              <p>${escapeHtml(event.text)}</p>
            </div>
          `).join('')
        : '<div class="football-v2-event is-muted">Oyuncular bölgelerine yerleşiyor.</div>';
    }

    renderFrame(leftFrame, rightFrame, mix) {
      const placementBoundary =
        Number(leftFrame.ball.discontinuityId || 0) !==
        Number(rightFrame.ball.discontinuityId || 0);
      const frameMix = placementBoundary ? 0 : mix;
      const rightPlayers = new Map(rightFrame.players.map(player => [player.id, player]));
      leftFrame.players.forEach(left => {
        const right = rightPlayers.get(left.id) || left;
        const marker = this.playerElements.get(left.id);
        const zone = this.zoneElements.get(left.id);
        if (!marker || !zone) return;
        const x = left.x + (right.x - left.x) * frameMix;
        const y = left.y + (right.y - left.y) * frameMix;
        const vx = left.vx + (right.vx - left.vx) * frameMix;
        const vy = left.vy + (right.vy - left.vy) * frameMix;
        const speed = Math.hypot(vx, vy);
        const targetPlayer = left.markTargetId ? this.roster.get(left.markTargetId) : null;
        const roleLabel = ROLE_LABELS[left.role] || left.role;
        const responsibilityLabel = targetPlayer
          ? `${roleLabel} → ${targetPlayer.positionCode || targetPlayer.name.slice(0, 1).toUpperCase()}`
          : roleLabel;
        marker.style.left = `${x}%`;
        marker.style.top = `${y}%`;
        marker.classList.toggle('has-ball', leftFrame.ball.ownerId === left.id);
        marker.classList.toggle('is-shielding', Boolean(frameMix < 0.5 ? left.shielding : right.shielding));
        marker.classList.toggle('is-stunned', Boolean(frameMix < 0.5 ? left.stunned : right.stunned));
        marker.classList.toggle(
          'is-keeper-tracking',
          ['shot-track', 'close-angle'].includes(frameMix < 0.5 ? left.goalkeeperDecision : right.goalkeeperDecision)
        );
        marker.querySelector('[data-v2-role]').textContent = responsibilityLabel;
        const profile = this.roster.get(left.id);
        const profileText = profile?.isGoalkeeper
          ? ` · Kalecilik ${profile?.goalkeeping} · ${left.goalkeeperDecision || 'line'}`
          : ` · Bitiricilik ${profile?.finishing} · Dripling ${profile?.dribbling} · Savunma ${profile?.defending} · Güç ${profile?.strength}`;
        const matchStats = this.playerStats.get(left.id);
        const matchText = matchStats
          ? ` · Maç notu ${matchStats.rating.toFixed(1)} · ${matchStats.goals}G ${matchStats.assists}A · ${matchStats.xg.toFixed(2)} xG ${matchStats.xa.toFixed(2)} xA`
          : '';
        marker.title = `${targetPlayer ? `${roleLabel}: ${targetPlayer.name}` : roleLabel}${profileText}${matchText}`;
        const vector = marker.querySelector('[data-v2-vector]');
        vector.style.width = `${Math.min(32, speed * 3.2)}px`;
        vector.style.transform = `rotate(${Math.atan2(vy, vx) * 180 / Math.PI}deg)`;

        zone.style.left = `${left.zoneX}%`;
        zone.style.top = `${left.zoneY}%`;
        zone.style.width = `${left.zoneRx * 2}%`;
        zone.style.height = `${left.zoneRy * 2}%`;
        zone.querySelector('[data-v2-zone-label]').textContent = responsibilityLabel;
      });

      const ballX = leftFrame.ball.x + (rightFrame.ball.x - leftFrame.ball.x) * frameMix;
      const ballY = leftFrame.ball.y + (rightFrame.ball.y - leftFrame.ball.y) * frameMix;
      this.ballElement.style.left = `${ballX}%`;
      this.ballElement.style.top = `${ballY}%`;
      const visibleBall = frameMix < 0.5 ? leftFrame.ball : rightFrame.ball;
      const ballMode = visibleBall.mode;
      const restartKind = visibleBall.restartKind;
      const restartPhase = visibleBall.restartPhase;
      this.ballElement.dataset.mode = ballMode;
      this.root.classList.toggle('is-goal-celebration', restartPhase === 'goal-celebration');
      this.root.classList.toggle('is-kickoff-setup', restartPhase === 'kickoff-setup');
      this.ballElement.dataset.state = ballMode === 'pass'
        ? 'PAS'
        : ballMode === 'shot'
          ? 'ŞUT'
        : ballMode === 'keeper-held'
          ? 'KALECİDE'
        : ballMode === 'dead'
          ? EVENT_LABELS[restartKind] || 'DURDU'
        : ballMode === 'dribble'
          ? 'DOKUNUŞ'
        : ballMode === 'loose'
          ? 'BOŞTA'
          : '';
      const visibleFrame = frameMix < 0.5 ? leftFrame : rightFrame;
      const possessionTeam = visibleFrame.possessionTeam;
      const phase = visibleFrame.phase;
      const score = visibleFrame.score;
      this.root.dataset.possessionTeam = String(possessionTeam);
      this.phaseElement.textContent = restartPhase === 'goal-celebration'
        ? `${possessionTeam === 1 ? 'MAVİ' : 'KIRMIZI'} · GOL SEVİNCİ`
        : restartPhase === 'kickoff-setup'
          ? `${possessionTeam === 1 ? 'MAVİ' : 'KIRMIZI'} · SANTRA DİZİLİŞİ`
          : ballMode === 'dead' && restartKind
            ? `${possessionTeam === 1 ? 'MAVİ' : 'KIRMIZI'} · ${EVENT_LABELS[restartKind] || restartKind}`
        : `${possessionTeam === 1 ? 'MAVİ' : 'KIRMIZI'} · ${PHASE_LABELS[phase] || phase}`;
      if (this.scoreElement) this.scoreElement.textContent = `${score[1]} - ${score[2]}`;
    }
  }

  window.FootballV2Lab = {
    render(options = {}) {
      const rootId = options.rootId || 'football-v2-lab';
      return `
        <section class="football-v2-lab" id="${escapeHtml(rootId)}">
          <header class="football-v2-lab__header">
            <div>
              <span class="football-v2-lab__eyebrow" data-v2-eyebrow>BETA FUTBOL V2 · PAKET 8</span>
              <h3 data-v2-title>Tek Dünya Durumlu Hareket Laboratuvarı</h3>
              <p data-v2-description>Sunucu 20 Hz’de karar ve hareket üretir; bu ekran yalnızca kareler arasında geçiş yapar.</p>
            </div>
            <div class="football-v2-lab__live">
              <strong class="football-v2-lab__score" data-v2-score>0 - 0</strong>
              <div class="football-v2-lab__status">
                <span data-v2-status>HAZIR</span>
                <strong data-v2-clock>00:00.0</strong>
              </div>
            </div>
          </header>
          <div class="football-v2-lab__toolbar">
            <div class="football-v2-lab__phase" data-v2-phase>DÜNYA HAZIRLANIYOR</div>
            <div class="football-v2-lab__actions">
              <label><input type="checkbox" data-v2-debug> Görev bölgelerini göster</label>
              <button type="button" data-v2-action="play">Başlat</button>
              <button type="button" data-v2-action="reset">Başa Sar</button>
            </div>
          </div>
          <div class="football-v2-lab__workspace">
            <div class="football-v2-pitch" data-v2-pitch>
              <div class="football-v2-pitch__markings" aria-hidden="true">
                <span class="football-v2-pitch__half"></span>
                <span class="football-v2-pitch__circle"></span>
                <span class="football-v2-pitch__box is-left"></span>
                <span class="football-v2-pitch__box is-right"></span>
                <span class="football-v2-pitch__goal is-left"></span>
                <span class="football-v2-pitch__goal is-right"></span>
              </div>
              <div class="football-v2-zones" data-v2-zones></div>
              <div class="football-v2-players" data-v2-players></div>
              <div class="football-v2-ball" data-v2-ball></div>
            </div>
            <aside class="football-v2-events">
              <div class="football-v2-events__title">
                <strong>Dünya olayları</strong>
                <span>Önceden yazılmış sahne yok</span>
              </div>
              <div data-v2-events></div>
            </aside>
          </div>
          <div class="football-v2-telemetry" data-v2-telemetry></div>
          <section class="football-v2-match-center" data-v2-match-center></section>
        </section>
      `;
    },

    mount(rootId) {
      const root = document.getElementById(rootId);
      if (!root) throw new Error(`Football V2 laboratuvar kökü bulunamadı: ${rootId}`);
      return new FootballV2LabPlayer(root);
    }
  };
})();
