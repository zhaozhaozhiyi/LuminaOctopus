/** @type {import('next').NextConfig} */
const nextConfig = {
  // 后续 Electron 打包时可能需要关闭或调整
  output: 'standalone',
};

module.exports = nextConfig;
