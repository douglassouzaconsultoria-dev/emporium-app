import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { formatQty } from '../utils/units';
import { printOrder, printOrderById } from '../utils/printOrder';
import { confirmDialog, notify } from '../utils/dialog';
import OrderItemsEditor from './OrderItemsEditor';
import './AdminOrders.css';
import { brl } from '../utils/format';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [motoboys, setMotoboys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [editingItems, setEditingItems] = useState(false);
  const [savingMotoboy, setSavingMotoboy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(null); // 'Saído' | 'Entregue' esperando o 2º toque
  const [bulkMessage, setBulkMessage] = useState('');
  // 🔎 Busca e filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(''); // '' | 'today' | 'yesterday' | '7d' | 'AAAA-MM-DD'

  const statuses = ['Pendente', 'Preparando', 'Saído', 'Entregue'];

  useEffect(() => {
    fetchOrders();
    fetchMotoboys();
    // 🔄 Atualiza a lista sozinha a cada 20 segundos
    const timer = setInterval(() => fetchOrders(true), 20000);
    return () => clearInterval(timer);
  }, []);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  });

  const fetchOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await fetch(`${API_URL}/orders`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Erro ao buscar pedidos');
      const data = await response.json();
      setOrders(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMotoboys = async () => {
    try {
      const response = await fetch(`${API_URL}/motoboys`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) return;
      const data = await response.json();
      setMotoboys(data.filter(m => m.active));
    } catch (err) {
      console.error('Erro ao buscar motoboys:', err);
    }
  };

  const openOrderDetails = async (order) => {
    try {
      const response = await fetch(`${API_URL}/orders/${order.id}`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Erro ao buscar detalhes');
      const details = await response.json();
      setOrderDetails(details);
      setSelectedOrder(order);
      setEditingItems(false);
    } catch (err) {
      notify('❌ Erro ao carregar detalhes: ' + err.message, 'error');
    }
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setOrderDetails(null);
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar status');

      setOrders(orders.map(order =>
        order.id === orderId ? { ...order, status: newStatus, problem: null } : order
      ));

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus, problem: null });
      }
      if (orderDetails) {
        setOrderDetails({ ...orderDetails, status: newStatus });
      }
    } catch (err) {
      notify('❌ Erro ao atualizar status: ' + err.message, 'error');
    }
  };

  // ⚡ Todos de uma vez: Preparando → Saído e Saído → Entregue (toca uma vez para confirmar, de novo para fazer)
  const toSend = orders.filter(o => o.status === 'Preparando' && !o.problem);
  const toDeliver = orders.filter(o => o.status === 'Saído');

  const bulkUpdate = async (status) => {
    const list = status === 'Saído' ? toSend : toDeliver;
    if (bulkConfirm !== status) {
      setBulkConfirm(status);
      setTimeout(() => setBulkConfirm(c => (c === status ? null : c)), 5000);
      return;
    }
    setBulkConfirm(null);
    try {
      const response = await fetch(`${API_URL}/orders/bulk-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status, ids: list.map(o => o.id) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar');
      const n = data.updated.length;
      setBulkMessage(`✅ ${n} ${n === 1 ? 'pedido marcado' : 'pedidos marcados'} como ${status === 'Saído' ? 'Saiu para entrega' : 'Entregue'}`);
      setTimeout(() => setBulkMessage(''), 4000);
      fetchOrders(true);
    } catch (err) {
      setBulkMessage(`❌ ${err.message}`);
      setTimeout(() => setBulkMessage(''), 4000);
    }
  };

  // 🔎 Pedidos que aparecem na tabela (busca por nº, cliente, telefone ou endereço + status + data)
  const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
  const todayKey = dayKey(new Date());
  const yesterdayKey = dayKey(Date.now() - 864e5);
  const weekAgoKey = dayKey(Date.now() - 6 * 864e5);
  const term = search.trim().toLowerCase().replace(/^#/, '');
  const digits = term.replace(/\D/g, '');
  const filteredOrders = orders.filter(o => {
    if (statusFilter === 'problem' ? !o.problem : statusFilter && o.status !== statusFilter) return false;
    if (dateFilter) {
      const k = dayKey(o.created_at);
      if (dateFilter === 'today' && k !== todayKey) return false;
      if (dateFilter === 'yesterday' && k !== yesterdayKey) return false;
      if (dateFilter === '7d' && k < weekAgoKey) return false;
      if (/^\d{4}-/.test(dateFilter) && k !== dateFilter) return false;
    }
    if (!term) return true;
    if (String(o.id) === term) return true;
    const text = `${o.name || ''} ${o.delivery_address || ''} ${o.delivery_neighborhood || ''}`.toLowerCase();
    if (text.includes(term)) return true;
    return digits.length >= 3 && (o.phone_number || '').replace(/\D/g, '').includes(digits);
  });
  const filtering = Boolean(term || statusFilter || dateFilter);

  // 🔁 Entrega voltou com problema → manda de novo para a fila dos motoboys
  const resendOrder = async (order) => {
    try {
      const response = await fetch(`${API_URL}/orders/${order.id}/resend`, { method: 'POST', headers: getAuthHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao reenviar');
      setOrders(list => list.map(o => (o.id === order.id ? { ...o, problem: null } : o)));
      if (selectedOrder && selectedOrder.id === order.id) setSelectedOrder({ ...selectedOrder, problem: null });
    } catch (err) {
      notify('❌ ' + err.message, 'error');
    }
  };

  // ❌ Cancelar: o backend devolve os itens ao estoque
  const cancelOrder = async (order) => {
    if (await confirmDialog(`Cancelar o pedido #${order.id}? Os itens voltam para o estoque.`, { okText: '❌ Cancelar pedido', danger: true })) {
      updateOrderStatus(order.id, 'Cancelado');
    }
  };

  // 🛵 Escolher / remover motoboy
  const assignMotoboy = async (orderId, motoboyId) => {
    try {
      setSavingMotoboy(true);
      const response = await fetch(`${API_URL}/orders/${orderId}/motoboy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ motoboy_id: motoboyId || null })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao definir motoboy');

      const moto = motoboys.find(m => m.id === parseInt(motoboyId));
      const motoboyName = moto ? moto.name : null;
      const newId = motoboyId ? parseInt(motoboyId) : null;

      const problemAfter = (order) => (newId ? null : order.problem);
      setOrders(orders.map(order =>
        order.id === orderId ? { ...order, motoboy_id: newId, motoboy_name: motoboyName, problem: problemAfter(order) } : order
      ));

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, motoboy_id: newId, motoboy_name: motoboyName, problem: problemAfter(selectedOrder) });
      }
    } catch (err) {
      notify('❌ ' + err.message, 'error');
    } finally {
      setSavingMotoboy(false);
    }
  };

  // ▶ Preparar: PIX só depois de conferir no extrato que o pagamento caiu
  const startPreparing = async (order) => {
    if (order.payment_method === 'pix' && order.status === 'Pendente' && !(await confirmDialog(
      `PIX do pedido #${order.id}: você conferiu no extrato do banco que caiu ${brl(parseFloat(order.total))}` +
      ` (identificação EMP${order.id})?`,
      { okText: '✅ Caiu, liberar' }
    ))) return;
    updateOrderStatus(order.id, 'Preparando');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pendente': return '#fbbf24';
      case 'Preparando': return '#60a5fa';
      case 'Saído': return '#8b5cf6';
      case 'Entregue': return '#10b981';
      case 'Cancelado': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getPaymentInfo = (method) => {
    switch (method) {
      case 'pix':
        return { icon: '📱', label: 'PIX', bg: '#e0f2fe', color: '#075985' };
      case 'cartao':
        return { icon: '💳', label: 'Cartão', bg: '#ede9fe', color: '#5b21b6' };
      default:
        return { icon: '💵', label: 'Dinheiro', bg: '#dcfce7', color: '#166534' };
    }
  };

  const PaymentBadge = ({ method }) => {
    const info = getPaymentInfo(method);
    return (
      <span style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 700,
        background: info.bg,
        color: info.color,
        whiteSpace: 'nowrap'
      }}>
        {info.icon} {info.label}
      </span>
    );
  };

  const MotoboyCell = ({ order }) => {
    if (order.problem) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span title="O motoboy devolveu a entrega" style={{
            fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
            background: '#fee2e2', color: '#991b1b'
          }}>
            ⚠️ {order.problem}
          </span>
          <button className="details-btn" style={{ background: '#ea580c' }} onClick={() => resendOrder(order)}>
            🔁 Reenviar
          </button>
        </span>
      );
    }
    if (order.motoboy_name) {
      return <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>🛵 {order.motoboy_name}</span>;
    }
    if (order.status === 'Preparando') {
      return (
        <span style={{
          fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
          background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap'
        }}>
          ⏳ Aguardando motoboy
        </span>
      );
    }
    return <span style={{ color: '#aaa' }}>—</span>;
  };

  const getDeliveryNote = (order) => {
    const total = brl(order.total);
    switch (order.payment_method) {
      case 'pix':
        return {
          bg: '#fffbeb',
          border: '#f59e0b',
          text: `⚠️ PIX: confira no app do Sicoob se caiu ${total} antes de despachar. Procure pelo valor e horário (a identificação EMP${order.id} pode aparecer no extrato).`
        };
      case 'cartao':
        return {
          bg: '#f5f3ff',
          border: '#8b5cf6',
          text: `💳 Levar a MAQUININHA. Cobrar ${total} na entrega.`
        };
      default: {
        const changeFor = parseFloat(order.change_for) || 0;
        return {
          bg: '#f0fdf4',
          border: '#22c55e',
          text: changeFor > 0
            ? `💵 DINHEIRO: cobrar ${total}. Cliente vai pagar com ${brl(changeFor)} → levar ${brl(changeFor - parseFloat(order.total))} de troco.`
            : `💵 DINHEIRO: cobrar ${total}. Cliente disse que tem trocado (não precisa de troco).`
        };
      }
    }
  };

  if (loading) return <div className="admin-orders-loading">Carregando pedidos...</div>;

  return (
    <div className="admin-orders">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2>📦 Gerenciar Pedidos</h2>
        <button
          onClick={() => { fetchOrders(); fetchMotoboys(); }}
          style={{
            padding: '8px 14px',
            background: '#fff',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          🔄 Atualizar
        </button>
      </div>

      {/* ⚡ AÇÕES EM LOTE */}
      <div className="ao-bulk">
        <button
          className={`ao-bulk-btn go ${bulkConfirm === 'Saído' ? 'confirm' : ''}`}
          onClick={() => bulkUpdate('Saído')}
          disabled={toSend.length === 0}
          title="Todos os pedidos em Preparando passam para Saiu para entrega"
        >
          {bulkConfirm === 'Saído'
            ? `👆 Clique de novo: ${toSend.length} saindo para entrega`
            : `🛵 Todos saíram para entrega (${toSend.length})`}
        </button>
        <button
          className={`ao-bulk-btn done ${bulkConfirm === 'Entregue' ? 'confirm' : ''}`}
          onClick={() => bulkUpdate('Entregue')}
          disabled={toDeliver.length === 0}
          title="Todos os pedidos em Saído passam para Entregue"
        >
          {bulkConfirm === 'Entregue'
            ? `👆 Clique de novo: ${toDeliver.length} entregues`
            : `✅ Todos entregues (${toDeliver.length})`}
        </button>
      </div>
      {bulkMessage && (
        <div className={`ao-bulk-msg ${bulkMessage.startsWith('✅') ? 'ok' : 'err'}`}>{bulkMessage}</div>
      )}

      {error && <div className="admin-orders-error">{error}</div>}

      {/* 🔎 BUSCA E FILTROS */}
      <div className="ao-filters">
        <input
          type="search"
          placeholder="🔎 Buscar nº do pedido, cliente, telefone ou endereço"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos os status</option>
          {['Pendente', 'Preparando', 'Saído', 'Entregue', 'Cancelado'].map(st => <option key={st} value={st}>{st}</option>)}
          <option value="problem">⚠️ Com problema</option>
        </select>
        <select value={/^\d{4}-/.test(dateFilter) ? 'day' : dateFilter} onChange={(e) => setDateFilter(e.target.value === 'day' ? todayKey : e.target.value)}>
          <option value="">Qualquer data</option>
          <option value="today">Hoje</option>
          <option value="yesterday">Ontem</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="day">Escolher dia...</option>
        </select>
        {/^\d{4}-/.test(dateFilter) && (
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || '')} />
        )}
        {filtering && (
          <button className="ao-filters-clear" onClick={() => { setSearch(''); setStatusFilter(''); setDateFilter(''); }}>
            ✕ Limpar ({filteredOrders.length} de {orders.length})
          </button>
        )}
      </div>

      {orders.length === 0 ? (
        <p>Nenhum pedido ainda</p>
      ) : (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Ação</th>
                <th>ID</th>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Endereço</th>
                <th>Total</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Motoboy</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '24px', color: '#777' }}>Nenhum pedido encontrado com esses filtros.</td></tr>
              )}
              {filteredOrders.map(order => (
                <tr key={order.id} className="order-row">
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="details-btn"
                      onClick={() => openOrderDetails(order)}
                    >
                      Ver
                    </button>
                    {order.status === 'Pendente' && (
                      <button
                        className="details-btn"
                        title={order.payment_method === 'pix' ? 'Conferir o PIX e liberar' : 'Mandar para preparo'}
                        style={{ marginLeft: '6px', background: order.payment_method === 'pix' ? '#0369a1' : '#16a34a' }}
                        onClick={() => startPreparing(order)}
                      >
                        {order.payment_method === 'pix' ? '✅ PIX ok' : '▶ Preparar'}
                      </button>
                    )}
                    <button
                      className="details-btn"
                      title="Imprimir pedido"
                      style={{ marginLeft: '6px', background: '#1a1a1a' }}
                      onClick={() => printOrderById(order.id).catch(err => notify('❌ ' + err.message, 'error'))}
                    >
                      🖨️
                    </button>
                  </td>
                  <td>
                    #{order.id}
                    {order.notes && <span title={`Observação: ${order.notes}`}> 📝</span>}
                    {order.payment_note && <span title={`Recado sobre o pagamento: ${order.payment_note}`}> 💵📝</span>}
                    {order.rating && <span title={`Avaliação: ${order.rating}/5`}> ⭐{order.rating}</span>}
                  </td>
                  <td>{order.name || 'N/A'}</td>
                  <td>{order.phone_number || 'N/A'}</td>
                  <td>{order.delivery_address}</td>
                  <td>{brl(parseFloat(order.total))}</td>
                  <td><PaymentBadge method={order.payment_method} /></td>
                  <td>
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(order.status) }}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td><MotoboyCell order={order} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                    <br /><small style={{ color: '#666' }}>{new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrder && orderDetails && (
        <div className="order-modal">
          <div className="order-modal-content">
            <button className="close-modal-btn" onClick={closeModal}>×</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3>Detalhes do Pedido #{selectedOrder.id}</h3>
              <button
                onClick={() => printOrder({ ...selectedOrder, ...orderDetails })}
                style={{
                  padding: '8px 14px', background: '#1a1a1a', color: '#fff', border: 'none',
                  borderRadius: '8px', fontWeight: 700, cursor: 'pointer', marginRight: '30px'
                }}
              >
                🖨️ Imprimir
              </button>
            </div>

            <div className="order-details">
              <p><strong>Cliente:</strong> {selectedOrder.name || 'N/A'}</p>
              <p><strong>Telefone:</strong> {selectedOrder.phone_number || 'N/A'}</p>
              <p><strong>Endereço:</strong> {selectedOrder.delivery_address}</p>
              <p><strong>Data:</strong> {new Date(selectedOrder.created_at).toLocaleString('pt-BR')}</p>
              <p><strong>Pagamento:</strong> <PaymentBadge method={selectedOrder.payment_method} /></p>
            </div>

            {selectedOrder.notes && (
              <div style={{
                background: '#fff7ed', borderLeft: '4px solid #f97316', padding: '12px 14px',
                borderRadius: '8px', margin: '12px 0', fontSize: '15px', fontWeight: 600
              }}>
                📝 Observação do cliente: {selectedOrder.notes}
              </div>
            )}
            {selectedOrder.payment_note && (
              <div style={{
                background: '#f0fdf4', borderLeft: '4px solid #16a34a', padding: '12px 14px',
                borderRadius: '8px', margin: '12px 0', fontSize: '15px', fontWeight: 600
              }}>
                💵 Recado sobre o pagamento: {selectedOrder.payment_note}
              </div>
            )}

            {selectedOrder.rating && (
              <div style={{
                background: '#fefce8', borderLeft: '4px solid #eab308', padding: '12px 14px',
                borderRadius: '8px', margin: '12px 0', fontSize: '14px'
              }}>
                <strong>{'⭐'.repeat(selectedOrder.rating)}</strong> Avaliação do cliente ({selectedOrder.rating}/5)
                {selectedOrder.rating_comment && <p style={{ margin: '6px 0 0' }}>"{selectedOrder.rating_comment}"</p>}
              </div>
            )}

            {(() => {
              const note = getDeliveryNote(selectedOrder);
              return (
                <div style={{
                  background: note.bg,
                  borderLeft: `4px solid ${note.border}`,
                  padding: '12px 14px',
                  borderRadius: '8px',
                  margin: '12px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#333'
                }}>
                  {note.text}
                </div>
              );
            })()}

            {/* 🛵 MOTOBOY */}
            <div style={{
              background: '#f8f9fa',
              border: '1px solid #e0e0e0',
              borderRadius: '10px',
              padding: '12px 14px',
              margin: '12px 0'
            }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>🛵 Motoboy da entrega:</p>

              {selectedOrder.problem && !['Entregue', 'Cancelado'].includes(selectedOrder.status) && (
                <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', fontWeight: 600 }}>
                  ⚠️ A entrega voltou: <strong>{selectedOrder.problem}</strong>
                  <div style={{ marginTop: '8px', fontWeight: 400, color: '#7f1d1d', fontSize: '13px' }}>
                    Fale com o cliente e então reenvie para os motoboys, escolha um motoboy abaixo ou cancele o pedido.
                  </div>
                  <button className="details-btn" style={{ marginTop: '8px', background: '#ea580c' }} onClick={() => resendOrder(selectedOrder)}>
                    🔁 Reenviar para os motoboys
                  </button>
                </div>
              )}

              {['Entregue', 'Cancelado'].includes(selectedOrder.status) ? (
                <p style={{ margin: 0 }}>{selectedOrder.motoboy_name ? `🛵 ${selectedOrder.motoboy_name}` : 'Sem motoboy registrado'}</p>
              ) : (
                <>
                  <select
                    value={selectedOrder.motoboy_id || ''}
                    onChange={(e) => assignMotoboy(selectedOrder.id, e.target.value)}
                    disabled={savingMotoboy}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid #e0e0e0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: '#fff'
                    }}
                  >
                    <option value="">— Nenhum (fica livre para o motoboy pegar) —</option>
                    {motoboys.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.online ? '🟢' : '⚪'} {m.name} (@{m.username}){m.active_deliveries > 0 ? ` • ${m.active_deliveries} em andamento` : ''}
                      </option>
                    ))}
                  </select>

                  {motoboys.length === 0 && (
                    <small style={{ display: 'block', marginTop: '6px', color: '#888' }}>
                      Nenhum motoboy ativo. Cadastre na aba 🛵 Motoboys.
                    </small>
                  )}

                  {!selectedOrder.motoboy_id && selectedOrder.status !== 'Preparando' && (
                    <small style={{ display: 'block', marginTop: '6px', color: '#888' }}>
                      💡 O pedido só aparece para os motoboys pegarem quando estiver em "Preparando".
                    </small>
                  )}

                  {savingMotoboy && (
                    <small style={{ display: 'block', marginTop: '6px', color: '#666' }}>⏳ Salvando...</small>
                  )}
                </>
              )}
            </div>

            <div className="order-items-section">
              <div className="oie-head">
                <h4>Itens do Pedido:</h4>
                {!editingItems && !['Entregue', 'Cancelado'].includes(selectedOrder.status) && (
                  <button type="button" className="oie-edit-btn" onClick={() => setEditingItems(true)}>✏️ Editar itens</button>
                )}
              </div>
              {editingItems ? (
                <OrderItemsEditor
                  order={{ ...selectedOrder, ...orderDetails }}
                  items={orderDetails.items || []}
                  onCancel={() => setEditingItems(false)}
                  onSaved={(updated) => {
                    const merged = { ...selectedOrder, total: updated.total, discount: updated.discount };
                    setOrders(list => list.map(o => (o.id === updated.id ? { ...o, total: updated.total, discount: updated.discount } : o)));
                    openOrderDetails(merged);
                  }}
                />
              ) : orderDetails.items && orderDetails.items.length > 0 ? (
                <div className="items-list">
                  {orderDetails.items.map((item, index) => (
                    <div key={index} className="item-detail">
                      <span className="product-name">
                        {formatQty(item.quantity, item.unit)} {item.product_name}
                      </span>
                      <span>
                        Preço un: {brl(parseFloat(item.price))}
                        <strong style={{ marginLeft: '20px' }}>
                          Subtotal: {brl((parseFloat(item.price) * item.quantity))}
                        </strong>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Nenhum item encontrado</p>
              )}
            </div>

            <div className="order-total-section">
              {parseFloat(selectedOrder.discount) > 0 && (
                <p>🎟️ Desconto{selectedOrder.coupon_code ? ` (cupom ${selectedOrder.coupon_code})` : ''}: − {brl(parseFloat(selectedOrder.discount))}</p>
              )}
              {parseFloat(selectedOrder.delivery_fee) > 0 && (
                <p>🛵 Taxa de entrega{selectedOrder.delivery_neighborhood ? ` (${selectedOrder.delivery_neighborhood})` : ''}: {brl(parseFloat(selectedOrder.delivery_fee))}</p>
              )}
              <h4>Total do Pedido: {brl(parseFloat(selectedOrder.total))}</h4>
              <p><strong>Status Atual:</strong>
                <span
                  className="status-badge"
                  style={{
                    backgroundColor: getStatusColor(selectedOrder.status),
                    marginLeft: '10px'
                  }}
                >
                  {selectedOrder.status}
                </span>
              </p>
            </div>

            {selectedOrder.status === 'Cancelado' ? (
              <div className="status-buttons">
                <p>❌ Pedido cancelado — os itens já voltaram para o estoque.</p>
              </div>
            ) : (
            <div className="status-buttons">
              <p><strong>Mudar Status:</strong></p>
              <div className="button-group">
                {statuses.map(status => (
                  <button
                    key={status}
                    className={`status-btn ${selectedOrder.status === status ? 'active' : ''}`}
                    style={{
                      backgroundColor: selectedOrder.status === status ? getStatusColor(status) : '#e0e0e0',
                      color: selectedOrder.status === status ? 'white' : '#666'
                    }}
                    onClick={() => (status === 'Preparando' ? startPreparing(selectedOrder) : updateOrderStatus(selectedOrder.id, status))}
                  >
                    {status}
                  </button>
                ))}
              </div>
              {selectedOrder.status !== 'Entregue' && (
                <button
                  className="status-btn"
                  style={{ backgroundColor: '#fee2e2', color: '#b91c1c', marginTop: '10px' }}
                  onClick={() => cancelOrder(selectedOrder)}
                >
                  ❌ Cancelar pedido
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;