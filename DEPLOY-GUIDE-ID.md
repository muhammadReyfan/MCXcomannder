# MCX Command Center — Panduan Deploy Aman

## Isi paket
- Source Express dan frontend tetap dipertahankan.
- `node_modules/` dan `.env` lokal sengaja tidak disertakan.
- PostgreSQL lokal tidak diubah.
- `render.yaml` menyiapkan konfigurasi layanan web; kredensial harus diisi langsung di dashboard hosting.

## Arsitektur
- Backend: Render Web Service (free plan jika tersedia pada akun/region).
- Database produksi: PostgreSQL cloud terpisah, misalnya Neon.
- PostgreSQL di laptop tetap untuk development. Data lokal tidak otomatis disalin ke database cloud.

## Langkah
1. Buat repository GitHub baru dan private.
2. Ekstrak paket ini, lalu unggah file project ke repository. Pastikan `.env` tidak ikut terunggah. `.gitignore` sudah mengabaikan `.env` dan `node_modules/`.
3. Buat PostgreSQL cloud. Simpan connection string secara pribadi.
4. Di hosting, buat Web Service dari repository. Build command `npm ci`; start command `npm start`; health check `/api/health`.
5. Atur environment variables di dashboard hosting:
   - `NODE_ENV` = `production`
   - `TRUST_PROXY` = `true`
   - `DATABASE_URL` = connection string PostgreSQL cloud
   - `SESSION_SECRET` = string acak panjang minimal 32 karakter
   - `PGSSL` = `true` bila provider mewajibkan SSL (umumnya database cloud mewajibkan TLS)
6. Jalankan skema SQL `sql/schema.sql` satu kali pada database cloud, atau jalankan `npm run db:init` dengan `DATABASE_URL` cloud dari terminal yang aman. Jangan tempel connection string ke chat atau commit.
7. Buka `https://alamat-layanan/api/health`. Harus menampilkan `ok: true` dan `database: connected`.
8. Uji daftar akun, login, tambah/edit/hapus data, logout, dan akses dari HP.

## Penting
- `DATABASE_URL` harus berasal dari database cloud, bukan `localhost`, untuk aplikasi online.
- `SESSION_SECRET` harus rahasia, panjang, dan berbeda dari password database.
- Jangan aktifkan `PGSSL=true` jika provider menggunakan sertifikat nonstandar yang perlu konfigurasi CA khusus; ikuti petunjuk provider.
- Paket free dapat tidur, punya batas kuota, atau kebijakan berubah. Jangan anggap SLA 24/7 dijamin pada tier gratis.
- Sebelum menggunakan data penting, siapkan backup dan uji pemulihan.
- Jangan jalankan migrasi ke database produksi sebelum memeriksa target connection string secara lokal.

## Cara kerja data login dan Habit Tracker
- Akun tersimpan di tabel `users`; password disimpan sebagai hash bcrypt, bukan teks biasa.
- Sesi login disimpan di tabel PostgreSQL `user_sessions`, sehingga sesi tidak bergantung pada memori server saja. Cookie sesi di browser memakai `httpOnly` dan masa berlaku 7 hari.
- Habit tersimpan di tabel `habits`, sedangkan tanda selesai per tanggal tersimpan di `habit_logs`.
- Semua endpoint data memakai sesi login dan filter `user_id`, sehingga pengguna hanya mengambil data miliknya.
- Saat deploy, gunakan database cloud yang sama untuk backend produksi. Database laptop (`localhost`) hanya bisa dipakai selama laptop dan server lokal hidup; hosting internet tidak dapat mengakses `localhost` laptop secara langsung.
- Kalau ingin data akun lokal lama ikut pindah, ekspor/backup database dan migrasikan dengan hati-hati ke database cloud. Membuat database cloud baru tidak otomatis menyalin akun, habit, maupun log lokal.

## Checklist tes setelah deploy
1. Daftar akun tes menggunakan email yang belum pernah dipakai.
2. Tambah habit, lalu tekan `Tandai hari ini`.
3. Muat ulang halaman dan cek `/api/habits/logs` saat sudah login; catatan tanggal harus tetap ada.
4. Logout lalu login kembali dengan akun yang sama; habit dan riwayat harus tetap ada.
5. Buat akun kedua dan pastikan akun kedua tidak melihat habit akun pertama.
6. Jangan masukkan data pribadi penting sebelum backup dan pemulihan database sudah diuji.
