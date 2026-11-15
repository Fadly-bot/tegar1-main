<?php
declare(strict_types=1);

const APP_ROOT = __DIR__;
const PROJECT_ROOT = __DIR__ . '/..';

function app_env(string $name, string $default = ''): string
{
    $value = getenv($name);
    if ($value !== false) return $value;
    static $fileValues;
    if ($fileValues === null) {
        $fileValues = [];
        $envFile = PROJECT_ROOT . '/.env';
        if (is_file($envFile)) {
            foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
                [$key, $entry] = explode('=', $line, 2);
                $fileValues[trim($key)] = trim(trim($entry), "\"'");
            }
        }
    }
    return $fileValues[$name] ?? $default;
}

$sessionName = app_env('SESSION_NAME', 'potong_session');
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name($sessionName);
    session_set_cookie_params([
        'httponly' => true,
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'samesite' => 'Lax',
        'path' => '/',
    ]);
    session_start();
}

function db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    if (!in_array('mysql', PDO::getAvailableDrivers(), true)) {
        throw new RuntimeException('PDO MySQL belum aktif. Aktifkan ekstensi pdo_mysql pada PHP XAMPP/Laragon.');
    }
    $host = app_env('DB_HOST', '127.0.0.1');
    $port = app_env('DB_PORT', '3306');
    $name = app_env('DB_NAME', 'potong_studio');
    $charset = 'utf8mb4';
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset={$charset}";
    $pdo = new PDO($dsn, app_env('DB_USER', 'root'), app_env('DB_PASSWORD'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function request_data(): array
{
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    return is_array($data) ? $data : $_POST;
}

function current_user(): ?array
{
    if (empty($_SESSION['user_id'])) return null;
    $stmt = db()->prepare('SELECT id, username, name, email, role FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    return $stmt->fetch() ?: null;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) json_response(['error' => 'Silakan masuk terlebih dahulu.'], 401);
    return $user;
}

function require_admin(array $user): void
{
    if ($user['role'] !== 'admin') json_response(['error' => 'Akses hanya untuk admin.'], 403);
}

function safe_user(array $user): array
{
    unset($user['password_hash']);
    return $user;
}
