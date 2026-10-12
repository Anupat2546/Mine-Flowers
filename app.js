let data = Store.load();
let current = null;
let activeCat = 'all';
let lastSummary = '';

const visibleProducts = () => data.products
  .filter(p => p.active)
  .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.id - a.id);

function init() {
  data = Store.load();
  applySettings();
  renderFilters();
  renderProducts();
}

// ---------- ข้อความ / ลิงก์ ----------
function applySettings() {
  const s = data.settings;
  document.title = `${s.shop_name} | ร้านดอกไม้`;
  $('#logo').textContent = s.shop_name;
  $('#heroTitle').textContent = s.hero_title;
  $('#heroSub').textContent = s.hero_subtitle;
  $$('[data-link]').forEach(a => {
    const v = s[a.dataset.link];
    if (isUrl(v)) { a.href = v; a.style.display = ''; }
    else a.style.display = 'none';
  });
  $$('[data-text]').forEach(el => el.textContent = s[el.dataset.text] || '-');
  $$('[data-tel]').forEach(a => a.href = 'tel:' + (s.phone || '').replace(/\s/g, ''));
  $('#year').textContent = new Date().getFullYear();
}

// ---------- หมวดหมู่ ----------
function renderFilters() {
  const cats = ['all', ...new Set(visibleProducts().map(p => p.category).filter(Boolean))];
  if (!cats.includes(activeCat)) activeCat = 'all';
  $('#filters').innerHTML = cats.map(c =>
    `<button class="chip ${c === activeCat ? 'active' : ''}" data-cat="${esc(c)}">${c === 'all' ? 'ทั้งหมด' : esc(c)}</button>`
  ).join('');
}
$('#filters').onclick = e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  activeCat = b.dataset.cat;
  $$('.chip').forEach(x => x.classList.toggle('active', x === b));
  renderProducts();
};

// ---------- สินค้า ----------
const imgHtml = p => p.image
  ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
  : '<span>💐</span>';

function renderProducts() {
  const all = visibleProducts();
  const list = activeCat === 'all' ? all : all.filter(p => p.category === activeCat);
  $('#grid').innerHTML = list.length ? list.map(p => `
    <article class="card" data-id="${p.id}">
      ${p.featured ? '<span class="badge">แนะนำ</span>' : ''}
      <div class="img">${imgHtml(p)}</div>
      <div class="body">
        <div class="cat">${esc(p.category)}</div>
        <h3>${esc(p.name)}</h3>
        <div class="price">${priceText(p.price)}</div>
      </div>
    </article>`).join('') : '<p class="empty">ยังไม่มีสินค้าในหมวดนี้</p>';
}
$('#grid').onclick = e => {
  const c = e.target.closest('.card');
  if (c) openModal(Number(c.dataset.id));
};

// ---------- ป๊อปอัป ----------
function openModal(id) {
  current = visibleProducts().find(p => p.id === id);
  if (!current) return;
  $('#mImg').innerHTML = imgHtml(current);
  $('#mCat').textContent = current.category || '';
  $('#mName').textContent = current.name;
  $('#mPrice').textContent = priceText(current.price);
  $('#mDesc').textContent = current.description || '';
  const f = $('#orderForm');
  f.reset();
  f.hidden = false;
  $('#orderDone').hidden = true;
  const d = new Date();
  f.elements.delivery_date.min = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('#modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modal').classList.remove('open');
  document.body.style.overflow = '';
}
$('#modal').onclick = e => {
  if (e.target.id === 'modal' || e.target.classList.contains('close')) closeModal();
};
$('#doneClose').onclick = closeModal;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---------- สั่งซื้อ ----------
$('#orderForm').onsubmit = e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const customer = (f.customer || '').trim();
  const phone = (f.phone || '').trim();
  if (!customer || !/^[0-9+\-\s]{9,20}$/.test(phone)) {
    return toast('กรุณากรอกชื่อและเบอร์โทรให้ถูกต้อง');
  }

  data = Store.load();
  const p = data.products.find(x => x.id === current.id && x.active);
  if (!p) return toast('สินค้านี้ไม่มีแล้ว กรุณาเลือกใหม่');

  const order = {
    id: Store.nextId(data.orders),
    customer, phone,
    product_id: p.id, product_name: p.name, price: Number(p.price) || 0,
    delivery_date: f.delivery_date || '',
    address: (f.address || '').trim().slice(0, 500),
    note: (f.note || '').trim().slice(0, 500),
    status: 'new',
    created_at: new Date().toISOString()
  };
  data.orders.unshift(order);
  if (!Store.save(data)) return;

  lastSummary = [
    `ออเดอร์ #${order.id} – ${data.settings.shop_name}`,
    `สินค้า: ${p.name} (${priceText(p.price)})`,
    `ชื่อ: ${customer}`,
    `โทร: ${phone}`,
    order.delivery_date && `วันที่ต้องการรับ: ${order.delivery_date}`,
    order.address && `ที่อยู่จัดส่ง: ${order.address}`,
    order.note && `ข้อความ/รายละเอียด: ${order.note}`
  ].filter(Boolean).join('\n');

  const hasLine = isUrl(data.settings.line_url);
  $('#orderForm').hidden = true;
  $('#orderDone').hidden = false;
  $('#doneSummary').textContent = lastSummary;
  $('#sendLine').hidden = !hasLine;
  $('#doneText').textContent = hasLine
    ? 'กดปุ่มด้านล่าง ระบบจะคัดลอกรายละเอียดให้ แล้ววางในแชท LINE ของร้านได้เลยค่ะ'
    : 'กรุณาแคปหน้าจอนี้ แล้วส่งให้ร้านทาง Facebook หรือ Instagram ค่ะ';
};

function copyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  return ok;
}

$('#sendLine').onclick = () => {
  copyText(lastSummary);
  toast('คัดลอกรายละเอียดแล้ว วางในแชท LINE ได้เลยค่ะ');
  window.open(data.settings.line_url, '_blank', 'noopener');
};

// ---------- เอฟเฟกต์ ----------
window.addEventListener('scroll', () => $('.nav').classList.toggle('scrolled', scrollY > 40));
const io = new IntersectionObserver(entries => entries.forEach(en => {
  if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
}), { threshold: 0.15 });
$$('.reveal').forEach(el => io.observe(el));

// แก้ในหลังบ้าน (อีกแท็บ) → หน้าเว็บอัปเดตเอง
window.addEventListener('storage', e => { if (e.key === DB_KEY) init(); });

init();
