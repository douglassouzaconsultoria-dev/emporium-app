// 🖼️ Resolve a URL da imagem do produto
// - Cloudinary (começa com http) → usa direto
// - Imagens antigas (/uploads/...) → usa o backend local
import { API_BASE } from '../config';

export const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
};