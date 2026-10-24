# CinePulse QA Audit — Phase 1: Baseline Findings

**Audit Timestamp**: 2026-10-24 00:39 IST  
**Environment**: Windows 11 (PowerShell) / Node.js >= 22 / Next.js 16.3.5 (Webpack)  
**Local URL**: `http://127.0.0.1:3000`  
**Deployed URL**: `https://cinepulse-kohl.vercel.app`  
**Git Repository Root**: `C:/Users/rey/Downloads/cinepulse-v2.1-completed`  
**Project Subdirectory**: `cinepulse-v2`  
**Current Audited Branch**: `feat/v8-improvements`  
**Local Branch SHA**: `116c7dac03d98ed0776d5aefbfc2cf97d6b327ca`  

---

## 1. CRITICAL: Deployed Commit SHA vs Branch Mismatch

> [!WARNING]
> **STOP CONDITION TRIGGERED**: The deployed production environment does **NOT** match the branch being audited.

- **Audited Branch (Local HEAD)**: `feat/v8-improvements` @ `116c7da` (`116c7dac03d98ed0776d5aefbfc2cf97d6b327ca`)
- **Remote Branch (`origin/feat/v8-improvements`)**: `116c7da` (in sync with local)
- **Deployed Production URL (`https://cinepulse-kohl.vercel.app`)**:
  - Built from `main` @ `86f1acf` (`86f1acfee7d44ad1626a7ecfda4a30aa84a506bc` - "Merge pull request #5 from ronitparmar24/feat/v8-improvements")
  - GitHub Deployment ID: `7231687994` (Environment: `Production`, Created: 2026-10-21T16:42:20Z)
  - Next.js Build ID on deployed site: `-xCSDjesTVxB1pjwh9urQ`
- **Divergence**:
  The audited branch `feat/v8-improvements` has **4 unmerged commits** ahead of `main`:
  1. `49ef89a` - `feat: add Discovery component and global styles for enhanced movie browsing and UI layout`
  2. `76900c9` - `feat: add global CSS stylesheet with design system variables and layout styles`
  3. `df2285d` - `feat: add Discovery component and environment configuration for movie catalog`
  4. `116c7da` - `feat: add Discovery component with catalog filtering, trailers, and theater listings`

**Impact**: Testing on `https://cinepulse-kohl.vercel.app` tests commit `86f1acf`, which lacks recent Discovery component refactors, trailer listing updates, and theater listings present in `feat/v8-improvements`.

---

## 2. Command Execution Ground Truth

### Command 1: `npm ci`
- **Status**: PASSED (Exit code: 0)
- **Duration**: 32s
- **Output Summary**:
  ```text
  added 50 packages, and audited 51 packages in 32s
  6 packages are looking for funding
  3 vulnerabilities (2 high, 1 critical)
  ```
- **Finding**: 3 npm security vulnerabilities reported in dependency tree.

### Command 2: `npm run typecheck` (`tsc --noEmit`)
- **Status**: PASSED (Exit code: 0)
- **Output**:
  ```text
  > cinepulse@2.1.0 typecheck
  > tsc --noEmit
  ```
- **Finding**: 0 TypeScript compilation errors.

### Command 3: `npm run lint`
- **Status**: FAILED (Exit code: 1)
- **Error Output**:
  ```text
  npm error Missing script: "lint"
  ```
- **Investigation**:
  - `package.json` contains no `"lint"` script in `scripts`.
  - `devDependencies` does not include `eslint` or `@typescript-eslint`.
  - Next.js 16 CLI has removed the built-in standalone `next lint` command.
- **Tag**: `LOCAL`

### Command 4: `npm test`
- **Status**: PASSED (Exit code: 0)
- **Duration**: 26.9s
- **Test Matrix**:
  - Tests run: 212
  - Passed: 212
  - Failed: 0
  - Skipped: 0
- **Warnings Observed during test execution**:
  ```text
  (node:xxx) ExperimentalWarning: SQLite is an experimental feature and might change at any time
  [CINEPULSE FETCHERS] YOUTUBE_API_KEY is not configured. youtube features will degrade gracefully to null.
  ```

### Command 5: `npm run build` (Production Build, Webpack)
- **Status**: PASSED (Exit code: 0)
- **Compilation Duration**: 4.9s
- **Static Page Generation**: 9/9 pages generated in 1315ms
- **Build Output Route Map**:
  ```text
  Route (app)
  ┌ ○ /
  ├ ○ /_not-found
  ├ ○ /admin/ai-community
  ├ ƒ /api/[...path]
  ├ ○ /icon.svg
  ├ ○ /opengraph-image
  ├ ○ /receipts
  ├ ƒ /receipts/[id]
  ├ ƒ /receipts/[id]/opengraph-image
  ├ ○ /robots.txt
  ├ ○ /sitemap.xml
  ├ ƒ /u/[username]
  ├ ƒ /u/[username]/taste-dna
  └ ƒ /user/[username]/taste-dna

  ○  (Static)   prerendered as static content
  ƒ  (Dynamic)  server-rendered on demand
  ```
- **Build Warnings**:
  1. `⚠ Warning: Next.js ignored package-lock.json in C:\Users\rey because it is outside the current Git repository (C:\Users\rey\Downloads\cinepulse-v2.1-completed).`
  2. `(node:xxx) ExperimentalWarning: SQLite is an experimental feature and might change at any time` emitted by multiple worker threads during static generation.

### Command 6: `npm run start` (`npx next start --hostname 127.0.0.1 --port 3000`)
- **Status**: PASSED (Running as background daemon)
- **Readiness**: Ready in 167ms on `http://127.0.0.1:3000`
- **Local Probe**:
  - `curl.exe -I http://127.0.0.1:3000/` -> `HTTP/1.1 200 OK`
  - `curl.exe -s http://127.0.0.1:3000/api/health` -> `HTTP/1.1 200 OK` (TMDB verified after initial check)

---

## 3. Raw Baseline Findings Matrix

| Finding ID | Description | Severity | Environment | Evidence |
|---|---|---|---|---|
| **BASE-01** | **Deployed Production commit SHA (`86f1acf`) does not match audited branch (`116c7da`)** | S1 Blocker | DEPLOYED | GitHub Deployments API returned SHA `86f1acfee...` for Production vs local HEAD `116c7dac...` (4 commits ahead). |
| **BASE-02** | **Email/Password Login and Register blocked by Turnstile secret without widget** | S1 Blocker | BOTH | `POST /api/auth/login` returns `403 Forbidden` (`{"error":"Turnstile verification token is required"}`). `TURNSTILE_SECRET_KEY` is present in env, but no client widget exists to generate the token. |
| **BASE-03** | **Missing `lint` script and ESLint tooling** | S3 Minor | LOCAL | `npm run lint` fails with `Missing script: "lint"`. No linter installed in `devDependencies`. |
| **BASE-04** | **Next.js monorepo root tracing warning** | S4 Cosmetic | LOCAL | `Next.js ignored package-lock.json in C:\Users\rey... To use this directory, set outputFileTracingRoot in your Next.js config.` |
| **BASE-05** | **Hugging Face Inference API quota exhausted (HTTP 402)** | S3 Minor | BOTH | `/api/health` live response: Provider `hf` reports `lastError: "HTTP 402"`. Cloudflare Workers AI is successfully handling fallback. |
| **BASE-06** | **Streaming Availability (RapidAPI) returns HTTP 403** | S3 Minor | BOTH | `check-all-keys.mjs` reports `RapidAPI 403 (You are not subscribed to this API.)`. Watchmode is active as fallback. |
| **BASE-07** | **HEAD requests to GET API routes rejected with HTTP 403** | S3 Minor | BOTH | `enforceOrigin` is called whenever `method !== 'GET'`. `HEAD` requests are not exempted from CSRF origin checks. |
| **BASE-08** | **Node.js Experimental SQLite Warning emitted on build and tests** | S4 Cosmetic | BOTH | `node:sqlite` emits `ExperimentalWarning: SQLite is an experimental feature and might change at any time`. |
| **BASE-09** | **3 npm security vulnerabilities in dependencies** | S3 Minor | LOCAL | `npm ci` reports 2 high, 1 critical vulnerability. |
