// Automatische Team-Einteilung für jede Spielerzahl.
export const TEAM_STYLES = [
  { id: 'rot', name: 'Team Rot', color: '#ff4d6d' },
  { id: 'blau', name: 'Team Blau', color: '#4d9bff' },
  { id: 'gruen', name: 'Team Grün', color: '#3ddc84' },
  { id: 'gelb', name: 'Team Gelb', color: '#ffc93c' },
];

/** Empfohlene Teamanzahl pro Spiel und Spielerzahl */
export function defaultTeamCount(game, n) {
  if (game === 'familienduell') return 2;
  if (game === 'quizduell') {
    if (n <= 3) return Math.max(1, n); // jeder für sich
    return Math.min(4, Math.max(2, Math.ceil(n / 3))); // 4→2×2, 6→2×3, 7→3,2,2, 9→3×3, 12→4×3
  }
  return 0; // Einzelspiel
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Verteilt Spieler-IDs auf `count` Teams.
 * mode 'random' = zufällig, 'fair' = Schlangen-Draft nach All-Time-Punkten
 */
export function makeTeams(players, count, mode = 'random', skill = () => 0) {
  count = Math.max(1, Math.min(count, TEAM_STYLES.length, players.length || 1));
  const teams = TEAM_STYLES.slice(0, count).map((s) => ({ ...s, members: [] }));
  let order = shuffle(players);
  if (mode === 'fair') order = [...order].sort((a, b) => skill(b) - skill(a));
  // Schlangen-Reihenfolge: 0,1,2,2,1,0,... – gleicht Stärke und Größe aus
  order.forEach((pid, i) => {
    const round = Math.floor(i / count);
    const pos = i % count;
    const idx = round % 2 === 0 ? pos : count - 1 - pos;
    teams[idx].members.push(pid);
  });
  // Größen ausgleichen (max. 1 Unterschied), falls Schlange ungleich verteilt hat
  teams.sort((a, b) => b.members.length - a.members.length);
  while (teams[0].members.length - teams[teams.length - 1].members.length > 1) {
    teams[teams.length - 1].members.push(teams[0].members.pop());
    teams.sort((a, b) => b.members.length - a.members.length);
  }
  return teams.sort((a, b) => TEAM_STYLES.findIndex((s) => s.id === a.id) - TEAM_STYLES.findIndex((s) => s.id === b.id));
}
