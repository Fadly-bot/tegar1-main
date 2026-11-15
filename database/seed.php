<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/config.php';

$pdo = db();
$schema = file_get_contents(__DIR__ . '/schema.sql');
foreach (array_filter(array_map('trim', explode(';', (string)$schema))) as $statement) {
    $pdo->exec($statement);
}

$stmt = $pdo->prepare('INSERT IGNORE INTO users (username, password_hash, name, email, role) VALUES (?, ?, ?, ?, ?)');
$stmt->execute(['a', password_hash('a', PASSWORD_DEFAULT), 'Admin Potong', 'admin@potong.studio', 'admin']);
$stmt->execute(['b', password_hash('b', PASSWORD_DEFAULT), 'Bima Demo', 'bima@example.com', 'customer']);
echo "Database siap. Akun demo: admin a/a dan klien b/b.\n";
