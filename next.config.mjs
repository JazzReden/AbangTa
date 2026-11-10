import { fileURLToPath } from 'node:url';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  async headers() {
    const common = { source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'" },
    ] };
    const framed = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ];
    if (process.env.NODE_ENV !== 'development') return [common, {
      source: '/:path*', headers: [...framed,
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }];
    // Only direct loopback development requests may be embedded by editor previews.
    // Proxied/tunnel traffic keeps clickjacking protection even with a loopback Host.
    return [common, {
      source: '/:path*', missing: [{ type: 'host', value: '(localhost|127\\.0\\.0\\.1)' }], headers: framed,
    }, {
      source: '/:path*', has: [{ type: 'header', key: 'x-forwarded-host' }], headers: framed,
    }];
  },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  serverExternalPackages: ['bcryptjs'],
};

export default function config(phase) {
  const portIndex = process.argv.findLastIndex(value => value === '--port' || value === '-p');
  const requested = portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT ?? '3000';
  const port = /^\d{1,5}$/.test(requested) ? requested : '3000';
  return { ...nextConfig, distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev-' + port : '.next' };
}
