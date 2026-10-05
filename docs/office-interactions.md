# Kantor 3D StoneBox SaaS AI+ERP

`default` mendapat ruangan CEO. Setiap profile dengan nama mengandung `manager`
(tidak peka huruf besar/kecil) mendapat ruangan sendiri. Profile lainnya mendapat
meja tetap di ruang bersama. Ruang dan kapasitas rapat mengikuti roster Hermes.

Papan di ruang rapat menampilkan Kanban asli, diperbarui setiap 15 detik.
Klik papan atau tombol **Kanban** untuk detail. Tombol **Rapat bersama (visual)**
mengumpulkan karakter di ruang rapat tanpa menjalankan perintah pada Hermes atau
mengubah status kerja. Akhiri rapat untuk kembali ke aktivitas masing-masing.

## Aktivitas idle (visual saja)

Agen berstatus `Idle` kini memakai rangkaian aktivitas dengan reservasi tempat:

- Dua tempat membuat kopi di pantry; proses sekitar 10 detik **setelah tiba**.
- Membawa satu gelas ke kursi/sofa yang telah dipesan, duduk, lalu meletakkannya
  di meja. Selama sekitar 44 detik, agen sesekali mengangkat gelas, minum, dan
  menaruhnya kembali. Agen sendirian melihat TV; jika ada teman yang sudah duduk,
  mereka bergantian melihat TV dan melakukan gestur mengobrol.
- Dua posisi bermain biliar, dengan stik, giliran menyodok, dan bola bergerak.
  Setelah sekitar 26 detik, agen dapat berpindah ke pantry.
- Jika semua tempat penuh, agen beristirahat di mejanya dan mencoba lagi.

Durasi tidak dihitung selama perjalanan. Polling Hermes tidak mengulang animasi
dari awal. Aktivitas berhenti ketika status bukan `Idle`, rapat dimulai, atau ada
event serah tugas. Gelas dan stik dibersihkan saat interupsi. Tidak ada perintah
Hermes, konsumsi token model, atau perubahan tugas dari aktivitas dekoratif ini.

## Subagen otomatis (`delegate_task`)

Tanpa integrasi tambahan, StoneBox SaaS AI+ERP membaca berkas runtime Hermes setiap polling
office (cache 10 detik), lewat satu skrip `sh` baca-saja yang tetap, dijalankan di
tempat Hermes berada (lokal, `docker exec`, atau SSH):

- `<home profile>/gateway_state.json`: `gateway_state: "running"` dengan
  `active_agents > 0` berarti gateway sedang memproses permintaan → `Working`
  ("Handling a gateway request"), kecuali ada bukti lain yang lebih spesifik.
- `<home profile>/cache/delegation/live/deleg_*/manifest.json`: hanya folder yang
  berubah dalam 30 menit terakhir. Tugas `running` dianggap hidup selama
  `task-<n>.log` masih ditulis (maks. 15 menit tanpa baris baru); manifest yang
  ditinggal crash otomatis diabaikan.

Di kantor 3D, subagen (karakter kecil berwarna pemiliknya) muncul di meja pemilik
untuk menerima tugas (~7 detik), lalu bekerja di meja rapat dari ujung terjauh.
Setelah selesai, subagen kembali melapor ke pemilik selama 1 menit lalu hilang.
Pemilik berstatus `Working` · "Delegating to N subagents". Tujuan (`goal`) tugas
ditampilkan setelah disamarkan secretnya dan dipotong 160 karakter. Riwayat lama
tidak diputar ulang. Delegasi yang lebih singkat dari interval polling bisa
terlewat, kecuali tetap terlihat sebagai "melapor" selama 1 menit setelah selesai.

## Event delegasi antar-profile

Log aktivitas umum Hermes tidak selalu menyimpan pasangan pengirim/penerima.
StoneBox SaaS AI+ERP tidak menebaknya dari status `Working`/`Collaborating` atau kesamaan
judul tugas. Integrasi yang melakukan delegasi perlu mengirim event berikut
**setelah** delegasi asli berhasil:

```sh
curl -X POST http://127.0.0.1:7777/api/office/interactions \
  -H 'Content-Type: application/json' \
  -d '{"id":"task-123-handoff-1","from":"project-manager","to":"coding-agent","label":"Implementasi login","durationSeconds":90}'
```

Nama harus sama dengan profile yang sudah tersedia di StoneBox SaaS AI+ERP. Endpoint ini
hanya menggerakkan visual, tidak memberikan tugas. ID yang sama bersifat idempotent
selama event aktif. Durasi 15–180 detik; default 90. Event disimpan sementara dalam
memori, hilang setelah kedaluwarsa, restart, atau pergantian koneksi Hermes.
Jika beberapa event melibatkan agen yang sama, event terbaru mendapat prioritas.
Rapat visual sementara mengambil prioritas atas kunjungan.

- Manager → agen: penerima datang ke meja manager.
- Agen → manager: pengirim datang ke meja manager.
- Agen → agen: pengirim datang ke meja penerima.
- Manager → manager: penerima datang ke manager pengirim.

Alternatif untuk Hermes remote: tulis marker berikut dalam **agent log profile
pengirim**, sehingga terbaca oleh `hermes -p <profile> logs agent` lewat koneksi
SSH/Docker yang sudah dikonfigurasi:

```text
MYCOMPANY_HANDOFF {"id":"task-123-handoff-1","from":"project-manager","to":"coding-agent","label":"Implementasi login","startedAt":"2026-10-03T10:00:00Z","durationSeconds":90}
```

Gunakan timestamp UTC saat kejadian (contoh di atas perlu diganti). Jam mesin harus
sinkron. Marker harus masuk ke 80 baris terakhir log 3 menit terakhir. Marker bukan
format bawaan Hermes; tambahkan pada workflow/plugin delegasi yang Anda gunakan.
Subagen `delegate_task` sudah otomatis (lihat atas); event ini untuk delegasi antar-profile.

API StoneBox SaaS AI+ERP tetap terikat pada loopback. Dari VPS, jangan membuka port dashboard
ke internet hanya untuk event. Gunakan marker log via SSH atau tunnel SSH khusus.
Polling office setiap 10 detik; waktu baca Hermes dapat menambah latensi.
