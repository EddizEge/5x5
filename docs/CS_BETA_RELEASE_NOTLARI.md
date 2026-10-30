# Counter-Strike Beta 5L — Sürüm Dondurma ve Valorant Geçiş Notu

> Dondurma tarihi: 30 Temmuz 2026
>
> Sürüm: `5L-release-1`

## Dondurulan CS beta paketi

- Tek harita Dust II'dir.
- Raund sonucu yalnızca 20 Hz dünya durumundan üretilir.
- Oyuncu hareketi gerçek nav ve üçgen çarpışma verisine bağlıdır.
- Görüş, ses, utility, C4, ekonomi, silah, mermi ve yerdeki envanter aynı
  dünya durumu üzerinde çözülür.
- Görsel oynatıcı sonucu yeniden hesaplamaz; backend olaylarını oynatır.
- Gerçek konum zaman çizelgesi rota değişimlerinden bağımsız saklanır. Geri
  çekilme veya yeniden rota üretimi geçmiş hareketi değiştiremez.
- Sık olaylarda yalnız değişen oyuncular taşınır; kritik raund anlarında tam
  snapshot korunur.
- Admin Beta Testi oran, payload, süre ve kritik bütünlük özetini gösterir.

## 5L yayın kapısı

Yayın regresyonu aşağıdaki kontrolleri birlikte çalıştırır:

- Çoklu seed oran dengesi
- Aynı seed ile aynı sonuç
- Beta dışı CS akışına shooter olayı sızmaması
- Duvar/görüş, rota dışı konum, geçersiz plant ve çift ölüm kontrolleri
- Silah kimliği, ammo ve yerdeki envanter bütünlüğü
- Sonuç ve tek olay payload bütçesi

Ana komutlar:

```bash
npm run test:cs-beta-release
npm run test:cs-spatial
npm run test:cs-team-tactics-integration
```

30 Temmuz 2026 final geniş örneğinde 12 maç ve 276 raunt; T kazanma `%39,9`,
plant `%70,7`, plant başına defuse `%44,1`, plant başına save `%2,1` ve raunt
başına `3,90` utility üretti. Bu değerler `cs-beta-balance.js` içindeki
dondurulmuş kabul aralıklarının tamamındadır.

## Dondurma kuralı

CS betadaki yeni hata düzeltmeleri mevcut testleri ve dondurulmuş dünya
kurallarını korumalıdır. Yeni özellik veya kapsam genişlemesi ayrı bir sürüm
kararı olmadan bu pakete eklenmez.

## Valorant geçişi

Valorant geliştirmesinde yeniden kullanılacak çekirdek:

- Sabit adımlı yetkili dünya
- Harita nav ve çarpışma katmanı
- Görüş, ses, bilgi hafızası ve takım çağrısı
- Deterministik seed
- Olay/snapshot sıkıştırması ve konum zaman çizelgesi
- Admin sağlık ve denge telemetrisi

Valorant için ayrı tasarlanacak parçalar:

- Dust II koordinatları yerine seçilecek Valorant haritasının gerçek geometrisi
- C4 yerine Spike plant/defuse kuralları
- CS ekonomisini kopyalamayan Valorant satın alma ve kredi sistemi
- Ajan yetenekleri, cooldown/charge, alan etkisi ve görüş engelleme kuralları
- Valorant silah kataloğu, hasar düşüşü, zırh ve hareket isabeti
- Ulti puanı, orb ve ajan rol koordinasyonu

İlk Valorant adımı, tek harita seçimi ile o haritanın nav/çarpışma ve doğru
Spike alanlarının doğrulanmasıdır. CS davranışları koordinat veya ekonomi
seviyesinde doğrudan kopyalanmamalıdır.
