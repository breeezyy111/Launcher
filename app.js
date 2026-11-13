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
  const $ = (sel) => document.querySelector(sel);

  // ---------- state ----------
  let baseApps = [];
  let local = loadLocal();
  let query = '';
  let category = 'All';
  let selected = 0;

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

  function matches(app, q) {
    if (!q) return true;
    const hay = [app.name, app.description, app.category, app.url, ...(app.tags || [])].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every((term) => hay.includes(term));
  }

  function sortApps(apps) {
    const l = local.launches;
    return apps.sort((a, b) =>
      ((l[b.id]?.last || 0) - (l[a.id]?.last || 0)) || a.name.localeCompare(b.name)
    );
  }

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
  };
  function icon(name, fill) {
    const span = document.createElement('span');
    span.innerHTML = `<svg class="i${fill ? ' fill' : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
    return span.firstChild;
  }

  const STATUS = { live: 'Live', beta: 'Beta', dev: 'In dev', archived: 'Archived' };
  const ctaLabel = (app) => (appLink(app) ? 'Launch' : app.embed ? (/game/i.test(app.category || '') ? 'Play' : 'Open') : 'Visit');

  // "appLink" opens an installed desktop/phone app through its own link scheme (e.g. roblox://).
  // Web and script schemes are refused; "url" is the fallback page when the app isn't installed.
  function appLink(app) {
    const m = /^([a-z][a-z0-9+.-]*):/i.exec(app.appLink || '');
    return m && !['http', 'https', 'javascript', 'data', 'vbscript', 'file', 'blob', 'about'].includes(m[1].toLowerCase()) ? app.appLink : null;
  }

  function openNativeApp(app, link) {
    let left = false;
    const away = () => { left = true; };
    const onVis = () => { if (document.hidden) left = true; };
    window.addEventListener('blur', away);
    window.addEventListener('pagehide', away);
    document.addEventListener('visibilitychange', onVis);
    location.href = link;
    setTimeout(() => {
      window.removeEventListener('blur', away);
      window.removeEventListener('pagehide', away);
      document.removeEventListener('visibilitychange', onVis);
      if (left) return;
      // Nothing took over the screen, so the app probably isn't installed: offer the download page.
      const fallback = safeHref(app.url);
      if (fallback === '#') return;
      const w = window.open(fallback, '_blank', 'noopener');
      if (!w) toast(`${app.name} isn't installed? Get it from ${new URL(fallback).host}`);
    }, 2500);
  }

  function launch(app, el, e) {
    recordLaunch(app.id);
    const link = appLink(app);
    if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      openNativeApp(app, link);
      return;
    }
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
    if (app.status) meta.append(badge(app.status, STATUS[app.status] || app.status));
    if (app.category) meta.append(badge('', app.category));
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
      toolBtn(icon('star', pinned), pinned ? 'Unpin' : 'Pin', () => togglePin(app.id), pinned),
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

  function render() {
    const apps = allApps();

    // Category chips
    const cats = ['All', ...new Set(apps.map((a) => a.category).filter(Boolean).sort())];
    if (!cats.includes(category)) category = 'All';
    const filters = $('#filters');
    filters.replaceChildren(...cats.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      const n = c === 'All' ? apps.length : apps.filter((a) => a.category === c).length;
      const count = document.createElement('span');
      count.className = 'chip-count';
      count.textContent = n;
      b.append(c, count);
      b.setAttribute('aria-pressed', String(c === category));
      b.addEventListener('click', () => { category = c; selected = 0; render(); });
      return b;
    }));
    filters.hidden = cats.length <= 2;
    $('#categoryList').replaceChildren(...cats.slice(1).map((c) => Object.assign(document.createElement('option'), { value: c })));

    const visible = sortApps(apps.filter((a) => matches(a, query) && (category === 'All' || a.category === category)));
    const pinned = visible.filter((a) => local.pinned.includes(a.id))
      .sort((a, b) => local.pinned.indexOf(a.id) - local.pinned.indexOf(b.id));
    const rest = visible.filter((a) => !local.pinned.includes(a.id));

    $('#pinnedSection').hidden = pinned.length === 0;
    $('#pinned').replaceChildren(...pinned.map(tile));
    $('#grid').replaceChildren(...rest.map(tile));
    $('#allTitle').parentElement.hidden = rest.length === 0 && pinned.length > 0;
    $('#allTitle').textContent = pinned.length ? 'Everything else' : (category === 'All' ? 'All apps' : category);
    $('#allCount').textContent = rest.length || '';
    $('#empty').hidden = visible.length > 0;
    tiles().forEach((t, i) => t.style.setProperty('--i', i));

    renderIntro(apps);
    renderHero(apps);
    highlight();
  }

  function renderIntro(apps) {
    const h = new Date().getHours();
    $('#greeting').textContent = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const live = apps.filter((a) => a.status === 'live').length;
    $('#summary').textContent = `${apps.length} app${apps.length === 1 ? '' : 's'}` + (live ? `, ${live} live` : '') + '. Pick one and go.';
  }

  /** The big banner: the app you used last, else your first pin, else the first live app. */
  function renderHero(apps) {
    const hero = $('#hero');
    const l = local.launches;
    const recent = [...apps].sort((a, b) => (l[b.id]?.last || 0) - (l[a.id]?.last || 0))[0];
    const used = recent && l[recent.id];
    const app = used ? recent
      : apps.find((a) => local.pinned[0] === a.id) || apps.find((a) => a.status === 'live') || apps[0];
    hero.hidden = !app || !!query || category !== 'All';
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
  }

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
    f.category.value = app?.category ?? (category !== 'All' ? category : '');
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
  let playingId = null;

  function syncPlayer() {
    const m = location.hash.match(/^#\/play\/(.+)$/);
    const app = m && allApps().find((a) => a.id === decodeURIComponent(m[1]));
    const href = app ? safeHref(app.url) : '#';
    if (!app || href === '#') {
      if (playingId) { frame.src = 'about:blank'; playingId = null; }
      player.hidden = true;
      document.body.classList.remove('playing');
      document.title = 'Launcher';
      return;
    }
    if (playingId !== app.id) { frame.src = href; playingId = app.id; }
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
    if (e.key === '/' && !typing) { e.preventDefault(); search.focus(); search.select(); return; }
    if (e.target !== search) return;
    const ts = tiles();
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); selected = Math.min(selected + 1, ts.length - 1); highlight(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); selected = Math.max(selected - 1, 0); highlight(); }
    else if (e.key === 'Enter' && ts[selected]) { e.preventDefault(); ts[selected].click(); }
    else if (e.key === 'Escape') { search.value = ''; query = ''; render(); }
  });

  // ---------- boot ----------
  async function boot() {
    try {
      const res = await fetch('apps.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      baseApps = (data.apps || []).map((a) => ({ ...a, id: a.id || slug(a.name) }));
    } catch {
      baseApps = [];
      toast('Couldn’t load apps.json — showing local apps only');
    }
    render();
    syncPlayer();
    // Cards rise in once on load, not on every search keystroke.
    setTimeout(() => document.body.classList.add('settled'), 900);
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  boot();
})();
