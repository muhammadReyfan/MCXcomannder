# MCX Command Center acceptance checklist

Jalankan setelah `npm run db:init` dan `npm start`.

- [ ] GET `/api/health` memberi `200` dan database connected.
- [ ] Registrasi dengan password kurang dari 10 karakter ditolak `400`.
- [ ] Registrasi email valid berhasil; email duplikat ditolak `409`.
- [ ] Login salah ditolak `401`; login benar berhasil.
- [ ] Logout mengakhiri sesi; endpoint terlindungi mengembalikan `401`.
- [ ] Akun A membuat task dan akun B tidak dapat melihat/mengubah/menghapus task A.
- [ ] CRUD tasks bekerja, termasuk completed toggle, pencarian UI, filter UI, dan deadline.
- [ ] CRUD projects, goals, milestones, habits, fitness, study, finance, savings, reviews bekerja.
- [ ] Finance menolak tipe transaksi tak dikenal dan nominal <= 0.
- [ ] Fitness/study menolak durasi negatif melalui constraint database.
- [ ] Habit log dapat ditoggle per tanggal; tanggal yang sama tidak membuat duplikat.
- [ ] Dashboard menampilkan ringkasan yang berasal dari database.
- [ ] Ekspor JSON menghasilkan file yang dapat dibaca.
- [ ] Legacy import tidak menghapus key localStorage; pengulangan impor melewati item yang sudah ditandai.
- [ ] Browser reload tidak menghilangkan data yang tersimpan.
- [ ] Tampilan diuji pada lebar desktop dan mobile.

Catatan: checklist ini adalah prosedur acceptance manual; belum mengklaim tes browser otomatis dijalankan.
