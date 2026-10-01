/**
 * Object storage for digital deliverables.
 *
 * Primary backend is Neon Object Storage (S3-compatible, branch-scoped). When
 * the AWS_* credentials injected by `neon env pull --service object-storage`
 * are absent the driver falls back to a local directory so development and CI
 * still work end to end; in that mode `presignObject` returns null and the
 * inventory service streams the bytes itself through GET /downloads/:token.
 */
import { AwsClient } from 'aws4fetch';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export type StorageBackend = 'neon' | 'local';

export interface StoredObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface StorageObjectBody {
  body: Uint8Array;
  contentType: string;
}

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const region = process.env.AWS_REGION || 'us-east-2';

export const storageBucket =
  process.env.INVENTORY_STORAGE_BUCKET || process.env.NEON_STORAGE_BUCKET || 'productimages';

const localRoot = resolve(process.env.DIGITAL_STORAGE_DIR || '.data/digital-assets');

const s3 =
  accessKeyId && secretAccessKey && endpoint
    ? new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region })
    : null;

export const storageBackend: StorageBackend = s3 ? 'neon' : 'local';

/** Signed URLs are only possible against real object storage. */
export const supportsSignedUrls = Boolean(s3);

const objectUrl = (key: string) => {
  const base = (endpoint ?? '').replace(/\/+$/, '');
  return `${base}/${storageBucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
};

const localPath = (key: string) => join(localRoot, key.replace(/^\/+/, ''));

/** Strips path traversal and characters that S3/URL encodings handle poorly. */
export const sanitizeFileName = (fileName: string) =>
  fileName
    .replace(/[\\/]+/g, '-')
    .replace(/[^\w.\- ]+/g, '_')
    .trim()
    .slice(-180) || 'download';

export const buildObjectKey = (fileName: string, folder = 'digital') => {
  const safe = sanitizeFileName(fileName);
  return `${folder.replace(/^\/+|\/+$/g, '')}/${randomUUID()}-${safe}`;
};

export const checksumOf = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');

export async function putObject({ key, body, contentType }: StoredObjectInput): Promise<void> {
  if (!s3) {
    const path = localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return;
  }

  const response = await s3.fetch(objectUrl(key), {
    method: 'PUT',
    body,
    headers: { 'Content-Type': contentType },
  });

  if (!response.ok) {
    throw new Error(`Object storage upload failed (${response.status})`);
  }
}

export async function getObject(key: string): Promise<StorageObjectBody | null> {
  if (!s3) {
    try {
      const body = await readFile(localPath(key));
      return { body: new Uint8Array(body), contentType: 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  const response = await s3.fetch(objectUrl(key), { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Object storage download failed (${response.status})`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  return {
    body: buffer,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

export async function deleteObject(key: string): Promise<void> {
  if (!s3) {
    await rm(localPath(key), { force: true });
    return;
  }

  const response = await s3.fetch(objectUrl(key), { method: 'DELETE' });
  // 404 means the object is already gone, which is the desired end state.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Object storage delete failed (${response.status})`);
  }
}

/**
 * Returns a short-lived signed GET URL. Returns null in local-fallback mode so
 * callers fall back to streaming the bytes themselves.
 */
export async function presignObject(
  key: string,
  options: { expiresIn?: number; downloadName?: string } = {}
): Promise<string | null> {
  if (!s3) return null;

  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(Math.min(options.expiresIn ?? 300, 604800)));
  if (options.downloadName) {
    url.searchParams.set(
      'response-content-disposition',
      `attachment; filename="${sanitizeFileName(options.downloadName)}"`
    );
  }

  const signed = await s3.sign(url.toString(), { aws: { signQuery: true } });
  return signed.url;
}
