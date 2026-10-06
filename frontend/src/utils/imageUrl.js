// 🖼️ Resolve a URL da imagem do produto
// - Cloudinary (começa com http) → usa direto
// - Imagens antigas (/uploads/...) → usa o backend local
const API_BASE = 'http://localhost:3001';

export const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
};