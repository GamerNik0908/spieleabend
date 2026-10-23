// Antwort-Erkennung: Normalisierung, Tippfehler-Toleranz, Zahlwörter,
// Phonetik (Kölner Phonetik) und Schlüsselwort-Modus. Semantische Synonyme
// ("schnelles Gehen" ≈ "rennen") übernimmt optional der KI-Richter (aijudge.js).

const FILLER = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'the', 'a', 'an', 'ich', 'glaube', 'glaub', 'denke', 'vielleicht', 'evtl', 'ist', 'es', 'sind',
  'wohl', 'halt', 'also', 'aeh', 'aehm', 'hmm', 'mal', 'ja', 'im', 'am', 'beim', 'vom', 'zum', 'zur',
  'natuerlich', 'klar', 'bestimmt', 'sicher', 'nat', 'safe',
]);

const UNITS = { eins: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
const UNITS_PREFIX = { ein: 1, eins: 1, ...UNITS };
const TEENS = {
  null: 0, zehn: 10, elf: 11, zwoelf: 12, dreizehn: 13, vierzehn: 14, fuenfzehn: 15,
  sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
};
const TENS = {
  zwanzig: 20, dreissig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
};
const MULT_WORDS = [
  ['milliarden', 1e9], ['milliarde', 1e9], ['millionen', 1e6], ['million', 1e6], ['tausend', 1e3], ['hundert', 100],
];
const MULT_TOKENS = {
  tausend: 1e3, tsd: 1e3, k: 1e3, million: 1e6, millionen: 1e6, mio: 1e6,
  milliarde: 1e9, milliarden: 1e9, mrd: 1e9, mia: 1e9,
};

export function normalize(input) {
  let s = String(input ?? '').toLowerCase().trim();
  // Tausenderpunkte und Dezimalkomma vor dem Entfernen der Satzzeichen auflösen
  for (let i = 0; i < 3; i++) s = s.replace(/(\d)[.'](\d{3})(?!\d)/g, '$1$2');
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' und ').replace(/\+/g, ' plus ')
    .replace(/(\d)\.(\d)/g, '$1§$2')
    .replace(/[^a-z0-9§ ]+/g, ' ')
    .replace(/§/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function stripFiller(s) {
  const kept = s.split(' ').filter((t) => t && !FILLER.has(t));
  return kept.length ? kept.join(' ') : s;
}

// Deutsches Zahlwort (ein Token, z. B. "zweitausendsechs") -> Zahl, sonst null
export function parseNumberWord(w) {
  if (!w) return null;
  if (/^\d+(\.\d+)?$/.test(w)) return parseFloat(w);
  for (const [word, mult] of MULT_WORDS) {
    const i = w.indexOf(word);
    if (i >= 0) {
      const left = w.slice(0, i);
      let right = w.slice(i + word.length);
      if (right.startsWith('und')) right = right.slice(3);
      const l = left ? parseNumberWord(left) : 1;
      const r = right ? parseNumberWord(right) : 0;
      if (l == null || r == null) return null;
      return l * mult + r;
    }
  }
  if (w in TEENS) return TEENS[w];
  if (w in TENS) return TENS[w];
  if (w in UNITS_PREFIX) return UNITS_PREFIX[w];
  const m = w.match(/^([a-z]+?)und([a-z]+)$/);
  if (m && m[1] in UNITS_PREFIX && m[2] in TENS) return UNITS_PREFIX[m[1]] + TENS[m[2]];
  return null;
}

// Alle Zahlen aus einem normalisierten Text ("2,5 mio", "zwanzig milliarden", "366")
export function extractNumbers(norm) {
  const tokens = norm.split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'ein' || t === 'eine' || t === 'einen') {
      const next = tokens[i + 1];
      if (next && MULT_TOKENS[next]) { out.push(MULT_TOKENS[next]); i++; }
      continue;
    }
    let n = parseNumberWord(t);
    if (n == null) {
      const m = t.match(/^(\d+(?:\.\d+)?)(k|mio|mrd|tsd)$/);
      if (m) n = parseFloat(m[1]) * MULT_TOKENS[m[2]];
    }
    if (n == null) continue;
    const next = tokens[i + 1];
    if (next && MULT_TOKENS[next] && !(t.length > 2 && /[a-z]/.test(t) && MULT_WORDS.some(([w]) => t.endsWith(w)))) {
      n *= MULT_TOKENS[next];
      i++;
    }
    out.push(n);
  }
  return out;
}

// Zahlwörter in Ziffern umwandeln (für Text-Antworten wie "Staffel zwölf" == "staffel 12")
function numberize(s) {
  return s.split(' ').map((t) => {
    if (t === 'ein' || t === 'eine' || t === 'einen') return t;
    const n = parseNumberWord(t);
    return n == null ? t : String(n);
  }).join(' ');
}

// Damerau-Levenshtein (optimal string alignment)
export function editDistance(a, b) {
  if (a === b) return 0;
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  let prev2 = null;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

// Kölner Phonetik – erkennt gleich klingende Schreibweisen (Filipinen/Philippinen)
export function koelner(s) {
  const w = s.replace(/[^a-z]/g, '');
  if (!w) return '';
  const codes = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i], prev = w[i - 1] || '', next = w[i + 1] || '';
    let code = '';
    if ('aeijouy'.includes(c)) code = '0';
    else if (c === 'h') code = '-';
    else if (c === 'b') code = '1';
    else if (c === 'p') code = next === 'h' ? '3' : '1';
    else if (c === 'd' || c === 't') code = 'csz'.includes(next) && next ? '8' : '2';
    else if ('fvw'.includes(c)) code = '3';
    else if ('gkq'.includes(c)) code = '4';
    else if (c === 'c') {
      if (i === 0) code = 'ahkloqrux'.includes(next) && next ? '4' : '8';
      else code = 'sz'.includes(prev) && prev ? '8' : ('ahkoqux'.includes(next) && next ? '4' : '8');
    } else if (c === 'x') code = 'ckq'.includes(prev) && prev ? '8' : '48';
    else if (c === 'l') code = '5';
    else if (c === 'm' || c === 'n') code = '6';
    else if (c === 'r') code = '7';
    else if ('sz'.includes(c)) code = '8';
    codes.push(code);
  }
  let out = '';
  let last = '';
  for (const code of codes) {
    if (code === '-') continue;
    if (code !== last) out += code;
    last = code;
  }
  return out[0] + out.slice(1).replace(/0/g, '');
}

// Grobe Stammform: Umlaute flach, typische Endungen ab (Kühe ~ Kuh, Hunde ~ Hund)
function fold(s) {
  return s.split(' ').map((t) => {
    let x = t.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u').replace(/ph/g, 'f').replace(/th/g, 't');
    if (x.length > 4) x = x.replace(/(en|er|es|e|n|s)$/, '');
    else if (x.length === 4) x = x.replace(/e$/, '');
    return x;
  }).join(' ');
}

function maxTypos(len) {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  if (len <= 9) return 2;
  if (len <= 14) return 3;
  return 4;
}

// Ähnlichkeit zweier bereits normalisierter Strings: 0 = nein, sonst 0..1
function similarity(inp, tgt) {
  if (!inp || !tgt) return 0;
  if (inp === tgt) return 1;
  const a = inp.replace(/ /g, ''), b = tgt.replace(/ /g, '');
  if (a === b) return 0.99;
  const fa = fold(inp).replace(/ /g, ''), fb = fold(tgt).replace(/ /g, '');
  if (fa === fb && fb.length >= 2) return 0.97;
  // Zahlen müssen exakt passen
  if (/^\d+(\.\d+)?$/.test(a) || /^\d+(\.\d+)?$/.test(b)) return 0;
  // Kurze Wörter: Tippfehler nur, wenn der Anfangsbuchstabe stimmt (sonst Grau ≈ Blau, Möwe ≈ Löwe)
  const short = b.length <= 6;
  const d = editDistance(a, b);
  const allowed = maxTypos(b.length);
  if (d <= allowed && (!short || a[0] === b[0])) return 0.95 - d / Math.max(b.length, 1) * 0.5;
  if (fb.length >= 4 && editDistance(fa, fb) <= maxTypos(fb.length) && (fb.length > 6 || fa[0] === fb[0])) return 0.85;
  if (b.length >= 5 && a.length >= 4 && Math.abs(a.length - b.length) <= 3) {
    const ka = koelner(a), kb = koelner(b);
    if (ka.length >= 3 && ka === kb) return 0.8;
  }
  return 0;
}

function variants(raw) {
  const n = normalize(raw);
  const set = new Set([n, stripFiller(n)]);
  for (const v of [...set]) set.add(numberize(v));
  return [...set].filter(Boolean);
}

function textScore(input, target) {
  let best = 0;
  for (const a of variants(input)) {
    for (const b of variants(target)) {
      const s = similarity(a, b);
      if (s > best) best = s;
      if (best === 1) return 1;
    }
  }
  return best;
}

function keywordMatch(input, groups) {
  const n = stripFiller(numberize(normalize(input)));
  const tokens = n.split(' ');
  return groups.every((group) => group.some((kwRaw) => {
    const kw = normalize(kwRaw);
    if (n.includes(kw)) return true;
    const fk = fold(kw);
    return tokens.some((t) => {
      if (t.length < 3) return false;
      if (fold(t) === fk) return true;
      return kw.length >= 5 && editDistance(t, kw) <= (kw.length >= 9 ? 2 : 1);
    });
  }));
}

/**
 * Prüft eine Antwort gegen eine Spezifikation.
 * spec: { a: 'Anzeige-Antwort', alt?: string[], num?: number, tol?: number, kw?: string[][] }
 * Rückgabe: Ähnlichkeit 0..1 (>0 = akzeptiert)
 */
export function scoreAnswer(input, spec) {
  const norm = normalize(input);
  if (!norm) return 0;
  if (typeof spec.num === 'number') {
    const nums = [...new Set(extractNumbers(norm))];
    // Absichern mit mehreren Zahlen ("11 oder 12") gilt nicht
    if (nums.length === 1) {
      const tol = spec.tol ?? 0;
      if (Math.abs(nums[0] - spec.num) <= tol) return 1;
    }
    if (nums.length >= 1) return 0;
  }
  if (spec.kw && keywordMatch(input, spec.kw)) return 0.9;
  let best = 0;
  for (const t of [spec.a, ...(spec.alt || [])]) {
    if (t == null) continue;
    const s = textScore(input, String(t));
    if (s > best) best = s;
    if (best === 1) break;
  }
  return best;
}

export function matchAnswer(input, spec) {
  return scoreAnswer(input, spec) > 0;
}

/** Beste passende Option (Familien-Duell). options: [{ t, alt? }] -> Index oder -1 */
export function matchAmong(input, options) {
  let best = -1, bestScore = 0;
  options.forEach((o, i) => {
    const s = scoreAnswer(input, { a: o.t, alt: o.alt, num: o.num, kw: o.kw });
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}
