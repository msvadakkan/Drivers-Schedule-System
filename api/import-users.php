<?php
require_once __DIR__ . '/helpers.php';
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
}

$d    = json_decode(file_get_contents('php://input'), true);
$role = $d['role']  ?? '';
$rows = $d['users'] ?? [];

if (!in_array($role, ['driver','nurse'])) {
    http_response_code(400); echo json_encode(['error' => 'Invalid role']); exit;
}

$users    = readUsers();
$emailSet = array_map('strtolower', array_column($users, 'email'));
$imported = 0;
$skipped  = 0;
$errors   = [];

foreach ($rows as $i => $row) {
    $name  = trim($row['name']     ?? '');
    $email = strtolower(trim($row['email']    ?? ''));
    $pass  = trim($row['password'] ?? '');
    $phone = trim($row['phone']    ?? '');
    $line  = $i + 2;

    if (!$name || !$email || !$pass) {
        $errors[] = "Row {$line}: name, email, and password are required.";
        continue;
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = "Row {$line}: invalid email \"$email\".";
        continue;
    }
    if (in_array($email, $emailSet)) {
        $skipped++;
        continue;
    }

    $new = [
        'id'            => nextId($users),
        'name'          => $name,
        'email'         => $email,
        'password_hash' => password_hash($pass, PASSWORD_DEFAULT),
        'role'          => $role,
        'phone'         => $phone,
        'created_at'    => date('Y-m-d H:i:s')
    ];
    $users[]    = $new;
    $emailSet[] = $email;
    $imported++;
}

writeUsers($users);
echo json_encode(['imported' => $imported, 'skipped' => $skipped, 'errors' => $errors]);
