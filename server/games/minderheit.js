// „Die Minderheit gewinnt“: Eine Frage, drei bis vier Antworten. Jeder wählt geheim.
// Punkte bekommt nur die kleinste Gruppe – wer denkt, was die anderen NICHT denken?
// Haben alle dasselbe gewählt, gewinnt niemand. Die letzte Frage zählt doppelt.
import { SoloGame, drawFresh } from './base.js';
import * as store from '../store.js';
import { MINDERHEIT } from '../data/index.js';

const WIN = 200;

export class Minderheit extends SoloGame {
  static defaultOptions() {
    return { rounds: 10, voteSeconds: 20 };
  }

  constructor(room, opts) {
    super(room, opts);
    this.questions = drawFresh('minderheit', MINDERHEIT, opts.rounds + 10, store.usedSet('minderheit'));
    this.qi = 0;
    this.round = 0;
    this.phase = 'intro';
    this.votes = {};
  }

  mult() {
    return this.round === this.opts.rounds && this.opts.rounds > 1 ? 2 : 1;
  }

  start() {
    this.room.step(5000, () => this.nextRound(), 'Erste Frage');
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    this.q = this.questions[this.qi++ % this.questions.length];
    this.round++;
    this.votes = {};
    this.result = null;
    this.phase = 'vote';
    if (this.mult() > 1) this.room.announce('Letzte Frage – doppelte Punkte!', 'round');
    this.room.setTimer('vote', this.opts.voteSeconds * 1000, () => this.reveal());
    this.changed();
  }

  vote(pid, idx) {
    if (this.phase !== 'vote') throw new Error('Gerade wird nicht gewählt.');
    idx = Number(idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.q.options.length) throw new Error('Ungültige Wahl.');
    this.votes[pid] = idx;
    if (this.online().every((p) => this.votes[p] != null)) this.room.setTimer('vote', 900, () => this.reveal());
    this.changed();
  }

  reveal() {
    if (this.phase !== 'vote') return;
    this.room.clearTimer('vote');
    this.score();
    this.phase = 'reveal';
    // Größte Gruppe zuerst, die kleinste (= Gewinner) zum Schluss
    const ids = this.q.options.map((_, i) => i).sort((a, b) => this.result.counts[b] - this.result.counts[a]);
    this.room.startReveal(`mh-${this.round}`, ids, { ordered: true, autoMs: 1800 }, () => {
      this.room.fx(this.result.winners.length ? 'win-round' : 'wrong');
      this.room.step(3500, () => this.nextRound(), this.round >= this.opts.rounds ? 'Zum Ergebnis' : 'Nächste Frage');
    });
    this.changed();
  }

  /** Kleinste Gruppe ermitteln und Punkte vergeben (bei Korrektur alte zurücknehmen) */
  score() {
    if (this.result) for (const [p, d] of Object.entries(this.result.delta)) if (p in this.scores) this.scores[p] -= d;
    const counts = this.q.options.map(() => 0);
    for (const [p, i] of Object.entries(this.votes)) if (this.room.players.has(p)) counts[i]++;
    const used = counts.map((c, i) => [c, i]).filter(([c]) => c > 0);
    let winOpts = [];
    if (used.length > 1) {
      const min = Math.min(...used.map(([c]) => c));
      winOpts = used.filter(([c]) => c === min).map(([, i]) => i);
    }
    const delta = {};
    const winners = Object.keys(this.votes).filter((p) => p in this.scores && winOpts.includes(this.votes[p]));
    for (const p of winners) { delta[p] = WIN * this.mult(); this.scores[p] += delta[p]; }
    this.result = { counts, winOpts, winners, delta };
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('minderheit', this.questions.slice(0, this.qi).map((q) => q.id));
    this.room.finishGame(this.soloUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'vote') return this.vote(pid, a.idx);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    const r = this.room;
    if (a.type === 'setVote') {
      // Operator: Wahl eines Spielers korrigieren (z. B. verklickt)
      if (this.phase !== 'reveal') throw new Error('Nur bei der Auflösung möglich.');
      const idx = Number(a.idx);
      if (!(a.pid in this.scores) || !Number.isInteger(idx) || idx < 0 || idx >= this.q.options.length) throw new Error('Ungültig.');
      this.votes[a.pid] = idx;
      this.score();
      r.opAnnounce(by, `setzt ${this.name(a.pid)} auf „${this.q.options[idx]}“`, 'Punkte wurden neu berechnet');
    } else if (a.type === 'swapQuestion') {
      if (this.phase !== 'vote') throw new Error('Nur während gewählt wird.');
      this.q = this.questions[this.qi++ % this.questions.length];
      this.votes = {};
      r.opAnnounce(by, 'tauscht die Frage 🔄', this.q.q);
      r.setTimer('vote', this.opts.voteSeconds * 1000, () => this.reveal());
    } else if (a.type === 'skip' && this.phase === 'vote') {
      r.opAnnounce(by, 'beendet die Wahl ⏭');
      this.reveal();
    } else if (!this.baseOp(by, a)) {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    const reveal = this.phase === 'reveal';
    const rv = this.room.reveal;
    const shown = (i) => !reveal || rv?.key !== `mh-${this.round}` || rv.shown.includes(String(i));
    const allShown = !reveal || rv?.key !== `mh-${this.round}` || rv.done;
    return {
      type: 'minderheit',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      mult: this.mult(),
      q: this.q ? this.q.q : null,
      options: this.q ? this.q.options.map((t, i) => ({
        t,
        count: reveal && shown(i) ? this.result.counts[i] : null,
        voters: reveal && shown(i) ? Object.keys(this.votes).filter((p) => this.votes[p] === i) : null,
        win: reveal && allShown ? this.result.winOpts.includes(i) : null,
      })) : [],
      myVote: this.votes[pid] ?? null,
      voted: Object.keys(this.votes),
      done: allShown && reveal,
      delta: reveal && allShown ? this.result.delta : null,
      pending: reveal && !allShown ? this.result.delta : null,
      scores: this.scoreList(),
      timers: { vote: this.timer('vote'), phase: this.timer('phase') },
      canVote: this.phase === 'vote',
      opts: this.opts,
    };
  }
}
