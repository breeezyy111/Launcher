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
      "category": "Tools",                // becomes a filter chip
      "status": "live",                   // live | beta | dev | archived
      "tags": ["web"],
      "embed": true,                      // play it inside the launcher instead of leaving
      "newTab": true                      // false opens it in the same tab
    }
  ]
}
```

There is no add button in the UI: new apps go in `apps.json`. Edits made in the UI are saved in that browser only. Use **⋯ → Export apps** to download a merged `apps.json` and commit it.

## Apps inside the launcher

Apps with `"embed": true` open in a player inside the launcher, with a back button, full screen and an "open in its own tab" button.

- **Project SuperInk** is still its own game with its own site and repo. The launcher just plays that site in the player.
- **Stellar Forge** is built in too: the space sandbox lives in `stellar-forge/` (one self-contained `index.html`). It started as a copy of [breeezyy111/space](https://github.com/breeezyy111/space) and has since grown here (777K object cap, new events, gravity brushes, achievements), so edit this copy rather than copying that repo over it.
- **Neon Drift**, **Fusion**, **Jot** and **Focus** are small built-in apps, each one self-contained `index.html` in its own folder (`neon-drift/`, `fusion/`, `jot/`, `focus/`). Scores, notes and timer counts are saved in the browser.
- **Krazy Kombat** is a built-in one-on-one fighting game in `krazy-kombat/` (one self-contained `index.html`): six original fighters, vs CPU or 2 players on one keyboard, gamepads and touch controls. Add `?demo` to the URL to watch CPU vs CPU.
- **Snake** (`snake/`) and **Stackfall** (`stackfall/`, a falling-block puzzler) are built-in single-file games. Snake lets you pick map size, speed and apple count; Stackfall has pixel/smooth styles and sound toggles.
- **Tiny Roads** (`tiny-roads/`) is a built-in single-file road-building puzzler: connect houses to matching-colored stations before they jam. It has a menu with save/load, theme and game speed, all kept in the browser.
- **Grid Pop** (`grid-pop/`) is a built-in single-file block puzzle: drag pieces onto an 8x8 grid, clear full rows and columns, and build combos. Best score is kept in the browser.
- **Money Clicker** (`money-clicker/`) is a built-in single-file idle clicker: tap for cash, buy businesses and upgrades, and unlock achievements. Progress saves in the browser. Marked Beta.
- **Comet** (`comet/`) is a built-in web browser: tabs, an address bar, back/forward/reload, and a home page of shortcuts you can star. Pages load directly in a frame, with no proxy. Sites that refuse to be framed (YouTube's home page, GitHub, Reddit, social apps and so on) show a clear "can't be shown here" card with an Open in new tab button, and YouTube watch links play through the official embed player.
- **Eight more original games** are built in, each one self-contained `index.html` in its own folder: **Sky Hopper** (`sky-hopper/`), **Block Bash Arena** (`block-bash/`), **Turbo Tanks** (`turbo-tanks/`), **Dungeon Dash** (`dungeon-dash/`), **Rhythm Rush** (`rhythm-rush/`), **Gravity Golf** (`gravity-golf/`), **Zombie Hold-Out** (`zombie-holdout/`) and **Word Blitz** (`word-blitz/`). They all work with keyboard, gamepad and touch, and save best scores in the browser. Word Blitz loads its dictionary from `word-blitz/words.txt` (from the public-domain ENABLE word list, with offensive words removed).
- **Orca** is built in: its chat page lives in `orca/`. It talks to the Cloudflare Worker from [breeezyy111/Orca](https://github.com/breeezyy111/Orca). The Worker address is set in `orca/config.js` (`apiUrl`).

## Features

- A featured banner up top for the app you used last (or your first pin, or the first live app), with Play and New tab buttons
- Search across name, description, tags and URL. Press `/` to focus it, use the arrow keys to move, and press `Enter` to launch.
- Category filters with counts, plus status badges (live, beta, dev, archived)
- Pin favourites. Recently launched apps move to the front.
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
