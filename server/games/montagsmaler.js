// „Montagsmaler“: Einer zeichnet, alle anderen raten per Tippen. Wer schneller rät,
// bekommt mehr Punkte; der Zeichner bekommt Punkte für jeden, der es errät.
// Mit der Zeit werden Buchstaben als Tipp aufgedeckt.
import { SoloGame, drawFresh, shuffle, judgeSingle, shrinkDrawing } from './base.js';
import { matchAnswer, normalize, editDistance } from '../matcher.js';
import * as store from '../store.js';
import { MONTAGSMALER } from '../data/index.js';

const MAX_POINTS = 30000; // Schutz gegen riesige Zeichnungen

export class Montagsmaler extends SoloGame {
  static defaultOptions() {
    return { rounds: 1, drawSeconds: 80, choiceSeconds: 15, hints: true };
  }

  constructor(room, opts) {
    super(room, opts);
    const order = shuffle(this.players);
    this.queue = [];
    for (let r = 0; r < opts.rounds; r++) this.queue.push(...order);
    this.turnIdx = -1;
    this.turnId = 0;
    this.phase = 'intro';
    this.drawer = null;
    this.choices = [];
    this.word = null;
    this.revealed = new Set();
    this.guessed = {};
    this.chat = [];
    this.chatSeq = 0;
    this.strokes = [];
    this.pointCount = 0;
    this.turnPoints = {};
    this.pool = drawFresh('montagsmaler', MONTAGSMALER, MONTAGSMALER.length, store.usedSet('montagsmaler'));
    this.poolIdx = 0;
    this.usedIds = [];
  }

  start() {
    this.room.step(5000, () => this.nextTurn(), 'Erstes Bild');
  }

  pickWords() {
    const byLvl = (l) => {
      for (let i = 0; i < this.pool.length; i++) {
        const w = this.pool[(this.poolIdx + i) % this.pool.length];
        if (w.lvl === l && !this.usedIds.includes(w.id) && !this.choices.includes(w)) return w;
      }
      return this.pool[this.poolIdx++ % this.pool.length];
    };
    this.choices = [];
    for (const l of [1, 2, 3]) this.choices.push(byLvl(l));
    this.poolIdx += 3;
  }

  nextTurn() {
    this.turnIdx++;
    if (this.turnIdx >= this.queue.length) return this.finish();
    const drawer = this.queue[this.turnIdx];
    if (!this.room.players.has(drawer) || !this.connected(drawer)) return this.nextTurn();
    this.drawer = drawer;
    this.word = null;
    this.pickWords();
    this.phase = 'choose';
    this.room.setTimer('choose', this.opts.choiceSeconds * 1000, () => this.choose(drawer, Math.floor(Math.random() * 3)));
    this.changed();
  }

  choose(pid, idx) {
    if (this.phase !== 'choose' || pid !== this.drawer) throw new Error('Du bist gerade nicht dran.');
    const w = this.choices[idx];
    if (!w) throw new Error('Ungültige Auswahl');
    this.room.clearTimer('choose');
    this.word = w;
    this.usedIds.push(w.id);
    this.revealed = new Set();
    this.guessed = {};
    this.turnPoints = {};
    this.chat = [];
    this.strokes = [];
    this.pointCount = 0;
    this.turnId++;
    this.phase = 'draw';
    this.room.io.to(this.room.code).emit('canvas', { turnId: this.turnId, t: 'reset' });
    const ms = this.opts.drawSeconds * 1000;
    this.room.setTimer('draw', ms, () => this.endTurn('Zeit ist um!'));
    if (this.opts.hints) {
      this.room.setTimer('hint1', ms * 0.5, () => this.hint());
      this.room.setTimer('hint2', ms * 0.75, () => this.hint());
    }
    this.changed();
  }

  hint() {
    if (this.phase !== 'draw') return;
    const letters = [...this.word.w].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? i : -1)).filter((i) => i >= 0 && !this.revealed.has(i));
    if (letters.length <= 2) return;
    this.revealed.add(letters[Math.floor(Math.random() * letters.length)]);
    this.changed();
  }

  mask() {
    if (!this.word) return '';
    return [...this.word.w].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) && !this.revealed.has(i) ? '_' : ch)).join('');
  }

  async guess(pid, text) {
    if (this.phase !== 'draw') return;
    if (pid === this.drawer) throw new Error('Du zeichnest – nicht verraten! 😄');
    if (this.guessed[pid]) return;
    text = String(text || '').trim().slice(0, 60);
    if (!text) return;
    const spec = { a: this.word.w, alt: this.word.alt, strict: true };
    let hit = matchAnswer(text, spec);
    let by = 'auto';
    // Nicht direkt erkannt? KI prüft streng: nur genau der Begriff (Couch = Sofa ja, Schneeball ≠ Schneemann)
    if (!hit && this.room.aiOn && normalize(text).length >= 3) {
      const turn = this.turnId;
      const r = await judgeSingle('Welcher Begriff wird gerade gezeichnet?', spec, text, { mode: 'draw' });
      if (turn !== this.turnId || this.phase !== 'draw' || this.guessed[pid]) return;
      hit = r.ok;
      by = r.ok ? r.by : 'auto';
    }
    if (hit) {
      const t = this.room.timerView('draw');
      const frac = t ? t.remaining / t.duration : 0;
      const first = Object.keys(this.guessed).length === 0;
      const pts = Math.round(100 + 200 * frac) + (first ? 50 : 0);
      this.guessed[pid] = pts;
      this.scores[pid] += pts;
      this.turnPoints[pid] = pts;
      this.scores[this.drawer] += 50;
      this.turnPoints[this.drawer] = (this.turnPoints[this.drawer] || 0) + 50;
      this.chat.push({ id: ++this.chatSeq, pid, kind: 'hit', pts, by });
      this.room.emitTo(pid, 'fx', { kind: 'correct' });
      this.room.fx('reveal');
      const guessers = this.online().filter((p) => p !== this.drawer);
      if (guessers.every((p) => this.guessed[p])) this.endTurn('Alle haben es erraten! 🎉');
    } else {
      const n = normalize(text);
      const target = normalize(this.word.w);
      const close = n.length >= 3 && editDistance(n.replace(/ /g, ''), target.replace(/ /g, '')) <= Math.max(2, Math.floor(target.length / 4));
      if (close) this.room.emitTo(pid, 'toast', { text: `„${text}“ ist knapp daneben! 🔥` });
      this.chat.push({ id: ++this.chatSeq, pid, kind: 'guess', text });
    }
    this.chat = this.chat.slice(-60);
    this.changed();
  }

  // Zeichen-Nachrichten (direkt weitergeleitet, nicht über den Zustand)
  canvas(pid, msg, socket) {
    if (this.phase !== 'draw' || pid !== this.drawer || !msg) return;
    if (msg.t === 'seg') {
      const pts = Array.isArray(msg.p) ? msg.p.slice(0, 200).filter((q) => Array.isArray(q) && q.length === 2)
        .map(([x, y]) => [Math.round(Math.max(0, Math.min(1, +x)) * 1000) / 1000, Math.round(Math.max(0, Math.min(1, +y)) * 1000) / 1000]) : [];
      if (!pts.length || this.pointCount + pts.length > MAX_POINTS) return;
      this.pointCount += pts.length;
      let s = this.strokes.find((x) => x.s === msg.s);
      if (!s) {
        s = { s: String(msg.s).slice(0, 20), c: /^#[0-9a-f]{6}$/i.test(msg.c) ? msg.c : '#000000', w: Math.max(1, Math.min(60, +msg.w || 6)), p: [] };
        this.strokes.push(s);
      }
      s.p.push(...pts);
      socket.to(this.room.code).emit('canvas', { turnId: this.turnId, t: 'seg', s: s.s, c: s.c, w: s.w, p: pts });
    } else if (msg.t === 'undo') {
      this.strokes.pop();
      socket.to(this.room.code).emit('canvas', { turnId: this.turnId, t: 'full', strokes: this.strokes });
    } else if (msg.t === 'clear') {
      this.strokes = [];
      this.pointCount = 0;
      socket.to(this.room.code).emit('canvas', { turnId: this.turnId, t: 'full', strokes: [] });
    }
  }

  canvasFull() {
    return { turnId: this.turnId, t: 'full', strokes: this.phase === 'draw' || this.phase === 'reveal' ? this.strokes : [] };
  }

  endTurn(reason) {
    if (this.phase !== 'draw') return;
    for (const k of ['draw', 'hint1', 'hint2']) this.room.clearTimer(k);
    this.phase = 'reveal';
    this.reason = reason;
    if (this.word && this.strokes.length) {
      const guessers = Object.keys(this.guessed);
      const wrong = [...new Set(this.chat.filter((c) => c.kind === 'guess').map((c) => c.text))].slice(-4);
      this.room.moment('drawing', {
        pids: [this.drawer], text: this.word.w, q: `${this.name(this.drawer)} zeichnet`,
        note: guessers.length ? `Erraten von ${guessers.map((p) => this.name(p)).join(', ')}` : `Niemand hat es erraten${wrong.length ? ` – Tipps: ${wrong.join(', ')}` : ''}`,
        extra: { guessers: guessers.length, wrong }, drawing: shrinkDrawing(this.strokes), score: guessers.length ? 3 : 4, tags: [guessers.length ? 'cool' : 'lustig'],
      });
    }
    this.room.fx(Object.keys(this.guessed).length ? 'win-round' : 'wrong');
    this.room.step(5000, () => this.nextTurn(), this.turnIdx + 1 >= this.queue.length ? 'Zum Ergebnis' : 'Nächstes Bild');
    this.changed();
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('montagsmaler', this.usedIds);
    this.room.finishGame(this.soloUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'choose') return this.choose(pid, a.idx);
    if (a.type === 'answer') return this.guess(pid, a.text);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    const r = this.room;
    if (a.type === 'accept') {
      const e = this.chat.find((x) => x.id === a.id && x.kind === 'guess');
      if (!e || this.guessed[e.pid] || this.phase !== 'draw') throw new Error('Nicht möglich.');
      e.kind = 'hit';
      e.pts = 150;
      this.guessed[e.pid] = 150;
      this.scores[e.pid] += 150;
      this.scores[this.drawer] += 50;
      r.opAnnounce(by, `lässt „${e.text}“ von ${this.name(e.pid)} gelten ✅`, '+150 Punkte');
    } else if (a.type === 'skip' && this.phase === 'draw') {
      r.opAnnounce(by, 'beendet die Zeichenrunde ⏭');
      this.endTurn('Vom Operator beendet');
    } else if (!this.baseOp(by, a)) {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    const isDrawer = pid === this.drawer;
    const knows = isDrawer || this.guessed[pid] || this.phase === 'reveal';
    return {
      type: 'montagsmaler',
      phase: this.phase,
      turn: this.turnIdx + 1,
      turns: this.queue.length,
      turnId: this.turnId,
      drawer: this.drawer,
      choices: isDrawer && this.phase === 'choose' ? this.choices.map((w) => ({ w: w.w, lvl: w.lvl })) : null,
      word: knows && this.word ? this.word.w : null,
      mask: this.mask(),
      guessed: Object.keys(this.guessed),
      turnPoints: this.phase === 'reveal' ? this.turnPoints : null,
      reason: this.phase === 'reveal' ? this.reason : null,
      chat: this.chat,
      scores: this.scoreList(),
      timers: { draw: this.timer('draw'), choose: this.timer('choose'), phase: this.timer('phase') },
      isDrawer,
      canGuess: this.phase === 'draw' && !isDrawer && !this.guessed[pid],
      opts: this.opts,
    };
  }
}
