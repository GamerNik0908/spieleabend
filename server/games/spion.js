// „Der Spion“: Alle kennen das geheime Wort – nur der Spion kennt bloß die Kategorie.
// Reihum gibt jeder ein Hinweiswort, dann wird abgestimmt. Wird der Spion enttarnt,
// darf er noch das Wort raten und so doch gewinnen.
import { SoloGame, shuffle, judgeSingle } from './base.js';
import { matchAnswer, normalize } from '../matcher.js';
import { SPION } from '../data/index.js';

export class Spion extends SoloGame {
  static defaultOptions() {
    return { rounds: 5, clueRounds: 2, clueSeconds: 30, voteSeconds: 75, guessSeconds: 25 };
  }

  constructor(room, opts) {
    super(room, opts);
    this.round = 0;
    this.phase = 'intro';
    this.wasSpy = new Set();
    this.usedWords = new Set();
    this.result = null;
  }

  start() {
    this.room.step(6000, () => this.nextRound(), 'Erste Runde');
  }

  nextRound() {
    if (this.round >= this.opts.rounds) return this.finish();
    const players = this.online();
    if (players.length < 3) {
      this.room.announce('Der Spion braucht mindestens 3 Spieler', 'op');
      return this.finish();
    }
    this.round++;
    const cat = SPION[Math.floor(Math.random() * SPION.length)];
    const words = cat.words.filter((w) => !this.usedWords.has(w));
    this.word = (words.length ? words : cat.words)[Math.floor(Math.random() * (words.length || cat.words.length))];
    this.usedWords.add(this.word);
    this.cat = cat.cat;
    this.catWords = cat.words;
    let cands = players.filter((p) => !this.wasSpy.has(p));
    if (!cands.length) { this.wasSpy.clear(); cands = players; }
    this.spy = cands[Math.floor(Math.random() * cands.length)];
    this.wasSpy.add(this.spy);
    this.order = shuffle(players);
    this.inRound = new Set(players);
    this.clues = [];
    this.clueIdx = -1;
    this.votes = {};
    this.result = null;
    this.guess = null;
    this.phase = 'roles';
    this.room.step(7000, () => this.nextClue(), 'Hinweise starten');
    this.changed();
  }

  nextClue() {
    this.clueIdx++;
    const total = this.order.length * this.opts.clueRounds;
    if (this.clueIdx >= total) return this.startVote();
    const pid = this.order[this.clueIdx % this.order.length];
    if (!this.room.players.has(pid)) return this.nextClue();
    this.current = pid;
    this.phase = 'clues';
    this.room.typing = null;
    this.room.setTimer('answer', this.opts.clueSeconds * 1000, () => this.addClue(pid, '…', true));
    this.changed();
  }

  addClue(pid, text, timeout = false) {
    if (this.phase !== 'clues' || pid !== this.current) throw new Error('Du bist gerade nicht dran.');
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!text) throw new Error('Gib ein Hinweiswort ein.');
    if (!timeout) {
      const n = normalize(text);
      const w = normalize(this.word);
      if (pid !== this.spy && (matchAnswer(text, { a: this.word }) || (w.length > 3 && n.replace(/ /g, '').includes(w.replace(/ /g, ''))))) {
        throw new Error('Das verrät das Wort! Nimm einen anderen Hinweis. 🤫');
      }
      if (text.split(' ').length > 3) throw new Error('Maximal drei Wörter!');
    }
    this.clues.push({ pid, text, round: Math.floor(this.clueIdx / this.order.length) + 1 });
    this.current = null; // verhindert doppelte Hinweise durch Doppelklick
    this.room.clearTimer('answer');
    this.room.typing = null;
    this.room.setTimer('phase', 900, () => this.nextClue());
    this.changed();
  }

  startVote() {
    this.phase = 'vote';
    this.current = null;
    this.room.fx('gong');
    this.room.announce('🗳️ Wer ist der Spion?', 'vote', 'Diskutiert und stimmt ab!');
    this.room.setTimer('vote', this.opts.voteSeconds * 1000, () => this.closeVote());
    this.changed();
  }

  vote(pid, target) {
    if (this.phase !== 'vote') throw new Error('Gerade wird nicht abgestimmt.');
    if (!this.inRound.has(pid) || !this.inRound.has(target) || pid === target) throw new Error('Ungültige Wahl.');
    this.votes[pid] = target;
    const voters = [...this.inRound].filter((p) => this.connected(p));
    if (voters.every((p) => this.votes[p])) this.room.setTimer('vote', 1500, () => this.closeVote());
    this.changed();
  }

  closeVote() {
    if (this.phase !== 'vote') return;
    this.room.clearTimer('vote');
    const counts = {};
    for (const t of Object.values(this.votes)) counts[t] = (counts[t] || 0) + 1;
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter((p) => counts[p] === max);
    this.voteCounts = counts;
    if (top.length === 1 && top[0] === this.spy) {
      this.phase = 'spyGuess';
      this.room.announce(`🎯 ${this.name(this.spy)} ist enttarnt!`, 'spy', 'Letzte Chance: Errät der Spion das Wort?');
      this.room.setTimer('answer', this.opts.guessSeconds * 1000, () => this.spyGuess(this.spy, '', true));
    } else {
      this.finishRound(false, top.length > 1 ? 'Gleichstand – niemand wurde enttarnt!' : `Falsch verdächtigt: ${this.name(top[0] || this.spy)}`);
    }
    this.changed();
  }

  async spyGuess(pid, text, timeout = false) {
    if (this.phase !== 'spyGuess' || pid !== this.spy) throw new Error('Nur der Spion darf jetzt raten.');
    if (this.guessing) return;
    this.room.clearTimer('answer');
    this.guess = String(text || '').trim().slice(0, 40);
    let ok = !timeout && this.guess && matchAnswer(this.guess, { a: this.word });
    // KI prüft Synonyme/Umschreibungen des geheimen Wortes
    if (!ok && !timeout && this.guess && this.room.aiOn) {
      this.guessing = true;
      this.changed();
      const r = await judgeSingle(`Geheimes Wort aus der Kategorie „${this.cat}“`, { a: this.word }, this.guess, { mode: 'draw' });
      this.guessing = false;
      if (this.phase !== 'spyGuess') return;
      ok = r.ok;
    }
    if (ok) this.finishRound(false, `Der Spion hat das Wort erraten: „${this.word}“!`);
    else this.finishRound(true, 'Der Spion wurde geschnappt!');
  }

  finishRound(caught, why) {
    const delta = {};
    const add = (p, n) => { delta[p] = (delta[p] || 0) + n; this.scores[p] = (this.scores[p] || 0) + n; };
    if (caught) {
      for (const p of this.inRound) if (p !== this.spy) {
        add(p, 200);
        if (this.votes[p] === this.spy) add(p, 100);
      }
    } else {
      add(this.spy, 500);
      for (const p of this.inRound) if (p !== this.spy && this.votes[p] === this.spy) add(p, 100);
    }
    this.result = { caught, why, delta };
    this.phase = 'result';
    this.room.fx(caught ? 'win-round' : 'lose');
    this.room.step(7000, () => this.nextRound(), this.round >= this.opts.rounds ? 'Zum Ergebnis' : 'Nächste Runde');
    this.changed();
  }

  finish() {
    this.room.clearAllTimers();
    this.room.finishGame(this.soloUnits(), { scoreLabel: 'Punkte' });
  }

  act(pid, a) {
    if (a.type === 'answer') {
      if (this.phase === 'spyGuess') return this.spyGuess(pid, a.text);
      return this.addClue(pid, a.text);
    }
    if (a.type === 'vote') return this.vote(pid, a.target);
    throw new Error('Unbekannte Aktion');
  }

  canType(pid) {
    return (this.phase === 'clues' && this.current === pid) || (this.phase === 'spyGuess' && this.spy === pid);
  }

  op(by, a) {
    if (a.type === 'skip' && this.phase === 'clues') {
      this.room.opAnnounce(by, `überspringt den Hinweis von ${this.name(this.current)}`);
      this.addClue(this.current, '…', true);
    } else if (a.type === 'skip' && this.phase === 'vote') {
      this.room.opAnnounce(by, 'beendet die Abstimmung');
      this.closeVote();
    } else if (!this.baseOp(by, a)) {
      throw new Error('Unbekannte Operator-Aktion');
    }
    this.changed();
  }

  view(pid) {
    const reveal = this.phase === 'result';
    const inRound = this.inRound?.has(pid);
    const isSpy = pid === this.spy;
    return {
      type: 'spion',
      phase: this.phase,
      round: this.round,
      rounds: this.opts.rounds,
      cat: this.cat,
      role: !this.spy ? null : !inRound ? { spectator: true, word: this.word } : isSpy ? { spy: true } : { word: this.word },
      word: reveal || this.phase === 'spyGuess' && !isSpy ? this.word : undefined,
      catWords: isSpy || reveal ? this.catWords : undefined,
      order: this.order,
      clues: this.clues || [],
      current: this.current,
      players: this.inRound ? [...this.inRound] : [],
      voted: Object.keys(this.votes || {}),
      myVote: this.votes?.[pid] || null,
      votes: reveal || this.phase === 'spyGuess' ? this.votes : null,
      voteCounts: reveal || this.phase === 'spyGuess' ? this.voteCounts : null,
      spy: reveal || this.phase === 'spyGuess' ? this.spy : null,
      guess: reveal ? this.guess : null,
      result: this.result,
      scores: this.scoreList(),
      timers: { answer: this.timer('answer'), vote: this.timer('vote'), phase: this.timer('phase') },
      canClue: this.phase === 'clues' && this.current === pid,
      canVote: this.phase === 'vote' && inRound && !this.votes[pid],
      canGuess: this.phase === 'spyGuess' && isSpy,
      opts: this.opts,
    };
  }
}
