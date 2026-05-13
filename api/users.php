<?php
require_once __DIR__ . '/helpers.php';
requireAdmin();

switch ($_SERVER['REQUEST_METHOD']) {

    case 'GET':
        $users  = readUsers();
        $result = array_values(array_map(fn($u) => [
            'id'         => $u['id'],
            'name'       => $u['name'],
            'email'      => $u['email'],
            'role'       => $u['role'],
            'phone'      => $u['phone'] ?? '',
            'created_at' => $u['created_at']
        ], array_filter($users, fn($u) => $u['role'] !== 'admin')));
        echo json_encode($result);
        break;

    case 'POST':
        $d      = json_decode(file_get_contents('php://input'), true);
        $name   = trim($d['name']     ?? '');
        $email  = strtolower(trim($d['email'] ?? ''));
        $pass   = $d['password']      ?? '';
        $role   = $d['role']          ?? '';
        $phone  = trim($d['phone']    ?? '');

        if (!$name || !$email || !$pass || !in_array($role, ['driver','nurse'])) {
            http_response_code(400);
            echo json_encode(['error' => 'name, email, password and role (driver/nurse) are required']);
            exit;
        }

        $users = readUsers();
        foreach ($users as $u) {
            if ($u['email'] === $email) {
                http_response_code(400); echo json_encode(['error' => 'Email already in use']); exit;
            }
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
        $users[] = $new;
        writeUsers($users);
        echo json_encode(['id' => $new['id'], 'name' => $name, 'email' => $email, 'role' => $role, 'phone' => $phone]);
        break;

    case 'PUT':
        $id    = intval($_GET['id'] ?? 0);
        $d     = json_decode(file_get_contents('php://input'), true);
        $users = readUsers();
        $idx   = null;

        foreach ($users as $i => $u) {
            if ($u['id'] == $id && $u['role'] !== 'admin') { $idx = $i; break; }
        }
        if ($idx === null) { http_response_code(404); echo json_encode(['error' => 'User not found']); exit; }

        $users[$idx]['name']  = trim($d['name']  ?? $users[$idx]['name']);
        $users[$idx]['email'] = strtolower(trim($d['email'] ?? $users[$idx]['email']));
        $users[$idx]['phone'] = trim($d['phone'] ?? $users[$idx]['phone']);
        if (!empty($d['password'])) {
            $users[$idx]['password_hash'] = password_hash($d['password'], PASSWORD_DEFAULT);
        }
        writeUsers($users);
        echo json_encode(['success' => true]);
        break;

    case 'DELETE':
        $id    = intval($_GET['id'] ?? 0);
        $users = array_filter(readUsers(), fn($u) => !($u['id'] == $id && $u['role'] !== 'admin'));
        writeUsers($users);
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
}
