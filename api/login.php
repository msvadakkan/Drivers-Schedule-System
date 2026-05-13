<?php
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
}

$data     = json_decode(file_get_contents('php://input'), true);
$email    = strtolower(trim($data['email']    ?? ''));
$password =            trim($data['password'] ?? '');

if (!$email || !$password) {
    http_response_code(400); echo json_encode(['error' => 'Email and password required']); exit;
}

$user = null;
foreach (readUsers() as $u) {
    if ($u['email'] === $email) { $user = $u; break; }
}

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401); echo json_encode(['error' => 'Invalid email or password']); exit;
}

$_SESSION['user_id']   = $user['id'];
$_SESSION['user_role'] = $user['role'];
$_SESSION['user_name'] = $user['name'];

echo json_encode(['user' => [
    'id'    => $user['id'],
    'name'  => $user['name'],
    'email' => $user['email'],
    'role'  => $user['role'],
    'phone' => $user['phone'] ?? ''
]]);
