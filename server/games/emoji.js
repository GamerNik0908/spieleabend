// „Emoji-Kino“: Ein Emoji-Rätsel steht für einen Film, ein Lied, ein Sprichwort …
// Alle tippen gleichzeitig, beliebig oft. Je schneller richtig, desto mehr Punkte;
// der Erste bekommt einen Bonus. Nach der halben Zeit gibt es einen Tipp.
import { SoloGame, drawFresh, judgeSingle } from './base.js';
import { scoreAnswer, normalize } from '../matcher.js';
import * as store from '../store.js';
import { EMOJI } from '../data/index.js';

export class EmojiKino extends SoloGame {
  static defaultOptions() {
    return { rounds: 12, answerSeconds: 40, hints: true };
  }

  constructor(room, opts) {
    super(room, opts);
    this.riddles = drawFresh('emoji', EMOJI, opts.rounds + 8, store.usedSet('emoji'));
    this.ri = 0;
    this.round = 0;
    this.phase = 'intro';
    this.chat = [];
    this.chatSeq = 0;
  }

  start() {
    this.room.step(5000, () => this.nextRound(), 'Erstes Rätsel');
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    this.r = this.riddles[this.ri++ % this.riddles.length];
    this.round++;
    this.solved = {};
    this.roundPts = {};
    this.chat = [];
    this.phase = 'guess';
    this.startTimers();
    this.changed();
  }

  startTimers() {
    const ms = this.opts.answerSeconds * 1000;
    this.room.setTimer('answer', ms, () => this.endRound());
    // Zur Halbzeit den Tipp an alle schicken
    if (this.opts.hints) this.room.setTimer('hint', ms / 2, () => { this.hintOn = true; this.changed(); });
    this.hintOn = false;
  }

  spec() {
    return { a: this.r.a, alt: this.r.alt };
  }

  async guess(pid, text) {
    if (this.phase !== 'guess') return;
    if (this.solved[pid]) return;
    text = String(text || '').trim().slice(0, 80);
    if (!text) return;
    let hit = scoreAnswer(text, this.spec()) > 0;
    let by = 'auto';
    if (!hit && this.room.aiOn && normalize(text).length >= 3) {
      const round = this.round;
      const r = await judgeSingle(`Emoji-Rätsel (${this.r.cat}): ${this.r.e}`, this.spec(), text);
      if (round !== this.round || this.phase !== 'guess' || this.solved[pid]) return;
      hit = r.ok;
      by = r.ok ? r.by : 'auto';
    }
    if (hit) this.award(pid, by);
    else this.chat.push({ id: ++this.chatSeq, pid, kind: 'guess', text });
    this.chat = this.chat.slice(-60);
    this.changed();
  }

  award(pid, by) {
    const t = this.room.timerView('answer');
    const frac = t ? t.remaining / t.duration : 0;
    const first = Object.keys(this.solved).length === 0;
    const pts = Math.round(100 + 200 * frac) + (first ? 50 : 0);
    this.solved[pid] = { pts, by, rank: Object.keys(this.solved).length + 1 };
    this.scores[pid] += pts;
    this.chat.push({ id: ++this.chatSeq, pid, kind: 'hit', pts, by });
    this.room.emitTo(pid, 'fx', { kind: 'correct' });
    this.room.fx('reveal');
    if (this.online().every((p) => this.solved[p])) this.room.setTimer('answer', 900, () => this.endRound());
  }

  endRound() {
    if (this.phase !== 'guess') return;
    this.room.clearTimer('answer');
    this.room.clearTimer('hint');
    this.phase = 'reveal';
    this.room.fx(Object.keys(this.solved).length ? 'win-round' : 'lose');
    this.room.step(4500, () => this.nextRound(), this.round >= this.opts.rounds ? 'Zum Ergebnis' : 'Nächstes Rätsel');
    this.changed();
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('emoji', this.riddles.slice(0, this.ri).map((r) => r.id));
    this.room.finishGame(this.soloUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'answer') return this.guess(pid, a.text);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    const r = this.room;
    if (a.type === 'accept') {
      // Operator: Tipp zählt doch
      if (this.phase !== 'guess') throw new Error('Nur während geraten wird.');
      const c = this.chat.find((x) => x.id === a.id && x.kind === 'guess');
      if (!c || this.solved[c.pid]) throw new Error('Nicht möglich.');
      c.kind = 'accepted';
      this.award(c.pid, 'op');
      r.opAnnounce(by, `lässt „${c.text}“ von ${this.name(c.pid)} gelten ✅`);
    } else if (a.type === 'revoke') {
      // Operator: Treffer zählt doch nicht
      const s = this.solved?.[a.pid];
      if (!s) throw new Error('Kein Treffer gefunden.');
      this.scores[a.pid] -= s.pts;
      delete this.solved[a.pid];
      this.chat = this.chat.filter((c) => !(c.kind === 'hit' && c.pid === a.pid));
      r.opAnnounce(by, `nimmt den Treffer von ${this.name(a.pid)} zurück ❌`, `−${s.pts}`);
    } else if (a.type === 'swapQuestion') {
      if (this.phase !== 'guess') throw new Error('Nur während geraten wird.');
      for (const [p, s] of Object.entries(this.solved)) this.scores[p] -= s.pts;
      this.r = this.riddles[this.ri++ % this.riddles.length];
      this.solved = {};
      this.chat = [];
      r.opAnnounce(by, 'nimmt ein anderes Rätsel 🔄');
      this.startTimers();
    } else if (a.type === 'skip' && this.phase === 'guess') {
      r.opAnnounce(by, 'löst auf ⏭');
      this.endRound();
    } else if (!this.baseOp(by, a)) {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid, isOp) {
    const hint = this.phase === 'reveal' || this.hintOn;
    return {
      type: 'emoji',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      e: this.r?.e || null,
      cat: this.r?.cat || null,
      hint: hint ? this.r?.hint || null : null,
      a: this.phase === 'reveal' || isOp ? this.r?.a : null,
      solved: this.solved || {},
      mySolved: !!this.solved?.[pid],
      // Falsche Tipps sieht jeder – wer schon gelöst hat, sieht auch, was andere tippen
      chat: this.chat,
      scores: this.scoreList(),
      canGuess: this.phase === 'guess' && !this.solved?.[pid],
      timers: { answer: this.timer('answer'), phase: this.timer('phase') },
      opts: this.opts,
    };
  }
}
