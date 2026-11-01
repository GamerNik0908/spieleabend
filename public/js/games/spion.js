// Ansicht „Der Spion“: Geheime Rolle, Hinweise reihum, Abstimmung, Spion rät.
import { html, useState, act, gameOp, Avatar, TimerBar, TypingView, AnswerInput, ScoreStrip, GameHead, playerMap } from '../lib.js';

function RoleCard({ g, big }) {
  const [hidden, setHidden] = useState(false);
  if (!g.role) return null;
  const r = g.role;
  return html`<div class=${`sp-role ${r.spy ? 'spy' : 'agent'} ${big ? 'big' : ''}`} onClick=${() => !big && setHidden(!hidden)} title="Klicken zum Verdecken">
    ${hidden ? html`<span class="fun">🙈 verdeckt – klicken</span>`
      : r.spectator ? html`<span class="fun">👀 Du schaust zu · Wort: ${r.word}</span>`
        : r.spy ? html`<div class="fun sp-role-main">🕵️ DU BIST DER SPION!</div><div>Kategorie: <b>${g.cat}</b> – finde das Wort heraus, ohne aufzufliegen.</div>`
          : html`<div class="tiny" style="text-transform:uppercase;letter-spacing:.1em;font-weight:900">Geheimes Wort · ${g.cat}</div><div class="fun sp-role-main">${r.word}</div>`}
  </div>`;
}

function Clues({ st, g, pm, votable }) {
  return html`<div class="sp-grid">
    ${g.order.map((pid) => pm[pid] && html`<div key=${pid}
      class=${`sp-player ${g.current === pid ? 'active' : ''} ${votable && pid !== st.me.id ? 'votable' : ''} ${g.myVote === pid ? 'voted' : ''} ${g.spy === pid ? 'is-spy' : ''}`}
      onClick=${() => votable && pid !== st.me.id && act({ type: 'vote', target: pid })}>
      ${g.voteCounts?.[pid] && html`<span class="votes-badge">${g.voteCounts[pid]}</span>`}
      <div class="row" style="gap:10px"><${Avatar} p=${pm[pid]} size=${46} /><b class="fun" style="font-size:20px">${pm[pid].name}</b>${g.spy === pid && html`<span class="pill bad">🕵️ Spion</span>`}</div>
      <div class="sp-clues">${g.clues.filter((c) => c.pid === pid).map((c, i) => html`<span key=${i} class="sp-clue">${c.text}</span>`)}
        ${g.current === pid && html`<span class="sp-clue typing-clue"><${TypingView} pid=${pid} me=${st.me.id} /></span>`}</div>
      ${g.votes?.[pid] && html`<div class="vote-line">stimmt für <b>${pm[g.votes[pid]]?.name}</b></div>`}
    </div>`)}
  </div>`;
}

export function SpionView({ st, g }) {
  const pm = playerMap(st);
  const timer = g.phase === 'clues' || g.phase === 'spyGuess' ? g.timers.answer : g.phase === 'vote' ? g.timers.vote : null;
  return html`<div class="stage">
    <${GameHead} icon="🕵️" title="Der Spion" sub=${g.round ? `Runde ${g.round}/${g.rounds}` : null} timer=${timer} warn=${8} />
    <${ScoreStrip} st=${st} g=${g} />
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">🕵️ Einer von euch ist ein Spion …</div><p class="muted">Alle kennen das geheime Wort – nur der Spion nicht. Gebt reihum Hinweise, die zeigen, dass ihr es kennt, ohne es zu verraten.<br/>Der Spion muss bluffen. Danach wird abgestimmt!</p></div>`}
    ${g.phase === 'roles' && html`<${RoleCard} g=${g} big=${true} /><div class="banner">Merk dir deine Rolle – gleich geht's los!</div>`}
    ${['clues', 'vote', 'spyGuess', 'result'].includes(g.phase) && html`
      ${g.phase !== 'result' && html`<${RoleCard} g=${g} />`}
      ${g.catWords && g.phase !== 'result' && html`<div class="card tight"><div class="section-title">Mögliche Wörter (nur du siehst das)</div><div class="row wrap" style="gap:6px">${g.catWords.map((w) => html`<span class="pill" key=${w}>${w}</span>`)}</div></div>`}
      ${g.phase === 'clues' && html`<div class="card tight">
        <div class="banner">${g.canClue ? html`<span class="big">Dein Hinweis!</span> <span class="small muted">(1–3 Wörter, nicht das Wort selbst)</span>` : g.current ? html`<b>${pm[g.current]?.name}</b> überlegt sich einen Hinweis …` : 'Gleich ist der Nächste dran …'}</div>
        ${g.current && html`<div style="margin:10px 0"><${TimerBar} timer=${g.timers.answer} /></div>`}
        ${g.canClue && html`<${AnswerInput} key=${`c-${g.clues.length}`} placeholder="Dein Hinweiswort …" button="Sagen" onSubmit=${(text) => act({ type: 'answer', text })} />`}
      </div>`}
      ${g.phase === 'vote' && html`<div class="card tight center"><div class="fun" style="font-size:30px">🗳️ Wer ist der Spion?</div>
        <div class="muted">${g.canVote ? 'Diskutiert und klickt auf einen Spieler.' : g.myVote ? html`Du verdächtigst <b>${pm[g.myVote]?.name}</b>.` : 'Warte auf die Abstimmung …'} · ${g.voted.length}/${g.players.length} haben gewählt</div></div>`}
      ${g.phase === 'spyGuess' && html`<div class="card tight center"><div class="fun" style="font-size:28px">🎯 ${pm[g.spy]?.name} ist enttarnt!</div>
        <div class="muted">Letzte Chance: Wenn der Spion das Wort errät, gewinnt er trotzdem.</div>
        ${g.canGuess ? html`<div style="margin-top:10px"><${AnswerInput} placeholder="Das geheime Wort ist …" button="Raten" onSubmit=${(text) => act({ type: 'answer', text })} /></div>` : html`<${TypingView} pid=${g.spy} me=${st.me.id} />`}</div>`}
      ${g.phase === 'result' && g.result && html`<div class=${`card center sp-result ${g.result.caught ? 'won' : 'lost'}`}>
        <div class="fun" style="font-size:34px">${g.result.caught ? '🎉 Spion geschnappt!' : '🕵️ Der Spion gewinnt!'}</div>
        <div class="muted" style="font-size:17px">${g.result.why}</div>
        <div style="margin-top:10px">Spion war <b>${pm[g.spy]?.name}</b> · das Wort war <b class="fun" style="font-size:22px;color:var(--yellow)">${g.word}</b>${g.guess ? html` · geraten: „${g.guess}“` : ''}</div>
        <div class="row wrap" style="justify-content:center;margin-top:10px">${Object.entries(g.result.delta).map(([pid, d]) => html`<span class="pill ok" key=${pid}>${pm[pid]?.name} +${d}</span>`)}</div>
        ${st.me.isOperator && html`<div class="op-fix"><button class="btn sm" onClick=${() => gameOp({ type: 'flipResult' })}>✏️ Falsch gewertet? Ausgang umkehren (${g.result.caught ? 'Spion gewinnt' : 'Spion geschnappt'})</button></div>`}
      </div>`}
      <${Clues} st=${st} g=${g} pm=${pm} votable=${g.canVote} />`}
  </div>`;
}
