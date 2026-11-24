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
    const empty = { overrides: {}, pinned: [], launches: {} };
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

  function matches(app, q) {
    if (!q) return true;
    const hay = [app.name, app.description, app.category, app.genre, app.url, ...(app.tags || [])].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every((term) => hay.includes(term));
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
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
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
    name.textContent = app.name;
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
      const visible = sortApps(apps.filter((a) => matches(a, query) &&
        (query || (inView(a) && (genre === 'All' || a.genre === genre)))), query ? 'recent' : sort);
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
  }

  /** Home: a row per shelf. Recently played, favorites and new first, then each type and section. */
  function renderShelves(apps, sections) {
    const l = local.launches;
    const shelves = [];
    const recent = apps.filter((a) => l[a.id]?.last).sort((a, b) => l[b.id].last - l[a.id].last).slice(0, 12);
    if (recent.length) shelves.push({ title: 'Recently played', apps: recent, see: () => { sort = 'recent'; go('All'); } });
    const favs = local.pinned.map((id) => apps.find((a) => a.id === id)).filter(Boolean);
    if (favs.length) shelves.push({ title: 'Favorites', apps: favs, star: true });
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
    const app = used ? recent
      : apps.find((a) => local.pinned[0] === a.id) || apps.find((a) => a.status === 'live') || apps[0];
    hero.hidden = !app || !!query || view !== 'Home';
    if (hero.hidden) return;
    hero.style.setProperty('--tile-color', app.color || '');
    $('#heroEyebrow').textContent = used ? 'Jump back in' : 'Featured';
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
    local.pinned = local.pinned.includes(id) ? local.pinned.filter((p) => p !== id) : [...local.pinned, id];
    saveLocal();
    render();
    document.querySelector(`.tile[data-id="${CSS.escape(id)}"] .tile-tools button`)?.classList.add('popped');
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
      local = { overrides: {}, pinned: [], launches: {} };
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

  // ---------- search + keyboard ----------
  const search = $('#search');
  search.addEventListener('input', () => { query = search.value.trim(); selected = 0; render(); });

  document.addEventListener('keydown', (e) => {
    if (dialog.open || !player.hidden) return;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); search.focus(); search.select(); return; }
    if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'h') { clearSearch(); go('Home'); return; }
      if (e.key === 'g') { clearSearch(); go('Games'); return; }
    }
    if (e.target !== search) return;
    const ts = tiles();
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); selected = Math.min(selected + 1, ts.length - 1); highlight(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); selected = Math.max(selected - 1, 0); highlight(); }
    else if (e.key === 'Enter' && ts[selected]) { e.preventDefault(); ts[selected].click(); }
    else if (e.key === 'Escape') { search.value = ''; query = ''; render(); }
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
