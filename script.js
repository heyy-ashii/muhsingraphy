// Reveal-on-scroll, staggering grouped elements as they enter.
const revealed = document.querySelectorAll('.reveal');

const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const parent = entry.target.parentElement;
      const peers = parent ? [...parent.querySelectorAll(':scope > .reveal')] : [];
      const order = Math.max(0, peers.indexOf(entry.target));
      entry.target.style.transitionDelay = `${Math.min(order, 6) * 70}ms`;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  },
  { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
);
revealed.forEach((el) => io.observe(el));

// Hero enters immediately on load.
window.addEventListener('load', () => {
  document.querySelectorAll('.hero .reveal').forEach((el, i) => {
    el.style.transitionDelay = `${i * 90}ms`;
    el.classList.add('is-in');
  });
});

// Index rows scroll to their project.
document.querySelectorAll('.index__item').forEach((item) => {
  const go = () => {
    const target = document.getElementById(item.dataset.goto);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  item.addEventListener('click', go);
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
});

// Highlight the project currently in view within the index.
const pairs = [...document.querySelectorAll('.project')]
  .map((p) => [p, document.querySelector(`.index__item[data-goto="${p.id}"]`)])
  .filter(([, row]) => row);

const spy = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const row = pairs.find(([p]) => p === entry.target)?.[1];
      if (!row) continue;
      row.style.opacity = entry.isIntersecting ? '1' : '0.45';
    }
  },
  { threshold: 0.5 }
);
pairs.forEach(([p]) => spy.observe(p));

document.getElementById('year').textContent = new Date().getFullYear();
