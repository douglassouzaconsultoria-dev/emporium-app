// 🖼️ Resolve a URL da imagem (produto, banner, foto de perfil, aba Imagens)
// - Nossas fotos (/api/img/...) → servidor do app; width até 400 pega a versão pequena (WebP) dos cards
// - Cloudinary (fotos antigas, de antes de trazer para o nosso banco) → width pede uma versão menor e mais leve
// - Imagens bem antigas (/uploads/...) → servidor do app
import { API_BASE } from '../config';

export const getImageUrl = (url, width) => {
  if (!url) return null;
  if (url.startsWith('/api/img/')) return `${API_BASE}${url}${width && width <= 400 ? '?w=400' : ''}`;
  if (url.startsWith('http')) {
    if (width && url.includes('res.cloudinary.com/') && url.includes('/image/upload/')) {
      return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${width}/`);
    }
    return url;
  }
  return `${API_BASE}${url}`;
};
