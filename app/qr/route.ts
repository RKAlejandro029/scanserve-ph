import { qrSVG } from '../../server/qr.mjs';

export function GET(request: Request) {
  try {
    const target = new URL(new URL(request.url).searchParams.get('url') ?? '');
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Invalid protocol');
    return new Response(qrSVG(target.href), { headers: { 'Content-Type': 'image/svg+xml', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new Response('Invalid or oversized table URL.', { status: 400 });
  }
}
