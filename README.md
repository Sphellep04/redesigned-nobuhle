# Nonhle's Cosmetics website

The website for [nonhle-cosmetics.store](https://nonhle-cosmetics.store/): a single-page shop and booking site for natural hair care, braiding, makeup and nails. Customers add products to a basket and send the order on WhatsApp, and they book services the same way. There's no payment gateway and no database.

A small password-protected **site editor** at `/admin/` lets the owner change products, prices, services, gallery photos and contact details without touching code.

## What's in the folder

```text
index.html            The website
assets/css, js, img   Styles, behaviour and the site's own photos (hero, routine, services, founder, logo)
data/content.json     Products, services, gallery and contact details. The editor writes this file.
uploads/              Photos uploaded through the editor (product and gallery photos)
admin/                The site editor (PHP)
.htaccess             Server settings: security headers, caching, blocks private files
```

## Using the site editor

1. Go to `https://nonhle-cosmetics.store/admin/`.
2. **First visit only:** you'll be asked for a **setup code** and a new password (at least 10 characters). To get the code, open cPanel → **File Manager** → `public_html/admin/storage/setup-code.php`. The code is written there, and the file deletes itself once the password is created. Only someone with the hosting login can see it, so nobody else can claim the editor.
3. Log in, make your changes, then select **Save changes**. Changes are live as soon as they're saved.

| To… | Go to | Notes |
| --- | --- | --- |
| Set or change a price | Products or Services → select the item | A price of 0 shows "Price on request". |
| Add a product photo | Products → item → Upload photo | Portrait photos (4:5) look best. Photos are resized automatically. |
| Add work to the gallery | Gallery → Add photos | Drag in several at once. Use ← → to reorder. |
| Change the WhatsApp number | Settings | Include the country code, e.g. `264811685043`. Orders and bookings go here. |
| Add hours, location or Instagram | Settings | Each one appears on the site only once it's filled in. |
| Change the editor password | Settings → Change password | |

**Forgot the password?** In cPanel's File Manager, delete `admin/config.php`. The next visit to `/admin/` creates a new setup code in `admin/storage/setup-code.php` and asks for a new password.

## Before launch: still to do

- **Prices:** all products and services start at 0, which shows "Price on request". Set real prices in the editor.
- **Deep Conditioner photo:** this is the only product without a photo yet.
- **Sharper product photos:** the Hairgrowth Oil and Black African Shampoo photos are small crops (about 220 px wide) and look soft. Replace them with larger photos from the editor.
- **About text:** the copy in the About section is a draft written from the brand's labels. The founder should check it, and add her name if she'd like it shown. This text lives in `index.html`.

## Deploying to Namecheap (cPanel)

This repository is the source of truth: what's on `main` is what goes live. Deploying needs the hosting (cPanel) login, because pushing to GitHub doesn't update the live site by itself.

**Option A: upload from GitHub (simplest)**

1. On GitHub, select **Code → Download ZIP**.
2. In cPanel's File Manager, back up `public_html` and delete the old site's `upload_handler.php`, because the old version must not stay online.
3. Upload the zip to `public_html`, **Extract** it, and move the contents of the extracted folder (e.g. `redesigned-nobuhle-main/`) up into `public_html`, so `index.html` sits directly in `public_html`.
4. Open `/admin/` and create the editor password, using the setup code from `admin/storage/setup-code.php`.

**Option B: cPanel Git Version Control (for repeat deploys)**

cPanel's **Git™ Version Control** can clone this repository and pull updates. The repo is private, so add an SSH deploy key in GitHub first. Then copy the files into `public_html`.

The full step-by-step, including what to test afterwards, is in [DEPLOYMENT_CHECKLIST.txt](DEPLOYMENT_CHECKLIST.txt).

Requirements: PHP 7.4 or later with the `fileinfo` extension (standard on cPanel; the old site already ran PHP). If the `gd` extension is available, uploads are resized and converted to WebP.

**Redeploying later:** content edited in the editor lives on the server (`data/content.json`, `uploads/`, `admin/config.php`). When you upload a new version of the code, don't overwrite those three, or the owner's changes and password will be lost.

**After changing CSS or JS:** bump the `?v=` number on `styles.css` and `main.js` in `index.html` so returning visitors get the new files. Browsers cache them for 7 days. The editor's files are versioned automatically.
## How it fits together

- `assets/js/main.js` loads `data/content.json` and renders the shop, services, gallery and contact details. The basket is stored in the visitor's browser (`localStorage`). Orders, bookings and contact messages open `wa.me/<number>?text=…` with the message pre-filled.
- `admin/api.php` is the editor's only write path. Every request needs a logged-in session and a CSRF token. Content is validated field by field and written atomically.
- **Upload safety:**
  - The file type is detected from the file's contents, not from its name or the browser's claim. Only JPEG, PNG and WebP are accepted.
  - Every photo is re-encoded, which strips anything hidden inside it, and saved under a random name.
  - `uploads/.htaccess` stops anything in that folder from running as code.
- **Password:** stored only as a bcrypt hash in `admin/config.php`, a file that's created on the server and never committed. Repeated wrong guesses lock the login for 15 minutes.
- **First-run setup:** creating the password needs a one-time code that's written to `admin/storage/setup-code.php`. It's a PHP file, so requesting it over the web prints nothing even if `.htaccess` isn't honoured.
- **HTTPS:** `.htaccess` redirects every page to `https://` and sends HSTS. The editor also refuses to run over plain HTTP itself, except on `localhost`.
- **Content-Security-Policy:** the site (via a `<meta>` tag) and the editor (via a header) only allow their own scripts and styles, plus Google Fonts. Any injected script is blocked.
- **Errors:** PHP error output is turned off for visitors and logged instead.

## Local preview

- **Site only:** serve the folder with any static server, e.g. `npx serve .`. Opening `index.html` directly from disk won't load products, because the browser blocks `fetch()` from `file://`.
- **Site and editor:** `php -S localhost:8000`. The built-in PHP server ignores `.htaccess`, so test those rules on the real host.

## Photo credits

The hero and services photos are free photos from Unsplash under the [Unsplash License](https://unsplash.com/license):

- Hero: [Profile of a woman with a braided ponytail](https://unsplash.com/photos/QS9ZX5UnS14)
- Services: [Woman among golden leaves](https://unsplash.com/photos/FXB39F3n6NM)

The product photos, the founder portrait, the nail photos and the logo belong to Nonhle's Cosmetics.
