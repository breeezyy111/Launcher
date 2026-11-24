# Launcher

A home screen for all the apps I'm building. It's one static web page with no build step and no dependencies, and you can install it as an app (PWA) on desktop or phone.

## Run it

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Live site

`.github/workflows/pages.yml` publishes the launcher to GitHub Pages on every push to `main` (or run it by hand from the Actions tab). One-time setup: repo **Settings → Pages → Source: GitHub Actions**. The site is then at `https://breeezyy111.github.io/Launcher/`.

## Add your apps

Edit **`apps.json`**:

```json
{
  "apps": [
    {
      "id": "my-app",                     // optional, made from the name if missing
      "name": "My App",
      "url": "https://my-app.example.com",
      "description": "What it does",
      "icon": "🚀",                        // an emoji, or an image URL/path such as icons/my-app.png
      "color": "#6366f1",
      "category": "Tools",                // section: Games, Create, Tools or Learn & Explore
      "genre": "Puzzle",                  // optional type inside a section (Games use Action, Arcade, Puzzle, Casual, Board & Party)
      "added": "2026-11-15",              // optional: shows a New badge and the New row for 3 weeks
      "featured": true,                   // optional: headline game, gets the Home banner until it has been played once
      "status": "live",                   // live | beta | dev | archived
      "tags": ["web"],
      "embed": true,                      // play it inside the launcher instead of leaving
      "newTab": true,                     // false opens it in the same tab
      "needsNetwork": true                // optional: dims the tile offline (other sites are dimmed automatically)
    }
  ]
}
```

There is no add button in the UI: new apps go in `apps.json`. Edits made in the UI are saved in that browser only. Use **⋯ → Export apps** to download a merged `apps.json` and commit it.

## Finding things

The launcher opens on **Home**: the featured banner, then rows for **Favorites** (tap the star on any app; it stays pinned at the top, and **Arrange** reorders it with arrows or drag and drop), **Recently played**, **New**, one row per game type (Action, Arcade, Puzzle, Casual, Board & Party) and one per section (Create, Tools, Learn & Explore). Rows scroll sideways and each has **See all**. The chips switch to **All** or a single section; picking **Games** adds a second row of chips for the game types, and grid views can be sorted by recently played, A to Z, most played or newest. Search (`/` or Ctrl/⌘+K) is instant: results appear under the box as you type, ranked by name, initials (`sf` finds Stellar Forge), section, game type, tags and description, and it forgives typos (`stakfall`). With nothing typed it shows your favorites, recently played, recent searches and sections to browse. Each result has a star, `Enter` opens, Ctrl/⌘+Enter opens in a new tab, and **See all results** shows them as cards. Keys: `H` home, `G` games, `F` favorites the focused app. Your last view and sort are remembered in the browser.

## Offline

The service worker caches the launcher and every built-in app (any `url` and `icon` in `apps.json` that points inside this repo) when it installs, so built-in apps open with no connection. A new app needs no edit to `sw.js`. Apps on other sites, plus ones marked `"needsNetwork": true` (Orca, Comet), are dimmed while offline. The last app list is also kept in the browser, so the launcher paints instantly instead of waiting for `apps.json`.

## Apps inside the launcher

Apps with `"embed": true` open in a player inside the launcher, with a back button, full screen and an "open in its own tab" button.

- **Project SuperInk** is still its own game with its own site and repo. The launcher just plays that site in the player.
- **Stellar Forge** is built in too: the space sandbox lives in `stellar-forge/` (one self-contained `index.html`). It started as a copy of [breeezyy111/space](https://github.com/breeezyy111/space) and has since grown here (777K object cap, new events, gravity brushes, achievements), so edit this copy rather than copying that repo over it.
- **Neon Drift**, **Fusion**, **Jot** and **Focus** are small built-in apps, each one self-contained `index.html` in its own folder (`neon-drift/`, `fusion/`, `jot/`, `focus/`). Scores, notes and timer counts are saved in the browser.
- **Brinkline** is the headline game: a motorbike racer in `brinkline/` (one self-contained `index.html`, no libraries). Five deadly domains (Magma Rift, Frostbite Pass, Neon Sprawl, Toxic Marsh, Storm Spire) with geysers, black ice, laser gates, spore pods and lightning; 7 CPU rivals; drifting and slipstreaming fill the boost meter. Modes: Grand Prix (all five, points and trophies per difficulty), Quick Race and Time Trial (your best lap races you as a ghost). Coins from races buy and upgrade five bikes in the Garage. Keyboard, gamepad and touch. Debug URL params: `?race&go&domain=1-5` jumps into a race, `&bot` drives itself, `&laps=1`, `?coins=5000`.
- **Krazy Kombat** is a built-in one-on-one fighting game in `krazy-kombat/` (one self-contained `index.html`): six original fighters, vs CPU or 2 players on one keyboard, gamepads and touch controls. Add `?demo` to the URL to watch CPU vs CPU.
- **Snake** (`snake/`) and **Stackfall** (`stackfall/`, a falling-block puzzler) are built-in single-file games. Snake lets you pick map size, speed and apple count; Stackfall has pixel/smooth styles and sound toggles.
- **Tiny Roads** (`tiny-roads/`) is a built-in single-file road-building puzzler: connect houses to matching-colored stations before they jam. It has a menu with save/load, theme and game speed, all kept in the browser.
- **Grid Pop** (`grid-pop/`) is a built-in single-file block puzzle: drag pieces onto an 8x8 grid, clear full rows and columns, and build combos. Best score is kept in the browser.
- **Money Clicker** (`money-clicker/`) is a built-in single-file idle clicker: tap for cash, buy businesses and upgrades, and unlock achievements. Progress saves in the browser. Marked Beta.
- **Soundbloom** (`soundbloom/`) is a built-in music playground in one self-contained `index.html`, all synthesized with Web Audio (no sound files, so it works offline). It has six parts: **Studio** (a multi-track song grid with 12 instruments, 4 drum kits, keys and scales, undo, an "Inspire me" idea generator, a song library, share-as-link with the whole song packed in the URL, and WAV, MIDI and song-file export), **Beat Wheel** (polyrhythm drum rings with their own step counts, even-spread fills and WAV export), **Keys** (playable keyboard with chords, arpeggiator, sustain and a recorder that sends the take to Studio), **Sky Pad** (multitouch pitch/brightness pad), **Orbits** (bouncing balls in a spinning shape play notes) and **Wave Draw** (draw a waveform and use it as the "My wave" instrument everywhere). Songs and settings are saved in the browser.
- **Dino Game** (`dino-game/`) is a built-in single-file endless runner with original art: jump (hold for higher), duck, grab amber for bonus points, and watch day turn to night as the speed ramps up. Works with keyboard, gamepad and touch (tap to jump, swipe down or the Duck button to duck); best score is kept in the browser.
- **Comet** (`comet/`) is a built-in web browser: tabs, an address bar, back/forward/reload, and a home page of shortcuts you can star. Pages load directly in a frame, with no proxy. Sites that refuse to be framed (YouTube's home page, GitHub, Reddit, social apps and so on) show a clear "can't be shown here" card with an Open in new tab button, and YouTube watch links play through the official embed player.
- **Eight more original games** are built in, each one self-contained `index.html` in its own folder: **Sky Hopper** (`sky-hopper/`), **Block Bash Arena** (`block-bash/`), **Turbo Tanks** (`turbo-tanks/`), **Dungeon Dash** (`dungeon-dash/`), **Rhythm Rush** (`rhythm-rush/`), **Gravity Golf** (`gravity-golf/`), **Zombie Hold-Out** (`zombie-holdout/`) and **Word Blitz** (`word-blitz/`). They all work with keyboard, gamepad and touch, and save best scores in the browser. Word Blitz loads its dictionary from `word-blitz/words.txt` (from the public-domain ENABLE word list, with offensive words removed).
- **Orca** is built in: its chat page lives in `orca/`. It talks to the Cloudflare Worker from [breeezyy111/Orca](https://github.com/breeezyy111/Orca). The Worker address is set in `orca/config.js` (`apiUrl`).

## Features

- A featured banner up top for a headline game you have not played yet (`"featured": true`), otherwise the app you used last (or your first pin, or the first live app), with Play and New tab buttons
- Instant search with typo tolerance and match highlighting. Press `/` or Ctrl/⌘+K, use the arrow keys to move, and press `Enter` to launch.
- Category filters with counts, plus status badges (live, beta, dev, archived)
- Pin favorites to the top of Home and arrange them; unpinning has Undo. Recently launched apps move to the front.
- Edit and delete apps in the UI, with JSON import and export
- Five styles you can switch in the **⋯** menu: Cards, Springboard (a phone home screen), Poster, Arcade (neon) and Terminal (a list). The choice is remembered, and `?skin=arcade` in the URL forces one.
- Light and dark themes, works on phones, and keeps working offline once loaded

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell |
| `styles.css` | Styles (light and dark themes) |
| `app.js` | All logic |
| `apps.json` | The app registry |
| `orca/` | Orca's chat page, built into the launcher |
| `sw.js`, `manifest.webmanifest` | Offline support and install as an app |
| `.github/workflows/pages.yml` | Deploys to GitHub Pages |
- **New in this batch** (each one self-contained `index.html` in its own folder, saving progress in the browser and working offline): **Star Swarm** (`star-swarm/`, wave space shooter with bosses), **Paddle Panic** (`paddle-panic/`, brick breaker with power-ups), **Fuse Field** (`fuse-field/`, logic puzzle where numbers count hidden fuses), **Sudoku** (`sudoku/`, generated puzzles in four levels with notes and hints), **Mind Match** (`mind-match/`, memory pairs), **Drop Four** (`drop-four/`, four-in-a-row vs CPU or a friend), **Reversi** (`reversi/`, vs CPU or a friend), **Calc** (`calc/`, calculator and unit converter), **Tasks** (`tasks/`, to-do lists), **Decider** (`decider/`, coin, dice, wheel, number and team picker), **Sketch** (`sketch/`, drawing pad with PNG export), **Keystorm** (`keystorm/`, typing speed test) and **Math Sprint** (`math-sprint/`, timed mental maths).
