/* ============================================================
   ABSQU — script.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── AOS ─────────────────────────────────────────────────── */
  AOS.init({
    duration: 700,
    easing: 'ease-out-cubic',
    once: true,
    offset: 60,
  });

  /* ── Navbar scroll state ─────────────────────────────────── */
  const navbar = document.getElementById('navbar');
  const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 60);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // set initial state on load

  /* ── Hamburger menu ──────────────────────────────────────── */
  const toggle   = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  toggle.addEventListener('click', () => {
    const isOpen = toggle.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
    navLinks.classList.toggle('nav-open', isOpen);
    document.body.classList.toggle('nav-lock', isOpen);
  });

  // Close mobile nav on link click
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('nav-open');
      document.body.classList.remove('nav-lock');
    });
  });

  /* ── Smooth scroll with nav offset ──────────────────────── */
  const NAV_H = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--nav-h')) || 68;

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const id = anchor.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - NAV_H;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ── Active nav link via IntersectionObserver ────────────── */
  const sections = document.querySelectorAll('section[id]');
  const navAs    = document.querySelectorAll('.nav-links a[href^="#"]');

  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navAs.forEach(a => a.classList.remove('active'));
        const active = document.querySelector(
          `.nav-links a[href="#${entry.target.id}"]`
        );
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-50% 0px -50% 0px' });

  sections.forEach(s => sectionObserver.observe(s));

  /* ── Lightbox ────────────────────────────────────────────── */
  const lightbox    = document.getElementById('lightbox');
  const lbImg       = document.getElementById('lightboxImg');
  const lbCaption   = document.getElementById('lightboxCaption');
  const lbClose     = lightbox.querySelector('.lightbox-close');
  const lbPrev      = lightbox.querySelector('.lightbox-prev');
  const lbNext      = lightbox.querySelector('.lightbox-next');

  // Collect gallery items
  const galleryItems = [...document.querySelectorAll('.gallery-item[data-src]')].map(el => ({
    src:     el.dataset.src,
    caption: el.dataset.caption || '',
  }));

  let currentIndex = 0;

  function openLightbox(index) {
    currentIndex = (index + galleryItems.length) % galleryItems.length;
    lbImg.src          = galleryItems[currentIndex].src;
    lbImg.alt          = galleryItems[currentIndex].caption;
    lbCaption.textContent = galleryItems[currentIndex].caption;
    lightbox.setAttribute('aria-hidden', 'false');
    lightbox.classList.add('active');
    document.body.classList.add('nav-lock');
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('nav-lock');
    lbImg.src = '';
  }

  // Open on gallery item click
  document.querySelectorAll('.gallery-item[data-src]').forEach((el, i) => {
    el.addEventListener('click', () => openLightbox(i));
  });

  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', () => openLightbox(currentIndex - 1));
  lbNext.addEventListener('click', () => openLightbox(currentIndex + 1));

  // Close on backdrop click
  lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox();
  });

  // Keyboard nav
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   openLightbox(currentIndex - 1);
    if (e.key === 'ArrowRight')  openLightbox(currentIndex + 1);
  });

});
