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

You can also use **+ Add app** in the UI. Changes made in the UI are saved in that browser only. Use **⋯ → Export apps** to download a merged `apps.json` and commit it.

## Apps inside the launcher

Apps with `"embed": true` open in a player inside the launcher, with a back button, full screen and an "open in its own tab" button.

- **Project SuperInk** is still its own game with its own site and repo. The launcher just plays that site in the player.
- **Orca** is built in: its chat page lives in `orca/`. It talks to the Cloudflare Worker from [breeezyy111/Orca](https://github.com/breeezyy111/Orca). Paste the Worker address into `orca/config.js` (`apiUrl`) once it is deployed.

## Features

- Search across name, description, tags and URL. Press `/` to focus it, use the arrow keys to move, and press `Enter` to launch.
- Category filters, plus status badges (live, beta, dev, archived)
- Pin favourites. Recently launched apps move to the front.
- Add, edit and delete apps in the UI, with JSON import and export
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
