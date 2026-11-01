// Ansicht „Lügenbaron“: Lüge schreiben, Wahrheit suchen, dramatische Auflösung.
import { html, act, useTick, remaining, Avatar, TimerBar, AnswerInput, ScoreStrip, GameHead, DoneRow, playerMap } from '../lib.js';

const STEP = 2600;

function Fact({ q, fill, truth }) {
  const [a, b] = q.split('___');
  return html`<div class="lb-fact fun">${a}<span class=${`lb-gap ${truth ? 'truth' : ''}`}>${fill || '?????'}</span>${b}</div>`;
}

function Reveal({ st, g, pm }) {
  useTick(true, 200);
  const t = g.timers.phase;
  const elapsed = t ? t.duration - remaining(t) : 1e9;
  const n = g.revealOrder.length;
  const step = Math.floor(elapsed / STEP);
  const done = step >= n;
  const shown = g.revealOrder.slice(0, Math.min(n, step + 1));
  const cur = g.options.find((o) => o.id === g.revealOrder[Math.min(step, n - 1)]);
  const names = (ids) => ids.map((p) => pm[p]?.name).join(', ');
  return html`<div class="col" style="gap:16px">
    ${!done && cur && html`<div class=${`lb-reveal card center ${cur.truth ? 'truth' : 'lie'}`} key=${cur.id}>
      <div class="fun lb-opt-text">${cur.text}</div>
      ${cur.truth
        ? html`<div class="lb-verdict truth">✅ DIE WAHRHEIT!</div>
            <div class="muted">${cur.voters.length ? html`Gefunden von: <b>${names(cur.voters)}</b>` : 'Niemand hat sie gefunden! 😱'}</div>`
        : html`<div class="lb-verdict lie">🤥 GELOGEN!</div>
            <div class="muted">${cur.house ? 'Eine Hauslüge vom Lügenbaron persönlich' : html`Ausgedacht von <b>${names(cur.authors)}</b>`}</div>
            <div class="row wrap" style="justify-content:center;margin-top:8px">${cur.voters.map((v) => html`<span class="pill bad" key=${v}>${pm[v]?.name} ist reingefallen</span>`)}</div>`}
    </div>`}
    ${done && html`<div class="card">
      <${Fact} q=${g.q} fill=${g.truth} truth=${true} />
      <div class="col" style="gap:8px;margin-top:14px">
        ${Object.entries(g.delta).sort((a, b) => b[1] - a[1]).map(([pid, d]) => pm[pid] && html`<div class="result-line ok" key=${pid}><${Avatar} p=${pm[pid]} size=${28} /><b>${pm[pid].name}</b><div class="spacer"></div><span class=${`pill ${d > 0 ? 'ok' : ''}`}>+${d}</span></div>`)}
      </div>
    </div>`}
    <div class="row wrap" style="justify-content:center;gap:8px">${shown.map((id) => { const o = g.options.find((x) => x.id === id); return html`<span key=${id} class=${`pill ${o.truth ? 'ok' : 'bad'}`}>${o.truth ? '✅' : '🤥'} ${o.text}</span>`; })}</div>
  </div>`;
}

export function LuegenbaronView({ st, g }) {
  const pm = playerMap(st);
  const timer = g.phase === 'write' ? g.timers.answer : g.phase === 'vote' ? g.timers.vote : null;
  return html`<div class="stage">
    <${GameHead} icon="🤥" title="Lügenbaron" sub=${g.round ? `Runde ${g.round}/${g.rounds}${g.mult > 1 ? ' · ×2' : ''}` : null} timer=${timer} warn=${8} />
    <${ScoreStrip} st=${st} g=${g} />
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">🤥 Lügenbaron</div><p class="muted">Erfinde eine glaubwürdige Lüge für die Lücke. Danach sucht jeder die Wahrheit.<br/>Wahrheit gefunden: +500 · Jemand fällt auf deine Lüge rein: +250 pro Person.</p></div>`}
    ${g.phase === 'write' && html`<div class="card rise">
      <${Fact} q=${g.q} fill=${g.myLie} />
      <div style="margin:16px 0 10px"><${TimerBar} timer=${g.timers.answer} /></div>
      ${g.myLie ? html`<div class="banner">Deine Lüge: <b>„${g.myLie}“</b> – du kannst sie noch ändern.</div>` : html`<div class="banner">Erfinde eine Lüge, die echt klingt! 😈</div>`}
      <div style="margin-top:10px"><${AnswerInput} key=${`l-${g.round}`} live=${false} placeholder="Deine Lüge …" button=${g.myLie ? 'Ändern' : 'Abschicken'} onSubmit=${(text) => act({ type: 'answer', text })} /></div>
    </div>
    <${DoneRow} st=${st} ids=${g.scores.map((s) => s.pid)} done=${g.written} />`}
    ${g.phase === 'vote' && html`<div class="card rise">
      <${Fact} q=${g.q} />
      <div class="banner" style="margin:14px 0">${g.myVote != null ? 'Abgestimmt – warte auf die anderen …' : 'Welche Antwort ist die WAHRHEIT?'}</div>
      <div class="lb-options">${g.options.map((o, i) => html`<button key=${o.id}
        class=${`lb-option c${i % 6} ${g.myVote === o.id ? 'picked' : ''}`} disabled=${o.mine || g.myVote != null}
        onClick=${() => act({ type: 'vote', id: o.id })}>${o.text}${o.mine && html`<span class="tiny">deine Lüge</span>`}</button>`)}</div>
    </div>
    <${DoneRow} st=${st} ids=${g.scores.map((s) => s.pid)} done=${g.voted} />`}
    ${g.phase === 'reveal' && html`<div class="card tight"><${Fact} q=${g.q} /></div><${Reveal} st=${st} g=${g} pm=${pm} />`}
  </div>`;
}
