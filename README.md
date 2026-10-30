# ABSQU — Association Of Balkan Students at Queen's University

Website for the Association Of Balkan Students at Queen's University, plus an optional private **Exec area** (team chat) for the club's executive.

**Live site:** https://philipr8.github.io/balkan-club/  
**Exec area:** https://philipr8.github.io/balkan-club/exec/  
**Instagram:** https://www.instagram.com/abs_qu/ · **Linktree:** https://linktr.ee/absqu  
**Email:** QueensABSQU@gmail.com

---

## Tech stack

- Plain HTML5, CSS3, vanilla JavaScript — **no framework, no build step**
- Fonts: Baloo 2 Bold (headings) + Poppins (body) via Google Fonts
- Public site: zero dependencies beyond fonts and [flagcdn](https://flagcdn.com) flag images; the Instagram embed script loads lazily
- Exec area: Firebase Authentication + Cloud Firestore (free **Spark** plan), loaded from Google's CDN **only on `/exec/`** — the public site never touches Firebase
- Hosting: GitHub Pages, deployed by `.github/workflows/pages.yml` from `/docs`

## Brand

| Colour | Hex | | Colour | Hex |
|---|---|---|---|---|
| ABS Black | `#111111` | | Sun Gold | `#F2C230` |
| White | `#FFFFFF` | | Balkan Green | `#00966E` |
| Balkan Red | `#C8102E` | | Warm Cream | `#FFF8ED` |
| Balkan Blue | `#0F4C81` | | | |

The logo (`docs/images/logo.jpg`) is only ever placed on white or cream, never recoloured or stretched. Tokens live at the top of `docs/style.css` (`:root`).

## Project structure

```
balkan-club/
├── README.md
├── FIREBASE_SETUP.md              ← click-by-click Firebase guide (start here for the Exec area)
├── TEST_CHECKLIST.md              ← manual QA list
├── firestore.rules                ← Firestore security rules (publish in the Firebase console)
├── netlify.toml                   ← legacy; not used by GitHub Pages
├── .gitignore                     ← ignores docs/firebase-config.js
├── .github/workflows/pages.yml    ← deploy + writes firebase-config.js from a GitHub secret
└── docs/                          ← site root (GitHub Pages)
    ├── index.html                 ← the whole public single-page site
    ├── style.css
    ├── script.js
    ├── firebase-config.example.js ← template (committed)
    ├── firebase-config.js         ← your real config (NOT committed)
    ├── exec/
    │   ├── index.html             ← login + team chat + admin panel
    │   ├── exec.css
    │   └── exec.js
    └── images/
        ├── logo.jpg
        ├── hero-banner.jpg  (+ hero-banner-900.jpg for phones)
        └── …
```

## Local development

```bash
python3 -m http.server 8000 --directory docs
# public site:  http://localhost:8000
# exec area:    http://localhost:8000/exec/   (needs docs/firebase-config.js — see FIREBASE_SETUP.md)
```

## Updating content

Everything public is in `docs/index.html`; find sections by their `id`:

| Section | `id` | Notes |
|---|---|---|
| Hero | `home` | Name, motto, CTA buttons |
| Flags ribbon | — | Under the hero; two identical lists (the 2nd is for the seamless loop — edit both) |
| About + countries | `about`, `countries` | Stats tiles use `data-count="…"` |
| What we do | `pillars` | The three pillars |
| Events | `events` | Three cards: `event--red / blue / green` |
| **Team** | `team` | One `<article class="dept">` per group; co-presidents are `.president` |
| Gallery + Instagram | `gallery`, `instagram` | See below |
| Contact | `contact` | Email, Instagram, Linktree |

**Changing the team next year:** edit the `#team` section — names, initials (inside `.avatar`), and the count in `.dept__head span`. Then update who has a login (see *Exec area* below).

**Adding gallery photos:** drop the image in `docs/images/`, copy a `<figure class="shot">…</figure>` block in the `.gallery` grid (use `shot--hero` for a big tile, plain `shot` for a small one), and set `src`, `alt` and the caption.

**Instagram posts:** the feed grid holds `<blockquote class="instagram-media" data-instgrm-permalink="…">` blocks — swap in new post URLs.

## Exec area

A private, optional team area at `/exec/` — login is never required to view the public site.

- **Login:** Firebase Email/Password. Accounts are created by you in the Firebase console; there's no public sign-up.
- **Roles:** `admin` (Philip Radeff, Alexander Jakov) and `exec` (everyone else), stored in Firestore at `users/{uid}` as `{ name, email, role, active }`. Enforced by `firestore.rules` on the server.
- **Chat:** channels `#announcements` (admin-post-only), `#general`, `#events`, `#marketing`, `#finance`; real-time via Firestore listeners; sender name + timestamp on every message.
- **Admins** can create/archive channels, view members, change roles, deactivate members, approve new sign-ins, post announcements and delete messages.
- **Config is never committed:** `docs/firebase-config.js` is gitignored; on deploy, the GitHub Action generates it from the `FIREBASE_CONFIG_JSON` repository secret. If it's absent, the public site is unaffected and `/exec/` just says it isn't switched on.

Full walkthrough: **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)**. QA list: **[TEST_CHECKLIST.md](TEST_CHECKLIST.md)**.

## Deployment

GitHub Pages is deployed by `.github/workflows/pages.yml` on every push to `main`:

```bash
git add .
git commit -m "Update site content"
git push
```

**One-time setting:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions** (required so the workflow can inject the Firebase config). Watch runs at https://github.com/philipr8/balkan-club/actions.
