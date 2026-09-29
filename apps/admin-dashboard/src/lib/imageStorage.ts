// ImageKit configuration and utilities
export const IMAGEKIT_CONFIG = {
  publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY || 'public_hKEVJN7k8741slc5QNxZ1h076bs=',
  urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/sv0yu0i0g8/robocraft',
};

export interface UploadImageResult {
  fileId: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  filePath: string;
}

/**
 * Get authentication parameters for file upload
 * This should be called from a server-side API route
 */
export async function getUploadAuthParams(): Promise<{
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
}> {
  const response = await fetch('/api/upload-auth');
  if (!response.ok) {
    throw new Error('Failed to get upload authentication');
  }
  return response.json();
}

/**
 * Get optimized image URL with transformations
 * @param filePath - ImageKit file path
 * @param transformation - Transformation options
 * @returns Transformed image URL
 */
export function getImageUrl(
  filePath: string,
  transformation?: Array<{ width?: number; height?: number; quality?: number }>
): string {
  const baseUrl = IMAGEKIT_CONFIG.urlEndpoint.replace(/\/$/, '');
  const path = filePath.startsWith('/') ? filePath : `/${filePath}`;
  
  if (!transformation || transformation.length === 0) {
    return `${baseUrl}${path}`;
  }
  
  // Build transformation string
  const tr = transformation
    .map(t => {
      const parts = [];
      if (t.width) parts.push(`w-${t.width}`);
      if (t.height) parts.push(`h-${t.height}`);
      if (t.quality) parts.push(`q-${t.quality}`);
      return parts.join(',');
    })
    .join(':');
  
  return `${baseUrl}/tr:${tr}${path}`;
}

/**
 * Get thumbnail URL (200x200)
 * @param filePath - ImageKit file path
 * @returns Thumbnail URL
 */
export function getThumbnailUrl(filePath: string): string {
  return getImageUrl(filePath, [{ width: 200, height: 200, quality: 70 }]);
}

/**
 * Get safe image URL with fallback
 * @param imageUrl - Image URL to check
 * @param fallbackUrl - Fallback URL if image fails to load
 * @returns Safe image URL
 */
export function getSafeImageUrl(imageUrl: string | null | undefined, fallbackUrl: string = '/assets/product-robot.png'): string {
  if (!imageUrl || imageUrl.trim() === '') {
    return fallbackUrl;
  }
  return imageUrl;
}

/**
 * Check if image URL is from ImageKit
 * @param imageUrl - Image URL to check
 * @returns True if URL is from ImageKit
 */
export function isImageKitUrl(imageUrl: string): boolean {
  return imageUrl.includes('ik.imagekit.io');
}
