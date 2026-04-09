# ABSQU — Association Of Balkan Students at Queen's University

Website for the Association Of Balkan Students at Queen's University.

**Live site:** https://philipr8.github.io/balkan-club/  
**Instagram:** https://www.instagram.com/abs_qu/  
**Email:** QueensABSQU@gmail.com

---

## Tech Stack

- Plain HTML5, CSS3, vanilla JavaScript (no framework, no build step)
- [Playfair Display + Inter](https://fonts.google.com/) via Google Fonts
- [AOS](https://michaelosthege.github.io/aos/) (Animate On Scroll) via CDN
- GitHub Pages — served from `/docs` folder on `main` branch

---

## Project Structure

```
balkan-club/
├── README.md
├── .gitignore
└── docs/                ← GitHub Pages root
    ├── index.html       ← entire single-page site
    ├── style.css
    ├── script.js
    └── images/
        ├── logo.png
        ├── hero-banner.jpg
        ├── community.jpg
        ├── contact-bg.jpg
        ├── balkans-education.jpg
        └── insta-post-*.jpg   ← add Instagram post images here
```

---

## Local Development

No build step required. Open directly in a browser:

```bash
# Option 1: open directly
open docs/index.html

# Option 2: local server (avoids any CORS issues with fonts)
python3 -m http.server 8000 --directory docs
# then visit http://localhost:8000
```

---

## Adding Real Images

The Google Sites CDN URLs in the HTML expire and are access-controlled.
To replace them with permanent local images:

1. Open https://sites.google.com/view/absqu/home in your browser
2. Right-click each image → **Save Image As** → save to `docs/images/` with these names:
   - `logo.png` — the club logo
   - `hero-banner.jpg` — the main hero/banner image
   - `community.jpg` — the community gathering photo
   - `contact-bg.jpg` — the contact section background
   - `balkans-education.jpg` — the Balkans educational image
3. In `docs/index.html`, search for `TODO` comments — each one shows exactly where to swap in the local path

---

## Adding Instagram Post Images

The Instagram section has 6 placeholder slots. To fill them with real posts:

1. Go to https://www.instagram.com/abs_qu/
2. Open a post, right-click the image → **Copy Image Address**
3. In `docs/index.html`, find the `<!-- Post 1 -->` comment and replace the placeholder `<div>` with:
   ```html
   <img src="PASTE_URL_HERE" alt="Description of post" loading="lazy" />
   ```
   Or download the image as `docs/images/insta-post-1.jpg` (recommended for reliability).
4. Repeat for posts 2–6.

---

## GitHub Pages Deployment

1. Push changes to `main`:
   ```bash
   git add .
   git commit -m "Update site content"
   git push
   ```
2. GitHub Pages auto-deploys from `/docs` on `main` — live within ~60 seconds.
3. Check status: https://github.com/philipr8/balkan-club/actions

**First-time setup** (one-time, done in GitHub repo settings):
- Settings → Pages → Source: **Deploy from a branch**
- Branch: `main`, Folder: `/docs` → Save
- Site will be at: `https://philipr8.github.io/balkan-club/`

---

## Updating Content

All content is in `docs/index.html`. Search for these HTML comments to find each section:
- `<!-- HERO -->` — club name, tagline, CTA buttons
- `<!-- ABOUT -->` — who we are text
- `<!-- EVENTS -->` — event cards (add/edit events here)
- `<!-- TEAM -->` — team member names and roles
- `<!-- GALLERY -->` — photo grid
- `<!-- INSTAGRAM -->` — Instagram post grid
- `<!-- CONTACT -->` — email, phone, links

Colors and fonts: edit the `:root` block at the top of `docs/style.css`.
