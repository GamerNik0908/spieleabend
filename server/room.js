// Ein Spieleabend-Raum: Spieler, Operator, Lobby-Einstellungen, Timer (pausierbar),
// Einblendungen ("Operator hat … gemacht") und Spielablauf.
import crypto from 'node:crypto';
import * as store from './store.js';
import { makeTeams, defaultTeamCount, TEAM_STYLES } from './teams.js';
import { aiEnabled, aiProvider } from './aijudge.js';
import { QuizDuell } from './games/quizduell.js';
import { FamilienDuell } from './games/familienduell.js';
import { Duemmste } from './games/duemmste.js';
import { Montagsmaler } from './games/montagsmaler.js';
import { Luegenbaron } from './games/luegenbaron.js';
import { Spion } from './games/spion.js';
import { Witzbold } from './games/witzbold.js';
import { Schaetzen } from './games/schaetzen.js';
import { Gleichdenker } from './games/gleichdenker.js';
import { Werwars } from './games/werwars.js';
import { Minderheit } from './games/minderheit.js';
import { Verhoer } from './games/verhoer.js';
import { Auktion } from './games/auktion.js';
import { Zeitstrahl } from './games/zeitstrahl.js';
import { EmojiKino } from './games/emoji.js';
import { catalogStats } from './data/index.js';

export const GAMES = {
  quizduell: { cls: QuizDuell, title: 'Quiz Duell', teams: true },
  familienduell: { cls: FamilienDuell, title: 'Familien-Duell', teams: true },
  duemmste: { cls: Duemmste, title: 'Der Dümmste fliegt', teams: false },
  montagsmaler: { cls: Montagsmaler, title: 'Montagsmaler', teams: false, min: 2 },
  luegenbaron: { cls: Luegenbaron, title: 'Lügenbaron', teams: false, min: 2 },
  spion: { cls: Spion, title: 'Der Spion', teams: false, min: 3 },
  witzbold: { cls: Witzbold, title: 'Witzbold', teams: false, min: 3 },
  schaetzen: { cls: Schaetzen, title: 'Schätzmeister', teams: false },
  gleichdenker: { cls: Gleichdenker, title: 'Gleichdenker', teams: true, min: 2 },
  // Neu – noch nicht getestet
  werwars: { cls: Werwars, title: "Wer war's?", teams: false, min: 3, isNew: true },
  minderheit: { cls: Minderheit, title: 'Die Minderheit gewinnt', teams: false, min: 3, isNew: true },
  verhoer: { cls: Verhoer, title: 'Das Verhör', teams: true, isNew: true },
  auktion: { cls: Auktion, title: 'Wissens-Auktion', teams: true, min: 2, isNew: true },
  zeitstrahl: { cls: Zeitstrahl, title: 'Zeitstrahl', teams: false, isNew: true },
  emoji: { cls: EmojiKino, title: 'Emoji-Kino', teams: false, isNew: true },
};

const token = () => crypto.randomBytes(16).toString('hex');
// Kennung der Zuschauer-Ansicht (TV/Stream): sieht alles Öffentliche, aber keine Geheimnisse
export const TV_ID = '__tv__';

export class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();
    this.operatorId = null;
    this.game = null;
    this.gameType = 'quizduell';
    this.options = Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, g.cls.defaultOptions()]));
    this.teams = null;
    this.teamCount = null;
    this.teamsManual = false; // true, sobald der Operator Teams von Hand ändert
    this.paused = false;
    this.timers = new Map();
    this.results = null;
    this.tutorial = null; // { game, step } – vom Operator gesteuerte Erklär-Folien
    // Highlights des Abends: Momente aus allen Spielen, laute Stellen (Lacher) aus der Ton-Aufnahme
    this.moments = [];
    this.momentSeq = 0;
    this.loud = [];
    this.pastNames = {};
    this.recording = false; // Operator nimmt gerade Ton auf (nur auf seinem PC)
    this.recordedOnce = false;
    this.recap = null; // { status, open, idx, data }
    this.aiOn = true; // KI-Richter für diesen Raum (falls ein Key gesetzt ist)
    this.manualAdvance = true; // Operator klickt „Weiter“ statt automatischem Weiterspringen
    this.revealSeq = true; // Antworten Spieler für Spieler aufdecken (statt alle gleichzeitig)
    this.waiting = null; // { label, cb } – wartet auf den Operator
    this.reveal = null; // { key, ids, shown, ordered, then } – Antworten nacheinander aufdecken
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

  /** Zuschauer-Ansicht (z. B. für Discord-Stream) – kein Spieler, nur Zuschauen */
  watch(socket) {
    (this.watchers ||= new Set()).add(socket.id);
    socket.data.room = this.code;
    socket.data.playerId = null;
    socket.data.watcher = true;
    socket.join(this.code);
    this.changed();
  }

  detach(socket) {
    this.watchers?.delete(socket.id);
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
    this.pastNames[pid] = p.name; // für den Rückblick
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
    if (key === 'phase') { this.waitLabel = null; this.waiting = null; }
    this.timers.set(key, { deadline: now + ms, duration: ms, remaining: ms, cb });
    this.changed();
  }

  clearTimer(key) {
    this.timers.delete(key);
  }

  clearAllTimers() {
    this.timers.clear();
    this.waiting = null;
    this.reveal = null;
  }

  // ---------- Aufdecken: Spieler für Spieler ----------
  /**
   * Startet eine Aufdeckung. ids: Reihenfolge (bei ordered = schlechtester zuerst).
   * ordered=false: Der Operator klickt die Namen in beliebiger Reihenfolge an.
   * Weiter/Enter deckt immer den nächsten auf. Danach ruft es then() auf.
   * Ohne „nacheinander aufdecken“ ist sofort alles sichtbar.
   */
  startReveal(key, ids, { ordered = false, autoMs = 1600 } = {}, then = () => {}) {
    ids = ids.map(String);
    this.clearTimer('reveal');
    if (!this.revealSeq || !ids.length) {
      this.reveal = { key, ids, shown: [...ids], ordered, done: true };
      then();
      return this.changed();
    }
    this.reveal = { key, ids, shown: [], ordered, done: false, then, autoMs };
    this.queueReveal();
    this.changed();
  }

  queueReveal() {
    const r = this.reveal;
    if (!r || r.done) return;
    const next = () => this.revealOne();
    if (this.manualAdvance) {
      const nextId = r.ids.find((id) => !r.shown.includes(id));
      const name = !r.ordered ? this.players.get(nextId)?.name : null;
      this.waiting = { label: name ? `${name} aufdecken` : 'Nächsten aufdecken', cb: next, reveal: true };
    } else {
      this.setTimer('reveal', r.shown.length ? r.autoMs : 900, next);
    }
  }

  revealAll() {
    while (this.reveal && !this.reveal.done) if (!this.revealOne()) break;
  }

  /** Nächsten (oder einen bestimmten) aufdecken */
  revealOne(id = null) {
    const r = this.reveal;
    if (!r || r.done) return false;
    id = id == null ? r.ids.find((x) => !r.shown.includes(x)) : String(id);
    if (!r.ids.includes(id) || r.shown.includes(id)) return false;
    if (this.waiting?.reveal) this.waiting = null;
    this.clearTimer('reveal');
    r.shown.push(id);
    this.fx('reveal');
    if (r.shown.length >= r.ids.length) {
      r.done = true;
      const then = r.then;
      r.then = null;
      then?.();
    } else this.queueReveal();
    this.changed();
    return true;
  }

  /**
   * Größerer Spielschritt (nächste Runde, nächste Frage …): Die Auflösung läuft `ms` lang.
   * Danach geht es automatisch weiter – oder, im Modus „Operator klickt weiter“, erst auf Klick.
   */
  step(ms, cb, label = 'Weiter') {
    this.waiting = null;
    this.setTimer('phase', ms, () => {
      if (this.manualAdvance && this.game) {
        this.waiting = { label, cb };
        const op = this.players.get(this.operatorId);
        if (op) this.emitTo(op.id, 'fx', { kind: 'announce' });
        this.changed();
      } else cb();
    });
    this.waitLabel = label;
  }

  /** Operator: zum nächsten Schritt (wartet gerade etwas, oder läuft die Auflösung noch) */
  advance() {
    // Läuft eine Aufdeckung, deckt „Weiter“ zuerst den Nächsten auf
    if (this.reveal && !this.reveal.done) return this.revealOne();
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      w.cb();
      this.changed();
      return true;
    }
    const t = this.timers.get('phase');
    if (t) {
      this.timers.delete('phase');
      this.waiting = null;
      // Auflösung überspringen → direkt weiter (auch im Klick-Modus, der Operator hat ja geklickt)
      const manual = this.manualAdvance;
      this.manualAdvance = false;
      try { t.cb(); } finally { this.manualAdvance = manual; }
      this.waiting = null;
      this.changed();
      return true;
    }
    return false;
  }

  timerView(key) {
    const t = this.timers.get(key);
    if (!t) return null;
    const remaining = this.paused ? t.remaining : Math.max(0, t.deadline - Date.now());
    return { endsAt: this.paused ? null : t.deadline, duration: t.duration, remaining, paused: this.paused };
  }

  // Operator (Pause): Timer auf eine bestimmte Restzeit setzen
  setTimerRemaining(key, ms) {
    const t = this.timers.get(key);
    if (!t) return false;
    ms = Math.max(1000, ms);
    if (this.paused) t.remaining = ms;
    else t.deadline = Date.now() + ms;
    t.duration = Math.max(t.duration, ms);
    this.changed();
    return true;
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
        try {
          const res = t.cb();
          if (res?.catch) res.catch((err) => console.error('Timer-Fehler', key, err.message));
        } catch (err) { console.error('Timer-Fehler', key, err); }
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
    // Korrekturen mitten im Spiel sind oft die besten Geschichten des Abends
    if (this.game && !/extra|Sekunden|springt|weiter|beendet|deckt|löst/.test(text)) {
      this.moment('fix', { pids: [by], text: `${this.name(by)} ${text}`, note: sub, score: 2, tags: ['drama'] });
    }
  }

  /** Ein Spiel meldet einen möglichen Highlight-Moment (siehe highlights.js) */
  moment(kind, data = {}) {
    const def = GAMES[this.gameType];
    this.moments.push({ id: ++this.momentSeq, t: Date.now(), game: this.gameType, title: def?.title, kind, ...data });
    if (this.moments.length > 3000) {
      // Bei sehr langen Abenden die unwichtigsten Momente vergessen
      const keep = [...this.moments].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 2500);
      const ids = new Set(keep.map((m) => m.id));
      this.moments = this.moments.filter((m) => ids.has(m.id));
    }
  }

  // Nachricht nur an einen Spieler (alle seine Tabs)
  emitTo(pid, event, data) {
    const p = this.players.get(pid);
    if (!p) return;
    for (const sid of p.sockets) this.io.sockets.sockets.get(sid)?.emit(event, data);
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
    if (def.min && this.connectedIds().length < def.min) throw new Error(`${def.title} braucht mindestens ${def.min} Spieler.`);
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
    if (sorted[0]) {
      const winners = sorted.filter((u) => u.rank === 1).map((u) => u.label).join(' & ');
      const pids = [...this.players.values()].filter((p) => sorted.filter((u) => u.rank === 1).some((u) => u.profileIds?.includes(p.profileId))).map((p) => p.id);
      this.moment('win', { pids, text: `${winners} gewinnt ${GAMES[this.gameType]?.title}!`, note: `${sorted[0].score} Punkte`, score: 3, tags: ['cool'] });
    }
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
    // Sieger wird nicht vorab eingeblendet – der Ergebnis-Bildschirm deckt von hinten nach vorne auf
    this.fx('gong');
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
        if (!s) continue;
        // Ein Fehler in einer Spielansicht darf nie den ganzen Server lahmlegen
        try { s.emit('state', this.view(p.id)); } catch (err) { console.error('[Ansicht]', this.gameType, err); }
      }
    }
    if (this.watchers?.size) {
      let tv = null;
      try { tv = this.view(TV_ID); } catch (err) { console.error('[TV-Ansicht]', this.gameType, err); }
      for (const sid of this.watchers) {
        const s = this.io.sockets.sockets.get(sid);
        if (!s) this.watchers.delete(sid);
        else if (tv) s.emit('state', tv);
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
      me: { id: pid, name: pid === TV_ID ? 'Zuschauer' : me?.name, isOperator: isOp, tv: pid === TV_ID },
      operatorId: this.operatorId,
      players: [...this.players.keys()].map((id) => this.playerInfo(id)),
      paused: this.paused,
      screen: this.game ? 'game' : this.results ? 'results' : 'lobby',
      gameType: this.gameType,
      games: Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, { title: g.title, teams: g.teams, isNew: !!g.isNew }])),
      options: this.options,
      teams: this.teams,
      teamCount: this.teamCount,
      teamStyles: TEAM_STYLES,
      results: this.results,
      tutorial: this.tutorial,
      moments: this.moments.length,
      recording: this.recording,
      recap: this.recap ? {
        status: this.recap.status,
        open: this.recap.open,
        idx: this.recap.idx,
        count: this.recap.data?.items.length || 0,
        // Nur die gerade gezeigte Folie mitschicken – den Rest holt sich, wer ihn braucht (recap:get)
        item: this.recap.open && this.recap.data ? this.recap.data.items[this.recap.idx - 1] || null : null,
        intro: this.recap.open && this.recap.data && this.recap.idx === 0 ? { games: this.recap.data.games, players: this.recap.data.players, count: this.recap.data.items.length } : null,
        awards: this.recap.open && this.recap.data && this.recap.idx > this.recap.data.items.length ? this.recap.data.awards : null,
        version: this.recap.version,
      } : null,
      waiting: this.waiting ? { label: this.waiting.label } : null,
      reveal: this.reveal ? { key: this.reveal.key, shown: this.reveal.shown, ordered: this.reveal.ordered, done: this.reveal.done, total: this.reveal.ids.length } : null,
      nextLabel: this.timers.has('phase') ? this.waitLabel || null : null,
      manualAdvance: this.manualAdvance,
      revealSeq: this.revealSeq,
      aiOn: this.aiOn,
      game: this.game ? this.game.view(pid, isOp) : null,
      leaderboard: store.leaderboard(),
      ai: aiEnabled(),
      aiName: aiProvider(),
    };
    if (isOp) {
      v.images = store.images();
      v.history = store.history(10);
    }
    return v;
  }
}
