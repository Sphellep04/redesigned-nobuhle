<?php
// Site editor: first-time password setup, login, and the editing screen.

declare(strict_types=1);
require __DIR__ . '/lib.php';

security_headers();
start_session();

$error = '';
$mode = password_is_set() ? (is_logged_in() ? 'editor' : 'login') : 'setup';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    if (!check_csrf($_POST['csrf'] ?? null)) {
        $error = 'This page expired. Try again.';
    } elseif ($mode === 'setup') {
        $pw = (string) ($_POST['password'] ?? '');
        if ($problem = password_problem($pw)) {
            $error = $problem;
        } elseif ($pw !== (string) ($_POST['confirm'] ?? '')) {
            $error = 'The two passwords don\'t match.';
        } elseif (!save_password($pw)) {
            $error = 'The password couldn\'t be saved. Check that the admin folder is writable.';
        } else {
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            header('Location: ./');
            exit;
        }
    } elseif ($mode === 'login') {
        $wait = login_locked_for();
        if ($wait > 0) {
            $error = 'Too many attempts. Try again in ' . ceil($wait / 60) . ' minutes.';
        } elseif (password_verify((string) ($_POST['password'] ?? ''), load_config()['password_hash'] ?? '')) {
            clear_login_failures();
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            header('Location: ./');
            exit;
        } else {
            record_login_failure();
            usleep(600000);
            $error = 'That password is incorrect.';
        }
    }
}

$h = static function (string $s): string {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
};
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Site editor · Nonhle's Cosmetics</title>
  <link rel="icon" href="../assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..600;1,6..96,400&family=Hanken+Grotesk:wght@400;500;600&display=swap">
  <link rel="stylesheet" href="admin.css?v=<?= filemtime(__DIR__ . '/admin.css') ?>">
</head>
<body>
<?php if ($mode !== 'editor'): ?>
  <main class="gate">
    <form class="gate-card" method="post" autocomplete="off">
      <p class="eyebrow">Nonhle's Cosmetics</p>
      <?php if ($mode === 'setup'): ?>
        <h1>Create your editor password</h1>
        <p class="muted">This is the first time the editor has been opened. Choose a password of at least 10 characters. You'll use it to update products, prices and photos.</p>
        <label for="pw">New password</label>
        <input id="pw" name="password" type="password" minlength="10" required autocomplete="new-password" autofocus>
        <label for="pw2">Type it again</label>
        <input id="pw2" name="confirm" type="password" minlength="10" required autocomplete="new-password">
        <button class="btn" type="submit">Create password</button>
      <?php else: ?>
        <h1>Site editor</h1>
        <p class="muted">Log in to update products, prices, services and photos.</p>
        <label for="pw">Password</label>
        <input id="pw" name="password" type="password" required autocomplete="current-password" autofocus>
        <button class="btn" type="submit">Log in</button>
      <?php endif; ?>
      <?php if ($error): ?><p class="error" role="alert"><?= $h($error) ?></p><?php endif; ?>
      <input type="hidden" name="csrf" value="<?= $h(csrf_token()) ?>">
      <a class="back" href="../">← Back to the website</a>
    </form>
  </main>
<?php else: ?>
  <header class="bar">
    <div class="bar-inner">
      <p class="brand">Nonhle's <span>Site editor</span></p>
      <nav class="tabs" role="tablist" aria-label="Sections">
        <button role="tab" type="button" data-tab="products" aria-selected="true">Products</button>
        <button role="tab" type="button" data-tab="services" aria-selected="false">Services</button>
        <button role="tab" type="button" data-tab="gallery" aria-selected="false">Gallery</button>
        <button role="tab" type="button" data-tab="settings" aria-selected="false">Settings</button>
      </nav>
      <div class="bar-actions">
        <a class="link" href="../" target="_blank" rel="noopener">View site</a>
        <button class="link" type="button" data-logout>Log out</button>
      </div>
    </div>
  </header>

  <main class="wrap" data-app data-csrf="<?= $h(csrf_token()) ?>">
    <p class="muted loading" data-loading>Loading…</p>

    <section class="panel" data-panel="products" hidden>
      <div class="panel-head">
        <div>
          <h1>Products</h1>
          <p class="muted">These appear in the shop. Set the price to 0 to show "Price on request".</p>
        </div>
        <button class="btn" type="button" data-add="products">Add product</button>
      </div>
      <div class="list" data-list="products"></div>
    </section>

    <section class="panel" data-panel="services" hidden>
      <div class="panel-head">
        <div>
          <h1>Services</h1>
          <p class="muted">Customers can book these on WhatsApp. Set the price to 0 to show "Price on request".</p>
        </div>
        <button class="btn" type="button" data-add="services">Add service</button>
      </div>
      <div class="list" data-list="services"></div>
    </section>

    <section class="panel" data-panel="gallery" hidden>
      <div class="panel-head">
        <div>
          <h1>Gallery</h1>
          <p class="muted">Photos of your recent work. The first photo shows first on the site.</p>
        </div>
      </div>
      <label class="drop" data-drop>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-gallery-input>
        <strong>Add photos</strong>
        <span>Drag photos here, or select to choose from your device. JPG, PNG or WebP, up to 10 MB each.</span>
      </label>
      <div class="gallery-grid" data-list="gallery"></div>
    </section>

    <section class="panel" data-panel="settings" hidden>
      <div class="panel-head">
        <div>
          <h1>Settings</h1>
          <p class="muted">Contact details shown on the site. Orders and bookings are sent to the WhatsApp number.</p>
        </div>
      </div>
      <div class="card form-grid" data-settings>
        <label>WhatsApp number <small>With country code, e.g. 264811685043</small><input name="whatsapp" inputmode="tel"></label>
        <label>Email<input name="email" type="email"></label>
        <label>Opening hours <small>Optional, e.g. Mon–Sat, 9:00–17:00</small><input name="hours"></label>
        <label>Location <small>Optional, e.g. Windhoek, Namibia</small><input name="location"></label>
        <label>Instagram <small>Optional, your handle without @</small><input name="instagram"></label>
      </div>

      <form class="card form-grid" data-password-form>
        <h2>Change password</h2>
        <label>Current password<input name="current" type="password" autocomplete="current-password" required></label>
        <label>New password <small>At least 10 characters</small><input name="new" type="password" minlength="10" autocomplete="new-password" required></label>
        <button class="btn btn-line" type="submit">Change password</button>
      </form>
    </section>
  </main>

  <div class="savebar" data-savebar>
    <p data-save-status>All changes saved</p>
    <button class="btn" type="button" data-save disabled>Save changes</button>
  </div>
  <div class="toast" data-toast role="status" aria-live="polite"></div>

  <template id="product-tpl">
    <details class="card item">
      <summary>
        <span class="thumb" data-thumb></span>
        <span class="item-title"><strong data-title></strong><small data-sub></small></span>
      </summary>
      <div class="item-body">
        <div class="photo">
          <div class="photo-preview" data-preview></div>
          <div class="photo-actions">
            <label class="btn btn-line btn-sm">Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" data-photo hidden></label>
            <button class="link" type="button" data-remove-photo>Remove photo</button>
          </div>
        </div>
        <div class="form-grid">
          <label>Name<input data-f="name" required maxlength="120"></label>
          <div class="row">
            <label>Price (N$)<input data-f="price" type="number" min="0" step="0.01" inputmode="decimal"></label>
            <label>Size <small>Optional</small><input data-f="size" maxlength="40" placeholder="e.g. 100 ml"></label>
          </div>
          <label class="check"><input type="checkbox" data-f="soldOut"> Sold out <small>(stays on the site but can't be ordered)</small></label>
          <label>Short description <small>Shown on the shop card</small><input data-f="summary" maxlength="200"></label>
          <label>Full description<textarea data-f="description" rows="4" maxlength="1500"></textarea></label>
          <label>Ingredients<textarea data-f="ingredients" rows="2" maxlength="800"></textarea></label>
          <label>How to use<textarea data-f="usage" rows="3" maxlength="800"></textarea></label>
        </div>
        <div class="item-actions">
          <button class="link" type="button" data-move="-1">Move up</button>
          <button class="link" type="button" data-move="1">Move down</button>
          <button class="link danger" type="button" data-delete>Delete product</button>
        </div>
      </div>
    </details>
  </template>

  <template id="service-tpl">
    <details class="card item">
      <summary>
        <span class="item-title"><strong data-title></strong><small data-sub></small></span>
      </summary>
      <div class="item-body item-body-single">
        <div class="form-grid">
          <label>Name<input data-f="name" required maxlength="120"></label>
          <div class="row">
            <label>Price (N$)<input data-f="price" type="number" min="0" step="0.01" inputmode="decimal"></label>
            <label>Duration <small>Optional</small><input data-f="duration" maxlength="40" placeholder="e.g. 3–5 hours"></label>
          </div>
          <label class="check"><input type="checkbox" data-f="priceFrom"> Show as a starting price ("from N$…")</label>
          <label>Description<textarea data-f="description" rows="3" maxlength="400"></textarea></label>
        </div>
        <div class="item-actions">
          <button class="link" type="button" data-move="-1">Move up</button>
          <button class="link" type="button" data-move="1">Move down</button>
          <button class="link danger" type="button" data-delete>Delete service</button>
        </div>
      </div>
    </details>
  </template>

  <script src="admin.js?v=<?= filemtime(__DIR__ . '/admin.js') ?>" defer></script>
<?php endif; ?>
</body>
</html>
