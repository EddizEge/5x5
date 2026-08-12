# CS Beta Ekonomi ve Silah Mağazası Planı

## Amaç

CS beta simülasyonunda her raunt, önceki raundun parasal sonucunu taşıyacak. Oyuncuların silahı, zırhı, bombaları ve hayatta kaldıklarında korudukları ekipman gerçek maç durumunun parçası olacak. Raunt kazanma olasılığı artık yalnızca kart ratinginden değil; satın alma kararı, ekipman değeri, taraf ve harita planından da etkilenecek.

Bu katman yalnızca `isVisualBeta` CS akışında açılacak. Mevcut Basit Mod ve beta dışı sonuç motoru değişmeyecek.

## Temel durum modeli

Her oyuncu için:

- `money`: 0–16.000 dolar
- `inventory`: tabanca, ana silah, bıçak, zırh, kask, kit ve bombalar
- `equipmentValue`: eldeki ekipmanın toplam değeri
- `savedFromPreviousRound`: önceki raunttan korunan silah/ekipman
- `rolePreference`: entry, support, lurk, anchor, AWP
- `purchasePlan`: bu raunt seçilen alışveriş planı

Her takım için:

- `lossBonusIndex`: güncel kayıp bonusu basamağı
- `buyType`: `pistol`, `eco`, `low`, `half`, `force`, `full`, `hero`
- `teamMoney`, `teamEquipmentValue`, `teamSpend`
- `side`: T veya CT
- `score`, `round`, `isMatchPoint`

## Para kuralları

İlk sürümde güncel rekabetçi CS2 değerleri yapılandırılabilir bir kural dosyasından okunacak:

- Yarı başlangıcı: oyuncu başına 800 dolar
- Para üst sınırı: 16.000 dolar
- Normal raunt galibiyeti: oyuncu başına 3.250 dolar
- C4 patlamasıyla galibiyet: oyuncu başına 3.500 dolar
- Kayıp bonusu: 1.400 / 1.900 / 2.400 / 2.900 / 3.400 dolar
- Yarı başında kayıp sayacı 1 kabul edildiğinden tabanca raundu mağlubu 1.900 dolar alır
- C4 kurulup raunt kaybedilirse T oyuncularına ek 800 dolar
- C4 kuran veya imha eden oyuncuya 300 dolar kişisel ödül
- Silah sınıfına göre kill ödülü ayrı hesaplanır; AWP, SMG, shotgun, bıçak ve standart tüfek ödülleri birbirinden ayrılır
- Güncel rekabetçi kurala göre CT takımındaki her oyuncu, raundda öldürülen her T için galibiyet/mağlubiyetten bağımsız 50 dolar ortak takım ödülü alır

Tüm tutarlar `cs-economy-rules.js` içinde tutulacak. Böylece Valve dengesi değiştiğinde simülasyon kodunu değiştirmeden katalog güncellenebilecek.

## Mağaza kataloğu

`cs-weapon-catalog.js` aşağıdaki alanları taşıyacak:

```js
{
  id,
  name,
  side,
  slot,
  category,
  price,
  killReward,
  armorPenetration,
  rangeProfile,
  fireRate,
  movementAccuracy,
  magazineSize,
  tacticalTags
}
```

İlk katalog:

- Tabancalar: Glock-18, USP-S, P250, Five-SeveN/Tec-9, Desert Eagle
- SMG: MAC-10, MP9, UMP-45
- Tüfek: Galil AR, FAMAS, AK-47, M4A1-S, M4A4, AUG, SG 553
- Keskin nişancı: SSG 08, AWP
- Shotgun: Nova, XM1014
- Ekipman: Kevlar, Kevlar + kask, CT defuse kit
- Bomba: smoke, flash, HE, molotov/incendiary

Katalog ilk etapta oynanışı belirleyen değerleri içerir; kozmetik skin sistemiyle karıştırılmaz.

## Satın alma karar motoru

Her takım için beş olası plan üretilir ve maç kazanma ihtimaline etkisi puanlanır:

1. `eco`: para koru, yalnızca ucuz yardımcı ekipman
2. `half`: gelecek rauntta tam alışverişe yetecek tabanı koru
3. `force`: eldeki parayı mevcut raunt için büyük ölçüde harca
4. `full`: tüfek/AWP + zırh + dengeli utility
5. `hero`: bir oyuncunun koruduğu güçlü silah etrafında düşük harcama

Karar puanı şu girdileri kullanır:

- mevcut skor ve maç puanı baskısı
- oyuncu ve takım parası
- elde korunan silahlar
- kayıp bonusunun bir sonraki basamağı
- taraf maliyet farkı; CT tarafında kit ve daha pahalı tam alışveriş ihtiyacı
- rakibin tahmini ekipman değeri
- kart ratingleri ve oyuncu rol tercihleri
- seçilen Dust II planı; örneğin Long A utility ihtiyacı veya B tüneli yakın mesafe avantajı

İlk sürüm açıklanabilir kural tabanlı olacak. Her karar `reasonCodes` üretecek: `MATCH_POINT_FORCE`, `SAVE_FOR_AWP`, `CT_KIT_PRIORITY`, `ANTI_ECO_SMG`, `FULL_UTILITY` gibi. Daha sonra, harcama ve maç kazanma olasılığını birlikte kullanan bir modelle geliştirilebilir. Bu yaklaşım, ekonomik kararları yalnızca “parası varsa AK al” seviyesinde bırakmaz.

## Raunt akışı

1. Önceki raunt sonucu para ve envantere uygulanır.
2. Hayatta kalanlar silah ve ekipmanını korur; ölenlerin envanteri başlangıç tabancasına döner.
3. `buy-phase` olayı yayınlanır.
4. Karar motoru takım planını seçer.
5. Oyuncular rollerine ve bütçeye göre sırayla alışveriş yapar.
6. `purchase` olayları mağaza panelinde kısa animasyonlarla gösterilir.
7. Raunt başlarken gerçek `equipmentValue` güç hesabına girer.
8. Kill ödülleri, plant/defuse ödülleri ve raunt sonucu sunucu tarafında uygulanır.
9. `economy-summary` olayı bir sonraki raunt öncesi para değişimini açıklar.

## Görsel arayüz

Mevcut Dust II izleyicisine raunt başında açılan kompakt bir mağaza katmanı eklenecek:

- iki takımın toplam parası ve ekipman değeri
- buy türü rozeti: ECO / HALF / FORCE / FULL / HERO
- oyuncu satırında para, silah, zırh, kit ve utility ikonları
- satın alımlarda kısa para düşüşü ve ekipman eklenme animasyonu
- raunt sırasında kenar panelinde oyuncunun aktif silahı
- raunt sonunda kazanılan para ve korunan ekipman özeti

Alışveriş ekranı simülasyonu durdurmayacak; yayın hızına bağlı kısa bir hazırlık evresi olarak oynayacak.

## Güç ve sonuç bağlantısı

Ekonomi sonucu doğrudan belirlemeyecek. Raunt kazanma olasılığı şu bileşenlerle hesaplanacak:

```text
kart yeteneği
+ ekipman kalitesi
+ utility uyumu
+ taraf/rota uyumu
+ hayatta kalan silah avantajı
+ küçük kontrollü rastlantı
```

ECO takımının upset kazanması mümkün olacak; ancak eşit ratinglerde full buy takımına karşı belirgin şekilde daha düşük olasılık taşıyacak. AWP, açık görüş hattında; SMG ve shotgun ise yakın mesafe rotalarında daha etkili olacak.

## Uygulama sırası

1. `cs-economy-rules.js` ve test edilebilir para defteri
2. Silah/ekipman kataloğu
3. Oyuncu envanteri ve rauntlar arası kalıcılık
4. Açıklanabilir satın alma karar motoru
5. Ekipman değerinin raunt güç hesabına bağlanması
6. `buy-phase`, `purchase`, `economy-summary` görsel olayları
7. Mağaza paneli ve oyuncu ekipman ikonları
8. Birkaç yüz maçlık ekonomi regresyonu

## Regresyon hedefleri

- Hiçbir oyuncunun parası 0 altına veya 16.000 üstüne çıkmamalı
- Ölen oyuncu bir sonraki raunda ana silah taşıyamamalı
- Hayatta kalan oyuncu, takım kararı ECO olsa bile koruduğu silahı muhafaza etmeli
- CT dışındaki oyuncu defuse kit satın alamamalı
- Bomba limitleri ve slot kuralları ihlal edilmemeli
- Tabanca raundu ve taraf değişiminde para/envanter doğru sıfırlanmalı
- Kill ve objective ödülleri bir kez uygulanmalı
- Beta dışı CS akışında ekonomi görsel olayları oluşmamalı
- Eşit ratingli toplu testte full buy, eco’ya karşı anlamlı ama garantisiz üstünlük sağlamalı

## Araştırma dayanakları

- [Valve CS2 güncelleme notları](https://www.counter-strike.net/news/updates)
- [Counter-Strike para ve ödül kuralları](https://counterstrike.fandom.com/wiki/Money)
- [Optimal Team Economic Decisions in Counter-Strike](https://arxiv.org/abs/2109.12990)

Araştırma makalesindeki temel fikir korunacak: en iyi satın alma kararı yalnızca mevcut raundu değil, takım parası, ekipman değeri, skor ve sonraki rauntların maç kazanma olasılığını birlikte değerlendirmelidir.
