/* ============================================================
   ABSQU — script.js  (v2)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── AOS ─────────────────────────────────────────────────── */
  AOS.init({ duration: 750, easing: 'ease-out-cubic', once: true, offset: 55 });

  /* ── Navbar scroll state ─────────────────────────────────── */
  const navbar = document.getElementById('navbar');
  const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 60);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Hamburger ───────────────────────────────────────────── */
  const toggle   = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  toggle.addEventListener('click', () => {
    const open = toggle.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    navLinks.classList.toggle('nav-open', open);
    document.body.classList.toggle('nav-lock', open);
  });
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    navLinks.classList.remove('nav-open');
    document.body.classList.remove('nav-lock');
  }));

  /* ── Smooth scroll with nav offset ──────────────────────── */
  const NAV_H = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 70;
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - NAV_H, behavior: 'smooth' });
    });
  });

  /* ── Active nav link ─────────────────────────────────────── */
  const sections = document.querySelectorAll('section[id]');
  const navAs    = document.querySelectorAll('.nav-links a[href^="#"]');
  new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        navAs.forEach(a => a.classList.remove('active'));
        const a = document.querySelector(`.nav-links a[href="#${e.target.id}"]`);
        if (a) a.classList.add('active');
      }
    });
  }, { rootMargin: '-50% 0px -50% 0px' }).observe
    ? sections.forEach(s => new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            navAs.forEach(a => a.classList.remove('active'));
            const a = document.querySelector(`.nav-links a[href="#${e.target.id}"]`);
            if (a) a.classList.add('active');
          }
        });
      }, { rootMargin: '-50% 0px -50% 0px' }).observe(s))
    : null;

  /* ── Animated counters ───────────────────────────────────── */
  const counters = document.querySelectorAll('[data-count]');
  const countObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el     = entry.target;
      const target = parseInt(el.dataset.count, 10);
      const dur    = 1800;
      const step   = target / (dur / 16);
      let current  = 0;
      const timer  = setInterval(() => {
        current += step;
        if (current >= target) { el.textContent = target; clearInterval(timer); return; }
        el.textContent = Math.floor(current);
      }, 16);
      countObserver.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => countObserver.observe(c));

  /* ── Card tilt on hover ──────────────────────────────────── */
  // Only on devices with a pointer (not touch-only)
  if (window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('[data-tilt]').forEach(card => {
      card.addEventListener('mouseenter', () => {
        card.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease';
      });
      card.addEventListener('mousemove', e => {
        const r  = card.getBoundingClientRect();
        const x  = e.clientX - r.left;
        const y  = e.clientY - r.top;
        const rx = ((y - r.height / 2) / r.height) * -10;
        const ry = ((x - r.width  / 2) / r.width ) *  10;
        card.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transition = 'transform 0.5s ease, box-shadow 0.5s ease';
        card.style.transform  = '';
      });
    });
  }

  /* ── Lightbox ────────────────────────────────────────────── */
  const lightbox  = document.getElementById('lightbox');
  const lbImg     = document.getElementById('lightboxImg');
  const lbCaption = document.getElementById('lightboxCaption');
  const lbClose   = lightbox.querySelector('.lightbox-close');
  const lbPrev    = lightbox.querySelector('.lightbox-prev');
  const lbNext    = lightbox.querySelector('.lightbox-next');

  const items = [...document.querySelectorAll('.gallery-item[data-src]')].map(el => ({
    src: el.dataset.src, caption: el.dataset.caption || '',
  }));
  let cur = 0;

  function openLB(i) {
    cur = (i + items.length) % items.length;
    lbImg.src = items[cur].src;
    lbImg.alt = items[cur].caption;
    lbCaption.textContent = items[cur].caption;
    lightbox.setAttribute('aria-hidden', 'false');
    lightbox.classList.add('active');
    document.body.classList.add('nav-lock');
    lbClose.focus();
  }
  function closeLB() {
    lightbox.classList.remove('active');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('nav-lock');
    lbImg.src = '';
  }

  document.querySelectorAll('.gallery-item[data-src]').forEach((el, i) =>
    el.addEventListener('click', () => openLB(i)));
  lbClose.addEventListener('click', closeLB);
  lbPrev.addEventListener('click', () => openLB(cur - 1));
  lbNext.addEventListener('click', () => openLB(cur + 1));
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLB(); });
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape')     closeLB();
    if (e.key === 'ArrowLeft')  openLB(cur - 1);
    if (e.key === 'ArrowRight') openLB(cur + 1);
  });

});
