<?php
// Keep session alive for 8 hours
$lifetime = 8 * 60 * 60;
ini_set('session.gc_maxlifetime', $lifetime);
session_set_cookie_params($lifetime);
session_start();
header('Content-Type: application/json');

define('DATA_DIR',       __DIR__ . '/../data');
define('USERS_FILE',     DATA_DIR . '/users.json');
define('SCHEDULES_FILE', DATA_DIR . '/schedules.json');

// ─── Boot ─────────────────────────────────────────────────────────────────────
function initData() {
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0755, true);
    if (!file_exists(USERS_FILE)) {
        $admin = [[
            'id'            => 1,
            'name'          => 'Administrator',
            'email'         => 'admin@system.com',
            'password_hash' => password_hash('admin123', PASSWORD_DEFAULT),
            'role'          => 'admin',
            'phone'         => '',
            'created_at'    => date('Y-m-d H:i:s')
        ]];
        file_put_contents(USERS_FILE, json_encode($admin, JSON_PRETTY_PRINT), LOCK_EX);
    }
    if (!file_exists(SCHEDULES_FILE)) {
        file_put_contents(SCHEDULES_FILE, json_encode([], JSON_PRETTY_PRINT), LOCK_EX);
    }
}

// ─── Data helpers ─────────────────────────────────────────────────────────────
function readUsers() {
    initData();
    return json_decode(file_get_contents(USERS_FILE), true) ?: [];
}
function writeUsers($users) {
    file_put_contents(USERS_FILE, json_encode(array_values($users), JSON_PRETTY_PRINT), LOCK_EX);
}
function readSchedules() {
    initData();
    return json_decode(file_get_contents(SCHEDULES_FILE), true) ?: [];
}
function writeSchedules($schedules) {
    file_put_contents(SCHEDULES_FILE, json_encode(array_values($schedules), JSON_PRETTY_PRINT), LOCK_EX);
}
function getUserById($id) {
    foreach (readUsers() as $u) { if ($u['id'] == $id) return $u; }
    return null;
}
function nextId($items) {
    return empty($items) ? 1 : max(array_column($items, 'id')) + 1;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function requireAuth() {
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    return ['id' => $_SESSION['user_id'], 'role' => $_SESSION['user_role'], 'name' => $_SESSION['user_name']];
}
function requireAdmin() {
    $u = requireAuth();
    if ($u['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admins only']);
        exit;
    }
    return $u;
}
