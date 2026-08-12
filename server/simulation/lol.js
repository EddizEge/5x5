// ═══════════════════════════════════════════════════════
// 🎮⚔️ LEAGUE OF LEGENDS 5v5 SİMÜLATÖRÜ
// ═══════════════════════════════════════════════════════

const ROLLER = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

const SAMPIYON_HAVUZU = {
  Top: ['Darius', 'Garen', 'Camille', 'Fiora', 'Aatrox', 'Mordekaiser', 'Sett', 'Jax'],
  Jungle: ['Lee Sin', 'Kayn', 'Viego', 'Graves', 'Elise', 'Hecarim', 'Kha\'Zix', 'Rengar'],
  Mid: ['Ahri', 'Zed', 'Yasuo', 'Akali', 'Sylas', 'Katarina', 'LeBlanc', 'Orianna'],
  ADC: ['Jinx', 'Kai\'Sa', 'Vayne', 'Ezreal', 'Jhin', 'Aphelios', 'Lucian', 'Miss Fortune'],
  Support: ['Thresh', 'Lulu', 'Nautilus', 'Leona', 'Yuumi', 'Pyke', 'Karma', 'Morgana'],
};

const ERKEN_OLAYLAR = [
  (p, r) => `🔥 ${p} (${r}) FIRST BLOOD aldı! İlk kan akıyor!`,
  (p, r) => `⚔️ ${p} (${r}) erken gank ile öldürme aldı!`,
  (p, r) => `🐉 ${p} (${r}) ilk drake'i solo attı!`,
  (p, r) => `🗼 ${p} (${r}) ilk kuleyi yıktı!`,
  (p, r) => `💀 ${p} (${r}) lane'de solo kill attı!`,
  (p, r) => `🌀 ${p} (${r}) roam yaparak avantaj sağladı!`,
  (p, r) => `🎯 ${p} (${r}) mükemmel bir gank yaptı!`,
];

const ORTA_OLAYLAR = [
  (p, r) => `🐉 DRAGON FIGHT! ${p} (${r}) kavgayı başlattı!`,
  (p, r) => `💥 TEAMFIGHT! ${p} (${r}) muhteşem engage attı!`,
  (p, r) => `🗼 ${p} (${r}) split push ile kule yıktı!`,
  (p, r) => `⚡ ${p} (${r}) pick yaparak avantaj sağladı!`,
  (p, r) => `🔥 ${p} (${r}) DOUBLE KILL aldı!`,
  (p, r) => `💫 ${p} (${r}) objektif çaldı! ÇILGIN!`,
  (p, r) => `🛡️ ${p} (${r}) mükemmel peel yaptı!`,
];

const GEC_OLAYLAR = [
  (p, r) => `🏰 BARON NASHOR! ${p} (${r}) baron çağrısı yaptı!`,
  (p, r) => `💀 ${p} (${r}) TRIPLE KILL! Durdurulamıyor!`,
  (p, r) => `🐉 ELDER DRAGON! ${p} (${r}) elder aldı!`,
  (p, r) => `⚔️ SON TEAMFIGHT! ${p} (${r}) flank attı!`,
  (p, r) => `💥 ${p} (${r}) QUADRA KILL! Bir tane daha!`,
  (p, r) => `🏆 ${p} (${r}) inhibitör yıktı! Nexus açık!`,
  (p, r) => `🔥 ${p} (${r}) backdoor denedi!`,
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
 * LoL 5v5 Simülasyonu
 */
function simulateLol(team1, team2) {
  const lines = [];
  const stats = {};

  // ── Takım güçleri ──
  const power1 = team1.power || 50;
  const power2 = team2.power || 50;
  const totalPower = power1 + power2;

  // ── Harita seçimi ──
  const haritalar = ['Summoner\'s Rift'];
  const harita = rastgele(haritalar);

  // ── Başlık ──
  lines.push('═══════════════════════════════════════════════');
  lines.push('🎮⚔️ LEAGUE OF LEGENDS 5v5');
  lines.push(`📍 Harita: ${harita}`);
  lines.push(`🔴 ${team1.displayName} vs 🔵 ${team2.displayName}`);
  lines.push('═══════════════════════════════════════════════');

  // ── Oyuncu atamaları ──
  const oyuncular1 = team1.characters.map((c, i) => ({
    ...c,
    formatted: formatAd(c),
    key: statKey(c),
    rol: ROLLER[i],
    sampiyon: rastgele(SAMPIYON_HAVUZU[ROLLER[i]]),
    team: 1,
  }));

  const oyuncular2 = team2.characters.map((c, i) => ({
    ...c,
    formatted: formatAd(c),
    key: statKey(c),
    rol: ROLLER[i],
    sampiyon: rastgele(SAMPIYON_HAVUZU[ROLLER[i]]),
    team: 2,
  }));

  const tumOyuncular = [...oyuncular1, ...oyuncular2];

  // ── Stat başlangıçları ──
  tumOyuncular.forEach(p => {
    stats[p.key] = { Kill: 0, Death: 0, Assist: 0, CS: 0, Hasar: 0, Rol: p.rol, Şampiyon: p.sampiyon };
  });

  // ══ FAZ 1: ŞAMPİYON SEÇİMİ ══
  lines.push('');
  lines.push('🏆 ═══ ŞAMPİYON SEÇİMİ ═══');
  let secimLines = [];
  oyuncular1.forEach(p => secimLines.push(`🔴 ${p.formatted} → ${p.sampiyon} (${p.rol})`));
  oyuncular2.forEach(p => secimLines.push(`🔵 ${p.formatted} → ${p.sampiyon} (${p.rol})`));
  // Kompakt gösterim
  lines.push(`🔴 ${oyuncular1.map(p => `${p.formatted}=${p.sampiyon}`).join(' | ')}`);
  lines.push(`🔵 ${oyuncular2.map(p => `${p.formatted}=${p.sampiyon}`).join(' | ')}`);

  // ── Yardımcı fonksiyonlar ──
  function olayOyuncuSec(takim) {
    const oyuncular = takim === 1 ? oyuncular1 : oyuncular2;
    // Rating ağırlıklı seçim
    const weights = oyuncular.map(p => p.rating + rastgeleSayi(-10, 10));
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < oyuncular.length; i++) {
      rand -= weights[i];
      if (rand <= 0) return oyuncular[i];
    }
    return oyuncular[oyuncular.length - 1];
  }

  function killOlayi(killer, victim) {
    stats[killer.key].Kill++;
    stats[victim.key].Death++;
    // Asist: takım arkadaşlarından rastgele 1-2 kişi
    const takimArkadaslari = (killer.team === 1 ? oyuncular1 : oyuncular2).filter(p => p.key !== killer.key);
    const asistSayisi = rastgeleSayi(1, 2);
    for (let i = 0; i < asistSayisi && i < takimArkadaslari.length; i++) {
      const asistci = takimArkadaslari[rastgeleSayi(0, takimArkadaslari.length - 1)];
      stats[asistci.key].Assist++;
    }
  }

  // ── Takım kill sayaçları ──
  let team1Kills = 0;
  let team2Kills = 0;

  // ══ FAZ 2: ERKEN OYUN (0-15 dk) ══
  lines.push('');
  lines.push('⏰ ═══ ERKEN OYUN (0-15 dk) ═══');

  const erkenOlaySayisi = rastgeleSayi(2, 4);
  for (let i = 0; i < erkenOlaySayisi; i++) {
    const kazananTakim = Math.random() < (power1 / totalPower) ? 1 : 2;
    const killer = olayOyuncuSec(kazananTakim);
    const victim = olayOyuncuSec(kazananTakim === 1 ? 2 : 1);
    killOlayi(killer, victim);
    if (kazananTakim === 1) team1Kills++; else team2Kills++;

    const olay = rastgele(ERKEN_OLAYLAR);
    lines.push(olay(killer.formatted, killer.rol));
  }

  // CS ekleme (erken oyun)
  tumOyuncular.forEach(p => {
    const baseCS = p.rol === 'Support' ? rastgeleSayi(10, 25) : rastgeleSayi(80, 130);
    const ratingBonus = Math.floor((p.rating - 50) * 0.5);
    stats[p.key].CS += Math.max(0, baseCS + ratingBonus + rastgeleSayi(-10, 10));
  });

  // ══ FAZ 3: ORTA OYUN (15-30 dk) ══
  lines.push('');
  lines.push('⚡ ═══ ORTA OYUN (15-30 dk) ═══');

  const ortaOlaySayisi = rastgeleSayi(3, 5);
  for (let i = 0; i < ortaOlaySayisi; i++) {
    const kazananTakim = Math.random() < (power1 / totalPower) ? 1 : 2;
    const killer = olayOyuncuSec(kazananTakim);
    const victim = olayOyuncuSec(kazananTakim === 1 ? 2 : 1);
    killOlayi(killer, victim);
    if (kazananTakim === 1) team1Kills++; else team2Kills++;

    // Bazen çoklu kill
    if (Math.random() < 0.3) {
      const victim2 = olayOyuncuSec(kazananTakim === 1 ? 2 : 1);
      killOlayi(killer, victim2);
      if (kazananTakim === 1) team1Kills++; else team2Kills++;
    }

    const olay = rastgele(ORTA_OLAYLAR);
    lines.push(olay(killer.formatted, killer.rol));
  }

  // CS ekleme (orta oyun)
  tumOyuncular.forEach(p => {
    const baseCS = p.rol === 'Support' ? rastgeleSayi(5, 15) : rastgeleSayi(60, 100);
    const ratingBonus = Math.floor((p.rating - 50) * 0.3);
    stats[p.key].CS += Math.max(0, baseCS + ratingBonus + rastgeleSayi(-10, 10));
  });

  // ══ FAZ 4: GEÇ OYUN (30+ dk) ══
  lines.push('');
  lines.push('🔥 ═══ GEÇ OYUN (30+ dk) ═══');

  const gecOlaySayisi = rastgeleSayi(2, 4);
  for (let i = 0; i < gecOlaySayisi; i++) {
    const kazananTakim = Math.random() < (power1 / totalPower) ? 1 : 2;
    const killer = olayOyuncuSec(kazananTakim);
    const victim = olayOyuncuSec(kazananTakim === 1 ? 2 : 1);
    killOlayi(killer, victim);
    if (kazananTakim === 1) team1Kills++; else team2Kills++;

    // Pentakill şansı
    if (Math.random() < 0.08) {
      for (let j = 0; j < 4; j++) {
        const v = olayOyuncuSec(kazananTakim === 1 ? 2 : 1);
        killOlayi(killer, v);
        if (kazananTakim === 1) team1Kills++; else team2Kills++;
      }
      lines.push(`💀💀💀💀💀 ${killer.formatted} (${killer.rol}) PENTAKILL!!! EFSANE!!!`);
    } else {
      const olay = rastgele(GEC_OLAYLAR);
      lines.push(olay(killer.formatted, killer.rol));
    }
  }

  // CS ekleme (geç oyun)
  tumOyuncular.forEach(p => {
    const baseCS = p.rol === 'Support' ? rastgeleSayi(5, 10) : rastgeleSayi(40, 80);
    const ratingBonus = Math.floor((p.rating - 50) * 0.2);
    stats[p.key].CS += Math.max(0, baseCS + ratingBonus + rastgeleSayi(-5, 5));
  });

  // ── Hasar hesaplama ──
  tumOyuncular.forEach(p => {
    const baseHasar = p.rol === 'Support' ? rastgeleSayi(8000, 15000) : rastgeleSayi(15000, 35000);
    const ratingMultiplier = 0.7 + (p.rating / 100) * 0.6;
    const killBonus = stats[p.key].Kill * rastgeleSayi(500, 1500);
    stats[p.key].Hasar = Math.floor((baseHasar * ratingMultiplier) + killBonus);
  });

  // ══ FAZ 5: SONUÇ ══
  lines.push('');
  lines.push('🏆 ═══ SONUÇ ═══');

  // Kazanan belirleme
  const team1Score = team1Kills + (power1 * 0.3);
  const team2Score = team2Kills + (power2 * 0.3);
  const winnerId = team1Score >= team2Score ? team1.userId : team2.userId;
  const kazananIsim = winnerId === team1.userId ? team1.displayName : team2.displayName;
  const kaybedenIsim = winnerId === team1.userId ? team2.displayName : team1.displayName;

  const sureDakika = rastgeleSayi(25, 45);
  lines.push(`⏱️ Maç Süresi: ${sureDakika} dakika`);
  lines.push(`📊 Kill Skoru: 🔴 ${team1Kills} - ${team2Kills} 🔵`);

  if (team1Kills - team2Kills > 10 || team2Kills - team1Kills > 10) {
    lines.push(`💀 ${kazananIsim} STOMP attı! EZICI zafer! 🏆`);
  } else if (Math.abs(team1Kills - team2Kills) <= 3) {
    lines.push(`😱 SON DERECE YAKIN MAÇ! ${kazananIsim} kıl payı kazandı! 🏆`);
  } else {
    lines.push(`🎉 ${kazananIsim} galibiyeti kazandı! GG WP! 🏆`);
  }

  // ── MVP ──
  let mvpKey = null;
  let mvpScore = -1;
  tumOyuncular.forEach(p => {
    const score = stats[p.key].Kill * 3 + stats[p.key].Assist * 1.5 - stats[p.key].Death * 2 + stats[p.key].Hasar / 5000;
    if (score > mvpScore) {
      mvpScore = score;
      mvpKey = p;
    }
  });
  if (mvpKey) {
    lines.push(`⭐ MVP: ${mvpKey.formatted} (${mvpKey.rol}) - ${stats[mvpKey.key].Kill}/${stats[mvpKey.key].Death}/${stats[mvpKey.key].Assist}`);
  }

  // ── Skor Tablosu ──
  lines.push('');
  lines.push('📋 ═══ SKOR TABLOSU ═══');
  lines.push(`🔴 ${team1.displayName}:`);
  oyuncular1.forEach(p => {
    const s = stats[p.key];
    lines.push(`  ${p.formatted} (${p.rol}/${p.sampiyon}): ${s.Kill}/${s.Death}/${s.Assist} | CS: ${s.CS} | Hasar: ${s.Hasar}`);
  });
  lines.push(`🔵 ${team2.displayName}:`);
  oyuncular2.forEach(p => {
    const s = stats[p.key];
    lines.push(`  ${p.formatted} (${p.rol}/${p.sampiyon}): ${s.Kill}/${s.Death}/${s.Assist} | CS: ${s.CS} | Hasar: ${s.Hasar}`);
  });
  lines.push('═══════════════════════════════════════════════');

  return { lines, winnerId, stats };
}

module.exports = { simulateLol };
