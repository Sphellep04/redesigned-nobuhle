/* Site editor: edits data/content.json through api.php. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('[data-app]');
  const csrf = app.dataset.csrf;
  let content = null;
  let dirty = false;

  // ---------- api ----------
  async function api(action, { body, form } = {}) {
    const opts = { method: body || form ? 'POST' : 'GET', headers: { 'X-CSRF-Token': csrf }, credentials: 'same-origin' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (form) opts.body = form;
    const res = await fetch(`api.php?action=${action}`, opts);
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    if (res.status === 401) { window.location.reload(); throw new Error(data.error || 'Log in again.'); }
    if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}). Try again.`);
    return data;
  }

  let toastTimer;
  function toast(text, isError = false) {
    const t = $('[data-toast]');
    t.textContent = text;
    t.classList.toggle('error', isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 5000 : 2600);
  }

  function setDirty(v = true) {
    dirty = v;
    $('[data-save]').disabled = !v;
    $('[data-save-status]').textContent = v ? 'You have unsaved changes' : 'All changes saved';
    $('[data-savebar]').classList.toggle('is-dirty', v);
  }
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  const money = (n) => (Number(n) > 0 ? 'N$ ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 2 }) : 'Price on request');
  const preview = (src) => (src ? `<img src="../${src}" alt="">` : '<span class="ph">No photo</span>');

  // ---------- tabs ----------
  function showTab(name) {
    $$('[role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    try { sessionStorage.setItem('nonhle-admin-tab', name); } catch { /* ignore */ }
  }
  $$('[role="tab"]').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---------- products & services ----------
  const blank = {
    products: { id: '', name: 'New product', price: 0, soldOut: false, size: '', summary: '', description: '', ingredients: '', usage: '', image: '' },
    services: { id: '', name: 'New service', price: 0, priceFrom: true, duration: '', description: '' },
  };

  function renderList(kind) {
    const list = $(`[data-list="${kind}"]`);
    const tpl = $(kind === 'products' ? '#product-tpl' : '#service-tpl');
    const openIds = new Set($$('details[open]', list).map((d) => d.dataset.index));
    list.innerHTML = '';
    if (!content[kind].length) {
      list.innerHTML = `<p class="muted empty">No ${kind} yet. Select "Add ${kind === 'products' ? 'product' : 'service'}" to create one.</p>`;
      return;
    }
    content[kind].forEach((item, i) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.index = i;
      if (openIds.has(String(i))) node.open = true;
      $$('[data-f]', node).forEach((input) => {
        const f = input.dataset.f;
        if (input.type === 'checkbox') input.checked = !!item[f];
        else input.value = item[f] ?? '';
      });
      updateSummary(kind, node, item);
      list.append(node);
    });
  }

  function updateSummary(kind, node, item) {
    $('[data-title]', node).textContent = item.name || 'Untitled';
    $('[data-sub]', node).textContent = kind === 'services'
      ? [money(item.price) + (item.priceFrom && item.price > 0 ? ' (from)' : ''), item.duration].filter(Boolean).join(' · ')
      : [money(item.price), item.soldOut ? 'Sold out' : '', item.image ? '' : 'No photo yet'].filter(Boolean).join(' · ');
    const thumb = $('[data-thumb]', node);
    if (thumb) thumb.innerHTML = item.image ? `<img src="../${item.image}" alt="">` : '';
    const prev = $('[data-preview]', node);
    if (prev) prev.innerHTML = preview(item.image);
    const rm = $('[data-remove-photo]', node);
    if (rm) rm.hidden = !item.image;
  }

  ['products', 'services'].forEach((kind) => {
    const list = $(`[data-list="${kind}"]`);

    list.addEventListener('input', (e) => {
      const input = e.target.closest('[data-f]');
      if (!input) return;
      const node = input.closest('[data-index]');
      const item = content[kind][node.dataset.index];
      const f = input.dataset.f;
      item[f] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value || 0) : input.value;
      updateSummary(kind, node, item);
      setDirty();
    });

    list.addEventListener('click', (e) => {
      const node = e.target.closest('[data-index]');
      if (!node) return;
      const i = Number(node.dataset.index);
      const items = content[kind];
      if (e.target.closest('[data-delete]')) {
        if (!confirm(`Delete "${items[i].name}"? It will be removed from the site when you save.`)) return;
        items.splice(i, 1);
        renderList(kind);
        setDirty();
      }
      const mv = e.target.closest('[data-move]');
      if (mv) {
        const j = i + Number(mv.dataset.move);
        if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]];
        renderList(kind);
        setDirty();
      }
      if (e.target.closest('[data-remove-photo]')) {
        items[i].image = '';
        updateSummary(kind, node, items[i]);
        setDirty();
      }
    });

    list.addEventListener('change', async (e) => {
      const input = e.target.closest('[data-photo]');
      if (!input || !input.files[0]) return;
      const node = input.closest('[data-index]');
      const item = content[kind][node.dataset.index];
      const fd = new FormData();
      fd.append('file', input.files[0]);
      fd.append('kind', item.name || 'product');
      $('[data-preview]', node).innerHTML = '<span class="ph">Uploading…</span>';
      try {
        const res = await api('upload', { form: fd });
        item.image = res.src;
        setDirty();
        toast('Photo uploaded. Save changes to publish it.');
      } catch (err) {
        toast(err.message, true);
      }
      updateSummary(kind, node, item);
      input.value = '';
    });
  });

  $$('[data-add]').forEach((btn) => btn.addEventListener('click', () => {
    const kind = btn.dataset.add;
    content[kind].push({ ...blank[kind] });
    renderList(kind);
    const last = $(`[data-list="${kind}"] details:last-child`);
    last.open = true;
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('[data-f="name"]', last).select();
    setDirty();
  }));

  // ---------- gallery ----------
  function renderGallery() {
    const grid = $('[data-list="gallery"]');
    if (!content.gallery.length) {
      grid.innerHTML = '<p class="muted empty">No photos yet. Add some above and they\'ll appear in the gallery on the site.</p>';
      return;
    }
    grid.innerHTML = content.gallery.map((g, i) => `
      <figure class="g-item" data-gi="${i}">
        <img src="../${g.src}" alt="">
        <input data-caption value="${(g.caption || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" placeholder="Caption (optional)" aria-label="Caption for photo ${i + 1}" maxlength="140">
        <div class="g-actions">
          <button class="link" type="button" data-gmove="-1" aria-label="Move photo ${i + 1} earlier">←</button>
          <button class="link" type="button" data-gmove="1" aria-label="Move photo ${i + 1} later">→</button>
          <button class="link danger" type="button" data-gdel>Delete</button>
        </div>
      </figure>`).join('');
  }

  const galleryGrid = $('[data-list="gallery"]');
  galleryGrid.addEventListener('input', (e) => {
    const cap = e.target.closest('[data-caption]');
    if (!cap) return;
    content.gallery[cap.closest('[data-gi]').dataset.gi].caption = cap.value;
    setDirty();
  });
  galleryGrid.addEventListener('click', (e) => {
    const fig = e.target.closest('[data-gi]');
    if (!fig) return;
    const i = Number(fig.dataset.gi);
    if (e.target.closest('[data-gdel]')) {
      if (!confirm('Delete this photo? It will be removed from the site when you save.')) return;
      content.gallery.splice(i, 1);
      renderGallery();
      setDirty();
    }
    const mv = e.target.closest('[data-gmove]');
    if (mv) {
      const j = i + Number(mv.dataset.gmove);
      if (j < 0 || j >= content.gallery.length) return;
      [content.gallery[i], content.gallery[j]] = [content.gallery[j], content.gallery[i]];
      renderGallery();
      setDirty();
    }
  });

  async function uploadGallery(files) {
    const list = [...files].filter((f) => /^image\//.test(f.type));
    if (!list.length) return;
    let done = 0;
    for (const file of list) {
      toast(`Uploading ${++done} of ${list.length}…`);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'gallery');
      try {
        const res = await api('upload', { form: fd });
        content.gallery.unshift({ src: res.src, caption: '', w: res.w, h: res.h });
        renderGallery();
        setDirty();
      } catch (err) {
        toast(`${file.name}: ${err.message}`, true);
        return;
      }
    }
    toast(`${list.length} photo${list.length > 1 ? 's' : ''} added. Save changes to publish.`);
  }
  const drop = $('[data-drop]');
  $('[data-gallery-input]').addEventListener('change', (e) => { uploadGallery(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); uploadGallery(e.dataTransfer.files); });

  // ---------- settings ----------
  const settingsBox = $('[data-settings]');
  function renderSettings() {
    $$('input', settingsBox).forEach((i) => { i.value = content.settings[i.name] || ''; });
  }
  settingsBox.addEventListener('input', (e) => {
    content.settings[e.target.name] = e.target.value;
    setDirty();
  });

  $('[data-password-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('password', { body: { current: f.current.value, new: f.new.value } });
      f.reset();
      toast('Password changed.');
    } catch (err) {
      toast(err.message, true);
    }
  });

  // ---------- save / load ----------
  async function save() {
    const btn = $('[data-save]');
    const problems = ['products', 'services'].flatMap((k) => content[k].filter((x) => !String(x.name || '').trim()).map(() => k));
    if (problems.length) { toast('Every product and service needs a name.', true); return; }
    btn.disabled = true;
    $('[data-save-status]').textContent = 'Saving…';
    try {
      const res = await api('save', { body: { content } });
      content = res.content;
      renderAll();
      setDirty(false);
      toast('Saved. Your changes are live on the site.');
    } catch (err) {
      toast(err.message, true);
      setDirty(true);
    }
  }
  $('[data-save]').addEventListener('click', save);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) save(); }
  });

  $('[data-logout]').addEventListener('click', async () => {
    if (dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
    dirty = false;
    try { await api('logout', { body: {} }); } catch { /* already logged out */ }
    window.location.href = './';
  });

  function renderAll() {
    renderList('products');
    renderList('services');
    renderGallery();
    renderSettings();
  }

  (async () => {
    try {
      const data = await api('content');
      content = Object.assign({ settings: {}, products: [], services: [], gallery: [] }, data.content);
      $('[data-loading]').remove();
      renderAll();
      let tab = 'products';
      try { tab = sessionStorage.getItem('nonhle-admin-tab') || tab; } catch { /* ignore */ }
      showTab(tab);
    } catch (err) {
      $('[data-loading]').textContent = err.message;
    }
  })();
})();
