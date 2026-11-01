// „Gleichdenker“: Teams beantworten geheim dieselbe offene Frage. Punkte gibt es, wenn
// Teammitglieder dasselbe geschrieben haben – es zählt, wie gut ihr eure Leute kennt.
// Punkte passen sich an jede Teamgröße an: alle gleich = 3, sonst gestaffelt nach dem
// größten gleichen Block (bei 3 Leuten: zwei gleich = 1).
import { Game, drawFresh, aiGroup } from './base.js';
import { matchAnswer, normalize } from '../matcher.js';
import * as store from '../store.js';
import { GLEICHDENKER, FAMILIENDUELL } from '../data/index.js';

export function groupPoints(k, n) {
  if (n < 2 || k < 2) return 0;
  if (k >= n) return 3;
  return Math.max(1, Math.floor((3 * (k - 1)) / (n - 1)));
}

function same(a, b) {
  if (!a || !b) return false;
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || matchAnswer(a, { a: b }) || matchAnswer(b, { a: a });
}

export class Gleichdenker extends Game {
  static defaultOptions() {
    return { rounds: 8, answerSeconds: 30 };
  }

  constructor(room, opts, teams) {
    super(room, opts, teams);
    const pool = GLEICHDENKER.length ? GLEICHDENKER : FAMILIENDUELL.map((x) => ({ id: x.id, q: x.q }));
    this.questions = drawFresh('gleichdenker', pool, opts.rounds, store.usedSet('gleichdenker'));
    this.round = 0;
    this.phase = 'intro';
    this.answers = {};
    this.result = null;
    this.merges = {};
  }

  start() {
    this.room.step(6000, () => this.nextRound(), 'Erste Frage');
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    this.q = this.questions[this.round % this.questions.length];
    this.round++;
    this.answers = {};
    this.result = null;
    this.merges = {};
    this.splits = {};
    this.aiPairs = {};
    this.roundMembers = Object.fromEntries(this.teams.map((t) => [t.id, t.members.filter((p) => this.connected(p))]));
    this.phase = 'answer';
    this.room.setTimer('answer', this.opts.answerSeconds * 1000, () => this.reveal());
    this.changed();
  }

  submit(pid, text) {
    if (this.phase !== 'answer') throw new Error('Gerade wird nicht geantwortet.');
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!text) throw new Error('Gib eine Antwort ein.');
    this.answers[pid] = text;
    const everyone = this.teams.flatMap((t) => t.members).filter((p) => this.connected(p));
    if (everyone.every((p) => this.answers[p])) this.room.setTimer('answer', 800, () => this.reveal());
    this.changed();
  }

  /** Antworten eines Teams gruppieren und Punkte berechnen */
  scoreTeam(team) {
    const members = (this.roundMembers?.[team.id] || team.members).filter((p) => team.members.includes(p));
    const parent = Object.fromEntries(members.map((p) => [p, p]));
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const union = (a, b) => { parent[find(a)] = find(b); };
    // Vom Operator abgetrennte Antworten bleiben für sich (auch gegen Auto/KI)
    const split = new Set(this.splits[team.id] || []);
    const ok = (a, b) => !split.has(a) && !split.has(b);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (ok(members[i], members[j]) && same(this.answers[members[i]], this.answers[members[j]])) union(members[i], members[j]);
      }
    }
    const viaAi = new Set();
    for (const [a, b] of this.aiPairs[team.id] || []) {
      if (a in parent && b in parent && ok(a, b) && find(a) !== find(b)) { union(a, b); viaAi.add(a); viaAi.add(b); }
    }
    for (const [a, b] of this.merges[team.id] || []) if (a in parent && b in parent) union(a, b);
    const groups = {};
    for (const p of members) {
      if (!this.answers[p]) { groups[`leer-${p}`] = [p]; continue; }
      (groups[find(p)] ||= []).push(p);
    }
    const list = Object.values(groups)
      .map((pids) => ({ pids, text: this.answers[pids[0]] || null, ki: pids.length > 1 && pids.some((p) => viaAi.has(p)) }))
      .sort((a, b) => b.pids.length - a.pids.length);
    const k = list.length && list[0].text ? list[0].pids.length : 0;
    return { groups: list, best: k, size: members.length, pts: groupPoints(k, members.length) };
  }

  async reveal() {
    if (this.phase !== 'answer') return;
    this.room.clearTimer('answer');
    // KI vergleicht die Antworten jedes Teams nach Bedeutung (z. B. Sofa = Couch)
    if (this.room.aiOn) {
      this.phase = 'judging';
      this.changed();
      const round = this.round;
      await Promise.all(this.teams.map(async (t) => {
        const members = (this.roundMembers?.[t.id] || t.members).filter((p) => this.answers[p]);
        if (members.length < 2) return;
        const groups = await aiGroup({ question: this.q.q, answers: members.map((p) => this.answers[p]) });
        if (!groups) return;
        this.aiPairs[t.id] = groups.flatMap((g) => g.slice(1).map((i) => [members[g[0]], members[i]]));
      }));
      if (this.round !== round || this.phase !== 'judging') return;
    }
    this.result = {};
    for (const t of this.teams) {
      const r = this.scoreTeam(t);
      t.score += r.pts;
      this.result[t.id] = r;
    }
    this.phase = 'reveal';
    const best = Math.max(...Object.values(this.result).map((r) => r.pts));
    this.room.fx(best >= 3 ? 'win' : best > 0 ? 'win-round' : 'wrong');
    // Teams nacheinander aufdecken – das beste zuletzt
    this.room.step(1000 + 2800 * this.teams.length + 3000, () => this.nextRound(), this.round >= this.opts.rounds ? 'Zum Ergebnis' : 'Nächste Frage');
    this.changed();
  }

  finish() {
    this.room.clearAllTimers();
    store.markUsed('gleichdenker', this.questions.slice(0, this.round).map((q) => q.id));
    this.room.finishGame(this.teamUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'answer') return this.submit(pid, a.text);
    throw new Error('Unbekannte Aktion');
  }

  canType() {
    return false;
  }

  op(by, a) {
    const r = this.room;
    if (a.type === 'split') {
      // Operator: eine Antwort zählt doch NICHT als gleich
      if (this.phase !== 'reveal') throw new Error('Nur bei der Auflösung möglich.');
      const team = this.team(a.teamId);
      if (!team || !team.members.includes(a.pid)) throw new Error('Nicht gefunden.');
      const before = this.result[team.id].pts;
      this.splits[team.id] = [...new Set([...(this.splits[team.id] || []), a.pid])];
      this.merges[team.id] = (this.merges[team.id] || []).filter(([x, y]) => x !== a.pid && y !== a.pid);
      const now = this.scoreTeam(team);
      team.score += now.pts - before;
      this.result[team.id] = now;
      r.opAnnounce(by, `wertet „${this.answers[a.pid]}“ als NICHT gleich ✂️`, `${team.name}: ${now.pts} ${now.pts === 1 ? 'Punkt' : 'Punkte'}`);
      r.addTime('phase', 4000);
    } else if (a.type === 'merge') {
      // Operator: Antworten zählen als gleich (z. B. Sofa = Couch)
      if (this.phase !== 'reveal') throw new Error('Nur bei der Auflösung möglich.');
      const team = this.team(a.teamId);
      const pids = (a.pids || []).filter((p) => team?.members.includes(p));
      if (!team || pids.length < 2) throw new Error('Mindestens zwei Antworten auswählen.');
      const before = this.result[team.id].pts;
      this.merges[team.id] = [...(this.merges[team.id] || []), ...pids.slice(1).map((p) => [pids[0], p])];
      this.splits[team.id] = (this.splits[team.id] || []).filter((p) => !pids.includes(p));
      const now = this.scoreTeam(team);
      team.score += now.pts - before;
      this.result[team.id] = now;
      r.opAnnounce(by, `wertet ${pids.map((p) => `„${this.answers[p]}“`).join(' und ')} als gleich ✅`, `${team.name}: ${now.pts} ${now.pts === 1 ? 'Punkt' : 'Punkte'}`);
      r.addTime('phase', 4000);
    } else if (a.type === 'skip') {
      if (this.phase === 'answer') { r.opAnnounce(by, 'deckt die Antworten auf ⏭'); this.reveal(); }
      else if (r.timers.has('phase')) { const t = r.timers.get('phase'); r.timers.delete('phase'); t.cb(); }
    } else if (a.type === 'addTime') {
      if (r.timers.has('answer')) { r.addTime('answer', 15000); r.opAnnounce(by, 'gibt 15 Sekunden extra ⏱'); }
    } else {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    const reveal = this.phase === 'reveal';
    return {
      type: 'gleichdenker',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      q: this.q ? this.q.q : null,
      teams: this.teamsView(),
      myAnswer: this.answers[pid] || null,
      answered: Object.keys(this.answers),
      result: reveal ? Object.fromEntries(Object.entries(this.result).map(([tid, r]) => [tid, {
        ...r, groups: r.groups.map((g) => ({ ...g, texts: g.pids.map((p) => this.answers[p] || null) })),
      }])) : null,
      timers: { answer: this.timer('answer'), phase: this.timer('phase') },
      canAnswer: this.phase === 'answer',
      opts: this.opts,
    };
  }
}
