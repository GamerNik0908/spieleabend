// Ansicht „Wissens-Auktion“: Kategorie sehen, im Team-Chat absprechen, geheim bieten,
// Gebote aufdecken, das Höchstgebot antwortet.
import { html, useState, useRef, useEffect, act, gameOp, Avatar, ByTag, Judging, TimerBar, AnswerInput, GameHead, teamStyle, playerMap, revealState, RevealHint } from '../lib.js';

function TeamChat({ st, g, pm }) {
  const [val, setVal] = useState('');
  const ref = useRef(null);
  const entries = Object.entries(g.chat || {});
  const total = entries.reduce((n, [, l]) => n + l.length, 0);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [total]);
  if (!entries.length) return null;
  const team = (id) => g.teams.find((t) => t.id === id);
  return html`<div class="card tight au-chat">
    <div class="section-title">💬 ${g.myTeam ? 'Team-Chat (nur dein Team liest mit)' : 'Team-Chats (nur du siehst alle)'}</div>
    <div class="au-msgs" ref=${ref}>
      ${!total && html`<div class="muted small">Sprecht euch hier ab: Wie viel bieten wir?</div>`}
      ${entries.flatMap(([tid, list]) => list.map((m) => ({ ...m, tid }))).sort((a, b) => a.id - b.id).map((m) => html`<div key=${m.id} class="au-msg" style=${teamStyle(team(m.tid)?.color)}>
        ${!g.myTeam && html`<span class="tiny" style=${`color:${team(m.tid)?.color}`}>${team(m.tid)?.name} · </span>`}<b>${pm[m.pid]?.name}:</b> ${m.text}</div>`)}
    </div>
    ${g.myTeam && html`<form class="row" style="gap:6px" onSubmit=${(e) => { e.preventDefault(); if (val.trim()) { act({ type: 'chat', text: val }); setVal(''); } }}>
      <input class="input" value=${val} onInput=${(e) => setVal(e.target.value)} maxlength="200" placeholder="Nachricht ans Team …" autocomplete="off" />
      <button class="btn sm">Senden</button>
    </form>`}
  </div>`;
}

function BidBox({ st, g, pm }) {
  const t = g.teams.find((x) => x.id === g.myTeam);
  const b = g.bids[g.myTeam];
  const [val, setVal] = useState('');
  if (!t) return null;
  const max = Math.max(0, t.score);
  const set = (n) => act({ type: 'bid', amount: Math.max(0, Math.min(max, n)) });
  return html`<div class="card au-bid" style=${teamStyle(t.color)}>
    <div class="row wrap" style="justify-content:space-between">
      <div><div class="tiny muted">Gebot von ${t.name}</div><div class="fun au-amount">${b.amount}</div>
        ${b.by && html`<div class="tiny muted">zuletzt gesetzt von ${pm[b.by]?.name}</div>`}</div>
      <div class="col" style="gap:6px;align-items:flex-end">
        <div class="row wrap" style="gap:6px">${[0, 100, 200, 300, 500].filter((n) => n <= max).map((n) => html`<button key=${n} class="btn xs" onClick=${() => set(n)}>${n}</button>`)}
          <button class="btn xs" onClick=${() => set(b.amount + 50)}>+50</button><button class="btn xs bad" onClick=${() => set(max)}>Alles (${max})</button></div>
        <form class="row" style="gap:6px" onSubmit=${(e) => { e.preventDefault(); if (val !== '') { set(Number(val)); setVal(''); } }}>
          <input class="input" type="number" min="0" step="50" max=${max} style="width:110px" value=${val} onInput=${(e) => setVal(e.target.value)} placeholder="Betrag" />
          <button class="btn sm">Bieten</button>
        </form>
      </div>
    </div>
    <div class="row" style="justify-content:center;margin-top:10px">
      <button class=${`btn ${b.locked ? 'ok' : 'primary'}`} onClick=${() => act({ type: 'lock' })}>${b.locked ? '🔒 Festgelegt (klicken zum Ändern)' : '🔒 Gebot festlegen'}</button>
    </div>
  </div>`;
}

export function AuktionView({ st, g }) {
  const pm = playerMap(st);
  const isOp = st.me.isOperator;
  const rv = revealState(st, `au-${g.round}`);
  const team = (id) => g.teams.find((t) => t.id === id);
  const win = team(g.winner);
  const timer = g.phase === 'bid' ? g.timers.vote : g.phase === 'answer' ? g.timers.answer : null;
  const fixBid = (t) => {
    const v = prompt(`Gebot von ${t.name} setzen (max. ${t.score}):`, String(g.bids[t.id]?.amount ?? 0));
    if (v != null && v.trim() !== '') gameOp({ type: 'setBid', teamId: t.id, amount: Number(v) });
  };
  return html`<div class="stage">
    <${GameHead} icon="💰" title="Wissens-Auktion" sub=${g.round ? `Frage ${g.round}/${g.rounds}` : null} timer=${timer} warn=${8} />
    <div class="scorebar">${g.teams.map((t) => html`<div key=${t.id} class=${`team-score ${g.winner === t.id && g.phase !== 'bids' ? 'turn' : ''}`} style=${teamStyle(t.color)}>
      <div class="avatars">${t.members.map((pid) => pm[pid] && html`<${Avatar} key=${pid} p=${pm[pid]} size=${30} />`)}</div>
      <div><div class="tname">${t.name}</div><div class="tpts">${t.score}</div></div>
    </div>`)}</div>
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">💰 Wissens-Auktion</div><p class="muted">Ihr seht zuerst nur die Kategorie. Bietet Punkte darauf, dass ihr die Frage lösen könnt.<br/>Höchstes Gebot antwortet: richtig = Gebot dazu, falsch = Gebot weg.</p></div>`}
    ${g.cat && g.phase !== 'intro' && html`<div class="card center rise au-cat">
      <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.12em;font-weight:800">Kategorie</div>
      <div class="fun au-cat-name">${g.cat.icon} ${g.cat.name}</div>
      <div class="au-stars">${'★'.repeat(g.cat.lvl)}${'☆'.repeat(Math.max(0, 5 - g.cat.lvl))}</div>
      ${g.q && html`<div class="fun es-qtext" style="margin-top:12px">${g.q}</div>`}
    </div>`}
    ${g.phase === 'bid' && html`
      <div style="margin-bottom:4px"><${TimerBar} timer=${g.timers.vote} /></div>
      ${g.canBid ? html`<${BidBox} st=${st} g=${g} pm=${pm} />` : html`<div class="banner">Die Teams bieten …</div>`}
      <div class="row wrap" style="justify-content:center;gap:8px">${g.teams.map((t) => html`<span key=${t.id} class=${`pill ${g.bids[t.id].locked ? 'ok' : ''}`} style=${`border-color:${t.color}`}>
        ${t.name}: ${g.bids[t.id].locked ? '🔒 fertig' : '… überlegt'}${isOp && html` (${g.bids[t.id].amount}) <button class="btn xs ghost" onClick=${() => fixBid(t)}>✏️</button>`}</span>`)}</div>
      ${isOp && html`<div class="op-fix"><button class="btn sm" onClick=${() => gameOp({ type: 'swapQuestion' })}>🔄 Andere Frage</button></div>`}`}
    ${g.phase === 'bids' && html`<${RevealHint} st=${st} rv=${rv} waitText="Die Gebote werden aufgedeckt …" />
      <div class="au-bids">${[...g.teams].filter((t) => g.bids[t.id].amount != null && rv.isShown(t.id)).sort((a, b) => g.bids[b.id].amount - g.bids[a.id].amount).map((t) => html`<div key=${t.id} class=${`card tight au-bid-row rise ${!rv.running && t.id === g.winner ? 'win' : ''}`} style=${teamStyle(t.color)}>
        <b style=${`color:${t.color}`}>${t.name}</b><span class="fun au-amount">${g.bids[t.id].amount}</span>
      </div>`)}</div>
      ${!rv.running && win && html`<div class="banner">🔨 <b style=${`color:${win.color}`}>${win.name}</b> ${g.stake ? `ersteigert die Frage für ${g.stake} Punkte!` : 'bekommt eine Freifrage!'}</div>`}`}
    ${g.phase === 'answer' && html`<div class="banner">🔨 <b style=${`color:${win?.color}`}>${win?.name}</b> antwortet · Einsatz: ${g.stake || 'Freifrage'}</div>
      <div><${TimerBar} timer=${g.timers.answer} /></div>
      ${g.judging ? html`<div class="center"><div class="typing">„${g.answer?.input}“</div><${Judging} /></div>`
        : g.canAnswer ? html`<${AnswerInput} key=${`au-${g.round}`} live=${false} placeholder="Eure Antwort …" onSubmit=${(text) => act({ type: 'answer', text })} />`
          : html`<div class="muted center">${win?.name} überlegt …</div>`}
      ${isOp && html`<div class="op-fix"><button class="btn sm" onClick=${() => gameOp({ type: 'swapQuestion' })}>🔄 Andere Frage</button></div>`}`}
    ${g.phase === 'result' && g.result && html`<div class=${`card center ${g.result.ok ? 'sp-result won' : 'sp-result lost'}`}>
      <div class="muted small">Richtige Antwort</div><div class="big-answer">${g.a}</div>
      <div style="margin-top:8px">${pm[g.answer?.pid]?.name ? html`${pm[g.answer.pid].name}: „${g.answer.input || '–'}“` : 'Keine Antwort'}
        <span class=${`pill ${g.result.ok ? 'ok' : 'bad'}`}>${g.result.ok ? 'richtig' : 'falsch'} · ${g.result.delta >= 0 ? '+' : ''}${g.result.delta}</span> <${ByTag} by=${g.result.by} /></div>
      ${isOp && html`<div class="op-fix">${g.result.ok
        ? html`<button class="btn sm bad" onClick=${() => gameOp({ type: 'override', ok: false })}>✗ Doch falsch</button>`
        : html`<button class="btn sm ok" onClick=${() => gameOp({ type: 'override', ok: true })}>✓ Doch richtig</button>`}</div>`}
    </div>`}
    ${g.phase !== 'intro' && html`<${TeamChat} st=${st} g=${g} pm=${pm} />`}
  </div>`;
}
