<?php
require_once __DIR__ . '/helpers.php';

switch ($_SERVER['REQUEST_METHOD']) {

    case 'GET':
        echo json_encode(['needed' => setupNeeded()]);
        break;

    case 'POST':
        if (!setupNeeded()) {
            http_response_code(403);
            echo json_encode(['error' => 'Setup already completed. Please log in.']);
            exit;
        }

        $d     = json_decode(file_get_contents('php://input'), true);
        $name  = trim($d['name']     ?? '');
        $email = strtolower(trim($d['email']    ?? ''));
        $pass  = trim($d['password'] ?? '');

        if (!$name || !$email || !$pass) {
            http_response_code(400);
            echo json_encode(['error' => 'Name, email and password are required.']);
            exit;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Enter a valid email address.']);
            exit;
        }
        if (strlen($pass) < 8) {
            http_response_code(400);
            echo json_encode(['error' => 'Password must be at least 8 characters.']);
            exit;
        }

        $users   = readUsers();
        $users[] = [
            'id'            => nextId($users),
            'name'          => $name,
            'email'         => $email,
            'password_hash' => password_hash($pass, PASSWORD_DEFAULT),
            'role'          => 'admin',
            'phone'         => '',
            'created_at'    => date('Y-m-d H:i:s'),
        ];
        writeUsers($users);
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
