// ⚖️ Produto vendido por peso: unidade "kg" (ou "quilo"/"kilo")
const isKg = (unit) => ['kg', 'quilo', 'kilo'].includes((unit || '').trim().toLowerCase());

module.exports = { isKg };
