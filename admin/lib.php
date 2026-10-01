<?php
// Shared helpers for the site editor. Not meant to be opened directly (blocked in admin/.htaccess).
// Written for PHP 7.4+ so it runs on standard cPanel hosting.

declare(strict_types=1);

const SITE_ROOT = __DIR__ . '/..';
const CONTENT_FILE = SITE_ROOT . '/data/content.json';
const UPLOAD_DIR = SITE_ROOT . '/uploads';
const STORAGE_DIR = __DIR__ . '/storage';
const CONFIG_FILE = __DIR__ . '/config.php';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;  // phone photos can be large; we downscale after
const MAX_IMAGE_EDGE = 1600;
const SESSION_IDLE_SECONDS = 2 * 60 * 60;
const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_SECONDS = 15 * 60;

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('nonhle_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();

    if (!empty($_SESSION['admin']) && time() - ($_SESSION['seen'] ?? 0) > SESSION_IDLE_SECONDS) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['seen'] = time();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function is_logged_in(): bool
{
    return !empty($_SESSION['admin']);
}

function csrf_token(): string
{
    return $_SESSION['csrf'] ?? '';
}

function check_csrf(?string $token): bool
{
    return is_string($token) && $token !== '' && hash_equals(csrf_token(), $token);
}

function security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store');
}

// ---------- password ----------

function load_config(): array
{
    if (!is_file(CONFIG_FILE)) {
        return ['password_hash' => ''];
    }
    $config = include CONFIG_FILE;
    return is_array($config) ? $config : ['password_hash' => ''];
}

function password_is_set(): bool
{
    return (load_config()['password_hash'] ?? '') !== '';
}

function save_password(string $password): bool
{
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $php = "<?php\n// Site editor password (hashed). Generated automatically; change it from the editor's Settings tab.\nreturn " . var_export(['password_hash' => $hash], true) . ";\n";
    return write_atomic(CONFIG_FILE, $php);
}

function password_problem(string $password): ?string
{
    if (strlen($password) < 10) {
        return 'Use at least 10 characters.';
    }
    return null;
}

// ---------- login throttling (per IP, file-based) ----------

function throttle_file(): string
{
    if (!is_dir(STORAGE_DIR)) {
        mkdir(STORAGE_DIR, 0755, true);
    }
    return STORAGE_DIR . '/login-' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown') . '.json';
}

function login_locked_for(): int
{
    $f = throttle_file();
    if (!is_file($f)) {
        return 0;
    }
    $d = json_decode((string) file_get_contents($f), true) ?: [];
    $until = (int) ($d['until'] ?? 0);
    return max(0, $until - time());
}

function record_login_failure(): void
{
    $f = throttle_file();
    $d = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    $fails = (int) ($d['fails'] ?? 0) + 1;
    $d = ['fails' => $fails, 'until' => $fails >= LOGIN_MAX_FAILS ? time() + LOGIN_LOCK_SECONDS : 0];
    if ($fails >= LOGIN_MAX_FAILS) {
        $d['fails'] = 0;
    }
    file_put_contents($f, json_encode($d), LOCK_EX);
}

function clear_login_failures(): void
{
    $f = throttle_file();
    if (is_file($f)) {
        unlink($f);
    }
}

// ---------- content ----------

function write_atomic(string $path, string $data): bool
{
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $data, LOCK_EX) === false) {
        return false;
    }
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        return false;
    }
    return true;
}

function load_content(): array
{
    $raw = is_file(CONTENT_FILE) ? file_get_contents(CONTENT_FILE) : '';
    $data = json_decode((string) $raw, true);
    return is_array($data) ? $data : ['settings' => [], 'products' => [], 'services' => [], 'gallery' => []];
}

function save_content(array $content): bool
{
    $json = json_encode($content, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return false;
    }
    $lock = fopen(CONTENT_FILE . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) {
        return false;
    }
    $ok = write_atomic(CONTENT_FILE, $json . "\n");
    flock($lock, LOCK_UN);
    fclose($lock);
    return $ok;
}

function clean_text($value, int $max): string
{
    $s = is_scalar($value) ? (string) $value : '';
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    $s = trim(preg_replace("/\r\n?/", "\n", $s) ?? '');
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

function clean_price($value): float
{
    $n = is_numeric($value) ? (float) $value : 0.0;
    return max(0.0, min(1000000.0, round($n, 2)));
}

function clean_image($value): string
{
    $s = is_string($value) ? $value : '';
    return preg_match('#^uploads/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(webp|jpe?g|png)$#', $s) ? $s : '';
}

function slugify(string $s): string
{
    $s = strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', $s) ?? '');
    $s = trim($s, '-');
    return $s !== '' ? substr($s, 0, 60) : 'item';
}

function unique_ids(array $items): array
{
    $seen = [];
    foreach ($items as &$item) {
        $base = slugify($item['id'] !== '' ? $item['id'] : $item['name']);
        $id = $base;
        $n = 2;
        while (isset($seen[$id])) {
            $id = $base . '-' . $n++;
        }
        $seen[$id] = true;
        $item['id'] = $id;
    }
    return $items;
}

/** Validate everything the editor sends; anything unexpected is dropped. */
function sanitize_content(array $in): array
{
    $s = is_array($in['settings'] ?? null) ? $in['settings'] : [];
    $email = clean_text($s['email'] ?? '', 120);
    $settings = [
        'whatsapp' => substr(preg_replace('/\D/', '', (string) ($s['whatsapp'] ?? '')) ?? '', 0, 15),
        'email' => filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '',
        'hours' => clean_text($s['hours'] ?? '', 160),
        'location' => clean_text($s['location'] ?? '', 160),
        'instagram' => clean_text($s['instagram'] ?? '', 120),
    ];

    $products = [];
    foreach (array_slice(is_array($in['products'] ?? null) ? $in['products'] : [], 0, 100) as $p) {
        if (!is_array($p) || clean_text($p['name'] ?? '', 120) === '') {
            continue;
        }
        $products[] = [
            'id' => clean_text($p['id'] ?? '', 60),
            'name' => clean_text($p['name'], 120),
            'price' => clean_price($p['price'] ?? 0),
            'soldOut' => !empty($p['soldOut']),
            'size' => clean_text($p['size'] ?? '', 40),
            'summary' => clean_text($p['summary'] ?? '', 200),
            'description' => clean_text($p['description'] ?? '', 1500),
            'ingredients' => clean_text($p['ingredients'] ?? '', 800),
            'usage' => clean_text($p['usage'] ?? '', 800),
            'image' => clean_image($p['image'] ?? ''),
        ];
    }

    $services = [];
    foreach (array_slice(is_array($in['services'] ?? null) ? $in['services'] : [], 0, 50) as $sv) {
        if (!is_array($sv) || clean_text($sv['name'] ?? '', 120) === '') {
            continue;
        }
        $services[] = [
            'id' => clean_text($sv['id'] ?? '', 60),
            'name' => clean_text($sv['name'], 120),
            'price' => clean_price($sv['price'] ?? 0),
            'priceFrom' => !empty($sv['priceFrom']),
            'duration' => clean_text($sv['duration'] ?? '', 40),
            'description' => clean_text($sv['description'] ?? '', 400),
        ];
    }

    $gallery = [];
    foreach (array_slice(is_array($in['gallery'] ?? null) ? $in['gallery'] : [], 0, 200) as $g) {
        $src = clean_image($g['src'] ?? '');
        if ($src === '') {
            continue;
        }
        $gallery[] = [
            'src' => $src,
            'caption' => clean_text($g['caption'] ?? '', 140),
            'w' => max(0, min(10000, (int) ($g['w'] ?? 0))),
            'h' => max(0, min(10000, (int) ($g['h'] ?? 0))),
        ];
    }

    return [
        'settings' => $settings,
        'products' => unique_ids($products),
        'services' => unique_ids($services),
        'gallery' => $gallery,
    ];
}

function referenced_images(array $content): array
{
    $refs = [];
    foreach ($content['products'] ?? [] as $p) {
        if (!empty($p['image'])) {
            $refs[$p['image']] = true;
        }
    }
    foreach ($content['gallery'] ?? [] as $g) {
        if (!empty($g['src'])) {
            $refs[$g['src']] = true;
        }
    }
    return $refs;
}

/** Delete image files that were used before a save and no longer are. */
function remove_dropped_images(array $before, array $after): void
{
    $now = referenced_images($after);
    foreach (array_keys(referenced_images($before)) as $src) {
        if (isset($now[$src]) || clean_image($src) === '') {
            continue;
        }
        $path = UPLOAD_DIR . '/' . basename($src);
        if (is_file($path)) {
            @unlink($path);
        }
    }
}

// ---------- uploads ----------

/**
 * Validate an uploaded image by its contents (never the browser's claims), then re-encode it.
 * Re-encoding strips anything hidden in the file and normalises size and format.
 * Returns ['src' => ..., 'w' => ..., 'h' => ...] or throws RuntimeException with a user-facing message.
 */
function store_uploaded_image(array $file, string $prefix): array
{
    $err = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
        throw new RuntimeException('That photo is too large. Use one under 10 MB.');
    }
    if ($err !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
        throw new RuntimeException('The photo didn\'t upload. Try again.');
    }
    if (($file['size'] ?? 0) > MAX_UPLOAD_BYTES) {
        throw new RuntimeException('That photo is too large. Use one under 10 MB.');
    }

    $tmp = $file['tmp_name'];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $info = @getimagesize($tmp);
    if (!isset($types[$mime]) || $info === false || ($info['mime'] ?? '') !== $mime) {
        throw new RuntimeException('Only JPG, PNG or WebP photos can be uploaded.');
    }
    [$w, $h] = $info;
    if ($w < 1 || $h < 1 || $w * $h > 40000000) {
        throw new RuntimeException('That image\'s dimensions aren\'t supported.');
    }

    if (!is_dir(UPLOAD_DIR)) {
        mkdir(UPLOAD_DIR, 0755, true);
    }
    $name = slugify($prefix) . '-' . date('Ymd') . '-' . bin2hex(random_bytes(5));

    if (extension_loaded('gd')) {
        $img = null;
        if ($mime === 'image/jpeg') {
            $img = @imagecreatefromjpeg($tmp);
        } elseif ($mime === 'image/png') {
            $img = @imagecreatefrompng($tmp);
        } elseif ($mime === 'image/webp' && function_exists('imagecreatefromwebp')) {
            $img = @imagecreatefromwebp($tmp);
        }
        if (!$img) {
            throw new RuntimeException('That photo couldn\'t be read. Try saving it as a JPG first.');
        }

        // Phone photos store rotation in EXIF; apply it so images aren't sideways.
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($tmp);
            $rot = [3 => 180, 6 => -90, 8 => 90][(int) ($exif['Orientation'] ?? 1)] ?? 0;
            if ($rot) {
                $rotated = imagerotate($img, $rot, 0);
                if ($rotated) {
                    imagedestroy($img);
                    $img = $rotated;
                }
            }
        }

        $w = imagesx($img);
        $h = imagesy($img);
        $scale = min(1, MAX_IMAGE_EDGE / max($w, $h));
        $nw = (int) round($w * $scale);
        $nh = (int) round($h * $scale);
        $out = imagecreatetruecolor($nw, $nh);
        imagealphablending($out, false);
        imagesavealpha($out, true);
        imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($img);

        if (function_exists('imagewebp')) {
            $file = $name . '.webp';
            $ok = imagewebp($out, UPLOAD_DIR . '/' . $file, 80);
        } else {
            $file = $name . '.jpg';
            $ok = imagejpeg($out, UPLOAD_DIR . '/' . $file, 82);
        }
        imagedestroy($out);
        if (!$ok) {
            throw new RuntimeException('The photo couldn\'t be saved. Check that the uploads folder is writable.');
        }
        return ['src' => 'uploads/' . $file, 'w' => $nw, 'h' => $nh];
    }

    // No GD available: keep the original bytes, with the extension taken from the detected type.
    $file = $name . '.' . $types[$mime];
    if (!move_uploaded_file($tmp, UPLOAD_DIR . '/' . $file)) {
        throw new RuntimeException('The photo couldn\'t be saved. Check that the uploads folder is writable.');
    }
    return ['src' => 'uploads/' . $file, 'w' => $w, 'h' => $h];
}

function json_out(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
