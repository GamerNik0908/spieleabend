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

/** Bilanz pro Person aus den Momenten – Futter für das Urteil am Ende */
function playerStats(room, name) {
  const st = {};
  const get = (pid) => (st[pid] ||= { right: 0, wrong: 0, wins: 0, fooled: 0, drawn: 0, flops: 0, jokes: 0, worst: null });
  for (const m of room.moments) {
    for (const pid of m.pids || []) {
      const s = get(pid);
      if (['answer', 'survey'].includes(m.kind)) {
        if (m.ok) s.right++;
        else if (m.text) { s.wrong++; if (!s.worst || (m.score || 0) >= 3) s.worst = `„${m.text}“ (Frage: ${m.q}${m.a ? `, richtig: ${m.a}` : ''})`; }
      }
      if (m.kind === 'win') s.wins++;
      if (m.kind === 'lie') s.fooled += m.extra?.fooled || 0;
      if (m.kind === 'drawing') { if (m.extra?.guessers) s.drawn++; else s.flops++; }
      if (m.kind === 'joke') s.jokes++;
    }
  }
  const ids = [...room.players.keys()];
  return ids.map((pid) => ({ pid, name: name(pid), ...(st[pid] || get(pid)) }));
}

const ROAST_FALLBACK = [
  (s) => s.wrong > s.right && `${s.wrong} falsche Antworten – ${s.name} rät wie ein Horoskop: selbstbewusst und meistens daneben.`,
  (s) => s.flops > 0 && `${s.name} hat gezeichnet, und niemand wusste, was es sein soll. Moderne Kunst eben.`,
  (s) => s.fooled >= 2 && `${s.name} hat ${s.fooled} Leute angelogen, ohne rot zu werden. Wir sollten reden.`,
  (s) => s.wins >= 1 && `${s.name} hat gewonnen und wird uns das noch wochenlang erzählen.`,
  (s) => s.right > s.wrong && `${s.name} wusste erschreckend viel. Wer hat dir die Antworten gegeben?`,
  (s) => s.right > 0 && `${s.right} richtige Antworten – ${s.name} hat heute heimlich Wikipedia auswendig gelernt.`,
  (s) => `${s.name} war auch da. Mehr gibt es dazu leider nicht zu sagen.`,
  (s) => `${s.name} hat heute vor allem eins bewiesen: Dabei sein ist wirklich alles.`,
  (s) => `${s.name} spielt nach dem Motto: Hauptsache, die anderen haben Spaß.`,
];

/** Fertigen Rückblick bauen. Rückgabe { items, awards, roasts, games, players } */
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
  const name = (pid) => room.players.get(pid)?.name || room.pastNames?.[pid] || '???';
  const stats = playerStats(room, name);
  let ai = null;
  if (room.aiOn && cands.length > 3) {
    ai = await aiHighlights({
      moments: cands.map((m) => ({
        id: String(m.id), game: m.title || m.game, kind: m.kind, who: (m.pids || []).map(name).join(', '),
        context: m.q || '', text: m.text || '', extra: [m.note, m.a && m.ok === false ? `richtig: ${m.a}` : ''].filter(Boolean).join(' · '),
        loud: m.rank - (m.score || 0) > 0,
      })),
      players: stats.map((s) => `${s.name}: ${s.right} richtig, ${s.wrong} falsch, ${s.wins} Spiele gewonnen, ${s.fooled} Leute reingelegt, ${s.drawn} Zeichnungen erraten, ${s.flops} Zeichnungen nicht erkannt${s.worst ? `, schlimmste Antwort: ${s.worst}` : ''}`),
      max: MAX_ITEMS,
    });
  }
  const picks = ai?.picks?.length ? ai.picks : pickLocal(cands, MAX_ITEMS);
  const byId = new Map(cands.map((m) => [String(m.id), m]));
  const aiRoast = new Map((ai?.roasts || []).map((r) => [String(r.name).trim().toLowerCase(), r.line]));
  // Ohne KI: je Person der erste passende Spruch, der noch nicht vergeben ist
  const used = new Set();
  const fallback = (s) => {
    const k = ROAST_FALLBACK.findIndex((f, idx) => !used.has(idx) && f(s));
    const idx = k >= 0 ? k : ROAST_FALLBACK.length - 1 - (used.size % 3);
    used.add(idx);
    return ROAST_FALLBACK[idx](s);
  };
  const roasts = stats.map((s) => ({
    name: s.name,
    avatar: store.imageUrl(store.profile(room.players.get(s.pid)?.profileId)?.avatar),
    line: String(aiRoast.get(s.name.trim().toLowerCase()) || fallback(s)).slice(0, 160),
  }));
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
  return { items, awards: awards(room), roasts, games, players: [...room.players.values()].map((p) => p.name) };
}
