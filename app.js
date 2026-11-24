/*
 * Launcher — a home screen for all the apps I'm building.
 *
 * Apps come from two places:
 *   1. apps.json (the shared registry, committed to the repo)
 *   2. local changes made in the UI (stored in this browser's localStorage)
 * Local changes are layered on top of apps.json by app id. Use the ⋯ menu →
 * "Export apps" to get a merged apps.json you can commit.
 */
(() => {
  'use strict';

  const STORE_KEY = 'launcher:v1';
  const APPS_CACHE_KEY = 'launcher:apps-cache';
  const VIEW_KEY = 'launcher:view';
  const $ = (sel) => document.querySelector(sel);

  // ---------- state ----------
  let baseApps = [];
  let local = loadLocal();
  let query = '';
  let selected = 0;
  let spotOpen = false;   // the instant-search panel under the search box
  let spotSel = 0;        // highlighted row in it
  let arranging = false;  // Favorites row is in arrange (reorder) mode
  // Where you are: 'Home' (rows by group), 'All', or one section such as 'Games'.
  // genre narrows Games down (Action, Puzzle…). sort applies to the grid views.
  let { view, genre, sort } = loadView();

  // Sections and game types show in this order; anything else in apps.json goes after, A to Z.
  const SECTION_ORDER = ['Games', 'Create', 'Tools', 'Learn & Explore'];
  const GENRE_ORDER = ['Action', 'Arcade', 'Puzzle', 'Casual', 'Board & Party'];
  const NEW_DAYS = 21;

  function loadView() {
    const d = { view: 'Home', genre: 'All', sort: 'recent' };
    try { return { ...d, ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') }; } catch { return d; }
  }
  function saveView() {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ view, genre, sort })); } catch { /* ignore */ }
  }
  function go(v, g = 'All') {
    view = v; genre = g; selected = 0; saveView(); render();
    window.scrollTo({ top: Math.min(window.scrollY, $('#filters').offsetTop - 80), behavior: 'smooth' });
  }

  function loadLocal() {
    const empty = { overrides: {}, pinned: [], launches: {}, searches: [], favHint: true };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? { ...empty, ...JSON.parse(raw) } : empty;
    } catch {
      return empty;
    }
  }
  function saveLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(local)); } catch { /* private mode etc. */ }
  }

  /** apps.json merged with local overrides (null override = deleted). */
  function allApps() {
    const byId = new Map(baseApps.map((a) => [a.id, a]));
    for (const [id, app] of Object.entries(local.overrides)) {
      if (app === null) byId.delete(id);
      else byId.set(id, { ...byId.get(id), ...app, id });
    }
    return [...byId.values()];
  }

  // ---------- helpers ----------
  const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
  const isImage = (icon) => /^(https?:|data:|\.{0,2}\/)|\.(png|jpe?g|svg|webp|gif|ico)$/i.test(icon || '');

  function normalizeUrl(url) {
    url = (url || '').trim();
    if (!url) return url;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('.')) return url;
    return 'https://' + url;
  }

  function safeHref(url) {
    // Block javascript:/data: etc. as launch targets.
    try {
      const u = new URL(url, location.href);
      return ['http:', 'https:'].includes(u.protocol) ? u.href : '#';
    } catch {
      return '#';
    }
  }

  /** Apps that can't work offline: other sites, or ones flagged "needsNetwork" in apps.json. */
  function needsNet(app) {
    if (app.needsNetwork) return true;
    try { return new URL(app.url, location.href).origin !== location.origin; } catch { return false; }
  }
  const isOffline = () => navigator.onLine === false;

  // ---------- search ranking ----------
  // Lower-case, accents off, punctuation to spaces. Keeps the string the same length so
  // match positions line up with the original name for highlighting.
  const fold = (s) => [...(s || '')].map((c) => {
    const b = c.normalize('NFD')[0].toLowerCase();
    return /[a-z0-9&]/.test(b) ? b : ' ';
  }).join('');
  const words = (s) => s.split(' ').filter(Boolean);
  const terms = (q) => words(fold(q));

  /** Edit distance (with swaps), giving up early once it's over max. */
  function typoDist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v);
        best = Math.min(best, v);
      }
      if (best > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }

  /** Start index of each word in a folded string. */
  function wordStarts(f) {
    const out = [];
    for (let i = 0; i < f.length; i++) if (f[i] !== ' ' && (i === 0 || f[i - 1] === ' ')) out.push(i);
    return out;
  }

  /** How well one search word matches an app: a score (0 = no match) and name ranges to highlight. */
  function termScore(app, t) {
    const name = fold(app.name);
    const starts = wordStarts(name);
    const len = t.length;
    if (name.trim() === t) return { s: 100, hl: [[name.indexOf(t), name.indexOf(t) + len]] };
    if (name.startsWith(t)) return { s: 85, hl: [[0, len]] };
    const ws = starts.find((i) => name.startsWith(t, i));
    if (ws !== undefined) return { s: 70, hl: [[ws, ws + len]] };
    // Initials: "sf" finds Stellar Forge, "dd" Dungeon Dash.
    if (len >= 2 && len <= starts.length && starts.map((i) => name[i]).join('').startsWith(t)) {
      return { s: 62, hl: starts.slice(0, len).map((i) => [i, i + 1]) };
    }
    const at = name.replace(/ /g, '').indexOf(t);
    if (len >= 2 && name.includes(t)) return { s: 50, hl: [[name.indexOf(t), name.indexOf(t) + len]] };
    if (len >= 3 && at >= 0) { // "tinyroads" or "skyhop" without the space
      const map = [...name].map((c, i) => (c === ' ' ? -1 : i)).filter((i) => i >= 0);
      return { s: 48, hl: [[map[at], map[at + len - 1] + 1]] };
    }
    // Section, game type and tags: "puzzle", "music", "2 player".
    const tagWords = words(fold([app.category, app.genre, ...(app.tags || []), app.label].join(' ')));
    if (tagWords.includes(t)) return { s: 44 };
    if (len >= 2 && tagWords.some((w) => w.startsWith(t))) return { s: 34 };
    // Typos in a name word: "dinp", "stakfall", "sodoku".
    if (len >= 3) {
      const max = len >= 7 ? 2 : 1;
      for (const i of starts) {
        const w = name.slice(i).split(' ')[0];
        if (w.length < 3) continue;
        const full = typoDist(t, w, max);
        const pre = len < w.length ? typoDist(t, w.slice(0, len), max) : full;
        if (full <= max) return { s: 30 - full * 4, hl: [[i, i + w.length]] };
        if (pre <= max) return { s: 26 - pre * 4, hl: [[i, i + len]] };
      }
    }
    const desc = fold(app.description);
    if (len >= 2 && wordStarts(desc).some((i) => desc.startsWith(t, i))) return { s: 20 };
    if (len >= 4 && desc.includes(t)) return { s: 12 };
    // Letters in order anywhere in the name: "sky hpr", "zmbie".
    if (len >= 3) {
      const hl = [];
      let j = 0;
      for (let i = 0; i < name.length && j < len; i++) if (name[i] === t[j]) { hl.push([i, i + 1]); j++; }
      if (j === len && hl[hl.length - 1][0] - hl[0][0] < len * 2.5) return { s: 10, hl };
    }
    return { s: 0 };
  }

  /** Score an app for a whole query: every word has to match somewhere. */
  function scoreApp(app, q) {
    const ts = terms(q);
    if (!ts.length) return { score: 1, hl: [] };
    let score = 0;
    const hl = [];
    for (const t of ts) {
      const r = termScore(app, t);
      if (!r.s) return { score: 0, hl: [] };
      score += r.s;
      if (r.hl) hl.push(...r.hl);
    }
    // Small nudges toward what you actually use.
    if (local.pinned.includes(app.id)) score += 4;
    score += Math.min(6, Math.log2(1 + (local.launches[app.id]?.count || 0)) * 1.5);
    return { score, hl };
  }

  const matches = (app, q) => !q || scoreApp(app, q).score > 0;

  /** Apps for a query, best match first. */
  function searchApps(apps, q) {
    return apps.map((app) => ({ app, ...scoreApp(app, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name));
  }

  /** Put text into el with the matched ranges wrapped in <mark>, without innerHTML. */
  function highlightText(el, text, ranges) {
    el.replaceChildren();
    const marks = new Array(text.length).fill(false);
    for (const [a, b] of ranges || []) for (let i = a; i < b && i < text.length; i++) marks[i] = true;
    let i = 0;
    while (i < text.length) {
      let j = i;
      while (j < text.length && marks[j] === marks[i]) j++;
      const part = text.slice(i, j);
      if (marks[i]) { const m = document.createElement('mark'); m.textContent = part; el.append(m); }
      else el.append(part);
      i = j;
    }
  }

  function sortApps(apps, by = 'recent') {
    const l = local.launches;
    const az = (a, b) => a.name.localeCompare(b.name);
    const cmp = {
      recent: (a, b) => ((l[b.id]?.last || 0) - (l[a.id]?.last || 0)) || az(a, b),
      most: (a, b) => ((l[b.id]?.count || 0) - (l[a.id]?.count || 0)) || az(a, b),
      new: (a, b) => (b.added || '').localeCompare(a.added || '') || az(a, b),
      az,
    }[by] || az;
    return apps.sort(cmp);
  }

  const isNew = (app) => !!app.added && (Date.now() - Date.parse(app.added)) / 864e5 < NEW_DAYS;
  const ordered = (list, order) => [...new Set(list)].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

  let toastTimer;
  /** A short message at the bottom. With an action ({ label, run }) it shows a button and stays longer. */
  function toast(msg, action) {
    const t = $('#toast');
    const btn = $('#toastAction');
    $('#toastText').textContent = msg;
    btn.hidden = !action;
    t.classList.toggle('has-action', !!action);
    btn.onclick = null;
    if (action) {
      btn.textContent = action.label;
      btn.onclick = () => { t.classList.remove('show'); action.run(); };
    }
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2200);
  }

  // Small inline SVG icons (stroke style), so nothing depends on emoji glyphs.
  const ICONS = {
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    edit: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    tab: '<path d="M14 4h6v6M10 14 20 4M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    move: '<path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01"/>',
  };
  function icon(name, fill) {
    const span = document.createElement('span');
    span.innerHTML = `<svg class="i${fill ? ' fill' : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
    return span.firstChild;
  }

  const STATUS = { live: 'Live', beta: 'Beta', dev: 'In dev', archived: 'Archived' };
  const ctaLabel = (app) => (app.embed ? (/game/i.test(app.category || '') ? 'Play' : 'Open') : 'Visit');

  function launch(app, el, e) {
    if (isOffline() && needsNet(app)) {
      e.preventDefault();
      toast(`${app.name} needs the internet`);
      return;
    }
    el.classList.remove('launching'); void el.offsetWidth; el.classList.add('launching');
    recordLaunch(app.id);
    // Plain clicks on embeddable apps play inside the launcher; ctrl/cmd-click still opens a tab.
    if (app.embed && el.getAttribute('href') !== '#' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      location.hash = '#/play/' + encodeURIComponent(app.id);
    }
  }

  function setIcon(box, app) {
    box.replaceChildren();
    if (isImage(app.icon)) {
      const img = document.createElement('img');
      img.src = app.icon; img.alt = ''; img.loading = 'lazy';
      box.append(img);
    } else {
      box.textContent = app.icon || app.name.slice(0, 1).toUpperCase();
    }
  }

  // ---------- rendering ----------
  function tile(app) {
    const a = document.createElement('a');
    a.className = 'tile';
    a.href = safeHref(app.url);
    a.dataset.id = app.id;
    if (!app.embed && app.newTab !== false) { a.target = '_blank'; a.rel = 'noopener'; }
    if (app.color) a.style.setProperty('--tile-color', app.color);
    if (needsNet(app)) a.classList.add('needs-net');

    const ico = document.createElement('div');
    ico.className = 'ico';
    setIcon(ico, app);

    const name = document.createElement('div');
    name.className = 'name';
    if (query) highlightText(name, app.name, scoreApp(app, query).hl);
    else name.textContent = app.name;
    a.append(ico, name);

    if (app.description) {
      const d = document.createElement('div');
      d.className = 'desc';
      d.textContent = app.description;
      a.append(d);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    if (isNew(app)) meta.append(badge('new', 'New'));
    if (app.status && !(isNew(app) && app.status === 'live')) meta.append(badge(app.status, STATUS[app.status] || app.status));
    meta.append(badge('', app.genre || app.category || 'App'));
    if (app.label) meta.append(badge('label', app.label));
    const cta = document.createElement('span');
    cta.className = 'tile-cta';
    cta.setAttribute('aria-hidden', 'true');
    cta.append(ctaLabel(app), icon('arrow'));
    meta.append(cta);
    a.append(meta);

    const tools = document.createElement('div');
    tools.className = 'tile-tools';
    const pinned = local.pinned.includes(app.id);
    tools.append(
      toolBtn(icon('star', pinned), pinned ? 'Remove from favorites' : 'Add to favorites', () => togglePin(app.id), pinned),
      toolBtn(icon('edit'), 'Edit', () => openEditor(app))
    );
    a.append(tools);

    a.addEventListener('click', (e) => launch(app, a, e));
    return a;
  }

  function badge(cls, text) {
    const b = document.createElement('span');
    b.className = 'badge ' + cls;
    b.textContent = text;
    return b;
  }

  function toolBtn(label, title, onClick, pressed) {
    const b = document.createElement('button');
    b.type = 'button';
    b.append(label);
    b.title = title;
    b.setAttribute('aria-label', title);
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
  }

  function chip(label, n, pressed, onClick, ico) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    if (ico) b.append(icon(ico));
    b.append(label);
    if (n !== undefined) {
      const count = document.createElement('span');
      count.className = 'chip-count';
      count.textContent = n;
      b.append(count);
    }
    b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    const apps = allApps();
    const sections = ordered(apps.map((a) => a.category).filter(Boolean), SECTION_ORDER);
    if (view !== 'Home' && view !== 'All' && !sections.includes(view)) view = 'Home';
    const inView = (a) => view === 'Home' || view === 'All' || a.category === view;
    const genres = ordered(apps.filter((a) => a.category === view && a.genre).map((a) => a.genre), GENRE_ORDER);
    if (genre !== 'All' && !genres.includes(genre)) genre = 'All';

    // Section chips: Home, All, then each section. A section with types (Games) gets a second row.
    $('#filters').replaceChildren(
      chip('Home', undefined, view === 'Home' && !query, () => { clearSearch(); go('Home'); }, 'home'),
      chip('All', apps.length, view === 'All', () => go('All')),
      ...sections.map((c) => chip(c, apps.filter((a) => a.category === c).length, view === c && genre === 'All', () => go(c)))
    );
    const sub = $('#subfilters');
    sub.hidden = genres.length < 2 || view === 'Home' || view === 'All';
    if (!sub.hidden) {
      sub.replaceChildren(
        chip(`All ${view.toLowerCase()}`, undefined, genre === 'All', () => go(view)),
        ...genres.map((g) => chip(g, apps.filter((a) => a.category === view && a.genre === g).length, genre === g, () => go(view, g)))
      );
    }
    $('#categoryList').replaceChildren(...sections.map((c) => Object.assign(document.createElement('option'), { value: c })));
    $('#genreList').replaceChildren(...ordered(apps.map((a) => a.genre).filter(Boolean), GENRE_ORDER)
      .map((g) => Object.assign(document.createElement('option'), { value: g })));

    const home = view === 'Home' && !query;
    $('#shelves').hidden = !home;
    $('#gridSection').hidden = home;
    $('#sortWrap').hidden = !!query;

    if (home) {
      renderShelves(apps, sections);
      $('#pinnedSection').hidden = true;
      $('#empty').hidden = apps.length > 0;
    } else {
      // Search looks through everything; otherwise show the chosen section/type as one grid.
      const visible = query ? searchApps(apps, query).map((r) => r.app)
        : sortApps(apps.filter((a) => inView(a) && (genre === 'All' || a.genre === genre)), sort);
      const pinned = query ? [] : visible.filter((a) => local.pinned.includes(a.id))
        .sort((a, b) => local.pinned.indexOf(a.id) - local.pinned.indexOf(b.id));
      const rest = visible.filter((a) => !pinned.includes(a));
      $('#pinnedSection').hidden = pinned.length === 0;
      $('#pinned').replaceChildren(...pinned.map(tile));
      $('#grid').replaceChildren(...rest.map(tile));
      const where = query ? 'Results' : view === 'All' ? 'All apps' : genre !== 'All' ? genre : view;
      $('#allTitle').textContent = pinned.length ? `More in ${where === 'All apps' ? 'all apps' : where}` : where;
      $('#allCount').textContent = rest.length || '';
      $('#gridSection').querySelector('.grid-head').hidden = rest.length === 0 && pinned.length > 0;
      $('#sort').value = sort;
      $('#empty').hidden = visible.length > 0;
    }
    $('#grid').removeAttribute('aria-busy');
    const filtered = !!query || !home;
    $('#emptyText').textContent = query ? `Nothing matches “${query}”.` : filtered ? 'Nothing here yet.' : 'Couldn’t load your apps.';
    $('#emptyBtn').textContent = query ? 'Clear search' : filtered ? 'Go home' : 'Try again';
    tiles().forEach((t, i) => t.style.setProperty('--i', Math.min(i, 16)));

    renderIntro(apps);
    renderHero(apps);
    highlight();
    if (spotOpen) renderSpot();
  }

  const favApps = (apps) => local.pinned.map((id) => apps.find((a) => a.id === id)).filter(Boolean);

  /** Home: a row per shelf. Favorites (pinned to the top), recently played and new first, then each type and section. */
  function renderShelves(apps, sections) {
    const l = local.launches;
    const shelves = [];
    const favs = favApps(apps);
    if (favs.length) shelves.push({ title: 'Favorites', apps: favs, fav: true });
    else if (local.favHint !== false && apps.length) shelves.push({ title: 'Favorites', apps: [], fav: true });
    if (favs.length < 2) arranging = false;
    const recent = apps.filter((a) => l[a.id]?.last).sort((a, b) => l[b.id].last - l[a.id].last).slice(0, 12);
    if (recent.length) shelves.push({ title: 'Recently played', apps: recent, see: () => { sort = 'recent'; go('All'); } });
    const fresh = sortApps(apps.filter(isNew), 'new');
    if (fresh.length) shelves.push({ title: 'New', apps: fresh, see: () => { sort = 'new'; go('All'); } });
    for (const sec of sections) {
      const inSec = apps.filter((a) => a.category === sec);
      const types = ordered(inSec.map((a) => a.genre).filter(Boolean), GENRE_ORDER);
      if (types.length > 1) {
        for (const g of types) {
          shelves.push({ title: g, kicker: sec, apps: sortApps(inSec.filter((a) => a.genre === g)), see: () => go(sec, g) });
        }
        const loose = inSec.filter((a) => !a.genre);
        if (loose.length) shelves.push({ title: `More ${sec.toLowerCase()}`, apps: sortApps(loose), see: () => go(sec) });
      } else {
        shelves.push({ title: sec, apps: sortApps(inSec), see: () => go(sec) });
      }
    }
    const loose = apps.filter((a) => !a.category);
    if (loose.length) shelves.push({ title: 'Other', apps: sortApps(loose), see: () => go('All') });

    $('#shelves').replaceChildren(...shelves.map((sh) => {
      const sec = document.createElement('section');
      sec.className = 'shelf';
      const head = document.createElement('div');
      head.className = 'shelf-head';
      const h = document.createElement('h2');
      h.className = 'section-title';
      if (sh.fav) { sec.classList.add('fav-shelf'); h.append(icon('star', true)); }
      if (sh.kicker) {
        const k = document.createElement('span');
        k.className = 'kicker';
        k.textContent = sh.kicker;
        h.append(k);
      }
      h.append(sh.title);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = sh.apps.length;
      h.append(' ', count);
      head.append(h);
      const row = document.createElement('div');
      row.className = 'grid shelf-row' + (sh.apps.length > 3 ? ' two' : '');
      row.append(...sh.apps.map(tile));
      if (sh.fav) {
        if (!sh.apps.length) { count.remove(); sec.append(head, favHint()); return sec; }
        setupFavRow(sec, head, row);
      }
      const nav = document.createElement('div');
      nav.className = 'shelf-nav';
      const scrollBy = (dir) => row.scrollBy({ left: dir * row.clientWidth * 0.85, behavior: 'smooth' });
      const prev = toolBtn(icon('left'), 'Scroll left', () => scrollBy(-1));
      const next = toolBtn(icon('right'), 'Scroll right', () => scrollBy(1));
      nav.append(prev, next);
      if (sh.see) {
        const see = document.createElement('button');
        see.type = 'button';
        see.className = 'see-all';
        see.textContent = 'See all';
        see.addEventListener('click', sh.see);
        head.append(see);
      }
      head.append(nav);
      const syncNav = () => {
        prev.disabled = row.scrollLeft < 4;
        next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
        nav.hidden = prev.disabled && next.disabled;
      };
      row.addEventListener('scroll', syncNav, { passive: true });
      requestAnimationFrame(syncNav);
      sec.append(head, row);
      return sec;
    }));
  }

  /** Shown in place of an empty Favorites row: how to pin something. Can be dismissed. */
  function favHint() {
    const box = document.createElement('div');
    box.className = 'fav-hint';
    const star = document.createElement('div');
    star.className = 'fav-hint-star';
    star.append(icon('star', true));
    const text = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = 'Pin your go-to apps here.';
    text.append(strong, ' Tap the star on any app, or in search, and it shows up at the top of Home.');
    const close = toolBtn(icon('close'), 'Hide this tip', () => { local.favHint = false; saveLocal(); render(); });
    close.className = 'fav-hint-close';
    box.append(star, text, close);
    return box;
  }

  /** Favorites row: an Arrange button, and in arrange mode move/remove controls plus drag to reorder. */
  function setupFavRow(sec, head, row) {
    if (row.children.length >= 2 || arranging) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'see-all arrange-btn';
      btn.textContent = arranging ? 'Done' : 'Arrange';
      btn.setAttribute('aria-pressed', String(arranging));
      btn.addEventListener('click', () => { arranging = !arranging; render(); });
      head.append(btn);
    }
    if (!arranging) return;
    sec.classList.add('arranging');
    row.classList.remove('two');
    const ids = () => local.pinned.filter((id) => row.querySelector(`.tile[data-id="${CSS.escape(id)}"]`));
    [...row.children].forEach((t, i, all) => {
      const id = t.dataset.id;
      const app = allApps().find((a) => a.id === id);
      t.removeAttribute('href');
      t.addEventListener('click', (e) => {
        if (e.target.closest('.arrange-tools')) return;
        e.preventDefault(); e.stopImmediatePropagation();
      }, true);
      t.querySelector('.tile-tools')?.remove();
      const ctl = document.createElement('div');
      ctl.className = 'arrange-tools';
      const left = toolBtn(icon('left'), `Move ${app.name} earlier`, () => moveFav(id, -1));
      const right = toolBtn(icon('right'), `Move ${app.name} later`, () => moveFav(id, 1));
      const rm = toolBtn(icon('close'), `Remove ${app.name} from favorites`, () => togglePin(id));
      left.disabled = i === 0;
      right.disabled = i === all.length - 1;
      rm.classList.add('rm');
      ctl.append(left, right, rm);
      t.append(ctl);
      // Drag to reorder (mouse); the arrow buttons cover touch and keyboard.
      t.draggable = true;
      t.addEventListener('dragstart', (e) => { t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); });
      t.addEventListener('dragend', () => { t.classList.remove('dragging'); row.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before')); });
      t.addEventListener('dragover', (e) => { e.preventDefault(); row.querySelectorAll('.drop-before').forEach((x) => x !== t && x.classList.remove('drop-before')); t.classList.add('drop-before'); });
      t.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData('text/plain');
        if (!from || from === id) return;
        const order = ids().filter((x) => x !== from);
        order.splice(order.indexOf(id), 0, from);
        local.pinned = [...order, ...local.pinned.filter((x) => !order.includes(x))];
        saveLocal();
        render();
      });
    });
  }

  function moveFav(id, dir) {
    const i = local.pinned.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= local.pinned.length) return;
    [local.pinned[i], local.pinned[j]] = [local.pinned[j], local.pinned[i]];
    saveLocal();
    render();
    const btn = document.querySelector(`.fav-shelf .tile[data-id="${CSS.escape(id)}"] .arrange-tools button:nth-child(${dir < 0 ? 1 : 2})`);
    (btn && !btn.disabled ? btn : document.querySelector(`.fav-shelf .tile[data-id="${CSS.escape(id)}"] .arrange-tools .rm`))?.focus();
  }

  window.addEventListener('resize', () => {
    document.querySelectorAll('.shelf-row').forEach((r) => r.dispatchEvent(new Event('scroll')));
  });

  function renderIntro(apps) {
    const h = new Date().getHours();
    $('#greeting').textContent = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const games = apps.filter((a) => a.category === 'Games').length;
    const fresh = apps.filter(isNew).length;
    $('#summary').textContent = `${apps.length} app${apps.length === 1 ? '' : 's'}` +
      (games ? `, ${games} of them games` : '') + (fresh ? `. ${fresh} new` : '') + '. Pick one and go.';
  }

  /** The big banner: the app you used last, else your first pin, else the first live app. */
  function renderHero(apps) {
    const hero = $('#hero');
    const l = local.launches;
    const recent = [...apps].sort((a, b) => (l[b.id]?.last || 0) - (l[a.id]?.last || 0))[0];
    const used = recent && l[recent.id];
    // A headline game ("featured": true in apps.json) takes the banner until you've played it once.
    const featured = apps.find((a) => a.featured && !l[a.id] && a.status !== 'archived');
    const app = featured || (used ? recent
      : apps.find((a) => local.pinned[0] === a.id) || apps.find((a) => a.status === 'live') || apps[0]);
    hero.hidden = !app || !!query || view !== 'Home';
    if (hero.hidden) return;
    hero.style.setProperty('--tile-color', app.color || '');
    $('#heroEyebrow').textContent = featured ? (isNew(featured) ? 'New game' : 'Featured') : used ? 'Jump back in' : 'Featured';
    $('#heroName').textContent = app.name;
    $('#heroDesc').textContent = app.description || '';
    setIcon($('#heroIcon'), app);
    const href = safeHref(app.url);
    const play = $('#heroPlay');
    play.href = href;
    play.onclick = (e) => launch(app, play, e);
    if (!app.embed && app.newTab !== false) { play.target = '_blank'; play.rel = 'noopener'; }
    else { play.removeAttribute('target'); play.removeAttribute('rel'); }
    $('#heroPlayLabel').textContent = ctaLabel(app);
    const tab = $('#heroTab');
    tab.href = href;
    tab.hidden = !app.embed;
  }

  function tiles() { return [...document.querySelectorAll('.tile')]; }

  function highlight() {
    const ts = tiles();
    selected = Math.max(0, Math.min(selected, ts.length - 1));
    ts.forEach((t, i) => t.classList.toggle('selected', !!query && i === selected));
  }

  // ---------- actions ----------
  function recordLaunch(id) {
    const prev = local.launches[id] || { count: 0 };
    local.launches[id] = { count: prev.count + 1, last: Date.now() };
    saveLocal();
    setTimeout(render, 300); // re-sort after the click has navigated
  }

  function togglePin(id) {
    const app = allApps().find((a) => a.id === id);
    const at = local.pinned.indexOf(id);
    if (at >= 0) {
      local.pinned = local.pinned.filter((p) => p !== id);
      toast(`Removed ${app?.name || 'app'} from favorites`, {
        label: 'Undo',
        run: () => { if (!local.pinned.includes(id)) { local.pinned.splice(at, 0, id); saveLocal(); render(); } },
      });
    } else {
      local.pinned = [...local.pinned, id];
      toast(`Pinned ${app?.name || 'app'} to Favorites`);
    }
    saveLocal();
    render();
    document.querySelectorAll(`.tile[data-id="${CSS.escape(id)}"] .tile-tools button:first-child, .spot-row[data-id="${CSS.escape(id)}"] .spot-star`)
      .forEach((b) => b.classList.add('popped'));
  }

  function clearSearch() { search.value = ''; query = ''; }

  $('#emptyBtn').addEventListener('click', () => {
    if (query) { clearSearch(); render(); }
    else if (view !== 'Home') go('Home');
    else boot();
  });

  $('#sort').addEventListener('change', (e) => { sort = e.target.value; saveView(); render(); });

  // ---------- editor ----------
  const dialog = $('#editor');
  const form = $('#editorForm');
  let editingId = null;

  // Edit-only: apps are added in apps.json, not from the UI.
  function openEditor(app) {
    if (!app) return;
    editingId = app.id;
    form.reset();
    const f = form.elements;
    f.name.value = app?.name ?? '';
    f.url.value = app?.url ?? '';
    f.description.value = app?.description ?? '';
    f.icon.value = app?.icon ?? '';
    f.color.value = /^#[0-9a-f]{6}$/i.test(app?.color ?? '') ? app.color : '#6366f1';
    f.category.value = app?.category ?? '';
    f.genre.value = app?.genre ?? '';
    f.status.value = app?.status ?? '';
    f.tags.value = (app?.tags ?? []).join(', ');
    f.embed.checked = !!app?.embed;
    f.newTab.checked = app?.newTab !== false;
    dialog.showModal();
    f.name.focus();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const id = editingId;
    if (!id) return;
    const app = {
      name: f.name.value.trim(),
      url: normalizeUrl(f.url.value),
      description: f.description.value.trim(),
      icon: f.icon.value.trim(),
      color: f.color.value,
      category: f.category.value.trim(),
      genre: f.genre.value.trim(),
      status: f.status.value,
      tags: f.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
      embed: f.embed.checked,
      newTab: f.newTab.checked,
    };
    local.overrides[id] = app;
    saveLocal();
    dialog.close();
    render();
    toast('Saved');
  });

  $('#cancelBtn').addEventListener('click', () => dialog.close());
  $('#deleteBtn').addEventListener('click', () => {
    if (!editingId || !confirm('Remove this app from the launcher?')) return;
    local.overrides[editingId] = null;
    local.pinned = local.pinned.filter((p) => p !== editingId);
    saveLocal();
    dialog.close();
    render();
    toast('Removed');
  });

  // ---------- menu: import / export / reset ----------
  const menu = $('#menu');
  const menuBtn = $('#menuBtn');
  function setMenu(open) { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); }
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

  menu.addEventListener('click', (e) => {
    const skin = e.target.closest('button')?.dataset.skin;
    if (skin) { setSkin(skin); return; }
    const action = e.target.closest('button')?.dataset.action;
    if (action === 'export') exportApps();
    if (action === 'import') $('#importFile').click();
    if (action === 'reset' && confirm('Discard all local edits, pins and history?')) {
      local = { overrides: {}, pinned: [], launches: {}, searches: [], favHint: true };
      saveLocal();
      render();
      toast('Local changes cleared');
    }
  });

  function exportApps() {
    const blob = new Blob([JSON.stringify({ apps: allApps() }, null, 2) + '\n'], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'apps.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Exported apps.json — commit it to share');
  }

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.apps;
      if (!Array.isArray(list)) throw new Error('Expected { "apps": [...] }');
      let n = 0;
      for (const app of list) {
        if (!app?.name || !app?.url) continue;
        local.overrides[app.id || slug(app.name)] = app;
        n++;
      }
      saveLocal();
      render();
      toast(`Imported ${n} app${n === 1 ? '' : 's'}`);
    } catch (err) {
      toast('Import failed: ' + err.message);
    }
  });

  // ---------- player (apps that run inside the launcher) ----------
  const player = $('#player');
  const frame = $('#playerFrame');
  const loading = $('#playerLoading');
  let playingId = null;
  let stuckTimer;

  // Cover the frame with the app's icon until it has actually loaded, so it never opens blank.
  function showLoading(app, href) {
    clearTimeout(stuckTimer);
    loading.classList.remove('done', 'stuck');
    loading.hidden = false;
    loading.style.setProperty('--tile-color', app.color || '');
    setIcon($('#playerLoadingIcon'), app);
    $('#playerLoadingText').textContent = `Loading ${app.name}…`;
    const open = $('#playerLoadingOpen');
    open.href = href;
    open.hidden = true;
    stuckTimer = setTimeout(() => {
      loading.classList.add('stuck');
      $('#playerLoadingText').textContent = isOffline() && needsNet(app)
        ? `${app.name} needs the internet. You’re offline.`
        : `${app.name} is taking a while.`;
      open.hidden = false;
    }, isOffline() && needsNet(app) ? 0 : 8000);
  }
  frame.addEventListener('load', () => {
    if (!playingId) return;
    clearTimeout(stuckTimer);
    loading.classList.add('done');
    setTimeout(() => { if (loading.classList.contains('done')) loading.hidden = true; }, 300);
  });

  function syncPlayer() {
    const m = location.hash.match(/^#\/play\/(.+)$/);
    const app = m && allApps().find((a) => a.id === decodeURIComponent(m[1]));
    const href = app ? safeHref(app.url) : '#';
    if (!app || href === '#') {
      if (playingId) { playingId = null; frame.src = 'about:blank'; clearTimeout(stuckTimer); loading.hidden = true; }
      player.hidden = true;
      document.body.classList.remove('playing');
      document.title = 'Launcher';
      return;
    }
    if (playingId !== app.id) { playingId = app.id; showLoading(app, href); frame.src = href; }
    $('#playerName').textContent = app.name;
    const icon = $('#playerIcon');
    icon.hidden = !isImage(app.icon);
    if (!icon.hidden) icon.src = app.icon;
    $('#playerOpen').href = href;
    player.hidden = false;
    document.body.classList.add('playing');
    document.title = app.name + ' · Launcher';
    frame.focus();
  }

  window.addEventListener('hashchange', syncPlayer);
  $('#playerBack').addEventListener('click', () => { location.hash = ''; });
  $('#playerFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else (player.requestFullscreen?.() || Promise.reject()).catch(() => toast('Full screen isn’t available here'));
  });

  // ---------- skins ----------
  const SKIN_KEY = 'launcher:skin';
  const SKINS = ['cards', 'springboard', 'poster', 'arcade', 'terminal'];

  function setSkin(skin, quiet) {
    if (!SKINS.includes(skin)) skin = 'cards';
    document.body.dataset.skin = skin;
    menu.querySelectorAll('[data-skin]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skin === skin)));
    try { localStorage.setItem(SKIN_KEY, skin); } catch { /* ignore */ }
    if (!quiet) toast(`Style: ${skin[0].toUpperCase()}${skin.slice(1)}`);
  }

  // ?skin=arcade in the URL wins (handy for sharing a look), then the saved choice.
  let initialSkin = new URLSearchParams(location.search).get('skin');
  if (!initialSkin) { try { initialSkin = localStorage.getItem(SKIN_KEY); } catch { /* ignore */ } }
  setSkin(initialSkin || 'cards', true);

  // ---------- instant search ----------
  const search = $('#search');
  const spot = $('#spot');
  const spotList = $('#spotList');
  const backdrop = $('#spotBackdrop');
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $('#modKey').textContent = isMac ? '⌘' : 'Ctrl';
  $('#searchKey').textContent = isMac ? '⌘K' : '/';
  const SPOT_APPS = 8;

  function openSpot() {
    if (spotOpen) return;
    spotOpen = true;
    spotSel = 0;
    spot.hidden = false;
    backdrop.hidden = false;
    $('#searchClose').hidden = false;
    document.body.classList.add('spot-open');
    search.setAttribute('aria-expanded', 'true');
    placeSpot();
    renderSpot();
  }
  function closeSpot({ clear = false, blur = true } = {}) {
    if (clear && (search.value || query)) { clearSearch(); render(); }
    if (!spotOpen) { if (blur) search.blur(); return; }
    spotOpen = false;
    spot.hidden = true;
    backdrop.hidden = true;
    $('#searchClose').hidden = true;
    document.body.classList.remove('spot-open');
    search.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    if (blur) search.blur();
  }
  // On phones the panel fills the screen under the header; it needs to know where that is.
  function placeSpot() {
    const r = $('#searchWrap').getBoundingClientRect();
    spot.style.setProperty('--spot-top', `${Math.round(r.bottom + 8)}px`);
  }
  window.addEventListener('resize', () => spotOpen && placeSpot());
  window.visualViewport?.addEventListener('resize', () => {
    document.documentElement.style.setProperty('--vvh', `${window.visualViewport.height}px`);
  });

  function rememberSearch(q) {
    q = q.trim();
    if (q.length < 2) return;
    local.searches = [q, ...(local.searches || []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    saveLocal();
  }

  /** Sections and game types whose name matches, as "go to" rows. */
  function placeMatches(apps, q) {
    const t = fold(q).trim();
    if (t.length < 2) return [];
    const out = [];
    const sections = ordered(apps.map((a) => a.category).filter(Boolean), SECTION_ORDER);
    for (const sec of sections) {
      if (fold(sec).includes(t)) out.push({ label: sec, sub: 'Section', n: apps.filter((a) => a.category === sec).length, go: () => go(sec) });
      const types = ordered(apps.filter((a) => a.category === sec && a.genre).map((a) => a.genre), GENRE_ORDER);
      for (const g of types) {
        if (fold(g).includes(t)) out.push({ label: g, sub: `${sec} type`, n: apps.filter((a) => a.category === sec && a.genre === g).length, go: () => go(sec, g) });
      }
    }
    return out.slice(0, 3);
  }

  function spotHeading(text, extra) {
    const h = document.createElement('div');
    h.className = 'spot-h';
    h.setAttribute('role', 'presentation');
    h.append(text);
    if (extra) h.append(extra);
    return h;
  }

  /** One app row: icon, highlighted name, where it lives, a star, and an open hint. */
  function spotRow(app, hl, top) {
    const a = document.createElement('a');
    a.className = 'spot-row' + (top ? ' top-hit' : '');
    a.href = safeHref(app.url);
    a.dataset.id = app.id;
    a.setAttribute('role', 'option');
    a.tabIndex = -1;
    if (!app.embed && app.newTab !== false) { a.target = '_blank'; a.rel = 'noopener'; }
    if (app.color) a.style.setProperty('--tile-color', app.color);
    if (needsNet(app)) a.classList.add('needs-net');
    const ico = document.createElement('div');
    ico.className = 'ico';
    setIcon(ico, app);
    const text = document.createElement('div');
    text.className = 'spot-text';
    const name = document.createElement('div');
    name.className = 'spot-name';
    highlightText(name, app.name, hl);
    const sub = document.createElement('div');
    sub.className = 'spot-sub';
    sub.textContent = top && app.description ? app.description
      : [app.genre, app.category].filter(Boolean).join(' · ') || 'App';
    text.append(name, sub);
    const badges = document.createElement('div');
    badges.className = 'spot-badges';
    if (isNew(app)) badges.append(badge('new', 'New'));
    else if (app.status && app.status !== 'live') badges.append(badge(app.status, STATUS[app.status] || app.status));
    const pinned = local.pinned.includes(app.id);
    const star = toolBtn(icon('star', pinned), pinned ? `Remove ${app.name} from favorites` : `Add ${app.name} to favorites`, () => togglePin(app.id), pinned);
    star.className = 'spot-star';
    star.tabIndex = -1;
    const go = document.createElement('span');
    go.className = 'spot-go';
    go.setAttribute('aria-hidden', 'true');
    go.append(ctaLabel(app), icon('arrow'));
    a.append(ico, text, badges, star, go);
    a.addEventListener('click', (e) => {
      if (e.target.closest('.spot-star')) return;
      rememberSearch(search.value);
      launch(app, a, e);
      if (isOffline() && needsNet(app)) return;
      closeSpot({ clear: true });
    });
    return a;
  }

  /** A row that isn't an app: go to a section, see all results, or a recent search. */
  function spotAction(ico, label, sub, run, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'spot-row spot-action' + (cls ? ' ' + cls : '');
    b.setAttribute('role', 'option');
    b.tabIndex = -1;
    const box = document.createElement('div');
    box.className = 'ico';
    box.append(icon(ico));
    const text = document.createElement('div');
    text.className = 'spot-text';
    const name = document.createElement('div');
    name.className = 'spot-name';
    name.textContent = label;
    text.append(name);
    if (sub) {
      const s2 = document.createElement('div');
      s2.className = 'spot-sub';
      s2.textContent = sub;
      text.append(s2);
    }
    b.append(box, text, icon('arrow'));
    b.addEventListener('click', run);
    return b;
  }

  function spotChip(label, run, ico) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip spot-chip';
    if (ico) b.append(icon(ico));
    b.append(label);
    b.addEventListener('click', run);
    return b;
  }

  function renderSpot() {
    const apps = allApps();
    const q = search.value.trim();
    const out = [];
    if (!q) {
      // Nothing typed yet: favorites, what you played last, recent searches, and places to browse.
      const favs = favApps(apps).slice(0, 6);
      if (favs.length) out.push(spotHeading('Favorites'), ...favs.map((a) => spotRow(a)));
      const l = local.launches;
      const recent = apps.filter((a) => l[a.id]?.last && !favs.includes(a))
        .sort((a, b) => l[b.id].last - l[a.id].last).slice(0, favs.length ? 3 : 5);
      if (recent.length) out.push(spotHeading('Recently played'), ...recent.map((a) => spotRow(a)));
      if (!favs.length && !recent.length) {
        out.push(spotHeading('Try'), ...sortApps(apps.filter(isNew), 'new').slice(0, 4).map((a) => spotRow(a)));
      }
      const searches = local.searches || [];
      if (searches.length) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'spot-clear';
        clear.textContent = 'Clear';
        clear.addEventListener('click', () => { local.searches = []; saveLocal(); renderSpot(); search.focus(); });
        const chips = document.createElement('div');
        chips.className = 'spot-chips';
        chips.append(...searches.map((x) => spotChip(x, () => { search.value = x; onInput(); search.focus(); }, 'clock')));
        out.push(spotHeading('Recent searches', clear), chips);
      }
      const sections = ordered(apps.map((a) => a.category).filter(Boolean), SECTION_ORDER);
      const genres = ordered(apps.filter((a) => a.category === 'Games' && a.genre).map((a) => a.genre), GENRE_ORDER);
      const chips = document.createElement('div');
      chips.className = 'spot-chips';
      chips.append(
        ...sections.map((sec) => spotChip(sec, () => { closeSpot({ clear: true }); go(sec); })),
        ...genres.map((g) => spotChip(g, () => { closeSpot({ clear: true }); go('Games', g); }))
      );
      out.push(spotHeading('Browse'), chips);
    } else {
      const results = searchApps(apps, q);
      const places = placeMatches(apps, q);
      if (results.length) {
        out.push(spotHeading('Top hit'), spotRow(results[0].app, results[0].hl, true));
        const more = results.slice(1, SPOT_APPS);
        if (more.length) out.push(spotHeading('Apps', countEl(results.length)), ...more.map((r) => spotRow(r.app, r.hl)));
      }
      if (places.length) {
        out.push(spotHeading('Go to'), ...places.map((p) => spotAction('grid', p.label, `${p.sub} · ${p.n} app${p.n === 1 ? '' : 's'}`,
          () => { closeSpot({ clear: true }); p.go(); })));
      }
      if (results.length > SPOT_APPS) {
        out.push(spotAction('search', `See all ${results.length} results`, 'As cards on the page', () => {
          rememberSearch(q); closeSpot(); window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 'see-all-row'));
      }
      if (!results.length && !places.length) {
        const none = document.createElement('div');
        none.className = 'spot-none';
        const p1 = document.createElement('p');
        p1.textContent = `Nothing matches “${q}”.`;
        const p2 = document.createElement('p');
        p2.textContent = 'Try a shorter word, or browse a section.';
        none.append(icon('search'), p1, p2);
        const chips = document.createElement('div');
        chips.className = 'spot-chips center';
        chips.append(...ordered(apps.map((a) => a.category).filter(Boolean), SECTION_ORDER)
          .map((sec) => spotChip(sec, () => { closeSpot({ clear: true }); go(sec); })));
        none.append(chips);
        out.push(none);
      }
    }
    spotList.replaceChildren(...out);
    const opts = spotOpts();
    opts.forEach((o, i) => {
      o.id = `spot-opt-${i}`;
      o.addEventListener('mousemove', () => { if (spotSel !== i) { spotSel = i; markSpot(false); } });
    });
    markSpot(false);
  }

  function countEl(n) {
    const c = document.createElement('span');
    c.className = 'count';
    c.textContent = n;
    return c;
  }

  const spotOpts = () => [...spotList.querySelectorAll('.spot-row')];
  function markSpot(scroll = true) {
    const opts = spotOpts();
    spotSel = Math.max(0, Math.min(spotSel, opts.length - 1));
    opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === spotSel)));
    const cur = opts[spotSel];
    if (cur) {
      search.setAttribute('aria-activedescendant', cur.id);
      if (scroll) cur.scrollIntoView({ block: 'nearest' });
    } else search.removeAttribute('aria-activedescendant');
  }

  function onInput() {
    query = search.value.trim();
    selected = 0;
    spotSel = 0;
    openSpot();
    render();
    spotList.scrollTop = 0;
  }
  search.addEventListener('input', onInput);
  search.addEventListener('focus', () => openSpot());
  search.addEventListener('click', () => openSpot());
  backdrop.addEventListener('click', () => closeSpot());
  $('#searchClose').addEventListener('click', () => closeSpot({ clear: true }));
  // Tapping a row on a phone shouldn't drop the keyboard first and make the list jump.
  spot.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });

  search.addEventListener('keydown', (e) => {
    const opts = spotOpts();
    if (e.key === 'ArrowDown') { e.preventDefault(); openSpot(); spotSel = (spotSel + 1) % Math.max(1, opts.length); markSpot(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spotSel = (spotSel - 1 + opts.length) % Math.max(1, opts.length); markSpot(); }
    else if (e.key === 'PageDown' || e.key === 'End') { if (spotOpen && opts.length) { e.preventDefault(); spotSel = opts.length - 1; markSpot(); } }
    else if (e.key === 'PageUp' || e.key === 'Home') { if (spotOpen && opts.length && !search.value) { e.preventDefault(); spotSel = 0; markSpot(); } }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (!spotOpen) { openSpot(); return; }
      const cur = spotOpts()[spotSel];
      if (!cur) return;
      const app = cur.dataset.id && allApps().find((a) => a.id === cur.dataset.id);
      if (app && (e.metaKey || e.ctrlKey) && safeHref(app.url) !== '#') {
        // Ctrl/⌘+Enter: open in a new tab and keep searching.
        if (isOffline() && needsNet(app)) { toast(`${app.name} needs the internet`); return; }
        rememberSearch(search.value);
        recordLaunch(app.id);
        window.open(safeHref(app.url), '_blank', 'noopener');
        return;
      }
      cur.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (search.value) { search.value = ''; onInput(); }
      else closeSpot();
    } else if (e.key === 'Tab' && spotOpen) {
      closeSpot({ blur: false });
    }
  });

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (dialog.open || !player.hidden) return;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      if (spotOpen && document.activeElement === search) { closeSpot(); return; }
      search.focus(); search.select(); openSpot();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'h') { clearSearch(); arranging = false; go('Home'); return; }
    if (e.key === 'g') { clearSearch(); go('Games'); return; }
    // F favorites the app you're on (focused tile or the hero).
    if (e.key === 'f') {
      const t = document.activeElement?.closest?.('.tile');
      if (t?.dataset.id) { e.preventDefault(); togglePin(t.dataset.id); document.querySelector(`.tile[data-id="${CSS.escape(t.dataset.id)}"]`)?.focus(); }
      return;
    }
    if (e.key === 'Escape' && arranging) { arranging = false; render(); return; }
    // Arrow keys walk the grid results after "See all results".
    if (query && (document.activeElement === document.body || document.activeElement?.classList.contains('tile'))) {
      const ts = tiles();
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); selected = Math.min(selected + 1, ts.length - 1); highlight(); ts[selected]?.focus(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); selected = Math.max(selected - 1, 0); highlight(); ts[selected]?.focus(); }
    }
  });

  // ---------- boot ----------
  const toApps = (data) => (data.apps || []).map((a) => ({ ...a, id: a.id || slug(a.name) }));
  let booted = false;

  async function boot() {
    // Show the last known app list right away; refresh it from the network behind the scenes.
    let cachedRaw = null;
    if (!booted) {
      try { cachedRaw = localStorage.getItem(APPS_CACHE_KEY); } catch { /* ignore */ }
      if (cachedRaw) {
        try { baseApps = toApps(JSON.parse(cachedRaw)); firstPaint(); } catch { cachedRaw = null; }
      }
    }
    try {
      const res = await fetch('apps.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const raw = await res.text();
      if (raw !== cachedRaw || !booted) {
        baseApps = toApps(JSON.parse(raw));
        try { localStorage.setItem(APPS_CACHE_KEY, raw); } catch { /* ignore */ }
        booted ? render() : firstPaint();
      }
    } catch {
      if (!booted) firstPaint();
      if (!cachedRaw) toast(isOffline() ? 'You’re offline' : 'Couldn’t load apps.json');
    }
  }

  function firstPaint() {
    render();
    if (booted) return;
    booted = true;
    syncPlayer();
    // Cards rise in once on load, not on every search keystroke.
    setTimeout(() => document.body.classList.add('settled'), 900);
  }

  // ---------- offline ----------
  function syncOnline(announce) {
    const off = isOffline();
    document.body.classList.toggle('offline', off);
    $('#offline').hidden = !off;
    if (announce) toast(off ? 'You’re offline. Built-in apps still work.' : 'Back online');
  }
  window.addEventListener('online', () => { syncOnline(true); boot(); });
  window.addEventListener('offline', () => syncOnline(true));
  syncOnline(false);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  boot();
})();
