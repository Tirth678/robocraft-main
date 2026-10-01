import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Requests signed by another service must be fresh enough to resist replay. */
const MAX_SKEW_SECONDS = 300;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Canonical string that gets HMAC'd: timestamp, method, path and body digest.
 *
 * Binding the body digest means a signature cannot be replayed against a
 * different payload, and the path binding stops cross-endpoint reuse.
 */
const payloadFor = (timestamp: number, method: string, path: string, body: string) =>
  `${timestamp}.${method.toUpperCase()}.${path}.${sha256(body)}`;

export function signServiceRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000)
): { timestamp: number; signature: string } {
  const signature = createHmac('sha256', secret)
    .update(payloadFor(timestamp, method, path, body))
    .digest('hex');
  return { timestamp, signature };
}

/**
 * Verifies an inbound service-to-service request.
 *
 * This is an identity for our own services talking to each other — it is not a
 * substitute for an admin user and never grants an admin role by itself.
 */
export async function verifyServiceRequest(
  request: Request,
  secret: string | undefined,
  bodyText: string
): Promise<boolean> {
  if (!secret) return false;

  const timestampHeader = request.headers.get('x-service-timestamp');
  const signature = request.headers.get('x-service-signature');
  if (!timestampHeader || !signature) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_SKEW_SECONDS) return false;

  const url = new URL(request.url);
  const expected = signServiceRequest(
    secret,
    request.method,
    url.pathname,
    bodyText,
    timestamp
  ).signature;

  const provided = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (provided.length !== wanted.length) return false;

  return timingSafeEqual(provided, wanted);
}
