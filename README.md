# Potong Studio — demo pemesanan jasa edit video

Demo PHP untuk landing page, login/registrasi, pemesanan, dashboard klien, dan dashboard admin. Pesanan, akun, dan status disimpan di MySQL agar akun admin dapat melihat pesanan yang dibuat klien.

## Menjalankan dengan XAMPP atau Laragon

1. Jalankan Apache dan MySQL dari XAMPP/Laragon.
2. Buat database bernama `potong_studio` lewat phpMyAdmin.
3. Impor `database/schema.sql` ke database tersebut.
4. Salin `.env.example` sebagai `.env`. Sesuaikan `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, dan `DB_PASSWORD` dengan MySQL lokal. Konfigurasi bawaan cocok dengan MySQL XAMPP/Laragon standar (`root`, tanpa password).
5. Aktifkan ekstensi PHP `pdo_mysql`, lalu jalankan:

```sh
php database/seed.php
php -S 127.0.0.1:8000 router.php
```

Buka `http://127.0.0.1:8000`. Akun demo admin: `a` / `a`; klien: `b` / `b`. Admin melihat pesanan klien dari menu **Pesanan klien**. Klien melihat miliknya pada **Pesanan saya**.

## Deploy ke Vercel

`vercel.json` mengarahkan halaman ke runtime PHP dan aset ke `public/assets`. Untuk menyimpan dan berbagi pesanan lintas akun di Vercel, isi variabel lingkungan MySQL dengan database hosted yang dapat diakses Vercel. Database localhost XAMPP/Laragon hanya dapat dipakai saat situs dijalankan di komputer lokal.

## Catatan demo

- Login memakai sesi PHP; password disimpan dengan `password_hash`.
- Pelanggan hanya melihat pesanannya sendiri; admin dapat melihat dan memperbarui semua pesanan.
- Tidak ada payment gateway. Harga pada paket merupakan estimasi demo.
