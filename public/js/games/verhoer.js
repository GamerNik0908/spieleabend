// Ansicht „Das Verhör“: Ja/Nein-Fragen an die KI, Begriff lösen. Teams oder alle gegen die KI.
import { html, useState, useRef, useEffect, act, gameOp, Avatar, ByTag, Countdown, ScoreStrip, GameHead, teamStyle, playerMap } from '../lib.js';

const LABEL = { ja: '✅ Ja', nein: '❌ Nein', teilweise: '🤏 Teilweise', unklar: '🤷 Unklar', richtig: '🎯 Richtig!', falsch: '❌ Falsch' };

function AskForm({ g }) {
  const [val, setVal] = useState('');
  const send = (type) => {
    const text = val.trim();
    if (!text) return;
    act({ type, text });
    setVal('');
  };
  return html`<form class="answer-form vh-form" onSubmit=${(e) => { e.preventDefault(); send('ask'); }}>
    <input class="input big" value=${val} onInput=${(e) => setVal(e.target.value)} maxlength="140" autocomplete="off"
      placeholder=${g.left ? 'Ja/Nein-Frage, z. B. „Kann man es essen?“' : 'Keine Fragen mehr – jetzt lösen!'} />
    <button class="btn primary lg" disabled=${!g.left}>❓ Fragen</button>
    <button type="button" class="btn lg vh-solve" onClick=${() => send('solve')} title="Den Begriff raten">🎯 Lösen</button>
  </form>`;
}

function QuestionLog({ st, g, pm }) {
  const ref = useRef(null);
  const isOp = st.me.isOperator;
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [g.questions.length]);
  const team = (id) => g.teams?.find((t) => t.id === id);
  return html`<div class="vh-log" ref=${ref}>
    ${!g.questions.length && html`<div class="muted center small">Noch keine Fragen – fangt an!</div>`}
    ${g.questions.map((q) => html`<div key=${q.id} class=${`vh-q ${q.solve ? 'solve' : ''} a-${q.answer || 'pending'}`} style=${g.teamMode && team(q.teamId) ? teamStyle(team(q.teamId).color) : ''}>
      <${Avatar} p=${pm[q.pid]} size=${26} />
      <div class="vh-q-text"><span class="tiny muted">${pm[q.pid]?.name}${q.solve ? ' rät' : ''}</span><b>${q.text}</b></div>
      <div class="vh-a">${q.pending ? html`<span class="pill">…</span>` : html`<span class=${`pill vh-pill-${q.answer}`}>${LABEL[q.answer] || q.answer}</span>`}
        ${q.by && q.by !== 'auto' && html`<${ByTag} by=${q.by} />`}</div>
      ${isOp && g.phase === 'ask' && !q.solve && html`<div class="vh-op">${['ja', 'nein', 'teilweise', 'unklar'].map((a) => html`<button key=${a}
        class=${`btn xs ${q.answer === a ? 'primary' : 'ghost'}`} onClick=${() => gameOp({ type: 'setAnswer', id: q.id, answer: a })}>${a}</button>`)}</div>`}
      ${isOp && g.phase === 'ask' && q.solve && q.answer === 'falsch' && html`<div class="vh-op"><button class="btn xs ok" onClick=${() => gameOp({ type: 'setAnswer', id: q.id, answer: 'richtig' })}>✓ doch richtig</button></div>`}
    </div>`)}
  </div>`;
}

export function VerhoerView({ st, g }) {
  const pm = playerMap(st);
  const isOp = st.me.isOperator;
  const [peek, setPeek] = useState(false);
  const turnTeam = g.teams?.find((t) => t.id === g.turn);
  const clock = g.timers.lastChance || g.timers.round;
  const pendingForOp = isOp && g.questions.some((q) => q.pending && !q.solve);
  return html`<div class="stage">
    <${GameHead} icon="🎭" title="Das Verhör" sub=${g.round ? `Begriff ${g.round}/${g.rounds}` : null} timer=${g.phase === 'ask' ? clock : null} warn=${20} />
    ${g.teamMode
      ? html`<div class="scorebar">${g.teams.map((t) => html`<div key=${t.id} class=${`team-score ${g.turn === t.id ? 'turn' : ''}`} style=${teamStyle(t.color)}>
          <div class="avatars">${t.members.map((pid) => pm[pid] && html`<${Avatar} key=${pid} p=${pm[pid]} size=${30} />`)}</div>
          <div><div class="tname">${t.name}${g.turn === t.id ? ' · dran' : ''}</div><div class="tpts">${t.score}</div></div>
        </div>`)}</div>`
      : html`<div class="vh-tally"><span class="fun">🙋 Ihr ${g.tally.players}</span><span class="muted">:</span><span class="fun">${g.tally.ki} KI 🤖</span></div>
        <${ScoreStrip} st=${st} g=${g} />`}
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">🎭 Das Verhör</div>
      <p class="muted">Die KI kennt einen geheimen Begriff. Stellt Ja/Nein-Fragen und löst ihn!<br/>
      ${g.teamMode ? 'Die Teams fragen abwechselnd – wer zuerst löst, holt die Punkte.' : 'Ihr spielt alle zusammen gegen die KI – mit begrenzten Fragen.'}</p></div>`}
    ${g.phase === 'ask' && html`<div class="card center vh-head">
      <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.12em;font-weight:800">Gesucht wird</div>
      <div class="fun vh-cat">${g.cat}</div>
      <div class="row wrap" style="justify-content:center;gap:8px">
        <span class=${`pill ${g.left <= 3 ? 'bad' : ''}`}>❓ ${g.left}/${g.max} Fragen übrig</span>
        <span class="pill ok">Lösen jetzt: ${g.teamMode ? `+${g.pts}` : `+${g.pts} für dich, +50 für alle`}</span>
        <span class="pill">🎯 noch ${g.guessesLeft}× raten</span>
        ${g.timers.lastChance && html`<span class="pill bad">Letzte Chance! <${Countdown} timer=${g.timers.lastChance} /></span>`}
      </div>
      ${isOp && html`<div class="op-fix">
        <button class="btn xs ghost" onClick=${() => setPeek(!peek)}>${peek ? `🙈 ${g.secret}` : '👀 Lösung zeigen (nur du)'}</button>
        ${pendingForOp && !st.aiOn && html`<span class="tiny muted">KI aus – beantworte die Fragen unten selbst.</span>`}
      </div>`}
    </div>
    ${g.teamMode && html`<div class="banner">${g.canAct ? html`<b>Dein Team ist dran!</b> Eine Frage oder ein Lösungsversuch.` : html`<b style=${`color:${turnTeam?.color}`}>${turnTeam?.name}</b> ist dran …`}
      ${g.timers.answer && html` · <${Countdown} timer=${g.timers.answer} />`}</div>`}
    ${g.canAct && html`<${AskForm} key=${`vh-${g.round}`} g=${g} />`}
    <div class="card tight"><${QuestionLog} st=${st} g=${g} pm=${pm} /></div>
    ${isOp && html`<div class="op-fix row wrap" style="justify-content:center">
      <button class="btn sm" onClick=${() => gameOp({ type: 'newSecret' })}>🔄 Anderer Begriff</button>
      <select class="input" style="width:auto;padding:5px 8px" value="" onChange=${(e) => e.target.value && confirm(`${pm[e.target.value]?.name} hat es gelöst?`) && gameOp({ type: 'solvedBy', pid: e.target.value })}>
        <option value="">✅ Hat es gelöst …</option>${st.players.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
      </select>
    </div>`}`}
    ${g.phase === 'result' && html`<div class=${`card center sp-result ${g.win ? 'won' : 'lost'}`}>
      <div class="fun" style="font-size:32px">${g.win ? `🎉 ${g.why}` : `🤖 ${g.why}`}</div>
      <div style="margin-top:8px">Gesucht war: <b class="fun" style="font-size:28px;color:var(--yellow)">${g.secret}</b></div>
      ${g.win && html`<div class="muted">${pm[g.win.pid]?.name} mit ${g.win.how} · +${g.win.pts}</div>`}
      ${isOp && html`<div class="op-fix"><button class="btn sm" onClick=${() => gameOp({ type: 'undoWin' })}>↩️ Falsch gewertet? Zurücknehmen und weiterspielen</button></div>`}
    </div>
    <div class="card tight"><${QuestionLog} st=${st} g=${g} pm=${pm} /></div>`}
  </div>`;
}
