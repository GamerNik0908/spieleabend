// Test-Bots, die einem Raum beitreten und zufällig mitspielen.
// Aufruf: node test/bots.js <RAUMCODE> [anzahl] [url]
import { io } from 'socket.io-client';
import { DUEMMSTE, QUIZ_CATEGORIES, FAMILIENDUELL, SCHAETZEN } from '../server/data/index.js';
const schaetz = new Map(SCHAETZEN.map((q) => [q.q, q.a]));
let currentWord = null;

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
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (g.type === 'montagsmaler') {
      if (g.choices && once(`c${g.turn}`)) { await wait(rnd(1500, 3000)); s.emit('act', { type: 'choose', idx: Math.floor(Math.random() * 3) }); }
      if (g.isDrawer && g.word && g.phase === 'draw' && once(`d${g.turnId}`)) {
        currentWord = g.word;
        for (let k = 0; k < 6; k++) {
          await wait(rnd(800, 1600));
          const cx = Math.random(), cy = Math.random();
          const pts = Array.from({ length: 12 }, (_, j) => [Math.min(1, Math.max(0, cx + Math.cos(j / 2) * 0.12)), Math.min(1, Math.max(0, cy + Math.sin(j / 2) * 0.12))]);
          s.emit('canvas', { t: 'seg', s: `b${k}`, c: pick(['#1d0b45', '#ff3d7f', '#3d8bff']), w: 8, p: pts });
        }
      }
      if (g.canGuess && once(`g${g.turnId}-${Math.floor(Date.now() / 6000)}`)) {
        await wait(rnd(2000, 5000));
        s.emit('act', { type: 'answer', text: right() && currentWord ? currentWord : pick(['Haus', 'Baum', 'Auto', 'Katze', 'Sonne', 'Hund']) });
      }
    }
    if (g.type === 'luegenbaron') {
      if (g.canWrite && !g.myLie && once(`w${g.round}`)) { await wait(rnd(3000, 9000)); s.emit('act', { type: 'answer', text: pick(['ein Pinguin', 'Spaghetti', 'der Papst', 'Bielefeld', 'Gummibärchen', 'ein Toaster']) }); }
      if (g.canVote && once(`v${g.round}`)) { await wait(rnd(2000, 6000)); const o = g.options.filter((x) => !x.mine); s.emit('act', { type: 'vote', id: pick(o).id }); }
    }
    if (g.type === 'spion') {
      if (g.canClue && once(`c${g.round}-${g.clues.length}`)) { await wait(rnd(2000, 5000)); s.emit('act', { type: 'answer', text: pick(['groß', 'laut', 'bunt', 'lecker', 'teuer', 'alt', 'schnell', 'rund']) }); }
      if (g.canVote && once(`v${g.round}`)) { await wait(rnd(3000, 8000)); s.emit('act', { type: 'vote', target: pick(g.players.filter((p) => p !== st.me.id)) }); }
      if (g.canGuess && once(`s${g.round}`)) { await wait(rnd(3000, 6000)); s.emit('act', { type: 'answer', text: pick(g.catWords || ['?']) }); }
    }
    if (g.type === 'witzbold') {
      for (const m of g.mine) if (!m.answer && once(`a${g.round}-${m.id}`)) { await wait(rnd(3000, 10000)); s.emit('act', { type: 'answer', promptId: m.id, text: pick(['Ein Toaster mit WLAN', 'Omas geheimes Kartoffelsalat-Rezept', 'Drei Waschbären im Trenchcoat', 'Eine Steuererklärung', 'Gar nichts, nur Stille']) }); }
      if (g.match && g.phase === 'vote' && !g.match.inPair && g.match.myVote == null && once(`v${g.round}-${g.match.no}`)) { await wait(rnd(2000, 6000)); s.emit('act', { type: 'vote', side: Math.random() < 0.5 ? 0 : 1 }); }
      if (g.phase === 'finalAnswer' && !g.final.myAnswer && once('fa')) { await wait(rnd(3000, 9000)); s.emit('act', { type: 'answer', text: pick(['Ein sprechender Kühlschrank', 'Helene Fischer auf Rollschuhen', 'Ein Kaktus als Haustier']) }); }
      if (g.phase === 'finalVote' && g.final.myVote == null && once('fv')) { await wait(rnd(2000, 5000)); const idx = g.final.answers.map((_, i) => i).filter((i) => i !== g.final.mineIdx); s.emit('act', { type: 'vote', side: pick(idx) }); }
    }
    if (g.type === 'gleichdenker' && g.canAnswer && !g.myAnswer && once(`gd${g.round}`)) { await wait(rnd(3000, 9000)); s.emit('act', { type: 'answer', text: pick(['Erdbeere', 'Kiwi', 'Mango', 'Sofa', 'Hund', 'Pizza']) }); }
    if (g.type === 'schaetzen' && g.canGuess && g.myGuess == null && once(`e${g.round}`)) {
      await wait(rnd(3000, 9000));
      const a = schaetz.get(g.q) || 100;
      s.emit('act', { type: 'answer', text: String(Math.round(a * (0.4 + Math.random() * 1.2))) });
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
