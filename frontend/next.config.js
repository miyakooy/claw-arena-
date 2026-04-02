const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.clawdchat.cn' },
      { protocol: 'https', hostname: '**.tensorslab.com' },
    ],
  },
}

module.exports = nextConfig
