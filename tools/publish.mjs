#!/usr/bin/env node
// Canvas Shared Work — publish engine.
// Takes a self-contained HTML file, AES-encrypts it with the team password
// (StatiCrypt), regenerates the branded index, and optionally commits + pushes.
// Plaintext sources, the manifest, and the password live ONLY under _src/ (gitignored).
// The public repo only ever receives encrypted output.

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // repo root
const SRC = join(ROOT, '_src');
const PLAIN = join(SRC, 'plain');
const MANIFEST = join(SRC, 'manifest.json');
const ENV_FILE = join(SRC, '.gate.env');

const USER = 'saurabh-labofone';
const REPO = 'canvas-share';
const BASE_URL = `https://${USER}.github.io/${REPO}`;

const TYPES = { deck: 'decks', script: 'scripts', note: 'notes' };
const TYPE_LABEL = { deck: 'Decks', script: 'Scripts', note: 'Notes' };
const TYPE_SINGULAR = { deck: 'Deck', script: 'Script', note: 'Note' };

// ---------- args ----------
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[key] = true;
      else { a[key] = next; i++; }
    } else a._.push(t);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));

function die(msg) { console.error('✖ ' + msg); process.exit(1); }
function ok(msg) { console.log('✓ ' + msg); }

// ---------- helpers ----------
function loadEnv() {
  if (!existsSync(ENV_FILE)) die(`Missing ${ENV_FILE}`);
  const out = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  if (!out.STATICRYPT_PASSWORD) die('STATICRYPT_PASSWORD not set in _src/.gate.env');
  if (!out.STATICRYPT_SALT) die('STATICRYPT_SALT not set in _src/.gate.env');
  return out;
}
function loadManifest() {
  if (!existsSync(MANIFEST)) return [];
  try { return JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch { return []; }
}
function saveManifest(items) { writeFileSync(MANIFEST, JSON.stringify(items, null, 2) + '\n'); }
function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
}
function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- index page ----------
function renderIndex(items) {
  const byType = t => items.filter(i => i.type === t)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  const section = (type) => {
    const list = byType(type);
    if (!list.length) return '';
    const cards = list.map(i => `
        <a class="card" href="${esc(i.file)}">
          <span class="kicker">${TYPE_SINGULAR[type]}</span>
          <h3>${esc(i.title)}</h3>
          ${i.blurb ? `<p>${esc(i.blurb)}</p>` : ''}
          <time>${esc(i.date)}</time>
        </a>`).join('');
    return `
      <section>
        <h2>${TYPE_LABEL[type]}<span class="count">${list.length}</span></h2>
        <div class="grid">${cards}</div>
      </section>`;
  };
  const empty = items.length ? '' : `<p class="empty">Nothing published yet.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Canvas — Shared work</title>
<style>
  :root{--cyan:#52D7F4;--cream:#F9F6E6;--yellow:#F0D756;--ink:#0e1116;--muted:#5b6470;--line:#e7e3d2}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--cream);-webkit-font-smoothing:antialiased}
  .wrap{max-width:980px;margin:0 auto;padding:0 24px}
  header{background:linear-gradient(120deg,var(--cyan),var(--yellow));padding:72px 0 60px}
  .brand{font-weight:700;letter-spacing:.04em;font-size:12px;text-transform:uppercase;color:rgba(14,17,22,.6)}
  h1{font-size:42px;letter-spacing:-.03em;margin:10px 0 8px;font-weight:800}
  .sub{font-size:16px;color:rgba(14,17,22,.72);max-width:48ch}
  main{padding-bottom:90px}
  section{margin-top:52px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:18px;display:flex;align-items:center;gap:10px}
  .count{background:#fff;border:1px solid var(--line);border-radius:999px;font-size:11px;padding:2px 9px;color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:16px}
  .card{display:block;background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;text-decoration:none;color:inherit;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
  .card:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(14,17,22,.10);border-color:var(--cyan)}
  .kicker{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#0bb6d6;font-weight:700}
  .card h3{font-size:19px;letter-spacing:-.01em;margin:7px 0 9px;font-weight:700;line-height:1.25}
  .card p{font-size:14px;color:var(--muted);margin-bottom:16px}
  .card time{font-size:12px;color:#9aa2ad}
  .empty{margin-top:52px;color:var(--muted)}
  footer{margin-top:72px;padding-top:22px;border-top:1px solid var(--line);font-size:13px;color:#9aa2ad}
</style>
</head>
<body>
<header><div class="wrap">
  <div class="brand">Canvas / Sketch</div>
  <h1>Shared work</h1>
  <p class="sub">Decks, scripts, and notes — published for the team. Pick anything below.</p>
</div></header>
<main class="wrap">
  ${empty}${section('deck')}${section('script')}${section('note')}
  <footer>Private to the Canvas team · password-protected</footer>
</main>
</body>
</html>`;
}

// ---------- encryption ----------
function encrypt(plainPath, outDir, env, title) {
  mkdirSync(join(ROOT, outDir), { recursive: true });
  execFileSync('npx', [
    '-y', 'staticrypt@3', plainPath,
    '-p', env.STATICRYPT_PASSWORD,
    '-s', env.STATICRYPT_SALT,
    '-d', outDir,
    '--remember', '30', '--short',
    '--template-title', title,
    '--template-color-primary', '#52D7F4',
    '--template-color-secondary', '#F9F6E6',
    '--template-instructions', 'Enter the team password to view this.',
    '--template-button', 'View',
    '--template-placeholder', 'Team password',
    '--template-remember', 'Keep me in for 30 days',
  ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
}

function rebuildIndex(items, env) {
  const plainIndex = join(PLAIN, 'index.html');
  writeFileSync(plainIndex, renderIndex(items));
  if (args['no-encrypt']) copyFileSync(plainIndex, join(ROOT, 'index.html'));
  else encrypt(plainIndex, '.', env, 'Canvas — Shared work');
}

// ---------- git ----------
function gitPush(msg) {
  execFileSync('git', ['add', '-A'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', msg], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('git', ['push'], { cwd: ROOT, stdio: 'inherit' });
}

// ---------- commands ----------
function cmdPublish() {
  const type = args.type;
  if (!TYPES[type]) die(`--type must be one of: ${Object.keys(TYPES).join(', ')}`);
  if (!args.title) die('--title "..." is required');
  if (!args.in) die('--in <path-to-html> is required');
  const inPath = resolve(process.cwd(), args.in);
  if (!existsSync(inPath)) die(`Input not found: ${inPath}`);

  const env = loadEnv();
  const date = args.date || today();
  const slug = args.slug ? slugify(args.slug) : `${date}-${slugify(args.title)}`;
  const typeDir = TYPES[type];
  const rel = `${typeDir}/${slug}.html`;

  // stash plaintext (local only)
  const plainPagePath = join(PLAIN, typeDir, `${slug}.html`);
  mkdirSync(dirname(plainPagePath), { recursive: true });
  copyFileSync(inPath, plainPagePath);

  // manifest upsert
  let items = loadManifest().filter(i => !(i.type === type && i.slug === slug));
  items.push({ type, slug, title: args.title, blurb: args.blurb || '', date, file: rel });
  saveManifest(items);

  // encrypt page + rebuild index
  if (args['no-encrypt']) {
    mkdirSync(join(ROOT, typeDir), { recursive: true });
    copyFileSync(plainPagePath, join(ROOT, rel));
  } else {
    encrypt(plainPagePath, typeDir, env, args.title);
  }
  rebuildIndex(items, env);
  writeFileSync(join(ROOT, '.nojekyll'), '');

  if (args.push) gitPush(`publish: ${type} — ${slug}`);

  console.log('');
  ok(`Published ${type}: ${args.title}`);
  console.log(`  Page:  ${BASE_URL}/${rel}`);
  console.log(`  Index: ${BASE_URL}/`);
  if (!args.push) console.log('  (local only — not pushed yet)');
}

function cmdReencryptAll() {
  const env = loadEnv();
  const items = loadManifest();
  for (const i of items) {
    const p = join(PLAIN, i.file);
    if (existsSync(p)) encrypt(p, dirname(i.file), env, i.title);
    else console.error(`  (skipped, plaintext missing: ${i.file})`);
  }
  rebuildIndex(items, env);
  writeFileSync(join(ROOT, '.nojekyll'), '');
  if (args.push) gitPush('reencrypt: rotate gate password');
  ok(`Re-encrypted ${items.length} page(s) + index.`);
}

function cmdList() {
  const items = loadManifest().sort((a, b) => b.date.localeCompare(a.date));
  if (!items.length) return console.log('(nothing published yet)');
  for (const i of items) console.log(`  [${i.type}] ${i.date}  ${i.title}  → ${BASE_URL}/${i.file}`);
}

function cmdRemove() {
  const env = loadEnv();
  const slug = slugify(args.remove === true ? '' : args.remove);
  let items = loadManifest();
  const hit = items.find(i => i.slug === slug);
  if (!hit) die(`No item with slug "${slug}". Use --list to see slugs.`);
  items = items.filter(i => i.slug !== slug);
  saveManifest(items);
  for (const base of [join(ROOT, hit.file), join(PLAIN, hit.file)]) {
    if (existsSync(base)) rmSync(base);
  }
  rebuildIndex(items, env);
  if (args.push) gitPush(`remove: ${slug}`);
  ok(`Removed ${slug}. (The encrypted file in git history still exists — rotate the password if it was sensitive.)`);
}

// ---------- dispatch ----------
if (args.list) cmdList();
else if (args.remove) cmdRemove();
else if (args['reencrypt-all']) cmdReencryptAll();
else cmdPublish();
