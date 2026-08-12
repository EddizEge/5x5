// ═══════════════════════════════════════════════════════
// 🔫💣 COUNTER-STRIKE 5v5 SİMÜLATÖRÜ
// ═══════════════════════════════════════════════════════

const HARITALAR = ['Dust2', 'Mirage', 'Inferno', 'Nuke', 'Overpass'];

const HEYECANLI_OLAYLAR = [
  (p) => `🔫 ${p} AWP ile ONE TAP! EFSANE!`,
  (p) => `💣 ${p} bomba bölgesini tek başına aldı! CLUTCH!`,
  (p) => `🎯 ${p} ACE yaptı! 5 KILL! ÇILDIRIYORUZ!`,
  (p) => `💀 ${p} WALLBANG ile kill aldı! DUVAR ARKASINI GÖRDÜ!`,
  (p) => `⚡ ${p} Deagle ile 3K! ECO ROUND HERO!`,
  (p) => `🔥 ${p} spray transfer ile DOUBLE KILL!`,
  (p) => `🏆 ${p} 1v2 CLUTCH kazandı! BUZ GİBİ!`,
  (p) => `💥 ${p} flash + peek ile 3 kişiyi biçti!`,
  (p) => `🎯 ${p} AWP ile flying scout attı! HAVADA VURDU!`,
  (p) => `⚔️ ${p} knife round'u kazandı! ŞEREF MESELESİ!`,
];

const NORMAL_OLAYLAR = [
  (p, t) => `🔫 ${t} round'u aldı, ${p} kilit rol oynadı`,
  (p, t) => `💥 ${p} opening frag aldı, ${t} round'u kazandı`,
  (p, t) => `🛡️ ${t} retake başarılı, ${p} son kill'i aldı`,
  (p, t) => `💣 Bomba patladı! ${t} round'u kazandı`,
  (p, t) => `⏱️ Zaman doldu, ${t} defuse edemedi`,
];

const EKONOMI_OLAYLARI = [
  (t) => `💰 ${t} ECO round! Glock/USP-S ile savaş!`,
  (t) => `🔫 ${t} FORCE BUY! Famas/Galil dönemi!`,
  (t) => `💸 ${t} FULL BUY! AK-47/M4A4 + Kevlar!`,
  (t) => `💵 ${t} yarı alım yaptı! SMG'ler ile!`,
];

function rastgele(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rastgeleSayi(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatAd(char) {
  return `${char.age} yaş ${char.name}`;
}

function statKey(char) {
  return `${char.name}_${char.age}`;
}

/**
 * Counter-Strike 5v5 Simülasyonu
 */
function simulateCs(team1, team2) {
  const lines = [];
  const stats = {};

  const power1 = team1.power || 50;
  const power2 = team2.power || 50;
  const totalPower = power1 + power2;

  // ── Harita seçimi ──
  const harita = rastgele(HARITALAR);

  // ── Başlık ──
  lines.push('═══════════════════════════════════════════════');
  lines.push('🔫💣 COUNTER-STRIKE 5v5');
  lines.push(`📍 Harita: ${harita}`);
  lines.push(`🔴 ${team1.displayName} vs 🔵 ${team2.displayName}`);
  lines.push('═══════════════════════════════════════════════');

  // ── Oyuncu atamaları ──
  const silahlar = ['AK-47', 'M4A4', 'AWP', 'Deagle', 'AK-47'];

  const oyuncular1 = team1.characters.map((c, i) => ({
    ...c,
    formatted: formatAd(c),
    key: statKey(c),
    favSilah: silahlar[i],
    team: 1,
  }));

  const oyuncular2 = team2.characters.map((c, i) => ({
    ...c,
    formatted: formatAd(c),
    key: statKey(c),
    favSilah: silahlar[i],
    team: 2,
  }));

  const tumOyuncular = [...oyuncular1, ...oyuncular2];

  // ── Stat başlangıçları ──
  tumOyuncular.forEach(p => {
    stats[p.key] = { Kill: 0, Death: 0, Assist: 0, ADR: 0, Clutch: 0, _totalDamage: 0 };
  });

  // ── Yardımcı fonksiyonlar ──
  function oyuncuSec(takim) {
    const oyuncular = takim === 1 ? oyuncular1 : oyuncular2;
    const weights = oyuncular.map(p => p.rating + rastgeleSayi(-10, 10));
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < oyuncular.length; i++) {
      rand -= weights[i];
      if (rand <= 0) return oyuncular[i];
    }
    return oyuncular[oyuncular.length - 1];
  }

  function roundKillEkle(killer, killSayisi) {
    stats[killer.key].Kill += killSayisi;
    const karsitOyuncular = killer.team === 1 ? oyuncular2 : oyuncular1;
    for (let i = 0; i < killSayisi && i < karsitOyuncular.length; i++) {
      const kurban = karsitOyuncular[rastgeleSayi(0, karsitOyuncular.length - 1)];
      stats[kurban.key].Death++;
    }
    // Hasar ekle
    stats[killer.key]._totalDamage += killSayisi * rastgeleSayi(80, 110);
    // Asist
    const takim = killer.team === 1 ? oyuncular1 : oyuncular2;
    const yardimcilar = takim.filter(p => p.key !== killer.key);
    const asistSayisi = rastgeleSayi(0, Math.min(2, killSayisi));
    for (let i = 0; i < asistSayisi; i++) {
      stats[yardimcilar[rastgeleSayi(0, yardimcilar.length - 1)].key].Assist++;
    }
  }

  // ── Round simülasyonu ──
  let skor1 = 0;
  let skor2 = 0;
  let toplamRound = 0;
  let normalRoundBirikimi = [];

  function birikenYaz() {
    if (normalRoundBirikimi.length > 0) {
      if (normalRoundBirikimi.length <= 2) {
        normalRoundBirikimi.forEach(l => lines.push(l));
      } else {
        lines.push(`📊 ${normalRoundBirikimi.length} round oynandı... (${skor1}-${skor2})`);
      }
      normalRoundBirikimi = [];
    }
  }

  // ══ İLK YARI (Takım1 = T, Takım2 = CT) ══
  lines.push('');
  lines.push('💥 ═══ İLK YARI ═══');
  lines.push(`🔴 ${team1.displayName} → TERÖRİST (T) | 🔵 ${team2.displayName} → ANTI-TERÖRİST (CT)`);

  // Eco bilgisi
  lines.push(rastgele(EKONOMI_OLAYLARI)(team1.displayName));

  for (let round = 1; round <= 12; round++) {
    toplamRound++;
    // CT avantajı
    const ctBonus = 2;
    const kazanmaOlasılığı = power1 / (totalPower + ctBonus);
    const kazanan = Math.random() < kazanmaOlasılığı ? 1 : 2;

    if (kazanan === 1) skor1++; else skor2++;

    const kilit = oyuncuSec(kazanan);
    const heyecanli = Math.random() < 0.2;

    if (heyecanli) {
      birikenYaz();
      const killSayisi = rastgeleSayi(2, 5);
      roundKillEkle(kilit, killSayisi);

      if (killSayisi >= 5) {
        lines.push(`🎯 R${round}: ${kilit.formatted} ACE! 5 KILL! [${skor1}-${skor2}]`);
        stats[kilit.key].Clutch++;
      } else if (killSayisi >= 3) {
        lines.push(`🔥 R${round}: ${rastgele(HEYECANLI_OLAYLAR)(kilit.formatted)} [${skor1}-${skor2}]`);
        if (Math.random() < 0.5) stats[kilit.key].Clutch++;
      } else {
        lines.push(`⚡ R${round}: ${rastgele(HEYECANLI_OLAYLAR)(kilit.formatted)} [${skor1}-${skor2}]`);
      }

      // Ara sıra eco bilgisi
      if (round % 4 === 0) {
        const ecoTakim = kazanan === 1 ? team2.displayName : team1.displayName;
        lines.push(rastgele(EKONOMI_OLAYLARI)(ecoTakim));
      }
    } else {
      roundKillEkle(kilit, rastgeleSayi(1, 2));
      const takimIsmi = kazanan === 1 ? team1.displayName : team2.displayName;
      normalRoundBirikimi.push(`🔫 R${round}: ${rastgele(NORMAL_OLAYLAR)(kilit.formatted, takimIsmi)} [${skor1}-${skor2}]`);
    }

    if (skor1 >= 13 || skor2 >= 13) break;
  }

  birikenYaz();

  // ══ DEVİR ══
  if (skor1 < 13 && skor2 < 13) {
    lines.push('');
    lines.push(`🔄 ═══ DEVİR! Skor: ${skor1}-${skor2} ═══`);
    lines.push(`🔵 ${team2.displayName} → TERÖRİST (T) | 🔴 ${team1.displayName} → ANTI-TERÖRİST (CT)`);

    for (let round = 13; round <= 24; round++) {
      toplamRound++;
      // Şimdi team1 CT
      const ctBonus = 2;
      const kazanmaOlasılığı = (power1 + ctBonus) / (totalPower + ctBonus);
      const kazanan = Math.random() < kazanmaOlasılığı ? 1 : 2;

      if (kazanan === 1) skor1++; else skor2++;

      const kilit = oyuncuSec(kazanan);
      const heyecanli = Math.random() < 0.25 || (skor1 === 12 && skor2 === 12);

      if (heyecanli) {
        birikenYaz();
        const killSayisi = rastgeleSayi(2, 5);
        roundKillEkle(kilit, killSayisi);

        if (killSayisi >= 4) {
          lines.push(`🎯 R${round}: ${rastgele(HEYECANLI_OLAYLAR)(kilit.formatted)} [${skor1}-${skor2}]`);
          stats[kilit.key].Clutch++;
        } else {
          lines.push(`🔥 R${round}: ${kilit.formatted} ${killSayisi}K! [${skor1}-${skor2}]`);
        }
      } else {
        roundKillEkle(kilit, rastgeleSayi(1, 2));
        const takimIsmi = kazanan === 1 ? team1.displayName : team2.displayName;
        normalRoundBirikimi.push(`🔫 R${round}: ${rastgele(NORMAL_OLAYLAR)(kilit.formatted, takimIsmi)} [${skor1}-${skor2}]`);
      }

      if (skor1 >= 13 || skor2 >= 13) break;
    }

    birikenYaz();
  }

  // ══ OVERTIME (12-12 ise) ══
  if (skor1 === 12 && skor2 === 12) {
    lines.push('');
    lines.push('🔥🔥🔥 ═══ UZATMA! 12-12! MR3! ═══');

    let otSayi = 1;
    while (skor1 === skor2) {
      lines.push(`⚡ UZATMA ${otSayi}. SET (MR3):`);

      // Her set 6 round (3+3), ilk kazanan avantaj
      let setSkor1 = 0;
      let setSkor2 = 0;

      for (let r = 0; r < 6; r++) {
        toplamRound++;
        const kazanan = Math.random() < (power1 / totalPower) ? 1 : 2;
        if (kazanan === 1) { skor1++; setSkor1++; } else { skor2++; setSkor2++; }

        const kilit = oyuncuSec(kazanan);
        roundKillEkle(kilit, rastgeleSayi(1, 3));

        if (r === 0 || r === 3 || r === 5) {
          lines.push(`  ⚔️ OT R${r + 1}: ${kilit.formatted} CLUTCH! [${skor1}-${skor2}]`);
          stats[kilit.key].Clutch++;
        }

        // 4 round fark = set biter
        if (Math.abs(setSkor1 - setSkor2) >= 4) break;
      }

      otSayi++;
      if (otSayi > 3) {
        // Max 3 OT, zorla bitir
        if (skor1 === skor2) skor1++;
        break;
      }
    }
  }

  // ── ADR hesaplama ──
  tumOyuncular.forEach(p => {
    if (toplamRound > 0) {
      stats[p.key].ADR = Math.round(stats[p.key]._totalDamage / toplamRound);
    } else {
      stats[p.key].ADR = 0;
    }
    // Base ADR ekleme (rating bazlı)
    const baseADR = 40 + (p.rating / 100) * 50;
    stats[p.key].ADR = Math.round(stats[p.key].ADR + baseADR + rastgeleSayi(-10, 10));
    delete stats[p.key]._totalDamage;
  });

  // ══ SONUÇ ══
  const winnerId = skor1 > skor2 ? team1.userId : team2.userId;
  const kazananIsim = winnerId === team1.userId ? team1.displayName : team2.displayName;

  lines.push('');
  lines.push('🏆 ═══ SONUÇ ═══');
  lines.push(`📊 Skor: 🔴 ${skor1} - ${skor2} 🔵`);

  if (Math.abs(skor1 - skor2) <= 2) {
    lines.push(`😱 NEFES KESEN MAÇ! ${kazananIsim} son ana kadar savaştı! 🏆`);
  } else if (Math.abs(skor1 - skor2) >= 8) {
    lines.push(`💀 ${kazananIsim} DOMINANT oynadı! EZİCİ GALİBİYET! 🏆`);
  } else {
    lines.push(`🎉 ${kazananIsim} galibiyeti kazandı! GG WP! 🏆`);
  }

  // ── MVP ──
  let mvpKey = null;
  let mvpScore = -1;
  tumOyuncular.forEach(p => {
    const score = stats[p.key].Kill * 3 + stats[p.key].Assist * 1.5 - stats[p.key].Death * 2 + stats[p.key].Clutch * 5 + stats[p.key].ADR * 0.05;
    if (score > mvpScore) {
      mvpScore = score;
      mvpKey = p;
    }
  });
  if (mvpKey) {
    lines.push(`⭐ MVP: ${mvpKey.formatted} - ${stats[mvpKey.key].Kill}/${stats[mvpKey.key].Death}/${stats[mvpKey.key].Assist} | ADR: ${stats[mvpKey.key].ADR} | Clutch: ${stats[mvpKey.key].Clutch}`);
  }

  // ── Skor Tablosu ──
  lines.push('');
  lines.push('📋 ═══ SKOR TABLOSU ═══');
  lines.push(`🔴 ${team1.displayName}:`);
  oyuncular1.forEach(p => {
    const s = stats[p.key];
    lines.push(`  ${p.formatted}: ${s.Kill}/${s.Death}/${s.Assist} | ADR: ${s.ADR} | Clutch: ${s.Clutch}`);
  });
  lines.push(`🔵 ${team2.displayName}:`);
  oyuncular2.forEach(p => {
    const s = stats[p.key];
    lines.push(`  ${p.formatted}: ${s.Kill}/${s.Death}/${s.Assist} | ADR: ${s.ADR} | Clutch: ${s.Clutch}`);
  });
  lines.push('═══════════════════════════════════════════════');

  return { lines, winnerId, stats };
}

module.exports = { simulateCs };
