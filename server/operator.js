// Alle Operator-Aktionen. Jede spürbare Änderung wird groß für alle eingeblendet.
import * as store from './store.js';
import { GAMES } from './room.js';

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
    case 'announce': {
      const text = String(a.text || '').trim().slice(0, 140);
      if (text) room.announce(text, 'megaphone', `${name(by)} (Operator)`, { operator: true });
      break;
    }
    case 'game': {
      if (!room.game) throw new Error('Kein Spiel aktiv.');
      room.game.op(by, a.action || {});
      break;
    }
    default:
      throw new Error('Unbekannte Operator-Aktion');
  }
  room.changed();
}
