// „Das Verhör“: Die KI denkt sich einen Begriff aus (Tier, Promi, Ort …). Ihr stellt
// Ja/Nein-Fragen und versucht ihn zu erraten.
// Modus „Alle gegen die KI“: Ihr habt gemeinsam eine begrenzte Zahl an Fragen. Löst ihr,
// bekommt ihr den Punkt, sonst die KI. Modus „Teams“: Die Teams fragen abwechselnd –
// wer zuerst löst, holt die Punkte (je weniger Fragen gebraucht, desto mehr).
// Ohne KI (oder wenn sie hängt) beantwortet der Operator die Fragen per Klick.
import { Game, drawFresh, judgeSingle, aiAsk } from './base.js';
import { matchAnswer } from '../matcher.js';
import * as store from '../store.js';
import { VERHOER } from '../data/index.js';

const ANSWERS = ['ja', 'nein', 'teilweise', 'unklar'];

export class Verhoer extends Game {
  static defaultOptions() {
    return { teamMode: false, rounds: 4, maxQuestions: 20, roundSeconds: 300, turnSeconds: 45 };
  }

  constructor(room, opts, teams) {
    super(room, opts, teams);
    this.secrets = drawFresh('verhoer', VERHOER, opts.rounds + 6, store.usedSet('verhoer'));
    this.si = 0;
    this.round = 0;
    this.phase = 'intro';
    this.personal = {};
    this.tally = { players: 0, ki: 0 };
    this.qseq = 0;
    for (const p of this.allPlayers()) this.personal[p] = 0;
  }

  get teamMode() {
    return !!this.opts.teamMode && this.teams.length > 1;
  }

  allPlayers() {
    return this.teams.flatMap((t) => t.members);
  }

  onPlayerJoined(pid) {
    super.onPlayerJoined(pid);
    this.personal[pid] ??= 0;
  }

  start() {
    this.room.step(6000, () => this.nextRound(), 'Erster Begriff');
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    this.secret = this.secrets[this.si++ % this.secrets.length];
    this.round++;
    this.questions = [];
    this.guessesLeft = {};
    this.win = null;
    this.phase = 'ask';
    this.turnIdx = -1;
    this.room.setTimer('round', this.opts.roundSeconds * 1000, () => this.endRound(null, 'Die Zeit ist um!'));
    if (this.teamMode) this.nextTurn();
    this.changed();
  }

  // ---------- Team-Modus: Teams sind abwechselnd dran ----------
  nextTurn() {
    if (!this.teamMode || this.phase !== 'ask') return;
    this.turnIdx = (this.turnIdx + 1) % this.teams.length;
    this.turn = this.teams[this.turnIdx].id;
    this.room.setTimer('answer', this.opts.turnSeconds * 1000, () => {
      this.room.announce(`⏰ ${this.team(this.turn)?.name} war zu langsam`, 'op', 'Das nächste Team ist dran');
      this.nextTurn();
    });
    this.changed();
  }

  canAct(pid) {
    if (this.phase !== 'ask') return false;
    if (!this.teamMode) return true;
    return this.teamOf(pid)?.id === this.turn && !this.questions.some((q) => q.pending && q.teamId === this.turn);
  }

  asked() {
    return this.questions.filter((q) => !q.solve).length;
  }

  left() {
    return Math.max(0, this.opts.maxQuestions - this.asked());
  }

  async ask(pid, text) {
    if (!this.canAct(pid)) throw new Error(this.teamMode ? 'Dein Team ist gerade nicht dran.' : 'Gerade kann nicht gefragt werden.');
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    if (text.length < 3) throw new Error('Stell eine Ja/Nein-Frage.');
    if (!this.left()) throw new Error('Keine Fragen mehr übrig – jetzt nur noch lösen!');
    if (!this.teamMode && this.questions.some((q) => q.pending && q.pid === pid)) throw new Error('Warte kurz auf die Antwort.');
    const q = { id: ++this.qseq, pid, teamId: this.teamOf(pid)?.id, text, answer: null, by: null, pending: true };
    this.questions.push(q);
    if (this.teamMode) this.room.clearTimer('answer');
    this.changed();
    const round = this.round;
    if (this.room.aiOn) {
      const r = await aiAsk({ secret: this.secret.a, cat: this.secret.cat, info: this.secret.info, question: text });
      if (this.round !== round || this.phase !== 'ask' || !q.pending) return;
      if (r) {
        this.setAnswer(q, r.answer, 'ki');
        // Die Frage nennt den Begriff direkt („Ist es eine Giraffe?“) → gelöst
        if (r.solved && r.answer === 'ja') return this.solved(pid, `„${text}“`);
        return this.afterAnswer();
      }
    }
    // Keine KI: der Operator beantwortet die Frage
    const op = this.room.operatorId;
    if (op) this.room.emitTo(op, 'toast', { text: `❓ Bitte beantworten: „${text}“` });
    this.changed();
  }

  setAnswer(q, answer, by) {
    q.answer = answer;
    q.by = by;
    q.pending = false;
    this.room.fx(answer === 'ja' ? 'correct' : answer === 'nein' ? 'wrong' : 'reveal');
  }

  afterAnswer() {
    if (this.phase !== 'ask') return;
    if (!this.left() && !this.room.timers.has('lastChance')) {
      this.room.announce('❗ Keine Fragen mehr', 'round', 'Ihr habt 30 Sekunden, um noch zu lösen');
      this.room.setTimer('lastChance', 30000, () => this.endRound(null, 'Keine Fragen mehr übrig'));
    }
    if (this.teamMode) this.nextTurn();
    this.changed();
  }

  async solve(pid, text) {
    if (!this.canAct(pid)) throw new Error(this.teamMode ? 'Dein Team ist gerade nicht dran.' : 'Gerade kann nicht gelöst werden.');
    text = String(text || '').trim().slice(0, 60);
    if (!text) throw new Error('Was ist es?');
    const n = (this.guessesLeft[pid] ??= 3);
    if (n <= 0) throw new Error('Du hast schon dreimal geraten – lass die anderen ran.');
    this.guessesLeft[pid] = n - 1;
    const q = { id: ++this.qseq, pid, teamId: this.teamOf(pid)?.id, text, solve: true, answer: null, pending: true };
    this.questions.push(q);
    if (this.teamMode) this.room.clearTimer('answer');
    this.changed();
    const spec = { a: this.secret.a, alt: this.secret.alt, strict: true };
    let ok = matchAnswer(text, spec);
    let by = 'auto';
    if (!ok && this.room.aiOn) {
      const round = this.round;
      const r = await judgeSingle(`Gesuchter Begriff (Kategorie ${this.secret.cat})`, spec, text, { mode: 'draw' });
      if (this.round !== round || this.phase !== 'ask') return;
      ok = r.ok;
      by = r.by;
    }
    q.pending = false;
    q.answer = ok ? 'richtig' : 'falsch';
    q.by = by;
    if (ok) return this.solved(pid, `„${text}“`);
    this.room.fx('wrong');
    if (this.teamMode) this.nextTurn();
    this.changed();
  }

  /** Punkte für das Lösen */
  points() {
    return Math.max(50, 300 - 10 * this.asked());
  }

  solved(pid, how) {
    if (this.phase !== 'ask') return;
    const delta = { personal: {}, teams: {} };
    const pts = this.points();
    if (this.teamMode) {
      const t = this.teamOf(pid);
      if (t) { t.score += pts; delta.teams[t.id] = pts; }
    } else {
      this.tally.players++;
      for (const p of this.allPlayers()) {
        const d = p === pid ? pts : 50;
        this.personal[p] = (this.personal[p] || 0) + d;
        delta.personal[p] = d;
      }
    }
    this.personal[pid] = this.personal[pid] || 0;
    this.endRound({ pid, how, pts, delta }, `${this.name(pid)} hat es gelöst!`);
  }

  endRound(win, why) {
    if (this.phase !== 'ask') return;
    for (const k of ['round', 'answer', 'lastChance']) this.room.clearTimer(k);
    if (!win && !this.teamMode) this.tally.ki++;
    this.win = win;
    this.why = why;
    this.phase = 'result';
    {
      const asked = this.questions.filter((q) => !q.solve);
      const funny = this.questions.filter((q) => q.solve && q.answer === 'falsch').map((q) => q.text).slice(-3);
      this.room.moment('interrogation', {
        pids: win ? [win.pid] : [], q: `Gesucht: ${this.secret.a} (${this.secret.cat})`,
        text: win ? `Gelöst mit ${win.how} nach ${asked.length} Fragen` : `Nicht gelöst nach ${asked.length} Fragen`,
        note: funny.length ? `Falsch geraten: ${funny.join(', ')}` : '', extra: { solved: !!win, asked: asked.length },
        score: win && asked.length <= 6 ? 4 : funny.length ? 3 : 2, tags: [win ? 'schlau' : 'drama'],
      });
    }
    this.room.fx(win ? 'win' : 'lose');
    this.room.announce(win ? `🎉 ${why}` : `🤖 ${why}`, win ? 'win' : 'op', `Gesucht war: ${this.secret.a}`);
    this.room.step(6000, () => this.nextRound(), this.round >= this.opts.rounds ? 'Zum Ergebnis' : 'Nächster Begriff');
    this.changed();
  }

  /** Operator: Wertung des Lösens zurücknehmen und weiterspielen */
  undoWin() {
    const w = this.win;
    if (this.phase !== 'result') throw new Error('Nur beim Rundenergebnis möglich.');
    if (w) {
      for (const [tid, d] of Object.entries(w.delta.teams)) { const t = this.team(tid); if (t) t.score -= d; }
      for (const [p, d] of Object.entries(w.delta.personal)) this.personal[p] -= d;
      if (!this.teamMode) this.tally.players--;
      const last = [...this.questions].reverse().find((q) => q.pid === w.pid && (q.solve || q.answer === 'ja'));
      if (last) last.answer = last.solve ? 'falsch' : 'ja';
    } else if (!this.teamMode) this.tally.ki--;
    this.win = null;
    this.phase = 'ask';
    this.room.clearTimer('phase');
    this.room.waiting = null;
    this.room.setTimer('round', 90000, () => this.endRound(null, 'Die Zeit ist um!'));
    if (this.teamMode) this.nextTurn();
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('verhoer', this.secrets.slice(0, this.si).map((s) => s.id));
    if (this.teamMode) return this.room.finishGame(this.teamUnits(), { scoreLabel: 'Punkte' });
    const units = this.allPlayers().filter((p) => this.room.players.has(p)).map((pid) => ({
      label: this.name(pid), color: null, score: this.personal[pid] || 0,
      profileIds: [this.room.players.get(pid).profileId],
    }));
    this.room.finishGame(units, { scoreLabel: 'Punkte' });
  }

  // Punkte im Bearbeiten-Menü: im KI-Modus pro Person
  setScore(unitId, value) {
    if (this.teamMode) return super.setScore(unitId, value);
    if (!(unitId in this.personal)) return null;
    this.personal[unitId] = value;
    return this.name(unitId);
  }

  adjustScore(unitId, delta) {
    if (this.teamMode) return super.adjustScore(unitId, delta);
    if (!(unitId in this.personal)) return null;
    this.personal[unitId] += delta;
    return this.name(unitId);
  }

  act(pid, a) {
    if (a.type === 'ask') return this.ask(pid, a.text);
    if (a.type === 'solve') return this.solve(pid, a.text);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    const r = this.room;
    if (a.type === 'setAnswer') {
      // Operator beantwortet (oder korrigiert) eine Frage
      const q = this.questions?.find((x) => x.id === Number(a.id));
      if (!q) throw new Error('Frage nicht gefunden.');
      if (q.solve) {
        if (this.phase !== 'ask') throw new Error('Runde ist schon vorbei.');
        if (a.answer !== 'richtig') throw new Error('Nur „doch richtig“ möglich.');
        q.answer = 'richtig';
        q.by = 'op';
        r.opAnnounce(by, `wertet „${q.text}“ als RICHTIG ✅`);
        return this.solved(q.pid, `„${q.text}“`);
      }
      if (!ANSWERS.includes(a.answer)) throw new Error('Ungültige Antwort.');
      const wasPending = q.pending;
      this.setAnswer(q, a.answer, 'op');
      // Normales Beantworten steht im Fragenverlauf; groß eingeblendet werden nur Korrekturen
      if (!wasPending) r.opAnnounce(by, `korrigiert die Antwort auf „${q.text}“: ${a.answer.toUpperCase()}`);
      if (wasPending) this.afterAnswer();
    } else if (a.type === 'solvedBy') {
      // Operator: Spieler hat es doch gelöst (z. B. mündlich)
      if (this.phase !== 'ask' || !this.allPlayers().includes(a.pid)) throw new Error('Nicht möglich.');
      r.opAnnounce(by, `wertet: ${this.name(a.pid)} hat es gelöst! ✅`);
      return this.solved(a.pid, 'laut Operator');
    } else if (a.type === 'undoWin') {
      this.undoWin();
      r.opAnnounce(by, 'nimmt das Rundenergebnis zurück – es wird weitergespielt ↩️');
    } else if (a.type === 'newSecret') {
      if (this.phase !== 'ask') throw new Error('Nur während gefragt wird.');
      this.secret = this.secrets[this.si++ % this.secrets.length];
      this.questions = [];
      this.guessesLeft = {};
      r.opAnnounce(by, 'nimmt einen neuen Begriff 🔄', 'Alle Fragen starten von vorn');
      r.setTimer('round', this.opts.roundSeconds * 1000, () => this.endRound(null, 'Die Zeit ist um!'));
    } else if (a.type === 'skip') {
      if (this.phase === 'ask' && this.teamMode && r.timers.has('answer')) { r.opAnnounce(by, 'gibt die Runde ans nächste Team ⏭'); this.nextTurn(); }
      else if (this.phase === 'ask') { r.opAnnounce(by, 'beendet die Runde ⏭'); this.endRound(null, 'Runde beendet'); }
      else if (r.timers.has('phase')) r.advance();
    } else if (a.type === 'addTime') {
      if (r.timers.has('round')) { r.addTime('round', 60000); r.opAnnounce(by, 'gibt 60 Sekunden extra ⏱'); }
      if (r.timers.has('answer')) r.addTime('answer', 15000);
    } else {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid, isOp) {
    const showSecret = this.phase === 'result' || this.phase === 'intro' ? this.phase === 'result' : isOp;
    return {
      type: 'verhoer',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      teamMode: this.teamMode,
      cat: this.secret?.cat || null,
      secret: showSecret && this.secret ? this.secret.a : null,
      questions: this.questions || [],
      left: this.questions ? this.left() : this.opts.maxQuestions,
      max: this.opts.maxQuestions,
      pts: this.questions ? this.points() : 300,
      turn: this.teamMode ? this.turn : null,
      canAct: this.canAct(pid),
      guessesLeft: this.guessesLeft?.[pid] ?? 3,
      win: this.win,
      why: this.why,
      tally: this.tally,
      teams: this.teamsView(),
      scores: this.teamMode ? undefined : this.allPlayers().filter((p) => this.room.players.has(p)).map((p) => ({ pid: p, score: this.personal[p] || 0 })).sort((a, b) => b.score - a.score),
      timers: { round: this.timer('round'), answer: this.timer('answer'), lastChance: this.timer('lastChance'), phase: this.timer('phase') },
      opts: this.opts,
    };
  }
}
