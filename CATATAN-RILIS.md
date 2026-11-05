# Ruang Baca HP — Catatan Rilis










## 0.3.0
- **Simpan chapter untuk offline:** buka chapter, lalu ⋮ → *Simpan chapter untuk offline*. Gambar chapter disimpan di penyimpanan aplikasi (tidak muncul di Galeri).
  - Judul yang punya chapter offline diberi tanda ⤓ di Rak Buku. Menu ⋮ judul → *Baca offline* menampilkan daftarnya: baca tanpa internet, pindah ke chapter offline berikutnya, atau hapus.
  - Pembaca offline: gulir ke bawah, ketuk gambar untuk menyembunyikan/memunculkan bilah, tombol Kembali HP untuk keluar.
  - Hanya gambar yang memang tampil dan bisa diunduh dari halaman itu yang disimpan; chapter terkunci tetap terkunci.
- **Pengelola unduhan:** ⋮ → *Unduhan* (atau Pengaturan → Unduhan). Daftar file yang diunduh dari situs, lengkap dengan progres, tombol Buka, Batal, dan Hapus (hapus file atau hanya dari daftar). Pilihan folder simpan: *Download/RuangBaca* atau *Download*.
- **Bilah alamat bisa disembunyikan** (Pengaturan → Tampilan → Bilah alamat): *Selalu tampil* (bawaan), *Sembunyi saat gulir* (hilang saat gulir ke bawah, muncul saat gulir ke atas), atau *Tombol melayang* ☰ (bisa digeser) untuk memunculkan/menyembunyikan.
- **Reset:** tombol *Kembalikan warna & kontras ke bawaan* (bawaan kontras 115%, ikut mengembalikan yang diubah per situs), tombol *↺ Kembalikan ke bawaan* di menu hitam putih pada halaman, dan *Reset semua pengaturan* (rak, favorit, PIN, dan aturan situs tidak terhapus).

## 0.2.7
- **Dua tema baru:**
  - **Senja**: cokelat hangat dengan aksen oranye, sedikit cahaya biru. Nyaman untuk baca malam sebelum tidur.
  - **Matcha**: hijau teh lembut. Terang tapi tidak silau, cocok untuk baca siang.
- Pilihan tema sekarang 6 (Kertas, Gelap, Senja, Matcha, Neon gelap, Neon putih), tersusun 3 kolom.

## 0.2.6
- **Pasang ulang tanpa unduh ulang:** kalau layar pemasangan Android tadi dibatalkan (mis. saat Google Play Protect menawarkan pindai), sekarang ada tombol **Pasang sekarang**. APK yang sudah diunduh langsung dipakai lagi, juga setelah aplikasi ditutup dan dibuka kembali.
- Catatan rilis dari GitHub ditampilkan rapi (judul dan poin), bukan tanda `###` dan `-` mentah.

## 0.2.5
- **Tema baru: Neon gelap dan Neon putih** (menggantikan Batik). Pengguna tema Batik otomatis pindah ke Neon gelap. Bilah atas dan bilah navigasi HP ikut berwarna sesuai tema.
- **Pengaturan lebih rapi:** pilihan Tema dan Mesin pencari kini di bawah judulnya dan selebar layar, tidak lagi berdesakan dengan teks penjelasan.

## 0.2.4
- **Cek pembaruan diperbaiki:** dulu hanya rilis yang ditandai "Latest" di GitHub yang dilihat, dan versinya hanya dibaca dari tag. Rilis yang ditandai pra-rilis, atau yang tag-nya bukan nomor versi, jadi tidak terdeteksi.
  - Sekarang semua rilis diperiksa (kecuali draf). Versi aplikasi dibaca dari **nama file .apk** (mis. RuangBaca-0.2.4.apk), jadi tag rilis boleh punya penomoran sendiri (mis. v0.1.5). Kalau nama APK tidak bernomor, baru dipakai tag atau judul rilis.
  - Di Pengaturan → Pembaruan sekarang tertulis rilis tertinggi yang ditemukan di GitHub (dan tag-nya), supaya mudah dicek kalau ada yang tidak cocok.

## 0.2.3
- **DNS diperbaiki:** sebelumnya Ruang Baca hanya memakai DoH (HTTPS ke 1.1.1.1). Kalau jalur itu diganggu penyedia internet, Ruang Baca diam-diam kembali ke DNS bawaan, jadi situs yang diblokir tetap tidak terbuka.
  - Sekarang yang dicoba duluan **DNS-over-TLS (port 853)**, jalur yang sama dengan "DNS pribadi" Android. Kalau gagal, baru DoH, lalu server cadangan (1.0.0.1, 8.8.4.4, dst.). Jalur yang berhasil diingat dan dipakai duluan.
  - **Tes DNS** di Pengaturan menampilkan jalur yang sedang dipakai, atau memberi tahu kalau server DNS tidak bisa dihubungi.

## 0.2.2
- **Tombol Perbarui**: Ruang Baca mengecek rilis terbaru di GitHub (mikotos59-dotcom/RuangBaca-Apk). Kalau ada versi baru, muncul kotak di atas Rak Buku dengan tombol **Perbarui**: APK diunduh, lalu layar pemasangan Android terbuka. Data rak tidak hilang.
  - Cek otomatis saat aplikasi dibuka (paling sering 12 jam sekali), bisa dimatikan. Cek manual di Pengaturan → Pembaruan, lengkap dengan catatan rilisnya.
  - Pertama kali, Android meminta izin "pasang aplikasi tidak dikenal" untuk Ruang Baca.
  - Supaya bisa menimpa versi lama, APK di rilis harus dirakit dengan kunci tanda tangan yang sama (Pabrik SuS).

## 0.2.1
- **Mesin pencari bawaan: Startpage** (hasil pencarian Google tanpa melacak dan tanpa menyimpan riwayatmu). Pilihan Google / DuckDuckGo / Bing tetap ada di Pengaturan. Pengguna lama yang masih memakai Google otomatis dipindah sekali ke Startpage.
- **Sampul setelah impor dari PC:** file ekspor memang tidak membawa gambar sampul. Sekarang setelah impor, sampul langsung diambil lagi dari halaman judul masing-masing (satu per satu di belakang layar). Buku yang belum bersampul juga dicoba lagi saat aplikasi dibuka (paling sering 3 hari sekali per buku).
- **Pilih sampul di HP diperbaiki:**
  - Ketukan langsung dipakai untuk memilih, jadi situs tidak sempat membuka tautan di bawah jari.
  - Kalau gambarnya tidak bisa diunduh (dilindungi situs, gambar kanvas, dsb.), sampul diambil langsung dari tampilan layar di posisi gambar itu.

## 0.2.0
- **Perbaikan:** ikon situs favorit sekarang muncul. Ikon diambil otomatis dari situsnya (ikon aplikasi/apple-touch-icon, ikon halaman, lalu favicon.ico), dan ikut diperbarui saat situsnya dibuka. Kalau situs tidak punya ikon, tetap tampil huruf berwarna.
- **DNS (opsional)** di Pengaturan: Bawaan, Cloudflare 1.1.1.1, Google 8.8.8.8, Quad9, AdGuard (ikut blok iklan), atau alamat DoH sendiri.
  - Hanya berlaku di Ruang Baca; setelan DNS HP tidak diubah.
  - Lewat jalur terenkripsi (DNS-over-HTTPS). Sambungan ke situs tetap HTTPS ujung ke ujung.
  - Butuh Android System WebView yang cukup baru (versi 2019 ke atas); kalau terlalu lama, muncul pemberitahuan.

## 0.1.0 (versi HP pertama, "inti dulu")
- Browser komik dengan kolom alamat/pencarian, tombol ☆ simpan ke rak, 📚 Rak Buku, dan menu ⋮.
- Blok iklan tingkat domain (EasyList + ABPindo + filter DNS AdGuard, diperbarui otomatis tiap minggu). Hanya iklan dari situs lain yang diblok. Bisa diizinkan per situs lewat menu ⋮.
- Pop-up: tanpa ketukan selalu diblok. Pop-up dari ketukan ke situs yang sama dibuka di tempat; ke situs lain muncul bilah "Buka / Selalu".
- Halaman yang dibajak iklan saat klik pertama diblok.
- Fitur inti sama dengan PC (tombol melayang buku): hitam putih, mode gelap situs, mode baca strip/per halaman, gulir otomatis (ketuk layar = jeda), pilih sampul, sembunyikan elemen, izinkan tombol, ajari alamat situs.
- Rak Buku, situs favorit, rak privat (PIN awal A123, terpisah dari PC).
- Pindah data PC ↔ HP lewat Pengaturan → Ekspor / Impor (file .json yang sama dengan versi PC). Sampul dan PIN tidak ikut.
- Unduhan biasa masuk ke Download/RuangBaca (lewat pengelola unduhan Android).
- Buka link dari aplikasi lain lewat "Bagikan" atau "Buka dengan".

Belum ada di versi HP: Rak Offline, unduh otomatis (bot), mode latar, unduhan blob/POST, zoom halaman dari menu (pakai cubit dua jari).
