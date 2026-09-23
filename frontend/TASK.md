# Frontend pass — scope dan task

## Motion lanjutan — 2026-09-23

- [x] Sidebar desktop collapse/expand, preference lokal, dan FLIP retarget.
- [x] Drawer kiri dengan enter/exit, backdrop fade, Escape, serta cleanup modal.
- [x] Hover/press konsisten pada shell, task, checker, landing, dan wallet controls.
- [x] Confirmation dialog + backdrop selaras; guard klik ganda tetap.
- [x] Subagent implementasi smooth scroll global; wheel/touch tetap native.
- [x] Guard keyboard/focus/history/reduced-motion; tanpa dependency baru.
- [x] 72 tes frontend, 2 tes docs, typecheck, dan build lolos; fokus lintas route diperbaiki setelah review.
- [ ] Cek visual browser: rapid toggle, focus return, backdrop, mobile, reduced-motion.


## Rework workspace — 2026-09-23

- [x] Pertahankan landing sekarang; tidak membuat branch atau rename brand.
- [x] Rapikan sidebar, breadcrumb route, serta heading Agreements/New agreement.
- [x] Bedakan gate konfigurasi, loading sesi, dan sign-in; beri akses checker publik.
- [x] Tambah ikon SVG fungsional tanpa dependency baru atau label icon-only.
- [x] Implementasi daftar dan uji helper pencarian lokal; role/status, empty state, dan limit 50 dipertahankan.
- [x] 57 tes frontend, 2 tes docs, typecheck, dan production build lolos setelah integrasi.
- [ ] Cek visual desktop/mobile, keyboard, dan wallet nyata di browser.


## Redesign setelah feedback visual

- [x] Audit source: hapus slogan berpasangan, hero split generik, dan kartu promo bertumpuk.
- [x] Jalankan Python randomizer; seed 56228331 dan pilihan dicatat di DESIGN.md.
- [x] Terapkan layout document-led, Newsreader + IBM Plex Sans, dan indeks checks bergaris.
- [x] Ganti contoh statik dengan sample yang memanggil checker Go setelah klik.
- [x] Perubahan sample menghapus hasil lama; response usang tidak boleh muncul kembali.
- [x] Jaga cream–coral, auth/task boundaries, reduced motion, dan alur workspace.
- [ ] Screenshot, typography wrap, dan pointer/keyboard feel-check di browser nyata.

Nama Pactra berlaku di desain, runtime, auth, konfigurasi, dan repo.
Rename lintas aplikasi ditangani dalam pass terpisah; langkah deploy ada di
[panduan rename](../docs/RENAMING.md).


Tanggal rencana: 2026-09-23.
Status: implementasi awal tersedia. [x] pada scope berarti kode sudah ada; bukan bukti uji browser atau wallet nyata.
Bukti uji dan batas rilis: ../docs/FRONTEND_PASS_VERIFICATION.md.

## Target

Bangun workspace untuk kesepakatan privat dan pemeriksaan JSON localization.
Bukan marketplace. Batas task: accepted_unfunded. Kesepakatan diterima, dana belum ada.
UI tetap English. Catatan kerja ini memakai Bahasa Indonesia.

## Acuan dan kondisi awal

- ../docs/FRONTEND_WORKSPACE_HANDOFF.md: integrasi frontend.
- ../docs/PERSISTENT_BACKEND.md: batas auth, task, dan operasi.
- ../backend/internal/workspace/README.md: kontrak API workspace.
- ../docs/API.md dan ../docs/CHECKER.md: checker deterministik.
- ../docs/AZURE_AI.md: AI opsional dan batas publikasi.
- ../docs/SETTLEMENT_DECISIONS.md: gate sebelum uang bergerak.
- DESIGN.md: arah visual.

Docs starter belum seluruhnya diperbarui. Jika status berbeda, cek handoff baru,
kontrak API, dan kode. Usulan produk bukan bukti endpoint sudah ada.

Sudah ada: checker di /, BFF check/review, Azure review opsional, serta Go wallet
auth, task privat, immutable manifest, accept/cancel.
Belum ada: RainbowKit, UI task, BFF sesi, funding, settlement, submission tersimpan.

## Peta halaman

| Route | Isi | Akses / indeks |
| --- | --- | --- |
| / | Ringkasan produk, cara kerja, batas fitur, CTA | Publik; boleh indeks |
| /checker | Checker mandiri dan evidence source/output | Publik; boleh indeks |
| /tasks | Daftar task, filter peran/status, aksi berikut | Login; noindex |
| /tasks/new | Form, tinjau terms, kirim undangan | Login; noindex |
| /tasks/[id] | Manifest utuh, status, accept/cancel | Buyer/worker terkait; noindex |
| /dashboard | Redirect ke /tasks; bukan dashboard kedua | Tujuan wajib login |

Checker mandiri bukan pengiriman hasil ke task. Manifest kini belum punya field
khusus untuk seluruh aturan/version checker. Jangan klaim hasil terikat penuh
pada kesepakatan atau tersimpan sebagai submission.

## Scope pengerjaan

### 1. Fondasi dan shell

- [x] Selaraskan docs frontend yang usang dengan fitur nyata.
- [x] Pakai DESIGN.md baru: cream canvas, coral, warm ink, dan charcoal untuk evidence.
- [x] Serif hanya untuk landing; workspace memakai sans yang jelas, JSON memakai mono.
- [x] Pakai token kontras/state yang sudah diselaraskan; jangan salin logo atau UI Claude.
- [x] Buat token warna, tipografi, spacing, focus, dan status yang konsisten.
- [x] Buat public header, app shell, sidebar, dan navigasi mobile.
- [x] Pindah checker ke /checker tanpa merusak perilaku lama.
- [x] Buat landing ringkas; tanpa klaim escrow, audit, atau pembayaran aktif.
- [x] Pakai data nyata atau fixture berlabel; tanpa statistik rekaan.

### 2. RainbowKit dan wallet login

- [x] Pasang @rainbow-me/rainbowkit, wagmi, viem, @tanstack/react-query.
- [x] Cek kompatibilitas versi; pin versi dan gunakan lockfile root saja.
- [x] Pasang provider SSR, chain eksplisit, dan RainbowKit ConnectButton.
- [x] Pisahkan wallet connected dari session authenticated.
- [x] Ambil challenge Go; sign pesan persis dari server, bukan pesan rekonstruksi.
- [x] Verify challenge_id dan signature lewat BFF.
- [x] Tangani user reject, challenge habis, rate limit, dan salah chain.
- [x] Ganti akun/chain: hentikan request lama, hapus cache privat, invalidasi sesi.
- [x] Abaikan hasil login lama setelah akun/chain berubah.
- [x] Dukung EOA saja; jangan klaim EIP-1271/smart-contract wallets.

### 3. BFF sesi dan API privat

- [x] Buat BFF challenge, verify, me, logout, list/create/detail/accept/cancel.
- [x] Browser hanya memanggil Next; proxy Go memakai target tetap/terbatas.
- [x] Simpan bearer sebagai cookie HttpOnly; Secure pada HTTPS dan SameSite.
- [x] Bearer tidak masuk JavaScript, localStorage, log, atau telemetry.
- [x] Tambah validasi origin/CSRF untuk mutasi berbasis cookie.
- [x] Gunakan origin tepercaya dari config, bukan host internal Next.
- [x] Cocokkan umur cookie dengan sesi Go; hapus saat sesi tidak valid.
- [x] Logout mencabut sesi Go; jangan klaim revocation sukses jika gagal.
- [x] Respons privat memakai no-store; tidak ada cache lintas akun.
- [x] Batasi body/timeout, validasi response, dan sanitasi error upstream.
- [x] Bedakan schema error workspace dan checker; jangan parse teks pesan.

### 4. Daftar task

- [x] Muat daftar setelah sesi valid; filter buyer/worker dan status.
- [x] Sediakan loading, empty, error, session expired, dan retry manual.
- [x] Nyatakan batas 50 task terbaru; API belum punya pagination.
- [x] Jangan tampilkan statistik seolah mencakup seluruh riwayat.
- [x] Countdown/expired hanya tampilan; Go menentukan validitas undangan.

### 5. Buat task

- [x] Form: title, source, worker, primary/backup arbiter, dan deadline.
- [x] Deliverable: ID, title, criteria, amount, revision limit, review period.
- [x] Validasi mengikuti batas API workspace, bukan checker mandiri.
- [x] Semua pihak berbeda; arbiter hanya dari daftar resmi tim.
- [x] Tentukan sumber config arbiter UI yang cocok dengan allowlist Go.
- [x] Blok pengiriman dengan alasan jelas jika arbiter belum dikonfigurasi.
- [x] Amount berupa decimal string; total memakai BigInt, bukan float.
- [x] Jangan format base units sebagai BOT/USD tanpa asset/decimals yang disepakati.
- [x] Tampilkan timezone deadline; konversi UTC dengan jelas.
- [x] Tinjau seluruh terms; default tidak diam-diam menjadi persetujuan.
- [x] Setelah sukses, buka detail dengan manifest/hash dari server.
- [x] Jangan retry otomatis saat create timeout; API belum punya idempotency key.
- [x] Jika hasil create tak pasti, beri status jelas dan arahkan cek daftar task.
- [x] Draft hanya di memori; source privat tidak masuk localStorage.

### 6. Detail dan aksi kesepakatan

- [x] Tampilkan snapshot source, pihak, chain, allocations, criteria, dan policy utuh.
- [x] Tampilkan hash server; jangan hitung ulang memakai JSON.stringify.
- [x] Worker accept memakai hash persis dari manifest yang ditinjau.
- [x] Buyer cancel sesuai state dan otorisasi Go.
- [x] Minta konfirmasi eksplisit; checker pass tidak memicu accept otomatis.
- [x] Bedakan invited, cancelled, expired, dan accepted_unfunded.
- [x] Timeout accept/cancel atau konflik 409: GET task untuk rekonsiliasi.
- [x] Jangan tampilkan sukses sebelum konfirmasi server.
- [x] 404 berarti tidak ada ATAU tidak dapat diakses; jangan bocorkan keberadaan.
- [x] Tidak ada akses arbiter pre-dispute, edit terms, atau reassignment.

### 7. Checker dan evidence

- [x] Pertahankan key parity, nonblank, placeholder, dan required-term checks.
- [x] Pertahankan raw nested JSON agar duplicate keys tetap ditolak Go.
- [x] Tampilkan ringkasan dan evidence source/output per key.
- [x] Bedakan HTTP 200 dengan checks failed dari error jaringan/input.
- [x] Edit input membatalkan/mengabaikan request lama dan menghapus hasil lama.
- [x] Render submission dan pesan sebagai text, bukan HTML.
- [x] Gunakan “Checks passed”, bukan “Payment approved” atau “AI verified”.
- [x] AI tetap panel terpisah dengan consent eksplisit; edit menghapus consent/review.
- [x] Hormati batas AI 20 keys/16 KiB; busy/unavailable tidak menghasilkan sukses palsu.
- [x] AI hanya lokal sampai auth dan durable per-user spend limits tersedia.
- [x] Pada deploy publik sebelum gate AI selesai, nonaktifkan rute AI, bukan hanya tombol.

### 8. Sitemap dan metadata

- [x] Buat app/sitemap.ts untuk menghasilkan /sitemap.xml.
- [x] Masukkan hanya / dan /checker pada pass ini.
- [x] Canonical origin berasal dari config domain final; bukan domain rekaan.
- [x] lastModified berasal dari perubahan konten; hilangkan jika tidak diketahui.
- [x] Jangan masukkan task ID, dashboard, API, query privat, atau source ke sitemap.
- [x] Buat app/robots.ts; staging tidak diindeks.
- [x] Halaman privat memakai noindex; auth tetap pengaman, bukan robots.
- [x] Title/description sesuai fitur nyata; metadata tidak membocorkan terms privat.

### 9. Micro-interactions dan motion engineering

Rujukan nilai dan perilaku: bagian Motion engineering di DESIGN.md. Motion adalah
scope wajib, bukan polish opsional setelah semua halaman selesai. Status saat ini
sudah implementasi awal. Feel-check browser dan profiling device belum dilakukan.

Skill yang dipakai untuk spesifikasi: animate, emil-design-eng, dan impeccable.
Tahap kode sudah diizinkan pada eksekusi ini; visual QA tetap gate tersendiri.

- [ ] Untuk tiap interaksi, tetapkan tujuan, frekuensi, trigger, property, easing,
      delay, durasi masuk/keluar, origin, interupsi, dan reduced-motion fallback.
- [x] Pakai satu set token motion dari DESIGN.md; jangan menambah timing lokal sembarang.
- [x] Engineer hover/press/release/cancel; hit target tetap, touch tidak mendapat sticky hover.
- [x] Focus/error/keyboard navigation langsung; tidak ada shake field atau animasi saat mengetik.
- [x] Engineer filter, evidence disclosure, dan add/remove deliverable tanpa memindah teks yang dibaca.
- [x] Engineer menu/popover, confirm dialog, dan mobile drawer beserta focus/inert/scroll-lock.
- [x] Rapid open-close-open membalik dari visual kini; tidak antre/restart dari posisi awal.
- [x] Copy hash/address memberi feedback hanya setelah clipboard berhasil, dengan slot label tetap.
- [x] Pending action disable segera; label/ikon tidak mengubah ukuran tombol.
- [x] Hasil checker/AI terbaru boleh fade-in; edit/logout/account switch menghapus yang usang segera.
- [x] State wallet, signature, sesi, acceptance, dan funding tidak digabung oleh animasi sukses.
- [x] Theme RainbowKit melalui API publik; jangan reanimate modal atau override private DOM.
- [x] Reduced motion menghilangkan spatial motion/rotation; feedback penting tetap langsung.
- [x] Cleanup timer, listener, animation handle, dan async work saat unmount atau pergantian akun.
- [x] Tidak bergantung hanya pada animationend untuk unmount/state/focus restoration.
- [x] Konten visible secara default; gagal animasi/hydration tidak boleh menghasilkan panel kosong.
- [ ] Tidak ada transition: all, layout animation per frame, global will-change, atau state update per frame.
- [x] Tidak ada confetti, bounce uang, typewriter, parallax, scroll hijack, atau stagger seluruh list.
- [ ] Uji kontrak motion dengan pointer/touch/keyboard, slow playback, dan profiling.

## Komponen yang direncanakan

Ini batas tanggung jawab, bukan kewajiban satu file per nama. Ekstrak saat dipakai.
Gunakan ulang helper dan pola yang sudah ada.

| Kelompok | Komponen |
| --- | --- |
| Layout | PublicHeader, AppShell, Sidebar, MobileNav, PageHeader |
| Wallet | WalletProviders, RainbowKit ConnectButton, SessionGate, NetworkNotice |
| List | TaskList, TaskFilters, TaskStatusBadge, EmptyState |
| Form | TaskForm, DeliverableFields, ArbiterSelect, ManifestPreview |
| Detail | ManifestDetails, ParticipantList, AgreementActions, ConfirmDialog |
| Checker | JsonInput, RulesFields, CheckSummary, FindingsList, EvidencePanel |
| AI | Rapikan SemanticReview yang sudah ada; pertahankan batas trust |
| Dasar | Button, FormField, InlineAlert, Skeleton, CopyButton |

Gunakan kontrol native jika cukup. Tidak perlu editor berat atau state library tambahan.
Motion CSS-first; WAAPI hanya bila butuh cancel/retarget terprogram. Library motion bukan
syarat pass ini: usulkan hanya untuk kebutuhan yang terbukti dan belum ditangani alat kecil.

## Di luar scope

- Deposit, escrow, token approval, payout, withdrawal, dan transaksi chain.
- Dispute UI, keputusan arbiter, timeout claim, dan revision execution.
- Upload, object storage, versioned submission, dan histori evidence tersimpan.
- Marketplace publik, reputation, token economics, cross-chain.
- AI pembuat terms, penentu acceptance, atau pemberi izin pembayaran.
- ABI/alamat contract rekaan, deployment, provisioning, aktivasi layanan berbayar.
- Pagination backend, idempotency create, dan hardening operasi produksi.

Perubahan Go/schema menjadi dependency terpisah yang perlu disepakati.
Browser tidak menulis langsung ke database/Supabase.

## Status rilis

- [x] Landing, checker/evidence, task UI, RainbowKit, BFF sesi, dan sitemap sudah diimplementasikan.
- [x] HTTP checker nyata melalui Next ke Go: fail, corrected pass, dan duplicate-key rejection.
- [ ] Browser visual/motion QA: runtime tidak menemukan browser tersambung.
- [ ] E2E wallet nyata dan task pada database terisolasi: config chain/arbiter belum diberikan.
- [ ] Audit dependency wallet: masih ada temuan; jangan deploy publik sebelum ditangani.
- [ ] Tidak ada klaim produksi, escrow, atau pembayaran siap.

## Blok dan keputusan yang dibutuhkan

| Kebutuhan | Dampak jika belum ada |
| --- | --- |
| Chain ID, RPC, explorer terverifikasi | Jangan menebak BOT Chain; uji network menunggu |
| Domain/URI auth cocok dengan Go | Login belum dapat diuji pada origin tujuan |
| WalletConnect project ID | WalletConnect belum dapat diuji penuh |
| Arbiter resmi dan sumber config UI | Create task nyata diblok; jangan pakai wallet rekaan |
| Asset dan decimals alokasi | Hanya raw base units berlabel; bukan saldo/token |
| Domain publik final | Canonical sitemap produksi belum final |
| Auth dan durable AI budgets | AI lokal atau nonaktif pada publik |

Localhost dan 127.0.0.1 tidak boleh dianggap sama untuk SIWE. Pakai origin yang
cocok dengan config Go. Config publik tidak memuat secret database, AI, atau sesi.

## Urutan eksekusi

1. Selaraskan docs, token visual, shell, dan rute.
2. Pindah checker; buat landing tanpa menambah klaim fitur.
3. Integrasi RainbowKit dan BFF sesi; uji batas akun/chain.
4. Bangun list/detail, lalu create/accept/cancel.
5. Engineer micro-interactions bersama tiap komponen; rapikan evidence, sitemap, metadata.
6. Jalankan gate test, visual QA, dan motion QA; catat bukti serta blok tersisa.

## Syarat selesai

- [ ] Tidak ada fake success, private-data leak, atau aksi dana.
- [ ] Desktop/mobile tidak overflow; form dapat dipakai dengan keyboard.
- [ ] Input punya label; error/status diumumkan secara aksesibel.
- [ ] Contrast setiap state, focus instan, dan target interaksi minimal 44 x 44px diperiksa.
- [ ] Kontrak motion di DESIGN.md diuji per komponen: timing, easing, origin, exit, interruption.
- [ ] Uji pointer/touch/keyboard, reduced motion yang berubah saat runtime, dan open-close-open cepat.
- [ ] Uji tab hidden, unmount, CPU throttle, slow network, serta focus/scroll-lock saat exit.
- [ ] Tidak ada request tertunda demi animasi, private-content exit fade, atau sukses sebelum server.
- [ ] Catat rekaman motion pada kecepatan normal dan slow playback; profil sebelum klaim smooth.
- [ ] Test BFF: cookie/session, CSRF/origin, timeout, dan error mapping.
- [ ] Uji reject, wrong chain, expired session, logout, account switch saat request aktif.
- [ ] Uji buyer/worker/outsider; akun lain tidak dapat melihat task privat.
- [ ] Uji create gagal/tak pasti, expiry, accept/cancel race, dan readback.
- [ ] Uji malformed/duplicate JSON, placeholder gagal/lolos, outage, stale responses.
- [ ] Uji reset consent AI; rute AI tidak terbuka publik sebelum gate selesai.
- [x] npm test lulus.
- [x] npm run test:docs lulus.
- [x] npm run typecheck lulus.
- [x] npm run build lulus.
- [ ] Browser-check mobile/desktop; screenshot hanya data sintetis.
- [ ] Catat hasil aktual dan hal yang belum diuji; jangan klaim production-ready.

Jangan jalankan test DB destruktif terhadap hosted Pactra. E2E memakai lingkungan
uji terisolasi; fixture tidak dipresentasikan sebagai task nyata.
