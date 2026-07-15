const progressBar = document.getElementById('scrollProgress');
window.addEventListener('scroll', () => {
  const h = document.documentElement;
  const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  progressBar.style.width = pct + '%';
});

const nav = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 50);
});

const toggle = document.getElementById('menuToggle');
const links = document.getElementById('navLinks');
toggle.addEventListener('click', () => {
  toggle.classList.toggle('open');
  links.classList.toggle('open');
});
links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  toggle.classList.remove('open');
  links.classList.remove('open');
}));

const backTop = document.getElementById('backTop');
window.addEventListener('scroll', () => {
  backTop.classList.toggle('visible', window.scrollY > 400);
});

const dot = document.getElementById('cursorDot');
const ring = document.getElementById('cursorRing');
document.addEventListener('mousemove', e => {
  dot.style.left = e.clientX + 'px';
  dot.style.top = e.clientY + 'px';
  ring.style.left = e.clientX + 'px';
  ring.style.top = e.clientY + 'px';
});
document.querySelectorAll('a, button, .btn-primary, .btn-outline, .project-card, .skill-cat, .blog-card, .nav-cta, .contact-socials a, .form-btn').forEach(el => {
  el.addEventListener('mouseenter', () => ring.classList.add('hover'));
  el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
});

const words = [
  'AI Engineer',
  'Multimodal Agent Builder',
  'Cloud Infrastructure Hacker',
  'Embedded Systems Tinkerer',
  'Open Source Contributor'
];
let wordIdx = 0, charIdx = 0, isDeleting = false;
const typingEl = document.getElementById('typing');
function type() {
  const current = words[wordIdx];
  if (!isDeleting) {
    typingEl.textContent = current.slice(0, ++charIdx);
    if (charIdx === current.length) setTimeout(() => isDeleting = true, 1800);
  } else {
    typingEl.textContent = current.slice(0, --charIdx);
    if (charIdx === 0) { isDeleting = false; wordIdx = (wordIdx + 1) % words.length; }
  }
  setTimeout(type, isDeleting ? 40 : 80);
}
type();

const canvas = document.getElementById('hero-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let mouse = { x: -1000, y: -1000 };

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const P_COUNT = 80;
for (let i = 0; i < P_COUNT; i++) {
  particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * .6, vy: (Math.random() - 0.5) * .6, r: Math.random() * 2 + 1 });
}

canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mouseleave', () => { mouse.x = -1000; mouse.y = -1000; });

function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let p of particles) {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    const dx = p.x - mouse.x, dy = p.y - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 120) { p.x += (dx / dist) * 1.2; p.y += (dy / dist) * 1.2; }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(124, 58, 237, ${.3 + p.r / 8})`; ctx.fill();
  }
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(124, 58, 237, ${.08 * (1 - dist / 150)})`;
        ctx.lineWidth = .5; ctx.stroke();
      }
    }
  }
  requestAnimationFrame(drawParticles);
}
drawParticles();

document.querySelectorAll('.project-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / centerY * -6;
    const rotateY = (x - centerX) / centerX * 6;
    const inner = card.querySelector('.project-card-inner');
    inner.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });
  card.addEventListener('mouseleave', () => {
    const inner = card.querySelector('.project-card-inner');
    inner.style.transform = 'rotateX(0) rotateY(0)';
  });
});

async function fetchGitHub() {
  try {
    const [userRes, reposRes] = await Promise.all([
      fetch('https://api.github.com/users/Sneh30'),
      fetch('https://api.github.com/users/Sneh30/repos?per_page=100&sort=updated')
    ]);
    const user = await userRes.json();
    const repos = await reposRes.json();

    document.getElementById('ghRepos').textContent = user.public_repos;
    document.getElementById('ghFollowers').textContent = user.followers;

    const allLangs = new Set();
    let starCount = 0;
    repos.forEach(r => {
      if (r.language) allLangs.add(r.language);
      starCount += r.stargazers_count;
    });
    document.getElementById('ghLang').textContent = allLangs.size || '—';
    document.getElementById('ghStars').textContent = starCount;

    const grid = document.getElementById('contribGrid');
    for (let i = 0; i < 140; i++) {
      const cell = document.createElement('div');
      cell.className = 'contrib-cell';
      const r = Math.random();
      if (r > .7) cell.classList.add('l' + (Math.floor(Math.random() * 4) + 1));
      grid.appendChild(cell);
    }
  } catch (e) {
    document.querySelectorAll('#ghStats .gh-stat-num span').forEach(s => s.textContent = '—');
  }
}
fetchGitHub();

async function fetchContribs() {
  try {
    const res = await fetch('https://github.com/users/Sneh30/contributions');
    const html = await res.text();
    const match = html.match(/(\d[\d,]*)\s+contributions/);
    if (match) document.getElementById('ghContribs').textContent = match[1].replace(/,/g, '') + '+';
  } catch (e) { }
}
fetchContribs();

async function fetchLeetCode() {
  try {
    const res = await fetch('https://leetcode-api-pied.vercel.app/user/sneh_sinha3');
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const stats = data?.submitStats?.acSubmissionNum;
    const ranking = data?.profile?.ranking;
    if (!stats) throw new Error('No data');
    if (ranking) document.getElementById('lcRating').textContent = ranking.toLocaleString();
    const lcEls = [
      { id: 'lcSolved', val: stats[0]?.count || 0 },
      { id: 'lcEasy', val: stats[1]?.count || 0 },
      { id: 'lcMed', val: stats[2]?.count || 0 },
    ];
    lcEls.forEach(({ id, val }) => {
      const el = document.getElementById(id);
      let current = 0;
      const step = Math.ceil(val / 50);
      const interval = setInterval(() => {
        current += step;
        if (current >= val) { current = val; clearInterval(interval); }
        el.textContent = current;
      }, 20);
    });
  } catch (e) {
    document.querySelectorAll('#lcStats [id]').forEach(el => { if (el.id.startsWith('lc')) el.textContent = '—'; });
  }
}
fetchLeetCode();

function animateCount(el) {
  const target = parseInt(el.dataset.count);
  let current = 0;
  const step = Math.ceil(target / 50);
  const interval = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(interval); }
    el.textContent = current + (el.closest('#heroStats') ? '+' : '');
  }, 20);
}

setTimeout(() => {
  document.querySelectorAll('#heroStats [data-count]').forEach(n => {
    if (!n.dataset.counted) { n.dataset.counted = '1'; animateCount(n); }
  });
}, 600);

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: .15, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
