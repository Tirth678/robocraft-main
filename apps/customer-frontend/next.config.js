/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL,
    NEXT_PUBLIC_CUSTOMER_FRONTEND_URL: process.env.CUSTOMER_FRONTEND_URL,
  },
};

export default nextConfig;
