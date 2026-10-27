# Dictator Era: lisanslar ve varlık kaydı

Bu oyun için yazılan HTML, JavaScript, CSS ve Java uygulama kodu özgündür. Özgün kod ve bu projeye özel üretilen görseller kullanıcıya oyunu geliştirme ve dağıtma amacıyla teslim edilir; üçüncü taraf bileşenler kendi lisanslarına tabidir. Başka oyunların kodu, görselleri, isim logoları veya sesleri alınmamıştır.

- Natural Earth: ülke sınırları, idari sınır çizgileri, şehir noktaları ve NE2 gölgeli rölyef dokusu kamu malıdır. Kullanım koşulları: https://www.naturalearthdata.com/about/terms-of-use/ . Kaynak veriler: https://github.com/nvkelso/natural-earth-vector . Rölyef: https://naciscdn.org/naturalearth/50m/raster/NE2_50M_SR_W.zip .
- D3: ISC; tam lisans metni paket içinde. https://github.com/d3/d3/blob/main/LICENSE .
- d3-geo: ISC; veri hazırlama aracı. https://github.com/d3/d3-geo/blob/main/LICENSE .
- Lucide: ISC; simge dosyaları ve tam lisans paket içinde. https://lucide.dev/license .
- Country Flag Icons: MIT; ülke bayrağı SVG dosyaları. https://github.com/catamphetamine/country-flag-icons/blob/master/LICENSE .
- Barlow: SIL Open Font License 1.1. https://github.com/google/fonts/blob/main/ofl/barlow/OFL.txt .
- Cinzel: SIL Open Font License 1.1. https://github.com/google/fonts/blob/main/ofl/cinzel/OFL.txt .
- Ana ekran görseli, modern birlik atlası, dönem birlik atlası, altı kurgusal temsilci portresi ve altı olay görseli bu proje için yapay zekâ ile üretilmiştir. Portreler gerçek devlet başkanı fotoğrafları olarak sunulmaz. Üretilen resimlerdeki askerî teçhizat veya üniformalar tarihsel doğruluk garantisi taşımaz.
- Üç dakikalık ambiyans müziği ve etkileşim/çatışma sesleri bu proje için matematiksel olarak sentezlenmiştir. Üçüncü taraf ses örneği kullanılmamıştır.
- Dictator Era monogramı ve uygulama simgesi bu proje için hazırlanmıştır.

Harita, Natural Earth verisinin kartografik çözünürlüğünü ve kontrol/sınır tercihlerini miras alır. Gerçek zamanlı sınır veri servisi değildir. Mikrodevletler ve çok küçük adaların ele geçirilmesi hücre çözünürlüğüyle sınırlıdır. İdari çizgiler tıklanabilir şehir eyaletleri değil, görsel idari sınır katmanıdır.

Ekonomik ve askerî değerler oyun dengesi içindir. Başlangıç ekonomisinin göreli ölçeği Natural Earth verisindeki eski referans verilerinden türetilmiştir; güncel ülke istatistiği değildir.

## Dağıtım ve gizlilik

Misafir modunda hesap ve kayıt yalnızca Android SharedPreferences içinde tutulur. Reklam, izleme, analitik ve konum SDK'sı yoktur. Yerel kurulum UUID'si gerçek donanım kimliği veya yeniden kurulumları engelleyen sunucu kimliği değildir. Uygulama verileri silinince profil sıfırlanabilir.

0.2.0 sürümünde Supabase üzerinde komutan adı/şifre hesapları, sunucuda benzersiz adlar ve gerçek çevrimiçi sıralama bulunur. Google Play Games ve Google OAuth girişi yapılandırılmamıştır. Misafir puanı online hesaba taşınmaz. Zaferler temel süre, kontrol noktası, dünya sahipliği ve tek ödül denetiminden geçer; cihaz simülasyonu tam hile korumalı değildir. Çok oyunculu “Yakında” bildirimi verir.

Online modda profil adı, ülke, parola doğrulaması, uygulamaya özgü özetlenmiş cihaz kimliği, kurtarma kodu özeti ve sefer kontrol noktaları işlenir. İstek sınırlama için IP'nin tuzlanmış özeti tutulur. Parola cihazda saklanmaz; Android oturum bilgileri Keystore ile şifrelenir. Misafir modunda uzak sunucu çağrısı yapılmaz. Online cihaz kısıtı değiştirilmiş istemcilere karşı aşılamaz bir donanım kimliği garantisi değildir.

40 MB, 40.000.000 bayt olarak tanımlanmıştır. APK, bu kesin boyuta ulaşmak için açıkça adlandırılmış package-size-reserve.bin alanı içerir. Bu alan oynanış özelliği veya görsel kalitesi olarak sayılmaz; imzalanmış paketin boyutunu eşitler. Kurulum sonrasında kullanılan disk alanı 40 MB'dan farklıdır.

Bu paket ilk oynanabilir sürümdür. Hatasızlık, 120 FPS, tüm cihazlarla uyumluluk veya mağaza onayı garantisi verilmez. Yayıncı mağaza hesabı, Google Play Games ayarları, içerik derecelendirmesi, veri güvenliği beyanı, yayıncı kimliği, AAB hazırlığı ve fiziksel cihaz testleri ayrıca tamamlanmalıdır.
