# Beta Futbol V2 Yeniden İnşa Yol Haritası

## Amaç

Beta Halı Saha ve daha sonra FIFA görsel akışını, önceden belirlenmiş olaylara oyuncu taşıyan sahne mantığından çıkarıp tek ve sürekli bir dünya durumu üzerinde çalışan futbol simülasyonuna dönüştürmek.

V2 mevcut Beta futbol motorunun üstüne eklenen bir ayar paketi değildir. Eski motor geri dönüş ve karşılaştırma için korunur; V2 ayrı modül, API ve oynatıcıyla geliştirilir.

## Değişmez Mimari Kuralları

1. Oyuncu, top, sahiplik, hız ve görev durumunun tek sahibi sunucudaki `FootballWorld` olmalıdır.
2. Tarayıcı futbol kararı vermez, oyuncu hedefi üretmez ve sonucu değiştirmez. Yalnızca yetkili dünya karelerini yumuşatarak gösterir.
3. Açık oyunda ışınlanma, sert konum override'ı ve sonradan takım genişliği/derinliği düzeltmesi kullanılmaz.
4. Takım koordinasyonu, bireysel karar ve fiziksel hareket farklı çalışma hızlarına sahip ayrı katmanlardır.
5. Oyuncuya tek hedef noktası yerine sınırları olan görev bölgesi verilir. Oyuncu o bölge içinde boşluk, pas kanalı ve takım mesafesine göre hedef seçer.
6. Pas arası, müdahale, şut ve gol gerçek top/oyuncu kesişiminden doğar. Görsel olay oyuncuları sonucu canlandıracak koordinatlara çekmez.
7. Kabul ölçümleri planlanan hedeflerden değil, yetkili dünya karelerinde gerçekten oluşan konumlardan hesaplanır.
8. Bütün V2 özellikleri yalnızca Beta Lobi ve Süper Admin Beta Testi içinde kalır.

## Paketler

### ✅ Paket 0 — Dondurma ve Yalıtım

* Mevcut Beta futbol oynatıcısı değiştirilmeden korunur.
* Yeni geliştirme `football-v2-*` modülleri, ayrı API ve ayrı Admin düğmesi üzerinden yürür.
* Aynı seed ile tekrar oynatma zorunludur.
* Eski Beta Testi, Basit Mod ve Taktiksel Mod davranışları V2 geliştirmesinden etkilenmez.

### 🟡 Paket 1 — Tek Dünya Hareket Laboratuvarı

Tamamlanan hareket çekirdeği:

* Sunucuda 20 Hz sabit adımlı tek dünya durumu oluşturuldu.
* Beş karakter ve bir bot kaleciden oluşan iki takım 30 saniyelik kesintisiz akış üretir.
* Takım planı 500 ms, top sahibi kararı 250 ms aralıklarla güncellenir.
* Hız, ivme, varış ve ayrışma tek hareket katmanında çözülür.
* Hücumda top sahibi, yakın destek, genişlik, derin koşu ve geride emniyet görevleri kullanılır.
* Savunmada baskı, kademe, iki koridor ve arka hat görevleri kullanılır.
* Görevler tek koordinat değil hareket bölgesi taşır; oyuncu bölge içindeki adayları değerlendirir.
* Tarayıcı sunucudan gelen 10 Hz kareleri interpolasyonla gösterir ve hiçbir taktik karar üretmez.
* Admin Paneli → Simülasyon Testi → Halı Saha → `Futbol V2 Lab` yoluyla çalıştırılır.
* Görev bölgeleri ve hız vektörleri açılıp kapatılabilen debug katmanında gösterilir.
* Pas havadayken hücum eden takım artık geçici olarak savunma planına düşmez; mevcut hücum şekli gerçek kontrole kadar korunur.
* Oyuncu bazında görev değişimi, ortalama/en kısa görev süresi ve görev dağılımı raporlanır.
* Takım genişliğine ek olarak takım boyu, top çevresi kümelenmesi, geride emniyet ve savunma arkası koruma süresi ölçülür.
* 24 farklı seed ve `65-85` rating kombinasyonunda ışınlanma `0`; ortalama rol değişimi `38.83`, en yüksek toplam değişim `56`, oyuncu başı azami değişim `11` ölçüldü.
* Aynı 24 koşuda minimum ortalama takım genişliği `43.06`, minimum takım boyu `20.24`, en uzun kümelenme `0.85 sn`, geride emniyetsiz süre en fazla `3.15 sn` oldu.

Paket 1'in kalan kabul kapısı:

* 24 seed otomatik uzamsal kabulden geçti; bunların farklı kritik anları görsel örneklemle incelenmeye devam edilecek.
* Masaüstü Admin akışı, duraklat/devam, 1x/4x, debug bölgeleri ve tamamlanma doğrulandı.
* Mobil görünüm ve farklı dar ekran genişlikleri ayrıca görsel kabulden geçirilecek.

### ✅ Paket 2 — Takım Koordinasyonu ve Savunma Devri

İlk dilim tamamlandı:

* Takım fazları geriden kurulum, ilerleme, son bölge, hücum-savunma geçişi ve yerleşik savunma olarak yetkili dünyaya eklendi.
* Görev atamalarında `1.5 sn` minimum görev süresi, maliyet iyileşme eşiği ve mevcut görev devamlılığı uygulanır.
* Savunma hattı topa ve geçiş fazına göre kale tarafında birlikte öne/geriye kayar.
* Faz değişimleri snapshot ve olay akışına taşınır; Admin laboratuvarında Türkçe faz etiketi gösterilir.
* Birinci baskıcı topa uzak kaldığında en uygun yakındaki savunmacıya devredilir; eski baskıcı yeni baskıcının boşalttığı kademe/koridor sorumluluğunu doğrudan alır.
* Savunmadaki diğer dört oyuncu hücumun top sahibi ve dört topsuz tehdidini benzersiz biçimde paylaşır. Koridor ve arka hat oyuncuları hedefin hareketiyle birlikte kendi şerit sınırları içinde kayar.
* `markTargetId` ve `responsibility` yetkili snapshot'a eklenmiştir. Frontend yalnızca bu sorumluluğu `BASKI → B`, `KORİDOR → S` gibi debug etiketiyle gösterir.
* Gerçek oyuncu değişimi olduğunda `handoff` dünya olayı üretilir; hedefin aynı savunmacı üzerindeki sıradan güncellenmesi olay panelini doldurmaz.
* 24 normal rating koşusunda baskı devri koşu başına en az `4`; açıklanamayan savunma yığılması en fazla `0.55 sn`, açık tehdit en fazla `2.70 sn`, geçersiz savunma şekli `0` ölçüldü.
* Aynı koşularda minimum takım genişliği `39.84`, en uzun kümelenme `1.25 sn`, ortalama markaj mesafesinin en yüksek değeri `17.76` ve ışınlanma `0` kaldı.
* `20-95` arası karışık rating profilleriyle ek 8 koşuda görev yapısı ve saha sınırları korundu. Düşük ratingli kadrolarda reaksiyon/yerleşim kalitesi bilinçli biçimde daha zayıf kalabilir.
* FIFA V2 dünyası `GK, LB, LCB, RCB, RB, LDM, RDM, LAM, CAM, RAM, ST` mevkileriyle 11v11'e çıkarıldı. Her takım beş draft karakteri, beş silik saha botu ve bir bot kaleci kullanır.
* Beş oyunculuk permütasyon taraması, 10 saha oyuncusunu kilitlenmeden eşleyebilen bit-mask dinamik programlama görev çözücüsüyle değiştirildi.
* FIFA hücumunda iki destek, iki genişlik, iki derin koşu, iki denge ve bir geride emniyet görevi; savunmada tek baskıcı, kademe, üçlü orta hat, dörtlü arka hat ve süpürücü kullanılır.
* Yedi benzersiz markaj hedefi, kademe hedefi ve top sahibine baskı aynı dünya karesinde çakışmadan dağıtılır. Hedef devirleri mevki koduyla debug katmanına taşınır.
* Admin laboratuvarı Halı Saha yanında FIFA seçimini de kabul eder. FIFA botları karakterlerden daha silik, mevki ve rating bilgileri korunmuş biçimde gösterilir.
* 12 FIFA seed/rating koşusunda ışınlanma ve geçersiz savunma şekli `0`; minimum takım genişliği `68.33`, minimum takım boyu `25.79`, minimum aynı takım mesafesi `2.63`, en uzun açık tehdit `4.15 sn` ve en yüksek ortalama markaj mesafesi `19.51` ölçüldü.

Kabul kapısı:

* Rol değişimlerinin çoğu top sahipliği/faz değişimiyle açıklanabilmeli.
* Savunma arkasının korumasız kaldığı süre hedef sınırın altında olmalı.
* Birinci baskıcı dışında bütün savunma topa koşmamalı.
* Aynı seed, aynı görev ve konum zaman çizelgesini üretmeli.

### ✅ Paket 3 — Top, Pas ve Fiziksel Pas Arası

* Top `carried`, `pass` ve `loose` durumları, bağımsız hız vektörü, fiziksel sürtünme ve dünya sınırı sekmesi taşıyan tek yetkili dünya nesnesidir.
* Pas hedefi alıcının mevcut konumu ve hızından hesaplanan varış tahminiyle üretilir; kart ratingi kontrollü yön hatasını, pas mesafesi ise başlangıç hızını etkiler.
* Her pasın önceki ve yeni top konumu arasındaki doğru parçası bütün saha oyuncularıyla sınanır. Pas arası, ilk kontrol veya sekme yalnızca bu fiziksel kesişme üzerinde çözülebilir.
* Savunmacının teması rating ve top hızına göre temiz pas arası ya da `deflection`; alıcının teması ilk kontrol ya da `heavy-touch` üretebilir.
* Ağır dokunuş, kesilen fakat kontrol edilemeyen pas, hedefi aşan pas ve sınır sekmesi topu `loose` durumuna geçirir. Her takımdan uygun bir oyuncu, genişlik/geride emniyet görevlerini bozmadan sahipsiz topa yönelir.
* Sahiplik yalnızca oyuncu-top temas mesafesi içindeyken değişir. Top, yeni sahibin konumuna çekilmez; sonraki karelerde sınırlı taşıma adımıyla ayağa bağlanır.
* Snapshot artık topun `vx`, `vy`, `targetId`, `passerId` ve `mode` alanlarını taşır. Oynatıcı pası mavi iz, sahipsiz topu turuncu nabız ve debug durum etiketiyle gösterir.
* Telemetri pas denemesi/tamamlanması, ortalama pas boyu ve koridor baskısı, pas arası, sekme, kontrol hatası, sahipsiz top, azami top hızı/adımı, top süreksizliği ve geçersiz sahiplik değişimini raporlar.
* 24 Halı Saha seed’inde 204 pas, 7 sekme, 32 kontrol hatası ve 39 sahipsiz top üretildi. Azami dünya adımı `1.70`; top süreksizliği, geçersiz sahiplik değişimi ve oyuncu ışınlanması `0` kaldı.
* 12 FIFA fizik seed’inde pas yolu teması, kontrol hatası ve sahipsiz top örnekleri üretildi; top süreksizliği ve geçersiz sahiplik değişimi yine `0` ölçüldü.

### ✅ Paket 4 — Top Sürme, Birebir ve Temas

* `dribble` top durumu eklendi. Top sürme, oyuncuya yapışık taşıma yerine `1.05-1.90` birimlik fiziksel dokunuşlar ve ayrı top hızıyla ilerler.
* Ardışık dokunuşların yön değişimi oyuncunun dripling profiline göre `20-48°` ile sınırlıdır. Savunmacının konumu açık koridor yönünü etkiler; oyuncu tek karede ters yöne dönemez.
* Rating, mevki ve kararlı oyuncu kimliğinden `dribbling`, `defending`, `strength` ve `composure` profilleri türetilir. FIFA botları dahil her oyuncu aynı fiziksel düello kurallarını kullanır.
* Savunmacı topun önceki-yeni konum doğru parçasına fiziksel olarak değdiğinde birebir düello çözülür. Sonuç başarılı çalım, temiz top kapma veya temas noktasından sahipsiz top olabilir.
* Yakın baskıda top sahibi vücudunu savunmacıyla top arasına koyabilir. Top saklama ve omuz omuza mücadele oyuncu gücü, savunma, dripling, bağıl hız ve soğukkanlılıktan etkilenir.
* Başarılı çalım savunmacıya kısa reaksiyon kaybı verir. Ağır dokunuş veya kaybedilen omuz mücadelesinde top eski sahibine geri bağlanmaz; fiziksel konum ve hızla `loose` durumunda devam eder.
* Snapshot oyuncunun `shielding` ve `stunned` durumlarını; kadro verisi dripling, savunma ve güç profilini taşır. Oynatıcı dripling topunu yeşil, top saklayan oyuncuyu amber vurguyla gösterir.
* Telemetri dokunuş, başarılı/başarısız çalım, fiziksel düello, omuz omuza mücadele, top saklama, açılan dokunuş ve azami dönüş açısını raporlar.
* 24 Halı Saha kalibrasyonunda `670` dokunuş, `45` birebir temas, `27` başarılı çalım, `101` başarısız çalım, `10` omuz omuza mücadele ve `94` top saklama aksiyonu üretildi. Azami dönüş `35.92°`, top süreksizliği, geçersiz sahiplik değişimi ve oyuncu ışınlanması `0` kaldı.
* FIFA için 12 ek fizik koşusu dokunuş, düello, başarısız çalım ve sahipsiz top kabulünden geçti. Masaüstü Admin laboratuvarında Halı Saha/FIFA görünümü ve tarayıcı konsolu hatasız doğrulandı.

### ✅ Paket 5 — Şut ve Kaleci Dünyası

* `shot`, `keeper-held` ve `dead` top durumları eklendi. Şut, oyuncudan ayrıldığı andan sonuçlandığı ana kadar bağımsız hız vektörüyle 20 Hz dünyada ilerler.
* Şut kararı gerçek kale mesafesi, yatay açı, baskı, şut koridorundaki savunmacılar, kaleci konumu, bitiricilik ve soğukkanlılıktan hesaplanan fayda/xG değerine dayanır.
* Şut mesafesi Halı Saha’da en fazla `33`, FIFA’da `30` normalize birimdir. Mesafe ve baskı arttıkça şut faydası ve hedef isabeti doğal biçimde düşer; orta sahadan rastgele şut üretilmez.
* Kart ratingi ve mevki üzerinden `finishing` profili türetilir. Hedef sapması bitiricilik, soğukkanlılık, baskı ve mesafeden doğar; kaleyi bulamayan top fiziksel olarak kale ağzının dışından çizgiyi geçer.
* Savunmacı yalnızca şutun aynı dünya adımındaki hareket parçasına ulaştığında blok yapabilir. Bloklanan top kesişme noktasından ters hızla sahipsiz kalır.
* Kaleci `line`, `set`, `close-angle` ve `shot-track` kararlarıyla çizgi konumu, açı daraltma ve şut hattı takibi yapar. Kalecinin hedefi şutun hız vektöründen öngörülen kesişme yüksekliğidir.
* Kaleci fiziksel erişim alanında şutu tutabilir veya sektirebilir. Tutuş `keeper-held` durumuna geçer; kaleci kısa bekleme sonrasında en güvenli pas koridoruna dağıtım yapar. Sektirilen top temas noktasından oyuna döner. Kaleyi bulmayan topun kontrol edilmesi `keeper-claim` olarak ayrı tutulur ve kurtarış istatistiğini şişirmez.
* Direğe çarpan şut kale çizgisini geçmeden ters hızla sahaya döner. Gol yalnızca top branşa özel kale ağzı içinde `x < 0` veya `x > 100` konumuna geçtiğinde skora yazılır.
* Snapshot canlı skoru ve kalecinin kararını taşır. Oynatıcı şutu sarı iz, kaleci takibini camgöbeği vurgu ve golü ağ içindeki fiziksel top konumuyla gösterir.
* Telemetri şut/isabet, gol, xG, ortalama-azami şut mesafesi, gerçek kurtarış, dışarı giden topu toplama, tutuş, sektirme, blok, aut, direk, kaleci karar değişimi ve dağıtımı raporlar.
* 24 Halı Saha kalibrasyonunda `42` şut; `10` gol, `3` gerçek kurtarış, `1` dışarı giden topu toplama, `10` blok ve `16` aut üretildi. Top süreksizliği ve geçersiz sahiplik `0`, azami şut mesafesi `32.98`, azami top adımı `2.02` kaldı.
* 12 FIFA fizik koşusunda `16` şut; `6` gol, `1` gerçek kurtarış, `1` dışarı giden topu toplama, `6` aut ve `1` direk üretildi. Azami şut mesafesi `29.95`; top süreksizliği ve geçersiz sahiplik yine `0` ölçüldü.

### ✅ Paket 6 — Maç Kuralları, Anlatım ve İstatistik

* Top saha sınırında sekip oyunda kalmaz. Son dokunuş ve çıktığı çizgi `throw-in`, `corner` veya `goal-kick` kararını belirler.
* Duran top `dead` dünya durumunda tür, takım, konum, vurucu ve en erken kullanım tick’iyle saklanır. Vurucu fiziksel noktaya ulaşınca `restart-taken` oluşur; top pas veya uygun serbest vuruş şutuyla oyuna döner.
* Gol sonrası rakip takım merkezden `kickoff` kullanır. Top gol anında ağ içinde kalır, santra yerleşimi ayrı duraklama sonrasında hazırlanır.
* Dripling temasındaki geç müdahale fiziksel konuma göre `foul` ve `free-kick` veya ceza alanında `penalty` üretir. Penaltı sonucu önceden seçilmez; `isPenalty` taşıyan normal fiziksel şut/kaleci/kale çizgisi akışından geçer.
* Kural rastgeleliği ana hareket RNG’sinden ayrıdır. Aynı kadro ve seed, kural kararları dahil aynı sonucu tekrar üretir.
* `server/simulation/football-v2-stats.js`, tamamlanmış olaylardan takım ve oyuncu istatistiklerini türetir. Tamamlanan pas şuta sekiz saniye içinde bağlanırsa kilit pas ve xA; gol olursa uygun durumda asist yazılır.
* Takım istatistiklerinde topa sahip olma, şut/isabet, xG, pas, çalım, savunma, korner/taç, duran top ve faul bulunur.
* Oyuncu istatistiklerinde gol/asist, şut, xG/xA, pas, kilit pas, çalım, müdahale, pas arası, blok, kurtarış, yenilen gol, faul ve penaltı bulunur.
* Maç notu `6.5` tabanından hücum, dağıtım, top kullanımı, savunma/kaleci ve disiplin bileşenleriyle `3.0-10.0` arasında hesaplanır. Her oyuncu `ratingBreakdown` taşır.
* Admin Maç Merkezi iki takımın özetini ve oyuncuları nota göre sıralanan okunabilir bir tabloda gösterir. FIFA botları `BOT` etiketiyle ayrılır.
* 48 Halı Saha 60 saniyelik kalibrasyonda `6` korner, `14` taç, `50` kale vuruşu, `6` serbest vuruş, `1` penaltı ve `44` santra; toplam `114` tamamlanmış duran top kullanımı oluştu.
* 48 FIFA 60 saniyelik kalibrasyonda `10` korner, `25` taç, `44` kale vuruşu, `16` serbest vuruş, `4` penaltı ve `28` santra; toplam `120` tamamlanmış duran top kullanımı oluştu.
* İki branşın 96 koşusunda ışınlanma, top süreksizliği ve geçersiz sahiplik `0` kaldı. Halı Saha `44`, FIFA `28` gol üreterek branşların ayrı tempo dengesi korundu.

### ✅ Paket 7 — Beta A/B ve Tam Maç Geçişi

* Admin paneline aynı kadro/seed ile çalışan `30 sn Lab`, `Tam Maç V2` ve `A/B Karşılaştır` akışları eklendi.
* Halı Saha tam maçı 50, FIFA tam maçı 90 maç dakikasıdır. Dengeli skor örneklemi için iç dünya sırasıyla 570/330 fizik saniyesi üretir; okunabilir görsel oynatma 240/180 saniyeye ölçeklenir. Admin 1x/2x/4x, gerçek lobi ayrıca 5x/20x kullanabilir.
* Yetkili dünya 20 Hz kalırken tam maç snapshot’ı 3 Hz `adaptive-3hz-full` stratejisine geçirilmiştir. 30 saniyelik laboratuvar 10 Hz kalır.
* Üretim süresi, heap farkı, snapshot/olay/istatistik baytları ve tahmini payload ölçülür. FIFA 90 dakika regresyonu 541 snapshot, 1.207 olay, yaklaşık `3.65 MB` ve Docker içinde yaklaşık `1.15 sn` üretim süresi verdi; 4 MB kabul sınırının altında kaldığı için delta encoding gerekmedi.
* 24’er eşit-rating tam maç seed’inde Halı Saha `9.25` ortalama gol, `%45.8` 10+ gol ve `%0` golsüz maç; FIFA `2.54` ortalama gol ve `%4.2` golsüz maç üretti. Her iki branşta ışınlanma ve top süreksizliği `0` kaldı.
* Yalnız Beta Lobi (`is_beta = 1`) Halı Saha/FIFA akışı `football-v2-match` üzerinden V2 tam maça geçirildi. Basit Mod (`0`) ve Taktiksel Mod (`2`) eski sonuç motorunda kalır.
* Admin panelindeki genel `Beta Testi` düğmesi de Halı Saha/FIFA seçimlerinde V2 tam maçı çalıştırır. `30 sn Lab` teşhis, `Tam Maç V2` doğrudan erişim, Eski Beta ise yalnız `A/B Karşılaştır` referansı olarak korunur.
* `server/simulation/football-v2-rollout.js`, branş/mod/geri dönüş kapısı kararının tek kaynağıdır. `FOOTBALL_V2_BETA_LOBBY=false` dağıtım geri dönüş kapısıdır.

### ✅ Paket 8 — Maç Akışı, Hücum Çeşitliliği ve Canlı Veri

* Gol sonrası akış `goal → goal-celebration → kickoff-setup → kickoff → restart-taken` durum makinesine ayrıldı. Gol olan top sevinç süresince ağ içinde kalır; oyuncular doğrudan santraya ışınlanmaz.
* Santra yerleşiminde iki takımın bütün saha oyuncuları mevki tabanlı başlangıç düzenine alınır. Santrayı kullanacak takım dışında hiçbir saha oyuncusu yanlış yarı alanda kalamaz.
* Duran top ve santra gibi kurallı yerleştirmeler snapshot üzerinde artan `discontinuityId` ve `placementReason` taşır. Oynatıcı bu sınırda ara kare üretmez; eski konumdan yeni yerleşime yalnız yetkili kare geldiğinde keskin geçiş yapar.
* Her top kazanımında merkezi kombinasyon, kanat bindirmesi, ara pası, yön değiştirme, geriye çıkarma, kontra veya yeniden kurulum planlarından biri atanır. Planlar aynı takım için üst üste tekrarı azaltan geçmiş ve süre sınırı taşır.
* Pas olayları `short`, `through`, `cross`, `cutback`, `one-two`, `switch` veya `recycle` niyetini taşır. Pas alıcısı, topsuz görev bölgeleri ve şut sabrı aktif hücum planına göre birlikte değerlendirilir.
* Maç Merkezi artık final `statistics` paketini başlangıçta göstermez. Topa sahip olma, şut, xG, pas, çalım, savunma ve oyuncu notları yalnız oynatma saatine kadar gerçekleşmiş snapshot/olaylardan canlı türetilir; final telemetri maç tamamlandığında açılır.
* Regresyon paketi gol-santra zaman sırası, santra yarı alan bütünlüğü, işaretli yerleşim süreksizliği, hücum planı/pas niyeti çeşitliliği ve aynı seed tekrar üretimini kalıcı kabul kapısına alır.
* 12’şer tam maçlık son kabul örnekleminde Halı Saha `9.08`, FIFA `2.50` ortalama gol üretti. İki branşta da yedi hücum planı ve yedi pas niyeti görüldü; yanlış yarı alan oyuncusu ve açık oyun top süreksizliği `0` kaldı.

## Zorunlu Telemetri

* Işınlanma ve hız/ivme ihlali sayısı
* Oyuncu bazında görev değişimi ve görevde kalma süresi
* Takım genişliği, takım boyu ve hatlar arası mesafe
* Minimum aynı takım/rakip mesafesi
* Geride emniyetsiz ve savunma arkası korumasız süre
* Top çevresindeki oyuncu sayısı ve kümelenme süresi
* Pas mesafesi, pas kanalı baskısı ve gerçek kesişme konumu
* Şut mesafesi, açı, baskı ve xG dağılımı
* Dünya karesi, tarayıcı karesi ve anlatım olayının zaman uyumu

## Dosya Sınırları

* Yetkili dünya: `server/simulation/football-v2-world.js`
* V2 regresyonu: `scripts/test-football-v2-world.js`
* Pasif oynatıcı: `public/js/football-v2-lab.js`
* V2 görünümü: `public/css/football-v2-lab.css`
* Süper Admin API: `POST /api/admin/football-v2-lab`
* Süper Admin A/B API: `POST /api/admin/football-v2-compare`
* Beta Lobi yayını: `football-v2-match`
