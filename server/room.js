// Ein Spieleabend-Raum: Spieler, Operator, Lobby-Einstellungen, Timer (pausierbar),
// Einblendungen ("Operator hat … gemacht") und Spielablauf.
import crypto from 'node:crypto';
import * as store from './store.js';
import { makeTeams, defaultTeamCount, TEAM_STYLES } from './teams.js';
import { aiEnabled } from './aijudge.js';
import { QuizDuell } from './games/quizduell.js';
import { FamilienDuell } from './games/familienduell.js';
import { Duemmste } from './games/duemmste.js';
import { catalogStats } from './data/index.js';

export const GAMES = {
  quizduell: { cls: QuizDuell, title: 'Quiz Duell', teams: true },
  familienduell: { cls: FamilienDuell, title: 'Familien-Duell', teams: true },
  duemmste: { cls: Duemmste, title: 'Der Dümmste fliegt', teams: false },
};

const token = () => crypto.randomBytes(16).toString('hex');

export class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();
    this.operatorId = null;
    this.game = null;
    this.gameType = 'quizduell';
    this.options = {
      quizduell: QuizDuell.defaultOptions(),
      familienduell: FamilienDuell.defaultOptions(),
      duemmste: Duemmste.defaultOptions(),
    };
    this.teams = null;
    this.teamCount = null;
    this.teamsManual = false; // true, sobald der Operator Teams von Hand ändert
    this.paused = false;
    this.timers = new Map();
    this.results = null;
    this.typing = null;
    this.flushQueued = false;
    this.lastActivity = Date.now();
    this.announceSeq = 0;
  }

  // ---------- Spieler ----------
  addPlayer(name, socket) {
    name = String(name || '').trim().slice(0, 20);
    if (!name) throw new Error('Bitte gib einen Namen ein.');
    const taken = [...this.players.values()].find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (taken) {
      if (taken.connected) throw new Error('Der Name ist in diesem Raum schon vergeben.');
      // Gleicher Name, aber offline: als Wiederverbindung behandeln
      this.attach(taken, socket);
      return taken;
    }
    const prof = store.profileByName(name);
    const p = {
      id: crypto.randomBytes(5).toString('hex'), token: token(), name, profileId: prof.id,
      connected: false, sockets: new Set(), joinedAt: Date.now(),
    };
    this.players.set(p.id, p);
    if (!this.operatorId) this.operatorId = p.id;
    this.attach(p, socket);
    if (!this.game) {
      if (this.teamsManual) this.placeInSmallestTeam(p.id);
      else this.rebuildTeams();
    }
    this.game?.onPlayerJoined?.(p.id);
    return p;
  }

  attach(p, socket) {
    p.sockets.add(socket.id);
    p.connected = true;
    socket.data.room = this.code;
    socket.data.playerId = p.id;
    socket.join(this.code);
    this.changed();
  }

  detach(socket) {
    const p = this.players.get(socket.data.playerId);
    if (!p) return;
    p.sockets.delete(socket.id);
    p.connected = p.sockets.size > 0;
    if (!p.connected) this.game?.onPlayerLeft?.(p.id);
    this.changed();
  }

  byToken(tok) {
    return [...this.players.values()].find((p) => p.token === tok);
  }

  removePlayer(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    for (const sid of p.sockets) {
      const s = this.io.sockets.sockets.get(sid);
      if (s) { s.emit('kicked'); s.leave(this.code); s.data.room = null; }
    }
    this.players.delete(pid);
    if (this.teams) for (const t of this.teams) t.members = t.members.filter((m) => m !== pid);
    if (!this.game && !this.teamsManual) this.rebuildTeams();
    this.game?.onPlayerRemoved?.(pid);
    if (this.operatorId === pid) this.operatorId = [...this.players.keys()][0] || null;
    this.changed();
  }

  name(pid) {
    return this.players.get(pid)?.name || '???';
  }

  isOperator(pid) {
    return pid === this.operatorId;
  }

  connectedIds() {
    return [...this.players.values()].filter((p) => p.connected).map((p) => p.id);
  }

  allIds() {
    return [...this.players.keys()];
  }

  profile(pid) {
    const p = this.players.get(pid);
    return p ? store.profile(p.profileId) : null;
  }

  // ---------- Teams ----------
  rebuildTeams(mode = 'random', count = null) {
    const def = GAMES[this.gameType];
    if (!def.teams) { this.teams = null; return; }
    const ids = this.allIds();
    const n = count || this.teamCount || defaultTeamCount(this.gameType, ids.length);
    this.teams = makeTeams(ids, n, mode, (pid) => this.profile(pid)?.points || 0);
  }

  placeInSmallestTeam(pid) {
    if (!this.teams?.length) return;
    const t = [...this.teams].sort((a, b) => a.members.length - b.members.length)[0];
    t.members.push(pid);
  }

  teamOf(pid) {
    return this.teams?.find((t) => t.members.includes(pid)) || null;
  }

  // ---------- Timer (respektieren Pause) ----------
  setTimer(key, ms, cb) {
    const now = Date.now();
    this.timers.set(key, { deadline: now + ms, duration: ms, remaining: ms, cb });
    this.changed();
  }

  clearTimer(key) {
    this.timers.delete(key);
  }

  clearAllTimers() {
    this.timers.clear();
  }

  timerView(key) {
    const t = this.timers.get(key);
    if (!t) return null;
    const remaining = this.paused ? t.remaining : Math.max(0, t.deadline - Date.now());
    return { endsAt: this.paused ? null : t.deadline, duration: t.duration, remaining, paused: this.paused };
  }

  addTime(key, ms) {
    const t = this.timers.get(key);
    if (!t) return;
    if (this.paused) t.remaining += ms;
    else t.deadline += ms;
    t.duration += ms;
    this.changed();
  }

  tick() {
    if (this.paused) return;
    const now = Date.now();
    for (const [key, t] of [...this.timers]) {
      if (now >= t.deadline && this.timers.get(key) === t) {
        this.timers.delete(key);
        try { t.cb(); } catch (err) { console.error('Timer-Fehler', key, err); }
        this.changed();
      }
    }
  }

  pause(by) {
    if (this.paused) return;
    const now = Date.now();
    for (const t of this.timers.values()) t.remaining = Math.max(0, t.deadline - now);
    this.paused = true;
    this.announce(`⏸ ${this.name(by)} hat das Spiel pausiert`, 'pause');
  }

  resume(by) {
    if (!this.paused) return;
    const now = Date.now();
    for (const t of this.timers.values()) t.deadline = now + t.remaining;
    this.paused = false;
    this.announce(`▶ ${this.name(by)} geht weiter – los geht's!`, 'play');
  }

  // ---------- Einblendungen ----------
  announce(text, icon = 'op', sub = '', extra = {}) {
    this.io.to(this.code).emit('announce', { id: ++this.announceSeq, text, sub, icon, ...extra });
  }

  opAnnounce(by, text, sub = '', extra = {}) {
    this.announce(`${this.name(by)} ${text}`, 'op', sub, { operator: true, ...extra });
  }

  // Kurze Effekte (Sound/Konfetti) für alle
  fx(kind, extra = {}) {
    this.io.to(this.code).emit('fx', { kind, ...extra });
  }

  // ---------- Spielablauf ----------
  startGame(by) {
    const def = GAMES[this.gameType];
    if (this.game) throw new Error('Es läuft schon ein Spiel.');
    if (this.players.size < 1) throw new Error('Keine Spieler.');
    const stats = catalogStats();
    if (!stats[this.gameType]) throw new Error('Für dieses Spiel sind keine Fragen geladen (siehe Server-Log).');
    if (def.teams) {
      if (!this.teams) this.rebuildTeams();
      this.teams = this.teams.filter((t) => t.members.length > 0);
      if (this.gameType === 'familienduell' && this.teams.length < 2) throw new Error('Familien-Duell braucht 2 Teams (mind. 2 Spieler).');
    }
    this.results = null;
    this.paused = false;
    this.clearAllTimers();
    const teams = def.teams ? this.teams.map((t) => ({ ...t, members: [...t.members] })) : null;
    this.game = new def.cls(this, { ...this.options[this.gameType] }, teams);
    this.announce(`🎬 ${def.title} startet!`, 'start', `${this.name(by)} hat das Spiel gestartet`);
    this.game.start();
    this.changed();
  }

  /** Wird vom Spiel aufgerufen. units: [{ label, profileIds, score, color }] */
  finishGame(units, extra = {}) {
    const sorted = [...units].sort((a, b) => b.score - a.score);
    let rank = 0, lastScore = null;
    sorted.forEach((u, i) => {
      if (u.score !== lastScore) rank = i + 1;
      u.rank = u.rankOverride ?? rank;
      lastScore = u.score;
    });
    sorted.sort((a, b) => a.rank - b.rank);
    const awarded = store.recordGame(this.gameType, sorted);
    this.results = {
      game: this.gameType,
      title: GAMES[this.gameType].title,
      units: sorted.map((u) => ({
        label: u.label, color: u.color, score: u.score, rank: u.rank,
        names: u.profileIds.map((id) => store.profile(id)?.name),
        allTime: u.profileIds.map((id) => awarded[id] || 0)[0] || 0,
      })),
      ...extra,
    };
    this.clearAllTimers();
    this.game = null;
    this.paused = false;
    const winners = sorted.filter((u) => u.rank === 1).map((u) => u.label).join(' & ');
    this.announce(`🏆 ${winners} gewinnt!`, 'win', `${this.results.title} ist vorbei`);
    this.fx('win');
    this.changed();
  }

  abortGame(by) {
    if (!this.game) return;
    this.clearAllTimers();
    this.game = null;
    this.paused = false;
    this.results = null;
    this.opAnnounce(by, 'hat das Spiel abgebrochen (ohne Wertung)');
    this.changed();
  }

  // ---------- Zustand an Clients ----------
  changed() {
    this.lastActivity = Date.now();
    if (this.flushQueued) return;
    this.flushQueued = true;
    setTimeout(() => {
      this.flushQueued = false;
      this.flush();
    }, 15);
  }

  flush() {
    for (const p of this.players.values()) {
      for (const sid of p.sockets) {
        const s = this.io.sockets.sockets.get(sid);
        if (s) s.emit('state', this.view(p.id));
      }
    }
  }

  playerInfo(pid) {
    const p = this.players.get(pid);
    const prof = store.profile(p.profileId);
    return {
      id: p.id, name: p.name, connected: p.connected, isOperator: pid === this.operatorId,
      avatar: store.imageUrl(prof?.avatar), allTime: prof?.points || 0, profileId: p.profileId,
      teamId: this.game?.teamOf?.(pid)?.id ?? this.teamOf(pid)?.id ?? null,
    };
  }

  view(pid) {
    const isOp = pid === this.operatorId;
    const me = this.players.get(pid);
    const v = {
      now: Date.now(),
      code: this.code,
      me: { id: pid, name: me?.name, isOperator: isOp },
      operatorId: this.operatorId,
      players: [...this.players.keys()].map((id) => this.playerInfo(id)),
      paused: this.paused,
      screen: this.game ? 'game' : this.results ? 'results' : 'lobby',
      gameType: this.gameType,
      games: Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, { title: g.title, teams: g.teams }])),
      options: this.options,
      teams: this.teams,
      teamCount: this.teamCount,
      teamStyles: TEAM_STYLES,
      results: this.results,
      game: this.game ? this.game.view(pid, isOp) : null,
      leaderboard: store.leaderboard(),
      ai: aiEnabled(),
    };
    if (isOp) {
      v.images = store.images();
      v.history = store.history(10);
    }
    return v;
  }
}
