// Ansicht „Die Minderheit gewinnt“: geheim wählen, Gruppen von groß nach klein aufdecken.
import { html, act, gameOp, Avatar, TimerBar, ScoreStrip, GameHead, DoneRow, playerMap, revealState, RevealHint } from '../lib.js';

export function MinderheitView({ st, g }) {
  const pm = playerMap(st);
  const rv = revealState(st, `mh-${g.round}`);
  const isOp = st.me.isOperator;
  const fix = (pid) => {
    const list = g.options.map((o, i) => `${i + 1} = ${o.t}`).join('\n');
    const v = prompt(`${pm[pid]?.name} umsetzen auf:\n${list}`, '');
    const idx = Number(v) - 1;
    if (v && Number.isInteger(idx) && idx >= 0 && idx < g.options.length) gameOp({ type: 'setVote', pid, idx });
  };
  return html`<div class="stage">
    <${GameHead} icon="🐑" title="Die Minderheit gewinnt" sub=${g.round ? `Frage ${g.round}/${g.rounds}${g.mult > 1 ? ' · ×2' : ''}` : null} timer=${g.phase === 'vote' ? g.timers.vote : null} warn=${5} />
    <${ScoreStrip} st=${st} g=${g} hold=${g.pending || {}} />
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">🐑 Die Minderheit gewinnt</div><p class="muted">Jeder wählt geheim eine Antwort. Punkte bekommt nur die kleinste Gruppe!<br/>Denk, was die anderen NICHT denken.</p></div>`}
    ${g.q && g.phase !== 'intro' && html`<div class="card center rise es-q"><div class="fun es-qtext">${g.q}</div></div>`}
    ${g.phase === 'vote' && html`<div class="card">
      <div style="margin-bottom:12px"><${TimerBar} timer=${g.timers.vote} /></div>
      <div class="mh-options">${g.options.map((o, i) => html`<button key=${i} class=${`mh-option c${i} ${g.myVote === i ? 'picked' : ''}`} onClick=${() => act({ type: 'vote', idx: i })}>${o.t}</button>`)}</div>
      <p class="tiny muted center" style="margin:10px 0 0">Du kannst bis zum Ende umentscheiden.</p>
      ${isOp && html`<div class="op-fix"><button class="btn sm" onClick=${() => gameOp({ type: 'swapQuestion' })}>🔄 Andere Frage</button></div>`}
    </div>
    <${DoneRow} st=${st} ids=${g.scores.map((s) => s.pid)} done=${g.voted} />`}
    ${g.phase === 'reveal' && html`<${RevealHint} st=${st} rv=${rv} waitText="Welche Gruppe ist die kleinste? …" />
      <div class="mh-results">${g.options.map((o, i) => html`<div key=${i} class=${`card tight mh-result c${i} ${o.count == null ? 'hidden' : 'rise'} ${o.win ? 'win' : ''}`}>
        <div class="row"><b class="fun" style="font-size:20px;flex:1">${o.t}</b>
          ${o.count != null ? html`<span class="mh-count fun">${o.count}</span>` : html`<span class="muted">?</span>`}</div>
        ${o.voters && html`<div class="row wrap" style="gap:6px">${o.voters.map((pid) => pm[pid] && html`<span key=${pid} class="pill mh-voter">
          <${Avatar} p=${pm[pid]} size=${20} /> ${pm[pid].name}${isOp && html` <button class="btn xs ghost" title="Wahl korrigieren" onClick=${() => fix(pid)}>✏️</button>`}</span>`)}</div>`}
        ${o.win && html`<div class="mh-win fun">🏆 Kleinste Gruppe! +${g.delta?.[o.voters?.[0]] ?? ''}</div>`}
      </div>`)}</div>
      ${g.done && !g.options.some((o) => o.win) && html`<div class="banner">Alle haben dasselbe gewählt – diesmal gewinnt keiner! 🐑🐑🐑</div>`}`}
  </div>`;
}
