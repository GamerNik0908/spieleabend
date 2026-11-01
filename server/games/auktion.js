// „Wissens-Auktion“: Zuerst sieht man nur die Kategorie. Jedes Team bietet geheim Punkte
// darauf, dass es die Frage lösen kann (Absprache im Team-Chat). Das höchste Gebot muss
// antworten: richtig = Gebot dazu, falsch = Gebot weg. Wissen trifft Selbstüberschätzung.
import { Game, judgeSingle, shuffle } from './base.js';
import * as store from '../store.js';
import { QUIZ_CATEGORIES } from '../data/index.js';

const STEP = 50;
const FREE_PTS = 100;

export class Auktion extends Game {
  static defaultOptions() {
    return { rounds: 8, bidSeconds: 40, answerSeconds: 30, startPoints: 1000 };
  }

  constructor(room, opts, teams) {
    super(room, opts, teams);
    for (const t of this.teams) t.score = opts.startPoints;
    this.used = store.usedSet('auktion');
    this.round = 0;
    this.phase = 'intro';
    this.chat = Object.fromEntries(this.teams.map((t) => [t.id, []]));
    this.chatSeq = 0;
    this.history = [];
  }

  start() {
    this.room.step(6000, () => this.nextRound(), 'Erste Auktion');
  }

  /** Zufällige Frage (mittel bis schwer), möglichst noch nie gespielt */
  drawQuestion() {
    const all = QUIZ_CATEGORIES.flatMap((c) => c.questions.filter((q) => (q.lvl || 3) >= 2).map((q) => ({ ...q, cat: c.name, icon: c.icon })));
    let pool = all.filter((q) => !this.used.has(q.id));
    if (!pool.length) { store.clearUsed('auktion'); this.used = new Set(); pool = all; }
    const q = shuffle(pool)[0];
    this.used.add(q.id);
    store.markUsed('auktion', [q.id]);
    return q;
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    this.q = this.drawQuestion();
    this.round++;
    this.bids = Object.fromEntries(this.teams.map((t) => [t.id, { amount: 0, by: null, at: Infinity, locked: false }]));
    this.winner = null;
    this.result = null;
    this.phase = 'bid';
    this.room.setTimer('vote', this.opts.bidSeconds * 1000, () => this.closeBids());
    this.changed();
  }

  bid(pid, amount) {
    if (this.phase !== 'bid') throw new Error('Gerade wird nicht geboten.');
    const t = this.teamOf(pid);
    if (!t) throw new Error('Du bist in keinem Team.');
    amount = Math.round(Number(amount) / STEP) * STEP;
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Ungültiges Gebot.');
    if (amount > Math.max(0, t.score)) throw new Error(`Ihr habt nur ${Math.max(0, t.score)} Punkte.`);
    this.bids[t.id] = { amount, by: pid, at: Date.now(), locked: false };
    this.changed();
  }

  lock(pid) {
    if (this.phase !== 'bid') return;
    const t = this.teamOf(pid);
    if (!t) return;
    this.bids[t.id].locked = !this.bids[t.id].locked;
    if (this.teams.every((x) => this.bids[x.id].locked)) this.room.setTimer('vote', 800, () => this.closeBids());
    this.changed();
  }

  closeBids() {
    if (this.phase !== 'bid') return;
    this.room.clearTimer('vote');
    const order = [...this.teams].sort((a, b) => this.bids[b.id].amount - this.bids[a.id].amount || this.bids[a.id].at - this.bids[b.id].at);
    const top = order[0];
    const free = this.bids[top.id].amount === 0;
    this.winner = free ? shuffle(this.teams)[0].id : top.id;
    this.stake = free ? 0 : this.bids[top.id].amount;
    this.phase = 'bids';
    this.room.fx('gong');
    // Gebote vom niedrigsten zum höchsten aufdecken
    const ids = [...this.teams].sort((a, b) => this.bids[a.id].amount - this.bids[b.id].amount || this.bids[b.id].at - this.bids[a.id].at).map((t) => t.id);
    this.room.startReveal(`au-${this.round}`, ids, { ordered: true, autoMs: 1600 }, () => {
      const t = this.team(this.winner);
      this.room.announce(free ? `🎁 Freifrage für ${t.name}` : `🔨 ${t.name} ersteigert die Frage für ${this.stake}!`, 'round', free ? `Richtig = +${FREE_PTS}, falsch kostet nichts` : 'Richtig = Gebot dazu, falsch = Gebot weg');
      this.room.setTimer('phase', 3500, () => this.startAnswer());
    });
    this.changed();
  }

  startAnswer() {
    this.phase = 'answer';
    this.answer = null;
    this.room.setTimer('answer', this.opts.answerSeconds * 1000, () => this.submit(null, '', true));
    this.changed();
  }

  async submit(pid, text, timeout = false) {
    if (this.phase !== 'answer') throw new Error('Gerade wird nicht geantwortet.');
    if (!timeout && this.teamOf(pid)?.id !== this.winner) throw new Error('Nur das Team mit dem höchsten Gebot antwortet.');
    if (this.judging) return;
    this.room.clearTimer('answer');
    text = String(text || '').trim().slice(0, 100);
    this.answer = { pid, input: text };
    let res = { ok: false, by: 'auto' };
    if (text) {
      this.judging = true;
      this.changed();
      res = await judgeSingle(this.q.q, this.q, text, { ai: this.room.aiOn });
      this.judging = false;
      if (this.phase !== 'answer') return;
    }
    this.applyResult(res.ok, res.by);
    this.phase = 'result';
    this.room.fx(res.ok ? 'correct' : 'wrong');
    this.room.step(5000, () => this.nextRound(), this.round >= this.opts.rounds ? 'Zum Ergebnis' : 'Nächste Auktion');
    this.changed();
  }

  /** Punkte vergeben (bei Korrektur vorher zurücknehmen) */
  applyResult(ok, by) {
    const t = this.team(this.winner);
    if (this.result && t) t.score -= this.result.delta;
    const delta = this.stake === 0 ? (ok ? FREE_PTS : 0) : ok ? this.stake : -this.stake;
    if (t) t.score += delta;
    this.result = { ok, by, delta };
  }

  chatSay(pid, text) {
    const t = this.teamOf(pid);
    if (!t) throw new Error('Du bist in keinem Team.');
    text = String(text || '').trim().slice(0, 200);
    if (!text) return;
    this.chat[t.id] = [...this.chat[t.id], { id: ++this.chatSeq, pid, text }].slice(-50);
    this.changed();
  }

  finish() {
    this.room.clearAllTimers();
    this.room.finishGame(this.teamUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'bid') return this.bid(pid, a.amount);
    if (a.type === 'lock') return this.lock(pid);
    if (a.type === 'answer') return this.submit(pid, a.text);
    if (a.type === 'chat') return this.chatSay(pid, a.text);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    const r = this.room;
    if (a.type === 'override') {
      if (this.phase !== 'result') throw new Error('Nur beim Ergebnis möglich.');
      this.applyResult(!!a.ok, 'op');
      r.opAnnounce(by, a.ok ? 'wertet die Antwort als RICHTIG ✅' : 'wertet die Antwort als FALSCH ❌', `${this.team(this.winner)?.name}: ${this.result.delta >= 0 ? '+' : ''}${this.result.delta}`);
      r.addTime('phase', 3000);
    } else if (a.type === 'setBid') {
      // Operator: Gebot eines Teams korrigieren (vor dem Aufdecken)
      if (this.phase !== 'bid' || !this.bids[a.teamId]) throw new Error('Nur während geboten wird.');
      const t = this.team(a.teamId);
      const amount = Math.max(0, Math.min(Math.max(0, t.score), Math.round(Number(a.amount) / STEP) * STEP || 0));
      this.bids[a.teamId] = { ...this.bids[a.teamId], amount, at: Date.now() };
      r.opAnnounce(by, `setzt das Gebot von ${t.name} auf ${amount}`);
    } else if (a.type === 'swapQuestion') {
      if (!['bid', 'answer'].includes(this.phase)) throw new Error('Nur vor der Auflösung möglich.');
      this.q = this.drawQuestion();
      r.opAnnounce(by, 'tauscht die Frage 🔄', `Neue Kategorie: ${this.q.cat}`);
      if (this.phase === 'answer') r.setTimer('answer', this.opts.answerSeconds * 1000, () => this.submit(null, '', true));
    } else if (a.type === 'skip') {
      if (this.phase === 'bid') { r.opAnnounce(by, 'beendet das Bieten 🔨'); this.closeBids(); }
      else if (this.phase === 'answer') { r.opAnnounce(by, 'beendet die Antwortzeit ⏭'); this.submit(null, '', true); }
      else if (r.timers.has('phase')) { const t = r.timers.get('phase'); r.timers.delete('phase'); t.cb(); }
    } else if (a.type === 'addTime') {
      const key = ['vote', 'answer'].find((k) => r.timers.has(k));
      if (key) { r.addTime(key, 15000); r.opAnnounce(by, 'gibt 15 Sekunden extra ⏱'); }
    } else {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid, isOp) {
    const myTeam = this.teamOf(pid);
    const rv = this.room.reveal;
    const bidShown = (tid) => this.phase !== 'bid' && (rv?.key !== `au-${this.round}` || rv.shown.includes(tid));
    const showQ = ['answer', 'result'].includes(this.phase);
    return {
      type: 'auktion',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      cat: this.q ? { name: this.q.cat, icon: this.q.icon, lvl: this.q.lvl || 3 } : null,
      q: showQ ? this.q.q : null,
      a: this.phase === 'result' ? this.q.a : null,
      teams: this.teamsView(),
      myTeam: myTeam?.id || null,
      bids: this.bids ? Object.fromEntries(this.teams.map((t) => {
        const b = this.bids[t.id];
        const visible = isOp || t.id === myTeam?.id || bidShown(t.id);
        return [t.id, { amount: visible ? b.amount : null, by: visible ? b.by : null, locked: b.locked }];
      })) : null,
      winner: this.phase === 'bid' ? null : this.winner,
      stake: this.phase === 'bid' ? null : this.stake,
      answer: this.answer,
      judging: !!this.judging,
      result: this.phase === 'result' ? this.result : null,
      chat: isOp ? this.chat : myTeam ? { [myTeam.id]: this.chat[myTeam.id] } : {},
      canBid: this.phase === 'bid' && !!myTeam,
      canAnswer: this.phase === 'answer' && myTeam?.id === this.winner && !this.judging,
      timers: { vote: this.timer('vote'), answer: this.timer('answer'), phase: this.timer('phase') },
      opts: this.opts,
    };
  }
}
