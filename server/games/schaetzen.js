// „Schätzmeister“: Alle schätzen dieselbe Zahl. Wer am nächsten dran ist, gewinnt die
// meisten Punkte; ein Volltreffer gibt einen Bonus. Letzte Runde zählt doppelt.
import { SoloGame, drawFresh } from './base.js';
import { normalize, extractNumbers } from '../matcher.js';
import * as store from '../store.js';
import { SCHAETZEN } from '../data/index.js';

const PLACE_PTS = [500, 300, 200];

export class Schaetzen extends SoloGame {
  static defaultOptions() {
    return { rounds: 8, answerSeconds: 30 };
  }

  constructor(room, opts) {
    super(room, opts);
    this.questions = drawFresh('schaetzen', SCHAETZEN, opts.rounds, store.usedSet('schaetzen'));
    this.round = 0;
    this.phase = 'intro';
    this.guesses = {};
    this.result = null;
  }

  mult() {
    return this.round === this.opts.rounds && this.opts.rounds > 1 ? 2 : 1;
  }

  start() {
    this.room.step(5000, () => this.nextRound(), 'Erste Frage');
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    this.q = this.questions[this.round % this.questions.length];
    this.round++;
    this.guesses = {};
    this.result = null;
    this.phase = 'guess';
    if (this.mult() > 1) this.room.announce('Letzte Frage – doppelte Punkte!', 'round');
    this.room.setTimer('answer', this.opts.answerSeconds * 1000, () => this.reveal());
    this.changed();
  }

  submit(pid, text) {
    if (this.phase !== 'guess') throw new Error('Gerade wird nicht geschätzt.');
    const nums = [...new Set(extractNumbers(normalize(String(text || '').replace(/^-/, ''))))];
    if (nums.length !== 1) throw new Error('Bitte genau eine Zahl eingeben (z. B. 1500 oder 2,5 Mio).');
    this.guesses[pid] = nums[0];
    if (this.online().every((p) => this.guesses[p] != null)) this.room.setTimer('answer', 800, () => this.reveal());
    this.changed();
  }

  reveal() {
    if (this.phase !== 'guess') return;
    this.room.clearTimer('answer');
    this.result = null;
    const list = this.score();
    this.phase = 'reveal';
    this.room.fx(list.some((e) => e.bullseye) ? 'win' : 'reveal');
    {
      const a = this.q.a;
      const unit = this.q.unit ? ` ${this.q.unit}` : '';
      const best = list[0];
      if (best) this.room.moment('estimate', { pids: [best.pid], q: this.q.q, a: `${a}${unit}`, text: `${best.value}${unit}`, note: best.bullseye ? 'Volltreffer!' : 'am nächsten dran', extra: { bullseye: !!best.bullseye }, score: best.bullseye ? 5 : 1, tags: ['schlau'] });
      const worst = list[list.length - 1];
      const ratio = worst && a ? Math.max(worst.value / a, a / Math.max(worst.value, 1e-9)) : 0;
      if (worst && list.length > 1 && ratio >= 3) this.room.moment('estimate', { pids: [worst.pid], q: this.q.q, a: `${a}${unit}`, text: `${worst.value}${unit}`, note: `${Math.round(ratio)}× daneben`, extra: { off: ratio }, score: ratio >= 10 ? 5 : 3, tags: ['lustig'] });
    }
    // Lösung zuerst, dann Schätzungen vom schlechtesten zum besten – Weiter deckt den Nächsten auf
    this.room.startReveal(`es-${this.round}`, [...list].reverse().map((e) => e.pid), { ordered: true, autoMs: 1400 }, () => {
      this.room.step(2500, () => this.nextRound(), this.round >= this.opts.rounds ? 'Zum Ergebnis' : 'Nächste Frage');
    });
    this.changed();
  }

  /** Rangliste und Punkte berechnen (alte Punkte der Runde vorher zurücknehmen) */
  score() {
    if (this.result) for (const e of this.result.list) this.scores[e.pid] -= e.pts;
    const a = this.q.a;
    const m = this.mult();
    const list = Object.entries(this.guesses).map(([pid, v]) => ({ pid, value: v, diff: Math.abs(v - a) }));
    list.sort((x, y) => x.diff - y.diff);
    let rank = 0, last = null;
    list.forEach((e, i) => {
      if (e.diff !== last) rank = i + 1;
      last = e.diff;
      e.rank = rank;
      const rel = a !== 0 ? e.diff / Math.abs(a) : e.diff;
      let pts = PLACE_PTS[rank - 1] ?? (rel <= 0.25 ? 100 : 0);
      e.bullseye = rel <= 0.005;
      if (e.bullseye) pts += 300;
      e.pts = pts * m;
      this.scores[e.pid] += e.pts;
    });
    this.result = { a, unit: this.q.unit, info: this.q.info, list };
    return list;
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('schaetzen', this.questions.slice(0, this.round).map((q) => q.id));
    this.room.finishGame(this.soloUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'answer') return this.submit(pid, a.text);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    if (a.type === 'setGuess') {
      // Operator: Schätzung korrigieren (z. B. Tippfehler 1000 statt 100)
      if (this.phase !== 'reveal' || !(a.pid in this.guesses)) throw new Error('Nur bei der Auflösung möglich.');
      const v = Number(a.value);
      if (!Number.isFinite(v)) throw new Error('Ungültige Zahl');
      const before = this.guesses[a.pid];
      this.guesses[a.pid] = v;
      this.score();
      this.room.opAnnounce(by, `ändert die Schätzung von ${this.name(a.pid)}: ${before} → ${v}`, 'Rangliste neu berechnet');
      this.room.addTime('phase', 3000);
      return this.changed();
    }
    if (a.type === 'skip' && this.phase === 'guess') {
      this.room.opAnnounce(by, 'löst die Frage auf ⏭');
      this.reveal();
    } else if (!this.baseOp(by, a)) {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    return {
      type: 'schaetzen',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      mult: this.mult(),
      q: this.q ? this.q.q : null,
      unit: this.q ? this.q.unit : null,
      myGuess: this.guesses[pid] ?? null,
      guessed: Object.keys(this.guesses),
      result: this.result,
      scores: this.scoreList(),
      timers: { answer: this.timer('answer'), phase: this.timer('phase') },
      canGuess: this.phase === 'guess',
      opts: this.opts,
    };
  }
}
