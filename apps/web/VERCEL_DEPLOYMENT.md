# Vercel Deployment Guide for RoboCraft

## Current Frontend Setup

The frontend no longer depends on Supabase. All backend-backed actions now call generic `/api/*`
routes, with an optional `VITE_BACKEND_URL` prefix if your backend is hosted separately.

## Environment Variables

Set `VITE_BACKEND_URL` only if your backend lives on a different origin.

Example:

```bash
VITE_BACKEND_URL=https://your-backend.example.com
```

If your Lovable backend is exposed on the same domain through Vercel rewrites or proxying, leave
`VITE_BACKEND_URL` unset and the frontend will call relative routes such as `/api/chat`.

## Endpoints Expected by the Frontend

- `/api/chat`
- `/api/generate-product-description`
- `/api/beta-feedback`
- `/api/waitlist-subscribe`
- `/api/create-order`
- `/api/track-order`
- `/api/admin-waitlist`
- `/api/admin-orders`
- `/api/admin-order-status`

## Troubleshooting

1. If the site builds but actions fail, check that your backend exposes the endpoints above.
2. If the site loads locally but not on Vercel, compare browser console errors and Vercel runtime logs.
3. If your backend is cross-origin, ensure CORS and cookies are configured correctly.
