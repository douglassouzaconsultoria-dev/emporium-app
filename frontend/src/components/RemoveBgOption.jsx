import { useState } from 'react';

// 🤖 Tirar o fundo com a IA do Cloudinary é a parte mais cara do plano grátis (cada foto conta como 75 transformações).
// Foto tirada num fundo branco liso (com o flash e as linhas da câmera) não precisa: só corta e centraliza.
// A escolha fica lembrada neste aparelho. Começa desligado (o plano grátis do Cloudinary é pequeno).
const KEY = 'foto-tirar-fundo';

export function useRemoveBg() {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(KEY) === 'sim'; } catch { return false; }
  });
  const set = (value) => {
    setOn(value);
    try { localStorage.setItem(KEY, value ? 'sim' : 'nao'); } catch { /* sem armazenamento */ }
  };
  return [on, set];
}

function RemoveBgOption({ value, onChange, disabled }) {
  return (
    <label className="rbg-option">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>
        🤖 Tirar o fundo da foto
        <small>{value ? 'Usa a IA (gasta mais do plano). Desmarque se a foto já tem fundo branco.' : 'Só corta e centraliza (quase não gasta). Use com fundo branco liso.'}</small>
      </span>
    </label>
  );
}

export default RemoveBgOption;
