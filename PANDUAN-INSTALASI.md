# PANDUAN INSTALASI — Hamparan D (Backend GAS + Frontend GitHub Pages)

Urutan: **A. Backend** (±10 menit) → **B. Isi URL di frontend** → **C. Frontend ke GitHub**.
Data lama (Spreadsheet, folder Drive, PIN pengurus) TIDAK hilang: backend hanya di-upgrade di proyek Apps Script yang sama.

---
## A. BACKEND — Google Apps Script

1. Buka proyek Apps Script Hamparan D Anda yang sudah ada (https://script.google.com).
2. Buka file **Kode**, hapus seluruh isinya, tempel isi **Kode.gs** yang baru.
3. Buka file **appsscript.json** (aktifkan lewat Setelan Project → "Tampilkan file manifes"), ganti isinya dengan **appsscript.json** yang baru.
4. File `Index`, `Stylesheet`, `JavaScript` (HTML) sudah tidak dipakai. Boleh dihapus (ikon titik tiga → Hapus).
5. **JANGAN** menjalankan `setupAppEnvironment()` lagi (data Anda sudah ada).
6. Deploy → **Kelola deployment** → ikon pensil pada deployment yang ada → Versi: **Versi baru** → Terapkan.
   - Execute as: **Me**, Who has access: **Anyone**.
   - URL `/exec` tetap sama dengan sebelumnya. Salin URL ini.
   - Instalasi baru (belum pernah deploy): Deploy → Deployment baru → Aplikasi web, lalu jalankan `setupAppEnvironment()` SEKALI sebelum deploy.
7. Uji: buka `URL-/exec?action=ping` di browser. Harus tampil JSON: `{"success":true,"data":{"app":"Citra Abadi · Hamparan D",...}}`.
   (Mulai sekarang membuka URL `/exec` tidak lagi menampilkan aplikasi; tampilannya ada di GitHub Pages.)

---
## B. ISI URL BACKEND DI FRONTEND

Folder frontend (hasil ekstrak ZIP) berisi `index.html`, `css/`, `js/`. Buka `js/config.js` dengan Notepad dan ganti:

```js
window.GAS_URL = 'GANTI_DENGAN_URL_EXEC_APPS_SCRIPT';
```
menjadi URL `/exec` dari langkah A6, misalnya:
```js
window.GAS_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```
Simpan.

---
## C. FRONTEND — GitHub Pages (lewat terminal)

> **Folder kerja = folder hasil ekstrak ZIP** (yang di dalamnya langsung terlihat `index.html`, `css`, `js`).
> Di folder inilah `git init` dijalankan. Jangan masuk lebih dalam dan jangan naik satu level.

**C1. Pasang Git** (sekali saja): Windows → https://git-scm.com/download/win (pengaturan default). Lalu buka PowerShell. Cek:
```
git --version
```

**C2. Akun GitHub:** daftar di https://github.com (username jadi bagian alamat situs: `username.github.io`).

**C3. Identitas Git (sekali saja):**
```
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```

**C4. Buat repository:** github.com → tombol **+** → **New repository** → nama mis. `hamparan-d` → **Public** → JANGAN centang README/.gitignore/license → **Create repository**.

**C5. Masuk ke folder frontend & cek isinya:**
Di File Explorer buka folder hasil ekstrak, klik address bar, ketik `powershell`, Enter. Lalu:
```
dir
```
Wajib terlihat `index.html`, folder `css`, dan folder `js`. Jika yang terlihat folder `frontend` atau `backend`, masuk dulu dengan `cd frontend`. Jangan lanjut sebelum `index.html` terlihat.

**C6. Upload pertama** (satu per satu):
```
git init
git add .
git commit -m "Upload pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/hamparan-d.git
git push -u origin main
```
Ganti `USERNAME` dan nama repo. Saat diminta Password, tempel **Personal Access Token** (bukan password akun). Layar tidak menampilkan apa pun saat paste — itu normal; tekan Enter.

Membuat token: https://github.com/settings/tokens → Generate new token (classic) → centang **repo** → Generate → salin `ghp_...` (hanya tampil sekali).

**C7. Aktifkan Pages:** repo → **Settings** → **Pages** → Source **Deploy from a branch** → Branch **main** / **(root)** → Save. Tunggu 1–2 menit → centang **Enforce HTTPS**. Situs: `https://USERNAME.github.io/hamparan-d/`.

**C8. Uji:** buka situsnya → daftar pengurus muncul di layar masuk → masuk dengan PIN → data tampil. Jika kosong/galat, tekan F12 → tab Console dan kirim screenshot.

---
## UPDATE di kemudian hari
Ubah file → di folder frontend:
```
git add .
git commit -m "Deskripsi perubahan"
git push
```
Tekan Ctrl+Shift+R di browser jika masih tampil versi lama.
Perubahan backend (Kode.gs): tempel ulang → Deploy → Kelola deployment → Versi baru.

## Masalah umum
| Gejala | Penyebab / solusi |
|---|---|
| Halaman 404 di GitHub Pages | `index.html` tidak ada di root repo (folder salah di-`git init`). Buka repo di browser: `index.html` harus terlihat di daftar teratas |
| Tampil tanpa gaya | Folder `css/` `js/` tidak ikut. Jangan upload lewat web GitHub; pakai terminal |
| "GAS_URL belum diisi" | Isi `js/config.js`, lalu add/commit/push |
| "bukan JSON" / daftar pengurus kosong | Deployment belum "Anyone" atau belum Versi baru; cek `?action=ping` |
| "Authentication failed" saat push | Pakai Personal Access Token, bukan password |
| Error CORS di Console | URL harus berakhiran `/exec` (bukan `/dev`), akses "Anyone" |
