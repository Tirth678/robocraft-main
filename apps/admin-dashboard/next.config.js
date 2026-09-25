/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL,
    NEXT_PUBLIC_ADMIN_DASHBOARD_URL: process.env.ADMIN_DASHBOARD_URL,
  },
};

export default nextConfig;
