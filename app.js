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
let view = 'month';
let selectedDate = fmtDate(new Date());

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
    fDate.value = selectedDate || '';
    fTime.value = '';
    fCat.value = Object.keys(CATS)[0];
    fMeta.value = '';
    editingId = null;
  } else {
    const e = EVENTS[index];
    modalTitle.textContent = 'Edit Jadwal';
    fTitle.value = e.title;
    fDate.value = e.date;
    fTime.value = e.time === '-' ? '' : e.time;
    fCat.value = e.cat;
    fMeta.value = e.meta;
    editingId = e.id;
  }
  modalOverlay.classList.add('show');
}

function closeModal(){
  modalOverlay.classList.remove('show');
  editingIndex = null;
  editingId = null;
}

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
  };
  
  if(editingId === null){
    db.collection("events").add(data);
  } else {
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

  cells.forEach(c => {
    const dateStr = fmtDate(c.date);
    const dayEvents = eventsOn(dateStr);
    const cell = document.createElement('div');
    cell.className = 'day-cell' + (c.other ? ' other':'') + (dateStr===todayStr?' today':'') + (dateStr===selectedDate?' selected':'');
    cell.innerHTML = `<span class="day-num">${c.day}</span>
      <div class="day-dots">${dayEvents.slice(0,4).map(e=>`<i style="background:${CATS[e.cat].color}"></i>`).join('')}</div>`;
    cell.onclick = () => { selectedDate = (selectedDate === dateStr) ? null : dateStr; renderMonth(); renderDayDetail(); };
    gridDays.appendChild(cell);
  });
}

function renderDayDetail(){
  const label = document.getElementById('dayDetailLabel');
  const list = document.getElementById('dayDetailList');
  if(!selectedDate){ label.textContent = 'Pilih tanggal untuk lihat detail'; list.innerHTML=''; return; }
  const dateParts = selectedDate.split('-');
  const d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
  label.textContent = d.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const evs = eventsOn(selectedDate);
  list.innerHTML = evs.length ? evs.map(eventCardHTML).join('') : '<div class="empty-msg">Tidak ada acara pada tanggal ini.</div>';
}

function eventCardHTML(e){
  const c = CATS[e.cat];
  const idx = EVENTS.indexOf(e);
  const adminActions = isAdmin ? `
    <div class="event-actions">
      <button onclick="openModal(${idx})" title="Edit">✎</button>
      <button class="danger" onclick="deleteEvent(${idx})" title="Hapus">✕</button>
    </div>` : '';
  return `<div class="event">
    <div class="bar" style="background:${c.color}"></div>
    <div class="body">
      <div class="time">${e.time}</div>
      <div class="title">${e.title}</div>
      <div class="meta">${e.meta}</div>
      <span class="tag" style="background:${c.color}22; color:${c.color}">${c.label}</span>
    </div>
    ${adminActions}
  </div>`;
}

function renderList(){
  const container = document.getElementById('listView');
  const evs = filteredEvents().slice().sort((a,b)=> a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
  const groups = {};
  evs.forEach(e=>{
    groups[e.date] = groups[e.date] || [];
    groups[e.date].push(e);
  });
  const dateKeys = Object.keys(groups).sort();
  if(dateKeys.length === 0){
    container.innerHTML = '<div class="empty-msg">Tidak ada acara yang cocok.</div>';
    return;
  }
  container.innerHTML = dateKeys.map(dateStr => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const headerLabel = `${d} ${MONTH_NAMES[m-1]} ${y} ${DAY_NAMES[dateObj.getDay()]}`;
    const rows = groups[dateStr].map(e => {
      const c = CATS[e.cat];
      const idx = EVENTS.indexOf(e);
      const timeLabel = (!e.time || e.time === '-') ? '' : e.time;
      const adminActions = isAdmin ? `
        <div class="event-actions list-row-actions">
          <button onclick="openModal(${idx})" title="Edit">✎</button>
          <button class="danger" onclick="deleteEvent(${idx})" title="Hapus">✕</button>
        </div>` : '';
      return `
      <div class="list-row" style="background:${c.color};">
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
  const evs = filteredEvents().filter(e=>e.date >= todayStr).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  el.innerHTML = evs.length ? evs.map(e => {
    const dParts = e.date.split('-');
    return `
    <div style="margin-bottom:12px;">
      <div style="font-size:0.72rem; color:var(--text-faint); font-weight:600;">${dParts[2]} ${MONTH_NAMES[parseInt(dParts[1])-1].slice(0,3)}</div>
      <div style="font-size:0.85rem; font-weight:600; margin-top:2px;">${e.title}</div>
    </div>
  `}).join('') : '<div class="empty-msg">Tidak ada.</div>';
}

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

document.getElementById('prevMonth').onclick = () => { current = new Date(current.getFullYear(), current.getMonth()-1, 1); renderMonth(); };
document.getElementById('nextMonth').onclick = () => { current = new Date(current.getFullYear(), current.getMonth()+1, 1); renderMonth(); };

function renderAll(){
  if(view==='month'){ renderMonth(); renderDayDetail(); }
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
