'use strict';
/* ============================================================
   APP.JS — Logika SPA Aplikasi Hamparan D (frontend GitHub Pages, backend GAS REST)
   Prinsip GAS-Instant-UX:
   1) SPA: semua halaman sekali muat, navigasi = show/hide (0 ms)
   2) Optimistic UI: simpan -> UI berubah dulu, sinkron di latar belakang, rollback bila gagal
   3) Data master dimuat SEKALI (apiBootstrap) lalu difilter lokal (tanpa query server)
   4) Debounce pencarian, 1 pemanggilan server per aksi (batch di backend)
   ============================================================ */

/* ---------- Konfigurasi ---------- */
const NAV = [
  { id: 'dashboard', ikon: 'bi-grid-1x2', label: 'Dashboard Ringkasan', pendek: 'Beranda', bawah: true },
  { id: 'panen', ikon: 'bi-basket3', label: 'Input Timbangan Panen', pendek: 'Panen', bawah: true },
  { id: 'slip', ikon: 'bi-receipt', label: 'Slip BPHP TBS', pendek: 'Slip', bawah: true },
  { id: 'kas', ikon: 'bi-wallet2', label: 'Buku Kas Hamparan', pendek: 'Kas', bawah: true },
  { id: 'tabungan', ikon: 'bi-piggy-bank', label: 'Tabungan Petani', pendek: 'Tabungan' },
  { id: 'pinjaman', ikon: 'bi-cash-coin', label: 'Pinjaman Kelompok', pendek: 'Pinjaman' },
  { id: 'petani', ikon: 'bi-people', label: 'Data Petani & Kapling', pendek: 'Petani' },
  { id: 'laporan', ikon: 'bi-bar-chart-line', label: 'Laporan', pendek: 'Laporan' },
  { id: 'tarif', ikon: 'bi-sliders', label: 'Tarif, Potongan & Harga TBS', pendek: 'Tarif' },
  { id: 'pengguna', ikon: 'bi-shield-lock', label: 'Pengguna & Log Aktivitas', pendek: 'Pengguna', peran: ['Ketua', 'Sekretaris'] }
];
const ACL = {
  'petani.save': ['Sekretaris'], 'petani.status': ['Sekretaris'], 'petani.delete': ['Sekretaris'], 'contoh.hapus': ['Ketua', 'Sekretaris'],
  'panen.save': ['Sekretaris'], 'panen.import': ['Sekretaris'], 'panen.delete': ['Sekretaris'], 'panen.sinkronHarga': ['Sekretaris'],
  'harga.save': ['Bendahara', 'Sekretaris'], 'harga.delete': ['Bendahara', 'Sekretaris'], 'pengaturan.save': ['Bendahara', 'Sekretaris'],
  'kas.save': ['Bendahara', 'Sekretaris'], 'kas.delete': ['Bendahara', 'Sekretaris'], 'tabungan.save': ['Ketua'], 'tabungan.delete': ['Ketua'], 'penabung.save': ['Ketua'], 'penabung.delete': ['Ketua'], 'pinjaman.save': ['Ketua'], 'pinjaman.delete': ['Ketua'],
  'user.save': ['Ketua', 'Sekretaris'], 'user.resetPin': ['Ketua', 'Sekretaris'], 'log.get': ['Ketua', 'Sekretaris']
};
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const WARNA = ['#1B5E20', '#2E7D32', '#4CAF50', '#81C784', '#F9A825', '#FFB74D', '#8D6E63', '#90A4AE', '#DC2626', '#6D4C41'];

const S = {
  token: null, user: null, page: 'dashboard', editId: null, editKasId: null, editPnbId: null, editPinId: null, pinJenis: 'Pinjam', editTabId: null, tabJenis: 'Setor', kasJenis: 'Pemasukan',
  data: { petani: [], harga: [], panen: [], kas: [], tabungan: [], penabung: [], pinjaman: [], pengaturan: {}, kategoriKas: {}, users: [], log: [] },
  logoBaru: null, ttdBaru: {}, charts: {}, busy: 0, terakhirSinkron: 0, slipAktif: [], tmpSeq: 0
};

/* ---------- Helper umum ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmtN = n => Math.round(num(n)).toLocaleString('id-ID');
const rp = n => 'Rp ' + fmtN(n);
const fmtKg = n => num(n).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const hari = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const bln = t => String(t || '').slice(0, 7);
const labelBulan = ym => ym ? BULAN[+ym.slice(5, 7) - 1].slice(0, 3) + ' ' + ym.slice(2, 4) : '';
const labelBulanPenuh = ym => ym ? BULAN[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4) : '';
const tglIndo = t => t ? t.slice(8, 10) + ' ' + BULAN[+t.slice(5, 7) - 1] + ' ' + t.slice(0, 4) : '';
const sum = (list, f) => list.reduce((s, r) => s + num(r[f]), 0);
const can = a => (ACL[a] || []).includes(S.user && S.user.peran);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 250); }; };
const tmpId = () => 'tmp_' + (++S.tmpSeq) + '_' + Date.now();
const petaniById = id => S.data.petani.find(p => p.ID_Petani === id);
const parseManual = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const peranBadge = p => '<span class="badge-x ' + ({ Ketua: 'b-ketua', Bendahara: 'b-ben', Sekretaris: 'b-sek' }[p] || 'b-off') + '">' + esc(p) + '</span>';
const bagi = (a, b) => b ? a / b : 0;

function hargaPada(tgl) {
  let t = null;
  S.data.harga.forEach(h => { if (String(h.Tanggal) <= tgl && (!t || String(h.Tanggal) >= String(t.Tanggal))) t = h; });
  return t ? num(t.Harga) : 0;
}
function hargaTerbaru() {
  const a = S.data.harga.slice().sort((x, y) => String(y.Tanggal).localeCompare(String(x.Tanggal)));
  return a[0] || null;
}

/* ---------- Rumus inti (IDENTIK dengan hitung_() di Kode.gs) ---------- */
function hitung(p) {
  const t = p.tarif, netto = num(p.netto), harga = num(p.harga);
  const kotor = Math.round(netto * harga);
  const transport = Math.round(netto * t.transport), kelompok = Math.round(netto * t.kelompok);
  const penimbang = Math.round(netto * t.penimbang), koperasi = Math.round(netto * t.koperasi);
  const manualTotal = (p.manual || []).reduce((s, m) => s + num(m.jumlah), 0);
  const tabungan = num(p.tabungan), masjid = num(p.masjid), ongkos = num(p.ongkos), pajak = num(p.pajak);
  const standar = transport + kelompok + penimbang + koperasi;
  const total = standar + tabungan + masjid + ongkos + pajak + manualTotal;
  return { netto, harga, kotor, transport, kelompok, penimbang, koperasi, standar, tabungan, masjid, ongkos, pajak, manualTotal, total, bersih: kotor - total };
}
function potonganTetap(pet, netto, kotor) {
  const nO = num(pet.Ongkos_Nilai);
  return {
    tabungan: num(pet.Tabungan), masjid: num(pet.Masjid),
    ongkosMode: pet.Ongkos_Jenis === 'nominal' ? 'tetap' : 'perkg', ongkosNilai: pet.Ongkos_Jenis === 'tidak' ? 0 : nO,
    ongkos: pet.Ongkos_Jenis === 'perkg' ? Math.round(nO * netto) : (pet.Ongkos_Jenis === 'nominal' ? Math.round(nO) : 0),
    pajak: 0
  };
}
function tarifAktif() {
  const g = S.data.pengaturan;
  return { transport: num(g.tarif_transport), kelompok: num(g.tarif_kelompok), penimbang: num(g.tarif_penimbang), koperasi: num(g.tarif_koperasi) };
}

/* ---------- UI dasar: toast, progress, modal, konfirmasi ---------- */
function toast(pesan, tipe) {
  tipe = tipe || 'success';
  const ik = { success: 'bi-check-circle-fill', danger: 'bi-x-octagon-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' }[tipe] || 'bi-info-circle-fill';
  const el = document.createElement('div');
  el.className = 'toast-x ' + tipe;
  el.innerHTML = '<i class="bi ' + ik + '"></i><div>' + esc(pesan) + '</div>';
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, tipe === 'danger' ? 6000 : 3500);
}
function busy(d) {
  S.busy = Math.max(0, S.busy + d);
  $('#progressBar').classList.toggle('on', S.busy > 0);
}
const modal = id => bootstrap.Modal.getOrCreateInstance('#' + id);
function konfirmasi(judul, html, ok, labelOk) {
  $('#mdConfirmTitle').textContent = judul;
  $('#mdConfirmBody').innerHTML = html;
  $('#btnConfirmOk').textContent = labelOk || 'Ya, lanjutkan';
  $('#btnConfirmOk').onclick = () => { modal('mdConfirm').hide(); ok(); };
  modal('mdConfirm').show();
}
function setLoading(btn, on, html) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin spin-sm"></span> ' + (html || 'Memproses...'); }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}

/* ---------- Pemanggil server ---------- */
/* ---------- Koneksi ke backend Google Apps Script (REST) ---------- */
/** Kirim permintaan POST JSON. Content-Type text/plain agar browser tidak membuat preflight CORS (GAS tidak mendukung OPTIONS). */
async function gas(action, body) {
  if (!window.GAS_URL || /GANTI_DENGAN/.test(window.GAS_URL)) {
    return { success: false, message: 'GAS_URL belum diisi di js/config.js.' };
  }
  try {
    const res = await fetch(window.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, body || {}))
    });
    const teks = await res.text();
    try { return JSON.parse(teks); }
    catch (e) { return { success: false, message: 'Server mengirim balasan yang bukan JSON. Pastikan deployment Web App: Execute as "Me" dan access "Anyone", lalu deploy versi baru.' }; }
  } catch (err) {
    return { success: false, message: 'Tidak dapat terhubung ke server: ' + err.message };
  }
}

function api(action, payload) {
  busy(1);
  return gas(action, { token: S.token, payload: payload || {} }).then(res => {
    busy(-1);
    if (res && res.success) return res.data;
    if (res && res.code === 'AUTH') sesiBerakhir(res.message);
    throw new Error((res && res.message) || 'Terjadi kesalahan.');
  });
}

/* ============================================================
   BOOT, LOGIN, TEMA
   ============================================================ */
document.addEventListener('DOMContentLoaded', init);

function init() {
  let tema = 'light';
  try { tema = localStorage.getItem('hd_tema') || 'light'; } catch (e) { /* abaikan */ }
  terapkanTema(tema);
  const st = document.createElement('style'); st.id = 'slipCss'; st.textContent = SLIP_CSS; document.head.appendChild(st);
  pasangEvent();
  let tk = null;
  try { tk = sessionStorage.getItem('hd_token'); } catch (e) { /* abaikan */ }
  if (tk) { S.token = tk; muatBootstrap(); } else tampilLogin();
}

function terapkanTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-bs-theme', t);
  try { localStorage.setItem('hd_tema', t); } catch (e) { /* abaikan */ }
  const b = $('#btnTheme'); if (b) b.innerHTML = '<i class="bi ' + (t === 'dark' ? 'bi-sun' : 'bi-moon-stars') + '"></i>';
  if (S.user) renderHalaman(S.page);
}

function tampilLogin(pesan) {
  $('#splash').hidden = true; $('#appShell').hidden = true; $('#loginScreen').hidden = false;
  const m = $('#loginMsg'); m.hidden = !pesan; m.textContent = pesan || '';
  $('#loginPin').value = '';
  gas('login.users').then(res => {
    const sel = $('#loginUser');
    if (res && res.success && res.data.length) {
      sel.innerHTML = res.data.map(u => '<option value="' + esc(u.ID) + '">' + esc(u.Nama) + ' — ' + esc(u.Peran) + '</option>').join('');
    } else {
      sel.innerHTML = '<option value="">(tidak tersedia)</option>';
      const mm = $('#loginMsg'); mm.hidden = false;
      mm.textContent = (res && res.message) || 'Aplikasi belum diinisialisasi. Jalankan setupAppEnvironment() di editor Apps Script.';
    }
  });
}

function sesiBerakhir(pesan) {
  S.token = null; S.user = null;
  try { sessionStorage.removeItem('hd_token'); } catch (e) { /* abaikan */ }
  tampilLogin(pesan || 'Sesi berakhir. Silakan masuk kembali.');
}

function muatBootstrap() {
  $('#splash').hidden = false;
  gas('bootstrap', { token: S.token }).then(res => {
    if (!res || !res.success) {
      $('#splash').hidden = true;
      if (res && res.code === 'AUTH') sesiBerakhir(res.message); else tampilLogin('Gagal memuat data: ' + ((res && res.message) || 'tidak ada respons'));
      return;
    }
    terapkanData(res.data);
    $('#splash').hidden = true; $('#loginScreen').hidden = true; $('#appShell').hidden = false;
    bangunNavigasi();
    $('#userName').textContent = S.user.nama; $('#userName2').textContent = S.user.nama;
    $('#userRoleBadge').outerHTML = '<span id="userRoleBadge" class="badge-x ' + ({ Ketua: 'b-ketua', Bendahara: 'b-ben', Sekretaris: 'b-sek' }[S.user.peran]) + '">' + esc(S.user.peran) + '</span>';
    navigateTo(S.page && NAV.find(n => n.id === S.page) ? S.page : 'dashboard');
  });
}

function terapkanData(d) {
  S.user = d.user;
  S.data.petani = d.petani; S.data.harga = d.harga; S.data.panen = d.panen; S.data.kas = d.kas; S.data.tabungan = d.tabungan || []; S.data.penabung = d.penabung || []; S.data.pinjaman = d.pinjaman || [];
  S.data.pengaturan = d.pengaturan; S.data.kategoriKas = d.kategoriKas; S.data.users = d.users || [];
  S.terakhirSinkron = Date.now();
  terapkanLogo();
  const h = hargaTerbaru();
  $('#hargaChip').textContent = h ? rp(h.Harga) + '/kg' : '–';
  $('#syncInfo').textContent = 'Sinkron ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Sinkron ulang dari server (tombol / saat tab kembali aktif). */
async function sinkron(diam) {
  if (S.busy > 0 || !S.token) return;
  if (S.data.panen.some(r => r._pending) || S.data.kas.some(r => r._pending) || S.data.tabungan.some(r => r._pending) || S.data.pinjaman.some(r => r._pending) || S.data.petani.some(r => r._pending)) return;
  try {
    const d = await api('refresh');
    terapkanData(d);
    renderHalaman(S.page);
    if (!diam) toast('Data terbaru dimuat.', 'success');
  } catch (e) { if (!diam) toast(e.message, 'danger'); }
}

/* ============================================================
   NAVIGASI SPA
   ============================================================ */
function bangunNavigasi() {
  const boleh = NAV.filter(n => !n.peran || n.peran.includes(S.user.peran));
  $('#navList').innerHTML = boleh.map(n => '<button class="nav-i" data-page="' + n.id + '"><i class="bi ' + n.ikon + '"></i><span>' + esc(n.label) + '</span></button>').join('');
  const bawah = boleh.filter(n => n.bawah).slice(0, 4);
  $('#bottomNav').innerHTML = bawah.map(n => '<button class="bn" data-page="' + n.id + '"><i class="bi ' + n.ikon + '"></i><span>' + esc(n.pendek) + '</span></button>').join('')
    + '<button class="bn" id="bnMenu"><i class="bi bi-three-dots"></i><span>Menu</span></button>';
  $$('[data-akses]').forEach(el => { el.hidden = !can(el.dataset.akses); });
}

function navigateTo(id) {
  const n = NAV.find(x => x.id === id);
  if (!n || (n.peran && !n.peran.includes(S.user.peran))) id = 'dashboard';
  S.page = id;
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  $$('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  tutupSidebar();
  renderHalaman(id);
  window.scrollTo(0, 0);
  document.title = (NAV.find(x => x.id === id) || {}).label + ' · Hamparan D';
}
function bukaSidebar() { $('#sidebar').classList.add('open'); $('#sbBackdrop').hidden = false; }
function tutupSidebar() { $('#sidebar').classList.remove('open'); $('#sbBackdrop').hidden = true; }

function renderHalaman(id) {
  ({
    dashboard: renderDashboard, panen: renderPanen, slip: renderSlip, kas: renderKas, tabungan: renderTabungan, pinjaman: renderPinjaman,
    petani: renderPetani, laporan: renderLaporan, tarif: renderTarif, pengguna: renderPengguna
  }[id] || (() => { }))();
}

/* ============================================================
   UTILITAS TABEL / SELECT / GRAFIK
   ============================================================ */
function tabel(cols, rows, o) {
  o = o || {};
  if (!rows.length) return '<div class="empty"><i class="bi bi-inbox"></i>' + esc(o.kosong || 'Belum ada data.') + '</div>';
  const th = cols.map(c => '<th class="' + (c.c || '') + '">' + esc(c.h) + '</th>').join('');
  const tr = rows.map(r => {
    const cells = r.cells || r;
    return '<tr class="' + (r.cls || '') + '">' + cells.map((x, i) => '<td class="' + (cols[i].c || '') + ' ' + (cols[i].k || '') + '" data-l="' + esc(cols[i].h) + '">' + x + '</td>').join('') + '</tr>';
  }).join('');
  const foot = o.foot ? '<tfoot><tr>' + o.foot.map((x, i) => '<td class="' + (cols[i].c || '') + '" data-l="' + esc(cols[i].h) + '">' + x + '</td>').join('') + '</tr></tfoot>' : '';
  return '<div class="tbl-wrap stack"><table class="tbl tbl-stack"><thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody>' + foot + '</table></div>';
}
function isiSelect(el, opsi, pilih) {
  el.innerHTML = opsi.map(o => '<option value="' + esc(o.v) + '"' + (String(o.v) === String(pilih) ? ' selected' : '') + '>' + esc(o.l) + '</option>').join('');
}
function opsiPeriode(denganSemua) {
  const set = new Set();
  S.data.panen.forEach(r => set.add(bln(r.Tanggal)));
  S.data.kas.forEach(r => set.add(bln(r.Tanggal)));
  set.add(bln(hari()));
  const arr = Array.from(set).filter(Boolean).sort().reverse().map(v => ({ v, l: labelBulanPenuh(v) }));
  return denganSemua ? [{ v: 'all', l: 'Semua periode' }].concat(arr) : arr;
}
const filterPer = (list, per) => per === 'all' ? list : list.filter(r => bln(r.Tanggal) === per);
function kpi(ikon, label, val, sub, warna) {
  return '<div class="kpi ' + (warna || '') + '"><div class="kpi-top"><span class="kpi-lbl">' + esc(label) + '</span><span class="kpi-ic"><i class="bi ' + ikon + '"></i></span></div><div class="kpi-val num">' + val + '</div><div class="kpi-sub">' + (sub || '') + '</div></div>';
}
function warnaGrafik() {
  const cs = getComputedStyle(document.documentElement);
  return { teks: cs.getPropertyValue('--c-text').trim() || '#1F2937', garis: cs.getPropertyValue('--c-border').trim() || '#D1E7DD', muted: cs.getPropertyValue('--c-muted').trim() || '#5B6572' };
}
function gambar(id, cfg) {
  if (S.charts[id]) { S.charts[id].destroy(); delete S.charts[id]; }
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  S.charts[id] = new Chart(el, cfg);
}
function opsiSumbu(horizontal) {
  const w = warnaGrafik();
  const ax = { ticks: { color: w.muted }, grid: { color: w.garis } };
  return {
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { labels: { color: w.teks, boxWidth: 12 } }, tooltip: { callbacks: { label: c => ' ' + (c.dataset.label ? c.dataset.label + ': ' : '') + fmtN(c.parsed[horizontal ? 'x' : 'y']) } } },
    scales: { x: ax, y: Object.assign({ beginAtZero: true }, ax) }
  };
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function saldoKasGlobal() {
  return sum(S.data.kas.filter(k => k.Jenis === 'Pemasukan'), 'Jumlah') - sum(S.data.kas.filter(k => k.Jenis === 'Pengeluaran'), 'Jumlah');
}

function renderDashboard() {
  const sel = $('#dashPeriode');
  const ops = opsiPeriode(true);
  const adaPanen = S.data.panen.map(r => bln(r.Tanggal)).sort();
  const awal = sel.value || (adaPanen.length ? adaPanen[adaPanen.length - 1] : 'all');
  isiSelect(sel, ops, ops.some(o => o.v === awal) ? awal : 'all');
  const per = sel.value;
  const P = filterPer(S.data.panen, per);
  const netto = sum(P, 'Netto'), kotor = sum(P, 'Kotor'), pot = sum(P, 'Total_Potongan'), bersih = sum(P, 'Gaji_Bersih');
  const kasP = filterPer(S.data.kas, per);
  const label = per === 'all' ? 'Semua periode' : labelBulanPenuh(per);
  $('#kpiRow').innerHTML =
    kpi('bi-basket3', 'Total tonase', fmtKg(netto) + ' <small>kg</small>', P.length + ' catatan panen · ' + label) +
    kpi('bi-cash-stack', 'Hasil kotor', rp(kotor), 'Netto × harga TBS', '') +
    kpi('bi-scissors', 'Potongan', rp(pot), 'Rata-rata ' + (bagi(pot, kotor) * 100).toFixed(1) + '% dari kotor', 'red') +
    kpi('bi-person-check', 'Gaji bersih petani', rp(bersih), 'Siap dibayarkan', 'gold') +
    kpi('bi-wallet2', 'Saldo kas', rp(saldoKasGlobal()), 'Masuk ' + rp(sum(kasP.filter(k => k.Jenis === 'Pemasukan'), 'Jumlah')) + ' · Keluar ' + rp(sum(kasP.filter(k => k.Jenis === 'Pengeluaran'), 'Jumlah')), 'gold');

  $('#aiInsight').innerHTML = buatInsight(per).map(t => '<li><i class="bi bi-stars"></i><span>' + t + '</span></li>').join('');

  // Grafik tonase per bulan (maks 8 bulan terakhir)
  const bulanData = Array.from(new Set(S.data.panen.map(r => bln(r.Tanggal)))).sort().slice(-8);
  gambar('chTonase', {
    type: 'bar',
    data: { labels: bulanData.map(labelBulan), datasets: [{ label: 'Netto (kg)', data: bulanData.map(m => sum(S.data.panen.filter(r => bln(r.Tanggal) === m), 'Netto')), backgroundColor: bulanData.map(m => m === per ? '#F9A825' : '#2E7D32'), borderRadius: 6 }] },
    options: Object.assign(opsiSumbu(false), { plugins: { legend: { display: false } } })
  });
  // Komposisi potongan
  const komp = [['Transport', 'Transport'], ['Kelompok', 'Kelompok'], ['Penimbang', 'Penimbang'], ['Koperasi', 'Koperasi'], ['Tabungan', 'Tabungan'], ['Masjid', 'Masjid'], ['Ongkos panen', 'Ongkos_Panen'], ['Manual', 'Potongan_Manual']]
    .map(k => [k[0], sum(P, k[1])]).filter(k => k[1] > 0);
  gambar('chPotongan', {
    type: 'doughnut',
    data: { labels: komp.map(k => k[0]), datasets: [{ data: komp.map(k => k[1]), backgroundColor: WARNA, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: warnaGrafik().teks, boxWidth: 10 } }, tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + rp(c.parsed) } } } }
  });
  // Top petani
  const perPet = {};
  P.forEach(r => { perPet[r.Nama] = (perPet[r.Nama] || 0) + num(r.Netto); });
  const top = Object.keys(perPet).map(n => [n, perPet[n]]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  gambar('chTop', {
    type: 'bar',
    data: { labels: top.map(t => t[0]), datasets: [{ label: 'Netto (kg)', data: top.map(t => t[1]), backgroundColor: '#2E7D32', borderRadius: 6 }] },
    options: Object.assign(opsiSumbu(true), { plugins: { legend: { display: false } } })
  });

  const terakhir = S.data.panen.slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)) || String(b.Timestamp).localeCompare(String(a.Timestamp))).slice(0, 5);
  $('#dashPanen').innerHTML = tabel(
    [{ h: 'Petani' }, { h: 'Netto', c: 'r' }, { h: 'Gaji bersih', c: 'r' }],
    terakhir.map(r => ['<b>' + esc(r.Nama) + '</b><div class="sub">' + esc(r.Kapling) + ' · ' + tglIndo(r.Tanggal) + '</div>', fmtKg(r.Netto) + ' kg', '<b>' + rp(r.Gaji_Bersih) + '</b>']),
    { kosong: 'Belum ada panen tercatat.' });
  const kasT = kasDenganSaldo().slice(-5).reverse();
  $('#dashKas').innerHTML = tabel(
    [{ h: 'Transaksi' }, { h: 'Jenis' }, { h: 'Jumlah', c: 'r' }, { h: 'Saldo', c: 'r' }],
    kasT.map(k => ['<b>' + esc(k.No_Kas) + '</b><div class="sub">' + tglIndo(k.Tanggal) + ' · ' + esc(k.Keterangan) + '</div>', jenisBadge(k.Jenis), '<span class="' + (k.Jenis === 'Pemasukan' ? 'text-in' : 'text-out') + ' fw-800">' + (k.Jenis === 'Pemasukan' ? '+' : '−') + fmtN(k.Jumlah) + '</span>', rp(k._saldo)]),
    { kosong: 'Belum ada mutasi kas.' });
}

function buatInsight(per) {
  const out = [], P = S.data.panen;
  if (!P.length) return ['Belum ada data panen. Mulai dengan menu <b>Input Timbangan Panen</b>.'];
  const bulan = Array.from(new Set(P.map(r => bln(r.Tanggal)))).sort();
  const cur = per === 'all' ? bulan[bulan.length - 1] : per;
  const idx = bulan.indexOf(cur);
  const prev = idx > 0 ? bulan[idx - 1] : null;
  const tCur = sum(P.filter(r => bln(r.Tanggal) === cur), 'Netto');
  if (prev) {
    const tPrev = sum(P.filter(r => bln(r.Tanggal) === prev), 'Netto');
    if (tPrev > 0) {
      const d = (tCur - tPrev) / tPrev * 100;
      out.push('Tonase <b>' + labelBulanPenuh(cur) + '</b> ' + fmtKg(tCur) + ' kg, ' + (d >= 0 ? '<b class="text-in">naik ' : '<b class="text-out">turun ') + Math.abs(d).toFixed(1) + '%</b> dibanding ' + labelBulanPenuh(prev) + '.');
    }
  } else out.push('Tonase <b>' + labelBulanPenuh(cur) + '</b> tercatat ' + fmtKg(tCur) + ' kg.');
  const sel = filterPer(P, per);
  if (sel.length) {
    const m = {}; sel.forEach(r => { m[r.Nama] = (m[r.Nama] || 0) + num(r.Netto); });
    const t = Object.keys(m).sort((a, b) => m[b] - m[a])[0];
    out.push('Produksi tertinggi: <b>' + esc(t) + '</b> (' + fmtKg(m[t]) + ' kg).');
    const rasio = bagi(sum(sel, 'Total_Potongan'), sum(sel, 'Kotor')) * 100;
    out.push('Total potongan <b>' + rasio.toFixed(1) + '%</b> dari hasil kotor' + (rasio > 25 ? ' — cukup tinggi, periksa ongkos panen / potongan manual.' : '.'));
  }
  const aktif = S.data.petani.filter(p => p.Status === 'Aktif');
  const sudah = new Set(P.filter(r => bln(r.Tanggal) === cur).map(r => r.ID_Petani));
  const belum = aktif.filter(p => !sudah.has(p.ID_Petani));
  if (belum.length && belum.length < aktif.length) out.push('<b>' + belum.length + ' petani aktif</b> belum tercatat panen di ' + labelBulanPenuh(cur) + ': ' + belum.slice(0, 4).map(p => esc(p.Nama)).join(', ') + (belum.length > 4 ? ', dll.' : '') + '.');
  const hs = S.data.harga.slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
  if (hs.length > 1) { const d = num(hs[0].Harga) - num(hs[1].Harga); if (d !== 0) out.push('Harga TBS terbaru Rp' + fmtN(hs[0].Harga) + '/kg, ' + (d > 0 ? '<b class="text-in">naik Rp' : '<b class="text-out">turun Rp') + fmtN(Math.abs(d)) + '</b> dari harga sebelumnya.'); }
  const keluar = S.data.kas.filter(k => k.Jenis === 'Pengeluaran');
  if (keluar.length) {
    const bk = Array.from(new Set(keluar.map(k => bln(k.Tanggal)))).length || 1;
    const rata = sum(keluar, 'Jumlah') / bk;
    if (rata > 0) out.push('Saldo kas ' + rp(saldoKasGlobal()) + ' cukup untuk ± <b>' + (saldoKasGlobal() / rata).toFixed(1) + ' bulan</b> pada rata-rata pengeluaran ' + rp(rata) + '/bulan.');
  }
  return out;
}

/* ============================================================
   INPUT PANEN
   ============================================================ */
const FP = { touched: {}, manual: [], siap: false, ongMode: 'perkg' };
function setOngMode(m) {
  FP.ongMode = m === 'tetap' ? 'tetap' : 'perkg';
  $$('#fpOngMode button').forEach(b => b.classList.toggle('on', b.dataset.m === FP.ongMode));
  $('#fpOngSuf').textContent = FP.ongMode === 'tetap' ? '/transaksi' : '/kg';
}
const ongkosJumlah = netto => FP.ongMode === 'tetap' ? Math.round(num($('#fpOngkos').value)) : Math.round(num($('#fpOngkos').value) * netto);

function renderPanen() {
  const pilih = S.data.petani.filter(p => p.Status === 'Aktif' || p.ID_Petani === ($('#fpPetani').value || ''))
    .sort((a, b) => String(a.Kapling).localeCompare(String(b.Kapling), 'id', { numeric: true }));
  const cur = $('#fpPetani').value;
  isiSelect($('#fpPetani'), [{ v: '', l: '— pilih petani —' }].concat(pilih.map(p => ({ v: p.ID_Petani, l: (p.Kapling ? p.Kapling + ' — ' : '') + p.Nama }))), cur);
  if (!FP.siap) { FP.siap = true; resetFormPanen(true); }
  hitungForm();
  const hrg = hargaPada($('#fpTanggal').value || hari());
  $('#fpHargaChip').textContent = hrg ? rp(hrg) : 'belum diatur';
  isiSelect($('#rpPeriode'), opsiPeriode(true), $('#rpPeriode').value || 'all');
  renderRiwayatPanen();
  $$('#page-panen button, #page-panen input, #page-panen select, #page-panen textarea').forEach(el => {
    if (el.closest('.filters') || el.id === 'btnResetPanen') return;
    if (!can('panen.save') && el.closest('#formPanen, aside')) el.disabled = true;
  });
  $('#page-panen aside').querySelector('.hint').innerHTML = can('panen.save') ? '<i class="bi bi-shield-check"></i> Angka final dihitung ulang oleh server saat disimpan.' : '<i class="bi bi-lock"></i> Peran ' + esc(S.user.peran) + ' hanya dapat melihat. Input panen dilakukan Sekretaris.';
}

function resetFormPanen(awal) {
  S.editId = null; FP.touched = {}; FP.manual = [];
  ['fpBruto', 'fpSortasi', 'fpNetto', 'fpTabungan', 'fpMasjid', 'fpOngkos', 'fpCatatan'].forEach(id => { $('#' + id).value = ''; });
  $('#fpNetto').readOnly = false; setOngMode('perkg');
  $('#fpTanggal').value = hari();
  if (!awal) $('#fpPetani').value = '';
  $('#fpEditBanner').hidden = true;
  renderManual(); hitungForm();
}

function netoDariBruto() {
  const b = num($('#fpBruto').value), s = num($('#fpSortasi').value);
  const ro = b > 0;
  $('#fpNetto').readOnly = ro;
  if (ro) $('#fpNetto').value = Math.max(0, +(b - s).toFixed(2));
}

function isiDefaultPotongan() {
  const pet = petaniById($('#fpPetani').value);
  if (!pet) return;
  const netto = num($('#fpNetto').value), harga = hargaPada($('#fpTanggal').value);
  const t = potonganTetap(pet, netto, Math.round(netto * harga));
  [['fpTabungan', 'tabungan'], ['fpMasjid', 'masjid']].forEach(p => {
    if (!FP.touched[p[0]]) $('#' + p[0]).value = t[p[1]] || 0;
  });
  if (!FP.touched.fpOngkos) { setOngMode(t.ongkosMode); $('#fpOngkos').value = t.ongkosNilai || 0; }
}

function renderManual() {
  const box = $('#fpManual');
  box.innerHTML = FP.manual.map((m, i) =>
    '<div class="mrow"><input class="fx" data-mi="' + i + '" data-mf="nama" maxlength="40" placeholder="Nama potongan (mis. Kasbon pupuk)" value="' + esc(m.nama) + '" aria-label="Nama potongan">'
    + '<input class="fx" type="number" min="0" inputmode="numeric" data-mi="' + i + '" data-mf="jumlah" placeholder="Rp" value="' + esc(m.jumlah) + '" aria-label="Jumlah">'
    + '<button type="button" class="btn-x btn-out btn-ic" data-act="hapusManual" data-id="' + i + '" aria-label="Hapus potongan"><i class="bi bi-x-lg"></i></button></div>').join('');
}

/** Samakan harga semua catatan panen dengan harga TBS pada tanggalnya. */
function sinkronHargaPanen() {
  const beda = S.data.panen.filter(r => !r._pending && hargaPada(String(r.Tanggal)) > 0 && hargaPada(String(r.Tanggal)) !== num(r.Harga));
  if (!beda.length) return toast('Semua catatan panen sudah memakai harga sesuai tanggalnya.', 'success');
  konfirmasi('Sesuaikan harga ke tanggal?', '<b>' + beda.length + '</b> catatan panen memakai harga yang berbeda dari harga TBS pada tanggalnya. Hasil kotor dan gaji bersih akan dihitung ulang (potongan tidak berubah).', async () => {
    try {
      const r = await api('panen.sinkronHarga', {});
      S.data.panen = r.panen; renderHalaman(S.page);
      toast(r.diubah + ' catatan disesuaikan' + (r.dilewati.length ? ', ' + r.dilewati.length + ' dilewati: ' + r.dilewati.join('; ') : '') + '.', r.dilewati.length ? 'warning' : 'success');
    } catch (e) { toast('Gagal menyesuaikan: ' + e.message, 'danger'); }
  }, 'Sesuaikan');
}

function bacaFormPanen() {
  const pet = petaniById($('#fpPetani').value);
  const tgl = $('#fpTanggal').value;
  const bruto = num($('#fpBruto').value), sortasi = num($('#fpSortasi').value);
  const netto = bruto > 0 ? +(bruto - sortasi).toFixed(2) : num($('#fpNetto').value);
  const harga = tgl ? hargaPada(tgl) : 0;
  const manual = FP.manual.filter(m => String(m.nama).trim() && num(m.jumlah) > 0).map(m => ({ nama: String(m.nama).trim(), jumlah: Math.round(num(m.jumlah)) }));
  let tarif = tarifAktif();
  const lama = S.editId ? S.data.panen.find(r => r.ID === S.editId) : null;
  if (lama) tarif = { transport: num(lama.Tarif_Transport), kelompok: num(lama.Tarif_Kelompok), penimbang: num(lama.Tarif_Penimbang), koperasi: num(lama.Tarif_Koperasi) };
  const hrg = harga;   // harga TBS selalu mengikuti tanggal timbang
  const calc = hitung({ netto, harga: hrg, tarif, tabungan: num($('#fpTabungan').value), masjid: num($('#fpMasjid').value), ongkos: ongkosJumlah(netto), pajak: 0, manual });
  let msg = '';
  if (!tgl) msg = 'Tanggal wajib diisi.';
  else if (!pet) msg = 'Pilih petani terlebih dahulu.';
  else if (!(netto > 0)) msg = 'Berat netto harus lebih dari 0 kg.';
  else if (!(hrg > 0)) msg = 'Harga TBS untuk tanggal ini belum diatur (hubungi Bendahara).';
  else if (calc.bersih < 0) msg = 'Total potongan melebihi hasil kotor.';
  return {
    ok: !msg, msg, pet, calc, tarif, tgl, hrg, manual,
    payload: { ID: S.editId || '', Tanggal: tgl, ID_Petani: pet ? pet.ID_Petani : '', Bruto: bruto > 0 ? bruto : '', Sortasi: bruto > 0 ? sortasi : '', Netto: netto, Tabungan: calc.tabungan, Masjid: calc.masjid, Ongkos_Mode: FP.ongMode, Ongkos_Rate: FP.ongMode === 'perkg' ? num($('#fpOngkos').value) : '', Ongkos_Panen: FP.ongMode === 'tetap' ? Math.round(num($('#fpOngkos').value)) : 0, Manual_Items: manual, Catatan: $('#fpCatatan').value.trim() }
  };
}

function hitungForm() {
  netoDariBruto();
  isiDefaultPotongan();
  const v = bacaFormPanen();
  const c = v.calc, t = v.tarif;
  const baris = (l, n, neg) => '<div class="calc-row"><span>' + l + '</span><span class="num ' + (neg ? 'text-out' : '') + '">' + (neg ? '− ' : '') + rp(n) + '</span></div>';
  let h = baris('Hasil kotor <span class="muted">(' + fmtKg(c.netto) + ' kg × ' + fmtN(c.harga) + ')</span>', c.kotor);
  h += '<div class="sect-lbl">Potongan</div>';
  h += baris('Transport <span class="muted">(' + fmtN(t.transport) + '/kg)</span>', c.transport, 1) + baris('Kelompok <span class="muted">(' + fmtN(t.kelompok) + '/kg)</span>', c.kelompok, 1)
    + baris('Penimbang <span class="muted">(' + fmtN(t.penimbang) + '/kg)</span>', c.penimbang, 1) + baris('Koperasi <span class="muted">(' + fmtN(t.koperasi) + '/kg)</span>', c.koperasi, 1)
    + baris('Tabungan', c.tabungan, 1) + baris('Masjid', c.masjid, 1) + baris('Ongkos panen <span class="muted">(' + (FP.ongMode === 'tetap' ? 'tetap' : fmtN(num($('#fpOngkos').value)) + '/kg') + ')</span>', c.ongkos, 1);
  v.manual.forEach(m => { h += baris(esc(m.nama), m.jumlah, 1); });
  h += '<div class="calc-row tot"><span>Total potongan <span class="muted">(' + (bagi(c.total, c.kotor) * 100).toFixed(1) + '%)</span></span><span class="num text-out">− ' + rp(c.total) + '</span></div>';
  h += '<div class="net-box ' + (c.bersih < 0 ? 'neg' : '') + '"><small>Gaji bersih siap bayar</small><b class="num">' + rp(c.bersih) + '</b></div>';
  if (!v.ok && (v.pet || num($('#fpNetto').value))) h += '<div class="text-warn mb-2"><i class="bi bi-exclamation-triangle"></i> ' + esc(v.msg) + '</div>';
  $('#fpCalc').innerHTML = h;
  const b = $('#fpValid'); b.className = 'badge-x ' + (v.ok ? 'b-ok' : 'b-warn'); b.textContent = v.ok ? 'Siap disimpan' : 'Belum lengkap';
  const hr = v.tgl ? hargaPada(v.tgl) : 0; $('#fpHargaChip').textContent = hr ? rp(hr) : 'belum diatur';
  return v;
}

function simpanDraft() { /* draf formulir -> localStorage (hemat ketik jika halaman tertutup) */
  try {
    if (S.editId) return;
    localStorage.setItem('hd_draft_panen', JSON.stringify({ t: $('#fpTanggal').value, p: $('#fpPetani').value, b: $('#fpBruto').value, s: $('#fpSortasi').value, n: $('#fpNetto').value, c: $('#fpCatatan').value }));
  } catch (e) { /* abaikan */ }
}
function pulihkanDraft() {
  try {
    const d = JSON.parse(localStorage.getItem('hd_draft_panen') || 'null');
    if (!d || S.editId) return;
    if (d.t) $('#fpTanggal').value = d.t;
    if (d.p && petaniById(d.p)) $('#fpPetani').value = d.p;
    $('#fpBruto').value = d.b || ''; $('#fpSortasi').value = d.s || ''; $('#fpNetto').value = d.n || ''; $('#fpCatatan').value = d.c || '';
  } catch (e) { /* abaikan */ }
}

function editPanen(id) {
  const r = S.data.panen.find(x => x.ID === id);
  if (!r || r._pending) return;
  navigateTo('panen');
  isiSelect($('#fpPetani'), [{ v: r.ID_Petani, l: (r.Kapling ? r.Kapling + ' — ' : '') + r.Nama }].concat(S.data.petani.filter(p => p.Status === 'Aktif' && p.ID_Petani !== r.ID_Petani).map(p => ({ v: p.ID_Petani, l: (p.Kapling ? p.Kapling + ' — ' : '') + p.Nama }))), r.ID_Petani);
  S.editId = id; FP.touched = { fpTabungan: 1, fpMasjid: 1, fpOngkos: 1 };
  $('#fpTanggal').value = r.Tanggal; $('#fpBruto').value = r.Bruto === '' ? '' : r.Bruto; $('#fpSortasi').value = r.Sortasi === '' ? '' : r.Sortasi;
  $('#fpNetto').value = r.Netto; $('#fpTabungan').value = r.Tabungan; $('#fpMasjid').value = r.Masjid; if (num(r.Ongkos_Rate) > 0) { setOngMode('perkg'); $('#fpOngkos').value = r.Ongkos_Rate; } else if (num(r.Ongkos_Panen) > 0) { setOngMode('tetap'); $('#fpOngkos').value = r.Ongkos_Panen; } else { setOngMode('perkg'); $('#fpOngkos').value = 0; }
  $('#fpCatatan').value = r.Catatan || ''; FP.manual = parseManual(r.Manual_Items).map(m => ({ nama: m.nama, jumlah: m.jumlah }));
  $('#fpEditBanner').hidden = false; $('#fpEditNo').textContent = r.No_Bukti;
  renderManual(); hitungForm();
}

/** Simpan panen — Optimistic UI: tampil dulu, sinkron di latar belakang, rollback bila gagal. */
async function simpanPanen(cetak) {
  if (!can('panen.save')) return toast('Hanya Sekretaris yang dapat menyimpan data panen.', 'warning');
  const v = hitungForm();
  if (!v.ok) return toast(v.msg, 'warning');
  const c = v.calc, p = v.pet, lama = S.editId ? S.data.panen.find(r => r.ID === S.editId) : null;
  const sementara = {
    ID: lama ? lama.ID : tmpId(), No_Bukti: lama ? lama.No_Bukti : '(otomatis)', Tanggal: v.tgl, Gaji_Bulan: labelBulanPenuh(bln(v.tgl)),
    ID_Petani: p.ID_Petani, Nama: p.Nama, Kapling: p.Kapling, Bruto: v.payload.Bruto, Sortasi: v.payload.Sortasi, Netto: c.netto, Harga: c.harga, Kotor: c.kotor,
    Tarif_Transport: v.tarif.transport, Tarif_Kelompok: v.tarif.kelompok, Tarif_Penimbang: v.tarif.penimbang, Tarif_Koperasi: v.tarif.koperasi,
    Transport: c.transport, Kelompok: c.kelompok, Penimbang: c.penimbang, Koperasi: c.koperasi, Tabungan: c.tabungan, Masjid: c.masjid,
    Ongkos_Rate: FP.ongMode === 'perkg' ? (num($('#fpOngkos').value) || '') : '', Ongkos_Panen: c.ongkos, Pajak: 0, Manual_Items: v.manual.length ? JSON.stringify(v.manual) : '', Potongan_Manual: c.manualTotal,
    Total_Potongan: c.total, Gaji_Bersih: c.bersih, Catatan: v.payload.Catatan, Dicatat_Oleh: S.user.nama, Timestamp: new Date().toISOString(), _pending: true
  };
  const payload = v.payload, salinan = lama ? Object.assign({}, lama) : null;
  if (lama) S.data.panen[S.data.panen.indexOf(lama)] = sementara; else S.data.panen.push(sementara);
  const draf = { form: { tgl: v.tgl, pet: p.ID_Petani } };
  try { localStorage.removeItem('hd_draft_panen'); } catch (e) { /* abaikan */ }
  resetFormPanen(); $('#fpTanggal').value = draf.form.tgl; $('#fpPetani').value = '';
  renderPanen(); toast('Panen ' + p.Nama + ' disimpan…', 'info');
  try {
    const rec = await api('panen.save', payload);
    S.data.panen[S.data.panen.findIndex(r => r.ID === sementara.ID)] = rec;
    renderHalaman(S.page); toast('Tersimpan: ' + rec.No_Bukti + ' · ' + p.Nama + ' · ' + rp(rec.Gaji_Bersih), 'success');
    if (cetak) bukaPreview([rec]);
  } catch (e) {
    const i = S.data.panen.findIndex(r => r.ID === sementara.ID);
    if (salinan) S.data.panen[i] = salinan; else S.data.panen.splice(i, 1);
    renderHalaman(S.page); toast('Gagal menyimpan: ' + e.message, 'danger');
  }
}

function hapusPanen(id) {
  const r = S.data.panen.find(x => x.ID === id);
  if (!r || r._pending) return;
  konfirmasi('Hapus catatan panen?', 'Catatan <b>' + esc(r.No_Bukti) + '</b> milik <b>' + esc(r.Nama) + '</b> (' + fmtKg(r.Netto) + ' kg, ' + rp(r.Gaji_Bersih) + ') akan dihapus permanen.', async () => {
    const i = S.data.panen.indexOf(r); S.data.panen.splice(i, 1); renderHalaman(S.page);
    try { await api('panen.delete', { ID: id }); toast('Catatan panen dihapus.', 'success'); }
    catch (e) { S.data.panen.splice(i, 0, r); renderHalaman(S.page); toast('Gagal menghapus: ' + e.message, 'danger'); }
  }, 'Hapus');
}

function renderRiwayatPanen() {
  const per = $('#rpPeriode').value || 'all', q = $('#rpSearch').value.trim().toLowerCase();
  let list = filterPer(S.data.panen, per);
  if (q) list = list.filter(r => (r.Nama + ' ' + r.Kapling + ' ' + r.No_Bukti).toLowerCase().includes(q));
  list = list.slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)) || String(b.No_Bukti).localeCompare(String(a.No_Bukti)));
  const edit = can('panen.save');
  const rows = list.map(r => ({
    cls: r._pending ? 'pending' : '',
    cells: [
      '<b>' + esc(r.No_Bukti) + '</b>' + (r._pending ? ' <span class="spin spin-sm"></span>' : '') + '<div class="sub">' + tglIndo(r.Tanggal) + '</div>',
      '<b>' + esc(r.Nama) + '</b><div class="sub">' + esc(r.Kapling) + '</div>',
      fmtKg(r.Netto) + ' kg', rp(r.Kotor), '<span class="text-out">' + rp(r.Total_Potongan) + '</span>', '<b>' + rp(r.Gaji_Bersih) + '</b>',
      '<button class="btn-x btn-out btn-sm btn-ic" data-act="slip" data-id="' + esc(r.ID) + '" aria-label="Cetak slip"><i class="bi bi-printer"></i></button>'
      + (edit ? ' <button class="btn-x btn-out btn-sm btn-ic" data-act="editPanen" data-id="' + esc(r.ID) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn-x btn-out btn-sm btn-ic" data-act="hapusPanen" data-id="' + esc(r.ID) + '" aria-label="Hapus"><i class="bi bi-trash text-out"></i></button>' : '')
    ]
  }));
  $('#rpTable').innerHTML = tabel(
    [{ h: 'No. bukti' }, { h: 'Petani' }, { h: 'Netto', c: 'r' }, { h: 'Hasil kotor', c: 'r' }, { h: 'Potongan', c: 'r' }, { h: 'Gaji bersih', c: 'r' }, { h: 'Aksi', c: 'r', k: 'acts nolabel' }],
    rows, { kosong: 'Tidak ada catatan panen pada filter ini.',
      foot: list.length ? ['Total ' + list.length + ' catatan', '', fmtKg(sum(list, 'Netto')) + ' kg', rp(sum(list, 'Kotor')), rp(sum(list, 'Total_Potongan')), rp(sum(list, 'Gaji_Bersih')), ''] : null });
}


/* ============================================================
   IMPOR PANEN DARI EXCEL
   ============================================================ */
const IMPOR = { rows: [] };
const normKey = h => String(h || '').toLowerCase().replace(/[^a-z]/g, '');

function unduhTemplatPanen() {
  if (!window.XLSX) return toast('Pustaka Excel belum termuat.', 'warning');
  const aktif = S.data.petani.filter(p => p.Status === 'Aktif').sort((a, b) => String(a.Kapling).localeCompare(String(b.Kapling), 'id', { numeric: true }));
  const c1 = aktif[0] || { Kapling: 'D-01', Nama: 'Contoh Petani' }, c2 = aktif[1] || c1;
  const kep = ['Tanggal', 'Kapling', 'Nama', 'Bruto (kg)', 'Sortasi (kg)', 'Netto (kg)', 'Ongkos per kg (Rp)', 'Ongkos tetap (Rp)', 'Tabungan (Rp)', 'Masjid (Rp)', 'Potongan manual (nama)', 'Potongan manual (Rp)', 'Catatan'];
  const aoa = [kep,
    [hari(), c1.Kapling, c1.Nama, 1200, 20, '', '', '', '', '', '', '', 'contoh: netto dihitung dari bruto - sortasi'],
    [hari(), c2.Kapling, c2.Nama, '', '', 1065, '', '', '', '', 'Kasbon pupuk', 50000, 'contoh: langsung isi netto']];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = kep.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Panen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Kapling', 'Nama', 'Status']].concat(aktif.map(p => [p.Kapling, p.Nama, p.Status]))), 'Daftar Petani');
  XLSX.writeFile(wb, 'Templat Impor Panen Hamparan D.xlsx');
}

function parseTgl(v) {
  if (v === '' || v === null || v === undefined) return '';
  const z = n => String(n).padStart(2, '0');
  if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 12 * 3600 * 1000); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  if (typeof v === 'number' && window.XLSX) { const o = XLSX.SSF.parse_date_code(v); return o ? o.y + '-' + z(o.m) + '-' + z(o.d) : ''; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (m) return m[1] + '-' + z(m[2]) + '-' + z(m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + z(m[2]) + '-' + z(m[1]);
  return '';
}
const angkaX = v => { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : NaN; };

function bacaExcelPanen(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  if (aoa.length < 2) throw new Error('Berkas kosong atau hanya berisi judul kolom.');
  const peta = {};
  aoa[0].forEach((h, i) => {
    const k = normKey(h);
    if (k.startsWith('tanggal')) peta.tgl = i; else if (k === 'kapling') peta.kap = i; else if (k === 'nama' || k === 'namapetani') peta.nama = i;
    else if (k.startsWith('bruto')) peta.bruto = i; else if (k.startsWith('sortasi')) peta.sort = i; else if (k.startsWith('netto')) peta.netto = i;
    else if (k.includes('ongkos') && k.includes('tetap')) peta.ongT = i; else if (k.includes('ongkos')) peta.ongK = i;
    else if (k.startsWith('tabungan')) peta.tab = i; else if (k.startsWith('masjid')) peta.msj = i;
    else if (k.includes('manual') && k.includes('nama')) peta.manN = i; else if (k.includes('manual')) peta.manJ = i; else if (k.startsWith('catatan')) peta.cat = i;
  });
  if (peta.tgl === undefined || (peta.kap === undefined && peta.nama === undefined)) throw new Error('Kolom "Tanggal" dan "Kapling" atau "Nama" tidak ditemukan. Gunakan templat dari tombol Unduh Templat.');
  const out = [];
  for (let r = 1; r < aoa.length; r++) {
    const b = aoa[r];
    if (b.every(c => c === '' || c === null)) continue;
    const g = k => peta[k] === undefined ? '' : b[peta[k]];
    out.push({ baris: r + 1, tgl: parseTgl(g('tgl')), tglRaw: g('tgl'), kap: String(g('kap')).trim(), nama: String(g('nama')).trim(), bruto: angkaX(g('bruto')), sort: angkaX(g('sort')), netto: angkaX(g('netto')), ongK: angkaX(g('ongK')), ongT: angkaX(g('ongT')), tab: angkaX(g('tab')), msj: angkaX(g('msj')), manN: String(g('manN')).trim(), manJ: angkaX(g('manJ')), cat: String(g('cat')).trim() });
  }
  if (!out.length) throw new Error('Tidak ada baris data pada berkas.');
  if (out.length > 600) throw new Error('Maksimal 600 baris per berkas.');
  return out;
}

function siapkanBarisImpor(x) {
  const e = [];
  const lc = s => String(s).toLowerCase();
  let pet = null;
  if (x.kap) pet = S.data.petani.find(p => lc(p.Kapling) === lc(x.kap));
  if (!pet && x.nama) pet = S.data.petani.find(p => lc(p.Nama) === lc(x.nama));
  if (!x.tgl) e.push('Tanggal tidak valid');
  if (!pet) e.push('Petani tidak ditemukan (cek Kapling/Nama)');
  else if (pet.Status !== 'Aktif') e.push('Petani nonaktif');
  [x.bruto, x.sort, x.netto, x.ongK, x.ongT, x.tab, x.msj, x.manJ].forEach(v => { if (Number.isNaN(v) || (v !== null && v < 0)) e.push('Ada angka tidak valid'); });
  const bruto = x.bruto > 0 ? x.bruto : 0;
  const netto = bruto > 0 ? +(bruto - (x.sort || 0)).toFixed(2) : (x.netto || 0);
  if (!(netto > 0)) e.push('Netto harus lebih dari 0');
  const harga = x.tgl ? hargaPada(x.tgl) : 0;
  if (x.tgl && !(harga > 0)) e.push('Harga TBS tanggal itu belum diatur');
  let calc = null, payload = null;
  if (!e.length) {
    const t = potonganTetap(pet, netto, Math.round(netto * harga));
    let mode = t.ongkosMode, nilai = t.ongkosNilai;
    if (x.ongT > 0) { mode = 'tetap'; nilai = x.ongT; } else if (x.ongK !== null && x.ongK !== undefined) { mode = 'perkg'; nilai = x.ongK; }
    const ongkos = mode === 'tetap' ? Math.round(nilai) : Math.round(nilai * netto);
    const manual = x.manN && x.manJ > 0 ? [{ nama: x.manN.slice(0, 40), jumlah: Math.round(x.manJ) }] : [];
    const tab = x.tab !== null ? Math.round(x.tab) : t.tabungan, msj = x.msj !== null ? Math.round(x.msj) : t.masjid;
    calc = hitung({ netto, harga, tarif: tarifAktif(), tabungan: tab, masjid: msj, ongkos, pajak: 0, manual });
    if (calc.bersih < 0) e.push('Total potongan melebihi hasil kotor');
    payload = { _baris: x.baris, Tanggal: x.tgl, ID_Petani: pet.ID_Petani, Bruto: bruto > 0 ? bruto : '', Sortasi: bruto > 0 ? (x.sort || 0) : '', Netto: netto, Tabungan: tab, Masjid: msj, Ongkos_Mode: mode, Ongkos_Rate: mode === 'perkg' ? nilai : '', Ongkos_Panen: mode === 'tetap' ? Math.round(nilai) : 0, Manual_Items: manual, Catatan: x.cat };
  }
  return { x, pet, calc, payload, err: e.filter((v, i, a) => a.indexOf(v) === i) };
}

function renderImporPreview() {
  const R = IMPOR.rows, ok = R.filter(r => !r.err.length), bad = R.length - ok.length;
  $('#imporSum').innerHTML = kpi('bi-file-earmark-check', 'Baris valid', ok.length, 'Siap diimpor') + kpi('bi-exclamation-triangle', 'Baris bermasalah', bad, 'Dilewati', bad ? 'red' : '')
    + kpi('bi-basket3', 'Total netto valid', fmtKg(ok.reduce((s, r) => s + r.calc.netto, 0)) + ' kg', '') + kpi('bi-person-check', 'Total gaji bersih', rp(ok.reduce((s, r) => s + r.calc.bersih, 0)), '', 'gold');
  $('#imporPreview').innerHTML = tabel([{ h: 'Baris' }, { h: 'Tanggal' }, { h: 'Petani' }, { h: 'Netto', c: 'r' }, { h: 'Hasil kotor', c: 'r' }, { h: 'Potongan', c: 'r' }, { h: 'Gaji bersih', c: 'r' }, { h: 'Status' }],
    R.map(r => ({ cls: r.err.length ? 'pending' : '', cells: [r.x.baris, r.x.tgl ? tglIndo(r.x.tgl) : esc(r.x.tglRaw), r.pet ? '<b>' + esc(r.pet.Nama) + '</b><div class="sub">' + esc(r.pet.Kapling) + '</div>' : esc(r.x.nama || r.x.kap || '-'),
      r.calc ? fmtKg(r.calc.netto) + ' kg' : '–', r.calc ? rp(r.calc.kotor) : '–', r.calc ? rp(r.calc.total) : '–', r.calc ? '<b>' + rp(r.calc.bersih) + '</b>' : '–',
      r.err.length ? '<span class="badge-x b-out">' + esc(r.err.join('; ')) + '</span>' : '<span class="badge-x b-ok">Siap</span>'] })), { kosong: 'Belum ada berkas.' });
  $('#btnImporSimpan').disabled = ok.length === 0;
}

async function pilihBerkasImpor(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    IMPOR.rows = bacaExcelPanen(buf).map(siapkanBarisImpor);
    renderImporPreview();
  } catch (e) { IMPOR.rows = []; $('#imporSum').innerHTML = ''; $('#imporPreview').innerHTML = '<div class="text-out p-2">' + esc(e.message) + '</div>'; $('#btnImporSimpan').disabled = true; }
}

async function simpanImpor() {
  const ok = IMPOR.rows.filter(r => !r.err.length);
  if (!ok.length) return;
  const btn = $('#btnImporSimpan'); setLoading(btn, true, 'Mengimpor…');
  let berhasil = 0; const gagal = [];
  try {
    for (let i = 0; i < ok.length; i += 100) {
      const r = await api('panen.import', { rows: ok.slice(i, i + 100).map(x => x.payload) });
      berhasil += r.berhasil; r.gagal.forEach(g => gagal.push(g));
    }
    terapkanData(await api('refresh'));
    modal('mdImpor').hide(); renderHalaman(S.page);
    toast(berhasil + ' panen berhasil diimpor' + (gagal.length ? ', ' + gagal.length + ' gagal: baris ' + gagal.slice(0, 5).map(g => g.baris + ' (' + g.pesan + ')').join(', ') : '.'), gagal.length ? 'warning' : 'success');
  } catch (e) { toast('Impor terhenti: ' + e.message + (berhasil ? ' (' + berhasil + ' baris sudah masuk)' : ''), 'danger'); try { terapkanData(await api('refresh')); renderHalaman(S.page); } catch (e2) { /* abaikan */ } }
  setLoading(btn, false);
}

/* ============================================================
   SLIP BPHP (cetak, PDF)
   ============================================================ */
const SLIP_CSS = '.sheet{width:100%;height:312mm;border-collapse:collapse;table-layout:fixed;page-break-after:always}.sheet:last-child{page-break-after:auto}.sheet td.cell{height:50%}'
  + '.sheet td.cell:first-child{padding-right:4.5mm}.sheet td.cell:last-child{padding-left:4.5mm}.sheet td.cell{width:50%;vertical-align:top;padding:2.5mm 1.5mm;border:1px dashed #9CA3AF;background:#fff}'
  + '.slip{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;color:#000;width:100%;line-height:1.3;display:flex;flex-direction:column;height:147mm}.slip .s-bawah{margin-top:auto}'
  + '.slip table{width:100%;border-collapse:collapse;table-layout:fixed}'
  + '.slip td,.slip th{padding:1px 3px;font-size:8.5pt;vertical-align:middle;color:#000}'
  + '.s-kop{text-align:center;border-bottom:2px solid #000;padding-bottom:3px;margin-bottom:3px}'
  + '.s-kop div{font-weight:bold;font-size:8.5pt;line-height:1.25}.s-kop .a{font-weight:normal;font-size:7.5pt}'
  + '.s-no{font-size:8pt;margin:2px 0 4px}.s-h{font-weight:bold;margin:5px 0 2px}'
  + '.s-box th,.s-box td{border:1px solid #000}.s-box th{text-align:center;font-weight:bold}'
  + '.slip *{-webkit-print-color-adjust:exact;print-color-adjust:exact}.slip .hl{background:#FFF176;font-weight:bold}.slip .r{text-align:right}.slip .c{text-align:center}'
  + '.slip .tot td{font-weight:bold}.s-tgl{text-align:right;font-size:8pt;margin:6px 0 2px}'
  + '.slip .big{font-size:10.5pt;font-weight:bold}.slip .hl-t{display:inline-block;padding:1px 6px;line-height:1.25}.slip .gb{font-size:12pt;font-weight:800}.s-terb{font-size:8pt;margin-top:3px;text-transform:capitalize;line-height:1.3}.s-terb b{text-transform:none}.s-ttd td{text-align:center;font-size:8pt}.s-ttd .gap td{height:44px;vertical-align:middle}.s-sig{max-height:40px;max-width:92%;display:block;margin:0 auto}.s-kop img{float:left;height:11mm;margin-right:2mm}.s-kop:after{content:"";display:block;clear:both}';

/** Angka -> terbilang Bahasa Indonesia (mis. 2301000 -> "dua juta tiga ratus satu ribu rupiah"). */
function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const sat = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const t = x => {
    if (x < 12) return sat[x];
    if (x < 20) return sat[x - 10] + ' belas';
    if (x < 100) return sat[Math.floor(x / 10)] + ' puluh' + (x % 10 ? ' ' + sat[x % 10] : '');
    if (x < 200) return 'seratus' + (x - 100 ? ' ' + t(x - 100) : '');
    if (x < 1000) return sat[Math.floor(x / 100)] + ' ratus' + (x % 100 ? ' ' + t(x % 100) : '');
    if (x < 2000) return 'seribu' + (x - 1000 ? ' ' + t(x - 1000) : '');
    if (x < 1e6) return t(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + t(x % 1000) : '');
    if (x < 1e9) return t(Math.floor(x / 1e6)) + ' juta' + (x % 1e6 ? ' ' + t(x % 1e6) : '');
    if (x < 1e12) return t(Math.floor(x / 1e9)) + ' miliar' + (x % 1e9 ? ' ' + t(x % 1e9) : '');
    return String(x);
  };
  return n === 0 ? 'nol rupiah' : t(n) + ' rupiah';
}
function slipHtml(r) {
  const g = S.data.pengaturan || {};
  const K = !!r._kosong;   // formulir kosong: angka yang belum diketahui dibiarkan kosong untuk ditulis tangan
  const man = parseManual(r.Manual_Items);
  const n = v => (v === '' || v === null || v === undefined) ? '' : fmtN(v);
  const kgTxt = v => (v === '' || v === null || v === undefined) ? '' : fmtKg(v) + ' KG';
  const lain = [['Tabungan', '', r.Tabungan], ['Masjid', '', r.Masjid], ['Ong. Panen', r.Ongkos_Rate ? fmtN(r.Ongkos_Rate) : '', r.Ongkos_Panen]].concat(num(r.Pajak) > 0 ? [['PAJAK', '', r.Pajak]] : []).concat(man.map(m => [m.nama, '', m.jumlah]));
  const std = [['Transport', r.Tarif_Transport, r.Transport], ['Kelompok', r.Tarif_Kelompok, r.Kelompok], ['Penimbang', r.Tarif_Penimbang, r.Penimbang], ['Koperasi', r.Tarif_Koperasi, r.Koperasi]];
  let h = '<div class="slip">';
  h += '<div class="s-kop">' + (g.logo ? '<img src="' + esc(g.logo) + '" alt="">' : '') + '<div>' + esc(g.judul_slip || 'BUKTI PEMBAYARAN HASIL PANEN ( BPHP ) TBS') + '</div><div>' + esc(g.nama_kelompok || '') + '</div><div class="a">' + esc(g.alamat || '') + '</div></div>';
  h += '<div class="s-no">No. Bukti : ' + (K ? '....................' : esc(r.No_Bukti)) + '</div>';
  h += '<table><tr><td style="width:19%">Nama</td><td style="width:35%"><span class="hl hl-t">: ' + esc(String(r.Nama).toUpperCase()) + '</span>' + (K && r.Kapling ? ' <span style="font-weight:normal">(' + esc(r.Kapling) + ')</span>' : '') + '</td><td style="width:26%">Berat Bruto</td><td class="r" style="width:20%">' + (r.Bruto === '' || r.Bruto === undefined ? ':&nbsp;&nbsp;KG' : ': ' + kgTxt(r.Bruto)) + '</td></tr>'
    + '<tr><td>Gaji Bulan</td><td>: ' + esc(r.Gaji_Bulan) + '</td><td>Sortasi</td><td class="r">' + (r.Sortasi === '' || r.Sortasi === undefined ? ':&nbsp;&nbsp;KG' : ': ' + kgTxt(r.Sortasi)) + '</td></tr>'
    + '<tr><td>Harga TBS</td><td class="big">: ' + n(r.Harga) + '</td><td>Berat Netto</td><td class="r"><b>: ' + n(r.Netto) + '</b> KG</td></tr></table>';
  h += '<div class="s-h">A.&nbsp; Rincian Perhitungan</div>';
  h += '<table class="s-box"><tr><th style="width:9%">No</th><th>Harga Tbs</th><th>NETTO</th><th>Jumlah</th></tr><tr><td class="c">&nbsp;</td><td class="c big">' + n(r.Harga) + '</td><td class="c big">' + n(r.Netto) + '</td><td class="r big">' + n(r.Kotor) + '</td></tr></table>';
  h += '<div class="s-h">B.&nbsp; Rincian Potongan</div>';
  h += '<table class="s-box"><tr><th style="width:9%">No</th><th style="width:37%">Urain</th><th style="width:21%">Jumlah / Kg</th><th style="width:33%">Jumlah</th></tr>';
  std.forEach((s, i) => { h += '<tr><td class="c">' + (i + 1) + '</td><td>' + s[0] + '</td><td class="c">' + n(s[1]) + '</td><td class="r">' + n(s[2]) + '</td></tr>'; });
  h += '<tr><td class="c">5</td><td colspan="3">Lain – Lain</td></tr>';
  lain.forEach(l => { h += '<tr><td></td><td>· ' + esc(l[0]) + '</td><td class="c">' + esc(l[1]) + '</td><td class="r">' + n(l[2]) + '</td></tr>'; });
  h += '<tr class="tot"><td colspan="3">JUMLAH POTONGAN</td><td class="r">' + n(r.Total_Potongan) + '</td></tr></table>';
  h += '<table style="margin-top:5px"><tr><td style="width:34%"><b>Gaji Bersih :</b></td><td style="width:66%"><span class="hl hl-t gb">Rp&nbsp;&nbsp;' + n(r.Gaji_Bersih) + '</span></td></tr></table>';
  h += '<div class="s-terb"><b>Terbilang :</b> ' + (K ? '..............................................................' : '<i>' + esc(terbilang(r.Gaji_Bersih)) + '</i>') + '</div>';
  h += '<div class="s-bawah"><div class="s-tgl">' + esc(g.tempat_cetak || '') + ', ' + (K ? '........................' : tglIndo(r.Tanggal)) + '</div>';
  h += '<table class="s-ttd"><tr><td>Ketua Kelompok Tani</td><td>Bendahara</td><td>Sekretaris</td></tr><tr class="gap">' + ['ketua', 'bendahara', 'sekretaris'].map(k => '<td>' + (g['ttd_' + k] ? '<img class="s-sig" src="' + esc(g['ttd_' + k]) + '" alt="">' : '&nbsp;') + '</td>').join('') + '</tr>'
    + '<tr><td>( ' + esc(g.ketua_nama || '') + ' )</td><td>( ' + esc(g.bendahara_nama || '') + ' )</td><td>( ' + esc(g.sekretaris_nama || '') + ' )</td></tr></table></div>';
  return h + '</div>';
}
function slipSheets(list) {
  if (!list.length) return '<div class="empty" style="background:#fff;color:#555">Tidak ada slip pada filter ini.</div>';
  let out = '';
  for (let i = 0; i < list.length; i += 4) {
    const c = [0, 1, 2, 3].map(k => list[i + k] ? slipHtml(list[i + k]) : '&nbsp;');
    out += '<table class="sheet"><tr><td class="cell">' + c[0] + '</td><td class="cell">' + c[1] + '</td></tr><tr><td class="cell">' + c[2] + '</td><td class="cell">' + c[3] + '</td></tr></table>';
  }
  return out;
}
function slipDocument(list) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:215mm 330mm;margin:5mm 2mm}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}' + SLIP_CSS + '</style></head><body>' + slipSheets(list) + '</body></html>';
}
function fitPreview(el) {
  const wrap = el.parentElement; if (!wrap) return;
  const lebar = Math.max(260, wrap.clientWidth - 24);
  el.style.width = '752px'; el.style.background = '#fff'; el.style.zoom = Math.min(1, lebar / 752);
}

/** Slip kosong yang terisi otomatis dari data petani (nama, harga TBS, tarif, potongan tetap); berat diisi tangan. */
function slipDariPetani(pet, periode) {
  const tg = tarifAktif(), hr = hargaTerbaru();
  const ym = periode && periode !== 'all' ? periode : bln(hari());
  const nom = v => num(v) > 0 ? num(v) : '';
  return {
    _kosong: true, ID: 'k_' + pet.ID_Petani, No_Bukti: '', Tanggal: '', Gaji_Bulan: labelBulanPenuh(ym),
    ID_Petani: pet.ID_Petani, Nama: pet.Nama, Kapling: pet.Kapling, Bruto: '', Sortasi: '', Netto: '', Harga: hr ? num(hr.Harga) : '', Kotor: '',
    Tarif_Transport: tg.transport, Tarif_Kelompok: tg.kelompok, Tarif_Penimbang: tg.penimbang, Tarif_Koperasi: tg.koperasi,
    Transport: '', Kelompok: '', Penimbang: '', Koperasi: '',
    Tabungan: nom(pet.Tabungan), Masjid: nom(pet.Masjid),
    Ongkos_Rate: pet.Ongkos_Jenis === 'perkg' ? num(pet.Ongkos_Nilai) : '', Ongkos_Panen: pet.Ongkos_Jenis === 'nominal' ? nom(pet.Ongkos_Nilai) : '',
    Pajak: '',
    Manual_Items: '', Total_Potongan: '', Gaji_Bersih: ''
  };
}
function listSlipTerpilih() {
  const per = $('#slPeriode').value || 'all', pid = $('#slPetani').value;
  const dari = $('#slDari').value, sampai = $('#slSampai').value, pakaiTgl = !!(dari || sampai);
  const urut = (a, b) => String(a.Kapling).localeCompare(String(b.Kapling), 'id', { numeric: true });
  if ($('#slMode').value === 'kosong') {
    return S.data.petani.filter(p => p.Status === 'Aktif' && !p._pending && (!pid || p.ID_Petani === pid)).sort(urut).map(p => slipDariPetani(p, dari ? bln(dari) : per));
  }
  let l = (pakaiTgl ? S.data.panen.filter(r => (!dari || String(r.Tanggal) >= dari) && (!sampai || String(r.Tanggal) <= sampai)) : filterPer(S.data.panen, per)).filter(r => !r._pending);
  if (pid) l = l.filter(r => r.ID_Petani === pid);
  return l.sort((a, b) => urut(a, b) || String(a.Tanggal).localeCompare(String(b.Tanggal)));
}
function renderSlip() {
  isiSelect($('#slPeriode'), opsiPeriode(true), $('#slPeriode').value || (S.data.panen.length ? bln(S.data.panen.slice().sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal))).pop().Tanggal) : 'all'));
  isiSelect($('#slPetani'), [{ v: '', l: 'Semua petani' }].concat(S.data.petani.slice().sort((a, b) => String(a.Kapling).localeCompare(String(b.Kapling), 'id', { numeric: true })).map(p => ({ v: p.ID_Petani, l: (p.Kapling ? p.Kapling + ' — ' : '') + p.Nama }))), $('#slPetani').value);
  const l = listSlipTerpilih(); S.slipAktif = l;
  const kosong = $('#slMode').value === 'kosong';
  $('#slSummary').innerHTML = kpi('bi-receipt', 'Jumlah slip', l.length, Math.ceil(l.length / 4) + ' lembar F4')
    + (kosong ? kpi('bi-pencil-square', 'Mode formulir', 'Isi tangan', 'Berat & jumlah potongan per-kg ditulis manual') + kpi('bi-tag', 'Harga TBS tercetak', hargaTerbaru() ? rp(hargaTerbaru().Harga) : '–', 'Harga terbaru', 'gold')
      : kpi('bi-basket3', 'Total netto', fmtKg(sum(l, 'Netto')) + ' kg', '') + kpi('bi-person-check', 'Total gaji bersih', rp(sum(l, 'Gaji_Bersih')), 'Potongan ' + rp(sum(l, 'Total_Potongan')), 'gold'));
  const pv = $('#slPreview'); pv.innerHTML = slipSheets(l); fitPreview(pv);
}
function bukaPreview(list) {
  S.slipAktif = list; $('#mdPreviewTitle').textContent = list.length === 1 ? 'Slip BPHP — ' + list[0].Nama : 'Pratinjau ' + list.length + ' slip';
  const b = $('#mdPreviewBody'); b.innerHTML = slipSheets(list); modal('mdPreview').show();
  setTimeout(() => fitPreview(b), 250);
}
function cetakHtml(html) {
  const pa = $('#printArea'); pa.innerHTML = html; document.body.classList.add('printing');
  const selesai = () => { document.body.classList.remove('printing'); pa.innerHTML = ''; window.removeEventListener('afterprint', selesai); };
  window.addEventListener('afterprint', selesai);
  setTimeout(() => { try { window.print(); } catch (e) { toast('Cetak langsung diblokir browser. Gunakan tombol Unduh PDF.', 'warning'); selesai(); } }, 150);
}
function cetakSlip(list) {
  if (!list.length) return toast('Tidak ada slip untuk dicetak.', 'warning');
  cetakHtml(slipSheets(list));
}
async function unduhPdfHtml(html, nama, btn) {
  setLoading(btn, true, 'Membuat PDF…');
  try {
    const r = await api('pdf.html', { html, nama });
    unduhBase64(r.base64, 'application/pdf', r.nama);
    toast('PDF ' + r.nama + ' siap diunduh.', 'success');
  } catch (e) { toast('Gagal membuat PDF: ' + e.message, 'danger'); }
  setLoading(btn, false);
}
function unduhBase64(b64, mime, nama) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
function namaBerkasSlip(list) {
  const pers = Array.from(new Set(list.map(r => r.Gaji_Bulan)));
  return 'Slip BPHP ' + (pers.length === 1 ? pers[0] : 'Hamparan D') + (list.length === 1 ? ' - ' + list[0].Nama : '') + (list[0] && list[0]._kosong ? ' (formulir)' : '');
}

/* ============================================================
   BUKU KAS
   ============================================================ */
function jenisBadge(j) { return '<span class="badge-x ' + (j === 'Pemasukan' ? 'b-in' : 'b-out') + '"><i class="bi ' + (j === 'Pemasukan' ? 'bi-arrow-down-left' : 'bi-arrow-up-right') + '"></i> ' + esc(j) + '</span>'; }

function kasDenganSaldo() {
  const urut = S.data.kas.slice().sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal)) || String(a.Timestamp).localeCompare(String(b.Timestamp)) || String(a.No_Kas).localeCompare(String(b.No_Kas)));
  let s = 0;
  return urut.map(k => { s += (k.Jenis === 'Pemasukan' ? 1 : -1) * num(k.Jumlah); return Object.assign({}, k, { _saldo: s }); });
}

function kasTersaring() {
  const per = $('#kasPeriode').value || 'all', j = $('#kasJenis').value, kat = $('#kasKategori').value, q = $('#kasSearch').value.trim().toLowerCase();
  let l = kasDenganSaldo();
  l = filterPer(l, per);
  if (j) l = l.filter(k => k.Jenis === j);
  if (kat) l = l.filter(k => k.Kategori === kat);
  if (q) l = l.filter(k => (k.No_Kas + ' ' + k.Keterangan + ' ' + k.Pihak + ' ' + k.Kategori).toLowerCase().includes(q));
  return l.reverse();
}

function renderKas() {
  isiSelect($('#kasPeriode'), opsiPeriode(true), $('#kasPeriode').value || 'all');
  const semuaKat = Array.from(new Set([].concat(S.data.kategoriKas.Pemasukan || [], S.data.kategoriKas.Pengeluaran || [])));
  isiSelect($('#kasKategori'), [{ v: '', l: 'Semua kategori' }].concat(semuaKat.map(k => ({ v: k, l: k }))), $('#kasKategori').value);
  const l = kasTersaring();
  const masuk = sum(l.filter(k => k.Jenis === 'Pemasukan'), 'Jumlah'), keluar = sum(l.filter(k => k.Jenis === 'Pengeluaran'), 'Jumlah');
  $('#kasKpi').innerHTML = kpi('bi-wallet2', 'Saldo kas riil', rp(saldoKasGlobal()), 'Akumulasi seluruh mutasi', 'gold') + kpi('bi-arrow-down-left', 'Total penerimaan', rp(masuk), 'Sesuai filter') + kpi('bi-arrow-up-right', 'Total pengeluaran', rp(keluar), 'Sesuai filter', 'red');
  const edit = can('kas.save');
  const rows = l.map(k => ({
    cls: k._pending ? 'pending' : '',
    cells: [
      '<b>' + esc(k.No_Kas) + '</b>' + (k._pending ? ' <span class="spin spin-sm"></span>' : '') + '<div class="sub">' + tglIndo(k.Tanggal) + '</div>',
      jenisBadge(k.Jenis) + '<div class="sub">' + esc(k.Kategori) + '</div>',
      '<b>' + esc(k.Keterangan) + '</b>' + (k.Pihak ? '<div class="sub">' + esc(k.Pihak) + '</div>' : '') + '<div class="sub">oleh ' + esc(k.Dicatat_Oleh) + '</div>',
      '<span class="fw-800 ' + (k.Jenis === 'Pemasukan' ? 'text-in' : 'text-out') + '">' + (k.Jenis === 'Pemasukan' ? '+' : '−') + fmtN(k.Jumlah) + '</span>',
      rp(k._saldo),
      (k.Bukti_FileId ? '<button class="btn-x btn-out btn-sm" data-act="bukti" data-id="' + esc(k.ID) + '"><i class="bi bi-paperclip"></i> Lihat</button>' : '<span class="muted">–</span>')
      + (edit && !k._pending ? ' <button class="btn-x btn-out btn-sm btn-ic" data-act="editKas" data-id="' + esc(k.ID) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn-x btn-out btn-sm btn-ic" data-act="hapusKas" data-id="' + esc(k.ID) + '" aria-label="Hapus"><i class="bi bi-trash text-out"></i></button>' : '')
    ]
  }));
  $('#kasTable').innerHTML = tabel([{ h: 'No. / tanggal' }, { h: 'Jenis' }, { h: 'Uraian' }, { h: 'Jumlah (Rp)', c: 'r' }, { h: 'Saldo (Rp)', c: 'r' }, { h: 'Bukti & aksi', c: 'r', k: 'acts nolabel' }], rows, { kosong: 'Tidak ada mutasi kas pada filter ini.' });

  const perK = {};
  l.filter(k => k.Jenis === 'Pengeluaran').forEach(k => { perK[k.Kategori] = (perK[k.Kategori] || 0) + num(k.Jumlah); });
  const kat = Object.keys(perK).sort((a, b) => perK[b] - perK[a]);
  gambar('chKas', { type: 'doughnut', data: { labels: kat, datasets: [{ data: kat.map(k => perK[k]), backgroundColor: WARNA, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + rp(c.parsed) } } } } });
  $('#kasLegend').innerHTML = kat.length ? kat.map((k, i) => '<div class="legend-row"><span class="dot" style="background:' + WARNA[i % WARNA.length] + '"></span><span class="nm">' + esc(k) + '</span><b class="num">' + rp(perK[k]) + '</b><span class="muted">' + (bagi(perK[k], keluar) * 100).toFixed(0) + '%</span></div>').join('') : '<div class="empty">Belum ada pengeluaran.</div>';
}

function pilihJenisKas(j) {
  S.kasJenis = j;
  $$('#fkJenis button').forEach(b => b.classList.toggle('on', b.dataset.j === j));
  isiSelect($('#fkKategori'), (S.data.kategoriKas[j] || []).map(k => ({ v: k, l: k })), $('#fkKategori').value);
  hintSaldo();
}
function hintSaldo() {
  const j = num($('#fkJumlah').value), h = $('#fkSaldoHint');
  if (!j) { h.textContent = 'Saldo saat ini ' + rp(saldoKasGlobal()); return; }
  const sisa = saldoKasGlobal() + (S.kasJenis === 'Pemasukan' ? j : -j);
  h.innerHTML = 'Saldo saat ini ' + rp(saldoKasGlobal()) + ' → sisa <b class="' + (sisa < 0 ? 'text-out' : '') + '">' + rp(sisa) + '</b>' + (sisa < 0 ? ' (saldo akan minus!)' : '');
}
function bukaFormKas(jenis, id) {
  if (!can('kas.save')) return toast('Hanya Bendahara dan Sekretaris yang dapat mencatat kas.', 'warning');
  const k = id ? S.data.kas.find(x => x.ID === id) : null;
  S.editKasId = id || null;
  $('#mdKasTitle').textContent = k ? 'Ubah Mutasi Kas' : (jenis === 'Pemasukan' ? 'Catat Pemasukan Kas' : 'Catat Pengeluaran Kas');
  $('#fkNo').value = k ? k.No_Kas : 'Otomatis';
  $('#fkTanggal').value = k ? k.Tanggal : hari();
  $('#fkJumlah').value = k ? k.Jumlah : ''; $('#fkKet').value = k ? k.Keterangan : ''; $('#fkPihak').value = k ? k.Pihak : '';
  $('#fkFile').value = ''; $('#fkFileInfo').textContent = k && k.Bukti_FileId ? 'Bukti saat ini: ' + k.Bukti_Nama + ' (pilih berkas baru untuk menggantinya)' : '';
  S.kasJenis = k ? k.Jenis : jenis;
  $('#fkKategori').innerHTML = '';
  pilihJenisKas(S.kasJenis);
  if (k) $('#fkKategori').value = k.Kategori;
  modal('mdKas').show();
}
function bacaBerkas(file) {
  return new Promise((ok, gagal) => {
    if (!file) return ok(null);
    if (file.size > 5 * 1024 * 1024) return gagal(new Error('Ukuran berkas maksimal 5 MB.'));
    const fr = new FileReader();
    fr.onload = () => ok({ nama: file.name, mime: file.type, base64: String(fr.result).split(',')[1] });
    fr.onerror = () => gagal(new Error('Gagal membaca berkas.'));
    fr.readAsDataURL(file);
  });
}
async function simpanKas(ev) {
  ev.preventDefault();
  const jumlah = Math.round(num($('#fkJumlah').value));
  if (!$('#fkTanggal').value || !$('#fkKategori').value || !$('#fkKet').value.trim()) return toast('Lengkapi tanggal, kategori, dan uraian.', 'warning');
  if (!(jumlah > 0)) return toast('Nominal harus lebih dari 0.', 'warning');
  let file = null;
  try { file = await bacaBerkas($('#fkFile').files[0]); } catch (e) { return toast(e.message, 'danger'); }
  const lama = S.editKasId ? S.data.kas.find(k => k.ID === S.editKasId) : null;
  const payload = { ID: S.editKasId || '', Tanggal: $('#fkTanggal').value, Jenis: S.kasJenis, Kategori: $('#fkKategori').value, Keterangan: $('#fkKet').value.trim(), Jumlah: jumlah, Pihak: $('#fkPihak').value.trim(), file: file };
  const sementara = Object.assign({}, lama || {}, { ID: lama ? lama.ID : tmpId(), No_Kas: lama ? lama.No_Kas : '(otomatis)', Tanggal: payload.Tanggal, Jenis: payload.Jenis, Kategori: payload.Kategori, Keterangan: payload.Keterangan, Jumlah: jumlah, Pihak: payload.Pihak, Dicatat_Oleh: lama ? lama.Dicatat_Oleh : S.user.nama, Timestamp: new Date().toISOString(), _pending: true });
  if (!lama) { sementara.Bukti_FileId = ''; sementara.Bukti_Nama = ''; }
  const salinan = lama ? Object.assign({}, lama) : null;
  if (lama) S.data.kas[S.data.kas.indexOf(lama)] = sementara; else S.data.kas.push(sementara);
  modal('mdKas').hide(); renderHalaman(S.page); toast('Menyimpan transaksi kas' + (file ? ' + mengunggah bukti' : '') + '…', 'info');
  try {
    const rec = await api('kas.save', payload);
    S.data.kas[S.data.kas.findIndex(k => k.ID === sementara.ID)] = rec;
    renderHalaman(S.page); toast('Kas tersimpan: ' + rec.No_Kas, 'success');
  } catch (e) {
    const i = S.data.kas.findIndex(k => k.ID === sementara.ID);
    if (salinan) S.data.kas[i] = salinan; else S.data.kas.splice(i, 1);
    renderHalaman(S.page); toast('Gagal menyimpan kas: ' + e.message, 'danger');
  }
}
function hapusKas(id) {
  const k = S.data.kas.find(x => x.ID === id); if (!k || k._pending) return;
  konfirmasi('Hapus mutasi kas?', 'Transaksi <b>' + esc(k.No_Kas) + '</b> (' + esc(k.Jenis) + ' ' + rp(k.Jumlah) + ') beserta buktinya akan dihapus.', async () => {
    const i = S.data.kas.indexOf(k); S.data.kas.splice(i, 1); renderHalaman(S.page);
    try { await api('kas.delete', { ID: id }); toast('Mutasi kas dihapus.', 'success'); }
    catch (e) { S.data.kas.splice(i, 0, k); renderHalaman(S.page); toast('Gagal menghapus: ' + e.message, 'danger'); }
  }, 'Hapus');
}
async function lihatBukti(id) {
  const k = S.data.kas.find(x => x.ID === id); if (!k || !k.Bukti_FileId) return;
  $('#mdBuktiTitle').textContent = 'Bukti ' + k.No_Kas;
  $('#mdBuktiBody').innerHTML = '<div class="spin mx-auto my-4"></div><div class="muted">Memuat bukti dari Google Drive…</div>';
  $('#btnBuktiUnduh').removeAttribute('href'); modal('mdBukti').show();
  try {
    const r = await api('bukti.get', { fileId: k.Bukti_FileId });
    const bin = atob(r.base64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: r.mime }));
    $('#mdBuktiBody').innerHTML = r.mime === 'application/pdf' ? '<iframe src="' + url + '" style="width:100%;height:70vh;border:0" title="Bukti"></iframe>' : '<img src="' + url + '" alt="Bukti nota" style="max-width:100%;border-radius:12px">';
    $('#btnBuktiUnduh').href = url; $('#btnBuktiUnduh').download = r.nama;
  } catch (e) { $('#mdBuktiBody').innerHTML = '<div class="text-out">Gagal memuat bukti: ' + esc(e.message) + '</div>'; }
}

/* ============================================================
   PETANI
   ============================================================ */
function ringkasPotongan(p) {
  const c = [];
  if (num(p.Tabungan)) c.push('Tabungan ' + fmtN(p.Tabungan));
  if (num(p.Masjid)) c.push('Masjid ' + fmtN(p.Masjid));
  if (p.Ongkos_Jenis === 'perkg') c.push('Ongkos ' + fmtN(p.Ongkos_Nilai) + '/kg'); else if (p.Ongkos_Jenis === 'nominal') c.push('Ongkos ' + fmtN(p.Ongkos_Nilai));
  return c.length ? c.map(x => '<span class="badge-x b-off" style="text-transform:none;letter-spacing:0">' + esc(x) + '</span>').join(' ') : '<span class="muted">–</span>';
}
function renderPetani() {
  const P = S.data.petani, aktif = P.filter(p => p.Status === 'Aktif');
  $('#ptKpi').innerHTML = kpi('bi-people', 'Anggota aktif', aktif.length, P.length + ' terdaftar') + kpi('bi-bounding-box', 'Total luas', fmtKg(sum(aktif, 'Luas_Ha')) + ' <small>Ha</small>', 'Rata-rata ' + fmtKg(bagi(sum(aktif, 'Luas_Ha'), aktif.length)) + ' Ha/kapling') + kpi('bi-basket3', 'Total tonase tercatat', fmtKg(sum(S.data.panen, 'Netto')) + ' <small>kg</small>', 'Seluruh periode', 'gold');
  const q = $('#ptSearch').value.trim().toLowerCase(), st = $('#ptStatus').value;
  let l = P.slice().sort((a, b) => String(a.Kapling).localeCompare(String(b.Kapling), 'id', { numeric: true }));
  if (q) l = l.filter(p => (p.Nama + ' ' + p.Kapling).toLowerCase().includes(q));
  if (st) l = l.filter(p => p.Status === st);
  const edit = can('petani.save');
  const terakhir = {}; S.data.panen.forEach(r => { if (!terakhir[r.ID_Petani] || r.Tanggal > terakhir[r.ID_Petani]) terakhir[r.ID_Petani] = r.Tanggal; });
  $('#ptTable').innerHTML = tabel([{ h: 'Kapling' }, { h: 'Nama petani' }, { h: 'Luas (Ha)', c: 'r' }, { h: 'Potongan tetap' }, { h: 'Panen terakhir' }, { h: 'Status' }, { h: 'Aksi', c: 'r', k: 'acts nolabel' }],
    l.map(p => ({ cls: p._pending ? 'pending' : '', cells: ['<span class="badge-x b-ok">' + esc(p.Kapling || '–') + '</span>', '<b>' + esc(p.Nama) + '</b>' + (p.HP ? '<div class="sub">' + esc(p.HP) + '</div>' : ''), fmtKg(p.Luas_Ha), ringkasPotongan(p), terakhir[p.ID_Petani] ? tglIndo(terakhir[p.ID_Petani]) : '–', '<span class="badge-x ' + (p.Status === 'Aktif' ? 'b-ok' : 'b-off') + '">' + esc(p.Status) + '</span>',
      edit && !p._pending ? '<button class="btn-x btn-out btn-sm btn-ic" data-act="editPetani" data-id="' + esc(p.ID_Petani) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn-x btn-out btn-sm btn-ic" data-act="togglePetani" data-id="' + esc(p.ID_Petani) + '" aria-label="Ubah status"><i class="bi ' + (p.Status === 'Aktif' ? 'bi-pause-circle' : 'bi-play-circle') + '"></i></button> <button class="btn-x btn-out btn-sm btn-ic" data-act="hapusPetani" data-id="' + esc(p.ID_Petani) + '" aria-label="Hapus"><i class="bi bi-trash text-out"></i></button>' : ''] })),
    { kosong: 'Tidak ada petani pada filter ini.' });
  renderNonPetani();
}
function renderNonPetani() {
  const q = ($('#ptSearch').value || '').trim().toLowerCase();
  const l = S.data.penabung.slice().sort((a, b) => a.Nama.localeCompare(b.Nama)).filter(p => !q || (p.Nama + ' ' + p.Catatan).toLowerCase().includes(q));
  const edit = can('penabung.save');
  $('#pnbTable').innerHTML = tabel([{ h: 'Nama' }, { h: 'No. HP' }, { h: 'Catatan' }, { h: 'Saldo tabungan (Rp)', c: 'r' }, { h: 'Aksi', c: 'r', k: 'acts nolabel' }],
    l.map(p => ['<b>' + esc(p.Nama) + '</b><div class="sub">Non-petani</div>', esc(p.HP || '–'), esc(p.Catatan || '–'), fmtN(saldoTab(p.ID_Penabung)),
      edit ? '<button class="btn-x btn-out btn-sm btn-ic" data-act="editPenabung" data-id="' + esc(p.ID_Penabung) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn-x btn-out btn-sm btn-ic" data-act="hapusPenabung" data-id="' + esc(p.ID_Penabung) + '" aria-label="Hapus"><i class="bi bi-trash text-out"></i></button>' : '']),
    { kosong: 'Belum ada data non-petani.' });
}
function bukaFormPetani(id) {
  const p = id ? petaniById(id) : null;
  $('#mdPetaniTitle').textContent = p ? 'Ubah Data Petani' : 'Tambah Petani';
  $('#fptID').value = p ? p.ID_Petani : '';
  const set = (i, v) => { $('#' + i).value = v === undefined || v === null ? '' : v; };
  set('fptNama', p && p.Nama); set('fptKapling', p && p.Kapling); set('fptLuas', p ? p.Luas_Ha : 2); set('fptHP', p && p.HP); set('fptRek', p && p.Rekening);
  set('fptTab', p ? p.Tabungan : 0); set('fptMsj', p ? p.Masjid : 0); set('fptOngJ', p ? p.Ongkos_Jenis : 'tidak'); set('fptOngN', p ? p.Ongkos_Nilai : 0);
  set('fptStatus', p ? p.Status : 'Aktif'); set('fptCatatan', p && p.Catatan);
  hintOngkos(); modal('mdPetani').show();
}
function hintOngkos() { const j = $('#fptOngJ').value; $('#fptOngSuf').textContent = j === 'nominal' ? '/transaksi' : '/kg'; $('#fptOngHint').textContent = j === 'perkg' ? 'Rp per kg netto (mis. 200)' : (j === 'nominal' ? 'Rp tetap per transaksi panen (mis. 350000)' : ''); $('#fptOngN').disabled = j === 'tidak'; }
async function simpanPetani(ev) {
  ev.preventDefault();
  const nama = $('#fptNama').value.trim(); if (!nama) return toast('Nama petani wajib diisi.', 'warning');
  const payload = { ID_Petani: $('#fptID').value, Nama: nama, Kapling: $('#fptKapling').value.trim(), Luas_Ha: num($('#fptLuas').value), HP: $('#fptHP').value.trim(), Rekening: $('#fptRek').value.trim(), Tabungan: num($('#fptTab').value), Masjid: num($('#fptMsj').value), Ongkos_Jenis: $('#fptOngJ').value, Ongkos_Nilai: num($('#fptOngN').value), Status: $('#fptStatus').value, Catatan: $('#fptCatatan').value.trim().replace(/^DATA CONTOH.*$/i, '') };
  const lama = payload.ID_Petani ? petaniById(payload.ID_Petani) : null, salinan = lama ? Object.assign({}, lama) : null;
  const sementara = Object.assign({}, payload, { ID_Petani: lama ? lama.ID_Petani : tmpId(), _pending: true });
  if (lama) S.data.petani[S.data.petani.indexOf(lama)] = sementara; else S.data.petani.push(sementara);
  modal('mdPetani').hide(); renderHalaman(S.page);
  try {
    const rec = await api('petani.save', payload);
    S.data.petani[S.data.petani.findIndex(p => p.ID_Petani === sementara.ID_Petani)] = rec;
    renderHalaman(S.page); toast('Data ' + rec.Nama + ' tersimpan.', 'success');
  } catch (e) {
    const i = S.data.petani.findIndex(p => p.ID_Petani === sementara.ID_Petani);
    if (salinan) S.data.petani[i] = salinan; else S.data.petani.splice(i, 1);
    renderHalaman(S.page); toast('Gagal menyimpan petani: ' + e.message, 'danger');
  }
}
async function togglePetani(id) {
  const p = petaniById(id); if (!p) return;
  const baru = p.Status === 'Aktif' ? 'Nonaktif' : 'Aktif', lama = p.Status;
  p.Status = baru; renderHalaman(S.page);
  try { await api('petani.status', { ID_Petani: id, Status: baru }); toast(p.Nama + ' → ' + baru, 'success'); }
  catch (e) { p.Status = lama; renderHalaman(S.page); toast(e.message, 'danger'); }
}


function hapusPetani(id) {
  const p = petaniById(id); if (!p || p._pending) return;
  const n = S.data.panen.filter(r => r.ID_Petani === id).length;
  if (n > 0) return toast(p.Nama + ' sudah punya ' + n + ' catatan panen. Nonaktifkan saja, atau hapus catatan panennya dulu.', 'warning');
  konfirmasi('Hapus petani?', 'Data <b>' + esc(p.Nama) + '</b> (' + esc(p.Kapling || '-') + ') akan dihapus permanen.', async () => {
    const i = S.data.petani.indexOf(p); S.data.petani.splice(i, 1); renderHalaman(S.page);
    try { await api('petani.delete', { ID_Petani: id }); toast('Petani dihapus.', 'success'); }
    catch (e) { S.data.petani.splice(i, 0, p); renderHalaman(S.page); toast(e.message, 'danger'); }
  }, 'Hapus');
}

function hapusContoh() {
  const nP = S.data.panen.filter(r => String(r.Catatan).indexOf('Data contoh uji hitungan') === 0).length;
  const nK = S.data.kas.filter(r => /\(contoh\)/.test(String(r.Keterangan))).length;
  const nH = S.data.harga.filter(h => String(h.Catatan) === 'Harga contoh').length;
  const pakai = {}; S.data.panen.forEach(r => { if (String(r.Catatan).indexOf('Data contoh uji hitungan') !== 0) pakai[r.ID_Petani] = true; });
  const nT = S.data.petani.filter(p => String(p.Catatan).indexOf('DATA CONTOH') === 0 && !pakai[p.ID_Petani]).length;
  konfirmasi('Hapus data contoh?',
    '<p>Akan dihapus: <b>' + nP + '</b> panen contoh dan <b>' + nK + '</b> mutasi kas contoh.</p>'
    + '<label class="d-flex gap-2 mb-2"><input type="checkbox" id="chkPetaniContoh" checked> Hapus juga <b>' + nT + '</b> petani contoh (catatan "DATA CONTOH")</label>'
    + '<label class="d-flex gap-2"><input type="checkbox" id="chkHargaContoh"> Hapus juga ' + nH + ' harga TBS contoh (harga baru harus diisi lagi)</label>',
    async () => {
      const pet = $('#chkPetaniContoh') ? $('#chkPetaniContoh').checked : false, hrg = $('#chkHargaContoh') ? $('#chkHargaContoh').checked : false;
      try {
        const r = await api('contoh.hapus', { petani: pet, harga: hrg });
        terapkanData(r.data); renderHalaman(S.page);
        toast('Terhapus: ' + r.hasil.panen + ' panen, ' + r.hasil.kas + ' kas, ' + r.hasil.petani + ' petani, ' + r.hasil.harga + ' harga.', 'success');
      } catch (e) { toast('Gagal menghapus contoh: ' + e.message, 'danger'); }
    }, 'Hapus contoh');
}

/* ---------- Logo ---------- */
function terapkanLogo() {
  const lg = (S.data.pengaturan || {}).logo;
  $$('.logo-badge:not(.logo-prev)').forEach(el => {
    el.classList.toggle('has-img', !!lg);
    el.innerHTML = lg ? '<img alt="Logo" src="' + esc(lg) + '">' : '<i class="bi bi-flower2"></i>';
  });
}
function tampilPreviewLogo() {
  const lg = S.logoBaru !== null ? S.logoBaru : (S.data.pengaturan || {}).logo;
  const el = $('#logoPrev'); if (!el) return;
  el.classList.toggle('has-img', !!lg);
  el.innerHTML = lg ? '<img alt="Logo" src="' + esc(lg) + '">' : '<i class="bi bi-flower2"></i>';
}
function perkecilLogo(file) {
  return new Promise((ok, gagal) => {
    if (!file) return ok(null);
    const fr = new FileReader();
    fr.onerror = () => gagal(new Error('Gagal membaca gambar.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => gagal(new Error('Berkas bukan gambar yang valid.'));
      img.onload = () => {
        const coba = (maks, jpeg) => {
          const sk = Math.min(1, maks / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * sk)); c.height = Math.max(1, Math.round(img.height * sk));
          const x = c.getContext('2d'); if (jpeg) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
          x.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.85);
        };
        let d = coba(200, false);
        if (d.length > 45000) d = coba(200, true);
        if (d.length > 45000) d = coba(140, true);
        if (d.length > 45000) return gagal(new Error('Gambar terlalu rumit. Gunakan logo yang lebih sederhana.'));
        ok(d);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}


/* ---------- Tanda tangan ---------- */
const TTD_KUNCI = ['ketua', 'bendahara', 'sekretaris'];
function tampilPreviewTtd() {
  TTD_KUNCI.forEach(k => {
    const el = $('#ttdPrev_' + k); if (!el) return;
    const v = S.ttdBaru[k] !== undefined ? S.ttdBaru[k] : (S.data.pengaturan || {})['ttd_' + k];
    el.innerHTML = v ? '<img alt="Tanda tangan ' + k + '" src="' + esc(v) + '">' : '<span class="ttd-kosong">Belum ada</span>';
  });
}
function olahTtd(file) {
  return new Promise((ok, gagal) => {
    if (!file) return ok(null);
    const fr = new FileReader();
    fr.onerror = () => gagal(new Error('Gagal membaca gambar.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => gagal(new Error('Berkas bukan gambar yang valid.'));
      img.onload = () => {
        const coba = maks => {
          const sk = Math.min(1, maks / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * sk)); c.height = Math.max(1, Math.round(img.height * sk));
          const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
          const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
          for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const a = lum >= 225 ? 0 : lum <= 165 ? 255 : Math.round((225 - lum) / 60 * 255);
            d[i] = (d[i] >> 5) << 5; d[i + 1] = (d[i + 1] >> 5) << 5; d[i + 2] = (d[i + 2] >> 5) << 5; d[i + 3] = Math.min(d[i + 3], a);
          }
          x.putImageData(id, 0, 0);
          return c.toDataURL('image/png');
        };
        let r = coba(320);
        if (r.length > 35000) r = coba(240);
        if (r.length > 35000) r = coba(180);
        if (r.length > 35000) return gagal(new Error('Gambar terlalu rumit. Foto tanda tangan di kertas putih dengan pulpen gelap.'));
        ok(r);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ============================================================
   LAPORAN
   ============================================================ */
function dataLaporan() {
  let dari = $('#lpDari').value, sampai = $('#lpSampai').value;
  const P = S.data.panen.filter(r => (!dari || bln(r.Tanggal) >= dari) && (!sampai || bln(r.Tanggal) <= sampai) && !r._pending);
  const K = S.data.kas.filter(r => (!dari || bln(r.Tanggal) >= dari) && (!sampai || bln(r.Tanggal) <= sampai) && !r._pending);
  const m = {};
  P.forEach(r => { const k = r.ID_Petani; m[k] = m[k] || { nama: r.Nama, kapling: r.Kapling, n: 0, netto: 0, kotor: 0, pot: 0, bersih: 0 }; const o = m[k]; o.n++; o.netto += num(r.Netto); o.kotor += num(r.Kotor); o.pot += num(r.Total_Potongan); o.bersih += num(r.Gaji_Bersih); });
  const perPetani = Object.keys(m).map(k => m[k]).sort((a, b) => String(a.kapling).localeCompare(String(b.kapling), 'id', { numeric: true }));
  const bulan = Array.from(new Set(P.map(r => bln(r.Tanggal)).concat(K.map(r => bln(r.Tanggal))))).sort();
  const perBulan = bulan.map(b => { const p = P.filter(r => bln(r.Tanggal) === b), k = K.filter(r => bln(r.Tanggal) === b); return { bulan: b, netto: sum(p, 'Netto'), kotor: sum(p, 'Kotor'), pot: sum(p, 'Total_Potongan'), bersih: sum(p, 'Gaji_Bersih'), masuk: sum(k.filter(x => x.Jenis === 'Pemasukan'), 'Jumlah'), keluar: sum(k.filter(x => x.Jenis === 'Pengeluaran'), 'Jumlah') }; });
  return { P, K, perPetani, perBulan, dari, sampai };
}
function renderLaporan() {
  if (!$('#lpDari').value) {
    const bs = S.data.panen.map(r => bln(r.Tanggal)).concat(S.data.kas.map(r => bln(r.Tanggal))).sort();
    $('#lpDari').value = bs[0] || bln(hari()); $('#lpSampai').value = bs[bs.length - 1] || bln(hari());
  }
  const d = dataLaporan();
  const tot = d.perPetani.reduce((a, o) => ({ n: a.n + o.n, netto: a.netto + o.netto, kotor: a.kotor + o.kotor, pot: a.pot + o.pot, bersih: a.bersih + o.bersih }), { n: 0, netto: 0, kotor: 0, pot: 0, bersih: 0 });
  $('#lpPetani').innerHTML = tabel([{ h: 'Kapling' }, { h: 'Petani' }, { h: 'Panen (x)', c: 'r' }, { h: 'Netto (kg)', c: 'r' }, { h: 'Hasil kotor', c: 'r' }, { h: 'Potongan', c: 'r' }, { h: 'Gaji bersih', c: 'r' }],
    d.perPetani.map(o => [esc(o.kapling), '<b>' + esc(o.nama) + '</b>', o.n, fmtKg(o.netto), rp(o.kotor), rp(o.pot), '<b>' + rp(o.bersih) + '</b>']),
    { kosong: 'Tidak ada data panen pada rentang ini.', foot: d.perPetani.length ? ['', 'TOTAL', tot.n, fmtKg(tot.netto), rp(tot.kotor), rp(tot.pot), rp(tot.bersih)] : null });
  $('#lpBulan').innerHTML = tabel([{ h: 'Bulan' }, { h: 'Netto (kg)', c: 'r' }, { h: 'Hasil kotor', c: 'r' }, { h: 'Potongan', c: 'r' }, { h: 'Gaji bersih', c: 'r' }, { h: 'Kas masuk', c: 'r' }, { h: 'Kas keluar', c: 'r' }],
    d.perBulan.map(o => ['<b>' + labelBulanPenuh(o.bulan) + '</b>', fmtKg(o.netto), rp(o.kotor), rp(o.pot), rp(o.bersih), '<span class="text-in">' + rp(o.masuk) + '</span>', '<span class="text-out">' + rp(o.keluar) + '</span>']),
    { kosong: 'Tidak ada data pada rentang ini.' });
  gambar('chLpKapling', { type: 'bar', data: { labels: d.perPetani.map(o => o.kapling || o.nama), datasets: [{ label: 'Netto (kg)', data: d.perPetani.map(o => o.netto), backgroundColor: '#2E7D32', borderRadius: 6 }] }, options: Object.assign(opsiSumbu(false), { plugins: { legend: { display: false } } }) });
  gambar('chLpKas', { type: 'bar', data: { labels: d.perBulan.map(o => labelBulan(o.bulan)), datasets: [{ label: 'Masuk', data: d.perBulan.map(o => o.masuk), backgroundColor: '#15803D', borderRadius: 6 }, { label: 'Keluar', data: d.perBulan.map(o => o.keluar), backgroundColor: '#DC2626', borderRadius: 6 }] }, options: opsiSumbu(false) });
}

/* ---------- Ekspor Excel & PDF tabel ---------- */
function unduhExcel(namaFile, sheets) {
  if (!window.XLSX) {
    toast('Pustaka Excel belum termuat. Mengunduh CSV.', 'warning');
    const csv = sheets[0].aoa.map(r => r.map(c => '"' + String(c === undefined || c === null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = namaFile + '.csv'; document.body.appendChild(a); a.click(); a.remove(); return;
  }
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.aoa), s.nama.slice(0, 31)));
  XLSX.writeFile(wb, namaFile + '.xlsx');
  toast('Berkas ' + namaFile + '.xlsx diunduh.', 'success');
}
function tabelDoc(judul, sub, kepala, baris, kanan) {
  const g = S.data.pengaturan || {};
  const th = kepala.map(h => '<th style="border:1px solid #1B5E20;background:#E8F5E9;padding:4px;font-size:8pt">' + esc(h) + '</th>').join('');
  const tr = baris.map(r => '<tr>' + r.map((c, i) => '<td style="border:1px solid #999;padding:3px;font-size:8pt;text-align:' + ((kanan || []).includes(i) ? 'right' : 'left') + '">' + esc(c) + '</td>').join('') + '</tr>').join('');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:215mm 330mm;margin:12mm}body{font-family:Arial,sans-serif;color:#000}table{width:100%;border-collapse:collapse}</style></head><body>'
    + '<div style="font-weight:bold;font-size:12pt">' + esc(g.nama_kelompok || '') + '</div><div style="font-size:8pt">' + esc(g.alamat || '') + '</div><hr>'
    + '<div style="font-weight:bold;font-size:11pt;margin:6px 0">' + esc(judul) + '</div><div style="font-size:8pt;margin-bottom:6px">' + esc(sub) + '</div>'
    + '<table><thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table></body></html>';
}
function exportLaporanExcel() {
  const d = dataLaporan();
  unduhExcel('Laporan Hamparan D ' + (d.dari || '') + ' s.d. ' + (d.sampai || ''), [
    { nama: 'Rekap Petani', aoa: [['Kapling', 'Petani', 'Jumlah panen', 'Netto (kg)', 'Hasil kotor', 'Potongan', 'Gaji bersih']].concat(d.perPetani.map(o => [o.kapling, o.nama, o.n, o.netto, o.kotor, o.pot, o.bersih])) },
    { nama: 'Rekap Bulanan', aoa: [['Bulan', 'Netto (kg)', 'Hasil kotor', 'Potongan', 'Gaji bersih', 'Kas masuk', 'Kas keluar']].concat(d.perBulan.map(o => [labelBulanPenuh(o.bulan), o.netto, o.kotor, o.pot, o.bersih, o.masuk, o.keluar])) },
    { nama: 'Detail Panen', aoa: [['No. bukti', 'Tanggal', 'Kapling', 'Petani', 'Bruto', 'Sortasi', 'Netto', 'Harga', 'Hasil kotor', 'Transport', 'Kelompok', 'Penimbang', 'Koperasi', 'Tabungan', 'Masjid', 'Ongkos panen', 'Manual', 'Total potongan', 'Gaji bersih']].concat(d.P.map(r => [r.No_Bukti, r.Tanggal, r.Kapling, r.Nama, r.Bruto, r.Sortasi, r.Netto, r.Harga, r.Kotor, r.Transport, r.Kelompok, r.Penimbang, r.Koperasi, r.Tabungan, r.Masjid, r.Ongkos_Panen, r.Potongan_Manual, r.Total_Potongan, r.Gaji_Bersih])) },
    { nama: 'Kas', aoa: [['No. kas', 'Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Pihak', 'Jumlah']].concat(d.K.map(k => [k.No_Kas, k.Tanggal, k.Jenis, k.Kategori, k.Keterangan, k.Pihak, k.Jumlah])) }
  ]);
}
function exportLaporanPdf(btn) {
  const d = dataLaporan();
  const html = tabelDoc('Laporan Rekap Panen per Petani', 'Periode ' + (d.dari ? labelBulanPenuh(d.dari) : '-') + ' s.d. ' + (d.sampai ? labelBulanPenuh(d.sampai) : '-'),
    ['Kapling', 'Petani', 'Panen', 'Netto (kg)', 'Hasil kotor', 'Potongan', 'Gaji bersih'],
    d.perPetani.map(o => [o.kapling, o.nama, o.n, fmtKg(o.netto), fmtN(o.kotor), fmtN(o.pot), fmtN(o.bersih)]).concat([['', 'TOTAL', d.perPetani.reduce((a, o) => a + o.n, 0), fmtKg(sum(d.perPetani, 'netto')), fmtN(sum(d.perPetani, 'kotor')), fmtN(sum(d.perPetani, 'pot')), fmtN(sum(d.perPetani, 'bersih'))]]), [2, 3, 4, 5, 6]);
  unduhPdfHtml(html, 'Laporan Panen Hamparan D', btn);
}
function exportKasExcel() {
  const l = kasTersaring().slice().reverse();
  unduhExcel('Buku Kas Hamparan D', [{ nama: 'Buku Kas', aoa: [['No. kas', 'Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Pihak', 'Masuk', 'Keluar', 'Saldo', 'Dicatat oleh']].concat(l.map(k => [k.No_Kas, k.Tanggal, k.Jenis, k.Kategori, k.Keterangan, k.Pihak, k.Jenis === 'Pemasukan' ? k.Jumlah : '', k.Jenis === 'Pengeluaran' ? k.Jumlah : '', k._saldo, k.Dicatat_Oleh])) }]);
}
function exportKasPdf(btn) {
  const l = kasTersaring().slice().reverse();
  unduhPdfHtml(tabelDoc('Buku Kas Hamparan D', 'Saldo kas ' + rp(saldoKasGlobal()) + ' · dicetak ' + tglIndo(hari()), ['No. kas', 'Tanggal', 'Jenis', 'Uraian', 'Masuk', 'Keluar', 'Saldo'], l.map(k => [k.No_Kas, k.Tanggal, k.Jenis, k.Kategori + ' - ' + k.Keterangan, k.Jenis === 'Pemasukan' ? fmtN(k.Jumlah) : '', k.Jenis === 'Pengeluaran' ? fmtN(k.Jumlah) : '', fmtN(k._saldo)]), [4, 5, 6]), 'Buku Kas Hamparan D', btn);
}

/* ============================================================
   TABUNGAN PETANI
   ============================================================ */
function rekapTabungan() {
  const m = {};
  const ambil = (id, nama, kapling) => m[id] || (m[id] = { id, nama: nama || '', kapling: kapling || '', panen: 0, setor: 0, tarik: 0 });
  S.data.petani.forEach(p => ambil(p.ID_Petani, p.Nama, p.Kapling));
  S.data.penabung.forEach(p => { ambil(p.ID_Penabung, p.Nama, '').penabung = true; });
  S.data.panen.forEach(r => { if (num(r.Tabungan) > 0) ambil(r.ID_Petani, r.Nama, r.Kapling).panen += num(r.Tabungan); });
  S.data.tabungan.forEach(t => { const x = ambil(t.ID_Petani, t.Nama); if (t.Jenis === 'Tarik') x.tarik += num(t.Jumlah); else x.setor += num(t.Jumlah); });
  return Object.keys(m).map(k => { const x = m[k]; x.saldo = x.panen + x.setor - x.tarik; return x; })
      .filter(x => x.panen || x.setor || x.tarik || x.penabung).sort((a, b) => (a.penabung ? 1 : 0) - (b.penabung ? 1 : 0) || a.nama.localeCompare(b.nama));
}
function saldoTab(id) { const x = rekapTabungan().find(r => r.id === id); return x ? x.saldo : 0; }
function riwayatTabungan() {
  const l = [];
  S.data.panen.forEach(r => { if (num(r.Tabungan) > 0) l.push({ src: 'panen', ID: r.ID, Tanggal: r.Tanggal, ID_Petani: r.ID_Petani, Nama: r.Nama, Jenis: 'Setor', Jumlah: num(r.Tabungan), No: r.No_Bukti, Ket: 'Potongan tabungan slip ' + r.No_Bukti, _pending: r._pending }); });
  S.data.tabungan.forEach(t => l.push({ src: 'manual', ID: t.ID, Tanggal: t.Tanggal, ID_Petani: t.ID_Petani, Nama: t.Nama, Jenis: t.Jenis, Jumlah: num(t.Jumlah), No: t.No_Tab, Ket: t.Keterangan || (t.Jenis === 'Tarik' ? 'Penarikan' : 'Setoran'), _pending: t._pending }));
  l.sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal)) || String(a.No).localeCompare(String(b.No)));
  const run = {};
  l.forEach(x => { run[x.ID_Petani] = (run[x.ID_Petani] || 0) + (x.Jenis === 'Tarik' ? -x.Jumlah : x.Jumlah); x._saldo = run[x.ID_Petani]; });
  return l;
}
function renderTabungan() {
  const rk = rekapTabungan();
  const q = ($('#tabSearch').value || '').toLowerCase();
  const tampil = q ? rk.filter(x => (x.nama + ' ' + x.kapling).toLowerCase().includes(q)) : rk;
  const tot = { panen: sum(rk, 'panen'), setor: sum(rk, 'setor'), tarik: sum(rk, 'tarik'), saldo: sum(rk, 'saldo') };
  $('#tabKpi').innerHTML = kpi('bi-piggy-bank', 'Total saldo tabungan', rp(tot.saldo), rk.length + ' penabung', 'gold') + kpi('bi-arrow-down-left', 'Setoran (slip + manual)', rp(tot.panen + tot.setor), 'Potongan slip ' + rp(tot.panen)) + kpi('bi-arrow-up-right', 'Total penarikan', rp(tot.tarik), 'Sudah dibayarkan', 'red');
  const edit = can('tabungan.save');
  const baris = tampil.map(x => [
    '<b>' + esc(x.nama) + '</b>' + (x.kapling ? '<div class="sub">' + esc(x.kapling) + '</div>' : (x.penabung ? '<div class="sub">Penabung (non-petani)</div>' : '')),
    fmtN(x.panen), fmtN(x.setor), fmtN(x.tarik), '<b class="' + (x.saldo < 0 ? 'text-out' : '') + '">' + fmtN(x.saldo) + '</b>',
    '<button class="btn-x btn-out btn-sm" data-act="detailTab" data-id="' + esc(x.id) + '"><i class="bi bi-list-ul"></i> Riwayat</button>'
    + (x.penabung && can('penabung.save') ? ' <button class="btn-x btn-out btn-sm btn-ic" data-act="editPenabung" data-id="' + esc(x.id) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn-x btn-out btn-sm btn-ic" data-act="hapusPenabung" data-id="' + esc(x.id) + '" aria-label="Hapus"><i class="bi bi-trash text-out"></i></button>' : '')]);
  $('#tabRekap').innerHTML = tabel([{ h: 'Petani' }, { h: 'Dari slip (Rp)', c: 'r' }, { h: 'Setoran (Rp)', c: 'r' }, { h: 'Penarikan (Rp)', c: 'r' }, { h: 'Saldo (Rp)', c: 'r' }, { h: 'Aksi', c: 'r', k: 'acts nolabel' }], baris,
    { kosong: 'Belum ada tabungan. Tabungan terisi otomatis dari potongan di slip panen.', foot: ['<b>TOTAL</b>', '<b>' + fmtN(tot.panen) + '</b>', '<b>' + fmtN(tot.setor) + '</b>', '<b>' + fmtN(tot.tarik) + '</b>', '<b>' + fmtN(tot.saldo) + '</b>', ''] });
  const pil = $('#tabPetani').value || '';
  isiSelect($('#tabPetani'), [{ v: '', l: 'Semua petani' }].concat(rk.map(x => ({ v: x.id, l: x.nama }))), pil);
  const j = $('#tabJenis').value, pt = $('#tabPetani').value;
  let r = riwayatTabungan();
  if (pt) r = r.filter(x => x.ID_Petani === pt);
  if (j) r = r.filter(x => x.Jenis === j);
  r = r.reverse();
  $('#tabRiwayat').innerHTML = tabel([{ h: 'Tanggal / no.' }, { h: 'Petani' }, { h: 'Keterangan' }, { h: 'Jumlah (Rp)', c: 'r' }, { h: 'Saldo (Rp)', c: 'r' }, { h: 'Aksi', c: 'r', k: 'acts nolabel' }], r.map(x => ({
    cls: x._pending ? 'pending' : '',
    cells: ['<b>' + tglIndo(x.Tanggal) + '</b><div class="sub">' + esc(x.No) + '</div>', esc(x.Nama),
      esc(x.Ket) + '<div class="sub">' + (x.src === 'panen' ? 'Otomatis dari slip' : 'Manual') + '</div>',
      '<span class="fw-800 ' + (x.Jenis === 'Tarik' ? 'text-out' : 'text-in') + '">' + (x.Jenis === 'Tarik' ? '−' : '+') + fmtN(x.Jumlah) + '</span>',
      fmtN(x._saldo),
      (x.src === 'manual' && edit && !x._pending) ? '<button class="btn-x btn-out btn-sm btn-ic" data-act="editTab" data-id="' + esc(x.ID) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn-x btn-out btn-sm btn-ic" data-act="hapusTab" data-id="' + esc(x.ID) + '" aria-label="Hapus"><i class="bi bi-trash text-out"></i></button>' : '<span class="muted">–</span>']
  })), { kosong: 'Belum ada riwayat tabungan.' });
}
function hintTab() {
  const id = $('#ftbPetani').value, j = num($('#ftbJumlah').value), h = $('#ftbHint');
  if (!id) { h.textContent = ''; return; }
  const lama = S.editTabId ? S.data.tabungan.find(t => t.ID === S.editTabId) : null;
  let saldo = saldoTab(id); if (lama && lama.ID_Petani === id) saldo -= (lama.Jenis === 'Tarik' ? -1 : 1) * num(lama.Jumlah);
  if (S.tabJenis === 'Tarik' && j) { const sisa = saldo - j; h.innerHTML = 'Saldo ' + rp(saldo) + ' → sisa <b class="' + (sisa < 0 ? 'text-out' : '') + '">' + rp(sisa) + '</b>' + (sisa < 0 ? ' (saldo tidak cukup!)' : ''); }
  else h.textContent = 'Saldo saat ini ' + rp(saldo);
}
function bukaFormTab(jenis, id) {
  if (!can('tabungan.save')) return toast('Setoran dan penarikan manual hanya dapat dicatat oleh Ketua.', 'warning');
  const t = id ? S.data.tabungan.find(x => x.ID === id) : null;
  S.editTabId = id || null; S.tabJenis = t ? t.Jenis : jenis;
  $('#mdTabTitle').textContent = (t ? 'Ubah ' : 'Catat ') + (S.tabJenis === 'Tarik' ? 'Penarikan Tabungan' : 'Setoran Tabungan');
  isiSelect($('#ftbPetani'), [{ v: '', l: '— pilih petani —' }].concat(S.data.petani.filter(p => p.Status === 'Aktif' || (t && t.ID_Petani === p.ID_Petani)).map(p => ({ v: p.ID_Petani, l: p.Nama + (p.Kapling ? ' (' + p.Kapling + ')' : '') })).concat(S.data.penabung.map(p => ({ v: p.ID_Penabung, l: p.Nama + ' (penabung)' })))), t ? t.ID_Petani : '');
  $('#ftbTanggal').value = t ? t.Tanggal : hari(); $('#ftbJumlah').value = t ? t.Jumlah : ''; $('#ftbKet').value = t ? t.Keterangan : '';
  hintTab(); modal('mdTab').show();
}
async function simpanTab(ev) {
  ev.preventDefault();
  const jumlah = Math.round(num($('#ftbJumlah').value)), id = $('#ftbPetani').value;
  if (!id || !$('#ftbTanggal').value) return toast('Pilih petani/penabung dan tanggal.', 'warning');
  if (!(jumlah > 0)) return toast('Nominal harus lebih dari 0.', 'warning');
  const pet = S.data.petani.find(p => p.ID_Petani === id) || (S.data.penabung.find(p => p.ID_Penabung === id) ? { Nama: S.data.penabung.find(p => p.ID_Penabung === id).Nama } : null);
  const lama = S.editTabId ? S.data.tabungan.find(t => t.ID === S.editTabId) : null;
  const payload = { ID: S.editTabId || '', Tanggal: $('#ftbTanggal').value, ID_Petani: id, Jenis: S.tabJenis, Jumlah: jumlah, Keterangan: $('#ftbKet').value.trim() };
  const sem = Object.assign({}, lama || {}, { ID: lama ? lama.ID : tmpId(), No_Tab: lama ? lama.No_Tab : '(otomatis)', Tanggal: payload.Tanggal, ID_Petani: id, Nama: pet ? pet.Nama : '', Jenis: payload.Jenis, Jumlah: jumlah, Keterangan: payload.Keterangan, Dicatat_Oleh: lama ? lama.Dicatat_Oleh : S.user.nama, _pending: true });
  const salinan = lama ? Object.assign({}, lama) : null;
  if (lama) S.data.tabungan[S.data.tabungan.indexOf(lama)] = sem; else S.data.tabungan.push(sem);
  modal('mdTab').hide(); renderHalaman(S.page); toast('Menyimpan tabungan…', 'info');
  try {
    const rec = await api('tabungan.save', payload);
    S.data.tabungan[S.data.tabungan.findIndex(t => t.ID === sem.ID)] = rec; renderHalaman(S.page); toast('Tabungan tersimpan: ' + rec.No_Tab, 'success');
  } catch (e) {
    const i = S.data.tabungan.findIndex(t => t.ID === sem.ID);
    if (salinan) S.data.tabungan[i] = salinan; else S.data.tabungan.splice(i, 1);
    renderHalaman(S.page); toast('Gagal menyimpan: ' + e.message, 'danger');
  }
}
function hapusTab(id) {
  const t = S.data.tabungan.find(x => x.ID === id); if (!t || t._pending) return;
  konfirmasi('Hapus catatan tabungan?', '<b>' + esc(t.No_Tab) + '</b> (' + (t.Jenis === 'Tarik' ? 'penarikan ' : 'setoran ') + rp(t.Jumlah) + ' · ' + esc(t.Nama) + ') akan dihapus.', async () => {
    const i = S.data.tabungan.indexOf(t); S.data.tabungan.splice(i, 1); renderHalaman(S.page);
    try { await api('tabungan.delete', { ID: id }); toast('Catatan tabungan dihapus.', 'success'); }
    catch (e) { S.data.tabungan.splice(i, 0, t); renderHalaman(S.page); toast('Gagal menghapus: ' + e.message, 'danger'); }
  }, 'Hapus');
}
function exportTabunganExcel() {
  const rk = rekapTabungan(), rw = riwayatTabungan().slice().reverse();
  unduhExcel('Tabungan Petani Hamparan D', [
    { nama: 'Rekap', aoa: [['Petani', 'Kapling', 'Dari slip', 'Setoran', 'Penarikan', 'Saldo']].concat(rk.map(x => [x.nama, x.kapling, x.panen, x.setor, x.tarik, x.saldo])).concat([['TOTAL', '', sum(rk, 'panen'), sum(rk, 'setor'), sum(rk, 'tarik'), sum(rk, 'saldo')]]) },
    { nama: 'Riwayat', aoa: [['Tanggal', 'No.', 'Petani', 'Jenis', 'Jumlah', 'Keterangan', 'Saldo petani']].concat(rw.map(x => [x.Tanggal, x.No, x.Nama, x.Jenis === 'Tarik' ? 'Penarikan' : 'Setoran', x.Jumlah, x.Ket, x._saldo])) }]);
}
function exportTabunganPdf(btn) {
  const rk = rekapTabungan();
  unduhPdfHtml(tabelDoc('Rekap Tabungan Petani Hamparan D', 'Total saldo ' + rp(sum(rk, 'saldo')) + ' · dicetak ' + tglIndo(hari()), ['Petani', 'Dari slip', 'Setoran', 'Penarikan', 'Saldo'],
    rk.map(x => [x.nama + (x.kapling ? ' (' + x.kapling + ')' : ''), fmtN(x.panen), fmtN(x.setor), fmtN(x.tarik), fmtN(x.saldo)]).concat([['TOTAL', fmtN(sum(rk, 'panen')), fmtN(sum(rk, 'setor')), fmtN(sum(rk, 'tarik')), fmtN(sum(rk, 'saldo'))]]), [1, 2, 3, 4]), 'Rekap Tabungan Hamparan D', btn);
}


/* ============================================================
   PENABUNG (non-petani) & PINJAMAN
   ============================================================ */
function bukaFormPenabung(id) {
  if (!can('penabung.save')) return toast('Hanya Ketua yang dapat menambah penabung.', 'warning');
  const p = id ? S.data.penabung.find(x => x.ID_Penabung === id) : null;
  S.editPnbId = id || null;
  $('#mdPenabungTitle').textContent = p ? 'Ubah Penabung' : 'Tambah Penabung';
  $('#fpnNama').value = p ? p.Nama : ''; $('#fpnHP').value = p ? p.HP : ''; $('#fpnCatatan').value = p ? p.Catatan : '';
  modal('mdPenabung').show();
}
const editPenabung = id => bukaFormPenabung(id);
async function simpanPenabung(ev) {
  ev.preventDefault();
  const payload = { ID_Penabung: S.editPnbId || '', Nama: $('#fpnNama').value.trim(), HP: $('#fpnHP').value.trim(), Catatan: $('#fpnCatatan').value.trim() };
  if (!payload.Nama) return toast('Nama penabung wajib diisi.', 'warning');
  try {
    const rec = await api('penabung.save', payload);
    const i = S.data.penabung.findIndex(x => x.ID_Penabung === rec.ID_Penabung);
    if (i >= 0) S.data.penabung[i] = rec; else S.data.penabung.push(rec);
    S.data.tabungan.forEach(t => { if (t.ID_Petani === rec.ID_Penabung) t.Nama = rec.Nama; });
    modal('mdPenabung').hide(); renderHalaman(S.page); toast('Penabung tersimpan: ' + rec.Nama, 'success');
  } catch (e) { toast(e.message, 'danger'); }
}
function hapusPenabung(id) {
  const p = S.data.penabung.find(x => x.ID_Penabung === id); if (!p) return;
  konfirmasi('Hapus penabung?', '<b>' + esc(p.Nama) + '</b> akan dihapus dari daftar penabung.', async () => {
    try { await api('penabung.delete', { ID_Penabung: id }); S.data.penabung.splice(S.data.penabung.indexOf(p), 1); renderHalaman(S.page); toast('Penabung dihapus.', 'success'); }
    catch (e) { toast(e.message, 'danger'); }
  }, 'Hapus');
}

function rekapPinjaman() {
  const m = {};
  S.data.pinjaman.forEach(x => {
    const k = String(x.Peminjam).trim().toLowerCase();
    const r = m[k] || (m[k] = { nama: x.Peminjam, pinjam: 0, bayar: 0, terakhir: '' });
    if (x.Jenis === 'Bayar') r.bayar += num(x.Jumlah); else r.pinjam += num(x.Jumlah);
    if (String(x.Tanggal) > r.terakhir) r.terakhir = x.Tanggal;
  });
  return Object.keys(m).map(k => { const r = m[k]; r.sisa = r.pinjam - r.bayar; return r; }).sort((a, b) => b.sisa - a.sisa || a.nama.localeCompare(b.nama));
}
function sisaPin(nama) { const k = String(nama || '').trim().toLowerCase(); const r = rekapPinjaman().find(x => x.nama.trim().toLowerCase() === k); return r ? r.sisa : 0; }
function riwayatPinjaman() {
  const l = S.data.pinjaman.slice().sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal)) || String(a.No_Pin).localeCompare(String(b.No_Pin)));
  const run = {};
  l.forEach(x => { const k = String(x.Peminjam).trim().toLowerCase(); run[k] = (run[k] || 0) + (x.Jenis === 'Bayar' ? -1 : 1) * num(x.Jumlah); x._sisa = run[k]; });
  return l;
}
function renderPinjaman() {
  const rk = rekapPinjaman(), q = ($('#pinSearch').value || '').toLowerCase();
  const tampil = q ? rk.filter(x => x.nama.toLowerCase().includes(q)) : rk;
  const tot = { pinjam: sum(rk, 'pinjam'), bayar: sum(rk, 'bayar'), sisa: sum(rk, 'sisa') };
  $('#pinKpi').innerHTML = kpi('bi-cash-coin', 'Sisa pinjaman beredar', rp(tot.sisa), rk.filter(x => x.sisa > 0).length + ' peminjam belum lunas', 'gold') + kpi('bi-arrow-up-right', 'Total dipinjamkan', rp(tot.pinjam), rk.length + ' peminjam', 'red') + kpi('bi-arrow-down-left', 'Total dibayar', rp(tot.bayar), 'Pembayaran masuk');
  $('#pinRekap').innerHTML = tabel([{ h: 'Peminjam' }, { h: 'Dipinjam (Rp)', c: 'r' }, { h: 'Dibayar (Rp)', c: 'r' }, { h: 'Sisa (Rp)', c: 'r' }, { h: 'Status' }, { h: 'Aksi', c: 'r', k: 'acts nolabel' }],
    tampil.map(x => ['<b>' + esc(x.nama) + '</b><div class="sub">Terakhir ' + tglIndo(x.terakhir) + '</div>', fmtN(x.pinjam), fmtN(x.bayar), '<b>' + fmtN(x.sisa) + '</b>',
      x.sisa > 0 ? '<span class="badge-x b-out">Belum lunas</span>' : '<span class="badge-x b-in">Lunas</span>',
      '<button class="btn-x btn-out btn-sm" data-act="detailPin" data-id="' + esc(x.nama) + '"><i class="bi bi-list-ul"></i> Riwayat</button>']),
    { kosong: 'Belum ada pinjaman tercatat.', foot: ['<b>TOTAL</b>', '<b>' + fmtN(tot.pinjam) + '</b>', '<b>' + fmtN(tot.bayar) + '</b>', '<b>' + fmtN(tot.sisa) + '</b>', '', ''] });
  const pil = $('#pinPeminjam').value || '';
  isiSelect($('#pinPeminjam'), [{ v: '', l: 'Semua peminjam' }].concat(rk.map(x => ({ v: x.nama, l: x.nama }))), pil);
  const pm = $('#pinPeminjam').value, j = $('#pinJenis').value, edit = can('pinjaman.save');
  let r = riwayatPinjaman();
  if (pm) r = r.filter(x => x.Peminjam === pm);
  if (j) r = r.filter(x => x.Jenis === j);
  r = r.reverse();
  $('#pinRiwayat').innerHTML = tabel([{ h: 'Tanggal / no.' }, { h: 'Peminjam' }, { h: 'Keterangan' }, { h: 'Jumlah (Rp)', c: 'r' }, { h: 'Sisa (Rp)', c: 'r' }, { h: 'Aksi', c: 'r', k: 'acts nolabel' }], r.map(x => ({
    cls: x._pending ? 'pending' : '',
    cells: ['<b>' + tglIndo(x.Tanggal) + '</b><div class="sub">' + esc(x.No_Pin) + '</div>', esc(x.Peminjam), esc(x.Keterangan || (x.Jenis === 'Bayar' ? 'Pembayaran' : 'Pinjaman')) + '<div class="sub">oleh ' + esc(x.Dicatat_Oleh) + '</div>',
      '<span class="fw-800 ' + (x.Jenis === 'Bayar' ? 'text-in' : 'text-out') + '">' + (x.Jenis === 'Bayar' ? '−' : '+') + fmtN(x.Jumlah) + '</span><div class="sub">' + (x.Jenis === 'Bayar' ? 'Pembayaran' : 'Pinjaman') + '</div>',
      fmtN(x._sisa),
      edit && !x._pending ? '<button class="btn-x btn-out btn-sm btn-ic" data-act="editPin" data-id="' + esc(x.ID) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn-x btn-out btn-sm btn-ic" data-act="hapusPin" data-id="' + esc(x.ID) + '" aria-label="Hapus"><i class="bi bi-trash text-out"></i></button>' : '<span class="muted">–</span>']
  })), { kosong: 'Belum ada riwayat pinjaman.' });
}
function hintPin() {
  const nm = $('#fpiNama').value.trim(), j = num($('#fpiJumlah').value), h = $('#fpiHint');
  if (!nm) { h.textContent = ''; return; }
  const lama = S.editPinId ? S.data.pinjaman.find(x => x.ID === S.editPinId) : null;
  let sisa = sisaPin(nm); if (lama && String(lama.Peminjam).toLowerCase() === nm.toLowerCase()) sisa -= (lama.Jenis === 'Bayar' ? -1 : 1) * num(lama.Jumlah);
  if (S.pinJenis === 'Bayar') { const s2 = sisa - j; h.innerHTML = 'Sisa pinjaman ' + rp(sisa) + (j ? ' → setelah bayar <b class="' + (s2 < 0 ? 'text-out' : '') + '">' + rp(s2) + '</b>' + (s2 < 0 ? ' (melebihi sisa!)' : '') : ''); }
  else h.textContent = sisa ? 'Sisa pinjaman saat ini ' + rp(sisa) : 'Peminjam baru atau sudah lunas.';
}
function bukaFormPinjam(jenis, id) {
  if (!can('pinjaman.save')) return toast('Hanya Ketua yang dapat mencatat pinjaman.', 'warning');
  const x = id ? S.data.pinjaman.find(r => r.ID === id) : null;
  S.editPinId = id || null; S.pinJenis = x ? x.Jenis : jenis;
  $('#mdPinjamTitle').textContent = (x ? 'Ubah ' : 'Catat ') + (S.pinJenis === 'Bayar' ? 'Pembayaran Pinjaman' : 'Pinjaman Baru');
  $('#dlPeminjam').innerHTML = rekapPinjaman().concat(S.data.petani.map(p => ({ nama: p.Nama })), S.data.penabung.map(p => ({ nama: p.Nama }))).map(r => '<option value="' + esc(r.nama) + '">').join('');
  $('#fpiTanggal').value = x ? x.Tanggal : hari(); $('#fpiJumlah').value = x ? x.Jumlah : ''; $('#fpiNama').value = x ? x.Peminjam : ''; $('#fpiKet').value = x ? x.Keterangan : '';
  hintPin(); modal('mdPinjam').show();
}
async function simpanPinjam(ev) {
  ev.preventDefault();
  const jumlah = Math.round(num($('#fpiJumlah').value)), nama = $('#fpiNama').value.trim();
  if (!nama || !$('#fpiTanggal').value) return toast('Isi nama peminjam dan tanggal.', 'warning');
  if (!(jumlah > 0)) return toast('Nominal harus lebih dari 0.', 'warning');
  const lama = S.editPinId ? S.data.pinjaman.find(x => x.ID === S.editPinId) : null;
  const payload = { ID: S.editPinId || '', Tanggal: $('#fpiTanggal').value, Peminjam: nama, Jenis: S.pinJenis, Jumlah: jumlah, Keterangan: $('#fpiKet').value.trim() };
  const sem = Object.assign({}, lama || {}, { ID: lama ? lama.ID : tmpId(), No_Pin: lama ? lama.No_Pin : '(otomatis)', Tanggal: payload.Tanggal, Peminjam: nama, Jenis: payload.Jenis, Jumlah: jumlah, Keterangan: payload.Keterangan, Dicatat_Oleh: lama ? lama.Dicatat_Oleh : S.user.nama, _pending: true });
  const salinan = lama ? Object.assign({}, lama) : null;
  if (lama) S.data.pinjaman[S.data.pinjaman.indexOf(lama)] = sem; else S.data.pinjaman.push(sem);
  modal('mdPinjam').hide(); renderHalaman(S.page); toast('Menyimpan pinjaman…', 'info');
  try {
    const rec = await api('pinjaman.save', payload);
    S.data.pinjaman[S.data.pinjaman.findIndex(x => x.ID === sem.ID)] = rec; renderHalaman(S.page); toast('Tersimpan: ' + rec.No_Pin, 'success');
  } catch (e) {
    const i = S.data.pinjaman.findIndex(x => x.ID === sem.ID);
    if (salinan) S.data.pinjaman[i] = salinan; else S.data.pinjaman.splice(i, 1);
    renderHalaman(S.page); toast('Gagal menyimpan: ' + e.message, 'danger');
  }
}
function hapusPin(id) {
  const x = S.data.pinjaman.find(r => r.ID === id); if (!x || x._pending) return;
  konfirmasi('Hapus catatan pinjaman?', '<b>' + esc(x.No_Pin) + '</b> (' + (x.Jenis === 'Bayar' ? 'pembayaran ' : 'pinjaman ') + rp(x.Jumlah) + ' · ' + esc(x.Peminjam) + ') akan dihapus.', async () => {
    const i = S.data.pinjaman.indexOf(x); S.data.pinjaman.splice(i, 1); renderHalaman(S.page);
    try { await api('pinjaman.delete', { ID: id }); toast('Catatan dihapus.', 'success'); }
    catch (e) { S.data.pinjaman.splice(i, 0, x); renderHalaman(S.page); toast('Gagal menghapus: ' + e.message, 'danger'); }
  }, 'Hapus');
}
function exportPinjamanExcel() {
  const rk = rekapPinjaman(), rw = riwayatPinjaman().slice().reverse();
  unduhExcel('Pinjaman Hamparan D', [
    { nama: 'Rekap', aoa: [['Peminjam', 'Dipinjam', 'Dibayar', 'Sisa', 'Status']].concat(rk.map(x => [x.nama, x.pinjam, x.bayar, x.sisa, x.sisa > 0 ? 'Belum lunas' : 'Lunas'])).concat([['TOTAL', sum(rk, 'pinjam'), sum(rk, 'bayar'), sum(rk, 'sisa'), '']]) },
    { nama: 'Riwayat', aoa: [['Tanggal', 'No.', 'Peminjam', 'Jenis', 'Jumlah', 'Keterangan', 'Sisa']].concat(rw.map(x => [x.Tanggal, x.No_Pin, x.Peminjam, x.Jenis === 'Bayar' ? 'Pembayaran' : 'Pinjaman', x.Jumlah, x.Keterangan, x._sisa])) }]);
}
function exportPinjamanPdf(btn) {
  const rk = rekapPinjaman();
  unduhPdfHtml(tabelDoc('Rekap Pinjaman Hamparan D', 'Sisa pinjaman ' + rp(sum(rk, 'sisa')) + ' · dicetak ' + tglIndo(hari()), ['Peminjam', 'Dipinjam', 'Dibayar', 'Sisa', 'Status'],
    rk.map(x => [x.nama, fmtN(x.pinjam), fmtN(x.bayar), fmtN(x.sisa), x.sisa > 0 ? 'Belum lunas' : 'Lunas']).concat([['TOTAL', fmtN(sum(rk, 'pinjam')), fmtN(sum(rk, 'bayar')), fmtN(sum(rk, 'sisa')), '']]), [1, 2, 3]), 'Rekap Pinjaman Hamparan D', btn);
}

/* ============================================================
   TARIF, HARGA TBS, PENGATURAN
   ============================================================ */
function renderTarif() {
  const g = S.data.pengaturan, h = hargaTerbaru(), edit = can('pengaturan.save'), editH = can('harga.save');
  $('#hargaNow').textContent = h ? rp(h.Harga) + ' / kg' : 'Belum diatur';
  $('#hargaNowSub').textContent = h ? 'Berlaku sejak ' + tglIndo(h.Tanggal) + (h.Catatan ? ' · ' + h.Catatan : '') : '';
  if (!$('#fhTanggal').value) $('#fhTanggal').value = hari();
  [['ftTransport', 'tarif_transport'], ['ftKelompok', 'tarif_kelompok'], ['ftPenimbang', 'tarif_penimbang'], ['ftKoperasi', 'tarif_koperasi'], ['ftNama', 'nama_kelompok'], ['ftJudul', 'judul_slip'], ['ftAlamat', 'alamat'], ['ftTempat', 'tempat_cetak'], ['ftKetua', 'ketua_nama'], ['ftBendahara', 'bendahara_nama'], ['ftSekretaris', 'sekretaris_nama']]
    .forEach(p => { $('#' + p[0]).value = g[p[1]] === undefined ? '' : g[p[1]]; });
  $$('#formTarif .fx').forEach(e => { e.disabled = !edit; }); $('#btnLogoHapus').disabled = !edit; $$('.btn-ttd-hapus').forEach(b => { b.disabled = !edit; }); tampilPreviewLogo(); tampilPreviewTtd();
  $$('#formHarga .fx').forEach(e => { e.disabled = !editH; });
  const rows = S.data.harga.slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal))).map(x => [
    '<b>' + tglIndo(x.Tanggal) + '</b>', '<b>' + rp(x.Harga) + '</b>', esc(x.Catatan || '–'), esc(x.Dicatat_Oleh),
    editH ? '<button class="btn-x btn-out btn-sm btn-ic" data-act="isiHarga" data-id="' + esc(x.ID) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn-x btn-out btn-sm btn-ic" data-act="hapusHarga" data-id="' + esc(x.ID) + '" aria-label="Hapus"><i class="bi bi-trash text-out"></i></button>' : '']);
  $('#hargaTable').innerHTML = tabel([{ h: 'Berlaku mulai' }, { h: 'Harga/kg', c: 'r' }, { h: 'Catatan' }, { h: 'Oleh' }, { h: 'Aksi', c: 'r', k: 'acts nolabel' }], rows, { kosong: 'Belum ada harga.' });
}
async function simpanHarga(ev) {
  ev.preventDefault();
  const tgl = $('#fhTanggal').value, harga = Math.round(num($('#fhHarga').value));
  if (!tgl || !(harga > 0)) return toast('Isi tanggal dan harga TBS.', 'warning');
  const ada = S.data.harga.find(h => String(h.Tanggal) === tgl), salinan = ada ? Object.assign({}, ada) : null;
  const sem = { ID: ada ? ada.ID : tmpId(), Tanggal: tgl, Harga: harga, Catatan: $('#fhCatatan').value.trim(), Dicatat_Oleh: S.user.nama };
  if (ada) S.data.harga[S.data.harga.indexOf(ada)] = sem; else S.data.harga.push(sem);
  terapkanChipHarga(); renderTarif();
  try {
    const rec = await api('harga.save', { Tanggal: tgl, Harga: harga, Catatan: sem.Catatan });
    S.data.harga[S.data.harga.findIndex(h => h.ID === sem.ID)] = rec; terapkanChipHarga(); renderTarif();
    $('#fhHarga').value = ''; $('#fhCatatan').value = ''; toast('Harga TBS ' + rp(harga) + '/kg berlaku mulai ' + tglIndo(tgl) + '.', 'success');
  } catch (e) {
    const i = S.data.harga.findIndex(h => h.ID === sem.ID); if (salinan) S.data.harga[i] = salinan; else S.data.harga.splice(i, 1);
    terapkanChipHarga(); renderTarif(); toast('Gagal menyimpan harga: ' + e.message, 'danger');
  }
}
function terapkanChipHarga() { const h = hargaTerbaru(); $('#hargaChip').textContent = h ? rp(h.Harga) + '/kg' : '–'; }
function hapusHarga(id) {
  const h = S.data.harga.find(x => x.ID === id); if (!h) return;
  konfirmasi('Hapus harga TBS?', 'Harga <b>' + rp(h.Harga) + '</b> tanggal <b>' + tglIndo(h.Tanggal) + '</b> akan dihapus. Panen yang sudah tercatat tidak berubah.', async () => {
    const i = S.data.harga.indexOf(h); S.data.harga.splice(i, 1); terapkanChipHarga(); renderTarif();
    try { await api('harga.delete', { ID: id }); toast('Harga dihapus.', 'success'); }
    catch (e) { S.data.harga.splice(i, 0, h); terapkanChipHarga(); renderTarif(); toast(e.message, 'danger'); }
  }, 'Hapus');
}
async function simpanTarif(ev) {
  ev.preventDefault();
  const baru = { tarif_transport: num($('#ftTransport').value), tarif_kelompok: num($('#ftKelompok').value), tarif_penimbang: num($('#ftPenimbang').value), tarif_koperasi: num($('#ftKoperasi').value), nama_kelompok: $('#ftNama').value.trim(), judul_slip: $('#ftJudul').value.trim(), alamat: $('#ftAlamat').value.trim(), tempat_cetak: $('#ftTempat').value.trim(), ketua_nama: $('#ftKetua').value.trim(), bendahara_nama: $('#ftBendahara').value.trim(), sekretaris_nama: $('#ftSekretaris').value.trim() };
  if (S.logoBaru !== null) baru.logo = S.logoBaru;
  Object.keys(S.ttdBaru).forEach(k => { baru['ttd_' + k] = S.ttdBaru[k]; });
  const lama = Object.assign({}, S.data.pengaturan); Object.assign(S.data.pengaturan, baru);
  try { S.data.pengaturan = await api('pengaturan.save', baru); S.logoBaru = null; S.ttdBaru = {}; terapkanLogo(); toast('Tarif dan identitas slip tersimpan.', 'success'); }
  catch (e) { S.data.pengaturan = lama; toast('Gagal menyimpan: ' + e.message, 'danger'); }
  renderTarif();
}

/* ============================================================
   PENGGUNA, PIN & LOG (Ketua)
   ============================================================ */
function renderPengguna() {
  $('#usTable').innerHTML = tabel([{ h: 'Nama' }, { h: 'Peran' }, { h: 'Status' }, { h: 'Aksi', c: 'r', k: 'acts nolabel' }],
    S.data.users.map(u => ['<b>' + esc(u.Nama) + '</b>' + (u.ID === S.user.id ? ' <span class="badge-x b-ok">Anda</span>' : ''), peranBadge(u.Peran), '<span class="badge-x ' + (u.Aktif === 'Ya' ? 'b-ok' : 'b-off') + '">' + (u.Aktif === 'Ya' ? 'Aktif' : 'Nonaktif') + '</span>',
      '<button class="btn-x btn-out btn-sm" data-act="editUser" data-id="' + esc(u.ID) + '"><i class="bi bi-pencil"></i> Ubah</button> <button class="btn-x btn-out btn-sm" data-act="resetPin" data-id="' + esc(u.ID) + '"><i class="bi bi-key"></i> Reset PIN</button>']),
    { kosong: 'Belum ada pengguna.' });
  muatLog();
}
async function muatLog() {
  $('#logTable').innerHTML = '<div class="empty"><div class="spin mx-auto"></div></div>';
  try {
    S.data.log = await api('log.get');
    $('#logTable').innerHTML = tabel([{ h: 'Waktu' }, { h: 'Pengguna' }, { h: 'Aksi' }, { h: 'Detail' }],
      S.data.log.map(l => [esc(String(l.Waktu).replace('T', ' ')), '<b>' + esc(l.Pengguna) + '</b> ' + peranBadge(l.Peran === 'Sistem' ? '' : l.Peran).replace('b-off', 'b-off'), '<span class="badge-x b-off">' + esc(l.Aksi) + '</span>', esc(l.Detail)]), { kosong: 'Belum ada aktivitas.' });
  } catch (e) { $('#logTable').innerHTML = '<div class="text-out">' + esc(e.message) + '</div>'; }
}
function bukaFormUser(id) {
  const u = id ? S.data.users.find(x => x.ID === id) : null;
  $('#mdUserTitle').textContent = u ? 'Ubah Pengurus' : 'Tambah Pengurus';
  $('#fuID').value = u ? u.ID : ''; $('#fuNama').value = u ? u.Nama : ''; $('#fuPeran').value = u ? u.Peran : 'Sekretaris'; $('#fuAktif').value = u ? u.Aktif : 'Ya'; $('#fuPin').value = '';
  $('#fuPinWrap').hidden = !!u; $('#fuPin').required = !u; modal('mdUser').show();
}
async function simpanUser(ev) {
  ev.preventDefault();
  const btn = ev.submitter; setLoading(btn, true);
  try {
    S.data.users = await api('user.save', { ID: $('#fuID').value, Nama: $('#fuNama').value.trim(), Peran: $('#fuPeran').value, Aktif: $('#fuAktif').value, PIN: $('#fuPin').value });
    modal('mdUser').hide(); renderPengguna(); toast('Pengurus tersimpan.', 'success');
  } catch (e) { toast(e.message, 'danger'); }
  setLoading(btn, false);
}
function bukaFormPin(idReset) {
  const u = idReset ? S.data.users.find(x => x.ID === idReset) : null;
  $('#mdPinTitle').textContent = u ? 'Reset PIN — ' + u.Nama : 'Ubah PIN Saya';
  $('#fpnID').value = idReset || ''; $('#fpnLamaWrap').hidden = !!u; $('#fpnLama').required = !u;
  ['fpnLama', 'fpnBaru', 'fpnUlang'].forEach(i => { $('#' + i).value = ''; }); modal('mdPin').show();
}
async function simpanPin(ev) {
  ev.preventDefault();
  if ($('#fpnBaru').value !== $('#fpnUlang').value) return toast('Pengulangan PIN tidak sama.', 'warning');
  const btn = ev.submitter; setLoading(btn, true);
  try {
    const id = $('#fpnID').value;
    if (id) S.data.users = await api('user.resetPin', { ID: id, PIN: $('#fpnBaru').value });
    else await api('pin.ubah', { lama: $('#fpnLama').value, baru: $('#fpnBaru').value });
    modal('mdPin').hide(); toast(id ? 'PIN pengurus direset.' : 'PIN Anda diganti.', 'success');
  } catch (e) { toast(e.message, 'danger'); }
  setLoading(btn, false);
}

/* ============================================================
   EVENT
   ============================================================ */
const AKSI = {
  slip: id => { const r = S.data.panen.find(x => x.ID === id); if (r) bukaPreview([r]); },
  editPanen, hapusPanen, editKas: id => bukaFormKas(null, id), hapusKas, editTab: id => bukaFormTab(null, id), hapusTab, editPenabung, hapusPenabung, editPin: id => bukaFormPinjam(null, id), hapusPin, detailPin: nm => { $('#pinPeminjam').value = nm; renderPinjaman(); $('#pinRiwayat').scrollIntoView({ behavior: 'smooth' }); }, detailTab: id => { $('#tabPetani').value = id; renderTabungan(); $('#tabRiwayat').scrollIntoView({ behavior: 'smooth' }); }, bukti: lihatBukti,
  editPetani: bukaFormPetani, togglePetani, hapusPetani, editUser: bukaFormUser, resetPin: bukaFormPin, hapusHarga,
  isiHarga: id => { const h = S.data.harga.find(x => x.ID === id); if (h) { $('#fhTanggal').value = h.Tanggal; $('#fhHarga').value = h.Harga; $('#fhCatatan').value = h.Catatan || ''; $('#fhHarga').focus(); } },
  hapusManual: i => { FP.manual.splice(+i, 1); renderManual(); hitungForm(); }
};

function pasangEvent() {
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (a) { const f = AKSI[a.dataset.act]; if (f) f(a.dataset.id); return; }
    const pg = e.target.closest('[data-page]'); if (pg) { navigateTo(pg.dataset.page); return; }
    const go = e.target.closest('[data-go]'); if (go) { navigateTo(go.dataset.go); return; }
    if (e.target.closest('#bnMenu')) bukaSidebar();
  });
  $('#btnMenu').onclick = bukaSidebar; $('#sbBackdrop').onclick = tutupSidebar;
  $('#btnTheme').onclick = () => terapkanTema(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  $('#btnSync').onclick = () => sinkron(false);
  $('#btnLogout').onclick = () => { gas('logout', { token: S.token }); sesiBerakhir('Anda telah keluar.'); };
  $('#btnPin').onclick = () => bukaFormPin('');

  $('#loginForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const btn = $('#btnLogin'), uid = $('#loginUser').value, pin = $('#loginPin').value;
    if (!uid) return;
    setLoading(btn, true, 'Memeriksa…');
    gas('login', { userId: uid, pin: pin }).then(res => {
      setLoading(btn, false);
      if (res && res.success) { S.token = res.data.token; try { sessionStorage.setItem('hd_token', S.token); } catch (e) { /* abaikan */ } muatBootstrap(); }
      else { const m = $('#loginMsg'); m.hidden = false; m.textContent = (res && res.message) || 'Login gagal.'; $('#loginPin').value = ''; }
    });
  });

  // Dashboard
  $('#dashPeriode').onchange = renderDashboard;
  // Panen
  ['fpBruto', 'fpSortasi', 'fpNetto'].forEach(i => $('#' + i).addEventListener('input', () => { hitungForm(); simpanDraft(); }));
  ['fpTabungan', 'fpMasjid', 'fpOngkos'].forEach(i => $('#' + i).addEventListener('input', () => { FP.touched[i] = true; hitungForm(); }));
  $('#fpTanggal').addEventListener('change', () => { hitungForm(); simpanDraft(); });
  $('#fpPetani').addEventListener('change', () => { FP.touched = {}; ['fpTabungan', 'fpMasjid', 'fpOngkos'].forEach(i => { $('#' + i).value = ''; }); hitungForm(); simpanDraft(); });
  $('#fpCatatan').addEventListener('input', debounce(simpanDraft, 400));
  $$('#fpOngMode button').forEach(b => b.onclick = () => { FP.touched.fpOngkos = true; setOngMode(b.dataset.m); hitungForm(); });
  $('#btnAddManual').onclick = () => { if (FP.manual.length >= 10) return toast('Maksimal 10 potongan manual.', 'warning'); FP.manual.push({ nama: '', jumlah: '' }); renderManual(); const l = $$('#fpManual input[data-mf="nama"]'); if (l.length) l[l.length - 1].focus(); };
  $('#fpManual').addEventListener('input', e => { const t = e.target; if (t.dataset.mi === undefined) return; FP.manual[+t.dataset.mi][t.dataset.mf] = t.value; hitungForm(); });
  $('#btnImpor').onclick = () => { IMPOR.rows = []; $('#imporFile').value = ''; $('#imporSum').innerHTML = ''; $('#imporPreview').innerHTML = ''; $('#btnImporSimpan').disabled = true; modal('mdImpor').show(); };
  $('#btnTemplate').onclick = unduhTemplatPanen; $('#imporFile').addEventListener('change', e => pilihBerkasImpor(e.target.files[0])); $('#btnImporSimpan').onclick = simpanImpor;
  $('#btnSinkronHarga').onclick = sinkronHargaPanen;
  $('#btnSavePanen').onclick = () => simpanPanen(false);
  $('#btnSavePrint').onclick = () => simpanPanen(true);
  $('#btnResetPanen').onclick = () => { resetFormPanen(); try { localStorage.removeItem('hd_draft_panen'); } catch (e) { /* abaikan */ } };
  $('#btnBatalEdit').onclick = () => resetFormPanen();
  $('#formPanen').addEventListener('submit', ev => ev.preventDefault());
  $('#rpSearch').addEventListener('input', debounce(renderRiwayatPanen, 200)); $('#rpPeriode').onchange = renderRiwayatPanen;
  // Slip
  $('#slPeriode').onchange = renderSlip; $('#slPetani').onchange = renderSlip; $('#slMode').onchange = renderSlip; $('#slDari').onchange = renderSlip; $('#slSampai').onchange = renderSlip; $('#btnSlReset').onclick = () => { $('#slDari').value = ''; $('#slSampai').value = ''; renderSlip(); };
  $('#btnPrintSlip').onclick = () => cetakSlip(S.slipAktif);
  $('#btnPdfSlip').onclick = e => { if (!S.slipAktif.length) return toast('Tidak ada slip.', 'warning'); unduhPdfHtml(slipDocument(S.slipAktif), namaBerkasSlip(S.slipAktif), e.currentTarget); };
  $('#btnPreviewPrint').onclick = () => cetakSlip(S.slipAktif);
  $('#btnPreviewPdf').onclick = e => unduhPdfHtml(slipDocument(S.slipAktif), namaBerkasSlip(S.slipAktif), e.currentTarget);
  // Kas
  $('#btnKasMasuk').onclick = () => bukaFormKas('Pemasukan'); $('#btnKasKeluar').onclick = () => bukaFormKas('Pengeluaran');
  $$('#fkJenis button').forEach(b => b.onclick = () => pilihJenisKas(b.dataset.j));
  $('#fkJumlah').addEventListener('input', hintSaldo); $('#formKas').addEventListener('submit', simpanKas);
  ['kasPeriode', 'kasJenis', 'kasKategori'].forEach(i => $('#' + i).onchange = renderKas); $('#kasSearch').addEventListener('input', debounce(renderKas, 200));
  $('#btnKasExcel').onclick = exportKasExcel; $('#btnKasPdf').onclick = e => exportKasPdf(e.currentTarget);
  // Tabungan
  $('#btnTabSetor').onclick = () => bukaFormTab('Setor'); $('#btnTabTarik').onclick = () => bukaFormTab('Tarik');
  $('#formTab').addEventListener('submit', simpanTab); $('#ftbPetani').onchange = hintTab; $('#ftbJumlah').addEventListener('input', hintTab);
  $('#tabSearch').addEventListener('input', debounce(renderTabungan, 200)); $('#tabPetani').onchange = renderTabungan; $('#tabJenis').onchange = renderTabungan;
  $('#btnTabExcel').onclick = exportTabunganExcel; $('#btnTabPdf').onclick = e => exportTabunganPdf(e.currentTarget);
  $('#btnTabPenabung').onclick = () => bukaFormPenabung(); $('#btnAddNonPetani').onclick = () => bukaFormPenabung(); $('#formPenabung').addEventListener('submit', simpanPenabung);
  // Pinjaman
  $('#btnPinBaru').onclick = () => bukaFormPinjam('Pinjam'); $('#btnPinBayar').onclick = () => bukaFormPinjam('Bayar');
  $('#formPinjam').addEventListener('submit', simpanPinjam); $('#fpiNama').addEventListener('input', hintPin); $('#fpiJumlah').addEventListener('input', hintPin);
  $('#pinSearch').addEventListener('input', debounce(renderPinjaman, 200)); $('#pinPeminjam').onchange = renderPinjaman; $('#pinJenis').onchange = renderPinjaman;
  $('#btnPinExcel').onclick = exportPinjamanExcel; $('#btnPinPdf').onclick = e => exportPinjamanPdf(e.currentTarget);
  // Petani
  $('#fptOngJ').onchange = hintOngkos;
  $('#btnAddPetani').onclick = () => bukaFormPetani(''); $('#formPetani').addEventListener('submit', simpanPetani);
  $('#ptSearch').addEventListener('input', debounce(renderPetani, 200)); $('#ptStatus').onchange = renderPetani;
  // Laporan
  $('#lpDari').onchange = renderLaporan; $('#lpSampai').onchange = renderLaporan;
  $('#btnLpExcel').onclick = exportLaporanExcel; $('#btnLpPdf').onclick = e => exportLaporanPdf(e.currentTarget);
  // Tarif
  $('#ftLogoFile').addEventListener('change', async e => { try { const d = await perkecilLogo(e.target.files[0]); if (d) { S.logoBaru = d; tampilPreviewLogo(); toast('Logo siap. Klik Simpan Tarif & Identitas.', 'info'); } } catch (err) { toast(err.message, 'danger'); } e.target.value = ''; });
  $('#btnLogoHapus').onclick = () => { S.logoBaru = ''; tampilPreviewLogo(); };
  $$('.ttd-file').forEach(inp => inp.addEventListener('change', async e => { const k = inp.dataset.ttd; try { const d = await olahTtd(e.target.files[0]); if (d) { S.ttdBaru[k] = d; tampilPreviewTtd(); toast('Tanda tangan siap. Klik Simpan Tarif & Identitas.', 'info'); } } catch (err) { toast(err.message, 'danger'); } e.target.value = ''; }));
  $$('.btn-ttd-hapus').forEach(b => { b.onclick = () => { S.ttdBaru[b.dataset.ttd] = ''; tampilPreviewTtd(); }; });
  $('#btnHapusContoh').onclick = hapusContoh;
  $('#formHarga').addEventListener('submit', simpanHarga); $('#formTarif').addEventListener('submit', simpanTarif);
  // Pengguna
  $('#btnAddUser').onclick = () => bukaFormUser(''); $('#formUser').addEventListener('submit', simpanUser);
  $('#formPin').addEventListener('submit', simpanPin); $('#btnLogRefresh').onclick = muatLog;

  window.addEventListener('resize', debounce(() => { if (S.page === 'slip') fitPreview($('#slPreview')); }, 150));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user && Date.now() - S.terakhirSinkron > 120000) sinkron(true); });
  const mdp = document.getElementById('mdPreview'); if (mdp) mdp.addEventListener('shown.bs.modal', () => fitPreview($('#mdPreviewBody')));
}

/* Pulihkan draf formulir panen setelah elemen siap */
document.addEventListener('DOMContentLoaded', () => { setTimeout(() => { if (typeof pulihkanDraft === 'function') { /* dipanggil saat halaman panen pertama kali dibuka */ } }, 0); });