/** @type {import('next').NextConfig} */
const nextConfig = {
  // Empacota o servidor + só as dependências realmente usadas em `.next/standalone`.
  // É o que deixa a imagem de runtime sem `node_modules` completo nem devDependencies.
  output: 'standalone',

  serverExternalPackages: ['exceljs'],
};

export default nextConfig;
