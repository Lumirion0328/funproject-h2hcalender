// ==========================================
// 1. KONFIGURASI FIREBASE DI SINI
// ==========================================
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
// ==========================================

const CATS = {
  broadcast: { label: 'Siaran', color: 'var(--red)' },
  event:     { label: 'Event', color: 'var(--accent-a)' },
  release:   { label: 'Rilis', color: 'var(--gold)' },
  birthday:  { label: 'Birthday', color: 'var(--green)' },
};

let EVENTS = []; 

function fmtDate(d){
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
const loginOverlay = document.getElementById('loginOverlay');
const lEmail = document.getElementById('lEmail');
const lPass = document.getElementById('lPass');
const loginError = document.getElementById('loginError');

// Listener Autentikasi Firebase
auth.onAuthStateChanged((user) => {
  isAdmin = !!user;
  adminBtn.classList.toggle('on', isAdmin);
  adminBtn.innerHTML = isAdmin ? '<span class="pip"></span> Logout' : '<span class="pip"></span> Admin';
  addBtn.style.display = isAdmin ? 'inline-flex' : 'none';
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

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const DAY_NAMES = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const fTitle = document.getElementById('fTitle');
const fDate = document.getElementById('fDate');
const fTime = document.getElementById('fTime');
const fCat = document.getElementById('fCat');
const fMeta = document.getElementById('fMeta');
const fSource = document.getElementById('fSource');
const formError = document.getElementById('formError');

function populateCatSelect(){
  fCat.innerHTML = Object.entries(CATS).map(([key,c]) => `<option value="${key}">${c.label}</option>`).join('');
}

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
    fMeta.value = e.meta;
    fSource.value = e.source || '';
    editingId = e.id;
  }
  modalOverlay.classList.add('show');
}

function detectEmbed(url){
  if(!url) return null;
  if(/(?:twitter\.com|x\.com)\/[^\/]+\/status\/\d+/i.test(url)) return 'twitter';
  if(/instagram\.com\/(p|reel|tv)\//i.test(url)) return 'instagram';
  return null;
}

function loadScriptOnce(src, id){
  return new Promise((resolve) => {
    if(document.getElementById(id)){ resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.id = id; s.async = true;
    s.onload = () => resolve();
    document.body.appendChild(s);
  });
}

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

function closeModal(){
  modalOverlay.classList.remove('show');
  editingIndex = null;
  editingId = null;
}

const detailOverlay = document.getElementById('detailOverlay');

function openDetail(index){
  const e = EVENTS[index];
  if(!e) return;
  const c = CATS[e.cat];
  const [y, m, d] = e.date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  document.getElementById('detailTitle').textContent = e.title;
  document.getElementById('detailDate').textContent =
    `${DAY_NAMES[dateObj.getDay()]}, ${d} ${MONTH_NAMES[m-1]} ${y}`;
  document.getElementById('detailTime').textContent = (!e.time || e.time === '-') ? 'TBA' : e.time;
  const catValueEl = document.getElementById('detailCat');
  catValueEl.textContent = c.label;
  catValueEl.style.color = c.color;

  const metaRow = document.getElementById('detailMetaRow');
  if(e.meta){
    metaRow.style.display = '';
    document.getElementById('detailMeta').textContent = e.meta;
  } else {
    metaRow.style.display = 'none';
  }

  const sourceRow = document.getElementById('detailSourceRow');
  if(e.source){
    sourceRow.style.display = '';
    document.getElementById('detailSourceLink').href = e.source;
  } else {
    sourceRow.style.display = 'none';
  }
  renderEmbed(e.source);

  detailOverlay.classList.add('show');
}

function closeDetail(){
  detailOverlay.classList.remove('show');
}
document.getElementById('detailClose').onclick = closeDetail;
detailOverlay.addEventListener('click', (e) => { if(e.target === detailOverlay) closeDetail(); });

document.getElementById('addBtn').onclick = () => openModal(null);
document.getElementById('modalCancel').onclick = closeModal;
modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeModal(); });

document.getElementById('modalSave').onclick = () => {
  if(!isAdmin) return;
  if(!fTitle.value.trim() || !fDate.value){
    formError.textContent = 'Judul dan tanggal wajib diisi.';
    formError.style.display = 'block';
    return;
  }
  const data = {
    date: fDate.value,
    time: fTime.value || '-',
    cat: fCat.value,
    title: fTitle.value.trim(),
    meta: fMeta.value.trim(),
    source: fSource.value.trim(),
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

function deleteEvent(index){
  if(!isAdmin) return;
  if(!confirm('Hapus jadwal ini?')) return;
  const id = EVENTS[index].id;
  db.collection("events").doc(id).delete();
}

const filterRow = document.getElementById('filterRow');
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

function filteredEvents(){
  const todayStr = fmtDate(new Date());
  return EVENTS.filter(e => {
    if(e.date < todayStr && e.cat !== 'birthday') return false;
    return activeCats.has(e.cat) &&
    (searchTerm === '' || e.title.toLowerCase().includes(searchTerm) || e.meta.toLowerCase().includes(searchTerm));
  });
}
function eventsOn(dateStr){
  return filteredEvents().filter(e => e.date === dateStr);
}

const gridDays = document.getElementById('gridDays');
const monthLabel = document.getElementById('monthLabel');

function badgeFor(e){
  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  const created = e.createdAt && e.createdAt.toMillis ? e.createdAt.toMillis() : null;
  const updated = e.updatedAt && e.updatedAt.toMillis ? e.updatedAt.toMillis() : null;
  if(created && (now - created) <= TWO_DAYS) return 'new';
  if(updated && created && updated > created && (now - updated) <= TWO_DAYS) return 'upd';
  return null;
}

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
      const idx = EVENTS.indexOf(e);
      const badge = badgeFor(e);
      const badgeHTML = badge ? `<span class="day-pill-badge">${badge}</span>` : '';
      return `<div class="day-pill" style="background:color-mix(in srgb, ${cat.color} 65%, white)" onclick="event.stopPropagation(); openDetail(${idx})" title="${e.title.replace(/"/g,'&quot;')}">${badgeHTML}<span class="day-pill-text">${e.title}</span></div>`;
    }).join('');
    const extraHTML = extra > 0 ? `<div class="day-pill-more">+${extra} lainnya</div>` : '';
    cell.innerHTML = `<span class="day-num">${c.day}</span>
      <div class="day-pills">${pillsHTML}${extraHTML}</div>`;
    gridDays.appendChild(cell);
  });
}

function monthFilteredEvents(){
  const y = current.getFullYear(), m = current.getMonth();
  return EVENTS.filter(e => {
    const [ey, em] = e.date.split('-').map(Number);
    if(ey !== y || (em - 1) !== m) return false;
    return activeCats.has(e.cat) &&
    (searchTerm === '' || e.title.toLowerCase().includes(searchTerm) || e.meta.toLowerCase().includes(searchTerm));
  });
}

function renderList(){
  const container = document.getElementById('listView');
  const navBar = `
    <div class="month-nav">
      <h2 id="listMonthLabel" class="display">${MONTH_NAMES[current.getMonth()]} ${current.getFullYear()}</h2>
      <div class="btns">
        <button onclick="changeMonth(-1)">‹</button>
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
      const idx = EVENTS.indexOf(e);
      const timeLabel = (!e.time || e.time === '-') ? '' : e.time;
      const adminActions = isAdmin ? `
        <div class="event-actions list-row-actions">
          <button onclick="event.stopPropagation(); openModal(${idx})" title="Edit">✎</button>
          <button class="danger" onclick="event.stopPropagation(); deleteEvent(${idx})" title="Hapus">✕</button>
        </div>` : '';
      return `
      <div class="list-row" style="background:color-mix(in srgb, ${c.color} 70%, white); cursor:pointer;" onclick="openDetail(${idx})">
        <div class="list-row-body">
          ${timeLabel ? `<div class="list-row-time">${timeLabel}</div>` : ''}
          <div class="list-row-title">${e.title}</div>
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

function renderUpcoming(){
  const el = document.getElementById('upcomingList');
  const todayStr = fmtDate(new Date());
  const evs = filteredEvents().filter(e=>e.date >= todayStr).sort((a,b)=>a.date.localeCompare(b.date));
  el.innerHTML = evs.length ? evs.map(e => {
    const dParts = e.date.split('-');
    const c = CATS[e.cat];
    const idx = EVENTS.indexOf(e);
    return `
    <div class="upcoming-item" onclick="openDetail(${idx})" style="border-left-color:${c.color};">
      <div class="upcoming-date">${dParts[2]} ${MONTH_NAMES[parseInt(dParts[1])-1].slice(0,3)}</div>
      <div class="upcoming-title" style="color:${c.color};">${e.title}</div>
    </div>
  `}).join('') : '<div class="empty-msg">Tidak ada.</div>';
}

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

function changeMonth(delta){
  current = new Date(current.getFullYear(), current.getMonth() + delta, 1);
  renderAll();
}
document.getElementById('prevMonth').onclick = () => changeMonth(-1);
document.getElementById('nextMonth').onclick = () => changeMonth(1);

function renderAll(){
  if(view==='month'){ renderMonth(); }
  else{ renderList(); }
  renderUpcoming();
}

db.collection("events").onSnapshot((querySnapshot) => {
  EVENTS = [];
  querySnapshot.forEach((doc) => {
    EVENTS.push({ id: doc.id, ...doc.data() });
  });
  renderChips();
  renderAll();
});

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
