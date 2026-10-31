/* global process */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@floodrelay/shared'],
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
      {
        source: '/requests/:path*',
        destination: `${backendUrl}/requests/:path*`,
      },
      {
        source: '/requests',
        destination: `${backendUrl}/requests`,
      },
      {
        source: '/assignments/:path*',
        destination: `${backendUrl}/assignments/:path*`,
      },
      {
        source: '/assignments',
        destination: `${backendUrl}/assignments`,
      },
      {
        source: '/health',
        destination: `${backendUrl}/health`,
      },
    ];
  },
};

export default nextConfig;
