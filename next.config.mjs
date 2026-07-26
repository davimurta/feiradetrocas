/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fase 1: backend-first. Sem UI ainda — apenas Server Actions e domínio.
  experimental: {
    // Server Actions já são estáveis no App Router; nada extra necessário aqui.
  },
};

export default nextConfig;
