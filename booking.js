'use strict';
const crypto = require('crypto');

// หนึ่งออเดอร์ต่อรอบ ทั้งร้าน ใช้เวลาไทยเสมอ
const DELIVERY = Object.freeze({ timeZone: 'Asia/Bangkok', startHour: 9, endHour: 20, intervalMinutes: 60 });
const STATUSES = ['new', 'confirmed', 'done', 'cancelled'];
const pad = n => String(n).padStart(2, '0');
const timeText = minutes => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const SLOTS = [];
for (let minute = DELIVERY.startHour * 60; minute + DELIVERY.intervalMinutes <= DELIVERY.endHour * 60; minute += DELIVERY.intervalMinutes) {
  const time = timeText(minute), end = timeText(minute + DELIVERY.intervalMinutes);
  SLOTS.push({ time, end_time: end, label: `${time}–${end} น.` });
}
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const todayInBangkok = now => new Intl.DateTimeFormat('en-CA', {
  timeZone: DELIVERY.timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(now);
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = new Date(`${value}T00:00:00+07:00`);
  return Number.isFinite(stamp.getTime()) && todayInBangkok(stamp) === value;
}

class BookingError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const conflict = () => new BookingError(409, 'SLOT_TAKEN', 'วันและเวลานี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น');

function createBookingService(db, { now = () => new Date() } = {}) {
  // อัปเกรดฐานข้อมูลเดิมโดยไม่ลบออเดอร์เก่า ซึ่งยังไม่มีเวลา
  db.exec('PRAGMA busy_timeout = 5000');
  const columns = new Set(db.prepare('PRAGMA table_info(orders)').all().map(c => c.name));
  for (const [name, definition] of [
    ['delivery_time', "TEXT NOT NULL DEFAULT ''"],
    ['request_key', 'TEXT'], ['request_hash', 'TEXT']
  ]) if (!columns.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS orders_unique_delivery_slot
      ON orders(delivery_date, delivery_time)
      WHERE status <> 'cancelled' AND delivery_time <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS orders_unique_request_key
      ON orders(request_key) WHERE request_key IS NOT NULL;
  `);
  const occupied = db.prepare("SELECT id FROM orders WHERE delivery_date=? AND delivery_time=? AND status<>'cancelled'");
  const byKey = db.prepare('SELECT * FROM orders WHERE request_key=?');
  const byId = db.prepare('SELECT * FROM orders WHERE id=?');
  const insert = db.prepare(`INSERT INTO orders
    (customer,phone,product_id,product_name,price,delivery_date,delivery_time,address,note,status,request_key,request_hash,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,'new',?,?,?)`);

  function inTransaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function assertDate(date, clock) {
    if (!validDate(date)) throw new BookingError(400, 'INVALID_DATE', 'กรุณาเลือกวันที่จัดส่งให้ถูกต้อง');
    if (date < todayInBangkok(clock)) throw new BookingError(400, 'PAST_DATE', 'ไม่สามารถจองวันย้อนหลังได้');
  }
  function availability(inputDate) {
    const clock = now(), date = inputDate === undefined ? todayInBangkok(clock) : clean(inputDate, 20);
    assertDate(date, clock);
    const booked = new Set(db.prepare("SELECT delivery_time FROM orders WHERE delivery_date=? AND status<>'cancelled' AND delivery_time<>''").all(date).map(o => o.delivery_time));
    return {
      date, today: todayInBangkok(clock), time_zone: DELIVERY.timeZone,
      interval_minutes: DELIVERY.intervalMinutes,
      slots: SLOTS.map(slot => {
        const past = new Date(`${date}T${slot.time}:00+07:00`).getTime() <= clock.getTime();
        const reason = booked.has(slot.time) ? 'booked' : past ? 'past' : null;
        return { ...slot, available: !reason, reason };
      })
    };
  }
  function publicOrder(order, replayed = false) {
    const slot = SLOTS.find(s => s.time === order.delivery_time);
    return { id: order.id, product_name: order.product_name, price: order.price,
      delivery_date: order.delivery_date, delivery_time: order.delivery_time,
      delivery_end: slot?.end_time || '', status: order.status, replayed };
  }
  function reserve(body = {}) {
    const value = {
      customer: clean(body.customer, 100), phone: clean(body.phone, 20),
      product_id: Number(body.product_id), delivery_date: clean(body.delivery_date, 20),
      delivery_time: clean(body.delivery_time, 20), address: clean(body.address), note: clean(body.note)
    };
    if (!value.customer || !/^[0-9+\-\s]{9,20}$/.test(value.phone))
      throw new BookingError(400, 'INVALID_CUSTOMER', 'กรุณากรอกชื่อและเบอร์โทรให้ถูกต้อง');
    if (!Number.isSafeInteger(value.product_id) || value.product_id < 1)
      throw new BookingError(400, 'INVALID_PRODUCT', 'กรุณาเลือกสินค้าให้ถูกต้อง');
    const key = clean(body.request_key, 101);
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key))
      throw new BookingError(400, 'INVALID_REQUEST', 'กรุณาลองส่งคำขอจองใหม่อีกครั้ง');
    const hash = crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
    return inTransaction(() => {
      // คำขอเดิมที่ส่งซ้ำหลังเครือข่ายขาด ต้องได้เลขออเดอร์เดิม
      const existing = byKey.get(key);
      if (existing) {
        if (existing.request_hash !== hash) throw new BookingError(409, 'REQUEST_CHANGED', 'รายละเอียดคำขอเปลี่ยนไป กรุณาส่งคำขอใหม่');
        if (existing.status === 'cancelled') throw new BookingError(409, 'ORDER_CANCELLED', 'ออเดอร์นี้ถูกยกเลิกแล้ว กรุณาเลือกวันและเวลาใหม่');
        return publicOrder(existing, true);
      }
      const clock = now();
      assertDate(value.delivery_date, clock);
      if (!SLOTS.some(s => s.time === value.delivery_time))
        throw new BookingError(400, 'INVALID_TIME', 'กรุณาเลือกเวลาจัดส่งจากรอบที่เปิดให้บริการ');
      if (new Date(`${value.delivery_date}T${value.delivery_time}:00+07:00`).getTime() <= clock.getTime())
        throw new BookingError(400, 'PAST_TIME', 'เวลานี้ผ่านไปแล้ว กรุณาเลือกเวลาอื่น');
      const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(value.product_id);
      if (!product) throw new BookingError(400, 'INVALID_PRODUCT', 'สินค้านี้ไม่พร้อมรับออเดอร์ กรุณาเลือกใหม่');
      if (occupied.get(value.delivery_date, value.delivery_time)) throw conflict();
      const result = insert.run(value.customer, value.phone, product.id, product.name, product.price,
        value.delivery_date, value.delivery_time, value.address, value.note, key, hash, clock.toISOString());
      return publicOrder(byId.get(result.lastInsertRowid));
    });
  }
  function setStatus(id, status) {
    if (!STATUSES.includes(status)) throw new BookingError(400, 'INVALID_STATUS', 'สถานะไม่ถูกต้อง');
    return inTransaction(() => {
      const order = byId.get(id);
      if (!order) throw new BookingError(404, 'ORDER_NOT_FOUND', 'ไม่พบออเดอร์นี้');
      if (status !== 'cancelled' && order.delivery_time) {
        const taken = occupied.get(order.delivery_date, order.delivery_time);
        if (taken && taken.id !== order.id) throw conflict();
      }
      db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, id);
      return { ok: true };
    });
  }
  return { availability, reserve, setStatus };
}

module.exports = { createBookingService, BookingError, DELIVERY, SLOTS, STATUSES, todayInBangkok, validDate };
