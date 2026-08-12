const assert = require('assert');
const { simulateMatch } = require('../server/simulation/engine');
const {
  createFootballIntelligence,
  createFootballMatchState
} = require('../server/simulation/football-ai');

function card(name, role, rating = 78, isGoalkeeper = false) {
  return {
    name,
    role,
    visualRole: role,
    avatar_emoji: isGoalkeeper ? '🧤' : '⚽',
    rating_futbol: rating,
    rating_fifa: rating,
    isGoalkeeper
  };
}

function directDecisionScenario() {
  const team1 = [
    card('Mavi Kaleci', 'GK', 76, true),
    card('Mavi Sol', 'LB'),
    card('Mavi Orta', 'LDM'),
    card('Mavi On', 'CAM', 82),
    card('Mavi Sag', 'RAM', 80),
    card('Mavi Forvet', 'ST', 84)
  ];
  const team2 = [
    card('Kirmizi Kaleci', 'GK', 76, true),
    card('Kirmizi Sol', 'LB'),
    card('Kirmizi Stoper', 'LCB'),
    card('Kirmizi Orta', 'LDM'),
    card('Kirmizi On', 'CAM'),
    card('Kirmizi Forvet', 'ST')
  ];
  const state = createFootballMatchState({ branch: 'fifa', team1, team2, random: () => 0.4 });
  const striker = team1.at(-1);
  state.setPoint(striker, { x: 78, y: 50 });
  team2.filter(player => !player.isGoalkeeper).forEach((player, index) => {
    state.setPoint(player, { x: 44 - index * 2, y: 20 + index * 14 });
  });
  const intelligence = createFootballIntelligence({
    branch: 'fifa',
    attackers: team1,
    defenders: team2,
    teamId: 1,
    ratingOf: player => player.rating_fifa,
    random: () => 0.4,
    sharedState: state
  });

  const decision = intelligence.onBallDecision(striker, 0.72, 50);
  assert.equal(decision.type, 'shot', 'Kaleciyle karşı karşıya kalan oyuncu pas vermemeli.');
  assert.equal(decision.forcedOneOnOne, true, 'Karşı karşıya pozisyon zorunlu şut olmalı.');

  const midfielder = team1[3];
  state.setPoint(midfielder, { x: 62, y: 50 });
  const receiver = intelligence.chooseReceiver(midfielder, 0.54, 50, false);
  assert(receiver, 'Açık ilerleme koridorunda pas seçeneği bulunmalı.');
  assert(
    receiver.forwardGain > 0.035,
    `Baskısız açık koridorda geri pas seçildi: ${receiver.forwardGain}`
  );

  const fiveASideState = createFootballMatchState({
    branch: 'futbol',
    team1,
    team2,
    random: () => 0.4
  });
  fiveASideState.setPoint(striker, { x: 84, y: 50 });
  team2.filter(player => !player.isGoalkeeper).forEach((player, index) => {
    fiveASideState.setPoint(player, { x: 42 - index * 2, y: 20 + index * 14 });
  });
  const fiveASideIntelligence = createFootballIntelligence({
    branch: 'futbol',
    attackers: team1,
    defenders: team2,
    teamId: 1,
    ratingOf: player => player.rating_futbol,
    random: () => 0.4,
    sharedState: fiveASideState
  });
  const fiveASideDecision = fiveASideIntelligence.onBallDecision(striker, 0.72, 50);
  assert.equal(fiveASideDecision.type, 'shot', 'Halı Sahada kaleciyle karşı karşıya kalan oyuncu şut çekmeli.');
  assert.equal(fiveASideDecision.forcedOneOnOne, true, 'Halı Saha karşı karşıya pozisyonu zorunlu şut olmalı.');
}

function testTeam(prefix, branch, offset = 0) {
  const roles = branch === 'fifa'
    ? ['LB', 'LCB', 'LDM', 'CAM', 'ST']
    : ['SLOT_0', 'SLOT_1', 'SLOT_2', 'SLOT_3', 'SLOT_4'];
  return {
    displayName: `${prefix} Takımı`,
    style: 'dengeli',
    characters: roles.map((role, index) => ({
      name: `${prefix}-${index + 1}`,
      role,
      avatar_emoji: '⚽',
      [`rating_${branch}`]: 74 + offset + index * 2
    }))
  };
}

function runBranch(branch, matchCount) {
  const replaySeed = `${branch}-decision-replay`;
  const replayA = simulateMatch(
    testTeam('Mavi', branch),
    testTeam('Kirmizi', branch, 1),
    branch,
    true,
    true,
    { seed: replaySeed }
  );
  const replayB = simulateMatch(
    testTeam('Mavi', branch),
    testTeam('Kirmizi', branch, 1),
    branch,
    true,
    true,
    { seed: replaySeed }
  );
  assert.deepEqual(replayA, replayB, `${branch}: aynı seed aynı sonucu üretmeli.`);

  const totals = {
    goals: 0,
    zeroGoalMatches: 0,
    decisions: 0,
    backwardPasses: 0,
    unnecessaryBackwardPasses: 0,
    forcedOneOnOneShots: 0,
    openLaneCarries: 0,
    forcedAdvanceCarries: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    expectedPassesCompleted: 0,
    actionValue: 0,
    offBallPlans: 0,
    crowdedPlans: 0,
    spacingCorrections: 0,
    attackingWidthTotal: 0,
    wideRoleAssignments: 0,
    supportRoleAssignments: 0,
    safetyRoleAssignments: 0,
    attackingLengthTotal: 0,
    maximumAttackingLength: 0,
    backfieldShapeViolations: 0,
    defensivePlans: 0,
    defensiveOvercommitPlans: 0,
    defensiveWidthTotal: 0,
    primaryPressAssignments: 0,
    coverAssignments: 0,
    passLaneBlockAssignments: 0,
    restDefenseAssignments: 0,
    trackedThreatAssignments: 0,
    unguardedBackPlans: 0,
    defensiveSpacingCorrections: 0,
    interceptedPasses: 0,
    longRangeShots: 0
  };

  for (let index = 0; index < matchCount; index += 1) {
    const result = simulateMatch(
      testTeam('Mavi', branch),
      testTeam('Kirmizi', branch, 1),
      branch,
      true,
      true,
      { seed: `${branch}-decision-batch-${index}` }
    );
    assert(!result.lines.some(line => line.text?.includes('Maç simülasyonunda bir hata oluştu')));
    assert(result.spatialTelemetry, `${branch}: uzamsal telemetri eksik.`);
    const matchGoals = result.team1Score + result.team2Score;
    totals.goals += matchGoals;
    if (matchGoals === 0) totals.zeroGoalMatches++;
    totals.decisions += result.spatialTelemetry.onBallDecisions;
    totals.backwardPasses += result.spatialTelemetry.backwardPasses;
    totals.unnecessaryBackwardPasses += result.spatialTelemetry.unnecessaryBackwardPasses;
    totals.forcedOneOnOneShots += result.spatialTelemetry.forcedOneOnOneShots;
    totals.openLaneCarries += result.spatialTelemetry.openLaneCarries;
    totals.forcedAdvanceCarries += result.spatialTelemetry.forcedAdvanceCarries;
    totals.offBallPlans += result.spatialTelemetry.offBallPlans;
    totals.crowdedPlans += result.spatialTelemetry.crowdedPlans;
    totals.spacingCorrections += result.spatialTelemetry.spacingCorrections;
    totals.attackingWidthTotal +=
      result.spatialTelemetry.averageAttackingWidth * result.spatialTelemetry.offBallPlans;
    totals.wideRoleAssignments += result.spatialTelemetry.wideRoleAssignments;
    totals.supportRoleAssignments += result.spatialTelemetry.supportRoleAssignments;
    totals.safetyRoleAssignments += result.spatialTelemetry.safetyRoleAssignments;
    totals.attackingLengthTotal +=
      result.spatialTelemetry.averageAttackingLength * result.spatialTelemetry.offBallPlans;
    totals.maximumAttackingLength = Math.max(
      totals.maximumAttackingLength,
      result.spatialTelemetry.maximumAttackingLength
    );
    totals.backfieldShapeViolations += result.spatialTelemetry.backfieldShapeViolations;
    totals.defensivePlans += result.spatialTelemetry.defensivePlans;
    totals.defensiveOvercommitPlans += result.spatialTelemetry.defensiveOvercommitPlans;
    totals.defensiveWidthTotal +=
      result.spatialTelemetry.averageDefensiveWidth * result.spatialTelemetry.defensivePlans;
    totals.primaryPressAssignments += result.spatialTelemetry.primaryPressAssignments;
    totals.coverAssignments += result.spatialTelemetry.coverAssignments;
    totals.passLaneBlockAssignments += result.spatialTelemetry.passLaneBlockAssignments;
    totals.restDefenseAssignments += result.spatialTelemetry.restDefenseAssignments;
    totals.trackedThreatAssignments += result.spatialTelemetry.trackedThreatAssignments;
    totals.unguardedBackPlans += result.spatialTelemetry.unguardedBackPlans;
    totals.defensiveSpacingCorrections += result.spatialTelemetry.defensiveSpacingCorrections;

    const visualEvents = result.lines.map(line => line.visualEvent).filter(Boolean);
    const shapeEvents = visualEvents.filter(event => event.type === 'shape-update');
    const defensiveShapeEvents = visualEvents.filter(event => event.type === 'defensive-shape');
    assert(shapeEvents.length > 0, `${branch}: topsuz takım şekli olayı üretilmedi.`);
    assert(defensiveShapeEvents.length > 0, `${branch}: savunma şekli olayı üretilmedi.`);
    for (const event of shapeEvents) {
      assert.equal(
        event.assignments.length,
        branch === 'fifa' ? 9 : 4,
        `${branch}: topsuz görev sayısı kadroyla eşleşmiyor.`
      );
      assert(
        event.assignments.some(assignment => assignment.role.startsWith('width')),
        `${branch}: genişlik görevi bulunamadı.`
      );
      assert(
        event.assignments.some(assignment => assignment.role === 'runner'),
        `${branch}: derinlik koşusu görevi bulunamadı.`
      );
      assert(
        event.assignments.some(assignment => assignment.role === 'balance'),
        `${branch}: geride denge görevi bulunamadı.`
      );
      if (branch === 'futbol') {
        assert.equal(
          event.assignments.filter(assignment => assignment.role === 'support').length,
          1,
          `${branch}: yakın destek görevi tek bir oyuncuya atanmalı.`
        );
        assert.equal(
          event.assignments.filter(assignment => assignment.role === 'balance').length,
          1,
          `${branch}: geride emniyet görevi tek bir oyuncuya atanmalı.`
        );
        assert.equal(
          new Set(event.assignments.map(assignment => assignment.actor?.idName || assignment.actor?.name)).size,
          event.assignments.length,
          `${branch}: iki saha görevi aynı oyuncuya atanmış.`
        );
      }
    }
    for (const event of defensiveShapeEvents) {
      assert.equal(
        event.assignments.length,
        branch === 'fifa' ? 10 : 5,
        `${branch}: savunma görev sayısı kadroyla eşleşmiyor.`
      );
      assert.equal(
        event.assignments.filter(assignment => assignment.role === 'primary-press').length,
        1,
        `${branch}: birinci savunmacı görevi eksik veya birden fazla.`
      );
      assert.equal(
        event.assignments.filter(assignment => assignment.role === 'cover').length,
        1,
        `${branch}: ikinci savunmacı desteği eksik veya birden fazla.`
      );
      assert.equal(
        event.assignments.filter(assignment => assignment.role.startsWith('pass-lane')).length,
        branch === 'fifa' ? 2 : 1,
        `${branch}: pas yolu kapatma görevi eksik.`
      );
      assert(
        event.assignments.some(assignment => assignment.role === 'rest-defense'),
        `${branch}: geride kalan savunma hattı bulunamadı.`
      );
      const ownGoalDirection = event.teamId === 1 ? -1 : 1;
      const availableBackDepth = ownGoalDirection === 1
        ? 93 - Number(event.ballX)
        : Number(event.ballX) - 7;
      const requiredBackDepth = Math.max(
        0,
        Math.min(branch === 'fifa' ? 11 : 12, availableBackDepth) - 0.15
      );
      const protectedRestDefenders = event.assignments.filter(assignment =>
        assignment.role === 'rest-defense' &&
        ownGoalDirection * (Number(assignment.toX) - Number(event.ballX)) >= requiredBackDepth
      );
      assert(
        protectedRestDefenders.length >= (branch === 'fifa' ? 4 : 2),
        `${branch}: topun arkasındaki emniyet hattı eksik. ` +
          `Top=${event.ballX}, geride=${JSON.stringify(
            event.assignments
              .filter(assignment => assignment.role === 'rest-defense')
              .map(assignment => Number(assignment.toX))
          )}`
      );
      assert(
        protectedRestDefenders.every(assignment => assignment.markTarget),
        `${branch}: gerideki savunmacılara takip edilecek tehdit atanmadı.`
      );
    }

    for (let eventIndex = 0; eventIndex < visualEvents.length; eventIndex += 1) {
      const event = visualEvents[eventIndex];
      if (event.type === 'pass') {
        assert(
          Number.isFinite(event.expectedPassSuccess) &&
          event.expectedPassSuccess >= 0 &&
          event.expectedPassSuccess <= 1,
          `${branch}: pas olayında geçerli xPass bulunmalı.`
        );
        assert(Number.isFinite(event.actionValue), `${branch}: pas olayında aksiyon değeri bulunmalı.`);
        assert.equal(typeof event.completed, 'boolean', `${branch}: pas sonucu tamamlandı bilgisi eksik.`);
        if (event.intercepted) {
          totals.interceptedPasses++;
          assert.equal(event.completed, false, `${branch}: kesilen pas tamamlanmış işaretlenemez.`);
          assert(event.interceptor, `${branch}: kesilen pasta savunmacı kimliği eksik.`);
          assert(
            Number.isFinite(Number(event.interceptX)) && Number.isFinite(Number(event.interceptY)),
            `${branch}: kesilen pasta ortak kesme noktası eksik.`
          );
          const passLength = Math.hypot(
            Number(event.toX) - Number(event.fromX),
            Number(event.toY) - Number(event.fromY)
          );
          const remainingToTarget = Math.hypot(
            Number(event.toX) - Number(event.interceptX),
            Number(event.toY) - Number(event.interceptY)
          );
          assert(
            remainingToTarget >= passLength * 0.17,
            `${branch}: top alıcıya vardıktan sonra kesiliyor.`
          );
          const interceptionEvent = visualEvents[eventIndex + 1];
          assert.equal(interceptionEvent?.type, 'interception', `${branch}: kesilen pasın devamında pas arası olayı yok.`);
          assert.equal(interceptionEvent.fromPass, true, `${branch}: pas arası olayı pas sürekliliğini taşımıyor.`);
          assert(
            Math.abs(Number(interceptionEvent.interceptX) - Number(event.interceptX)) < 0.001 &&
            Math.abs(Number(interceptionEvent.interceptY) - Number(event.interceptY)) < 0.001,
            `${branch}: pas ile pas arası farklı saha noktalarında oynatılıyor.`
          );
        } else {
          assert.equal(event.completed, true, `${branch}: başarılı pas tamamlanmamış işaretlendi.`);
        }
      }
      if (!event.isPenalty && ['goal', 'save', 'block', 'woodwork', 'miss'].includes(event.type)) {
        assert.equal(event.shootingZone, true, `${branch}: şut bölgesi dışında şut üretildi.`);
        if (event.longRange) totals.longRangeShots++;
        const maximumDistance = event.longRange
          ? (branch === 'fifa' ? 34 : 27)
          : (branch === 'fifa' ? 29 : 22);
        const minimumProgress = event.longRange
          ? (branch === 'fifa' ? 0.67 : 0.72)
          : (branch === 'fifa' ? 0.72 : 0.76);
        assert(
          Number(event.shotDistance) < maximumDistance,
          `${branch}: gereğinden uzak şut üretildi: ${event.shotDistance}`
        );
        assert(
          Number(event.shotProgress) > minimumProgress,
          `${branch}: orta sahadan şut üretildi: ${event.shotProgress}`
        );
      }
      for (const key of ['fromX', 'fromY', 'toX', 'toY', 'shotX', 'shotY']) {
        if (event[key] === undefined || event[key] === null) continue;
        assert(
          Number.isFinite(Number(event[key])) && Number(event[key]) >= 0 && Number(event[key]) <= 100,
          `${branch}: geçersiz ${key} koordinatı ${event[key]}`
        );
      }
    }

    const finalState = [...result.lines].reverse().find(line => line.state)?.state;
    assert(finalState, `${branch}: final maç durumu eksik.`);
    for (const player of [...finalState.t1.players, ...finalState.t2.players]) {
      assert(player.passesCompleted <= player.passesAttempted, `${branch}: tamamlanan pas denemeyi aştı.`);
      assert(
        player.expectedPassesCompleted >= 0 &&
        player.expectedPassesCompleted <= player.passesAttempted + 0.001,
        `${branch}: oyuncu xPass toplamı geçersiz.`
      );
      assert(
        Math.abs(
          player.passOverExpected -
          (player.passesCompleted - player.expectedPassesCompleted)
        ) < 0.002,
        `${branch}: gerçekleşen-beklenen pas farkı tutarsız.`
      );
      assert(Number.isFinite(player.actionValue), `${branch}: oyuncu aksiyon değeri geçersiz.`);
      totals.passesAttempted += player.passesAttempted;
      totals.passesCompleted += player.passesCompleted;
      totals.expectedPassesCompleted += player.expectedPassesCompleted;
      totals.actionValue += player.actionValue;
    }
  }

  assert(totals.decisions > matchCount, `${branch}: bağımsız kararlar üretilmedi.`);
  assert.equal(
    totals.unnecessaryBackwardPasses,
    0,
    `${branch}: baskısız açık ilerleme varken geri pas üretildi.`
  );
  assert(totals.openLaneCarries > 0, `${branch}: açık koridorda top sürme hiç üretilmedi.`);
  assert(totals.forcedAdvanceCarries > 0, `${branch}: şut bölgesi öncesi açık alan taşıması üretilmedi.`);
  assert(totals.interceptedPasses > 0, `${branch}: pas arası sürekliliği hiç sınanmadı.`);
  const actualPassRate = totals.passesCompleted / Math.max(1, totals.passesAttempted);
  const expectedPassRate = totals.expectedPassesCompleted / Math.max(1, totals.passesAttempted);
  assert(
    Math.abs(actualPassRate - expectedPassRate) < 0.035,
    `${branch}: gerçekleşen pas oranı xPass beklentisinden fazla saptı.`
  );
  assert(
    actualPassRate > (branch === 'futbol' ? 0.86 : 0.82) && actualPassRate < 0.98,
    `${branch}: pas başarı oranı gerçekçilik aralığının dışında.`
  );
  const averageGoals = totals.goals / matchCount;
  assert(
    averageGoals >= (branch === 'futbol' ? 7.5 : 1.5) &&
    averageGoals <= (branch === 'futbol' ? 14 : 4.5),
    `${branch}: gol ortalaması hedef aralığının dışında.`
  );
  assert(Math.abs(totals.actionValue) > 0.1, `${branch}: aksiyon değeri üretilmedi.`);
  const averageAttackingWidth = totals.attackingWidthTotal / Math.max(1, totals.offBallPlans);
  const crowdedPlanRate = totals.crowdedPlans / Math.max(1, totals.offBallPlans);
  assert(
    averageAttackingWidth >= (branch === 'futbol' ? 38 : 52),
    `${branch}: takım hücum genişliği hedefin altında.`
  );
  assert(crowdedPlanRate < 0.05, `${branch}: dar alanda sıkışık takım planı oranı yüksek.`);
  assert(totals.wideRoleAssignments > totals.offBallPlans * 0.9, `${branch}: genişlik rolleri eksik.`);
  if (branch === 'futbol') {
    assert.equal(totals.supportRoleAssignments, totals.offBallPlans, 'futbol: her planda tek yakın destek olmalı.');
    assert.equal(totals.safetyRoleAssignments, totals.offBallPlans, 'futbol: her planda tek geride emniyet olmalı.');
    assert.equal(totals.backfieldShapeViolations, 0, 'futbol: geride emniyet alanı boş bırakıldı.');
  }
  const averageAttackingLength = totals.attackingLengthTotal / Math.max(1, totals.offBallPlans);
  const defensiveOvercommitRate =
    totals.defensiveOvercommitPlans / Math.max(1, totals.defensivePlans);
  const averageDefensiveWidth =
    totals.defensiveWidthTotal / Math.max(1, totals.defensivePlans);
  const unguardedBackRate =
    totals.unguardedBackPlans / Math.max(1, totals.defensivePlans);
  assert(totals.defensivePlans > matchCount, `${branch}: savunma planları üretilmedi.`);
  assert.equal(
    totals.primaryPressAssignments,
    totals.defensivePlans,
    `${branch}: her savunma planında tek bir birinci baskıcı bulunmalı.`
  );
  assert.equal(
    totals.coverAssignments,
    totals.defensivePlans,
    `${branch}: her savunma planında tek bir ikinci savunmacı bulunmalı.`
  );
  assert(
    totals.passLaneBlockAssignments >= totals.defensivePlans * (branch === 'fifa' ? 2 : 1),
    `${branch}: pas yolu kapatma görevleri yetersiz.`
  );
  assert(defensiveOvercommitRate < 0.05, `${branch}: savunma top çevresine fazla yığılıyor.`);
  assert.equal(unguardedBackRate, 0, `${branch}: geride emniyet bırakmayan savunma planı üretildi.`);
  assert(
    totals.trackedThreatAssignments >=
      totals.defensivePlans * (branch === 'fifa' ? 6 : 3),
    `${branch}: topsuz tehdit takibi yetersiz.`
  );
  assert(
    averageDefensiveWidth >= (branch === 'futbol' ? 32 : 48),
    `${branch}: savunma hattı gereğinden dar: ${averageDefensiveWidth.toFixed(2)}`
  );

  const classic = simulateMatch(
    testTeam('Mavi', branch),
    testTeam('Kirmizi', branch, 1),
    branch,
    false,
    false,
    { seed: `${branch}-classic-isolation` }
  );
  assert.equal(classic.spatialTelemetry, null, `${branch}: beta karar motoru klasik moda sızdı.`);

  return {
    matches: matchCount,
    averageGoals: Number(averageGoals.toFixed(2)),
    zeroGoalRate: Number((totals.zeroGoalMatches / matchCount).toFixed(3)),
    actualPassRate: Number(actualPassRate.toFixed(3)),
    expectedPassRate: Number(expectedPassRate.toFixed(3)),
    totalActionValue: Number(totals.actionValue.toFixed(2)),
    averageAttackingWidth: Number(averageAttackingWidth.toFixed(2)),
    averageAttackingLength: Number(averageAttackingLength.toFixed(2)),
    crowdedPlanRate: Number(crowdedPlanRate.toFixed(3)),
    averageDefensiveWidth: Number(averageDefensiveWidth.toFixed(2)),
    defensiveOvercommitRate: Number(defensiveOvercommitRate.toFixed(3)),
    unguardedBackRate: Number(unguardedBackRate.toFixed(3)),
    ...totals
  };
}

directDecisionScenario();
const matchCount = Number(process.env.FOOTBALL_DECISION_MATCHES) || 80;
const summary = {
  futbol: runBranch('futbol', matchCount),
  fifa: runBranch('fifa', matchCount)
};

console.log(JSON.stringify(summary, null, 2));
