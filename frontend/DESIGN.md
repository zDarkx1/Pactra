---
version: alpha
name: Pactra-document-led
status: implemented-awaiting-visual-qa
updated: 2026-09-23
reference: user-pasted Claude visual analysis; adapted for Pactra, not a brand clone
colors:
  primary: '#cc785c'
  primary-hover: '#d58a70'
  primary-active: '#c16d52'
  primary-disabled: '#e6dfd8'
  on-primary: '#141413'
  link: '#94492f'
  ink: '#141413'
  body: '#3d3d3a'
  body-strong: '#252523'
  muted: '#65625c'
  muted-soft: '#8e8b82'
  hairline: '#e6dfd8'
  hairline-soft: '#ebe6df'
  control-border: '#8a8175'
  focus: '#94492f'
  focus-on-dark: '#cc785c'
  canvas: '#faf9f5'
  surface-soft: '#f5f0e8'
  surface-card: '#efe9de'
  surface-cream-strong: '#e8e0d2'
  surface-dark: '#181715'
  surface-dark-elevated: '#252320'
  surface-dark-soft: '#1f1e1b'
  on-dark: '#faf9f5'
  on-dark-soft: '#a09d96'
  success: '#267342'
  warning: '#806000'
  error: '#b63737'
  info: '#3d3d3a'
  success-on-dark: '#5db872'
  warning-on-dark: '#e8a55a'
  error-on-dark: '#f09090'
fonts:
  display: 'Newsreader, Georgia, serif'
  ui: 'IBM Plex Sans, system-ui, sans-serif'
  code: 'JetBrains Mono, ui-monospace, monospace'
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px
motion:
  duration-instant: 0ms
  duration-feedback: 120ms
  duration-enter: 160ms
  duration-panel: 220ms
  duration-drawer: 260ms
  ease-feedback: ease
  ease-out: 'cubic-bezier(0.23, 1, 0.32, 1)'
  ease-in-out: 'cubic-bezier(0.77, 0, 0.175, 1)'
  ease-drawer: 'cubic-bezier(0.32, 0.72, 0, 1)'
---

# Pactra design specification

## Status dan prioritas

Spesifikasi ini sudah diterapkan pada frontend. Build dan tes bukan bukti bahwa
layout, keyboard flow, atau wallet nyata sudah lolos uji browser.

Arah baru menggantikan dark-lavender Linear: cream canvas, coral, warm ink,
serif editorial untuk landing, dan sans yang jelas untuk workspace.
Revisi document-led mengganti hero split dan kartu promo dengan agreement sheet serta
contoh checker interaktif.
Referensi yang ditempel menjadi bahan visual; identitas tetap Pactra.
Jangan menyalin nama, logo radial, tagline, produk, atau navigasi Claude/Anthropic.

TASK.md menentukan cakupan fitur. Dokumen ini menentukan visual dan interaksi.
Jika estetika berbenturan dengan privasi, kejelasan status, atau aksesibilitas,
batas produk dan keselamatan pengguna menang.

## Redesign terarah — 2026-09-23

User menilai pass awal masih generik. Audit source menemukan slogan berpasangan,
hero split dengan mockup gelap, kartu di dalam kartu, dan disclaimer yang diulang.
Audit ini bukan screenshot review; browser belum tersambung.

Skill: design-taste-frontend, redesign-existing-projects, stop-slop, serta mekanisme
randomizer gpt-taste. RNG benar-benar dijalankan dengan Python, bukan output simulasi.
Seed tercatat: **56228331**. Tidak ada randomization saat runtime atau hydration.

| Pilihan RNG | Penerapan |
| --- | --- |
| Left margin introduction + broad unboxed agreement sheet | Heading lebar, pengantar di margin, lembar terms tanpa card chrome |
| Newsreader + IBM Plex Sans | Display serif 400; UI sans 400/500/600; JetBrains Mono tetap untuk data |
| Annotated agreement sheet | Terms contoh berlabel, rule horizontal, policy ringkas |
| Ruled capability index | Daftar checks dengan garis, bukan tiga feature cards |
| Inline before/after evidence | Tombol restore placeholder; hasil hanya dari Go setelah user menjalankan check |
| Short underline reveal + state opacity | Hover kecil dan hasil fade; tidak ada loop/scroll hijack |
| 12 columns, 20ch heading, 80px major gap, 1320px max width | Dokumen punya ruang tanpa hero memenuhi seluruh viewport |

Randomizer memilih kandidat yang sudah lolos batas produk. AIDA diterjemahkan sebagai
pengenalan, contoh kerja, rincian kemampuan, dan tindakan yang relevan. Tidak memaksakan
bento, GSAP, marquee, foto acak, atau animasi ornamental pada alat kesepakatan.
Krem–coral dan trust boundaries tetap; warna/fitur tidak dipilih acak.

## Workspace rework — 2026-09-23

Landing document-led tetap. Workspace memakai IBM Plex Sans dengan ukuran tetap,
bukan display hero. Tidak ada randomizer baru pada layar kerja.

- Sidebar 224px, breadcrumb sesuai route, dan aksi New agreement yang jelas.
- Header halaman dipisah garis; konten maksimal 1280px, tanpa metric cards palsu.
- Gate akses membedakan setup belum siap, pemeriksaan sesi, dan sign-in.
  Panduan wallet/signature/terms tidak menampilkan data privat atau contoh task palsu.
- Daftar agreement memakai baris bergaris, pencarian lokal, serta filter role/status.
  Batas 50 hasil dari server tetap dijelaskan; bukan pencarian seluruh riwayat.
- Ikon SVG satu gaya untuk navigasi, wallet, refresh, copy, status, dan aksi tambah.
  Ikon dekoratif disembunyikan dari screen reader; label teks tetap ada.
- Motion hanya feedback singkat. Pencarian, filter, dan angka tidak dianimasikan.
  Skeleton tidak berkedip; ikon refresh tidak berputar tanpa henti.
- Session invalidation, retry manual, manifest hash, dan accepted_unfunded tetap.

## Konsep visual

Kesepakatan harus mudah dibaca sebelum ditandatangani. Evidence mudah dibandingkan.
Gunakan kehangatan editorial tanpa membuat workspace terasa seperti halaman promo.

- Canvas cream menjadi dasar landing dan app, bukan full dark dashboard.
- Coral untuk aksi utama, pilihan aktif yang relevan, dan aksen kecil.
- Warm charcoal untuk JSON/code/evidence tertentu; bukan navy dan bukan setiap panel.
- Permukaan cream boleh berulang. Tidak wajib berganti warna setiap section.
- Detail terms, source, amount, dan status harus lebih kuat dari dekorasi.
- Brand Pactra berupa wordmark/aset yang disetujui; tidak membuat logo tiruan.
- Tidak menambah pricing, model comparison, chat, connectors, atau cookie banner
  hanya karena ada pada referensi. Tambah hanya jika kebutuhan produk nyata ada.

## Warna dan keterbacaan

YAML di atas menjadi sumber nilai. Implementasi nanti memakai token yang sama,
bukan palet paralel. Nilai hex dipertahankan agar referensi tidak bergeser diam-diam.

| Penggunaan | Pasangan yang ditetapkan |
| --- | --- |
| Body dan terms | body / canvas atau surface-card |
| Teks sekunder bermakna | muted / canvas atau surface-card |
| CTA utama | on-primary / primary; hover dan pressed tetap memakai teks gelap |
| Link dalam teks | link; underline terlihat tanpa bergantung pada warna |
| Input batas/focus | control-border dan focus; hairline hanya pemisah dekoratif |
| JSON gelap | on-dark dan on-dark-soft pada surface-dark |
| Status di cream | success, warning, error ditambah label/ikon |
| Status di charcoal | token on-dark masing-masing; tetap cek pasangan aktual |

Pemeriksaan sRGB pada token solid, bukan audit browser:
- Putih pada coral asli #cc785c: 3.28:1. Jangan pakai untuk label CTA kecil.
- Ink #141413 pada coral: 5.63:1; pada pressed #c16d52: 4.90:1.
- Link #94492f pada surface-card: 5.34:1.
- Muted #65625c pada surface-card: 5.03:1.
- Control border #8a8175 pada surface-card: 3.17:1.

Target proyek: teks biasa minimal 4.5:1; teks besar, focus, dan batas kontrol
penting minimal 3:1. Periksa semua state, termasuk hover, pressed, invalid, dan dark.
Muted-soft hanya untuk dekorasi/noninformasi; bukan placeholder, terms, atau pesan penting.
Disabled tetap terbaca; alasan tidak aktif tampil di luar kontrol.
Jangan menurunkan opacity seluruh kontrol aktif atau menganimasikan warna status melewati
warna yang mengaburkan arti. Status baru berlaku segera; dekorasi mengikuti.

## Tipografi

| Peran | Font / ukuran / weight | Aturan |
| --- | --- | --- |
| Landing hero | Newsreader / maksimal 84px desktop, 43–58px mobile / 400 | Leading 1.03–1.06; tracking -0.03em; target 2–3 baris |
| Landing section | Newsreader / 44px desktop, 36px mobile / 400 | Leading 1.1; tanpa italic slogan |
| Workspace page title | IBM Plex Sans / 28px / 600 | Ukuran stabil, bukan display hero |
| Section/panel title | IBM Plex Sans / 18–22px / 500–600 | Hirarki lebih rapat untuk kerja |
| Body dan input | IBM Plex Sans / 16px / 400 | Leading 1.55; input tidak dikecilkan di mobile |
| Labels/buttons | IBM Plex Sans / 14px / 500 | Leading 1.4; tidak terpotong saat loading |
| Caption/status | IBM Plex Sans / 13px / 500 | Tidak menggantikan body penting |
| JSON/hash/address | JetBrains Mono / 14px / 400 | Leading 1.6; full value tetap dapat diakses |

Serif hanya untuk editorial landing, bukan field label, amount, tabel task, atau error.
Pakai font yang aset/penggunaannya tersedia untuk proyek; jangan mengasumsikan aset
Copernicus atau StyreneB dari referensi tersedia. Font dipasang pada tahap kode nanti.
Body prose sekitar 65–75ch; kriteria panjang tetap bisa dibaca tanpa truncation tersembunyi.
Amount tidak memakai count-up. Hash/address boleh dipendekkan untuk navigasi, tetapi
nilai penuh tersedia di detail dan copy hanya menyalin nilai penuh.

## Layout dan responsive

- Landing: lebar maksimum 1320px, gutter 32–40px desktop dan 16–20px mobile.
- Hero: heading lebar, intro di margin, dan agreement sheet contoh tanpa box/shadow.
- Contoh checker berikutnya interaktif: dua versi input, satu tombol check, respons Go nyata.
  Tidak ada hasil pass/fail yang ditampilkan sebelum request selesai.
- CTA utama harus terlihat pada laptop kecil tanpa hero mengambil seluruh layar.
- Major landing sections sekitar 64–96px; bukan whitespace besar pada setiap app panel.
- Workspace: sidebar sekitar 240px, konten fokus, panel berjarak 16–24px.
- Checker: editor dan findings berdampingan jika cukup ruang; stacked di layar sempit.
- Form: label di atas input, error dekat field, ringkasan terms sebelum kirim.
- Task list: row/tabel di desktop, susunan ringkas di mobile. Jangan kartu di dalam kartu.
- Di bawah 768px: sidebar menjadi menu drawer; konten satu kolom.
- 768–1023px: dua kolom hanya jika field dan evidence tetap terbaca.
- Mulai 1024px: sidebar dan panel penuh; layar lebar menambah gutter, bukan panjang teks.
- Target area interaksi minimal 44 x 44px termasuk icon button; visual ikon boleh lebih kecil.
- JSON memiliki scroll internal atau wrap yang jelas; tidak membuat halaman overflow.
- Keyboard focus tetap terlihat dan tidak tertutup sticky header/action bar.

## Komponen dan state

Nama komponen mengikuti TASK.md; jangan membangun katalog marketing yang tidak dipakai.

| Komponen | Bentuk / perilaku utama |
| --- | --- |
| PublicHeader | Cream, wordmark Pactra, Checker, Workspace, wallet/CTA yang relevan |
| AppShell | Cream canvas, sidebar surface-soft, border ringan, tanpa page-entry show |
| Button | Radius 8px, tinggi minimal 44px, satu aksi utama per konteks |
| FormField | Label tetap, helper dan error dekat input, control-border terlihat |
| TaskList / TaskStatusBadge | Fokus pada pihak, deadline, status; bukan saldo atau aktivitas rekaan |
| ManifestDetails | Semua terms terbaca; hash server; amount tanpa asumsi token/decimals |
| JsonInput / EvidencePanel | Charcoal bila membantu perbandingan, teks mono, excerpt akurat |
| InlineAlert | Label jelas, warna semantik, tidak mengandalkan toast untuk error penting |
| ConfirmDialog | Terms/aksi eksplisit, focus trap, Escape, kembali ke trigger yang masih ada |
| MobileNav | Drawer cream, penutupan aman, focus/inert state sesuai modalitas |
| WalletProviders / ConnectButton | RainbowKit; theme cream/coral, bukan modal wallet buatan sendiri |

Setiap kontrol memiliki default, hover, focus-visible, pressed, disabled, loading,
selected, dan error jika relevan. Hover dibatasi pointer fine yang mendukung hover.
Focus tampil segera; bukan ring yang fade-in. Native form controls tetap punya affordance.

Workspace cards radius 12px; container khusus maksimal 16px. Landing menghindari cards;
tombol landing radius 4px, tombol workspace tetap 8px. Depth lewat surface/border.
Jangan pasangkan border dekoratif dengan shadow lebar. Shadow kecil hanya bila membantu
membedakan overlay. Tidak ada spotlight card, glass blur besar, atau mouse-follow glow.

## Motion engineering — wajib dalam scope

### Tujuan dan batas

Motion harus memberi feedback, menjelaskan perubahan state, atau menjaga hubungan
antara trigger dan panel. Meticulous berarti tiap detail punya kontrak, bukan banyak efek.
Tidak ada animasi idle, confetti, bounce uang, typewriter, parallax, scroll hijack,
atau transisi halaman yang menahan pekerjaan. Tidak ada stagger setiap row/section.

Ketik, keyboard navigation, focus movement, dan shortcut tidak menunggu animasi.
Keyboard membuka/menutup UI milik Pactra secara langsung; feedback status tetap jelas.
Tidak ada delay sebelum handler, request, disable action, perubahan ARIA, atau error.

### Pilihan alat

- CSS transitions untuk hover, press, retarget, dan feedback singkat.
- Native dialog/popover serta progressive enhancement untuk lifecycle sederhana.
- WAAPI hanya jika perlu cancel/retarget terprogram yang tidak cukup dengan CSS.
- Motion/GSAP bukan dependency wajib. Jika perlu library, buktikan kebutuhan konkret
  seperti exit lifecycle/gesture yang belum bisa ditangani dengan solusi lebih kecil.
- Tidak ada gesture/drag/swipe baru hanya untuk menunjukkan animasi pada pass ini.
- RainbowKit mempertahankan lifecycle, focus, dan animasi internalnya. Jangan override
  private DOM atau menumpuk animasi kedua. Tema melalui API yang didukung saja.

### Kontrak micro-interactions

Nilai berikut target awal yang wajib feel-check saat implementasi. Penyesuaian harus
mengubah spesifikasi ini, bukan menambah magic number lokal. Semua delay 0ms kecuali
tooltip yang dicatat. Easing mengacu ke motion tokens di YAML.

| Interaksi | Trigger dan efek | Masuk / keluar | Interupsi dan fallback |
| --- | --- | --- | --- |
| Primary/secondary press | Pointer down: scale 1 ke 0.98; kembali 1 saat release/cancel | 120ms / 160ms, ease-out | Retarget dari posisi kini; hit target tidak bergerak; keyboard/reduced: tanpa scale |
| Button/link hover | Fill/border/underline; konten tombol naik 1px, ikon arah bergerak 1–2px; hit target tetap | Fill 120ms ease-feedback; transform 160ms ease-out | Pointer leave retarget; touch/keyboard-focus/reduced tanpa gerak |
| Field focus/error | Focus ring dan label error langsung terlihat; tanpa shake | 0ms untuk informasi penting | Tidak restart saat tiap keypress; reduced sama |
| Filter/selection | Selected state dan hasil berubah segera; fill bisa transition | 120ms, ease-feedback | Tidak ada sliding rows; keyboard langsung; stale response diabaikan |
| Tooltip opsional | Opacity dan translateY 2px ke 0 dari trigger | Delay pointer 350ms; enter 125ms, exit 100ms, ease-out | Tooltip tetangga langsung; focus keyboard langsung; reduced tanpa transform/delay |
| Popover/menu | Opacity dan scale 0.98 ke 1; origin di trigger | 160ms / 120ms, ease-out | Open-close-open retarget; Escape tidak ditunda; keyboard/reduced langsung |
| Confirm dialog | Opacity, scale 0.98 ke 1, translateY 8px ke 0; centered | 220ms / 160ms, ease-out | Focus/modalitas berlaku segera; reverse dari posisi kini; keyboard/reduced langsung |
| Desktop sidebar | Rail 224px ↔ 72px; layout final langsung, konten FLIP translateX dan latar scaleX | 260ms, ease-drawer | Klik cepat retarget dari rect kini; pilihan tersimpan lokal; keyboard/reduced langsung |
| Mobile drawer | TranslateX -100% ke 0 dari kiri; opacity 0.8 ke 1, backdrop fade | 260ms ease-drawer / 220ms ease-out | Tutup saat enter dari posisi kini; modal tetap aktif sampai exit selesai; Escape/route/reduced langsung |
| Add deliverable | Row hadir, layout berubah langsung; row opacity 0 ke 1 | 160ms, ease-out | Focus field baru tidak menunggu; remove langsung dan focus ke tetangga; tanpa height animation |
| Evidence disclosure | Ruang panel berubah langsung; konten opacity singkat | 160ms masuk, tutup langsung | Jangan gerakkan source saat dibaca; keyboard/reduced langsung |
| Check/review result | Hanya hasil terbaru fade-in; summary state diumumkan segera | 160ms opacity, ease-out | Edit/hilang sesi menghapus hasil langsung, tanpa exit; tanpa stagger per key |
| Copy hash/address | Setelah clipboard sukses, label/ikon Copied dalam slot tetap | 120ms opacity, ease-out; label kembali setelah 2 detik | Copy gagal tetap error; repeated copy reset timer; screen reader tidak spam |
| Async action | Disable dan pending label langsung; ruang label/ikon tetap | 0ms state; ikon/label opsional 120ms opacity | Success hanya sesudah server; label tidak count-up; timer bukan bukti selesai |

Jika row/focus target sudah hilang saat exit, jangan memaksa focus kembali ke node itu.
Pilih kontrol tetangga atau heading panel. Jangan animasikan layout/ukuran textarea,
amount, source selection, atau hash yang sedang dibaca/disalin.

### Implementasi motion lanjutan — 2026-09-23

Pola state open/closing/closed dipakai pada native dialog. CSS menangani hover dan
backdrop; WAAPI menangani entry/exit yang dapat dihentikan. Tidak memasang Redux,
Radix, atau Motion hanya untuk mengganti native modal yang sudah bekerja. Ini arah
motion yang tenang, bukan klaim menyalin persis timing atau UI Claude.

Sidebar desktop mengubah ukuran layout sekali per toggle, bukan menganimasikan width
setiap frame. Posisi visual konten dihubungkan dengan FLIP translateX; latar rail memakai
scaleX dengan origin kiri. Preferensi expanded/collapsed disimpan lokal, tanpa data akun.

Smooth scroll berlaku untuk anchor dan scroll terprogram pada root serta container
bersarang. Wheel/touch tetap native. Keyboard, focus, validasi, history navigation,
dan reduced-motion tetap instan. Tidak memakai Lenis, RAF loop, atau scroll hijack.

Motion lifecycle punya fallback deadline, cleanup, dan pengaman completion sekali saja.
Tutup saat entry mengambil posisi visual saat ini; callback lama tidak boleh menutup
view baru. Unmount, tab hidden, perubahan preferensi, dan route tidak menunggu animasi.
RainbowKit tetap memakai lifecycle dan animasi internalnya; tidak ada selector private.

### Loading dan state nyata

- Pertahankan ukuran tombol saat idle/pending/error; hindari width morph.
- Skeleton statis hanya pada fetch awal tanpa data. Refresh mempertahankan data yang
  masih sah dengan status updating; ganti akun menghapus data privat segera.
- Tidak perlu shimmer. Pending icon boleh berputar 800ms linear hanya saat request nyata
  aktif; reduced motion memakai ikon diam dan teks pending. Berhenti saat unmount/hidden.
- Jangan tambahkan minimum loading duration atau delay request demi animasi.
- Modal sukses tidak muncul hanya karena wallet connected atau user menandatangani.
- Accepted_unfunded tetap diberi label unfunded; tidak ada receipt/checkmark “paid”.
- AI advisory, deterministic pass, human acceptance, dan settlement tetap berbeda.

### Interruptibility dan cleanup

- Rapid hover/press/open-close-open retarget dari visual kini; jangan queue animasi lama.
- Animationend bukan satu-satunya cara mengubah state/unmount; reduced mode, tab hidden,
  atau animation cancel tidak boleh meninggalkan overlay/pointer-events yang salah.
- Bersihkan timer copy, animation handle, listener, dan async work saat unmount.
- Pergantian akun/chain, logout, expired session, atau edit input menghapus data usang
  segera. Jangan menahannya di DOM demi exit fade. Hilangnya akses selalu menang.
- Overlay yang exit boleh tetap visual sebentar, tetapi lifecycle focus/inert dan scroll
  lock harus konsisten. Jika sulit dipastikan, pilih close instan daripada ghost overlay.

### Reduced motion dan performa

- Reduced motion: hilangkan transform, spatial movement, stagger, rotation, dan smooth scroll.
- Feedback state tetap instan; opacity singkat maksimal 100ms boleh untuk status nonkritis.
- Sesuaikan saat preferensi berubah tanpa reload. Jangan hanya mempercepat semua animasi.
- Utamakan transform/opacity. Warna/border hanya area kontrol kecil; jangan paint layar penuh.
- Tidak ada transition: all, animasi height/width/margin/top/left, layout read/write per frame,
  global will-change, atau React state update tiap frame.
- Konten terlihat secara default; enhancement tidak boleh meninggalkan panel kosong ketika
  JS gagal, tab tersembunyi, hydration terlambat, atau animation tidak selesai.
- Profiling wajib sebelum klaim smooth; token durasi saja bukan bukti performa.

## QA visual dan motion

Semua masih unchecked sampai diuji pada kode nyata.

- [ ] Periksa tombol/field/status pada cream dan charcoal; ukur kontras state aktual.
- [ ] Periksa 360/390px mobile, tablet, 1280px laptop, desktop lebar, dan zoom 200%.
- [ ] Rekam pointer hover/press/cancel; tidak ada jitter, hit target hilang, atau klik ganda.
- [ ] Uji keyboard-only: focus segera, Escape, Tab trap, focus return, tanpa delay navigasi.
- [ ] Uji open-close-open cepat, click berulang, unmount, resize, tab hidden lalu kembali.
- [ ] Uji reduced motion saat aktif sejak awal dan saat diubah di tengah sesi.
- [ ] Uji latency/error/offline, wallet reject, wrong chain, expired session, dan account switch.
- [ ] Data usang lenyap segera; tidak ada private-content exit fade atau success sebelum server.
- [ ] Copy feedback hanya sesudah clipboard sukses; timer bersih setelah unmount.
- [ ] Tinjau animasi pada kecepatan normal dan 2–5x lebih lambat, lalu frame-by-frame.
- [ ] Profiling CPU throttle/mobile: tidak ada layout loop, long task berulang akibat motion,
      atau layout shift tak perlu pada tombol, task list, dan evidence.
- [ ] Catat browser/device, reduced-motion mode, rekaman, dan perubahan nilai yang disetujui.

## Belum diputuskan / bukan klaim selesai

Aset brand final, pemasangan font, pengujian RainbowKit theme, dan browser QA dilakukan
pada tahap implementasi. Diagram/preview hanya memakai contoh sintetis berlabel.
Motion tidak membuka scope funding, payout, upload, AI publik, atau deployment.
