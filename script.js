// ===== ข้อมูลกลาง ใช้ร่วมกันทั้งหน้าเว็บและหลังบ้าน =====
const DB_KEY = 'mineflowers_data_v1';
const DEFAULT_PASS = '##Cake2546##';

const DEFAULT_DATA = {
  catalog_version: FLOWER_CATALOG_VERSION,
  settings: {
    shop_name: 'Mine Flowers',
    hero_title: 'ดอกไม้ทุกช่อ จัดด้วยหัวใจ',
    hero_subtitle: 'ช่อดอกไม้สด งานประณีต สำหรับทุกโอกาสพิเศษของคุณ',
    phone: '0982650311',
    line_url: 'https://lin.ee/tYR5PFj',
    address: '31 หมู่ที่9 ถ. พหลโยธิน ตำบล คลองหนึ่ง อำเภอคลองหลวง ปทุมธานี 12120',
    open_hours: 'ทุกวัน 09:00 – 22:00',
    facebook: 'https://www.facebook.com/MineFlowerZ/',
    instagram: 'https://www.instagram.com/mine_flowerz/',
    tiktok: 'https://www.tiktok.com/@mine.flower5',
    admin_pass: DEFAULT_PASS
  },
  products: FLOWER_CATALOG.map((p, i) => ({ id: i + 1, ...p })),
  orders: []
};

const clone = o => JSON.parse(JSON.stringify(o));

// เพิ่มรูปให้ข้อมูลเดิมครั้งเดียว โดยเก็บสินค้า ราคา รูปที่อัปโหลด และออเดอร์เดิมไว้
function addFlowerCatalog(d) {
  if (Number(d.catalog_version) >= FLOWER_CATALOG_VERSION) return false;
  const normalize = value => String(value || '').trim().toLowerCase();
  let nextId = [...d.products.map(p => p.id), ...d.orders.map(o => o.product_id)]
    .reduce((max, id) => Math.max(max, Number(id) || 0), 0) + 1;
  for (const flower of FLOWER_CATALOG) {
    const existing = d.products.find(p => p.catalog_key === flower.catalog_key ||
      normalize(p.name) === normalize(flower.name));
    if (existing) {
      if (!existing.image) existing.image = flower.image;
      existing.catalog_key = flower.catalog_key;
    } else {
      d.products.push({ id: nextId++, ...clone(flower) });
    }
  }
  d.catalog_version = FLOWER_CATALOG_VERSION;
  return true;
}

const Store = {
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(DB_KEY));
      if (d && typeof d === 'object' && !Array.isArray(d)) {
        const loaded = {
          ...d,
          settings: { ...DEFAULT_DATA.settings, ...(d.settings || {}) },
          products: Array.isArray(d.products) ? d.products : clone(DEFAULT_DATA.products),
          orders: Array.isArray(d.orders) ? d.orders : []
        };
        if (addFlowerCatalog(loaded)) {
          // ถ้าเบราว์เซอร์ปิดกั้นการบันทึก ยังแสดงรูปจากข้อมูลในหน่วยความจำได้
          try { localStorage.setItem(DB_KEY, JSON.stringify(loaded)); } catch (e) {}
        }
        return loaded;
      }
    } catch (e) { /* ข้อมูลเสีย ใช้ค่าเริ่มต้น */ }
    return clone(DEFAULT_DATA);
  },
  save(d) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(d));
      return true;
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: พื้นที่เก็บข้อมูลเต็ม\nลองลบรูปหรือสินค้าที่ไม่ใช้แล้ว แล้วบันทึกใหม่');
      return false;
    }
  },
  nextId: list => list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1
};

// ===== ตัวช่วยที่ใช้ร่วมกัน =====
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = n => '฿' + Number(n || 0).toLocaleString('th-TH');
const priceText = p => (Number(p) > 0 ? baht(p) : 'สอบถามราคา');
const isUrl = v => /^https?:\/\//i.test(v || '');

function toast(msg, ms = 3200) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}
