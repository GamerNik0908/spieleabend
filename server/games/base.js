// Gemeinsame Bausteine für alle Spiele: Bewertung (lokal + optional KI),
// Team-Rotation, Fragen ziehen ohne Wiederholung.
import { scoreAnswer, matchAmong } from '../matcher.js';
import { aiJudge } from '../aijudge.js';
import * as store from '../store.js';

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Zieht n Elemente, bevorzugt noch nie gespielte. */
export function drawFresh(game, pool, n, used) {
  const fresh = shuffle(pool.filter((x) => !used.has(x.id)));
  const old = shuffle(pool.filter((x) => used.has(x.id)));
  if (fresh.length < n && pool.length) store.clearUsed(game); // Katalog durch -> von vorn
  return [...fresh, ...old].slice(0, n);
}

/** Eine richtige Lösung (mit Varianten). Rückgabe { ok, by: 'auto'|'ki', reason } */
export async function judgeSingle(question, spec, input) {
  const text = String(input || '').trim();
  if (!text) return { ok: false, by: 'auto', reason: 'keine Antwort' };
  if (scoreAnswer(text, spec) > 0) return { ok: true, by: 'auto' };
  // Reine Zahlenfragen entscheidet die Zahl – keine KI nötig
  if (typeof spec.num === 'number' && !spec.kw) return { ok: false, by: 'auto' };
  const solution = [spec.a, ...(spec.alt || [])].join(' / ');
  const r = await aiJudge({ question, solutions: [solution], input: text, mode: 'quiz' });
  if (r && r.match === 0) return { ok: true, by: 'ki', reason: r.reason };
  return { ok: false, by: r ? 'ki' : 'auto', reason: r?.reason };
}

/** Mehrere mögliche Antworten (Familien-Duell). Rückgabe { index, by, reason } */
export async function judgeAmong(question, options, input) {
  const text = String(input || '').trim();
  if (!text) return { index: -1, by: 'auto' };
  const local = matchAmong(text, options);
  if (local >= 0) return { index: local, by: 'auto' };
  const r = await aiJudge({
    question,
    solutions: options.map((o) => [o.t, ...(o.alt || [])].join(' / ')),
    input: text,
    mode: 'survey',
  });
  if (r && r.match >= 0) return { index: r.match, by: 'ki', reason: r.reason };
  return { index: -1, by: r ? 'ki' : 'auto', reason: r?.reason };
}

export class Game {
  constructor(room, opts, teams) {
    this.room = room;
    this.opts = opts;
    this.teams = teams ? teams.map((t) => ({ ...t, members: [...t.members], score: 0, rot: -1 })) : null;
    this.seq = 0; // erhöht sich bei jedem Fragenwechsel – verwirft verspätete KI-Ergebnisse
  }

  name(pid) {
    return this.room.name(pid);
  }

  connected(pid) {
    return !!this.room.players.get(pid)?.connected;
  }

  teamOf(pid) {
    return this.teams?.find((t) => t.members.includes(pid)) || null;
  }

  team(id) {
    return this.teams?.find((t) => t.id === id) || null;
  }

  /** Nächstes Teammitglied im Kreis, bevorzugt verbundene Spieler */
  nextMember(team) {
    const n = team.members.length;
    if (!n) return null;
    for (let i = 0; i < n; i++) {
      team.rot = (team.rot + 1) % n;
      const pid = team.members[team.rot];
      if (this.connected(pid)) return pid;
    }
    return team.members[team.rot];
  }

  changed() {
    this.room.changed();
  }

  timer(key) {
    return this.room.timerView(key);
  }

  teamsView() {
    return this.teams?.map((t) => ({ id: t.id, name: t.name, color: t.color, score: t.score, members: t.members }));
  }

  // Spät beigetretene Spieler kommen ins kleinste Team
  onPlayerJoined(pid) {
    if (!this.teams?.length || this.teamOf(pid)) return;
    const t = [...this.teams].sort((a, b) => a.members.length - b.members.length)[0];
    t.members.push(pid);
  }

  onPlayerRemoved(pid) {
    if (this.teams) for (const t of this.teams) t.members = t.members.filter((m) => m !== pid);
  }

  /** Operator: Punkte eines Teams/Spielers anpassen */
  adjustScore(unitId, delta) {
    const t = this.team(unitId);
    if (!t) return null;
    t.score += delta;
    return t.name;
  }

  scoreUnits() {
    return this.teamsView() || [];
  }

  /** Teams als Wertungseinheiten für room.finishGame */
  teamUnits() {
    return this.teams.map((t) => ({
      label: t.members.length === 1 ? this.name(t.members[0]) : t.name,
      color: t.color,
      score: t.score,
      profileIds: t.members.map((pid) => this.room.players.get(pid)?.profileId).filter(Boolean),
    }));
  }
}
