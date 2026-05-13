<?php
require_once __DIR__ . '/helpers.php';
session_destroy();
echo json_encode(['success' => true]);
