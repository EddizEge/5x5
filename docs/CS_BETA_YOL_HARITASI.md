# Counter-Strike Beta — Kilitli Yol Haritası

> Kilit tarihi: 30 Temmuz 2026
>
> Bu belgedeki 5H–5L sırası ve ana kapsam kullanıcı onayı olmadan
> değiştirilmeyecektir. Geliştirme sırasında ortaya çıkan yeni fikirler mevcut
> aşamaların adını veya sırasını değiştirmez; belgenin sonundaki ayrı backlog
> bölümüne eklenir. Yalnızca tamamlanma durumu güncellenebilir.

## Mevcut durum

- 5A–5G: Tamamlandı.
- 5H: Tamamlandı.
- 5I: Tamamlandı.
- 5J: Tamamlandı.
- 5K: Tamamlandı.
- 5L: Tamamlandı.
- CS Beta: Tamamlandı ve 5L sürümü donduruldu.

### 5L sonrası doğrulanmış düzeltmeler

- Admin harita raporundaki gerçek T ve alt-kat CT spawn alanları beşer ayrı
  başlangıç düğümüyle düzeltildi.
- CT Spawn–Short/A platformu duvarındaki boost bağlantıları normal yürüyüşe
  kapatıldı; Long A girişi gerçek rampaya yönlendirildi.
- T Spawn–Short rotası çizilen güvenli koridora taşındı ve CT ekonomisine göre
  düz Mid AWP riski plan seçiminde hesaba katıldı.
- 5L sonrası kaybolan kill feed, mermi izi, utility ve C4 animasyonları için
  oynatıcı önbelleği/süre uyumluluğu düzeltildi.
- İkinci admin harita raporu paketindeki dört AWP kesim hattı ile T tarafının
  Mid, Long, A ve B smoke/flash/HE/molotof noktaları plan ve raund fazına
  bağlandı.
- T rota/pusma ve CT açılış raporları eklendi: CT beş ayrı gerçek açılış
  görevine dağılır; Long, B ve retake bombaları ilgili görev sahibine bağlanır.
- A/B post-plant pozisyonları rapordaki nav noktalarına taşındı. C4 taşıyıcısı
  execute sırasında yalnız bırakılmaz; uygun takım arkadaşları planter desteği
  verir ve beşinci T ters bombsite'a kopmaz.
- Post-plantta son CT hakkında güvenilir görüş/ses bilgisi alan oyuncu bunu
  gecikmeli takım çağrısıyla paylaşır. Site'tan gereksiz uzak lurk/destek
  oyuncuları geri çağrılırken en yakın T bomba korumasında kalır.
- Long Doors geçiş bölgesi bilgisiz açı beklemeye kapatıldı; oyuncular gerçek
  temas yoksa koridorda gereksiz oyalanmadan execute'a devam eder.
- Utility, ses, takım çağrısı ve yerde ekipman alma/bırakma bildirimlerinin
  global oyun akışını durdurması kaldırıldı. Bu olayların yazı ve efektleri
  hareket sürerken oynar; beklemeli vurgu çatışma/ölüm ve kritik raund sonuç
  olaylarına ayrılır.

## 5H — Utility karar zekâsı ve takım koordinasyonu

Amaç: Smoke, flash, HE ve molotof/yanıcı bombaların sabit saniyelerde değil,
raundun gerçek bilgi durumuna göre kullanılması.

Kapsam:

- Utility yalnızca gerçekten kullanıldığı anda oyuncu envanterinden düşer.
- Görüş, ses, takım çağrısı, son bilinen rakip konumu ve bilgi güveni karara
  katılır.
- Entry desteği, execute örtüsü, rush geciktirme, site temizleme, post-plant ve
  retake kullanımları birbirinden ayrılır.
- Dost flash riski değerlendirilir.
- Aynı takımın utilityleri gereksiz biçimde aynı anda üst üste atılmaz.
- Smoke-flash gibi kontrollü zincir kullanımlar desteklenir.
- CT save kararında kullanılmayan utility korunur.
- Kullanım kararı, gerekçesi ve güven oranı canlı anlatımda görünür.
- Aynı seed aynı utility kararlarını üretir.

Tamamlanma kapısı:

- Bütün utility türleri bilgiye dayalı karar üretecek.
- Bilgi yokken HE/molotof rastgele harcanmayacak.
- Kullanılmayan utility, hayatta kalan oyuncuyla sonraki raunda taşınacak.
- Utility kararları plant, retake, save ve görüş kurallarını bozmayacak.
- Geniş seed regresyonu ve canlı tarayıcı testi geçecek.

## 5I — Ses, fake ve bilgi paylaşımı derinliği

Amaç: Oyuncuların yalnızca görüşe değil, anlamlı ve yanılabilir ses bilgisine
göre hareket etmesi.

Kapsam:

- Koşu, yürüme, ateş, reload, utility, C4 düşmesi, plant ve defuse sesleri ayrı
  bilgi türleri olur.
- Ses mesafesi, yön tahmini ve konum hatası olay türüne göre değişir.
- Takım çağrıları oyuncular arasında gecikmeli ve azalan güvenle paylaşılır.
- Tek bir ses bütün takımın rakibi kesin olarak bilmesine yol açmaz.
- Fake sesler yanlış rotate veya erken utility kullanımına sebep olabilir.
- Birden fazla tutarlı bilgi yanlış tahmini düzeltebilir.
- Fake plant, fake defuse ve sessiz yaklaşım kararları eklenir.

Tamamlanma kapısı:

- Duvar arkasında ses tek başına kill yetkisi vermeyecek.
- Ses bilgisi zamanla unutulacak.
- Fake ve gerçek bilgi farklı takım reaksiyonları üretecek.
- Aynı seed aynı ses ve bilgi zincirini üretecek.

## 5J — Gelişmiş roller ve takım taktikleri

Amaç: Beş oyuncunun bağımsız hareket etmesi yerine rol paylaşımı olan takım
oyunu üretmek.

Kapsam:

- Entry, support, lurk, anchor ve AWP rollerinin raund içi görevleri ayrılır.
- Execute öncesi takımın toplanması ve giriş zamanlaması koordine edilir.
- Entry ile trade oyuncusu arasındaki takip mesafesi korunur.
- Lurk oyuncusu bilgi ve rotate kesme görevi üstlenir.
- CT anchor gereksiz erken rotate etmez.
- AWP uzun açı, geri çekilme ve yeniden konumlanma davranışı kullanır.
- İlk plana karşılık mid-round yeniden çağrı üretilebilir.
- Post-plant çaprazları, retake girişleri ve save çıkışları rol bazlı çözülür.

Tamamlanma kapısı:

- Her yaşayan oyuncunun raund fazına uygun tek bir görevi olacak.
- Entry yalnız bırakılmayacak; trade mesafesi ölçülecek.
- Lurk ve anchor kararları takım bilgisini bozmayacak.
- Execute, retake ve save telemetrisi geniş testte doğrulanacak.

## 5K — Yerden silah alma ve raund içi envanter

Amaç: Ölen oyuncuların ekipmanının dünya üzerinde kalması ve ekonomik değeri
olan gerçek envanter kararları üretmek.

Kapsam:

- Ölen oyuncunun ana silahı ve kullanılmamış uygun ekipmanı öldüğü konumda
  düşer.
- Yakındaki oyuncu güvenliyse yerdeki silahı alabilir.
- Daha değerli silah, rol uyumu, mevcut mermi ve çatışma riski değerlendirilir.
- Takım arkadaşı için silah taşıma ve raund sonunda koruma desteklenir.
- Yerden alınan silahın şarjör ve yedek mermi durumu korunur.
- C4 düşürme/geri alma sistemiyle dünya nesnesi çakışmaları engellenir.
- Ekonomi özeti, alınan ve kaybedilen ekipman değerini açıklar.

Tamamlanma kapısı:

- Ölü oyuncu silah kullanamayacak veya silahı ikinci kez düşüremeyecek.
- Aynı silah aynı anda iki oyuncunun envanterinde bulunmayacak.
- Alınan silah sonraki raunda doğru biçimde taşınacak.
- Save ve ekonomi testleri envanter değerleriyle tutarlı kalacak.

## 5L — Final dengeleme, performans ve CS beta cilası

Amaç: Counter-Strike beta paketini kararlı, okunabilir ve ölçülmüş bir sürüme
getirmek.

Kapsam:

- Kazanma, plant, defuse, save, ekonomi ve utility kullanım oranları dengelenir.
- Çok sayıda seed ile deterministik geniş regresyon çalıştırılır.
- Duvar geçişi, hatalı görüş, teleport, geçersiz plant ve çift ölüm sıfır
  toleransla kontrol edilir.
- Uzun maçlarda olay/snapshot boyutu ve oynatıcı performansı iyileştirilir.
- 1x, 2x ve 4x oynatma akıcılığı doğrulanır.
- Utility, ses, pickup ve plan bildirimleri dünya hareketini durdurmaz; beklemeli vurgu ateş/ölüm ve kritik raund sonuçlarında korunur.
- Pistol, devre sonu, maç puanı ve uzatma raundlarında düşük para eco yerine force'a çevrilir; post-plant save yasaktır ve retake bomba patlayana kadar sürer.
- AWP execute commitinden veya raundun %58'inden sonra eski kesme açısına takılı kalmaz; plant sonrasında retake/defuse görevi AWP reposition davranışını ezer.
- CT'ler rapordaki Long/Short/B/Mid açılışlarına doğrudan sprintle dağılır; ilk savunma dağılımı yaklaşık 2.2 görsel saniyeyi aşmaz. T'ler T Spawn çıkışını tamamlamadan uzak ses, takım çağrısı veya rutin açı kontrolü için durmaz.
- C4 rota/plant hazırlığı normal raundda ilk çeyrekte, pistol/eco ve kaybedilecek ekonomi olmayan raundlarda daha erken başlar. 1:55 oyun saati korunurken plantların son 15-20 saniyeye yığılması engellenir ve `test:cs-round-tempo` ile sabit seed üzerinde korunur.
- A/B ortak plant objective akışı düzeltildi: regroup çağrısı C4 taşıyıcısını kendi konumunda bırakamaz, kesin nav `areaId` katı korunur, başarısız rota objective etiketi üretmez ve alternatif site içi plant düğümü denenir. Destekçiler ayrı rota şeritlerine dağıtılır; yaşayan taşıyıcının boş noktada süre tüketmesi `test:cs-plant-objective` ile engellenir.
- Pistol/eko ve geleceği olmayan must-attempt raundlarında T objective baskısı erkene çekildi: yaklaşık %12'de site commit, %20'de güvenli plant kapısı açılır; lurk/AWP bekleyişi ve düşük can geri çekilmesi plant denemesini iptal edemez. Aktif defuse sesi takım geneline yayılır, açık T görüşündeki defuse başlayamaz/tamamlanamaz. Aynı kattaki T/CT oyuncuları birbirinin içinden geçemez; farklı Mid/Short veya Tunnels/B katları yalnız radar izdüşümü nedeniyle birbirini bloke etmez. Regresyon `test:cs-force-objective-defuse` ile sabitlendi.
- Beta lobi maç geçişi tekil `matchSessionId` sözleşmesine bağlandı. Eski maç kuyruğu, tekrar kullanılan `cs-1-*` oyuncu kimlikleri, kill feed ve skor yeni eşleşmede sıfırlanır; final puan tablosu görsel kuyruğun sonundan sonra açılır. Shooter hızı çalışan zaman dilimine anında uygulanır ve 20x taban bekleme sınırları senkron kayması oluşturmaz.
- Defuse alanında başlangıçtan kalan rakip çakışması `return-fire` yakın teması üretir. Görünür T tehdidi oluştuğu anda aktif defuse kesilir; başarılı defuse görseli yalnız gerçek CT aktörünü ve gerçek C4 noktasını kullanır.
- Masaüstü ve mobil okunabilirlik son kez düzenlenir.
- Admin beta testi için hata ve telemetri özeti tamamlanır.
- CS beta sürümü dondurulur ve Valorant geliştirmesine geçiş notları hazırlanır.

Tamamlanma kapısı:

- Bütün CS regresyon testleri geçecek.
- Beta dışı modlara shooter olayı sızmayacak.
- Canlı tarayıcıda konsol hatası ve kritik görsel taşma olmayacak.
- Bilinen kritik simülasyon hatası kalmayacak.

## Sabit sıra

1. 5H — Utility karar zekâsı ve takım koordinasyonu
2. 5I — Ses, fake ve bilgi paylaşımı derinliği
3. 5J — Gelişmiş roller ve takım taktikleri
4. 5K — Yerden silah alma ve raund içi envanter
5. 5L — Final dengeleme, performans ve CS beta cilası

## Ayrı backlog

Bu bölüm yol haritasının sırasını değiştirmeden gelecekteki fikirleri saklamak
içindir.

- Counter-Strike beta tamamlandıktan sonra Valorant harita ve spike simülasyonu.
