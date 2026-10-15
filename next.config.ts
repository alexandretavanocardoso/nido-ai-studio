import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança de todas as respostas. Sem uma política completa de
 * conteúdo (CSP): só o que não muda o comportamento do app — o principal é
 * impedir que as telas (pagamento, saque) sejam embutidas em outro site.
 */
const CABECALHOS_DE_SEGURANCA = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Câmera só do próprio site: a Shadow ao vivo (/app/live) liga a webcam. Vale
  // para o app todo porque a política é do documento, e a navegação entre as
  // telas não recarrega a página.
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  headers() {
    return [{ source: "/:path*", headers: CABECALHOS_DE_SEGURANCA }];
  },
  // Binário do ffmpeg: não pode ser empacotado pelo bundler; é lido do disco.
  serverExternalPackages: ["ffmpeg-static"],
  // Garante que o binário e a fonte das legendas vão junto nas funções de vídeo.
  outputFileTracingIncludes: {
    "/api/videos/**": ["./node_modules/ffmpeg-static/ffmpeg*", "./assets/fonts/**"],
    // Shadow de vídeo gravado: mede a duração do vídeo enviado (lib/live).
    "/api/live/sombra-video": ["./node_modules/ffmpeg-static/ffmpeg*"],
    // A logo do pingente do PFP (lib/pfp-server.ts), lida do disco.
    "/api/conta/pfp": ["./public/logo/NIDO AI STUDIO SEM FUNDO.png"],
  },
};

export default nextConfig;
