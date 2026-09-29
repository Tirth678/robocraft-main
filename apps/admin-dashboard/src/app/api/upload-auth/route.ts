import { NextResponse } from 'next/server';
import { getUploadAuthParams } from '@imagekit/next/server';

export async function GET() {
  try {
    // Generate upload authentication parameters
    const { token, expire, signature } = getUploadAuthParams({
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY as string,
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY as string,
      expire: 30 * 60, // 30 minutes
    });

    return NextResponse.json({
      token,
      expire,
      signature,
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    });
  } catch (error) {
    console.error('Upload auth error:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload authentication' },
      { status: 500 }
    );
  }
}
