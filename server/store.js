// Dauerhafte Daten: Spielerprofile (All-Time-Score, Bild), Bildergalerie,
// Spielverlauf und bereits gespielte Fragen. Liegt als JSON in DATA_DIR.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalize } from './matcher.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const empty = () => ({ players: {}, images: [], history: [], used: {} });

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...empty(), ...db };
  } catch {
    return empty();
  }
}

let db = load();
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}

export function flush() {
  clearTimeout(saveTimer);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

export const newId = (n = 8) => crypto.randomBytes(n).toString('hex').slice(0, n * 2);

const nameKey = (name) => normalize(name).replace(/ /g, '');

export function profileByName(name) {
  const key = nameKey(name);
  let p = Object.values(db.players).find((x) => x.key === key);
  if (!p) {
    p = {
      id: newId(6), key, name: String(name).trim(), avatar: null,
      points: 0, wins: 0, games: 0, raw: 0, createdAt: Date.now(),
    };
    db.players[p.id] = p;
    save();
  } else if (p.name !== String(name).trim()) {
    p.name = String(name).trim();
    save();
  }
  return p;
}

export const profile = (id) => db.players[id] || null;

export function setAvatar(profileId, imageId) {
  const p = db.players[profileId];
  if (!p) return;
  p.avatar = imageId;
  save();
}

export function imageUrl(imageId) {
  const img = db.images.find((i) => i.id === imageId);
  return img ? `/uploads/${img.file}` : null;
}

export const images = () => db.images.map((i) => ({ id: i.id, url: `/uploads/${i.file}`, label: i.label || '' }));

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export function addImage(buffer, mime, label = '') {
  const ext = EXT[mime];
  if (!ext) throw new Error('Nur PNG, JPG, WEBP oder GIF');
  const id = newId(6);
  const file = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buffer);
  db.images.push({ id, file, label, uploadedAt: Date.now() });
  save();
  return id;
}

export function removeImage(imageId) {
  const img = db.images.find((i) => i.id === imageId);
  if (!img) return;
  db.images = db.images.filter((i) => i.id !== imageId);
  for (const p of Object.values(db.players)) if (p.avatar === imageId) p.avatar = null;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, img.file)); } catch { /* schon weg */ }
  save();
}

export function leaderboard() {
  return Object.values(db.players)
    .filter((p) => p.games > 0 || p.points !== 0)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name))
    .map((p) => ({ id: p.id, name: p.name, points: p.points, wins: p.wins, games: p.games, avatar: imageUrl(p.avatar) }));
}

export function adjustPoints(profileId, delta) {
  const p = db.players[profileId];
  if (!p) return;
  p.points += delta;
  save();
}

// Siegpunkte: Platz 1 +10, Platz 2 +5 (ab 3 Teilnehmern), Platz 3 +2 (ab 4), Teilnahme +1
export function placementPoints(rank, units) {
  let pts = 1;
  if (rank === 1) pts += 10;
  else if (rank === 2 && units >= 3) pts += 5;
  else if (rank === 3 && units >= 4) pts += 2;
  return pts;
}

/**
 * results: [{ label, profileIds: [], score, rank }] (rank 1 = bester, Gleichstand = gleicher Rang)
 * Gibt pro Profil die vergebenen All-Time-Punkte zurück.
 */
export function recordGame(game, results) {
  const units = results.length;
  const awarded = {};
  for (const r of results) {
    const pts = placementPoints(r.rank, units);
    for (const pid of r.profileIds) {
      const p = db.players[pid];
      if (!p) continue;
      p.points += pts;
      p.games += 1;
      p.raw += r.score || 0;
      if (r.rank === 1) p.wins += 1;
      awarded[pid] = pts;
    }
  }
  db.history.unshift({
    id: newId(6), game, date: Date.now(),
    results: results.map((r) => ({ label: r.label, rank: r.rank, score: r.score, names: r.profileIds.map((id) => db.players[id]?.name) })),
  });
  db.history = db.history.slice(0, 200);
  save();
  return awarded;
}

export const history = (n = 20) => db.history.slice(0, n);

export function resetAllTime() {
  for (const p of Object.values(db.players)) Object.assign(p, { points: 0, wins: 0, games: 0, raw: 0 });
  db.history = [];
  save();
}

// Bereits gespielte Fragen merken, damit sie an späteren Abenden nicht wiederkommen
export function usedSet(game) {
  return new Set(db.used[game] || []);
}

export function markUsed(game, ids) {
  const set = new Set(db.used[game] || []);
  for (const id of ids) set.add(id);
  db.used[game] = [...set];
  save();
}

export function clearUsed(game) {
  if (game) delete db.used[game];
  else db.used = {};
  save();
}

// Backup: komplette Datenbank inkl. Bilder als JSON
export function exportBackup() {
  const files = {};
  for (const img of db.images) {
    try { files[img.file] = fs.readFileSync(path.join(UPLOAD_DIR, img.file)).toString('base64'); } catch { /* fehlt */ }
  }
  return { version: 1, exportedAt: Date.now(), db, files };
}

export function importBackup(data) {
  if (!data || !data.db || !data.db.players) throw new Error('Ungültiges Backup');
  for (const [file, b64] of Object.entries(data.files || {})) {
    if (!/^[a-f0-9]+\.(png|jpg|webp|gif)$/.test(file)) continue;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), Buffer.from(b64, 'base64'));
  }
  db = { ...empty(), ...data.db };
  flush();
}
