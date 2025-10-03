/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tokens.app.pulsex.com",
      },
      {
        protocol: "https",
        hostname: "tokens.app.v4.testnet.pulsex.com",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
    ],
  },
  experimental: {
    allowedDevOrigins: [
      "https://*.loca.lt",
      "https://*.ngrok-free.app"
    ],
  },
};

module.exports = nextConfig;
