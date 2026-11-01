// „Lügenbaron“ (wie Fibbage): Eine wahre, kuriose Tatsache mit Lücke. Jeder erfindet
// eine Lüge, dann sucht jeder die Wahrheit. Punkte: Wahrheit gefunden, und für jeden,
// der auf die eigene Lüge hereinfällt.
import { SoloGame, drawFresh, shuffle, judgeSingle } from './base.js';
import { matchAnswer, normalize } from '../matcher.js';
import * as store from '../store.js';
import { LUEGENBARON } from '../data/index.js';

const TRUTH_PTS = 500;
const FOOL_PTS = 250;

export class Luegenbaron extends SoloGame {
  static defaultOptions() {
    return { rounds: 6, writeSeconds: 60, voteSeconds: 30 };
  }

  constructor(room, opts) {
    super(room, opts);
    this.questions = drawFresh('luegenbaron', LUEGENBARON, opts.rounds, store.usedSet('luegenbaron'));
    this.round = 0;
    this.phase = 'intro';
    this.q = null;
    this.lies = {};
    this.options = [];
    this.votes = {};
    this.result = null;
  }

  mult() {
    return this.round === this.opts.rounds && this.opts.rounds > 1 ? 2 : 1;
  }

  start() {
    this.room.step(6000, () => this.nextRound(), 'Erste Runde');
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    this.q = this.questions[this.round % this.questions.length];
    this.round++;
    this.lies = {};
    this.options = [];
    this.votes = {};
    this.result = null;
    this.phase = 'write';
    if (this.mult() > 1) this.room.announce('Letzte Runde – doppelte Punkte!', 'round');
    this.room.setTimer('answer', this.opts.writeSeconds * 1000, () => this.closeWrite());
    this.changed();
  }

  async submitLie(pid, text) {
    if (this.phase !== 'write') throw new Error('Gerade wird nicht geschrieben.');
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!text) throw new Error('Schreib eine Lüge 😉');
    const truth = { a: this.q.a, alt: this.q.alt };
    let isTruth = matchAnswer(text, truth);
    // KI erkennt auch umschriebene Wahrheit (sonst wäre die „Lüge“ ein Geschenk)
    if (!isTruth && this.room.aiOn) {
      const round = this.round;
      const r = await judgeSingle(this.q.q.replace('___', '…'), truth, text);
      if (round !== this.round || this.phase !== 'write') return;
      isTruth = r.ok;
    }
    if (isTruth) {
      throw new Error('Psst – das ist (fast) die Wahrheit! Denk dir eine Lüge aus. 😏');
    }
    this.lies[pid] = text;
    if (this.online().every((p) => this.lies[p])) this.room.setTimer('answer', 800, () => this.closeWrite());
    this.changed();
  }

  closeWrite() {
    if (this.phase !== 'write') return;
    this.room.clearTimer('answer');
    const byText = new Map();
    for (const [pid, text] of Object.entries(this.lies)) {
      const k = normalize(text);
      if (!byText.has(k)) byText.set(k, { text, authors: [] });
      byText.get(k).authors.push(pid);
    }
    const opts = [...byText.values()];
    opts.push({ text: this.q.a, authors: [], truth: true });
    // Mit Hauslügen auffüllen, damit es immer spannend bleibt
    for (const lie of shuffle(this.q.lies || [])) {
      if (opts.length >= Math.max(4, Math.min(6, this.active().length + 2))) break;
      if (!byText.has(normalize(lie))) opts.push({ text: lie, authors: [], house: true });
    }
    this.options = shuffle(opts).map((o, i) => ({ ...o, id: i }));
    this.phase = 'vote';
    this.room.fx('gong');
    this.room.setTimer('vote', this.opts.voteSeconds * 1000, () => this.reveal());
    this.changed();
  }

  vote(pid, id) {
    if (this.phase !== 'vote') throw new Error('Gerade wird nicht abgestimmt.');
    const o = this.options.find((x) => x.id === id);
    if (!o) throw new Error('Ungültige Wahl');
    if (o.authors.includes(pid)) throw new Error('Das ist deine eigene Lüge! 😄');
    this.votes[pid] = id;
    if (this.online().every((p) => this.votes[p] != null)) this.room.setTimer('vote', 900, () => this.reveal());
    this.changed();
  }

  reveal() {
    if (this.phase !== 'vote') return;
    this.room.clearTimer('vote');
    const m = this.mult();
    const delta = Object.fromEntries(this.active().map((p) => [p, 0]));
    for (const [voter, id] of Object.entries(this.votes)) {
      const o = this.options.find((x) => x.id === id);
      if (!o) continue;
      if (o.truth) delta[voter] = (delta[voter] || 0) + TRUTH_PTS * m;
      else for (const a of o.authors) delta[a] = (delta[a] || 0) + FOOL_PTS * m;
    }
    for (const [p, d] of Object.entries(delta)) if (p in this.scores) this.scores[p] += d;
    this.result = { delta };
    this.phase = 'reveal';
    // Lügen mit Stimmen zuerst, die Wahrheit zum Schluss
    const voted = (o) => Object.values(this.votes).filter((v) => v === o.id).length;
    this.revealOrder = [
      ...this.options.filter((o) => !o.truth && voted(o) > 0).sort((a, b) => voted(a) - voted(b)),
      ...this.options.filter((o) => o.truth),
    ].map((o) => o.id);
    const ms = 2600 * this.revealOrder.length + 5500;
    this.room.step(ms, () => this.nextRound(), this.round >= this.opts.rounds ? 'Zum Ergebnis' : 'Nächste Runde');
    this.changed();
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('luegenbaron', this.questions.slice(0, this.round).map((q) => q.id));
    this.room.finishGame(this.soloUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'answer') return this.submitLie(pid, a.text);
    if (a.type === 'vote') return this.vote(pid, a.id);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    if (a.type === 'skip' && this.phase === 'write') {
      this.room.opAnnounce(by, 'beendet die Schreibzeit ⏭');
      this.closeWrite();
    } else if (a.type === 'skip' && this.phase === 'vote') {
      this.room.opAnnounce(by, 'beendet die Abstimmung ⏭');
      this.reveal();
    } else if (!this.baseOp(by, a)) {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    const reveal = this.phase === 'reveal';
    return {
      type: 'luegenbaron',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      mult: this.mult(),
      q: this.q ? this.q.q : null,
      truth: reveal ? this.q.a : null,
      myLie: this.lies[pid] || null,
      written: Object.keys(this.lies),
      options: this.options.map((o) => ({
        id: o.id, text: o.text,
        mine: o.authors.includes(pid),
        ...(reveal ? { truth: !!o.truth, house: !!o.house, authors: o.authors, voters: Object.keys(this.votes).filter((v) => this.votes[v] === o.id) } : {}),
      })),
      revealOrder: reveal ? this.revealOrder : null,
      myVote: this.votes[pid] ?? null,
      voted: Object.keys(this.votes),
      delta: reveal ? this.result.delta : null,
      scores: this.scoreList(),
      timers: { answer: this.timer('answer'), vote: this.timer('vote'), phase: this.timer('phase') },
      canWrite: this.phase === 'write',
      canVote: this.phase === 'vote' && this.votes[pid] == null,
      opts: this.opts,
    };
  }
}
