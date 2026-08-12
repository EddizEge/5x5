// ═══════════════════════════════════════════════════════
// 🎯🔫 VALORANT 5v5 SİMÜLATÖRÜ
// ═══════════════════════════════════════════════════════

const AJANLAR = ['Jett', 'Reyna', 'Omen', 'Sage', 'Sova', 'Phoenix', 'Killjoy', 'Cypher', 'Raze', 'Viper'];
const HARITALAR = ['Bind', 'Haven', 'Ascent', 'Split', 'Icebox'];

const HEYECANLI_OLAYLAR = [
  (p) => `🎯 ${p} ACE yaptı! 5 KILL! Takım tek başına taşıyor!`,
  (p) => `🔫 ${p} CLUTCH 1v3! İNANILMAZ!`,
  (p) => `💣 ${p} spike'ı son saniye defuse etti! KALBİMİZ DURDU!`,
  (p) => `⚡ ${p} Operator ile 3K! DUVAR GİBİ!`,
  (p) => `🔥 ${p} ult ile 4 kişiyi halleddi! EFSANE!`,
  (p) => `💀 ${p} knife kill aldı! HAKARET!`,
  (p) => `🎯 ${p} one tap! HEADSHOT MAKİNESİ!`,
  (p) => `⚔️ ${p} 1v1 clutch kazandı! BUZ GİBİ SOĞUKKANLLIK!`,
];

const NORMAL_OLAYLAR = [
  (p, t) => `🔫 ${p} round'u ${t} için kazandı`,
  (p, t) => `💥 ${p} opening kill aldı, ${t} round'u aldı`,
  (p, t) => `🛡️ ${t} savunmayı tuttu, ${p} kilit oyuncu oldu`,
  (p, t) => `💣 Spike patladı! ${t} round'u kazandı`,
  (p, t) => `⏱️ Zaman doldu, ${t} savunma round'unu aldı`,
];

const ECO_OLAYLARI = [
  (t) => `💰 ${t} eco round oynuyor... Sheriff'lerle!`,
  (t) => `🔫 ${t} force buy yaptı! Spectre dönemi!`,
  (t) => `💸 ${t} tam alım yaptı! Vandal + Shield!`,
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
 * Valorant 5v5 Simülasyonu
 */
function simulateValorant(team1, team2) {
  const lines = [];
  const stats = {};

  const power1 = team1.power || 50;
  const power2 = team2.power || 50;
  const totalPower = power1 + power2;

  // ── Harita seçimi ──
  const harita = rastgele(HARITALAR);

  // ── Başlık ──
  lines.push('═══════════════════════════════════════════════');
  lines.push('🎯🔫 VALORANT 5v5');
  lines.push(`📍 Harita: ${harita}`);
  lines.push(`🔴 ${team1.displayName} vs 🔵 ${team2.displayName}`);
  lines.push('═══════════════════════════════════════════════');

  // ── Ajan atamaları ──
  const karisikAjanlar = [...AJANLAR].sort(() => Math.random() - 0.5);

  const oyuncular1 = team1.characters.map((c, i) => ({
    ...c,
    formatted: formatAd(c),
    key: statKey(c),
    ajan: karisikAjanlar[i],
    team: 1,
  }));

  const oyuncular2 = team2.characters.map((c, i) => ({
    ...c,
    formatted: formatAd(c),
    key: statKey(c),
    ajan: karisikAjanlar[i + 5],
    team: 2,
  }));

  const tumOyuncular = [...oyuncular1, ...oyuncular2];

  // ── Stat başlangıçları ──
  tumOyuncular.forEach(p => {
    stats[p.key] = { Kill: 0, Death: 0, Assist: 0, 'Headshot%': 0, Clutch: 0, Ajan: p.ajan, _hsHits: 0, _totalHits: 0 };
  });

  // ── Ajan seçim gösterimi ──
  lines.push('');
  lines.push('🕵️ ═══ AJAN SEÇİMİ ═══');
  lines.push(`🔴 ${oyuncular1.map(p => `${p.formatted}=${p.ajan}`).join(' | ')}`);
  lines.push(`🔵 ${oyuncular2.map(p => `${p.formatted}=${p.ajan}`).join(' | ')}`);

  // ── Round simülasyonu ──
  let skor1 = 0;
  let skor2 = 0;
  let toplamRound = 0;

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
    const hsOrani = 0.15 + (killer.rating / 200);
    for (let i = 0; i < killSayisi; i++) {
      stats[killer.key]._totalHits++;
      if (Math.random() < hsOrani) stats[killer.key]._hsHits++;
    }
    // Karşı takımdan ölümler
    const karsitOyuncular = killer.team === 1 ? oyuncular2 : oyuncular1;
    for (let i = 0; i < killSayisi && i < karsitOyuncular.length; i++) {
      const kurban = karsitOyuncular[rastgeleSayi(0, karsitOyuncular.length - 1)];
      stats[kurban.key].Death++;
    }
    // Asistler
    const takim = killer.team === 1 ? oyuncular1 : oyuncular2;
    const yardimcilar = takim.filter(p => p.key !== killer.key);
    const asistSayisi = rastgeleSayi(0, Math.min(2, killSayisi));
    for (let i = 0; i < asistSayisi; i++) {
      stats[yardimcilar[rastgeleSayi(0, yardimcilar.length - 1)].key].Assist++;
    }
  }

  // ══ İLK YARI (Takım1 = Atak, Takım2 = Savunma) ══
  lines.push('');
  lines.push('⚔️ ═══ İLK YARI ═══');
  lines.push(`🔴 ${team1.displayName} → ATAK | 🔵 ${team2.displayName} → SAVUNMA`);

  let normalRoundBirikimi = [];

  for (let round = 1; round <= 12; round++) {
    toplamRound++;
    // İlk yarı: team1 atak avantajı biraz düşük
    const atakBonus = -2;
    const kazanmaOlasılığı = (power1 + atakBonus) / (totalPower + atakBonus);
    const kazanan = Math.random() < kazanmaOlasılığı ? 1 : 2;

    if (kazanan === 1) skor1++; else skor2++;

    const kilit = oyuncuSec(kazanan);
    const heyecanli = Math.random() < 0.25;

    if (heyecanli) {
      // Biriken normal roundları yaz
      if (normalRoundBirikimi.length > 0) {
        if (normalRoundBirikimi.length === 1) {
          lines.push(normalRoundBirikimi[0]);
        } else {
          lines.push(`📊 ${normalRoundBirikimi.length} round oynandı... (${skor1}-${skor2})`);
        }
        normalRoundBirikimi = [];
      }

      const killSayisi = rastgeleSayi(2, 5);
      roundKillEkle(kilit, killSayisi);
      if (killSayisi >= 5) {
        lines.push(`🎯 R${round}: ${rastgele(HEYECANLI_OLAYLAR)(kilit.formatted)} [${skor1}-${skor2}]`);
        stats[kilit.key].Clutch++;
      } else if (killSayisi >= 3) {
        lines.push(`🔥 R${round}: ${kilit.formatted} ${killSayisi}K ile round'u taşıdı! [${skor1}-${skor2}]`);
        if (Math.random() < 0.4) stats[kilit.key].Clutch++;
      } else {
        lines.push(`⚡ R${round}: ${rastgele(HEYECANLI_OLAYLAR)(kilit.formatted)} [${skor1}-${skor2}]`);
      }
    } else {
      roundKillEkle(kilit, rastgeleSayi(1, 2));
      const takimIsmi = kazanan === 1 ? team1.displayName : team2.displayName;
      normalRoundBirikimi.push(`🔫 R${round}: ${rastgele(NORMAL_OLAYLAR)(kilit.formatted, takimIsmi)} [${skor1}-${skor2}]`);
    }

    // Erken bitiş kontrolü (13 round kazanma)
    if (skor1 >= 13 || skor2 >= 13) break;
  }

  // Kalan normal roundları yaz
  if (normalRoundBirikimi.length > 0) {
    if (normalRoundBirikimi.length <= 2) {
      normalRoundBirikimi.forEach(l => lines.push(l));
    } else {
      lines.push(`📊 ${normalRoundBirikimi.length} rutin round oynandı... (${skor1}-${skor2})`);
    }
    normalRoundBirikimi = [];
  }

  // ══ DEVIR ══
  if (skor1 < 13 && skor2 < 13) {
    lines.push('');
    lines.push(`🔄 ═══ DEVİR! Skor: ${skor1}-${skor2} ═══`);
    lines.push(`🔵 ${team2.displayName} → ATAK | 🔴 ${team1.displayName} → SAVUNMA`);

    // ══ İKİNCİ YARI ══
    for (let round = 13; round <= 24; round++) {
      toplamRound++;
      const savunmaBonus = 2;
      const kazanmaOlasılığı = (power1 + savunmaBonus) / (totalPower + savunmaBonus);
      const kazanan = Math.random() < kazanmaOlasılığı ? 1 : 2;

      if (kazanan === 1) skor1++; else skor2++;

      const kilit = oyuncuSec(kazanan);
      const heyecanli = Math.random() < 0.25 || skor1 === 12 && skor2 === 12;

      if (heyecanli) {
        if (normalRoundBirikimi.length > 0) {
          if (normalRoundBirikimi.length <= 2) {
            normalRoundBirikimi.forEach(l => lines.push(l));
          } else {
            lines.push(`📊 ${normalRoundBirikimi.length} round oynandı... (${skor1}-${skor2})`);
          }
          normalRoundBirikimi = [];
        }

        const killSayisi = rastgeleSayi(2, 5);
        roundKillEkle(kilit, killSayisi);
        if (killSayisi >= 4) {
          lines.push(`🎯 R${round}: ${rastgele(HEYECANLI_OLAYLAR)(kilit.formatted)} [${skor1}-${skor2}]`);
          stats[kilit.key].Clutch++;
        } else {
          lines.push(`🔥 R${round}: ${kilit.formatted} ${killSayisi}K round! [${skor1}-${skor2}]`);
        }
      } else {
        roundKillEkle(kilit, rastgeleSayi(1, 2));
        const takimIsmi = kazanan === 1 ? team1.displayName : team2.displayName;
        normalRoundBirikimi.push(`🔫 R${round}: ${rastgele(NORMAL_OLAYLAR)(kilit.formatted, takimIsmi)} [${skor1}-${skor2}]`);
      }

      if (skor1 >= 13 || skor2 >= 13) break;
    }

    if (normalRoundBirikimi.length > 0) {
      if (normalRoundBirikimi.length <= 2) {
        normalRoundBirikimi.forEach(l => lines.push(l));
      } else {
        lines.push(`📊 ${normalRoundBirikimi.length} rutin round oynandı... (${skor1}-${skor2})`);
      }
      normalRoundBirikimi = [];
    }
  }

  // ══ OVERTIME (12-12 ise) ══
  if (skor1 === 12 && skor2 === 12) {
    lines.push('');
    lines.push('🔥🔥🔥 ═══ UZATMA! 12-12! ═══');

    let otRound = 25;
    while (skor1 === skor2 || (skor1 < 13 && skor2 < 13)) {
      toplamRound++;
      const kazanan = Math.random() < (power1 / totalPower) ? 1 : 2;
      if (kazanan === 1) skor1++; else skor2++;

      const kilit = oyuncuSec(kazanan);
      roundKillEkle(kilit, rastgeleSayi(1, 3));
      lines.push(`⚡ OT-R${otRound - 24}: ${kilit.formatted} CLUTCH! [${skor1}-${skor2}]`);
      stats[kilit.key].Clutch++;
      otRound++;

      if (Math.abs(skor1 - skor2) >= 2 && (skor1 >= 13 || skor2 >= 13)) break;
      if (otRound > 30) {
        // Zorla bitir
        if (skor1 === skor2) { skor1++; }
        break;
      }
    }
  }

  // ── Headshot% hesaplama ──
  tumOyuncular.forEach(p => {
    if (stats[p.key]._totalHits > 0) {
      stats[p.key]['Headshot%'] = Math.round((stats[p.key]._hsHits / stats[p.key]._totalHits) * 100);
    } else {
      stats[p.key]['Headshot%'] = rastgeleSayi(15, 35);
    }
    delete stats[p.key]._hsHits;
    delete stats[p.key]._totalHits;
  });

  // ══ SONUÇ ══
  const winnerId = skor1 > skor2 ? team1.userId : team2.userId;
  const kazananIsim = winnerId === team1.userId ? team1.displayName : team2.displayName;

  lines.push('');
  lines.push('🏆 ═══ SONUÇ ═══');
  lines.push(`📊 Skor: 🔴 ${skor1} - ${skor2} 🔵`);
  lines.push(`🎉 ${kazananIsim} KAZANDI! GG WP! 🏆`);

  if (Math.abs(skor1 - skor2) <= 2) {
    lines.push('😱 SON DERECE YAKIN MAÇ!');
  } else if (Math.abs(skor1 - skor2) >= 8) {
    lines.push(`💀 ${kazananIsim} EZDİ GEÇTİ!`);
  }

  // ── MVP ──
  let mvpKey = null;
  let mvpScore = -1;
  tumOyuncular.forEach(p => {
    const score = stats[p.key].Kill * 3 + stats[p.key].Assist - stats[p.key].Death * 2 + stats[p.key].Clutch * 5;
    if (score > mvpScore) {
      mvpScore = score;
      mvpKey = p;
    }
  });
  if (mvpKey) {
    lines.push(`⭐ MVP: ${mvpKey.formatted} (${mvpKey.ajan}) - ${stats[mvpKey.key].Kill}/${stats[mvpKey.key].Death}/${stats[mvpKey.key].Assist} | HS: ${stats[mvpKey.key]['Headshot%']}%`);
  }

  // ── Skor Tablosu ──
  lines.push('');
  lines.push('📋 ═══ SKOR TABLOSU ═══');
  lines.push(`🔴 ${team1.displayName}:`);
  oyuncular1.forEach(p => {
    const s = stats[p.key];
    lines.push(`  ${p.formatted} (${p.ajan}): ${s.Kill}/${s.Death}/${s.Assist} | HS: ${s['Headshot%']}% | Clutch: ${s.Clutch}`);
  });
  lines.push(`🔵 ${team2.displayName}:`);
  oyuncular2.forEach(p => {
    const s = stats[p.key];
    lines.push(`  ${p.formatted} (${p.ajan}): ${s.Kill}/${s.Death}/${s.Assist} | HS: ${s['Headshot%']}% | Clutch: ${s.Clutch}`);
  });
  lines.push('═══════════════════════════════════════════════');

  return { lines, winnerId, stats };
}

module.exports = { simulateValorant };
