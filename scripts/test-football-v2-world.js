const assert = require('node:assert/strict');
const { simulateFootballV2Lab } = require('../server/simulation/football-v2-world');

function createTeam(teamId, rating = 75) {
  return {
    displayName: teamId === 1 ? 'Mavi Takım' : 'Kırmızı Takım',
    characters: Array.from({ length: 5 }, (_, index) => ({
      id: teamId * 100 + index,
      name: `T${teamId} Oyuncu ${index + 1}`,
      avatar_emoji: '⚽',
      rating_futbol: rating + (index % 3) - 1,
      rating_fifa: rating + (index % 3) - 1
    }))
  };
}

function createRatingTeam(teamId, ratings) {
  return {
    displayName: teamId === 1 ? 'Mavi Takım' : 'Kırmızı Takım',
    characters: ratings.map((rating, index) => ({
      id: teamId * 100 + index,
      name: `T${teamId} Oyuncu ${index + 1}`,
      avatar_emoji: '⚽',
      rating_futbol: rating,
      rating_fifa: rating
    }))
  };
}

function assertValidCoordinates(result) {
  result.snapshots.forEach(frame => {
    assert(frame.ball.x >= -1.2 && frame.ball.x <= 101.2, `Top X fiziksel alan dışında: ${frame.ball.x}`);
    assert(frame.ball.y >= 7 && frame.ball.y <= 93, `Top Y saha dışında: ${frame.ball.y}`);
    assert(Number.isFinite(frame.ball.vx) && Number.isFinite(frame.ball.vy), 'Top geçersiz hız taşıyor.');
    assert(
      ['carried', 'dribble', 'pass', 'loose', 'shot', 'keeper-held', 'dead'].includes(frame.ball.mode),
      `Geçersiz top durumu: ${frame.ball.mode}`
    );
    if (['carried', 'dribble', 'keeper-held'].includes(frame.ball.mode)) {
      assert(frame.ball.ownerId, 'Kontrollü topun sahibi yok.');
    } else {
      assert.equal(frame.ball.ownerId, null, 'Serbest top bir oyuncuya bağlı kaldı.');
    }
    frame.players.forEach(player => {
      assert(player.x >= 3 && player.x <= 97, `${player.id} X saha dışında: ${player.x}`);
      assert(player.y >= 7 && player.y <= 93, `${player.id} Y saha dışında: ${player.y}`);
      assert(Number.isFinite(player.vx) && Number.isFinite(player.vy), `${player.id} geçersiz hız taşıyor.`);
      assert(player.role, `${player.id} görev taşımıyor.`);
    });
  });
}

function assertShotIntegrity(result) {
  const maximumDistance = result.branch === 'fifa' ? 30.01 : 33.01;
  const mouth = result.branch === 'fifa'
    ? { minY: 43.5, maxY: 56.5 }
    : { minY: 40.5, maxY: 59.5 };
  const shots = result.events.filter(event => event.type === 'shot');
  const goals = result.events.filter(event => event.type === 'goal');
  shots.forEach(event => {
    assert(event.shotDistance <= maximumDistance, `Aşırı uzak şut üretildi: ${event.shotDistance}`);
    assert(event.xg > 0 && event.xg <= 0.8, `Geçersiz şut xG değeri: ${event.xg}`);
  });
  goals.forEach(event => {
    assert(event.x < 0 || event.x > 100, `Gol topu çizginin içine girmedi: ${event.x}`);
    assert(event.y >= mouth.minY && event.y <= mouth.maxY, `Gol kale ağzı dışında oluştu: ${event.y}`);
  });
  assert.equal(
    result.telemetry.goals,
    result.score[1] + result.score[2],
    'Skor ile fiziksel gol telemetrisi eşleşmedi.'
  );
  assert(result.telemetry.shotsOnTarget <= result.telemetry.shots, 'İsabetli şut sayısı toplam şutu aştı.');
  assert.equal(
    result.telemetry.shotsOnTarget,
    result.telemetry.goals + result.telemetry.saves,
    'İsabetli şutlar gol veya gerçek kurtarış sonucu vermedi.'
  );
  assert(
    result.telemetry.keeperClaims <= result.telemetry.catches,
    'Kalecinin dışarı giden topu toplama sayısı toplam tutuşu aştı.'
  );
  assert.equal(result.telemetry.invalidOwnershipTransitions, 0, 'Şut/kaleci akışında geçersiz sahiplik oluştu.');
}

function assertPackage6Integrity(result) {
  assert.equal(result.statistics.teams.length, 2, 'Takım istatistikleri eksik.');
  assert.equal(result.statistics.players.length, result.roster.length, 'Oyuncu istatistikleri kadroyla eşleşmedi.');
  assert(Array.isArray(result.commentary), 'Olaydan türeyen anlatım dizisi eksik.');
  const possession = result.statistics.teams.reduce((total, team) => total + team.possession, 0);
  assert(Math.abs(possession - 100) <= 0.2, `Topa sahip olma toplamı %100 değil: ${possession}`);
  assert.equal(
    result.statistics.teams.reduce((total, team) => total + team.goals, 0),
    result.score[1] + result.score[2],
    'Takım gol istatistiği skorla eşleşmedi.'
  );
  assert.equal(
    result.statistics.teams.reduce((total, team) => total + team.shotsOnTarget, 0),
    result.telemetry.shotsOnTarget,
    'Takım isabetli şut istatistiği dünya telemetrisiyle eşleşmedi.'
  );
  assert.equal(
    result.statistics.players.reduce((total, player) => total + player.saves, 0),
    result.telemetry.saves,
    'Kaleci kurtarış istatistiği dünya telemetrisiyle eşleşmedi.'
  );
  assert(
    Math.abs(
      result.statistics.teams.reduce((total, team) => total + team.xg, 0) -
      result.telemetry.xg
    ) <= 0.03,
    'Takım xG toplamı dünya telemetrisiyle eşleşmedi.'
  );
  result.statistics.players.forEach(player => {
    assert(player.rating >= 3 && player.rating <= 10, `${player.name} geçersiz maç notu aldı.`);
    assert(player.passesCompleted <= player.passesAttempted, `${player.name} pas istatistiği geçersiz.`);
    assert(player.dribblesCompleted <= player.dribblesAttempted, `${player.name} dripling istatistiği geçersiz.`);
    assert(player.xg >= 0 && player.xa >= 0, `${player.name} negatif xG/xA üretti.`);
    assert(player.ratingBreakdown, `${player.name} maç notu bileşenleri eksik.`);
  });
  const restartEvents = result.events.filter(event => (
    ['corner', 'throw-in', 'goal-kick', 'free-kick', 'penalty', 'kickoff'].includes(event.type)
  ));
  restartEvents.forEach(event => {
    assert([1, 2].includes(event.teamId), `Duran top takım kimliği geçersiz: ${event.type}`);
    assert(Number.isFinite(event.x) && Number.isFinite(event.y), `Duran top konumu eksik: ${event.type}`);
  });
  result.events
    .filter(event => event.type === 'restart-taken')
    .forEach(event => assert(event.restartKind, 'Kullanılan duran topun türü eksik.'));
  assert(
    result.telemetry.setPiecesTaken <= restartEvents.length,
    'Kullanılan duran top sayısı verilen duran top sayısını aştı.'
  );
  assert.equal(
    result.telemetry.fouls,
    result.events.filter(event => event.type === 'foul').length,
    'Faul telemetrisi dünya olaylarıyla eşleşmedi.'
  );
}

function assertPackage8Integrity(result) {
  const validPlans = new Set([
    'central-combination',
    'wide-overlap',
    'through-ball',
    'switch-play',
    'cutback',
    'counter',
    'recycle'
  ]);
  const validIntents = new Set([
    'short',
    'through',
    'cross',
    'cutback',
    'one-two',
    'switch',
    'recycle'
  ]);
  const passes = result.events.filter(event => event.type === 'pass');
  passes.forEach(event => {
    assert(validIntents.has(event.intent), `Pas niyeti eksik veya geçersiz: ${event.intent}`);
    assert(validPlans.has(event.attackPlan), `Pas hücum planı eksik veya geçersiz: ${event.attackPlan}`);
  });
  result.events
    .filter(event => event.type === 'attack-plan')
    .forEach(event => assert(validPlans.has(event.plan), `Geçersiz hücum planı: ${event.plan}`));

  const goals = result.events.filter(event => event.type === 'goal');
  const celebrations = result.events.filter(event => event.type === 'goal-celebration');
  const kickoffs = result.events.filter(event => event.type === 'kickoff');
  assert.equal(celebrations.length, goals.length, 'Her gol için ayrı gol sevinci oluşmadı.');
  assert(kickoffs.length <= goals.length, 'Gol olmadan fazladan santra yerleşimi oluştu.');
  assert.equal(result.telemetry.goalCelebrations, goals.length, 'Gol sevinci telemetrisi olaylarla eşleşmedi.');
  assert.equal(result.telemetry.kickoffPlacements, kickoffs.length, 'Santra yerleşim telemetrisi olaylarla eşleşmedi.');
  assert.equal(result.telemetry.kickoffWrongHalfPlayers, 0, 'Santra dizilişinde yanlış yarı alanda oyuncu kaldı.');

  const rosterById = new Map(result.roster.map(player => [player.id, player]));
  goals.forEach(goal => {
    const goalIndex = result.events.indexOf(goal);
    const celebration = result.events.slice(goalIndex + 1).find(event => event.type === 'goal-celebration');
    const nextEvents = result.events.slice(goalIndex + 1);
    const nextGoal = nextEvents.find(event => event.type === 'goal');
    const kickoff = nextEvents.find(event => (
      event.type === 'kickoff' &&
      (!nextGoal || event.t <= nextGoal.t)
    ));
    const restartTaken = result.events.slice(goalIndex + 1).find(event => (
      event.type === 'restart-taken' &&
      event.restartKind === 'kickoff' &&
      (!nextGoal || event.t <= nextGoal.t)
    ));
    assert(celebration && celebration.t >= goal.t, 'Gol sonrası sevinç aşaması başlamadı.');
    if (!kickoff) {
      assert(
        result.durationSeconds - goal.t < 5.3 * (result.playbackScale || 1),
        'Final düdüğünden önce santra için yeterli süre olduğu halde yerleşim başlamadı.'
      );
      return;
    }
    assert(kickoff && kickoff.t > celebration.t, 'Santra gol sevinci bitmeden kuruldu.');
    if (!restartTaken) {
      assert(
        result.durationSeconds - kickoff.t < 1.3 * (result.playbackScale || 1),
        'Santra yerleşiminden sonra vuruş için yeterli süre olduğu halde oyun başlamadı.'
      );
    } else {
      assert(restartTaken.t > kickoff.t, 'Santra yerleşim beklemesi olmadan kullanıldı.');
    }

    const setupFrame = result.snapshots.find(frame => (
      frame.t >= kickoff.t &&
      frame.ball.restartPhase === 'kickoff-setup'
    ));
    assert(setupFrame, 'Santra yerleşimi snapshot akışında görünmedi.');
    setupFrame.players.forEach(player => {
      const profile = rosterById.get(player.id);
      if (!profile || profile.isGoalkeeper) return;
      if (profile.teamId === 1) {
        assert(player.x <= 50, `${profile.name} santrada rakip yarı alanda kaldı: ${player.x}`);
      } else {
        assert(player.x >= 50, `${profile.name} santrada rakip yarı alanda kaldı: ${player.x}`);
      }
    });
  });

  let placementBoundaries = 0;
  for (let index = 1; index < result.snapshots.length; index += 1) {
    const previous = result.snapshots[index - 1];
    const current = result.snapshots[index];
    if (current.ball.discontinuityId !== previous.ball.discontinuityId) {
      placementBoundaries += 1;
      assert(current.ball.placementReason, 'İşaretli yerleşimin placementReason alanı eksik.');
    }
  }
  if (result.telemetry.markedBallPlacements > 0) {
    assert(placementBoundaries > 0, 'Kurallı top yerleşimi snapshot süreksizlik işareti üretmedi.');
  }
}

function findRuleScenario({ prefix, branch = 'futbol', maximumRuns, predicate }) {
  for (let index = 0; index < maximumRuns; index += 1) {
    const result = simulateFootballV2Lab({
      team1: createTeam(1, 65),
      team2: createTeam(2, 65),
      seed: `${prefix}-${index}`,
      durationSeconds: 60,
      branch
    });
    if (predicate(result)) return result;
  }
  return null;
}

function run() {
  const input = {
    team1: createTeam(1),
    team2: createTeam(2),
    seed: 'p8-reg-0',
    durationSeconds: 30
  };
  const first = simulateFootballV2Lab(input);
  const repeat = simulateFootballV2Lab(input);

  assert.deepEqual(first, repeat, 'Aynı seed aynı V2 dünya akışını üretmedi.');
  assert.equal(first.version, 'football-v2-lab-10');
  assert.equal(first.worldTickRate, 20);
  assert.equal(first.snapshotRate, 10);
  assert.equal(first.snapshots.length, 301);
  assert.equal(first.roster.length, 12);
  assert.equal(first.telemetry.teleportCount, 0, 'V2 dünyasında ışınlanma tespit edildi.');
  assert(first.telemetry.maxSpeed <= 8.2, `Azami hız aşıldı: ${first.telemetry.maxSpeed}`);
  assert(first.telemetry.maxAcceleration <= 20, `Azami ivme aşıldı: ${first.telemetry.maxAcceleration}`);
  assert(first.telemetry.averageTeamWidth >= 35, `Takımlar fazla dar kaldı: ${first.telemetry.averageTeamWidth}`);
  assert(first.telemetry.averageTeamLength >= 18, `Takım boyu fazla kısaldı: ${first.telemetry.averageTeamLength}`);
  assert(first.telemetry.minSameTeamDistance >= 1.25, `Aynı takım oyuncuları üst üste bindi: ${first.telemetry.minSameTeamDistance}`);
  assert(first.telemetry.restDefenseVacantSeconds <= 4, `Geride emniyet uzun süre kayboldu: ${first.telemetry.restDefenseVacantSeconds}`);
  assert(first.telemetry.defensiveCoverVacantSeconds <= 12, `Savunma arkası uzun süre korumasız kaldı: ${first.telemetry.defensiveCoverVacantSeconds}`);
  assert(first.telemetry.clusteredSeconds <= 2, `Top çevresinde uzun süreli kümelenme oluştu: ${first.telemetry.clusteredSeconds}`);
  assert(first.telemetry.roleSwitches > 0 && first.telemetry.roleSwitches <= 130, `Rol değişim sayısı sağlıksız: ${first.telemetry.roleSwitches}`);
  assert(first.telemetry.maxRoleSwitchesPerPlayer <= 16, `Bir oyuncu aşırı rol değiştirdi: ${first.telemetry.maxRoleSwitchesPerPlayer}`);
  assert.equal(first.telemetry.playerRoles.length, 10, 'Oyuncu bazlı rol telemetrisi eksik.');
  first.telemetry.playerRoles.forEach(player => {
    assert(player.averageRoleSeconds >= 2, `${player.playerId} görevlerinde yeterince kalmadı.`);
    assert(Object.keys(player.roleSeconds).length > 0, `${player.playerId} görev süresi üretmedi.`);
  });
  assert(first.telemetry.phaseChanges > 0, 'Takım fazları dünya akışında değişmedi.');
  assert(Object.keys(first.telemetry.phaseDurations).length >= 3, 'Faz süreleri raporlanmadı.');
  assert(first.telemetry.defensivePlans > 0, 'Savunma planı üretilmedi.');
  assert(first.telemetry.pressHandoffs > 0, 'Birinci baskıcı sorumluluğu hiç devredilmedi.');
  assert(first.telemetry.markingHandoffs > 0, 'Markaj sorumluluğu hiç devredilmedi.');
  assert.equal(first.telemetry.invalidDefensiveShapeSeconds, 0, 'Savunma görev yapısı eksik veya çakışmalı üretildi.');
  assert(first.telemetry.defensiveOvercommitSeconds <= 1, `Savunma açıklanamayan biçimde topa yığıldı: ${first.telemetry.defensiveOvercommitSeconds}`);
  assert(first.telemetry.uncoveredThreatSeconds <= 5, `Tehlikeli oyuncu uzun süre açık kaldı: ${first.telemetry.uncoveredThreatSeconds}`);
  assert(first.events.some(event => event.type === 'pass'), 'Laboratuvar akışında pas oluşmadı.');
  assert(first.events.some(event => event.type === 'dribble-touch'), 'Dokunuş tabanlı dripling oluşmadı.');
  assert(first.events.some(event => event.type === 'shot'), 'Bağlamsal fiziksel şut oluşmadı.');
  assert(first.events.some(event => event.type === 'keeper-decision'), 'Kaleci karar olayı oluşmadı.');
  assert(first.events.some(event => event.type === 'first-touch'), 'Fiziksel ilk kontrol olayı oluşmadı.');
  assert(
    first.events.some(event => ['heavy-touch', 'deflection'].includes(event.type)),
    'Kontrol hatası veya fiziksel sekme olayı oluşmadı.'
  );
  assert(first.events.some(event => event.type === 'handoff'), 'Savunma devri görsel olay akışına yansımadı.');
  assert(first.telemetry.passesAttempted > 0, 'Pas denemesi telemetrisi oluşmadı.');
  assert(first.telemetry.dribbleAttempts > 0, 'Dripling denemesi telemetrisi oluşmadı.');
  assert(first.telemetry.shots > 0, 'Şut telemetrisi oluşmadı.');
  assert(first.telemetry.xg > 0, 'Şut xG telemetrisi oluşmadı.');
  assert(first.telemetry.goalkeeperDecisionChanges > 0, 'Kaleci konum kararı telemetrisi oluşmadı.');
  assert(first.telemetry.dribbleTouches === first.telemetry.dribbleAttempts, 'Dripling dokunuş sayısı denemeyle eşleşmedi.');
  assert(first.telemetry.maxDribbleTurnDegrees <= 48.01, `Dripling dönüş sınırı aşıldı: ${first.telemetry.maxDribbleTurnDegrees}`);
  assert(first.telemetry.completedPasses <= first.telemetry.passesAttempted, 'Tamamlanan pas sayısı denemeyi aştı.');
  assert(first.telemetry.maxBallSpeed <= 41.5, `Top hızı fizik sınırını aştı: ${first.telemetry.maxBallSpeed}`);
  assert(first.telemetry.maxBallStep <= 2.2, `Top bir dünya adımında sıçradı: ${first.telemetry.maxBallStep}`);
  assert.equal(first.telemetry.ballDiscontinuities, 0, 'Top konumunda geri ışınlanma/süreksizlik oluştu.');
  assert.equal(first.telemetry.invalidOwnershipTransitions, 0, 'Top uzaktaki oyuncuya bağlandı.');
  assert(first.telemetry.maxOwnershipAttachDistance <= 3.4, 'Sahiplik fiziksel oyuncu/kaleci erişimi dışında değişti.');
  assertValidCoordinates(first);
  assertShotIntegrity(first);
  assertPackage6Integrity(first);
  assertPackage8Integrity(first);
  const fifaInput = {
    team1: createTeam(1),
    team2: createTeam(2),
    seed: 'football-v2-fifa-regression',
    durationSeconds: 30,
    branch: 'fifa'
  };
  const fifa = simulateFootballV2Lab(fifaInput);
  const fifaRepeat = simulateFootballV2Lab(fifaInput);
  assert.deepEqual(fifa, fifaRepeat, 'Aynı seed aynı FIFA V2 dünya akışını üretmedi.');
  assert.equal(fifa.branch, 'fifa');
  assert.equal(fifa.roster.length, 22, 'FIFA V2 sahasında toplam 22 oyuncu bulunmalı.');
  assert.equal(fifa.roster.filter(player => player.isGoalkeeper).length, 2, 'FIFA V2 kalecileri eksik.');
  assert.equal(fifa.roster.filter(player => player.isBot).length, 12, 'FIFA V2 10 saha botu ve 2 bot kaleci üretmeli.');
  assert.equal(fifa.roster.filter(player => !player.isBot).length, 10, 'FIFA V2 draft karakterlerini korumalı.');
  assert.equal(new Set(fifa.roster.map(player => player.positionCode)).size, 11, 'FIFA mevki etiketleri eksik.');
  assert.equal(fifa.telemetry.teleportCount, 0, 'FIFA V2 dünyasında ışınlanma tespit edildi.');
  assert(fifa.telemetry.maxSpeed <= 8.2, `FIFA azami hız sınırı aşıldı: ${fifa.telemetry.maxSpeed}`);
  assert(fifa.telemetry.minSameTeamDistance >= 2.4, `FIFA oyuncuları üst üste bindi: ${fifa.telemetry.minSameTeamDistance}`);
  assert(fifa.telemetry.averageTeamWidth >= 60, `FIFA takımları sahayı yeterince geniş kullanmadı: ${fifa.telemetry.averageTeamWidth}`);
  assert(fifa.telemetry.averageTeamLength >= 24, `FIFA hatları fazla sıkıştı: ${fifa.telemetry.averageTeamLength}`);
  assert(fifa.telemetry.clusteredSeconds <= 2, `FIFA top çevresinde uzun süre kümelendi: ${fifa.telemetry.clusteredSeconds}`);
  assert.equal(fifa.telemetry.invalidDefensiveShapeSeconds, 0, 'FIFA savunma/markaj matrisi eksik veya çakışmalı.');
  assert(fifa.telemetry.defensiveOvercommitSeconds <= 1, `FIFA savunması topa aşırı yığıldı: ${fifa.telemetry.defensiveOvercommitSeconds}`);
  assert(fifa.telemetry.uncoveredThreatSeconds <= 5, `FIFA tehlikeli alanı uzun süre boş bıraktı: ${fifa.telemetry.uncoveredThreatSeconds}`);
  assert(fifa.telemetry.pressHandoffs > 0, 'FIFA birinci baskıcı sorumluluğu hiç devredilmedi.');
  assert(fifa.telemetry.markingHandoffs > 0, 'FIFA markaj matrisi hiç devir üretmedi.');
  assert.equal(fifa.telemetry.playerRoles.length, 20, 'FIFA oyuncu bazlı rol telemetrisi eksik.');
  assert(fifa.telemetry.passesAttempted > 0, 'FIFA fiziksel pas üretmedi.');
  assert(fifa.telemetry.dribbleAttempts > 0, 'FIFA dokunuş tabanlı dripling üretmedi.');
  assert(fifa.telemetry.shots > 0, 'FIFA fiziksel şut üretmedi.');
  assert(fifa.telemetry.maxDribbleTurnDegrees <= 48.01, 'FIFA dripling dönüş sınırını aştı.');
  assert.equal(fifa.telemetry.ballDiscontinuities, 0, 'FIFA top konumunda süreksizlik oluştu.');
  assert.equal(fifa.telemetry.invalidOwnershipTransitions, 0, 'FIFA topu uzaktaki oyuncuya bağladı.');
  assert(fifa.telemetry.maxBallStep <= 2.2, `FIFA topu bir dünya adımında sıçradı: ${fifa.telemetry.maxBallStep}`);
  const fifaRoles = new Set(fifa.snapshots.flatMap(frame => frame.players.map(player => player.role)));
  ['sweeper', 'midfield-center', 'back-center-left', 'back-center-right', 'runner-left', 'runner-right']
    .forEach(role => assert(fifaRoles.has(role), `FIFA V2 görevi üretilmedi: ${role}`));
  assertValidCoordinates(fifa);
  assertShotIntegrity(fifa);
  assertPackage6Integrity(fifa);
  assertPackage8Integrity(fifa);

  const freeKickCase = findRuleScenario({
    prefix: 'p8-free-kick',
    maximumRuns: 120,
    predicate: result => (
      result.events.some(event => event.type === 'foul') &&
      result.events.some(event => event.type === 'free-kick') &&
      result.events.some(event => event.type === 'restart-taken' && event.restartKind === 'free-kick')
    )
  });
  assert(freeKickCase, '120 deterministik koşuda kullanılabilir serbest vuruş senaryosu oluşmadı.');
  assertPackage6Integrity(freeKickCase);
  assert(freeKickCase.events.some(event => event.type === 'foul'), 'Fiziksel faul olayı oluşmadı.');
  assert(freeKickCase.events.some(event => event.type === 'free-kick'), 'Serbest vuruş kararı oluşmadı.');
  assert(freeKickCase.events.some(event => event.type === 'restart-taken'), 'Serbest vuruş fiziksel olarak kullanılmadı.');

  const penaltyCase = findRuleScenario({
    prefix: 'p8-penalty',
    branch: 'fifa',
    maximumRuns: 320,
    predicate: result => (
      result.events.some(event => event.type === 'penalty') &&
      result.events.some(event => event.type === 'shot' && event.isPenalty)
    )
  });
  assert(penaltyCase, '320 deterministik FIFA koşusunda kullanılabilir penaltı senaryosu oluşmadı.');
  assertPackage6Integrity(penaltyCase);
  assert(penaltyCase.events.some(event => event.type === 'penalty'), 'Ceza alanı faulü penaltıya dönüşmedi.');
  assert(
    penaltyCase.events.some(event => event.type === 'shot' && event.isPenalty),
    'Penaltı fiziksel şut olarak kullanılmadı.'
  );

  const fifaPhysicsRuns = [];
  for (let index = 0; index < 12; index += 1) {
    const result = simulateFootballV2Lab({
      team1: createTeam(1, 65 + (index % 5) * 5),
      team2: createTeam(2, 65 + ((index * 3) % 5) * 5),
      seed: `football-v2-fifa-physics-${index}`,
      durationSeconds: 30,
      branch: 'fifa'
    });
    assertValidCoordinates(result);
    assertShotIntegrity(result);
    assertPackage6Integrity(result);
    assertPackage8Integrity(result);
    fifaPhysicsRuns.push(result.telemetry);
  }
  const fifaPhysicsSum = key => fifaPhysicsRuns
    .map(telemetry => telemetry[key])
    .reduce((total, value) => total + value, 0);
  assert(fifaPhysicsSum('passesAttempted') >= 36, 'FIFA fiziksel pas örneklemi yetersiz.');
  assert(
    fifaPhysicsSum('interceptions') + fifaPhysicsSum('deflections') > 0,
    'FIFA pas yolu teması üretmedi.'
  );
  assert(fifaPhysicsSum('controlErrors') > 0, 'FIFA ilk kontrol hatası üretmedi.');
  assert(fifaPhysicsSum('looseBalls') > 0, 'FIFA sahipsiz top üretmedi.');
  assert(fifaPhysicsSum('dribbleAttempts') >= 80, 'FIFA dripling örneklemi yetersiz.');
  assert(fifaPhysicsSum('dribbleDuels') > 0, 'FIFA fiziksel dripling düellosu üretmedi.');
  assert(fifaPhysicsSum('failedDribbles') > 0, 'FIFA başarısız dripling sonucu üretmedi.');
  assert(fifaPhysicsSum('shots') >= 8, 'FIFA şut örneklemi yetersiz.');
  assert(
    fifaPhysicsSum('goals') + fifaPhysicsSum('saves') + fifaPhysicsSum('misses') +
      fifaPhysicsSum('blocks') + fifaPhysicsSum('woodwork') > 0,
    'FIFA fiziksel şut sonucu üretmedi.'
  );
  assert.equal(fifaPhysicsSum('ballDiscontinuities'), 0, 'FIFA çoklu seed top akışında süreksizlik oluştu.');
  assert.equal(fifaPhysicsSum('invalidOwnershipTransitions'), 0, 'FIFA çoklu seed uzaktan sahiplik değişimi üretti.');
  assert(
    Math.max(...fifaPhysicsRuns.map(telemetry => telemetry.maxBallStep)) <= 2.2,
    'FIFA çoklu seed top adımı fizik sınırını aştı.'
  );

  const calibrationRuns = [];
  const calibrationPassIntents = new Set();
  const calibrationAttackPlans = new Set();
  for (let index = 0; index < 24; index += 1) {
    const team1Rating = 65 + (index % 5) * 5;
    const team2Rating = 65 + ((index * 3) % 5) * 5;
    const result = simulateFootballV2Lab({
      team1: createTeam(1, team1Rating),
      team2: createTeam(2, team2Rating),
      seed: `football-v2-calibration-${index}`,
      durationSeconds: 30
    });
    assertValidCoordinates(result);
    assertShotIntegrity(result);
    assertPackage6Integrity(result);
    assertPackage8Integrity(result);
    result.events
      .filter(event => event.type === 'pass')
      .forEach(event => calibrationPassIntents.add(event.intent));
    result.events
      .filter(event => event.type === 'attack-plan')
      .forEach(event => calibrationAttackPlans.add(event.plan));
    calibrationRuns.push(result.telemetry);
  }

  const values = key => calibrationRuns.map(telemetry => telemetry[key]);
  const average = key => values(key).reduce((total, value) => total + value, 0) / calibrationRuns.length;
  const calibration = {
    runs: calibrationRuns.length,
    averageRoleSwitches: Number(average('roleSwitches').toFixed(2)),
    maximumRoleSwitches: Math.max(...values('roleSwitches')),
    maximumPlayerRoleSwitches: Math.max(...values('maxRoleSwitchesPerPlayer')),
    minimumSameTeamDistance: Math.min(...values('minSameTeamDistance')),
    minimumTeamWidth: Math.min(...values('averageTeamWidth')),
    minimumTeamLength: Math.min(...values('averageTeamLength')),
    maximumRestDefenseVacancy: Math.max(...values('restDefenseVacantSeconds')),
    maximumDefensiveCoverVacancy: Math.max(...values('defensiveCoverVacantSeconds')),
    maximumClusteredSeconds: Math.max(...values('clusteredSeconds')),
    minimumPressHandoffs: Math.min(...values('pressHandoffs')),
    maximumDefensiveOvercommit: Math.max(...values('defensiveOvercommitSeconds')),
    maximumInvalidDefensiveShape: Math.max(...values('invalidDefensiveShapeSeconds')),
    maximumUncoveredThreat: Math.max(...values('uncoveredThreatSeconds')),
    maximumAverageMarkingDistance: Math.max(...values('averageMarkingDistance')),
    passesAttempted: values('passesAttempted').reduce((total, value) => total + value, 0),
    deflections: values('deflections').reduce((total, value) => total + value, 0),
    controlErrors: values('controlErrors').reduce((total, value) => total + value, 0),
    looseBalls: values('looseBalls').reduce((total, value) => total + value, 0),
    dribbleAttempts: values('dribbleAttempts').reduce((total, value) => total + value, 0),
    successfulDribbles: values('successfulDribbles').reduce((total, value) => total + value, 0),
    failedDribbles: values('failedDribbles').reduce((total, value) => total + value, 0),
    dribbleDuels: values('dribbleDuels').reduce((total, value) => total + value, 0),
    shoulderDuels: values('shoulderDuels').reduce((total, value) => total + value, 0),
    shieldActions: values('shieldActions').reduce((total, value) => total + value, 0),
    successfulShields: values('successfulShields').reduce((total, value) => total + value, 0),
    heavyDribbleTouches: values('heavyDribbleTouches').reduce((total, value) => total + value, 0),
    maximumDribbleTurnDegrees: Math.max(...values('maxDribbleTurnDegrees')),
    shots: values('shots').reduce((total, value) => total + value, 0),
    shotsOnTarget: values('shotsOnTarget').reduce((total, value) => total + value, 0),
    goals: values('goals').reduce((total, value) => total + value, 0),
    saves: values('saves').reduce((total, value) => total + value, 0),
    keeperClaims: values('keeperClaims').reduce((total, value) => total + value, 0),
    catches: values('catches').reduce((total, value) => total + value, 0),
    parries: values('parries').reduce((total, value) => total + value, 0),
    blocks: values('blocks').reduce((total, value) => total + value, 0),
    misses: values('misses').reduce((total, value) => total + value, 0),
    woodwork: values('woodwork').reduce((total, value) => total + value, 0),
    longRangeShots: values('longRangeShots').reduce((total, value) => total + value, 0),
    totalXg: Number(values('xg').reduce((total, value) => total + value, 0).toFixed(3)),
    maximumShotDistance: Math.max(...values('maxShotDistance')),
    ballDiscontinuities: values('ballDiscontinuities').reduce((total, value) => total + value, 0),
    invalidOwnershipTransitions: values('invalidOwnershipTransitions').reduce((total, value) => total + value, 0),
    maximumBallStep: Math.max(...values('maxBallStep')),
    corners: values('corners').reduce((total, value) => total + value, 0),
    throwIns: values('throwIns').reduce((total, value) => total + value, 0),
    goalKicks: values('goalKicks').reduce((total, value) => total + value, 0),
    freeKicks: values('freeKicks').reduce((total, value) => total + value, 0),
    penalties: values('penalties').reduce((total, value) => total + value, 0),
    kickoffs: values('kickoffs').reduce((total, value) => total + value, 0),
    fouls: values('fouls').reduce((total, value) => total + value, 0),
    setPiecesTaken: values('setPiecesTaken').reduce((total, value) => total + value, 0),
    teleportCount: values('teleportCount').reduce((total, value) => total + value, 0)
  };

  assert.equal(calibration.teleportCount, 0, 'Çoklu seed kalibrasyonunda ışınlanma oluştu.');
  assert(calibration.maximumRoleSwitches <= 115, `Çoklu seed rol değişimi sınırı aşıldı: ${calibration.maximumRoleSwitches}`);
  assert(calibration.maximumPlayerRoleSwitches <= 16, `Oyuncu rol titremesi sınırı aşıldı: ${calibration.maximumPlayerRoleSwitches}`);
  assert(calibration.minimumSameTeamDistance >= 3.5, `Çoklu seed oyuncu mesafesi düştü: ${calibration.minimumSameTeamDistance}`);
  assert(calibration.minimumTeamWidth >= 39, `Çoklu seed takım genişliği düştü: ${calibration.minimumTeamWidth}`);
  assert(calibration.minimumTeamLength >= 18, `Çoklu seed takım boyu düştü: ${calibration.minimumTeamLength}`);
  assert(calibration.maximumRestDefenseVacancy <= 5, `Çoklu seed geride emniyet sınırı aşıldı: ${calibration.maximumRestDefenseVacancy}`);
  assert(calibration.maximumDefensiveCoverVacancy <= 12, `Çoklu seed savunma koruması sınırı aşıldı: ${calibration.maximumDefensiveCoverVacancy}`);
  assert(calibration.maximumClusteredSeconds <= 2.5, `Çoklu seed kümelenme sınırı aşıldı: ${calibration.maximumClusteredSeconds}`);
  assert(calibration.minimumPressHandoffs >= 1, 'Çoklu seed koşularından birinde baskı devri oluşmadı.');
  assert(calibration.maximumDefensiveOvercommit <= 1, `Çoklu seed topa yığılma sınırı aşıldı: ${calibration.maximumDefensiveOvercommit}`);
  assert.equal(calibration.maximumInvalidDefensiveShape, 0, 'Çoklu seed savunma görev yapısı bozuldu.');
  assert(calibration.maximumUncoveredThreat <= 5, `Çoklu seed açık tehdit sınırı aşıldı: ${calibration.maximumUncoveredThreat}`);
  assert(calibration.maximumAverageMarkingDistance <= 21, `Çoklu seed markaj mesafesi yükseldi: ${calibration.maximumAverageMarkingDistance}`);
  assert(calibration.passesAttempted >= 100, 'Çoklu seed fiziksel pas örneklemi yetersiz.');
  assert(calibration.controlErrors > 0, 'Çoklu seed kontrol hatası üretmedi.');
  assert(calibration.looseBalls > 0, 'Çoklu seed sahipsiz top üretmedi.');
  assert(calibration.dribbleAttempts >= 180, 'Çoklu seed dripling örneklemi yetersiz.');
  assert(calibration.dribbleDuels > 0, 'Çoklu seed fiziksel dripling düellosu üretmedi.');
  assert(calibration.successfulDribbles > 0, 'Çoklu seed başarılı çalım üretmedi.');
  assert(calibration.failedDribbles > 0, 'Çoklu seed başarısız çalım üretmedi.');
  assert(calibration.shieldActions > 0, 'Çoklu seed top saklama aksiyonu üretmedi.');
  assert(calibration.shoulderDuels > 0, 'Çoklu seed omuz omuza mücadele üretmedi.');
  assert(calibration.maximumDribbleTurnDegrees <= 48.01, 'Çoklu seed dripling dönüş sınırını aştı.');
  assert(calibration.shots >= 24, 'Çoklu seed şut örneklemi yetersiz.');
  assert(calibration.goals > 0, 'Çoklu seed fiziksel gol üretmedi.');
  assert(calibration.saves > 0, 'Çoklu seed kaleci kurtarışı üretmedi.');
  assert(calibration.misses + calibration.blocks + calibration.woodwork > 0, 'Çoklu seed gol dışı şut sonucu üretmedi.');
  assert(calibration.totalXg > 0, 'Çoklu seed xG üretmedi.');
  assert(calibration.maximumShotDistance <= 33.01, 'Çoklu seed aşırı uzak şut üretti.');
  assert.equal(calibration.ballDiscontinuities, 0, 'Çoklu seed top akışında süreksizlik oluştu.');
  assert.equal(calibration.invalidOwnershipTransitions, 0, 'Çoklu seed uzaktan sahiplik değişimi üretti.');
  assert(calibration.maximumBallStep <= 2.2, `Çoklu seed top adımı sınırı aşıldı: ${calibration.maximumBallStep}`);
  assert(calibration.throwIns > 0, 'Çoklu seed gerçek taç kararı üretmedi.');
  assert(calibration.goalKicks > 0, 'Çoklu seed kale vuruşu üretmedi.');
  assert(calibration.kickoffs > 0, 'Çoklu seed gol sonrası santra üretmedi.');
  assert(calibration.setPiecesTaken > 0, 'Çoklu seed duran top kullanımı üretmedi.');
  assert.equal(calibrationPassIntents.size, 7, 'Kalibrasyon yedi pas niyetinin tamamını üretmedi.');
  assert.equal(calibrationAttackPlans.size, 7, 'Kalibrasyon yedi hücum planının tamamını üretmedi.');

  const extremeProfiles = [
    [20, 31, 50, 60, 83],
    [95, 88, 76, 64, 52],
    [35, 45, 55, 65, 75],
    [80, 80, 80, 20, 20]
  ];
  const extremeRuns = [];
  for (let index = 0; index < 8; index += 1) {
    const result = simulateFootballV2Lab({
      team1: createRatingTeam(1, extremeProfiles[index % extremeProfiles.length]),
      team2: createRatingTeam(2, extremeProfiles[(index + 1) % extremeProfiles.length]),
      seed: `football-v2-extreme-rating-${index}`,
      durationSeconds: 30
    });
    assertPackage6Integrity(result);
    assertPackage8Integrity(result);
    assertValidCoordinates(result);
    extremeRuns.push(result.telemetry);
  }
  const extremeValues = key => extremeRuns.map(telemetry => telemetry[key]);
  const extremeCalibration = {
    runs: extremeRuns.length,
    teleportCount: extremeValues('teleportCount').reduce((total, value) => total + value, 0),
    minimumTeamWidth: Math.min(...extremeValues('averageTeamWidth')),
    maximumDefensiveOvercommit: Math.max(...extremeValues('defensiveOvercommitSeconds')),
    maximumInvalidDefensiveShape: Math.max(...extremeValues('invalidDefensiveShapeSeconds')),
    maximumUncoveredThreat: Math.max(...extremeValues('uncoveredThreatSeconds'))
  };
  assert.equal(extremeCalibration.teleportCount, 0, 'Uç rating koşularında ışınlanma oluştu.');
  assert(extremeCalibration.minimumTeamWidth >= 35, `Uç rating koşularında takım genişliği çöktü: ${extremeCalibration.minimumTeamWidth}`);
  assert(extremeCalibration.maximumDefensiveOvercommit <= 5, `Uç rating koşularında topa yığılma sınırı aşıldı: ${extremeCalibration.maximumDefensiveOvercommit}`);
  assert.equal(extremeCalibration.maximumInvalidDefensiveShape, 0, 'Uç rating koşularında savunma görev yapısı bozuldu.');
  assert(extremeCalibration.maximumUncoveredThreat <= 10, `Uç rating koşularında açık tehdit sınırı aşıldı: ${extremeCalibration.maximumUncoveredThreat}`);

  const fullMatch = simulateFootballV2Lab({
    team1: createTeam(1),
    team2: createTeam(2),
    seed: 'football-v2-package-7-full-match',
    branch: 'fifa',
    mode: 'full',
    measurePerformance: true
  });
  assert.equal(fullMatch.matchMode, 'full', 'Paket 7 tam maç modu etkinleşmedi.');
  assert.equal(fullMatch.matchMinutes, 90, 'FIFA tam maç saati 90 dakika değil.');
  assert.equal(fullMatch.durationSeconds, 180, 'FIFA tam maç oynatma süresi beklenen değerde değil.');
  assert.equal(fullMatch.simulationDurationSeconds, 330, 'FIFA iç dünya süresi beklenen değerde değil.');
  assert.equal(fullMatch.snapshotRate, 3, 'Tam maç uyarlanabilir snapshot hızı kullanılmadı.');
  assert.equal(fullMatch.snapshots.length, 541, 'Tam maç snapshot sayısı beklenen değerde değil.');
  assert.equal(fullMatch.snapshotStrategy, 'adaptive-3hz-full');
  assert(fullMatch.performance.simulationMs > 0, 'Tam maç çalışma süresi ölçülmedi.');
  assert(fullMatch.performance.estimatedPayloadBytes > 0, 'Tam maç ağ yükü ölçülmedi.');
  assert(fullMatch.performance.estimatedPayloadBytes < 4 * 1024 * 1024, 'Tam maç tahmini ağ yükü 4 MB sınırını aştı.');
  assert.equal(fullMatch.performance.snapshotCount, fullMatch.snapshots.length);
  assertValidCoordinates(fullMatch);
  assertShotIntegrity(fullMatch);
  assertPackage6Integrity(fullMatch);
  assertPackage8Integrity(fullMatch);
  assert(
    Object.values(fullMatch.telemetry.passIntents).filter(count => count > 0).length >= 5,
    'Tam maç yeterli pas niyeti çeşitliliği üretmedi.'
  );
  assert(
    Object.values(fullMatch.telemetry.attackPlanTypes).filter(count => count > 0).length >= 6,
    'Tam maç yeterli hücum planı çeşitliliği üretmedi.'
  );

  console.log(JSON.stringify({
    seed: first.seed,
    fifaSeed: fifa.seed,
    fifaPhysicsRuns: fifaPhysicsRuns.length,
    snapshots: first.snapshots.length,
    events: first.events.length,
    fullMatchPerformance: fullMatch.performance,
    telemetry: {
      ...first.telemetry,
      roleChanges: first.telemetry.roleChanges.length,
      handoffEvents: first.telemetry.handoffEvents.length,
      playerRoles: first.telemetry.playerRoles.map(player => ({
        playerId: player.playerId,
        switches: player.switches,
        averageRoleSeconds: player.averageRoleSeconds
      }))
    },
    calibration,
    extremeCalibration
  }, null, 2));
}

run();
