// Spieleabend-Server: liefert die Website aus und hält die Räume per Socket.IO synchron.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room } from './room.js';
import { handleOp } from './operator.js';
import * as store from './store.js';
import { catalogStats } from './data/index.js';
import { aiEnabled } from './aijudge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.PORT || 3000);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6, pingInterval: 10000, pingTimeout: 8000 });

// Frontend-Bibliotheken direkt aus node_modules (kein Build-Schritt nötig)
const nm = path.join(root, 'node_modules');
const vendor = {
  'preact.mjs': path.join(nm, 'preact/dist/preact.module.js'),
  'hooks.mjs': path.join(nm, 'preact/hooks/dist/hooks.module.js'),
  'htm.mjs': path.join(nm, 'htm/dist/htm.module.js'),
};
app.get('/vendor/:file', (req, res) => {
  const f = vendor[req.params.file];
  if (!f) return res.sendStatus(404);
  res.type('application/javascript').sendFile(f, { maxAge: '1d' });
});
app.use(express.static(path.join(root, 'public'), { maxAge: 0 }));
app.use('/uploads', express.static(store.UPLOAD_DIR, { maxAge: '7d' }));

const rooms = new Map();

function operatorFromReq(req) {
  const room = rooms.get(String(req.get('x-room') || '').toUpperCase());
  const p = room?.byToken(req.get('x-token'));
  if (!p || !room.isOperator(p.id)) return null;
  return { room, p };
}

app.post('/api/upload', express.raw({ type: 'image/*', limit: '12mb' }), (req, res) => {
  const op = operatorFromReq(req);
  if (!op) return res.status(403).json({ error: 'Nur der Operator darf Bilder hochladen.' });
  try {
    const label = decodeURIComponent(req.get('x-label') || '').slice(0, 60);
    const id = store.addImage(req.body, req.get('content-type'), label);
    op.room.changed();
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/backup', (req, res) => {
  if (!operatorFromReq(req)) return res.status(403).json({ error: 'Nur der Operator' });
  res.json(store.exportBackup());
});

app.post('/api/restore', express.json({ limit: '300mb' }), (req, res) => {
  const op = operatorFromReq(req);
  if (!op) return res.status(403).json({ error: 'Nur der Operator' });
  try {
    store.importBackup(req.body);
    op.room.opAnnounce(op.p.id, 'hat ein Backup eingespielt 💾');
    op.room.changed();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, rooms: rooms.size, ai: aiEnabled(), ...catalogStats() }));

// ---------- Räume ----------
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (;;) {
    const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

function safe(socket, fn, cb) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      res.catch((err) => {
        console.error(err);
        socket.emit('toast', { text: err.message, kind: 'error' });
      });
    }
    cb?.({ ok: true, ...(res && !res.then ? res : {}) });
  } catch (err) {
    if (!(err instanceof Error) || err.name !== 'Error') console.error(err);
    cb?.({ error: err.message });
  }
}

io.on('connection', (socket) => {
  const room = () => rooms.get(socket.data.room);
  const pid = () => socket.data.playerId;

  const leaveCurrent = () => {
    const r = room();
    if (r) { r.detach(socket); socket.leave(r.code); }
  };

  socket.on('create', (data, cb) => safe(socket, () => {
    leaveCurrent();
    const r = new Room(newCode(), io);
    rooms.set(r.code, r);
    const p = r.addPlayer(data?.name, socket);
    r.rebuildTeams();
    return { code: r.code, token: p.token };
  }, cb));

  socket.on('join', (data, cb) => safe(socket, () => {
    const r = rooms.get(String(data?.code || '').trim().toUpperCase());
    if (!r) throw new Error('Raum nicht gefunden. Code prüfen!');
    leaveCurrent();
    const p = r.addPlayer(data?.name, socket);
    io.to(r.code).emit('toast', { text: `👋 ${p.name} ist dabei` });
    return { code: r.code, token: p.token };
  }, cb));

  socket.on('resume', (data, cb) => safe(socket, () => {
    const r = rooms.get(String(data?.code || '').toUpperCase());
    const p = r?.byToken(data?.token);
    if (!p) throw new Error('Sitzung abgelaufen');
    leaveCurrent();
    r.attach(p, socket);
    return { code: r.code, token: p.token };
  }, cb));

  socket.on('leave', (_, cb) => safe(socket, () => {
    const r = room();
    if (!r) return {};
    const id = pid();
    const n = r.name(id);
    r.removePlayer(id);
    io.to(r.code).emit('toast', { text: `🚪 ${n} hat den Raum verlassen` });
    return {};
  }, cb));

  socket.on('act', (a, cb) => safe(socket, () => {
    const r = room();
    if (!r?.game) throw new Error('Kein Spiel aktiv.');
    if (r.paused) throw new Error('Das Spiel ist pausiert.');
    const res = r.game.act(pid(), a || {});
    r.changed();
    return res;
  }, cb));

  socket.on('typing', (data) => {
    const r = room();
    if (!r?.game?.canType?.(pid())) return;
    r.typing = { pid: pid(), text: String(data?.text || '').slice(0, 120) };
    socket.to(r.code).emit('typing', r.typing);
  });

  socket.on('op', (a, cb) => safe(socket, () => {
    const r = room();
    if (!r) throw new Error('Kein Raum');
    handleOp(r, pid(), a || {});
  }, cb));

  socket.on('ping-time', (_, cb) => cb?.(Date.now()));

  socket.on('disconnect', () => room()?.detach(socket));
});

setInterval(() => {
  for (const r of rooms.values()) r.tick();
}, 100);

// Leere Räume nach 12 Stunden aufräumen
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const anyone = [...r.players.values()].some((p) => p.connected);
    if (!anyone && now - r.lastActivity > 12 * 3600e3) rooms.delete(code);
  }
}, 600e3);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    store.flush();
    process.exit(0);
  });
}

server.listen(PORT, () => {
  const s = catalogStats();
  console.log(`\n🎲 Spieleabend läuft auf http://localhost:${PORT}`);
  console.log(`   Fragen: ${s.duemmste} Dümmste · ${s.quizduell} Quiz Duell (${s.quizKategorien} Kategorien) · ${s.familienduell} Familien-Duell`);
  console.log(`   KI-Richter: ${aiEnabled() ? 'AN' : 'aus (ANTHROPIC_API_KEY nicht gesetzt)'}`);
  console.log(`   Daten: ${store.DATA_DIR}\n`);
});
