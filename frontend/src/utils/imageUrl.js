// 🖼️ Resolve a URL da imagem do produto
// - Cloudinary (começa com http) → usa direto
// - Imagens antigas (/uploads/...) → usa o backend local
// - width: pede ao Cloudinary uma versão menor e no formato mais leve do celular (WebP/AVIF).
//   Cada tamanho é gerado uma vez só (1 transformação) e fica guardado; depois só gasta o tráfego, bem menor.
import { API_BASE } from '../config';

export const getImageUrl = (url, width) => {
  if (!url) return null;
  if (url.startsWith('http')) {
    if (width && url.includes('res.cloudinary.com/') && url.includes('/image/upload/')) {
      return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${width}/`);
    }
    return url;
  }
  return `${API_BASE}${url}`;
};
