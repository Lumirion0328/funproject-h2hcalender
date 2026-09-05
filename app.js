// Hearts2Hearts Calendar — kalender jadwal publik + panel admin (Firebase Auth + Firestore)

// KONFIGURASI FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyA100hKR2DFgZOZTwnRCP0_Xvei7TzNdNg",
  authDomain: "hearts2hearts-calender.firebaseapp.com",
  projectId: "hearts2hearts-calender",
  storageBucket: "hearts2hearts-calender.firebasestorage.app",
  messagingSenderId: "773204054628",
  appId: "1:773204054628:web:68ce816c3fd971dd810571"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// KONSTANTA & STATE APLIKASI

/** Kategori acara: kunci = disimpan di Firestore, label = teks tampilan, color = warna tema (CSS var). */
const CATS = {
  broadcast: { label: 'Siaran', color: 'var(--red)' },
  event:     { label: 'Event', color: 'var(--accent-a)' },
  release:   { label: 'Rilis', color: 'var(--gold)' },
  birthday:  { label: 'Birthday', color: 'var(--green)' },
};

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const DAY_NAMES = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

/** Seluruh acara yang tersimpan di Firestore, disinkronkan otomatis lewat listener onSnapshot di bagian bawah file. */
let EVENTS = []; 

// FUNGSI UTILITAS

/** Format objek Date menjadi string "YYYY-MM-DD" (format tanggal internal aplikasi). */
function fmtDate(d){
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Ambil "MM-DD" dari "YYYY-MM-DD" (untuk cocokkan Birthday, abaikan tahun). */
function monthDayOf(dateStr){ return dateStr.slice(5); }

/** Tanggal kemunculan Birthday berikutnya (tahun ini/depan) dari tanggal acuan. */
function birthdayNextOccurrence(dateStr, fromDate){
  const [, m, d] = dateStr.split('-').map(Number);
  const from = fromDate || new Date();
  const fromStr = fmtDate(from);
  let candidate = new Date(from.getFullYear(), m - 1, d);
  if(fmtDate(candidate) < fromStr){
    candidate = new Date(from.getFullYear() + 1, m - 1, d);
  }
  return fmtDate(candidate);
}

/** Escape karakter HTML berbahaya, cegah XSS dari input admin. */
function escapeHTML(str){
  if(str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let current = new Date();
let activeCats = new Set(Object.keys(CATS));
let searchTerm = '';
let view = (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) ? 'list' : 'month';

let isAdmin = false;
let editingIndex = null; 
let editingId = null;

const adminBtn = document.getElementById('adminBtn');
const addBtn = document.getElementById('addBtn');
const cleanupBtn = document.getElementById('cleanupBtn');
const loginOverlay = document.getElementById('loginOverlay');
const lEmail = document.getElementById('lEmail');
const lPass = document.getElementById('lPass');
const loginError = document.getElementById('loginError');

// DARK MODE
const themeBtn = document.getElementById('themeBtn');

/** Sinkronkan ikon tombol (🌙/☀️) dengan tema yang sedang aktif di <html data-theme="...">. */
function applyThemeIcon(){
  const theme = document.documentElement.getAttribute('data-theme');
  themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
applyThemeIcon(); // sinkronkan ikon dengan tema yang sudah di-set inline script di <head>

themeBtn.onclick = () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('h2h-theme', next);
  applyThemeIcon();
};

// AUTENTIKASI ADMIN

/** Terpicu tiap kali status login Firebase Auth berubah (login/logout/reload halaman). */
auth.onAuthStateChanged((user) => {
  isAdmin = !!user;
  adminBtn.classList.toggle('on', isAdmin);
  adminBtn.innerHTML = isAdmin ? '<span class="pip"></span> Logout' : '<span class="pip"></span> Admin';
  addBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  cleanupBtn.style.display = isAdmin ? 'flex' : 'none';
  renderAll();
});

// Tombol Admin ditekan
adminBtn.onclick = () => {
  if(isAdmin){
    auth.signOut();
  } else {
    lEmail.value = '';
    lPass.value = '';
    loginError.style.display = 'none';
    loginOverlay.classList.add('show');
  }
};

document.getElementById('loginCancel').onclick = () => {
  loginOverlay.classList.remove('show');
};

// Enter di field Email pindah fokus ke Password, bukan langsung submit
lEmail.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){
    e.preventDefault();
    lPass.focus();
  }
});

document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = lEmail.value.trim();
  const pass = lPass.value;
  if(!email || !pass) return;

  auth.signInWithEmailAndPassword(email, pass)
    .then(() => {
      loginOverlay.classList.remove('show');
      lEmail.value = '';
      lPass.value = '';
    })
    .catch((error) => {
      loginError.textContent = 'Kredensial tidak valid.';
      loginError.style.display = 'block';
    });
});

// MODAL TAMBAH/EDIT JADWAL
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const fTitle = document.getElementById('fTitle');
const fDate = document.getElementById('fDate');
const fTime = document.getElementById('fTime');
const fCat = document.getElementById('fCat');
const fMeta = document.getElementById('fMeta');
const fSource = document.getElementById('fSource');
const fTempat = document.getElementById('fTempat');
const formError = document.getElementById('formError');

/** Isi ulang dropdown kategori di form, berdasarkan objek CATS. */
function populateCatSelect(){
  fCat.innerHTML = Object.entries(CATS).map(([key,c]) => `<option value="${key}">${c.label}</option>`).join('');
}

/** Buka modal Tambah/Edit Jadwal (index null = mode Tambah baru). */
function openModal(index = null){
  if(!isAdmin) return;
  editingIndex = index;
  formError.style.display = 'none';
  populateCatSelect();
  if(index === null){
    modalTitle.textContent = 'Tambah Jadwal';
    fTitle.value = '';
    fDate.value = fmtDate(new Date());
    fTime.value = '';
    fCat.value = Object.keys(CATS)[0];
    fTempat.value = '';
    fMeta.value = '';
    fSource.value = '';
    editingId = null;
  } else {
    const e = EVENTS[index];
    modalTitle.textContent = 'Edit Jadwal';
    fTitle.value = e.title;
    fDate.value = e.date;
    fTime.value = e.time === '-' ? '' : e.time;
    fCat.value = e.cat;
    fTempat.value = e.tempat || '';
    fMeta.value = e.meta;
    fSource.value = e.source || '';
    editingId = e.id;
  }
  modalOverlay.classList.add('show');
}

// MODAL DETAIL ACARA (+ embed Twitter/Instagram)

/** Deteksi apakah URL adalah link post Twitter/X atau Instagram yang bisa di-embed. */
function detectEmbed(url){
  if(!url) return null;
  if(/(?:twitter\.com|x\.com)\/[^\/]+\/status\/\d+/i.test(url)) return 'twitter';
  if(/instagram\.com\/(p|reel|tv)\//i.test(url)) return 'instagram';
  return null;
}

/** Muat script eksternal sekali saja (tidak dobel-load kalau elemen dengan id yang sama sudah ada). */
function loadScriptOnce(src, id){
  return new Promise((resolve) => {
    if(document.getElementById(id)){ resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.id = id; s.async = true;
    s.onload = () => resolve();
    document.body.appendChild(s);
  });
}

/** Render embed Twitter/Instagram di pop-up detail kalau URL cocok, atau sembunyikan wadahnya. */
function renderEmbed(url){
  const container = document.getElementById('detailEmbed');
  const type = detectEmbed(url);
  if(!type){
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  if(type === 'twitter'){
    container.innerHTML = `<blockquote class="twitter-tweet"><a href="${url}"></a></blockquote>`;
    loadScriptOnce('https://platform.twitter.com/widgets.js', 'twitter-wjs').then(() => {
      if(window.twttr && window.twttr.widgets) window.twttr.widgets.load(container);
    });
  } else if(type === 'instagram'){
    container.innerHTML = `<blockquote class="instagram-media" data-instgrm-captioned><a href="${url}"></a></blockquote>`;
    loadScriptOnce('https://www.instagram.com/embed.js', 'instagram-wjs').then(() => {
      if(window.instgrm) window.instgrm.Embeds.process();
    });
  }
}

/** Tutup modal Tambah/Edit Jadwal (bagian dari #6, ditaruh di sini karena dipakai bareng renderEmbed). */
function closeModal(){
  modalOverlay.classList.remove('show');
  editingIndex = null;
  editingId = null;
}

const detailOverlay = document.getElementById('detailOverlay');

/** Buka pop-up Detail Acara (tanggal, jam, tempat, keterangan, sumber, embed sosmed). */
function openDetail(index){
  const e = EVENTS[index];
  if(!e) return;
  const c = CATS[e.cat];
  const displayDate = e.cat === 'birthday' ? birthdayNextOccurrence(e.date, new Date()) : e.date;
  const [y, m, d] = displayDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  document.getElementById('detailTitle').textContent = e.title;
  document.getElementById('detailDate').textContent =
    `${DAY_NAMES[dateObj.getDay()]}, ${d} ${MONTH_NAMES[m-1]} ${y}`;
  document.getElementById('detailTime').textContent = (!e.time || e.time === '-') ? 'TBA' : e.time;

  document.getElementById('detailModalBox').style.borderTop = `5px solid ${c.color}`;

  const tempatRow = document.getElementById('detailTempatRow');
  if(e.tempat){
    tempatRow.style.display = '';
    document.getElementById('detailTempat').textContent = e.tempat;
  } else {
    tempatRow.style.display = 'none';
  }

  const metaRow = document.getElementById('detailMetaRow');
  if(e.meta){
    metaRow.style.display = '';
    document.getElementById('detailMeta').textContent = e.meta;
  } else {
    metaRow.style.display = 'none';
  }

  const sourceRow = document.getElementById('detailSourceRow');
  const isSafeUrl = e.source && /^https?:\/\//i.test(e.source);
  if(isSafeUrl){
    sourceRow.style.display = '';
    document.getElementById('detailSourceLink').href = e.source;
  } else {
    sourceRow.style.display = 'none';
  }
  renderEmbed(isSafeUrl ? e.source : null);

  detailOverlay.classList.add('show');
}

/** Tutup pop-up Detail Acara. */
function closeDetail(){
  detailOverlay.classList.remove('show');
}
document.getElementById('detailClose').onclick = closeDetail;
detailOverlay.addEventListener('click', (e) => { if(e.target === detailOverlay) closeDetail(); });

document.getElementById('addBtn').onclick = () => openModal(null);
document.getElementById('modalCancel').onclick = closeModal;
modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeModal(); });

/** Simpan jadwal: validasi judul/tanggal/link, lalu tulis ke Firestore. */
document.getElementById('modalSave').onclick = () => {
  if(!isAdmin) return;
  if(!fTitle.value.trim() || !fDate.value){
    formError.textContent = 'Judul dan tanggal wajib diisi.';
    formError.style.display = 'block';
    return;
  }
  const sourceVal = fSource.value.trim();
  if(sourceVal && !/^https?:\/\//i.test(sourceVal)){
    formError.textContent = 'Link Sumber harus diawali http:// atau https://';
    formError.style.display = 'block';
    return;
  }
  const data = {
    date: fDate.value,
    time: fTime.value || '-',
    cat: fCat.value,
    title: fTitle.value.trim(),
    tempat: fTempat.value.trim(),
    meta: fMeta.value.trim(),
    source: sourceVal,
  };
  
  if(editingId === null){
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection("events").add(data);
  } else {
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection("events").doc(editingId).update(data);
  }
  closeModal();
};

/** Hapus jadwal (dengan konfirmasi browser terlebih dulu). Hanya bisa dipanggil admin. */
function deleteEvent(index){
  if(!isAdmin) return;
  if(!confirm('Hapus jadwal ini?')) return;
  const id = EVENTS[index].id;
  db.collection("events").doc(id).delete();
}

/** Hapus massal jadwal lama (kategori selain Birthday, tanggal sudah lewat) dari Firestore. */
function cleanupOldEvents(){
  if(!isAdmin) return;
  const todayStr = fmtDate(new Date());
  const oldOnes = EVENTS.filter(e => e.cat !== 'birthday' && e.date < todayStr);
  if(oldOnes.length === 0){
    alert('Tidak ada jadwal lama yang perlu dibersihkan.');
    return;
  }
  const ok = confirm(`Ada ${oldOnes.length} jadwal lama (sudah lewat, bukan Birthday) yang akan dihapus permanen dari database. Lanjutkan?`);
  if(!ok) return;
  const batch = db.batch();
  oldOnes.forEach(e => batch.delete(db.collection("events").doc(e.id)));
  batch.commit()
    .then(() => alert(`${oldOnes.length} jadwal lama berhasil dihapus.`))
    .catch((err) => alert('Gagal menghapus: ' + err.message));
}
cleanupBtn.onclick = cleanupOldEvents;

// FILTER DATA & CHIP KATEGORI
const filterRow = document.getElementById('filterRow');

/** Render ulang chip filter kategori (Semua + tiap kategori) sesuai state activeCats. */
function renderChips(){
  filterRow.innerHTML = '';
  const allChip = document.createElement('div');
  allChip.className = 'chip' + (activeCats.size === Object.keys(CATS).length ? ' active' : '');
  allChip.innerHTML = `<span class="dot" style="background:linear-gradient(100deg,var(--accent-a),var(--accent-b))"></span> Semua`;
  allChip.onclick = () => { activeCats = new Set(Object.keys(CATS)); renderChips(); renderAll(); };
  filterRow.appendChild(allChip);

  Object.entries(CATS).forEach(([key, c]) => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (activeCats.has(key) ? ' active' : '');
    chip.style.setProperty('--dotcolor', c.color);
    chip.innerHTML = `<span class="dot" style="background:${c.color}"></span> ${c.label}`;
    chip.onclick = () => {
      if(activeCats.has(key) && activeCats.size === 1){ activeCats = new Set(Object.keys(CATS)); }
      else if(activeCats.size === Object.keys(CATS).length){ activeCats = new Set([key]); }
      else if(activeCats.has(key)){ activeCats.delete(key); }
      else{ activeCats.add(key); }
      renderChips(); renderAll();
    };
    filterRow.appendChild(chip);
  });
}

/** Acara untuk panel Upcoming: sembunyikan yang sudah lewat, kecuali Birthday (berulang tiap tahun). */
function filteredEvents(){
  const todayStr = fmtDate(new Date());
  return EVENTS
    .map((e, idx) => e.cat === 'birthday'
      ? { ...e, _idx: idx, date: birthdayNextOccurrence(e.date, new Date()) }
      : { ...e, _idx: idx })
    .filter(e => {
      if(e.cat !== 'birthday' && e.date < todayStr) return false;
      return activeCats.has(e.cat) &&
      (searchTerm === '' || e.title.toLowerCase().includes(searchTerm) || e.meta.toLowerCase().includes(searchTerm));
    });
}
/** Acara pada tanggal tertentu (untuk pill kalender); Birthday dicocokkan per bulan+tanggal saja. */
function eventsOn(dateStr){
  const todayStr = fmtDate(new Date());
  return EVENTS
    .map((e, idx) => ({ ...e, _idx: idx }))
    .filter(e => {
      const match = e.cat === 'birthday' ? monthDayOf(e.date) === monthDayOf(dateStr) : e.date === dateStr;
      if(!match) return false;
      // Jadwal selain Birthday yang sudah lewat tidak lagi ditampilkan di kalender
      if(e.cat !== 'birthday' && dateStr < todayStr) return false;
      return activeCats.has(e.cat) &&
      (searchTerm === '' || e.title.toLowerCase().includes(searchTerm) || e.meta.toLowerCase().includes(searchTerm));
    })
    .map(e => e.cat === 'birthday' ? { ...e, date: dateStr } : e);
}

// RENDER: TAMPILAN KALENDER (BULAN)
const gridDays = document.getElementById('gridDays');
const monthLabel = document.getElementById('monthLabel');

/** Label badge "new"/"upd" untuk acara yang baru dibuat/diedit dalam 2 hari terakhir. */
function badgeFor(e){
  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  const created = e.createdAt && e.createdAt.toMillis ? e.createdAt.toMillis() : null;
  const updated = e.updatedAt && e.updatedAt.toMillis ? e.updatedAt.toMillis() : null;
  if(created && (now - created) <= TWO_DAYS) return 'new';
  if(updated && created && updated > created && (now - updated) <= TWO_DAYS) return 'upd';
  return null;
}

/** Render grid kalender bulan berjalan (`current`): nama bulan, sel tanggal, dan pill acara per hari. */
function renderMonth(){
  monthLabel.textContent = `${MONTH_NAMES[current.getMonth()]} ${current.getFullYear()}`;
  gridDays.innerHTML = '';
  const year = current.getFullYear(), month = current.getMonth();
  const firstDay = new Date(year, month, 1);
  let startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const todayStr = fmtDate(new Date());

  const cells = [];
  for(let i=startOffset; i>0; i--){
    cells.push({ day: daysInPrevMonth - i + 1, other:true, date: new Date(year, month-1, daysInPrevMonth - i + 1) });
  }
  for(let d=1; d<=daysInMonth; d++){
    cells.push({ day:d, other:false, date: new Date(year, month, d) });
  }
  while(cells.length % 7 !== 0){
    const d = cells.length - (startOffset + daysInMonth) + 1;
    cells.push({ day:d, other:true, date: new Date(year, month+1, d) });
  }

  const MAX_PILLS = 3;
  cells.forEach(c => {
    const dateStr = fmtDate(c.date);
    const dayEvents = eventsOn(dateStr);
    const cell = document.createElement('div');
    cell.className = 'day-cell' + (c.other ? ' other':'') + (dateStr===todayStr?' today':'');
    const shown = dayEvents.slice(0, MAX_PILLS);
    const extra = dayEvents.length - shown.length;
    const pillsHTML = shown.map(e => {
      const cat = CATS[e.cat];
      const idx = e._idx;
      const badge = badgeFor(e);
      const badgeHTML = badge ? `<span class="day-pill-badge">${badge}</span>` : '';
      return `<div class="day-pill" style="background:color-mix(in srgb, ${cat.color} 65%, var(--mix-base))" onclick="event.stopPropagation(); openDetail(${idx})" title="${escapeHTML(e.title)}">${badgeHTML}<span class="day-pill-text">${escapeHTML(e.title)}</span></div>`;
    }).join('');
    const extraHTML = extra > 0 ? `<div class="day-pill-more">+${extra} lainnya</div>` : '';
    cell.innerHTML = `<span class="day-num">${c.day}</span>
      <div class="day-pills">${pillsHTML}${extraHTML}</div>`;
    gridDays.appendChild(cell);
  });
}

// RENDER: TAMPILAN DAFTAR

/** Acara pada bulan `current` untuk tab Daftar; Birthday berulang tiap tahun sama seperti eventsOn. */
function monthFilteredEvents(){
  const y = current.getFullYear(), m = current.getMonth();
  const todayStr = fmtDate(new Date());
  return EVENTS
    .map((e, idx) => ({ ...e, _idx: idx }))
    .filter(e => {
      if(e.cat === 'birthday'){
        const em = parseInt(e.date.split('-')[1], 10);
        return (em - 1) === m;
      }
      const [ey, em] = e.date.split('-').map(Number);
      if(ey !== y || (em - 1) !== m) return false;
      // Jadwal selain Birthday yang sudah lewat tidak lagi ditampilkan
      return e.date >= todayStr;
    })
    .map(e => {
      if(e.cat === 'birthday'){
        const [, em, ed] = e.date.split('-');
        return { ...e, date: `${y}-${em}-${ed}` };
      }
      return e;
    })
    .filter(e => activeCats.has(e.cat) &&
      (searchTerm === '' || e.title.toLowerCase().includes(searchTerm) || e.meta.toLowerCase().includes(searchTerm)));
}

/** Render tab Daftar: acara bulan berjalan, dikelompokkan per tanggal dengan header hari. */
function renderList(){
  const container = document.getElementById('listView');
  const navBar = `
    <div class="month-nav">
      <h2 id="listMonthLabel" class="display">${MONTH_NAMES[current.getMonth()]} ${current.getFullYear()}</h2>
      <div class="btns">
        <button onclick="changeMonth(-1)">‹</button>
        <button onclick="goToToday()" class="today-btn">Hari ini</button>
        <button onclick="changeMonth(1)">›</button>
      </div>
    </div>`;
  const evs = monthFilteredEvents().slice().sort((a,b)=> a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
  const groups = {};
  evs.forEach(e=>{
    groups[e.date] = groups[e.date] || [];
    groups[e.date].push(e);
  });
  const dateKeys = Object.keys(groups).sort();
  if(dateKeys.length === 0){
    container.innerHTML = navBar + '<div class="empty-msg">Tidak ada acara pada bulan ini.</div>';
    return;
  }
  container.innerHTML = navBar + dateKeys.map(dateStr => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const headerLabel = `${DAY_NAMES[dateObj.getDay()]}, ${d} ${MONTH_NAMES[m-1]} ${y}`;
    const rows = groups[dateStr].map(e => {
      const c = CATS[e.cat];
      const idx = e._idx;
      const timeLabel = (!e.time || e.time === '-') ? '' : e.time;
      const adminActions = isAdmin ? `
        <div class="event-actions list-row-actions">
          <button onclick="event.stopPropagation(); openModal(${idx})" title="Edit">✎</button>
          <button class="danger" onclick="event.stopPropagation(); deleteEvent(${idx})" title="Hapus">✕</button>
        </div>` : '';
      return `
      <div class="list-row" style="background:color-mix(in srgb, ${c.color} 70%, var(--mix-base)); cursor:pointer;" onclick="openDetail(${idx})">
        <div class="list-row-body">
          ${timeLabel ? `<div class="list-row-time">${timeLabel}</div>` : ''}
          <div class="list-row-title">${escapeHTML(e.title)}</div>
        </div>
        ${adminActions}
      </div>`;
    }).join('');
    return `
    <div class="list-date-group">
      <div class="list-date-header">${headerLabel}</div>
      ${rows}
    </div>`;
  }).join('');
}

// RENDER: PANEL UPCOMING SCHEDULE

/** Render panel sidebar "Upcoming Schedule" — daftar acara mendatang, diurutkan tanggal terdekat. */
function renderUpcoming(){
  const el = document.getElementById('upcomingList');
  const todayStr = fmtDate(new Date());
  const evs = filteredEvents().filter(e=>e.date >= todayStr).sort((a,b)=>a.date.localeCompare(b.date));
  el.innerHTML = evs.length ? evs.map(e => {
    const dParts = e.date.split('-');
    const c = CATS[e.cat];
    const idx = e._idx;
    return `
    <div class="upcoming-item" onclick="openDetail(${idx})" style="border-left-color:${c.color};">
      <div class="upcoming-date">${dParts[2]} ${MONTH_NAMES[parseInt(dParts[1])-1].slice(0,3)}</div>
      <div class="upcoming-title">${escapeHTML(e.title)}</div>
    </div>
  `}).join('') : '<div class="empty-msg">Tidak ada.</div>';
}

// NAVIGASI (tab Bulan/Daftar, bulan, pencarian)

// Sinkronkan tampilan awal dengan 'view' (otomatis 'list' di HP)
document.querySelectorAll('.view-toggle button').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
document.getElementById('monthView').style.display = view==='month' ? '' : 'none';
document.getElementById('listView').style.display = view==='list' ? '' : 'none';

document.getElementById('viewToggle').addEventListener('click', (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  view = btn.dataset.view;
  document.querySelectorAll('.view-toggle button').forEach(b=>b.classList.toggle('active', b===btn));
  document.getElementById('monthView').style.display = view==='month' ? '' : 'none';
  document.getElementById('listView').style.display = view==='list' ? '' : 'none';
  renderAll();
});

document.getElementById('searchInput').addEventListener('input', (e)=>{
  searchTerm = e.target.value.toLowerCase().trim();
  renderAll();
});

/** Geser bulan yang sedang ditampilkan (kalender & daftar) mundur/maju `delta` bulan. */
function changeMonth(delta){
  current = new Date(current.getFullYear(), current.getMonth() + delta, 1);
  renderAll();
}
/** Lompat ke bulan berjalan (tombol "Hari ini"). */
function goToToday(){
  current = new Date();
  renderAll();
}
document.getElementById('prevMonth').onclick = () => changeMonth(-1);
document.getElementById('nextMonth').onclick = () => changeMonth(1);
document.getElementById('todayBtn').onclick = goToToday;

// SINKRONISASI TINGGI PANEL UPCOMING

/** Batasi tinggi panel Upcoming supaya sejajar dengan kalender (hanya di layar lebar). */
function syncUpcomingHeight(){
  const sidePanel = document.querySelector('.side-panel');
  const mainPanelEl = document.getElementById('mainPanel');
  const upcomingList = document.getElementById('upcomingList');
  if(!sidePanel || !mainPanelEl || !upcomingList) return;

  // Di layar sempit (sidebar pindah ke bawah), tampilkan semua tanpa batas tinggi
  if(window.innerWidth <= 800){
    upcomingList.style.maxHeight = 'none';
    upcomingList.style.overflow = 'visible';
    return;
  }

  upcomingList.style.maxHeight = 'none';
  upcomingList.style.overflow = 'visible';

  // Ukur posisi tepi elemen secara langsung di layar supaya presisi (tidak ada celah sisa)
  const mainRect = mainPanelEl.getBoundingClientRect();
  const listRect = upcomingList.getBoundingClientRect();
  const sidePanelStyle = getComputedStyle(sidePanel);
  const sidePanelPaddingBottom = parseFloat(sidePanelStyle.paddingBottom) || 0;
  const sidePanelBorderBottom = parseFloat(sidePanelStyle.borderBottomWidth) || 0;

  const targetHeight = mainRect.bottom - listRect.top - sidePanelPaddingBottom - sidePanelBorderBottom;
  upcomingList.style.maxHeight = Math.max(targetHeight, 0) + 'px';
  upcomingList.style.overflow = 'hidden';
}

/** Render ulang semua tampilan yang relevan (kalender/daftar + upcoming), lalu sinkronkan tinggi panel. */
function renderAll(){
  if(view==='month'){ renderMonth(); }
  else{ renderList(); }
  renderUpcoming();
  syncUpcomingHeight();
}
window.addEventListener('resize', syncUpcomingHeight);

// Ukur ulang otomatis kalau ukuran kalender berubah (misal karena font Google Fonts
// baru selesai dimuat setelah pengukuran pertama, atau perubahan konten lain)
if(window.ResizeObserver){
  const mainPanelEl = document.getElementById('mainPanel');
  if(mainPanelEl){
    new ResizeObserver(() => syncUpcomingHeight()).observe(mainPanelEl);
  }
}
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(() => syncUpcomingHeight());
}

// LISTENER REAL-TIME FIRESTORE & REFRESH MANUAL

/** Listener realtime: EVENTS otomatis ter-update tiap ada perubahan data di Firestore. */
db.collection("events").onSnapshot((querySnapshot) => {
  EVENTS = [];
  querySnapshot.forEach((doc) => {
    EVENTS.push({ id: doc.id, ...doc.data() });
  });
  renderChips();
  renderAll();
});

/** Tombol refresh manual: ambil data langsung dari server (bukan cache), jaga-jaga listener lag. */
document.getElementById('refreshBtn').onclick = () => {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  db.collection("events").get({ source: 'server' })
    .then((querySnapshot) => {
      EVENTS = [];
      querySnapshot.forEach((doc) => {
        EVENTS.push({ id: doc.id, ...doc.data() });
      });
      renderChips();
      renderAll();
    })
    .catch((err) => {
      console.error('Gagal refresh jadwal:', err);
    })
    .finally(() => {
      setTimeout(() => btn.classList.remove('spinning'), 300);
    });
};
