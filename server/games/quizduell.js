// „Quiz Duell“ (Jeopardy-Stil): Spielbrett mit 6 Kategorien. Das Team am Zug wählt ein Feld,
// ein Teammitglied (reihum) tippt die Antwort. Liegt es falsch, dürfen die anderen Teams
// buzzern und klauen. Zwei Runden, in Runde 2 zählen die Felder doppelt.
import { Game, judgeSingle, shuffle } from './base.js';
import * as store from '../store.js';
import { QUIZ_CATEGORIES } from '../data/index.js';

const BASE_VALUES = { 3: [100, 200, 300], 4: [100, 200, 300, 400], 5: [100, 200, 300, 400, 500] };
const LEVELS = { 3: [1, 2, 3], 4: [1, 2, 3, 4], 5: [1, 2, 3, 4, 5] };

export class QuizDuell extends Game {
  static defaultOptions() {
    return { rounds: 2, rows: 4, cols: 6, answerSeconds: 30, buzzSeconds: 8, stealSeconds: 15, wrongPenalty: true, pickSeconds: 30 };
  }

  constructor(room, opts, teams) {
    super(room, opts, teams);
    this.round = 0;
    this.phase = 'intro';
    this.usedCats = new Set();
    this.usedQ = store.usedSet('quizduell');
    this.playedIds = [];
    this.board = null;
    this.turnIdx = Math.floor(Math.random() * this.teams.length) - 1;
    this.turn = null;
    this.picker = null;
    this.cur = null;
    this.log = [];
  }

  // ---------- Brett ----------
  pickQuestion(cat, lvl, taken) {
    const byLvl = (l) => cat.questions.filter((q) => q.lvl === l && !taken.has(q.id));
    let cands = byLvl(lvl);
    if (!cands.length) cands = [...byLvl(lvl + 1), ...byLvl(lvl - 1)];
    if (!cands.length) cands = cat.questions.filter((q) => !taken.has(q.id));
    const fresh = cands.filter((q) => !this.usedQ.has(q.id));
    const q = shuffle(fresh.length ? fresh : cands)[0];
    taken.add(q.id);
    return q;
  }

  makeColumn(cat) {
    const rows = this.opts.rows;
    const taken = new Set();
    return {
      id: cat.id, name: cat.name, icon: cat.icon,
      cells: LEVELS[rows].map((lvl, r) => ({
        value: BASE_VALUES[rows][r] * this.round,
        q: this.pickQuestion(cat, lvl, taken),
        used: false, wonBy: null,
      })),
    };
  }

  buildBoard() {
    // Bevorzugt Kategorien mit vielen ungespielten Fragen
    const avail = QUIZ_CATEGORIES.filter((c) => !this.usedCats.has(c.id));
    const scored = shuffle(avail).map((c) => ({ c, fresh: c.questions.filter((q) => !this.usedQ.has(q.id)).length }));
    scored.sort((a, b) => (b.fresh >= 8) - (a.fresh >= 8));
    const cats = scored.slice(0, this.opts.cols).map((x) => x.c);
    cats.forEach((c) => this.usedCats.add(c.id));
    this.board = cats.map((c) => this.makeColumn(c));
  }

  boardDone() {
    return this.board.every((col) => col.cells.every((c) => c.used));
  }

  // ---------- Ablauf ----------
  start() {
    this.nextRound();
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    this.round++;
    this.buildBoard();
    this.phase = 'intro';
    this.cur = null;
    if (this.round > 1) {
      // Wie im Original: Das Team mit den wenigsten Punkten fängt die neue Runde an
      const lowest = this.teams.reduce((lo, t, i) => (t.score < this.teams[lo].score ? i : lo), 0);
      this.turnIdx = lowest - 1;
    }
    if (this.round > 1) this.room.announce(`Runde ${this.round}`, 'round', 'Alle Felder zählen jetzt doppelt!');
    this.room.setTimer('phase', 7000, () => this.nextTurn());
    this.changed();
  }

  nextTurn() {
    if (this.boardDone()) return this.nextRound();
    this.turnIdx = (this.turnIdx + 1) % this.teams.length;
    this.turn = this.teams[this.turnIdx].id;
    this.picker = this.nextMember(this.teams[this.turnIdx]);
    this.phase = 'pick';
    this.cur = null;
    this.room.setTimer('pick', this.opts.pickSeconds * 1000, () => this.autoPick());
    this.changed();
  }

  autoPick() {
    const free = [];
    this.board.forEach((col, ci) => col.cells.forEach((c, ri) => { if (!c.used) free.push([ci, ri]); }));
    if (!free.length) return this.nextRound();
    free.sort((a, b) => a[1] - b[1]);
    const [ci, ri] = free[0];
    this.open(ci, ri);
  }

  pick(pid, col, row) {
    if (this.phase !== 'pick') throw new Error('Gerade wird kein Feld gewählt.');
    if (pid !== this.picker) throw new Error(`${this.name(this.picker)} wählt gerade.`);
    this.open(col, row);
  }

  open(col, row) {
    const cell = this.board[col]?.cells[row];
    if (!cell || cell.used) throw new Error('Feld nicht verfügbar.');
    this.room.clearTimer('pick');
    cell.used = true;
    this.playedIds.push(cell.q.id);
    this.seq++;
    this.cur = {
      col, row, value: cell.value, q: cell.q, cat: this.board[col].name, icon: this.board[col].icon,
      stage: 'answer', answerer: this.picker, teamId: this.turn, tried: [this.turn],
      attempts: [], judging: false, buzzed: null,
    };
    this.phase = 'answer';
    this.room.typing = null;
    this.room.fx('open');
    const seq = this.seq;
    const pid = this.picker;
    this.room.setTimer('answer', this.opts.answerSeconds * 1000, () => this.submit(pid, '', seq));
    this.changed();
  }

  async submit(pid, input, seqCheck) {
    const cur = this.cur;
    if (!cur || cur.judging || (seqCheck != null && seqCheck !== this.seq)) return;
    if (!['answer', 'steal'].includes(this.phase) || cur.answerer !== pid) return;
    const seq = this.seq;
    const text = String(input || '').slice(0, 160);
    cur.judging = true;
    cur.input = text;
    this.room.clearTimer('answer');
    this.changed();
    const res = await judgeSingle(cur.q.q, cur.q, text);
    cur.judging = false;
    if (seq !== this.seq || this.cur !== cur) return;
    this.applyResult(pid, text, res.ok, res.by, res.reason);
  }

  applyResult(pid, text, ok, by, reason) {
    const cur = this.cur;
    const team = this.teamOf(pid) || this.team(cur.teamId);
    const stage = this.phase;
    let penalty = 0;
    if (ok) team.score += cur.value;
    else if (this.opts.wrongPenalty) {
      penalty = Math.round(cur.value / 2);
      team.score -= penalty;
    }
    const entry = { id: ++this.seq, pid, teamId: team.id, input: text, ok, by, reason, value: cur.value, penalty, stage, q: cur.q.q, a: cur.q.a, cell: [cur.col, cur.row] };
    cur.attempts.push(entry);
    this.log.unshift(entry);
    this.log = this.log.slice(0, 50);
    this.room.typing = null;
    this.room.fx(ok ? 'correct' : 'wrong');
    if (ok) return this.reveal(team.id);
    // Falsch: andere Teams dürfen buzzern
    const left = this.teams.filter((t) => !cur.tried.includes(t.id) && t.members.some((m) => this.connected(m)));
    if (!left.length) return this.reveal(null);
    this.phase = 'buzz';
    cur.stage = 'buzz';
    cur.answerer = null;
    cur.buzzed = null;
    this.room.setTimer('buzz', this.opts.buzzSeconds * 1000, () => this.reveal(null));
    this.changed();
  }

  buzz(pid) {
    const cur = this.cur;
    if (this.phase !== 'buzz' || !cur) throw new Error('Buzzer ist gerade nicht frei.');
    const team = this.teamOf(pid);
    if (!team || cur.tried.includes(team.id)) throw new Error('Dein Team hat schon geantwortet.');
    this.room.clearTimer('buzz');
    cur.tried.push(team.id);
    cur.buzzed = pid;
    cur.answerer = pid;
    cur.teamId = team.id;
    cur.stage = 'steal';
    cur.input = undefined;
    this.phase = 'steal';
    this.seq++;
    const seq = this.seq;
    this.room.fx('buzz', { pid });
    this.room.setTimer('answer', this.opts.stealSeconds * 1000, () => this.submit(pid, '', seq));
    this.changed();
  }

  reveal(winnerTeamId) {
    const cur = this.cur;
    this.room.clearTimer('answer');
    this.room.clearTimer('buzz');
    const cell = this.board[cur.col].cells[cur.row];
    cell.wonBy = winnerTeamId;
    cur.stage = 'reveal';
    cur.winner = winnerTeamId;
    this.phase = 'reveal';
    this.seq++;
    this.room.setTimer('phase', winnerTeamId ? 4500 : 6000, () => this.nextTurn());
    this.changed();
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('quizduell', this.playedIds);
    this.room.finishGame(this.teamUnits(), { scoreLabel: 'Punkte' });
  }

  // ---------- Aktionen ----------
  act(pid, a) {
    if (a.type === 'pick') return this.pick(pid, a.col, a.row);
    if (a.type === 'buzz') return this.buzz(pid);
    if (a.type === 'answer') return this.submit(pid, a.text);
    throw new Error('Unbekannte Aktion');
  }

  canType(pid) {
    return this.cur?.answerer === pid && ['answer', 'steal'].includes(this.phase) && !this.cur.judging;
  }

  op(by, a) {
    const r = this.room;
    switch (a.type) {
      case 'override': {
        const e = this.log.find((x) => x.id === a.id);
        if (!e || e.ok === a.ok) return;
        const team = this.team(e.teamId);
        if (a.ok) {
          team.score += e.value + e.penalty;
          e.penalty = 0;
        } else {
          e.penalty = this.opts.wrongPenalty ? Math.round(e.value / 2) : 0;
          team.score -= e.value + e.penalty;
        }
        e.ok = a.ok;
        e.by = 'op';
        r.opAnnounce(by, `wertet die Antwort von ${this.name(e.pid)} als ${a.ok ? 'RICHTIG ✅' : 'FALSCH ❌'}`,
          `„${e.input || '–'}“ · ${a.ok ? '+' : '−'}${e.value} für ${team.name}`);
        // Läuft die Frage noch, ist sie damit entschieden
        if (a.ok && this.cur && this.cur.col === e.cell[0] && this.cur.row === e.cell[1] && this.phase !== 'reveal') {
          this.seq++;
          this.cur.judging = false;
          this.reveal(team.id);
        } else if (this.board[e.cell[0]]) {
          const cell = this.board[e.cell[0]].cells[e.cell[1]];
          if (a.ok) cell.wonBy = team.id;
          else if (cell.wonBy === team.id) cell.wonBy = null;
          if (this.cur && this.cur.col === e.cell[0] && this.cur.row === e.cell[1]) this.cur.winner = cell.wonBy;
        }
        break;
      }
      case 'pickFor': {
        if (this.phase !== 'pick') throw new Error('Gerade wird kein Feld gewählt.');
        r.opAnnounce(by, `wählt für ${this.team(this.turn).name}: ${this.board[a.col].name} – ${this.board[a.col].cells[a.row].value}`);
        this.open(a.col, a.row);
        break;
      }
      case 'reroll': {
        const col = this.board?.[a.col];
        if (!col || col.cells.some((c) => c.used)) throw new Error('Nur unberührte Kategorien können getauscht werden.');
        const avail = shuffle(QUIZ_CATEGORIES.filter((c) => !this.usedCats.has(c.id)));
        if (!avail.length) throw new Error('Keine weiteren Kategorien.');
        this.usedCats.add(avail[0].id);
        this.board[a.col] = this.makeColumn(avail[0]);
        r.opAnnounce(by, `tauscht „${col.name}“ gegen „${avail[0].name}“ 🔄`);
        break;
      }
      case 'skip': {
        if (['answer', 'buzz', 'steal'].includes(this.phase)) {
          r.opAnnounce(by, 'löst die Frage auf ⏭');
          this.seq++;
          if (this.cur) this.cur.judging = false;
          this.reveal(null);
        } else if (r.timers.has('phase')) {
          const t = r.timers.get('phase');
          r.timers.delete('phase');
          t.cb();
          r.opAnnounce(by, 'springt weiter ⏭');
        } else if (this.phase === 'pick') {
          r.opAnnounce(by, `überspringt den Zug von ${this.team(this.turn).name}`);
          r.clearTimer('pick');
          this.nextTurn();
        }
        break;
      }
      case 'endRound': {
        r.clearAllTimers();
        for (const col of this.board) for (const c of col.cells) c.used = true;
        r.opAnnounce(by, `beendet Runde ${this.round}`);
        this.cur = null;
        this.nextRound();
        break;
      }
      case 'addTime': {
        const key = ['answer', 'buzz', 'pick'].find((k) => r.timers.has(k));
        if (key) { r.addTime(key, 10000); r.opAnnounce(by, 'gibt 10 Sekunden extra ⏱'); }
        break;
      }
      default:
        throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    const cur = this.cur;
    const myTeam = this.teamOf(pid);
    return {
      type: 'quizduell',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      teams: this.teamsView(),
      turn: this.turn,
      picker: this.picker,
      board: this.board?.map((col) => ({
        id: col.id, name: col.name, icon: col.icon,
        cells: col.cells.map((c) => ({ value: c.value, used: c.used, wonBy: c.wonBy })),
      })),
      cur: cur && {
        col: cur.col, row: cur.row, value: cur.value, cat: cur.cat, icon: cur.icon, q: cur.q.q,
        stage: cur.stage, answerer: cur.answerer, teamId: cur.teamId, tried: cur.tried,
        judging: cur.judging, input: cur.judging || cur.stage === 'reveal' ? cur.input : undefined,
        attempts: cur.attempts, winner: cur.winner,
        a: cur.stage === 'reveal' ? cur.q.a : undefined,
      },
      log: this.log.slice(0, 10),
      timers: { answer: this.timer('answer'), buzz: this.timer('buzz'), pick: this.timer('pick'), phase: this.timer('phase') },
      canPick: this.phase === 'pick' && this.picker === pid,
      canAnswer: !!cur && ['answer', 'steal'].includes(this.phase) && cur.answerer === pid && !cur.judging,
      canBuzz: this.phase === 'buzz' && !!myTeam && !cur.tried.includes(myTeam.id),
      opts: this.opts,
    };
  }
}
