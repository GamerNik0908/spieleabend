// Ansicht „Quiz Duell“: Spielbrett, Fragekarte, Buzzer.
import {
  html, useEffect, act, gameOp, Avatar, Countdown, TimerBar, TypingView, AnswerInput, Judging, ByTag, teamStyle, playerMap,
} from '../lib.js';

const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s‍️+]+$/u;

function Scorebar({ g, pm, active }) {
  return html`<div class="scorebar">
    ${g.teams.map((t) => html`<div key=${t.id} class=${`team-score ${active === t.id ? 'turn' : ''}`} style=${teamStyle(t.color)}>
      <div class="avatars">${t.members.map((pid) => pm[pid] && html`<${Avatar} key=${pid} p=${pm[pid]} size=${30} />`)}</div>
      <div><div class="tname">${t.members.length === 1 ? pm[t.members[0]]?.name : t.name}</div><div class="tpts">${t.score}</div></div>
    </div>`)}
  </div>`;
}

function useSpaceBuzz(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        act({ type: 'buzz' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

function Board({ st, g }) {
  const isOp = st.me.isOperator;
  const cols = g.board.length;
  const clickable = g.phase === 'pick' && (g.canPick || isOp);
  const pick = (col, row) => {
    if (g.canPick) return act({ type: 'pick', col, row });
    if (isOp && confirm('Als Operator für das Team wählen?')) gameOp({ type: 'pickFor', col, row });
  };
  const colorOf = (id) => g.teams.find((t) => t.id === id)?.color;
  return html`<div class="qd-board" style=${`grid-template-columns:repeat(${cols},minmax(0,1fr))`}>
    ${g.board.map((c) => html`<div class="qd-head" key=${c.id}><span class="ic">${c.icon}</span>${c.name}</div>`)}
    ${g.board[0].cells.map((_, ri) => g.board.map((c, ci) => {
      const cell = c.cells[ri];
      const won = cell.used && cell.wonBy;
      const cls = `qd-cell ${cell.used ? (won ? 'won' : 'used') : ''} ${!cell.used && clickable ? 'can' : ''}`;
      return html`<div key=${`${ci}-${ri}`} class=${cls} style=${won ? teamStyle(colorOf(cell.wonBy)) : ''}
        onClick=${() => !cell.used && clickable && pick(ci, ri)}>${cell.used ? (won ? '✓' : '') : cell.value}</div>`;
    }))}
  </div>`;
}

function Attempts({ cur, pm, g }) {
  if (!cur.attempts?.length) return null;
  return html`<div class="col" style="gap:6px;max-width:640px;margin:14px auto 0">
    ${cur.attempts.map((a) => html`<div key=${a.id} class=${`result-line ${a.ok ? 'ok' : 'bad'}`}>
      <${Avatar} p=${pm[a.pid]} size=${24} /> <b>${pm[a.pid]?.name}</b>
      <span class="muted">„${a.input || '–'}“</span><div class="spacer"></div>
      ${a.ok ? html`<span class="pill ok">+${a.value}</span>` : a.penalty ? html`<span class="pill bad">−${a.penalty}</span>` : html`<span class="pill bad">falsch</span>`}
      <${ByTag} by=${a.by} />
    </div>`)}
  </div>`;
}

function QuestionCard({ st, g, pm }) {
  const cur = g.cur;
  const me = st.me.id;
  const team = (id) => g.teams.find((t) => t.id === id);
  const ansTeam = team(cur.teamId);
  const isEmoji = EMOJI_ONLY.test(cur.q.trim());
  useSpaceBuzz(g.canBuzz);
  return html`<div class="qd-question rise">
    <div class="row" style="justify-content:center">
      <span class="pill">${cur.icon} ${cur.cat}</span><span class="pill accent">${cur.value} Punkte</span>
    </div>
    <div class=${`qtext ${isEmoji ? 'emoji' : ''}`}>${cur.q}</div>

    ${(cur.stage === 'answer' || cur.stage === 'steal') && html`<div class="col" style="gap:12px">
      <div class="row" style="justify-content:center;gap:14px">
        <${Avatar} p=${pm[cur.answerer]} size=${64} />
        <div style="text-align:left">
          ${cur.stage === 'steal' && html`<span class="pill bad">🚨 Gebuzzert!</span>`}
          <div class="fun" style="font-size:24px;text-shadow:0 3px 0 var(--ink)">${pm[cur.answerer]?.name}</div>
          <div class="muted">antwortet für <b style=${`color:${ansTeam?.color}`}>${ansTeam?.name}</b></div>
        </div>
        <div class="fun" style="font-size:44px;margin-left:10px;text-shadow:0 4px 0 var(--ink)"><${Countdown} timer=${g.timers.answer} /></div>
      </div>
      <${TimerBar} timer=${g.timers.answer} />
      ${cur.judging ? html`<div class="center"><div class="typing">„${cur.input}“</div><${Judging} /></div>`
        : g.canAnswer ? html`<${AnswerInput} key=${`${cur.col}-${cur.row}-${cur.stage}`} onSubmit=${(text) => act({ type: 'answer', text })} />`
          : html`<${TypingView} pid=${cur.answerer} me=${me} />`}
    </div>`}

    ${cur.stage === 'buzz' && html`<div class="col" style="gap:12px;align-items:center">
      <div class="banner"><b>Falsch!</b> Die anderen Teams dürfen buzzern · <${Countdown} timer=${g.timers.buzz} /></div>
      ${g.canBuzz
        ? html`<button class="buzzer" onClick=${() => act({ type: 'buzz' })}>BUZZ!</button><span class="tiny muted">oder <span class="kbd">Leertaste</span></span>`
        : html`<div class="muted">${cur.tried.includes(st.players.find((p) => p.id === me)?.teamId) ? 'Dein Team hat schon geantwortet.' : 'Warte auf einen Buzzer …'}</div>`}
    </div>`}

    ${cur.stage === 'reveal' && html`<div class="col" style="gap:10px">
      <div class="muted small">Richtige Antwort</div>
      <div class="big-answer">${cur.a}</div>
      <div class="banner">${cur.winner
        ? html`<b style=${`color:${team(cur.winner)?.color}`}>${team(cur.winner)?.name}</b> holt ${cur.value} Punkte 🎉`
        : 'Niemand bekommt die Punkte'}</div>
    </div>`}
    <${Attempts} cur=${cur} pm=${pm} g=${g} />
  </div>`;
}

export function QuizDuellView({ st, g }) {
  const pm = playerMap(st);
  const turnTeam = g.teams.find((t) => t.id === g.turn);
  const showQ = g.cur && ['answer', 'buzz', 'steal', 'reveal'].includes(g.phase);
  const activeTeam = showQ ? g.cur.teamId : g.turn;
  return html`<div class="stage">
    <div class="game-title"><span class="t">⚡ Quiz Duell</span><span class="pill accent">Runde ${g.round}/${g.rounds}</span>${g.round > 1 && html`<span class="pill bad">Doppelte Punkte!</span>`}</div>
    <${Scorebar} g=${g} pm=${pm} active=${activeTeam} />
    ${g.phase === 'intro' && html`<div class="banner">Das Brett für Runde ${g.round} – gleich geht's los · <${Countdown} timer=${g.timers.phase} /></div>`}
    ${g.phase === 'pick' && html`<div class="banner">
      ${g.canPick ? html`<span class="big">Du bist dran – wähl ein Feld!</span>` : html`<b style=${`color:${turnTeam?.color}`}>${pm[g.picker]?.name}</b> wählt für ${turnTeam?.name}`}
      · <${Countdown} timer=${g.timers.pick} warn=${8} />
    </div>`}
    ${showQ ? html`<${QuestionCard} st=${st} g=${g} pm=${pm} />` : g.board && html`<${Board} st=${st} g=${g} />`}
  </div>`;
}

export function QuizDuellOps({ st, g }) {
  const pm = playerMap(st);
  return html`<div>
    <div class="card tight" style="margin-bottom:14px">
      <div class="section-title">Letzte Antworten</div>
      ${!g.log.length && html`<p class="muted small" style="margin:0">Noch keine.</p>`}
      ${g.log.map((e) => html`<div class="op-entry" key=${e.id}>
        <div class="row"><b>${pm[e.pid]?.name}</b><span class="muted small">„${e.input || '–'}“</span><div class="spacer"></div>
          <span class=${`pill ${e.ok ? 'ok' : 'bad'}`}>${e.ok ? 'richtig' : 'falsch'}</span><${ByTag} by=${e.by} /></div>
        <div class="tiny muted">${e.q} → <b>${e.a}</b> (${e.value})</div>
        <div class="row">
          ${e.ok ? html`<button class="btn xs bad" onClick=${() => gameOp({ type: 'override', id: e.id, ok: false })}>✗ Doch falsch</button>`
            : html`<button class="btn xs ok" onClick=${() => gameOp({ type: 'override', id: e.id, ok: true })}>✓ Doch richtig</button>`}
        </div>
      </div>`)}
    </div>
    ${g.board && ['intro', 'pick'].includes(g.phase) && html`<div class="card tight" style="margin-bottom:14px">
      <div class="section-title">Kategorie tauschen (nur unberührte)</div>
      <div class="row wrap">${g.board.map((c, i) => !c.cells.some((x) => x.used) && html`<button key=${c.id} class="btn xs" onClick=${() => gameOp({ type: 'reroll', col: i })}>🔄 ${c.name}</button>`)}</div>
      ${g.phase === 'pick' && html`<p class="tiny muted" style="margin:8px 0 0">Du kannst auch direkt ein Feld auf dem Brett anklicken, um für das Team zu wählen.</p>`}
    </div>`}
    <div class="card tight" style="margin-bottom:14px">
      <div class="section-title">Ablauf</div>
      <button class="btn sm" onClick=${() => confirm('Diese Runde beenden?') && gameOp({ type: 'endRound' })}>Runde ${g.round} beenden</button>
    </div>
  </div>`;
}
