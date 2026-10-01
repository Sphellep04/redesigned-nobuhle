/* Nonhle's Cosmetics: front-end behaviour.
   Content (products, services, gallery, contact details) comes from data/content.json,
   which the admin panel edits. Orders and bookings are sent as WhatsApp messages. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const BASKET_KEY = 'nonhle-basket-v1';
  const state = {
    settings: { whatsapp: '264811685043', email: 'nonhle@nonhle-cosmetics.store' },
    products: [],
    services: [],
    gallery: [],
    basket: loadBasket(),
    pm: null,          // product open in the detail dialog
    pmQty: 1,
    lbIndex: 0,
  };

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // N$ 1,250 / N$ 99.50 (en-ZA gives a comma decimal in some browsers)
  const money = (n) => 'N$ ' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const hasPrice = (item) => Number(item.price) > 0;
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const safeSrc = (src) => (/^(uploads\/|assets\/)[\w\-./]+$/.test(src || '') ? src : '');
  const glyph = '<svg aria-hidden="true"><use href="#glyph"/></svg>';
  const media = (src, alt, extra = '') =>
    safeSrc(src) ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" ${extra}>` : `<div class="ph">${glyph}</div>`;

  function whatsapp(message) {
    const url = `https://wa.me/${digits(state.settings.whatsapp)}?text=${encodeURIComponent(message)}`;
    // Not window.open(..., 'noopener'): that always returns null, which would also send this tab away.
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
    else window.location.href = url;  // pop-up blocked: go there in this tab instead
    return url;
  }

  let toastTimer;
  function toast(text) {
    const el = $('[data-toast]');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---------- dialogs ----------
  let lastFocus = null;
  function openDialog(dlg) {
    lastFocus = document.activeElement;
    dlg.showModal();
    document.body.classList.add('has-dialog');
  }
  function closeDialog(dlg) { if (dlg.open) dlg.close(); }
  $$('dialog').forEach((dlg) => {
    dlg.addEventListener('close', () => {
      if (!$$('dialog').some((d) => d.open)) document.body.classList.remove('has-dialog');
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    });
    // Click on the backdrop (the dialog element itself, outside its content box) closes it.
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside || dlg.classList.contains('lightbox')) closeDialog(dlg);
    });
    $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => closeDialog(dlg)));
  });

  // ---------- content ----------
  async function loadContent() {
    try {
      const res = await fetch('data/content.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      Object.assign(state.settings, data.settings || {});
      state.products = Array.isArray(data.products) ? data.products : [];
      state.services = Array.isArray(data.services) ? data.services : [];
      state.gallery = Array.isArray(data.gallery) ? data.gallery : [];
    } catch (err) {
      console.error('Could not load content.json', err);
      $('[data-products]').innerHTML = '<p class="loading">Products couldn\'t load. Refresh the page, or message us on WhatsApp to order.</p>';
      $('[data-services]').innerHTML = '<li class="loading">Services couldn\'t load. Refresh the page, or message us on WhatsApp to book.</li>';
      return false;
    }
    return true;
  }

  function applySettings() {
    const s = state.settings;
    const wa = digits(s.whatsapp);
    const waDisplay = wa.startsWith('264') ? `+264 ${wa.slice(3, 5)} ${wa.slice(5, 8)} ${wa.slice(8)}` : '+' + wa;
    $$('[data-setting-link="whatsapp"]').forEach((a) => {
      a.href = `https://wa.me/${wa}`;
      if (!a.classList.contains('wa-float')) a.textContent = a.closest('.footer-contact') ? `WhatsApp ${waDisplay}` : waDisplay;
    });
    $$('[data-setting-link="email"]').forEach((a) => {
      if (s.email) { a.href = `mailto:${s.email}`; a.textContent = s.email; }
      (a.closest('[data-setting-row]') || a).hidden = !s.email;
    });
    ['hours', 'location'].forEach((k) => {
      const row = $(`[data-setting-row="${k}"]`);
      if (s[k]) { $(`[data-setting="${k}"]`).textContent = s[k]; row.hidden = false; }
    });
    if (s.instagram) {
      const handle = String(s.instagram).replace(/^@|^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
      $$('[data-setting-link="instagram"]').forEach((a) => {
        a.href = `https://instagram.com/${encodeURIComponent(handle)}`;
        a.textContent = a.closest('.footer-contact') ? `Instagram @${handle}` : '@' + handle;
        a.hidden = false;
      });
      $('[data-setting-row="instagram"]').hidden = false;
    }
  }

  // ---------- products ----------
  function priceHtml(p) {
    return hasPrice(p) ? `<span class="price">${money(p.price)}</span>` : '<span class="price-request">Price on request</span>';
  }

  function renderProducts() {
    const grid = $('[data-products]');
    if (!state.products.length) {
      grid.innerHTML = '<p class="loading">New products are on the way. Message us on WhatsApp to ask what\'s available.</p>';
      return;
    }
    grid.innerHTML = state.products.map((p) => `
      <article class="product${p.soldOut ? ' is-sold-out' : ''}" data-id="${esc(p.id)}">
        <button class="product-media" type="button" data-view="${esc(p.id)}" aria-label="View ${esc(p.name)}" tabindex="-1">
          ${media(p.image, p.name)}
          ${p.soldOut ? '<span class="badge">Sold out</span>' : ''}
        </button>
        <h3><button type="button" data-view="${esc(p.id)}">${esc(p.name)}</button></h3>
        <p class="product-summary">${esc(p.summary)}</p>
        <div class="product-foot">
          ${priceHtml(p)}
          ${p.soldOut
            ? '<button class="add-btn" type="button" disabled>Sold out</button>'
            : `<button class="add-btn" type="button" data-add="${esc(p.id)}">Add to basket</button>`}
        </div>
      </article>`).join('');

    // Missing image files fall back to the placeholder instead of a broken icon.
    $$('img', grid).forEach((img) => img.addEventListener('error', () => { img.outerHTML = `<div class="ph">${glyph}</div>`; }, { once: true }));

    // Routine step links point at products by id.
    $$('[data-product-link]').forEach((btn) => {
      const p = findProduct(btn.dataset.productLink);
      btn.textContent = p ? `View ${p.name} →` : '';
    });
  }

  // Structured data so search engines can show product names and prices.
  // Google only accepts Product markup with an offer, so unpriced products are left out.
  function addProductSchema() {
    const priced = state.products.filter(hasPrice);
    $('#product-schema')?.remove();
    if (!priced.length) return;
    const abs = (src) => new URL(src, document.baseURI).href;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: priced.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.name,
          description: p.description || p.summary || undefined,
          image: safeSrc(p.image) ? abs(p.image) : undefined,
          brand: { '@type': 'Brand', name: "Nonhle's Cosmetics" },
          offers: {
            '@type': 'Offer',
            price: Number(p.price).toFixed(2),
            priceCurrency: 'NAD',
            availability: p.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
            url: abs('#shop'),
          },
        },
      })),
    };
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = 'product-schema';
    s.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    document.head.append(s);
  }

  const findProduct = (id) => state.products.find((p) => p.id === id);

  function openProduct(id) {
    const p = findProduct(id);
    if (!p) return;
    state.pm = p;
    state.pmQty = 1;
    const dlg = $('[data-product-modal]');
    $('[data-pm-media]', dlg).innerHTML = media(p.image, p.name);
    $('[data-pm-title]', dlg).textContent = p.name;
    $('[data-pm-price]', dlg).textContent = hasPrice(p) ? money(p.price) : 'Price on request';
    $('[data-pm-size]', dlg).textContent = p.size || '';
    $('[data-pm-desc]', dlg).textContent = p.description || p.summary || '';
    $('[data-pm-ingredients]', dlg).textContent = p.ingredients || '';
    $('[data-pm-ingredients-wrap]', dlg).hidden = !p.ingredients;
    $('[data-pm-usage]', dlg).textContent = p.usage || '';
    $('[data-pm-usage-wrap]', dlg).hidden = !p.usage;
    $('[data-pm-qty]', dlg).textContent = '1';
    $('.qty', dlg).hidden = !!p.soldOut;
    const addBtn = $('[data-pm-add]', dlg);
    addBtn.disabled = !!p.soldOut;
    addBtn.textContent = p.soldOut ? 'Sold out' : 'Add to basket';
    openDialog(dlg);
  }

  $('[data-product-modal]').addEventListener('click', (e) => {
    const q = e.target.closest('[data-qty]');
    if (q) {
      state.pmQty = Math.min(99, Math.max(1, state.pmQty + Number(q.dataset.qty)));
      $('[data-pm-qty]').textContent = state.pmQty;
    }
    if (e.target.closest('[data-pm-add]') && state.pm && !state.pm.soldOut) {
      addToBasket(state.pm.id, state.pmQty);
      closeDialog($('[data-product-modal]'));
    }
  });

  document.addEventListener('click', (e) => {
    const view = e.target.closest('[data-view], [data-product-link]');
    if (view) openProduct(view.dataset.view || view.dataset.productLink);
    const add = e.target.closest('[data-add]');
    if (add) {
      addToBasket(add.dataset.add, 1);
      add.classList.add('added');
      add.textContent = 'Added';
      setTimeout(() => { add.classList.remove('added'); add.textContent = 'Add to basket'; }, 1400);
    }
  });

  // ---------- basket ----------
  function loadBasket() {
    try { return JSON.parse(localStorage.getItem(BASKET_KEY)) || {}; } catch { return {}; }
  }
  function saveBasket() {
    try { localStorage.setItem(BASKET_KEY, JSON.stringify(state.basket)); } catch { /* storage unavailable */ }
  }
  function basketLines() {
    return Object.entries(state.basket)
      .map(([id, qty]) => ({ p: findProduct(id), qty }))
      .filter((l) => l.p && !l.p.soldOut && l.qty > 0);
  }
  function addToBasket(id, qty) {
    const p = findProduct(id);
    if (!p || p.soldOut) return;
    state.basket[id] = Math.min(99, (state.basket[id] || 0) + qty);
    saveBasket();
    renderBasket(true);
    toast(`${p.name} added to your basket`);
  }
  function setQty(id, qty) {
    if (qty <= 0) delete state.basket[id];
    else state.basket[id] = Math.min(99, qty);
    saveBasket();
    renderBasket();
  }

  function renderBasket(bump = false) {
    // Drop items that were removed or marked sold out in the editor since the visitor added them.
    Object.keys(state.basket).forEach((id) => { const p = findProduct(id); if (!p || p.soldOut) delete state.basket[id]; });
    const lines = basketLines();
    const count = lines.reduce((n, l) => n + l.qty, 0);
    const total = lines.reduce((n, l) => n + (hasPrice(l.p) ? l.p.price * l.qty : 0), 0);
    const unpriced = lines.some((l) => !hasPrice(l.p));

    const badge = $('[data-basket-count]');
    badge.textContent = count;
    if (bump) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
    $('[data-open-basket]').setAttribute('aria-label', `Open basket, ${count} item${count === 1 ? '' : 's'}`);

    $('[data-basket-items]').innerHTML = lines.map(({ p, qty }) => `
      <li class="basket-item">
        <div class="basket-thumb">${media(p.image, '')}</div>
        <div>
          <h3>${esc(p.name)}</h3>
          <div class="qty qty-sm" role="group" aria-label="Quantity of ${esc(p.name)}">
            <button type="button" data-bq="${esc(p.id)}" data-d="-1" aria-label="Decrease">−</button>
            <output>${qty}</output>
            <button type="button" data-bq="${esc(p.id)}" data-d="1" aria-label="Increase">+</button>
          </div>
        </div>
        <div class="basket-line">
          ${hasPrice(p) ? money(p.price * qty) : '<span class="price-request">On request</span>'}
          <button class="text-link remove" type="button" data-remove="${esc(p.id)}">Remove</button>
        </div>
      </li>`).join('');

    $('[data-basket-empty]').hidden = lines.length > 0;
    $('[data-order-form]').hidden = lines.length === 0;
    $('[data-basket-total]').textContent = total > 0 || !unpriced ? money(total) : 'To confirm';
    $('[data-basket-note]').hidden = !unpriced;
  }

  $('[data-basket]').addEventListener('click', (e) => {
    const q = e.target.closest('[data-bq]');
    if (q) setQty(q.dataset.bq, (state.basket[q.dataset.bq] || 0) + Number(q.dataset.d));
    const r = e.target.closest('[data-remove]');
    if (r) setQty(r.dataset.remove, 0);
  });
  $('[data-open-basket]').addEventListener('click', () => { renderBasket(); openDialog($('[data-basket]')); });

  const orderForm = $('[data-order-form]');
  orderForm.addEventListener('change', () => {
    $('[data-address-field]').hidden = orderForm.fulfil.value !== 'Delivery';
  });
  orderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate(orderForm)) return;
    const lines = basketLines();
    if (!lines.length) return;
    const total = lines.reduce((n, l) => n + (hasPrice(l.p) ? l.p.price * l.qty : 0), 0);
    const unpriced = lines.some((l) => !hasPrice(l.p));
    const delivery = orderForm.fulfil.value === 'Delivery'
      ? `Delivery to: ${orderForm.address.value.trim() || '(area to confirm)'}`
      : 'I\'ll collect';
    const msg = [
      'Hi Nonhle\'s Cosmetics, I\'d like to order:',
      '',
      ...lines.map(({ p, qty }) => `• ${qty} × ${p.name}${hasPrice(p) ? ` (${money(p.price * qty)})` : ' (price on request)'}`),
      '',
      total > 0 ? `Total: ${money(total)}${unpriced ? ' + items priced on request' : ''}` : 'Total: to be confirmed',
      '',
      `Name: ${orderForm.name.value.trim()}`,
      delivery,
    ].join('\n');
    whatsapp(msg);
    state.basket = {};
    saveBasket();
    renderBasket();
    orderForm.reset();
    $('[data-address-field]').hidden = true;
    closeDialog($('[data-basket]'));
    toast('Order opened in WhatsApp. Press send to finish.');
  });

  // ---------- services & booking ----------
  function renderServices() {
    const list = $('[data-services]');
    if (!state.services.length) {
      list.innerHTML = '<li class="loading">Message us on WhatsApp to ask about services.</li>';
      return;
    }
    list.innerHTML = state.services.map((s) => `
      <li class="service">
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.description)}${s.duration ? ` · ${esc(s.duration)}` : ''}</p>
        <div class="service-price">
          ${hasPrice(s) ? `${s.priceFrom ? '<span>from</span>' : ''}<strong>${money(s.price)}</strong>` : '<span>Price on request</span>'}
        </div>
        <button class="btn" type="button" data-book="${esc(s.id)}">Book</button>
      </li>`).join('');

    $('[data-bk-select]').innerHTML = state.services.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  }

  function serviceMeta(s) {
    if (!s) return '';
    const price = hasPrice(s) ? `${s.priceFrom ? 'From ' : ''}${money(s.price)}` : 'Price on request';
    return [price, s.duration].filter(Boolean).join(' · ');
  }
  function setBookingService(id) {
    const s = state.services.find((x) => x.id === id) || state.services[0];
    if (!s) return;
    $('[data-bk-select]').value = s.id;
    $('[data-bk-title]').textContent = s.name;
    $('[data-bk-meta]').textContent = serviceMeta(s);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-book]');
    if (!b) return;
    setBookingService(b.dataset.book);
    openDialog($('[data-booking]'));
  });
  $('[data-bk-select]').addEventListener('change', (e) => setBookingService(e.target.value));

  const bookingForm = $('[data-booking-form]');
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  bookingForm.date.min = iso(today);

  bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate(bookingForm)) return;
    const s = state.services.find((x) => x.id === bookingForm.service.value);
    const date = new Date(bookingForm.date.value + 'T00:00');
    const niceDate = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const msg = [
      `Hi Nonhle's Cosmetics, I'd like to book ${s ? s.name : 'a service'}.`,
      '',
      `Name: ${bookingForm.name.value.trim()}`,
      `Phone: ${bookingForm.phone.value.trim()}`,
      `Date: ${niceDate}`,
      `Time: ${bookingForm.time.value}`,
      bookingForm.notes.value.trim() ? `Notes: ${bookingForm.notes.value.trim()}` : '',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim();
    whatsapp(msg);
    bookingForm.reset();
    bookingForm.date.min = iso(today);
    closeDialog($('[data-booking]'));
    toast('Booking request opened in WhatsApp. Press send to finish.');
  });

  // ---------- contact ----------
  const contactForm = $('[data-contact-form]');
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate(contactForm)) return;
    whatsapp(`Hi Nonhle's Cosmetics, I'm ${contactForm.name.value.trim()}.\nTopic: ${contactForm.topic.value}\n\n${contactForm.message.value.trim()}`);
    contactForm.reset();
  });

  // ---------- validation ----------
  const fieldMessages = {
    name: 'Enter your name.',
    phone: 'Enter a phone number we can reach you on.',
    date: 'Choose a date from today onwards.',
    time: 'Choose a time.',
    message: 'Write a short message.',
  };
  function validate(form) {
    let first = null;
    $$('input[required], textarea[required]', form).forEach((input) => {
      const field = input.closest('.field');
      $('.field-error', field)?.remove();
      const ok = input.checkValidity() && input.value.trim() !== '';
      input.setAttribute('aria-invalid', String(!ok));
      if (!ok) {
        const msg = document.createElement('p');
        msg.className = 'field-error';
        msg.id = input.id + '-err';
        msg.textContent = fieldMessages[input.name] || 'Fill in this field.';
        field.append(msg);
        input.setAttribute('aria-describedby', msg.id);
        first = first || input;
      } else {
        input.removeAttribute('aria-describedby');
      }
    });
    if (first) first.focus();
    return !first;
  }
  document.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true' && e.target.value.trim()) {
      e.target.setAttribute('aria-invalid', 'false');
      e.target.closest('.field')?.querySelector('.field-error')?.remove();
    }
  });

  // ---------- gallery ----------
  function renderGallery() {
    const g = $('[data-gallery]');
    const items = state.gallery.filter((x) => safeSrc(x.src));
    if (!items.length) {
      g.innerHTML = `<div class="gallery-empty">${glyph}<p><strong>Photos are coming soon.</strong>We're putting together photos of recent braids, makeup and nails. In the meantime, ask us on WhatsApp to see examples of a style.</p></div>`;
      return;
    }
    g.innerHTML = items.map((x, i) => `
      <button class="gallery-item" type="button" data-lb-open="${i}" aria-label="Open photo ${i + 1}${x.caption ? `: ${esc(x.caption)}` : ''}">
        <img src="${esc(x.src)}" alt="${esc(x.caption || 'Recent work by Nonhle\'s Cosmetics')}" loading="lazy"${x.w && x.h ? ` width="${Number(x.w)}" height="${Number(x.h)}"` : ''}>
      </button>`).join('');
    state.galleryItems = items;
  }

  const lb = $('[data-lightbox]');
  function showLb(i) {
    const items = state.galleryItems || [];
    if (!items.length) return;
    state.lbIndex = (i + items.length) % items.length;
    const x = items[state.lbIndex];
    $('[data-lb-img]').src = x.src;
    $('[data-lb-img]').alt = x.caption || 'Recent work by Nonhle\'s Cosmetics';
    $('[data-lb-cap]').textContent = `${x.caption ? x.caption + ' · ' : ''}${state.lbIndex + 1} of ${items.length}`;
    $$('.lb-nav', lb).forEach((b) => { b.hidden = items.length < 2; });
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-lb-open]');
    if (!o) return;
    showLb(Number(o.dataset.lbOpen));
    openDialog(lb);
  });
  $$('[data-lb]', lb).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); showLb(state.lbIndex + Number(b.dataset.lb)); }));
  $('[data-lb-img]').addEventListener('click', (e) => e.stopPropagation());
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') showLb(state.lbIndex + 1);
    if (e.key === 'ArrowLeft') showLb(state.lbIndex - 1);
  });

  // ---------- navigation ----------
  const menu = $('[data-menu]');
  $('[data-open-menu]').addEventListener('click', () => openDialog(menu));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => { lastFocus = null; closeDialog(menu); }));

  const header = $('.site-header');
  const waFloat = $('.wa-float');
  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
    waFloat.classList.toggle('show', window.scrollY > window.innerHeight * 0.8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Scroll-spy: highlight the nav link for the section in view.
  const navLinks = $$('.nav a');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        navLinks.forEach((a) => a.setAttribute('aria-current', String(a.hash === '#' + en.target.id)));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section[id]').forEach((s) => io.observe(s));
  }

  $('[data-year]').textContent = new Date().getFullYear();

  // ---------- boot ----------
  loadContent().then((ok) => {
    if (!ok) return;
    applySettings();
    renderProducts();
    addProductSchema();
    renderServices();
    renderGallery();
    renderBasket();
  });
})();
