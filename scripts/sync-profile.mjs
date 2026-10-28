#!/usr/bin/env node
/**
 * ZETICUZ profile auto-sync.
 *
 * Scans every public repository owned by the user (originals + allow-listed forks),
 * reads language byte counts and every dependency manifest in each repo tree,
 * detects frameworks/tools, and regenerates:
 *   - assets/generated/stats.svg            (live account metrics)
 *   - assets/generated/languages.svg        (byte-weighted language stack, animated bars)
 *   - assets/generated/recent-projects.svg  (most recently pushed projects)
 *   - data/profile-data.json                (raw scan result, for auditing)
 *   - README.md sections between <!-- NAME:START --> / <!-- NAME:END --> markers
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
  const res = await fetch(`https://api.github.com${p}`, { headers: { ...headers, Accept: 'application/vnd.github+json' } });
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
          name login followers { totalCount } following { totalCount }
          publicRepos: repositories(privacy: PUBLIC, ownerAffiliations: OWNER) { totalCount }
          contributionsCollection {
            totalCommitContributions totalPullRequestContributions totalIssueContributions
            contributionCalendar { totalContributions }
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
// deps: npm package names (trailing * = prefix). py: python packages. files: path regexes.
const CATALOG = [
  // Frontend
  { name: 'React', cat: 'frontend', color: '20232A', logo: 'react', logoColor: '61DAFB', deps: ['react'] },
  { name: 'Next.js', cat: 'frontend', color: '000000', logo: 'nextdotjs', deps: ['next'] },
  { name: 'TypeScript', cat: 'frontend', color: '3178C6', logo: 'typescript', deps: ['typescript'], lang: 'TypeScript' },
  { name: 'JavaScript', cat: 'frontend', color: 'F7DF1E', logo: 'javascript', logoColor: '000000', lang: 'JavaScript' },
  { name: 'Vite', cat: 'frontend', color: '646CFF', logo: 'vite', deps: ['vite'] },
  { name: 'Vue', cat: 'frontend', color: '4FC08D', logo: 'vuedotjs', deps: ['vue'] },
  { name: 'Svelte', cat: 'frontend', color: 'FF3E00', logo: 'svelte', deps: ['svelte'] },
  { name: 'Tailwind CSS', cat: 'frontend', color: '06B6D4', logo: 'tailwindcss', deps: ['tailwindcss', '@tailwindcss/*'], files: [/(^|\/)tailwind\.config\.[cm]?[jt]s$/] },
  { name: 'Radix UI', cat: 'frontend', color: '161618', logo: 'radixui', deps: ['@radix-ui/*'] },
  { name: 'React Router', cat: 'frontend', color: 'CA4245', logo: 'reactrouter', deps: ['react-router', 'react-router-dom'] },
  { name: 'TanStack Query', cat: 'frontend', color: 'FF4154', logo: 'reactquery', deps: ['@tanstack/react-query'] },
  { name: 'Zustand', cat: 'frontend', color: '443E38', logo: 'react', deps: ['zustand'] },
  { name: 'Redux', cat: 'frontend', color: '764ABC', logo: 'redux', deps: ['redux', '@reduxjs/toolkit'] },
  { name: 'Sass', cat: 'frontend', color: 'CC6699', logo: 'sass', deps: ['sass', 'node-sass'] },
  { name: 'HTML5', cat: 'frontend', color: 'E34F26', logo: 'html5', lang: 'HTML' },
  { name: 'CSS3', cat: 'frontend', color: '1572B6', logo: 'css', lang: 'CSS' },
  // 3D, motion & visualisation
  { name: 'Three.js', cat: 'creative', color: '000000', logo: 'threedotjs', deps: ['three'] },
  { name: 'React Three Fiber', cat: 'creative', color: '000000', logo: 'threedotjs', deps: ['@react-three/fiber'] },
  { name: 'GSAP', cat: 'creative', color: '0AE448', logo: 'greensock', logoColor: '000000', deps: ['gsap', '@gsap/*'] },
  { name: 'Framer Motion', cat: 'creative', color: '0055FF', logo: 'framer', deps: ['framer-motion', 'motion'] },
  { name: 'Lenis', cat: 'creative', color: 'FF98A2', logo: 'smoothcomp', deps: ['lenis', '@studio-freight/lenis'] },
  { name: 'Lottie', cat: 'creative', color: '00DDB3', logo: 'lottiefiles', deps: ['lottie-web', 'lottie-react', '@lottiefiles/*'] },
  { name: 'Spline', cat: 'creative', color: '1D1D1F', logo: 'spline', deps: ['@splinetool/*'] },
  { name: 'Chart.js', cat: 'creative', color: 'FF6384', logo: 'chartdotjs', deps: ['chart.js', 'react-chartjs-2'] },
  { name: 'Recharts', cat: 'creative', color: '22B5BF', logo: 'chartdotjs', deps: ['recharts'] },
  { name: 'D3.js', cat: 'creative', color: 'F9A03C', logo: 'd3', deps: ['d3'] },
  { name: 'Leaflet', cat: 'creative', color: '199900', logo: 'leaflet', deps: ['leaflet', 'react-leaflet'] },
  // Backend & APIs
  { name: 'Node.js', cat: 'backend', color: '339933', logo: 'nodedotjs', deps: ['express', 'fastify', 'koa', 'hono', '@nestjs/core', 'socket.io', 'nodemon', 'ws', 'dotenv', 'tsx', 'ts-node', 'node-fetch', 'cors', 'body-parser'] },
  { name: 'Express', cat: 'backend', color: '000000', logo: 'express', deps: ['express'] },
  { name: 'Fastify', cat: 'backend', color: '000000', logo: 'fastify', deps: ['fastify'] },
  { name: 'Hono', cat: 'backend', color: 'E36002', logo: 'hono', deps: ['hono'] },
  { name: 'NestJS', cat: 'backend', color: 'E0234E', logo: 'nestjs', deps: ['@nestjs/core'] },
  { name: 'Socket.IO', cat: 'backend', color: '010101', logo: 'socketdotio', deps: ['socket.io', 'socket.io-client'] },
  { name: 'GraphQL', cat: 'backend', color: 'E10098', logo: 'graphql', deps: ['graphql', '@apollo/*', 'graphql-request', 'urql'] },
  { name: 'Python', cat: 'backend', color: '3776AB', logo: 'python', lang: 'Python' },
  { name: 'FastAPI', cat: 'backend', color: '009688', logo: 'fastapi', py: ['fastapi'] },
  { name: 'Flask', cat: 'backend', color: '000000', logo: 'flask', py: ['flask'] },
  { name: 'Django', cat: 'backend', color: '092E20', logo: 'django', py: ['django'] },
  { name: 'Axios', cat: 'backend', color: '5A29E4', logo: 'axios', deps: ['axios'] },
  { name: 'Cheerio', cat: 'backend', color: 'E88C1F', logo: 'cheerio', deps: ['cheerio'] },
  { name: 'Puppeteer', cat: 'backend', color: '40B5A4', logo: 'puppeteer', deps: ['puppeteer', 'puppeteer-core', 'puppeteer-extra'] },
  { name: 'JWT Auth', cat: 'backend', color: '000000', logo: 'jsonwebtokens', deps: ['jsonwebtoken', 'jose', 'jwt-decode'] },
  { name: 'Zod', cat: 'backend', color: '3E67B1', logo: 'zod', deps: ['zod'] },
  { name: 'HLS.js', cat: 'backend', color: 'FF5500', logo: 'videodotjs', deps: ['hls.js', 'video.js', '@videojs/*', 'm3u8-parser'] },
  { name: 'FFmpeg', cat: 'backend', color: '007808', logo: 'ffmpeg', deps: ['fluent-ffmpeg', '@ffmpeg/*', 'ffmpeg-static'] },
  { name: 'PDF Engine', cat: 'backend', color: 'EC1C24', logo: 'adobeacrobatreader', deps: ['pdf-lib', 'pdfjs-dist', 'jspdf', '@react-pdf/renderer', 'pdfkit'] },
  { name: 'OpenAI', cat: 'backend', color: '412991', logo: 'openai', deps: ['openai'], py: ['openai'] },
  { name: 'Gemini AI', cat: 'backend', color: '8E75B2', logo: 'googlegemini', deps: ['@google/generative-ai', '@google/genai'], py: ['google-generativeai', 'google-genai'] },
  { name: 'Pydantic', cat: 'backend', color: 'E92063', logo: 'pydantic', py: ['pydantic'] },
  { name: 'Pandas', cat: 'backend', color: '150458', logo: 'pandas', py: ['pandas'] },
  { name: 'Selenium', cat: 'backend', color: '43B02A', logo: 'selenium', py: ['selenium'], deps: ['selenium-webdriver'] },
  { name: 'Go', cat: 'backend', color: '00ADD8', logo: 'go', lang: 'Go' },
  { name: 'Rust', cat: 'backend', color: '000000', logo: 'rust', lang: 'Rust' },
  // Data & cloud
  { name: 'MongoDB', cat: 'cloud', color: '47A248', logo: 'mongodb', deps: ['mongodb', 'mongoose'], py: ['pymongo', 'motor'] },
  { name: 'PostgreSQL', cat: 'cloud', color: '4169E1', logo: 'postgresql', deps: ['pg', 'postgres', '@neondatabase/serverless', '@vercel/postgres'], py: ['psycopg2', 'psycopg2-binary', 'asyncpg', 'psycopg'], lang: 'PLpgSQL' },
  { name: 'MySQL', cat: 'cloud', color: '4479A1', logo: 'mysql', deps: ['mysql', 'mysql2'], py: ['pymysql', 'mysqlclient'] },
  { name: 'SQLite', cat: 'cloud', color: '003B57', logo: 'sqlite', deps: ['better-sqlite3', 'sqlite3', 'sqlite', 'sql.js'], py: ['aiosqlite'] },
  { name: 'Prisma', cat: 'cloud', color: '2D3748', logo: 'prisma', deps: ['prisma', '@prisma/client'], files: [/(^|\/)schema\.prisma$/] },
  { name: 'Drizzle ORM', cat: 'cloud', color: 'C5F74F', logo: 'drizzle', logoColor: '000000', deps: ['drizzle-orm'] },
  { name: 'SQLAlchemy', cat: 'cloud', color: 'D71F00', logo: 'sqlalchemy', py: ['sqlalchemy'] },
  { name: 'Supabase', cat: 'cloud', color: '3FCF8E', logo: 'supabase', deps: ['@supabase/supabase-js', '@supabase/ssr'], py: ['supabase'], files: [/(^|\/)supabase\/config\.toml$/] },
  { name: 'Firebase', cat: 'cloud', color: 'DD2C00', logo: 'firebase', deps: ['firebase', 'firebase-admin'], py: ['firebase-admin'], files: [/(^|\/)firebase\.json$/] },
  { name: 'Redis', cat: 'cloud', color: 'FF4438', logo: 'redis', deps: ['redis', 'ioredis', '@upstash/redis'], py: ['redis'] },
  { name: 'IndexedDB', cat: 'cloud', color: '5C2D91', logo: 'databricks', deps: ['dexie', 'idb', 'idb-keyval', 'localforage'] },
  { name: 'Vercel', cat: 'cloud', color: '000000', logo: 'vercel', deps: ['@vercel/*'], files: [/(^|\/)vercel\.json$/], home: /vercel\.app/ },
  { name: 'Netlify', cat: 'cloud', color: '00C7B7', logo: 'netlify', files: [/(^|\/)netlify\.toml$/], home: /netlify\.app/ },
  { name: 'Cloudflare', cat: 'cloud', color: 'F38020', logo: 'cloudflare', deps: ['wrangler', '@cloudflare/*'], files: [/(^|\/)wrangler\.(toml|jsonc?)$/], home: /(workers\.dev|pages\.dev)/ },
  { name: 'Docker', cat: 'cloud', color: '2496ED', logo: 'docker', files: [/(^|\/)Dockerfile$/, /(^|\/)docker-compose\.ya?ml$/, /(^|\/)compose\.ya?ml$/] },
  { name: 'GitHub Actions', cat: 'cloud', color: '2088FF', logo: 'githubactions', files: [/^\.github\/workflows\/.+\.ya?ml$/] },
  // Mobile & desktop
  { name: 'React Native', cat: 'mobile', color: '20232A', logo: 'react', logoColor: '61DAFB', deps: ['react-native'] },
  { name: 'Expo', cat: 'mobile', color: '000020', logo: 'expo', deps: ['expo'] },
  { name: 'Electron', cat: 'mobile', color: '47848F', logo: 'electron', deps: ['electron'] },
  { name: 'Tauri', cat: 'mobile', color: '24C8DB', logo: 'tauri', deps: ['@tauri-apps/*'] },
  { name: 'Capacitor', cat: 'mobile', color: '119EFF', logo: 'capacitor', deps: ['@capacitor/core'] },
  { name: 'PWA', cat: 'mobile', color: '5A0FC8', logo: 'pwa', deps: ['vite-plugin-pwa', 'next-pwa', '@ducanh2912/next-pwa', 'workbox-*', '@serwist/*', 'serwist'], files: [/(^|\/)(manifest\.webmanifest|site\.webmanifest)$/] },
  // Testing & tooling
  { name: 'Playwright', cat: 'tooling', color: '2EAD33', logo: 'playwright', deps: ['playwright', '@playwright/test', 'playwright-extra', 'playwright-core'], py: ['playwright'] },
  { name: 'Vitest', cat: 'tooling', color: '6E9F18', logo: 'vitest', deps: ['vitest'] },
  { name: 'Jest', cat: 'tooling', color: 'C21325', logo: 'jest', deps: ['jest'] },
  { name: 'Testing Library', cat: 'tooling', color: 'E33332', logo: 'testinglibrary', deps: ['@testing-library/*'] },
  { name: 'ESLint', cat: 'tooling', color: '4B32C3', logo: 'eslint', deps: ['eslint'] },
  { name: 'PostCSS', cat: 'tooling', color: 'DD3A0A', logo: 'postcss', deps: ['postcss'] },
];

const CATEGORIES = [
  { key: 'frontend', title: '🎨 Frontend' },
  { key: 'creative', title: '🕹️ 3D, Motion &amp; Data Viz' },
  { key: 'backend', title: '⚙️ Backend, APIs &amp; AI' },
  { key: 'cloud', title: '☁️ Data, Cloud &amp; DevOps' },
  { key: 'mobile', title: '📱 Mobile, Desktop &amp; PWA' },
  { key: 'tooling', title: '🧪 Testing &amp; Tooling' },
];

const IGNORED_PATH = /(^|\/)(node_modules|vendor|dist|build|out|\.next|\.nuxt|coverage|\.venv|venv|site-packages|bower_components|__pycache__|fixtures?|__fixtures__|\.git)\//;
const MANIFEST = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile)$/;

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
        } catch { /* malformed package.json */ }
      } else {
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

// ───────────────────────────── Rendering helpers ─────────────────────────────
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const shieldText = (s) => encodeURIComponent(String(s).replace(/-/g, '--').replace(/_/g, '__'));
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
const fmtNum = (n) => n.toLocaleString('en-US');

function badge(tech, message) {
  const t = CATALOG.find((c) => c.name === tech);
  const label = shieldText(tech);
  const logo = `&logo=${t.logo}&logoColor=${t.logoColor || 'white'}`;
  if (message) return `<img src="https://img.shields.io/badge/${label}-${shieldText(message)}-${t.color}?style=flat-square${logo}&labelColor=${t.color}" alt="${esc(tech)}" />`;
  return `<img src="https://img.shields.io/badge/${label}-${t.color}?style=flat-square${logo}" alt="${esc(tech)}" />`;
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
  if (out.length === lines && words.join(' ').length > out.join(' ').length) out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…';
  return out;
}

const FONT = `font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif"`;
const MONO = `font-family="ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace"`;

function frame(width, height, title, subtitle, right, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#58a6ff" stop-opacity=".75"/><stop offset=".5" stop-color="#30363d" stop-opacity=".6"/><stop offset="1" stop-color="#3fb950" stop-opacity=".55"/></linearGradient>
    <radialGradient id="glowA" cx="20%" cy="10%" r="45%"><stop offset="0" stop-color="#1f6feb" stop-opacity=".28"/><stop offset="1" stop-color="#1f6feb" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="85%" cy="90%" r="45%"><stop offset="0" stop-color="#8957e5" stop-opacity=".2"/><stop offset="1" stop-color="#8957e5" stop-opacity="0"/></radialGradient>
    <linearGradient id="scan" x1="0" x2="1"><stop offset="0" stop-color="#58a6ff" stop-opacity="0"/><stop offset=".5" stop-color="#58a6ff" stop-opacity=".9"/><stop offset="1" stop-color="#58a6ff" stop-opacity="0"/></linearGradient>
    <clipPath id="clip"><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="18"/></clipPath>
  </defs>
  <style>
    .fade{opacity:0;animation:fade .7s ease-out forwards}
    @keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .pulse{animation:pulse 2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
    .sweep{animation:sweep 4s linear infinite}
    @keyframes sweep{from{transform:translateX(-${width}px)}to{transform:translateX(${width}px)}}
    .glow{animation:glow 6s ease-in-out infinite alternate}
    @keyframes glow{from{opacity:.55}to{opacity:1}}
    @media (prefers-reduced-motion: reduce){*{animation:none!important;opacity:1!important}}
  </style>
  <g clip-path="url(#clip)">
    <rect width="${width}" height="${height}" fill="#0d1117"/>
    <rect class="glow" width="${width}" height="${height}" fill="url(#glowA)"/>
    <rect class="glow" style="animation-delay:-3s" width="${width}" height="${height}" fill="url(#glowB)"/>
    <rect class="sweep" x="0" y="62" width="${width}" height="1.5" fill="url(#scan)"/>
  </g>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="18" fill="none" stroke="url(#edge)" stroke-width="1.5"/>
  <circle class="pulse" cx="34" cy="36" r="4" fill="#3fb950"/>
  <text x="48" y="41" ${MONO} font-size="14" letter-spacing="2.5" fill="#58a6ff">${esc(title)}</text>
  <text x="${48 + title.length * 10.5 + 18}" y="41" ${MONO} font-size="12" fill="#8b949e">${esc(subtitle)}</text>
  <text x="${width - 30}" y="41" ${MONO} font-size="12" fill="#8b949e" text-anchor="end">${esc(right)}</text>
  <line x1="28" y1="62" x2="${width - 28}" y2="62" stroke="#30363d"/>
  ${body}
</svg>`;
}

function renderStats(m) {
  const W = 900, H = 230;
  const cells = [
    { label: 'PUBLIC REPOS', value: m.publicRepos, color: '#58a6ff' },
    { label: 'ORIGINAL PROJECTS', value: m.originals, color: '#a371f7' },
    { label: 'CONTRIBUTIONS · 1Y', value: m.contributions, color: '#3fb950' },
    { label: 'COMMITS · 1Y', value: m.commits, color: '#f0883e' },
    { label: 'TECHNOLOGIES', value: m.techCount, color: '#f778ba' },
    { label: 'STARS EARNED', value: m.stars, color: '#e3b341' },
  ];
  const cw = (W - 56 - 5 * 12) / 6;
  const body = cells.map((c, i) => {
    const x = 28 + i * (cw + 12);
    return `<g class="fade" style="animation-delay:${0.1 + i * 0.12}s">
    <rect x="${x}" y="84" width="${cw}" height="112" rx="12" fill="#161b22" stroke="#30363d"/>
    <rect x="${x}" y="84" width="${cw}" height="3" rx="1.5" fill="${c.color}"/>
    <text x="${x + cw / 2}" y="146" ${FONT} font-size="30" font-weight="800" fill="${c.color}" text-anchor="middle">${fmtNum(c.value)}</text>
    <text x="${x + cw / 2}" y="176" ${MONO} font-size="10" letter-spacing="1" fill="#8b949e" text-anchor="middle">${c.label}</text>
  </g>`;
  }).join('\n');
  return frame(W, H, 'SYSTEM.STATS', './github --live', `synced ${m.syncedLabel}`, body);
}

function renderLanguages(langs, meta) {
  const W = 900, rowH = 34, top = 92;
  const H = top + langs.length * rowH + 40;
  const barX = 330, barW = W - barX - 40;
  const body = langs.map((l, i) => {
    const y = top + i * rowH;
    const w = Math.max(4, (l.pct / 100) * barW);
    return `<g class="fade" style="animation-delay:${0.08 * i}s">
    <circle cx="40" cy="${y - 5}" r="6" fill="${l.color}"/>
    <text x="56" y="${y}" ${FONT} font-size="15" font-weight="700" fill="#e6edf3">${esc(l.name)}</text>
    <text x="300" y="${y}" ${MONO} font-size="14" font-weight="700" fill="${l.color}" text-anchor="end">${l.pct.toFixed(1)}%</text>
    <rect x="${barX}" y="${y - 12}" width="${barW}" height="10" rx="5" fill="#21262d"/>
    <rect x="${barX}" y="${y - 12}" width="${w.toFixed(1)}" height="10" rx="5" fill="${l.color}">
      <animate attributeName="width" from="0" to="${w.toFixed(1)}" dur="1.4s" begin="${(0.2 + 0.08 * i).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0.22 1 0.36 1" keyTimes="0;1"/>
    </rect>
  </g>`;
  }).join('\n');
  const foot = `<text x="28" y="${H - 18}" ${MONO} font-size="11" fill="#6e7681">byte-weighted across ${meta.repos} original repositories · ${meta.manifests} manifests scanned · forks excluded</text>`;
  return frame(W, H, 'LANGUAGE.STACK', './stack.scan --all', `${langs.length} languages`, body + foot);
}

function donut(cx, cy, r, pct, color, delay) {
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#21262d" stroke-width="7"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" stroke-dashoffset="${dash.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})">
      <animate attributeName="stroke-dashoffset" from="${dash.toFixed(1)}" to="0" dur="1.3s" begin="${delay}s" fill="freeze"/>
    </circle>
    <text x="${cx}" y="${cy + 4}" ${MONO} font-size="11" font-weight="700" fill="#e6edf3" text-anchor="middle">${Math.round(pct)}%</text>`;
}

function renderRecent(projects) {
  const W = 900, cardW = (W - 56 - 16) / 2, cardH = 170, top = 84;
  const rows = Math.ceil(projects.length / 2);
  const H = top + rows * (cardH + 16) + 24;
  const body = projects.map((p, i) => {
    const x = 28 + (i % 2) * (cardW + 16);
    const y = top + Math.floor(i / 2) * (cardH + 16);
    const lang = p.primaryLanguage || { name: 'Code', color: '#8b949e' };
    const total = p.languages.edges.reduce((a, e) => a + e.size, 0) || 1;
    const share = ((p.languages.edges.find((e) => e.node.name === lang.name)?.size || total) / total) * 100;
    const desc = wrap(p.description || 'No description provided.', 46, 2);
    const GENERIC = ['JavaScript', 'TypeScript', 'HTML5', 'CSS3', 'ESLint', 'PostCSS', 'Node.js', 'Vercel'];
    const rank = { creative: 0, backend: 1, cloud: 2, mobile: 3, frontend: 4, tooling: 5 };
    const score = (t) => (t.name === 'Next.js' ? -1 : rank[t.cat]);
    const tech = p.tech.filter((t) => !GENERIC.includes(t))
      .map((t) => CATALOG.find((c) => c.name === t))
      .sort((a, b) => score(a) - score(b))
      .slice(0, 4).map((t) => t.name).join(' · ');
    return `<g class="fade" style="animation-delay:${0.15 + i * 0.15}s">
    <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="12" fill="#161b22" stroke="${i === 0 ? '#58a6ff' : '#30363d'}"/>
    <rect x="${x}" y="${y}" width="${cardW}" height="30" rx="12" fill="#1c2128"/>
    <rect x="${x}" y="${y + 18}" width="${cardW}" height="12" fill="#1c2128"/>
    <line x1="${x}" y1="${y + 30}" x2="${x + cardW}" y2="${y + 30}" stroke="#30363d"/>
    <circle cx="${x + 16}" cy="${y + 15}" r="3" fill="#58a6ff"/>
    <text x="${x + 26}" y="${y + 19}" ${MONO} font-size="10" fill="#8b949e">${esc(p.name.length > 40 ? p.name.slice(0, 39) + '…' : p.name)}</text>
    ${i === 0 ? `<rect x="${x + cardW - 98}" y="${y + 7}" width="84" height="16" rx="8" fill="#238636"/><text x="${x + cardW - 56}" y="${y + 19}" ${MONO} font-size="9" font-weight="700" fill="#ffffff" text-anchor="middle">LATEST PUSH</text>` : `<circle class="pulse" cx="${x + cardW - 16}" cy="${y + 15}" r="4" fill="#6e7681"/>`}
    <text x="${x + 16}" y="${y + 58}" ${MONO} font-size="15" font-weight="700" fill="#e6edf3">${esc(p.name.length > 30 ? p.name.slice(0, 29) + '…' : p.name)}<tspan class="pulse" fill="#58a6ff"> _</tspan></text>
    ${desc.map((d, k) => `<text x="${x + 16}" y="${y + 80 + k * 16}" ${MONO} font-size="11" fill="#8b949e">${esc(d)}</text>`).join('')}
    <text x="${x + 16}" y="${y + 126}" ${MONO} font-size="10" fill="#a371f7">${esc(tech)}</text>
    <rect x="${x + 16}" y="${y + 136}" width="${lang.name.length * 7 + 20}" height="18" rx="9" fill="none" stroke="${lang.color}" stroke-opacity=".7"/>
    <text x="${x + 26 + (lang.name.length * 7) / 2}" y="${y + 149}" ${MONO} font-size="10" fill="${lang.color}" text-anchor="middle">${esc(lang.name)}</text>
    <text x="${x + 48 + lang.name.length * 7}" y="${y + 149}" ${MONO} font-size="10" fill="#8b949e">★ ${p.stargazerCount}  ·  pushed ${fmtDate(p.pushedAt)}</text>
    ${donut(x + cardW - 46, y + 92, 26, share, lang.color, (0.4 + i * 0.15).toFixed(2))}
  </g>`;
  }).join('\n');
  return frame(W, H, 'PROJECTS.LIST', './projects.sh --recent', `${projects.length} most recent`, body);
}

function replaceSection(md, name, content) {
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(md)) throw new Error(`README marker ${name} not found`);
  return md.replace(re, `$1\n${content}\n$2`);
}

// ───────────────────────────── Main ─────────────────────────────
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

// Technology usage counts
const usage = new Map();
for (const r of scanned) for (const t of r.tech) usage.set(t, (usage.get(t) || 0) + 1);

// Languages (byte weighted)
const bytes = new Map();
for (const r of scanned) for (const e of r.languages.edges) {
  const cur = bytes.get(e.node.name) || { size: 0, color: e.node.color || '#8b949e' };
  cur.size += e.size;
  bytes.set(e.node.name, cur);
}
const totalBytes = [...bytes.values()].reduce((a, b) => a + b.size, 0) || 1;
let rawLangs = [...bytes.entries()]
  .map(([name, v]) => ({ name, color: v.color, pct: (v.size / totalBytes) * 100 }))
  .sort((a, b) => b.pct - a.pct);
const majorLangs = rawLangs.filter((l) => l.pct >= 0.5);
const minorLangs = rawLangs.filter((l) => l.pct < 0.5);
let langs = [...majorLangs];
if (minorLangs.length > 0) {
  const rest = minorLangs.reduce((a, l) => a + l.pct, 0);
  langs.push({ name: `Other (${minorLangs.length})`, color: '#6e7681', pct: rest });
}

const metrics = {
  publicRepos: user.publicRepos.totalCount,
  originals: scanned.length,
  contributions: user.contributionsCollection.contributionCalendar.totalContributions,
  commits: user.contributionsCollection.totalCommitContributions,
  stars: repos.filter((r) => !r.isFork).reduce((a, r) => a + r.stargazerCount, 0),
  followers: user.followers.totalCount,
  techCount: usage.size,
  syncedLabel: fmtDate(new Date().toISOString()),
};

const recent = scanned.filter((r) => !r.isArchived).slice(0, config.recentCount || 4);

await mkdir(path.join(ROOT, 'assets/generated'), { recursive: true });
await mkdir(path.join(ROOT, 'data'), { recursive: true });
await writeFile(path.join(ROOT, 'assets/generated/stats.svg'), renderStats(metrics));
await writeFile(path.join(ROOT, 'assets/generated/languages.svg'), renderLanguages(langs, { repos: scanned.length, manifests: manifestTotal }));
await writeFile(path.join(ROOT, 'assets/generated/recent-projects.svg'), renderRecent(recent));

// README: tech stack matrix
const stackHtml = CATEGORIES.map((c) => {
  const items = CATALOG.filter((t) => t.cat === c.key && usage.has(t.name)).sort((a, b) => usage.get(b.name) - usage.get(a.name));
  if (!items.length) return '';
  return `<tr><td width="24%" valign="middle"><b>${c.title}</b></td><td>\n${items.map((t) => `  ${badge(t.name, `${usage.get(t.name)} repo${usage.get(t.name) > 1 ? 's' : ''}`)}`).join('\n')}\n</td></tr>`;
}).filter(Boolean).join('\n');
const stackSection = `<table width="100%">\n${stackHtml}\n</table>\n<p align="center"><sub>Auto-detected from <b>${manifestTotal}</b> dependency manifests across <b>${scanned.length}</b> original repositories · badge = number of repos using it · last sync ${metrics.syncedLabel}</sub></p>`;

// README: flagship grid (sorted by most recent push)
const byName = new Map(repos.map((r) => [r.name, r]));
const flagship = config.flagship
  .map((f) => ({ ...f, data: byName.get(f.repo) }))
  .filter((f) => f.data)
  .sort((a, b) => new Date(b.data.pushedAt) - new Date(a.data.pushedAt));
const missing = config.flagship.filter((f) => !byName.has(f.repo)).map((f) => f.repo);
if (missing.length) console.warn(`⚠ flagship repos not found (deleted/private?): ${missing.join(', ')}`);
const isPortfolio = (u) => { try { return (config.portfolioHosts || []).includes(new URL(u).host); } catch { return false; } };
const cells = flagship.map((f, i) => {
  const r = f.data;
  const tech = (r.tech || []).filter((t) => !['JavaScript', 'HTML5', 'CSS3', 'ESLint', 'PostCSS'].includes(t)).slice(0, 6);
  const live = r.homepageUrl && !isPortfolio(r.homepageUrl) ? ` · <a href="${esc(r.homepageUrl)}">Live ↗</a>` : '';
  const tag = i === 0 ? `<img src="https://img.shields.io/badge/★%20LATEST%20PUSH-${shieldText(fmtDate(r.pushedAt))}-238636?style=flat-square&labelColor=0D1117" alt="Latest push" /><br/>` : '';
  return `<td width="50%" valign="top">
${tag}<h3>${f.icon || '⚡'} <a href="${r.url}">${esc(r.name)}</a></h3>
<p>${esc(f.description || r.description || 'No description provided.')}</p>
<p>${tech.map((t) => badge(t)).join(' ')}</p>
<sub>Updated ${fmtDate(r.pushedAt)}${live}</sub>
</td>`;
});
const rowsHtml = [];
for (let i = 0; i < cells.length; i += 2) rowsHtml.push(`<tr>\n${cells[i]}\n${cells[i + 1] || '<td width="50%"></td>'}\n</tr>`);
const flagshipSection = `<table width="100%">\n${rowsHtml.join('\n')}\n</table>`;

let readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
readme = replaceSection(readme, 'TECH-STACK', stackSection);
readme = replaceSection(readme, 'FLAGSHIP', flagshipSection);
await writeFile(path.join(ROOT, 'README.md'), readme);

await writeFile(
  path.join(ROOT, 'data/profile-data.json'),
  JSON.stringify({
    syncedAt: new Date().toISOString(),
    metrics,
    languages: langs,
    technologies: Object.fromEntries([...usage.entries()].sort((a, b) => b[1] - a[1])),
    repositories: scanned.map((r) => ({ name: r.name, pushedAt: r.pushedAt, language: r.primaryLanguage?.name || null, tech: r.tech })),
  }, null, 2) + '\n',
);
console.log(`Done · ${metrics.techCount} technologies · ${langs.length} language rows · recent: ${recent.map((r) => r.name).join(', ')}`);
