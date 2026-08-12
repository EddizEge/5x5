const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const REASON_TEXT = Object.freeze({
  'execute-cover': 'takım execute için toplandı',
  'execute-window': 'giriş penceresi açıldı',
  'confirmed-contact': 'doğrulanmış rakip bilgisi alındı',
  'entry-support': 'entry oyuncusuna flash desteği hazır',
  'stack-read': 'aynı koridorda birden fazla rakip okundu',
  'confirmed-damage': 'güvenilir rakip konumu doğrulandı',
  'rush-delay': 'kalabalık hücum baskısı tespit edildi',
  'site-clear': 'bomba alanında savunmacı bilgisi alındı',
  'retake-entry': 'retake girişi takım arkadaşlarıyla eşleşti',
  'retake-cover': 'C4 çevresindeki görüş hattı kapatılacak',
  'postplant-delay': 'retake oyuncuları C4 hattına yaklaşıyor',
  'combo-smoke-flash': 'sis perdesinin arkasından zincir flash hazır',
  'friendly-flash-risk': 'yakın takım arkadaşlarını kör etme riski var',
  'utility-spacing': 'önceki takım utility etkisinin bitmesi bekleniyor',
  'no-confirmed-info': 'güvenilir rakip bilgisi henüz yok',
  'team-not-ready': 'takım giriş mesafesinde henüz toplanmadı',
  'owner-too-far': 'utility sahibi hedef bölgeye atış mesafesinde değil',
  'save-decision': 'CT takımı silah ve utility koruyor',
  'owner-unavailable': 'utility sahibi artık kullanabilir durumda değil',
  'reported-opening-lineup': 'rapordaki raunt başı utility dizilimi hazır',
  'reported-execute-lineup': 'rapordaki execute utility noktası hazır',
  'reported-postplant-lineup': 'rapordaki post-plant utility noktası hazır',
  'reported-ct-opening': 'rapordaki CT raunt başı bombası hazır',
  'reported-ct-contact': 'rapordaki CT temas bombası için bilgi alındı',
  'reported-ct-retake': 'rapordaki CT retake bombası girişle eşleşti',
  'reported-timing-window': 'rapordaki utility için doğru raund fazı bekleniyor',
  'reported-window-expired': 'rapordaki utility kullanım penceresi kapandı'
});

function decision(action, reasonCode, metrics, extra = {}) {
  return {
    action,
    reasonCode,
    reason: REASON_TEXT[reasonCode] || reasonCode,
    confidence: Number(clamp(extra.confidence ?? 0.5, 0, 1).toFixed(2)),
    retryInTicks: extra.retryInTicks || 8,
    target: extra.target || null,
    targetSource: extra.targetSource || 'plan',
    combo: extra.combo || null,
    metrics
  };
}

function evaluateUtilityDecision({
  utility,
  owner,
  tick,
  context
}) {
  const metrics = {
    phase: context.phase,
    purpose: utility.purpose,
    ownerDistance: Number(context.ownerDistance.toFixed(2)),
    alliesNearTarget: context.alliesNearTarget,
    alliesApproaching: context.alliesApproaching,
    knownEnemiesNearTarget: context.knownEnemiesNearTarget,
    visibleEnemies: context.visibleEnemies,
    soundOrCallIntel: context.soundOrCallIntel,
    fakeIntel: context.fakeIntel || 0,
    bestIntelConfidence: Number(context.bestIntelConfidence.toFixed(2)),
    friendlyFlashRisk: context.friendlyFlashRisk,
    teamUtilityRemaining: context.teamUtilityRemaining,
    postPlantDecision: context.postPlantDecision || null
  };

  if (!owner?.alive) {
    return decision('cancel', 'owner-unavailable', metrics, { confidence: 1 });
  }
  if (tick < utility.earliestTick) {
    return decision('hold', 'team-not-ready', metrics, {
      retryInTicks: Math.max(1, utility.earliestTick - tick)
    });
  }
  if (context.ownerDistance > (utility.maxOwnerDistance || 29)) {
    return decision('hold', 'owner-too-far', metrics, {
      retryInTicks: 10,
      confidence: 0.8
    });
  }
  if (
    context.lastTeamUtility
    && tick - context.lastTeamUtility.tick < 6
  ) {
    return decision('hold', 'utility-spacing', metrics, {
      retryInTicks: 6 - (tick - context.lastTeamUtility.tick),
      confidence: 0.92
    });
  }
  if (
    context.phase === 'postplant'
    && owner.teamId === context.defenderTeamId
    && context.postPlantDecision === 'save'
  ) {
    return decision('hold', 'save-decision', metrics, {
      retryInTicks: 16,
      confidence: 0.98
    });
  }

  const bestIntelTarget = context.bestIntelTarget;
  const targetExtra = bestIntelTarget
    ? {
        target: bestIntelTarget,
        targetSource: 'team-intel'
      }
    : {};
  const teamReady = context.alliesNearTarget + context.alliesApproaching >= 2;
  const confirmedIntel = context.knownEnemiesNearTarget > 0
    && context.bestIntelConfidence >= 0.55;
  const strongIntel = context.knownEnemiesNearTarget >= 2
    || context.bestIntelConfidence >= 0.78;
  const isPostPlant = context.phase === 'postplant';
  const ownerIsAttacker = owner.teamId === context.attackerTeamId;
  const reportedSetup = Boolean(utility.reportSetupId);

  if (reportedSetup && ownerIsAttacker) {
    if (utility.tacticalTiming === 'postplant' && !isPostPlant) {
      return decision('hold', 'reported-timing-window', metrics, {
        retryInTicks: 10,
        confidence: 0.96
      });
    }
    if (
      ['opening', 'execute'].includes(utility.tacticalTiming)
      && isPostPlant
    ) {
      return decision('cancel', 'reported-window-expired', metrics, {
        confidence: 1
      });
    }
    if (utility.tacticalTiming === 'opening') {
      return decision('deploy', 'reported-opening-lineup', metrics, {
        confidence: 0.96
      });
    }
    if (
      utility.tacticalTiming === 'execute'
      && (
        teamReady
        || context.alliesApproaching >= 1
        || confirmedIntel
        || tick >= utility.latestTick
      )
    ) {
      if (utility.type === 'flash' && context.friendlyFlashRisk >= 3 && !confirmedIntel) {
        return decision('hold', 'friendly-flash-risk', metrics, {
          retryInTicks: 6,
          confidence: 0.9
        });
      }
      return decision('deploy', 'reported-execute-lineup', metrics, {
        confidence: 0.9
      });
    }
    if (
      utility.tacticalTiming === 'postplant'
      && isPostPlant
      && (teamReady || confirmedIntel || tick >= utility.latestTick)
    ) {
      return decision('deploy', 'reported-postplant-lineup', metrics, {
        confidence: 0.92
      });
    }
  }

  if (reportedSetup && !ownerIsAttacker) {
    if (utility.tacticalTiming === 'opening') {
      if (isPostPlant) {
        return decision('cancel', 'reported-window-expired', metrics, { confidence: 1 });
      }
      return decision('deploy', 'reported-ct-opening', metrics, { confidence: 0.96 });
    }
    if (utility.tacticalTiming === 'retake') {
      if (!isPostPlant) {
        return decision('hold', 'reported-timing-window', metrics, {
          retryInTicks: 10,
          confidence: 0.96
        });
      }
      if (
        context.postPlantDecision === 'retake'
        && (teamReady || confirmedIntel || tick >= utility.latestTick)
      ) {
        return decision('deploy', 'reported-ct-retake', metrics, {
          confidence: 0.94,
          target: { x: utility.x, y: utility.y, z: utility.z },
          targetSource: 'report'
        });
      }
      return decision('hold', 'team-not-ready', metrics, {
        retryInTicks: 7,
        confidence: 0.86
      });
    }
    // "contact" zamanlaması aşağıdaki tür bazlı güvenilir ses/görüş
    // kontrollerinden geçer; böylece B geciktirme bombası ezbere atılmaz.
  }

  if (utility.type === 'smoke') {
    if (isPostPlant && !ownerIsAttacker && context.postPlantDecision === 'retake' && teamReady) {
      return decision('deploy', 'retake-cover', metrics, {
        confidence: 0.9,
        target: context.plantPosition,
        targetSource: 'objective'
      });
    }
    if (!ownerIsAttacker && confirmedIntel) {
      return decision('deploy', 'rush-delay', metrics, {
        confidence: 0.82,
        ...targetExtra
      });
    }
    if (ownerIsAttacker && teamReady) {
      return decision('deploy', tick >= utility.latestTick ? 'execute-window' : 'execute-cover', metrics, {
        confidence: 0.76 + Math.min(0.18, context.alliesApproaching * 0.04)
      });
    }
    return decision('hold', 'team-not-ready', metrics, { retryInTicks: 8 });
  }

  if (utility.type === 'flash') {
    const smokeCombo = context.lastTeamUtility?.type === 'smoke'
      && tick - context.lastTeamUtility.tick <= 28;
    if (context.friendlyFlashRisk >= 3 && !confirmedIntel) {
      return decision('hold', 'friendly-flash-risk', metrics, {
        retryInTicks: 7,
        confidence: 0.88
      });
    }
    if (
      isPostPlant
      && !ownerIsAttacker
      && context.postPlantDecision === 'retake'
      && teamReady
    ) {
      return decision('deploy', 'retake-entry', metrics, {
        confidence: 0.92,
        target: context.plantPosition,
        targetSource: 'objective'
      });
    }
    if (confirmedIntel) {
      return decision('deploy', smokeCombo ? 'combo-smoke-flash' : 'confirmed-contact', metrics, {
        confidence: 0.78 + context.bestIntelConfidence * 0.18,
        combo: smokeCombo ? 'smoke-flash' : null,
        ...targetExtra
      });
    }
    if (ownerIsAttacker && teamReady && context.alliesApproaching >= 2) {
      return decision('deploy', smokeCombo ? 'combo-smoke-flash' : 'entry-support', metrics, {
        confidence: 0.72,
        combo: smokeCombo ? 'smoke-flash' : null
      });
    }
    return decision('hold', 'no-confirmed-info', metrics, { retryInTicks: 7 });
  }

  if (utility.type === 'he') {
    if (context.knownEnemiesNearTarget >= 2) {
      return decision('deploy', 'stack-read', metrics, {
        confidence: 0.9,
        ...targetExtra
      });
    }
    if (confirmedIntel && strongIntel) {
      return decision('deploy', 'confirmed-damage', metrics, {
        confidence: 0.82,
        ...targetExtra
      });
    }
    return decision('hold', 'no-confirmed-info', metrics, { retryInTicks: 9 });
  }

  if (['molotov', 'incendiary'].includes(utility.type)) {
    if (
      isPostPlant
      && ownerIsAttacker
      && confirmedIntel
    ) {
      return decision('deploy', 'postplant-delay', metrics, {
        confidence: 0.9,
        target: context.plantPosition || bestIntelTarget,
        targetSource: context.plantPosition ? 'objective' : 'team-intel'
      });
    }
    if (
      isPostPlant
      && !ownerIsAttacker
      && context.postPlantDecision === 'retake'
      && confirmedIntel
    ) {
      return decision('deploy', 'site-clear', metrics, {
        confidence: 0.86,
        ...targetExtra
      });
    }
    if (context.knownEnemiesNearTarget >= 2 || (confirmedIntel && context.soundOrCallIntel > 0)) {
      return decision('deploy', ownerIsAttacker ? 'site-clear' : 'rush-delay', metrics, {
        confidence: 0.84,
        ...targetExtra
      });
    }
    return decision('hold', 'no-confirmed-info', metrics, { retryInTicks: 10 });
  }

  return decision('hold', 'no-confirmed-info', metrics, { retryInTicks: 12 });
}

module.exports = {
  REASON_TEXT,
  evaluateUtilityDecision
};
