# Grafiken für den Spieleabend

Die Seite nutzt diese Bilder automatisch, sobald sie im Ordner `public/assets/` liegen. Bis dahin werden Emojis angezeigt, es geht also nichts kaputt.

## Einheitlicher Stil (für alle Bilder in den Prompt übernehmen)

> Premium TV game show style, glossy 3D emblem, soft studio lighting, rich deep navy and gold color palette with one accent color, clean centered composition, subtle rim light, high detail, no text, no letters, transparent background, square 1:1

Wichtig: **kein Text in den Bildern**, **transparenter Hintergrund (PNG)** und alle Bilder im **gleichen Stil**.

## 1. Logo – `public/assets/logo.png`

- 1024 × 1024 px, PNG, transparent
- Prompt: *A golden 3D game show emblem combining a dice and a spotlight star, glossy gold with navy accents, premium TV show logo mark, no text, transparent background*

## 2. Spiel-Icons – `public/assets/games/<name>.png`

Je 512 × 512 px, PNG, transparent. Dateinamen genau so:

| Datei | Akzentfarbe | Motiv (für den Prompt) |
|---|---|---|
| `quizduell.png` | Blau | a glossy quiz board tile with a lightning bolt and a buzzer button |
| `familienduell.png` | Pink | a retro game show answer board with glowing panels and a red buzzer |
| `duemmste.png` | Gold | a cartoon brain with a tiny graduation cap and a broken heart beside it |
| `montagsmaler.png` | Türkis | a paint brush and a colorful palette drawing a squiggle |
| `luegenbaron.png` | Rot | a theatrical mask with a long Pinocchio nose and a monocle |
| `spion.png` | Stahlblau | a detective hat with sunglasses and a magnifying glass |
| `witzbold.png` | Orange | a laughing comedy microphone with confetti |
| `schaetzen.png` | Violett | a target with a dart and a measuring tape swirling around it |
| `gleichdenker.png` | Grün | two puzzle pieces clicking together with small thought bubbles |

## Einbauen

1. Bilder mit den Dateinamen oben speichern.
2. In den Ordner `public/assets/` bzw. `public/assets/games/` legen.
3. Mir Bescheid sagen, dann lade ich sie hoch und prüfe die Darstellung (oder selbst committen und pushen, Render aktualisiert automatisch).
