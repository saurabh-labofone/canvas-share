# canvas-share

Hosting surface for Canvas / Sketch work — decks, scripts, and notes — served via GitHub Pages and shared with the team behind one shared password.

**Live:** https://saurabh-labofone.github.io/canvas-share/

## How it works

- Every page is a self-contained HTML file, **AES-256 encrypted with [StatiCrypt](https://github.com/robinmoisson/staticrypt)** before it lands here. Without the team password, the files in this repo are unreadable ciphertext.
- Plaintext sources, the manifest, and the password live **only locally** under `_src/` (gitignored). This public repo only ever receives encrypted output.
- The landing page (`index.html`) is regenerated from the manifest on every publish.

## Publishing (run from `~/canvas-site`)

```bash
node tools/publish.mjs --type deck   --title "Q3 GTM Deck" --in /path/to/deck.html --blurb "one-liner" --push
node tools/publish.mjs --type script --title "Demo script" --in /path/to/script.html --push
node tools/publish.mjs --type note   --title "Pricing notes" --in /path/to/note.html --push
```

Other commands:

```bash
node tools/publish.mjs --list                 # list everything published (🔒 gated / 🔓 public)
node tools/publish.mjs --unlock <slug> --push # remove the password from one page (make it public)
node tools/publish.mjs --lock <slug> --push   # re-gate a public page
node tools/publish.mjs --remove <slug>        # unpublish an item
node tools/publish.mjs --reencrypt-all --push # rotate after changing the password in _src/.gate.env
```

A page can be published open from the start with `--no-encrypt`. Public pages are marked `public: true` in the manifest, so password rotation never re-gates them. The hub `index.html` is always gated regardless — `--unlock` only opens the named page.

Drop `--push` to build locally without pushing. GitHub Pages takes ~30–90s to go live after a push.
