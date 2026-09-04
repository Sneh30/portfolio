gsap.registerPlugin(ScrollTrigger, SplitText, ScrollSmoother);

const BP = 992;
const desk = () => window.innerWidth >= BP;
const isMobile = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

let sm;

window.addEventListener('DOMContentLoaded', () => {
  sm = ScrollSmoother.create({
    wrapper: "#wrapper",
    content: "#content",
    smooth: desk() ? 1 : 0,
    smoothTouch: 0,
  });

  initNav();
  initHero();
  initProjects();
  initReveals();
  new Terrain();
  if (!isMobile()) initCursor();

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

/* ─── PROJECTS ─── */
function initProjects() {
  const track = document.getElementById("projTrack");
  const wrap = document.querySelector(".proj-track-wrap");
  if (!track || !wrap) return;

  const cards = track.querySelectorAll(".proj-card");
  if (!cards.length) return;

  if (desk()) {
    const totalScroll = track.scrollWidth - window.innerWidth + 64;

    gsap.to(track, {
      x: -totalScroll,
      ease: "none",
      scrollTrigger: {
        trigger: "#projects",
        start: "top top",
        end: "+=" + totalScroll,
        pin: true,
        pinSpacing: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
  } else {
    wrap.style.overflowX = "auto";
    wrap.style.webkitOverflowScrolling = "touch";
    wrap.style.scrollSnapType = "x mandatory";
    track.style.width = "max-content";

    cards.forEach(card => {
      card.style.scrollSnapAlign = "start";
      card.style.minWidth = "calc(100vw - 48px)";
      card.style.maxWidth = "340px";
      card.style.flexShrink = "0";
    });
  }
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

/* ─── GITHUB API ─── */
(async () => {
  try {
    const [u, r] = await Promise.all([
      fetch("https://api.github.com/users/Sneh30"),
      fetch("https://api.github.com/users/Sneh30/repos?per_page=100&sort=updated"),
    ]);
    const user = await u.json();
    const repos = await r.json();

    document.getElementById("ghRepos").textContent = user.public_repos;
    document.getElementById("ghFollowers").textContent = user.followers;

    const langs = new Set();
    let stars = 0;
    repos.forEach(r => { if (r.language) langs.add(r.language); stars += r.stargazers_count; });
    document.getElementById("ghLang").textContent = langs.size || "—";
    document.getElementById("ghStars").textContent = stars;

    const grid = document.getElementById("ghGrid");
    for (let i = 0; i < 154; i++) {
      const c = document.createElement("div");
      c.className = "gh-cell";
      const r2 = Math.random();
      if (r2 > .65) c.classList.add("l" + (Math.floor(Math.random() * 4) + 1));
      grid.appendChild(c);
    }
  } catch { document.querySelectorAll("#ghStats .stat-num span").forEach(s => s.textContent = "—"); }
})();

(async () => {
  try {
    const res = await fetch("https://github.com/users/Sneh30/contributions");
    const html = await res.text();
    const m = html.match(/([\d,]+)\s+contributions\s+in/);
    if (m) document.getElementById("ghContribs").textContent = m[1].replace(/,/g, "") + "+";
  } catch {}
})();

/* ─── LEETCODE API ─── */
(async () => {
  try {
    const res = await fetch("https://leetcode-api-pied.vercel.app/user/sneh_sinha3");
    if (!res.ok) throw Error();
    const d = await res.json();
    const s = d?.submitStats?.acSubmissionNum;
    const r = d?.profile?.ranking;
    if (!s) throw Error();
    if (r) document.getElementById("lcRating").textContent = r.toLocaleString();

    const items = [
      { id: "lcSolved", bar: null, v: s[0]?.count || 0, max: s[0]?.count || 1 },
      { id: "lcEasy", bar: "lcEasyBar", v: s[1]?.count || 0, max: s[0]?.count || 1 },
      { id: "lcMed", bar: "lcMedBar", v: s[2]?.count || 0, max: s[0]?.count || 1 },
    ];
    if (s[3]) items.push({ id: "lcHard", bar: "lcHardBar", v: s[3]?.count || 0, max: s[0]?.count || 1 });

    items.forEach(({ id, bar, v, max }) => {
      const el = document.getElementById(id);
      if (!el) return;
      let c = 0;
      const st = Math.ceil(v / 50);
      const iv = setInterval(() => { c += st; if (c >= v) { c = v; clearInterval(iv); } el.textContent = c; if (bar) document.getElementById(bar).style.width = Math.min((c / max) * 100, 100) + "%"; }, 20);
    });
  } catch { document.querySelectorAll("#lcStats [id]").forEach(el => { if (el.id.startsWith("lc")) el.textContent = "—"; }); }
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
      this.resize();
      this.bind();
      this.animId = requestAnimationFrame((t) => this.tick(t));
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = (this.W = window.innerWidth);
      const h = (this.H = window.innerHeight);
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const g = Math.min(w, h);
      this.cols = w < 640 ? 50 : w < 1024 ? 80 : 120;
      this.rows = w < 640 ? 35 : w < 1024 ? 55 : 80;
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

      const sX = new Float32Array(N);
      const sY = new Float32Array(N);
      const hA = new Float32Array(N);
      const dA = new Float32Array(N);
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

      this.animId = requestAnimationFrame((t) => this.tick(t));
    }

    destroy() {
      cancelAnimationFrame(this.animId);
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
    clTrail.width = window.innerWidth;
    clTrail.height = window.innerHeight;
    trailCtx = clTrail.getContext('2d');
    window.addEventListener('resize', () => {
      clTrail.width = window.innerWidth;
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
