import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import { getAutoPrint, setAutoPrint, printOrder } from '../utils/printOrder';
import './AdminStore.css';

const KIOSK_FLAG = '--kiosk-printing';

// Cupom de exemplo para testar a impressora sem fazer pedido
const TEST_ORDER = {
  id: 0,
  created_at: new Date().toISOString(),
  name: 'TESTE DE IMPRESSÃO',
  phone_number: '(00) 00000-0000',
  delivery_address: 'Rua de Teste, 123',
  delivery_neighborhood: 'Centro',
  notes: 'Se você está lendo isto, a impressora está funcionando!',
  items: [
    { quantity: 2, unit: 'un', product_name: 'Produto de teste', price: 5 },
    { quantity: 0.5, unit: 'kg', product_name: 'Produto por peso', price: 20 }
  ],
  delivery_fee: 2,
  discount: 0,
  total: 22,
  payment_method: 'dinheiro',
  change_for: 50
};

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// 🏪 Loja: aberto/fechado, horários, pedido mínimo, aviso, motoboy padrão e impressora
function AdminStore() {
  const [store, setStore] = useState(null);
  const [motoboys, setMotoboys] = useState([]);
  const [autoPrint, setAutoPrintState] = useState(getAutoPrint());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });

  useEffect(() => {
    axios.get(`${API_URL}/settings/store/admin`, authHeaders())
      .then(res => setStore(res.data))
      .catch(err => console.error('Erro ao buscar dados da loja:', err));
    axios.get(`${API_URL}/motoboys`, authHeaders())
      .then(res => setMotoboys(res.data.filter(m => m.active)))
      .catch(err => console.error('Erro ao buscar motoboys:', err));
  }, []);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const save = async (next = store) => {
    try {
      setSaving(true);
      const res = await axios.put(`${API_URL}/settings/store`, next, authHeaders());
      setStore(res.data);
      showMessage('✅ Salvo!');
    } catch (error) {
      showMessage(`❌ ${error.response?.data?.error || 'Erro ao salvar'}`);
    } finally {
      setSaving(false);
    }
  };

  const setDay = (i, field, value) => {
    setStore({ ...store, hours: store.hours.map((h, idx) => (idx === i ? { ...h, [field]: value } : h)) });
  };

  const [copied, setCopied] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState('');

  const resetOrders = async () => {
    try {
      setResetting(true);
      const res = await axios.post(`${API_URL}/settings/reset-orders`, { confirm: resetText }, authHeaders());
      setResetText('');
      setResetResult(`✅ Pedidos zerados (${res.data.deleted} apagados). O próximo pedido será o #1.`);
    } catch (error) {
      setResetResult(`❌ ${error.response?.data?.error || 'Erro ao zerar pedidos'}`);
    } finally {
      setResetting(false);
    }
  };

  const copyFlag = async () => {
    try {
      await navigator.clipboard.writeText(` ${KIOSK_FLAG}`);
    } catch {
      window.prompt('Copie o comando:', ` ${KIOSK_FLAG}`);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const toggleAutoPrint = () => {
    setAutoPrint(!autoPrint);
    setAutoPrintState(!autoPrint);
  };

  if (!store) return <div className="as-loading">Carregando...</div>;

  return (
    <div className="as-container">
      <h2>🏪 Loja</h2>
      {message && <div className={`as-message ${message.includes('✅') ? 'ok' : 'err'}`}>{message}</div>}

      {/* ABERTO / FECHADO */}
      <div className={`as-status ${store.status.open ? 'open' : 'closed'}`}>
        <div>
          <strong>{store.status.open ? '🟢 Loja aberta' : '🔴 Loja fechada'}</strong>
          <span>{store.status.message || 'Recebendo pedidos'}</span>
        </div>
        <button
          onClick={() => save({ ...store, closed_now: !store.closed_now })}
          disabled={saving}
          className={store.closed_now ? 'as-btn-open' : 'as-btn-close'}
        >
          {store.closed_now ? '🔓 Reabrir loja' : '🔒 Fechar agora'}
        </button>
      </div>

      <div className="as-grid">
        {/* PEDIDO MÍNIMO + AVISO */}
        <div className="as-card">
          <h3>💰 Pedido mínimo</h3>
          <p className="as-help">Valor mínimo em produtos (sem a taxa de entrega). Use 0 para não ter mínimo.</p>
          <div className="as-money">
            <span>R$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={store.min_order}
              onChange={(e) => setStore({ ...store, min_order: e.target.value })}
            />
          </div>

          <h3>📢 Aviso na loja</h3>
          <p className="as-help">Aparece no topo para os clientes. Ex: "Frete grátis hoje!" (deixe vazio para não mostrar).</p>
          <input
            type="text"
            maxLength={200}
            className="as-input"
            placeholder="Escreva um aviso..."
            value={store.notice}
            onChange={(e) => setStore({ ...store, notice: e.target.value })}
          />
        </div>

        {/* MOTOBOY PADRÃO + IMPRESSORA */}
        <div className="as-card">
          <h3>🛵 Motoboy padrão</h3>
          <p className="as-help">Todo pedido novo já entra com esse motoboy. Você pode trocar em cada pedido.</p>
          <select
            className="as-input"
            value={store.default_motoboy_id || ''}
            onChange={(e) => setStore({ ...store, default_motoboy_id: e.target.value ? parseInt(e.target.value) : null })}
          >
            <option value="">— Nenhum (escolho em cada pedido) —</option>
            {motoboys.map(m => (
              <option key={m.id} value={m.id}>{m.name} (@{m.username})</option>
            ))}
          </select>

          <h3>🖨️ Impressora</h3>
          <label className="as-switch">
            <input type="checkbox" checked={autoPrint} onChange={toggleAutoPrint} />
            <span>Imprimir pedidos novos automaticamente <em>neste computador</em></span>
          </label>
          <div className="as-print-guide">
            <strong>📋 Como deixar a impressão automática (Bematech MP-4200 TH)</strong>
            <ol>
              <li>Instale o driver da Bematech e deixe a <b>MP-4200 TH como impressora padrão</b> do Windows (papel 80mm).</li>
              <li>
                Crie um atalho do Chrome na área de trabalho. Clique com o botão direito → <b>Propriedades</b> e,
                no fim do campo <b>Destino</b>, acrescente (com um espaço antes):
                <div className="as-flag">
                  <code>{KIOSK_FLAG}</code>
                  <button type="button" className="as-btn-light" onClick={copyFlag}>{copied ? '✅ Copiado' : '📋 Copiar'}</button>
                </div>
              </li>
              <li>Feche <b>todas</b> as janelas do Chrome e abra pelo atalho novo.</li>
              <li>Marque a opção acima (<b>Imprimir pedidos novos automaticamente</b>).</li>
              <li>Deixe o <b>painel Admin aberto</b> durante o expediente: a cada 20 s ele confere pedidos novos, apita e imprime.</li>
            </ol>
            <p className="as-help">
              Manual: <b>📦 Pedidos → 🖨️</b> (primeira coluna). Se aparecer a janela de impressão, o Chrome não foi aberto pelo atalho.
              Se sair em outra impressora, a Bematech não está como padrão.
            </p>
            <button type="button" className="as-btn-light" onClick={() => printOrder({ ...TEST_ORDER, created_at: new Date().toISOString() })}>
              🖨️ Imprimir teste
            </button>
          </div>
        </div>
      </div>

      {/* HORÁRIOS */}
      <div className="as-card">
        <div className="as-card-head">
          <h3>🕒 Horário de funcionamento</h3>
          <label className="as-switch">
            <input
              type="checkbox"
              checked={store.hours_enabled}
              onChange={(e) => setStore({ ...store, hours_enabled: e.target.checked })}
            />
            <span>Usar horário (fora dele, a loja não aceita pedidos)</span>
          </label>
        </div>

        <div className={`as-hours ${store.hours_enabled ? '' : 'disabled'}`}>
          {store.hours.map((h, i) => (
            <div key={i} className="as-day">
              <strong>{DAYS[i]}</strong>
              <label className="as-day-open">
                <input type="checkbox" checked={!h.closed} onChange={(e) => setDay(i, 'closed', !e.target.checked)} />
                {h.closed ? 'Fechado' : 'Aberto'}
              </label>
              <input type="time" value={h.open} disabled={h.closed} onChange={(e) => setDay(i, 'open', e.target.value)} />
              <span>às</span>
              <input type="time" value={h.close} disabled={h.closed} onChange={(e) => setDay(i, 'close', e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <button className="as-save" onClick={() => save()} disabled={saving}>
        {saving ? '⏳ Salvando...' : '💾 Salvar configurações'}
      </button>

      {/* ZERAR PEDIDOS */}
      <div className="as-card as-danger">
        <h3>🧹 Zerar pedidos</h3>
        <p className="as-help">
          Apaga <b>todos os pedidos</b> e zera o Dashboard (vendas, faturamento, mais vendidos). A numeração volta para o #1
          e os usos dos cupons voltam a 0. Clientes, produtos, estoque, motoboys e configurações continuam iguais.
          <b> Não dá para desfazer.</b>
        </p>
        <div className="as-reset-row">
          <input
            type="text"
            value={resetText}
            onChange={(e) => setResetText(e.target.value.toUpperCase())}
            placeholder="Digite ZERAR"
          />
          <button type="button" className="as-btn-danger" onClick={resetOrders} disabled={resetText !== 'ZERAR' || resetting}>
            {resetting ? '⏳ Zerando...' : '🧹 Zerar pedidos'}
          </button>
        </div>
        {resetResult && <div className={`as-message ${resetResult.includes('✅') ? 'ok' : 'err'}`}>{resetResult}</div>}
      </div>
    </div>
  );
}

export default AdminStore;
