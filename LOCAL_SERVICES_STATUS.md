# RoboCraft Local Services Status

## All Services Running ✅

All microservices and frontend applications are currently running locally for testing.

### Running Services

| Service | Port | Status | PID | Log File |
|---------|------|--------|-----|----------|
| Auth Service | 3001 | ✅ Running | 3992 | /tmp/auth-service.log |
| Inventory Service | 3002 | ✅ Running | 8356 | /tmp/inventory-service.log |
| Cart Service | 3003 | ✅ Running | 8378 | /tmp/cart-service.log |
| Billing Service | 3004 | ✅ Running | 8401 | /tmp/billing-service.log |
| Email Service | 3005 | ✅ Running | 8436 | /tmp/email-service.log |
| Admin Dashboard | 3006 | ✅ Running | 8543 | /tmp/admin-dashboard.log |
| Redis | 6379 | ✅ Running | - | - |

### Access Points

- **Admin Dashboard**: http://localhost:3006/login
- **Auth Service**: http://localhost:3001
- **Inventory API**: http://localhost:3002
- **Cart API**: http://localhost:3003
- **Billing API**: http://localhost:3004
- **Email API**: http://localhost:3005

## Admin Login Fix Applied ✅

### Issue Identified
The admin login was failing because Next.js client-side code couldn't access environment variables. Next.js requires the `NEXT_PUBLIC_` prefix for any environment variables that need to be accessible in the browser.

### Fix Applied
Updated `apps/admin-dashboard/.env.local` to include:

```env
NEXT_PUBLIC_ADMIN_EMAILS="admin@robocraft.com,tirth@robocraft.com"
NEXT_PUBLIC_INVENTORY_SERVICE_URL="http://localhost:3002"
NEXT_PUBLIC_AUTH_SERVICE_URL="http://localhost:3001"
```

### Admin Authentication Flow

The system validates admin access through three layers:

1. **JWT Role Check**: If the Neon Auth JWT contains `role: "admin"` or `role: "superadmin"`, access is granted
2. **Environment Variable Whitelist**: Email addresses in `ADMIN_EMAILS` are automatically authorized
3. **Database Table**: Users in the `inventory_admins` table with `revoked_at IS NULL` are authorized

### Authorized Admin Users

Two admin users are configured in the database:
- `admin@robocraft.com` (auth_user_id: ff9f8d85-413a-4920-a5cd-fd17c2a75d71)
- `tirth@robocraft.com` (auth_user_id: 2b068341-8af6-4065-bdd6-7a16091a3777)

## Testing Admin Login

1. Open http://localhost:3006/login in your browser
2. Use one of the authorized admin emails (admin@robocraft.com or tirth@robocraft.com)
3. If you need to create a new account, use the "Register" option on the login page
4. After successful authentication, you'll receive a JWT token from Neon Auth
5. The system will verify your admin status and redirect you to the admin dashboard

## Viewing Logs

To check logs for any service:

```bash
# Auth Service
tail -f /tmp/auth-service.log

# Inventory Service
tail -f /tmp/inventory-service.log

# Cart Service
tail -f /tmp/cart-service.log

# Billing Service
tail -f /tmp/billing-service.log

# Email Service
tail -f /tmp/email-service.log

# Admin Dashboard
tail -f /tmp/admin-dashboard.log
```

## Stopping Services

To stop all running services:

```bash
# Kill all services by PID
kill 3992 8356 8378 8401 8436 8543

# Or use lsof to find and kill by port
kill $(lsof -ti:3001,3002,3003,3004,3005,3006)
```

## Restarting Services

To restart all services from scratch:

```bash
# From the project root
cd /Users/tirth/Documents/GitHub/robocraft-main

# Start each service in background
cd services/auth-service && bun --env-file=../../.env run --watch src/index.ts > /tmp/auth-service.log 2>&1 &
cd ../inventory-service && bun --env-file=../../.env run --watch src/index.ts > /tmp/inventory-service.log 2>&1 &
cd ../cart-service && bun --env-file=../../.env run --watch src/index.ts > /tmp/cart-service.log 2>&1 &
cd ../billing-service && bun --env-file=../../.env run --watch src/index.ts > /tmp/billing-service.log 2>&1 &
cd ../email-service && bun --env-file=../../.env run --watch src/index.ts > /tmp/email-service.log 2>&1 &
cd ../../apps/admin-dashboard && bun run dev > /tmp/admin-dashboard.log 2>&1 &
```

## Health Checks

Quick health check for all services:

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
curl http://localhost:3005/health
```

## Troubleshooting

### Admin Login Still Not Working?

1. **Clear browser cache and cookies**: Neon Auth uses cookies for session management
2. **Check browser console**: Open Developer Tools (F12) and check for JavaScript errors
3. **Verify environment variables**: Check that NEXT_PUBLIC_ vars are set in the browser (they'll be visible in the page source)
4. **Check Neon Auth status**: Verify your Neon Auth service is accessible at the configured URL
5. **Database connectivity**: Ensure the inventory_admins table is accessible

### Service Won't Start?

1. **Port already in use**: Kill the process using the port with `lsof -ti:<port> | xargs kill`
2. **Environment variables missing**: Check that `.env` file exists in the project root
3. **Dependencies not installed**: Run `bun install` from the project root

### Redis Connection Issues?

Check if Redis is running:
```bash
redis-cli ping
```

If not running, start Redis:
```bash
redis-server
```

## Next Steps

1. **Test Admin Login**: Navigate to http://localhost:3006/login and sign in
2. **Create Test Products**: Use the admin dashboard to add inventory items
3. **Test Customer Flow**: Start the customer frontend to test the shopping experience
4. **Monitor Logs**: Keep an eye on service logs for any errors or issues

## Configuration Files

- **Root environment**: `.env` (used by all services)
- **Admin dashboard environment**: `apps/admin-dashboard/.env.local` (Next.js specific)
- **Database migrations**: `packages/database/migrations/`
- **Neon Auth configuration**: Set in NEON_AUTH_BASE_URL and NEON_AUTH_JWKS_URL

---

**Status**: ✅ All systems operational and ready for testing
**Date**: Tuesday, 2026-09-29 09:28 IST
