// 📱 GERADOR DE PIX "COPIA E COLA" (padrão oficial do Banco Central - BR Code)
// Gera o código com o VALOR do pedido já preenchido.

export const PIX_CONFIG = {
  key: '03697793000138',        // CNPJ (somente números)
  keyDisplay: '03.697.793/0001-38',
  name: 'EMPORIO BRUMADO',      // máx. 25 caracteres, sem acento
  city: 'PATROCINIO'            // máx. 15 caracteres, sem acento
};

const formatField = (id, value) => {
  const size = String(value.length).padStart(2, '0');
  return `${id}${size}${value}`;
};

const removeAccents = (text) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const crc16 = (payload) => {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

export const gerarPixCopiaECola = ({ valor, txid }) => {
  const merchantAccount =
    formatField('00', 'br.gov.bcb.pix') +
    formatField('01', PIX_CONFIG.key);

  const cleanTxid = txid ? String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) : '';
  const finalTxid = cleanTxid || '***';

  const payload =
    formatField('00', '01') +
    formatField('26', merchantAccount) +
    formatField('52', '0000') +
    formatField('53', '986') +
    (valor ? formatField('54', Number(valor).toFixed(2)) : '') +
    formatField('58', 'BR') +
    formatField('59', removeAccents(PIX_CONFIG.name).slice(0, 25)) +
    formatField('60', removeAccents(PIX_CONFIG.city).slice(0, 15)) +
    formatField('62', formatField('05', finalTxid)) +
    '6304';

  return payload + crc16(payload);
};