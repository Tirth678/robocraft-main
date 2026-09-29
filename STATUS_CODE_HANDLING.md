# Status Code Handling Documentation

## Overview

Comprehensive status code handling has been implemented across the admin authentication flow to provide clear error messages and proper HTTP status codes at every layer.

## Authentication Flow Status Codes

### 1. Admin Login Page (`apps/admin-dashboard/src/app/login/page.tsx`)

#### Client-Side Error Handling

**Validation Errors (Client-Side):**
- Missing email/password: User-friendly validation message
- Password < 6 characters: Length requirement message

**Neon Auth Sign-In Errors:**
- `Invalid password/credentials`: "Invalid email or password. Please check your credentials and try again."
- `not found/does not exist`: "No account found with this email address. Contact your administrator."
- `locked/suspended`: "This account has been locked. Contact your administrator."
- Generic auth errors: Display the actual error message from Neon Auth

**Token Fetch Errors:**
- Token error: "Failed to obtain access token: [error message]"
- Invalid token format: "Failed to obtain valid access token. Please try signing in again."

**Role Verification Errors:**
- Token invalid/expired: "Your authentication token is invalid or has expired. Please try again."
- Not authorized as admin: "Access Denied: Your account is not authorized for administrator access. Contact your system administrator."

**Network/Timeout Errors:**
- Network error: "Network error: Unable to connect to authentication service. Please check your connection."
- Timeout: "Request timeout: The authentication service is not responding. Please try again."

**Console Logging:**
- All steps logged with `[LOGIN]` prefix
- Success and error states clearly indicated
- User role verification results logged

---

### 2. Admin Role Verification (`apps/admin-dashboard/src/lib/neonAuth.ts`)

#### `fetchAdminRole()` Function

**Status Code Handling from Inventory Service:**

```
200 → Admin access verified ✅
401 → Token invalid/expired (throws error) ❌
403 → Token valid but not authorized (continues to fallback) ⚠️
500+ → Server error (continues to fallback) ⚠️
Network error → Falls back to token payload check ⚠️
```

**Fallback Verification Layers:**

1. **Inventory Service Probe** (Primary)
   - Calls `/admin/inventory/items?limit=1` with JWT
   - 5-second timeout
   - Status codes logged

2. **JWT Payload Check** (Fallback 1)
   - Decodes JWT and checks `role` field
   - Checks email against `NEXT_PUBLIC_ADMIN_EMAILS` whitelist
   - Logs payload details (role, email, sub)

3. **Direct Email Check** (Fallback 2)
   - Checks provided email against whitelist
   - Last resort validation

**Console Logging:**
- All checks logged with `[AUTH]` prefix
- Status codes from inventory service logged
- JWT payload details logged (email, role, sub)
- Final authorization decision logged

---

### 3. Inventory Service Admin Auth (`services/inventory-service/src/admin-auth.ts`)

#### `getAdminUserId()` Function

**Returns:**
- `string` (user ID) → Admin authorized ✅
- `null` → Not authorized (endpoint returns 403) ❌

**Authorization Checks (in order):**

1. **Authorization Header Check**
   - Missing/invalid → `null` (403)
   - Log: "Missing or invalid Authorization header"

2. **JWKS Configuration Check**
   - JWKS not configured → `null` (403)
   - Log: "JWKS not configured - set NEON_AUTH_JWKS_URL and NEON_AUTH_BASE_URL"

3. **JWT Verification**
   - Invalid/expired JWT → `null` (403)
   - Log: "JWT verification failed: [error message]"
   - Valid JWT → Continue to authorization checks

4. **JWT Subject Check**
   - Missing/invalid `sub` → `null` (403)
   - Log: "Invalid or missing subject (sub) in JWT"

5. **Admin Authorization Checks** (in order):

   a. **JWT Role Check** (Fast Path 1)
   - JWT contains `role: "admin"` or `role: "superadmin"` → Authorized ✅
   - Log: "Admin access granted via JWT role: [role]"

   b. **Email Whitelist Check** (Fast Path 2)
   - JWT email matches `ADMIN_EMAILS` env var → Authorized ✅
   - Log: "Admin access granted via email whitelist: [email]"

   c. **Database Lookup** (Primary Gate)
   - Query `inventory_admins` table by `auth_user_id` or `email`
   - Check: `revoked_at IS NULL` AND `is_active = true`
   - Found → Authorized ✅
   - Not found → `null` (403)
   - Log: "Admin access granted via database lookup" or "User not found in inventory_admins"
   - DB error → `null` (403) [fail closed]

6. **Final Denial**
   - No authorization found → `null` (403)
   - Log: "Access denied - no admin authorization found"

**Console Logging:**
- All checks logged with `[INVENTORY-AUTH]` prefix
- JWT payload logged (sub, role, email)
- Authorization decision path logged
- Database query failures logged

---

### 4. Auth Service (`services/auth-service/src/index.ts`)

#### `/me` Endpoint

**Status Codes:**
- `200`: Authenticated user with role
  ```json
  {
    "user": {
      "id": "user@email.com",
      "email": "user@email.com",
      "role": "admin"
    }
  }
  ```

- `401`: Not authenticated
  ```json
  {
    "error": "Unauthorized"
  }
  ```

#### `/logout` Endpoint

**Status Codes:**
- `200`: Successfully signed out
  ```json
  {
    "success": true,
    "message": "Signed out"
  }
  ```

- `200`: Neon Auth doesn't support logout (graceful fallback)
  ```json
  {
    "success": true,
    "message": "Local session cleared"
  }
  ```

- `4xx/5xx`: Logout failed
  ```json
  {
    "success": false,
    "error": "[error message]"
  }
  ```

---

## Status Code Flow Chart

```
User Login Attempt
    ↓
┌─────────────────────────────────────┐
│ Admin Login Page                    │
│ (apps/admin-dashboard/login)        │
├─────────────────────────────────────┤
│ 1. Validate input                   │
│    → Client-side validation         │
│ 2. Call Neon Auth signIn            │
│    → 200: Success                   │
│    → 401: Invalid credentials       │
│    → Other: Error message           │
│ 3. Fetch JWT token                  │
│    → Success: Got JWT               │
│    → Error: Token fetch failed      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Role Verification                   │
│ (fetchAdminRole)                    │
├─────────────────────────────────────┤
│ 1. Probe inventory service          │
│    GET /admin/inventory/items       │
│    → 200: Admin verified ✅         │
│    → 401: Invalid token ❌          │
│    → 403: Not admin ⚠️              │
│    → 500+: Server error ⚠️          │
│    → Network: Fallback ⚠️           │
│                                      │
│ 2. Fallback: Check JWT payload      │
│    → role=admin/superadmin: OK ✅   │
│    → email in whitelist: OK ✅      │
│    → Neither: Check email ⚠️        │
│                                      │
│ 3. Fallback: Direct email check     │
│    → email in whitelist: OK ✅      │
│    → Not in list: Denied ❌         │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Inventory Service Auth              │
│ (getAdminUserId)                    │
├─────────────────────────────────────┤
│ 1. Check Authorization header       │
│    → Missing: 403                   │
│                                      │
│ 2. Verify JWT signature             │
│    → Invalid: 403                   │
│    → Valid: Continue                │
│                                      │
│ 3. Check JWT role                   │
│    → admin/superadmin: Allow ✅     │
│                                      │
│ 4. Check email whitelist            │
│    → In ADMIN_EMAILS: Allow ✅      │
│                                      │
│ 5. Query inventory_admins table     │
│    → Found & active: Allow ✅       │
│    → Not found: 403 ❌              │
│    → DB error: 403 ❌               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Result                              │
├─────────────────────────────────────┤
│ ✅ Admin access granted             │
│    → Store JWT in localStorage      │
│    → Redirect to dashboard          │
│                                      │
│ ❌ Access denied                    │
│    → Show error message             │
│    → User remains on login page     │
└─────────────────────────────────────┘
```

---

## Testing Status Codes

### Using curl

**Test inventory service directly:**

```bash
# No token (should return 403)
curl -v http://localhost:3002/admin/inventory/items

# Invalid token (should return 403)
curl -v -H "Authorization: Bearer invalid_token" \
  http://localhost:3002/admin/inventory/items

# Valid token (get one by logging in first)
curl -v -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3002/admin/inventory/items
```

**Test auth service:**

```bash
# Health check
curl http://localhost:3001/health

# Check current session (without auth)
curl -v http://localhost:3001/me
```

### Using Browser Console

**Check login flow:**

```javascript
// Open browser console on login page
// Logs will show:
// [LOGIN] Attempting sign in for: admin@robocraft.com
// [LOGIN] Sign in successful
// [LOGIN] Fetching access token...
// [LOGIN] Access token obtained, verifying admin role...
// [AUTH] Inventory service probe status: 200
// [AUTH] Admin access verified via inventory service
// [LOGIN] Admin access granted, storing credentials...
// [LOGIN] Login complete, redirecting to dashboard...
```

**Check inventory service logs:**

```bash
tail -f /tmp/inventory-service.log

# You'll see:
# [INVENTORY-AUTH] JWT verified successfully
# [INVENTORY-AUTH] JWT payload: { sub: '...', role: 'admin', email: 'admin@robocraft.com' }
# [INVENTORY-AUTH] Admin access granted via JWT role: admin
```

---

## Error Message Reference

### User-Facing Messages

| Scenario | Message |
|----------|---------|
| Wrong password | "Invalid email or password. Please check your credentials and try again." |
| Account doesn't exist | "No account found with this email address. Contact your administrator." |
| Account locked | "This account has been locked. Contact your administrator." |
| Token expired | "Your authentication token is invalid or has expired. Please try again." |
| Not authorized as admin | "Access Denied: Your account is not authorized for administrator access. Contact your system administrator if you believe this is an error." |
| Network error | "Network error: Unable to connect to authentication service. Please check your connection." |
| Timeout | "Request timeout: The authentication service is not responding. Please try again." |

### Console Log Messages

| Component | Prefix | Example |
|-----------|--------|---------|
| Login Page | `[LOGIN]` | `[LOGIN] Attempting sign in for: user@email.com` |
| Role Verification | `[AUTH]` | `[AUTH] Inventory service probe status: 200` |
| Inventory Auth | `[INVENTORY-AUTH]` | `[INVENTORY-AUTH] Admin access granted via JWT role: admin` |

---

## Configuration Requirements

### Environment Variables for Status Code Handling

**Admin Dashboard** (`.env.local`):
```env
NEXT_PUBLIC_ADMIN_EMAILS="admin@robocraft.com,tirth@robocraft.com"
NEXT_PUBLIC_INVENTORY_SERVICE_URL="http://localhost:3002"
NEXT_PUBLIC_AUTH_SERVICE_URL="http://localhost:3001"
```

**Root** (`.env`):
```env
ADMIN_EMAILS="admin@robocraft.com,tirth@robocraft.com"
NEON_AUTH_JWKS_URL="https://[your-neon-auth].neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json"
NEON_AUTH_BASE_URL="https://[your-neon-auth].neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth"
```

---

## Summary

✅ **Comprehensive status code handling implemented:**
- Client-side validation with clear messages
- HTTP status codes properly checked and handled
- Multiple fallback authentication layers
- Detailed console logging at each step
- User-friendly error messages
- Network error handling with timeouts
- Database query error handling (fail closed)

✅ **Logging coverage:**
- Login flow: `[LOGIN]` prefix
- Role verification: `[AUTH]` prefix  
- Inventory service: `[INVENTORY-AUTH]` prefix
- All status codes logged
- All authorization decisions logged

✅ **Security:**
- Fail closed on errors (deny access)
- JWT signature verification required
- Multiple authorization gates
- Timeout protection (5 seconds)
- No hardcoded credentials
