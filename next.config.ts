import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Binário do ffmpeg: não pode ser empacotado pelo bundler; é lido do disco.
  serverExternalPackages: ["ffmpeg-static"],
  // Garante que o binário e a fonte das legendas vão junto nas funções de vídeo.
  outputFileTracingIncludes: {
    "/api/videos/**": ["./node_modules/ffmpeg-static/ffmpeg*", "./assets/fonts/**"],
  },
};

export default nextConfig;
