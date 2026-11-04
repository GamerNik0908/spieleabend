// Simulation: startet den Server und spielt ein Spiel mit Bots durch.
// Aufruf: node test/sim.js <quizduell|familienduell|duemmste> [anzahlSpieler]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import { DUEMMSTE, QUIZ_CATEGORIES, FAMILIENDUELL, SCHAETZEN, EMOJI } from '../server/data/index.js';
const emojiAnswers = new Map(EMOJI.map((r) => [r.e, r.a]));
const schaetz = new Map(SCHAETZEN.map((q) => [q.q, q.a]));
let currentWord = null;

// „verhoer:teams“ = Verhör im Team-Modus
const [game, variant] = (process.argv[2] || 'duemmste').split(':');
const n = Number(process.argv[3] || 4);
const PORT = 3900 + Math.floor(Math.random() * 90);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'spieleabend-'));
const URL = `http://localhost:${PORT}`;

const answers = new Map();
for (const q of DUEMMSTE) answers.set(q.q, q.a);
for (const c of QUIZ_CATEGORIES) for (const q of c.questions) answers.set(q.q, q.a);
const feud = new Map(FAMILIENDUELL.map((q) => [q.q, q.a]));

const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, DATA_DIR: DATA, ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
await new Promise((res) => server.stdout.on('data', (d) => d.toString().includes('läuft') && res()));

const pick2 = (arr) => arr[Math.floor(Math.random() * arr.length)];
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
const fast = {
  montagsmaler: { drawSeconds: 30, choiceSeconds: 5 },
  luegenbaron: { rounds: 3, writeSeconds: 20, voteSeconds: 10 },
  spion: { rounds: 2, clueRounds: 1, clueSeconds: 10, voteSeconds: 20, guessSeconds: 10 },
  witzbold: { rounds: 1, answerSeconds: 30, voteSeconds: 10 },
  schaetzen: { rounds: 4, answerSeconds: 10 },
  gleichdenker: { rounds: 4, answerSeconds: 10 },
  werwars: { rounds: 3, answerSeconds: 20, guessSeconds: 20 },
  minderheit: { rounds: 4, voteSeconds: 8 },
  verhoer: { rounds: 2, maxQuestions: 6, roundSeconds: 90, turnSeconds: 15, teamMode: variant === 'teams' },
  auktion: { rounds: 4, bidSeconds: 15, answerSeconds: 10 },
  zeitstrahl: { lines: 2, turns: 2, turnSeconds: 15, betSeconds: 5 },
  emoji: { rounds: 4, answerSeconds: 16 },
}[game] || {};
for (const [key, value] of Object.entries(fast)) await opx('setOption', { key, value });
if (process.env.AUTO) await opx('setRoom', { manualAdvance: false });
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
let advances = 0;
let overrideOnce = false;
const t0 = Date.now();
while (Date.now() - t0 < 6 * 60e3) {
  await sleep(250);
  const st = host.st;
  if (process.env.DEBUG && Date.now() % 5000 < 260) log('Phase:', st.game?.phase, 'paused', st.paused, JSON.stringify(st.game?.timers), JSON.stringify(bots.map((b) => [b.name, b.st?.game?.canClue, b.st?.game?.canVote])));
  if (st.screen === 'results') {
    log('ERGEBNIS:', st.results.units.map((u) => `${u.rank}. ${u.label} (${u.score}, +${u.allTime})`).join(' | '));
    log('All-Time:', st.leaderboard.map((x) => `${x.name}:${x.points}`).join(', '));
    break;
  }
  // Klick-Modus: Operator drückt „Weiter“, sobald das Spiel wartet
  if (st.waiting && !st.paused) { advances++; await opx('advance'); }
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
  for (const b of bots) {
    const g = b.st?.game;
    if (!g || b.st.paused) continue;
    const key = (k) => { if (b.done.has(k)) return false; b.done.add(k); return true; };
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (g.type === 'montagsmaler') {
      if (g.choices && key(`c${g.turn}`)) b.emit('act', { type: 'choose', idx: 0 });
      if (g.isDrawer && g.word) {
        currentWord = g.word;
        if (key(`d${g.turnId}`)) b.s.emit('canvas', { t: 'seg', s: 'a1', c: '#ff0000', w: 6, p: [[0.1, 0.1], [0.5, 0.5], [0.9, 0.2]] });
      }
      if (g.canGuess && key(`g${g.turnId}-${Math.floor(Date.now() / 3000)}`)) {
        b.emit('act', { type: 'answer', text: Math.random() < b.skill * 0.6 && currentWord ? currentWord : pick(['Haus', 'Baum', 'Auto', 'Katze']) });
      }
    }
    if (g.type === 'luegenbaron') {
      if (g.canWrite && !g.myLie && key(`w${g.round}`)) b.emit('act', { type: 'answer', text: `${b.name}s Lüge ${g.round}` }).then((r) => r.error && log(b.name, r.error));
      if (g.canVote && key(`v${g.round}`)) { const o = g.options.filter((x) => !x.mine); b.emit('act', { type: 'vote', id: pick(o).id }); }
    }
    if (g.type === 'spion') {
      if (g.canClue && key(`c${g.round}-${g.clues.length}`)) b.emit('act', { type: 'answer', text: `hinweis${Math.floor(Math.random() * 99)}` }).then((r) => r.error && log(b.name, r.error));
      if (g.canVote && key(`v${g.round}`)) b.emit('act', { type: 'vote', target: pick(g.players.filter((p) => p !== b.st.me.id)) });
      if (g.canGuess && key(`s${g.round}`)) b.emit('act', { type: 'answer', text: pick(g.catWords) });
    }
    if (g.type === 'witzbold') {
      for (const m of g.mine) if (!m.answer && key(`a${g.round}-${m.id}`)) b.emit('act', { type: 'answer', promptId: m.id, text: `${b.name} sagt was Lustiges ${m.id}` });
      if (g.match && g.phase === 'vote' && !g.match.inPair && g.match.myVote == null && key(`v${g.round}-${g.match.no}`)) b.emit('act', { type: 'vote', side: Math.random() < 0.5 ? 0 : 1 });
      if (g.phase === 'finalAnswer' && !g.final.myAnswer && key('fa')) b.emit('act', { type: 'answer', text: `Finale von ${b.name}` });
      if (g.phase === 'finalVote' && g.final.myVote == null && key('fv')) { const idx = g.final.answers.map((_, i) => i).filter((i) => i !== g.final.mineIdx); b.emit('act', { type: 'vote', side: pick(idx) }); }
    }
    if (g.type === 'gleichdenker' && g.canAnswer && !g.myAnswer && key(`gd${g.round}`)) b.emit('act', { type: 'answer', text: pick(['Erdbeere', 'Erdbeeren', 'Kiwi', 'Mango']) });
    if (g.type === 'schaetzen' && g.canGuess && g.myGuess == null && key(`e${g.round}`)) {
      const a = schaetz.get(g.q) || 100;
      b.emit('act', { type: 'answer', text: String(Math.round(a * (0.5 + Math.random()))) });
    }
  }
  // Neue Spiele
  for (const b of bots) {
    const g = b.st?.game;
    if (!g || b.st.paused) continue;
    const key = (k) => { if (b.done.has(k)) return false; b.done.add(k); return true; };
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (g.type === 'werwars') {
      if (g.canAnswer && !g.myAnswer && !g.passed && key(`a${g.round}${g.q}`)) {
        if (b.name === 'Dana') b.emit('act', { type: 'pass' }); else b.emit('act', { type: 'answer', text: `Antwort von ${b.name}` });
      }
      if (g.canGuess && key(`g${g.round}`)) {
        for (const e of g.list.filter((x) => !x.mine)) await b.emit('act', { type: 'guess', id: e.id, target: pick(g.authors.filter((p) => p !== b.st.me.id)) });
        b.emit('act', { type: 'done' });
      }
    }
    if (g.type === 'minderheit' && g.canVote && g.myVote == null && key(`v${g.round}`)) b.emit('act', { type: 'vote', idx: Math.floor(Math.random() * g.options.length) });
    if (g.type === 'verhoer' && g.canAct && key(`q${g.round}-${g.questions.length}-${Math.floor(Date.now() / 2500)}`)) {
      if (Math.random() < 0.25) b.emit('act', { type: 'solve', text: pick(['Giraffe', 'Eiffelturm', 'Pizza', 'Auto']) });
      else b.emit('act', { type: 'ask', text: pick(['Ist es ein Tier?', 'Kann man es essen?', 'Ist es größer als ein Auto?', 'Lebt es noch?']) }).then((r) => r.error && log(b.name, r.error));
    }
    if (g.type === 'auktion') {
      if (g.canBid && key(`b${g.round}`)) { await b.emit('act', { type: 'bid', amount: pick([0, 100, 250, 400]) }); b.emit('act', { type: 'lock' }); }
      if (g.canBid && key(`c${g.round}`)) b.emit('act', { type: 'chat', text: `${b.name}: bieten wir was?` });
      if (g.canAnswer && key(`a${g.round}`)) b.emit('act', { type: 'answer', text: Math.random() < b.skill ? answers.get(g.q) || 'weiß nicht' : 'keine ahnung' });
    }
    if (g.type === 'zeitstrahl') {
      if (g.canPlace && key(`p${g.line}-${g.turnNo}`)) b.emit('act', { type: 'place', cardId: g.offer[0].id, gap: Math.floor(Math.random() * (g.cards.length + 1)) });
      if (g.canBet && key(`b${g.line}-${g.turnNo}`)) b.emit('act', { type: 'bet', ok: Math.random() < 0.5 });
    }
    if (g.type === 'emoji' && g.canGuess && key(`e${g.round}-${Math.floor(Date.now() / 3000)}`)) {
      b.emit('act', { type: 'answer', text: Math.random() < b.skill * 0.5 ? emojiAnswers.get(g.e) : pick(['Titanic', 'Hund', 'Batman']) });
    }
  }
  // Operator der neuen Spiele: Fragen ohne KI beantworten, je eine Korrektur testen
  {
    const g = host.st.game;
    if (g?.type === 'verhoer') for (const q of g.questions.filter((x) => x.pending && !x.solve)) await opx('game', { action: { type: 'setAnswer', id: q.id, answer: pick2(['ja', 'nein', 'teilweise']) } });
    if (!overrideOnce && g) {
      const t = g.type, ph = g.phase;
      let action = null;
      if (t === 'werwars' && ph === 'reveal' && g.list.length) action = { type: 'exclude', id: g.list[0].id };
      if (t === 'minderheit' && ph === 'reveal') action = { type: 'setVote', pid: host.st.me.id, idx: 0 };
      if (t === 'zeitstrahl' && ph === 'result') action = { type: 'flip' };
      if (t === 'auktion' && ph === 'result') action = { type: 'override', ok: !g.result?.ok };
      if (t === 'emoji' && ph === 'guess') { const c = g.chat.find((x) => x.kind === 'guess' && !g.solved[x.pid]); if (c) action = { type: 'accept', id: c.id }; }
      if (t === 'verhoer' && ph === 'result') action = { type: 'undoWin' };
      if (action) { overrideOnce = true; log('Operator-Korrektur:', JSON.stringify(action)); await opx('game', { action }); }
    }
  }
  // Operator-Korrektur einmal testen
  if (!overrideOnce && ['quizduell', 'duemmste'].includes(game)) {
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
log('Einblendungen gesamt:', announcements.length, '· Weiter-Klicks:', advances);
// Highlight-Rückblick bauen und prüfen
if (host.st.screen === 'results') {
  log('Momente gesammelt:', host.st.moments);
  await opx('loud', { t: Date.now() - 20000, level: 2 });
  await opx('recapBuild');
  for (let i = 0; i < 40 && !['ready', 'empty', 'error'].includes(host.st.recap?.status); i++) await sleep(250);
  const full = await host.emit('recap:get');
  log('Rückblick:', host.st.recap?.status, '·', full?.items?.length || 0, 'Highlights ·', (full?.awards || []).map((x) => `${x.icon} ${x.title}: ${x.name}`).join(', '));
  for (const it of (full?.items || []).slice(0, 4)) log('  ', it.kind, '|', it.caption, '|', it.text);
  await opx('recapGo', { idx: 1 });
  await sleep(300);
  if (!host.st.recap?.item) log('⚠️ Folie fehlt im Zustand');
}
for (const b of bots) b.s.close();
server.kill();
fs.rmSync(DATA, { recursive: true, force: true });
process.exit(host.st.screen === 'results' ? 0 : 1);
