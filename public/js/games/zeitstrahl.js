// Ansicht „Zeitstrahl“: Karte aussuchen, Lücke anklicken, die anderen wetten mit.
import { html, useState, act, gameOp, Avatar, TimerBar, ScoreStrip, GameHead, DoneRow, playerMap } from '../lib.js';

export function fmtValue(v, dim) {
  if (v == null) return '?';
  if (dim === 'jahr') return v < 0 ? `${-v} v. Chr.` : String(v);
  const abs = Math.abs(v);
  const n = (x, d = 1) => x.toLocaleString('de-DE', { maximumFractionDigits: d });
  if (abs >= 1e12) return `${n(v / 1e12)} Bio. €`;
  if (abs >= 1e9) return `${n(v / 1e9)} Mrd. €`;
  if (abs >= 1e6) return `${n(v / 1e6)} Mio. €`;
  return `${n(v, abs < 100 ? 2 : 0)} €`;
}

function Card({ c, dim, pm, cls = '' }) {
  return html`<div class=${`zs-card ${c.anchor ? 'anchor' : ''} ${c.ok === false ? 'wrong' : ''} ${c.fresh ? 'fresh' : ''} ${cls}`}>
    <div class="zs-emoji">${c.e || '🃏'}</div>
    <div class="zs-t">${c.t}</div>
    <div class="zs-v fun">${fmtValue(c.v, dim)}</div>
    ${c.by && pm[c.by] && html`<div class="zs-by"><${Avatar} p=${pm[c.by]} size=${18} /></div>`}
  </div>`;
}

export function ZeitstrahlView({ st, g }) {
  const pm = playerMap(st);
  const isOp = st.me.isOperator;
  const [sel, setSel] = useState(null);
  const cur = pm[g.current];
  const placing = g.canPlace;
  const chosen = placing ? g.offer?.find((c) => c.id === sel) : null;
  const timer = g.phase === 'place' ? g.timers.answer : g.phase === 'bet' ? g.timers.vote : null;
  // Beim Wetten/Auflösen die gelegte Karte als Platzhalter in der Lücke zeigen
  const ghostGap = g.phase === 'bet' && g.placed ? g.placed.gap : -1;
  const gap = (i) => {
    if (placing && chosen) return html`<button key=${`gap${i}`} class="zs-gap can" onClick=${() => { act({ type: 'place', cardId: chosen.id, gap: i }); setSel(null); }}>⬇<span>hier</span></button>`;
    if (ghostGap === i) return html`<div key=${`gap${i}`} class="zs-gap ghost"><${Card} c=${{ ...g.placed.card }} dim=${g.dim} pm=${pm} cls="ghost" /></div>`;
    return html`<div key=${`gap${i}`} class="zs-gap"></div>`;
  };
  return html`<div class="stage">
    <${GameHead} icon="📏" title="Zeitstrahl" sub=${g.line ? `Strahl ${g.line}/${g.lines} · ${g.dimLabel} · Zug ${g.turnNo}/${g.turnsTotal}` : null} timer=${timer} warn=${8} />
    <${ScoreStrip} st=${st} g=${g} />
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">📏 Zeitstrahl</div><p class="muted">Reihum sucht sich jeder eine Karte aus und legt sie an die richtige Stelle – nach Jahr oder nach Preis.<br/>Die anderen wetten: liegt sie richtig?</p></div>`}
    ${g.dim && g.phase !== 'intro' && html`
      <div class="card center tight"><div class="fun" style="font-size:26px">${g.dim === 'jahr' ? '📅' : '💶'} ${g.title}</div>
        <div class="tiny muted">${g.dim === 'jahr' ? 'Früh links → spät rechts' : 'Günstig links → teuer rechts'}</div></div>
      <div class="zs-line">${g.cards.map((c, i) => [gap(i), html`<${Card} key=${c.id} c=${c} dim=${g.dim} pm=${pm} />`])}${gap(g.cards.length)}</div>
      ${g.phase === 'place' && html`<div class="card">
        <div style="margin-bottom:10px"><${TimerBar} timer=${g.timers.answer} /></div>
        <div class="banner">${placing
          ? (chosen ? html`Jetzt auf <b>⬇ hier</b> im Strahl klicken, wo „${chosen.t}“ hingehört.` : html`<b>Du bist dran!</b> Such dir eine Karte aus:`)
          : html`<b>${cur?.name}</b> sucht sich eine Karte aus …`}</div>
        <div class="zs-offer">${(g.offer || []).map((c) => html`<button key=${c.id} class=${`zs-pick ${sel === c.id ? 'sel' : ''}`} disabled=${!placing} onClick=${() => setSel(sel === c.id ? null : c.id)}>
          <${Card} c=${c} dim=${g.dim} pm=${pm} /></button>`)}</div>
      </div>`}
      ${g.phase === 'bet' && html`<div class="card center">
        <div class="banner"><b>${cur?.name}</b> legt „${g.placed?.card.t}“ an diese Stelle. Liegt das richtig?</div>
        <div style="margin:10px 0"><${TimerBar} timer=${g.timers.vote} /></div>
        ${g.canBet ? html`<div class="row" style="justify-content:center;gap:10px">
            <button class="btn ok lg" onClick=${() => act({ type: 'bet', ok: true })}>👍 Richtig</button>
            <button class="btn bad lg" onClick=${() => act({ type: 'bet', ok: false })}>👎 Falsch</button></div>`
          : html`<div class="muted">${g.current === st.me.id ? 'Die anderen wetten …' : 'Gewettet!'}</div>`}
      </div>
      <${DoneRow} st=${st} ids=${g.scores.map((s) => s.pid).filter((p) => p !== g.current)} done=${g.bets} />`}
      ${g.phase === 'result' && g.result && html`<div class=${`card center sp-result ${g.result.ok ? 'won' : 'lost'}`}>
        <div class="fun" style="font-size:28px">${g.result.ok ? `✅ Richtig! +${g.result.pts}` : '❌ Leider falsch'}</div>
        <div>„${g.placed?.card.t}“: <b class="fun" style="font-size:22px;color:var(--yellow)">${fmtValue(g.placed?.card.v, g.dim)}</b></div>
        <div class="row wrap" style="justify-content:center;gap:6px;margin-top:8px">${Object.entries(g.bets || {}).map(([pid, b]) => pm[pid] && html`<span key=${pid} class=${`pill ${b === g.result.ok ? 'ok' : 'bad'}`}>${pm[pid].name} ${b ? '👍' : '👎'}${b === g.result.ok ? ' +50' : ''}</span>`)}</div>
        ${isOp && html`<div class="op-fix"><button class="btn sm" onClick=${() => gameOp({ type: 'flip' })}>✏️ ${g.result.ok ? 'Doch falsch werten' : 'Doch richtig werten'}</button></div>`}
      </div>`}
      ${g.phase === 'skipped' && html`<div class="banner">⏰ Zug verpasst – weiter geht's.</div>`}`}
  </div>`;
}
