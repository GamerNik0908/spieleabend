// Ergebnis-Bildschirm: Plätze werden von hinten nach vorne aufgedeckt, der Sieger zuletzt.
import { html, op, useEffect, useRef, useLocalStagger, play, confetti } from './lib.js';
import { Leaderboard } from './lobby.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export function Results({ st }) {
  const r = st.results;
  const isOp = st.me.isOperator;
  const units = r.units;
  const key = `${r.title}-${units.map((u) => u.label + u.score).join('|')}`;
  const shown = useLocalStagger(key, units.length, 1300, 900);
  const done = shown >= units.length;
  const visible = (i) => i >= units.length - shown; // von hinten nach vorne
  const celebrated = useRef(null);
  useEffect(() => {
    if (done && celebrated.current !== key) {
      celebrated.current = key;
      play('win');
      confetti();
    } else if (shown > 0 && !done) {
      play('reveal');
    }
  }, [shown, done]);

  const top = units.slice(0, 3);
  const podiumOrder = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const rest = units.slice(3);
  return html`<div class="col" style="gap:18px;max-width:980px;margin:0 auto">
    <div class="hero" style="margin:10px 0 0">
      <h1 style="font-size:clamp(30px,5vw,52px)"><span class="w1">${r.title}</span> <span class="w2">Ergebnis</span></h1>
      ${!done && html`<p>Und die Plätze sind …</p>`}
    </div>
    ${rest.length > 0 && html`<div class="card">
      ${rest.map((u, j) => visible(j + 3) && html`<div class="lb-row res-row" style="grid-template-columns:40px 1fr auto auto" key=${u.label}>
        <div class="lb-rank">${u.rank}.</div><b>${u.label}</b><span class="muted small">${u.score} ${r.scoreLabel || ''}</span><span class="pill">+${u.allTime}</span>
      </div>`)}
    </div>`}
    <div class="podium">
      ${podiumOrder.map((u) => {
        const idx = units.indexOf(u);
        const show = visible(idx);
        return html`<div class=${`place p${u.rank} ${show ? 'shown' : 'hidden-place'}`} key=${u.label}>
          <div class="medal">${show ? (MEDALS[u.rank - 1] || '🎖️') : '❔'}</div>
          <div class="block">
            ${show ? html`
              <div class="display" style=${`font-family:var(--font-fun);font-weight:700;font-size:20px;color:${u.color || 'var(--text)'}`}>${u.label}</div>
              ${u.names.length > 1 && html`<div class="small muted">${u.names.join(', ')}</div>`}
              <div style="font-family:var(--font-fun);font-weight:800;font-size:30px;margin-top:6px">${u.score}</div>
              <div class="tiny muted">${r.scoreLabel || 'Punkte'}</div>
              <div class="pill accent" style="margin-top:8px">+${u.allTime} All-Time</div>`
              : html`<div class="muted" style="padding-top:30px">?</div>`}
          </div>
        </div>`;
      })}
    </div>
    ${done && html`<div class="card"><h3>🏆 All-Time-Rangliste</h3><${Leaderboard} st=${st} limit=${15} /></div>`}
    ${isOp ? html`<div class="row" style="justify-content:center">
      <button class="btn primary lg" onClick=${() => op('lobby')}>Zurück zur Lobby</button>
      <button class="btn lg" onClick=${() => op('start')}>🔁 Nochmal spielen</button>
    </div>` : done && html`<p class="center muted">Der Operator wählt gleich das nächste Spiel …</p>`}
  </div>`;
}
