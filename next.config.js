/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NODE_ENV === 'production' && process.env.STANDALONE === 'true' ? 'standalone' : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['@node-rs/argon2', 'argon2'],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = { type: 'memory' };
      config.watchOptions = {
        poll: 2000,
        aggregateTimeout: 500,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**']
      };
    }
    return config;
  },
};

export default nextConfig;
