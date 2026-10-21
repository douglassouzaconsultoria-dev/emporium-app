// 📷 Foto de celular pode passar de 5 MB (limite do servidor): reduz para no máximo 1600px antes de enviar.
// O servidor depois tira o fundo e centraliza em 800x800.
const MAX_SIDE = 1600;
export const prepareImage = (file) => new Promise((resolve) => {
  if (!file) return resolve(null);
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) {
      URL.revokeObjectURL(url);
      return resolve(file);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], 'produto.jpg', { type: 'image/jpeg' }) : file),
      'image/jpeg',
      0.9
    );
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    resolve(file);
  };
  img.src = url;
});
