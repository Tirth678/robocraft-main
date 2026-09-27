/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Expose the inventory service URL to the browser client so fetchAdminRole
    // can probe the admin endpoint for the authoritative role check.
    NEXT_PUBLIC_INVENTORY_SERVICE_URL: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002',
    NEXT_PUBLIC_ADMIN_EMAILS: process.env.ADMIN_EMAILS || 'admin@robocraft.com,tirth@robocraft.com',
    // Legacy — kept for any existing code that reads this.
    NEXT_PUBLIC_AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    NEXT_PUBLIC_ADMIN_DASHBOARD_URL: process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3006',
  },
  // NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are server-only and must
  // NOT be prefixed with NEXT_PUBLIC_. They are read directly from process.env
  // in src/lib/auth/server.ts which only runs on the server.
};

export default nextConfig;
