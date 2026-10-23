// „Familien-Duell“ (Family Feud): Zwei Teams erraten die Top-Antworten einer Umfrage.
// Ablauf pro Runde: Buzzer-Duell -> Team mit Kontrolle rät reihum (3 Fehler = Strikes)
// -> anderes Team darf mit einer Antwort klauen. Danach Finale: pro Frage gibt jedes
// Team geheim eine Antwort, Punkte = Prozentwert.
import { Game, judgeAmong, drawFresh } from './base.js';
import * as store from '../store.js';
import { FAMILIENDUELL } from '../data/index.js';

export class FamilienDuell extends Game {
  static defaultOptions() {
    return { rounds: 4, finalQuestions: 5, answerSeconds: 20, stealSeconds: 30, buzzSeconds: 12, finalSeconds: 25, lastRoundDouble: true };
  }

  constructor(room, opts, teams) {
    super(room, opts, teams.slice(0, 2));
    // Mehr als zwei Teams? Rest auf die beiden verteilen
    for (const extra of teams.slice(2)) for (const m of extra.members) this.onPlayerJoined(m);
    const total = opts.rounds + opts.finalQuestions;
    this.questions = drawFresh('familienduell', FAMILIENDUELL, total, store.usedSet('familienduell'));
    this.round = 0;
    this.phase = 'intro';
    this.qi = -1;
    this.q = null;
    this.revealed = [];
    this.strikes = 0;
    this.control = null;
    this.active = null;
    this.pot = 0;
    this.faceoff = null;
    this.last = null;
    this.log = [];
    this.roundResult = null;
    this.starter = Math.random() < 0.5 ? 0 : 1;
    this.final = null;
  }

  other(teamId) {
    return this.teams.find((t) => t.id !== teamId);
  }

  multiplier() {
    return this.opts.lastRoundDouble && this.round === this.opts.rounds && this.opts.rounds > 1 ? 2 : 1;
  }

  start() {
    this.phase = 'intro';
    this.room.setTimer('phase', 6000, () => this.nextRound());
  }

  // ---------- Hauptrunden ----------
  nextRound() {
    if (this.round >= this.opts.rounds) return this.startFinal();
    this.round++;
    this.qi++;
    this.q = this.questions[this.qi % this.questions.length];
    this.revealed = this.q.a.map(() => null);
    this.strikes = 0;
    this.control = null;
    this.active = null;
    this.pot = 0;
    this.last = null;
    this.roundResult = null;
    const order = this.round % 2 === 0 ? [1 - this.starter, this.starter] : [this.starter, 1 - this.starter];
    this.faceoff = {
      players: Object.fromEntries(order.map((i) => [this.teams[i].id, this.nextMember(this.teams[i])])),
      buzzed: null, first: null, firstIndex: -1, attempt: 1,
    };
    this.phase = 'faceoff';
    this.room.announce(`Runde ${this.round}${this.multiplier() > 1 ? ' – doppelte Punkte!' : ''}`, 'round',
      `${this.teams.map((t) => this.name(this.faceoff.players[t.id])).join(' gegen ')} am Buzzer`);
    this.room.setTimer('buzz', (this.opts.buzzSeconds + 3) * 1000, () => this.buzzTimeout());
    this.changed();
  }

  buzz(pid) {
    if (this.phase !== 'faceoff' || this.faceoff.buzzed) return;
    if (!Object.values(this.faceoff.players).includes(pid)) throw new Error('Nur die beiden Spieler am Buzzer dürfen buzzern.');
    this.faceoff.buzzed = pid;
    this.room.clearTimer('buzz');
    this.room.fx('buzz', { pid });
    this.askFaceoff(pid);
  }

  buzzTimeout() {
    // Niemand gebuzzert: der Spieler des startenden Teams muss antworten
    const firstTeam = Object.keys(this.faceoff.players)[0];
    this.faceoff.buzzed = this.faceoff.players[firstTeam];
    this.askFaceoff(this.faceoff.buzzed);
  }

  askFaceoff(pid) {
    this.phase = 'faceoffAnswer';
    this.active = pid;
    this.seq++;
    const seq = this.seq;
    this.room.typing = null;
    this.room.setTimer('answer', this.opts.answerSeconds * 1000, () => this.submit(pid, '', seq));
    this.changed();
  }

  async submit(pid, input, seqCheck) {
    if (seqCheck != null && seqCheck !== this.seq) return;
    if (this.active !== pid || this.judging) return;
    if (!['faceoffAnswer', 'play', 'steal'].includes(this.phase)) return;
    const seq = this.seq;
    const phase = this.phase;
    this.judging = true;
    this.pendingInput = String(input || '').slice(0, 100);
    this.room.clearTimer('answer');
    this.changed();
    let res = { index: -1, by: 'auto' };
    try {
      res = await judgeAmong(this.q.q, this.q.a, this.pendingInput);
    } finally {
      this.judging = false;
    }
    if (seq !== this.seq || phase !== this.phase) return;
    this.applyAnswer(pid, this.pendingInput, res.index, res.by, res.reason);
  }

  applyAnswer(pid, input, index, by, reason) {
    const team = this.teamOf(pid);
    const dup = index >= 0 && this.revealed[index] != null;
    const ok = index >= 0 && !dup;
    this.last = { id: ++this.seq, pid, teamId: team?.id, input, index, dup, ok, by, reason, phase: this.phase, strikeAdded: false };
    this.log.unshift(this.last);
    if (ok) {
      this.revealed[index] = team?.id || 'none';
      this.pot += this.q.a[index].p;
      this.room.fx('reveal', { index });
    } else {
      this.room.fx('wrong');
    }
    this.room.typing = null;

    if (this.phase === 'faceoffAnswer') return this.afterFaceoff(pid, ok ? index : -1);
    if (this.phase === 'play') {
      if (!ok) { this.strikes++; this.last.strikeAdded = true; }
      if (this.revealed.every((r) => r != null)) return this.endRound(this.control, 'Alle Antworten gefunden!');
      if (this.strikes >= 3) return this.startSteal();
      this.active = null;
      this.room.setTimer('phase', 2200, () => this.nextPlayer());
      return this.changed();
    }
    if (this.phase === 'steal') {
      const stealer = this.other(this.control).id;
      if (ok) return this.endRound(stealer, 'Geklaut! 🦝');
      return this.endRound(this.control, 'Klau-Versuch daneben');
    }
  }

  afterFaceoff(pid, index) {
    const fo = this.faceoff;
    const team = this.teamOf(pid);
    if (!fo.first) {
      fo.first = pid;
      fo.firstIndex = index;
      if (index === 0) return this.giveControl(team.id, 'Top-Antwort!');
      // Zweiter Spieler darf antworten
      const otherPid = Object.values(fo.players).find((p) => p !== pid);
      this.active = null;
      this.phase = 'faceoff';
      this.room.setTimer('phase', 2000, () => this.askFaceoff(otherPid));
      return this.changed();
    }
    // Zweiter Versuch ausgewertet
    const firstTeam = this.teamOf(fo.first);
    if (index >= 0 && (fo.firstIndex < 0 || index < fo.firstIndex)) return this.giveControl(team.id, 'Bessere Antwort!');
    if (fo.firstIndex >= 0) return this.giveControl(firstTeam.id, 'Bessere Antwort!');
    // Beide daneben: neues Buzzer-Duell (max. 3 Versuche), sonst Startteam
    if (fo.attempt >= 3) return this.giveControl(firstTeam.id, 'Niemand hat getroffen');
    const attempt = fo.attempt + 1;
    this.faceoff = {
      players: Object.fromEntries(this.teams.map((t) => [t.id, this.nextMember(t)])),
      buzzed: null, first: null, firstIndex: -1, attempt,
    };
    this.phase = 'faceoff';
    this.active = null;
    this.room.announce('Beide daneben!', 'wrong', 'Nächstes Buzzer-Duell');
    this.room.setTimer('buzz', (this.opts.buzzSeconds + 3) * 1000, () => this.buzzTimeout());
    this.changed();
  }

  giveControl(teamId, why) {
    this.control = teamId;
    this.phase = 'controlIntro';
    this.active = null;
    const t = this.team(teamId);
    this.room.announce(`${t.name} spielt die Runde`, 'control', why);
    this.room.setTimer('phase', 3000, () => {
      if (this.revealed.every((r) => r != null)) return this.endRound(teamId, 'Alle Antworten gefunden!');
      this.nextPlayer();
    });
    this.changed();
  }

  nextPlayer() {
    this.phase = 'play';
    this.active = this.nextMember(this.team(this.control));
    this.seq++;
    const seq = this.seq;
    const pid = this.active;
    this.room.typing = null;
    this.room.setTimer('answer', this.opts.answerSeconds * 1000, () => this.submit(pid, '', seq));
    this.changed();
  }

  startSteal() {
    const stealer = this.other(this.control);
    this.phase = 'stealIntro';
    this.active = null;
    this.room.announce(`3 Fehler! ${stealer.name} darf klauen`, 'steal', 'Eine Antwort – sprecht euch ab!');
    this.room.setTimer('phase', 3000, () => {
      this.phase = 'steal';
      this.active = this.nextMember(stealer);
      this.seq++;
      const seq = this.seq;
      const pid = this.active;
      this.room.setTimer('answer', this.opts.stealSeconds * 1000, () => this.submit(pid, '', seq));
      this.changed();
    });
    this.changed();
  }

  endRound(winnerId, why) {
    this.room.clearTimer('answer');
    this.room.clearTimer('phase');
    const mult = this.multiplier();
    const points = this.pot * mult;
    const winner = this.team(winnerId);
    winner.score += points;
    this.roundResult = { winner: winnerId, points, why, mult };
    this.phase = 'roundEnd';
    this.active = null;
    this.room.announce(`${winner.name} holt ${points} Punkte`, 'points', why);
    this.room.fx('win-round');
    this.room.setTimer('phase', 8000, () => this.nextRound());
    this.changed();
  }

  // Punkte einer bereits beendeten Runde neu verteilen (Operator-Korrektur)
  rescoreRound(newWinnerId) {
    const rr = this.roundResult;
    if (!rr) return;
    this.team(rr.winner).score -= rr.points;
    rr.points = this.pot * rr.mult;
    rr.winner = newWinnerId;
    this.team(newWinnerId).score += rr.points;
  }

  // ---------- Finale ----------
  startFinal() {
    if (!this.opts.finalQuestions) return this.finish();
    this.phase = 'finalIntro';
    this.final = {
      rows: [],
      index: -1,
    };
    this.room.announce('🔥 Finalrunde!', 'final', 'Pro Frage antwortet aus jedem Team eine Person – geheim. Punkte = Prozent.');
    this.room.setTimer('phase', 6000, () => this.finalNext());
    this.changed();
  }

  finalNext() {
    const f = this.final;
    if (f.index + 1 >= this.opts.finalQuestions) return this.finish();
    f.index++;
    this.qi++;
    const q = this.questions[this.qi % this.questions.length];
    const players = Object.fromEntries(this.teams.map((t) => [t.id, this.nextMember(t)]));
    f.rows.push({ q, players, answers: {}, judged: false });
    this.phase = 'final';
    this.seq++;
    this.room.setTimer('answer', this.opts.finalSeconds * 1000, () => this.finalJudge());
    this.changed();
  }

  finalSubmit(pid, input) {
    const row = this.final?.rows[this.final.index];
    if (this.phase !== 'final' || !row) return;
    const team = Object.entries(row.players).find(([, p]) => p === pid);
    if (!team) throw new Error('Du bist bei dieser Frage nicht dran.');
    if (row.answers[team[0]]) return;
    row.answers[team[0]] = { pid, input: String(input || '').slice(0, 100), index: -1, p: 0, by: 'auto' };
    if (this.teams.every((t) => row.answers[t.id])) this.finalJudge();
    this.changed();
  }

  async finalJudge() {
    const row = this.final.rows[this.final.index];
    if (this.phase !== 'final' || row.judged) return;
    row.judged = true;
    this.room.clearTimer('answer');
    this.phase = 'finalJudging';
    this.changed();
    for (const t of this.teams) {
      if (!row.answers[t.id]) row.answers[t.id] = { pid: row.players[t.id], input: '', index: -1, p: 0, by: 'auto' };
    }
    await Promise.all(this.teams.map(async (t) => {
      const ans = row.answers[t.id];
      const res = await judgeAmong(row.q.q, row.q.a, ans.input);
      ans.index = res.index;
      ans.by = res.by;
      ans.p = res.index >= 0 ? row.q.a[res.index].p : 0;
      ans.t = res.index >= 0 ? row.q.a[res.index].t : null;
    }));
    if (this.phase !== 'finalJudging') return;
    for (const t of this.teams) t.score += row.answers[t.id].p;
    this.phase = 'finalReveal';
    this.room.fx('reveal');
    this.room.setTimer('phase', 7000, () => this.finalNext());
    this.changed();
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('familienduell', this.questions.slice(0, this.qi + 1).map((q) => q.id));
    this.room.finishGame(this.teamUnits(), { scoreLabel: 'Punkte' });
  }

  // ---------- Aktionen ----------
  act(pid, a) {
    if (a.type === 'buzz') return this.buzz(pid);
    if (a.type === 'answer') {
      if (this.phase === 'final') return this.finalSubmit(pid, a.text);
      return this.submit(pid, a.text);
    }
    throw new Error('Unbekannte Aktion');
  }

  canType(pid) {
    return this.active === pid && ['faceoffAnswer', 'play', 'steal'].includes(this.phase) && !this.judging;
  }

  op(by, a) {
    const r = this.room;
    switch (a.type) {
      case 'assign': {
        // Letzte Antwort einer Tafel-Antwort zuordnen (war fälschlich falsch)
        const l = this.last;
        const idx = a.index;
        if (!l || l.ok || this.revealed[idx] != null || !this.q.a[idx]) throw new Error('Nicht möglich.');
        l.ok = true; l.index = idx; l.by = 'op';
        this.revealed[idx] = l.teamId;
        this.pot += this.q.a[idx].p;
        r.opAnnounce(by, `zählt „${l.input || '–'}“ als „${this.q.a[idx].t}“ ✅`, `${this.q.a[idx].p} Punkte für ${this.team(l.teamId)?.name}`);
        if (l.strikeAdded) { this.strikes = Math.max(0, this.strikes - 1); l.strikeAdded = false; }
        if (this.phase === 'roundEnd' && l.phase === 'steal') this.rescoreRound(l.teamId);
        else if (this.phase === 'roundEnd') this.rescoreRound(this.roundResult.winner);
        else if (['stealIntro', 'steal'].includes(this.phase) && this.strikes < 3) {
          r.clearTimer('answer');
          r.clearTimer('phase');
          this.nextPlayer();
        }
        if (['faceoff', 'faceoffAnswer'].includes(this.phase)) {
          r.clearTimer('answer'); r.clearTimer('phase');
          this.giveControl(l.teamId, 'Operator-Entscheidung');
        }
        if (this.revealed.every((x) => x != null) && this.phase === 'play') this.endRound(this.control, 'Alle Antworten gefunden!');
        break;
      }
      case 'reject': {
        // Letzte Antwort war fälschlich richtig
        const l = this.last;
        if (!l || !l.ok) throw new Error('Nicht möglich.');
        const idx = l.index;
        this.revealed[idx] = null;
        this.pot -= this.q.a[idx].p;
        l.ok = false; l.by = 'op';
        r.opAnnounce(by, `wertet „${l.input}“ doch als FALSCH ❌`, `„${this.q.a[idx].t}“ wird wieder verdeckt`);
        if (this.phase === 'roundEnd') {
          if (l.phase === 'steal') this.rescoreRound(this.control);
          else this.rescoreRound(this.roundResult.winner);
        } else if (this.phase === 'play' || (this.phase === 'controlIntro' && l.phase === 'play')) {
          this.strikes++;
          l.strikeAdded = true;
          if (this.strikes >= 3) { r.clearTimer('answer'); r.clearTimer('phase'); this.startSteal(); }
        }
        break;
      }
      case 'strike': {
        if (!['play', 'controlIntro', 'stealIntro'].includes(this.phase)) throw new Error('Gerade keine Strikes.');
        this.strikes = Math.max(0, Math.min(3, this.strikes + a.delta));
        r.opAnnounce(by, a.delta > 0 ? 'gibt einen Strike ❌' : 'nimmt einen Strike zurück ↩️', `${this.strikes}/3`);
        if (this.strikes >= 3 && this.phase === 'play') { r.clearTimer('answer'); r.clearTimer('phase'); this.startSteal(); }
        if (this.strikes < 3 && this.phase === 'stealIntro') { r.clearTimer('phase'); this.nextPlayer(); }
        break;
      }
      case 'setControl': {
        const t = this.team(a.teamId);
        if (!t || !['faceoff', 'faceoffAnswer', 'controlIntro', 'play'].includes(this.phase)) throw new Error('Nicht möglich.');
        r.clearTimer('buzz'); r.clearTimer('answer'); r.clearTimer('phase');
        r.opAnnounce(by, `gibt ${t.name} die Kontrolle`);
        this.giveControl(t.id, 'Operator-Entscheidung');
        break;
      }
      case 'finalSet': {
        // Finale: Antwort eines Teams korrigieren (index -1 = keine Punkte)
        const row = this.final?.rows[a.row];
        const ans = row?.answers[a.teamId];
        if (!row || !ans || !row.judged) throw new Error('Nicht möglich.');
        const newP = a.index >= 0 ? row.q.a[a.index].p : 0;
        if (this.phase !== 'finalJudging') this.team(a.teamId).score += newP - ans.p;
        ans.index = a.index; ans.p = newP; ans.t = a.index >= 0 ? row.q.a[a.index].t : null; ans.by = 'op';
        r.opAnnounce(by, `korrigiert die Finale-Antwort von ${this.team(a.teamId).name}`, a.index >= 0 ? `„${ans.input}“ = „${ans.t}“ (${newP})` : `„${ans.input}“ = 0 Punkte`);
        break;
      }
      case 'skip': {
        if (r.timers.has('phase')) {
          const t = r.timers.get('phase');
          r.timers.delete('phase');
          t.cb();
          r.opAnnounce(by, 'springt weiter ⏭');
        } else if (['play', 'steal', 'faceoffAnswer'].includes(this.phase) && this.active) {
          r.opAnnounce(by, 'überspringt den Zug (zählt als Fehler)');
          this.seq++;
          this.judging = false;
          this.applyAnswer(this.active, '', -1, 'op');
        } else if (this.phase === 'faceoff') {
          r.clearTimer('buzz');
          r.opAnnounce(by, 'startet die Antwort ohne Buzzer');
          this.buzzTimeout();
        } else if (this.phase === 'final') {
          r.opAnnounce(by, 'beendet die Antwortzeit');
          this.finalJudge();
        }
        break;
      }
      case 'skipQuestion': {
        if (!['faceoff', 'faceoffAnswer'].includes(this.phase)) throw new Error('Nur vor der Kontrolle möglich.');
        r.clearAllTimers();
        this.round--;
        r.opAnnounce(by, 'tauscht die Umfrage aus 🔄');
        this.nextRound();
        break;
      }
      case 'addTime': {
        const key = ['answer', 'buzz'].find((k) => r.timers.has(k));
        if (key) { r.addTime(key, 10000); r.opAnnounce(by, 'gibt 10 Sekunden extra ⏱'); }
        break;
      }
      default:
        throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid, isOp) {
    const fullReveal = ['roundEnd'].includes(this.phase);
    const board = this.q ? this.q.a.map((ans, i) => {
      const by = this.revealed[i];
      if (by != null || fullReveal) return { open: by != null, missed: by == null, t: ans.t, p: ans.p, teamId: by };
      return { open: false };
    }) : [];
    const f = this.final;
    const finalView = f && {
      index: f.index,
      total: this.opts.finalQuestions,
      rows: f.rows.map((row, ri) => {
        const done = row.judged && this.phase !== 'finalJudging' || ri < f.index;
        return {
          q: row.q.q,
          players: row.players,
          answers: Object.fromEntries(this.teams.map((t) => {
            const a = row.answers[t.id];
            if (!a) return [t.id, null];
            if (!done) return [t.id, { submitted: true, mine: a.pid === pid ? a.input : undefined }];
            return [t.id, { submitted: true, input: a.input, t: a.t, p: a.p, by: a.by, index: a.index }];
          })),
          board: done ? row.q.a.map((x) => ({ t: x.t, p: x.p })) : null,
        };
      }),
    };
    const curRow = f?.rows[f.index];
    return {
      type: 'familienduell',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      multiplier: this.multiplier(),
      teams: this.teamsView(),
      question: this.q && this.phase !== 'intro' && !this.phase.startsWith('final') ? { q: this.q.q, count: this.q.a.length } : null,
      board: this.phase.startsWith('final') ? [] : board,
      strikes: this.strikes,
      control: this.control,
      active: this.active,
      judging: !!this.judging,
      pot: this.pot,
      faceoff: this.faceoff,
      last: this.last,
      roundResult: this.roundResult,
      final: finalView,
      timers: { answer: this.timer('answer'), buzz: this.timer('buzz'), phase: this.timer('phase') },
      canBuzz: this.phase === 'faceoff' && !this.faceoff?.buzzed && Object.values(this.faceoff?.players || {}).includes(pid),
      canAnswer: (this.active === pid && ['faceoffAnswer', 'play', 'steal'].includes(this.phase) && !this.judging)
        || (this.phase === 'final' && curRow && Object.values(curRow.players).includes(pid)
          && !Object.values(curRow.answers).some((x) => x.pid === pid)),
      // Operator kann (bewusst, hinter einem Spoiler-Knopf) die Tafel sehen, um Antworten zuzuordnen
      opBoard: isOp && this.q && !this.phase.startsWith('final') ? this.q.a.map((x) => ({ t: x.t, p: x.p })) : null,
      opts: this.opts,
    };
  }
}
