<?php
// JSON endpoints for the site editor. Every action needs a logged-in session and the CSRF token.

declare(strict_types=1);
require __DIR__ . '/lib.php';

security_headers();
start_session();

if (!is_logged_in()) {
    json_out(['error' => 'Your session has ended. Log in again.'], 401);
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET' && $action === 'content') {
    json_out(['content' => load_content()]);
}

if ($method !== 'POST') {
    json_out(['error' => 'Method not allowed.'], 405);
}
if (!check_csrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
    json_out(['error' => 'This page has expired. Reload it and try again.'], 403);
}

switch ($action) {
    case 'save':
        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body) || !is_array($body['content'] ?? null)) {
            json_out(['error' => 'Nothing to save.'], 400);
        }
        $before = load_content();
        $clean = sanitize_content($body['content']);
        if ($clean['settings']['whatsapp'] === '') {
            json_out(['error' => 'Add a WhatsApp number in Settings. Orders and bookings are sent to it.'], 400);
        }
        if (!save_content($clean)) {
            json_out(['error' => 'Changes couldn\'t be saved. Check that the data folder is writable.'], 500);
        }
        remove_dropped_images($before, $clean);
        json_out(['ok' => true, 'content' => $clean]);

    case 'upload':
        // Name files after the product so they're recognisable in cPanel; slugify() keeps it safe.
        $prefix = clean_text($_POST['kind'] ?? '', 60) ?: 'product';
        try {
            $img = store_uploaded_image($_FILES['file'] ?? [], $prefix);
        } catch (RuntimeException $e) {
            json_out(['error' => $e->getMessage()], 400);
        }
        json_out(['ok' => true] + $img);

    case 'password':
        $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
        $current = (string) ($body['current'] ?? '');
        $new = (string) ($body['new'] ?? '');
        if (!password_verify($current, load_config()['password_hash'] ?? '')) {
            json_out(['error' => 'Your current password is incorrect.'], 400);
        }
        if ($problem = password_problem($new)) {
            json_out(['error' => $problem], 400);
        }
        if (!save_password($new)) {
            json_out(['error' => 'The password couldn\'t be saved. Check that the admin folder is writable.'], 500);
        }
        json_out(['ok' => true]);

    case 'logout':
        $_SESSION = [];
        session_destroy();
        json_out(['ok' => true]);
}

json_out(['error' => 'Unknown action.'], 404);
