# Ruang Baca HP (Android)

Versi Android dari Ruang Baca. Proyek Android Studio biasa (Java, tanpa library selain androidx.webkit).

## Merakit dengan Pabrik SuS
1. Pabrik SuS → Impor proyek → pilih `RuangBaca-HP-0.1.0-source.zip`.
2. Periksa skrip build yang ditunjukkan (settings.gradle, build.gradle, app/build.gradle, gradle-wrapper.properties dari services.gradle.org).
3. Pilih rakit APK (release). Pabrik memasang JDK + Android SDK kalau belum ada dan menandatangani APK dengan kuncinya sendiri.
   Pakai kunci yang sama untuk setiap versi, supaya update bisa dipasang menimpa versi lama tanpa kehilangan data.

## Isi
- `app/src/main/java/id/sus/ruangbaca/MainActivity.java`: toolbar, dua WebView (situs & rak), pop-up, unduhan, jembatan Java.
- `app/src/main/java/id/sus/ruangbaca/AdBlock.java`: daftar domain iklan.
- `app/src/main/assets/inti.js`: sama persis dengan `app/inti/inti.js` versi PC.
- `app/src/main/assets/ui/data.js`: sama persis dengan `lib/data.js` versi PC (format data & ekspor sama).
- `app/src/main/assets/ui/`: tampilan Rak Buku (engine.js, ui.js, ui.css).

Data tersimpan di folder privat aplikasi (`files/data/ruangbaca.json`, `files/covers/`). Menghapus aplikasi = data hilang, jadi ekspor dulu.
