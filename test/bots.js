// Test-Bots, die einem Raum beitreten und zufällig mitspielen.
// Aufruf: node test/bots.js <RAUMCODE> [anzahl] [url]
import { io } from 'socket.io-client';
import { DUEMMSTE, QUIZ_CATEGORIES, FAMILIENDUELL } from '../server/data/index.js';

const [code, count = '3', url = 'http://localhost:3000'] = process.argv.slice(2);
if (!code) {
  console.log('Aufruf: node test/bots.js <RAUMCODE> [anzahl] [url]');
  process.exit(1);
}
const answers = new Map();
for (const q of DUEMMSTE) answers.set(q.q, q.a);
for (const c of QUIZ_CATEGORIES) for (const q of c.questions) answers.set(q.q, q.a);
const feud = new Map(FAMILIENDUELL.map((q) => [q.q, q.a]));
const names = ['Bot Berta', 'Bot Kalle', 'Bot Mia', 'Bot Otto', 'Bot Lina', 'Bot Theo', 'Bot Ida'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

for (let i = 0; i < Number(count); i++) {
  const s = io(url, { transports: ['websocket'] });
  const done = new Set();
  const once = (k) => (done.has(k) ? false : (done.add(k), true));
  const skill = 0.35 + Math.random() * 0.5;
  s.on('connect', () => s.emit('join', { code, name: names[i] }, (r) => console.log(names[i], r.error || 'beigetreten')));
  s.on('state', async (st) => {
    const g = st.game;
    if (!g || st.paused) return;
    const say = async (text) => {
      for (let k = 1; k <= text.length; k += 2) { s.emit('typing', { text: text.slice(0, k) }); await wait(90); }
      s.emit('act', { type: 'answer', text });
    };
    const right = () => Math.random() < skill;
    if (g.type === 'duemmste') {
      if (g.canAnswer && once(`a${g.current.q}`)) { await wait(rnd(1500, 4000)); say(right() ? answers.get(g.current.q) : 'weiß nicht'); }
      if (g.canVote && once(`v${g.round}${g.duel ? 'd' : ''}`)) {
        await wait(rnd(1500, 5000));
        const others = g.alive.filter((p) => p !== st.me.id);
        s.emit('act', { type: 'vote', target: others[Math.floor(Math.random() * others.length)] });
      }
    }
    if (g.type === 'quizduell') {
      if (g.canPick && once(`p${JSON.stringify(g.board.map((c) => c.cells.map((x) => x.used)))}`)) {
        await wait(rnd(1500, 3500));
        const free = [];
        g.board.forEach((c, ci) => c.cells.forEach((x, ri) => !x.used && free.push([ci, ri])));
        const [col, row] = free[Math.floor(Math.random() * free.length)];
        s.emit('act', { type: 'pick', col, row });
      }
      if (g.canAnswer && once(`a${g.cur.q}${g.cur.stage}`)) { await wait(rnd(3000, 7000)); say(right() ? answers.get(g.cur.q) : 'keine Ahnung'); }
      if (g.canBuzz && Math.random() < 0.4 && once(`b${g.cur.q}`)) { await wait(rnd(800, 2500)); s.emit('act', { type: 'buzz' }); }
    }
    if (g.type === 'familienduell') {
      if (g.canBuzz && once(`z${g.round}${g.faceoff?.attempt}`)) { await wait(rnd(1500, 4000)); s.emit('act', { type: 'buzz' }); }
      if (g.canAnswer) {
        const q = g.phase === 'final' ? g.final.rows[g.final.index].q : g.question?.q;
        if (once(`a${q}${g.phase}${g.strikes}${g.pot}`)) {
          await wait(rnd(2500, 6000));
          const list = feud.get(q) || [];
          const pick = list[Math.floor(Math.random() * list.length)];
          say(right() && pick ? pick.t : 'Quatsch');
        }
      }
    }
  });
}
