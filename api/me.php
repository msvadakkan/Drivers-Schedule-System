<?php
require_once __DIR__ . '/helpers.php';

$session = requireAuth();
$user    = getUserById($session['id']);

if (!$user) {
    http_response_code(404); echo json_encode(['error' => 'User not found']); exit;
}

echo json_encode([
    'id'    => $user['id'],
    'name'  => $user['name'],
    'email' => $user['email'],
    'role'  => $user['role'],
    'phone' => $user['phone'] ?? ''
]);
