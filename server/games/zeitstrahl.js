// „Zeitstrahl“: Auf dem Strahl liegt eine Startkarte (z. B. „Erstes iPhone – 2007“).
// Reihum bekommt jeder mehrere zufällige Karten zur Auswahl, sucht sich eine aus und legt
// sie an die passende Stelle – je Strahl nach Jahr ODER nach Preis, Karten bunt gemischt.
// Richtig: Punkte (je voller der Strahl, desto mehr). Die anderen wetten mit: richtig/falsch?
import { SoloGame, shuffle } from './base.js';
import { ZEITSTRAHL } from '../data/index.js';

const DIMS = {
  jahr: { label: 'Jahr', title: 'Wann war das?' },
  preis: { label: 'Preis', title: 'Was kostet das?' },
};
const BET = 50;

export class Zeitstrahl extends SoloGame {
  static defaultOptions() {
    return { lines: 2, turns: 3, choices: 3, turnSeconds: 45, betSeconds: 12, years: true, prices: true };
  }

  constructor(room, opts) {
    super(room, opts);
    this.dims = [opts.years && 'jahr', opts.prices && 'preis'].filter((d) => d && ZEITSTRAHL[d]?.length);
    if (!this.dims.length) this.dims = ['jahr'];
    this.lineNo = 0;
    this.phase = 'intro';
    this.line = [];
  }

  start() {
    this.room.step(6000, () => this.newLine(), 'Erster Strahl');
  }

  newLine() {
    if (this.lineNo >= this.opts.lines) return this.finish();
    this.dim = this.dims[this.lineNo % this.dims.length];
    this.lineNo++;
    this.deck = shuffle(ZEITSTRAHL[this.dim]);
    this.line = [{ ...this.deck.shift(), anchor: true, ok: true }];
    const players = shuffle(this.online());
    this.queue = Array.from({ length: this.opts.turns }, () => players).flat();
    this.turnNo = 0;
    this.turnsTotal = this.queue.length;
    this.room.announce(`📏 Strahl ${this.lineNo}: ${DIMS[this.dim].title}`, 'round', `Sortiert nach ${DIMS[this.dim].label}`);
    this.nextTurn();
  }

  nextTurn() {
    let pid = this.queue.shift();
    while (pid && !this.room.players.has(pid)) pid = this.queue.shift();
    if (!pid || !this.deck.length) return this.newLine();
    this.turnNo++;
    this.current = pid;
    this.offer = this.deck.splice(0, Math.max(1, this.opts.choices));
    this.placed = null;
    this.bets = {};
    this.turnResult = null;
    this.phase = 'place';
    this.room.setTimer('answer', this.opts.turnSeconds * 1000, () => this.timeout());
    this.changed();
  }

  timeout() {
    if (this.phase !== 'place') return;
    this.room.announce(`⏰ ${this.name(this.current)} war zu langsam`, 'op', 'Keine Punkte in diesem Zug');
    this.deck.push(...this.offer);
    this.room.step(1500, () => this.nextTurn(), 'Nächster Zug');
    this.phase = 'skipped';
    this.changed();
  }

  place(pid, cardId, gap) {
    if (this.phase !== 'place' || pid !== this.current) throw new Error('Du bist gerade nicht dran.');
    const card = this.offer.find((c) => c.id === cardId);
    gap = Number(gap);
    if (!card) throw new Error('Diese Karte gibt es nicht.');
    if (!Number.isInteger(gap) || gap < 0 || gap > this.line.length) throw new Error('Ungültige Stelle.');
    this.room.clearTimer('answer');
    this.placed = { card, gap };
    this.deck.push(...this.offer.filter((c) => c.id !== cardId));
    this.phase = 'bet';
    const others = this.online().filter((p) => p !== pid);
    if (!others.length) return this.resolve();
    this.room.setTimer('vote', this.opts.betSeconds * 1000, () => this.resolve());
    this.changed();
  }

  bet(pid, ok) {
    if (this.phase !== 'bet' || pid === this.current) throw new Error('Gerade kannst du nicht wetten.');
    this.bets[pid] = !!ok;
    if (this.online().filter((p) => p !== this.current).every((p) => p in this.bets)) this.room.setTimer('vote', 700, () => this.resolve());
    this.changed();
  }

  /** Liegt v zwischen den Nachbarn an Stelle gap? (Gleichstand zählt als richtig) */
  fits(v, gap) {
    const left = this.line[gap - 1], right = this.line[gap];
    return (!left || left.v <= v) && (!right || v <= right.v);
  }

  resolve() {
    if (this.phase !== 'bet') return;
    this.room.clearTimer('vote');
    const { card, gap } = this.placed;
    const ok = this.fits(card.v, gap);
    const lenBefore = this.line.length;
    // Karte kommt in jedem Fall an die richtige Stelle (bei Fehler rot markiert)
    let at = this.line.findIndex((c) => c.v > card.v);
    if (at < 0) at = this.line.length;
    if (ok) at = gap;
    this.line.splice(at, 0, { ...card, ok, by: this.current });
    this.turnResult = { cardId: card.id, gap, at, lenBefore, delta: {} };
    {
      const left = this.line[gap - 1], right = this.line[gap];
      const where = left && right ? `zwischen „${left.t}“ und „${right.t}“` : left ? `nach „${left.t}“` : right ? `vor „${right.t}“` : '';
      this.room.moment('timeline', { pids: [this.current], q: DIMS[this.dim].title, text: `${card.t}: ${card.v}${this.dim === 'preis' ? ' €' : ''}`, ok, note: `gelegt ${where}`, score: ok ? (lenBefore >= 6 ? 3 : 1) : 2, tags: [ok ? 'schlau' : 'lustig'] });
    }
    this.applyScore(ok);
    this.phase = 'result';
    this.room.fx(ok ? 'correct' : 'wrong');
    const last = !this.queue.length || !this.deck.length;
    this.room.step(3500, () => this.nextTurn(), last ? (this.lineNo >= this.opts.lines ? 'Zum Ergebnis' : 'Nächster Strahl') : 'Nächster Zug');
    this.changed();
  }

  /** Punkte des Zuges (bei Korrektur vorher zurücknehmen) */
  applyScore(ok) {
    const r = this.turnResult;
    for (const [p, d] of Object.entries(r.delta)) if (p in this.scores) this.scores[p] -= d;
    const delta = {};
    const add = (p, n) => { if (p in this.scores && n) { delta[p] = (delta[p] || 0) + n; this.scores[p] += n; } };
    if (ok) add(this.current, 100 + 20 * (r.lenBefore - 1));
    for (const [p, b] of Object.entries(this.bets)) if (b === ok) add(p, BET);
    r.ok = ok;
    r.delta = delta;
    r.pts = delta[this.current] || 0;
  }

  finish() {
    this.room.clearAllTimers();
    this.room.finishGame(this.soloUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'place') return this.place(pid, a.cardId, a.gap);
    if (a.type === 'bet') return this.bet(pid, a.ok);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    const r = this.room;
    if (a.type === 'flip') {
      // Operator: Zug doch anders werten (z. B. Preis umstritten)
      if (this.phase !== 'result') throw new Error('Nur direkt nach dem Zug möglich.');
      const ok = !this.turnResult.ok;
      const c = this.line.find((x) => x.id === this.turnResult.cardId);
      if (c) c.ok = ok;
      this.applyScore(ok);
      r.opAnnounce(by, ok ? `wertet den Zug von ${this.name(this.current)} als RICHTIG ✅` : `wertet den Zug von ${this.name(this.current)} als FALSCH ❌`, 'Punkte wurden neu berechnet');
      r.addTime('phase', 3000);
    } else if (a.type === 'skip') {
      if (this.phase === 'place') { r.opAnnounce(by, `überspringt den Zug von ${this.name(this.current)} ⏭`); r.clearTimer('answer'); this.timeout(); }
      else if (this.phase === 'bet') { r.opAnnounce(by, 'beendet die Wetten ⏭'); this.resolve(); }
      else this.baseOp(by, a);
    } else if (!this.baseOp(by, a)) {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    const show = ['result', 'skipped', 'intro'].includes(this.phase);
    const r = this.turnResult;
    return {
      type: 'zeitstrahl',
      phase: this.phase,
      line: this.lineNo,
      lines: this.opts.lines,
      dim: this.dim || null,
      dimLabel: this.dim ? DIMS[this.dim].label : null,
      title: this.dim ? DIMS[this.dim].title : null,
      turnNo: this.turnNo || 0,
      turnsTotal: this.turnsTotal || 0,
      // Werte der gerade gelegten Karte erst nach der Auflösung zeigen
      cards: this.line.map((c) => ({ id: c.id, t: c.t, e: c.e, v: show || c.id !== r?.cardId ? c.v : null, ok: c.ok, anchor: !!c.anchor, by: c.by, fresh: c.id === r?.cardId })),
      current: this.current || null,
      offer: this.phase === 'place' ? this.offer.map((c) => ({ id: c.id, t: c.t, e: c.e })) : null,
      placed: this.placed ? { card: { id: this.placed.card.id, t: this.placed.card.t, e: this.placed.card.e, v: show ? this.placed.card.v : null }, gap: this.placed.gap } : null,
      bets: this.phase === 'bet' ? Object.keys(this.bets) : this.bets || {},
      myBet: this.bets?.[pid] ?? null,
      result: this.phase === 'result' ? r : null,
      scores: this.scoreList(),
      canPlace: this.phase === 'place' && pid === this.current,
      canBet: this.phase === 'bet' && pid !== this.current && !(pid in (this.bets || {})),
      timers: { answer: this.timer('answer'), vote: this.timer('vote'), phase: this.timer('phase') },
      opts: this.opts,
    };
  }
}
