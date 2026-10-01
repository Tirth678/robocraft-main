import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { cookie } from "@elysiajs/cookie";
import { SignJWT, jwtVerify } from "jose";
import pg from "pg";

const { Pool } = pg;

const JWT_SECRET = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || "admin-secret-change-in-production"
);
const JWT_ISSUER = "robocraft-admin";
const ADMIN_DB_URL = process.env.DATABASE_URL;

const pool = new Pool({ connectionString: ADMIN_DB_URL });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@robocraft.com";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 
  "$2a$10$rQZ9Kq8vJ5Y7xV3wE2T1uO6pL9mN4bCdEfGhIjKlMnOpQrStUvWxYz"; // "admin123" hashed

// Initialize admin table
await pool.query(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
  );
`);

// Create default admin if not exists
const existing = await pool.query("SELECT id FROM admin_users WHERE email = $1", [ADMIN_EMAIL]);
if (existing.rowCount === 0) {
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash("admin123", 10);
  await pool.query(
    "INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)",
    [ADMIN_EMAIL, hash, "Admin User", "admin"]
  );
  console.log("[ADMIN] Default admin created: admin@robocraft.com / admin123");
}

async function createToken(user: { id: string; email: string; role: string }) {
  return new SignJWT({ sub: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: JWT_ISSUER });
    return payload;
  } catch {
    return null;
  }
}

async function requireAuth(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/admin_token=([^;]+)/);
  const token = match?.[1];
  if (!token) return null;
  return verifyToken(token);
}

const app = new Elysia()
  .use(cors({
    origin: ["http://localhost:3006", "http://localhost:8082", "http://localhost:3007"],
    credentials: true,
  }))
  .use(cookie())
  .get("/health", () => ({ service: "admin-service", status: "healthy" }));

// Auth endpoints
app.post("/auth/login", async ({ body, cookie, set }) => {
  const { email, password } = body as { email: string; password: string };
  
  const result = await pool.query(
    "SELECT id, email, password_hash, name, role FROM admin_users WHERE email = $1",
    [email]
  );
  
  if (result.rowCount === 0) {
    set.status = 401;
    return { error: "Invalid credentials" };
  }
  
  const user = result.rows[0];
  const bcrypt = await import("bcryptjs");
  const valid = await bcrypt.compare(password, user.password_hash);
  
  if (!valid) {
    set.status = 401;
    return { error: "Invalid credentials" };
  }
  
  const token = await createToken({ id: user.id, email: user.email, role: user.role });
  
  cookie.admin_token.set({
    value: token,
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
    path: "/",
  });
  
  await pool.query("UPDATE admin_users SET last_login = NOW() WHERE id = $1", [user.id]);
  
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role } };
});

app.post("/auth/logout", ({ cookie }) => {
  cookie.admin_token.remove({ path: "/" });
  return { success: true };
});

app.get("/auth/me", async ({ request, set }) => {
  const payload = await requireAuth(request);
  if (!payload) {
    set.status = 401;
    return { error: "Not authenticated" };
  }
  return { user: { id: payload.sub, email: payload.email, role: payload.role } };
});

// Admin API endpoints - proxy to inventory service
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || "http://localhost:3002";

async function proxyToInventory(path: string, request: Request, init?: RequestInit) {
  const payload = await requireAuth(request);
  if (!payload) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  
  const token = await createToken({ 
    id: payload.sub as string, 
    email: payload.email as string, 
    role: payload.role as string 
  });
  
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  
  const response = await fetch(`${INVENTORY_URL}${path}`, {
    ...init,
    headers,
  });
  
  return response;
}

// Products
app.get("/api/products", async ({ request, query }) => {
  const params = new URLSearchParams(query as Record<string, string>);
  return proxyToInventory(`/products?${params}`, request);
});

app.get("/api/products/:id", async ({ request, params }) => {
  return proxyToInventory(`/products/${params.id}`, request);
});

app.post("/api/products", async ({ request, body }) => {
  return proxyToInventory("/products", request, { method: "POST", body: JSON.stringify(body) });
});

app.patch("/api/products/:id", async ({ request, params, body }) => {
  return proxyToInventory(`/products/${params.id}`, request, { method: "PATCH", body: JSON.stringify(body) });
});

app.delete("/api/products/:id", async ({ request, params }) => {
  return proxyToInventory(`/products/${params.id}`, request, { method: "DELETE" });
});

app.post("/api/products/:id/stock", async ({ request, params, body }) => {
  return proxyToInventory(`/products/${params.id}/stock`, request, { method: "POST", body: JSON.stringify(body) });
});

// Pre-orders
app.get("/api/pre-orders", async ({ request, query }) => {
  const params = new URLSearchParams(query as Record<string, string>);
  return proxyToInventory(`/admin/pre-orders?${params}`, request);
});

app.get("/api/pre-orders/:id", async ({ request, params }) => {
  return proxyToInventory(`/admin/pre-orders/${params.id}`, request);
});

app.patch("/api/pre-orders/:id", async ({ request, params, body }) => {
  return proxyToInventory(`/admin/pre-orders/${params.id}`, request, { method: "PATCH", body: JSON.stringify(body) });
});

app.delete("/api/pre-orders/:id", async ({ request, params }) => {
  return proxyToInventory(`/admin/pre-orders/${params.id}`, request, { method: "DELETE" });
});

// Inventory summary
app.get("/api/summary", async ({ request }) => {
  return proxyToInventory("/admin/summary", request);
});

app.get("/api/movements", async ({ request, query }) => {
  const params = new URLSearchParams(query as Record<string, string>);
  return proxyToInventory(`/admin/movements?${params}`, request);
});

// Digital assets
app.get("/api/products/:id/digital-assets", async ({ request, params }) => {
  return proxyToInventory(`/products/${params.id}/digital-assets`, request);
});

app.post("/api/products/:id/digital-assets", async ({ request, params, body }) => {
  return proxyToInventory(`/products/${params.id}/digital-assets`, request, { method: "POST", body: JSON.stringify(body) });
});

// License keys
app.get("/api/products/:id/keys", async ({ request, params }) => {
  return proxyToInventory(`/products/${params.id}/keys`, request);
});

app.post("/api/products/:id/keys", async ({ request, params, body }) => {
  return proxyToInventory(`/products/${params.id}/keys`, request, { method: "POST", body: JSON.stringify(body) });
});

app.post("/api/digital-keys/:id/revoke", async ({ request, params }) => {
  return proxyToInventory(`/digital-keys/${params.id}/revoke`, request, { method: "POST", body: "{}" });
});

// Entitlements
app.get("/api/entitlements", async ({ request, query }) => {
  const params = new URLSearchParams(query as Record<string, string>);
  return proxyToInventory(`/admin/entitlements?${params}`, request);
});

app.post("/api/entitlements/:id/revoke", async ({ request, params }) => {
  return proxyToInventory(`/admin/entitlements/${params.id}/revoke`, request, { method: "POST", body: "{}" });
});

app.listen(3007);
console.log("[ADMIN] Admin service running at http://localhost:3007");