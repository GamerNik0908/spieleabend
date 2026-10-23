# 🎲 Spieleabend

Eine Website für euren Online-Spieleabend mit drei Spielen:

| Spiel | Prinzip |
|---|---|
| ⚡ **Quiz Duell** | Jeopardy-Brett mit 6 Kategorien. Teams wählen nacheinander ein Feld, reihum tippt ein Teammitglied die Antwort. Falsch = halbe Punkte Abzug, die anderen Teams dürfen buzzern und abstauben. Runde 2 zählt doppelt. |
| 📊 **Familien-Duell** | „Wir haben 100 Leute gefragt …“ – Buzzer-Duell, dann rät das Team reihum, nach 3 Fehlern darf das andere Team klauen. Finale: pro Frage eine geheime Antwort pro Team. |
| 🧠 **Der Dümmste fliegt** | Reihum Schnellfragen, nach Ablauf der Zeit wählen alle den Dümmsten – meiste Stimmen = ein Leben weg. Gleichstand = Stechen, die letzten zwei spielen das Finale. |

**Gesprochen wird nebenbei (Discord, TeamSpeak …)** – die Antworten werden getippt und automatisch geprüft.

## Was alles drin ist

- **Operator**: Wer den Raum erstellt, ist Operator und spielt trotzdem mit. Er wählt das Spiel, stellt es ein, startet, pausiert, überspringt, gibt Zeit dazu, korrigiert Bewertungen und Punkte, beendet Spiele und kann die Rolle weitergeben. **Jede Operator-Aktion wird bei allen groß eingeblendet.**
- **Antwort-Erkennung**: Groß/klein egal, Tippfehler werden toleriert („Lufthanse“ → Lufthansa), Umlaute/ß, Füllwörter („ich glaube es ist …“), Zahlwörter („acht“ = 8, „zweitausendsechs“ = 2006), Plural, gleich klingende Schreibweisen (Filipinen/Philippinen). Absicherungs-Antworten wie „11 oder 12“ zählen nicht.
- **KI-Richter (optional)**: Für Umschreibungen und Synonyme („schnelles Gehen“ ≈ „rennen“) prüft Claude alle Antworten, die die normale Erkennung nicht versteht. Siehe unten.
- **Teams automatisch** für jede Spielerzahl (z. B. 4 → 2×2, 6 → 2×3, 7 → 3/2/2, 9 → 3×3); neu mischen, „fair mischen“ nach All-Time-Punkten, Spieler per Klick verschieben.
- **All-Time-Score** pro Person: Sieg +10, Platz 2 +5, Platz 3 +2, Teilnahme +1 (Team-Siege zählen für jedes Teammitglied).
- **Bilder**: Operator lädt eure KI-Bilder hoch und weist sie den Spielern zu. Ohne Bild werden Initialen gezeigt. Bilder bleiben am Namen gespeichert.
- **Großer Fragenkatalog**: ~450 Quiz-Duell-Fragen in 24 Kategorien, ~130 Umfragen, ~520 Schnellfragen. Bereits gespielte Fragen kommen an späteren Abenden erst wieder, wenn der Katalog durch ist.
- Wieder-Verbinden nach Neuladen, Sounds (abschaltbar), Handy-tauglich, Backup/Wiederherstellung.

---

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install
```

```bash
npm start
```

Dann im Browser **http://localhost:3000** öffnen. Im selben WLAN können andere über `http://<deine-IP>:3000` mitspielen.

---

## Online stellen – damit jeder von überall mitspielen kann

### Variante A: Heute Abend, kostenlos, in 2 Minuten (Cloudflare Tunnel)

Der Server läuft auf deinem PC, Cloudflare gibt dir eine öffentliche HTTPS-Adresse. Daten (Scores, Bilder) bleiben auf deinem PC.

1. `npm start` laufen lassen.
2. `cloudflared` installieren (Windows):

   ```bash
   winget install --id Cloudflare.cloudflared
   ```

3. In einem zweiten Terminal:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

4. Die angezeigte Adresse `https://….trycloudflare.com` an alle schicken. Fertig.

Nachteil: Dein PC muss laufen, und die Adresse ändert sich bei jedem Start.

### Variante B: Dauerhaft im Internet (Render.com)

1. Diesen Ordner als Repository auf GitHub hochladen (`node_modules` und `data` werden über `.gitignore` ausgelassen).
2. Auf [render.com](https://render.com) anmelden → **New + → Blueprint** → Repository wählen. Die Datei `render.yaml` ist schon vorbereitet.
3. Nach ein paar Minuten läuft die Seite unter `https://spieleabend-xxxx.onrender.com`.

Hinweise:
- Im **kostenlosen Plan** schläft der Server nach 15 Minuten ohne Besucher ein (erster Aufruf dauert dann ~1 Minute) und **gespeicherte Daten gehen bei Neustarts verloren**. Lösung: Im Operator-Bereich „💾 Daten → Backup herunterladen“ am Ende des Abends und beim nächsten Mal wieder einspielen.
- Für dauerhafte Speicherung den Plan „Starter“ (ca. 7 $/Monat) mit Disk nehmen – die Zeilen dafür stehen auskommentiert in `render.yaml`.
- Alternativen mit Speicher: Railway (Volume) oder Fly.io (Volume). Wichtig ist nur: WebSockets erlaubt, `DATA_DIR` zeigt auf den dauerhaften Speicher.

---

## KI-Richter einschalten (optional)

Ohne KI funktionieren Tippfehler, Zahlwörter und alle hinterlegten Varianten. Für echte Synonyme/Umschreibungen:

1. API-Key unter [console.anthropic.com](https://console.anthropic.com) erstellen.
2. Vor dem Start setzen (PowerShell):

   ```powershell
   $env:ANTHROPIC_API_KEY="sk-ant-..."; npm start
   ```

   Auf Render: Umgebungsvariable `ANTHROPIC_API_KEY` eintragen.

Die KI wird nur gefragt, wenn die lokale Erkennung nicht passt, und Ergebnisse werden zwischengespeichert. Standardmodell ist `claude-opus-5-5` mit niedriger Denktiefe; über `AI_MODEL` lässt sich ein anderes Modell wählen (z. B. `claude-haiku-5-5` ist deutlich günstiger). In der Oberfläche steht bei jeder Bewertung, wer entschieden hat: **Auto**, **KI** oder **Operator**.

---

## Einstellungen

| Variable | Bedeutung | Standard |
|---|---|---|
| `PORT` | Port des Servers | `3000` |
| `DATA_DIR` | Ordner für Scores, Bilder, gespielte Fragen | `./data` |
| `ANTHROPIC_API_KEY` | aktiviert den KI-Richter | – |
| `AI_MODEL` | Claude-Modell für den KI-Richter | `claude-opus-5-5` |

## Eigene Fragen ergänzen

Die Kataloge liegen in `server/data/`:

- `quizduell-a.js`, `quizduell-b.js` – Kategorien mit Fragen in Stufe 1–5
- `familienduell.js` – Umfragen mit Antworten und Prozenten
- `duemmste-a.js`, `duemmste-b.js` – Schnellfragen

Format-Beispiel: `{ id: 'x1', q: 'Frage?', a: 'Antwort', alt: ['Variante'], num: 7 }` (`num` für Zahlen-Antworten, `kw` für Schlüsselwort-Gruppen). Nach dem Bearbeiten prüfen:

```bash
node scripts/check-catalog.js quizduell server/data/quizduell-a.js
```

## Testen

```bash
npm test
```

Simulation eines ganzen Spiels mit Bots (startet einen eigenen Server):

```bash
node test/sim.js familienduell 6
```

Test-Bots in einen laufenden Raum schicken (praktisch zum Ausprobieren alleine):

```bash
node test/bots.js RAUMCODE 3
```

## Aufbau

```
server/          Node.js + Express + Socket.IO
  index.js       Webserver, Uploads, Backup, Socket-Events
  room.js        Raum, Spieler, Teams, Timer mit Pause, Einblendungen
  operator.js    alle Operator-Aktionen
  matcher.js     Antwort-Erkennung
  aijudge.js     optionaler KI-Richter (Claude)
  games/         Quiz Duell, Familien-Duell, Der Dümmste fliegt
  data/          Fragenkataloge
public/          Website (Preact + htm, ohne Build-Schritt)
```
