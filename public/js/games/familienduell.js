// Ansicht „Familien-Duell“: Teamseiten, Antworttafel, Buzzer, Strikes, Finale.
import {
  html, useState, useEffect, act, gameOp, Avatar, Countdown, TimerBar, TypingView, AnswerInput, Judging, ByTag, teamStyle, playerMap,
} from '../lib.js';

function TeamSide({ t, g, pm }) {
  return html`<div class=${`fd-team ${g.control === t.id ? 'control' : ''}`} style=${teamStyle(t.color)}>
    <h3>${t.name}</h3>
    <div class="pts">${t.score}</div>
    ${t.members.map((pid) => pm[pid] && html`<div key=${pid} class=${`fd-member ${g.active === pid || Object.values(g.faceoff?.players || {}).includes(pid) && g.phase.startsWith('faceoff') ? 'active' : ''}`}>
      <${Avatar} p=${pm[pid]} size=${30} /> ${pm[pid].name}
    </div>`)}
  </div>`;
}

function Board({ g }) {
  const color = (id) => g.teams.find((t) => t.id === id)?.color || 'var(--violet)';
  return html`<div class="fd-board">
    ${g.board.map((s, i) => s.open
      ? html`<div key=${i} class="fd-slot open" style=${teamStyle(color(s.teamId))}><span class="t">${s.t}</span><span class="p">${s.p}</span></div>`
      : s.missed
        ? html`<div key=${i} class="fd-slot missed"><span class="t">${s.t}</span><span class="p">${s.p}</span></div>`
        : html`<div key=${i} class="fd-slot"><span class="num">${i + 1}</span><span class="faint">• • •</span></div>`)}
  </div>`;
}

function Strikes({ n }) {
  return html`<div class="strikes">${[0, 1, 2].map((i) => html`<div key=${i} class=${`strike ${i < n ? 'on' : ''}`}>✕</div>`)}</div>`;
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

function LastAnswer({ g, pm }) {
  const l = g.last;
  if (!l || g.phase === 'intro') return null;
  return html`<div class=${`result-line ${l.ok ? 'ok' : 'bad'}`} style="max-width:640px;margin:0 auto;width:100%">
    <${Avatar} p=${pm[l.pid]} size=${24} /><b>${pm[l.pid]?.name}</b><span class="muted">„${l.input || '–'}“</span>
    <div class="spacer"></div>
    ${l.ok ? html`<span class="pill ok">✓ Auf der Tafel</span>` : l.dup ? html`<span class="pill bad">schon aufgedeckt</span>` : html`<span class="pill bad">✗ Nicht auf der Tafel</span>`}
    <${ByTag} by=${l.by} />
  </div>`;
}

function Action({ st, g, pm }) {
  const me = st.me.id;
  const team = (id) => g.teams.find((t) => t.id === id);
  useSpaceBuzz(g.canBuzz);
  const input = (key) => (g.judging ? html`<div class="center"><${Judging} /></div>`
    : g.canAnswer ? html`<${AnswerInput} key=${key} onSubmit=${(text) => act({ type: 'answer', text })} />`
      : html`<${TypingView} pid=${g.active} me=${me} />`);
  const activeTeam = team(st.players.find((p) => p.id === g.active)?.teamId) || g.teams.find((t) => t.members.includes(g.active));

  switch (g.phase) {
    case 'intro':
      return html`<div class="banner">Gleich geht's los … <${Countdown} timer=${g.timers.phase} /></div>`;
    case 'faceoff': {
      const [a, b] = g.teams.map((t) => g.faceoff.players[t.id]);
      return html`<div class="col" style="align-items:center;gap:12px">
        <div class="banner"><b style=${`color:${g.teams[0].color}`}>${pm[a]?.name}</b> gegen <b style=${`color:${g.teams[1].color}`}>${pm[b]?.name}</b> am Buzzer
          ${g.timers.buzz && html` · <${Countdown} timer=${g.timers.buzz} />`}</div>
        ${g.canBuzz ? html`<button class="buzzer" onClick=${() => act({ type: 'buzz' })}>BUZZ!</button><span class="tiny muted">oder <span class="kbd">Leertaste</span></span>`
          : g.faceoff.first ? html`<div class="muted">Jetzt darf ${pm[Object.values(g.faceoff.players).find((p) => p !== g.faceoff.first)]?.name} antworten …</div>`
            : html`<div class="muted">Wer zuerst buzzert, darf antworten.</div>`}
      </div>`;
    }
    case 'faceoffAnswer':
    case 'play':
    case 'steal':
      return html`<div class="col" style="gap:10px">
        <div class="banner">
          ${g.phase === 'steal' && html`<span class="pill bad" style="margin-right:6px">🦝 Klau-Versuch</span>`}
          <b style=${`color:${activeTeam?.color}`}>${pm[g.active]?.name}</b> ${g.phase === 'steal' ? `tippt für ${activeTeam?.name} – sprecht euch ab!` : 'ist dran'}
          · <${Countdown} timer=${g.timers.answer} />
        </div>
        <${TimerBar} timer=${g.timers.answer} />
        ${input(`${g.phase}-${g.active}-${g.strikes}-${g.pot}`)}
      </div>`;
    case 'controlIntro':
      return html`<div class="banner"><b style=${`color:${team(g.control)?.color}`}>${team(g.control)?.name}</b> spielt die Runde!</div>`;
    case 'stealIntro':
      return html`<div class="banner">Drei Fehler! <b>${g.teams.find((t) => t.id !== g.control)?.name}</b> darf klauen …</div>`;
    case 'roundEnd': {
      const w = team(g.roundResult?.winner);
      return html`<div class="banner" style="font-size:18px"><b style=${`color:${w?.color}`}>${w?.name}</b> holt ${g.roundResult?.points} Punkte ${g.roundResult?.mult > 1 ? '(×2)' : ''} – ${g.roundResult?.why}
        <div class="tiny muted">Nächste Runde in <${Countdown} timer=${g.timers.phase} /></div></div>`;
    }
    default:
      return null;
  }
}

function Final({ st, g, pm }) {
  const f = g.final;
  const me = st.me.id;
  const row = f.rows[f.index];
  const myTurn = g.canAnswer && g.phase === 'final';
  const teamA = g.teams[0], teamB = g.teams[1];
  const cell = (r, t, ri) => {
    const a = r.answers[t.id];
    const isCur = ri === f.index && ['final', 'finalJudging'].includes(g.phase);
    let content;
    if (!a) content = html`<span class="faint small">${pm[r.players[t.id]]?.name} überlegt …</span>`;
    else if (a.input === undefined) content = html`<span class="small">${a.mine ? `„${a.mine}“ ✓` : '✓ abgegeben'}</span>`;
    else content = html`<span class="small muted">„${a.input || '–'}“</span><b>${a.t ? `${a.t} · ${a.p}` : '0'}</b>`;
    return html`<div class=${`fa ${isCur ? 'cur' : ''}`} style=${teamStyle(t.color)}>
      <div class="tiny" style=${`color:${t.color};font-weight:800`}>${pm[r.players[t.id]]?.name}</div>${content}
    </div>`;
  };
  return html`<div class="col" style="gap:12px">
    <div class="row" style="justify-content:center"><span class="pill accent">🔥 Finale · Frage ${f.index + 1}/${f.total}</span>
      ${g.phase === 'final' && html`<span class="pill"><${Countdown} timer=${g.timers.answer} /></span>`}</div>
    ${g.phase === 'final' && row && html`<div class="fd-q">${row.q}</div>`}
    ${g.phase === 'final' && (myTurn
      ? html`<${AnswerInput} key=${`final-${f.index}`} live=${false} placeholder="Deine geheime Antwort …" onSubmit=${(text) => act({ type: 'answer', text })} />`
      : html`<div class="banner">${Object.values(row?.players || {}).includes(me) ? 'Abgegeben – warte auf das andere Team …' : `${g.teams.map((t) => pm[row?.players[t.id]]?.name).join(' und ')} antworten geheim …`}</div>`)}
    ${g.phase === 'finalJudging' && html`<div class="center"><${Judging} /></div>`}
    <div class="col" style="gap:8px">
      ${f.rows.map((r, ri) => html`<div class="fd-final" key=${ri}>
        ${cell(r, teamA, ri)}<div class="fq">${r.q}</div>${cell(r, teamB, ri)}
      </div>`)}
    </div>
  </div>`;
}

export function FamilienDuellView({ st, g }) {
  const pm = playerMap(st);
  const isFinal = g.phase.startsWith('final');
  return html`<div class="fd-layout">
    <${TeamSide} t=${g.teams[0]} g=${g} pm=${pm} />
    <div class="fd-center col" style="gap:14px">
      <div class="row" style="justify-content:center;gap:8px">
        <span class="pill accent">📊 Familien-Duell</span>
        ${!isFinal && g.round > 0 && html`<span class="pill">Runde ${g.round}/${g.rounds}${g.multiplier > 1 ? ' · ×2' : ''}</span>`}
        ${!isFinal && g.pot > 0 && html`<span class="pill ok">Im Topf: ${g.pot * g.multiplier}</span>`}
      </div>
      ${isFinal ? html`<${Final} st=${st} g=${g} pm=${pm} />` : html`
        ${g.question && html`<div class="fd-q">„${g.question.q}“<div class="tiny muted" style="font-family:var(--font);font-weight:600;margin-top:6px">100 Leute gefragt · ${g.question.count} Antworten auf der Tafel</div></div>`}
        ${g.phase === 'intro' && html`<div class="fd-q">Wir haben 100 Leute gefragt …</div>`}
        ${g.board.length > 0 && html`<${Board} g=${g} />`}
        ${g.control && html`<${Strikes} n=${g.strikes} />`}
        <${Action} st=${st} g=${g} pm=${pm} />
        <${LastAnswer} g=${g} pm=${pm} />`}
    </div>
    <${TeamSide} t=${g.teams[1]} g=${g} pm=${pm} />
  </div>`;
}

export function FamilienDuellOps({ st, g }) {
  const pm = playerMap(st);
  const [spoiler, setSpoiler] = useState(false);
  const l = g.last;
  const isFinal = g.phase.startsWith('final');
  return html`<div>
    ${!isFinal && html`<div class="card tight" style="margin-bottom:14px">
      <div class="section-title">Letzte Antwort</div>
      ${!l ? html`<p class="muted small" style="margin:0">Noch keine.</p>` : html`<div class="op-entry">
        <div class="row"><b>${pm[l.pid]?.name}</b><span class="muted small">„${l.input || '–'}“</span><div class="spacer"></div>
          <span class=${`pill ${l.ok ? 'ok' : 'bad'}`}>${l.ok ? 'richtig' : 'falsch'}</span><${ByTag} by=${l.by} /></div>
        ${l.ok && html`<button class="btn xs bad" onClick=${() => gameOp({ type: 'reject' })}>✗ Doch falsch (wieder verdecken)</button>`}
        ${!l.ok && html`<div class="col" style="gap:6px">
          <span class="tiny muted">Doch richtig? Ordne die Antwort einer verdeckten Antwort zu:</span>
          ${!spoiler ? html`<button class="btn xs" onClick=${() => setSpoiler(true)}>👀 Verdeckte Antworten zeigen (Spoiler für dich!)</button>`
            : html`<div class="row wrap">${(g.opBoard || []).map((a, i) => !g.board[i]?.open && html`<button key=${i} class="btn xs ok" onClick=${() => gameOp({ type: 'assign', index: i })}>${a.t} (${a.p})</button>`)}</div>`}
        </div>`}
      </div>`}
    </div>
    <div class="card tight" style="margin-bottom:14px">
      <div class="section-title">Strikes & Kontrolle</div>
      <div class="row wrap" style="margin-bottom:8px">
        <span class="small">Strikes: <b>${g.strikes}</b>/3</span>
        <button class="btn xs" onClick=${() => gameOp({ type: 'strike', delta: -1 })}>− Strike</button>
        <button class="btn xs" onClick=${() => gameOp({ type: 'strike', delta: 1 })}>+ Strike</button>
      </div>
      <div class="row wrap">
        ${g.teams.map((t) => html`<button key=${t.id} class="btn xs" style=${`color:${t.color}`} onClick=${() => gameOp({ type: 'setControl', teamId: t.id })}>Kontrolle → ${t.name}</button>`)}
      </div>
      ${['faceoff', 'faceoffAnswer'].includes(g.phase) && html`<button class="btn xs" style="margin-top:8px" onClick=${() => gameOp({ type: 'skipQuestion' })}>🔄 Andere Umfrage nehmen</button>`}
    </div>`}
    ${isFinal && g.final && html`<div class="card tight" style="margin-bottom:14px">
      <div class="section-title">Finale korrigieren</div>
      ${g.final.rows.map((r, ri) => r.board && html`<div class="op-entry" key=${ri}>
        <div class="tiny muted">${r.q}</div>
        ${g.teams.map((t) => {
          const a = r.answers[t.id];
          return html`<div class="row" key=${t.id}><b style=${`color:${t.color}`}>${t.name}</b><span class="small muted">„${a?.input || '–'}“</span><div class="spacer"></div>
            <select class="input" style="width:auto;padding:4px 8px" value=${a?.index ?? -1}
              onChange=${(e) => gameOp({ type: 'finalSet', row: ri, teamId: t.id, index: Number(e.target.value) })}>
              <option value="-1">0 Punkte</option>
              ${r.board.map((x, i) => html`<option value=${i}>${x.t} (${x.p})</option>`)}
            </select></div>`;
        })}
      </div>`)}
    </div>`}
  </div>`;
}
