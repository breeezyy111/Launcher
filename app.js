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

  // ---------- rendering ----------
  function tile(app) {
    const a = document.createElement('a');
    a.className = 'tile';
    a.href = safeHref(app.url);
    a.dataset.id = app.id;
    if (app.newTab !== false) { a.target = '_blank'; a.rel = 'noopener'; }
    if (app.color) a.style.setProperty('--tile-color', app.color);

    const ico = document.createElement('div');
    ico.className = 'ico';
    if (isImage(app.icon)) {
      const img = document.createElement('img');
      img.src = app.icon; img.alt = ''; img.loading = 'lazy';
      ico.append(img);
    } else {
      ico.textContent = app.icon || app.name.slice(0, 1).toUpperCase();
    }

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
    if (app.status) meta.append(badge(app.status, { live: 'Live', beta: 'Beta', dev: 'In dev', archived: 'Archived' }[app.status] || app.status));
    if (app.category) meta.append(badge('', app.category));
    a.append(meta);

    const tools = document.createElement('div');
    tools.className = 'tile-tools';
    const pinned = local.pinned.includes(app.id);
    tools.append(
      toolBtn(pinned ? '★' : '☆', pinned ? 'Unpin' : 'Pin', () => togglePin(app.id), pinned),
      toolBtn('✎', 'Edit', () => openEditor(app))
    );
    a.append(tools);

    a.addEventListener('click', () => recordLaunch(app.id));
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
    b.textContent = label;
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
      b.textContent = c;
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
    $('#allTitle').hidden = rest.length === 0 && pinned.length > 0;
    $('#allTitle').textContent = pinned.length ? 'Everything else' : 'All apps';
    $('#empty').hidden = visible.length > 0;

    highlight();
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

  function openEditor(app) {
    editingId = app?.id ?? null;
    $('#editorTitle').textContent = app ? 'Edit app' : 'Add app';
    $('#deleteBtn').hidden = !app;
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
    f.newTab.checked = app?.newTab !== false;
    dialog.showModal();
    f.name.focus();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const existing = new Set(allApps().map((a) => a.id));
    let id = editingId;
    if (!id) {
      id = slug(f.name.value);
      for (let n = 2; existing.has(id); n++) id = `${slug(f.name.value)}-${n}`;
    }
    const app = {
      name: f.name.value.trim(),
      url: normalizeUrl(f.url.value),
      description: f.description.value.trim(),
      icon: f.icon.value.trim(),
      color: f.color.value,
      category: f.category.value.trim(),
      status: f.status.value,
      tags: f.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
      newTab: f.newTab.checked,
    };
    local.overrides[id] = app;
    saveLocal();
    dialog.close();
    render();
    toast(editingId ? 'Saved' : `Added ${app.name}`);
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
  $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', () => { menu.hidden = true; });

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
    if (dialog.open) return;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (e.key === '/' && !typing) { e.preventDefault(); search.focus(); search.select(); return; }
    if (e.target !== search) return;
    const ts = tiles();
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); selected = Math.min(selected + 1, ts.length - 1); highlight(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); selected = Math.max(selected - 1, 0); highlight(); }
    else if (e.key === 'Enter' && ts[selected]) { e.preventDefault(); ts[selected].click(); }
    else if (e.key === 'Escape') { search.value = ''; query = ''; render(); }
  });

  $('#addBtn').addEventListener('click', () => openEditor(null));
  $('#emptyAdd').addEventListener('click', () => openEditor(null));

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
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  boot();
})();
