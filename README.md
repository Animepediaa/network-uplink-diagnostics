# EtherPulse AI — Network Diagnostics & Web3 Security Scanner

A premium, standalone network diagnostics tool with an AI-powered security scanner and Web3 payment integration. All sensitive credentials are secured server-side via Cloudflare Workers — never exposed in the browser or this repository.

---

## Architecture

```
Browser (etherpulse.html)
        │
        │  POST /api/security/check  ← no API key sent
        ▼
Cloudflare Worker  (worker/)
        │  GEMINI_API_KEY ← encrypted Worker Secret (Cloudflare only)
        │  PAYMENT_WALLET ← hardcoded in worker/index.js
        ▼
Google Gemini AI API
```

**Security properties:**
- ✅ Gemini API Key is an encrypted Cloudflare Secret — never in source code or browser
- ✅ Payment wallet address is hardcoded in the backend — users cannot redirect payments
- ✅ GitHub repo can be **fully public** with no secrets at risk
- ✅ Free: Cloudflare Workers free tier = 100,000 requests/day

---

## Deployment Guide

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- [Cloudflare account](https://cloudflare.com) (free)
- A Gemini API Key from [Google AI Studio](https://aistudio.google.com/apikey)

---

### Step 1: Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
# → Opens browser to authenticate with your Cloudflare account
```

---

### Step 2: Deploy the Cloudflare Worker

```bash
cd worker
npm install
wrangler deploy
```

You'll see output like:
```
✅ Deployed to: https://etherpulse-worker.YOUR-SUBDOMAIN.workers.dev
```

Copy this URL.

---

### Step 3: Set Your Gemini API Key as a Secret

```bash
wrangler secret put GEMINI_API_KEY
# → Paste your Gemini API key when prompted
# → Key is stored encrypted by Cloudflare — NOT in any file
```

This only needs to be done **once**. The key is stored permanently on Cloudflare's servers.

---

### Step 4: Update the Worker URL in etherpulse.html

Open `etherpulse.html` and find line:
```js
const WORKER_URL = 'https://etherpulse-worker.your-subdomain.workers.dev';
```

Replace `your-subdomain` with your actual Cloudflare subdomain from Step 2.

---

### Step 5: Deploy to GitHub Pages (optional)

```bash
git add .
git commit -m "feat: configure worker URL"
git push origin main
```

Then in GitHub → Settings → Pages → Deploy from `main` branch root.

Your app will be live at: `https://YOUR-USERNAME.github.io/YOUR-REPO/etherpulse.html`

---

## Payment Wallet

Premium security scans require a micro-payment of `0.0001 POL` (Polygon) or `0.0001 ETH` (Base).

The destination wallet address is hardcoded in `worker/index.js`:
```js
const PAYMENT_WALLET = '0x6b62122ABE518446561d3B6E58227F46214737dF';
```

> **This address cannot be changed by users from the frontend.** Any attempt to send payment to a different address will not unlock premium features.

To update the payment wallet, edit `worker/index.js` and re-run `wrangler deploy`.

---

## Local Development

```bash
cd worker
wrangler dev
```

Then open `etherpulse.html` in your browser and update `WORKER_URL` to `http://localhost:8787`.

---

## File Structure

```
etherpulse.html          ← Standalone frontend (open directly in browser)
worker/
  index.js               ← Cloudflare Worker (secure Gemini proxy + payment verifier)
  wrangler.toml          ← Worker deployment config
  package.json           ← Worker dev dependencies
```
