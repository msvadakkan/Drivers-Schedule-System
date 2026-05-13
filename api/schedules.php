<?php
require_once __DIR__ . '/helpers.php';

$session = requireAuth();
$isAdmin = $session['role'] === 'admin';

switch ($_SERVER['REQUEST_METHOD']) {

    // ── GET ──────────────────────────────────────────────────────────────────
    case 'GET':
        $schedules = readSchedules();
        $userMap   = array_column(readUsers(), null, 'id');

        if ($isAdmin) {
            $list = array_map(fn($s) => enrichFull($s, $userMap), $schedules);
            usort($list, fn($a,$b) => strcmp($b['date'], $a['date']));
            echo json_encode(array_values($list));

        } elseif ($session['role'] === 'driver') {
            $uid  = $session['id'];
            $list = array_filter($schedules, fn($s) => ($s['driver_id'] ?? null) == $uid);
            $list = array_map(fn($s) => enrichFull($s, $userMap), $list);
            usort($list, fn($a,$b) => strcmp($a['date'], $b['date']));
            echo json_encode(array_values($list));

        } elseif ($session['role'] === 'nurse') {
            $uid    = $session['id'];
            $result = [];
            foreach ($schedules as $s) {
                foreach ($s['trips'] ?? [] as $t) {
                    if (($t['nurse_id'] ?? null) == $uid) {
                        $driver    = ($s['driver_id'] && isset($userMap[$s['driver_id']])) ? $userMap[$s['driver_id']] : null;
                        $result[]  = [
                            'id'              => $s['id'],
                            'date'            => $s['date'],
                            'notes'           => $s['notes'] ?? '',
                            'driver_id'       => $s['driver_id'] ?? null,
                            'driver_name'     => $driver ? $driver['name']  : null,
                            'driver_phone'    => $driver ? $driver['phone'] : null,
                            'pickup_location' => $t['pickup_location'] ?? '',
                            'pickup_time'     => $t['pickup_time']     ?? '',
                            'drop_location'   => $t['drop_location']   ?? '',
                        ];
                        break;
                    }
                }
            }
            usort($result, fn($a,$b) => strcmp($a['date'], $b['date']));
            echo json_encode($result);
        }
        break;

    // ── POST ─────────────────────────────────────────────────────────────────
    case 'POST':
        if (!$isAdmin) { http_response_code(403); echo json_encode(['error' => 'Admins only']); exit; }
        $d = json_decode(file_get_contents('php://input'), true);
        if (empty($d['date'])) {
            http_response_code(400); echo json_encode(['error' => 'date is required']); exit;
        }
        $schedules = readSchedules();
        $new = [
            'id'         => nextId($schedules),
            'date'       => $d['date'],
            'driver_id'  => !empty($d['driver_id']) ? intval($d['driver_id']) : null,
            'notes'      => trim($d['notes'] ?? ''),
            'trips'      => buildTrips($d['trips'] ?? []),
            'created_at' => date('Y-m-d H:i:s')
        ];
        $schedules[] = $new;
        writeSchedules($schedules);
        echo json_encode(['id' => $new['id']]);
        break;

    // ── PUT ──────────────────────────────────────────────────────────────────
    case 'PUT':
        if (!$isAdmin) { http_response_code(403); echo json_encode(['error' => 'Admins only']); exit; }
        $id        = intval($_GET['id'] ?? 0);
        $d         = json_decode(file_get_contents('php://input'), true);
        $schedules = readSchedules();
        $idx       = null;
        foreach ($schedules as $i => $s) { if ($s['id'] == $id) { $idx = $i; break; } }
        if ($idx === null) { http_response_code(404); echo json_encode(['error' => 'Schedule not found']); exit; }

        $schedules[$idx] = array_merge($schedules[$idx], [
            'date'      => $d['date']      ?? $schedules[$idx]['date'],
            'driver_id' => !empty($d['driver_id']) ? intval($d['driver_id']) : null,
            'notes'     => trim($d['notes'] ?? ''),
            'trips'     => buildTrips($d['trips'] ?? []),
        ]);
        writeSchedules($schedules);
        echo json_encode(['success' => true]);
        break;

    // ── DELETE ───────────────────────────────────────────────────────────────
    case 'DELETE':
        if (!$isAdmin) { http_response_code(403); echo json_encode(['error' => 'Admins only']); exit; }
        $id = intval($_GET['id'] ?? 0);
        writeSchedules(array_values(array_filter(readSchedules(), fn($s) => $s['id'] != $id)));
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function enrichFull($s, $userMap) {
    $driver = ($s['driver_id'] && isset($userMap[$s['driver_id']])) ? $userMap[$s['driver_id']] : null;
    $trips  = array_map(function($t) use ($userMap) {
        $n = ($t['nurse_id'] && isset($userMap[$t['nurse_id']])) ? $userMap[$t['nurse_id']] : null;
        return array_merge($t, [
            'nurse_name'  => $n ? $n['name']  : null,
            'nurse_phone' => $n ? $n['phone'] : null,
        ]);
    }, $s['trips'] ?? []);
    return [
        'id'           => $s['id'],
        'date'         => $s['date'],
        'driver_id'    => $s['driver_id']  ?? null,
        'driver_name'  => $driver ? $driver['name']  : null,
        'driver_phone' => $driver ? $driver['phone'] : null,
        'notes'        => $s['notes'] ?? '',
        'created_at'   => $s['created_at'] ?? '',
        'trips'        => $trips,
    ];
}

function buildTrips($raw) {
    $trips = [];
    foreach ($raw as $t) {
        $trips[] = [
            'nurse_id'        => !empty($t['nurse_id'])  ? intval($t['nurse_id']) : null,
            'pickup_location' => trim($t['pickup_location'] ?? ''),
            'pickup_time'     => trim($t['pickup_time']     ?? ''),
            'drop_location'   => trim($t['drop_location']   ?? ''),
        ];
    }
    return $trips;
}
