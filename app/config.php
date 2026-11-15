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

/** Use the hosted Supabase API when configured; keep MySQL for local XAMPP/Laragon. */
function supabase_proxy_enabled(): bool
{
    return app_env('SUPABASE_URL') !== '' && app_env('SUPABASE_ANON_KEY') !== '';
}

function supabase_proxy(): never
{
    $base = rtrim(app_env('SUPABASE_URL'), '/') . '/functions/v1/potong-api';
    $script = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    $query = $_GET;
    $query['path'] = $script;
    $url = $base . '?' . http_build_query($query);
    $anonKey = app_env('SUPABASE_ANON_KEY');
    $accessToken = (string)($_COOKIE['potong_access'] ?? '');
    $headers = [
        'apikey: ' . $anonKey,
        'Authorization: Bearer ' . ($accessToken !== '' ? $accessToken : $anonKey),
        'Content-Type: application/json',
    ];
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input') ?: '{}');
    }
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($body === false) {
        json_response(['error' => 'Layanan database belum dapat dihubungi.', 'code' => 'SUPABASE_UNAVAILABLE'], 503);
    }
    http_response_code($status ?: 502);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $payload = json_decode($body, true);
    if (is_array($payload) && isset($payload['token']) && in_array($script, ['/api/auth.php'], true)) {
        setcookie('potong_access', (string)$payload['token'], [
            'expires' => time() + 60 * 60 * 24 * 30,
            'path' => '/',
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || app_env('VERCEL') !== '',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        unset($payload['token']);
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    if (is_array($payload) && $script === '/api/auth.php' && ($_GET['action'] ?? '') === 'logout') {
        setcookie('potong_access', '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    }
    echo $body;
    exit;
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
