/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['lucide-react'],
  experimental: {
    serverComponentsExternalPackages: ['@node-rs/argon2', 'argon2', 'pdfkit'],
  },
};

export default nextConfig;
