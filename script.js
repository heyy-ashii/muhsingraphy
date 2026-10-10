// ── reveal on scroll ────────────────────────────────────────
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const parent = e.target.parentElement;
      const peers = parent ? [...parent.querySelectorAll(':scope > .reveal')] : [];
      const order = Math.max(0, peers.indexOf(e.target));
      e.target.style.transitionDelay = `${Math.min(order, 5) * 70}ms`;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  },
  { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }
);
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// ── FAQ accordion ───────────────────────────────────────────
document.querySelectorAll('.faq__item').forEach((item) => {
  const q = item.querySelector('.faq__q');
  const sign = item.querySelector('.faq__sign');
  q?.addEventListener('click', () => {
    const open = item.classList.toggle('is-open');
    q.setAttribute('aria-expanded', String(open));
    if (sign) sign.textContent = open ? '−' : '+';
  });
});

// ── product tabs ────────────────────────────────────────────
const tabs = document.querySelectorAll('.pdp__tab');
const panels = document.querySelectorAll('.pdp__panel');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === tab.dataset.tab));
  });
});

// ── gallery thumbnails ──────────────────────────────────────
document.querySelectorAll('.pdp__thumbs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const hero = document.getElementById('pdp-hero');
    if (hero) hero.src = btn.dataset.src;
    document.querySelectorAll('.pdp__thumbs button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    const label = document.getElementById('pdp-view-label');
    if (label) label.textContent = btn.querySelector('img')?.alt ?? '';
  });
});

// ── size selection updates price ────────────────────────────
const priceEl = document.querySelector('[data-price]');
document.querySelectorAll('input[name="size"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (priceEl) priceEl.textContent = `$${input.dataset.sizePrice}`;
  });
});

// ── quantity stepper ────────────────────────────────────────
document.querySelectorAll('[data-qty]').forEach((box) => {
  const value = box.querySelector('[data-qty-value]');
  box.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = Math.max(1, (parseInt(value.textContent, 10) || 1) + Number(btn.dataset.step));
      value.textContent = String(next);
    });
  });
});

// ── add to cart (preview only — no cart backend) ────────────
const cartCount = document.querySelector('.cart');
document.querySelectorAll('[data-add-to-cart]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const qty = document.querySelector('[data-qty-value]')?.textContent ?? '1';
    btn.textContent = `Added ${qty} — preview only`;
    if (cartCount) cartCount.innerHTML = cartCount.innerHTML.replace(/Cart \(\d+\)/, `Cart (${qty})`);
    setTimeout(() => (btn.textContent = 'Add to cart'), 2200);
  });
});

// ── shop filters ────────────────────────────────────────────
const chips = document.querySelectorAll('.chip[data-filter]');
const cards = document.querySelectorAll('#grid .card');
chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    let shown = 0;
    cards.forEach((card) => {
      const match = filter === 'all' || card.dataset.kind === filter;
      card.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    const count = document.getElementById('offering-count');
    if (count) count.textContent = `${shown} offering${shown === 1 ? '' : 's'}`;
  });
});
