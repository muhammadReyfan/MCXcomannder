# MCX Command Center — Full-stack MVP

Aplikasi personal productivity full-stack: dashboard, tasks, projects, goals, milestones, habits, fitness, study planner, finance, savings, analytics, weekly review, dan autentikasi.

## Kebutuhan
- Windows 10/11
- Node.js 20 atau lebih baru (Node 24 juga bisa)
- PostgreSQL 15 atau lebih baru
- VS Code (opsional)

## 1. Siapkan database PostgreSQL

Instal PostgreSQL dari situs resmi PostgreSQL untuk Windows jika belum ada. Saat instalasi, ingat password role `postgres` yang dibuat. Buka pgAdmin atau SQL Shell (psql), lalu jalankan:

```sql
CREATE DATABASE mcx_command_center;
```

Jangan mengetik `CREATE DATABASE` di PowerShell biasa; perintah itu dijalankan di pgAdmin Query Tool atau psql.

## 2. Siapkan project di Windows

Ekstrak ZIP ini, lalu buka folder `mcx-command-center` di VS Code. Di terminal VS Code jalankan:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` menggunakan Notepad atau VS Code. Ganti `CHANGE_ME` dengan password PostgreSQL lu. Isi `SESSION_SECRET` dengan string acak panjang minimal 32 karakter. Jangan unggah `.env` ke Git atau kirim ke orang lain.

Contoh format `DATABASE_URL`:

```text
DATABASE_URL=postgresql://postgres:PasswordPostgresLu@localhost:5432/mcx_command_center
```

Jika password mengandung karakter khusus seperti `@`, `#`, atau `/`, URL-encode karakter tersebut atau gunakan password lokal yang tidak mengandung karakter URL khusus.

## 3. Buat tabel dan jalankan

```powershell
npm run db:init
npm start
```

Buka `http://localhost:3000`. Buat akun dari halaman pendaftaran. Aplikasi hanya menyimpan data setelah login. Untuk mode pengembangan dengan restart otomatis: `npm run dev`.

## Fitur
- Auth: registrasi, login, logout; password di-hash dengan bcrypt; sesi disimpan di PostgreSQL.
- Tasks: tambah/edit/hapus, status selesai, prioritas, kategori, deadline, pencarian.
- Projects, goals, milestones, habits, fitness logs, study sessions, transaksi finance, savings goals, weekly reviews.
- Dashboard agregat dan analytics.
- Ekspor JSON per modul.
- Impor eksplisit tugas lama dari localStorage browser lama.

## Migrasi aman dari MVP lama
1. Jangan clear browsing data atau menghapus key `mcx-command-center-tasks-v1`.
2. Buka versi lama di browser/profil yang sama dan pastikan tugas masih terlihat. `localStorage` terikat ke origin, jadi data `file://`, `127.0.0.1:5500`, dan `localhost:3000` adalah penyimpanan yang berbeda.
3. Buka versi baru di browser/profil yang sama. Login/buat akun.
4. Buka Tasks → klik **Impor tugas lama dari browser** → konfirmasi.
5. Periksa jumlah data yang diimpor. Impor menyalin tugas dan tidak menghapus data lokal. ID lama dicatat di notes untuk membantu melewati impor duplikat.
6. Jika versi lama dibuka dari origin berbeda, ekspor data dari console browser lama sebelum menutupnya:

```javascript
copy(localStorage.getItem('mcx-command-center-tasks-v1'))
```

Simpan hasilnya di file teks lokal yang aman. Jangan paste data pribadi ke situs publik. Impor manual dari file belum disediakan di MVP ini; minta bantuan untuk menyesuaikan importer jika origin berbeda.

## Uji fitur (acceptance / end-to-end manual)
1. Health: buka `http://localhost:3000/api/health`; harus ada `ok: true` dan `database: connected`.
2. Registrasi akun A; masuk ke dashboard.
3. Tasks: tambah, edit, tandai selesai, cari, ekspor JSON, hapus.
4. Refresh browser; data masih ada dari PostgreSQL.
5. Projects dan Goals: tambah, edit, hapus; pastikan perubahan tampil.
6. Milestones: buat goal dahulu, catat ID goal yang ditampilkan di kartu, lalu buat milestone dengan ID tersebut.
7. Habits: tambah habit, klik “Tandai hari ini”; klik lagi untuk mengubah status log hari ini.
8. Fitness dan Study: tambah aktivitas/sesi dengan durasi; dashboard harus mencerminkan menit 7 hari terakhir.
9. Finance: tambahkan pemasukan dan pengeluaran nominal positif; dashboard memperlihatkan total bulan ini.
10. Savings: tambahkan target, isi jumlah terkumpul, dan cek progres analytics.
11. Weekly Review: isi tanggal mulai minggu, pencapaian, kendala, dan rencana.
12. Buat akun B di browser lain/incognito; akun B tidak boleh melihat data akun A.
13. Logout; API `/api/tasks` harus mengembalikan HTTP 401.
14. Impor legacy: uji hanya setelah memastikan ada data di key lama; pastikan data lama tetap ada setelah impor.

## Catatan penting / batasan MVP
- Ini fondasi yang bisa dijalankan, bukan aplikasi production yang sudah diaudit. Sebelum dipublikasikan ke internet, tambahkan rate limiting login, proteksi CSRF yang sesuai, verifikasi email, kebijakan privasi, backup otomatis, logging/audit, dan pengujian keamanan.
- Set `NODE_ENV=production` hanya di lingkungan HTTPS; cookie session menjadi secure.
- Pastikan reverse proxy HTTPS dikonfigurasi dengan benar sebelum mengandalkan secure cookie.
- Habit streak, jadwal berulang, edit/delete habit log terpisah, grafik historis mendalam, dan relasi UI otomatis antara goals dan milestones masih dapat ditingkatkan.
- Data lama di localStorage tidak pernah dihapus otomatis. Selalu backup database sebelum migrasi besar.
