const STATUS = {
  new: ['ใหม่', '#e0f2f7', '#0f5d75'],
  confirmed: ['ยืนยันแล้ว', '#fdf3e1', '#9a7330'],
  done: ['ส่งแล้ว', '#e3f5ea', '#21804a'],
  cancelled: ['ยกเลิก', '#f8e6e6', '#aa3333']
};

let data = Store.load();
let currentTab = 'dash';
let orderStatus = '';
let editingId = null;
let pendingImage = null;

const reload = () => { data = Store.load(); };
const commit = () => Store.save(data);
const sortedOrders = () => [...data.orders].sort((a, b) => b.id - a.id);

// ---------- เข้าสู่ระบบ ----------
const isAuthed = () => sessionStorage.getItem('mf_admin') === '1';

function showLogin() {
  reload();
  $('#login').hidden = false;
  $('#app').hidden = true;
  $('#loginHint').hidden = data.settings.admin_pass !== DEFAULT_PASS;
}
function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  go('dash');
}
$('#loginForm').onsubmit = e => {
  e.preventDefault();
  reload();
  const pass = new FormData(e.target).get('password');
  if (pass === data.settings.admin_pass) {
    sessionStorage.setItem('mf_admin', '1');
    e.target.reset();
    $('#loginErr').textContent = '';
    showApp();
  } else {
    $('#loginErr').textContent = 'รหัสผ่านไม่ถูกต้อง';
  }
};
$$('.logout').forEach(b => b.onclick = () => {
  sessionStorage.removeItem('mf_admin');
  showLogin();
});

// ---------- แท็บ ----------
const loaders = { dash: renderDash, orders: renderOrders, products: renderProducts, settings: renderSettings };
function go(tab) {
  currentTab = tab;
  reload();
  $$('.side nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab').forEach(t => t.hidden = t.id !== 'tab-' + tab);
  loaders[tab]();
  updateBadge();
}
const refresh = () => go(currentTab);
$('.side nav').onclick = e => {
  const b = e.target.closest('button');
  if (b) go(b.dataset.tab);
};
function updateBadge() {
  const n = data.orders.filter(o => o.status === 'new').length;
  $('#newBadge').textContent = n || '';
  $('#newBadge').hidden = !n;
}

// ---------- ออเดอร์ ----------
function orderCard(o) {
  const [label, bg, fg] = STATUS[o.status] || STATUS.new;
  const time = new Date(o.created_at).toLocaleString('th-TH');
  return `<div class="order">
    <div class="o-main">
      <div class="o-top"><b>#${o.id} ${esc(o.customer)}</b><span class="pill" style="background:${bg};color:${fg}">${label}</span></div>
      <div class="o-meta">💐 ${esc(o.product_name)} · ${priceText(o.price)}</div>
      <div class="o-meta">📞 <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>${o.delivery_date ? ' · 📅 ต้องการรับ ' + esc(o.delivery_date) : ''}</div>
      ${o.address ? `<div class="o-meta">📍 ${esc(o.address)}</div>` : ''}
      ${o.note ? `<div class="o-note">“${esc(o.note)}”</div>` : ''}
      <div class="o-time">สั่งเมื่อ ${time}</div>
    </div>
    <div class="o-act">
      <select data-status="${o.id}">${Object.entries(STATUS).map(([k, v]) =>
        `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      <button class="icon" data-del-order="${o.id}" title="ลบ">🗑</button>
    </div>
  </div>`;
}

function renderDash() {
  const now = new Date();
  const sameDay = d => d.toDateString() === now.toDateString();
  const sameMonth = d => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const today = data.orders.filter(o => sameDay(new Date(o.created_at))).length;
  const pending = data.orders.filter(o => o.status === 'new').length;
  const revenue = data.orders
    .filter(o => ['confirmed', 'done'].includes(o.status) && sameMonth(new Date(o.created_at)))
    .reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  const active = data.products.filter(p => p.active).length;

  $('#stats').innerHTML = [
    ['ออเดอร์วันนี้', today], ['รอดำเนินการ', pending],
    ['ยอดขายเดือนนี้', baht(revenue)], ['สินค้าที่แสดง', active]
  ].map(([l, v]) => `<div class="stat"><span>${l}</span><b>${v}</b></div>`).join('');

  const recent = sortedOrders().slice(0, 5);
  $('#recent').innerHTML = recent.length ? recent.map(orderCard).join('') : '<p class="muted">ยังไม่มีออเดอร์</p>';
}

function renderOrders() {
  const list = sortedOrders().filter(o => !orderStatus || o.status === orderStatus);
  $('#orderList').innerHTML = list.length ? list.map(orderCard).join('') : '<p class="muted">ไม่มีออเดอร์</p>';
}
$('#orderFilter').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  orderStatus = b.dataset.s;
  $$('#orderFilter button').forEach(x => x.classList.toggle('active', x === b));
  renderOrders();
};

document.addEventListener('change', e => {
  const id = Number(e.target.dataset.status);
  if (!id) return;
  reload();
  const o = data.orders.find(x => x.id === id);
  if (!o) return;
  o.status = e.target.value;
  if (commit()) toast('อัปเดตสถานะแล้ว ✓');
  refresh();
});
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-del-order]');
  if (!btn || !confirm('ลบออเดอร์นี้?')) return;
  reload();
  data.orders = data.orders.filter(o => o.id !== Number(btn.dataset.delOrder));
  if (commit()) toast('ลบออเดอร์แล้ว');
  refresh();
});

// ---------- สินค้า ----------
const pf = $('#productForm');
const field = n => pf.elements[n];

function renderProducts() {
  const q = $('#search').value.trim().toLowerCase();
  const list = [...data.products]
    .sort((a, b) => b.id - a.id)
    .filter(p => (p.name + ' ' + (p.category || '')).toLowerCase().includes(q));
  $('#productList').innerHTML = list.length ? list.map(p => `
    <div class="pcard ${p.active ? '' : 'off'}">
      <div class="pimg">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : '💐'}</div>
      <div class="pinfo">
        <small>${esc(p.category || '-')}</small>
        <b>${esc(p.name)}</b>
        <span>${priceText(p.price)}</span>
        <div class="tags">${p.featured ? '<i>⭐ แนะนำ</i>' : ''}${p.active ? '' : '<i>ซ่อนอยู่</i>'}</div>
      </div>
      <div class="pact">
        <button class="btn-o" data-edit="${p.id}">✏️ แก้ไข</button>
        <button class="icon" data-del="${p.id}" title="ลบ">🗑</button>
      </div>
    </div>`).join('') : '<p class="muted">ไม่พบสินค้า</p>';
}
$('#search').oninput = renderProducts;

$('#productList').onclick = e => {
  const ed = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (ed) openProduct(data.products.find(p => p.id === Number(ed.dataset.edit)));
  if (del && confirm('ลบสินค้านี้ถาวร?\n(ถ้าแค่อยากซ่อน ให้กดแก้ไขแล้วติ๊ก "แสดงบนหน้าเว็บ" ออก)')) {
    reload();
    data.products = data.products.filter(p => p.id !== Number(del.dataset.del));
    if (commit()) toast('ลบสินค้าแล้ว');
    renderProducts();
  }
};
$('#addProduct').onclick = () => openProduct(null);

function openProduct(p) {
  editingId = p ? p.id : null;
  pendingImage = null;
  pf.reset();
  $('#pTitle').textContent = p ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่';
  field('name').value = p?.name || '';
  field('category').value = p?.category || '';
  field('price').value = p?.price ?? '';
  field('description').value = p?.description || '';
  field('featured').checked = !!p?.featured;
  field('active').checked = p ? !!p.active : true;
  $('#preview').innerHTML = p?.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : '<span>📷 คลิกเพื่อเลือกรูป</span>';
  $('#cats').innerHTML = [...new Set(data.products.map(x => x.category).filter(Boolean))]
    .map(c => `<option value="${esc(c)}">`).join('');
  $('#pModal').classList.add('open');
}

// ย่อรูปอัตโนมัติ (กว้างสุด 900px) เพื่อประหยัดพื้นที่
function compressImage(file, max = 900, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('อ่านไฟล์รูปไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG'));
    img.src = URL.createObjectURL(file);
  });
}

field('image').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) return toast('กรุณาเลือกไฟล์รูปภาพ');
  try {
    $('#preview').innerHTML = '<span>กำลังเตรียมรูป...</span>';
    pendingImage = await compressImage(f);
    $('#preview').innerHTML = `<img src="${pendingImage}" alt="">`;
  } catch (err) {
    toast(err.message);
    $('#preview').innerHTML = '<span>📷 คลิกเพื่อเลือกรูป</span>';
  }
};

pf.onsubmit = e => {
  e.preventDefault();
  const name = field('name').value.trim();
  if (!name) return toast('กรุณาใส่ชื่อสินค้า');
  const item = {
    name: name.slice(0, 120),
    category: field('category').value.trim().slice(0, 60),
    price: Math.max(0, Number(field('price').value) || 0),
    description: field('description').value.trim().slice(0, 1000),
    featured: field('featured').checked,
    active: field('active').checked
  };

  reload();
  if (editingId) {
    const p = data.products.find(x => x.id === editingId);
    if (!p) return toast('ไม่พบสินค้านี้แล้ว');
    Object.assign(p, item);
    if (pendingImage) p.image = pendingImage;
  } else {
    data.products.push({ id: Store.nextId(data.products), image: pendingImage || '', ...item });
  }

  if (commit()) {
    $('#pModal').classList.remove('open');
    toast('บันทึกสินค้าแล้ว ✓');
  } else {
    reload();
  }
  renderProducts();
};
$('#pModal').onclick = e => {
  if (e.target.id === 'pModal' || e.target.classList.contains('cancel')) $('#pModal').classList.remove('open');
};

// ---------- ตั้งค่า ----------
const FIELDS = [
  ['shop_name', 'ชื่อร้าน'],
  ['hero_title', 'หัวข้อใหญ่หน้าแรก'],
  ['hero_subtitle', 'ข้อความใต้หัวข้อ', 'textarea'],
  ['phone', 'เบอร์โทรร้าน'],
  ['line_url', 'ลิงก์ LINE (เช่น https://line.me/R/ti/p/@xxxx)'],
  ['open_hours', 'เวลาเปิด-ปิด'],
  ['address', 'ที่อยู่ร้าน', 'textarea'],
  ['facebook', 'ลิงก์ Facebook'],
  ['instagram', 'ลิงก์ Instagram'],
  ['tiktok', 'ลิงก์ TikTok']
];
const LINK_FIELDS = ['line_url', 'facebook', 'instagram', 'tiktok'];

function renderSettings() {
  const s = data.settings;
  $('#settingsForm').innerHTML = FIELDS.map(([k, label, type]) => `<label><span>${label}</span>${
    type === 'textarea'
      ? `<textarea name="${k}" rows="2">${esc(s[k])}</textarea>`
      : `<input name="${k}" value="${esc(s[k])}">`
  }</label>`).join('') + `
    <label><span>เปลี่ยนรหัสผ่านหลังบ้าน (เว้นว่างถ้าไม่เปลี่ยน)</span>
      <input name="new_pass" type="password" autocomplete="new-password" placeholder="อย่างน้อย 6 ตัวอักษร"></label>
    <div><button class="btn" type="submit">💾 บันทึกการตั้งค่า</button></div>`;
}

$('#settingsForm').onsubmit = e => {
  e.preventDefault();
  const f = new FormData(e.target);
  for (const k of LINK_FIELDS) {
    const v = String(f.get(k) || '').trim();
    if (v && !isUrl(v)) return toast('ลิงก์ต้องขึ้นต้นด้วย https://');
  }
  const newPass = String(f.get('new_pass') || '');
  if (newPass && newPass.length < 6) return toast('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');

  reload();
  for (const [k] of FIELDS) data.settings[k] = String(f.get(k) || '').trim().slice(0, 500);
  if (newPass) data.settings.admin_pass = newPass;
  if (commit()) {
    toast(newPass ? 'บันทึกแล้ว และเปลี่ยนรหัสผ่านเรียบร้อย ✓' : 'บันทึกแล้ว ✓');
    e.target.elements.new_pass.value = '';
  }
};

// ---------- สำรอง / นำเข้าข้อมูล ----------
$('#exportBtn').onclick = () => {
  reload();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mineflowerz-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('ดาวน์โหลดไฟล์สำรองแล้ว ✓');
};

$('#importFile').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (!obj || !obj.settings || !Array.isArray(obj.products) || !Array.isArray(obj.orders)) {
      throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
    }
    if (!confirm('ข้อมูลปัจจุบันจะถูกแทนที่ด้วยไฟล์สำรองนี้ ต้องการดำเนินการต่อ?')) return;
    if (Store.save(obj)) {
      toast('นำเข้าข้อมูลเรียบร้อย ✓');
      go('dash');
    }
  } catch (err) {
    toast('นำเข้าไม่สำเร็จ: ' + err.message);
  }
};

// ---------- เริ่มทำงาน ----------
// ลูกค้าสั่งในแท็บอื่นของเครื่องนี้ → หลังบ้านอัปเดตเอง
window.addEventListener('storage', e => {
  if (e.key !== DB_KEY || $('#app').hidden) return;
  if (currentTab === 'settings') { reload(); updateBadge(); }
  else refresh();
});

isAuthed() ? showApp() : showLogin();
