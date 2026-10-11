import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lets the dev server be opened as http://127.0.0.1:3000 as well as http://localhost:3000 (dev only; no effect in production).
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: { position: 'bottom-right' },
  // Packages are resolved from the repo-root workspace node_modules.
  outputFileTracingRoot: new URL('..', import.meta.url).pathname,
};

export default config;
