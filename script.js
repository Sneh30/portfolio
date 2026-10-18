gsap.registerPlugin(ScrollTrigger, SplitText, ScrollSmoother);

const BP = 992;
const desk = () => window.innerWidth >= BP;
const isMobile = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let sm;

window.addEventListener('DOMContentLoaded', () => {
  sm = ScrollSmoother.create({
    wrapper: "#wrapper",
    content: "#content",
    smooth: desk() && !REDUCE ? 1 : 0,
    smoothTouch: 0,
  });

  initNav();
  if (!REDUCE) initHero();
  initProjects();
  initVideoModal();
  if (!REDUCE) initReveals();
  new Terrain();
  if (!isMobile() && !REDUCE) initCursor();

  ScrollTrigger.refresh();
});

/* ─── NAV ─── */
function initNav() {
  const n = document.getElementById("nav");

  document.querySelectorAll(".nav-links a").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const id = a.getAttribute("href").slice(1);
      const el = document.getElementById(id);
      if (el && sm) sm.scrollTo(el, { smooth: true });
    });
  });

  ScrollTrigger.create({
    trigger: "#projects", start: "top top",
    onEnter: () => { n.classList.add("scrolled"); },
    onLeaveBack: () => { n.classList.remove("scrolled"); },
  });
}

/* ─── HERO ─── */
function initHero() {
  const h = document.querySelectorAll(".hero-line");
  gsap.set(h, { yPercent: 110, opacity: 0 });
  gsap.set(".hero-label, .hero-tags, .hero-scroll", { opacity: 0 });

  gsap.to(h, { yPercent: 0, opacity: 1, duration: 1.1, ease: "power4.out", stagger: 0.12, delay: 0.1 });
  gsap.to(".hero-label", { opacity: 1, duration: .8, ease: "sine.inOut", delay: .5 });
  gsap.to(".hero-tags", { opacity: 1, duration: .8, ease: "sine.inOut", delay: .7 });
  gsap.to(".hero-scroll", { opacity: 1, duration: .6, ease: "sine.inOut", delay: 1 });
}

/* ─── PROJECTS: grid thumbnails (muted, running) + explainer-video modal ─── */
const vm = {
  el: null, backdrop: null, wrap: null, video: null, chrome: null,
  title: null, vol: null, volBtn: null, volRange: null, volTxt: null,
  closeBtn: null, seek: null, seekRow: null, time: null, dur: null,
  nudge: null, nudgePill: null, nudgeTimer: null,
  source: null, open: false, closing: false, _finish: null, seeking: false,
};

function initProjects() {
  const grid = document.querySelector(".proj-cards-grid");
  if (!grid) return;

  const thumbs = Array.from(grid.querySelectorAll(".proj-video"));
  if (!thumbs.length) return;

  thumbs.forEach(el => {
    const v = el.querySelector("video");
    if (!v) return;
    el._vid = v;
    v.muted = true;
    v.defaultMuted = true;
    /* show a real first frame instead of a black box before playback */
    const showFirstFrame = () => {
      try { if (v.readyState >= 1 && v.currentTime < 0.05) v.currentTime = 0.06; } catch (e) {}
    };
    if (v.readyState >= 1) showFirstFrame();
    else v.addEventListener("loadedmetadata", showFirstFrame, { once: true });

    el.addEventListener("click", () => openVideoModal(el));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        openVideoModal(el);
      }
    });
  });

  const safePlay = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };

  /* Run only while the card is on screen — and never behind the open modal */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        const v = en.target._vid;
        if (!v) return;
        if (en.isIntersecting && !vm.open && !REDUCE && !document.hidden) safePlay(v);
        else v.pause();
      });
    }, { threshold: 0.25 });
    thumbs.forEach(t => io.observe(t));
    vm.io = io;
    vm.thumbs = thumbs;
  } else {
    thumbs.forEach(t => { if (!REDUCE) safePlay(t._vid); });
    vm.thumbs = thumbs;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { thumbs.forEach(t => t._vid.pause()); return; }
    if (vm.open || REDUCE) return;
    thumbs.forEach(t => {
      const r = t.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) safePlay(t._vid);
    });
  });
}

/* ─── EXPLAINER VIDEO MODAL: FLIP expand, sound at full volume ─── */
function initVideoModal() {
  vm.el = document.getElementById("videoModal");
  if (!vm.el) return;
  vm.backdrop = document.getElementById("vmBackdrop");
  vm.wrap = document.getElementById("vmVideoWrap");
  vm.video = document.getElementById("vmVideo");
  vm.chrome = document.getElementById("vmChrome");
  vm.title = document.getElementById("vmTitle");
  vm.vol = document.getElementById("vmVol");
  vm.volBtn = document.getElementById("vmVolToggle");
  vm.volRange = document.getElementById("vmVolRange");
  vm.volTxt = document.getElementById("vmVolTxt");
  vm.closeBtn = document.getElementById("vmCloseBtn");
  vm.seek = document.getElementById("vmSeek");
  vm.seekRow = document.getElementById("vmSeekRow");
  vm.time = document.getElementById("vmTime");
  vm.dur = document.getElementById("vmDur");
  vm.nudge = document.getElementById("vmNudge");
  vm.nudgePill = document.getElementById("vmNudgePill");
  resetSeek();

  vm.closeBtn.addEventListener("click", closeVideoModal);
  vm.backdrop.addEventListener("click", closeVideoModal);
  /* tapping the nudge dismisses it early — so does touching the volume controls */
  if (vm.nudgePill) vm.nudgePill.addEventListener("click", hideNudge);
  vm.volBtn.addEventListener("click", () => {
    vm.video.muted = !vm.video.muted;
    if (!vm.video.muted && vm.video.volume === 0) { vm.video.volume = 1; vm.volRange.value = 100; }
    syncVol();
    hideNudge();
  });
  vm.volRange.addEventListener("input", () => {
    vm.video.volume = Number(vm.volRange.value) / 100;
    vm.video.muted = vm.video.volume === 0;
    syncVol();
    hideNudge();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Escape" || e.key === "Esc") && vm.open) { closeVideoModal(); return; }
    if (e.key !== "Tab" || !vm.open) return;
    const f = [...vm.el.querySelectorAll("button, input, [tabindex]:not([tabindex='-1'])")]
      .filter(el => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!vm.el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  });
  /* the page must stay put behind the modal — but never block the volume slider */
  vm.el.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  vm.el.addEventListener("touchmove", (e) => {
    if (e.target && e.target.closest && e.target.closest(".vm-vol")) return;
    e.preventDefault();
  }, { passive: false });

  /* rewind / scrub slider */
  vm.video.addEventListener("loadedmetadata", () => {
    const d = isFinite(vm.video.duration) && vm.video.duration > 0 ? vm.video.duration : 0;
    vm.seek.max = String(d);
    vm.seek.disabled = d <= 0;
    paintSeek();
  });
  vm.video.addEventListener("timeupdate", () => { if (!vm.seeking) paintSeek(); });
  vm.video.addEventListener("seeked", paintSeek);
  vm.seek.addEventListener("pointerdown", () => { vm.seeking = true; });
  ["pointerup", "pointercancel"].forEach(t => window.addEventListener(t, () => {
    if (!vm.seeking) return;
    vm.seeking = false;
    paintSeek();
  }));
  vm.seek.addEventListener("input", () => {
    try { vm.video.currentTime = Number(vm.seek.value); } catch (e) {}
    paintSeek();
  });
  vm.seek.addEventListener("keyup", () => { vm.seeking = false; paintSeek(); });
}

function fmtTime(s) {
  s = isFinite(s) && s > 0 ? s : 0;
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}

function paintSeek() {
  if (!vm.seek || !vm.video) return;
  const d = isFinite(vm.video.duration) && vm.video.duration > 0 ? vm.video.duration : 0;
  const t = vm.seeking ? Number(vm.seek.value) : (isFinite(vm.video.currentTime) ? vm.video.currentTime : 0);
  if (!vm.seeking) vm.seek.value = String(t);
  vm.seek.style.setProperty("--p", (d ? Math.min(100, (t / d) * 100) : 0).toFixed(2) + "%");
  if (vm.time) vm.time.textContent = fmtTime(t);
  if (vm.dur) vm.dur.textContent = fmtTime(d);
}

function resetSeek() {
  if (!vm.seek) return;
  vm.seeking = false;
  vm.seek.max = "0";
  vm.seek.value = "0";
  vm.seek.disabled = true;
  vm.seek.style.setProperty("--p", "0%");
  if (vm.time) vm.time.textContent = "0:00";
  if (vm.dur) vm.dur.textContent = "0:00";
}

function syncVol() {
  if (!vm.video || !vm.volTxt) return;
  const muted = vm.video.muted || vm.video.volume === 0;
  const pct = Math.round(vm.video.volume * 100);
  vm.volBtn.textContent = muted ? "🔇" : "🔊";
  vm.volBtn.setAttribute("aria-label", muted ? "Turn the volume up" : "Mute sound");
  vm.volTxt.textContent = muted ? "Muted · turn volume up" : "Sound on · " + pct + "%";
  vm.vol.classList.toggle("is-muted", muted);
  if (!muted) vm.volRange.value = pct;
}

/* ─── nudge prompt: reminds the visitor to turn their volume up ─── */
function showNudge() {
  if (!vm.nudge) return;
  clearTimeout(vm.nudgeTimer);
  gsap.killTweensOf(vm.nudge);
  if (vm.nudgePill) vm.nudgePill.classList.add("is-blinking");
  /* lands after the expand finishes and the chrome row has arrived */
  gsap.fromTo(vm.nudge, { opacity: 0, y: -10 }, {
    opacity: 1, y: 0, duration: REDUCE ? 0.01 : 0.4, delay: REDUCE ? 0 : 1.1, ease: "power3.out",
  });
  /* stays a full 5 seconds once it lands (1.1s entrance + 5s on screen) */
  vm.nudgeTimer = window.setTimeout(hideNudge, REDUCE ? 5000 : 6100);
}

function hideNudge() {
  if (!vm.nudge) return;
  clearTimeout(vm.nudgeTimer);
  gsap.killTweensOf(vm.nudge);
  if (vm.nudgePill) vm.nudgePill.classList.remove("is-blinking");
  gsap.to(vm.nudge, { opacity: 0, y: -10, duration: REDUCE ? 0.01 : 0.35, ease: "power2.in" });
}

function openVideoModal(thumbEl) {
  if (!vm.el || !thumbEl || !thumbEl._vid || vm.open) return;
  /* a close may still be animating — finish it first so nothing overlaps */
  if (vm.closing && vm._finish) {
    gsap.killTweensOf([vm.wrap, vm.backdrop, vm.chrome, vm.seekRow, vm.nudge, vm.video]);
    vm._finish();
  }
  const srcVideo = thumbEl._vid;

  vm.open = true;
  vm.source = thumbEl;
  gsap.killTweensOf([vm.video, vm.seekRow, vm.chrome, vm.nudge]);

  const card = thumbEl.closest(".proj-card");
  const h3 = card && card.querySelector("h3");
  vm.title.textContent = h3 ? h3.textContent : "Explainer video";

  vm.video.src = srcVideo.currentSrc || srcVideo.src;
  vm.video.loop = true;
  vm.video.volume = 1;
  vm.video.muted = false;
  /* every open starts from the very beginning */
  const restart = () => { try { if (vm.video.currentTime !== 0) vm.video.currentTime = 0; } catch (e) {} };
  if (vm.video.readyState >= 1) restart();
  else vm.video.addEventListener("loadedmetadata", restart, { once: true });
  resetSeek();

  const first = thumbEl.getBoundingClientRect();

  vm.el.hidden = false;
  vm.el.setAttribute("aria-hidden", "false");
  document.body.classList.add("vm-open");
  (vm.thumbs || []).forEach(t => t._vid.pause());

  const last = vm.wrap.getBoundingClientRect();
  const dur = REDUCE ? 0.01 : 0.7;

  gsap.set(vm.wrap, { transformOrigin: "top left" });
  gsap.fromTo(vm.wrap, {
    x: first.left - last.left,
    y: first.top - last.top,
    scaleX: last.width ? first.width / last.width : 1,
    scaleY: last.height ? first.height / last.height : 1,
  }, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: dur, ease: "power3.inOut" });
  gsap.fromTo(vm.backdrop, { opacity: 0 }, { opacity: 1, duration: REDUCE ? 0.01 : 0.5, ease: "power2.out" });
  gsap.fromTo([vm.chrome, vm.seekRow], { opacity: 0, y: 12 }, {
    opacity: 1, y: 0, duration: REDUCE ? 0.01 : 0.5, delay: REDUCE ? 0 : 0.45, ease: "power3.out",
  });

  /* the volume label arrives */
  vm.vol.classList.remove("is-arriving");
  void vm.vol.offsetWidth;
  vm.vol.classList.add("is-arriving");
  syncVol();

  /* nudge: tell them to turn their volume up while the sound plays */
  showNudge();

  /* voice at full volume — inside the click gesture, so autoplay-with-sound is allowed */
  const p = vm.video.play();
  if (p && p.catch) p.catch(() => { vm.video.muted = true; syncVol(); });

  window.setTimeout(() => { if (vm.open) vm.closeBtn.focus({ preventScroll: true }); }, REDUCE ? 0 : 420);
}

function closeVideoModal() {
  if (!vm.open || !vm.el || vm.closing) return;
  const thumb = vm.source;
  vm.open = false;
  vm.closing = true;

  const finish = () => {
    if (!vm.closing) return;
    vm.closing = false;
    clearTimeout(vm.nudgeTimer);
    if (vm.nudgePill) vm.nudgePill.classList.remove("is-blinking");
    vm.video.pause();
    vm.video.removeAttribute("src");
    try { vm.video.load(); } catch (e) {}
    vm.el.hidden = true;
    vm.el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("vm-open");
    resetSeek();
    gsap.set(vm.wrap, { clearProps: "all" });
    gsap.set([vm.backdrop, vm.chrome, vm.seekRow, vm.nudge], { clearProps: "all" });
    /* let the muted grid videos resume wherever they are visible */
    if (!REDUCE) {
      (vm.thumbs || []).forEach(t => {
        const v = t._vid;
        if (!v) return;
        const r = t.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight && !document.hidden) {
          const q = v.play(); if (q && q.catch) q.catch(() => {});
        } else v.pause();
      });
    }
    if (thumb && document.contains(thumb)) thumb.focus({ preventScroll: true });
    vm.source = null;
    vm._finish = null;
  };
  vm._finish = finish;

  if (!thumb || !document.contains(thumb)) {
    gsap.to(vm.backdrop, { opacity: 0, duration: 0.25, onComplete: finish });
    gsap.to([vm.chrome, vm.seekRow, vm.nudge], { opacity: 0, duration: 0.2 });
    return;
  }

  const last = vm.wrap.getBoundingClientRect();
  const target = thumb.getBoundingClientRect();
  const visible = target.width > 0 && target.bottom > 0 && target.top < window.innerHeight;
  const dur = REDUCE ? 0.01 : 0.55;

  gsap.to(vm.video, { volume: 0, duration: dur * 0.7, ease: "power1.in" });
  gsap.to([vm.chrome, vm.seekRow, vm.nudge], { opacity: 0, y: 12, duration: REDUCE ? 0.01 : 0.3, ease: "power2.in" });
  gsap.to(vm.backdrop, { opacity: 0, duration: REDUCE ? 0.01 : 0.45, ease: "power2.out" });

  if (!visible || REDUCE) {
    gsap.to(vm.wrap, { opacity: 0, scale: 0.97, duration: dur, ease: "power2.in", onComplete: finish });
    return;
  }

  gsap.set(vm.wrap, { transformOrigin: "top left" });
  gsap.to(vm.wrap, {
    x: target.left - last.left,
    y: target.top - last.top,
    scaleX: last.width ? target.width / last.width : 1,
    scaleY: last.height ? target.height / last.height : 1,
    duration: dur,
    ease: "power3.inOut",
    onComplete: finish,
  });
}

/* ─── REVEALS ─── */
function initReveals() {
  const els = document.querySelectorAll(".proj-card, .skill-cat, .stat, .blog-card");

  els.forEach(el => {
    gsap.from(el, {
      y: 40,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
      scrollTrigger: {
        trigger: el,
        start: "top 90%",
        toggleActions: "play none none none",
      },
    });
  });

  document.querySelectorAll(".sec-title").forEach(b => {
    const t = b.querySelectorAll("h2");
    if (!t.length) return;
    const sp = SplitText ? new SplitText(t, { type: "lines", mask: "lines" }) : null;
    if (!sp || !sp.lines) return;
    gsap.set(sp.lines, { yPercent: 100 });
    gsap.to(sp.lines, {
      yPercent: 0,
      ease: "power4.out",
      duration: 0.9,
      stagger: 0.06,
      scrollTrigger: { trigger: b, start: "top 85%", toggleActions: "play none none none" },
    });
  });

  document.querySelectorAll(".st-line").forEach(line => {
    const t = line.querySelector("p, .st-link");
    if (!t) return;
    const sp = SplitText ? new SplitText(t, { type: "lines", mask: "lines" }) : null;
    if (!sp || !sp.lines) return;
    gsap.set(sp.lines, { yPercent: 100 });
    gsap.to(sp.lines, {
      yPercent: 0,
      ease: "power4.out",
      duration: 0.9,
      stagger: 0.05,
      scrollTrigger: { trigger: line, start: "top 90%", toggleActions: "play none none none" },
    });
  });
}

/* ─── GITHUB API (enhances static HTML values; never erases them) ─── */
(() => {
  /* Decorative contribution pattern — rendered regardless of API state */
  const grid = document.getElementById("ghGrid");
  if (grid) {
    for (let i = 0; i < 154; i++) {
      const c = document.createElement("div");
      c.className = "gh-cell";
      const r2 = Math.random();
      if (r2 > .65) c.classList.add("l" + (Math.floor(Math.random() * 4) + 1));
      grid.appendChild(c);
    }
  }

  (async () => {
    try {
      const [u, r] = await Promise.all([
        fetch("https://api.github.com/users/Sneh30"),
        fetch("https://api.github.com/users/Sneh30/repos?per_page=100&sort=updated"),
      ]);
      if (!u.ok || !r.ok) return;
      const user = await u.json();
      const repos = await r.json();
      if (!Array.isArray(repos)) return;

      const set = (id, v) => {
        const el = document.getElementById(id);
        if (el && v !== undefined && v !== null && v !== "") el.textContent = v;
      };
      if (typeof user.public_repos === "number") set("ghRepos", user.public_repos);
      if (typeof user.followers === "number") set("ghFollowers", user.followers);

      const langs = new Set();
      repos.forEach(r2 => { if (r2.language) langs.add(r2.language); });
      if (langs.size) set("ghLang", langs.size);
    } catch { /* API unavailable — static HTML values remain */ }
  })();
})();

/* ─── LEETCODE API (enhances static HTML values; never erases them) ─── */
(async () => {
  try {
    const res = await fetch("https://leetcode-api-pied.vercel.app/user/sneh_sinha3");
    if (!res.ok) throw Error();
    const d = await res.json();
    const s = d?.submitStats?.acSubmissionNum;
    const r = d?.profile?.ranking;
    if (!s) throw Error();
    if (r) { const el = document.getElementById("lcRating"); if (el) el.textContent = r.toLocaleString(); }

    const items = [
      { id: "lcSolved", bar: null, v: s[0]?.count || 0, max: s[0]?.count || 1 },
      { id: "lcEasy", bar: "lcEasyBar", v: s[1]?.count || 0, max: s[0]?.count || 1 },
      { id: "lcMed", bar: "lcMedBar", v: s[2]?.count || 0, max: s[0]?.count || 1 },
    ];
    if (s[3]) items.push({ id: "lcHard", bar: "lcHardBar", v: s[3]?.count || 0, max: s[0]?.count || 1 });

    items.forEach(({ id, bar, v, max }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const paint = (n) => {
        el.textContent = n;
        if (bar) document.getElementById(bar).style.width = Math.min((n / max) * 100, 100) + "%";
      };
      if (REDUCE) { paint(v); return; }
      let c = 0;
      const st = Math.ceil(v / 50);
      const iv = setInterval(() => { c += st; if (c >= v) { c = v; clearInterval(iv); } paint(c); }, 20);
    });
  } catch { /* API unavailable — static HTML values remain */ }
})();

/* ─── TERRAIN ─── */
const Terrain = (() => {
  const cosA = 0.9610554383107709;
  const sinA = 0.27635564856411376;

  return class {
    constructor() {
      this.canvas = document.getElementById('terrain');
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.ripples = [];
      this.mouse = { x: 0, y: 0, active: false };
      this.cam = { pitch: 0.32, panX: 0 };
      this.time = 0;
      this.running = false;
      this.visible = true;
      this.paused = false;
      this.resize();
      this.bind();

      /* Pause when the hero scrolls offscreen or the tab is hidden */
      if ('IntersectionObserver' in window) {
        this._io = new IntersectionObserver((entries) => {
          this.visible = entries[0].isIntersecting;
          this.kick();
        }, { threshold: 0 });
        this._io.observe(this.canvas);
      }
      this._onVis = () => { this.paused = document.hidden; this.kick(); };
      document.addEventListener('visibilitychange', this._onVis);

      this.kick();
    }

    kick() {
      if (this.running || !this.canvas || !this.visible || this.paused) return;
      this.running = true;
      this.animId = requestAnimationFrame((t) => this.tick(t));
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = (this.W = document.documentElement.clientWidth || window.innerWidth);
      const h = (this.H = window.innerHeight);
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const g = Math.min(w, h);
      const low = isMobile() || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
      const dens = low ? 0.72 : 1;
      this.cols = Math.round((w < 640 ? 50 : w < 1024 ? 80 : 120) * dens);
      this.rows = Math.round((w < 640 ? 35 : w < 1024 ? 55 : 80) * dens);
      const spX = (this.spX = (2 * g) / (this.cols - 1));
      const spZ = (this.spZ = (1.6 * g) / (this.rows - 1));
      this.E = 0.11 * g;
      this.A = 0.4 * w;
      this.cx = w / 2;
      this.cy = h / 2;

      const N = this.cols * this.rows;
      this.bx = new Float32Array(N);
      this.bz = new Float32Array(N);
      this.rx = new Float32Array(N);
      this.rz = new Float32Array(N);
      /* Per-frame working buffers — allocated once, reused every frame */
      this.sX = new Float32Array(N);
      this.sY = new Float32Array(N);
      this.hA = new Float32Array(N);
      this.dA = new Float32Array(N);
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const i = r * this.cols + c;
          const px = (c - (this.cols - 1) / 2) * spX;
          const pz = (r - (this.rows - 1) / 2) * spZ;
          this.bx[i] = px;
          this.bz[i] = pz;
          this.rx[i] = cosA * px - sinA * pz;
          this.rz[i] = sinA * px + cosA * pz;
        }
      }

      /* Redraw a static frame immediately if the loop is not running */
      if (!this.running && this.time !== undefined && this.ctx) this.kick();
    }

    getH(x, z) {
      const t = this.time;
      let h = Math.sin(0.007 * x + 0.55 * t) * this.E * 0.5;
      h += Math.sin(0.011 * z + 0.35 * t) * this.E * 0.35;
      h += Math.sin((0.6 * x + 0.8 * z) * 0.005 + 0.2 * t) * this.E * 0.55;
      h += Math.cos(0.018 * x - 0.006 * z + 0.65 * t) * this.E * 0.25;
      for (const r of this.ripples) {
        const e = t - r.t0;
        if (e > 6) continue;
        const dx = x - r.cx;
        const dz = z - r.cz;
        const d = Math.sqrt(dx * dx + dz * dz);
        h += 0.5 * this.E * (1 / (1 + Math.exp((d - 1200 * e) * 0.008))) * Math.exp(-1.2 * e) * Math.sin(0.03 * d - 8 * e);
      }
      return h;
    }

    bind() {
      const addRipple = (clientX, clientY) => {
        const g = Math.min(this.W, this.H);
        this.ripples.push({
          cx: (clientX / this.W - 0.5) * 2 * g,
          cz: (clientY / this.H - 0.5) * 2 * g * 0.8,
          t0: this.time,
        });
        if (this.ripples.length > 6) this.ripples.shift();
      };

      const onMove = (e) => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.active = true;
      };
      const onLeave = () => { this.mouse.active = false; };
      const onClick = (e) => { addRipple(e.clientX, e.clientY); };

      const onTouchStart = (e) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this.mouse.x = t.clientX;
          this.mouse.y = t.clientY;
          this.mouse.active = true;
          addRipple(t.clientX, t.clientY);
        }
      };
      const onTouchMove = (e) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this.mouse.x = t.clientX;
          this.mouse.y = t.clientY;
          this.mouse.active = true;
        }
      };
      const onTouchEnd = () => { this.mouse.active = false; };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseleave', onLeave);
      window.addEventListener('click', onClick);
      window.addEventListener('touchstart', onTouchStart, { passive: true });
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('resize', () => this.resize());

      this._clean = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseleave', onLeave);
        window.removeEventListener('click', onClick);
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      };
    }

    tick(ts) {
      if (!this._t0) this._t0 = ts;
      const dt = Math.min(0.05, (ts - this._t0) / 1000);
      this._t0 = ts;
      this.time += dt;

      const { ctx, W, H, cols, rows, bx, bz, rx, rz, cx, cy } = this;
      const N = cols * rows;

      let tp = 0.32;
      let tpx = 0;
      if (this.mouse.active) {
        const nx = this.mouse.x / W - 0.5;
        const ny = this.mouse.y / H - 0.5;
        tpx = -nx * this.A * 2;
        tp = 0.32 - 0.45 * ny * 2;
      }
      const b = 1 - Math.exp(-dt / 0.35);
      this.cam.pitch += (tp - this.cam.pitch) * b;
      this.cam.panX += (tpx - this.cam.panX) * b;

      const cp = Math.cos(this.cam.pitch);
      const sp = Math.sin(this.cam.pitch);
      const panX = this.cam.panX;

      ctx.fillStyle = '#080809';
      ctx.fillRect(0, 0, W, H);

      const sX = this.sX, sY = this.sY, hA = this.hA, dA = this.dA;
      let mnH = Infinity, mxH = -Infinity, mnD = Infinity, mxD = -Infinity;

      for (let i = 0; i < N; i++) {
        const h = this.getH(bx[i], bz[i]);
        hA[i] = h;
        if (h < mnH) mnH = h;
        if (h > mxH) mxH = h;

        const a = h * cp - rz[i] * sp;
        const s = h * sp + rz[i] * cp;
        const sc = 1 + 0.0012 * s;

        sX[i] = cx + panX + rx[i] * sc;
        sY[i] = cy - a * sc;
        dA[i] = s;
        if (s < mnD) mnD = s;
        if (s > mxD) mxD = s;
      }

      this.ripples = this.ripples.filter((r) => this.time - r.t0 <= 6);

      const rH = Math.max(0.01, mxH - mnH);
      const rD = Math.max(0.01, mxD - mnD);

      for (let r = 0; r < rows; r++) {
        const i = r * cols;
        const dt_ = (dA[i + (cols >> 1)] - mnD) / rD;
        ctx.strokeStyle = '#2d2d2d';
        ctx.lineWidth = 0.3 + (1 - dt_) * 0.4;
        ctx.globalAlpha = 0.04 + (1 - dt_) * 0.22;
        ctx.beginPath();
        ctx.moveTo(sX[i], sY[i]);
        for (let c = 1; c < cols; c++) ctx.lineTo(sX[i + c], sY[i + c]);
        ctx.stroke();
      }

      for (let c = 0; c < cols; c++) {
        const dt_ = (dA[(rows >> 1) * cols + c] - mnD) / rD;
        ctx.strokeStyle = '#2d2d2d';
        ctx.lineWidth = 0.25 + (1 - dt_) * 0.25;
        ctx.globalAlpha = 0.03 + (1 - dt_) * 0.12;
        ctx.beginPath();
        ctx.moveTo(sX[c], sY[c]);
        for (let r = 1; r < rows; r++) ctx.lineTo(sX[r * cols + c], sY[r * cols + c]);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      for (let i = 0; i < N; i++) {
        const hT = (hA[i] - mnH) / rH;
        const dT = (dA[i] - mnD) / rD;
        const l = 1 - 0.75 * dT;
        const s = (0.4 + 1.4 * hT) * l;
        const a = (0.15 + 0.85 * hT) * l;
        if (a < 0.25) continue;
        ctx.fillStyle = hT > 0.6 ? 'rgb(180,180,180)' : 'rgb(102,102,102)';
        ctx.globalAlpha = a;
        ctx.fillRect(sX[i] - s, sY[i] - s, 2 * s, 2 * s);
      }

      ctx.globalAlpha = 1;

      /* Stop when offscreen/tab hidden; draw exactly one frame under reduced motion */
      if (this.visible && !this.paused && !REDUCE) {
        this.animId = requestAnimationFrame((t) => this.tick(t));
      } else {
        this.running = false;
      }
    }

    destroy() {
      cancelAnimationFrame(this.animId);
      if (this._io) this._io.disconnect();
      if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
      if (this._clean) this._clean();
    }
  };
})();

/* ─── CURSOR (Desktop only) ─── */
function initCursor() {
  const clH = document.getElementById('clH');
  const clV = document.getElementById('clV');
  const clDot = document.getElementById('clDot');
  const clTrail = document.getElementById('clTrail');
  const clCoords = document.getElementById('clCoords');
  const clClick = document.getElementById('clClick');
  if (!clH || !clV) return;

  let clickCount = 0;
  const trail = [];
  let trailAnim = null;
  let trailCtx = null;

  if (clTrail) {
    clTrail.width = document.documentElement.clientWidth || window.innerWidth;
    clTrail.height = window.innerHeight;
    trailCtx = clTrail.getContext('2d');
    window.addEventListener('resize', () => {
      clTrail.width = document.documentElement.clientWidth || window.innerWidth;
      clTrail.height = window.innerHeight;
    });
  }

  const drawTrail = () => {
    if (!trailCtx) return;
    trailCtx.clearRect(0, 0, clTrail.width, clTrail.height);
    if (trail.length < 2) return;
    trailCtx.beginPath();
    trailCtx.strokeStyle = 'rgba(220,220,230,.25)';
    trailCtx.lineWidth = .6;
    trailCtx.setLineDash([2, 5]);
    trailCtx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) trailCtx.lineTo(trail[i].x, trail[i].y);
    trailCtx.stroke();
  };

  const update = (x, y) => {
    clH.style.top = y + 'px';
    clV.style.left = x + 'px';
    clDot.style.left = x + 'px';
    clDot.style.top = y + 'px';
    clCoords.textContent = String(x).padStart(4, '0') + ', ' + String(y).padStart(4, '0');
    trail.push({ x, y });
    if (trail.length > 40) trail.shift();
    drawTrail();
  };

  const onClick = (e) => {
    clickCount++;
    if (clClick) clClick.textContent = String(clickCount).padStart(4, '0');

    clDot.style.width = '12px';
    clDot.style.height = '12px';
    clDot.style.marginLeft = '-6px';
    clDot.style.marginTop = '-6px';
    clDot.style.background = 'rgba(220,220,230,.8)';

    if (trailAnim) cancelAnimationFrame(trailAnim);
    const start = performance.now();
    const fade = (t) => {
      const p = (t - start) / 400;
      if (p < 1) {
        const s = 4 + 8 * (1 - p);
        clDot.style.width = s + 'px';
        clDot.style.height = s + 'px';
        clDot.style.marginLeft = -(s / 2) + 'px';
        clDot.style.marginTop = -(s / 2) + 'px';
        clDot.style.background = `rgba(220,220,230,${0.8 * (1 - p)})`;
        trailAnim = requestAnimationFrame(fade);
      } else {
        clDot.style.width = '4px';
        clDot.style.height = '4px';
        clDot.style.marginLeft = '-2px';
        clDot.style.marginTop = '-2px';
        clDot.style.background = 'rgba(220,220,230,.6)';
        trailAnim = null;
      }
    };
    trailAnim = requestAnimationFrame(fade);
  };

  window.addEventListener('mousemove', (e) => update(e.clientX, e.clientY));
  window.addEventListener('click', onClick);
}
