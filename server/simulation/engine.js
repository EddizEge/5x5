// ==============================================
// 🎮 Maç Simülasyon Motoru
// ==============================================

const db = require('../db');
const { createFootballIntelligence, createFootballMatchState } = require('./football-ai');
const { createDust2RoundDirector } = require('./shooter-ai');
const { createCsEconomyManager } = require('./cs-economy');
const { buildCsBetaTelemetry } = require('./cs-beta-telemetry');
const {
  compactCsVisualEvent,
  createCsVisualPayloadCache
} = require('./cs-visual-payload');
const { createFootballProfile, normalizedSkill } = require('./football-profile');
const { createSeededRng, createSimulationSeed } = require('./seeded-rng');

let currentBranch = '';

function getTacticalModifier(eraId, branch, key) {
  try {
     const row = db.prepare('SELECT modifier_value FROM character_era_tactics_modifiers WHERE character_era_id = ? AND branch = ? AND modifier_key = ?').get(eraId, branch, key);
     return row ? row.modifier_value : 0;
  } catch (e) {
     return 0;
  }
}

function getTacticsKey(branch, role, style) {
  if (!role) return '';
  if (branch === 'futbol') {
     const idx = parseInt(role.replace('SLOT_', ''));
     if (isNaN(idx)) return '';
     
     const currentStyle = style || 'dengeli';
     let slots = [];
     if (currentStyle === 'defansif') {
        slots = ['defans', 'defans', 'defans', 'orta', 'hücum'];
     } else if (currentStyle === 'dengeli') {
        slots = ['defans', 'defans', 'orta', 'orta', 'hücum'];
     } else if (currentStyle === 'ofansif') {
        slots = ['defans', 'defans', 'orta', 'hücum', 'hücum'];
     }
     return slots[idx] || '';
  }
  if (branch === 'fifa') {
     return role.split(' ')[0];
  }
  return role;
}

function getCharName(char) {
  if (!char) return 'Bilinmeyen';
  
  let roleDisplay = char.role || '';
  if (roleDisplay && currentBranch === 'futbol') {
     // Halı Saha Pozisyon Eşlemesi (Taktik stiline göre dinamik)
     const idx = parseInt(roleDisplay.toUpperCase().replace('SLOT_', ''));
     if (!isNaN(idx)) {
        const currentStyle = char.tacticStyle || 'dengeli';
        let slots = [];
        if (currentStyle === 'defansif') {
           slots = ['Defans', 'Defans', 'Defans', 'Orta Saha', 'Forvet'];
        } else if (currentStyle === 'dengeli') {
           slots = ['Defans', 'Defans', 'Orta Saha', 'Orta Saha', 'Forvet'];
        } else if (currentStyle === 'ofansif') {
           slots = ['Defans', 'Defans', 'Orta Saha', 'Forvet', 'Forvet'];
        }
        roleDisplay = slots[idx] || 'Oyuncu';
     }
  } else if (currentBranch === 'cs') {
     // CS:GO/CS2'de rol gösterimi yok!
     roleDisplay = '';
  }
  
  const roleStr = roleDisplay ? ` (${roleDisplay})` : '';
  const ageStr = (char.age && char.age > 0) ? `${char.age} yaş ` : '';
  return `${char.emoji || char.avatar_emoji || '👤'} ${ageStr}${char.name || char.character_name || 'Bilinmeyen'}${roleStr}`;
}

function getRating(char, branch) {
  if (!char) return 50;
  const val = char['rating_' + branch] || char.rating;
  return typeof val === 'number' ? val : 50;
}

function simulateMatch(
  team1Data,
  team2Data,
  branch,
  isTactical = false,
  isVisualBeta = isTactical,
  simulationOptions = {}
) {
  const requestedSeed = typeof simulationOptions === 'string'
    ? simulationOptions
    : simulationOptions?.seed;
  const simulationSeed = String(requestedSeed || createSimulationSeed(branch));
  const originalRandom = Math.random;
  Math.random = createSeededRng(simulationSeed);
  currentBranch = branch;
  try {
    const team1 = Array.isArray(team1Data) ? [...team1Data] : [...team1Data.characters];
    const team2 = Array.isArray(team2Data) ? [...team2Data] : [...team2Data.characters];
    const t1Name = Array.isArray(team1Data) ? 'Mavi Takım' : team1Data.displayName;
    const t2Name = Array.isArray(team2Data) ? 'Kırmızı Takım' : team2Data.displayName;
    
    const t1Style = (team1Data && team1Data.style) ? team1Data.style : 'dengeli';
    const t2Style = (team2Data && team2Data.style) ? team2Data.style : 'dengeli';
    team1.forEach(char => { if (char) char.tacticStyle = t1Style; });
    team2.forEach(char => { if (char) char.tacticStyle = t2Style; });

    if (isTactical) {
      
      team1.forEach(char => {
         if (char && char.character_era_id) {
            const styleKey = 'style_' + t1Style;
            const styleMod = getTacticalModifier(char.character_era_id, branch, styleKey);
            const roleKey = getTacticsKey(branch, char.role, t1Style);
            const roleMod = roleKey ? getTacticalModifier(char.character_era_id, branch, roleKey) : 0;
            
            const ratingKey = 'rating_' + branch;
            if (typeof char[ratingKey] === 'number') {
               char[ratingKey] += (styleMod + roleMod);
            }
         }
      });

      team2.forEach(char => {
         if (char && char.character_era_id) {
            const styleKey = 'style_' + t2Style;
            const styleMod = getTacticalModifier(char.character_era_id, branch, styleKey);
            const roleKey = getTacticsKey(branch, char.role, t2Style);
            const roleMod = roleKey ? getTacticalModifier(char.character_era_id, branch, roleKey) : 0;
            
            const ratingKey = 'rating_' + branch;
            if (typeof char[ratingKey] === 'number') {
               char[ratingKey] += (styleMod + roleMod);
            }
         }
      });
    }

    if (branch === 'futbol') {
      const assignFutbolRoles = (team, style) => {
        const roles = style === 'defansif'
          ? ['defans', 'defans', 'defans', 'orta', 'hücum']
          : style === 'ofansif'
            ? ['defans', 'defans', 'orta', 'hücum', 'hücum']
            : ['defans', 'defans', 'orta', 'orta', 'hücum'];
        team.slice(0, 5).forEach((char, index) => {
          if (!char.visualRole) char.visualRole = roles[index] || 'orta';
        });
      };
      assignFutbolRoles(team1, t1Style);
      assignFutbolRoles(team2, t2Style);
      team1.push({ name: 'Bot Kaleci', emoji: '🧤', age: 30, rating: 65, isBot: true, isGoalkeeper: true, visualRole: 'GK' });
      team2.push({ name: 'Bot Kaleci', emoji: '🧤', age: 30, rating: 65, isBot: true, isGoalkeeper: true, visualRole: 'GK' });
    } else if (branch === 'fifa') {
      const fifaRoles = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LDM', 'RDM', 'LAM', 'CAM', 'RAM', 'ST'];
      const preferredCharacterRoles = ['LCB', 'RB', 'LDM', 'CAM', 'ST', 'LB', 'RCB', 'RDM', 'LAM', 'RAM'];

      const completeFifaSquad = (team) => {
        const usedRoles = new Set();

        team.forEach((char, index) => {
          let role = String(char.visualRole || char.role || '').toUpperCase().split(' ')[0];
          if (!fifaRoles.includes(role) || usedRoles.has(role) || role === 'GK') {
            role = preferredCharacterRoles.find(candidate => !usedRoles.has(candidate)) || preferredCharacterRoles[index % preferredCharacterRoles.length];
          }
          char.visualRole = role;
          usedRoles.add(role);
        });

        fifaRoles.forEach(role => {
          if (usedRoles.has(role)) return;
          team.push({
            name: `Bot ${role}`,
            emoji: role === 'GK' ? '🧤' : '◌',
            age: 24,
            rating: role === 'GK' ? 65 : 58,
            rating_fifa: role === 'GK' ? 65 : 58,
            role,
            visualRole: role,
            isBot: true,
            isGoalkeeper: role === 'GK'
          });
        });
      };

      completeFifaSquad(team1);
      completeFifaSquad(team2);
    }

    const getFootballProfile = char =>
      createFootballProfile(char, branch, getRating(char, branch));

    const lines = [];
    let t1Score = 0;
    let t2Score = 0;
    let shootoutWinner = 0;
    let footballSpatialTelemetry = null;
    
    const matchState = {
      t1: { name: t1Name, towers: 0, dragons: 0, barons: 0, stats: { poss: 50, shots: 0, shotsOnTarget: 0, xg: 0.0, corners: 0, bigChances: 0 }, players: [] },
      t2: { name: t2Name, towers: 0, dragons: 0, barons: 0, stats: { poss: 50, shots: 0, shotsOnTarget: 0, xg: 0.0, corners: 0, bigChances: 0 }, players: [] }
    };

    const createPlayerState = (c, style, order) => ({
      idName: getCharName(c),
      name: c.name || c.character_name || 'Bilinmeyen',
      emoji: c.emoji || c.avatar_emoji || '👤',
      role: c.role || '',
      visualRole: c.visualRole || (c.isGoalkeeper ? 'GK' : getTacticsKey(branch, c.role, style)),
      tacticStyle: style,
      order,
      cardRating: Math.round(getRating(c, branch)),
      footballProfile: getFootballProfile(c),
      k: 0,
      d: 0,
      a: 0,
      cs: 0,
      rating: 6.5,
      ratingBreakdown: { attack: 0, distribution: 0, possession: 0, defense: 0, discipline: 0 },
      fouls: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      expectedPassesCompleted: 0,
      passOverExpected: 0,
      actionValue: 0,
      progressiveActions: 0,
      dribblesAttempted: 0,
      dribblesWon: 0,
      shots: 0,
      shotsOnTarget: 0,
      tackles: 0,
      interceptions: 0,
      clearances: 0,
      blocks: 0,
      saves: 0,
      goalsConceded: 0,
      keyPasses: 0,
      chancesCreated: 0,
      bigChancesCreated: 0,
      bigChances: 0,
      bigChancesMissed: 0,
      possessionLost: 0,
      expectedGoals: 0,
      expectedAssists: 0,
      penaltiesTaken: 0,
      penaltiesScored: 0,
      penaltiesMissed: 0,
      isBot: Boolean(c.isBot),
      isGoalkeeper: Boolean(c.isGoalkeeper)
    });

    team1.forEach((c, index) => matchState.t1.players.push(createPlayerState(c, t1Style, index)));
    team2.forEach((c, index) => matchState.t2.players.push(createPlayerState(c, t2Style, index)));

    const getPlayerState = (teamIndex, char) => {
      const idName = getCharName(char);
      const team = teamIndex === 1 ? matchState.t1.players : matchState.t2.players;
      return team.find(p => p.idName === idName) || team[0];
    };

    const getGoalkeeperState = teamIndex => {
      const team = teamIndex === 1 ? matchState.t1.players : matchState.t2.players;
      return team.find(player => player.isGoalkeeper) || team[0];
    };

    const refreshFootballRatings = () => {
      if (branch !== 'futbol' && branch !== 'fifa') return;
      [...matchState.t1.players, ...matchState.t2.players].forEach(player => {
        const role = String(player.visualRole || player.role || '').toUpperCase();
        const isKeeper = player.isGoalkeeper;
        const isDefender = role.includes('DEFANS') || ['LB', 'LCB', 'RCB', 'RB'].includes(role);
        const goalWeight = isKeeper ? 0 : isDefender ? 1.08 : role === 'ST' || role.includes('HÜCUM') ? 0.86 : 0.96;
        const attack =
          player.k * goalWeight +
          player.a * 0.58 +
          player.shotsOnTarget * 0.07 +
          (player.k - player.expectedGoals) * 0.2 -
          player.bigChancesMissed * 0.22;
        const failedPasses = Math.max(0, player.passesAttempted - player.passesCompleted);
        const distribution =
          player.passesCompleted * 0.009 -
          failedPasses * 0.045 +
          player.keyPasses * 0.13 +
          player.expectedAssists * 0.12 +
          Math.max(-2.5, Math.min(2.5, player.passOverExpected || 0)) * 0.075 +
          Math.max(-1.5, Math.min(3, player.actionValue || 0)) * 0.16;
        const possession =
          player.dribblesWon * 0.1 -
          Math.max(0, player.dribblesAttempted - player.dribblesWon) * 0.09 -
          player.possessionLost * 0.025;
        const defense =
          player.tackles * 0.12 +
          player.interceptions * 0.14 +
          player.clearances * 0.055 +
          player.blocks * 0.16 +
          player.saves * 0.2 -
          player.goalsConceded * (isKeeper ? 0.14 : 0);
        const discipline =
          -player.fouls * 0.09 +
          player.penaltiesScored * 0.16 -
          player.penaltiesMissed * 0.62;
        // Halı saha, daha kısa sürede ve daha az oyuncuyla çok daha fazla aksiyon
        // ürettiği için aynı katkıyı 11v11 FIFA maçından daha düşük katsayıyla
        // değerlendir. Böylece 10.0 sıra dışı kalır ve iki branş aynı 3-10
        // ölçeğinde karşılaştırılabilir.
        const eventScale = branch === 'futbol' ? 0.6 : 1;
        const scaled = {
          attack: attack * eventScale,
          distribution: distribution * eventScale,
          possession: possession * eventScale,
          defense: defense * eventScale,
          discipline: discipline * eventScale
        };
        player.ratingBreakdown = {
          attack: parseFloat(scaled.attack.toFixed(2)),
          distribution: parseFloat(scaled.distribution.toFixed(2)),
          possession: parseFloat(scaled.possession.toFixed(2)),
          defense: parseFloat(scaled.defense.toFixed(2)),
          discipline: parseFloat(scaled.discipline.toFixed(2))
        };
        player.rating = parseFloat(Math.min(
          10,
          Math.max(
            3,
            6.5 + scaled.attack + scaled.distribution + scaled.possession + scaled.defense + scaled.discipline
          )
        ).toFixed(1));
      });
    };

    const csPayloadCache = createCsVisualPayloadCache();
    let lastCsStateJson = null;
    const addLine = (text, teamId = 0, visualEvent = null) => {
      refreshFootballRatings();
      let state = null;
      if (branch === 'cs' && isVisualBeta) {
        const serialized = JSON.stringify(matchState);
        if (serialized !== lastCsStateJson) {
          state = JSON.parse(serialized);
          lastCsStateJson = serialized;
        }
        if (visualEvent?.domain === 'shooter') {
          compactCsVisualEvent(visualEvent, csPayloadCache);
        }
      } else {
        state = JSON.parse(JSON.stringify(matchState));
      }
      const line = {
        text,
        s1: t1Score,
        s2: t2Score,
        teamId,
        visualEvent
      };
      if (state) line.state = state;
      lines.push(line);
    };
    
    addLine(`═══ ${branch.toUpperCase()} MAÇI BAŞLIYOR: ${t1Name} vs ${t2Name} ${isVisualBeta ? '(🧪 BETA)' : ''} ═══`);
    if (isTactical) {
       const t1Style = (team1Data && team1Data.style) ? team1Data.style.toUpperCase() : 'DENGELİ';
       const t2Style = (team2Data && team2Data.style) ? team2Data.style.toUpperCase() : 'DENGELİ';
       addLine(`⚙️ Taktikler - ${t1Name}: ${t1Style} | ${t2Name}: ${t2Style}`);
    }
    
    // Stats tracking
    const charStats = {};
    const trackStat = (char) => {
      if (!char) return;
      const name = char.name || char.character_name || 'Bilinmeyen';
      const isT1 = team1.includes(char);
      if (!charStats[name]) {
        charStats[name] = { name, emoji: char.emoji || char.avatar_emoji || '👤', team: isT1 ? 1 : 2, actions: 0 };
      }
      charStats[name].actions++;
    };

    const getEffectiveRating = (char, branch) => {
      let base = getRating(char, branch);
      const idName = getCharName(char);
      const pState = matchState.t1.players.find(p => p.idName === idName) || matchState.t2.players.find(p => p.idName === idName);
      
      if (pState && branch === 'lol') {
        // (K * 3 + A * 1 - D * 3) -> gives a bonus or penalty based on performance
        let kdaBonus = (pState.k * 3) + pState.a - (pState.d * 3);
        if (kdaBonus > 40) kdaBonus = 40;
        if (kdaBonus < -40) kdaBonus = -40;
        
        base += kdaBonus;
        if (base < 10) base = 10;
        if (base > 130) base = 130;
      }
      return base;
    };

    const randomChar = (team) => team[Math.floor(Math.random() * team.length)];
    const weightedRandomChar = (team, reverse = false, excludeBots = false) => {
      const eligibleTeam = excludeBots ? team.filter(c => !c.isBot) : team;
      if (eligibleTeam.length === 0) return team[0]; // fallback

      let totalRating = 0;
      for (const c of eligibleTeam) {
        let r = getEffectiveRating(c, branch);
        let weight = reverse ? (20000 / r) : Math.pow(r, 2);
        totalRating += weight;
      }
      let rand = Math.random() * totalRating;
      for (const c of eligibleTeam) {
        let r = getEffectiveRating(c, branch);
        let weight = reverse ? (20000 / r) : Math.pow(r, 2);
        rand -= weight;
        if (rand <= 0) return c;
      }
      return eligibleTeam[0];
    };
    
    const roll = (team) => {
      let sum = 0;
      for (const c of team) sum += Math.pow(getEffectiveRating(c, branch), 1.5);
      return sum + (Math.random() * 1000);
    };

    const getTeamPower = (t) => t.reduce((sum, c) => sum + getEffectiveRating(c, branch), 0);

    if (branch === 'futbol' || branch === 'fifa') {
      const maxMin = branch === 'futbol' ? 60 : 90;
      t1Score = 0;
      t2Score = 0;
      
      addLine(`⚽ ${branch === 'futbol' ? 'Halı Saha Maçı' : 'FIFA Karşılaşması'} Başlıyor! Düdük çaldı!`);
      
      let p1 = getTeamPower(team1);
      let p2 = getTeamPower(team2);
      
      // Calculate possession baseline
      let totalP = p1 + p2;
      let t1BasePoss = 50 + ((p1 - p2) / totalP) * 30; 
      
      // Yeni, daha yoğun maç akışı yalnızca beta görsel simülasyonunda çalışır.
      // Basit ve taktiksel lobilerin mevcut sonuç temposunu koru.
      const stepMin = isVisualBeta ? (branch === 'futbol' ? 1 : 4) : (branch === 'futbol' ? 5 : 7);
      const stepMax = isVisualBeta ? (branch === 'futbol' ? 3 : 6) : (branch === 'futbol' ? 7 : 9);
      const minPasses = branch === 'futbol' && isVisualBeta ? 2 : (branch === 'futbol' ? 3 : 4);
      const maxPasses = branch === 'futbol' && isVisualBeta ? 4 : (branch === 'futbol' ? 5 : 7);
      const roleOrder = { GK: 0, LB: 1, LCB: 1, RCB: 1, RB: 1, defans: 1, LDM: 2, RDM: 2, orta: 2, LAM: 3, CAM: 3, RAM: 3, ST: 4, hücum: 4 };
      const possessionTouches = { 1: 1, 2: 1 };
      let lastGoalMin = -10;
      const footballMatchState = isVisualBeta
        ? createFootballMatchState({
            branch,
            team1,
            team2
          })
        : null;

      const chooseBuildPlayer = (roster, previous, progress) => {
        const candidates = roster.filter(char => char !== previous && !char.isGoalkeeper);
        if (!candidates.length) return previous || roster[0];
        const desiredRank = progress < 0.25 ? 1 : progress < 0.58 ? 2 : progress < 0.82 ? 3 : 4;
        const sorted = [...candidates].sort((a, b) => {
          const aRole = a.visualRole || getTacticsKey(branch, a.role, a.tacticStyle || 'dengeli');
          const bRole = b.visualRole || getTacticsKey(branch, b.role, b.tacticStyle || 'dengeli');
          return Math.abs((roleOrder[aRole] || 2) - desiredRank) - Math.abs((roleOrder[bRole] || 2) - desiredRank);
        });
        const pool = sorted.slice(0, Math.min(3, sorted.length));
        return pool[Math.floor(Math.random() * pool.length)];
      };

      for (let min = 1; min <= maxMin; min += Math.floor(Math.random() * (stepMax - stepMin + 1)) + stepMin) {
        const possessionExponent = isVisualBeta ? 1.7 : 2;
        const t1WinChance = Math.pow(p1, possessionExponent) /
          (Math.pow(p1, possessionExponent) + Math.pow(p2, possessionExponent));
        const isTeam1 = Math.random() < t1WinChance;
        const tid = isTeam1 ? 1 : 2;
        const defendingTeamId = isTeam1 ? 2 : 1;
        const attackingTeam = isTeam1 ? team1 : team2;
        const defendingTeam = isTeam1 ? team2 : team1;
        const attackingRoster = attackingTeam.filter(char => !char.isGoalkeeper);
        const defendingRoster = defendingTeam.filter(char => !char.isGoalkeeper);
        const teamStats = isTeam1 ? matchState.t1.stats : matchState.t2.stats;
        const visualLane = [28, 36, 43, 50, 57, 64, 72][Math.floor(Math.random() * 7)];
        const passCount = Math.floor(Math.random() * (maxPasses - minPasses + 1)) + minPasses;
        const footballAI = isVisualBeta
          ? createFootballIntelligence({
              branch,
              attackers: attackingTeam,
              defenders: defendingTeam,
              teamId: tid,
              ratingOf: player => getEffectiveRating(player, branch),
              profileOf: getFootballProfile,
              sharedState: footballMatchState
            })
          : null;
        let carrier = footballAI?.preparePossession() || chooseBuildPlayer(attackingRoster, null, 0.12);
        let previousCarrier = null;
        let currentLane = visualLane;
        let dribblesInSequence = 0;
        let buildQuality = 0.34;
        let sequenceStopped = false;
        let lastSupport = null;
        let immediateChance = null;

        if (isVisualBeta) {
          const offBallPlan = footballAI.planOffBallRoles(carrier, currentLane, 'build-up');
          addLine('', tid, {
            type: 'shape-update',
            teamId: tid,
            actor: getPlayerState(tid, carrier),
            minute: min,
            second: 1,
            lane: currentLane,
            ballX: footballAI.pointOf(carrier).x,
            ballY: footballAI.pointOf(carrier).y,
            phase: 'build-up',
            assignments: offBallPlan.map(assignment => ({
               actor: getPlayerState(tid, assignment.player),
               role: assignment.role,
               order: assignment.order || 0,
               toX: assignment.destination.x,
              toY: assignment.destination.y
            }))
          });
          const defensivePlan = footballAI.planDefensiveRoles(carrier, currentLane, 'build-up');
          const primaryDefender = defensivePlan.find(assignment => assignment.role === 'primary-press');
          addLine('', defendingTeamId, {
            type: 'defensive-shape',
            teamId: defendingTeamId,
            opponentTeamId: tid,
            actor: primaryDefender
              ? getPlayerState(defendingTeamId, primaryDefender.player)
              : null,
            victim: getPlayerState(tid, carrier),
            minute: min,
            second: 2,
            lane: currentLane,
            ballX: footballAI.pointOf(carrier).x,
            ballY: footballAI.pointOf(carrier).y,
            phase: 'build-up',
            assignments: defensivePlan.map(assignment => ({
               actor: getPlayerState(defendingTeamId, assignment.player),
               role: assignment.role,
               order: assignment.order || 0,
              markTarget: assignment.markTarget
                ? getPlayerState(tid, assignment.markTarget)
                : null,
              toX: assignment.destination.x,
              toY: assignment.destination.y
            }))
          });
          for (let passIndex = 0; passIndex < passCount; passIndex++) {
            const progress = Math.min(0.96, (passIndex + 1) / passCount);
            const phase = progress < 0.32 ? 'build-up' : progress < 0.75 ? 'middle' : 'final-third';
            const isFinalPass = passIndex === passCount - 1;
            const onBallDecision = footballAI.onBallDecision(carrier, buildQuality, currentLane);

            if (onBallDecision.type === 'shot') {
              immediateChance = onBallDecision.shot;
              footballAI.recordDecision({
                type: 'shot',
                forcedOneOnOne: onBallDecision.forcedOneOnOne
              });
              break;
            }

            if (onBallDecision.type === 'carry' && dribblesInSequence < 2) {
              const carryOrigin = { ...footballAI.pointOf(carrier) };
              const carrySide = Math.random() < 0.5 ? -1 : 1;
              currentLane = Math.min(74, Math.max(26, currentLane + carrySide * (2 + Math.random() * 2)));
              const carryTarget = footballAI.moveCarrierAfterDribble(carrier, currentLane, carrySide);
              const carrierState = getPlayerState(tid, carrier);
              const carryActionValue = footballAI.movementActionValue(carryOrigin, carryTarget, true);
              carrierState.dribblesAttempted++;
              carrierState.dribblesWon++;
              carrierState.actionValue = parseFloat((carrierState.actionValue + carryActionValue).toFixed(3));
              if (carryActionValue > 0.055) carrierState.progressiveActions++;
              carrierState.rating = Math.min(10, carrierState.rating + 0.06);
              dribblesInSequence++;
              possessionTouches[tid]++;
              addLine('', tid, {
                type: 'dribble',
                teamId: tid,
                actor: carrierState,
                minute: min,
                second: Math.max(1, Math.floor(((passIndex + 0.4) / (passCount + 2)) * 52)),
                lane: currentLane,
                phase,
                progress: footballAI.progressAt(carryTarget),
                side: carrySide,
                dribbleKind: 'carry',
                won: true,
                pressure: onBallDecision.pressure,
                actionValue: carryActionValue,
                fromX: carryOrigin.x,
                fromY: carryOrigin.y,
                toX: carryTarget.x,
                toY: carryTarget.y
              });
              footballAI.recordDecision({ type: 'carry', openAdvance: true });
              footballAI.recordPossession(carrier, phase);
              buildQuality = Math.min(1, buildQuality + 0.075);

              const shotAfterCarry = footballAI.onBallDecision(carrier, buildQuality, currentLane);
              if (shotAfterCarry.type === 'shot') {
                immediateChance = shotAfterCarry.shot;
                footballAI.recordDecision({
                  type: 'shot',
                  forcedOneOnOne: shotAfterCarry.forcedOneOnOne
                });
                break;
              }
              continue;
            }

            const receiverChoice = footballAI.chooseReceiver(carrier, isFinalPass ? 0.98 : progress, currentLane, isFinalPass);
            if (!receiverChoice?.player) {
              sequenceStopped = true;
              break;
            }
            const receiver = receiverChoice.player;
            const originPoint = { ...footballAI.pointOf(carrier) };
            const targetPoint = { ...footballAI.pointOf(receiver) };
            const support = footballAI.chooseSupportRun(carrier, receiver, progress, currentLane);
            const interception = footballAI.passInterceptionRisk(carrier, receiverChoice);
            const recyclesPlay = passIndex > 0 && receiverChoice.forwardGain < 0.08;
            const switchesPlay = !recyclesPlay && Math.abs(targetPoint.y - originPoint.y) > 24;
            const crossingPlay = !recyclesPlay && isFinalPass &&
              Math.abs(originPoint.y - 50) > 17 &&
              Math.abs(targetPoint.y - 50) < 15;
            const throughPlay = !recyclesPlay && !crossingPlay && progress > 0.56 &&
              receiverChoice.laneOpenness > 0.58 && receiverChoice.forwardGain > 0.38;
            const cutbackPlay = !recyclesPlay && !crossingPlay && !throughPlay && progress > 0.7 &&
              Math.abs(originPoint.y - 50) > 17 && targetPoint.x * (tid === 1 ? 1 : -1) < originPoint.x * (tid === 1 ? 1 : -1);
            const oneTwoPlay = !recyclesPlay && !crossingPlay && !throughPlay && !cutbackPlay && passIndex > 0 && Math.random() < 0.2;
            currentLane = switchesPlay
              ? Math.min(74, Math.max(26, 100 - currentLane + (Math.random() * 6 - 3)))
              : Math.min(74, Math.max(26, currentLane + (Math.random() * 8 - 4)));
            if (crossingPlay) currentLane = Math.random() < 0.5 ? 27 : 73;
            possessionTouches[tid]++;
            const passActorState = getPlayerState(tid, carrier);
            passActorState.passesAttempted++;
            const expectedPassSuccess = interception.expectedSuccess;
            const completedPassValue = footballAI.passActionValue(carrier, receiverChoice, true);
            const failedPassValue = footballAI.passActionValue(carrier, receiverChoice, false);
            const passFailed = Math.random() < interception.risk;
            const interceptor = passFailed
              ? (interception.defender || weightedRandomChar(defendingRoster, true, false))
              : null;
            const interceptPoint = passFailed
              ? footballAI.passInterceptionPoint(carrier, receiver, interceptor)
              : null;
            passActorState.expectedPassesCompleted = parseFloat(
              (passActorState.expectedPassesCompleted + expectedPassSuccess).toFixed(3)
            );
            footballAI.recordDecision({
              type: 'pass',
              backward: receiverChoice.forwardGain < -0.025,
              openAdvance: receiverChoice.openAdvance
            });

            const passKind = recyclesPlay
              ? 'recycle'
              : crossingPlay
                ? 'cross'
                : throughPlay
                  ? 'through'
                  : cutbackPlay
                    ? 'cutback'
                    : oneTwoPlay
                      ? 'one-two'
                      : switchesPlay
                        ? 'switch'
                      : 'short';

            if (support && Math.random() < (passIndex === 0 ? 0.38 : 0.56)) {
              lastSupport = support;
              addLine('', tid, {
                type: 'support-run',
                teamId: tid,
                actor: getPlayerState(tid, support.player),
                target: getPlayerState(tid, receiver),
                minute: min,
                second: Math.max(1, Math.floor(((passIndex + 0.45) / (passCount + 2)) * 52)),
                phase,
                runKind: support.runKind,
                toX: support.destination.x,
                toY: support.destination.y
              });
            }

            addLine('', tid, {
              type: 'pass',
              teamId: tid,
              actor: getPlayerState(tid, carrier),
              target: getPlayerState(tid, receiver),
              minute: min,
              second: Math.floor(((passIndex + 1) / (passCount + 2)) * 52),
              lane: currentLane,
              phase: recyclesPlay ? 'build-up' : phase,
              progress: recyclesPlay ? Math.max(0.15, progress - 0.2) : progress,
              passKind,
              fromX: originPoint.x,
              fromY: originPoint.y,
              toX: targetPoint.x,
              toY: targetPoint.y,
              completed: !passFailed,
              intercepted: passFailed,
              interceptor: interceptor
                ? getPlayerState(defendingTeamId, interceptor)
                : null,
              interceptX: interceptPoint?.x,
              interceptY: interceptPoint?.y,
              pressure: 1 - receiverChoice.space,
              laneOpenness: receiverChoice.laneOpenness,
              expectedPassSuccess,
              actionValue: passFailed ? failedPassValue : completedPassValue,
              sequenceIndex: passIndex + 1,
              sequenceLength: passCount
            });
            buildQuality = Math.min(
              1,
              buildQuality * 0.72 +
              receiverChoice.space * 0.13 +
              receiverChoice.laneOpenness * 0.12 +
              Math.max(0, receiverChoice.forwardGain) * 0.09
            );

            if (passFailed) {
              const interceptorState = getPlayerState(defendingTeamId, interceptor);
              passActorState.actionValue = parseFloat(
                (passActorState.actionValue + failedPassValue).toFixed(3)
              );
              passActorState.passOverExpected = parseFloat(
                (passActorState.passesCompleted - passActorState.expectedPassesCompleted).toFixed(3)
              );
              passActorState.possessionLost++;
              passActorState.rating = Math.max(3, passActorState.rating - 0.08);
              interceptorState.interceptions++;
              interceptorState.rating = Math.min(10, interceptorState.rating + 0.15);
              addLine(`⏱️ ${min}'. Dakika: ${getCharName(interceptor)} pas yolunu okuyup hücumu başlamadan kesti!`, defendingTeamId, {
                type: 'interception',
                teamId: defendingTeamId,
                actor: getPlayerState(defendingTeamId, interceptor),
                victim: getPlayerState(tid, receiver),
                minute: min,
                second: Math.min(57, Math.floor(((passIndex + 1.35) / (passCount + 2)) * 52)),
                lane: currentLane,
                phase,
                won: true,
                fromPass: true,
                interceptX: interceptPoint.x,
                interceptY: interceptPoint.y
              });
              possessionTouches[defendingTeamId] += 2;
              footballAI.recordTurnover(interceptor, interceptPoint, 'interception');
              sequenceStopped = true;
              carrier = null;
              break;
            }

            passActorState.passesCompleted++;
            passActorState.actionValue = parseFloat(
              (passActorState.actionValue + completedPassValue).toFixed(3)
            );
            passActorState.passOverExpected = parseFloat(
              (passActorState.passesCompleted - passActorState.expectedPassesCompleted).toFixed(3)
            );
            if (completedPassValue > 0.055) passActorState.progressiveActions++;
            passActorState.rating = Math.min(10, passActorState.rating + 0.015);
            previousCarrier = carrier;
            carrier = receiver;
            footballAI.recordPossession(carrier, phase);

            if (receiverChoice.breakaway) {
              immediateChance = footballAI.shotContext(carrier, buildQuality, currentLane, true);
              break;
            }

            const dribbleChance = branch === 'fifa' ? 0.21 : 0.2;
            const canTakeOn = !recyclesPlay &&
              progress > 0.24 &&
              progress < 0.92 &&
              dribblesInSequence < 2 &&
              Math.random() < dribbleChance;
            if (canTakeOn) {
              const duel = footballAI.dribbleDuel(carrier);
              const dribbleDefender = duel.defender || weightedRandomChar(defendingRoster, true, false);
              const dribbleSide = Math.random() < 0.5 ? -1 : 1;
              dribblesInSequence++;
              currentLane = Math.min(74, Math.max(26, currentLane + dribbleSide * (3 + Math.random() * 3)));
              possessionTouches[tid]++;
              const dribbleOrigin = { ...footballAI.pointOf(carrier) };
              const dribblerState = getPlayerState(tid, carrier);
              dribblerState.dribblesAttempted++;
              const dribbleTarget = duel.won
                ? footballAI.moveCarrierAfterDribble(carrier, currentLane, dribbleSide)
                : dribbleOrigin;
              const dribbleActionValue = footballAI.movementActionValue(
                dribbleOrigin,
                dribbleTarget,
                duel.won
              );
              dribblerState.actionValue = parseFloat(
                (dribblerState.actionValue + dribbleActionValue).toFixed(3)
              );
              if (duel.won && dribbleActionValue > 0.055) dribblerState.progressiveActions++;
              addLine('', tid, {
                type: 'dribble',
                teamId: tid,
                actor: getPlayerState(tid, carrier),
                victim: getPlayerState(defendingTeamId, dribbleDefender),
                minute: min,
                second: Math.min(56, Math.floor(((passIndex + 1.45) / (passCount + 2)) * 52)),
                lane: currentLane,
                phase,
                progress,
                side: dribbleSide,
                dribbleKind: branch === 'fifa' && Math.random() < 0.35 ? 'skill' : 'carry',
                won: duel.won,
                pressure: duel.pressure,
                actionValue: dribbleActionValue,
                fromX: dribbleOrigin.x,
                fromY: dribbleOrigin.y,
                toX: dribbleTarget.x,
                toY: dribbleTarget.y
              });
              if (!duel.won) {
                const tacklerState = getPlayerState(defendingTeamId, dribbleDefender);
                dribblerState.possessionLost++;
                dribblerState.rating = Math.max(3, dribblerState.rating - 0.1);
                tacklerState.tackles++;
                tacklerState.rating = Math.min(10, tacklerState.rating + 0.2);
                addLine(`⏱️ ${min}'. Dakika: ${getCharName(dribbleDefender)} doğru anda ayağını uzatıp topu kazandı!`, defendingTeamId, {
                  type: 'tackle',
                  teamId: defendingTeamId,
                  actor: getPlayerState(defendingTeamId, dribbleDefender),
                  victim: getPlayerState(tid, carrier),
                  minute: min,
                  second: Math.min(58, Math.floor(((passIndex + 1.7) / (passCount + 2)) * 52)),
                  lane: currentLane,
                  phase,
                  won: true,
                  fromDribble: true,
                  tackleX: dribbleOrigin.x,
                  tackleY: dribbleOrigin.y
                });
                possessionTouches[defendingTeamId] += 2;
                footballAI.recordTurnover(dribbleDefender, dribbleOrigin, 'tackle');
                sequenceStopped = true;
                carrier = null;
                break;
              }
              dribblerState.dribblesWon++;
              dribblerState.rating = Math.min(10, dribblerState.rating + 0.08);
              buildQuality = Math.min(1, buildQuality + 0.08 - duel.pressure * 0.035);
              footballAI.recordPossession(carrier, phase);
            }

            const openShot = footballAI.shotContext(carrier, buildQuality, currentLane);
            if (
              openShot.oneOnOne ||
              (
                openShot.canShoot &&
                openShot.pressure < (branch === 'fifa' ? 0.18 : 0.24) &&
                Math.random() < 0.82
              )
            ) {
              immediateChance = openShot;
              break;
            }
          }
        }

        if (sequenceStopped) continue;

        if (isVisualBeta && carrier && !immediateChance) {
          let finalChance = footballAI.shotContext(carrier, buildQuality, currentLane);
          let forcedAdvances = 0;
          while (!finalChance.canShoot && forcedAdvances < 2) {
            const advanceDecision = footballAI.onBallDecision(carrier, buildQuality, currentLane);
            if (!advanceDecision.openAdvance) break;

            const carryOrigin = { ...footballAI.pointOf(carrier) };
            const carrySide = Math.random() < 0.5 ? -1 : 1;
            currentLane = Math.min(74, Math.max(26, currentLane + carrySide * (1.5 + Math.random() * 2)));
            const carryTarget = footballAI.moveCarrierAfterDribble(carrier, currentLane, carrySide);
            const carrierState = getPlayerState(tid, carrier);
            const carryActionValue = footballAI.movementActionValue(carryOrigin, carryTarget, true);
            carrierState.dribblesAttempted++;
            carrierState.dribblesWon++;
            carrierState.actionValue = parseFloat((carrierState.actionValue + carryActionValue).toFixed(3));
            if (carryActionValue > 0.055) carrierState.progressiveActions++;
            carrierState.rating = Math.min(10, carrierState.rating + 0.055);
            dribblesInSequence++;
            forcedAdvances++;
            possessionTouches[tid]++;
            buildQuality = Math.min(1, buildQuality + 0.07);

            addLine('', tid, {
              type: 'dribble',
              teamId: tid,
              actor: carrierState,
              minute: min,
              second: Math.min(56, 51 + forcedAdvances * 2),
              lane: currentLane,
              phase: footballAI.progressAt(carryTarget) > 0.72 ? 'final-third' : 'middle',
              progress: footballAI.progressAt(carryTarget),
              side: carrySide,
              dribbleKind: 'carry',
              won: true,
              pressure: advanceDecision.pressure,
              actionValue: carryActionValue,
              forcedAdvance: true,
              fromX: carryOrigin.x,
              fromY: carryOrigin.y,
              toX: carryTarget.x,
              toY: carryTarget.y
            });
            footballAI.recordDecision({
              type: 'carry',
              openAdvance: true,
              forcedAdvance: true
            });
            footballAI.recordPossession(carrier, 'final-third');
            finalChance = footballAI.shotContext(carrier, buildQuality, currentLane);
          }

          if (finalChance.canShoot) {
            immediateChance = finalChance;
          } else {
            footballAI.recordPossession(carrier, 'recycle');
            continue;
          }
        }

        const totalTouches = possessionTouches[1] + possessionTouches[2];
        const touchPossession = (possessionTouches[1] / totalTouches) * 100;
        matchState.t1.stats.poss = Math.min(82, Math.max(18, Math.round((touchPossession * 0.65) + (t1BasePoss * 0.35))));
        matchState.t2.stats.poss = 100 - matchState.t1.stats.poss;

        // Görsel akışta şutu, pas zincirinin sonundaki top sahibi çeker.
        // Böylece başka bir oyuncu sahanın öbür ucundan aniden şutör olmaz.
        const attacker = (isVisualBeta && carrier) || weightedRandomChar(attackingTeam, false, true);
        const chanceContext = isVisualBeta
          ? (immediateChance || footballAI.shotContext(attacker, buildQuality, currentLane))
          : null;
        if (isVisualBeta && !chanceContext?.canShoot) {
          footballAI.recordPossession(attacker, 'recycle');
          continue;
        }
        const defensiveContext = isVisualBeta ? footballAI.defensiveContext(attacker) : null;
        const defender = chanceContext?.defender || defensiveContext?.defender || weightedRandomChar(defendingRoster, true, false);
        const assist = (isVisualBeta && previousCarrier && previousCarrier !== attacker)
          ? previousCarrier
          : weightedRandomChar(attackingTeam, false, true);
        const pAtt = getPlayerState(tid, attacker);
        const pDef = getPlayerState(defendingTeamId, defender);
        const pAss = getPlayerState(tid, assist);
        const pCarrier = getPlayerState(tid, carrier);
        const minimumRegulationGoals = branch === 'futbol' ? 2 : 1;
        const guaranteeWindow = branch === 'futbol' ? 15 : 18;
        const needsLateChance = isVisualBeta && min >= maxMin - guaranteeWindow &&
          (t1Score + t2Score) < minimumRegulationGoals;
        const outcomeRoll = isVisualBeta
          ? Math.min(0.995, Math.random() + buildQuality * 0.15 + (needsLateChance ? 0.16 : 0))
          : Math.random();

        const activePressure = chanceContext?.pressure || 0;
        const decisiveBreakaway = Boolean(chanceContext?.oneOnOne);
        const defensiveEdge = defensiveContext?.edge || 0;
        const foulLimit = decisiveBreakaway ? 0 : (isVisualBeta ? (branch === 'futbol' ? 0.03 : 0.055) : 0.10);
        const turnoverLimit = decisiveBreakaway
          ? 0
          : (isVisualBeta
              ? (branch === 'futbol'
                  ? 0.09 + activePressure * 0.06 + defensiveEdge * 0.045
                  : 0.16 + activePressure * 0.12 + defensiveEdge * 0.04)
              : 0.36);
        const clearanceLimit = decisiveBreakaway
          ? 0
          : (isVisualBeta
              ? (branch === 'futbol'
                  ? 0.18 + activePressure * 0.08 + defensiveEdge * 0.075
                  : 0.3 + activePressure * 0.17 + defensiveEdge * 0.065)
              : 0.55);

        if (outcomeRoll < foulLimit) {
          pDef.fouls++;
          pDef.rating = Math.max(3.0, pDef.rating - 0.2);
          addLine(`⏱️ ${min}'. Dakika: ${getCharName(defender)}, ${getCharName(carrier)}'ın ilerleyişini faulle durdurdu.`, defendingTeamId, isVisualBeta ? {
            type: 'foul',
            teamId: defendingTeamId,
            actor: pDef,
            victim: pCarrier,
            minute: min,
            second: 54,
            lane: visualLane,
            phase: 'middle'
          } : null);
          if (isVisualBeta) footballAI.recordSetPiece(tid, chanceContext?.point);
          continue;
        }

        if (outcomeRoll < turnoverLimit) {
          const turnoverPoint = isVisualBeta
            ? (chanceContext?.point || footballAI.pointOf(carrier))
            : null;
          pDef.rating = Math.min(10, pDef.rating + 0.2);
          pDef.tackles++;
          possessionTouches[defendingTeamId] += 2;
          addLine(`⏱️ ${min}'. Dakika: ${getCharName(defender)} zamanında bir müdahaleyle hücumu kesti!`, defendingTeamId, isVisualBeta ? {
            type: 'tackle',
            teamId: defendingTeamId,
            actor: pDef,
            victim: pCarrier,
            minute: min,
            second: 55,
            lane: visualLane,
            phase: 'middle',
            won: true,
            tackleX: turnoverPoint?.x,
            tackleY: turnoverPoint?.y
          } : null);
          if (isVisualBeta) {
            footballAI.recordTurnover(
              defender,
              turnoverPoint,
              'tackle'
            );
          }
          if (isVisualBeta && Math.random() < 0.46) {
            const counterTarget = chooseBuildPlayer(defendingRoster, defender, 0.72);
            addLine('', defendingTeamId, {
              type: 'counter',
              teamId: defendingTeamId,
              actor: pDef,
              target: getPlayerState(defendingTeamId, counterTarget),
              minute: min,
              second: 57,
              lane: Math.min(74, Math.max(26, visualLane + (Math.random() * 12 - 6))),
              phase: 'transition'
            });
          }
          continue;
        }

        if (outcomeRoll < clearanceLimit) {
          const clearer = defendingRoster[Math.floor(Math.random() * defendingRoster.length)] || defender;
          const pClearer = getPlayerState(defendingTeamId, clearer);
          pClearer.clearances++;
          pClearer.rating = Math.min(10, pClearer.rating + 0.1);
          possessionTouches[defendingTeamId]++;
          addLine(`⏱️ ${min}'. Dakika: ${getCharName(clearer)} tehlikeyi büyümeden uzaklaştırdı.`, defendingTeamId, isVisualBeta ? {
            type: 'clearance',
            teamId: defendingTeamId,
            actor: pClearer,
            victim: pCarrier,
            minute: min,
            second: 56,
            lane: visualLane,
            phase: 'final-third'
          } : null);
          if (isVisualBeta) {
            const clearanceOrigin = chanceContext?.point || footballAI.pointOf(carrier);
            footballAI.recordTurnover(clearer, {
              x: clearanceOrigin.x + (tid === 1 ? -8 : 8),
              y: clearanceOrigin.y + (Math.random() * 10 - 5)
            }, 'clearance');
          }
          continue;
        }

        const reachesShot = !isVisualBeta || decisiveBreakaway || (
          chanceContext?.canShoot &&
          Math.random() < Math.min(
            0.97,
            (branch === 'futbol' ? 0.9 : 0.82) +
              buildQuality * (branch === 'futbol' ? 0.1 : 0.14) -
              activePressure * (branch === 'futbol' ? 0.04 : 0.08) +
              (needsLateChance ? 0.09 : 0)
          )
        );
        if (isVisualBeta && !reachesShot) {
          const stopper = chanceContext?.defender || defender;
          addLine(`⏱️ ${min}'. Dakika: ${getCharName(stopper)} şut açısını kapattı, hücum yeniden kurulmak zorunda kaldı.`, defendingTeamId, {
            type: 'contain',
            teamId: defendingTeamId,
            actor: getPlayerState(defendingTeamId, stopper),
            victim: pAtt,
            minute: min,
            second: 57,
            lane: currentLane,
            phase: 'final-third',
            pressure: activePressure
          });
          footballAI.recordPossession(attacker, 'recycle');
          continue;
        }

        teamStats.shots++;
        pAtt.shots++;
        const shotRoll = Math.random();
        const closeEnoughForLateBoost = chanceContext &&
          !chanceContext.longRange &&
          chanceContext.distanceToGoal < (branch === 'futbol' ? 20 : 27);
        const lateGoalBonus = needsLateChance && closeEnoughForLateBoost
          ? (branch === 'futbol' ? 0.22 : 0.2)
          : 0;
        const goalChance = isVisualBeta
          ? Math.min(
              branch === 'futbol' ? 0.9 : 0.58,
              chanceContext.xg + lateGoalBonus
            )
          : (branch === 'futbol' ? 0.27 : 0.145);
        pAtt.expectedGoals = parseFloat((pAtt.expectedGoals + goalChance).toFixed(3));
        if (decisiveBreakaway) {
          teamStats.bigChances++;
          pAtt.bigChances++;
        }
        if (attacker !== assist) {
          pAss.keyPasses++;
          pAss.chancesCreated++;
          pAss.expectedAssists = parseFloat((pAss.expectedAssists + goalChance).toFixed(3));
          if (decisiveBreakaway) pAss.bigChancesCreated++;
        }
        const goalCooldown = branch === 'futbol' && isVisualBeta ? 1 : 4;
        const isGoal = shotRoll < goalChance && min - lastGoalMin > goalCooldown;
        if (!isGoal && decisiveBreakaway) pAtt.bigChancesMissed++;
        const shotActionValue = isVisualBeta
          ? footballAI.shotActionValue({ ...chanceContext, xg: goalChance })
          : 0;
        if (isVisualBeta) {
          pAtt.actionValue = parseFloat((pAtt.actionValue + shotActionValue).toFixed(3));
          if (shotActionValue > 0.055) pAtt.progressiveActions++;
        }
        const resolutionRoll = Math.random();
        const shooterFinishing = normalizedSkill(chanceContext?.shooterProfile, 'finishing');
        const defenderStrength = defensiveContext?.defenderStrength || 0.4;
        const blockLimit = isVisualBeta
          ? Math.min(0.68, Math.max(0.08,
              0.14 + activePressure * 0.28 + defenderStrength * 0.16 - shooterFinishing * 0.06
            ))
          : 0;
        const saveLimit = isVisualBeta
          ? Math.min(0.82, blockLimit + 0.29 + (1 - shooterFinishing) * 0.08)
          : 0.62;
        const woodworkLimit = Math.min(0.91, saveLimit + (isVisualBeta ? 0.1 : 0));
        const wasBlocked = !isGoal && isVisualBeta && resolutionRoll < blockLimit;
        const wasSaved = !isGoal && !wasBlocked && resolutionRoll < saveLimit;
        const hitWoodwork = !isGoal && !wasSaved && isVisualBeta && resolutionRoll < woodworkLimit;
        const shotEvent = {
          type: isGoal ? 'goal' : (wasSaved ? 'save' : wasBlocked ? 'block' : hitWoodwork ? 'woodwork' : 'miss'),
          teamId: tid,
          actor: pAtt,
          defender: pDef,
          minute: min,
          second: 58,
          lane: chanceContext?.lane || currentLane,
          shotX: chanceContext?.point.x || (tid === 1 ? 82 + Math.random() * 4 : 18 - Math.random() * 4),
          shotY: chanceContext?.point.y || currentLane,
          shotDistance: chanceContext?.distanceToGoal || null,
          shotProgress: chanceContext?.progress || null,
          shootingZone: Boolean(chanceContext?.canShoot),
          longRange: Boolean(chanceContext?.longRange),
          pressure: activePressure,
          buildQuality,
          xg: goalChance,
          actionValue: shotActionValue,
          oneOnOne: decisiveBreakaway,
          shooterProfile: chanceContext?.shooterProfile || pAtt.footballProfile,
          defenderProfile: defensiveContext?.defenderProfile || pDef.footballProfile,
          support: lastSupport ? getPlayerState(tid, lastSupport.player) : null,
          phase: 'final-third',
          assist: attacker !== assist ? pAss : null
        };

        if (isGoal) {
          lastGoalMin = min;
          if (isTeam1) t1Score++; else t2Score++;
          teamStats.shotsOnTarget++;
          pAtt.shotsOnTarget++;
          teamStats.xg += goalChance;
          pAtt.k++;
          pAtt.rating = Math.min(10.0, pAtt.rating + 1.2);
          if (attacker !== assist) {
            pAss.a++;
            pAss.rating = Math.min(10.0, pAss.rating + 0.5);
          }
          const goalkeeperState = getGoalkeeperState(defendingTeamId);
          goalkeeperState.goalsConceded++;
          goalkeeperState.rating = Math.max(3.0, goalkeeperState.rating - 0.2);
          const goalText = decisiveBreakaway
            ? `⚽ GOOOL! ⚽|⏱️ ${min}'. Dakika: ${getCharName(attacker)} savunma arkasına sarktı, kaleciyle karşı karşıya kaldı ve affetmedi!`
            : attacker !== assist
            ? `⚽ GOOOL! ⚽|⏱️ ${min}'. Dakika: Sabırlı paslaşmanın sonunda ${getCharName(assist)} hazırladı, ${getCharName(attacker)} tamamladı!`
            : `⚽ GOOOL! ⚽|⏱️ ${min}'. Dakika: ${getCharName(attacker)} kurulan hücumu soğukkanlı bir vuruşla bitirdi!`;
          addLine(goalText, tid, isVisualBeta ? shotEvent : null);
          if (isVisualBeta) footballAI.recordRestart(defendingTeamId, 'kickoff');
          continue;
        }

        if (wasSaved) {
          teamStats.shotsOnTarget++;
          pAtt.shotsOnTarget++;
          teamStats.xg += goalChance;
          pAtt.rating = Math.min(10.0, pAtt.rating + 0.2);
          const goalkeeperState = getGoalkeeperState(defendingTeamId);
          goalkeeperState.saves++;
          goalkeeperState.rating = Math.min(10.0, goalkeeperState.rating + 0.3);
          addLine(`⏱️ ${min}'. Dakika: Paslarla hazırlanan atakta ${getCharName(attacker)} vurdu, ${isTeam1 ? t2Name : t1Name} kalecisi çıkardı! 🧤`, tid, isVisualBeta ? shotEvent : null);
          if (isVisualBeta) footballAI.recordRestart(defendingTeamId, 'goalkeeper');
        } else if (wasBlocked) {
          pDef.blocks++;
          pDef.rating = Math.min(10, pDef.rating + 0.15);
          teamStats.xg += goalChance;
          addLine(`⏱️ ${min}'. Dakika: ${getCharName(attacker)} şutunu çıkardı ancak ${getCharName(defender)} zamanında önüne set çekti!`, defendingTeamId, isVisualBeta ? shotEvent : null);
          if (isVisualBeta && Math.random() < 0.62) {
            teamStats.corners++;
            footballAI.recordSetPiece(tid, {
              x: tid === 1 ? 98 : 2,
              y: currentLane < 50 ? 4 : 96
            });
            addLine('', tid, {
              type: 'corner',
              teamId: tid,
              actor: pAss,
              target: pAtt,
              victim: pDef,
              minute: min,
              second: 59,
              lane: currentLane < 50 ? 24 : 76,
              phase: 'set-piece'
            });
          } else if (isVisualBeta) {
            footballAI.recordTurnover(defender, chanceContext?.point, 'block');
          }
        } else if (hitWoodwork) {
          teamStats.xg += goalChance;
          pAtt.rating = Math.min(10, pAtt.rating + 0.05);
          addLine(`⏱️ ${min}'. Dakika: ${getCharName(attacker)} çok sert vurdu, top direkten oyun alanına döndü!`, tid, isVisualBeta ? shotEvent : null);
          if (isVisualBeta) footballAI.recordPossession(attacker, 'loose-ball');
        } else {
          teamStats.xg += goalChance;
          pAtt.rating = Math.max(3, pAtt.rating - 0.04);
          addLine(`⏱️ ${min}'. Dakika: ${getCharName(attacker)} hücumun sonunda şutunu gönderdi ancak top auta çıktı.`, tid, isVisualBeta ? shotEvent : null);
          if (isVisualBeta) footballAI.recordRestart(defendingTeamId, 'goal-kick');
        }
      }

      footballSpatialTelemetry = footballMatchState?.telemetry() || null;
      
      // Cleanup xG precision
      matchState.t1.stats.xg = parseFloat(matchState.t1.stats.xg.toFixed(2));
      matchState.t2.stats.xg = parseFloat(matchState.t2.stats.xg.toFixed(2));
      matchState.t1.players.forEach(p => p.rating = parseFloat(p.rating.toFixed(1)));
      matchState.t2.players.forEach(p => p.rating = parseFloat(p.rating.toFixed(1)));
      
      addLine(`Maç Sonucu: ${t1Score} - ${t2Score}`);
      
      if (t1Score === t2Score) {
        addLine(`⏱️ Maç berabere bitti! Kazananı belirlemek için PENALTILARA gidiyoruz!`);
        let pen1 = 0;
        let pen2 = 0;
        const penaltyChanceFor = (shooter, suddenDeath = false) => {
          const profile = getFootballProfile(shooter);
          const finishing = normalizedSkill(profile, 'finishing');
          const composure = normalizedSkill(profile, 'composure');
          return Math.min(
            suddenDeath ? 0.8 : 0.88,
            Math.max(
              suddenDeath ? 0.48 : 0.54,
              (suddenDeath ? 0.47 : 0.52) +
                finishing * (suddenDeath ? 0.2 : 0.22) +
                composure * (suddenDeath ? 0.1 : 0.12)
            )
          );
        };
        
        for (let i = 0; i < 5; i++) {
           const shooter1 = weightedRandomChar(team1, false, true);
           const shooter2 = weightedRandomChar(team2, false, true);
           const shooterState1 = getPlayerState(1, shooter1);
           const shooterState2 = getPlayerState(2, shooter2);
           
           // Shooter 1
           const penaltyChance1 = penaltyChanceFor(shooter1);
           const isGoal1 = Math.random() < penaltyChance1;
           const eventType1 = isGoal1 ? 'goal' : (Math.random() > 0.5 ? 'save' : 'miss');
           const vis1 = {
              type: eventType1,
              actor: shooterState1,
              teamId: 1,
              isPenalty: true,
              penaltyChance: penaltyChance1
           };
           shooterState1.penaltiesTaken++;
           if (isGoal1) { 
               pen1++;
               shooterState1.penaltiesScored++;
               shooterState1.rating = Math.min(10, shooterState1.rating + 0.18);
               addLine(`✅ ${getCharName(shooter1)} topu ağlara yolladı! (${t1Name})`, 1, isVisualBeta ? vis1 : null); 
           } else { 
               shooterState1.penaltiesMissed++;
               shooterState1.rating = Math.max(3, shooterState1.rating - 0.14);
               addLine(`❌ ${getCharName(shooter1)} penaltıyı KAÇIRDI! (${t1Name})`, 1, isVisualBeta ? vis1 : null); 
           }
           
           // Shooter 2
           const penaltyChance2 = penaltyChanceFor(shooter2);
           const isGoal2 = Math.random() < penaltyChance2;
           const eventType2 = isGoal2 ? 'goal' : (Math.random() > 0.5 ? 'save' : 'miss');
           const vis2 = {
              type: eventType2,
              actor: shooterState2,
              teamId: 2,
              isPenalty: true,
              penaltyChance: penaltyChance2
           };
           shooterState2.penaltiesTaken++;
           if (isGoal2) { 
               pen2++;
               shooterState2.penaltiesScored++;
               shooterState2.rating = Math.min(10, shooterState2.rating + 0.18);
               addLine(`✅ ${getCharName(shooter2)} topu ağlara yolladı! (${t2Name})`, 2, isVisualBeta ? vis2 : null); 
           } else { 
               shooterState2.penaltiesMissed++;
               shooterState2.rating = Math.max(3, shooterState2.rating - 0.14);
               addLine(`❌ ${getCharName(shooter2)} penaltıyı KAÇIRDI! (${t2Name})`, 2, isVisualBeta ? vis2 : null); 
           }
           
           if (Math.abs(pen1 - pen2) > (4 - i)) break;
        }
        
        let suddenDeath = 1;
        while (pen1 === pen2 && suddenDeath < 15) {
           addLine(`⚡ Seri Penaltılar - Tur ${suddenDeath}`);
           const shooter1 = weightedRandomChar(team1, false, true);
           const shooter2 = weightedRandomChar(team2, false, true);
           const shooterState1 = getPlayerState(1, shooter1);
           const shooterState2 = getPlayerState(2, shooter2);
           
           // Shooter 1
           const penaltyChance1 = penaltyChanceFor(shooter1, true);
           const isGoal1 = Math.random() < penaltyChance1;
           const eventType1 = isGoal1 ? 'goal' : (Math.random() > 0.5 ? 'save' : 'miss');
           const vis1 = {
              type: eventType1,
              actor: shooterState1,
              teamId: 1,
              isPenalty: true,
              penaltyChance: penaltyChance1
           };
           shooterState1.penaltiesTaken++;
           if (isGoal1) { 
               pen1++;
               shooterState1.penaltiesScored++;
               shooterState1.rating = Math.min(10, shooterState1.rating + 0.18);
               addLine(`✅ ${getCharName(shooter1)} golü attı! (${t1Name})`, 1, isVisualBeta ? vis1 : null); 
           } else { 
               shooterState1.penaltiesMissed++;
               shooterState1.rating = Math.max(3, shooterState1.rating - 0.14);
               addLine(`❌ ${getCharName(shooter1)} kaleciye takıldı! (${t1Name})`, 1, isVisualBeta ? vis1 : null); 
           }
           
           // Shooter 2
           const penaltyChance2 = penaltyChanceFor(shooter2, true);
           const isGoal2 = Math.random() < penaltyChance2;
           const eventType2 = isGoal2 ? 'goal' : (Math.random() > 0.5 ? 'save' : 'miss');
           const vis2 = {
              type: eventType2,
              actor: shooterState2,
              teamId: 2,
              isPenalty: true,
              penaltyChance: penaltyChance2
           };
           shooterState2.penaltiesTaken++;
           if (isGoal2) { 
               pen2++;
               shooterState2.penaltiesScored++;
               shooterState2.rating = Math.min(10, shooterState2.rating + 0.18);
               addLine(`✅ ${getCharName(shooter2)} golü attı! (${t2Name})`, 2, isVisualBeta ? vis2 : null); 
           } else { 
               shooterState2.penaltiesMissed++;
               shooterState2.rating = Math.max(3, shooterState2.rating - 0.14);
               addLine(`❌ ${getCharName(shooter2)} kaleciye takıldı! (${t2Name})`, 2, isVisualBeta ? vis2 : null); 
           }
           suddenDeath++;
        }
        
        // Failsafe
        if (pen1 === pen2) pen1++;
        
        addLine(`🎯 Penaltılar Sonucu: ${t1Name} ${pen1} - ${pen2} ${t2Name}`);
        shootoutWinner = pen1 > pen2 ? 1 : 2;
      }

    } else if (branch === 'lol') {
      t1Score = 0;
      t2Score = 0;
      
      addLine('Vadiye hoş geldiniz! Minyonlar harekete geçti.');
      
      const addFarm = (mins) => {
        const updateCS = (p) => {
          // Performansa göre farm: K/D oranı iyi olan daha çok kasar, ölen daha az.
          let kdaFactor = (p.k * 2 + p.a - p.d * 2.5) / 10;
          if (kdaFactor < -0.5) kdaFactor = -0.5; // Maksimum %50 kayıp
          if (kdaFactor > 0.5) kdaFactor = 0.5;   // Maksimum %50 bonus
          
          const baseFarm = mins * 6;
          const bonus = Math.floor(Math.random() * (mins * 4));
          let farmGain = Math.floor((baseFarm + bonus) * (1 + kdaFactor));
          if (farmGain < 0) farmGain = 0;
          
          p.cs += farmGain;
        };
        matchState.t1.players.forEach(updateCS);
        matchState.t2.players.forEach(updateCS);
      };

      const fbTeam1 = roll(team1) > roll(team2);
      const fbKiller = weightedRandomChar(fbTeam1 ? team1 : team2, false);
      const fbVictim = weightedRandomChar(fbTeam1 ? team2 : team1, true);
      
      const pKiller = getPlayerState(fbTeam1 ? 1 : 2, fbKiller);
      const pVictim = getPlayerState(fbTeam1 ? 2 : 1, fbVictim);
      pKiller.k++;
      pVictim.d++;
      
      if (fbTeam1) t1Score++; else t2Score++;
      addFarm(3);
      addLine(`Dakika 3: 🩸 FIRST BLOOD! Ormancı baskınıyla ${getCharName(fbKiller)}, ${getCharName(fbVictim)}'i indirdi!`, fbTeam1 ? 1 : 2);

      let gameMinute = 3;
      // Sonuç nesnesi branş bloğunun dışında oluşturuluyor; block-scoped
      // değişken burada kaybolunca skor tablosu anlatımdaki Nexus kazananı
      // yerine yedek skoru kullanıyordu.
      var lolWinner = 0;

      while (lolWinner === 0) {
        addFarm(3);
        gameMinute += 3;
        
        addLine(`--- Dakika ${gameMinute} ---`);
        
        // Kartopu etkisi (Snowball): Power scales aggressively to crush weak teams
        let t1Power = getTeamPower(team1) + (t1Score * 10) + (matchState.t1.towers * 25) + (matchState.t1.dragons * 30) + (matchState.t1.barons * 60);
        let t2Power = getTeamPower(team2) + (t2Score * 10) + (matchState.t2.towers * 25) + (matchState.t2.dragons * 30) + (matchState.t2.barons * 60);
        
        // Late Game Catch-up (30. dakikadan sonra altın farkının önemi azalır)
        if (gameMinute > 30) {
           const catchup = (gameMinute - 30) * 20; 
           t1Power += catchup;
           t2Power += catchup;
        }

        // Square the powers to make rating advantages extremely potent
        const p1 = Math.pow(t1Power, 2);
        const p2 = Math.pow(t2Power, 2);
        const totalPower = p1 + p2;
        const t1WinChance = p1 / totalPower; 
        
        const events = Math.floor(Math.random() * 3) + 3; 
        
        for (let i = 0; i < events; i++) {
          const isTeam1 = Math.random() < t1WinChance;
          const actor = weightedRandomChar(isTeam1 ? team1 : team2, false);
          const target = weightedRandomChar(isTeam1 ? team2 : team1, true);
          const assist = weightedRandomChar(isTeam1 ? team1 : team2, false);
          
          const pActor = getPlayerState(isTeam1 ? 1 : 2, actor);
          const pTarget = getPlayerState(isTeam1 ? 2 : 1, target);
          const pAssist = getPlayerState(isTeam1 ? 1 : 2, assist);
          
          const myTowers = isTeam1 ? matchState.t1.towers : matchState.t2.towers;
          
          // Olay Olasılıkları
          let pEnd = 0, pBaron = 0, pDragon = 0, pTower = 0, pTeamfight = 0, pKill = 0;
          
          const powerDiff = Math.abs(t1Power - t2Power);
          const isCloseGame = powerDiff < (totalPower * 0.15); // Less than 15% difference
          
          if (myTowers >= 5) {
             pEnd = isCloseGame ? 0.20 : 0.50; // Kafa kafaya ise oyunu bitirme şansı daha düşük
             pBaron = 0.10; pTeamfight = 0.30; pKill = 0.20;
          } else if (myTowers >= 3) {
             pTower = 0.35; pBaron = gameMinute >= 20 ? 0.15 : 0; pDragon = 0.15; pTeamfight = 0.20; pKill = 0.15;
          } else {
             pTower = 0.20; pDragon = 0.15; pTeamfight = 0.20; pKill = 0.45;
          }
          
          if (gameMinute >= 20 && myTowers < 5) pBaron += 0.05;
          
          const maxR = pEnd + pBaron + pDragon + pTower + pTeamfight + pKill;
          const r = Math.random() * maxR;
          
          let cumulative = 0;
          
          if (pEnd > 0 && r < (cumulative += pEnd)) {
            // Son Direniş
            const kills = Math.floor(Math.random() * 3) + 2;
            if (isTeam1) t1Score += kills; else t2Score += kills;
            pActor.k += kills;
            pAssist.a += kills;
            
            const losingTeam = isTeam1 ? team2 : team1;
            for(let k = 0; k < kills; k++) {
              const v = weightedRandomChar(losingTeam, true);
              const pV = getPlayerState(isTeam1 ? 2 : 1, v);
              pV.d++;
            }
            
            addLine(`🛡️ SON DİRENİŞ! ${isTeam1 ? t2Name : t1Name} Nexus'u korumak için cansiperane savaşıyor ama ${getCharName(actor)} acımıyor!`);
            addLine(`💥 İNANILMAZ KARTOPU ETKİSİ! ${getCharName(actor)} önderliğinde ${isTeam1 ? t1Name : t2Name} ana üsse girdi ve Nexus'u yıktı! Maç ${gameMinute}. dakikada bitti.`);
            lolWinner = isTeam1 ? 1 : 2;
            break;
          } else if (pBaron > 0 && r < (cumulative += pBaron)) {
            if (isTeam1) matchState.t1.barons++; else matchState.t2.barons++;
            addLine(`👁️ BARON NASHOR KESİLDİ! ${isTeam1 ? t1Name : t2Name}, Baron güçlendirmesini alıp üsse doğru yürümeye başladı!`);
          } else if (pDragon > 0 && r < (cumulative += pDragon)) {
            if (isTeam1) matchState.t1.dragons++; else matchState.t2.dragons++;
            const soulStr = (isTeam1 ? matchState.t1.dragons : matchState.t2.dragons) >= 4 ? ' (EJDER RUHU ALINDI!)' : '';
            addLine(`🐉 ${getCharName(actor)} kritik bir çarp ile Ejderhayı aldı!${soulStr}`);
          } else if (pTower > 0 && r < (cumulative += pTower)) {
            if (isTeam1) matchState.t1.towers++; else matchState.t2.towers++;
            const tLevel = myTowers < 3 ? 'Dış Kuleyi' : (myTowers < 5 ? 'İç Kuleyi' : 'İnhibitör Kulesini');
            addLine(`🗼 ${isTeam1 ? t1Name : t2Name} koridoru ittirdi ve ${tLevel} yerle bir etti!`);
          } else if (pTeamfight > 0 && r < (cumulative += pTeamfight)) {
            // Teamfight kills between 2 and 5 (Pentakill)
            let kills = Math.floor(Math.random() * 100);
            if (kills < 40) kills = 2;
            else if (kills < 70) kills = 3;
            else if (kills < 92) kills = 4;
            else kills = 5;
            
            if (isTeam1) t1Score += kills; else t2Score += kills;
            pActor.k += kills; 
            if (actor !== assist) pAssist.a += (kills - 1);
            
            // Distribute deaths to losing team
            const losingTeam = isTeam1 ? team2 : team1;
            for(let k = 0; k < kills; k++) {
              const v = randomChar(losingTeam);
              const pV = getPlayerState(isTeam1 ? 2 : 1, v);
              pV.d++;
            }
            
            if (kills === 5) {
               addLine(`🔥 PENTAKILL 🔥|${getCharName(actor)} tüm rakiplerini tek tek avlayarak PENTAKILL (Beşte Beş) attı! İnanılmaz bir an!`, isTeam1 ? 1 : 2);
            } else {
               const killText = kills === 2 ? 'Double Kill (İkide İki)' : (kills === 3 ? 'Triple Kill (Üçte Üç)' : 'QUADRA KILL (Dörtte Dört)');
               addLine(`⚔️ KANLI TAKIM SAVAŞI! ${getCharName(actor)} mükemmel bir pozisyon alarak ${killText} attı!`, isTeam1 ? 1 : 2);
            }
          } else {
            if (isTeam1) t1Score++; else t2Score++;
            pActor.k++; pTarget.d++;
            if (actor !== assist && Math.random() > 0.3) {
              pAssist.a++;
              addLine(`⚔️ ${getCharName(actor)}, destek oyuncusu ${getCharName(assist)}'nin asistiyle ${getCharName(target)}'i saf dışı bıraktı!`, isTeam1 ? 1 : 2);
            } else {
              addLine(`⚔️ ${getCharName(actor)}, rakibi ${getCharName(target)} ile girdiği 1v1 düelloyu kazandı! (Solo Kill)`, isTeam1 ? 1 : 2);
            }
          }
        }
        
        // Failsafe for infinite loop extreme cases
        if (gameMinute >= 60 && Math.random() > 0.3) {
           const isTeam1 = t1Score > t2Score;
           addLine(`💥 OYUN ÇOK UZADI! ${gameMinute}. dakikada minyonlar Nexus'u yıktı!`);
           lolWinner = isTeam1 ? 1 : 2;
        }
      }

    } else if (branch === 'valorant') {
      t1Score = 0; t2Score = 0;
      let t1Econ = 5; let t2Econ = 5; 
      let t1LossStreak = 0; let t2LossStreak = 0;
      
      addLine('🎯 VALORANT: Ajanlar sahaya iniyor. Maç Başlıyor!');
      
      let roundNum = 1;
      
      while ((t1Score < 13 && t2Score < 13) || Math.abs(t1Score - t2Score) < 2) {
        if (t1Score === 12 && t2Score === 12 && roundNum === 25) {
          addLine('⚠️ UZATMALAR! Kim daha iradeli göreceğiz!');
        }
        
        let isPistol = (roundNum === 1 || roundNum === 13);
        
        if (isPistol) {
          t1Econ = 3; t2Econ = 3; 
          t1LossStreak = 0; t2LossStreak = 0;
        } else if (roundNum === 13) {
          t1LossStreak = 0; t2LossStreak = 0;
        }
        
        let p1 = getTeamPower(team1);
        let p2 = getTeamPower(team2);
        
        let econMult1 = (t1Econ / 5);
        let econMult2 = (t2Econ / 5);
        
        p1 *= econMult1;
        p2 *= econMult2;
        
        let p1Squared = Math.pow(p1, 2);
        let p2Squared = Math.pow(p2, 2);
        
        let t1WinChance = p1Squared / (p1Squared + p2Squared);
        let isTeam1 = Math.random() < t1WinChance;
        
        let winnerTeam = isTeam1 ? team1 : team2;
        let loserTeam = isTeam1 ? team2 : team1;
        
        addLine(`--- Raunt ${roundNum} | Skor: ${t1Score} - ${t2Score} ---`);
        
        let t1Alive = [...team1];
        let t2Alive = [...team2];
        
        const getWeightedAlive = (aliveList, reverse = false) => {
          if (aliveList.length === 1) return aliveList[0];
          let total = 0;
          for (let p of aliveList) {
             let r = getRating(p, branch);
             total += reverse ? (20000 / (r || 1)) : Math.pow(r, 2);
          }
          let rand = Math.random() * total;
          for (let p of aliveList) {
             let r = getRating(p, branch);
             rand -= reverse ? (20000 / (r || 1)) : Math.pow(r, 2);
             if (rand <= 0) return p;
          }
          return aliveList[0];
        };

        let winnerAlive = isTeam1 ? t1Alive : t2Alive;
        let loserAlive = isTeam1 ? t2Alive : t1Alive;
        
        let isSpikeWin = Math.random() > 0.7;
        let losersToDie = isSpikeWin ? (Math.floor(Math.random() * 4) + 1) : 5;
        let winnersToDie = Math.floor(Math.random() * 5);
        
        let killsSequence = [];
        for(let k=0; k<losersToDie; k++) killsSequence.push({ isWinner: true });
        for(let k=0; k<winnersToDie; k++) killsSequence.push({ isWinner: false });
        killsSequence.sort(() => Math.random() - 0.5);
        
        let winnerKillsCount = {}; 
        
        for (let event of killsSequence) {
          if (winnerAlive.length === 0 || loserAlive.length === 0) break;
          
          if (event.isWinner) {
            let killerObj = getWeightedAlive(winnerAlive, false);
            let victimObj = getWeightedAlive(loserAlive, true);
            
            loserAlive = loserAlive.filter(p => p !== victimObj);
            
            let assistObj = null;
            if (winnerAlive.length > 1 && Math.random() > 0.5) {
               assistObj = getWeightedAlive(winnerAlive.filter(p => p !== killerObj), false);
            }
            
            let killer = killerObj;
            let victim = victimObj;
            let assist = assistObj ? assistObj : null;
            
            let pK = getPlayerState(isTeam1 ? 1 : 2, killer);
            pK.k++;
            getPlayerState(isTeam1 ? 2 : 1, victim).d++;
            if (assist) {
               getPlayerState(isTeam1 ? 1 : 2, assist).a++;
               addLine(`🔫 ${getCharName(killer)}, ${getCharName(assist)} asistiyle ${getCharName(victim)}'i vurdu.`, isTeam1 ? 1 : 2);
            } else {
               addLine(`🔫 ${getCharName(killer)}, ${getCharName(victim)}'i tekledi.`, isTeam1 ? 1 : 2);
            }
            pK.cs += Math.floor(Math.random() * 50) + 150; 
            winnerKillsCount[killer.name || killer.character_name] = (winnerKillsCount[killer.name || killer.character_name] || 0) + 1;
          } else {
            let killerObj = getWeightedAlive(loserAlive, false);
            let victimObj = getWeightedAlive(winnerAlive, true);
            
            winnerAlive = winnerAlive.filter(p => p !== victimObj);
            
            let assistObj = null;
            if (loserAlive.length > 1 && Math.random() > 0.5) {
               assistObj = getWeightedAlive(loserAlive.filter(p => p !== killerObj), false);
            }
            
            let killer = killerObj;
            let victim = victimObj;
            let assist = assistObj ? assistObj : null;
            
            let pK = getPlayerState(isTeam1 ? 2 : 1, killer);
            pK.k++;
            getPlayerState(isTeam1 ? 1 : 2, victim).d++;
            if (assist) {
               getPlayerState(isTeam1 ? 2 : 1, assist).a++;
               addLine(`🎯 ${getCharName(killer)}, ${getCharName(assist)} desteğiyle ${getCharName(victim)}'i aradan çıkardı.`, isTeam1 ? 2 : 1);
            } else {
               addLine(`🎯 ${getCharName(killer)}, ${getCharName(victim)}'i vurdu.`, isTeam1 ? 2 : 1);
            }
            pK.cs += Math.floor(Math.random() * 50) + 150;
          }
        }
        
        if (isTeam1) t1Score++; else t2Score++;
        
        let bestPlayer = null;
        let maxK = 0;
        for (let name in winnerKillsCount) {
          if(winnerKillsCount[name] > maxK) { maxK = winnerKillsCount[name]; bestPlayer = name; }
        }
        
        let isT1Attacker = roundNum <= 12 || (roundNum > 24 && roundNum % 2 !== 0);
        let isWinnerAttacker = isTeam1 ? isT1Attacker : !isT1Attacker;
        
        let bestChar = winnerTeam.find(c => (c.name || c.character_name) === bestPlayer) || winnerTeam[0];
        let prefix = isPistol ? '🔫 Tabanca Raundu:' : (isTeam1 ? (t1Econ < 4 ? '💰 ECO Raunt:' : '⚔️') : (t2Econ < 4 ? '💰 ECO Raunt:' : '⚔️'));
        
        if (maxK === 5) {
          addLine(`💥 KUSURSUZ ACE! 💥|${getCharName(bestChar)} tek başına tüm takımı temizledi! İnanılmaz bir ACE!`, isTeam1 ? 1 : 2);
        } else if (maxK === 4) {
          addLine(`🔥 4K CLUTCH! ${getCharName(bestChar)} dört kişiyi indirip raundu adeta tek başına taşıdı.`, isTeam1 ? 1 : 2);
        } else if (maxK === 3) {
          addLine(`🎯 ${getCharName(bestChar)} üçte üç yaparak takımına raundu getiren isim oldu.`, isTeam1 ? 1 : 2);
        } else {
          if (loserAlive.length > 0) {
            const winnerTeam = isTeam1 ? team1 : team2;
            const actorChar = winnerTeam[Math.floor(Math.random() * winnerTeam.length)];
            if (isWinnerAttacker) {
              addLine(`🧨 Spike İnfilak Etti! ${prefix} Savunanlar kaçmak zorunda kaldı, ${getCharName(actorChar)} Spike'ı patlatarak takımına raundu getirdi!`, isTeam1 ? 1 : 2);
            } else {
              addLine(`🛡️ NINJA DEFUSE! ${prefix} ${getCharName(actorChar)} saldıranlar hayattayken Spike'ı çözmeyi başardı!`, isTeam1 ? 1 : 2);
            }
          } else {
            let methods = ["tüm rakipleri temizleyerek", "taktiksel üstünlük kurarak", "ateş gücüyle ezerek"];
            addLine(`${prefix} ${isTeam1 ? t1Name : t2Name} ${methods[Math.floor(Math.random()*methods.length)]} raundu kazandı.`, isTeam1 ? 1 : 2);
          }
        }
        
        if (isTeam1) {
          t1Econ = 5; t1LossStreak = 0;
          t2LossStreak++;
          if (t2LossStreak > 2) t2Econ = 5; 
          else if (t2LossStreak === 2) t2Econ = 4; 
          else t2Econ = 2; 
        } else {
          t2Econ = 5; t2LossStreak = 0;
          t1LossStreak++;
          if (t1LossStreak > 2) t1Econ = 5; 
          else if (t1LossStreak === 2) t1Econ = 4; 
          else t1Econ = 2; 
        }
        
        roundNum++;
        if (roundNum > 45) break;
      }
      
    } else if (branch === 'cs') {
      t1Score = 0; t2Score = 0;
      let t1Econ = 5; let t2Econ = 5; 
      let t1LossStreak = 0; let t2LossStreak = 0;
      const csEconomy = isVisualBeta
        ? createCsEconomyManager({
            team1,
            team2,
            getRating,
            rng: createSeededRng(`${simulationSeed}:cs-economy`)
          })
        : null;
      
      addLine('🔫 COUNTER-STRIKE: Silahlar çekildi! Maç Başlıyor!');
      
      let roundNum = 1;
      
      while ((t1Score < 13 && t2Score < 13) || Math.abs(t1Score - t2Score) < 2) {
        if (t1Score === 12 && t2Score === 12 && roundNum === 25) {
          addLine('⚠️ UZATMALAR! Gerçek e-spor mücadelesi şimdi başlıyor!');
        }
        
        let isPistol = (roundNum === 1 || roundNum === 13);
        const isT1Attacker = roundNum <= 12 || (roundNum > 24 && roundNum % 2 !== 0);
        const economyRound = csEconomy
          ? csEconomy.prepareRound({
              round: roundNum,
              team1Attacker: isT1Attacker,
              score1: t1Score,
              score2: t2Score
            })
          : null;
        
        if (isPistol) {
          t1Econ = 3; t2Econ = 3; 
          t1LossStreak = 0; t2LossStreak = 0;
        } else if (roundNum === 13) {
          t1LossStreak = 0; t2LossStreak = 0;
        }
        
        let p1 = getTeamPower(team1);
        let p2 = getTeamPower(team2);
        
        let econMult1 = (t1Econ / 5);
        let econMult2 = (t2Econ / 5);
        
        p1 *= econMult1;
        p2 *= econMult2;
        
        let p1Squared = Math.pow(p1, 2);
        let p2Squared = Math.pow(p2, 2);
        
        let t1WinChance = p1Squared / (p1Squared + p2Squared);
        let isTeam1 = Math.random() < t1WinChance;
        
        let winnerTeam = isTeam1 ? team1 : team2;
        let loserTeam = isTeam1 ? team2 : team1;
        const csVisual = isVisualBeta
          ? createDust2RoundDirector({
              team1,
              team2,
              round: roundNum,
              team1Attacker: isT1Attacker,
              isPistol,
              score1: t1Score,
              score2: t2Score,
              getRating,
              rng: createSeededRng(`${simulationSeed}:cs-behavior:${roundNum}`),
              loadouts: economyRound?.loadouts || null,
              includeDebugTelemetry: Boolean(simulationOptions?.includeDebugTelemetry)
            })
          : null;
        
        addLine(
          `--- Raunt ${roundNum} | Skor: ${t1Score} - ${t2Score} ---`,
          0,
          csVisual ? csVisual.roundStart({
            score1: t1Score,
            score2: t2Score,
            economy1: t1Econ,
            economy2: t2Econ
          }) : null
        );
        if (csVisual && economyRound) {
          const t1Buy = economyRound.teams[1];
          const t2Buy = economyRound.teams[2];
          addLine(
            `🛒 SATIN ALMA: ${t1Name} ${t1Buy.buyType.toUpperCase()} ($${t1Buy.teamSpend}) | `
              + `${t2Name} ${t2Buy.buyType.toUpperCase()} ($${t2Buy.teamSpend})`,
            0,
            csVisual.buyPhase(economyRound)
          );
        }
        
        let t1Alive = [...team1];
        let t2Alive = [...team2];
        
        const getWeightedAlive = (aliveList, reverse = false) => {
          if (aliveList.length === 1) return aliveList[0];
          let total = 0;
          for (let p of aliveList) {
             let r = getRating(p, branch);
             total += reverse ? (20000 / (r || 1)) : Math.pow(r, 2);
          }
          let rand = Math.random() * total;
          for (let p of aliveList) {
             let r = getRating(p, branch);
             rand -= reverse ? (20000 / (r || 1)) : Math.pow(r, 2);
             if (rand <= 0) return p;
          }
          return aliveList[0];
        };

        const combatKillText = (killer, victim, assist, visualKill) => {
          const combat = visualKill?.combat;
          if (!combat) return null;
          const icon = combat.fatalHeadshot ? '🎯' : '🔫';
          const assistCopy = assist ? `, ${getCharName(assist)} desteğiyle` : '';
          const headCopy = combat.fatalHeadshot ? ' kafadan' : '';
          const bombCopy = visualKill.bombDropped ? ' C4 yere düştü!' : '';
          return `${icon} ${getCharName(killer)}${assistCopy}, ${combat.weapon} ile ${getCharName(victim)}'i${headCopy} düşürdü! `
            + `(${combat.hits}/${combat.shots} isabet, ${combat.damage} hasar)${bombCopy}`;
        };

        const combatDamageText = (shooter, target, visualDamage) => {
          const combat = visualDamage?.combat;
          if (!combat) return null;
          const crossfire = visualDamage.crossfire ? ' Çapraz ateşte' : '';
          if (combat.damage <= 0) {
            return `💨${crossfire} ${getCharName(shooter)}, ${combat.weapon} serisinde isabet bulamadı.`;
          }
          const retreat = combat.hpAfter <= 38
            ? ` ${getCharName(target)} ${combat.hpAfter} HP ile geri çekiliyor!`
            : ` ${getCharName(target)} ${combat.hpAfter} HP kaldı.`;
          return `💥${crossfire} ${getCharName(shooter)}, ${getCharName(target)}'e `
            + `${combat.damage} hasar verdi (${combat.hits}/${combat.shots} isabet).${retreat}`;
        };
        
        let roundReason = 'elimination';
        let roundResolution = null;
        let csResolvedRound = null;

        if (csVisual) {
          const resolvedRound = csVisual.simulateRound();
          csResolvedRound = resolvedRound;
          isTeam1 = resolvedRound.winnerTeamId === 1;
          winnerTeam = isTeam1 ? team1 : team2;
          loserTeam = isTeam1 ? team2 : team1;
          roundReason = resolvedRound.reason;
          roundResolution = resolvedRound.resolution;

          for (const event of resolvedRound.events) {
            if (event.kind === 'kill') {
              const killerState = getPlayerState(event.teamId, event.killer);
              const victimTeamId = event.teamId === 1 ? 2 : 1;
              killerState.k++;
              killerState.cs += event.visual.combat.damage;
              getPlayerState(victimTeamId, event.victim).d++;
              if (event.assist) getPlayerState(event.teamId, event.assist).a++;
              addLine(
                combatKillText(event.killer, event.victim, event.assist, event.visual),
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'damage') {
              const shooterState = getPlayerState(event.teamId, event.shooter);
              shooterState.cs += event.visual?.combat?.damage || 0;
              addLine(
                combatDamageText(event.shooter, event.target, event.visual),
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'utility-decision') {
              const utilityNames = {
                smoke: 'sis bombasını',
                flash: 'flashını',
                he: 'HE bombasını',
                molotov: 'molotofunu',
                incendiary: 'yanıcı bombasını'
              };
              const actorName = event.visual?.actor?.name || getCharName(event.actor);
              const reason = event.decision?.reason || 'takım çağrısına göre';
              const confidence = Math.round((event.decision?.confidence || 0) * 100);
              const comboText = event.decision?.combo === 'smoke-flash'
                ? ' Smoke-flash zinciri hazırlanıyor.'
                : '';
              addLine(
                `🧠 ${actorName}, ${utilityNames[event.utility] || 'utilitysini'} kullanma kararı aldı: `
                  + `${reason} (${confidence}% güven).${comboText}`,
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'mid-round-call') {
              const call = event.visual?.call || event.call;
              const callText = call === 'rotate'
                ? `🧭 Orta raunt çağrısı: ${event.visual?.fromPlan || 'ilk plan'} bırakıldı, ${event.visual?.targetPlan || 'diğer bölge'} rotasyonu başladı.`
                : call === 'regroup'
                  ? '🤝 Orta raunt çağrısı: takım trade mesafesini kapatmak için yeniden gruplanıyor.'
                  : '⚡ Orta raunt çağrısı: takım süre baskısıyla aynı plana yeniden yükleniyor.';
              addLine(callText, event.teamId, event.visual);
            } else if (event.kind === 'sound-cue') {
              const soundType = event.visual?.sound?.type || event.sound;
              const actorName = event.visual?.actor?.name || getCharName(event.actor);
              const hearers = event.visual?.directHearers || 0;
              const soundText = soundType === 'plant' && event.visual?.fake
                ? `🎭 ${actorName} fake plant sesi verdi; yalnızca ${hearers} rakip doğrudan duydu.`
                : soundType === 'reload'
                  ? `🔊 ${actorName} şarjör değiştirirken ${hearers} rakip ses bilgisini aldı.`
                  : soundType === 'bomb-drop'
                    ? `🧳 C4 düşme sesi ${hearers} rakibe yaklaşık konum bilgisi verdi.`
                    : `👂 ${actorName} kaynaklı ${soundType || 'ses'} bilgisi ${hearers} rakibe ulaştı.`;
              addLine(soundText, event.teamId, event.visual);
            } else if (event.kind === 'utility') {
              const affected = event.visual?.affected || [];
              const totalDamage = affected.reduce((sum, entry) => sum + (entry.damage || 0), 0);
              const killed = affected.filter(entry => entry.killed);
              if (event.actor && event.teamId) {
                const throwerState = getPlayerState(event.teamId, event.actor);
                throwerState.cs += totalDamage;
                throwerState.k += killed.length;
              }
              for (const casualty of killed) {
                getPlayerState(casualty.player.teamId, casualty.player).d++;
              }
              const utilityNames = {
                smoke: 'sis bombası',
                flash: 'flash',
                he: 'HE bombası',
                molotov: 'molotof',
                incendiary: 'yanıcı bomba'
              };
              const utilityName = utilityNames[event.utility] || 'utility';
              const actorName = event.visual?.actor?.name || getCharName(event.actor);
              const effectText = event.utility === 'flash'
                ? `${affected.length} oyuncunun görüşünü bozdu`
                : ['molotov', 'incendiary'].includes(event.utility)
                  ? `${affected.length} oyuncuyu bölgeden çıkmaya zorladı`
                  : event.utility === 'he'
                    ? `${affected.length} oyuncuya toplam ${totalDamage} hasar verdi`
                    : 'geçiş hattını kapattı';
              const killText = killed.length
                ? ` ${killed.map(entry => entry.player.name).join(', ')} etkisiz kaldı!`
                : '';
              addLine(
                `🧯 ${actorName}, ${utilityName} kullandı; ${effectText}.${killText}`,
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'plant') {
              addLine(
                `💣 ${event.visual?.actor?.name || getCharName(event.actor)} ${event.visual.site} bölgesine C4'ü kurdu. Geri sayım başladı!`,
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'bomb-pickup') {
              addLine(
                `🧳 ${event.visual?.actor?.name || getCharName(event.actor)} düşen C4'ü geri aldı.`,
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'equipment-drop') {
              const labels = (event.items || []).map(item => item.label).join(', ');
              addLine(
                `📦 ${event.visual?.actor?.name || getCharName(event.actor)} düşünce ${labels || 'ekipmanı'} yerde kaldı.`,
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'ground-pickup') {
              const carryText = event.visual?.carriedForTeammate
                ? ' ve takım arkadaşı için korumaya aldı'
                : '';
              addLine(
                `🔄 ${event.visual?.actor?.name || getCharName(event.actor)} güvenli anda ${event.item || 'ekipmanı'} yerden aldı${carryText}.`,
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'decision') {
              const decision = event.visual?.decision;
              const actorName = event.visual?.actor?.name || getCharName(event.actor);
              const crossfirePairs = new Set(
                (event.visual?.attackerSetup || [])
                  .map(assignment => assignment.pairId)
                  .filter(Boolean)
              ).size;
              const retakeLanes = new Set(
                (event.visual?.retakePlan || [])
                  .map(assignment => assignment.lane)
                  .filter(Boolean)
              ).size;
              const fakeCopy = event.visual?.metrics?.fakeDefusePlanned
                ? ' Fake defuse ile T açılarını açmaya çalışacaklar.'
                : '';
              const decisionText = decision === 'save'
                ? `🎯 T ekibi ${crossfirePairs} çapraz post-plant düzeni kurdu. CT sayı ve süre dezavantajını görüp silahlarını koruyor.`
                : decision === 'ninja'
                  ? `🥷 ${actorName} gizli bir ninja defuse denemesi için C4'e yaklaşıyor.`
                  : `🔁 ${event.visual?.metrics?.mustContest ? 'Bu raundda save yok; ' : ''}T ekibi ${crossfirePairs} çapraz post-plant düzeni kurdu; CT ${retakeLanes} girişten entry-trade retake başlatıyor.${fakeCopy}`;
              addLine(decisionText, event.teamId, event.visual);
            } else if (event.kind === 'defuse-attempt') {
              const reacting = event.visual?.reactingAttackers?.length || 0;
              const attemptText = event.visual?.fake
                ? `🎭 ${event.visual?.actor?.name || getCharName(event.actor)} C4'e fake dokundu; ${reacting} T oyuncusu bombaya dönüyor.`
                : `🛠️ ${event.visual?.actor?.name || getCharName(event.actor)} boşalan site'ta ${event.visual?.hasDefuseKit ? 'kitli 5' : 'kitsiz 10'} saniyelik defuse'a başladı; ${reacting} T oyuncusu sesi duyup C4'e koşuyor.`;
              addLine(attemptText, event.teamId, event.visual);
            } else if (event.kind === 'escape') {
              addLine(
                `🏃 Bomba süresi kritik! Hayatta kalan oyuncular patlama alanından uzaklaşıyor.`,
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'defuse') {
              const ninja = resolvedRound.resolution?.postPlantDecision?.decision === 'ninja';
              addLine(
                `${ninja ? '🥷 NINJA DEFUSE!' : '🛡️ BOMBA İMHA EDİLDİ!'} ${event.visual?.actor?.name || getCharName(event.actor)} C4'ü zamanında çözdü.`,
                event.teamId,
                event.visual
              );
            } else if (event.kind === 'explode') {
              const blastDeaths = (event.blast || []).filter(entry => entry.killed);
              for (const casualty of blastDeaths) {
                getPlayerState(casualty.player.teamId, casualty.player).d++;
              }
              const deathCopy = blastDeaths.length
                ? ` Patlama alanından çıkamayan ${blastDeaths.map(entry => entry.player.name).join(', ')} öldü!`
                : ' Oyuncular ölümcül şok dalgasından zamanında kurtuldu.';
              addLine(
                `🧨 C4 PATLADI! ${event.visual?.site || 'Bomba'} bölgesi teröristlerin kontrolünde kaldı.${deathCopy}`,
                event.teamId,
                event.visual
              );
            }
          }

          const bestEntry = Object.entries(resolvedRound.killCounts)
            .sort((first, second) => second[1] - first[1])[0] || null;
          const bestPlayer = bestEntry?.[0] || null;
          const maxK = bestEntry?.[1] || 0;
          const bestChar = winnerTeam.find(char =>
            (char.name || char.character_name) === bestPlayer
          ) || winnerTeam[0];

          if (maxK === 5) {
            addLine(`💥 KUSURSUZ ACE! 💥|${getCharName(bestChar)} gerçek çatışmalarda beş rakibini de düşürdü!`, isTeam1 ? 1 : 2);
          } else if (maxK === 4) {
            addLine(`🔥 4K! ${getCharName(bestChar)} dört kill ile raundun belirleyici ismi oldu.`, isTeam1 ? 1 : 2);
          } else if (maxK === 3) {
            addLine(`🎯 ${getCharName(bestChar)} üç kill ile takımına büyük üstünlük sağladı.`, isTeam1 ? 1 : 2);
          }

          if (roundReason === 'time-expired') {
            addLine(
              `⏱️ Süre doldu! C4 kurulamadı; ${isTeam1 ? t1Name : t2Name} savunmada raundu kazandı.`,
              isTeam1 ? 1 : 2
            );
          } else if (roundReason === 'elimination') {
            addLine(
              `⚔️ ${isTeam1 ? t1Name : t2Name} sahadaki çatışmalar sonunda rakip ekibi etkisiz hale getirdi.`,
              isTeam1 ? 1 : 2
            );
          }
        } else {
          let winnerAlive = isTeam1 ? t1Alive : t2Alive;
          let loserAlive = isTeam1 ? t2Alive : t1Alive;
          
          let isBombWin = Math.random() > 0.7;
          let losersToDie = isBombWin ? (Math.floor(Math.random() * 4) + 1) : 5;
          let winnersToDie = Math.floor(Math.random() * 5);
          
          let killsSequence = [];
          for(let k=0; k<losersToDie; k++) killsSequence.push({ isWinner: true });
          for(let k=0; k<winnersToDie; k++) killsSequence.push({ isWinner: false });
          killsSequence.sort(() => Math.random() - 0.5);
          
          let winnerKillsCount = {}; 
          
          for (let event of killsSequence) {
          if (winnerAlive.length === 0 || loserAlive.length === 0) break;
          
          if (event.isWinner) {
            let killer = getWeightedAlive(winnerAlive, false);
            let victim = getWeightedAlive(loserAlive, true);
            let spatialContact = null;
            if (csVisual) {
              spatialContact = csVisual.prepareEncounter({
                killerTeamId: isTeam1 ? 1 : 2,
                killerCandidates: winnerAlive,
                victimCandidates: loserAlive,
                preferredKiller: killer,
                preferredVictim: victim
              });
              if (!spatialContact) continue;
              killer = spatialContact.killer;
              victim = spatialContact.victim;
            }
            
            loserAlive = loserAlive.filter(p => p !== victim);
            
            let assist = null;
            if (winnerAlive.length > 1 && Math.random() > 0.5) {
               assist = getWeightedAlive(winnerAlive.filter(p => p !== killer), false);
            }
            
            let pK = getPlayerState(isTeam1 ? 1 : 2, killer);
            pK.k++;
            getPlayerState(isTeam1 ? 2 : 1, victim).d++;
            const visualKill = csVisual
              ? csVisual.kill({
                  killer,
                  victim,
                  assist,
                  killerTeamId: isTeam1 ? 1 : 2,
                  contact: spatialContact
                })
              : null;
            if (assist) {
               getPlayerState(isTeam1 ? 1 : 2, assist).a++;
               const combatText = combatKillText(killer, victim, assist, visualKill);
               if (combatText) {
                 addLine(combatText, isTeam1 ? 1 : 2, visualKill);
                 pK.cs += Math.floor(Math.random() * 30) + 60;
                 winnerKillsCount[killer.name || killer.character_name] = (winnerKillsCount[killer.name || killer.character_name] || 0) + 1;
                 continue;
               }
               const killTexts = [
                 `🎯 ${getCharName(killer)}, ${getCharName(assist)} yardımıyla ${getCharName(victim)}'i vurdu!`,
                 `🔫 ${getCharName(killer)}, ${getCharName(assist)}'in desteğiyle ${getCharName(victim)}'i avladı.`,
                 `💥 ${getCharName(killer)}, ${getCharName(assist)} ile beraber ${getCharName(victim)}'i saf dışı bıraktı!`
               ];
               addLine(killTexts[Math.floor(Math.random() * killTexts.length)], isTeam1 ? 1 : 2, visualKill);
            } else {
               const combatText = combatKillText(killer, victim, null, visualKill);
               if (combatText) {
                 addLine(combatText, isTeam1 ? 1 : 2, visualKill);
                 pK.cs += Math.floor(Math.random() * 30) + 60;
                 winnerKillsCount[killer.name || killer.character_name] = (winnerKillsCount[killer.name || killer.character_name] || 0) + 1;
                 continue;
               }
               const killTexts = [
                 `🎯 ${getCharName(killer)}, ${getCharName(victim)}'i AK-47 ile tekledi!`,
                 `🔫 ${getCharName(killer)}, AWP ile ${getCharName(victim)}'i avladı.`,
                 `💥 ${getCharName(killer)}, ${getCharName(victim)}'i spray atarak indirdi!`
               ];
               addLine(killTexts[Math.floor(Math.random() * killTexts.length)], isTeam1 ? 1 : 2, visualKill);
            }
            pK.cs += Math.floor(Math.random() * 30) + 60; 
            winnerKillsCount[killer.name || killer.character_name] = (winnerKillsCount[killer.name || killer.character_name] || 0) + 1;
          } else {
            let killer = getWeightedAlive(loserAlive, false);
            let victim = getWeightedAlive(winnerAlive, true);
            let spatialContact = null;
            if (csVisual) {
              spatialContact = csVisual.prepareEncounter({
                killerTeamId: isTeam1 ? 2 : 1,
                killerCandidates: loserAlive,
                victimCandidates: winnerAlive,
                preferredKiller: killer,
                preferredVictim: victim
              });
              if (!spatialContact) continue;
              killer = spatialContact.killer;
              victim = spatialContact.victim;
            }
            
            winnerAlive = winnerAlive.filter(p => p !== victim);
            
            let assist = null;
            if (loserAlive.length > 1 && Math.random() > 0.5) {
               assist = getWeightedAlive(loserAlive.filter(p => p !== killer), false);
            }
            
            let pK = getPlayerState(isTeam1 ? 2 : 1, killer);
            pK.k++;
            getPlayerState(isTeam1 ? 1 : 2, victim).d++;
            const visualKill = csVisual
              ? csVisual.kill({
                  killer,
                  victim,
                  assist,
                  killerTeamId: isTeam1 ? 2 : 1,
                  contact: spatialContact
                })
              : null;
            if (assist) {
               getPlayerState(isTeam1 ? 2 : 1, assist).a++;
               const combatText = combatKillText(killer, victim, assist, visualKill);
               if (combatText) {
                 addLine(combatText, isTeam1 ? 2 : 1, visualKill);
                 pK.cs += Math.floor(Math.random() * 30) + 60;
                 continue;
               }
               const killTexts = [
                 `🎯 ${getCharName(killer)}, ${getCharName(assist)} desteğiyle ${getCharName(victim)}'i düşürdü.`,
                 `🔫 ${getCharName(killer)}, ${getCharName(assist)} yardımıyla ${getCharName(victim)}'i avladı.`,
                 `💥 ${getCharName(killer)}, ${getCharName(assist)} ile beraber ${getCharName(victim)}'i indirdi!`
               ];
               addLine(killTexts[Math.floor(Math.random() * killTexts.length)], isTeam1 ? 2 : 1, visualKill);
            } else {
               const combatText = combatKillText(killer, victim, null, visualKill);
               if (combatText) {
                 addLine(combatText, isTeam1 ? 2 : 1, visualKill);
                 pK.cs += Math.floor(Math.random() * 30) + 60;
                 continue;
               }
               const killTexts = [
                 `🎯 ${getCharName(killer)}, ${getCharName(victim)}'i kafadan vurdu! (Headshot)`,
                 `🔫 ${getCharName(killer)}, mükemmel bir spreyle ${getCharName(victim)}'i düşürdü.`,
                 `💥 ${getCharName(killer)}, yeteneklerini kullanarak ${getCharName(victim)}'i avladı!`
               ];
               addLine(killTexts[Math.floor(Math.random() * killTexts.length)], isTeam1 ? 2 : 1, visualKill);
            }
            pK.cs += Math.floor(Math.random() * 30) + 60;
          }
        }
        
        let bestPlayer = null;
        let maxK = 0;
        for (let name in winnerKillsCount) {
          if(winnerKillsCount[name] > maxK) { maxK = winnerKillsCount[name]; bestPlayer = name; }
        }
        
        let isWinnerAttacker = isTeam1 ? isT1Attacker : !isT1Attacker;
        
        let bestChar = winnerTeam.find(c => (c.name || c.character_name) === bestPlayer) || winnerTeam[0];
        let prefix = isPistol ? '🔫 Tabanca Raundu:' : (isTeam1 ? (t1Econ < 4 ? '💰 ECO Raunt:' : '⚔️') : (t2Econ < 4 ? '💰 ECO Raunt:' : '⚔️'));
        roundReason = 'elimination';
        
        if (maxK === 5) {
          addLine(`💥 KUSURSUZ ACE! 💥|${getCharName(bestChar)} tek başına tüm takımı temizledi! İnanılmaz bir ACE!`, isTeam1 ? 1 : 2);
        } else if (maxK === 4) {
          addLine(`🔥 4K CLUTCH! ${getCharName(bestChar)} dört kişiyi indirip raundu adeta tek başına taşıdı.`, isTeam1 ? 1 : 2);
        } else if (maxK === 3) {
          addLine(`🎯 ${getCharName(bestChar)} üçte üç yaparak takımına raundu getiren isim oldu.`, isTeam1 ? 1 : 2);
        } else {
          if (loserAlive.length > 0) {
            const winnerTeam = isTeam1 ? team1 : team2;
            const actorChar = winnerTeam[Math.floor(Math.random() * winnerTeam.length)];
            if (isWinnerAttacker) {
              roundReason = 'bomb-exploded';
              if (csVisual) {
                const plantEvent = csVisual.objective('plant', actorChar, isTeam1 ? 1 : 2);
                addLine(
                  `💣 ${plantEvent?.actor?.name || getCharName(actorChar)} C4'ü bomba bölgesine kurdu. Geri sayım başladı!`,
                  isTeam1 ? 1 : 2,
                  plantEvent
                );
              }
              addLine(
                `🧨 C4 Patladı! ${prefix} CT ekibi uzaklaşmak zorunda kaldı, ${getCharName(actorChar)} C4'ü patlatarak takımına raundu kazandırdı!`,
                isTeam1 ? 1 : 2,
                csVisual ? csVisual.objective('explode', actorChar, isTeam1 ? 1 : 2) : null
              );
            } else {
              roundReason = 'defused';
              if (csVisual) {
                const attackerTeamId = isT1Attacker ? 1 : 2;
                const planterChar = loserAlive[0] || loserTeam[0];
                const plantEvent = csVisual.objective('plant', planterChar, attackerTeamId);
                addLine(
                  `💣 ${plantEvent?.actor?.name || getCharName(planterChar)} C4'ü kurdu; CT ekibi geri almak için harekete geçti!`,
                  attackerTeamId,
                  plantEvent
                );
              }
              addLine(
                `🛡️ BOMBA İMHA EDİLDİ! ${prefix} ${getCharName(actorChar)} teröristler hayattayken C4'ü çözmeyi başardı!`,
                isTeam1 ? 1 : 2,
                csVisual ? csVisual.objective('defuse', actorChar, isTeam1 ? 1 : 2) : null
              );
            }
          } else {
            let methods = ["tüm rakipleri temizleyerek", "taktiksel üstünlük kurarak", "ateş gücüyle ezerek"];
            addLine(`${prefix} ${isTeam1 ? t1Name : t2Name} ${methods[Math.floor(Math.random()*methods.length)]} raundu kazandı.`, isTeam1 ? 1 : 2);
          }
        }
        }
        
        if (isTeam1) t1Score++; else t2Score++;

        if (csVisual) {
          addLine(
            `✅ Raunt ${roundNum}: ${isTeam1 ? t1Name : t2Name} kazandı. Skor ${t1Score}-${t2Score}.`,
            isTeam1 ? 1 : 2,
            csVisual.roundEnd(isTeam1 ? 1 : 2, roundReason, roundResolution)
          );
          if (csEconomy && csResolvedRound) {
            const economySummary = csEconomy.finalizeRound({
              winnerTeamId: isTeam1 ? 1 : 2,
              reason: roundReason,
              planted: csResolvedRound.planted,
              planterChar: csResolvedRound.planterChar,
              events: csResolvedRound.events,
              remainingPlayers: csResolvedRound.remainingPlayers
            });
            economySummary.groundInventory = csResolvedRound.groundInventory;
            const recoveredValue = Object.values(
              csResolvedRound.groundInventory?.teams || {}
            ).reduce((sum, team) => sum + Number(team.recoveredValue || 0), 0);
            const lostValue = Object.values(
              csResolvedRound.groundInventory?.teams || {}
            ).reduce((sum, team) => sum + Number(team.lostValue || 0), 0);
            addLine(
              `💵 RAUNT EKONOMİSİ: ${t1Name} $${economySummary.teams[1].teamMoney} | `
                + `${t2Name} $${economySummary.teams[2].teamMoney}`
                + (recoveredValue || lostValue
                  ? ` · Yerden korunan $${recoveredValue}, kayıp $${lostValue}`
                  : ''),
              0,
              csVisual.economySummary(economySummary)
            );
          }
        }
        
        if (isTeam1) {
          t1Econ = 5; t1LossStreak = 0;
          t2LossStreak++;
          if (t2LossStreak > 2) t2Econ = 5; 
          else if (t2LossStreak === 2) t2Econ = 4; 
          else t2Econ = 2; 
        } else {
          t2Econ = 5; t2LossStreak = 0;
          t1LossStreak++;
          if (t1LossStreak > 2) t1Econ = 5; 
          else if (t1LossStreak === 2) t1Econ = 4; 
          else t1Econ = 2; 
        }
        
        roundNum++;
        if (roundNum > 45) break;
      }
    }

    let winner = shootoutWinner || (t1Score >= t2Score ? 1 : 2);
    if (branch === 'lol' && typeof lolWinner !== 'undefined' && lolWinner !== 0) {
      winner = lolWinner;
    }
    
    addLine(`🏆 ${winner === 1 ? t1Name : t2Name} KAZANDI!`);
    
    const result = {
      winner: winner,
      team1Score: t1Score,
      team2Score: t2Score,
      lines: lines,
      seed: simulationSeed,
      spatialTelemetry: footballSpatialTelemetry
    };
    if (branch === 'cs' && isVisualBeta) {
      result.csBetaTelemetry = buildCsBetaTelemetry(result);
    }
    return result;
  } catch (err) {
    console.error('❌ Maç simülasyonu hatası:', err.message);
    return {
      winner: 1, team1Score: 0, team2Score: 0,
      lines: [{ text: '⚠️ Maç simülasyonunda bir hata oluştu: ' + err.message, s1:0, s2:0 }],
      seed: simulationSeed
    };
  } finally {
    Math.random = originalRandom;
  }
}

module.exports = { simulateMatch };
