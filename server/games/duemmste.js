// „Der Dümmste fliegt“: Reihum schnelle Fragen, nach Ablauf der Rundenzeit wählen alle
// den „Dümmsten“ – wer die meisten Stimmen hat, verliert ein Leben. Gleichstand = Stechen
// (abwechselnd Fragen, bis einer falsch und der andere richtig liegt). Bleiben zwei übrig,
// entscheidet das Finale im Stechen-Modus. Wer alle Leben verliert, fliegt.
import { Game, judgeSingle, drawFresh, shuffle } from './base.js';
import * as store from '../store.js';
import { DUEMMSTE } from '../data/index.js';

export class Duemmste extends Game {
  static defaultOptions() {
    return { lives: 3, roundSeconds: 150, answerSeconds: 12, voteSeconds: 40 };
  }

  constructor(room, opts) {
    super(room, opts, null);
    this.players = room.allIds();
    this.lives = Object.fromEntries(this.players.map((p) => [p, opts.lives]));
    this.eliminated = [];
    this.round = 0;
    this.phase = 'intro';
    this.stats = {};
    this.total = Object.fromEntries(this.players.map((p) => [p, { c: 0, w: 0 }]));
    this.feed = [];
    this.current = null;
    this.last = null;
    this.order = shuffle(this.players);
    this.orderIdx = -1;
    this.roundOver = false;
    this.votes = {};
    this.voteResult = null;
    this.duel = null;
    this.lastLoss = null;
    this.pool = drawFresh('duemmste', DUEMMSTE, DUEMMSTE.length, store.usedSet('duemmste'));
    this.poolIdx = 0;
    this.usedIds = [];
  }

  alive() {
    return this.players.filter((p) => this.lives[p] > 0 && this.room.players.has(p));
  }

  nextQuestion() {
    const q = this.pool[this.poolIdx++ % this.pool.length];
    this.usedIds.push(q.id);
    return q;
  }

  start() {
    this.phase = 'intro';
    this.room.setTimer('phase', 7000, () => this.startRound());
  }

  onPlayerJoined(pid) {
    // Späteinsteiger schauen zu (sie hätten sonst unfair viele Leben)
    if (!(pid in this.lives)) { this.lives[pid] = 0; this.total[pid] = { c: 0, w: 0 }; }
  }

  onPlayerRemoved(pid) {
    this.players = this.players.filter((p) => p !== pid);
    if (this.current?.pid === pid) this.skip();
  }

  // ---------- Fragerunde ----------
  startRound() {
    const alive = this.alive();
    if (alive.length <= 1) return this.finish();
    if (alive.length === 2) return this.startDuel(alive, 'final');
    this.round++;
    this.phase = 'questions';
    this.stats = Object.fromEntries(alive.map((p) => [p, { c: 0, w: 0 }]));
    this.feed = [];
    this.roundOver = false;
    this.votes = {};
    this.voteResult = null;
    this.lastLoss = null;
    this.last = null;
    this.room.setTimer('round', this.opts.roundSeconds * 1000, () => {
      this.roundOver = true;
      if (this.phase === 'questions' && !this.current) this.startVote();
    });
    this.room.announce(`Runde ${this.round}`, 'round', `${this.opts.roundSeconds >= 60 ? `${Math.round(this.opts.roundSeconds / 6) / 10} Minuten` : `${this.opts.roundSeconds} Sekunden`} Fragen – dann wird gewählt`);
    this.room.setTimer('phase', 2500, () => this.ask());
  }

  ask() {
    if (this.roundOver) return this.startVote();
    const alive = this.alive();
    let pid = null;
    for (let i = 0; i < this.order.length; i++) {
      this.orderIdx = (this.orderIdx + 1) % this.order.length;
      const cand = this.order[this.orderIdx];
      if (alive.includes(cand) && this.connected(cand)) { pid = cand; break; }
    }
    if (!pid) {
      this.room.setTimer('phase', 2000, () => this.ask());
      return;
    }
    this.pose(pid, 'questions');
  }

  pose(pid, phase) {
    const q = this.nextQuestion();
    this.seq++;
    this.current = { pid, q, seq: this.seq, answered: false, judging: false };
    this.phase = phase;
    this.room.typing = null;
    this.room.setTimer('answer', this.opts.answerSeconds * 1000, () => this.submit(pid, '', true));
    this.changed();
  }

  async submit(pid, input) {
    const cur = this.current;
    if (!cur || cur.pid !== pid || cur.answered) return;
    cur.answered = true;
    cur.input = String(input || '').slice(0, 120);
    cur.judging = true;
    this.room.clearTimer('answer');
    this.changed();
    const res = await judgeSingle(cur.q.q, cur.q, cur.input);
    if (this.current !== cur) return;
    this.resolve(cur, res.ok, res.by, res.reason);
  }

  resolve(cur, ok, by, reason) {
    const entry = {
      id: cur.seq, pid: cur.pid, q: cur.q.q, a: cur.q.a, input: cur.input, ok, by, reason,
      context: this.duel ? 'duel' : 'round',
    };
    this.last = entry;
    this.feed.unshift(entry);
    this.feed = this.feed.slice(0, 40);
    if (this.duel) {
      this.duel.results[cur.pid] = ok;
    } else {
      const s = this.stats[cur.pid] || (this.stats[cur.pid] = { c: 0, w: 0 });
      s[ok ? 'c' : 'w']++;
    }
    const t = this.total[cur.pid] || (this.total[cur.pid] = { c: 0, w: 0 });
    t[ok ? 'c' : 'w']++;
    this.current = null;
    this.room.typing = null;
    this.phase = this.duel ? 'duelReveal' : 'reveal';
    this.room.fx(ok ? 'correct' : 'wrong');
    this.room.setTimer('phase', ok ? 2200 : 3200, () => (this.duel ? this.duelNext() : this.ask()));
    this.changed();
  }

  skip() {
    if (!this.current) return;
    this.current = null;
    this.room.clearTimer('answer');
    this.room.typing = null;
    this.room.setTimer('phase', 600, () => (this.duel ? this.duelNext() : this.ask()));
  }

  // ---------- Abstimmung ----------
  startVote() {
    this.room.clearTimer('round');
    this.room.clearTimer('answer');
    this.room.clearTimer('phase');
    this.current = null;
    this.roundOver = true;
    this.phase = 'vote';
    this.votes = {};
    this.room.fx('gong');
    this.room.setTimer('vote', this.opts.voteSeconds * 1000, () => this.closeVote());
    this.changed();
  }

  vote(pid, target) {
    if (this.phase !== 'vote') throw new Error('Gerade wird nicht abgestimmt.');
    const alive = this.alive();
    if (!alive.includes(pid)) throw new Error('Nur Spieler mit Leben dürfen abstimmen.');
    if (!alive.includes(target) || target === pid) throw new Error('Ungültige Wahl.');
    this.votes[pid] = target;
    if (alive.filter((p) => this.connected(p)).every((p) => this.votes[p])) {
      this.room.setTimer('vote', 1200, () => this.closeVote());
    }
    this.changed();
  }

  closeVote() {
    if (this.phase !== 'vote') return;
    this.room.clearTimer('vote');
    const alive = this.alive();
    const counts = Object.fromEntries(alive.map((p) => [p, 0]));
    for (const target of Object.values(this.votes)) if (target in counts) counts[target]++;
    const max = Math.max(0, ...Object.values(counts));
    const top = alive.filter((p) => counts[p] === max);
    this.voteResult = { votes: { ...this.votes }, counts, top, max };
    this.phase = 'voteReveal';
    if (top.length === 1) {
      this.room.setTimer('phase', 4500, () => {
        this.loseLife(top[0], `${max} ${max === 1 ? 'Stimme' : 'Stimmen'}`);
        this.room.setTimer('phase', 5000, () => this.startRound());
      });
    } else {
      this.room.setTimer('phase', 5000, () => this.startDuel(top, 'tie'));
    }
    this.changed();
  }

  loseLife(pid, reason) {
    this.lives[pid] = Math.max(0, (this.lives[pid] || 0) - 1);
    this.lastLoss = { pid, reason, left: this.lives[pid] };
    if (this.lives[pid] === 0) {
      this.eliminated.push({ pid, round: this.round });
      this.room.announce(`💀 ${this.name(pid)} fliegt raus!`, 'out', reason);
      this.room.fx('out');
    } else {
      this.room.announce(`💔 ${this.name(pid)} verliert ein Leben`, 'heart', `${reason} – noch ${this.lives[pid]} ${this.lives[pid] === 1 ? 'Leben' : 'Leben'}`);
      this.room.fx('lose');
    }
    this.changed();
  }

  // ---------- Stechen / Finale ----------
  startDuel(pids, mode) {
    this.room.clearTimer('round');
    this.duel = { mode, players: [...pids], remaining: [...pids], results: {}, round: 1 };
    this.phase = 'duelIntro';
    this.current = null;
    if (mode === 'final') {
      this.room.announce('🔥 Finale!', 'final', `${pids.map((p) => this.name(p)).join(' gegen ')} – wer falsch liegt, während der andere richtig liegt, verliert ein Leben`);
    } else {
      this.room.announce('⚔️ Gleichstand – Stechen!', 'duel', `${pids.map((p) => this.name(p)).join(', ')}: abwechselnd Fragen, bis einer patzt`);
    }
    this.room.setTimer('phase', 5000, () => this.duelNext());
    this.changed();
  }

  duelNext() {
    const d = this.duel;
    if (!d) return;
    const pending = d.remaining.filter((p) => !(p in d.results) && this.room.players.has(p));
    if (pending.length) return this.pose(pending[0], 'duel');
    const wrong = d.remaining.filter((p) => !d.results[p]);
    const right = d.remaining.filter((p) => d.results[p]);
    if (wrong.length && right.length) d.remaining = wrong;
    d.results = {};
    d.round++;
    if (d.remaining.length > 1) return this.duelNext();
    const loser = d.remaining[0];
    this.phase = 'duelResult';
    this.loseLife(loser, d.mode === 'final' ? 'Finale' : 'Stechen verloren');
    this.room.setTimer('phase', 5000, () => {
      const alive = this.alive();
      if (alive.length <= 1) return this.finish();
      if (d.mode === 'final') return this.startDuel(alive, 'final');
      this.duel = null;
      this.startRound();
    });
  }

  // ---------- Ende ----------
  finish() {
    this.room.clearAllTimers();
    const alive = this.alive();
    const out = [...this.eliminated].reverse().map((e) => e.pid);
    const ordered = [...alive.sort((a, b) => this.lives[b] - this.lives[a]), ...out];
    const units = ordered.filter((pid) => this.room.players.has(pid)).map((pid, i) => ({
      label: this.name(pid),
      color: null,
      score: this.total[pid]?.c || 0,
      rankOverride: alive.includes(pid) ? 1 : i + 1,
      profileIds: [this.room.players.get(pid).profileId],
    }));
    store.markUsed('duemmste', this.usedIds);
    this.room.finishGame(units, { scoreLabel: 'richtig' });
  }

  // ---------- Aktionen ----------
  act(pid, a) {
    if (a.type === 'answer') return this.submit(pid, a.text);
    if (a.type === 'vote') return this.vote(pid, a.target);
    throw new Error('Unbekannte Aktion');
  }

  canType(pid) {
    return this.current?.pid === pid && !this.current.answered;
  }

  op(by, a) {
    const r = this.room;
    switch (a.type) {
      case 'override': {
        const e = this.feed.find((x) => x.id === a.id);
        if (!e || e.ok === a.ok) return;
        if (e.context === 'duel' && !(this.duel && e.pid in this.duel.results)) {
          throw new Error('Das Stechen ist schon ausgewertet – nutze „Leben ±“.');
        }
        e.ok = a.ok;
        e.by = 'op';
        if (e.context === 'duel') this.duel.results[e.pid] = a.ok;
        else if (this.stats[e.pid]) {
          this.stats[e.pid][a.ok ? 'c' : 'w']++;
          this.stats[e.pid][a.ok ? 'w' : 'c']--;
        }
        if (this.total[e.pid]) {
          this.total[e.pid][a.ok ? 'c' : 'w']++;
          this.total[e.pid][a.ok ? 'w' : 'c']--;
        }
        r.opAnnounce(by, `wertet die Antwort von ${this.name(e.pid)} als ${a.ok ? 'RICHTIG ✅' : 'FALSCH ❌'}`, `„${e.input || '–'}“ · Frage: ${e.q}`);
        break;
      }
      case 'skip':
        if (this.current) {
          r.opAnnounce(by, 'überspringt die Frage', this.current.q.q);
          this.skip();
        } else if (r.timers.has('phase')) {
          const t = r.timers.get('phase');
          r.timers.delete('phase');
          t.cb();
          r.opAnnounce(by, 'springt weiter');
        }
        break;
      case 'endRound':
        if (this.phase === 'questions' || this.phase === 'reveal') {
          this.current = null;
          r.opAnnounce(by, 'beendet die Fragerunde – jetzt wird abgestimmt!');
          this.startVote();
        }
        break;
      case 'closeVote':
        r.opAnnounce(by, 'beendet die Abstimmung');
        this.closeVote();
        break;
      case 'lives': {
        const pid = a.pid;
        if (!(pid in this.lives)) return;
        const before = this.lives[pid];
        this.lives[pid] = Math.max(0, Math.min(9, before + a.delta));
        if (before === 0 && this.lives[pid] > 0) this.eliminated = this.eliminated.filter((e) => e.pid !== pid);
        if (before > 0 && this.lives[pid] === 0) this.eliminated.push({ pid, round: this.round });
        if (!this.players.includes(pid)) this.players.push(pid);
        if (!this.order.includes(pid)) this.order.push(pid);
        r.opAnnounce(by, `${a.delta > 0 ? 'gibt' : 'nimmt'} ${this.name(pid)} ${a.delta > 0 ? 'ein Leben' : 'ein Leben weg'} ${a.delta > 0 ? '❤️' : '💔'}`, `jetzt ${this.lives[pid]} Leben`);
        break;
      }
      case 'addTime': {
        const key = ['answer', 'vote', 'round'].find((k) => r.timers.has(k));
        if (key) { r.addTime(key, 10000); r.opAnnounce(by, 'gibt 10 Sekunden extra ⏱'); }
        break;
      }
      default:
        throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    const alive = this.alive();
    const showVotes = this.phase !== 'vote';
    return {
      type: 'duemmste',
      phase: this.phase,
      round: this.round,
      lives: this.lives,
      maxLives: this.opts.lives,
      players: this.players.filter((p) => this.room.players.has(p)),
      alive,
      eliminated: this.eliminated,
      current: this.current && {
        pid: this.current.pid, q: this.current.q.q, cat: this.current.q.cat,
        judging: this.current.judging, answered: this.current.answered,
        input: this.current.answered ? this.current.input : undefined,
      },
      last: this.last,
      feed: this.feed.slice(0, 12),
      stats: this.stats,
      total: this.total,
      roundOver: this.roundOver,
      timers: {
        round: this.timer('round'), answer: this.timer('answer'), vote: this.timer('vote'), phase: this.timer('phase'),
      },
      vote: this.phase === 'vote' ? { voted: Object.keys(this.votes), mine: this.votes[pid] || null } : null,
      voteResult: showVotes ? this.voteResult : null,
      duel: this.duel && { ...this.duel },
      lastLoss: this.lastLoss,
      canAnswer: this.current?.pid === pid && !this.current.answered,
      canVote: this.phase === 'vote' && alive.includes(pid) && !this.votes[pid],
      opts: this.opts,
    };
  }
}
