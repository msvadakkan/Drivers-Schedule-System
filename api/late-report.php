<?php
require_once __DIR__ . '/helpers.php';

define('LATE_FILE', DATA_DIR . '/late_reports.json');

function readLate()       { return file_exists(LATE_FILE) ? (json_decode(file_get_contents(LATE_FILE), true) ?: []) : []; }
function writeLate($rows) { file_put_contents(LATE_FILE, json_encode(array_values($rows), JSON_PRETTY_PRINT), LOCK_EX); }

$session = requireAuth();

switch ($_SERVER['REQUEST_METHOD']) {

    case 'GET':
        requireAdmin();
        $rows = readLate();
        usort($rows, fn($a,$b) => strcmp($b['reported_at'], $a['reported_at']));
        echo json_encode(array_values($rows));
        break;

    case 'POST':
        if ($session['role'] !== 'driver') {
            http_response_code(403); echo json_encode(['error' => 'Drivers only']); exit;
        }
        $d           = json_decode(file_get_contents('php://input'), true);
        $schedule_id = intval($d['schedule_id'] ?? 0);
        $nurse_id    = intval($d['nurse_id']    ?? 0);

        $schedules = readSchedules();
        $sched = null;
        foreach ($schedules as $s) { if ($s['id'] == $schedule_id) { $sched = $s; break; } }

        $nurse  = $nurse_id  ? getUserById($nurse_id)      : null;
        $driver = getUserById($session['id']);

        $rows = readLate();
        // prevent duplicates
        foreach ($rows as $r) {
            if ($r['schedule_id'] == $schedule_id && $r['nurse_id'] == $nurse_id) {
                echo json_encode(['already' => true]); exit;
            }
        }

        $new = [
            'id'            => nextId($rows),
            'schedule_id'   => $schedule_id,
            'schedule_date' => $sched ? $sched['date'] : null,
            'nurse_id'      => $nurse_id,
            'nurse_name'    => $nurse  ? $nurse['name']  : 'Unknown',
            'driver_id'     => $session['id'],
            'driver_name'   => $session['name'],
            'reported_at'   => date('Y-m-d H:i:s'),
        ];
        $rows[] = $new;
        writeLate($rows);
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
}
