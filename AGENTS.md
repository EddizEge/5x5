# 📋 AGENTS.md - 5X5 Simülasyon Savaşları Proje ve Geliştirici Mimarisi

> **Not:** Bu belge, projenin mevcut tüm mimarisini, veritabanı şemasını, sunucu iş kurallarını ve frontend/backend yapılarını detaylandırarak gelecekte projeyi devralacak AI ajanları ve geliştiriciler için eksiksiz bir kaynak olarak hazırlanmıştır.
>
> **Son Güncelleme:** 12 Ağustos 2026 — İlk güvenli GitHub yayını hazırlandı. Temiz kurulum gerçek verileri içermez, yalnız ilk admin hesabını üretir; demo karakterleri `SEED_DEMO_DATA=true` ile isteğe bağlıdır.

---

## 1. 📌 Proje Genel Bakış
**5X5 - Simülasyon Savaşları**, 5 farklı branşta (`League of Legends`, `Valorant`, `Counter-Strike`, `Halı Saha`, `FIFA`) oyuncuların karakter kartları draft ederek takımlarını kurduğu, taktiksel oyun stilleri ve mevki rolleri belirlediği, gerçek zamanlı simülasyon ve canlı maç anlatımı sunan çok oyunculu (multiplayer) bir web uygulamasıdır.

### 1.1 Ürün Kapsamı ve Beta Geliştirme Politikası
* Oyunun ana deneyimi karakter kartı draftı, takım/taktik oluşturma, branş bazlı simülasyon, canlı anlatım ve turnuva puanlamasından oluşur.
* Deneysel simülasyon özellikleri ilk olarak yalnızca **Beta Lobi** (`is_beta = 1`) ve Süper Admin panelindeki **Beta Testi** üzerinden yayınlanır.
* Beta futbol görsel motorundaki değişiklikler Basit Mod veya mevcut klasik sonuç motoruna farkında olmadan sızmamalıdır. Yeni davranışlar `isVisualBeta` kontrolüyle yalıtılmalıdır.
* Beta testlerinde yeterli kararlılık ve oyun dengesi sağlanmadan özellikler Taktiksel Mod veya Basit Mod için genelleştirilmemelidir.

---

## 2. 🛠️ Teknoloji Yığını (Tech Stack)
* **Backend:** Node.js (CommonJS / `require`), Express.js, Socket.io (gerçek zamanlı websocket iletişimi)
* **Database:** SQLite3 (`better-sqlite3`), WAL Mode ve Foreign Key desteği etkin
* **Frontend:** Vanilla JavaScript (SPA Mimarisi), HTML5, Vanilla CSS3 (Dark Gaming & Neon Theme, Glassmorphism, HSL Dinamik Gradientler)
* **Konteynerleştirme:** Docker & Docker Compose (`node:20-alpine`, `/app/data` birim kaydı)

---

## 3. 👥 Sunucu Mimarisi & Kullanıcı Rolleri

### 3.1 Sunucu Ayrımı (Multi-Server Isolation)
Sistemde birbiriyle veri çakışması yaşamayan 2 ana sunucu bulunur:
1. **`OIMSFKTS`** (Klasik Sunucu): Karakterlerin yaş gruplarına göre çoklu dönem kartları (`16 yaş`, `20 yaş`, `24 yaş` vb.) bulunur.
2. **`YENİ SERVER`** (Özel Sunucu): 12 özel karakterden oluşur. Kartlar dönem içermez, tekil `Genel Kart` olarak çalışır.

*Her sunucunun karakterleri, dönemleri, kullanıcıları, lobileri ve genel sohbet mesajları veritabanında `server` sütunu ile tamamen yalıtılmıştır.*

### 3.2 Kullanıcı Yetki Seviyeleri (`is_admin`)
* **`0` - Oyuncu (Normal Player):** Lobilere katılır, oyun kurar, sohbet eder.
* **`2` - Server Admin (Sunucu Yöneticisi):** Sadece kayıtlı olduğu sunucudaki karakterleri, dönemleri ve taktiksel güç değişimlerini yönetebilir. Kullanıcı yönetimine veya simülasyon testlerine erişemez.
* **`1` - Süper Admin (Global Admin):** Tüm sunucular arasında geçiş yapabilir, kullanıcı yetkilerini ve sunucularını değiştirebilir, kullanıcı silebilir, simülasyon testleri çalıştırabilir.

---

## 4. 🗄️ Veritabanı Şeması (`data/5x5.db`)

1. **`users`**: Kullanıcı hesapları. (`id`, `username`, `password_hash`, `display_name`, `is_admin`, `server`, `created_at`)
2. **`characters`**: Karakterler. (`id`, `name`, `avatar_emoji`, `server`)
3. **`character_eras`**: Karakter dönemleri ve ratingleri. (`id`, `character_id`, `age`, `era_label`, `rating_lol`, `rating_valorant`, `rating_cs`, `rating_futbol`, `rating_fifa`)
4. **`character_era_tactics_modifiers`**: Taktik/Rol güç değişimleri. (`id`, `character_era_id`, `branch`, `modifier_key`, `modifier_value`)
5. **`lobbies`**: Oda kayıtları. (`id`, `code`, `status`, `created_by`, `is_beta`, `is_quick`, `server`, `created_at`)
   * `is_beta = 0`: **Basit Mod** (Taktik ve rol seçimi yok, doğrudan simülasyon)
   * `is_beta = 1`: **Beta Lobi** (Deneysel test lobisi)
   * `is_beta = 2`: **Taktiksel Mod** (Taktik stili, rol seçimi ve mevki ayarları)
   * `is_quick = 1`: **Hızlı Oyun**
6. **`lobby_players`**: Lobiye katılan oyuncular. (`id`, `lobby_id`, `user_id`, `is_ready`, `style`)
7. **`draft_picks`**: Seçilen karakter kartları. (`id`, `lobby_id`, `user_id`, `character_era_id`, `pick_order`, `role`)
8. **`tournaments`**: Lobiye ait turnuva. (`id`, `lobby_id`, `status`, `current_branch`, `current_branch_index`)
9. **`matches`**: Maç sonuçları. (`id`, `tournament_id`, `branch`, `player1_id`, `player2_id`, `winner_id`, `result_json`, `played_at`)
10. **`tournament_scores`**: Turnuva puan tablosu. (`id`, `tournament_id`, `user_id`, `branch`, `wins`, `losses`, `rank`, `points`)
11. **`chat_messages`**: Kalıcı sohbet mesajları. (`id`, `type`, `lobby_code`, `server`, `user_id`, `message`, `created_at`)

---

## 5. 🎮 Simülasyon Motoru Mimari Detayları (`server/simulation/`)

### 5.1 Ana Akış (`server/simulation/engine.js`)
* `simulateMatch(team1Data, team2Data, branch, isTactical = false, isVisualBeta = isTactical)`
  * Takımların güç ortalaması hesaplanır.
  * `t1Style` ve `t2Style` okunarak karakter nesnelerine `tacticStyle` olarak eklenir.
  * Taktiksel güç değişimleri (`getTacticalModifier`) hesaplanarak uygulanır.
  * Branşa özel maç akışı `engine.js` içinde çalıştırılır.
  * Her anlatım satırı skor, takım durumu ve isteğe bağlı `visualEvent` nesnesiyle `lines` dizisine eklenir.
  * `isTactical`, rating/taktik değişimlerini; `isVisualBeta`, deneysel görsel futbol olaylarını kontrol eder. Bu iki anlamı yeni kodlarda birbirine karıştırmayın.
  * Yeni çağrı noktalarında beşinci `isVisualBeta` parametresini açıkça geçin. Varsayılan değer geriye dönük uyumluluk için `isTactical` olsa da Taktiksel Modun yanlışlıkla Beta görsel motorunu kullanmaması gerekir.

### 5.2 Özel Olaylar ve Kurallar
* **CS & Valorant:**
  * Skor ve kill yazıları vuran kişinin takım kimliğine (`isTeam1 ? 1 : 2`) göre Mavi (Team 1) ve Kırmızı (Team 2) renklerde basılır.
  * `ACE` ve `PENTAKILL` olayları dinamik neon düşme efektiyle dev pankart olarak basılır.
  * CS maçlarında karakterlerin yanında rol/mevki parantez içinde yazılmaz (`currentBranch === 'cs'` kontrolü vardır).
  * Bomb/Spike patlamalarında ve Ninja Defuse anlarında oyuncunun adı yerine takımdan hayatta kalan rastgele bir karakterin adı yazılır.
  * Beta CS raundlarında kazanan önceden seçilmez. `Dust2RoundDirector.simulateRound()` gerçek görüş teması, kill, bombsite'a fiziksel ulaşım, plant, retake, defuse, patlama ve süre durumundan `world-state` sonucu üretir.
  * Beta CS `round-end` olayları `resolution.source = "world-state"` taşır. Geçerli sonuç nedenleri `elimination`, `time-expired`, `defused` ve `bomb-exploded` değerleridir.
  * Beta CS raundunda yalnızca bir T oyuncusu C4 taşır. Taşıyıcı ölürse bomba öldüğü nav konumuna düşer; yakındaki yaşayan bir T bombayı fiziksel olarak geri almadan plant yapılamaz.
  * Plant yalnızca C4 taşıyıcısı bombsite'a ulaştığında, raund yeterince ilerlediğinde, yakın ve görüşü açık CT tehdidi bulunmadığında ve takım desteği yeterliyken başlayabilir.
  * Plant sonrasında `cs-round-decisions.js` süre, nav rota mesafesi, hayatta kalan sayısı, toplam can, defuse kit ve sis durumundan `retake`, `save` veya nadir `ninja` kararı üretir. Patlama yaklaşırken T oyuncuları ve save kararı alan CT oyuncuları bombadan güvenli rotalara kaçar.
  * Klasik/beta dışı CS akışı geriye dönük uyumluluk için eski sonuç motorunu kullanmaya devam eder; dünya-durumlu deneysel çözüm `isVisualBeta` dışında çalıştırılmamalıdır.
* **Halı Saha (Soccer):**
  * Kaleciler bot olduğu için 5 oyuncu slotu asla `Kaleci` olarak adlandırılmaz.
  * Kadro yapısı **5 karakter + 1 bot kaleci** şeklindedir.
  * **Taktiksel Mevki Dağılımı:**
    * **Defansif:** 3 Defans, 1 Orta Saha, 1 Forvet
    * **Dengeli:** 2 Defans, 2 Orta Saha, 1 Forvet
    * **Ofansif:** 2 Defans, 1 Orta Saha, 2 Forvet
  * Şut kurtarış anlatımında savunma takımındaki bir saha oyuncusu kaleci gibi gösterilmez; **`"... vurdu, [Takım Adı] kalecisi çıkardı! 🧤"`** biçiminde bot kaleciye atıfta bulunulur.
  * Beta Halı Saha, gerçek 11v11 futbolundan bilinçli olarak daha hızlı ve daha gollüdür. Pozisyon aralıkları 1-3 dakika, hücum başına pas sayısı 2-4 aralığındadır.
  * Beta Halı Saha gol olasılığı, FIFA’dan bağımsız ayarlanır. Bu değerleri ortaklaştırmak FIFA skorlarını yapay biçimde yükseltir.
  * Top sahibi dışındaki dört oyuncuya her hücum sekansında benzersiz **genişlik**, **derin koşu**, **yakın destek** ve **geride emniyet** görevi atanır; aynı oyuncu iki alan görevini birden dolduramaz.
  * Geride emniyet oyuncusu top ilerlediğinde topun en az yaklaşık 20 normalize birim gerisinde kalır ve hücum nedeniyle orta çizginin ötesine kontrolsüz taşınmaz. Savunmada yalnızca bir oyuncu baskıya çıkar; örtü, pas yolu ve geride hat görevleri top ile kendi kale arasını korur.
  * Normal şutlar kaleye yaklaşık 22 normalize birim içinde oluşur. 22-27 arası denemeler yalnızca düşük baskı, uygun açı ve yüksek bitiricilik/soğukkanlılıkla çok seyrek üretilen uzak şutlardır; bu şutlara geç maç gol bonusu uygulanmaz.
* **FIFA:**
  * Sahada toplam **11 oyuncu** bulunur.
  * Draft edilen karakterlerin doldurmadığı `GK`, `LB`, `LCB`, `RCB`, `RB`, `LDM`, `RDM`, `LAM`, `CAM`, `RAM`, `ST` mevkileri botlarla tamamlanır.
  * Bot oyuncular görsel olarak karakterlerden daha silik gösterilir; bot kaleci ile karakter futbolcuları karıştırılmamalıdır.

### 5.3 Oyuncu Yetenek Profili (`server/simulation/football-profile.js`)
Kartların mevcut `rating_futbol` veya `rating_fifa` değeri beta motorunda tek başına ve her aksiyona aynı biçimde uygulanmaz. `createFootballProfile(...)`, genel ratingi mevki ve oyuncu kimliğine göre aşağıdaki yeteneklere dönüştürür:

* `passing`: Pas kalitesi ve pasın kesilme ihtimali
* `vision`: Doğru pas seçeneğini bulma ve karar hatasını azaltma
* `dribbling`: Top sürme, çalım ve baskıdan çıkma
* `finishing`: Normal şut, karşı karşıya ve penaltı bitiriciliği
* `defending`: Pas arası, top kesme, müdahale ve blok
* `pace`: Görsel koşu ve aksiyon temposu
* `reaction`: Karar süresi, savunma tepkisi ve topa reaksiyon
* `composure`: Baskı altında pas, şut ve penaltı kalitesi
* `goalkeeping`: Kaleci profili için ayrılmış yetenek

Profil üretim kuralları:

* Genel kart ratingi bütün yeteneklerin ana tabanıdır.
* Forvetler bitiricilik/dripling, orta sahalar pas/görüş, defanslar savunma/reaksiyon bonusu alır.
* Oyuncu kimliğine bağlı, deterministik ve en fazla ±3 puanlık küçük farklılıklar aynı rating/mevkideki kartların tamamen kopya olmasını engeller.
* Yetenekler 20-100 aralığında tutulur; genel takım gücü ayrıca kartın ham branş ratingini kullanır.
* Bu yetenekler veritabanında ayrı sütunlar değildir; mevcut rating ve mevki üzerinden çalışma anında üretilir. İleride admin tarafından özel yetenek override’ı eklenebilir.

### 5.4 İlişkisel Futbol Karar Motoru (`server/simulation/football-ai.js`)
Beta Halı Saha ve FIFA akışında futbolcuların kararları `createFootballIntelligence(...)` tarafından üretilir.

* Her futbolcu için mevki ve takım yönüne göre başlangıç noktası oluşturulur.
* `reactDefenders`: Topun konumuna göre en yakın baskıyı, ikinci savunmacı desteğini ve diğer oyuncuların adam paylaşımını günceller.
* `chooseReceiver`: Boş alan, pas koridoru, ileri kazanım, mevki uyumu, pas alacak oyuncunun reaksiyonu ve pasörün oyun görüşünü birlikte değerlendirir.
* `chooseSupportRun`: Destek koşusu, bindirme, iç koşu ve ceza alanı koşusu üretir.
* `passInterceptionRisk`: Pas koridoru, pas/görüş, alıcının reaksiyon/soğukkanlılığı ve savunmacının savunma/reaksiyon yeteneklerine göre top kaybı ihtimalini hesaplar.
* `passInterceptionPoint`: Başarısız pası alıcıya kadar oynatmak yerine pas çizgisinin %20-%82 aralığındaki ortak kesme noktasında sonlandırır. Takip eden `interception` olayı aynı koordinatı kullanır.
* `dribbleDuel`: Hücumcunun dripling/hız ve savunmacının savunma/reaksiyon yeteneklerini baskı ve mesafeyle birlikte çözer.
* `shotContext`: Şut mesafesi, açı, baskı, hücum kalitesi, bitiricilik ve soğukkanlılık üzerinden xG ile şut uygunluğu üretir.
* `defensiveContext`: Savunmacının top kesme/reaksiyonu ile hücumcunun top kontrolünü karşılaştırarak müdahale, uzaklaştırma ve blok ihtimalini etkiler.
* `breakaway` / `oneOnOne`: Savunma arkasına açık koşu tespit edildiğinde önceden belirlenmiş pas zinciri anında kesilir. Oyuncu gereksiz geri pas vermez; kaleciyle karşı karşıya ilerleyip şutunu çeker.
* Karşı karşıya pozisyonu ikinci bir rastgele top kaybı/uzaklaştırma kontrolüne sokulmaz. Buna rağmen gol garanti değildir; kaleci kurtarışı veya kaçan şut oluşabilir.
* Şutu pas zincirinin sonundaki gerçek top sahibi çeker. Savunmacılar ve kendi yarı sahasındaki oyuncular rastgele şutör seçilmemelidir.

### 5.5 Beta Futbol Olay Modeli
`engine.js`, anlatım satırına ek olarak frontend’in oynatacağı bir `visualEvent` üretir. Başlıca olaylar:

* `pass`: `short`, `through`, `cross`, `cutback`, `one-two`, `switch`, `recycle`
* `support-run`, `dribble`, `counter`
* `interception`, `tackle`, `contain`, `clearance`, `foul`
* `corner`
* `goal`, `save`, `block`, `woodwork`, `miss`

Önemli olay alanları:

* `teamId`, `actor`, `target`, `victim`, `defender`
* `minute`, `second`, `phase`, `lane`
* `fromX`, `fromY`, `toX`, `toY`, `interceptX`, `interceptY`, `tackleX`, `tackleY`, `shotX`, `shotY`, `shotDistance`, `shotProgress`, `shootingZone`
* `pressure`, `buildQuality`, `xg`
* `completed`, `intercepted`, `fromPass`, `fromDribble`, `longRange`, `oneOnOne`, `isPenalty`, `support`, `assist`, `forcedAdvance`, `markTarget`
* `shooterProfile`, `defenderProfile`, `penaltyChance`

Yeni bir olay türü eklenirse hem `engine.js` üreticisi hem `public/js/football-visual.js` oynatıcısı güncellenmelidir. Frontend’in tanımadığı olayların sessizce atlanmaması için admin beta testi yapılmalıdır.

Her oyuncunun maç durumu ayrıca şu bireysel istatistikleri tutar:

* Denenen/tamamlanan pas
* Denenen/başarılı dripling
* Şut/isabetli şut
* Top kesme, müdahale, uzaklaştırma ve blok
* Kullanılan/atılan penaltı
* Gol, asist, faul ve 3.0-10.0 arası maç performans notu
* Kilit pas, oluşturulan pozisyon, büyük pozisyon ve kaçırılan büyük pozisyon
* Oyuncu xG/xA, top kaybı, kaleci kurtarışı ve yenilen gol

### 5.6 Canlı Maç Ratingi ve Detaylı İstatistik Merkezi

Beta Halı Saha ve FIFA maçlarında oyuncular `6.5` başlangıç notuyla başlar; notlar her maç olayı sonrasında yeniden hesaplanır ve `3.0-10.0` aralığında tutulur. Hesap, tek tek elle eklenen puanlardan değil şu beş bileşenin toplamından oluşur:

* **Hücum:** Mevkiye göre ağırlıklandırılmış gol, asist, isabetli şut, gol-xG farkı ve kaçan büyük pozisyon
* **Dağıtım:** Başarılı/başarısız pas, kilit pas ve xA
* **Top kullanımı:** Başarılı/başarısız dripling ve top kaybı
* **Savunma/kaleci:** Müdahale, top kesme, uzaklaştırma, blok, kurtarış ve yenilen gol
* **Disiplin:** Faul, atılan ve kaçırılan penaltı

Halı saha daha kısa sürede ve daha az oyuncuyla daha fazla aksiyon ürettiği için bileşenlere `0.6` olay yoğunluğu katsayısı uygulanır. FIFA `1.0` katsayıyla kalır. Böylece iki branş aynı görünür not ölçeğini kullanırken Halı Sahada 10.0 notu sıradanlaşmaz.

`public/js/football-visual.js` içindeki maç merkezi; topa sahip olma, şut, isabetli şut, xG, başarılı/toplam pas, pas yüzdesi, gerçekleşen-beklenen pas farkı, aksiyon değeri, başarılı/toplam dripling, savunma aksiyonu, büyük pozisyon, korner ve faulü takım bazında canlı gösterir. Alt bölümde her iki takımın oyuncuları güncel nota göre sıralanır; gol, asist, şut, pas yüzdesi, xP farkı, AV, dripling, savunma aksiyonu veya kaleci performansı özetlenir. `ratingBreakdown`, satır bilgi balonunda hesap bileşenlerini açıklamak için taşınır.

### 5.7 Beta Counter-Strike Dust II Görsel Motoru
Counter-Strike görsel beta akışı ilk sürümde yalnızca **Dust II** haritasını kullanır ve `isVisualBeta` ile yalıtılır.

* Dust II zemini ve yürünebilir alan grafiği, Awpy tarafından ayrıştırılmış gerçek CS2 nav verisinden üretilir. `server/simulation/data/dust2-nav.json` toplam 2.248 nav alanını, alan poligonlarını ve bağlantılarını içerir.
* Statik dünya çarpışması Awpy `17595823` paketinden alınan 513.783 üçgenlik `server/simulation/data/de_dust2.tri` ile çözülür. Kaynak, SHA-256 ve üçgen sayısı `de_dust2-collision.json` içinde kayıtlıdır; `scripts/import-dust2-collision.js` yeniden içe aktarma aracıdır.
* `scripts/build-dust2-nav-assets.js`, kaynak `de_dust2.json` ve Awpy `map-data.json` dosyalarından hem çalışma zamanı grafiğini hem `public/assets/shooter/dust2-nav.svg` haritasını yeniden üretir.
* `server/simulation/dust2-navigation.js`, bağlı alanlar üzerinde A* rota üretir. Her hareket noktası gerçek bir nav alanına bağlıdır; ardışık iki nokta aynı veya komşu nav alanında olmalıdır. Görüş ışınları ve alan geçişleri ayrıca `dust2-collision.js` tarafından gerçek üçgenlerle sınanır.
* `server/simulation/shooter-ai.js`, birbirinden ayrılmış Long A, Short, Mid-B ve Tunnels-B T planlarıyla CT savunma yerleşimlerini bu grafikten üretir. Long A, Top Mid'e sapmadan Long Doors üzerinden; Short ise Long alanlarına girmeden Xbox/Short üzerinden ilerler.
* Düz veya düşük eğimli rota adımları gerçek üçgen çarpışma ağından geçmek zorundadır. Yönü normalize edilen nav kenarlarında yüksek ve aşırı dik ters tırmanışlar reddedilir; böylece A Long oyuncuları tek yönlü düşüş kenarını duvarın üzerinden tersine kullanamaz ve gerçek A rampası/stairs zincirine yönelir.
* T tarafı raporla doğrulanan gerçek T Spawn zeminindeki `352, 354, 433, 338, 382`; CT tarafı Short'un altında kalan gerçek alt CT Spawn zeminindeki `1450, 1451, 1644, 1444, 1645` nav alanlarında başlar. Her takımın beş oyuncusu ayrı başlangıç alanına dağıtılır.
* Admin harita raporunda CT Spawn ile Short/A platformu arasındaki duvar üzerinde işaretlenen nav yükselişleri normal yürüyüşe kapalıdır. Bu bağlantılar yalnız gelecekte açıkça modellenen takım boostu tarafından kullanılabilir; A Long oyuncuları gerçek sağ rampayı dolaşır.
* Short hücumu, gerçek T Spawn'dan sağ koridora açılan rapor rotasını izleyerek düz Mid AWP görüş hattından kaçınır. CT `half`, `force`, `full` veya `hero` satın alımındayken düz Mid-B planı seyrekleşir; CT eco olduğunda Mid baskısı yeniden anlamlı bir seçenek olur.
* `server/simulation/cs-dust2-tactical-catalog.js`, admin harita raporlarından doğrulanan beş AWP görüş hattını ve on iki gerçek T smoke/flash/HE/molotof setup'ını tutar. Pit çizimi duvar arkasına tek ışın olarak çevrilmez: Pit gerçek Long açısını, ayrı Long AWP noktası ise site açısını tutar. AWP/SSG 08 görüşü 52 radar birimine ve varsayılan 150 dikey farka kadar gerçek üçgen çarpışmasıyla sınanır; standart silahların 34 birim görüş sınırı değişmez.
* T utility setup'ları `opening`, `execute` ve `postplant` zamanlamalarına ayrılır. Mid geçiş sisi, A rampa/CT sisi, B kapı sisi, A Short kapatma, A site HE/molotof temizliği, Long/B/A rampa/A Short giriş flashları ve B post-plant window/doors flashı yalnız ilgili plan ve fazda envanterden tüketilir.
* CT açılışı raporla doğrulanan Long hızlı pick, Short, B anchor ve Mid tutuşuna dört oyuncu; ekonomi/silah ve plana göre A anchor, B window, ikinci Long veya yalnız SMG/eco koşulundaki Lower rush'a beşinci oyuncuyu yollar. Her görev gerçek nav alanına bağlıdır ve `ctOpeningAssignments` içinde taşınır.
* CT oyuncuları raporla doğrulanan açılış noktalarına yaklaşık 2.2 görsel saniyeden kısa sürede koşar. Doğrudan görüş teması yokken ilk dağılım bitmeden ses, takım çağrısı veya rutin açı kontrolü için durmaz. T oyuncuları da ilk rota bölümünde T Spawn çıkışını tamamlamadan aynı nedenlerle oyalanmaz; sonrasında normal utility, bilgi, execute ve rol kararları yeniden devreye girer.
* CT Long açılış yanıcısı/HE'si, B temas geciktirmesi, B retake flashı ve yalnız iki CT Long oynadığında kullanılan destek flashı sabit sahibine değil uygun açılış görevi ve gerçek envantere bağlanır.
* `server/simulation/shooter-world.js`, raundu 20 Hz sabit adımlı tek yetkili dünya olarak ilerletir. Konum, yön, hız, canlılık, görüş süresi, ses tahmini ve takım çağrısı hafızası aynı durum üzerinde tutulur.
* `server/simulation/cs-weapon-catalog.js` başlangıç tabancaları, ekonomik/force tabancaları, SMG, shotgun, bütçe/tam tüfek ve AWP/SSG 08 sınıflarından toplam 20 silah için taraf, slot, fiyat, kill ödülü, hasar, zırh delme, menzil, hareket isabeti, şarjör, burst ve taktik etiket profillerini tanımlar.
* `server/simulation/cs-economy-rules.js`, para sınırı, yarı başlangıcı, galibiyet/kayıp bonusu, plant/defuse ödülü, Temmuz 2025'te eklenen CT takımına T eliminasyonu başına oyuncu başı 50 dolar ortak ödül, zırh, kit ve utility fiyatlarının tek kaynağıdır.
* `server/simulation/cs-economy.js`, maç boyunca yaşayan oyuncu parası ve envanterini tutar. Her raund `pistol`, `eco`, `half`, `force`, `full` veya `hero` kararıyla birlikte açıklanabilir `reasonCodes`, rakip buy tahmini ve hedef bütçe üretir. Oyuncular AWP/entry/support/lurk/anchor ekonomi rollerine ayrılır; uygun takım arkadaşı AWP oyuncusuna silah drop edebilir. Hayatta kalan ana silah, zırh, kit ve kullanılmamış utility korunur; ölen oyuncu başlangıç tabancasına döner ve 1/13. raundlarda ekonomi sıfırlanır.
* Pistol raundlarında, 12/24. raundlarda, maç puanında ve uzatmada gelecek raunda yatırım/save değeri yoktur. Düşük para `eco`ya düşmez; takım elindeki parayla `force` yapar. Plant sonrasında sayı/mesafe dezavantajı olsa bile `save` seçilmez, CT bomba patlayana kadar retake/defuse girişimini sürdürür.
* `server/simulation/cs-combat.js`, doğrulanmış görüş temasını rating, kalan can, mesafe, davranış, silah profili, kafa vuruşu ve zırh üzerinden deterministik kısa atış serilerine dönüştürür. Tek temas hedefi zorla öldürene kadar sürmez; `damage` olayları kalıcı kısmi HP/zırh hasarını, `kill` olayları ölümle biten seriyi taşır.
* `server/simulation/cs-beta-balance.js`, 5L için T kazanma, plant, defuse, save, utility ve ekonomi kabul aralıklarının tek kaynağıdır. Raporla düzeltilen spawn/rota topolojisi sonrasında güvenli plantı yapay olarak iptal etmemek için plant üst kabul sınırı `0.85`, nadir save alt toleransı `0.008` olarak kalibre edilmiştir.
* `server/simulation/cs-beta-telemetry.js`, Admin Beta Testi ve yayın regresyonu için oran, payload, duvar/görüş, rota dışı konum, plant, çift ölüm ve envanter bütünlüğü özetini üretir.
* `server/simulation/cs-visual-payload.js`, sık shooter olaylarında yalnız değişen veya olayla doğrudan ilişkili oyuncuları taşır; raund başlangıcı, satın alma, defuse girişimi ve raund sonunda tam snapshot korur.
* Raund başlangıcında frontend'e gönderilen `motionPlans` noktaları yalnız oynatıcının kullandığı `t/x/y` alanlarını taşır. `z` ve nav `areaId` sunucudaki doğrulanmış rota ile `positionTimelines` içinde korunur; bu tekrarların istemci payloadına eklenmesi 12.5 MB yayın sınırını aşırmamalıdır.
* `server/simulation/cs-team-tactics.js`, her takımda AWP, entry, support, lurk ve anchor rollerini raundluk tekil görevlere dağıtır. Rol atamaları ekonomi tercihi, silah, utility ve rating bilgisiyle deterministik üretilir.
* Execute girişinde entry ile trade oyuncusu arasındaki mesafe ölçülür. Mesafe 14 birimin üzerindeyse entry bekler ve trade oyuncusu arayı kapatır; execute yalnızca destek mesafesi sağlandığında commit olur.
* Orta raunt çağrıları `rotate`, `regroup` veya `recommit` kararı üretir. Plan değiştiğinde oyuncular yeniden nav rotasına bağlanır; lurk yeni rotasyonu keserken diğer oyuncular site/rally görevini sürdürür.
* CT anchor güvenilir bilgi olmadan erken rotasyona çıkmaz. AWP uzun açı tutar ve atıştan sonra güvenli bir nav noktasına yeniden konumlanır.
* AWP uzun açı görevi yalnız açılış/erken orta raunt içindir. Execute commit olduğunda veya raundun %58'i geçildiğinde yaşayan AWP görüş teması yoksa takımın site hedefine katılır. Plant sonrasında retake/defuse/post-plant görevi eski AWP açısı ve atış-sonrası reposition davranışından daima üstündür.
* Post-plant, retake, ninja ve save görevleri raund rolüne göre yeniden atanır. `roleTaskTimeline` ve `teamTacticsTimeline` görev değişimini, execute durumunu ve entry-trade mesafesini taşır.
* `server/simulation/cs-ground-inventory.js`, ölen oyuncunun ana silahı, kullanılmamış utilitysi ve uygun CT kitini ölüm noktasında tekil dünya nesneleri olarak tutar. Silah kimliği envanter ile zemin arasında atomik taşındığı için aynı silah iki yaşayan oyuncuda bulunamaz ve aynı ölüm ikinci kez drop üretemez.
* Yerdeki ekipman yalnızca yakın oyuncunun görünür rakibi, güçlü son bilgisi veya aktif çatışma/geri çekilme durumu yoksa alınır. Karar silah fiyatını, rol etiketlerini, mevcut ve yerdeki mermiyi, utility kapasitesini ve CT kit uygunluğunu karşılaştırır.
* Yerden alınan ana silahın şarjör/yedek mermisi korunur; hayatta kalan taşıyıcı silahı sonraki raunda aynı mermi durumuyla götürür. `groundInventory` özeti takım başına düşen, geri alınan, korunan ve kaybedilen ekipman değerini taşır.
* C4, `bomb-pickup` akışında ayrı objective nesnesi olarak kalır. Yerdeki silah/ekipman kimlikleri `ground-equipment` türü ve ayrı görsel katman kullandığı için C4 sahipliğiyle çakışmaz.
* C4 taşıyıcısı kesin plant noktasına giderken ölürse plant olayı üretilmez ve bomba öldüğü konuma düşer. Defuse ancak oyuncu görsel yuvarlama payıyla birlikte C4'e fiziksel olarak yeterince yakınsa başlayabilir.
* `server/simulation/cs-sound-intelligence.js`, koşu, yürüme, ateş, reload, utility, C4 düşmesi/geri alınması, plant ve defuse için ayrı duyulma menzili, güven, konum hatası, hafıza süresi ve takım çağrısı gecikmesi tanımlar.
* Ses bilgisi rakibin kesin koordinatını vermez. Duvar, mesafe, oyuncu farkındalığı ve ses türü tahmin hatasını etkiler; birden fazla tutarlı bilgi güveni yükseltirken daha güçlü gerçek bilgi fake tahmini düzeltebilir.
* Görüş veya ses bilgisi bütün takıma anında yayılmaz. Takım çağrıları oyuncudan oyuncuya gecikmeli ve daha düşük güvenle iletilir; ses ya da takım çağrısı tek başına kill yetkisi vermez.
* T oyuncuları uygun zaman, takım desteği ve kalan süre varsa nadiren fake plant sesi üretebilir. CT fake bilgiyi gerçek sanarak araştırabilir veya erken utility kullanabilir; kritik plant süresinde fake denenmez.
* Defuse ve fake defuse aynı ilk ses işaretini üretir. En az bir T oyuncusu sesi doğrudan duyduğunda aktif defuse bilgisi takım çağrısıyla yaşayan tüm T oyuncularına yayılır; görüşünde rakip bulunan oyuncu çatışmayı sürdürür, diğerleri C4'e rota alır. Silah menzilinde C4'ü açıkça gören bir T varken CT defuse'a oturamaz; başladıktan sonra görüş hattı açılırsa defuse tamamlanmadan kesilir ve CT çatışmaya döner.
* Site yaklaşımında görüş teması veya güçlü bilgi yoksa oyuncular `silent-approach` davranışıyla yürür; sessiz adımın duyulma menzili koşudan belirgin biçimde düşüktür.
* Aynı görüş penceresinde takım başına en fazla dört uygun oyuncu çatışmaya katılabilir. Oyuncular aynı hedefe çapraz ateş kurabilir veya görüşlerindeki farklı hedeflere dağılabilir; kill asisti gerçekten daha önce hasar veren takım arkadaşından üretilir.
* Düşük canlı veya tek çatışmada ağır hasar alan oyuncu `retreat` davranışına geçebilir. Kalan can azaldıkça geri çekilme ihtimali artar, isabet ve kafa vuruşu ihtimali kontrollü biçimde düşer; aldığı hasar raund sonuna kadar korunur.
* `server/simulation/cs-bomb-damage.js`, Temmuz 2026 CS2 C4 yenilemesini Dust II nav grafiği üzerinde uygular. Şok dalgası duvarın içinden kuş uçuşu geçmez; bağlı koridor/merdiven rotası boyunca ilerler, yol uzadıkça zayıflar, zırhı ve canı ayrı azaltır ve oyuncuya ulaşma gecikmesi üretir.
* Her oyuncunun rota saati ayrıdır. `advance`, `walk`, `investigate`, `hold`, `peek`, `engage`, `retreat` ve `dead` davranışları bu saatin yönünü/hızını belirler; bekleyen oyuncu ilerlemez, geri çekilen oyuncu güvenli rota üzerinde geriye gider.
* Davranış geçişleri `behaviorTimeline` içinde tick, dünya zamanı, rota zamanı, bilgi kaynağı ve hedefle taşınır. `engage`/`retreat` yalnızca görüş bilgisiyle; `investigate` ise görüş hafızası, ses veya takım çağrısıyla başlayabilir.
* Görsel temas; görüş alanı, menzil, sis ve üçgen çarpışma ışını temizse birikir. Kill olayı ancak gerekli reaksiyon süresi boyunca doğrulanmış görüş bulunduğunda üretilebilir; duvar arkasındaki hedef doğrudan seçilemez.
* Koşu sesi yaklaşık konum üretir, takım çağrısı bu bilgiyi daha düşük güvenle paylaşır ve hafıza zamanla silinir. Ses/hafıza tek başına kill yetkisi vermez.
* Her raundun başlangıcında `round-start` olayı, 5 T ve 5 CT oyuncusunun kararlı kimliklerini, taraflarını, `tickRate = 20`, çarpışma sürümünü ve raunt boyunca süren `motionPlans` dizilerini taşır.
* Görsel olay türleri `buy-phase`, `utility-decision`, `utility`, `damage`, `kill`, `sound-cue`, `mid-round-call`, `equipment-drop`, `ground-pickup`, `bomb-pickup`, `plant`, `tactical-decision`, `bomb-escape`, `defuse`, `explode`, `round-end` ve `economy-summary` olarak üretilir. Olayların tamamında `domain = "shooter"`, `branch = "cs"` ve `map = "dust2"` bulunur.
* Utility yalnızca gerçekten kullanıldığı anda oyuncunun satın alınmış envanterinden tüketilir. Kullanılmaz ve oyuncu hayatta kalırsa sonraki raunda taşınır.
* `cs-utility-decisions.js`; görüş/ses/takım çağrısı güveni, rakip ve takım arkadaşı yoğunluğu, dost flash riski, önceki takım utilitysi, regulation/post-plant fazı ve retake/save kararından `deploy`, `hold` veya `cancel` sonucu üretir.
* Dust II planına göre execute sisi, entry flashı, HE hasarı, rush geciktirme, site temizleme ve retake utilityleri ayrıdır. Takım utilityleri en az altı tick arayla kullanılır; uygun bilgi penceresinde smoke-flash zinciri kurulabilir.
* Sis aktif kaldığı sürede görüş ışınını keser; flash etkilenen oyuncunun körlük süresi boyunca hedef seçmesini engeller; HE mesafeye göre can/zırh hasarı verir; molotof ve yanıcı bomba alan içindeki oyuncuyu hasar vererek güvenli rotaya geri çekilmeye zorlar.
* Smoke süresi görsel duvar saatine değil shooter dünya saatine bağlıdır. Regulation ve post-plant zaman ölçeklerinde yaklaşık 18 mantıksal saniye sürer; görsel efekt ile görüş engeli aynı `activeUntilTick` değerinde sona erer. Smoke hattından çıkan veya smoke bittikten sonra yeniden görülen oyuncu eski görüş önbelleği nedeniyle görünmez kalamaz.
* Patlama kesinleştiğinde hayatta kalan oyuncular yedi saniyelik son kaçış penceresinde mevcut HP/zırhlarına göre güvenli nav hedefi seçer. Yetişemeyen oyuncu C4 şok dalgasından hasar alır veya ölür; `explode.blast` her oyuncu için mesafe, varış gecikmesi, önceki/sonraki HP-zırh ve ölüm sonucunu taşır.
* Raundun son bölümünde yaşayan C4 taşıyıcısı `plant-urgency` davranışıyla bombsite'a sprint rotası alır; güvenli site içindeyken plant kontrolü yeni bir temas olayından önce çözülür ve kritik sürede uzaktaki takım desteği şartı gevşer.
* Plant temposu yalnız son saniye telafisine bırakılmaz. Normal raundda C4 taşıyıcısı raundun yaklaşık ilk çeyreğinden site hedefi ve planter desteği alır. Pistol/eco/mutlaka denenmesi gereken raundlarda objective commit yaklaşık %12'de, plant uygunluk penceresi yaklaşık %20'de açılır; T lurk/AWP bekleyişi ve düşük can retreat'i objective denemesinin önüne geçemez. Mantıksal raund saati 1:55 olarak korunur; tempo hareket ve karar zamanlamasıyla çözülür.
* Oyuncu çarpışması radarın yalnız X/Y izdüşümüne göre çözülmez. Mid/Short ve Tunnels/B gibi üst üste binen katlarda yaklaşık 48 world-unit üzerindeki Z farkı fiziksel çarpışma sayılmaz; aynı kattaki rakipler ise önceki güvenli konumlarına alınarak birbirinin içinden geçemez.
* Orta raunt `regroup`, `rotate` veya `recommit` çağrısı C4 taşıyıcısını kendi konumuna ya da boş bir rally ucuna yönlendiremez. Taşıyıcı için plant nav düğümünde biten rota doğrulanmadan `plant-urgency` objective kilidi kurulmaz; rota başarısızsa aynı bombsite içindeki alternatif erişilebilir plant düğümleri denenir.
* Hareket halindeki oyuncunun kesin `areaId` değeri rota başlangıcında korunur; özellikle Mid/Tunnels gibi üst üste binen katlarda yalnız x/y merkezine göre başka kata yeniden bağlanılmaz. Planter destekçileri aynı merkez çizgisine değil kalıcı oyuncu şeritlerine bağlanır. Dar geçitte sekiz tick boyunca takım arkadaşınca kilitlenen oyuncuya kısa geçiş önceliği verilir; C4 taşıyıcısı takım arkadaşı çarpışmasında daima yol önceliğine sahiptir.
* Plant hedefi sabit bombsite merkezine zorlanmaz; C4 taşıyıcısına gerçek `func_bomb_target` içindeki en yakın erişilebilir plant nav düğümü seçilir. Son süreye daha geniş hareket tamponu bırakılır ve güvenli plant düğümündeki taşıyıcı süre-sonu kontrolünde C4'ü kurar.
* Plant sonrasında yaşayan her T; `site-anchor` veya raporla doğrulanmış Long/Short/Ramp ya da Tunnels/Doors/Window çapraz ateş görevlerinden birini alır. Aynı çaprazın iki oyuncusu ortak `pairId` taşır ve farklı gerçek nav hedeflerine yürür.
* A ve B post-plant hedefleri admin raporundaki gerçek pusma nav alanlarından seçilir. A'daki Pit/Long uzak noktaları yalnız AWP/SSG 08 taşıyan oyuncuya verilir; her pozisyonun baktığı yön üçgen çarpışma ağıyla açık bir ışın olmak zorundadır.
* C4 taşıyıcısı site yaklaşımında yalnız kaldığında entry/support/anchor önceliğiyle bir veya iki oyuncu `escort-planter` görevine çağrılır. Beşinci T ters site'a ayrılmaz; ana execute'a farklı ama birleşen bir koridordan destek verir.
* Post-plantta tek CT kaldığında güvenilir son bilgi gecikmeli takım çağrısıyla paylaşılır. Bilgi C4 çevresindeyse en yakın T site korumasında kalır, uzaktaki lurk/destek oyuncuları `postplant-recall-last-ct` göreviyle site'a döner. Çağrı gönderildikten sonra raporlayan oyuncunun ölmesi önceden söylenmiş bilgiyi iptal etmez.
* Retake kararı alan CT oyuncuları tek bir C4 noktasına yığılmaz. A için Ramp/Short/CT, B için Doors/Tunnels/Mid girişlerinden `defuser`, `entry`, `trade`, `cover` ve `flank` rolleriyle ilerler; trade oyuncusu takip ettiği giriş oyuncusunun kimliğini `followsId` ile taşır.
* Yeterli CT desteği olduğunda defuser kontrollü bir `fake-defuse` planı alabilir. Görsel davranış rozetleri T için `BOMBA`, `ÇAPRAZ`, `LURK`; CT için `GİRİŞ`, `TRADE`, `DESTEK`, `FLANK`, `FAKE` etiketlerini gösterir.
* Bomba kaçışı dünyayı çatışmasız ileri sarmaz. Kaçan T/CT oyuncuları görüş teması kurarsa kalan yedi saniye içinde normal burst, hasar, kill ve asist olayları üretmeye devam eder.
* C4 mantıksal olarak 40 saniye sayar; hızlandırılmış dünya penceresi bu süreye oransal eşlenir. Kitli defuse 5, kitsiz defuse 10 mantıksal saniyedir ve retake/save kararı ulaşım + gerçek defuse süresini bomba süresiyle karşılaştırır.
* Defuse tek seferlik sonuç kontrolü değildir. CT C4'e en fazla 2.2 radar birimi yaklaşıp site içindeki görünür yakın T tehdidi temizlendiğinde `defuse-attempt` başlatır. Defuser işlem boyunca silah kullanamaz; takım arkadaşları `defuse-cover` tutar.
* Defuse sesi bütün yaşayan T oyuncularına güvenilir takım bilgisi olarak yayılır. T'ler `defuse-reaction` ile C4'e en kısa geçerli nav rotasından döner; defuser süre dolmadan öldürülürse işlem kesilir.
* Toplu bomba kaçışı planttan hemen sonra başlamaz. `bomb-escape` yalnızca 40 saniyelik C4 saatinin son 7 mantıksal saniyesinde üretilir; aktif ve zamanında bitebilecek bir defuse varsa oyuncular kaçmak yerine sonucu çatışmayla çözmeye devam eder.
* Tabanca raundu dışındaki raundlarda rota girişine göre bir sis bombası görseli üretilir.
* Bir oyuncu öldükten sonra aynı raundda tekrar öldürülemez veya kill alamaz. C4 patlama/çözme olayı ancak aynı raundda önce `plant` üretildiyse oluşabilir.
* Backend sonuç, skor ve hayatta kalan oyuncuları belirler; frontend yalnızca verilen sonucu animasyonla oynatır.
* Beta dışı ve Taktiksel Mod CS maçlarında shooter `visualEvent` sayısı sıfır kalmalıdır.
* Kill olayları oyuncuları başka koordinata ışınlatmaz. Ölen oyuncu o andaki nav konumunda durur; diğer oyuncular raunt hareketlerini sürdürür.
* Mermi izleri her burst için ayrı SVG çizgisi olarak üretilir ve 420 ms görünür kalır. Erişilebilirlikte azaltılmış hareket tercihi olay sürelerini 1 ms'ye düşürmez; kill feed, C4 plant/patlama ve utility görselleri okunabilir kalır.
* 5L ile dünya, her oyuncunun gerçek `positionTimelines` kaydını tutar. Frontend hareketi bu zaman çizgisinden interpolasyonla oynatır; sonradan rota değiştirme veya geri çekilme geçmiş yolu değiştiremez.
* Ürün olaylarında ağır ses/bilgi/rol debug dizileri gönderilmez. Mekânsal ve taktik regresyonları bunları `includeDebugTelemetry = true` ile açıkça ister.
* `scripts/test-cs-beta-release.js`, çoklu seed denge, deterministik tekrar, beta yalıtımı, kritik bütünlük ve payload bütçesinin final yayın kapısıdır.
* Oynatıcı `public/js/shooter-visual.js`, görünüm stilleri `public/css/shooter-visual.css`, gerçek nav tabanlı harita `public/assets/shooter/dust2-nav.svg` dosyasındadır.
* `server/simulation/seeded-rng.js` ve `simulateMatch(..., { seed })` aynı kadro/seed için aynı sonucu, dünya temaslarını ve görsel olayları tekrar üretir. Admin beta testindeki seed alanı sonuç seed’ini korur.

### 5.8 Simülasyon Hızı ve Yayınlama (Streaming)
* Standart satır yayınlama aralığı `baseDelay = 1200ms` olarak ayarlanmıştır.
* Beta Halı Saha/FIFA görsel yayınında hareketlerin okunabilir kalması için `baseDelay = 1450ms` kullanılır.
* Beta Counter-Strike Dust II görsel yayınında `baseDelay = 1050ms` kullanılır.
* CS görsel oynatıcıda utility kararı/kullanımı, ses bilgisi, mid-round çağrı, yerde ekipman bırakma/alma, C4 pickup, planter/retake kararı ve bomba kaçış bildirimi bilgi katmanıdır; efekt ve yazıları görünür kalırken dünya hareketini global olarak durdurmaz. Beklemeli vurgu yalnız ateş/hasar/kill, utility ile ölüm, C4 patlaması, defuse tamamlanması ve raund geçişi gibi sonuç olaylarında kullanılır. Admin anlatım döngüsü shooter olaylarına ayrıca satır gecikmesi eklemez.
* `activeSpeeds[code]` ile 1x, 2x, 4x hızlandırma desteklenir (`Math.floor(baseDelay / speed)`).
* CS görsel oynatıcısında 1x dünya saati gerçek zaman oranında ilerler. Uzun hareketler sabit bir üst süreye sıkıştırılmaz; yalnızca kullanıcı 2x/4x seçtiğinde hızlanır.
* Beta lobi karşılaşmaları `simulation-match-start`, `simulation-text` ve `simulation-match-end` boyunca aynı tekil `matchSessionId` değerini taşır. İstemci yeni oturum başladığında eski görsel kuyruğu, oyuncu DOM kimliklerini, kill feed'i ve skorları temizler; maç sonu tablosu ancak aynı oturumun görsel kuyruğu tamamen oynatıldıktan sonra güncellenir.
* Hız değişikliği çalışan shooter oynatıcısına anında iletilir. Hareket ilerlemesi her animasyon karesinde güncel hızla dünya saatinden hesaplanır; 20x dahil hızlarda 90/260 ms taban sınırları birikerek eski olayları geride bırakamaz.
* CS anlatım satırı, ilişkili görsel olayın hareketi tamamlanmadan terminale eklenmez. Bu sıra hem gerçek maç akışında hem Admin Beta Testinde korunur.
* Penaltı animasyonları normal olaylardan bağımsız yavaşlatılır:
  * 1x: yaklaşık `1700ms`
  * 2x: yaklaşık `1202ms`
  * 4x: en az `850ms`
* Penaltılar arasında oyuncular yeniden normal saha dizilişine dönmez. Vurucu, kaleciler ve bekleyen oyuncular penaltı yerleşimini korur; normal dizilişe yalnızca seri bittikten sonra geçilir.

### 5.9 Beta Futbol V2 Dripling ve Temas Dünyası

* `server/simulation/football-v2-world.js` içindeki Paket 4 akışı Futbol V2 Admin laboratuvarı, Halı Saha/FIFA Beta Testi ve Beta Lobi tam maçlarında çalışır. Basit Mod ile Taktiksel Mod futbol motorlarını değiştirmez.
* Yetkili top durumları `carried`, `dribble`, `pass` ve `loose` değerleridir. `dribble` sırasında top sahibi bilinmeye devam eder fakat top kendi hız vektörüyle fiziksel olarak oyuncunun önüne gider.
* Top sürme dokunuşları `1.05-1.90` normalize birim aralığındadır. Ardışık yön değişimi oyuncunun dripling profiline göre en fazla `48°` olabilir.
* Saha oyuncularında genel rating ve mevki üzerinden `dribbling`, `defending`, `strength` ve `composure` üretilir. Karakter kimliğine bağlı küçük kararlı farklar aynı ratingli kartların kopya davranmasını engeller.
* Birebir mücadele yalnızca savunmacı, topun aynı dünya adımındaki hareket parçasına fiziksel olarak ulaştığında çözülür. Sonuç `dribble-beat`, `dribble-tackle` veya `shoulder-duel` olabilir.
* Top saklayan oyuncu vücudunu savunmacıyla top arasına koyar. Başarılı çalım savunmacıya kısa `stunned` durumu verir; kaybedilen temas topu gerçek kesişme noktasından sahipsiz bırakır.
* Ağır dripling dokunuşu ve kaybedilen omuz mücadelesinden sonra top eski sahibine bağlanamaz. Yeni sahiplik yalnızca sonraki fiziksel top-oyuncu temasıyla oluşur.
* Paket 4 telemetrisi dokunuş, birebir, başarılı/başarısız çalım, omuz omuza mücadele, top saklama, açılan dokunuş ve azami dönüş açısını taşır.

### 5.10 Beta Futbol V2 Şut ve Kaleci Dünyası

* Paket 5 Futbol V2 Admin laboratuvarı, Halı Saha/FIFA Beta Testi ve Beta Lobi tam maçlarında çalışır. Basit Mod ve Taktiksel Mod şut/kaleci motorları değiştirilmez; Eski Beta yalnız A/B referansında korunur.
* Yetkili top durumlarına `shot`, `keeper-held` ve `dead` eklenmiştir. Tarayıcı şut sonucu, skor veya kaleci kararı üretmez.
* Şut faydası mesafe, açı, baskı, şut koridoru, kaleci konumu, `finishing` ve `composure` üzerinden hesaplanır. Halı Saha azami şut mesafesi `33`, FIFA azami şut mesafesi `30` normalize birimdir.
* Hedef sapması bitiricilik, baskı ve mesafeden doğar. Şut sonucu önceden seçilmez; savunmacı, kaleci, direk ve kale çizgisi fiziksel top hareketi üzerinde sırayla çözülür.
* Savunmacı blok yarıçapına ulaşırsa top gerçek kesişme noktasından sahipsiz kalır. Kaleci branşa özel fiziksel erişim alanında topu tutabilir veya sektirebilir.
* Kaleci kararları `line`, `set`, `close-angle` ve `shot-track` değerleridir. Tutuşta top `keeper-held` olur; kısa beklemeden sonra güvenli takım arkadaşına fiziksel pasla dağıtılır.
* Direkten dönen top çizgi önündeki gerçek konumundan ters hızla oyuna döner. Gol yalnızca top kale ağzı içinde sol çizgide `x < 0`, sağ çizgide `x > 100` olduğunda skora eklenir.
* Snapshot `score` ve `goalkeeperDecision`; kadro `finishing` ve `goalkeeping` profillerini taşır. Telemetri şut, isabet, xG, gol, kurtarış, tutuş, sektirme, blok, aut, direk ve şut mesafelerini içerir.

### 5.11 Beta Futbol V2 Maç Kuralları ve İstatistik Dünyası

* Paket 6 kuralları Paket 7/8 tam maçında da kullanılır; güncel dünya sürümü `football-v2-lab-10` değerindedir. Basit ve Taktiksel futbol motorları değiştirilmez.
* Top saha sınırında geri sekmez. Son fiziksel dokunuş ve çıkış çizgisine göre `throw-in`, `corner` veya `goal-kick` kararı verilir.
* `dead` top durumu `restartKind`, kullanacak takım, fiziksel konum, seçilen vurucu ve en erken kullanım tick’ini taşır. Vurucu duran top noktasına koşmadan top tekrar oyuna girmez.
* Gol sonrasında rakip takım merkezden `kickoff` kullanır. Korner, taç, kale vuruşu ve serbest vuruş gerçek bir `restart-taken` sonrasında fiziksel pas veya uygun serbest vuruş şutuna dönüşür.
* Dripling düellosundaki geç ve başarısız temas `foul` üretebilir. Konum savunan takımın ceza alanındaysa `penalty`, değilse `free-kick` verilir. Penaltı ayrı bir fiziksel `shot` olayıdır ve `isPenalty = true` taşır.
* Duran top ve faul rastgeleliği ana hareket RNG akışından ayrılmış `rulesRng` kullanır. Aynı seed aynı kural ve dünya sonucunu tekrar üretir.
* `server/simulation/football-v2-stats.js`, tamamlanmış dünya olaylarından takım ve oyuncu istatistiklerini üretir. Tarayıcı gol, asist, xG/xA, pas, çalım, savunma veya maç notu için yeniden zar atmaz.
* Tamamlanan pasın sekiz saniye içinde şuta dönüşmesi pasöre kilit pas ve şut xG’si kadar xA yazar; gol olursa penaltı dışındaki son uygun pas asist olur.
* Oyuncu notu `6.5` tabanından hücum, dağıtım, top kullanımı, savunma/kaleci ve disiplin bileşenleriyle hesaplanır; `ratingBreakdown` ile birlikte `3.0-10.0` aralığında tutulur.
* `statistics.teams` topa sahip olma, şut/isabet, xG, pas, çalım, savunma, korner/taç ve faulü; `statistics.players` gol/asist, xG/xA, pas, çalım, savunma, kaleci ve maç notunu taşır.
* `commentary`, yalnızca tamamlanmış önemli dünya olaylarından türetilir; gol anlatımı top çizgiyi geçmeden, duran top anlatımı sınır/temas kararı oluşmadan üretilemez.
* 48’er adet 60 saniyelik Halı Saha/FIFA kural kalibrasyonunda toplam `234` duran top kullanıldı; ışınlanma, top süreksizliği ve geçersiz sahiplik iki branşta da `0` kaldı.

### 5.12 Beta Futbol V2 Tam Maç ve Geçiş

* `simulateFootballV2Lab(...)`, `mode = "lab"` ile 30 saniyelik 10 Hz laboratuvarı; `mode = "full"` ile Halı Saha için 50, FIFA için 90 maç dakikalık tam akışı üretir.
* Yetkili dünya her iki modda 20 Hz kalır. Tam maç ağ yükünü sınırlamak için snapshot yayını `adaptive-3hz-full` stratejisiyle 3 Hz’e düşer; tarayıcı yine yalnız kareler arasında interpolasyon yapar.
* Tam skor dağılımı için Halı Saha dünyası 570, FIFA dünyası 330 fizik saniyesi simüle eder. Bunlar okunabilir oynatma için sırasıyla 240 ve 180 görsel saniyeye ölçeklenir; maç saati yine 50/90 dakikayı gösterir.
* `measurePerformance = true` üretim süresi, heap farkı, snapshot/olay/istatistik baytları ve tahmini toplam payload ölçümünü `performance` alanında döndürür.
* Süper Admin panelinde `30 sn Lab`, `Tam Maç V2` ve `A/B Karşılaştır` düğmeleri bulunur. Genel `Beta Testi` düğmesi Halı Saha/FIFA seçiliyken doğrudan V2 tam maça yönlenir. `POST /api/admin/football-v2-compare`, aynı sunucu, kadro ve seed ile Eski Beta ve V2 tam maçı çalıştırır.
* Beta Lobi (`is_beta = 1`) Halı Saha/FIFA maçları `football-v2-match` Socket.io olayıyla tam V2 snapshot paketini alır. Sonuç ve istatistik sunucuda üretilir; final telemetri/maç merkezi canlı oynatma bitene kadar gizlidir.
* Geçiş yalnız Beta Lobi futbol branşlarında açıktır. `FOOTBALL_V2_BETA_LOBBY=false` acil geri dönüş kapısıdır. Basit Mod (`0`) ve Taktiksel Mod (`2`) daima eski `simulateMatch(...)` akışını kullanır.
* 90 dakikalık FIFA regresyonunda 541 snapshot ve 1.207 olay yaklaşık `3.65 MB` tahmini payload, Docker içinde yaklaşık `1.15 sn` üretim süresi ve sıfır ışınlanma/top süreksizliği ile ölçüldü.
* 24’er tam maçlık eşit rating kalibrasyonunda Halı Saha `9.25` ortalama gol ve `%45.8` 10+ gol oranı; FIFA `2.54` ortalama gol üretti. Golsüz maç oranı sırasıyla `%0` ve `%4.2`, ışınlanma/top süreksizliği `0` kaldı.

### 5.13 Beta Futbol V2 Paket 8 Maç Akışı ve Hücum Direktörü

* Dünya sürümü `football-v2-lab-10` değerindedir. Gol sonrası top önce ağda `goal-celebration` durumunda kalır, sonra bütün oyuncular `kickoff-setup` dizilişine alınır; ayrı `kickoff` olayı ve bekleme sonrasında `restart-taken` ile oyun başlar.
* Santra dizilişi oyuncuların doğal mevki sırasını korur ve iki takımın saha oyuncularını kendi yarı alanında tutar. `kickoffWrongHalfPlayers` kabul telemetrisi sıfır olmalıdır.
* Kurallı yerleşimler snapshot topunda `discontinuityId` ve `placementReason` taşır. Bu işaretli sıçramalar açık oyun `ballDiscontinuities` ölçümüne dahil edilmez; frontend bu sınırda interpolasyon yapmaz.
* Top kazanımında yedi planlı hücum tipinden biri seçilir: `central-combination`, `wide-overlap`, `through-ball`, `switch-play`, `cutback`, `counter`, `recycle`. Plan aynı takımın yakın geçmişi ve saha bağlamıyla ağırlıklandırılır.
* Her pas olayı `short`, `through`, `cross`, `cutback`, `one-two`, `switch` veya `recycle` niyeti taşır. Alıcı puanı ve hücum görev bölgeleri seçili plana göre değişir; hücum henüz kurulmadan düşük nitelikli şuta acele edilmez.
* Maç Merkezi başlangıçta final veriyi kullanmaz. Canlı oynatma saatine kadar gelen snapshot ve olaylar tarayıcıda aynı istatistik kurallarıyla azaltılır; oyuncular 6.5 notla başlar, skor ve performans yalnız gerçekleşen olaylarla değişir.
* Final teşhis telemetrisi oynatma tamamlanana kadar skor/aksiyon sonucunu göstermez. Basit Mod, Taktiksel Mod ve Beta CS akışları değiştirilmez; Eski Beta futbol akışı yalnız Admin A/B karşılaştırma referansı olarak tutulur.
* 12’şer tam maçlık Paket 8 kabul örnekleminde Halı Saha `9.08`, FIFA `2.50` ortalama gol; her iki branşta yedi hücum planı ve yedi pas niyeti üretildi. Yanlış yarı alan oyuncusu ve açık oyun top süreksizliği `0` kaldı.

---

## 6. 🎨 Frontend Mimarisi (`public/`)

### 6.1 Modüller:
* **`public/index.html`**: SPA kapsayıcısı ve script önbellek temizleme. Güncel futbol görsel JavaScript sürümü `?v=74`, Futbol V2 JavaScript sürümü `?v=12`, Futbol V2 CSS sürümü `?v=9`, admin JavaScript sürümü `?v=83`, API JavaScript sürümü `?v=66`, oyun JavaScript sürümü `?v=64`, app JavaScript sürümü `?v=63`, ana CSS sürümü `?v=44` değerindedir.
* **`public/js/api.js`**: REST API istemcisi, JWT token ile yetkilendirme.
* **`public/js/auth.js`**: Giriş ve kayıt ekranları.
* **`public/js/lobby.js`**:
  * Dashboard Kartları: **Basit Mod**, **Taktiksel Mod** (`YENİ` animasyonlu neon rozetli), **Beta Lobisi**, **Lobiye Katıl** (Hizalanmış dikey blok).
  * Lobi içi görünüm, bot ekleme ve oyuncu listesi.
* **`public/js/game.js`**: Draft aşaması, taktik konfigürasyon paneli (Nihai güçler `🔒 Gizli`), simülasyon terminali ve canlı skor tabloları.
* **`public/js/football-visual.js`**:
  * Beta Halı Saha ve FIFA için saha, oyuncu, top ve olay animasyonlarını çalıştırır.
  * Takım şekli, topsuz koşu, pres, markaj, müdahale, dripling, pas, şut, kurtarış ve duran top görsellerini yönetir.
  * `shape-update` olayları genişlik, savunma arkası koşu, yakın destek ve geride denge hedeflerini maç boyunca kalıcı topsuz görevler olarak oynatır.
  * Halı Saha alan görevleri tek seferlik sabit koordinatlar değildir; topun canlı konumuna göre her karede yeniden deforme edilir. Yerleşim olayları oyuncuyu hedefe kilitleyen sert hareket override'ı kullanmaz; ivmeli yönelim, ayrışma ve takım derinliği kısıtı birlikte çalışır.
  * Pas sonrası top sahibi değiştiğinde hücumun dört ve savunmanın beş alan görevi mevcut konum maliyetine göre yeniden ve benzersiz dağıtılır. Küçük rol devamlılığı maliyeti, iki oyuncunun aynı hedefe gitmesini önlerken gereksiz rol titremesini azaltır.
  * `defensive-shape` olayları savunmayı tek bir birinci baskıcı, bir ikinci savunmacı, pas yolu kapatıcıları ve geride kalan hat olarak yerleştirir; görevler top hareketine farklı oranlarda tepki verir.
  * Canlı konum çözücüsü aynı takımdaki saha oyuncularını Halı Saha’da en az yaklaşık `6.15`, FIFA’da `4.4` normalize birim ayırır; hücum ve savunma için ayrı minimum takım genişliği uygular.
  * Karşı karşıya pozisyonunda savunmacı hücumcunun önüne ışınlanmaz; geriden takip eder ve faz etiketi `KARŞI KARŞIYA` olur.
  * Karakterlerin genel ratingi saha üzerinde küçük bir rozetle gösterilir. 85+ rating altın vurgulu, 60 altı rating daha soluk görünür.
  * `pace`, `reaction`, `dribbling`, `passing` ve `finishing` profilleri koşu hızı, yön değiştirme, karar aralığı, top sürme mesafesi, pas ve şut temposuna kontrollü biçimde yansır.
  * Oyuncu üzerine gelindiğinde genel rating, temel yetenek profili ve güncel maç performansı (gol, asist, pas, çalım, müdahale) görüntülenir.
  * Başarısız pas topu alıcıya götürmez; top ortak kesme noktasında durur, savunmacı o noktaya ulaşır ve `interception` olayı topu geri ışınlatmadan sahipliği devralır.
  * Şutör, backend’in verdiği `shotX/shotY` noktasına ulaşmadan vuramaz. Normal şutlar tehlikeli bölgede üretilir; nitelikli ve baskısız oyuncuların ceza sahası dışı denemeleri seyrek `longRange` olayıdır.
  * Kaçan şutlar korner bayrağına yönelmez; direğin makul ölçüde dışından auta çıkar.
  * Gol olan şutlarda top kale çizgisinde durmaz; sağ kalede `x = 100.9`, sol kalede `x = -0.9` noktasına ilerleyerek file içine yerleşir.
  * `FootballMatchViewer.render(...)` HTML yapısını, `FootballMatchViewer.mount(...)` oynatıcı örneğini üretir.
* **`public/js/football-v2-lab.js`**:
  * Beta Futbol V2 Paket 1-8 için Halı Saha 5+1 ve FIFA 11v11 laboratuvar/tam maç hareket, savunma, top fiziği, dripling, temas, şut, kaleci, maç kuralı ve istatistik akışını oynatır.
  * Karar veya hedef üretmez; sunucunun 20 Hz yetkili dünyasından kaydedilmiş laboratuvarda 10 Hz, tam maçta 3 Hz kareler arasında yalnızca görsel interpolasyon yapar.
  * Görev bölgeleri, hız vektörleri, takım fazı, dünya olayları ve gerçek karelerden hesaplanan telemetriyi gösterir.
  * Telemetri; oyuncu bazlı rol değişimi/görev süresi, takım genişliği-boyu, kümelenme, geride emniyet ve savunma korumasını kapsar.
  * FIFA kadrosunda her takım beş karakter, beş silik saha botu ve bir bot kaleciden oluşur; 11 mevkinin tamamı saha üzerinde etiketlenir.
  * Paket 2 debug görünümünde baskı, kademe, orta/savunma hattı oyuncularının `markTargetId` sorumluluğu hedef mevki koduyla gösterilir; gerçek oyuncu değişimleri `DEVİR` olayıdır.
  * Paket 3 görünümünde `pass` topu mavi, `loose` top turuncu vurguyla gösterilir; ilk kontrol, ağır dokunuş, sekme ve boşa çıkan pas olay paneline eklenir.
  * Paket 3 telemetrisi pas isabeti, pas boyu, pas arası, sekme, kontrol hatası, sahipsiz top, azami top hızı ve top/sahiplik süreksizliğini gösterir.
  * Paket 4 görünümünde `dribble` topu yeşil, top saklayan oyuncu amber vurguyla gösterilir; dokunuş, çalım, top kapma, omuz omuza mücadele ve açılan top olayları canlı panelde görünür.
  * Oyuncu bilgi balonu rating yanında dripling, savunma ve güç profilini gösterir. Telemetri başarılı/başarısız çalım, düello, omuz omuza mücadele, top saklama ve dönüş sınırını raporlar.
  * Paket 5 görünümünde canlı skor başlıkta gösterilir; `shot` topu sarı, `keeper-held` top camgöbeği ve şut takip eden kaleci camgöbeği çerçeveyle vurgulanır.
  * Şut, kurtarış, sektirme, blok, aut, direk, gol, kaleci kararı ve dağıtım olay panelinde görünür. Oyuncu bilgi balonu bitiricilik/kalecilik profilini gösterir.
  * Paket 5 telemetrisi şut/isabet, xG, gol, gerçek kurtarış, dışarı giden topu toplama, tutuş/sektirme, blok, aut/direk, şut mesafesi ve kaleci kararlarını raporlar. Kaleyi bulmayan topun kaleci tarafından kontrol edilmesi `keeper-claim` olayıdır ve kurtarış sayılmaz.
  * Paket 6 görünümünde `FAUL`, `SERBEST VURUŞ`, `PENALTI`, `KORNER`, `TAÇ`, `KALE VURUŞU`, `SANTRA` ve `OYUNA GİRDİ` olayları gösterilir. `dead` top etiketi beklenen duran top türünü taşır.
  * Maç Merkezi iki takımın topa sahip olma, şut, xG, pas, çalım, savunma, korner/taç ve faul özetini; oyuncu tablosu maç notu, gol/asist, şut, xG/xA, pas, çalım, savunma ve kaleci istatistiğini okunabilir satırlarda gösterir.
  * Oyuncu bilgi balonu temel profil yanında final maç notunu, gol/asisti ve xG/xA değerini gösterir. FIFA botları tabloda `BOT` etiketi ve daha silik görünümle ayrılır.
  * Paket 8 yerleşim sınırlarında `discontinuityId` değişimini izler; gol sonrası ağ, sevinç ve santra dizilişi arasında hayali ara koşu üretmez.
  * Maç Merkezi ve oyuncu bilgi balonları final istatistiği önceden göstermez; yalnız o ana kadar oynatılmış olaylardan türetilen canlı skor, istatistik ve notları kullanır.
* **`public/js/shooter-visual.js`**:
  * Beta CS için Dust II haritasını, kesintisiz rota hareketini, kill/plant/defuse/patlama olaylarını ve silah-can-zırh-mermi durumunu oynatır.
  * Ana okunabilirlik önceliği skor/raunt HUD'ı, haritadaki oyuncu etiketleri, anlık olay şeridi, kill feed ve kadro panelidir. Alttaki uzun maç anlatımı ikincil tutulur ve daha kısa bir panelde gösterilir.
  * Kadro satırları raund rolünü ve oyuncunun güncel faz görevini ayrı rozetlerle gösterir. Harita jetonlarında execute, trade, lurk, anchor, AWP ve IGL orta-raunt çağrıları okunabilir kısa etiketlerle görünür.
* **`public/js/shooter-visual.js`**:
  * Beta Counter-Strike için gerçek nav alanlarından üretilmiş Dust II kuşbakışı haritasını, 5v5 oyuncu jetonlarını, hareketleri, mermi izlerini ve sis bombalarını oynatır.
  * A/B plant alanları güncel Valve `de_dust2.vpk` içindeki `func_bomb_target` hacimlerinden üretilen gerçek radar poligonlarıdır. C4 yalnızca bu poligonların içindeki yürünebilir zemin nav düğümlerine kurulabilir.
  * Oyuncu konumları `requestAnimationFrame` ile süreli nav noktaları arasında doğrusal interpolasyonla güncellenir. Dünya saati olay saatine kadar oynatılır; anlatım bu hareket tamamlandıktan sonra ilerler.
  * `AÇI`, `PEEK`, `TEMAS`, `ARAŞTIR` ve `GERİ` rozetleri davranış zaman çizelgesinden gösterilir. CT açı tutarken geliş yönüne, bilgi alan oyuncu ise son bilinen rakip noktasına bakar.
  * Ölen oyuncunun hareketi o anda durur; hayatta kalanlar rota planlarını sürdürür.
* Kill feed, hayatta kalan oyuncu sayaçları, C4 kurma/çözme/patlama durumu ve raund sonucu aynı görsel yüzeyde gösterilir.
  * Oyuncu jetonları ve kadro satırları aktif silah, şarjör, can ve zırh durumunu gösterir; çatışmada burst atışları, hasar sayıları ve kafa vuruşu geri bildirimi oynatılır.
  * Ölümle bitmeyen atış serileri HP barını kalıcı günceller; çapraz ateş olayında birden fazla gerçek katılımcının tracer ve hasar sırası oynatılır.
  * C4 patlamasında şok dalgası merkezden yayılır; oyunculara nav yayılım gecikmesi sırasıyla hasar uygulanır ve öldürücü alanda kalanlar harita/kadro üzerinde ölür.
  * `ShooterMatchViewer.render(...)` HTML yapısını, `ShooterMatchViewer.mount(...)` oynatıcı örneğini üretir.
* **`public/js/admin.js`**:
  * **Karakterler & Dönemler:** Karakter kartları ve HSL zümrüt gradient güç barları (80-100 arası koyulaşan).
  * **Kullanıcı Yönetimi:** Kullanıcı rolleri ve sunucu değiştirme dropdownları, cascade kullanıcı silme.
  * **📊 Taktiksel Değişimler:** Branş bazlı rol ve stil güç puanı düzenleyici.
  * **🧪 Simülasyon Testi:** Normal `Testi Başlat` yanında `Beta Testi` ile beta görsel motorunu doğrudan çalıştırır; test için tam lobi kurmak gerekmez.
  * Halı Saha veya FIFA seçildiğinde `Futbol V2 Lab` düğmesi, mevcut Beta motorunu değiştirmeden branşa özel tek dünya durumlu hareket laboratuvarını başlatır.
* **`public/js/app.js`**: SPA yönlendiricisi, Socket.io event dinleyicileri, sohbet penceresi görünürlük mantığı (`updateChatVisibility`).

### 6.2 Sohbet Mantığı (Persistent Chat)
* **`Genel Sohbet`**: Ana sayfada ve admin panelinde aktif.
* **`Oyun Sohbeti`**: Sadece lobi odalarında ve maç simülasyonu ekranlarında aktif. Admin panelinde ve dashboard'da otomatik gizlenir.
* Tüm mesajlar `chat_messages` tablosunda saklanır, sunucu yeniden başlatılsa dahi kaybolmaz.

---

## 7. 🛠️ Çalıştırma ve Docker

```bash
# Docker kapsayıcılarını derle ve arka planda çalıştır
docker compose up --build -d

# Logları canlı izle
docker logs 5x5-game --tail 50 -f
```

### 7.1 Futbol Simülasyonu Hızlı Test Akışı
1. Süper Admin hesabıyla giriş yapın.
2. **Admin Paneli → Simülasyon Testi** sekmesini açın.
3. Branş olarak **Halı Saha** veya **FIFA** seçin.
4. **Beta Testi** düğmesine basın.
5. Gerekirse 1x, 2x veya 4x hız seçenekleriyle akışı gözlemleyin.
6. Genel sohbet penceresi test düğmelerini veya saha alanını kapatıyorsa başlığına tıklayarak küçültün.

Kontrol edilmesi gereken görsel davranışlar:

* Top sahibi değiştiğinde top doğru oyuncuya bağlanıyor mu?
* Savunma, topa baskı yaparken takım şeklini tamamen bozuyor mu?
* Destek koşuları ve markaj aynı anda görülebiliyor mu?
* Açık oyuncu kaleciyle karşı karşıya kaldığında geri pas yerine şut çekiyor mu?
* Gol olan top çizgiyi geçerek gerçekten ağın içine giriyor mu?
* Penaltı vuruşları takip edilebilir hızda mı ve oyuncular seri boyunca penaltı düzeninde kalıyor mu?

### 7.2 Counter-Strike Dust II Beta Hızlı Test Akışı
1. Süper Admin hesabıyla giriş yapın.
2. **Admin Paneli → Simülasyon Testi** sekmesini açın.
3. Branş olarak **Counter-Strike** seçin.
4. İstenirse seed alanına sabit bir değer yazın; boş bırakılırsa üretilen seed sonuçtan sonra alanda görünür.
5. **Beta Testi** düğmesine basın.
6. Aynı seed ile ikinci kez çalıştırıp aynı akışı aldığınızı doğrulayın.
7. 1x, 2x veya 4x hızda oyuncu hareketlerini, çatışmaları ve C4 akışını gözlemleyin.

Kontrol edilmesi gereken görsel davranışlar:

* Harita başlığında ve olaylarda yalnızca Dust II kullanılıyor mu?
* Raund başlangıcında iki takım da beşer oyuncuyla doğru spawn tarafında görünüyor mu?
* Kill alan ve ölen oyuncu harita, kadro ve kill feed üzerinde aynı anda güncelleniyor mu?
* Kill anında `LOS ✓`, mesafe ve görüş süresi etiketi gösteriliyor mu?
* Oyuncular duvarın içinden geçmeden ve duvar arkasındaki rakibi doğrudan vurmadan rotalarını sürdürüyor mu?
* Ölümle sonuçlanmayan çatışmada hasar alan oyuncunun HP'si sonraki temaslarda korunuyor mu ve düşük canlı oyuncu geri çekilebiliyor mu?
* Birden fazla oyuncu aynı anda görüş aldığında çapraz ateşe katılıyor mu; sistem tek bir 1v1 çiftine kilitleniyor mu?
* C4 kurulduktan sonra çözme veya patlama olayı doğru bomba bölgesinde gösteriliyor mu?
* Long A yaklaşımı tek yönlü düşüş duvarını tersine tırmanmadan A Ramp üzerinden ilerliyor mu ve CT oyuncuları beş ayrı spawn noktasında mı başlıyor?
* Son süreye girildiğinde C4 taşıyıcısı `PLANT` önceliği alıyor mu; güvenli alanda oyalanmadan kuruyor mu?
* Kaçış sırasında karşılaşan oyuncular ateş etmeye devam ediyor mu ve görüşü açık T baskısı varken CT uzaktan/otomatik defuse alamıyor mu?
* Patlama kesinleştiğinde oyuncular yedi saniyelik kaçış rotası seçiyor mu; yetişemeyenler şok dalgasından doğru HP/zırh hasarını alıyor veya ölüyor mu?
* Tabanca raundu dışındaki raundlarda rota girişindeki sis bombası görünüyor ve raund sonunda temizleniyor mu?
* Mobil görünüm tek sütuna düşüyor ve yatay taşma oluşturmuyor mu?

---

## 8. 💡 Gelecek Geliştiriciler İçin Önemli Kurallar & Notlar

1. **Script Önbelleği (Cache-Busting):** Frontend JavaScript dosyalarında herhangi bir değişiklik yaptığınızda `public/index.html` dosyasındaki `?v=XX` versiyon numarasını mutlaka artırın.
2. **Kullanıcı Silme (Cascade Delete):** Bir kullanıcı silindiğinde bağımlı `matches`, `tournament_scores`, `draft_picks`, `lobby_players` ve kullanıcının kurduğu `lobbies` kayıtları veritabanı bütünlüğünü korumak için cascade olarak temizlenir. `server/routes/admin.js` içindeki transaction yapısına sadık kalın.
3. **Sunucu Yalıtımı (Server Isolation):** Yeni bir API uç noktası veya Socket.io olayı eklerken kullanıcının `server` bilgisini (`OIMSFKTS` vs `YENİ SERVER`) sorgulara dahil ettiğinizden emin olun.
4. **Beta Yalıtımı:** Deneysel futbol ve shooter davranışlarını `isVisualBeta` dışına taşımayın. Basit Mod, Taktiksel Mod ve diğer beta dışı akışlarda ilgili `visualEvent` sayısının sıfır kaldığını regresyon testinde doğrulayın.
5. **Karar Motoru Bütünlüğü:** Açık şut/karşı karşıya kararı oluştuğunda oyuncuyu sabit bir pas sayısını tamamlamaya zorlamayın. `immediateChance` mantığını koruyun.
6. **Mevki Bütünlüğü:** Savunmacılar rastgele final vuruşçusu yapılmamalı; şutörün mevki bandı ve saha ilerlemesi `shotContext` tarafından doğrulanmalıdır.
7. **Halı Saha ve FIFA’yı Ayrı Ayarlama:** Pozisyon sıklığı, pas aralığı, müdahale riski ve xG sabitlerini branş bazında koruyun. Halı saha için yapılan gol artışı FIFA’ya taşmamalıdır.
8. **Görsel ve Sonuç Senkronu:** Gol, kurtarış, blok ve kaçan şut sonucu backend’de belirlendikten sonra frontend bunu değiştirmemelidir. Görsel oynatıcı yalnızca verilen sonucu canlandırır.
9. **Koordinat Güvenliği:** Normal saha hareketlerinde koordinatları güvenli saha aralığında tutun. Yalnızca gol topunun ağ içine girmesi için kontrollü olarak `x < 0` veya `x > 100` kullanılabilir.
10. **Geçici QA Verileri:** Test için oluşturulan kullanıcıları işlem sonunda bağımlı lobi, maç, draft, skor ve sohbet kayıtları olmadığını doğruladıktan sonra temizleyin.
11. **Çifte Rating Uygulamayın:** Sonuç motoru yetenek profilini kullanırken frontend yalnızca hareketi görselleştirmelidir. Görsel oynatıcı sonucu tekrar zar atmamalı veya yüksek ratinge ikinci kez gol avantajı vermemelidir.
12. **Maç Notu Bütünlüğü:** Kaleci kurtarışı bot kaleciye, blok savunmacıya, pas/dripling aksiyonu gerçek top sahibine yazılmalıdır. Rastgele en yakın oyuncuya performans puanı vermeyin.
13. **CS Nav Bütünlüğü:** Beta CS hareketinde doğrudan serbest `x/y` hedeflerine CSS geçişi eklemeyin. Yeni rotalar `dust2-navigation.js` üzerinden üretilmeli ve `validateMotion` ile her ardışık alan bağlantısı doğrulanmalıdır.
14. **CS Ekonomi Yol Haritası:** Ekonomi ve mağaza sistemi için kabul edilen plan `docs/cs-economy-shop-plan.md` dosyasındadır. Para kuralları, katalog, envanter ve satın alma karar motoru ayrı modüller olarak Beta CS içinde geliştirilmelidir.
15. **CS Çarpışma Varlığı:** `de_dust2.tri` çalışma zamanı için zorunludur. Eksik dosyada nav tabanlı geliştirme geri dönüşü olsa da yayın/regresyon testi `collisionMesh = true` olmayan kill kabul etmemelidir.
16. **Seed Bütünlüğü:** Deterministik maç sırasında rastgelelik `seeded-rng.js` üzerinden sağlanır. Asenkron iş eklerken global `Math.random` geçici sarmalamasının çağrılar arası karışmamasına dikkat edin.
17. **CS Görsel-Anlatım Sırası:** Shooter oynatıcının döndürdüğü Promise mutlaka beklenmelidir. Terminal satırını önce basıp oyuncuları daha sonra olay koordinatına yetiştirmeyin; 1x hareket süresine yapay üst sınır koymayın.
18. **Futbol V2 Tek Yetkili Dünya:** `football-v2-*` akışında frontend taktik hedef, sonuç veya top sahipliği üretemez. Tarayıcı yalnızca sunucu snapshot'larını interpolate etmelidir.
19. **Futbol V2 Eski Motordan Yalıtım:** V2 paketleri mevcut `football-ai.js` ve `football-visual.js` üzerine yeni override ekleyerek uygulanmamalıdır. Eski Beta yalnız A/B karşılaştırma referansı olarak ayrı ve çalışır kalmalı; Admin Halı Saha/FIFA Beta Testi V2 tam maçı kullanmalı, gerçek lobi geçişi yalnız `is_beta = 1` ve `FOOTBALL_V2_BETA_LOBBY` kapısıyla yapılmalıdır.

---

## 9. ✅ Beta Futbol Regresyon Hedefleri

29 Temmuz 2026 tarihli dengeli ve eşit ratingli toplu testler referans alınarak:

| Ölçüt | Halı Saha Beta | FIFA Beta | Beklenti |
|---|---:|---:|---|
| Ortalama toplam gol | `8.87` | `2.27` | Halı saha belirgin biçimde daha gollü olmalı |
| 10+ toplam gol oranı | `%40.4` | `%0` | 10 gollü halı saha maçları düzenli görülebilmeli |
| 0-0 oranı | `%0` | yaklaşık `%6` | Halı sahada golsüz maç pratikte oluşmamalı |
| Ortalama toplam şut | `14.77` | `5.11` | Branş temposu farkı korunmalı |
| Kendi yarı sahasından şut | `0` | `0` | Her iki branşta da sıfır kalmalı |
| Savunmacı şutu | `0` | `0` | Rastgele savunmacı bitiriciliği oluşmamalı |

Bu sayılar katı oyun tasarımı sabitleri değildir; ancak büyük değişikliklerden sonra en az birkaç yüz simülasyon çalıştırılarak anlamlı sapmalar araştırılmalıdır.

Ek regresyon kontrolleri:

* Karşı karşıya şutundan hemen önce aynı takım ve aynı pozisyon zincirine ait pas veya dripling olmalıdır.
* Karşı karşıya tespitinden sonra araya `recycle`/geri pas olayı girmemelidir.
* Baskısız ve ilerlemeye açık koridorda `unnecessaryBackwardPasses` sıfır kalmalıdır; geri pas yalnızca baskı, kapalı koridor veya son çizgide mantıklı geri çıkarma durumunda üretilmelidir.
* Beta dışı Halı Saha ve FIFA simülasyonları deneysel `visualEvent` üretmemelidir.
* FIFA gol ortalaması, Halı Saha ayarı nedeniyle belirgin biçimde yükselmemelidir.
* Tarayıcı konsolunda `Futbol görsel simülasyon hatası` bulunmamalıdır.
* Eşit 75 ratingli takımlar yaklaşık %50 kazanmalıdır.
* 85 ratingli takımın 75 ratingli takıma karşı avantajı görünür olmalı; ancak her maçı garanti etmemelidir.
* `passesCompleted <= passesAttempted`, `dribblesWon <= dribblesAttempted` ve takım şut toplamı oyuncu şut toplamına eşit kalmalıdır.
* `npm run test:football-decisions`; doğrudan karşı karşıya senaryosunu, aynı seed tekrarını, koordinat sınırlarını, beta yalıtımını ve toplu gereksiz geri pas kontrolünü çalıştırır.

### 9.1 Beta Counter-Strike Dust II Regresyon Hedefleri

* Her raund `round-start` ile başlamalı, 5 T ve 5 CT oyuncusunu içermeli ve tam bir `round-end` ile bitmelidir.
* Aynı oyuncu bir raundda iki kez ölemez; ölü oyuncu daha sonra kill alamaz.
* Aynı `weaponEntityId` iki yaşayan oyuncuda bulunmamalı; ölü oyuncunun ikinci ekipman drop'u boş kalmalı ve pickup olayı şarjör/yedek mermiyi değiştirmemelidir.
* Her ekonomi özetinde `groundInventory` düşen, geri alınan, korunan ve kaybedilen değerleri tutmalı; hayatta kalan pickup silahı sonraki raund yüküne aynı mermiyle taşınmalıdır.
* `defuse` veya `explode` olayından önce aynı raundda mutlaka `plant` olmalıdır.
* Tabanca raundu dışındaki her raund en az bir rota sisine sahip olmalıdır.
* Bütün shooter olaylarında `domain = "shooter"`, `branch = "cs"` ve `map = "dust2"` korunmalıdır.
* Beta dışı ve Taktiksel Mod CS simülasyonları shooter `visualEvent` üretmemelidir.
* Her kill `perception.los = true` ve `perception.collisionMesh = true` taşımalıdır; olay tick’leri aynı raund içinde geriye gitmemelidir.
* `round-start` içinde 10 geçerli hareket planı, `tickRate = 20` ve `collisionMesh = "awpy-tri-17595823"` bulunmalıdır.
* Tüm T saldırı ve CT savunma rotaları beş farklı oyuncu şeridinde `validateMotion` kontrolünü geçmelidir. Long A rotası Long Doors/Long A, Short rotası Short nav alanını içermeli ve iki koridor birbirine karışmamalıdır.
* `round-start.behaviorTimeline` her oyuncu için monoton tickler taşımalı; `engage`/`retreat` kaynağı görüş, `investigate` kaynağı görüş/ses/takım çağrısı olmalıdır.
* Kill anındaki davranış `engage`, `peek` veya `hold` olmalı; serbest rota koşusunda otomatik kill üretilmemelidir.
* `npm run test:cs-spatial` aynı seed tekrarını, 20 maçlık uzamsal/davranış regresyonunu, çarpışma ağını ve beta yalıtımını doğrular.
* Tarayıcı konsolunda shooter görsel oynatıcı hatası bulunmamalı; masaüstü ve 390px mobil genişlikte yatay taşma oluşmamalıdır.

---

## 10. 🧭 Önerilen Sonraki Geliştirmeler

Counter-Strike beta için kullanıcı tarafından kilitlenen 5H–5L geliştirme
sırası ve kapsamı proje kökündeki `CS_BETA_YOL_HARITASI.md` dosyasındadır.
Bu sıra kullanıcı onayı olmadan değiştirilmemelidir; yeni CS fikirleri aynı
dosyanın ayrı backlog bölümüne eklenmelidir.

Öncelik sırasına göre öneriler:

1. **Senaryo Testleri:** Admin paneline “karşı karşıya”, “kanat ortası”, “kontra atak”, “korner” ve “penaltı serisi” gibi doğrudan olay başlatan test seçenekleri ekleyin.
2. **CS Çatışma Motoru:** Mevcut açı tutma, peek ve geri çekilme davranışlarının üstüne trade mesafesi, mermi/hasar, isabet dağılımı ve gerçek temasın raund sonucunu belirlemesini ekleyin.
3. **Kaleci Karar Motoru:** Kalecinin açı kapatma, öne çıkma, çizgide kalma, sektirme ve birebir rating etkisini ayrı bir modelde çözün.
4. **Bağlamsal Karar Motoru:** Kalıcı saha durumunu kullanarak pas, dripling, şut, top saklama ve yön değiştirme seçeneklerini baskı, koridor, takım arkadaşı boşluğu ve oyuncu profiline göre bağımsız puanlayın.
5. **Top Fiziği ve Hız Profilleri:** Pas, dripling ve şutlarda mesafe/oyuncu ratingine göre top hızı, falso ve sekme çeşitliliği ekleyin.
6. **Taktik Etkisinin Görselleştirilmesi:** Defansif, dengeli ve ofansif stillerin savunma çizgisi, pres yüksekliği, takım boyu ve koşu riskine doğrudan etki etmesini sağlayın.
7. **Yorgunluk ve Maç Evresi:** Son bölümlerde pres, dripling başarısı ve geri koşu hızını kondisyon üzerinden değiştirin; skor durumuna göre risk alma davranışı ekleyin.
8. **Simülasyon Telemetrisi:** Şut bölgeleri, pas zinciri uzunluğu, müdahale oranı, karşı karşıya sayısı ve xG dağılımını test çıktısında özetleyin.
9. **Performans ve Bellek:** Her `line` içinde tam `matchState` kopyası tutulduğu için uzun beta maçları büyüyebilir. Görsel doğruluk korunarak delta-state veya periyodik snapshot yaklaşımı değerlendirilebilir.
10. **Erişilebilirlik ve Mobil Görünüm:** Saha üzerindeki renk farklarını yalnızca renge bağlamayın; takım şekli, oyuncu numarası ve bot göstergelerini küçük ekranlarda da okunabilir tutun.
11. **Admin Yetenek Override’ları:** Türetilen profil yeterli olmadığında karakter dönemi bazında pas, dripling, bitiricilik, savunma ve hız için isteğe bağlı artı/eksi override alanları ekleyin; boş bırakılan alanlar otomatik profili kullanmaya devam etsin.
12. **Dust II Bombsite Kaynağı:** A/B koordinatlarını görsel tahminle değiştirmeyin. `scripts/lib/dust2-bombsites.js` içindeki Valve `func_bomb_target` dünya hacimleri, harita üreticisi tarafından radar poligonlarına çevrilir; plant konumu bu alanlardaki güvenli zemin nav düğümlerinden seçilir.

### 10.1 Futbol Gerçekçiliği Araştırma ve Uygulama Planı

Bu sıra hem araştırma hem geliştirme sırasıdır; bir aşamanın ölçümleri dengelenmeden sonraki aşama sonuç motoruna bağlanmamalıdır. Durum işaretleri: `✅ tamamlandı`, `🟡 geliştiriliyor`, `⬜ sırada`.

1. **✅ Temel telemetri ve tekrarlanabilirlik**
   * Pas, dripling, baskı, müdahale, top kaybı, şut, xG/xA ve duran top olay şemaları korunur.
   * Her maç seed ile tekrar oynatılabilir; aynı seed aynı kadro ve akışı üretmelidir.
   * Takım ve oyuncu istatistik toplamları birbiriyle eşleşmelidir.

2. **✅ Pozisyon Motoru V2 — Kalıcı uzamsal saha durumu**
   * `createFootballMatchState(...)`, topu ve bütün futbolcuların konumlarını maç boyunca tek bir `positions` haritasında tutar.
   * Yeni hücum sekansında oyuncular başlangıç noktalarına sıfırlanmaz; önceki konumlarından takım şekline doğru kademeli yerleşir.
   * Başlangıç top sahibi topa yakınlık, mevki bandı, geçiş durumu ve önceki top sahipliğiyle seçilir.
   * Başarılı pas/dripling top konumunu; müdahale/top kesme yeni top sahibini ve geçiş fazını; gol yalnızca meşru santra sıfırlamasını günceller.
   * `spatialTelemetry`; sekans, topa sahip olma değişimi, geçiş, top kaybı, duran top, devamlı başlangıç oranı ve başlangıç konum sapmasını raporlar.
   * Kabul kapısı: geçiş ve devamlı başlangıç değerleri sıfırdan büyük olmalı; kickoff dışı tam diziliş sıfırlaması olmamalı; Halı Saha/FIFA gol ve olay regresyonları hedef aralıkta kalmalıdır.
   * 150 Halı Saha + 150 FIFA seed’li regresyonda geçersiz koordinat, skor/istatistik uyuşmazlığı veya klasik moda görsel sızıntı görülmedi. Devamlı başlangıç oranı Halı Saha’da `%66.4`, FIFA’da `%78.6` ölçüldü.
   * Admin beta testinde 12 oyuncunun tamamı iki ardışık örnek arasında konum değiştirdi; aynı maçta pas, top kazanma, top kesme, şut, kurtarış ve gol akışları hatasız oynatıldı.

3. **✅ Bağlamsal xPass ve bağımsız aksiyon kararı**
   * Pas sonucunu mesafe, açı, yön, baskı, koridor savunmacıları, alıcı boşluğu ve oyuncu profiliyle modelleyin.
   * Her top sahibi pas, dripling, şut, top saklama, yön değiştirme ve geri dönüş seçeneklerine bir fayda puanı versin.
   * Ham pas yüzdesinin yanında `gerçekleşen - beklenen pas` farkını tutun.
   * İlk dilim tamamlandı: `onBallDecision(...)`, pas alıcısı seçilmeden önce şut, açık alana taşıma ve pas seçeneklerini bağlama göre sıralar.
   * Kaleciyle karşı karşıya ve baskısız açık şut pozisyonu zorunlu şuta dönüşür; mevki, yalnızca gerçek karşı karşıya olmayan olağan şut seçimlerini sınırlar.
   * Taşıyıcının gerçek saha ilerlemesi pas sekansı indeksinin önüne alındı. Açık ilerleme koridorunda geriye hedef üretmek yerine koşu yoluna öne pas veya top sürme seçilir.
   * `spatialTelemetry`; `onBallDecisions`, `backwardPasses`, `unnecessaryBackwardPasses`, `forcedOneOnOneShots` ve `openLaneCarries` alanlarıyla genişletildi.
   * 200 Halı Saha + 200 FIFA regresyonunda gereksiz geri pas `0`; zorunlu karşı karşıya şut `854`, açık koridor taşıması `1.405` ölçüldü. Ortalama toplam gol Halı Saha’da `10.64`, FIFA’da `2.83` kaldı.
   * Her pasın beklenen başarı olasılığı; mesafe, yön, baskı, pas koridoru, alıcı boşluğu, pasör/alıcı profili ve savunmacı kalitesiyle hesaplanır.
   * `expectedPassesCompleted` ve `passOverExpected`, oyuncu/takım istatistiği ile canlı maç notuna bağlandı.

4. **✅ Aksiyon değeri (xT/OBV benzeri)**
   * Güvenli yana pasla savunma delen pası ayırmak için aksiyonun gol ihtimaline eklediği/çıkardığı değeri hesaplayın.
   * Karar seçimi ve oyuncu ratinginde yalnızca aksiyon adedi değil bağlamsal değer kullanılsın.
   * Saha ilerlemesi ve merkezilikten üretilen sürekli tehdit değeri; başarılı/başarısız pas, top sürme ve şut için `actionValue` katkısına dönüştürüldü.
   * Olumlu aksiyon değeri canlı notun dağıtım bileşenini yükseltir; değerli bölgedeki top kaybı negatif katkı üretir.

5. **✅ Topsuz karar, takım şekli ve baskı**
   * Topsuz hücum kararları tamamlandı: genişlik, savunma arkası koşu, yakın destek, yarı alan ve geride denge görevleri oyunculara bağımsız atanır.
   * Hücum boyunca takım genişliği ve aynı takım oyuncuları arasındaki minimum mesafe hem planlama hem canlı görsel katmanda korunur.
   * Savunma tek bir birinci baskıcı, bir ikinci savunmacı, pas yolu kapatıcıları ve geride kalan denge hattına ayrıldı.
   * Pas yolu oyuncuları baskı çemberinin dışında kalır; top çevresinde ikiden fazla savunmacı oluşması telemetri kabul kapısıyla sınırlandırılır.

6. **⬜ Şut donmuş karesi ve Kaleci Motoru**
   * xG’ye kaleci konumu, kaleye görüş, en yakın savunmacı, baskı ve şut tipi ekleyin.
   * Kaleci açı kapatma, öne çıkma, çizgide kalma, topu kontrol/sektirme ve dağıtım kararları versin.
   * Kaleci ratingi yenilen gol sayısından çok karşılaşılan şut kalitesi ve engellenen gol üzerinden değerlendirilsin.

7. **⬜ Oyuncu eğilimleri ve taktik kimlik**
   * Oyun kurucu, çalımcı, bitirici, presçi, top kapan ve riskli oynayan gibi kart eğilimleri ekleyin.
   * Defansif/dengeli/ofansif stiller savunma çizgisi, pres yüksekliği, genişlik, tempo ve koşu riskinde görsel olarak ayrışsın.

8. **⬜ Maç bağlamı, yorgunluk ve oyuncu değişiklikleri**
   * Skor, dakika ve kontrollü risk seviyesi karar ağırlıklarını değiştirsin.
   * Yorgunluk pres, dripling, geri koşu ve reaksiyonu düşürsün; FIFA’da oyuncu değişikliği desteği eklensin.

9. **⬜ Pozisyon çeşitliliği ve seed’li senaryo laboratuvarı**
   * Kontra, yerleşik hücum, ara pası, orta, duvar pası, korner, serbest vuruş, seken top ve penaltı senaryoları doğrudan test edilebilsin.
   * Çıktılar branş bazında gol, xG, pas, şut, dripling, baskı, saha bölgesi ve rating dağılımı hedeflerine göre toplu kalibre edilsin.

Araştırma referansları: SofaScore’un canlı oyuncu notu yaklaşımı ve `6.5` başlangıç/`3-10` sınırları; StatsBomb’un baskı, şut çevresindeki oyuncu/kaleci konumu, pas ayağı-yüksekliği gibi bağlamsal veri yaklaşımı; xPass için pas başlangıcı, mesafe, açı, baskı, vücut bölümü ve oyun fazı değişkenleri.

### 10.2 Beta Futbol Uygulama Paketleri

Paketler yalnızca beta görsel Halı Saha/FIFA akışında sırayla etkinleştirilir. Her paket kendi kabul kapısını geçmeden sonraki paket sonuç motoruna bağlanmaz.

1. **✅ Paket 1 — Bağlamsal xPass ve aksiyon değeri**
   * Her pas için beklenen başarı olasılığı; mesafe, yön, pas koridoru, taşıyıcı baskısı, alıcı boşluğu ve iki oyuncunun profiliyle hesaplanır.
   * Gerçekleşen-beklenen pas farkı oyuncu ve takım seviyesinde tutulur.
   * Pas, top sürme ve şutun pozisyonun gol tehdidine yaptığı katkı `actionValue` olarak hesaplanır.
   * Oyuncu canlı notu ham aksiyon adedinin yanında xPass farkı ve aksiyon değerini kullanır.
   * Kabul kapısı: aynı seed tekrarı korunmalı, gereksiz geri pas sıfır kalmalı, istatistik toplamları eşleşmeli ve branş gol ortalamaları hedef aralıkta kalmalıdır.
   * 200 Halı Saha + 200 FIFA testinde gerçekleşen/beklenen pas oranları sırasıyla `%93.6/%93.6` ve `%90.4/%90.5`; gol ortalamaları `10.09` ve `2.75`; gereksiz geri pas `0` ölçüldü.
2. **✅ Paket 2 — Topsuz oyun ve takım şekli**
   * Yakın destek, savunma arkası, bindirme, iç koşu, alan boşaltma ve geri koşu bağımsız kararlar olur.
   * Takım genişliği, boyu ve savunma çizgisi taktik düzen içinde korunur.
   * Top çevresine aynı anda en fazla sınırlı sayıda yakın destek gelir; diğer oyuncular genişlik, derinlik koşusu ve geride denge görevlerini korur.
   * Kabul kapısı: Halı Saha’da ortalama hücum genişliği en az `38`, FIFA’da en az `52` normalize saha birimi olmalı; aynı takımın minimum oyuncu mesafesi Halı Saha’da `6`, FIFA’da `4` altına düzenli biçimde düşmemeli ve sıkışık plan oranı `%5` altında kalmalıdır.
   * 200 Halı Saha + 200 FIFA seed’li regresyonda ortalama plan genişliği sırasıyla `47.19` ve `70.15`; sıkışık plan oranı iki branşta da yaklaşık `%1.2`; gereksiz geri pas `0` ölçüldü.
   * Admin Halı Saha beta testindeki 70 canlı örnekte açık oyun genişliği iki takım için `42.73` ve `43.88`, minimum aynı takım mesafesi `6.15`, sıkışık örnek oranı `%0` ölçüldü.
3. **✅ Paket 3 — Pres ve savunma zekâsı**
   * Birinci/ikinci savunmacı görevleri, pas yolu kapatma, alan savunma, geri çekilme ve müdahale zamanı ayrı kararlara bölünür.
   * Savunma aynı anda topa yığılmaz; hücum eden oyuncunun savunma içinden müdahalesiz yürümesi engellenir.
   * Halı Saha’da her planda `1` baskıcı, `1` kademe, `1` pas yolu kapatıcı ve `2` geride denge oyuncusu; FIFA’da `1` baskıcı, `1` kademe, `2` pas yolu kapatıcı ve `6` geride denge oyuncusu atanır.
   * Geride denge oyuncuları artık baskı görevlerinden arta kalan rastgele oyuncular değildir; doğal mevki bandı ve kendi kale tarafındaki ana konumu önceliklendirilerek baskı/kademe seçilmeden önce rezerve edilir.
   * Pas yolu ve geride denge oyuncuları farklı hücum tehditlerine `markTarget` ile atanır. Görsel motor hedef oyuncuyu canlı takip eder ve gerideki oyuncunun top hizasının önüne çıkmasını engeller.
   * Halı Saha şut bölgesi saha ilerlemesinde yaklaşık son üçte bire ve kaleye `<34` normalize birim mesafeye çekildi. Pas bütçesi bitince orta sahadan şut zorlanmaz; koridor açıksa en fazla iki ek taşıma yapılır, şut bölgesine girilemezse hücum yeniden kurulur.
   * Kabul kapısı: savunma planı başına tam bir baskıcı/kademe bulunmalı, top çevresinde ikiden fazla savunmacı plan oranı `%5` altında kalmalı; ortalama savunma genişliği Halı Saha’da en az `32`, FIFA’da en az `48` olmalıdır.
   * 200 Halı Saha + 200 FIFA seed’li regresyonda savunma genişliği sırasıyla `34.01` ve `54.88`; fazla yığılma ve korumasız arka hat oranı iki branşta da `%0`; gol ortalamaları `9.54` ve `2.74`; şut bölgesi dışı şut ve gereksiz geri pas `0` ölçüldü. Halı Saha’da `279`, FIFA’da `8` açık alan son taşıması üretildi.
4. **⬜ Paket 4 — Şut donmuş karesi ve kaleci motoru**
   * Şut açısı, baskı, görüş, kaleci konumu ve şut tipi sonuç modeline bağlanır.
   * Kaleci açı kapatma, öne çıkma, çizgide kalma, tutma/sektirme ve dağıtım kararları verir.

### 10.3 Beta Futbol V2 Yeniden İnşa Yol Haritası

Tam ve güncel plan `docs/football-v2-roadmap.md` dosyasındadır.

* **✅ Paket 0 — Dondurma ve yalıtım:** Eski Beta motoru korunur; V2 ayrı modül, API, oynatıcı ve Admin düğmesinde geliştirilir.
* **🟡 Paket 1 — Tek dünya hareket laboratuvarı:** 20 Hz yetkili sunucu dünyası, 10 Hz snapshot, 30 saniyelik 5+kaleci akışı ve pasif frontend oynatıcı oluşturuldu. 24 seed/rating uzamsal kabulden geçti; mobil ve geniş görsel örneklem kabulü sürüyor.
* **✅ Paket 2 — Takım koordinasyonu:** Halı Saha faz/görev devri ile FIFA 11v11 kadro, hücum genişliği, üçlü orta hat, dörtlü savunma hattı, süpürücü ve benzersiz markaj matrisi tamamlandı. Admin’de iki branş da aynı V2 düğmesinden test edilir.
* **✅ Paket 3 — Top ve pas:** Bağımsız top fiziği, tahminli pas, fiziksel kesişmede pas arası, ilk kontrol, ağır dokunuş, sekme ve sahipsiz top tamamlandı. Top yeni sahibine geri çekilmez; fiziksel temas noktasından akmaya devam eder.
* **✅ Paket 4 — Dripling ve temas:** Küçük fiziksel dokunuşlar, en fazla `48°` dönüş, kart profiline bağlı birebir, top saklama, omuz omuza mücadele ve başarısız çalımda sahipsiz top tamamlandı. 24 Halı Saha seed’inde `670` dokunuş, `45` düello ve `10` omuz mücadelesi; top süreksizliği ve geçersiz sahiplik `0` ölçüldü.
* **✅ Paket 5 — Şut ve kaleci:** Mesafe/açı/baskı/profil tabanlı şut, fiziksel blok, kaleci çizgi-açı kararı, tutuş/sektirme, direk ve yalnızca kale çizgisini geçen top için gol tamamlandı. 24 Halı Saha seed’inde `42` şut, `10` gol, `3` gerçek kurtarış, `1` dışarı giden topu toplama, `10` blok ve `16` aut; süreksizlik ve geçersiz sahiplik `0` ölçüldü.
* **✅ Paket 6 — Kurallar ve istatistik:** Fiziksel taç/korner/kale vuruşu, faul/serbest vuruş/penaltı, gol sonrası santra, olaydan türeyen anlatım, xG/xA, takım merkezi ve `3.0-10.0` oyuncu notları tamamlandı. 48’er 60 saniyelik Halı Saha/FIFA kural kalibrasyonunda toplam `234` duran top kullanıldı; ışınlanma, top süreksizliği ve geçersiz sahiplik `0` kaldı.
* **✅ Paket 7 — Beta A/B ve tam maç:** Aynı kadro/seed karşılaştırması, 50/90 dakikalık tam maç, branş bazlı skor kalibrasyonu, performans/ağ ölçümü, 3 Hz uyarlanabilir snapshot ve yalnızca Beta Lobi geçişi tamamlandı. Geri dönüş kapısı `FOOTBALL_V2_BETA_LOBBY=false`.
* **✅ Paket 8 — Maç akışı ve hücum çeşitliliği:** Gol-sevinç-santra durum makinesi, tam santra dizilişi, işaretli snapshot yerleşimleri, yedi hücum planı/yedi pas niyeti ve yalnız geçen olaylardan türeyen canlı istatistikler tamamlandı.

---

## 11. 📝 Son Beta Simülasyon Güncelleme Özeti

* Halı Saha beta maçları daha sık pozisyon ve daha yüksek bitiricilikle bol gollü hale getirildi.
* Savunma arkasına koşu ve açık pas koridoru `breakaway` olarak tanımlandı.
* Açık oyuncunun gereksiz pas/geri pas yapması engellenerek doğrudan şut kararı eklendi.
* Karşı karşıya olayları backend ve frontend arasında `oneOnOne` alanıyla taşındı.
* Savunmacının karşı karşıya kalan hücumcunun önüne ışınlanması kaldırıldı; geriden takip animasyonu eklendi.
* Şutör seçimi mevki, saha ilerlemesi ve gerçek top sahibiyle sınırlandırıldı.
* Halı Saha müdahale, şut ve gol olasılıkları FIFA’dan ayrıştırıldı.
* Gol olan şutlarda topun kale çizgisini tamamen geçip ağ içine yerleşmesi sağlandı.
* Penaltı animasyonları özellikle 4x hızda takip edilebilir olacak şekilde yavaşlatıldı.
* Penaltılar arasında saha dizilişine dönme hatası giderildi.
* Admin Paneli → Simülasyon Testi bölümündeki Beta Testi akışı, Halı Saha/FIFA seçimlerinde Futbol V2 tam maça yönlendirilerek gerçek Beta Lobi motorunun standart doğrulama yolu haline getirildi.
* Admin simülasyon test düğmeleri, sekme yeniden çizildiğinde dinleyicinin kaybolmaması için doğrudan `runTestSimulation` komutuna bağlandı.
* Genel futbol ratingi; pas, görüş, dripling, bitiricilik, savunma, hız, reaksiyon ve soğukkanlılık profiline ayrıldı.
* Mevkiye göre yetenek bonusları ve oyuncu kimliğine bağlı küçük deterministik farklılıklar eklendi.
* Pas seçimi/başarısı, birebir, top kesme, blok, şut ve penaltı sonuçları ilgili yeteneklere bağlandı.
* Sabit penaltı gol oranı kaldırıldı; bitiricilik ve soğukkanlılık belirleyici hale getirildi.
* Saha oyuncularına rating rozeti, ratinge bağlı hareket/reaksiyon ve detaylı performans bilgi balonu eklendi.
* Pas, dripling, şut, müdahale, blok ve penaltı istatistikleri oyuncu bazında takip edilmeye başlandı.
* Kaleci kurtarışının yanlışlıkla savunmacının maç notuna yazılması düzeltildi.
* Kilit pas, xA, xG, büyük pozisyon, kaçırılan büyük pozisyon, top kaybı, kaleci kurtarışı ve yenilen gol istatistikleri eklendi.
* Takım istatistik merkezi başarılı/toplam pas, pas yüzdesi, dripling, savunma aksiyonu, büyük pozisyon, korner ve faulle genişletildi.
* Oyuncuların 6.5 başlangıçlı, 3.0-10.0 arası canlı maç notları iki takım için ayrı performans listelerinde gösterilmeye başlandı.
* Rating hesabı hücum, dağıtım, top kullanımı, savunma/kaleci ve disiplin bileşenlerine ayrıldı; Halı Saha aksiyon yoğunluğu 0.6 katsayısıyla normalize edildi.
* Görsel maç üst durum etiketi son düdükten sonra `CANLI` olarak kalmak yerine `BİTTİ` durumuna geçer.
* Admin beta testindeki takım istatistikleri ve oyuncu performans paneli okunabilirlik için büyütüldü; oyuncu verileri tek satırlık küçük metin yerine ayrı gol, asist, şut, pas, çalım ve savunma rozetlerine bölündü.
* Pozisyon Motoru V2 ile top ve tüm futbolcuların konumları artık hücumlar arasında sıfırlanmak yerine maç boyunca korunuyor; yalnızca gol sonrası santrada tam diziliş sıfırlanıyor.
* Top kaybı, pas arası, müdahale ve duran toplar kalıcı saha durumuna bağlandı; yeni hücumlar topun gerçekten kaldığı bölgeden ve en uygun oyuncuyla başlıyor.
* Sekans, topa sahip olma değişimi, geçiş, top kaybı, yeniden başlatma ve devamlı başlangıç oranını raporlayan `spatialTelemetry` eklendi.
* Top sahibi artık pas alıcısı aramadan önce şut ve ilerleme koridorunu değerlendiriyor; kaleciyle karşı karşıya pozisyonlarda geri pas yerine zorunlu şut kararı veriliyor.
* Baskısız açık koridorda geri pas ağır biçimde cezalandırıldı; uygun öne pas yoksa oyuncu topu sürerek alan kazanıyor.
* `npm run test:football-decisions` ile aynı seed, karşı karşıya şutu, gereksiz geri pas, açık alan taşıması, koordinatlar ve beta yalıtımı kalıcı regresyon kontrolüne alındı.
* Her pas için bağlamsal xPass üretildi; oyuncunun tamamladığı paslarla beklenen pas toplamı arasındaki fark `passOverExpected` olarak tutulmaya başlandı.
* Pas, top sürme ve şutların saha tehdidine katkısı `actionValue` olarak hesaplanıp canlı oyuncu notunun dağıtım bileşenine bağlandı.
* Paket 2 ile her hücum başlangıcında taşıyıcı dışındaki oyunculara genişlik, koşu, yakın destek, yarı alan ve geride denge görevleri atanıyor.
* Görsel motor, bu topsuz görevleri topun hareketine küçük kaydırmalarla kalıcı olarak takip ediyor; her olayda bütün takımın top çevresine koşması engellendi.
* Aynı takım oyuncularının üst üste binmesini engelleyen canlı mesafe çözücüsü ve takımın daralmasını sınırlayan hücum/savunma genişlik çıpası eklendi.
* 200+200 toplu testte Paket 1 gol/pas dengesi korundu: Halı Saha gol ortalaması `10.10`, FIFA `2.63`; gerçekleşen/beklenen pas oranları `%93.5/%93.4` ve `%90.2/%90.1` kaldı.
* Paket 3 ile savunma kararları birinci baskıcı, ikinci savunmacı, pas yolu kapatıcı ve geride kalan hat görevlerine ayrıldı.
* Baskıcı rakibi doğrudan kilitlemek yerine açı vererek yaklaşır; top taşıyıcı açık kalan koridoru hâlâ sürebilir, fakat kademe ve pas yolu oyuncuları sonraki aksiyonu karşılar.
* Pas yolu ve geride denge görevleri baskı çemberinin dışına zorlanarak bütün savunmanın topa yığılması engellendi.
* `spatialTelemetry`; savunma planı, fazla yığılma oranı, savunma genişliği, baskıcı/kademe/pas yolu/geride denge sayıları ve mesafe düzeltmeleriyle genişletildi.
* Paket 3 düzeltmesinde doğal savunmacılar önce geride emniyet için rezerve edildi; her geride denge ve pas yolu oyuncusuna farklı bir hücum tehdidi atandı.
* Savunma hedefleri top ilerledikçe marke edilen oyuncuyu canlı takip eder; Halı Saha’da en az iki, FIFA’da en az dört oyuncu topun kendi kalesi tarafında kalır.
* Halı Saha orta saha şutları `shotDistance`, `shotProgress` ve `shootingZone` kabul kapısıyla kaldırıldı. Şut bölgesi dışındaki açık top sahibi en fazla iki kez daha ilerler, uygun açı oluşmazsa pozisyonu yeniden kurar.
* Başarısız paslar `completed = false` ve `intercepted = true` taşır; pas ve pas arası olayı aynı `interceptX/interceptY` noktasında birleştiği için top önce alıcıya gidip sonra savunmacıya geri ışınlanmaz.
* Başarısız dripling sonrası müdahaleler `fromDribble` sürekliliğiyle aynı top noktasından devam eder; top olaylar arasında eski sahibine geri bağlanmaz.
* Normal şut bölgesi kaleye yaklaşık 29-30 normalize birime çekildi. Yüksek bitiricilik/soğukkanlılık ve düşük baskıda seyrek ceza sahası dışı `longRange` denemesi korunurken orta saha şutları engellendi.
* Görsel şutör `shotX/shotY` noktasına koşup yerleşmeden vuruş yapmaz; kaçan şut hedefleri korner noktaları yerine direğin hemen dışına sınırlandı.
* Hücum yerleşiminde geride denge sayısı Halı Saha’da ikiye, FIFA’da üçe çıkarılarak sahanın arka bölümünün tamamen boşalması engellendi.
* Yeni telemetri `forcedAdvanceCarries`, `trackedThreatAssignments`, `unguardedBackPlans` ve `unguardedBackRate` alanlarını raporlar.
* Admin beta testinde `SAVUNMA YERLEŞİYOR` fazı, eksiksiz beş Halı Saha savunma görevi, 12 hareketli oyuncu ve hatasız tarayıcı konsoluyla doğrulandı.
* Maç istatistik paneline takım bazlı “Pas Beklenti Farkı” ve “Aksiyon Değeri”, oyuncu performans satırlarına `xP` ve `AV` rozetleri eklendi.
* Counter-Strike beta için ilk ve tek harita olarak Dust II kuşbakışı görsel oynatıcı eklendi.
* Dust II Long A, Short, Mid-B ve Tunnels-B rotaları gerçek nav koordinatlarıyla shooter karar motoruna işlendi; Long'un Top Mid sapması ve Short'un A yaklaşımındaki geri dönüşü kaldırıldı.
* 5v5 oyuncu hareketleri, kill feed, mermi izi, sis bombası ve C4 kurma/çözme/patlama olayları görselleştirildi.
* CS görsel olayları yalnızca `isVisualBeta` akışında üretilecek şekilde Basit ve Taktiksel Moddan yalıtıldı.
* Tüm simülasyon motoruna tekrar oynatılabilir seed desteği ve admin test seed alanı eklendi.
* Dust II’nin 513.783 üçgenlik gerçek çarpışma ağı; hareket, duvar ve görüş doğrulamasına bağlandı.
* CS raundları 20 Hz yetkili dünya durumu üzerinde ilerler; görüş alanı, reaksiyon süresi, ses, takım çağrısı ve zamanla silinen rakip hafızası eklendi.
* Kill olayları yalnızca gerçek çarpışma ağından geçen doğrulanmış görüş temasından üretilecek şekilde sınırlandı.
* 5A davranış katmanında ilerleme, sessiz yürüme, bilgi araştırma, açı tutma, peek, temas ve geri çekilme durumları oyuncu bazlı rota saatine bağlandı.
* Davranış geçişleri seed’li `behaviorTimeline` olarak frontende taşındı; harita üzerinde AÇI/PEEK/TEMAS/ARAŞTIR/GERİ rozetleri gösterilmeye başlandı.
* CS görsel hareketi olay saatine kadar doğrusal oynatılır; terminal yazısı hareket tamamlanmadan ilerlemez.
* 1x oynatma gerçek zaman oranına çekildi ve Admin Beta Testi varsayılan hızı 1x yapıldı; rotaların anlatıma yetişmek için sıkışıp hızlanması kaldırıldı.
* 5C ile tek C4 taşıyıcısı, bomba düşürme/geri alma, güvenli plant kontrolü ve plant sonrası `retake`/`save`/`ninja` karar katmanı eklendi.
* Bomba patlamadan önce T oyuncuları ve save kararı veren CT oyuncuları güvenli nav rotalarına yönelir; C4 ve defuse kit rozetleri harita ile iki takım kadro panelinde gösterilir.
* `npm run test:cs-round-decisions` karar senaryolarını; `npm run test:cs-spatial` ise tek taşıyıcı, C4 düşürme/geri alma, her plant için tek karar, kaçış ve beta yalıtımını regresyon testine alır.
* 5D ekonomi temelinde gerçek dolar bakiyesi, kayıp bonusu, kill/objective ödülleri, taraf uyumlu silah/kit satın alma ve rauntlar arası silah koruma eklendi.
* Dust II izleyicisinde takım parası, ekipman değeri ve buy türü sürekli gösterilir; raund başında iki takımın alışveriş kartı, raund sonunda ekonomi özeti oynatılır.
* `npm run test:cs-economy` para sınırı, CT kit kuralı, yarı sıfırlaması ve korunan silahı; `npm run test:cs-spatial` her raund için tek `buy-phase`/`economy-summary` ve bütün buy türlerinin toplu dağılımını doğrular.
* 5F mağaza genişletmesinde ilk rekabetçi katalog 20 silaha çıkarıldı. Takım buy kararı `reasonCodes`, rakip ekonomi tahmini, oyuncu ekonomi rolleri ve AWP takım drop'u üretir; satın alımlar `purchaseTimeline` üzerinden mağaza katmanında sırayla vurgulanır.
* Hayatta kalan oyuncu kullanılmamış utility'sini sonraki raunda taşır. Açılış smoke'u gerçek envanter sahibinden tüketilir; ölen oyuncunun silah, kit ve utility envanteri temizlenir.

---

## 12. 🚀 GitHub Sürüm Politikası

* Her anlamlı özellik, düzeltme veya dağıtım değişikliği tamamlandığında kullanıcıya **GitHub'da yeni bir sürüm yayınlamak isteyip istemediği sorulmalıdır**.
* Handoff mesajında, kullanıcı aynı istekte zaten sürüm yayını istemediyse, açıkça **“GitHub'da yeni bir sürüm yayınlayalım mı?”** sorusu yer almalıdır.
* Kullanıcı onaylamadan yeni tag veya GitHub Release oluşturulmamalıdır.
* Yayın öncesinde ilgili testler çalıştırılmalı; gerçek `data/5x5.db`, `.env`, kullanıcı verileri, sohbet kayıtları, loglar ve yerel test çıktıları commit'e eklenmemelidir.
* Sürüm paketi temiz kurulumda veritabanını çalışma anında üretmeli ve yönetici bilgilerini ortam değişkenlerinden almalıdır.
