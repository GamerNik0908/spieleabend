// Highlights des Abends: Die Spiele melden den ganzen Abend über „Momente“ (lustige Antworten,
// gute Lügen, Zeichnungen, Volltreffer, Korrekturen …). Am Ende wählt die KI die besten aus und
// schreibt zu jedem einen kurzen Kommentar – ohne KI entscheidet eine Bewertung nach Regeln.
// Hat der Operator den Ton aufgenommen, verstärken laute Stellen (Lacher) die Momente daneben.
import { aiHighlights } from './aijudge.js';
import * as store from './store.js';

const MAX_ITEMS = 14;
const TAGS = ['lustig', 'schlau', 'cool', 'drama'];
const CAPTION = {
  answer: (m, i) => (m.ok ? ['Sitzt!', 'Gewusst ist gewusst.', 'Klugscheißer-Alarm 🧠'] : ['Knapp daneben ist auch vorbei …', 'Mutig. Falsch, aber mutig.', 'Die Antwort des Abends?', 'Da war die Hoffnung größer als das Wissen.', 'Selbstbewusst daneben 😅'])[i % (m.ok ? 3 : 5)],
  survey: () => 'Die Umfrage sagt …',
  drawing: (m, i) => (m.extra?.guessers ? ['Ein Meisterwerk!', 'Ab ins Museum damit 🖼️', 'Picasso wäre stolz.'][i % 3] : 'Niemand hat es erkannt 😅'),
  lie: (m) => (m.extra?.fooled === 1 ? 'Einer ist voll drauf reingefallen!' : m.extra?.fooled ? `Darauf sind ${m.extra.fooled} reingefallen!` : 'Die Wahrheit klang zu verrückt.'),
  spy: (m) => (m.extra?.caught ? 'Spion geschnappt!' : 'Der Spion kam davon!'),
  joke: (m, i) => ['Der Saal tobt.', 'Comedy-Gold.', 'Dafür gibt es Applaus 👏', 'Humor auf Profi-Niveau.'][i % 4],
  estimate: (m) => (m.extra?.bullseye ? 'Volltreffer!' : 'Ganz leicht verschätzt …'),
  match: (m) => (m.extra?.pts >= 3 ? 'Ein Herz und eine Seele!' : 'Jeder denkt anders …'),
  secret: () => 'Wer schreibt denn sowas?',
  minority: () => 'Allein gegen alle.',
  interrogation: (m) => (m.extra?.solved ? 'Fall gelöst!' : 'Die KI gewinnt.'),
  auction: (m) => (m.ok ? 'Mut wird belohnt!' : 'Alles verzockt!'),
  timeline: (m) => (m.ok ? 'Perfekt einsortiert!' : 'Zeitreise schiefgegangen.'),
  emoji: () => 'Emoji-Kino, Folge 1.',
  fix: () => 'Der Operator greift ein!',
  win: () => 'Und der Sieger ist …',
  loud: () => 'Hier habt ihr euch kaputtgelacht 😂',
};

/** Zeitfenster für den Ton-Ausschnitt eines Moments (Serverzeit) */
function clipWindow(m, loud) {
  const typed = ['answer', 'survey', 'emoji', 'fix'].includes(m.kind);
  let from = m.t - (typed ? 6000 : 2000);
  let to = m.t + (typed ? 6000 : 10000);
  // Lacher in der Nähe? Dann den Ausschnitt um den Lacher legen
  const peak = loud.find((l) => l.t >= m.t - 3000 && l.t <= m.t + 15000);
  if (peak) {
    from = Math.min(from, peak.t - 7000);
    to = Math.max(Math.min(to, peak.t + 4000), peak.t + 3000);
  }
  if (to - from > 15000) from = to - 15000;
  return { from, to };
}

function loudBoost(m, loud) {
  const near = loud.filter((l) => l.t >= m.t - 3000 && l.t <= m.t + 15000);
  return Math.min(6, near.reduce((n, l) => n + 2 + Math.min(2, l.level || 0), 0));
}

/** Auswahl ohne KI: beste Bewertung, aber abwechslungsreich (je Art höchstens 3) */
function pickLocal(cands, n) {
  const perKind = {};
  const perGame = {};
  const seenText = new Set();
  const out = [];
  for (const m of cands) {
    if (out.length >= n) break;
    const key = String(m.text || '').trim().toLowerCase();
    if ((perKind[m.kind] || 0) >= 5 || (perGame[m.game] || 0) >= 8 || (key && seenText.has(key))) continue;
    if (key) seenText.add(key);
    perKind[m.kind] = (perKind[m.kind] || 0) + 1;
    perGame[m.game] = (perGame[m.game] || 0) + 1;
    out.push({ id: m.id, tag: m.tags?.[0] || 'lustig', caption: (CAPTION[m.kind] || (() => ''))(m, perKind[m.kind] - 1) });
  }
  return out;
}

/** Auszeichnungen aus den gesammelten Momenten */
function awards(room) {
  const name = (pid) => room.players.get(pid)?.name || room.pastNames?.[pid] || null;
  const count = (filter) => {
    const c = {};
    for (const m of room.moments.filter(filter)) for (const p of m.pids || []) c[p] = (c[p] || 0) + 1;
    return c;
  };
  const best = (c, min = 1) => {
    const top = Object.entries(c).filter(([p]) => name(p)).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= min ? { pid: top[0], name: name(top[0]), n: top[1] } : null;
  };
  const fooled = {};
  for (const m of room.moments.filter((x) => x.kind === 'lie')) for (const p of m.pids || []) fooled[p] = (fooled[p] || 0) + (m.extra?.fooled || 0);
  const list = [
    ['🧠', 'Schlaumeier', 'die meisten richtigen Antworten', best(count((m) => ['answer', 'survey'].includes(m.kind) && m.ok), 2)],
    ['🤡', 'Kreativster Irrtum', 'die meisten falschen (aber mutigen) Antworten', best(count((m) => m.kind === 'answer' && !m.ok && m.text), 2)],
    ['🎭', 'Meisterlügner', 'die meisten Leute reingelegt', best(fooled, 2)],
    ['🎨', 'Picasso', 'die meisten erratenen Zeichnungen', best(count((m) => m.kind === 'drawing' && m.extra?.guessers > 0 && m.pids?.[0]) , 1)],
    ['😂', 'Witzbold des Abends', 'die meisten gewonnenen Witz-Duelle', best(count((m) => m.kind === 'joke'), 2)],
  ];
  return list.filter(([, , , w]) => w).map(([icon, title, why, w]) => ({ icon, title, why, name: w.name, n: w.n }));
}

/** Fertigen Rückblick bauen. Rückgabe { items, awards, title, games } */
export async function buildRecap(room) {
  const loud = room.loud || [];
  const pool = room.moments.filter((m) => (m.score || 0) > 0).map((m) => ({ ...m, rank: (m.score || 0) + loudBoost(m, loud) }));
  // Laute Stellen ohne passenden Moment werden eigene „Lacher“-Momente
  for (const l of loud) {
    if (!pool.some((m) => l.t >= m.t - 3000 && l.t <= m.t + 15000)) {
      pool.push({ id: `loud-${l.t}`, t: l.t, game: l.game, kind: 'loud', text: 'Großes Gelächter', pids: [], rank: 4 + (l.level || 0), tags: ['lustig'] });
    }
  }
  pool.sort((a, b) => b.rank - a.rank);
  const cands = pool.slice(0, 120);
  let picks = null;
  if (room.aiOn && cands.length > 3) {
    picks = await aiHighlights({
      moments: cands.map((m) => ({
        id: String(m.id), game: m.title || m.game, kind: m.kind, context: m.q || '', text: m.text || '',
        extra: m.note || '', loud: m.rank - (m.score || 0) > 0,
      })),
      max: MAX_ITEMS,
    });
  }
  if (!picks?.length) picks = pickLocal(cands, MAX_ITEMS);
  const byId = new Map(cands.map((m) => [String(m.id), m]));
  const name = (pid) => room.players.get(pid)?.name || room.pastNames?.[pid] || '???';
  const avatar = (pid) => {
    const p = room.players.get(pid);
    return p ? store.imageUrl(store.profile(p.profileId)?.avatar) : null;
  };
  const items = picks
    .map((p) => ({ ...p, m: byId.get(String(p.id)) }))
    .filter((p) => p.m)
    .sort((a, b) => a.m.t - b.m.t)
    .map(({ m, tag, caption }) => ({
      id: String(m.id),
      t: m.t,
      game: m.game,
      gameTitle: m.title || m.game,
      kind: m.kind,
      tag: TAGS.includes(tag) ? tag : 'lustig',
      caption: String(caption || (CAPTION[m.kind] || (() => ''))(m, 0)).slice(0, 120),
      q: m.q || null,
      a: m.a || null,
      text: m.text || null,
      note: m.note || null,
      ok: m.ok ?? null,
      people: (m.pids || []).slice(0, 6).map((pid) => ({ pid, name: name(pid), avatar: avatar(pid) })),
      drawing: m.drawing || null,
      clip: loud.length || room.recordedOnce ? clipWindow(m, loud) : null,
    }));
  const games = [...new Set(room.moments.filter((m) => m.kind === 'win').map((m) => m.title || m.game))];
  return { items, awards: awards(room), games, players: [...room.players.values()].map((p) => p.name) };
}
