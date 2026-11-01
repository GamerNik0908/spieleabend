// „Witzbold“ (wie Quiplash): Je zwei Spieler beantworten denselben Satzanfang, alle anderen
// stimmen ab, was lustiger ist. Einstimmiger Sieg = Witzbold-Bonus. Im Finale antworten
// alle auf denselben Satzanfang.
import { SoloGame, drawFresh, shuffle } from './base.js';
import * as store from '../store.js';
import { WITZBOLD } from '../data/index.js';

export class Witzbold extends SoloGame {
  static defaultOptions() {
    return { rounds: 2, answerSeconds: 90, voteSeconds: 20, final: true };
  }

  constructor(room, opts) {
    super(room, opts);
    this.pool = drawFresh('witzbold', WITZBOLD, WITZBOLD.length, store.usedSet('witzbold'));
    this.poolIdx = 0;
    this.usedIds = [];
    this.round = 0;
    this.phase = 'intro';
    this.prompts = [];
    this.matchIdx = -1;
    this.final = null;
  }

  mult() {
    return this.isFinal ? 3 : this.round;
  }

  takePrompt(exclude) {
    const p = this.pool[this.poolIdx++ % this.pool.length];
    this.usedIds.push(p.id);
    let text = p.q;
    if (text.includes('{spieler}')) {
      const others = this.online().filter((x) => !exclude.includes(x));
      const pick = others.length ? others : this.online();
      text = text.replaceAll('{spieler}', this.name(pick[Math.floor(Math.random() * pick.length)]));
    }
    return text;
  }

  start() {
    if (this.online().length < 3) {
      this.room.announce('Witzbold braucht mindestens 3 Spieler', 'op');
      return this.room.setTimer('phase', 2000, () => this.finish());
    }
    this.room.setTimer('phase', 6000, () => this.nextRound());
  }

  nextRound() {
    const players = shuffle(this.online());
    if (this.round >= this.opts.rounds) {
      if (this.opts.final && !this.isFinal && players.length >= 3) return this.startFinal(players);
      return this.finish();
    }
    this.round++;
    const n = players.length;
    this.prompts = players.map((p, i) => {
      const pair = [p, players[(i + 1) % n]];
      return { id: i, text: this.takePrompt(pair), pair, answers: {} };
    });
    this.phase = 'answer';
    this.matchIdx = -1;
    if (this.round > 1) this.room.announce(`Runde ${this.round}`, 'round', `Alle Punkte ×${this.round}!`);
    this.room.setTimer('answer', this.opts.answerSeconds * 1000, () => this.closeAnswers());
    this.changed();
  }

  startFinal(players) {
    this.isFinal = true;
    const text = this.takePrompt([]);
    this.final = { text, players, answers: {}, votes: {} };
    this.phase = 'finalAnswer';
    this.room.announce('🔥 Finale!', 'final', 'Alle beantworten denselben Satzanfang – Punkte ×3');
    this.room.setTimer('answer', Math.round(this.opts.answerSeconds * 0.7) * 1000, () => this.closeFinalAnswers());
    this.changed();
  }

  myPrompts(pid) {
    return this.prompts.filter((p) => p.pair.includes(pid));
  }

  submit(pid, promptId, text) {
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 90);
    if (!text) throw new Error('Schreib was Lustiges 😄');
    if (this.phase === 'finalAnswer') {
      if (!this.final.players.includes(pid)) throw new Error('Du spielst im Finale nicht mit.');
      this.final.answers[pid] = text;
      if (this.final.players.filter((p) => this.connected(p)).every((p) => this.final.answers[p])) {
        this.room.setTimer('answer', 900, () => this.closeFinalAnswers());
      }
      return this.changed();
    }
    if (this.phase !== 'answer') throw new Error('Gerade wird nicht geschrieben.');
    const prompt = this.prompts.find((p) => p.id === promptId);
    if (!prompt || !prompt.pair.includes(pid)) throw new Error('Das ist nicht dein Satzanfang.');
    prompt.answers[pid] = text;
    const done = this.prompts.every((p) => p.pair.every((x) => !this.connected(x) || p.answers[x]));
    if (done) this.room.setTimer('answer', 900, () => this.closeAnswers());
    this.changed();
  }

  closeAnswers() {
    if (this.phase !== 'answer') return;
    this.room.clearTimer('answer');
    this.matchIdx = -1;
    this.nextMatch();
  }

  nextMatch() {
    this.matchIdx++;
    if (this.matchIdx >= this.prompts.length) return this.nextRound();
    const p = this.prompts[this.matchIdx];
    p.sides = shuffle(p.pair);
    p.votes = {};
    this.phase = 'vote';
    // Fehlt eine Antwort, gewinnt die andere kampflos
    const missing = p.pair.filter((x) => !p.answers[x]);
    if (missing.length) return this.revealMatch();
    this.room.setTimer('vote', this.opts.voteSeconds * 1000, () => this.revealMatch());
    this.changed();
  }

  vote(pid, side) {
    if (this.phase === 'finalVote') return this.finalVote(pid, side);
    if (this.phase !== 'vote') throw new Error('Gerade wird nicht abgestimmt.');
    const p = this.prompts[this.matchIdx];
    if (p.pair.includes(pid)) throw new Error('Bei deinem eigenen Duell darfst du nicht abstimmen. 😉');
    if (![0, 1].includes(side)) throw new Error('Ungültige Wahl');
    p.votes[pid] = side;
    const voters = this.online().filter((x) => !p.pair.includes(x));
    if (voters.every((v) => p.votes[v] != null)) this.room.setTimer('vote', 700, () => this.revealMatch());
    this.changed();
  }

  revealMatch() {
    if (this.phase !== 'vote') return;
    this.room.clearTimer('vote');
    const p = this.prompts[this.matchIdx];
    const m = this.mult();
    const counts = [0, 0];
    for (const s of Object.values(p.votes)) counts[s]++;
    const total = counts[0] + counts[1];
    p.points = [0, 0];
    p.bonus = null;
    p.sides.forEach((pid, i) => {
      if (!p.answers[pid]) return;
      let pts = counts[i] * 100 * m;
      const other = p.sides[1 - i];
      if (!p.answers[other]) pts += 200 * m; // kampflos
      else if (total >= 2 && counts[i] === total) { pts += 250 * m; p.bonus = i; }
      p.points[i] = pts;
      this.scores[pid] += pts;
    });
    p.counts = counts;
    this.phase = 'matchReveal';
    if (p.bonus != null) this.room.fx('win');
    else this.room.fx('reveal');
    this.room.setTimer('phase', p.bonus != null ? 6500 : 5500, () => this.nextMatch());
    this.changed();
  }

  closeFinalAnswers() {
    if (this.phase !== 'finalAnswer') return;
    this.room.clearTimer('answer');
    const f = this.final;
    f.order = shuffle(Object.keys(f.answers));
    if (f.order.length < 2) return this.finish();
    this.phase = 'finalVote';
    this.room.setTimer('vote', Math.max(this.opts.voteSeconds, 25) * 1000, () => this.revealFinal());
    this.changed();
  }

  finalVote(pid, idx) {
    const f = this.final;
    const target = f.order[idx];
    if (!target) throw new Error('Ungültige Wahl');
    if (target === pid) throw new Error('Für dich selbst stimmen gilt nicht! 😄');
    f.votes[pid] = idx;
    if (this.online().every((v) => f.votes[v] != null)) this.room.setTimer('vote', 700, () => this.revealFinal());
    this.changed();
  }

  revealFinal() {
    if (this.phase !== 'finalVote') return;
    this.room.clearTimer('vote');
    const f = this.final;
    f.counts = f.order.map(() => 0);
    for (const i of Object.values(f.votes)) f.counts[i]++;
    f.points = f.order.map((pid, i) => {
      const pts = f.counts[i] * 100 * 3;
      this.scores[pid] += pts;
      return pts;
    });
    this.phase = 'finalReveal';
    this.room.fx('win');
    this.room.setTimer('phase', 9000, () => this.finish());
    this.changed();
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('witzbold', this.usedIds);
    this.room.finishGame(this.soloUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'answer') return this.submit(pid, a.promptId, a.text);
    if (a.type === 'vote') return this.vote(pid, a.side);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    if (a.type === 'skip' && this.phase === 'answer') {
      this.room.opAnnounce(by, 'beendet die Schreibzeit ⏭');
      this.closeAnswers();
    } else if (a.type === 'skip' && this.phase === 'finalAnswer') {
      this.room.opAnnounce(by, 'beendet die Schreibzeit ⏭');
      this.closeFinalAnswers();
    } else if (a.type === 'skip' && this.phase === 'vote') {
      this.revealMatch();
    } else if (a.type === 'skip' && this.phase === 'finalVote') {
      this.revealFinal();
    } else if (!this.baseOp(by, a)) {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    const cur = this.prompts[this.matchIdx];
    const showMatch = cur && ['vote', 'matchReveal'].includes(this.phase);
    const reveal = this.phase === 'matchReveal';
    const f = this.final;
    return {
      type: 'witzbold',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      mult: this.mult(),
      mine: this.phase === 'answer' ? this.myPrompts(pid).map((p) => ({ id: p.id, text: p.text, answer: p.answers[pid] || null })) : [],
      progress: this.phase === 'answer'
        ? { done: this.prompts.reduce((n, p) => n + Object.keys(p.answers).length, 0), total: this.prompts.length * 2 }
        : null,
      writers: this.phase === 'answer' ? this.online().filter((x) => this.myPrompts(x).every((p) => p.answers[x])) : [],
      match: showMatch ? {
        no: this.matchIdx + 1, of: this.prompts.length, text: cur.text,
        answers: cur.sides.map((x) => cur.answers[x] || null),
        authors: reveal ? cur.sides : null,
        counts: reveal ? cur.counts : null,
        points: reveal ? cur.points : null,
        bonus: reveal ? cur.bonus : null,
        voters: reveal ? cur.votes : null,
        voted: Object.keys(cur.votes || {}),
        myVote: cur.votes?.[pid] ?? null,
        inPair: cur.pair.includes(pid),
      } : null,
      final: f && this.phase.startsWith('final') ? {
        text: f.text,
        myAnswer: f.answers[pid] || null,
        answered: Object.keys(f.answers),
        answers: f.order ? f.order.map((x) => f.answers[x]) : null,
        mineIdx: f.order ? f.order.indexOf(pid) : -1,
        myVote: f.votes[pid] ?? null,
        voted: Object.keys(f.votes),
        authors: this.phase === 'finalReveal' ? f.order : null,
        counts: this.phase === 'finalReveal' ? f.counts : null,
        points: this.phase === 'finalReveal' ? f.points : null,
      } : null,
      scores: this.scoreList(),
      timers: { answer: this.timer('answer'), vote: this.timer('vote'), phase: this.timer('phase') },
      opts: this.opts,
    };
  }
}
