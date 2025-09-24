/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      "tokens.app.pulsex.com",
      "tokens.app.v4.testnet.pulsex.com",
      "raw.githubusercontent.com",
    ],
  },
};

module.exports = nextConfig;
