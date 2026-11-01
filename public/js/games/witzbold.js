// Ansicht „Witzbold“: Satzanfänge beantworten, Duelle abstimmen, Finale.
import { html, act, useLocalStagger, revealPrefs, Avatar, TimerBar, AnswerInput, ScoreStrip, GameHead, DoneRow, playerMap, revealState, RevealHint } from '../lib.js';

function Answering({ st, g }) {
  const open = g.mine.find((m) => !m.answer);
  const done = g.mine.filter((m) => m.answer).length;
  return html`<div class="card rise">
    <div style="margin-bottom:12px"><${TimerBar} timer=${g.timers.answer} /></div>
    ${open ? html`
      <div class="tiny muted center" style="font-weight:900;text-transform:uppercase;letter-spacing:.1em">Satzanfang ${done + 1} von ${g.mine.length}</div>
      <div class="wb-prompt fun">${open.text}</div>
      <${AnswerInput} key=${`p-${g.round}-${open.id}`} live=${false} placeholder="Deine lustigste Antwort …" onSubmit=${(text) => act({ type: 'answer', promptId: open.id, text })} />
      <p class="tiny muted center" style="margin:10px 0 0">Ein anderer Spieler bekommt denselben Satzanfang – alle anderen stimmen ab, wer lustiger ist.</p>`
      : html`<div class="center"><div class="fun" style="font-size:30px">✅ Fertig!</div><p class="muted">Warte, bis alle ihre Antworten haben … (${g.progress?.done}/${g.progress?.total})</p></div>`}
  </div>
  <${DoneRow} st=${st} ids=${g.scores.map((s) => s.pid)} done=${g.writers} />`;
}

function Match({ st, g, pm }) {
  const m = g.match;
  const reveal = !!m.authors;
  return html`<div class="col" style="gap:16px">
    <div class="center tiny muted" style="font-weight:900;letter-spacing:.1em;text-transform:uppercase">Duell ${m.no} von ${m.of}</div>
    <div class="wb-prompt fun">${m.text}</div>
    <div class="wb-duel">
      ${m.answers.map((a, i) => html`<button key=${i} class=${`wb-answer s${i} ${m.myVote === i ? 'picked' : ''} ${reveal && m.bonus === i ? 'bonus' : ''}`}
        disabled=${reveal || m.inPair || m.myVote != null || !a} onClick=${() => act({ type: 'vote', side: i })}>
        <div class="fun wb-text">${a || '😴 Keine Antwort'}</div>
        ${reveal && html`<div class="wb-meta">
          <div class="row" style="gap:8px;justify-content:center"><${Avatar} p=${pm[m.authors[i]]} size=${36} /><b>${pm[m.authors[i]]?.name}</b></div>
          <div class="fun" style="font-size:26px">${m.counts[i]} ${m.counts[i] === 1 ? 'Stimme' : 'Stimmen'} · +${m.points[i]}</div>
          <div class="tiny">${Object.entries(m.voters || {}).filter(([, s]) => s === i).map(([v]) => pm[v]?.name).join(', ')}</div>
          ${m.bonus === i && html`<div class="wb-bonus fun">WITZBOLD! 🏆</div>`}
        </div>`}
      </button>`)}
    </div>
    ${!reveal && html`<div class="banner">${m.inPair ? 'Das ist dein Duell – Daumen drücken! 🤞' : m.myVote != null ? 'Abgestimmt!' : 'Welche Antwort ist lustiger? Klick drauf!'} · <${TimerBar} timer=${g.timers.vote} /></div>`}
  </div>`;
}

function Final({ st, g, pm }) {
  const f = g.final;
  if (g.phase === 'finalAnswer') {
    return html`<div class="card rise">
      <div class="center fun" style="font-size:22px;color:var(--yellow)">🔥 FINALE – alle gegen alle (Punkte ×3)</div>
      <div class="wb-prompt fun">${f.text}</div>
      <div style="margin-bottom:12px"><${TimerBar} timer=${g.timers.answer} /></div>
      ${f.myAnswer ? html`<div class="banner">Deine Antwort: <b>„${f.myAnswer}“</b></div>`
        : html`<${AnswerInput} live=${false} placeholder="Deine Final-Antwort …" onSubmit=${(text) => act({ type: 'answer', text })} />`}
    </div>
    <${DoneRow} st=${st} ids=${g.scores.map((s) => s.pid)} done=${f.answered} />`;
  }
  const reveal = g.phase === 'finalReveal';
  const order = f.answers.map((a, i) => i);
  // Auflösung: von wenigen zu vielen Stimmen, die beste Antwort zuletzt (oben)
  if (reveal) order.sort((a, b) => f.counts[a] - f.counts[b]);
  const rv = revealState(st, 'wb-final');
  // Beim Abstimmen tauchen die Antworten eine nach der anderen auf
  const intro = useLocalStagger(`wbf-${f.text}`, order.length, 1300, 400);
  const nIntro = revealPrefs.sequential ? intro : order.length;
  const list = reveal ? order.filter((i) => rv.isShown(i)).reverse() : order.slice(0, nIntro);
  return html`<div class="col" style="gap:14px">
    <div class="wb-prompt fun">${f.text}</div>
    ${!reveal && nIntro < order.length && html`<div class="banner">Die Antworten … 🥁</div>`}
    ${!reveal && nIntro >= order.length && html`<div class="banner">${f.myVote != null ? 'Abgestimmt!' : 'Stimm für die lustigste Antwort (nicht deine eigene)!'}</div>`}
    ${reveal && html`<${RevealHint} st=${st} rv=${rv} waitText="Und die meisten Stimmen bekommt … 🥁" />`}
    <div class="wb-final">${list.map((i) => html`<button key=${i} class=${`wb-answer s${i % 2} ${f.myVote === i ? 'picked' : ''}`}
      disabled=${reveal || f.myVote != null || i === f.mineIdx} onClick=${() => act({ type: 'vote', side: i })}>
      <div class="fun wb-text">${f.answers[i]}</div>
      ${i === f.mineIdx && !reveal && html`<div class="tiny">deine Antwort</div>`}
      ${reveal && html`<div class="wb-meta"><div class="row" style="gap:8px;justify-content:center"><${Avatar} p=${pm[f.authors[i]]} size=${32} /><b>${pm[f.authors[i]]?.name}</b></div>
        <div class="fun" style="font-size:22px">${f.counts[i]} Stimmen · +${f.points[i]}</div></div>`}
    </button>`)}</div>
  </div>`;
}

export function WitzboldView({ st, g }) {
  const pm = playerMap(st);
  const timer = ['answer', 'finalAnswer'].includes(g.phase) ? g.timers.answer : ['vote', 'finalVote'].includes(g.phase) ? g.timers.vote : null;
  return html`<div class="stage">
    <${GameHead} icon="😂" title="Witzbold" sub=${g.phase.startsWith('final') ? 'Finale ×3' : g.round ? `Runde ${g.round}/${g.rounds} · ×${g.mult}` : null} timer=${timer} warn=${8} />
    <${ScoreStrip} st=${st} g=${g} />
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">😂 Witzbold</div><p class="muted">Jeder bekommt zwei Satzanfänge und schreibt die lustigste Antwort.<br/>Dann treten immer zwei Antworten gegeneinander an – die anderen stimmen ab. Alle Stimmen = WITZBOLD-Bonus!</p></div>`}
    ${g.phase === 'answer' && html`<${Answering} st=${st} g=${g} />`}
    ${g.match && html`<${Match} st=${st} g=${g} pm=${pm} />`}
    ${g.final && html`<${Final} st=${st} g=${g} pm=${pm} />`}
  </div>`;
}
