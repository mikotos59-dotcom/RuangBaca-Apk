# Ruang Baca HP — Catatan Rilis



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
