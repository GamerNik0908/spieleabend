// Simulation: startet den Server und spielt ein Spiel mit Bots durch.
// Aufruf: node test/sim.js <quizduell|familienduell|duemmste> [anzahlSpieler]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import { DUEMMSTE, QUIZ_CATEGORIES, FAMILIENDUELL } from '../server/data/index.js';

const game = process.argv[2] || 'duemmste';
const n = Number(process.argv[3] || 4);
const PORT = 3900 + Math.floor(Math.random() * 90);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'spieleabend-'));
const URL = `http://localhost:${PORT}`;

const answers = new Map();
for (const q of DUEMMSTE) answers.set(q.q, q.a);
for (const c of QUIZ_CATEGORIES) for (const q of c.questions) answers.set(q.q, q.a);
const feud = new Map(FAMILIENDUELL.map((q) => [q.q, q.a]));

const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, DATA_DIR: DATA, ANTHROPIC_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
await new Promise((res) => server.stdout.on('data', (d) => d.toString().includes('läuft') && res()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(14, 19), ...a);
const announcements = [];

function bot(name, skill) {
  const s = io(URL, { transports: ['websocket'] });
  const b = { name, s, st: null, done: new Set(), skill };
  s.on('state', (st) => { b.st = st; });
  s.on('announce', (a) => { if (name === 'Anna') { announcements.push(a.text); log('📣', a.text, a.sub ? `(${a.sub})` : ''); } });
  s.on('toast', (t) => log(name, 'TOAST', t.text));
  b.emit = (ev, data) => new Promise((r) => s.emit(ev, data, (res) => r(res || {})));
  return b;
}

const bots = [];
const host = bot('Anna', 1);
await new Promise((r) => host.s.on('connect', r));
const { code } = await host.emit('create', { name: 'Anna' });
bots.push(host);
const names = ['Ben', 'Cleo', 'Dana', 'Emil', 'Finn', 'Gina', 'Hugo'];
for (let i = 0; i < n - 1; i++) {
  const b = bot(names[i], i % 2 === 0 ? 0.3 : 0.8);
  await new Promise((r) => b.s.on('connect', r));
  const res = await b.emit('join', { code, name: names[i] });
  if (res.error) throw new Error(res.error);
  bots.push(b);
}
log('Raum', code, 'mit', bots.length, 'Spielern');
const opx = (type, payload = {}) => host.emit('op', { type, ...payload }).then((r) => { if (r.error) log('OP-FEHLER', type, r.error); return r; });
await opx('setGame', { game });
if (game === 'duemmste') {
  await opx('setOption', { key: 'lives', value: 1 });
  await opx('setOption', { key: 'roundSeconds', value: 30 });
  await opx('setOption', { key: 'answerSeconds', value: 6 });
  await opx('setOption', { key: 'voteSeconds', value: 15 });
}
if (game === 'quizduell') {
  await opx('setOption', { key: 'rounds', value: 2 });
  await opx('setOption', { key: 'rows', value: 3 });
  await opx('setOption', { key: 'cols', value: 4 });
  await opx('setOption', { key: 'buzzSeconds', value: 3 });
}
if (game === 'familienduell') {
  await opx('setOption', { key: 'rounds', value: 2 });
  await opx('setOption', { key: 'finalQuestions', value: 2 });
  await opx('setOption', { key: 'buzzSeconds', value: 5 });
}
await sleep(200);
log('Teams:', JSON.stringify(host.st.teams?.map((t) => t.members.length)));
const r = await opx('start');
if (r.error) process.exit(1);

function feudGuess(q, skill) {
  const list = feud.get(q) || [];
  if (Math.random() < skill && list.length) {
    const a = list[Math.floor(Math.random() * list.length)];
    const variants = [a.t, ...(a.alt || [])];
    return variants[Math.floor(Math.random() * variants.length)].toLowerCase();
  }
  return 'quatschantwort';
}

let pausedOnce = false;
let overrideOnce = false;
const t0 = Date.now();
while (Date.now() - t0 < 6 * 60e3) {
  await sleep(250);
  const st = host.st;
  if (st.screen === 'results') {
    log('ERGEBNIS:', st.results.units.map((u) => `${u.rank}. ${u.label} (${u.score}, +${u.allTime})`).join(' | '));
    log('All-Time:', st.leaderboard.map((x) => `${x.name}:${x.points}`).join(', '));
    break;
  }
  // Pause einmal testen
  if (!pausedOnce && Date.now() - t0 > 8000) {
    pausedOnce = true;
    await opx('pause');
    await sleep(1500);
    const tv = host.st.game?.timers;
    log('Pause aktiv:', host.st.paused, 'Timer eingefroren:', JSON.stringify(Object.values(tv || {}).filter(Boolean).map((t) => t.paused)));
    await opx('resume');
  }
  for (const b of bots) {
    const g = b.st?.game;
    if (!g || b.st.paused) continue;
    const key = (k) => { if (b.done.has(k)) return false; b.done.add(k); return true; };
    if (game === 'duemmste') {
      if (g.canAnswer && key(`a-${g.current.q}-${g.round}`)) {
        const right = Math.random() < b.skill;
        b.emit('act', { type: 'answer', text: right ? answers.get(g.current.q) : 'keine ahnung' });
      }
      if (g.canVote && key(`v-${g.round}-${g.duel ? 'd' : ''}`)) {
        const others = g.alive.filter((p) => p !== b.st.me.id);
        b.emit('act', { type: 'vote', target: others[0] });
      }
    }
    if (game === 'quizduell') {
      if (g.canPick && key(`p-${g.round}-${JSON.stringify(g.board.map((c) => c.cells.map((x) => x.used)))}`)) {
        const free = [];
        g.board.forEach((c, ci) => c.cells.forEach((x, ri) => !x.used && free.push([ci, ri])));
        const [col, row] = free[Math.floor(Math.random() * free.length)];
        b.emit('act', { type: 'pick', col, row });
      }
      if (g.canAnswer && key(`a-${g.cur.q}-${g.cur.stage}`)) {
        const right = Math.random() < b.skill;
        const res = await b.emit('act', { type: 'answer', text: right ? answers.get(g.cur.q) : 'falsch geraten' });
        if (res.error) log(b.name, 'Antwort-Fehler', res.error);
      }
      if (g.canBuzz && Math.random() < 0.3 && key(`b-${g.cur.q}`)) b.emit('act', { type: 'buzz' });
    }
    if (game === 'familienduell') {
      if (g.canBuzz && key(`buzz-${g.round}-${g.faceoff?.attempt}`)) b.emit('act', { type: 'buzz' });
      if (g.canAnswer) {
        const q = g.phase === 'final' ? g.final.rows[g.final.index].q : g.question?.q;
        if (key(`a-${q}-${g.phase}-${g.strikes}-${g.pot}-${g.final?.index}`)) {
          b.emit('act', { type: 'answer', text: feudGuess(q, b.skill) });
        }
      }
    }
  }
  // Operator-Korrektur einmal testen
  if (!overrideOnce && game !== 'familienduell') {
    const g = host.st.game;
    const entry = game === 'quizduell' ? g?.log?.find((e) => !e.ok) : g?.feed?.find((e) => !e.ok);
    if (entry) {
      overrideOnce = true;
      await opx('game', { action: { type: 'override', id: entry.id, ok: true } });
    }
  }
  if (!overrideOnce && game === 'familienduell') {
    const g = host.st.game;
    if (g?.last && !g.last.ok && g.phase === 'play') {
      const free = g.opBoard?.findIndex((_, i) => !g.board[i]?.open);
      if (free >= 0) {
        overrideOnce = true;
        await opx('game', { action: { type: 'assign', index: free } });
      }
    }
  }
}
if (host.st.screen !== 'results') log('⚠️ Kein Ergebnis nach Zeitlimit. Phase:', host.st.game?.phase);
log('Einblendungen gesamt:', announcements.length);
for (const b of bots) b.s.close();
server.kill();
fs.rmSync(DATA, { recursive: true, force: true });
process.exit(host.st.screen === 'results' ? 0 : 1);
