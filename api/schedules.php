<?php
require_once __DIR__ . '/helpers.php';

$session = requireAuth();
$isAdmin = $session['role'] === 'admin';

switch ($_SERVER['REQUEST_METHOD']) {

    case 'GET':
        $schedules = readSchedules();
        $users     = readUsers();
        $userMap   = array_column($users, null, 'id');

        if ($isAdmin) {
            $list = array_map(fn($s) => enrichSchedule($s, $userMap), $schedules);
            usort($list, fn($a,$b) => strcmp($b['date'].$b['shift_time'], $a['date'].$a['shift_time']));
        } else {
            $uid  = $session['id'];
            $role = $session['role'];
            $list = array_filter($schedules, fn($s) =>
                ($role === 'driver' && $s['driver_id'] == $uid) ||
                ($role === 'nurse'  && $s['nurse_id']  == $uid)
            );
            $list = array_map(fn($s) => enrichSchedule($s, $userMap), $list);
            usort($list, fn($a,$b) => strcmp($a['date'].$a['shift_time'], $b['date'].$b['shift_time']));
        }
        echo json_encode(array_values($list));
        break;

    case 'POST':
        if (!$isAdmin) { http_response_code(403); echo json_encode(['error' => 'Admins only']); exit; }
        $d = json_decode(file_get_contents('php://input'), true);
        if (!($d['date'] ?? '') || !($d['shift_time'] ?? '') || !($d['pickup_location'] ?? '') || !($d['drop_location'] ?? '')) {
            http_response_code(400); echo json_encode(['error' => 'date, shift_time, pickup_location, drop_location required']); exit;
        }
        $schedules = readSchedules();
        $new = [
            'id'              => nextId($schedules),
            'date'            => $d['date'],
            'shift_time'      => $d['shift_time'],
            'driver_id'       => $d['driver_id']       ? intval($d['driver_id'])  : null,
            'nurse_id'        => $d['nurse_id']        ? intval($d['nurse_id'])   : null,
            'pickup_location' => trim($d['pickup_location']),
            'drop_location'   => trim($d['drop_location']),
            'notes'           => trim($d['notes'] ?? ''),
            'created_at'      => date('Y-m-d H:i:s')
        ];
        $schedules[] = $new;
        writeSchedules($schedules);
        echo json_encode(['id' => $new['id']]);
        break;

    case 'PUT':
        if (!$isAdmin) { http_response_code(403); echo json_encode(['error' => 'Admins only']); exit; }
        $id        = intval($_GET['id'] ?? 0);
        $d         = json_decode(file_get_contents('php://input'), true);
        $schedules = readSchedules();
        $idx       = null;

        foreach ($schedules as $i => $s) { if ($s['id'] == $id) { $idx = $i; break; } }
        if ($idx === null) { http_response_code(404); echo json_encode(['error' => 'Schedule not found']); exit; }

        $schedules[$idx] = array_merge($schedules[$idx], [
            'date'            => $d['date']            ?? $schedules[$idx]['date'],
            'shift_time'      => $d['shift_time']      ?? $schedules[$idx]['shift_time'],
            'driver_id'       => ($d['driver_id'] ?? null) ? intval($d['driver_id']) : null,
            'nurse_id'        => ($d['nurse_id']  ?? null) ? intval($d['nurse_id'])  : null,
            'pickup_location' => trim($d['pickup_location'] ?? $schedules[$idx]['pickup_location']),
            'drop_location'   => trim($d['drop_location']   ?? $schedules[$idx]['drop_location']),
            'notes'           => trim($d['notes'] ?? ''),
        ]);
        writeSchedules($schedules);
        echo json_encode(['success' => true]);
        break;

    case 'DELETE':
        if (!$isAdmin) { http_response_code(403); echo json_encode(['error' => 'Admins only']); exit; }
        $id        = intval($_GET['id'] ?? 0);
        $schedules = array_filter(readSchedules(), fn($s) => $s['id'] != $id);
        writeSchedules($schedules);
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
}
