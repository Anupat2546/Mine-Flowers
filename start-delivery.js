'use strict';
// ตัวเปิดใหม่: server.js และไฟล์ต้นฉบับทุกไฟล์ยังเหมือนเดิม
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { fork } = require('node:child_process');
const express = require('express');
const Database = require('better-sqlite3');
const { createDeliveryService } = require('./delivery-addon/service');

function backendRequest(backendPort, route, cookie = '') {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: backendPort, path: route, headers: { cookie }, timeout: 3000 }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Backend timeout')));
    req.on('error', reject);
  });
}

async function startDelivery({ port = Number(process.env.PORT || 3000), host = process.env.HOST || '0.0.0.0', root = __dirname } = {}) {
  // เปิด server.js เดิมบน loopback เท่านั้น ลูกค้าภายนอกเข้าผ่านตัวตรวจคิวเสมอ
  const child = fork(path.join(root, 'delivery-addon', 'legacy-host.js'), [], {
    cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc']
  });
  const backendReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('รอเซิร์ฟเวอร์เดิมนานเกินกำหนด')), 15000);
    const finish = fn => value => { clearTimeout(timeout); fn(value); };
    child.once('error', finish(reject));
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('เซิร์ฟเวอร์เดิมเปิดไม่สำเร็จ')); });
    child.once('message', finish(message => {
      if (Number.isInteger(message.port) && message.port > 0) resolve(message.port);
      else reject(new Error('เซิร์ฟเวอร์เดิมไม่พร้อมใช้งาน'));
    }));
  });
  let db, server, closing = false;
  const removeExitHook = () => process.removeListener('exit', stopChild);
  const stopChild = () => { if (child.exitCode === null) child.kill(); };
  process.once('exit', stopChild);
  async function close() {
    if (closing) return;
    closing = true;
    if (server) {
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closed;
    }
    if (db?.open) db.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited;
      clearTimeout(force);
    }
    removeExitHook();
  }
  try {
    const backendPort = await backendReady;
    db = new Database(path.join(root, 'data', 'delivery-bookings.db'));
    const service = createDeliveryService(db);
    const app = express();
    const addon = path.join(root, 'delivery-addon');
    const noCache = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
    app.use(['/api/delivery-slots', '/api/orders', '/api/delivery-admin'], noCache);
    const json = express.json({ limit: '20kb' });
    const handle = fn => (req, res, next) => { try { fn(req, res); } catch (error) { next(error); } };
    app.get('/api/delivery-slots', handle((req, res) => res.json(service.availability(req.query.date))));
    // ทั้ง URL เดิมและ URL เสริมผ่านการตรวจคิวเดียวกัน
    app.post(['/api/orders', '/api/delivery-bookings'], noCache, json, handle((req, res) => {
      const order = service.reserve(req.body);
      res.status(order.replayed ? 200 : 201).json(order);
    }));
    const admin = async (req, res, next) => {
      try {
        const result = await backendRequest(backendPort, '/api/me', req.headers.cookie);
        if (!result.data.admin) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
        next();
      } catch (error) { next(error); }
    };
    app.get('/api/delivery-admin/bookings', admin, handle((req, res) => res.json(service.list())));
    app.patch('/api/delivery-admin/bookings/:id', admin, json, handle((req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'เลขคิวไม่ถูกต้อง' });
      res.json(service.setStatus(id, req.body.status));
    }));
    app.get(['/','/index.html','/admin.html'], (req, res, next) => {
      const adminPage = req.path === '/admin.html';
      const filename = adminPage ? 'admin.html' : 'index.html';
      fs.readFile(path.join(root, filename), 'utf8', (error, html) => {
        if (error) return next(error);
        // แทรกใน HTTP response เท่านั้น ไม่มีการเขียนทับไฟล์ HTML เดิม
        const injection = adminPage
          ? '<script src="/delivery-addon/admin-link.js"></script>'
          : '<link rel="stylesheet" href="/delivery-addon/customer.css"><script src="/delivery-addon/customer.js"></script>';
        res.set('Cache-Control', 'no-store').type('html').send(html.replace(/<\/body>/i, injection + '\n</body>'));
      });
    });
    for (const file of ['customer.js', 'customer.css', 'admin-link.js', 'admin.html', 'admin.js', 'admin.css']) {
      app.get('/delivery-addon/' + file, noCache, (req, res) => res.sendFile(path.join(addon, file)));
    }
    // API, รูป, สินค้า, ตั้งค่า และหน้าอื่น ๆ ใช้เซิร์ฟเวอร์เดิมโดยตรง
    app.use((req, res) => {
      const proxy = http.request({ hostname: '127.0.0.1', port: backendPort, path: req.originalUrl, method: req.method,
        headers: { ...req.headers, host: 'localhost' }, timeout: 15000 }, upstream => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
        upstream.on('error', () => res.destroy());
      });
      proxy.on('timeout', () => proxy.destroy(new Error('Backend timeout')));
      proxy.on('error', () => {
        if (!res.headersSent) res.status(502).json({ error: 'เชื่อมต่อร้านไม่สำเร็จ กรุณาลองอีกครั้ง' });
        else res.destroy();
      });
      req.on('aborted', () => proxy.destroy());
      req.pipe(proxy);
    });
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      const busy = error.code === 'SQLITE_BUSY';
      res.status(error.status || (busy ? 503 : 500)).json({ code: error.code || 'DELIVERY_ERROR',
        error: error.status ? error.message : busy ? 'ระบบกำลังรับจอง กรุณาลองอีกครั้ง' : 'บันทึกคิวไม่สำเร็จ กรุณาลองอีกครั้ง' });
    });
    server = await new Promise((resolve, reject) => {
      const instance = app.listen(port, host, () => resolve(instance));
      instance.once('error', reject);
    });
    child.once('exit', () => { if (!closing) { console.error('เซิร์ฟเวอร์เดิมหยุดทำงาน'); void close(); } });
    return { server, db, service, close };
  } catch (error) { await close(); throw error; }
}

if (require.main === module) {
  startDelivery().then(runtime => {
    console.log(`ร้านพร้อมรับจอง: http://localhost:${runtime.server.address().port}`);
    console.log(`คิวส่งออนไลน์: http://localhost:${runtime.server.address().port}/delivery-addon/admin.html`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void runtime.close(); });
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { startDelivery };
