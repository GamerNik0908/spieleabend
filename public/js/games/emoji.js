// Ansicht „Emoji-Kino“: Emoji-Rätsel, alle tippen gleichzeitig, Tipp zur Halbzeit.
import { html, useState, useRef, useEffect, act, gameOp, ByTag, Avatar, TimerBar, AnswerInput, ScoreStrip, GameHead, playerMap } from '../lib.js';

function Guesses({ st, g, pm }) {
  const ref = useRef(null);
  const isOp = st.me.isOperator;
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [g.chat.length]);
  return html`<div class="mm-chat card tight">
    <div class="section-title">Rateversuche</div>
    <div class="mm-msgs" ref=${ref}>
      ${!g.chat.length && html`<div class="muted small">Noch keine Tipps …</div>`}
      ${g.chat.map((c) => c.kind === 'hit'
        ? html`<div key=${c.id} class="mm-msg hit">✅ <b>${pm[c.pid]?.name}</b> hat's! <span class="pill ok">+${c.pts}</span>${c.by !== 'auto' && html` <${ByTag} by=${c.by} />`}
            ${isOp && html` <button class="btn xs bad" title="Treffer zurücknehmen" onClick=${() => gameOp({ type: 'revoke', pid: c.pid })}>✗</button>`}</div>`
        : html`<div key=${c.id} class="mm-msg"><b>${pm[c.pid]?.name}:</b> ${c.text}${c.kind === 'accepted' ? ' ✓' : ''}
            ${isOp && c.kind === 'guess' && g.phase === 'guess' && !g.solved[c.pid] && html` <button class="btn xs ok" onClick=${() => gameOp({ type: 'accept', id: c.id })}>✓ zählt</button>`}</div>`)}
    </div>
  </div>`;
}

export function EmojiView({ st, g }) {
  const pm = playerMap(st);
  const isOp = st.me.isOperator;
  const [peek, setPeek] = useState(false);
  const solvers = Object.entries(g.solved).sort((a, b) => a[1].rank - b[1].rank);
  return html`<div class="stage">
    <${GameHead} icon="😶" title="Emoji-Kino" sub=${g.round ? `Rätsel ${g.round}/${g.rounds}` : null} timer=${g.phase === 'guess' ? g.timers.answer : null} warn=${8} />
    <${ScoreStrip} st=${st} g=${g} />
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">😶 Emoji-Kino</div><p class="muted">Welcher Film, welches Lied, welches Sprichwort steckt in den Emojis?<br/>Tippt so oft ihr wollt – je schneller, desto mehr Punkte.</p></div>`}
    ${g.e && g.phase !== 'intro' && html`<div class="card center rise em-card">
      <div class="pill accent">${g.cat}</div>
      <div class="em-emojis">${g.e}</div>
      ${g.hint && g.phase === 'guess' && html`<div class="banner em-hint">💡 Tipp: ${g.hint}</div>`}
      ${g.phase === 'reveal' && html`<div class="big-answer">${g.a}</div>`}
      ${isOp && g.phase === 'guess' && html`<div class="op-fix">
        <button class="btn xs ghost" onClick=${() => setPeek(!peek)}>${peek ? `🙈 ${g.a}` : '👀 Lösung zeigen (nur du)'}</button>
        <button class="btn xs" onClick=${() => gameOp({ type: 'swapQuestion' })}>🔄 Anderes Rätsel</button>
      </div>`}
    </div>`}
    ${g.phase === 'guess' && html`<div style="margin-bottom:-4px"><${TimerBar} timer=${g.timers.answer} /></div>
      ${g.canGuess ? html`<${AnswerInput} key=${`em-${g.round}`} live=${false} placeholder="Was ist das?" button="Raten" onSubmit=${(text) => text && act({ type: 'answer', text })} />`
        : html`<div class="banner" style="color:var(--ok)">✅ Gelöst! Schau zu, wie die anderen rätseln.</div>`}`}
    ${g.phase === 'reveal' && html`<div class="card tight">
      <div class="section-title">Gelöst</div>
      ${!solvers.length ? html`<div class="muted">Niemand hat es erkannt 😶</div>`
        : html`<div class="col" style="gap:6px">${solvers.map(([pid, s]) => pm[pid] && html`<div key=${pid} class="result-line ok"><span class="lb-rank">${s.rank}.</span><${Avatar} p=${pm[pid]} size=${26} /><b>${pm[pid].name}</b><div class="spacer"></div><span class="pill ok">+${s.pts}</span><${ByTag} by=${s.by} /></div>`)}</div>`}
    </div>`}
    ${g.phase !== 'intro' && html`<${Guesses} st=${st} g=${g} pm=${pm} />`}
  </div>`;
}
