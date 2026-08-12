// ═══════════════════════════════════════════════════════
// 🎮⚽ FIFA OYUN SİMÜLATÖRÜ
// ═══════════════════════════════════════════════════════

const POZİSYONLAR = ['Kaleci', 'Defans', 'Orta Saha', 'Orta Saha', 'Forvet'];

const GOL_OLAYLARI = [
  (p, pos) => `⚽🎮 GOOOOL! ${p} (${pos}) FİNESSE SHOT ile köşeye yerleştirdi!`,
  (p, pos) => `⚽💫 GOOOOL! ${p} (${pos}) SKILL MOVES ile kalecinin aklını aldı!`,
  (p, pos) => `⚽⚡ GOOOOL! ${p} (${pos}) TİKİ-TAKA paslaşmasının ardından bitirdi!`,
  (p, pos) => `⚽🎯 GOOOOL! ${p} (${pos}) THROUGH BALL ile tek başına kaldı!`,
  (p, pos) => `⚽💥 GOOOOL! ${p} (${pos}) LONG SHOT patlattı! FÜZE!`,
  (p, pos) => `⚽🕹️ GOOOOL! ${p} (${pos}) GREEN TIMED FINISH! KUSURSUZ!`,
  (p, pos) => `⚽💨 GOOOOL! ${p} (${pos}) PACE ABUSE ile savunmayı geçti!`,
  (p, pos) => `⚽🏃 GOOOOL! ${p} (${pos}) SWEATY GOAL attı! Çaprazdan!`,
  (p, pos) => `⚽✨ GOOOOL! ${p} (${pos}) CHİP SHOT ile kalecinin üstünden attı!`,
  (p, pos) => `⚽🔥 GOOOOL! ${p} (${pos}) VOLLEY ile vurdu! MUHTEŞEM!`,
  (p, pos) => `⚽💎 GOOOOL! ${p} (${pos}) ELASTICO sonrası plase vuruş!`,
  (p, pos) => `⚽🌀 GOOOOL! ${p} (${pos}) RAINBOW FLICK + ŞUT!`,
];

const KURTARIS_OLAYLARI = [
  (p) => `🧤 ${p} REFLEKS KURTARIŞ! Joystick mucizesi!`,
  (p) => `🧤 ${p} çift kurtarış yaptı! INPUT GECİKMESİ YOK!`,
  (p) => `🧤 ${p} uzanarak çıkardı! CONTROLLER KIRILDI NEREDEYSE!`,
];

const GAMING_OLAYLARI = [
  (p, pos) => `🕹️ ${p} (${pos}) ball roll + fake shot yaptı! ÇILGIN!`,
  (p, pos) => `💫 ${p} (${pos}) la croqueta ile savunmacıyı geçti!`,
  (p, pos) => `⚡ ${p} (${pos}) TİKİ-TAKA paslaşması başlattı!`,
  (p, pos) => `🔥 ${p} (${pos}) driven pass ile alan açtı!`,
  (p, pos) => `💨 ${p} (${pos}) speed boost ile koştu! PACE ABUSE!`,
  (p, pos) => `🎯 ${p} (${pos}) threaded through ball verdi!`,
  (p, pos) => `🏃 ${p} (${pos}) jockey ile topu kaptı!`,
  (p, pos) => `💪 ${p} (${pos}) tackle ile topu aldı! L2 TUTTU!`,
  (p, pos) => `🌟 ${p} (${pos}) heel to heel flick! SHOW ZAMANI!`,
  (p, pos) => `🎮 ${p} (${pos}) manual switching ile müdahale!`,
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
 * FIFA Oyun Simülasyonu
 */
function simulateFifa(team1, team2) {
  const lines = [];
  const stats = {};

  const power1 = team1.power || 50;
  const power2 = team2.power || 50;
  const totalPower = power1 + power2;

  // ── Başlık ──
  lines.push('═══════════════════════════════════════════════');
  lines.push('🎮⚽ FIFA OYUN MODU');
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
    stats[p.key] = { Gol: 0, Asist: 0, Şut: 0, 'Şut İsabeti': 0, 'Topa Sahip Olma%': 0, Pozisyon: p.pozisyon };
  });

  // ── Topa sahip olma hesaplama ──
  const possession1 = Math.round(35 + (power1 / totalPower) * 30 + rastgeleSayi(-5, 5));
  const possession2 = 100 - possession1;

  // ── Kadro gösterimi ──
  lines.push('');
  lines.push('🕹️ ═══ KADRO SEÇİMİ ═══');
  lines.push(`🔴 ${oyuncular1.map(p => `${p.formatted}(${p.pozisyon})`).join(' | ')}`);
  lines.push(`🔵 ${oyuncular2.map(p => `${p.formatted}(${p.pozisyon})`).join(' | ')}`);
  lines.push(`📊 Topa Sahip Olma: 🔴 %${possession1} - %${possession2} 🔵`);

  // ── Yardımcı fonksiyonlar ──
  function golcuSec(takim) {
    const oyuncular = takim === 1 ? oyuncular1 : oyuncular2;
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

  function yariSimule(yariNo, dakikaBaslangic, dakikaBitis) {
    const olaylar = [];
    const sutSayisi = rastgeleSayi(3, 7); // Toplam şut fırsatı

    for (let i = 0; i < sutSayisi; i++) {
      const atakTakim = Math.random() < (power1 / totalPower) ? 1 : 2;
      const savunmaTakim = atakTakim === 1 ? 2 : 1;
      const sutcu = golcuSec(atakTakim);
      const kaleci = kaleciBul(savunmaTakim);
      const dakika = rastgeleSayi(dakikaBaslangic, dakikaBitis);

      stats[sutcu.key].Şut++;

      // İsabet şansı
      const isabetSansi = 0.5 + (sutcu.rating / 300);
      if (Math.random() < isabetSansi) {
        stats[sutcu.key]['Şut İsabeti']++;

        // Gol şansı
        const golSansi = 0.35 + (sutcu.rating / 400) - (kaleci.rating / 500);
        if (Math.random() < golSansi) {
          // GOL!
          stats[sutcu.key].Gol++;
          if (atakTakim === 1) skor1++; else skor2++;

          // Asist
          const takimOyunculari = (atakTakim === 1 ? oyuncular1 : oyuncular2).filter(p => p.key !== sutcu.key);
          let asistci = null;
          if (takimOyunculari.length > 0 && Math.random() < 0.7) {
            asistci = takimOyunculari[rastgeleSayi(0, takimOyunculari.length - 1)];
            stats[asistci.key].Asist++;
          }

          const golSatiri = rastgele(GOL_OLAYLARI)(sutcu.formatted, sutcu.pozisyon);
          if (asistci) {
            olaylar.push({ dakika, satir: `${dakika}' ${golSatiri} (Asist: ${asistci.formatted}) [${skor1}-${skor2}]` });
          } else {
            olaylar.push({ dakika, satir: `${dakika}' ${golSatiri} [${skor1}-${skor2}]` });
          }
        } else {
          // Kurtarış
          stats[kaleci.key].Şut++;
          stats[kaleci.key]['Şut İsabeti']++;
          olaylar.push({ dakika, satir: `${dakika}' ${rastgele(KURTARIS_OLAYLARI)(kaleci.formatted)}` });
        }
      } else {
        // Iskaladı, gaming olayı göster
        const oyuncu = oyuncuSec(atakTakim);
        olaylar.push({ dakika, satir: `${dakika}' ${rastgele(GAMING_OLAYLARI)(oyuncu.formatted, oyuncu.pozisyon)}` });
      }
    }

    // Gaming olayları ekle (ara olaylar)
    const extraOlay = rastgeleSayi(1, 2);
    for (let i = 0; i < extraOlay; i++) {
      const takim = Math.random() < 0.5 ? 1 : 2;
      const oyuncu = oyuncuSec(takim);
      const dakika = rastgeleSayi(dakikaBaslangic, dakikaBitis);
      olaylar.push({ dakika, satir: `${dakika}' ${rastgele(GAMING_OLAYLARI)(oyuncu.formatted, oyuncu.pozisyon)}` });
    }

    olaylar.sort((a, b) => a.dakika - b.dakika);
    olaylar.forEach(o => lines.push(o.satir));
  }

  // ══ 1. YARI ══
  lines.push('');
  lines.push('🎮 ═══ 1. YARI ═══');
  yariSimule(1, 1, 45);
  lines.push(`📊 Devre: 🔴 ${skor1} - ${skor2} 🔵`);

  // ══ 2. YARI ══
  lines.push('');
  lines.push('🔥 ═══ 2. YARI ═══');
  yariSimule(2, 46, 90);
  lines.push(`📊 Normal Süre: 🔴 ${skor1} - ${skor2} 🔵`);

  // ══ UZATMA (Berabere ise) ══
  let winnerId;
  if (skor1 === skor2) {
    lines.push('');
    lines.push('⏱️⏱️ ═══ UZATMA! ═══');
    lines.push('🎮 Ekstra süre başlıyor!');

    // Uzatma 1. yarı
    lines.push('');
    lines.push('⚡ ═══ UZATMA 1. YARI ═══');
    yariSimule(3, 91, 105);
    lines.push(`📊 Uzatma Devre: 🔴 ${skor1} - ${skor2} 🔵`);

    // Uzatma 2. yarı
    lines.push('');
    lines.push('🔥 ═══ UZATMA 2. YARI ═══');
    yariSimule(4, 106, 120);
    lines.push(`📊 Uzatma Sonu: 🔴 ${skor1} - ${skor2} 🔵`);

    // Hâlâ berabere ise: penaltı
    if (skor1 === skor2) {
      lines.push('');
      lines.push('🎯🎯🎯 ═══ PENALTI ATIŞLARI! ═══');
      lines.push('😱 Controller titriyor! Penaltılara gidiyoruz!');

      let pen1 = 0;
      let pen2 = 0;
      const kaleci1 = kaleciBul(1);
      const kaleci2 = kaleciBul(2);

      for (let i = 0; i < 5; i++) {
        const atici1 = oyuncular1[i];
        const atmaOlasiligi1 = 0.6 + (atici1.rating / 300);
        if (Math.random() < atmaOlasiligi1) {
          pen1++;
          const golTipi = rastgele(['finesse', 'power shot', 'chip', 'placed']);
          lines.push(`🔴 ${atici1.formatted} → ⚽ ${golTipi.toUpperCase()} ile GOL! (${pen1}-${pen2})`);
        } else {
          lines.push(`🔴 ${atici1.formatted} → ❌ KAÇIRDI! Green time tutturamadı! (${pen1}-${pen2})`);
        }

        const atici2 = oyuncular2[i];
        const atmaOlasiligi2 = 0.6 + (atici2.rating / 300);
        if (Math.random() < atmaOlasiligi2) {
          pen2++;
          const golTipi = rastgele(['finesse', 'power shot', 'chip', 'placed']);
          lines.push(`🔵 ${atici2.formatted} → ⚽ ${golTipi.toUpperCase()} ile GOL! (${pen1}-${pen2})`);
        } else {
          lines.push(`🔵 ${atici2.formatted} → ❌ KAÇIRDI! Kaleci okudu! (${pen1}-${pen2})`);
        }

        const kalanAtis = 4 - i;
        if (pen1 - pen2 > kalanAtis || pen2 - pen1 > kalanAtis) break;
      }

      // Ani ölüm
      let sdRound = 0;
      while (pen1 === pen2 && sdRound < 50) {
        sdRound++;
        lines.push(`⚡ ANİ ÖLÜM ${sdRound}. TUR!`);

        const sd1 = oyuncular1[sdRound % 5];
        if (Math.random() < 0.65) {
          pen1++;
          lines.push(`🔴 ${sd1.formatted} → ⚽ GOL! (${pen1}-${pen2})`);
        } else {
          lines.push(`🔴 ${sd1.formatted} → ❌ KAÇIRDI! (${pen1}-${pen2})`);
        }

        const sd2 = oyuncular2[sdRound % 5];
        if (Math.random() < 0.65) {
          pen2++;
          lines.push(`🔵 ${sd2.formatted} → ⚽ GOL! (${pen1}-${pen2})`);
        } else {
          lines.push(`🔵 ${sd2.formatted} → ❌ KAÇIRDI! (${pen1}-${pen2})`);
        }
      }

      if (pen1 === pen2) pen1++; // Sadece sonsuz döngüden kaçmak için, pratikte 50. tura kalmaz

      lines.push(`📊 Penaltı Sonucu: 🔴 ${pen1} - ${pen2} 🔵`);
      winnerId = pen1 > pen2 ? team1.userId : team2.userId;
    } else {
      winnerId = skor1 > skor2 ? team1.userId : team2.userId;
    }
  } else {
    winnerId = skor1 > skor2 ? team1.userId : team2.userId;
  }

  // ── Topa sahip olma yüzdesi ekle ──
  oyuncular1.forEach(p => {
    stats[p.key]['Topa Sahip Olma%'] = Math.round(possession1 / 5 + rastgeleSayi(-5, 5));
  });
  oyuncular2.forEach(p => {
    stats[p.key]['Topa Sahip Olma%'] = Math.round(possession2 / 5 + rastgeleSayi(-5, 5));
  });

  // ══ SONUÇ ══
  const kazananIsim = winnerId === team1.userId ? team1.displayName : team2.displayName;

  lines.push('');
  lines.push('🏆 ═══ SONUÇ ═══');
  lines.push(`📊 Final Skor: 🔴 ${skor1} - ${skor2} 🔵`);
  lines.push(`📊 Topa Sahip Olma: 🔴 %${possession1} - %${possession2} 🔵`);
  lines.push(`🎉 ${kazananIsim} KAZANDI! GG! 🏆🎮`);

  if (skor1 + skor2 >= 7) {
    lines.push('⚽🔥 GOL FESTİVALİ! Kontrolcüler yandı!');
  } else if (skor1 + skor2 <= 1) {
    lines.push('🛡️ Defansif meta! Park the bus!');
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
    lines.push(`  ${p.formatted} (${p.pozisyon}): Gol: ${s.Gol} | Asist: ${s.Asist} | Şut: ${s.Şut} | İsabet: ${s['Şut İsabeti']} | Sahip: %${s['Topa Sahip Olma%']}`);
  });
  lines.push(`🔵 ${team2.displayName}:`);
  oyuncular2.forEach(p => {
    const s = stats[p.key];
    lines.push(`  ${p.formatted} (${p.pozisyon}): Gol: ${s.Gol} | Asist: ${s.Asist} | Şut: ${s.Şut} | İsabet: ${s['Şut İsabeti']} | Sahip: %${s['Topa Sahip Olma%']}`);
  });
  lines.push('═══════════════════════════════════════════════');

  return { lines, winnerId, stats };
}

module.exports = { simulateFifa };
