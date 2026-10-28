# AGENT.md — ZETIC7Z GitHub Profile Automation & Architecture

## Overview
This repository (`ZETIC7Z/ZETIC7Z`) serves as the official GitHub special profile repository for **Sam Pangilinan** (`@ZETIC7Z` / `ZETICUZ` / `https://www.zeticuz.xyz/`).
It features a high-performance, real-time autonomous auto-sync engine that scans the user's public repositories, audits full-stack technology usage from dependency manifests, tracks the most recent repository pushes, and renders zero-latency native SVGs and formatted Markdown tables adhering to the GTA V Los Santos dark terminal aesthetic.

---

## Key Components

### 1. Configuration (`profile.config.json`)
- `username`: `"ZETIC7Z"`
- `excludedRepos`: `["ZETIC7Z", "GMCS-Dashboard"]` (excludes meta profile repo and archived/deprecated projects)
- `recentCount`: `4` (dynamically pulls the 4 most recently pushed repositories)
- `flagshipRepos`: Curated list of 6 flagship production architectures:
  1. `Barangay-Online-E-Governance-Portal` (e-governance portal, featured as latest push)
  2. `CLIENT-QMS` (Queue Management System)
  3. `CareerForm` (3D interactive application portal)
  4. `Frances-Gaik-WEBSITE` (holistic health & wellness portal)
  5. `nexus3.0` (modern cloud collaboration workspace)
  6. `NEXUS` (enterprise collaboration & streaming workspace)

### 2. Auto-Sync Scanner (`scripts/sync-profile.mjs`)
- **GraphQL Discovery**: Queries GitHub GraphQL API for all public non-fork repositories with topics, languages (byte counts), and latest push timestamps.
- **Dependency Audit**: Inspects tree blobs across repositories (`package.json`, `requirements.txt`, etc.) to categorize technologies across 6 key disciplines:
  - Frontend Architecture
  - Creative 3D & WebGL
  - Backend & APIs
  - Cloud & DevOps
  - Testing & Tooling
  - Mobile & PWA
- **Native SVG Generator**: Generates 100% local, self-contained SVG cards in `assets/generated/`:
  - `about.svg`: `OPERATOR.PROFILE ./whoami --extended`
  - `languages.svg`: `LANGUAGE.STACK ./stack.scan --all` with animated progress bars
  - `stats.svg`: `SYSTEM.STATS ./github --live` 6-metric HUD
  - `recent-projects.svg`: `PROJECTS.LIST ./projects.sh --recent` featuring dynamic `★ LATEST PUSH` badge
  - `connect.svg`: `COMMUNICATIONS.MATRIX ./connect --mesh`
- **Markdown Hydration**: Automatically updates `README.md` between sentinel comments:
  - `<!-- TECH-STACK:START --> ... <!-- TECH-STACK:END -->`
  - `<!-- FLAGSHIP:START --> ... <!-- FLAGSHIP:END -->`

### 3. GitHub Actions CI/CD (`.github/workflows/sync-profile.yml`)
- Triggered on:
  - Hourly cron schedule (`7 * * * *`)
  - Push to `main`
  - Manual trigger via `workflow_dispatch`
- Uses repository secret `PROFILE_TOKEN` with write permissions to auto-commit updates back to `main` with `[skip ci]`.

---

## Operating Instructions & Verification

### Running the Scanner Locally
```powershell
$env:GH_TOKEN="<your_github_token>"
node scripts/sync-profile.mjs
```

### Checking CI/CD Runs
```powershell
gh run list --limit 5
```

### Git Push Command with Windows SChannel Fix
```powershell
git -c http.sslVerify=false push origin main
```

---

## Design System & Branding Standards
- **Aesthetic**: Authentic GTA V Los Santos dark terminal, amber/gold accents (`#ffaa00`, `#ffcc00`), cyber matrix green (`#00ff66`), crimson alerts (`#ff3366`), and dark acrylic panels (`#0a0d14`).
- **Footer Attribution**:
  - `[zeticuz-logo.svg] SITE DEVELOPED BY: Sam Pangilinan · © 2026`
  - Interactive link to `https://www.zeticuz.xyz/`
