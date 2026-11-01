// Ansicht „Wer war's?“: geheim antworten (oder passen), anonym zuordnen, Antwort für Antwort aufdecken.
import { html, act, gameOp, Avatar, TimerBar, AnswerInput, ScoreStrip, GameHead, DoneRow, playerMap, revealState, RevealHint } from '../lib.js';

function GuessCard({ st, g, e, pm }) {
  const chosen = g.myGuesses[e.id];
  const isOp = st.me.isOperator;
  return html`<div class=${`card tight ww-card ${e.excluded ? 'excluded' : ''}`}>
    <div class="ww-text fun">„${e.text}“</div>
    ${e.mine ? html`<div class="pill">✍️ deine Antwort</div>` : html`<div class="row wrap ww-names">
      ${g.authors.filter((p) => p !== st.me.id).map((pid) => pm[pid] && html`<button key=${pid}
        class=${`btn xs ${chosen === pid ? 'primary' : ''}`} onClick=${() => act({ type: 'guess', id: e.id, target: chosen === pid ? null : pid })}>
        ${pm[pid].name}</button>`)}
    </div>`}
    ${isOp && html`<button class="btn xs ghost" onClick=${() => gameOp({ type: 'exclude', id: e.id })}>${e.excluded ? '↩️ wieder werten' : '✂️ nicht werten'}</button>`}
  </div>`;
}

function RevealCard({ st, g, e, pm, rv }) {
  const open = rv.isShown(e.id);
  const isOp = st.me.isOperator;
  const click = !open && rv.canClick;
  return html`<div class=${`card tight ww-card ${open ? 'open rise' : ''} ${click ? 'clickable' : ''} ${e.excluded ? 'excluded' : ''}`} onClick=${() => click && rv.click(e.id)}>
    <div class="ww-text fun">„${e.text}“</div>
    ${open && e.pid ? html`<div class="row" style="gap:10px;justify-content:center"><${Avatar} p=${pm[e.pid]} size=${40} /><b class="fun" style="font-size:22px">${pm[e.pid]?.name}</b></div>
      <div class="small center">${e.right?.length ? html`✅ erkannt von ${e.right.map((p) => pm[p]?.name).join(', ')}` : '🕶️ niemand hat es erkannt'}
        ${e.wrong?.length ? html` · <span class="muted">daneben: ${e.wrong.map((p) => pm[p]?.name).join(', ')}</span>` : ''}</div>`
      : html`<div class="muted center">${click ? '👆 Klicken zum Aufdecken' : '❓ Von wem?'}${isOp && e.pid ? html` <span class="tiny faint">(${pm[e.pid]?.name})</span>` : ''}</div>`}
    ${e.excluded && html`<div class="pill bad">zählt nicht</div>`}
    ${isOp && html`<button class="btn xs ghost" onClick=${(ev) => { ev.stopPropagation(); gameOp({ type: 'exclude', id: e.id }); }}>${e.excluded ? '↩️ wieder werten' : '✂️ nicht werten'}</button>`}
  </div>`;
}

export function WerwarsView({ st, g }) {
  const pm = playerMap(st);
  const rv = revealState(st, `ww-${g.round}`);
  const isOp = st.me.isOperator;
  const timer = g.phase === 'answer' ? g.timers.answer : g.phase === 'guess' ? g.timers.vote : null;
  const hold = rv.running && g.delta ? g.delta : {};
  const mine = Object.keys(g.myGuesses).length;
  const toGuess = g.list.filter((e) => !e.mine).length;
  return html`<div class="stage">
    <${GameHead} icon="🕶️" title="Wer war's?" sub=${g.round ? `Frage ${g.round}/${g.rounds}` : null} timer=${timer} warn=${8} />
    <${ScoreStrip} st=${st} g=${g} hold=${hold} />
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">🕶️ Wer war's?</div><p class="muted">Alle beantworten geheim dieselbe Frage. Dann ratet ihr, wer was geschrieben hat.<br/>Richtig zugeordnet: +100 · Für jeden, der dich nicht erkennt: +50.</p></div>`}
    ${g.q && g.phase !== 'intro' && html`<div class="card center rise es-q"><div class="fun es-qtext">${g.q}</div></div>`}
    ${g.phase === 'answer' && html`<div class="card">
      <div style="margin-bottom:12px"><${TimerBar} timer=${g.timers.answer} /></div>
      ${g.myAnswer && html`<div class="banner" style="margin-bottom:10px">Deine Antwort: <b>„${g.myAnswer}“</b> – du kannst sie noch ändern.</div>`}
      ${g.passed && html`<div class="banner" style="margin-bottom:10px">Du passt bei dieser Frage – raten darfst du trotzdem.</div>`}
      <${AnswerInput} key=${`ww-${g.round}-${g.q}`} live=${false} placeholder="Kurz und ehrlich (oder schön gelogen) …" button=${g.myAnswer ? 'Ändern' : 'Abschicken'} onSubmit=${(text) => act({ type: 'answer', text })} />
      <div class="row" style="justify-content:space-between;margin-top:10px">
        <span class="tiny muted">Keine Ahnung, was du schreiben sollst? Dann pass einfach.</span>
        ${!g.passed && html`<button class="btn sm ghost" onClick=${() => act({ type: 'pass' })}>🙅 Passen</button>`}
      </div>
      ${isOp && html`<div class="op-fix"><button class="btn sm" onClick=${() => gameOp({ type: 'swapQuestion' })}>🔄 Andere Frage für alle</button></div>`}
    </div>
    <${DoneRow} st=${st} ids=${g.scores.map((s) => s.pid)} done=${g.answered} />`}
    ${g.phase === 'guess' && html`<div class="banner">Wer hat was geschrieben? Klick bei jeder Antwort auf einen Namen. (${mine}/${toGuess})</div>
      <div class="ww-grid">${g.list.map((e) => html`<${GuessCard} key=${e.id} st=${st} g=${g} e=${e} pm=${pm} />`)}</div>
      <div class="row" style="justify-content:center">${g.guessers.includes(st.me.id)
        ? html`<span class="pill ok">✅ Fertig – warte auf die anderen</span>`
        : html`<button class="btn primary" onClick=${() => act({ type: 'done' })}>Fertig geraten</button>`}</div>
      <${DoneRow} st=${st} ids=${g.scores.map((s) => s.pid)} done=${g.guessers} />`}
    ${g.phase === 'reveal' && html`<${RevealHint} st=${st} rv=${rv} waitText="Von wem ist welche Antwort? …" />
      <div class="ww-grid">${g.list.map((e) => html`<${RevealCard} key=${e.id} st=${st} g=${g} e=${e} pm=${pm} rv=${rv} />`)}</div>`}
  </div>`;
}
