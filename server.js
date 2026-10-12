const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { FLOWER_CATALOG_VERSION, FLOWER_CATALOG } = require('./catalog.js');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme123';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

// ---------- Database ----------
const db = new Database(path.join(__dirname, 'data', 'shop.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT,
  price REAL DEFAULT 0, description TEXT, image TEXT DEFAULT '',
  featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer TEXT, phone TEXT,
  product_id INTEGER, product_name TEXT, price REAL, delivery_date TEXT,
  address TEXT, note TEXT, status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`);

const DEFAULTS = {
  shop_name: 'Mine Flowers',
  hero_title: 'ดอกไม้ทุกช่อ จัดด้วยหัวใจ',
  hero_subtitle: 'ช่อดอกไม้สด งานประณีต สำหรับทุกโอกาสพิเศษของคุณ',
  phone: '0982650311', line_url: 'https://lin.ee/tYR5PFj', address: '31 หมู่ที่9 ถ. พหลโยธิน ตำบล คลองหนึ่ง อำเภอคลองหลวง ปทุมธานี 12120', open_hours: 'ทุกวัน 09:00 – 22:00',
  facebook: 'https://www.facebook.com/MineFlowerZ/',
  instagram: 'https://www.instagram.com/mine_flowerz/',
  tiktok: 'https://www.tiktok.com/@mine.flower5'
};
const insSet = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
for (const [k, v] of Object.entries(DEFAULTS)) insSet.run(k, v);

// เพิ่มแค็ตตาล็อกพร้อมรูปครั้งเดียว ไม่ทับสินค้าหรือรูปที่ร้านแก้ไว้แล้ว
const catalogVersion = db.prepare('SELECT value FROM settings WHERE key=?').get('flower_catalog_version');
if (Number(catalogVersion?.value || 0) < FLOWER_CATALOG_VERSION) {
  const find = db.prepare('SELECT id,image FROM products WHERE name=? COLLATE NOCASE');
  const insert = db.prepare('INSERT INTO products(name,category,price,description,image,featured,active) VALUES(?,?,?,?,?,?,?)');
  const setImage = db.prepare('UPDATE products SET image=? WHERE id=?');
  db.transaction(() => {
    for (const p of FLOWER_CATALOG) {
      const existing = find.get(p.name);
      if (existing) {
        if (!existing.image) setImage.run(p.image, existing.id);
      } else {
        insert.run(p.name, p.category, p.price, p.description, p.image, p.featured ? 1 : 0, p.active ? 1 : 0);
      }
    }
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run('flower_catalog_version', String(FLOWER_CATALOG_VERSION));
  })();
}

const getSettings = () =>
  Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));

// ---------- Upload ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))
});
const removeFile = p => {
  if (p && p.startsWith('/uploads/')) fs.unlink(path.join(UPLOAD_DIR, path.basename(p)), () => {});
};

// ---------- App ----------
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
// ชุดไฟล์นี้วางหน้าเว็บไว้ที่รากโปรเจกต์ เพื่อใช้กับ GitHub Pages ได้ด้วย
// เปิดให้เข้าถึงเฉพาะไฟล์หน้าเว็บ ไม่เปิด server.js หรือฐานข้อมูล
const frontendFiles = ['index.html', 'admin.html', 'catalog.js', 'script.js', 'app.js', 'admin.js', 'style.css', 'admin.css'];
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
for (const file of frontendFiles) {
  app.get('/' + file, (req, res) => res.sendFile(path.join(__dirname, file)));
}
app.use('/images', express.static(path.join(__dirname, 'images'), { maxAge: '30d' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));

const auth = (req, res, next) => req.session.admin ? next() : res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);

// ---------- Public API ----------
app.get('/api/settings', (req, res) => res.json(getSettings()));

app.get('/api/products', (req, res) => res.json(
  db.prepare('SELECT id,name,category,price,description,image,featured FROM products WHERE active=1 ORDER BY featured DESC, id DESC').all()
));

app.post('/api/orders', (req, res) => {
  const b = req.body || {};
  const customer = clean(b.customer, 100), phone = clean(b.phone, 20);
  if (!customer || !/^[0-9+\-\s]{9,20}$/.test(phone))
    return res.status(400).json({ error: 'กรุณากรอกชื่อและเบอร์โทรให้ถูกต้อง' });
  const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(Number(b.product_id));
  if (!p) return res.status(400).json({ error: 'ไม่พบสินค้านี้' });
  const r = db.prepare(`INSERT INTO orders(customer,phone,product_id,product_name,price,delivery_date,address,note)
    VALUES(?,?,?,?,?,?,?,?)`).run(customer, phone, p.id, p.name, p.price,
    clean(b.delivery_date, 20), clean(b.address), clean(b.note));
  res.json({ id: r.lastInsertRowid });
});

// ---------- Auth ----------
const fails = {};
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  let f = fails[ip] || { n: 0, t: 0 };
  if (Date.now() - f.t > 15 * 60 * 1000) f = { n: 0, t: 0 };
  if (f.n >= 5) return res.status(429).json({ error: 'ใส่รหัสผิดหลายครั้ง กรุณารอ 15 นาที' });
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    delete fails[ip]; req.session.admin = true; return res.json({ ok: true });
  }
  fails[ip] = { n: f.n + 1, t: Date.now() };
  res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ admin: !!req.session.admin }));

// ---------- Admin API ----------
app.get('/api/admin/stats', auth, (req, res) => {
  const one = sql => db.prepare(sql).get().v;
  res.json({
    today: one(`SELECT COUNT(*) v FROM orders WHERE date(created_at,'localtime')=date('now','localtime')`),
    pending: one(`SELECT COUNT(*) v FROM orders WHERE status='new'`),
    revenue: one(`SELECT COALESCE(SUM(price),0) v FROM orders WHERE status IN('confirmed','done')
                  AND strftime('%Y-%m',created_at,'localtime')=strftime('%Y-%m','now','localtime')`),
    products: one(`SELECT COUNT(*) v FROM products WHERE active=1`),
    recent: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 5').all()
  });
});

app.get('/api/admin/products', auth, (req, res) =>
  res.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all()));

const productData = b => [clean(b.name, 120), clean(b.category, 60), Math.max(0, Number(b.price) || 0),
  clean(b.description, 1000), b.featured ? 1 : 0, b.active ? 1 : 0];

app.post('/api/admin/products', auth, upload.single('image'), (req, res) => {
  const d = productData(req.body);
  if (!d[0]) return res.status(400).json({ error: 'กรุณาใส่ชื่อสินค้า' });
  const image = req.file ? '/uploads/' + req.file.filename : '';
  const r = db.prepare('INSERT INTO products(name,category,price,description,featured,active,image) VALUES(?,?,?,?,?,?,?)').run(...d, image);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/admin/products/:id', auth, upload.single('image'), (req, res) => {
  const old = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  const d = productData(req.body);
  if (!d[0]) return res.status(400).json({ error: 'กรุณาใส่ชื่อสินค้า' });
  let image = old.image;
  if (req.file) { removeFile(old.image); image = '/uploads/' + req.file.filename; }
  db.prepare('UPDATE products SET name=?,category=?,price=?,description=?,featured=?,active=?,image=? WHERE id=?').run(...d, image, old.id);
  res.json({ ok: true });
});

app.delete('/api/admin/products/:id', auth, (req, res) => {
  const p = db.prepare('SELECT image FROM products WHERE id=?').get(req.params.id);
  if (p) { removeFile(p.image); db.prepare('DELETE FROM products WHERE id=?').run(req.params.id); }
  res.json({ ok: true });
});

const STATUSES = ['new', 'confirmed', 'done', 'cancelled'];
app.get('/api/admin/orders', auth, (req, res) => {
  const s = req.query.status;
  res.json(STATUSES.includes(s)
    ? db.prepare('SELECT * FROM orders WHERE status=? ORDER BY id DESC').all(s)
    : db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all());
});
app.patch('/api/admin/orders/:id', auth, (req, res) => {
  if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/orders/:id', auth, (req, res) => {
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id); res.json({ ok: true });
});

app.put('/api/admin/settings', auth, (req, res) => {
  const up = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  db.transaction(() => {
    for (const k of Object.keys(DEFAULTS)) if (k in req.body) up.run(k, clean(req.body[k]));
  })();
  res.json({ ok: true });
});

app.use((err, req, res, next) =>
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์รูปใหญ่เกิน 5MB' : 'เกิดข้อผิดพลาด' }));

app.listen(PORT, () =>
  console.log(`หน้าเว็บ: http://localhost:${PORT}  |  หลังบ้าน: http://localhost:${PORT}/admin.html`));
