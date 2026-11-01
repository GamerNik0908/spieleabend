// „Wer war's?“: Alle beantworten geheim dieselbe persönliche Frage. Danach erscheinen die
// Antworten anonym und jeder tippt, von wem welche stammt. Richtig geraten: +100.
// Für jeden, der dich nicht erkennt, bekommst du +50. Wer nichts weiß, darf passen.
import { SoloGame, drawFresh, shuffle } from './base.js';
import * as store from '../store.js';
import { WERWARS } from '../data/index.js';

const HIT = 100;
const HIDDEN = 50;

export class Werwars extends SoloGame {
  static defaultOptions() {
    return { rounds: 6, answerSeconds: 60, guessSeconds: 60 };
  }

  constructor(room, opts) {
    super(room, opts);
    this.questions = drawFresh('werwars', WERWARS, opts.rounds + 10, store.usedSet('werwars'));
    this.qi = 0;
    this.round = 0;
    this.phase = 'intro';
    this.answers = {};
    this.passed = new Set();
    this.list = [];
    this.guesses = {};
    this.done = new Set();
    this.excluded = new Set();
  }

  start() {
    this.room.step(6000, () => this.nextRound(), 'Erste Frage');
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    this.q = this.questions[this.qi++ % this.questions.length];
    this.round++;
    this.answers = {};
    this.passed = new Set();
    this.list = [];
    this.guesses = {};
    this.done = new Set();
    this.excluded = new Set();
    this.result = null;
    this.phase = 'answer';
    this.room.setTimer('answer', this.opts.answerSeconds * 1000, () => this.closeAnswers());
    this.changed();
  }

  /** Alle (verbundenen) Spieler fertig? → früher weiter */
  checkAnswers() {
    if (this.online().every((p) => this.answers[p] || this.passed.has(p))) this.room.setTimer('answer', 800, () => this.closeAnswers());
  }

  submit(pid, text) {
    if (this.phase !== 'answer') throw new Error('Gerade wird nicht geantwortet.');
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!text) throw new Error('Schreib eine Antwort – oder passe.');
    this.answers[pid] = text;
    this.passed.delete(pid);
    this.checkAnswers();
    this.changed();
  }

  pass(pid) {
    if (this.phase !== 'answer') throw new Error('Gerade wird nicht geantwortet.');
    delete this.answers[pid];
    this.passed.add(pid);
    this.checkAnswers();
    this.changed();
  }

  closeAnswers() {
    if (this.phase !== 'answer') return;
    this.room.clearTimer('answer');
    const authors = Object.keys(this.answers).filter((p) => this.room.players.has(p));
    if (authors.length < 2) {
      this.room.announce('Zu wenige Antworten', 'op', 'Diese Frage wird übersprungen');
      this.round--;
      return this.room.step(2500, () => this.nextRound(), 'Neue Frage');
    }
    // Anonym und gemischt; die Kennung verrät nichts über den Autor
    this.list = shuffle(authors).map((pid, i) => ({ id: `a${i}`, pid, text: this.answers[pid] }));
    this.phase = 'guess';
    this.room.fx('gong');
    this.room.setTimer('vote', this.opts.guessSeconds * 1000, () => this.reveal());
    this.changed();
  }

  /** Spieler ordnet einer Antwort einen Autor zu (oder nimmt die Zuordnung weg) */
  guess(pid, aid, target) {
    if (this.phase !== 'guess') throw new Error('Gerade wird nicht geraten.');
    const entry = this.list.find((e) => e.id === aid);
    if (!entry) throw new Error('Antwort nicht gefunden.');
    if (entry.pid === pid) throw new Error('Das ist deine eigene Antwort. 😉');
    const g = (this.guesses[pid] ||= {});
    if (!target) delete g[aid];
    else {
      if (target === pid || !this.list.some((e) => e.pid === target)) throw new Error('Ungültige Wahl.');
      g[aid] = target;
    }
    this.done.delete(pid);
    this.changed();
  }

  finishGuess(pid) {
    if (this.phase !== 'guess') return;
    this.done.add(pid);
    if (this.online().every((p) => this.done.has(p))) this.room.setTimer('vote', 800, () => this.reveal());
    this.changed();
  }

  reveal() {
    if (this.phase !== 'guess') return;
    this.room.clearTimer('vote');
    this.result = null;
    this.score();
    this.phase = 'reveal';
    this.room.startReveal(`ww-${this.round}`, this.list.map((e) => e.id), { ordered: false, autoMs: 2200 }, () => {
      this.room.step(3000, () => this.nextRound(), this.round >= this.opts.rounds ? 'Zum Ergebnis' : 'Nächste Frage');
    });
    this.changed();
  }

  /** Punkte der Runde (neu) berechnen – auch nach Operator-Korrekturen */
  score() {
    if (this.result) for (const [p, d] of Object.entries(this.result.delta)) if (p in this.scores) this.scores[p] -= d;
    const delta = {};
    const add = (p, n) => { if (p in this.scores) { delta[p] = (delta[p] || 0) + n; this.scores[p] += n; } };
    const perAnswer = {};
    for (const e of this.list) {
      const right = [], wrong = [];
      if (!this.excluded.has(e.id)) {
        for (const [guesser, g] of Object.entries(this.guesses)) {
          if (guesser === e.pid || !g[e.id]) continue;
          if (g[e.id] === e.pid) { right.push(guesser); add(guesser, HIT); } else wrong.push(guesser);
        }
        if (wrong.length) add(e.pid, HIDDEN * wrong.length);
      }
      perAnswer[e.id] = { right, wrong };
    }
    this.result = { delta, perAnswer };
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('werwars', this.questions.slice(0, this.qi).map((q) => q.id));
    this.room.finishGame(this.soloUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'answer') return this.submit(pid, a.text);
    if (a.type === 'pass') return this.pass(pid);
    if (a.type === 'guess') return this.guess(pid, a.id, a.target);
    if (a.type === 'done') return this.finishGuess(pid);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    const r = this.room;
    if (a.type === 'swapQuestion') {
      // Operator: Frage ist doof oder keiner weiß was → neue Frage für alle
      if (this.phase !== 'answer') throw new Error('Nur während geantwortet wird.');
      this.q = this.questions[this.qi++ % this.questions.length];
      this.answers = {};
      this.passed = new Set();
      r.opAnnounce(by, 'tauscht die Frage 🔄', this.q.q);
      r.setTimer('answer', this.opts.answerSeconds * 1000, () => this.closeAnswers());
    } else if (a.type === 'exclude') {
      // Operator: Antwort zählt nicht (z. B. Quatsch oder zu offensichtlich)
      if (!['guess', 'reveal'].includes(this.phase)) throw new Error('Nur beim Raten oder Aufdecken.');
      const e = this.list.find((x) => x.id === a.id);
      if (!e) throw new Error('Antwort nicht gefunden.');
      if (this.excluded.has(e.id)) this.excluded.delete(e.id); else this.excluded.add(e.id);
      if (this.phase === 'reveal') this.score();
      r.opAnnounce(by, this.excluded.has(e.id) ? `streicht die Antwort „${e.text}“ aus der Wertung ✂️` : `nimmt „${e.text}“ wieder in die Wertung`, this.phase === 'reveal' ? 'Punkte wurden neu berechnet' : '');
    } else if (a.type === 'skip') {
      if (this.phase === 'answer') { r.opAnnounce(by, 'beendet die Antwortzeit ⏭'); this.closeAnswers(); }
      else if (this.phase === 'guess') { r.opAnnounce(by, 'beendet das Raten ⏭'); this.reveal(); }
      else this.baseOp(by, a);
    } else if (!this.baseOp(by, a)) {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid, isOp) {
    const reveal = this.phase === 'reveal';
    const shown = (id) => !reveal || this.room.reveal?.key !== `ww-${this.round}` || this.room.reveal.shown.includes(id);
    return {
      type: 'werwars',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      q: this.q ? this.q.q : null,
      myAnswer: this.answers[pid] || null,
      passed: this.passed.has(pid),
      answered: [...Object.keys(this.answers), ...this.passed],
      authors: this.list.map((e) => e.pid).sort(),
      list: this.list.map((e) => ({
        id: e.id,
        text: e.text,
        mine: e.pid === pid,
        excluded: this.excluded.has(e.id),
        // Autor erst beim Aufdecken (Operator sieht ihn schon vorher, um zu korrigieren)
        pid: (reveal && shown(e.id)) || (isOp && reveal) ? e.pid : undefined,
        right: reveal && shown(e.id) ? this.result.perAnswer[e.id].right : undefined,
        wrong: reveal && shown(e.id) ? this.result.perAnswer[e.id].wrong : undefined,
      })),
      myGuesses: this.guesses[pid] || {},
      guessers: [...this.done],
      delta: reveal ? this.result.delta : null,
      scores: this.scoreList(),
      timers: { answer: this.timer('answer'), vote: this.timer('vote'), phase: this.timer('phase') },
      canAnswer: this.phase === 'answer',
      canGuess: this.phase === 'guess',
      opts: this.opts,
    };
  }
}
