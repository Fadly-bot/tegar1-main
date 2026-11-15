import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const encoder = new TextEncoder();
const packages: Record<string, number> = {
  "Short & simple": 50000,
  "Creator cut": 150000,
  "Project cut": 300000,
};
const deadlines = ["Fleksibel", "1–3 hari", "3–7 hari", "Lebih dari 1 minggu"];
const statuses = ["Menunggu konfirmasi", "Dalam pengerjaan", "Selesai"];

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function db(path: string, init: RequestInit = {}): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  headers.set("Content-Type", "application/json");
  const result = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  const text = await result.text();
  const body = text ? JSON.parse(text) : null;
  if (!result.ok) throw new Error(body?.message || body?.hint || "Database request failed.");
  return body;
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromB64url(value: string): Uint8Array {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$120000$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("pbkdf2$")) {
    const [, rounds, saltText, expected] = stored.split("$");
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromB64url(saltText), iterations: Number(rounds), hash: "SHA-256" }, key, 256));
    return b64url(bits) === expected;
  }
  if (stored.startsWith("sha256$")) return await sha256(password) === stored.slice(7);
  return false;
}

async function ensureDemoUsers(): Promise<void> {
  const current = await db("potong_users?select=username&username=in.(a,b)");
  const existing = new Set((current ?? []).map((user: any) => user.username));
  const missing: any[] = [];
  if (!existing.has("a")) missing.push({ username: "a", password_hash: await hashPassword("a"), name: "Admin Potong", email: "admin@potong.studio", role: "admin" });
  if (!existing.has("b")) missing.push({ username: "b", password_hash: await hashPassword("b"), name: "Bima Demo", email: "bima@example.com", role: "customer" });
  if (missing.length) await db("potong_users?on_conflict=username", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(missing) });
}

function safeUser(user: any): any {
  return { id: Number(user.id), username: user.username, name: user.name, email: user.email, role: user.role };
}

async function currentUser(token: string): Promise<any | null> {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const sessions = await db(`potong_sessions?select=user_id&token_hash=eq.${tokenHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
  if (!sessions?.length) return null;
  const users = await db(`potong_users?select=id,username,name,email,role&id=eq.${sessions[0].user_id}&limit=1`);
  return users?.[0] ?? null;
}

async function createSession(userId: number): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await db("potong_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, token_hash: await sha256(token), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }),
  });
  return token;
}

async function auth(path: string, method: string, body: any, token: string): Promise<Response> {
  const action = new URLSearchParams(path.split("?")[1] ?? "").get("action") ?? "";
  if (action === "me") {
    const user = await currentUser(token);
    return response({ user: user ? safeUser(user) : null });
  }
  if (action === "login" && method === "POST") {
    await ensureDemoUsers();
    const username = String(body.username ?? "").trim();
    const rows = await db(`potong_users?select=id,username,password_hash,name,email,role&username=eq.${encodeURIComponent(username)}&limit=1`);
    const user = rows?.[0];
    if (!user || !(await verifyPassword(String(body.password ?? ""), user.password_hash))) return response({ error: "Username atau password tidak cocok." }, 422);
    if (user.password_hash.startsWith("sha256$")) await db(`potong_users?id=eq.${user.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ password_hash: await hashPassword(String(body.password)) }) });
    return response({ user: safeUser(user), token: await createSession(Number(user.id)) });
  }
  if (action === "register" && method === "POST") {
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!name || !username || !/^\S+@\S+\.\S+$/.test(email) || password.length < 1) return response({ error: "Lengkapi nama, email valid, username, dan password." }, 422);
    try {
      const rows = await db("potong_users?select=id,username,name,email,role", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name, email, username, password_hash: await hashPassword(password), role: "customer" }) });
      const user = rows[0];
      return response({ user: safeUser(user), token: await createSession(Number(user.id)) }, 201);
    } catch (error) {
      if (String(error).includes("duplicate key") || String(error).includes("unique constraint")) return response({ error: "Username atau email sudah dipakai." }, 422);
      throw error;
    }
  }
  if (action === "logout" && method === "POST") {
    if (token) await db(`potong_sessions?token_hash=eq.${await sha256(token)}`, { method: "DELETE" });
    return response({ ok: true });
  }
  return response({ error: "Aksi tidak dikenal." }, 404);
}

async function orders(method: string, query: URLSearchParams, body: any, user: any): Promise<Response> {
  if (!user) return response({ error: "Silakan masuk terlebih dahulu." }, 401);
  if (method === "GET") {
    const params = new URLSearchParams({ select: "*,potong_users(username,name,email)", order: "created_at.desc,id.desc" });
    if (user.role !== "admin") params.set("user_id", `eq.${user.id}`);
    else if (query.get("status") && query.get("status") !== "all") params.set("status", `eq.${query.get("status")}`);
    const rows = await db(`potong_orders?${params}`);
    const formatted = rows.map((order: any) => ({ ...order, code: order.code, id: user.role === "admin" ? order.code : order.code, ...(order.potong_users ?? {}) }));
    return response({ orders: formatted });
  }
  if (method === "POST") {
    if (user.role !== "customer") return response({ error: "Akun admin tidak dapat membuat pesanan klien." }, 403);
    const packageName = String(body.package ?? "").trim();
    if (!(packageName in packages)) return response({ error: "Pilih paket yang tersedia." }, 422);
    const deadline = deadlines.includes(String(body.deadline ?? "")) ? String(body.deadline) : "Fleksibel";
    const drive = String(body.drive ?? "").trim();
    if (drive && !/^https?:\/\//i.test(drive)) return response({ error: "Tautan footage harus berupa URL yang valid." }, 422);
    const code = `PTG-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    await db("potong_orders", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ code, user_id: user.id, package: packageName, price: packages[packageName], deadline, drive_url: drive, notes: String(body.notes ?? "").trim() }) });
    return response({ id: code, ok: true }, 201);
  }
  if (user.role !== "admin") return response({ error: "Akses hanya untuk admin." }, 403);
  const code = String(body.id ?? "").trim();
  if (!code) return response({ error: "ID pesanan tidak valid." }, 422);
  const filter = `code=eq.${encodeURIComponent(code)}`;
  if ((method === "DELETE" || body.action === "delete") && ["DELETE", "PATCH"].includes(method)) {
    const deleted = await db(`potong_orders?${filter}&select=id`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    return deleted?.length ? response({ ok: true }) : response({ error: "Pesanan tidak ditemukan." }, 404);
  }
  if (method === "PATCH") {
    const status = String(body.status ?? "");
    const packageName = String(body.package ?? "").trim();
    if (!statuses.includes(status)) return response({ error: "Status tidak valid." }, 422);
    if (packageName && !(packageName in packages)) return response({ error: "Paket tidak valid." }, 422);
    const deadline = deadlines.includes(String(body.deadline ?? "")) ? String(body.deadline) : "Fleksibel";
    const updated = await db(`potong_orders?${filter}&select=id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status, ...(packageName ? { package: packageName, price: packages[packageName] } : {}), deadline, notes: String(body.notes ?? ""), admin_notes: String(body.admin_notes ?? "") }) });
    return updated?.length ? response({ ok: true }) : response({ error: "Pesanan tidak ditemukan." }, 404);
  }
  return response({ error: "Metode tidak didukung." }, 405);
}

Deno.serve(async (request: Request) => {
  if (!supabaseUrl || !serviceKey) return response({ error: "Konfigurasi Supabase belum tersedia." }, 503);
  const incoming = new URL(request.url);
  const path = incoming.searchParams.get("path") ?? "";
  const method = request.method.toUpperCase();
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const body = method === "GET" || method === "HEAD" ? {} : await request.json().catch(() => ({}));
  try {
    if (path.endsWith("/api/auth.php")) return await auth(path + incoming.search, method, body, token);
    if (path.endsWith("/api/orders.php")) {
      const user = await currentUser(token);
      return await orders(method, incoming.searchParams, body, user);
    }
    return response({ error: "Endpoint tidak ditemukan." }, 404);
  } catch (error) {
    console.error("Potong API error:", error);
    return response({ error: "Terjadi masalah pada database Supabase.", code: "SUPABASE_UNAVAILABLE" }, 503);
  }
});
