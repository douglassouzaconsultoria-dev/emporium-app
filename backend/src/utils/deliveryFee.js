// 🛵 Taxa de entrega por bairro
// Compara sem acento/maiúscula: "Enéas", "eneas" e " ENEAS " são o mesmo bairro
const normalize = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/\s+/g, ' ');

// Retorna { fee, neighborhood } — bairro da lista usa o valor dele; fora da lista usa a taxa padrão
const getDeliveryFee = async (db, neighborhood) => {
  const fees = await db.query('SELECT neighborhood, fee FROM delivery_fees');
  const match = fees.rows.find(f => normalize(f.neighborhood) === normalize(neighborhood));
  if (match) {
    return { fee: parseFloat(match.fee), neighborhood: match.neighborhood };
  }

  const setting = await db.query("SELECT value FROM app_settings WHERE key = 'default_delivery_fee'");
  const fee = parseFloat(setting.rows[0]?.value) || 0;
  return { fee, neighborhood: (neighborhood || '').trim() };
};

module.exports = { normalize, getDeliveryFee };
