#!/usr/bin/env node
/**
 * ZETICUZ profile auto-sync.
 *
 * Scans every public repository owned by the user (originals + allow-listed forks),
 * reads language byte counts, 52-week contribution calendar, and dependency manifests,
 * and regenerates:
 *   - assets/hub-header.svg           (Header description & OPERATOR.PROFILE)
 *   - assets/kpi-telemetry.svg        (Top 4 KPI hover cards & live heatmap)
 *   - assets/language-stack-3d.svg    (Core runtimes & clean Neon-Glow language bars)
 *   - assets/engineering-spectrum.svg (6-category dependency matrix with brand hover)
 *   - assets/system-stats.svg         (6-card live GitHub analytics strip)
 *   - assets/projects-list.svg        (8 featured/recent repos with live progress rings)
 *   - data/profile-data.json          (Audited raw metrics snapshot)
 *   - README.md                       (Clean 6-panel telemetry layout)
 *
 * Runs locally (`node scripts/sync-profile.mjs`) or in GitHub Actions.
 * Token: GH_TOKEN | GITHUB_TOKEN | PROFILE_TOKEN env var.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.PROFILE_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('Missing token: set PROFILE_TOKEN, GH_TOKEN or GITHUB_TOKEN');
  process.exit(1);
}
const config = JSON.parse(await readFile(path.join(ROOT, 'profile.config.json'), 'utf8'));
const USER = config.username;

// ───────────────────────────── GitHub API helpers ─────────────────────────────
const headers = { Authorization: `bearer ${TOKEN}`, 'User-Agent': 'zeticuz-profile-sync' };

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function rest(p) {
  const res = await fetch(`https://api.github.com${p}`, {
    headers: { ...headers, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return null;
  return res.json();
}

async function raw(repo, branch, file) {
  const url = `https://raw.githubusercontent.com/${USER}/${repo}/${encodeURIComponent(branch)}/${file.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, { headers });
  return res.ok ? res.text() : null;
}

async function fetchProfile() {
  const repos = [];
  let cursor = null;
  let user;
  do {
    const data = await gql(
      `query($login:String!, $cursor:String) {
        user(login:$login) {
          name login createdAt followers { totalCount } following { totalCount }
          publicRepos: repositories(privacy: PUBLIC, ownerAffiliations: OWNER) { totalCount }
          contributionsCollection {
            totalCommitContributions totalPullRequestContributions totalIssueContributions
            contributionCalendar {
              totalContributions
              weeks {
                firstDay
                contributionDays { contributionCount date weekday }
              }
            }
          }
          repositories(first: 100, after: $cursor, privacy: PUBLIC, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              name description homepageUrl url isFork isArchived pushedAt createdAt
              stargazerCount forkCount diskUsage
              defaultBranchRef { name }
              primaryLanguage { name color }
              languages(first: 20, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } }
              repositoryTopics(first: 20) { nodes { topic { name } } }
            }
          }
        }
      }`,
      { login: USER, cursor },
    );
    user = data.user;
    repos.push(...user.repositories.nodes);
    cursor = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (cursor);
  return { user, repos };
}

// ───────────────────────────── Technology catalog ─────────────────────────────
const CATALOG = [
  // Frontend
  { name: 'React', cat: 'frontend', color: '61DAFB', deps: ['react'] },
  { name: 'Next.js', cat: 'frontend', color: 'FFFFFF', deps: ['next'] },
  { name: 'TypeScript', cat: 'frontend', color: '3178C6', deps: ['typescript'], lang: 'TypeScript' },
  { name: 'JavaScript', cat: 'frontend', color: 'F1E05A', lang: 'JavaScript' },
  { name: 'Vite', cat: 'frontend', color: 'A855F7', deps: ['vite'] },
  { name: 'Vue', cat: 'frontend', color: '4FC08D', deps: ['vue'] },
  { name: 'Svelte', cat: 'frontend', color: 'FF3E00', deps: ['svelte'] },
  { name: 'Tailwind CSS', cat: 'frontend', color: '38BDF8', deps: ['tailwindcss', '@tailwindcss/*'], files: [/(^|\/)tailwind\.config\.[cm]?[jt]s$/] },
  { name: 'Radix UI', cat: 'frontend', color: 'F8FAFC', deps: ['@radix-ui/*'] },
  { name: 'React Router', cat: 'frontend', color: 'F43F5E', deps: ['react-router', 'react-router-dom'] },
  { name: 'TanStack Query', cat: 'frontend', color: 'FF4154', deps: ['@tanstack/react-query'] },
  { name: 'Zustand', cat: 'frontend', color: 'F59E0B', deps: ['zustand'] },
  { name: 'Redux', cat: 'frontend', color: '764ABC', deps: ['redux', '@reduxjs/toolkit'] },
  { name: 'Sass', cat: 'frontend', color: 'CC6699', deps: ['sass', 'node-sass'] },
  { name: 'HTML5', cat: 'frontend', color: 'F97316', lang: 'HTML' },
  { name: 'CSS3', cat: 'frontend', color: '3B82F6', lang: 'CSS' },
  { name: 'Lucide', cat: 'frontend', color: 'FB923C', deps: ['lucide-react', 'lucide'] },
  // 3D, motion & visualisation
  { name: 'Three.js', cat: 'creative', color: 'FFFFFF', deps: ['three'], files: [/three\.min\.js$/i] },
  { name: 'WebGL', cat: 'creative', color: 'EF4444', deps: ['three', '@react-three/fiber'], files: [/three\.min\.js$/i] },
  { name: 'Swiper', cat: 'creative', color: '6366F1', deps: ['swiper'], files: [/swiper-bundle\.min\.js$/i] },
  { name: 'React Three Fiber', cat: 'creative', color: '38BDF8', deps: ['@react-three/fiber'] },
  { name: 'GSAP', cat: 'creative', color: '88CE02', deps: ['gsap', '@gsap/*'], files: [/gsap\.min\.js$/i] },
  { name: 'Framer Motion', cat: 'creative', color: 'E879F9', deps: ['framer-motion', 'motion'] },
  { name: 'Lenis', cat: 'creative', color: 'F472B6', deps: ['lenis', '@studio-freight/lenis'] },
  { name: 'Lottie', cat: 'creative', color: '00DDB3', deps: ['lottie-web', 'lottie-react', '@lottiefiles/*'] },
  { name: 'Spline', cat: 'creative', color: 'A855F7', deps: ['@splinetool/*'] },
  { name: 'Chart.js', cat: 'creative', color: 'FF6384', deps: ['chart.js', 'react-chartjs-2'] },
  { name: 'Recharts', cat: 'creative', color: '22D3EE', deps: ['recharts'] },
  { name: 'D3.js', cat: 'creative', color: 'F9A03C', deps: ['d3'] },
  { name: 'Leaflet', cat: 'creative', color: '22C55E', deps: ['leaflet', 'react-leaflet'] },
  // Backend & APIs
  { name: 'Node.js', cat: 'backend', color: '22C55E', deps: ['express', 'fastify', 'koa', 'hono', '@nestjs/core', 'socket.io', 'nodemon', 'ws', 'dotenv', 'tsx', 'ts-node', 'node-fetch', 'cors', 'body-parser'] },
  { name: 'Express', cat: 'backend', color: 'E2E8F0', deps: ['express'] },
  { name: 'Fastify', cat: 'backend', color: 'E2E8F0', deps: ['fastify'] },
  { name: 'Hono', cat: 'backend', color: 'E36002', deps: ['hono'] },
  { name: 'NestJS', cat: 'backend', color: 'E0234E', deps: ['@nestjs/core'] },
  { name: 'Socket.IO', cat: 'backend', color: 'F8FAFC', deps: ['socket.io', 'socket.io-client'] },
  { name: 'GraphQL', cat: 'backend', color: 'E10098', deps: ['graphql', '@apollo/*', 'graphql-request', 'urql'] },
  { name: 'Python', cat: 'backend', color: '60A5FA', lang: 'Python' },
  { name: 'FastAPI', cat: 'backend', color: '14B8A6', py: ['fastapi'] },
  { name: 'Flask', cat: 'backend', color: 'E2E8F0', py: ['flask'] },
  { name: 'Django', cat: 'backend', color: '10B981', py: ['django'] },
  { name: 'Axios', cat: 'backend', color: '8B5CF6', deps: ['axios'] },
  { name: 'Cheerio', cat: 'backend', color: 'F59E0B', deps: ['cheerio'] },
  { name: 'Puppeteer', cat: 'backend', color: '40B5A4', deps: ['puppeteer', 'puppeteer-core', 'puppeteer-extra'] },
  { name: 'JWT Auth', cat: 'backend', color: 'D946EF', deps: ['jsonwebtoken', 'jose', 'jwt-decode'] },
  { name: 'Zod', cat: 'backend', color: '60A5FA', deps: ['zod'] },
  { name: 'HLS.js', cat: 'backend', color: 'F97316', deps: ['hls.js', 'video.js', '@videojs/*', 'm3u8-parser'] },
  { name: 'FFmpeg', cat: 'backend', color: '22C55E', deps: ['fluent-ffmpeg', '@ffmpeg/*', 'ffmpeg-static'] },
  { name: 'PDF Engine', cat: 'backend', color: 'EF4444', deps: ['pdf-lib', 'pdfjs-dist', 'jspdf', '@react-pdf/renderer', 'pdfkit'] },
  { name: 'OpenAI', cat: 'backend', color: 'A855F7', deps: ['openai'], py: ['openai'] },
  { name: 'Gemini AI', cat: 'backend', color: '8E75B2', deps: ['@google/generative-ai', '@google/genai'], py: ['google-generativeai', 'google-genai'] },
  { name: 'Pydantic', cat: 'backend', color: 'E92063', py: ['pydantic'] },
  { name: 'Pandas', cat: 'backend', color: '60A5FA', py: ['pandas'] },
  { name: 'Selenium', cat: 'backend', color: '43B02A', py: ['selenium'], deps: ['selenium-webdriver'] },
  { name: 'Go', cat: 'backend', color: '00ADD8', lang: 'Go', files: [/(^|\/)go\.mod$/] },
  { name: 'Rust', cat: 'backend', color: 'DEA584', lang: 'Rust', files: [/(^|\/)Cargo\.toml$/] },
  // Data & cloud
  { name: 'MongoDB', cat: 'cloud', color: '22C55E', deps: ['mongodb', 'mongoose'], py: ['pymongo', 'motor'] },
  { name: 'PostgreSQL', cat: 'cloud', color: '60A5FA', deps: ['pg', 'postgres', '@neondatabase/serverless', '@vercel/postgres'], py: ['psycopg2', 'psycopg2-binary', 'asyncpg', 'psycopg'], lang: 'PLpgSQL' },
  { name: 'MySQL', cat: 'cloud', color: '38BDF8', deps: ['mysql', 'mysql2'], py: ['pymysql', 'mysqlclient'] },
  { name: 'SQLite', cat: 'cloud', color: '38BDF8', deps: ['better-sqlite3', 'sqlite3', 'sqlite', 'sql.js'], py: ['aiosqlite'] },
  { name: 'Prisma', cat: 'cloud', color: 'A78BFA', deps: ['prisma', '@prisma/client'], files: [/(^|\/)schema\.prisma$/] },
  { name: 'Drizzle ORM', cat: 'cloud', color: 'C5F74F', deps: ['drizzle-orm'] },
  { name: 'SQLAlchemy', cat: 'cloud', color: 'F87171', py: ['sqlalchemy'] },
  { name: 'Supabase', cat: 'cloud', color: '3ECF8E', deps: ['@supabase/supabase-js', '@supabase/ssr'], py: ['supabase'], files: [/(^|\/)supabase\/config\.toml$/] },
  { name: 'Firebase', cat: 'cloud', color: 'F59E0B', deps: ['firebase', 'firebase-admin'], py: ['firebase-admin'], files: [/(^|\/)firebase\.json$/] },
  { name: 'Redis', cat: 'cloud', color: 'EF4444', deps: ['redis', 'ioredis', '@upstash/redis'], py: ['redis'] },
  { name: 'IndexedDB', cat: 'cloud', color: 'A855F7', deps: ['dexie', 'idb', 'idb-keyval', 'localforage'] },
  { name: 'Vercel', cat: 'cloud', color: 'FFFFFF', deps: ['@vercel/*'], files: [/(^|\/)vercel\.json$/], home: /vercel\.app/ },
  { name: 'Netlify', cat: 'cloud', color: '00C7B7', files: [/(^|\/)netlify\.toml$/], home: /netlify\.app/ },
  { name: 'Cloudflare', cat: 'cloud', color: 'F38020', deps: ['wrangler', '@cloudflare/*'], files: [/(^|\/)wrangler\.(toml|jsonc?)$/], home: /(workers\.dev|pages\.dev)/ },
  { name: 'Docker', cat: 'cloud', color: '2496ED', files: [/(^|\/)Dockerfile$/, /(^|\/)docker-compose\.ya?ml$/, /(^|\/)compose\.ya?ml$/] },
  { name: 'GitHub Actions', cat: 'cloud', color: '38BDF8', files: [/^\.github\/workflows\/.+\.ya?ml$/] },
  // Mobile & desktop
  { name: 'React Native', cat: 'mobile', color: '61DAFB', deps: ['react-native'] },
  { name: 'Expo', cat: 'mobile', color: 'E2E8F0', deps: ['expo'] },
  { name: 'Electron', cat: 'mobile', color: '38BDF8', deps: ['electron'] },
  { name: 'Tauri', cat: 'mobile', color: '24C8DB', deps: ['@tauri-apps/*'] },
  { name: 'Capacitor', cat: 'mobile', color: '119EFF', deps: ['@capacitor/core'] },
  { name: 'Android', cat: 'mobile', color: '3DDC84', files: [/\.apk$/i, /(^|\/)android\//] },
  { name: 'PWA', cat: 'mobile', color: 'A855F7', deps: ['vite-plugin-pwa', 'next-pwa', '@ducanh2912/next-pwa', 'workbox-*', '@serwist/*', 'serwist'], files: [/(^|\/)(manifest\.webmanifest|site\.webmanifest)$/] },
  // Testing & tooling
  { name: 'Playwright', cat: 'tooling', color: '2EAD33', deps: ['playwright', '@playwright/test', 'playwright-extra', 'playwright-core'], py: ['playwright'] },
  { name: 'Vitest', cat: 'tooling', color: '84CC16', deps: ['vitest'] },
  { name: 'Jest', cat: 'tooling', color: 'EF4444', deps: ['jest'] },
  { name: 'Testing Library', cat: 'tooling', color: 'F87171', deps: ['@testing-library/*'] },
  { name: 'ESLint', cat: 'tooling', color: '8B5CF6', deps: ['eslint'] },
  { name: 'PostCSS', cat: 'tooling', color: 'FB923C', deps: ['postcss'] },
];

const CATEGORIES = [
  { key: 'frontend', title: 'Frontend' },
  { key: 'creative', title: '3D, Motion & Data Viz' },
  { key: 'backend', title: 'Backend, APIs & AI' },
  { key: 'cloud', title: 'Data, Cloud & DevOps' },
  { key: 'mobile', title: 'Mobile, Desktop & PWA' },
  { key: 'tooling', title: 'Testing & Tooling' },
];

const IGNORED_PATH = /(^|\/)(node_modules|vendor|dist|build|out|\.next|\.nuxt|coverage|\.venv|venv|site-packages|bower_components|__pycache__|fixtures?|__fixtures__|\.git)\//;
const MANIFEST = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|Cargo\.toml|go\.mod)$/;

function matchDep(pattern, dep) {
  return pattern.endsWith('*') ? dep.startsWith(pattern.slice(0, -1)) : dep === pattern;
}

function parsePython(text) {
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^["']?([A-Za-z0-9_.\-]+)/);
    if (m && !line.trim().startsWith('#') && !line.trim().startsWith('[')) names.add(m[1].toLowerCase().replace(/_/g, '-'));
  }
  return names;
}

async function scanRepo(repo) {
  const branch = repo.defaultBranchRef?.name;
  const result = { npm: new Set(), py: new Set(), files: [], manifests: 0 };
  if (!branch) return result;
  const tree = await rest(`/repos/${USER}/${repo.name}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const paths = (tree?.tree || []).filter((t) => t.type === 'blob').map((t) => t.path).filter((p) => !IGNORED_PATH.test(p));
  result.files = paths;
  const manifests = paths.filter((p) => MANIFEST.test(p)).sort((a, b) => a.split('/').length - b.split('/').length).slice(0, 15);
  await Promise.all(
    manifests.map(async (file) => {
      const text = await raw(repo.name, branch, file);
      if (!text) return;
      result.manifests++;
      if (file.endsWith('package.json')) {
        try {
          const pkg = JSON.parse(text);
          for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
            Object.keys(pkg[k] || {}).forEach((d) => result.npm.add(d));
          }
        } catch { /* ignore malformed package.json */ }
      } else if (/requirements|pyproject|Pipfile/i.test(file)) {
        parsePython(text).forEach((d) => result.py.add(d));
      }
    }),
  );
  return result;
}

function detectTech(repo, scan) {
  const langs = new Set(repo.languages.edges.map((e) => e.node.name));
  const found = [];
  for (const t of CATALOG) {
    const hit =
      (t.deps && [...scan.npm].some((d) => t.deps.some((p) => matchDep(p, d)))) ||
      (t.py && t.py.some((p) => scan.py.has(p))) ||
      (t.files && scan.files.some((f) => t.files.some((re) => re.test(f)))) ||
      (t.lang && langs.has(t.lang)) ||
      (t.home && repo.homepageUrl && t.home.test(repo.homepageUrl));
    if (hit) found.push(t.name);
  }
  return found;
}

// ───────────────────────────── Rendering Helpers ─────────────────────────────
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
const fmtNum = (n) => n.toLocaleString('en-US');

const FONT = `font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"`;
const MONO = `font-family="'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"`;

const LANG_PALETTE = {
  JavaScript: { dot: '#F1E05A', text: '#F5E56B', dark: '#A8941A', light: '#FFF494' },
  TypeScript: { dot: '#3178C6', text: '#5B9EEB', dark: '#1D4B87', light: '#69B0FF' },
  HTML: { dot: '#E34C26', text: '#F26B49', dark: '#9C2C10', light: '#FF8566' },
  NSIS: { dot: '#9CA3AF', text: '#D1D5DB', dark: '#52525B', light: '#F3F4F6' },
  Python: { dot: '#3572A5', text: '#60A5FA', dark: '#1E4669', light: '#70B5F0' },
  CSS: { dot: '#7C5295', text: '#A78BFA', dark: '#4B2E61', light: '#C4B5FD' },
  Rust: { dot: '#DEA584', text: '#FDBA74', dark: '#9A4E2A', light: '#FED7AA' },
  Go: { dot: '#00ADD8', text: '#38BDF8', dark: '#0369A1', light: '#7DD3FC' },
  Dart: { dot: '#00B4AB', text: '#2DD4BF', dark: '#0F766E', light: '#5EEAD4' },
  'C++': { dot: '#F34B7D', text: '#FB7185', dark: '#9F1239', light: '#FDA4AF' },
};

function langTheme(name, fallbackHex = '#8B929E') {
  if (LANG_PALETTE[name]) return LANG_PALETTE[name];
  if (name.startsWith('Other')) return { dot: '#6E7681', text: '#9CA3AF', dark: '#3F444B', light: '#D1D5DB' };
  return { dot: fallbackHex, text: fallbackHex, dark: fallbackHex, light: '#F3F4F6' };
}

function wrap(text, max, lines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      out.push(cur.trim());
      cur = w;
      if (out.length === lines) break;
    } else cur += ' ' + w;
  }
  if (out.length < lines && cur.trim()) out.push(cur.trim());
  if (out.length === lines && words.join(' ').length > out.join(' ').length) {
    out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return out;
}

// 1. HUB HEADER + OPERATOR PROFILE (./assets/hub-header.svg)
function renderHubHeader() {
  const W = 900, H = 414;
  const specialtyRow1 = [
    { name: 'Next.js 16 / React 19', color: '#F59E0B', w: 158 },
    { name: 'Three.js & WebGL', color: '#F3F4F6', w: 132 },
    { name: 'TypeScript', color: '#3178C6', w: 96 },
    { name: 'HLS Streaming Engines', color: '#F97316', w: 162 },
    { name: 'Node.js & Express', color: '#22C55E', w: 136 },
  ];
  const specialtyRow2 = [
    { name: 'Supabase & PostgreSQL', color: '#3ECF8E', w: 164 },
    { name: 'FastAPI & Python', color: '#3B82F6', w: 132 },
    { name: 'MongoDB', color: '#22C55E', w: 94 },
    { name: 'Autonomous AI Agents', color: '#A855F7', w: 162 },
  ];

  function drawRow(items, y) {
    const gap = 8;
    const totalW = items.reduce((s, p) => s + p.w, 0) + gap * (items.length - 1);
    let x = Math.round((W - totalW) / 2);
    return items.map((p, idx) => {
      const el = `
      <g class="sp-pill sp-${y}-${idx}">
        <style>/*<![CDATA[*/
          .sp-${y}-${idx}:hover rect { stroke: ${p.color}; fill: ${p.color}; fill-opacity: 0.14; }
          .sp-${y}-${idx}:hover text { fill: ${p.color}; }
        /*]]>*/</style>
        <rect x="${x}" y="${y}" width="${p.w}" height="24" rx="6" fill="#15181E" stroke="#232732" stroke-width="1"/>
        <circle cx="${x + 12}" cy="${y + 12}" r="3" fill="${p.color}"/>
        <text x="${x + 21}" y="${y + 16}" ${FONT} font-size="11" font-weight="500" fill="#E5E7EB">${esc(p.name)}</text>
      </g>`;
      x += p.w + gap;
      return el;
    }).join('');
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="ZETICUZ Operator Profile">
  <defs>
    <linearGradient id="hdrGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#14171D"/>
      <stop offset="100%" stop-color="#121418"/>
    </linearGradient>
    <style>/*<![CDATA[*/
      .dot-pulse { animation: dp 2.2s ease-in-out infinite; }
      @keyframes dp { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
      rect, text { transition: all 0.2s ease; }
      @media (prefers-reduced-motion: reduce) { .dot-pulse { animation: none; } }
    /*]]>*/</style>
  </defs>

  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="12" fill="url(#hdrGrad)" stroke="#1F2229" stroke-width="1.5"/>

  <!-- Top Hub Header Bar -->
  <path d="M 1 12.75 Q 1 1 12.75 1 L ${W - 12.75} 1 Q ${W - 1} 1 ${W - 1} 12.75 L ${W - 1} 45 L 1 45 Z" fill="#101216"/>
  <line x1="1" y1="45" x2="${W - 1}" y2="45" stroke="#1F2229" stroke-width="1"/>
  <text x="24" y="28" ${FONT} font-size="12" font-weight="600" fill="#F3F4F6">Welcome to ZETICUZ's Hub</text>
  <text x="192" y="28" ${FONT} font-size="12" fill="#5C6370">·</text>
  <text x="204" y="28" ${FONT} font-size="12" fill="#8B929E">Explore open source contributions and projects</text>

  <rect x="${W - 150}" y="11" width="128" height="24" rx="7" fill="#15181E" stroke="#1F2229"/>
  <circle class="dot-pulse" cx="${W - 135}" cy="23" r="3" fill="#10B981"/>
  <text x="${W - 124}" y="27" ${MONO} font-size="10.5" fill="#8B929E">Live GitHub Sync</text>

  <!-- Centered Brand Hero -->
  <path d="M 358 76 L 349.5 87.5 H 356 L 355 96 L 364.5 84.5 H 358 Z" fill="#FBBF24"/>
  <text x="460" y="94" ${FONT} font-size="27" font-weight="700" letter-spacing="7" fill="#F3F4F6" text-anchor="middle">ZETICUZ</text>
  <text x="450" y="122" ${FONT} font-size="13.5" font-weight="500" fill="#E5E7EB" text-anchor="middle">AI-First Full-Stack Engineer · Founder of ZETICUZ · Based in the Philippines <tspan ${MONO} font-size="11" fill="#8B929E">PH</tspan></text>

  <!-- Status Badges Row -->
  <g transform="translate(0, 142)">
    <text x="148" y="16" ${MONO} font-size="10" letter-spacing="1" fill="#8B929E">WANTED LEVEL</text>
    <rect x="234" y="0" width="136" height="24" rx="5" fill="#F59E0B" fill-opacity="0.14" stroke="#F59E0B" stroke-opacity="0.45"/>
    <text x="302" y="16" ${MONO} font-size="10.5" font-weight="700" fill="#FCD34D" text-anchor="middle">★★★★★ S-TIER DEV</text>

    <text x="388" y="16" ${MONO} font-size="10" letter-spacing="1" fill="#8B929E">RANK</text>
    <rect x="424" y="0" width="104" height="24" rx="5" fill="#38BDF8" fill-opacity="0.14" stroke="#38BDF8" stroke-opacity="0.45"/>
    <text x="476" y="16" ${MONO} font-size="10.5" font-weight="700" fill="#7DD3FC" text-anchor="middle">LEVEL 100 RP</text>

    <text x="546" y="16" ${MONO} font-size="10" letter-spacing="1" fill="#8B929E">GITHUB</text>
    <rect x="594" y="0" width="98" height="24" rx="5" fill="#10B981" fill-opacity="0.14" stroke="#10B981" stroke-opacity="0.45"/>
    <text x="643" y="16" ${MONO} font-size="10.5" font-weight="700" fill="#6EE7B7" text-anchor="middle">PRO STUDENT</text>
  </g>

  <!-- Specialty Pills Rows -->
  ${drawRow(specialtyRow1, 186)}
  ${drawRow(specialtyRow2, 218)}

  <!-- OPERATOR.PROFILE Sub-Panel -->
  <line x1="1" y1="264" x2="${W - 1}" y2="264" stroke="#1F2229" stroke-width="1"/>
  <circle class="dot-pulse" cx="28" cy="291" r="3.5" fill="#10B981"/>
  <text x="40" y="295" ${MONO} font-size="11" font-weight="700" letter-spacing="1.4" fill="#F3F4F6">OPERATOR.PROFILE</text>
  <text x="180" y="295" ${MONO} font-size="11" fill="#5C6370">./whoami --extended</text>
  <text x="${W - 24}" y="295" ${MONO} font-size="11" letter-spacing="1" fill="#8B929E" text-anchor="end">PHILIPPINES (PH)</text>
  <line x1="24" y1="308" x2="${W - 24}" y2="308" stroke="#1F2229" stroke-width="1"/>

  <text x="24" y="340" ${FONT} font-size="17" font-weight="700" fill="#F3F4F6">AI-First Full-Stack Engineer · React, TypeScript, Node.js &amp; Streaming Architectures</text>

  <rect x="24" y="360" width="184" height="26" rx="13" fill="#15181E" stroke="#38BDF8" stroke-opacity="0.38"/>
  <text x="116" y="377" ${MONO} font-size="11" fill="#7DD3FC" text-anchor="middle">&gt; open to collaboration</text>

  <rect x="220" y="360" width="168" height="26" rx="13" fill="#15181E" stroke="#10B981" stroke-opacity="0.38"/>
  <text x="304" y="377" ${MONO} font-size="11" fill="#6EE7B7" text-anchor="middle">✓ production verified</text>
</svg>`;
}

// 2. TOP 4 KPI CARDS + 52-WEEK HEATMAP (./assets/kpi-telemetry.svg)
function renderKpiTelemetry(m, calendar) {
  const W = 900, H = 314;
  const kpis = [
    { id: 'repos', label: 'TOTAL REPOS', val: fmtNum(m.publicRepos), color: '#F59E0B', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { id: 'stars', label: 'TOTAL STARS', val: fmtNum(m.stars), color: '#EAB308', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
    { id: 'followers', label: 'FOLLOWERS', val: fmtNum(m.followers), color: '#38BDF8', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75' },
    { id: 'years', label: 'YEARS ACTIVE', val: fmtNum(m.yearsActive), color: '#10B981', icon: 'M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2' },
  ];
  const cw = (W - 3 * 14) / 4;
  const kpiSvg = kpis.map((k, i) => {
    const x = i * (cw + 14);
    return `
    <g class="kpi kpi-${k.id}">
      <style>/*<![CDATA[*/
        .kpi-${k.id}:hover .card-bg { stroke: ${k.color}; fill: #15181E; }
        .kpi-${k.id}:hover .k-val, .kpi-${k.id}:hover .k-ico { fill: ${k.color}; stroke: ${k.color}; }
      /*]]>*/</style>
      <rect class="card-bg" x="${x + 0.75}" y="0.75" width="${cw - 1.5}" height="96" rx="12" fill="#121418" stroke="#1F2229" stroke-width="1.5"/>
      <g transform="translate(${x + cw / 2 - 9}, 16) scale(0.75)">
        <path class="k-ico" d="${k.icon}" fill="none" stroke="#F3F4F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text class="k-val" x="${x + cw / 2}" y="62" ${FONT} font-size="28" font-weight="700" fill="#F3F4F6" text-anchor="middle">${esc(k.val)}</text>
      <text x="${x + cw / 2}" y="82" ${MONO} font-size="10" letter-spacing="1.4" fill="#8B929E" text-anchor="middle">${k.label}</text>
    </g>`;
  }).join('');

  // Contributions section below KPI cards (starts y = 118)
  const shortContrib = m.contributions >= 1000 ? `${(m.contributions / 1000).toFixed(1)}k` : String(m.contributions);
  const weeks = (calendar?.weeks || []).slice(-52);
  const cellSize = 11.4, cellGap = 3.5;
  const gridLeft = 56, gridTop = 178;
  const colors = ['#161920', '#222B3A', '#3B4F70', '#6D94CE', '#DCE8FA'];

  function levelForCount(n) {
    if (!n || n <= 0) return 0;
    if (n <= 2) return 1;
    if (n <= 6) return 2;
    if (n <= 14) return 3;
    return 4;
  }

  let heatCells = '';
  let monthLabels = '';
  let lastMonth = '';
  weeks.forEach((wk, wi) => {
    const x = gridLeft + wi * (cellSize + cellGap);
    if (wk.firstDay) {
      const dt = new Date(wk.firstDay + 'T00:00:00Z');
      const mon = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
      if (mon !== lastMonth && wi > 0 && wi < 50) {
        monthLabels += `<text x="${x}" y="168" ${MONO} font-size="10" fill="#5C6370">${mon}</text>`;
        lastMonth = mon;
      } else if (wi === 0) {
        lastMonth = mon;
      }
    }
    (wk.contributionDays || []).forEach((d) => {
      const y = gridTop + d.weekday * (cellSize + cellGap);
      const lvl = levelForCount(d.contributionCount);
      heatCells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellSize}" height="${cellSize}" rx="2.5" fill="${colors[lvl]}" stroke="rgba(255,255,255,0.03)"><title>${d.contributionCount} contributions on ${d.date}</title></rect>`;
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="KPI Telemetry and Contributions">
  <defs>
    <style>/*<![CDATA[*/
      rect, text, path { transition: all 0.22s ease; }
    /*]]>*/</style>
  </defs>

  ${kpiSvg}

  <!-- Contributions Header -->
  <text x="4" y="136" ${FONT} font-size="13" font-weight="600" fill="#F3F4F6">Contributions</text>
  <text x="${W - 4}" y="136" ${FONT} font-size="12" fill="#8B929E" text-anchor="end"><tspan fill="#F3F4F6" font-weight="600">${esc(shortContrib)}</tspan> in the last year (${fmtNum(m.contributions)})</text>

  <!-- Heatmap Card -->
  <rect x="0.75" y="148.75" width="${W - 1.5}" height="164" rx="12" fill="#121418" stroke="#1F2229" stroke-width="1.5"/>
  ${monthLabels}
  <text x="20" y="${gridTop + 1 * (cellSize + cellGap) + 9}" ${MONO} font-size="9.5" fill="#5C6370">Mon</text>
  <text x="20" y="${gridTop + 3 * (cellSize + cellGap) + 9}" ${MONO} font-size="9.5" fill="#5C6370">Wed</text>
  <text x="20" y="${gridTop + 5 * (cellSize + cellGap) + 9}" ${MONO} font-size="9.5" fill="#5C6370">Fri</text>
  ${heatCells}

  <!-- Heatmap Footer -->
  <line x1="18" y1="286" x2="${W - 18}" y2="286" stroke="#1F2229" stroke-width="1"/>
  <text x="20" y="303" ${MONO} font-size="10.5" fill="#5C6370">Last 52 weeks of activity</text>
  <text x="${W - 115}" y="303" ${MONO} font-size="10.5" fill="#5C6370" text-anchor="end">Less</text>
  ${colors.map((c, idx) => `<rect x="${W - 107 + idx * 14}" y="294" width="10" height="10" rx="2" fill="${c}" stroke="rgba(255,255,255,0.06)"/>`).join('')}
  <text x="${W - 18}" y="303" ${MONO} font-size="10.5" fill="#5C6370" text-anchor="end">More</text>
</svg>`;
}

// 3. LANGUAGE STACK CARD (Clean Solid Neon-Glow Rounded Bars — NO Diagonal Stripes per Images 2 & 3)
function renderLanguageStack(langs, meta) {
  const W = 900;
  const pillNames = meta.coreLangs.slice(0, 10);
  let pillX = 24, pillY = 46;
  const pillEls = pillNames.map((name, idx) => {
    const t = langTheme(name);
    const pw = Math.round(name.length * 7.2 + 32);
    if (pillX + pw > W - 24) {
      pillX = 24;
      pillY += 32;
    }
    const g = `
    <g class="c-pill c-pill-${idx}">
      <style>/*<![CDATA[*/
        .c-pill-${idx}:hover rect { stroke: ${t.dot}; fill: ${t.dot}; fill-opacity: 0.14; }
        .c-pill-${idx}:hover text { fill: ${t.light}; }
      /*]]>*/</style>
      <rect x="${pillX}" y="${pillY}" width="${pw}" height="24" rx="12" fill="#15181E" stroke="#232732" stroke-width="1"/>
      <circle cx="${pillX + 12}" cy="${pillY + 12}" r="3.5" fill="${t.dot}"/>
      <text x="${pillX + 21}" y="${pillY + 16}" ${FONT} font-size="11.5" font-weight="500" fill="#E5E7EB">${esc(name)}</text>
    </g>`;
    pillX += pw + 8;
    return g;
  }).join('');

  const sepY = pillY + 42;
  const stackHeaderY = sepY + 26;
  const rowsTop = stackHeaderY + 32;
  const rowH = 38;
  const H = rowsTop + langs.length * rowH + 48;

  const barX = 308, barMaxW = W - barX - 28;

  const defs = langs.map((l, i) => {
    const t = langTheme(l.name, l.color);
    return `
    <linearGradient id="neonBarGrad_${i}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${t.dark}"/>
      <stop offset="55%" stop-color="${t.dot}"/>
      <stop offset="100%" stop-color="${t.light}"/>
    </linearGradient>
    <filter id="neonGlow_${i}" x="-15%" y="-120%" width="130%" height="340%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>`;
  }).join('');

  const barsSvg = langs.map((l, i) => {
    const y = rowsTop + i * rowH;
    const t = langTheme(l.name, l.color);
    const w = Math.max(8, (l.pct / 100) * barMaxW);
    const begin = (0.14 + 0.09 * i).toFixed(2);
    return `
    <g>
      <circle cx="30" cy="${y - 4}" r="4.8" fill="${t.dot}" filter="url(#neonGlow_${i})"/>
      <text x="44" y="${y}" ${FONT} font-size="13.5" font-weight="600" fill="#F3F4F6">${esc(l.name)}</text>
      <text x="290" y="${y}" ${MONO} font-size="12.5" font-weight="700" fill="${t.text}" text-anchor="end">${l.pct.toFixed(1)}%</text>

      <!-- Recessed Dark Track -->
      <rect x="${barX}" y="${y - 10}" width="${barMaxW}" height="10" rx="5" fill="#090A0E" stroke="#1F2229" stroke-width="1"/>

      <!-- Solid Neon Glow Fill Bar (Clean Smooth Sweep + Pulsing Outer Glow, ZERO Diagonal Stripes) -->
      <rect x="${barX}" y="${y - 10}" width="0" height="10" rx="5" fill="url(#neonBarGrad_${i})" filter="url(#neonGlow_${i})">
        <animate attributeName="width" from="0" to="${w.toFixed(1)}" dur="1.35s" begin="${begin}s" fill="freeze" calcMode="spline" keySplines="0.22 1 0.36 1" keyTimes="0;1"/>
        <animate attributeName="opacity" values="0.86;1;0.86" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/>
      </rect>
      <circle cx="${barX}" cy="${y - 5}" r="3.6" fill="#FFFFFF" opacity="0.88" filter="url(#neonGlow_${i})">
        <animate attributeName="cx" from="${barX}" to="${(barX + w - 2).toFixed(1)}" dur="1.35s" begin="${begin}s" fill="freeze" calcMode="spline" keySplines="0.22 1 0.36 1" keyTimes="0;1"/>
        <animate attributeName="opacity" values="0.95;0.45;0.95" dur="1.7s" repeatCount="indefinite"/>
      </circle>
    </g>`;
  }).join('');

  const footLineY = H - 36;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Language Stack Telemetry">
  <defs>
    ${defs}
    <style>/*<![CDATA[*/
      rect, text { transition: all 0.2s ease; }
    /*]]>*/</style>
  </defs>

  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="12" fill="#121418" stroke="#1F2229" stroke-width="1.5"/>

  <!-- Core Technologies Header -->
  <text x="24" y="30" ${MONO} font-size="10.5" letter-spacing="1.2" fill="#8B929E">CORE TECHNOLOGIES</text>
  <text x="${W - 24}" y="30" ${MONO} font-size="10.5" fill="#5C6370" text-anchor="end">${pillNames.length} active runtimes</text>
  ${pillEls}

  <line x1="24" y1="${sepY}" x2="${W - 24}" y2="${sepY}" stroke="#1F2229" stroke-width="1"/>

  <!-- LANGUAGE.STACK Subheader -->
  <circle cx="29" cy="${stackHeaderY - 4}" r="3.5" fill="#10B981"/>
  <text x="41" y="${stackHeaderY}" ${MONO} font-size="12" font-weight="600" letter-spacing="1.2" fill="#F3F4F6">LANGUAGE.STACK</text>
  <text x="172" y="${stackHeaderY}" ${MONO} font-size="11.5" fill="#5C6370">./stack.scan --all</text>
  <text x="${W - 24}" y="${stackHeaderY}" ${MONO} font-size="11.5" fill="#8B929E" text-anchor="end">${langs.length} languages · byte-weighted</text>

  ${barsSvg}

  <line x1="24" y1="${footLineY}" x2="${W - 24}" y2="${footLineY}" stroke="#1F2229" stroke-width="1"/>
  <text x="24" y="${H - 15}" ${MONO} font-size="10.5" fill="#5C6370">byte-weighted across ${meta.repos} original repositories</text>
  <text x="${W - 24}" y="${H - 15}" ${MONO} font-size="10.5" fill="#5C6370" text-anchor="end">${meta.manifests} manifests scanned · ${meta.totalMB}MB code · forks excluded</text>
</svg>`;
}

// 4. FULL-STACK ENGINEERING SPECTRUM WITH BRAND-COLOR HOVER (./assets/engineering-spectrum.svg)
function renderSpectrum(usage) {
  const W = 900;
  const rowsData = CATEGORIES.map((c) => {
    const items = CATALOG.filter((t) => t.cat === c.key && usage.has(t.name))
      .sort((a, b) => usage.get(b.name) - usage.get(a.name))
      .map((t) => ({ name: t.name, hex: `#${t.color}`, count: usage.get(t.name) }));
    return { title: c.title, items };
  }).filter((r) => r.items.length > 0);

  let curY = 18;
  let rowsSvg = '';
  let rowIdx = 0;

  for (const row of rowsData) {
    const startX = 220, maxX = W - 22;
    let x = startX, lineY = curY;
    const pills = [];

    for (const item of row.items) {
      const countLabel = `${item.count} ${item.count === 1 ? 'repo' : 'repos'}`;
      const pillW = Math.round(24 + item.name.length * 6.7 + 8 + countLabel.length * 5.9 + 12);
      if (x + pillW > maxX && x > startX) {
        x = startX;
        lineY += 29;
      }
      const pIdx = `${rowIdx}-${pills.length}`;
      pills.push(`
      <g class="sp-item sp-item-${pIdx}">
        <style>/*<![CDATA[*/
          .sp-item-${pIdx}:hover rect { stroke: ${item.hex}; fill: ${item.hex}; fill-opacity: 0.14; }
          .sp-item-${pIdx}:hover .p-name { fill: ${item.hex}; }
          .sp-item-${pIdx}:hover .p-cnt { fill: #F3F4F6; }
        /*]]>*/</style>
        <rect x="${x}" y="${lineY}" width="${pillW}" height="23" rx="6" fill="#15181E" stroke="#232732" stroke-width="1"/>
        <circle cx="${x + 11}" cy="${lineY + 11.5}" r="3" fill="${item.hex}"/>
        <text class="p-name" x="${x + 20}" y="${lineY + 15.5}" ${FONT} font-size="11" font-weight="500" fill="#E5E7EB">${esc(item.name)}</text>
        <text class="p-cnt" x="${x + pillW - 10}" y="${lineY + 15.5}" ${MONO} font-size="10" fill="#8B929E" text-anchor="end">${esc(countLabel)}</text>
      </g>`);
      x += pillW + 6;
    }

    const rowBottom = lineY + 23 + 14;
    const labelMidY = Math.round((curY + rowBottom) / 2);
    rowsSvg += `
    <circle cx="28" cy="${labelMidY - 4}" r="3" fill="#8B929E"/>
    <text x="40" y="${labelMidY}" ${FONT} font-size="12" font-weight="600" fill="#F3F4F6">${esc(row.title)}</text>
    ${pills.join('')}
    <line x1="1" y1="${rowBottom}" x2="${W - 1}" y2="${rowBottom}" stroke="#1F2229" stroke-width="1"/>`;
    curY = rowBottom + 14;
    rowIdx++;
  }

  const H = curY + 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Full-Stack Engineering Spectrum">
  <defs>
    <style>/*<![CDATA[*/
      rect, text { transition: all 0.2s ease; }
    /*]]>*/</style>
  </defs>
  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="12" fill="#121418" stroke="#1F2229" stroke-width="1.5"/>
  ${rowsSvg}
  <text x="${W / 2}" y="${H - 10}" ${MONO} font-size="10.5" fill="#5C6370" text-anchor="middle">Auto-detected from ${[...usage.values()].reduce((a, b) => a + b, 0)} dependency signals · Hover any technology to illuminate brand color</text>
</svg>`;
}

// 5. GITHUB SYSTEM ANALYTICS 6-CARD STRIP (./assets/system-stats.svg)
function renderSystemStats(m) {
  const W = 900, H = 184;
  const cells = [
    { id: 'pub', label: 'PUBLIC REPOS', value: m.publicRepos, color: '#38BDF8' },
    { id: 'orig', label: 'ORIGINAL PROJECTS', value: m.originals, color: '#A855F7' },
    { id: 'contrib', label: 'CONTRIBUTIONS · 1Y', value: m.contributions, color: '#10B981' },
    { id: 'commit', label: 'COMMITS · 1Y', value: m.commits, color: '#F59E0B' },
    { id: 'tech', label: 'TECHNOLOGIES', value: m.techCount, color: '#EC4899' },
    { id: 'stars', label: 'STARS EARNED', value: m.stars, color: '#EAB308' },
  ];
  const cw = (W - 48 - 5 * 12) / 6;
  const cards = cells.map((c, i) => {
    const x = 24 + i * (cw + 12);
    return `
    <g class="sys sys-${c.id}">
      <style>/*<![CDATA[*/
        .sys-${c.id}:hover .sys-bg { stroke: ${c.color}; fill: #15181E; }
        .sys-${c.id}:hover .sys-val { fill: ${c.color}; }
      /*]]>*/</style>
      <rect class="sys-bg" x="${x}" y="58" width="${cw}" height="102" rx="10" fill="#15181E" stroke="#1F2229" stroke-width="1.2"/>
      <rect x="${x + 1}" y="58" width="${cw - 2}" height="3" rx="1.5" fill="${c.color}" fill-opacity="0.72"/>
      <text class="sys-val" x="${x + cw / 2}" y="114" ${MONO} font-size="24" font-weight="700" fill="#F3F4F6" text-anchor="middle">${fmtNum(c.value)}</text>
      <text x="${x + cw / 2}" y="139" ${MONO} font-size="9" letter-spacing="0.8" fill="#8B929E" text-anchor="middle">${c.label}</text>
    </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub System Analytics">
  <defs>
    <style>/*<![CDATA[*/
      rect, text { transition: all 0.22s ease; }
    /*]]>*/</style>
  </defs>
  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="12" fill="#121418" stroke="#1F2229" stroke-width="1.5"/>
  <circle cx="29" cy="30" r="3.5" fill="#F3F4F6"/>
  <text x="41" y="34" ${MONO} font-size="12" font-weight="600" letter-spacing="1.2" fill="#F3F4F6">SYSTEM.STATS</text>
  <text x="150" y="34" ${MONO} font-size="11.5" fill="#5C6370">./github --live</text>
  <text x="${W - 24}" y="34" ${MONO} font-size="11" fill="#5C6370" text-anchor="end">synced ${esc(m.syncedLabel)}</text>
  <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="#1F2229" stroke-width="1"/>
  ${cards}
</svg>`;
}

// 6. FEATURED PROJECTS & ANIMATED CIRCULAR PROGRESS RINGS (./assets/projects-list.svg)
function renderProjectsList(projects) {
  const W = 900, cardW = 418, cardH = 178, gap = 16, top = 54;
  const rows = Math.ceil(projects.length / 2);
  const H = top + rows * (cardH + 14) + 12;

  const cards = projects.map((p, i) => {
    const x = 24 + (i % 2) * (cardW + gap);
    const y = top + Math.floor(i / 2) * (cardH + 14);
    const lang = p.primaryLanguage || { name: 'TypeScript', color: '#3178C6' };
    const t = langTheme(lang.name, lang.color);
    const total = p.languages.edges.reduce((a, e) => a + e.size, 0) || 1;
    const primarySize = p.languages.edges.find((e) => e.node.name === lang.name)?.size || total;
    const pct = Math.min(100, Math.max(1, Math.round((primarySize / total) * 100)));

    const GENERIC = ['JavaScript', 'TypeScript', 'HTML5', 'CSS3', 'ESLint', 'PostCSS', 'Node.js', 'Vercel'];
    const rank = { creative: 0, backend: 1, cloud: 2, mobile: 3, frontend: 4, tooling: 5 };
    const score = (item) => (item.name === 'Next.js' ? -1 : rank[item.cat]);
    const tags = (p.tech || []).filter((tn) => !GENERIC.includes(tn))
      .map((tn) => CATALOG.find((c) => c.name === tn))
      .filter(Boolean)
      .sort((a, b) => score(a) - score(b))
      .slice(0, 4)
      .map((c) => c.name)
      .join(' · ') || lang.name;

    const descLines = wrap(p.description || 'Full-stack production engineering repository by ZETICUZ.', 44, 2);
    const r = 22;
    const circ = 2 * Math.PI * r;
    const targetOffset = circ - (pct / 100) * circ;
    const begin = (0.15 + i * 0.1).toFixed(2);
    const langPillW = Math.round(lang.name.length * 6.5 + 20);

    return `
    <g>
      <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="11" fill="#15181E" stroke="${i === 0 ? '#2E333E' : '#1F2229'}" stroke-width="1.2"/>
      <circle cx="${x + 18}" cy="${y + 20}" r="3.5" fill="${t.dot}"/>
      <text x="${x + 28}" y="${y + 24}" ${MONO} font-size="11.5" fill="#8B929E">${esc(p.name.length > 36 ? p.name.slice(0, 35) + '…' : p.name)}</text>
      ${i === 0
        ? `<rect x="${x + cardW - 102}" y="${y + 11}" width="86" height="18" rx="9" fill="#10B981" fill-opacity="0.15" stroke="#10B981" stroke-opacity="0.35"/><text x="${x + cardW - 59}" y="${y + 23.5}" ${MONO} font-size="9" font-weight="700" fill="#34D399" text-anchor="middle">LATEST PUSH</text>`
        : `<circle cx="${x + cardW - 18}" cy="${y + 20}" r="3" fill="#38BDF8" opacity="0.5"/>`
      }

      <!-- Title & Accent -->
      <text x="${x + 18}" y="${y + 52}" ${FONT} font-size="15" font-weight="700" fill="#F3F4F6">${esc(p.name.length > 32 ? p.name.slice(0, 31) + '…' : p.name)}</text>
      <rect x="${x + 18}" y="${y + 58}" width="18" height="2" rx="1" fill="#38BDF8"/>

      <!-- Wrapped Description -->
      ${descLines.map((line, li) => `<text x="${x + 18}" y="${y + 78 + li * 16}" ${FONT} font-size="11.5" fill="#8B929E">${esc(line)}</text>`).join('')}

      <!-- Animated Circular Progress Ring -->
      <g transform="translate(${x + cardW - 44}, ${y + 76})">
        <circle cx="0" cy="0" r="${r}" fill="none" stroke="#1F2229" stroke-width="4.5"/>
        <circle cx="0" cy="0" r="${r}" fill="none" stroke="${t.dot}" stroke-width="4.5" stroke-linecap="round"
          stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${circ.toFixed(2)}" transform="rotate(-90)">
          <animate attributeName="stroke-dashoffset" from="${circ.toFixed(2)}" to="${targetOffset.toFixed(2)}" dur="1.3s" begin="${begin}s" fill="freeze" calcMode="spline" keySplines="0.22 1 0.36 1" keyTimes="0;1"/>
        </circle>
        <text x="0" y="4" ${MONO} font-size="11" font-weight="700" fill="#F3F4F6" text-anchor="middle">${pct}%</text>
      </g>

      <!-- Tags & Bottom Meta -->
      <text x="${x + 18}" y="${y + 128}" ${MONO} font-size="10.5" fill="#A5B4FC">${esc(tags)}</text>
      <line x1="${x + 18}" y1="${y + 139}" x2="${x + cardW - 18}" y2="${y + 139}" stroke="#1F2229" stroke-width="1"/>
      <rect x="${x + 18}" y="${y + 148}" width="${langPillW}" height="20" rx="10" fill="#121418" stroke="#2A2F3B"/>
      <text x="${x + 18 + langPillW / 2}" y="${y + 161.5}" ${MONO} font-size="10" fill="${t.text}" text-anchor="middle">${esc(lang.name)}</text>
      <text x="${x + 28 + langPillW}" y="${y + 161.5}" ${MONO} font-size="10.5" fill="#8B929E">☆ ${p.stargazerCount}</text>
      <text x="${x + cardW - 18}" y="${y + 161.5}" ${MONO} font-size="10" fill="#5C6370" text-anchor="end">pushed ${fmtDate(p.pushedAt)}</text>
    </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Featured Projects Telemetry">
  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="12" fill="#121418" stroke="#1F2229" stroke-width="1.5"/>
  <circle cx="29" cy="27" r="3.5" fill="#10B981"/>
  <text x="41" y="31" ${MONO} font-size="12" font-weight="600" letter-spacing="1.2" fill="#F3F4F6">PROJECTS.LIST</text>
  <text x="160" y="31" ${MONO} font-size="11.5" fill="#5C6370">./projects.sh --recent</text>
  <text x="${W - 24}" y="31" ${MONO} font-size="11" fill="#8B929E" text-anchor="end">${projects.length} live repositories synced</text>
  <line x1="24" y1="42" x2="${W - 24}" y2="42" stroke="#1F2229" stroke-width="1"/>
  ${cards}
</svg>`;
}

// ───────────────────────────── Main Execution ─────────────────────────────
const { user, repos } = await fetchProfile();
const exclude = new Set(config.excludeRepos || []);
const allowFork = new Set(config.includeForks || []);
const scanned = repos.filter((r) => !exclude.has(r.name) && (!r.isFork || allowFork.has(r.name)));
console.log(`Public repos: ${user.publicRepos.totalCount} · scanning ${scanned.length} original projects`);

let manifestTotal = 0;
for (const r of scanned) {
  const scan = await scanRepo(r);
  manifestTotal += scan.manifests;
  r.tech = detectTech(r, scan);
  console.log(`  ✓ ${r.name.padEnd(40)} ${scan.manifests} manifests → ${r.tech.join(', ') || '—'}`);
}

const usage = new Map();
for (const r of scanned) for (const t of r.tech) usage.set(t, (usage.get(t) || 0) + 1);

const bytes = new Map();
for (const r of scanned) for (const e of r.languages.edges) {
  const cur = bytes.get(e.node.name) || { size: 0, color: e.node.color || '#8b949e' };
  cur.size += e.size;
  bytes.set(e.node.name, cur);
}
const totalBytes = [...bytes.values()].reduce((a, b) => a + b.size, 0) || 1;
const rawLangs = [...bytes.entries()]
  .map(([name, v]) => ({ name, color: v.color, pct: (v.size / totalBytes) * 100 }))
  .sort((a, b) => b.pct - a.pct);

const majorLangs = rawLangs.filter((l) => l.pct >= 0.5);
const minorLangs = rawLangs.filter((l) => l.pct < 0.5);
const langs = [...majorLangs];
if (minorLangs.length > 0) {
  langs.push({
    name: `Other (${minorLangs.length})`,
    color: '#6e7681',
    pct: minorLangs.reduce((a, l) => a + l.pct, 0),
  });
}

const yearsActive = Math.max(1, new Date().getUTCFullYear() - new Date(user.createdAt).getUTCFullYear() || 1);
const metrics = {
  publicRepos: user.publicRepos.totalCount,
  originals: scanned.length,
  contributions: user.contributionsCollection.contributionCalendar.totalContributions,
  commits: user.contributionsCollection.totalCommitContributions,
  stars: repos.filter((r) => !r.isFork).reduce((a, r) => a + r.stargazerCount, 0),
  followers: user.followers.totalCount,
  yearsActive,
  techCount: usage.size,
  syncedLabel: fmtDate(new Date().toISOString()),
};

const featuredProjects = scanned.filter((r) => !r.isArchived).slice(0, 8);

await mkdir(path.join(ROOT, 'assets'), { recursive: true });
await mkdir(path.join(ROOT, 'data'), { recursive: true });

await writeFile(path.join(ROOT, 'assets/hub-header.svg'), renderHubHeader());
await writeFile(path.join(ROOT, 'assets/kpi-telemetry.svg'), renderKpiTelemetry(metrics, user.contributionsCollection.contributionCalendar));
await writeFile(
  path.join(ROOT, 'assets/language-stack-3d.svg'),
  renderLanguageStack(langs, {
    repos: scanned.length,
    manifests: manifestTotal,
    totalMB: (totalBytes / 1_000_000).toFixed(1),
    coreLangs: rawLangs.map((l) => l.name),
  }),
);
await writeFile(path.join(ROOT, 'assets/engineering-spectrum.svg'), renderSpectrum(usage));
await writeFile(path.join(ROOT, 'assets/system-stats.svg'), renderSystemStats(metrics));
await writeFile(path.join(ROOT, 'assets/projects-list.svg'), renderProjectsList(featuredProjects));

const readmeContent = `<div align="center">
  <!-- Header Description: ⚡ ZETICUZ | AI-First Full-Stack Engineer · Founder of ZETICUZ · Based in the Philippines PH | S-TIER DEV | LEVEL 100 RP | PRO STUDENT | OPERATOR.PROFILE -->
  <img src="./assets/hub-header.svg" width="100%" alt="ZETICUZ — AI-First Full-Stack Engineer & Operator Profile" />
</div>

<br />

<!-- Top 4 KPI Cards (Hover Color Reactive) + 52-Week Contributions Heatmap -->
<div align="center">
  <img src="./assets/kpi-telemetry.svg" width="100%" alt="ZETIC7Z KPI Telemetry & Contributions" />
</div>

### \`</>\` Tech Stack & Languages
<div align="center">
  <img src="./assets/language-stack-3d.svg" width="100%" alt="3D Glossy Glass Language Stack" />
</div>

### Full-Stack Engineering Spectrum
<div align="center">
  <img src="./assets/engineering-spectrum.svg" width="100%" alt="Full-Stack Engineering Spectrum" />
</div>

### GitHub System Analytics
<div align="center">
  <img src="./assets/system-stats.svg" width="100%" alt="GitHub System Analytics" />
</div>

### Featured Projects & Operations
<div align="center">
  <img src="./assets/projects-list.svg" width="100%" alt="Featured Projects & Circular Progress Rings" />
</div>
`;

await writeFile(path.join(ROOT, 'README.md'), readmeContent);

await writeFile(
  path.join(ROOT, 'data/profile-data.json'),
  JSON.stringify(
    {
      syncedAt: new Date().toISOString(),
      metrics,
      languages: langs,
      technologies: Object.fromEntries([...usage.entries()].sort((a, b) => b[1] - a[1])),
      repositories: scanned.map((r) => ({
        name: r.name,
        pushedAt: r.pushedAt,
        language: r.primaryLanguage?.name || null,
        tech: r.tech,
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(`Done · ${metrics.techCount} technologies · ${langs.length} language rows · featured: ${featuredProjects.map((r) => r.name).join(', ')}`);
