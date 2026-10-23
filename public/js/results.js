// Ergebnis-Bildschirm nach jedem Spiel mit Podest und All-Time-Punkten.
import { html, op } from './lib.js';
import { Leaderboard } from './lobby.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export function Results({ st }) {
  const r = st.results;
  const isOp = st.me.isOperator;
  const top = r.units.slice(0, 3);
  const podiumOrder = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  return html`<div class="col" style="gap:18px;max-width:980px;margin:0 auto">
    <div class="hero" style="margin:10px 0 0">
      <h1 style="font-size:clamp(30px,5vw,52px)">${r.title} – <span class="grad">Ergebnis</span></h1>
    </div>
    <div class="podium">
      ${podiumOrder.map((u) => html`<div class=${`place p${u.rank}`} key=${u.label}>
        <div class="medal">${MEDALS[u.rank - 1] || '🎖️'}</div>
        <div class="block">
          <div class="display" style=${`font-size:22px;font-weight:800;color:${u.color || 'var(--text)'}`}>${u.label}</div>
          ${u.names.length > 1 && html`<div class="small muted">${u.names.join(', ')}</div>`}
          <div class="display" style="font-size:30px;font-weight:800;margin-top:6px">${u.score}</div>
          <div class="tiny muted">${r.scoreLabel || 'Punkte'}</div>
          <div class="pill accent" style="margin-top:8px">+${u.allTime} All-Time</div>
        </div>
      </div>`)}
    </div>
    ${r.units.length > 3 && html`<div class="card">
      ${r.units.slice(3).map((u) => html`<div class="lb-row" style="grid-template-columns:40px 1fr auto auto" key=${u.label}>
        <div class="lb-rank">${u.rank}.</div><b>${u.label}</b><span class="muted small">${u.score} ${r.scoreLabel || ''}</span><span class="pill">+${u.allTime}</span>
      </div>`)}
    </div>`}
    <div class="card"><h3>🏆 All-Time-Rangliste</h3><${Leaderboard} st=${st} limit=${15} /></div>
    ${isOp ? html`<div class="row" style="justify-content:center">
      <button class="btn primary lg" onClick=${() => op('lobby')}>Zurück zur Lobby</button>
      <button class="btn lg" onClick=${() => op('start')}>🔁 Nochmal spielen</button>
    </div>` : html`<p class="center muted">Der Operator wählt gleich das nächste Spiel …</p>`}
  </div>`;
}
