// Ansicht „Der Dümmste fliegt“: Spielerkacheln mit Leben, Schnellfragen, Abstimmung, Stechen.
import {
  html, act, gameOp, Avatar, Countdown, TimerBar, TypingView, AnswerInput, Judging, ByTag, Hearts, playerMap,
} from '../lib.js';

function Tile({ pid, st, g, pm }) {
  const p = pm[pid];
  if (!p) return null;
  const alive = g.alive.includes(pid);
  const s = g.stats[pid];
  const isCur = g.current?.pid === pid;
  const votable = g.canVote && alive && pid !== st.me.id;
  const myVote = g.vote?.mine === pid;
  const vr = g.voteResult;
  const count = vr?.counts?.[pid] || 0;
  const votedFor = vr?.votes?.[pid];
  const flash = g.last && g.last.pid === pid && ['reveal', 'duelReveal'].includes(g.phase) ? (g.last.ok ? 'flash-ok' : 'flash-bad') : '';
  const loser = g.lastLoss?.pid === pid && ['voteReveal', 'duelResult'].includes(g.phase);
  const inDuel = g.duel?.remaining?.includes(pid);
  const cls = ['dm-tile', isCur && 'active', !alive && 'out', votable && 'votable', myVote && 'voted', loser && 'loser', flash].filter(Boolean).join(' ');
  return html`<div class=${cls} key=${`${pid}-${flash ? g.last.id : ''}`} onClick=${() => votable && act({ type: 'vote', target: pid })}>
    ${vr && count > 0 && html`<span class="votes-badge">${count}</span>`}
    <${Avatar} p=${p} size=${84} />
    <div class="pname">${p.name}${p.isOperator ? ' 👑' : ''}</div>
    <${Hearts} n=${g.lives[pid] || 0} max=${g.maxLives} />
    ${!alive ? html`<span class="pill bad">💀 raus</span>`
      : isCur ? html`<span class="pill accent">ist dran</span>`
        : g.phase === 'vote' ? html`<span class=${`pill ${g.vote.voted.includes(pid) ? 'ok' : ''}`}>${g.vote.voted.includes(pid) ? '✓ gewählt' : 'wählt …'}</span>`
          : inDuel ? html`<span class="pill bad">⚔️ im Stechen</span>`
            : s ? html`<span class="small muted">✓ ${s.c} · ✗ ${s.w}</span>` : null}
    ${vr && votedFor && html`<div class="vote-line">wählt → <b>${pm[votedFor]?.name}</b></div>`}
  </div>`;
}

function Center({ st, g, pm }) {
  const me = st.me.id;
  const cur = g.current;
  if (cur) {
    return html`<div class="dm-question rise" key=${`q-${cur.pid}-${cur.q}`}>
      <div class="who">${g.phase === 'duel' ? '⚔️ ' : ''}${cur.pid === me ? 'Deine Frage!' : `Frage an ${pm[cur.pid]?.name}`}</div>
      <div class="qtext">${cur.q}</div>
      ${cur.judging ? html`<div><div class="typing">„${cur.input}“</div><${Judging} /></div>` : html`
        <div style="max-width:640px;margin:0 auto 12px"><${TimerBar} timer=${g.timers.answer} /></div>
        ${g.canAnswer ? html`<${AnswerInput} key=${`a-${cur.q}`} onSubmit=${(text) => act({ type: 'answer', text })} />` : html`<${TypingView} pid=${cur.pid} me=${me} />`}`}
    </div>`;
  }
  const l = g.last;
  if (l && ['reveal', 'duelReveal'].includes(g.phase)) {
    return html`<div class="dm-question" key=${`r-${l.id}`}>
      <div class="who">${pm[l.pid]?.name}: <span style=${`color:${l.ok ? 'var(--ok)' : 'var(--bad)'}`}>„${l.input || '–'}“ ${l.ok ? '✓' : '✗'}</span> <${ByTag} by=${l.by} /></div>
      <div class="qtext" style="font-size:clamp(18px,2.4vw,26px)">${l.q}</div>
      <div class="big-answer">${l.a}</div>
    </div>`;
  }
  if (g.phase === 'intro') {
    return html`<div class="dm-question"><div class="qtext">🧠 Der Dümmste fliegt</div>
      <p class="muted">Reihum gibt es Schnellfragen. Nach der Rundenzeit wählt ihr den Dümmsten – wer die meisten Stimmen hat, verliert ein Leben. Wer keine Leben mehr hat, fliegt!</p>
      <div class="banner">Start in <${Countdown} timer=${g.timers.phase} /></div></div>`;
  }
  if (g.phase === 'vote') {
    const voters = g.alive.length;
    return html`<div class="dm-question">
      <div class="qtext">🗳️ Wer ist der Dümmste?</div>
      ${g.canVote ? html`<p style="font-size:17px;margin:0">Klicke auf einen Spieler.</p>`
        : g.alive.includes(me) ? html`<p class="muted" style="margin:0">Du hast gewählt: <b>${pm[g.vote.mine]?.name}</b></p>`
          : html`<p class="muted" style="margin:0">Du schaust zu.</p>`}
      <div class="banner" style="margin-top:8px">${g.vote.voted.length}/${voters} haben gewählt · <${Countdown} timer=${g.timers.vote} /></div>
    </div>`;
  }
  if (g.phase === 'voteReveal' && g.voteResult) {
    const vr = g.voteResult;
    const tie = vr.top.length > 1;
    return html`<div class="dm-question">
      <div class="qtext">${tie ? `⚔️ Gleichstand: ${vr.top.map((p) => pm[p]?.name).join(' & ')}` : g.lastLoss ? `💔 ${pm[g.lastLoss.pid]?.name} verliert ein Leben` : `Die meisten Stimmen: ${pm[vr.top[0]]?.name}`}</div>
      <div class="row wrap" style="justify-content:center">
        ${Object.entries(vr.votes).map(([from, to]) => html`<span class="pill" key=${from}>${pm[from]?.name} → <b>${pm[to]?.name}</b></span>`)}
      </div>
      ${tie && html`<p class="muted" style="margin-bottom:0">Es gibt ein Stechen!</p>`}
    </div>`;
  }
  if (['duelIntro', 'duelResult'].includes(g.phase) && g.duel) {
    return html`<div class="dm-question">
      <div class="qtext">${g.duel.mode === 'final' ? '🔥 Finale' : '⚔️ Stechen'}: ${g.duel.players.map((p) => pm[p]?.name).join(' vs. ')}</div>
      <p class="muted" style="margin:0">Abwechselnd eine Frage. Wer falsch liegt, während der andere richtig liegt, verliert ein Leben.</p>
      ${g.phase === 'duelResult' && g.lastLoss && html`<div class="big-answer" style="margin-top:10px">💔 ${pm[g.lastLoss.pid]?.name}</div>`}
    </div>`;
  }
  return html`<div class="dm-question"><div class="banner">Gleich geht's weiter …</div></div>`;
}

export function DuemmsteView({ st, g }) {
  const pm = playerMap(st);
  const clockTimer = g.phase === 'vote' ? g.timers.vote : g.timers.round;
  const title = g.duel ? (g.duel.mode === 'final' ? 'Finale' : 'Stechen') : g.phase === 'vote' ? 'Abstimmung' : `Runde ${g.round || 1}`;
  const order = [...g.players].sort((a, b) => (g.alive.includes(b) - g.alive.includes(a)));
  return html`<div class="stage">
    <div class="dm-top">
      <div><span class="pill accent">🧠 Der Dümmste fliegt</span> <span class="pill">${title}</span></div>
      <div class="dm-clock">${clockTimer && !g.duel ? html`<${Countdown} timer=${clockTimer} warn=${10} />` : g.phase === 'voteReveal' ? '🗳️' : '⏱'}</div>
      <div style="text-align:right"><span class="pill">${g.alive.length} von ${g.players.length} im Spiel</span></div>
    </div>
    ${g.roundOver && ['questions', 'reveal'].includes(g.phase) && html`<div class="banner">⏰ Zeit ist um – nach dieser Frage wird abgestimmt!</div>`}
    <${Center} st=${st} g=${g} pm=${pm} />
    <div class="dm-grid">${order.map((pid) => html`<${Tile} key=${pid} pid=${pid} st=${st} g=${g} pm=${pm} />`)}</div>
    ${g.feed.length > 0 && html`<div class="card tight">
      <div class="section-title">Diese Runde</div>
      <div class="feed">${g.feed.map((e) => html`<div key=${e.id} class=${`result-line ${e.ok ? 'ok' : 'bad'}`}>
        <b>${pm[e.pid]?.name}</b><span class="muted small" style="flex:1">${e.q}</span>
        <span class="small">„${e.input || '–'}“</span>${!e.ok && html`<span class="small faint">(${e.a})</span>`}<${ByTag} by=${e.by} />
      </div>`)}</div>
    </div>`}
  </div>`;
}

export function DuemmsteOps({ st, g }) {
  const pm = playerMap(st);
  return html`<div>
    <div class="card tight" style="margin-bottom:14px">
      <div class="section-title">Ablauf</div>
      <div class="row wrap">
        ${['questions', 'reveal'].includes(g.phase) && html`<button class="btn sm" onClick=${() => gameOp({ type: 'endRound' })}>🗳️ Jetzt abstimmen</button>`}
        ${g.phase === 'vote' && html`<button class="btn sm" onClick=${() => gameOp({ type: 'closeVote' })}>Abstimmung beenden</button>`}
      </div>
    </div>
    <div class="card tight" style="margin-bottom:14px">
      <div class="section-title">Antworten korrigieren</div>
      ${!g.feed.length && html`<p class="muted small" style="margin:0">Noch keine Antworten in dieser Runde.</p>`}
      ${g.feed.map((e) => html`<div class="op-entry" key=${e.id}>
        <div class="row"><b>${pm[e.pid]?.name}</b><span class="muted small">„${e.input || '–'}“</span><div class="spacer"></div>
          <span class=${`pill ${e.ok ? 'ok' : 'bad'}`}>${e.ok ? 'richtig' : 'falsch'}</span><${ByTag} by=${e.by} /></div>
        <div class="tiny muted">${e.q} → <b>${e.a}</b></div>
        <div>${e.ok ? html`<button class="btn xs bad" onClick=${() => gameOp({ type: 'override', id: e.id, ok: false })}>✗ Doch falsch</button>`
          : html`<button class="btn xs ok" onClick=${() => gameOp({ type: 'override', id: e.id, ok: true })}>✓ Doch richtig</button>`}</div>
      </div>`)}
    </div>
    <div class="card tight" style="margin-bottom:14px">
      <div class="section-title">Leben anpassen</div>
      ${g.players.map((pid) => pm[pid] && html`<div class="row" style="margin-bottom:6px" key=${pid}>
        <b style="flex:1">${pm[pid].name}</b><${Hearts} n=${g.lives[pid] || 0} max=${Math.max(g.maxLives, g.lives[pid] || 0)} />
        <button class="btn xs" onClick=${() => gameOp({ type: 'lives', pid, delta: -1 })}>−</button>
        <button class="btn xs" onClick=${() => gameOp({ type: 'lives', pid, delta: 1 })}>+</button>
      </div>`)}
    </div>
  </div>`;
}
