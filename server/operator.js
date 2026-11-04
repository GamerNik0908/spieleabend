// Alle Operator-Aktionen. Jede spürbare Änderung wird groß für alle eingeblendet.
import * as store from './store.js';
import { GAMES } from './room.js';
import { buildRecap } from './highlights.js';

const OPTION_LIMITS = {
  quizduell: {
    rounds: [1, 2], rows: [3, 5], cols: [4, 6], answerSeconds: [10, 90], buzzSeconds: [3, 20],
    stealSeconds: [5, 45], pickSeconds: [10, 90], wrongPenalty: 'bool',
  },
  familienduell: {
    rounds: [1, 8], finalQuestions: [0, 8], answerSeconds: [8, 60], stealSeconds: [10, 90],
    buzzSeconds: [5, 30], finalSeconds: [10, 60], lastRoundDouble: 'bool',
  },
  duemmste: { lives: [1, 5], roundSeconds: [30, 600], answerSeconds: [5, 40], voteSeconds: [15, 120] },
  montagsmaler: { rounds: [1, 4], drawSeconds: [30, 180], choiceSeconds: [5, 30], hints: 'bool' },
  luegenbaron: { rounds: [2, 12], writeSeconds: [20, 120], voteSeconds: [10, 60] },
  spion: { rounds: [1, 12], clueRounds: [1, 3], clueSeconds: [10, 60], voteSeconds: [20, 180], guessSeconds: [10, 60] },
  witzbold: { rounds: [1, 3], answerSeconds: [30, 180], voteSeconds: [10, 45], final: 'bool' },
  schaetzen: { rounds: [3, 20], answerSeconds: [10, 60] },
  gleichdenker: { rounds: [3, 20], answerSeconds: [10, 90] },
  werwars: { rounds: [2, 15], answerSeconds: [20, 180], guessSeconds: [20, 180] },
  minderheit: { rounds: [3, 25], voteSeconds: [8, 60] },
  verhoer: { teamMode: 'bool', rounds: [1, 10], maxQuestions: [5, 40], roundSeconds: [60, 900], turnSeconds: [15, 120] },
  auktion: { rounds: [3, 20], bidSeconds: [15, 120], answerSeconds: [10, 90], startPoints: [200, 5000] },
  zeitstrahl: { lines: [1, 6], turns: [1, 8], choices: [1, 5], turnSeconds: [15, 120], betSeconds: [5, 30], years: 'bool', prices: 'bool' },
  emoji: { rounds: [3, 30], answerSeconds: [15, 120], hints: 'bool' },
};

export function handleOp(room, by, a) {
  if (!room.isOperator(by)) throw new Error('Nur der Operator darf das.');
  const name = (pid) => room.name(pid);
  switch (a.type) {
    case 'setGame': {
      if (room.game) throw new Error('Erst das laufende Spiel beenden.');
      if (!GAMES[a.game]) throw new Error('Unbekanntes Spiel');
      room.gameType = a.game;
      room.teamCount = null;
      room.teams = null;
      room.teamsManual = false;
      room.results = null;
      room.rebuildTeams();
      room.opAnnounce(by, `wählt das Spiel „${GAMES[a.game].title}“`);
      break;
    }
    case 'setOption': {
      const lim = OPTION_LIMITS[room.gameType]?.[a.key];
      if (!lim) throw new Error('Unbekannte Einstellung');
      let v = a.value;
      if (lim === 'bool') v = !!v;
      else v = Math.max(lim[0], Math.min(lim[1], Math.round(Number(v) || lim[0])));
      room.options[room.gameType][a.key] = v;
      break;
    }
    case 'teams': {
      if (room.game) throw new Error('Teams nur in der Lobby ändern.');
      if (a.count) room.teamCount = Math.max(1, Math.min(4, a.count));
      room.rebuildTeams(a.mode || 'random', room.teamCount);
      room.teamsManual = true;
      room.opAnnounce(by, a.mode === 'fair' ? 'mischt faire Teams (nach All-Time-Punkten) ⚖️' : 'mischt die Teams neu 🎲',
        room.teams?.map((t) => `${t.name}: ${t.members.map(name).join(', ')}`).join(' · '));
      break;
    }
    case 'movePlayer': {
      if (room.game) throw new Error('Teams nur in der Lobby ändern.');
      const target = room.teams?.find((t) => t.id === a.teamId);
      if (!target) throw new Error('Team nicht gefunden');
      for (const t of room.teams) t.members = t.members.filter((m) => m !== a.pid);
      target.members.push(a.pid);
      room.teamsManual = true;
      room.opAnnounce(by, `schiebt ${name(a.pid)} zu ${target.name}`);
      break;
    }
    case 'start':
      room.startGame(by);
      break;
    case 'pause':
      room.pause(by);
      break;
    case 'resume':
      room.resume(by);
      break;
    case 'abort':
      room.abortGame(by);
      break;
    case 'finish': {
      if (!room.game) throw new Error('Kein Spiel aktiv.');
      room.opAnnounce(by, 'beendet das Spiel jetzt – mit Wertung 🏁');
      room.game.finish();
      break;
    }
    case 'lobby':
      room.results = null;
      break;
    case 'kick': {
      if (a.pid === by) throw new Error('Du kannst dich nicht selbst rauswerfen.');
      const n = name(a.pid);
      room.removePlayer(a.pid);
      room.opAnnounce(by, `hat ${n} aus dem Raum entfernt`);
      break;
    }
    case 'makeOperator': {
      if (!room.players.has(a.pid)) throw new Error('Spieler nicht gefunden');
      room.operatorId = a.pid;
      room.opAnnounce(by, `übergibt die Operator-Rolle an ${name(a.pid)} 👑`);
      break;
    }
    case 'avatar': {
      const p = room.players.get(a.pid);
      if (!p) throw new Error('Spieler nicht gefunden');
      store.setAvatar(p.profileId, a.imageId || null);
      const url = a.imageId ? store.imageUrl(a.imageId) : null;
      if (url) room.opAnnounce(by, `verpasst ${p.name} ein neues Bild 🖼️`, '', { image: url });
      else room.opAnnounce(by, `entfernt das Bild von ${p.name}`);
      break;
    }
    case 'deleteImage':
      store.removeImage(a.imageId);
      break;
    case 'allTime': {
      const prof = store.profile(a.profileId);
      if (!prof) throw new Error('Profil nicht gefunden');
      const delta = Math.round(Number(a.delta) || 0);
      store.adjustPoints(prof.id, delta);
      room.opAnnounce(by, `ändert den All-Time-Score von ${prof.name}: ${delta > 0 ? '+' : ''}${delta}`);
      break;
    }
    case 'resetAllTime':
      store.resetAllTime();
      room.opAnnounce(by, 'setzt den All-Time-Score für alle auf 0 zurück 🧹');
      break;
    case 'resetQuestions':
      store.clearUsed();
      room.opAnnounce(by, 'gibt alle bereits gespielten Fragen wieder frei');
      break;
    case 'score': {
      if (!room.game?.adjustScore) throw new Error('Gerade nicht möglich.');
      const delta = Math.round(Number(a.delta) || 0);
      const label = room.game.adjustScore(a.unitId, delta);
      if (!label) throw new Error('Team nicht gefunden');
      room.opAnnounce(by, `${delta > 0 ? 'gibt' : 'zieht'} ${label} ${Math.abs(delta)} Punkte ${delta > 0 ? '' : 'ab'}`.trim());
      break;
    }
    case 'tutorial': {
      const game = a.game || room.gameType;
      if (!GAMES[game]) throw new Error('Unbekanntes Spiel');
      room.tutorial = { game, step: Math.max(0, Number(a.step) || 0) };
      break;
    }
    case 'tutorialClose':
      room.tutorial = null;
      break;
    case 'edit': {
      // Bearbeiten (vor allem in der Pause): Punkte, Timer, Einstellungen, Spieldetails
      const g = room.game;
      if (!g) throw new Error('Kein Spiel aktiv.');
      const e = a.edit || {};
      if (e.kind === 'score') {
        const v = Math.round(Number(e.value));
        if (!Number.isFinite(v)) throw new Error('Ungültige Zahl');
        const label = g.setScore?.(e.unitId, v);
        if (!label) throw new Error('Nicht gefunden');
        room.opAnnounce(by, `setzt die Punkte von ${label} auf ${v}`);
      } else if (e.kind === 'timer') {
        const sec = Math.round(Number(e.seconds));
        if (!Number.isFinite(sec) || sec < 1) throw new Error('Ungültige Zeit');
        if (!room.setTimerRemaining(e.key, sec * 1000)) throw new Error('Timer läuft nicht');
        room.opAnnounce(by, `stellt die Uhr auf ${sec} Sekunden ⏱`);
      } else if (e.kind === 'option') {
        const lim = OPTION_LIMITS[room.gameType]?.[e.key];
        if (!lim) throw new Error('Unbekannte Einstellung');
        let v = e.value;
        if (lim === 'bool') v = !!v;
        else v = Math.max(lim[0], Math.min(lim[1], Math.round(Number(v) || lim[0])));
        g.opts[e.key] = v;
        room.options[room.gameType][e.key] = v;
        room.opAnnounce(by, 'ändert eine Spieleinstellung ⚙️');
      } else if (e.kind === 'team') {
        if (!g.moveToTeam || !g.teams) throw new Error('Dieses Spiel hat keine Teams.');
        const label = g.moveToTeam(e.pid, e.teamId);
        if (!label) throw new Error('Team nicht gefunden');
        room.opAnnounce(by, `setzt ${name(e.pid)} in ${label}`);
      } else if (e.kind === 'game') {
        g.edit?.(by, e) ?? (() => { throw new Error('Nicht möglich'); })();
      } else {
        throw new Error('Unbekannte Bearbeitung');
      }
      break;
    }
    case 'announce': {
      const text = String(a.text || '').trim().slice(0, 140);
      if (text) room.announce(text, 'megaphone', `${name(by)} (Operator)`, { operator: true });
      break;
    }
    case 'game': {
      if (!room.game) throw new Error('Kein Spiel aktiv.');
      // „Weiter“ während einer Auflösung / Wartepause: direkt zum nächsten Schritt
      if (a.action?.type === 'skip' && (room.waiting || room.timers.has('phase') || (room.reveal && !room.reveal.done)) && !['answer', 'vote', 'buzz', 'pick', 'draw', 'choose'].some((k) => room.timers.has(k))) {
        room.advance();
        break;
      }
      room.game.op(by, a.action || {});
      break;
    }
    case 'reveal': {
      // Operator klickt einen Namen an → dessen Antwort wird aufgedeckt
      const r = room.reveal;
      if (!r || r.done) throw new Error('Gerade wird nichts aufgedeckt.');
      if (r.ordered && a.id != null && r.ids.find((x) => !r.shown.includes(x)) !== String(a.id)) throw new Error('Hier wird der Reihe nach aufgedeckt – drück auf Weiter.');
      room.revealOne(a.id);
      break;
    }
    // ---------- Highlights & Rückblick ----------
    case 'recapBuild': {
      if (room.recap?.status === 'building') throw new Error('Der Rückblick wird schon erstellt …');
      if (room.moments.length < 3) throw new Error('Noch zu wenig passiert – spielt erst eine Runde!');
      const version = (room.recap?.version || 0) + 1;
      room.recap = { status: 'building', data: null, version };
      room.changed();
      buildRecap(room).then((data) => {
        if (room.recap?.version !== version) return;
        room.recap = { ...room.recap, status: data.items.length ? 'ready' : 'empty', data };
        room.changed();
      }).catch((err) => {
        console.error('[Rückblick]', err);
        if (room.recap?.version === version) { room.recap.status = 'error'; room.changed(); }
      });
      break;
    }
    case 'recapReset':
      room.moments = [];
      room.loud = [];
      room.recap = null;
      room.opAnnounce(by, 'startet einen neuen Abend – alle Highlights wurden gelöscht');
      break;
    case 'recording':
      room.recording = !!a.on;
      if (room.recording) {
        room.recordedOnce = true;
        room.announce('🔴 Ton-Aufnahme läuft', 'op', 'Nur auf dem PC des Operators – für das Highlight-Video');
      } else room.announce('⏹ Ton-Aufnahme beendet', 'op');
      break;
    case 'loud': {
      // Laute Stelle (meist Gelächter) aus der Aufnahme des Operators – nur Zeitpunkt und Stärke
      const t = Number(a.t);
      if (!Number.isFinite(t) || Math.abs(t - Date.now()) > 60000) throw new Error('Ungültiger Zeitpunkt');
      room.loud.push({ t, level: Math.max(0, Math.min(3, Number(a.level) || 1)), game: room.game ? room.gameType : null });
      if (room.loud.length > 400) room.loud.shift();
      return; // kein Neuzeichnen nötig
    }
    case 'advance':
      if (!room.advance()) throw new Error('Gerade gibt es nichts zum Weiterschalten.');
      break;
    case 'setRoom': {
      if ('manualAdvance' in a) {
        room.manualAdvance = !!a.manualAdvance;
        room.opAnnounce(by, room.manualAdvance ? 'schaltet auf „Operator klickt weiter“ 👆' : 'schaltet auf automatisches Weiterspielen ⏩');
        if (!room.manualAdvance && room.waiting) room.advance();
      }
      if ('revealSeq' in a) {
        room.revealSeq = !!a.revealSeq;
        room.opAnnounce(by, room.revealSeq ? 'deckt Antworten jetzt Spieler für Spieler auf 🎭' : 'deckt Antworten jetzt alle gleichzeitig auf');
        if (!room.revealSeq) room.revealAll();
      }
      if ('aiOn' in a) {
        room.aiOn = !!a.aiOn;
        room.opAnnounce(by, room.aiOn ? 'schaltet den KI-Richter an 🤖' : 'schaltet den KI-Richter aus');
      }
      break;
    }
    default:
      throw new Error('Unbekannte Operator-Aktion');
  }
  room.changed();
}
