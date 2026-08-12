// ═══════════════════════════════════════════════════════
// ⚽🏟️ HALI SAHA 5v5 SİMÜLATÖRÜ
// ═══════════════════════════════════════════════════════

const POZİSYONLAR = ['Kaleci', 'Defans', 'Orta Saha', 'Orta Saha', 'Forvet'];

const GOL_OLAYLARI = [
  (p, pos) => `⚽ GOOOOL! ${p} (${pos}) müthiş bir şutla ağları sarstı!`,
  (p, pos) => `⚽ GOOOOL! ${p} (${pos}) plase bir vuruşla skoru değiştirdi!`,
  (p, pos) => `⚽ GOOOOL! ${p} (${pos}) kafa vuruşuyla gol attı!`,
  (p, pos) => `⚽ GOOOOL! ${p} (${pos}) röveşata çekti! EFSANE GOL!`,
  (p, pos) => `⚽ GOOOOL! ${p} (${pos}) frikik golü! DUVAR AŞTI!`,
  (p, pos) => `⚽ GOOOOL! ${p} (${pos}) solo çalım atarak gol attı!`,
  (p, pos) => `⚽ GOOOOL! ${p} (${pos}) kontra atakta bitirdi!`,
  (p, pos) => `⚽ GOOOOL! ${p} (${pos}) uzaktan vurdu! FÜZE GİBİ!`,
];

const KURTARIS_OLAYLARI = [
  (p) => `🧤 MUHTEŞEM KURTARIŞ! ${p} uzanarak topu çıkardı!`,
  (p) => `🧤 ${p} refleks kurtarış yaptı! İNANILMAZ!`,
  (p) => `🧤 ${p} çift kurtarış yaptı! DUVAR GİBİ!`,
  (p) => `🧤 ${p} penaltı kurtardı! KAHRAMAN!`,
];

const GENEL_OLAYLAR = [
  (p, pos) => `🏃 ${p} (${pos}) kontra atak başlattı!`,
  (p, pos) => `🦶 ${p} (${pos}) mükemmel bir çalım attı!`,
  (p, pos) => `💪 ${p} (${pos}) sert bir top kapma yaptı!`,
  (p, pos) => `🎯 ${p} (${pos}) harika bir pas verdi!`,
  (p, pos) => `🔥 ${p} (${pos}) direğe nişan aldı! AZ KALDI!`,
  (p, pos) => `⚡ ${p} (${pos}) hızlı dribling ile savunmayı geçti!`,
  (p, pos) => `🛡️ ${p} (${pos}) kritik bir müdahale yaptı!`,
  (p, pos) => `💨 ${p} (${pos}) sprint atarak topu kaptı!`,
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
 * Halı Saha 5v5 Simülasyonu
 */
function simulateFutbol(team1, team2) {
  const lines = [];
  const stats = {};

  const power1 = team1.power || 50;
  const power2 = team2.power || 50;
  const totalPower = power1 + power2;

  // ── Saha seçimi ──
  const sahalar = ['Yıldız Halı Saha', 'Gol Halı Saha', 'Şampiyon Arena', 'Dostluk Sahası', 'Maradona Arena'];
  const saha = rastgele(sahalar);

  // ── Başlık ──
  lines.push('═══════════════════════════════════════════════');
  lines.push('⚽🏟️ HALI SAHA 5v5');
  lines.push(`📍 Saha: ${saha}`);
  lines.push(`🔴 ${team1.displayName} vs 🔵 ${team2.displayName}`);
  lines.push('═══════════════════════════════════════════════');

  // ── Oyuncu atamaları ──
  const oyuncular1 = team1.characters.map((c, i) => ({
    ...c,
    formatted: formatAd(c),
    key: statKey(c),
    pozisyon: POZİSYONLAR[i],
    team: 1,
  }));

  const oyuncular2 = team2.characters.map((c, i) => ({
    ...c,
    formatted: formatAd(c),
    key: statKey(c),
    pozisyon: POZİSYONLAR[i],
    team: 2,
  }));

  const tumOyuncular = [...oyuncular1, ...oyuncular2];

  // ── Stat başlangıçları ──
  tumOyuncular.forEach(p => {
    stats[p.key] = { Gol: 0, Asist: 0, Kurtarış: 0, 'Top Kapma': 0, Pozisyon: p.pozisyon };
  });

  // ── Kadro gösterimi ──
  lines.push('');
  lines.push('👥 ═══ KADROLAR ═══');
  lines.push(`🔴 ${oyuncular1.map(p => `${p.formatted}(${p.pozisyon})`).join(' | ')}`);
  lines.push(`🔵 ${oyuncular2.map(p => `${p.formatted}(${p.pozisyon})`).join(' | ')}`);

  // ── Yardımcı fonksiyonlar ──
  function golcuSec(takim) {
    const oyuncular = takim === 1 ? oyuncular1 : oyuncular2;
    // Forvet ve Orta Saha daha çok gol atar
    const weights = oyuncular.map(p => {
      let base = p.rating + rastgeleSayi(-10, 10);
      if (p.pozisyon === 'Forvet') base *= 2.5;
      if (p.pozisyon === 'Orta Saha') base *= 1.5;
      if (p.pozisyon === 'Defans') base *= 0.5;
      if (p.pozisyon === 'Kaleci') base *= 0.1;
      return Math.max(1, base);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < oyuncular.length; i++) {
      rand -= weights[i];
      if (rand <= 0) return oyuncular[i];
    }
    return oyuncular[oyuncular.length - 1];
  }

  function kaleciBul(takim) {
    const oyuncular = takim === 1 ? oyuncular1 : oyuncular2;
    return oyuncular.find(p => p.pozisyon === 'Kaleci') || oyuncular[0];
  }

  function oyuncuSec(takim) {
    const oyuncular = takim === 1 ? oyuncular1 : oyuncular2;
    return oyuncular[rastgeleSayi(0, oyuncular.length - 1)];
  }

  // ── Skor ──
  let skor1 = 0;
  let skor2 = 0;

  function yariSimule(yariNo) {
    const golSayisi = rastgeleSayi(1, 4); // Her yarı 1-4 gol arasında toplam
    const olaylar = [];

    // Gol olayları
    for (let i = 0; i < golSayisi; i++) {
      const atakTakim = Math.random() < (power1 / totalPower) ? 1 : 2;
      const savunmaTakim = atakTakim === 1 ? 2 : 1;
      const kaleci = kaleciBul(savunmaTakim);

      // Kaleci kurtarış şansı (rating bazlı)
      const kurtarisSansi = 0.2 + (kaleci.rating / 200);

      if (Math.random() < kurtarisSansi) {
        // Kurtarış
        stats[kaleci.key].Kurtarış++;
        olaylar.push({ tip: 'kurtaris', kaleci, dakika: rastgeleSayi(yariNo === 1 ? 1 : 26, yariNo === 1 ? 25 : 50) });
      } else {
        // GOL!
        const golcu = golcuSec(atakTakim);
        stats[golcu.key].Gol++;
        if (atakTakim === 1) skor1++; else skor2++;

        // Asist
        const takimOyunculari = (atakTakim === 1 ? oyuncular1 : oyuncular2).filter(p => p.key !== golcu.key);
        if (takimOyunculari.length > 0 && Math.random() < 0.7) {
          const asistci = takimOyunculari[rastgeleSayi(0, takimOyunculari.length - 1)];
          stats[asistci.key].Asist++;
          olaylar.push({ tip: 'gol', golcu, asistci, dakika: rastgeleSayi(yariNo === 1 ? 1 : 26, yariNo === 1 ? 25 : 50) });
        } else {
          olaylar.push({ tip: 'gol', golcu, asistci: null, dakika: rastgeleSayi(yariNo === 1 ? 1 : 26, yariNo === 1 ? 25 : 50) });
        }
      }
    }

    // Genel olaylar (top kapma vb.)
    const genelOlaySayisi = rastgeleSayi(1, 3);
    for (let i = 0; i < genelOlaySayisi; i++) {
      const takim = Math.random() < 0.5 ? 1 : 2;
      const oyuncu = oyuncuSec(takim);
      if (oyuncu.pozisyon === 'Defans' || oyuncu.pozisyon === 'Orta Saha') {
        stats[oyuncu.key]['Top Kapma']++;
      }
      olaylar.push({ tip: 'genel', oyuncu, dakika: rastgeleSayi(yariNo === 1 ? 1 : 26, yariNo === 1 ? 25 : 50) });
    }

    // Dakikaya göre sırala
    olaylar.sort((a, b) => a.dakika - b.dakika);

    // Olayları satırlara dönüştür
    olaylar.forEach(olay => {
      if (olay.tip === 'gol') {
        const golSatiri = rastgele(GOL_OLAYLARI)(olay.golcu.formatted, olay.golcu.pozisyon);
        if (olay.asistci) {
          lines.push(`${olay.dakika}' ${golSatiri} (Asist: ${olay.asistci.formatted}) [${skor1}-${skor2}]`);
        } else {
          lines.push(`${olay.dakika}' ${golSatiri} [${skor1}-${skor2}]`);
        }
      } else if (olay.tip === 'kurtaris') {
        lines.push(`${olay.dakika}' ${rastgele(KURTARIS_OLAYLARI)(olay.kaleci.formatted)}`);
      } else {
        lines.push(`${olay.dakika}' ${rastgele(GENEL_OLAYLAR)(olay.oyuncu.formatted, olay.oyuncu.pozisyon)}`);
      }
    });
  }

  // ══ 1. YARI ══
  lines.push('');
  lines.push('🏃 ═══ 1. YARI ═══');
  yariSimule(1);
  lines.push(`📊 Devre: 🔴 ${skor1} - ${skor2} 🔵`);

  // ══ 2. YARI ══
  lines.push('');
  lines.push('🔥 ═══ 2. YARI ═══');
  yariSimule(2);
  lines.push(`📊 Normal Süre: 🔴 ${skor1} - ${skor2} 🔵`);

  // ── Top kapma ekle ──
  tumOyuncular.forEach(p => {
    if (p.pozisyon === 'Defans' || p.pozisyon === 'Orta Saha') {
      stats[p.key]['Top Kapma'] += rastgeleSayi(2, 6);
    } else if (p.pozisyon === 'Forvet') {
      stats[p.key]['Top Kapma'] += rastgeleSayi(0, 3);
    } else if (p.pozisyon === 'Kaleci') {
      stats[p.key]['Top Kapma'] += rastgeleSayi(0, 1);
    }
  });

  // ══ PENALTI ATIŞLARI (Berabere ise) ══
  let winnerId;
  if (skor1 === skor2) {
    lines.push('');
    lines.push('🎯🎯🎯 ═══ PENALTI ATIŞLARI! ═══');
    lines.push('😱 Berabere bitti! Penaltılara gidiyoruz!');

    let pen1 = 0;
    let pen2 = 0;
    const kaleci1 = kaleciBul(1);
    const kaleci2 = kaleciBul(2);

    // 5 penaltı
    for (let i = 0; i < 5; i++) {
      // Takım 1 atar
      const atici1 = oyuncular1[i];
      const atmaOlasiligi1 = 0.6 + (atici1.rating / 300);
      if (Math.random() < atmaOlasiligi1) {
        pen1++;
        lines.push(`🔴 ${atici1.formatted} → ⚽ GOL! (${pen1}-${pen2})`);
      } else {
        stats[kaleci2.key].Kurtarış++;
        lines.push(`🔴 ${atici1.formatted} → ❌ KAÇIRDI! ${kaleci2.formatted} kurtardı! (${pen1}-${pen2})`);
      }

      // Takım 2 atar
      const atici2 = oyuncular2[i];
      const atmaOlasiligi2 = 0.6 + (atici2.rating / 300);
      if (Math.random() < atmaOlasiligi2) {
        pen2++;
        lines.push(`🔵 ${atici2.formatted} → ⚽ GOL! (${pen1}-${pen2})`);
      } else {
        stats[kaleci1.key].Kurtarış++;
        lines.push(`🔵 ${atici2.formatted} → ❌ KAÇIRDI! ${kaleci1.formatted} kurtardı! (${pen1}-${pen2})`);
      }

      // Erken bitiş: matematiksel imkansızlık
      const kalanAtis = 4 - i;
      if (pen1 - pen2 > kalanAtis || pen2 - pen1 > kalanAtis) break;
    }

    // Hâlâ berabere ise: ani ölüm
    let suddenDeathRound = 0;
    while (pen1 === pen2 && suddenDeathRound < 50) {
      suddenDeathRound++;
      lines.push(`⚡ ANİ ÖLÜM ${suddenDeathRound}. TUR!`);

      const sd1 = oyuncular1[suddenDeathRound % 5];
      if (Math.random() < 0.65) {
        pen1++;
        lines.push(`🔴 ${sd1.formatted} → ⚽ GOL! (${pen1}-${pen2})`);
      } else {
        lines.push(`🔴 ${sd1.formatted} → ❌ KAÇIRDI! (${pen1}-${pen2})`);
      }

      const sd2 = oyuncular2[suddenDeathRound % 5];
      if (Math.random() < 0.65) {
        pen2++;
        lines.push(`🔵 ${sd2.formatted} → ⚽ GOL! (${pen1}-${pen2})`);
      } else {
        lines.push(`🔵 ${sd2.formatted} → ❌ KAÇIRDI! (${pen1}-${pen2})`);
      }
    }

    // Hâlâ berabere ise zorla bitir
    if (pen1 === pen2) pen1++; // Sadece sonsuz döngü koruması

    lines.push(`📊 Penaltı Sonucu: 🔴 ${pen1} - ${pen2} 🔵`);
    winnerId = pen1 > pen2 ? team1.userId : team2.userId;
  } else {
    winnerId = skor1 > skor2 ? team1.userId : team2.userId;
  }

  // ══ SONUÇ ══
  const kazananIsim = winnerId === team1.userId ? team1.displayName : team2.displayName;

  lines.push('');
  lines.push('🏆 ═══ SONUÇ ═══');
  lines.push(`📊 Final Skor: 🔴 ${skor1} - ${skor2} 🔵`);
  lines.push(`🎉 ${kazananIsim} KAZANDI! 🏆`);

  if (skor1 + skor2 >= 8) {
    lines.push('⚽🔥 GOL ŞÖLENI! Efsane maç!');
  } else if (skor1 + skor2 <= 1) {
    lines.push('🛡️ Defansif oyun! Sıkı maç!');
  }

  // ── Gol Kralı ──
  let golKrali = null;
  let maxGol = 0;
  tumOyuncular.forEach(p => {
    if (stats[p.key].Gol > maxGol) {
      maxGol = stats[p.key].Gol;
      golKrali = p;
    }
  });
  if (golKrali && maxGol > 0) {
    lines.push(`👑 Gol Kralı: ${golKrali.formatted} - ${maxGol} gol!`);
  }

  // ── Skor Tablosu ──
  lines.push('');
  lines.push('📋 ═══ SKOR TABLOSU ═══');
  lines.push(`🔴 ${team1.displayName}:`);
  oyuncular1.forEach(p => {
    const s = stats[p.key];
    lines.push(`  ${p.formatted} (${p.pozisyon}): Gol: ${s.Gol} | Asist: ${s.Asist} | Kurtarış: ${s.Kurtarış} | Top Kapma: ${s['Top Kapma']}`);
  });
  lines.push(`🔵 ${team2.displayName}:`);
  oyuncular2.forEach(p => {
    const s = stats[p.key];
    lines.push(`  ${p.formatted} (${p.pozisyon}): Gol: ${s.Gol} | Asist: ${s.Asist} | Kurtarış: ${s.Kurtarış} | Top Kapma: ${s['Top Kapma']}`);
  });
  lines.push('═══════════════════════════════════════════════');

  return { lines, winnerId, stats };
}

module.exports = { simulateFutbol };
