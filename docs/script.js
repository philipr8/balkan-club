/* ==========================================================================
   ABSQU — site script. Vanilla JS, no dependencies, no network calls except
   two lazy, optional fetches: the Instagram feed (Behold) and the team flags (Firestore,
   read-only, only when the Team section scrolls near). Both fail silently.
   1. Aurora shader (WebGL)     4. Mobile menu + active nav
   2. Scroll-expanding hero     5. Spotlight, count-up, copy email
   3. Reveal on scroll          6. Instagram feed, team flags, exec-login hint
   ========================================================================== */
(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ------------------------------------------------------------------
     1. Aurora shader — flowing ribbons in the four brand colours.
        Falls back to the CSS gradient behind it if WebGL is unavailable.
     ------------------------------------------------------------------ */
  function mountAurora(canvas) {
    if (!canvas) return null;

    const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    const FS = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 u_res; uniform float u_time; uniform vec2 u_ptr;

      mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
      float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
        float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));
        return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
      float fbm(vec2 p){float v=0.,amp=.5;for(int i=0;i<4;i++){v+=amp*noise(p);p=rot(.72)*p*2.03+4.17;amp*=.5;}return v;}

      void main(){
        vec2 p=(gl_FragCoord.xy*2.-u_res)/max(min(u_res.x,u_res.y),1.);
        float t=u_time;
        vec2 ptr=(u_ptr*2.-1.); ptr.x*=u_res.x/max(u_res.y,1.);
        vec2 q=p;
        q.x+=sin(q.y*2.1+t*.16)*.24;
        q.y+=cos(q.x*1.6-t*.13)*.18;
        q+=(ptr-q)*.035;

        // four ribbons, one per brand colour
        float rA=smoothstep(.58,.02,abs(q.y-.62+sin(q.x*1.7+t*.22)*.3));   // red
        float rB=smoothstep(.55,.02,abs(q.y-.12-cos(q.x*2.2-t*.19)*.26));  // gold
        float rC=smoothstep(.6,.02, abs(q.y+.42+sin(q.x*1.5-t*.17)*.3));   // green
        float rD=smoothstep(.7,.02, abs(q.y+.02-cos(q.x*1.2+t*.12)*.46));  // blue
        float grain=fbm(q*2.6+t*.04);

        vec3 col=vec3(.05,.17,.30);
        col+=vec3(.78,.06,.18)*rA*.42;
        col+=vec3(.95,.76,.19)*rB*.30;
        col+=vec3(.00,.59,.43)*rC*.36;
        col+=vec3(.06,.30,.51)*rD*.62;
        col+=(grain-.5)*.05;
        float vig=smoothstep(2.0,.4,length(p));
        col*=.5+.5*vig;
        gl_FragColor=vec4(pow(max(col,vec3(0.)),vec3(.95)),1.);
      }`;

    let gl;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    } catch (e) { gl = null; }
    if (!gl) { canvas.remove(); return null; }

    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { canvas.remove(); return null; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return null; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uPtr = gl.getUniformLocation(prog, 'u_ptr');

    const MAX_PIXELS = 480000;  // cap fill-rate; the shader is soft anyway
    const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let running = false, raf = 0, visible = true, allowed = true;

    function resize() {
      const r = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 1.25);
      let w = Math.max(1, Math.floor(r.width * ratio)), h = Math.max(1, Math.floor(r.height * ratio));
      const px = w * h;
      if (px > MAX_PIXELS) { const s = Math.sqrt(MAX_PIXELS / px); w = Math.floor(w * s); h = Math.floor(h * s); }
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    }
    function draw(now) {
      resize();
      ptr.x += (ptr.tx - ptr.x) * 0.04; ptr.y += (ptr.ty - ptr.y) * 0.04;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduced ? 14 : now * 0.001);
      gl.uniform2f(uPtr, ptr.x, ptr.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function tick(now) { if (!running) { raf = 0; return; } draw(now); raf = requestAnimationFrame(tick); }
    function start() { if (reduced) { draw(performance.now()); return; } if (!running && visible && allowed) { running = true; raf = requestAnimationFrame(tick); } }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }, { threshold: 0.01 }).observe(canvas);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    if (finePointer) window.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      ptr.tx = clamp((e.clientX - r.left) / Math.max(r.width, 1), 0, 1);
      ptr.ty = clamp(1 - (e.clientY - r.top) / Math.max(r.height, 1), 0, 1);
    }, { passive: true });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); });
    canvas.addEventListener('webglcontextrestored', () => start());

    draw(performance.now());
    start();
    return { setAllowed(v) { allowed = v; v ? start() : stop(); } };
  }
  const aurora = mountAurora($('#aurora'));

  /* ------------------------------------------------------------------
     2. Scroll-expanding hero — progress 0..1 drives CSS via --p
     ------------------------------------------------------------------ */
  const hero = $('#home');
  const nav = $('#nav');
  (() => {
    if (!hero || !nav) return;
    if (reduced) { hero.style.setProperty('--p', '1'); nav.classList.add('is-solid'); return; }

    let top = 0, runway = 1, target = 0, cur = -1, raf = 0, last = 0;
    function measure() {
      top = hero.offsetTop;
      runway = Math.max(1, hero.offsetHeight - innerHeight);
      onScroll();
    }
    function onScroll() {
      target = clamp((scrollY - top) / runway, 0, 1);
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function tick(now) {
      // frame-rate independent smoothing (~90 ms time constant)
      const dt = last ? Math.min(64, now - last) : 16; last = now;
      const k = 1 - Math.exp(-dt / 90);
      const next = cur < 0 ? target : cur + (target - cur) * k;
      cur = Math.abs(target - next) < 0.0006 ? target : next;
      hero.style.setProperty('--p', cur.toFixed(4));
      nav.classList.toggle('is-solid', cur > 0.5 || scrollY > top + runway);
      if (aurora) aurora.setAllowed(cur < 0.985);
      if (cur !== target) raf = requestAnimationFrame(tick); else { raf = 0; last = 0; }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('load', measure);
    measure();
  })();

  /* ------------------------------------------------------------------
     3. Reveal on scroll
     ------------------------------------------------------------------ */
  (() => {
    const els = $$('[data-reveal]');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
  })();

  /* ------------------------------------------------------------------
     4. Mobile menu + active section marker
     ------------------------------------------------------------------ */
  (() => {
    const toggle = $('#menuToggle'), menu = $('#menu');
    if (toggle && menu) {
      const icon = $('use', toggle);
      const setOpen = open => {
        menu.classList.toggle('is-open', open);
        menu.setAttribute('aria-hidden', String(!open));
        if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        icon.setAttribute('href', open ? '#i-close' : '#i-menu');
        document.body.classList.toggle('menu-open', open);
      };
      setOpen(false);
      toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
      $$('a', menu).forEach(a => a.addEventListener('click', () => setOpen(false)));
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });
    }

    const links = $$('[data-nav]');
    const sections = links.map(l => document.getElementById(l.dataset.nav)).filter(Boolean);
    if (!sections.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(l => l.removeAttribute('aria-current'));
        links.filter(l => l.dataset.nav === e.target.id).forEach(l => l.setAttribute('aria-current', 'true'));
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    sections.forEach(s => io.observe(s));
  })();

  /* ------------------------------------------------------------------
     5. Spotlight cards, count-up numbers, copy email, year
     ------------------------------------------------------------------ */
  (() => {
    if (finePointer) $$('.spot').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });

    const counters = $$('[data-count]');
    if (counters.length) {
      const run = el => {
        const end = Number(el.dataset.count) || 0;
        if (reduced) { el.textContent = end; return; }
        const t0 = performance.now(), dur = 1300;
        const step = now => {
          const p = clamp((now - t0) / dur, 0, 1);
          el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      if (!('IntersectionObserver' in window)) counters.forEach(el => { el.textContent = el.dataset.count; });
      else {
        const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: 0.6 });
        counters.forEach(el => io.observe(el));
      }
    }

    const copy = $('#copyEmail');
    if (copy) {
      const label = $('span', copy), use = $('use', copy);
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText('QueensABSQU@gmail.com'); }
        catch (e) { location.href = 'mailto:QueensABSQU@gmail.com'; return; }
        copy.classList.add('is-done'); label.textContent = 'Copied!'; use.setAttribute('href', '#i-check');
        setTimeout(() => { copy.classList.remove('is-done'); label.textContent = 'Copy'; use.setAttribute('href', '#i-copy'); }, 2200);
      });
    }

    const y = $('#year'); if (y) y.textContent = String(new Date().getFullYear());
  })();

  /* ------------------------------------------------------------------
     6a. Instagram feed. Posts come from a Behold JSON feed (free plan: 6
         newest posts, refreshed daily). We render our own cards, so the
         section matches the site. The feed URL lives in #feed[data-feed].
         Cached for 3 h in this browser so repeat visits don't use up
         Behold's monthly view allowance. Without a feed, a static
         "Follow us" card is shown instead.
     ------------------------------------------------------------------ */
  (() => {
    const feed = $('#feed');
    if (!feed) return;
    const url = (feed.dataset.feed || '').trim();
    if (!/^https:\/\/feeds\.behold\.so\/[A-Za-z0-9_-]+$/.test(url)) return; // keep the fallback card
    const CACHE = 'absqu.igfeed', TTL = 3 * 3600 * 1000;
    const read = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) { return null; } };
    const write = d => { try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), url, d })); } catch (e) { /* storage blocked */ } };
    const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    const svg = id => { const n = 'http://www.w3.org/2000/svg', s = document.createElementNS(n, 'svg'); s.setAttribute('class', 'icon'); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS(n, 'use'); u.setAttribute('href', '#' + id); s.append(u); return s; };
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

    const imageOf = p => {
      const sz = p.sizes || {};
      if (p.mediaType === 'VIDEO') return p.thumbnailUrl || sz.medium?.mediaUrl || sz.large?.mediaUrl || '';
      return sz.medium?.mediaUrl || sz.large?.mediaUrl || sz.small?.mediaUrl || p.mediaUrl || p.thumbnailUrl || '';
    };
    const card = p => {
      const href = typeof p.permalink === 'string' && /^https:\/\/(www\.)?instagram\.com\//.test(p.permalink) ? p.permalink : 'https://www.instagram.com/abs_qu/';
      const src = imageOf(p);
      const cap = String(p.prunedCaption || p.caption || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const a = mk('a', 'igpost'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', cap ? `Instagram post: ${cap}` : 'View this post on Instagram');
      if (/^https:\/\//.test(src)) {
        const img = new Image(); img.src = src; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        img.addEventListener('error', () => img.remove());
        a.append(img);
      }
      const top = mk('div', 'igpost__top'), chip = mk('span', 'igpost__chip'); chip.append(svg('i-insta')); top.append(chip);
      if (p.mediaType === 'VIDEO' || p.mediaType === 'CAROUSEL_ALBUM') { const b = mk('span', 'igpost__badge'); b.append(svg(p.mediaType === 'VIDEO' ? 'i-play' : 'i-layers')); top.append(b); }
      const meta = mk('div', 'igpost__meta'), when = p.timestamp ? new Date(p.timestamp) : null;
      const view = mk('span', null, 'View post '); view.append(svg('i-go'));
      meta.append(mk('span', null, when && !isNaN(when) ? dateFmt.format(when) : '@abs_qu'), view);
      const capEl = mk('div', 'igpost__cap'); if (cap) capEl.append(mk('p', null, cap)); capEl.append(meta);
      a.append(top, capEl);
      return a;
    };
    const show = posts => {
      const list = posts.filter(p => p && imageOf(p)).slice(0, 6);
      if (!list.length) return false;
      feed.replaceChildren(...list.map(card));
      return true;
    };

    async function load() {
      const c = read();
      if (c && c.url === url && Date.now() - c.at < TTL && show(c.d.posts || [])) return;
      feed.setAttribute('aria-busy', 'true');
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        if (show(d.posts || [])) write({ posts: (d.posts || []).slice(0, 6) });
      } catch (e) {
        if (c && c.url === url) show(c.d.posts || []); // stale beats nothing; otherwise the fallback card stays
      } finally { feed.removeAttribute('aria-busy'); }
    }
    if (!('IntersectionObserver' in window)) { load(); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '500px 0px' });
    io.observe(feed);
  })();

  /* ------------------------------------------------------------------
     6a-2. Team flags. Each exec picks their country in the exec area;
         it's saved to a public, read-only Firestore collection (`team`:
         name + country codes only — no emails, no roles). We read it
         with one plain REST call when the Team section is about to
         scroll into view, then add flags next to matching names.
         No Firebase SDK is loaded; if anything fails, no flags show.
     ------------------------------------------------------------------ */
  (() => {
    const team = $('#team');
    if (!team) return;
    const CACHE = 'absqu.flags', TTL = 10 * 60 * 1000;
    const NAMES = { al: 'Albania', ba: 'Bosnia & Herzegovina', bg: 'Bulgaria', ge: 'Georgia', gr: 'Greece', hr: 'Croatia', me: 'Montenegro', mk: 'North Macedonia', ro: 'Romania', rs: 'Serbia', si: 'Slovenia', xk: 'Kosovo' };
    const norm = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const read = () => { try { const c = JSON.parse(sessionStorage.getItem(CACHE) || 'null'); return c && Date.now() - c.at < TTL ? c.map : null; } catch (e) { return null; } };
    const write = map => { try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), map })); } catch (e) { /* storage blocked */ } };

    // Flags are already in the HTML (set by the club), so they show with no network at all.
    // A flag a member picked themselves in the exec area replaces theirs; choosing "no flag" removes it.
    function apply(map) {
      $$('.pname', team).forEach(n => {
        const entry = map[norm(n.textContent)];
        if (!Array.isArray(entry)) return;                        // member hasn't answered: keep the HTML default
        const cur = n.nextElementSibling?.classList.contains('flags') ? n.nextElementSibling : null;
        if (cur && cur.dataset.src === 'live') return;
        cur?.remove();
        const codes = entry.filter(c => NAMES[c]).slice(0, 2);
        if (!codes.length) return;
        const wrap = document.createElement('span'); wrap.className = 'flags'; wrap.dataset.src = 'live';
        codes.forEach(c => {
          const i = new Image(); i.className = 'flag-ico'; i.alt = NAMES[c]; i.title = NAMES[c]; i.width = 22; i.height = 16; i.decoding = 'async';
          i.src = `https://flagcdn.com/w40/${c}.png`; i.srcset = `https://flagcdn.com/w80/${c}.png 2x`;
          wrap.append(i);
        });
        n.after(wrap);
      });
    }

    async function load() {
      let map = read();
      if (!map) {
        try {
          const cfg = (await import('./firebase-config.js')).default;
          if (!cfg || !cfg.projectId || !cfg.apiKey || /YOUR_/.test(cfg.projectId)) return;
          const base = cfg.useEmulators ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com';
          const r = await fetch(`${base}/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/team?pageSize=100&key=${encodeURIComponent(cfg.apiKey)}`);
          if (!r.ok) return;
          const j = await r.json();
          map = {};
          (j.documents || []).forEach(d => {
            const f = d.fields || {}, name = f.name?.stringValue;
            if (name) map[norm(name)] = (f.countries?.arrayValue?.values || []).map(v => v.stringValue).filter(Boolean);
          });
          write(map);
        } catch (e) { return; } // no config / offline: simply no flags
      }
      apply(map);
    }
    if (!('IntersectionObserver' in window)) { load(); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '700px 0px' });
    io.observe(team);
  })();

  /* ------------------------------------------------------------------
     6b. Exec-login hint. The exec app writes { name, role } here after a
         successful sign-in. This only changes the nav label — it grants
         nothing (all access is enforced by Firestore rules), and the exec
         page re-checks the real session and clears the hint if it expired.
         The public site never loads Firebase.
     ------------------------------------------------------------------ */
  (() => {
    let hint = null;
    try { hint = JSON.parse(localStorage.getItem('absqu.execHint') || 'null'); } catch (e) { /* storage blocked */ }
    if (!hint || typeof hint.name !== 'string') return;
    const first = hint.name.trim().split(/\s+/)[0] || 'Team';
    const role = hint.role === 'admin' ? 'Co-President' : 'Exec';
    $$('[data-exec-link]').forEach(a => {
      const label = $('.lbl', a);
      if (!label) return;
      label.textContent = first;
      const badge = document.createElement('span');
      badge.className = 'role'; badge.textContent = role;
      a.classList.add('exec-chip');
      a.appendChild(badge);
      a.setAttribute('aria-label', `Open team area — signed in as ${hint.name} (${role})`);
    });
  })();
})();
