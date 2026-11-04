// Zuschauer-Ansicht (TV/Stream): Der Operator öffnet sie in einem eigenen Tab und teilt sie
// z. B. auf Discord. Sie zeigt alles Öffentliche groß – ohne Eingabefelder und ohne Geheimnisse.
import { html, useState, Avatar, GameIcon, AssetImg, play } from './lib.js';
import { GAME_INFO } from './lobby.js';
import { RecBadge } from './recap.js';

export const TV = new URLSearchParams(location.search).get('tv') === '1';
export const tvUrl = (code) => `${location.origin}/?raum=${code}&tv=1`;

/** Öffnet die Zuschauer-Ansicht in einem eigenen Fenster/Tab */
export function openTv(code) {
  window.open(tvUrl(code), `spieleabend-tv-${code}`);
}

export function TvButton({ st, cls = 'btn sm' }) {
  return html`<button class=${cls} title="Eigener Tab zum Streamen (z. B. Discord) – zeigt alles groß, ohne Lösungen" onClick=${() => openTv(st.code)}>📺 Zuschauer-Ansicht</button>`;
}

export function TvBar({ st }) {
  const join = `${location.host}/?raum=${st.code}`;
  const op = st.players.find((p) => p.isOperator);
  return html`<div class="topbar tv-bar">
    <div class="logo"><span class="dice"><${AssetImg} src="/assets/logo.webp" fallback="🎲" /></span><span class="txt">Spieleabend</span></div>
    <span class="tv-join">Mitspielen: <b>${join}</b></span>
    <div class="spacer"></div>
    ${st.screen === 'game' && st.game && html`<span class="tv-game"><${GameIcon} id=${st.game.type} size=${26} /> ${GAME_INFO[st.game.type]?.title}</span>`}
    <${RecBadge} st=${st} />
    ${op && html`<span class="muted small nowrap">👑 ${op.name}</span>`}
    <span class="code-chip">${st.code}</span>
  </div>`;
}

export function TvLobby({ st }) {
  const info = GAME_INFO[st.gameType];
  const op = st.players.find((p) => p.isOperator);
  return html`<div class="tv-lobby">
    <div class="card center tv-hero rise">
      <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.16em;font-weight:800">Raumcode</div>
      <div class="tv-code fun">${st.code}</div>
      <div class="muted">Mitspielen auf <b>${location.host}</b> – Code eingeben oder Link vom Operator öffnen</div>
    </div>
    <div class="tv-grid">
      <div class="card">
        <div class="section-title">Spieler (${st.players.length})</div>
        <div class="tv-players">${st.players.map((p) => html`<div key=${p.id} class=${`tv-player ${p.connected ? '' : 'off'}`}>
          <${Avatar} p=${p} size=${64} /><b>${p.name}${p.isOperator ? ' 👑' : ''}</b></div>`)}</div>
      </div>
      <div class="card">
        <div class="section-title">Als Nächstes</div>
        <div class="row" style="gap:12px;margin-bottom:10px"><${GameIcon} id=${st.gameType} size=${56} /><div>
          <div class="fun" style="font-size:28px">${info?.title}</div><div class="muted">${info?.desc}</div></div></div>
        <ul class="rules">${(info?.rules || []).map((r, i) => html`<li key=${i} data-n=${i + 1}>${r}</li>`)}</ul>
        <div class="muted small" style="margin-top:8px">${op ? `${op.name} startet gleich …` : ''}</div>
      </div>
      ${st.leaderboard?.length > 0 && html`<div class="card">
        <div class="section-title">🏆 Bestenliste</div>
        <div class="col" style="gap:6px">${st.leaderboard.slice(0, 8).map((x, i) => html`<div key=${x.id || x.name} class="row"><span class="lb-rank">${i + 1}.</span><b style="flex:1">${x.name}</b><span class="lb-pts">${x.points}</span></div>`)}</div>
      </div>`}
    </div>
  </div>`;
}

/** Browser spielen Ton erst nach einem Klick ab – einmal klicken, dann läuft der Stream mit Ton */
export function TvStart() {
  const [started, setStarted] = useState(false);
  if (started) return null;
  return html`<div class="tv-start" onClick=${() => { setStarted(true); play('announce'); }}>
    <div class="card center"><div class="fun" style="font-size:40px">📺 Zuschauer-Ansicht</div>
      <p class="muted">Diesen Tab auf Discord teilen (Bildschirm/Fenster teilen, Ton mitübertragen).<br/>Hier wird nichts verraten – keine Lösungen, kein Spion-Wort.</p>
      <button class="btn primary lg">▶ Klicken zum Starten (mit Ton)</button></div>
  </div>`;
}
