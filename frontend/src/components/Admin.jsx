import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import './Admin.css';
import AdminProducts from './AdminProducts';
import AdminOrders from './AdminOrders';
import AdminDashboard from './AdminDashboard';
import AdminCategories from './AdminCategories';
import AdminStockConfig from './AdminStockConfig';
import AdminMotoboys from './AdminMotoboys';
import AdminDeliveryFees from './AdminDeliveryFees';
import AdminCustomers from './AdminCustomers';
import AdminStore from './AdminStore';
import AdminCoupons from './AdminCoupons';
import axios from 'axios';
import { getAutoPrint, printOrderById } from '../utils/printOrder';

// Ordem padrão das abas (o admin pode mudar em "Organizar abas")
const DEFAULT_TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'orders', label: '📦 Pedidos' },
  { id: 'store', label: '🏪 Loja' },
  { id: 'coupons', label: '🎟️ Cupons' },
  { id: 'motoboys', label: '🛵 Motoboys' },
  { id: 'customers', label: '👥 Clientes' },
  { id: 'fees', label: '🏘️ Taxas de entrega' },
  { id: 'categories', label: '📁 Categorias' },
  { id: 'products', label: '🛍️ Produtos' },
  { id: 'stock', label: '⚙️ Estoque' },
  { id: 'tabs', label: '🗂️ Organizar abas' }
];

// Aplica a ordem salva; abas novas (que não estão na lista salva) vão para o fim
const sortTabs = (order) => [
  ...order.map(id => DEFAULT_TABS.find(t => t.id === id)).filter(Boolean),
  ...DEFAULT_TABS.filter(t => !order.includes(t.id))
];

// 🔔 Dois bipes curtos (não precisa de arquivo de som)
const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.3].forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.15);
    });
  } catch (err) {
    console.error('Sem som:', err);
  }
};

function Admin() {
  const [activeTab, setActiveTab] = useState(null);
  const [tabs, setTabs] = useState(DEFAULT_TABS);
  const [savedTabs, setSavedTabs] = useState(DEFAULT_TABS);

  // 🗂️ Ordem das abas salva no servidor; a primeira é a que abre ao entrar
  useEffect(() => {
    axios.get(`${API_URL}/settings/admin-tabs`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })
      .then(res => {
        const sorted = sortTabs(res.data.order || []);
        setTabs(sorted);
        setSavedTabs(sorted);
        setActiveTab(current => current || sorted[0].id);
      })
      .catch(err => {
        console.error('Erro ao buscar ordem das abas:', err);
        setActiveTab(current => current || DEFAULT_TABS[0].id);
      });
  }, []);

  const moveTab = (index, step) => {
    const target = index + step;
    if (target < 0 || target >= tabs.length) return;
    const next = [...tabs];
    [next[index], next[target]] = [next[target], next[index]];
    setTabs(next);
  };

  const saveTabs = async () => {
    try {
      await axios.put(`${API_URL}/settings/admin-tabs`, { order: tabs.map(t => t.id) }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      setSavedTabs(tabs);
      alert('✅ Ordem das abas salva!');
    } catch (err) {
      alert('Erro ao salvar a ordem das abas');
    }
  };

  const cancelTabs = () => setTabs(savedTabs);
  const [user, setUser] = useState(null);
  const [newOrders, setNewOrders] = useState(0);
  const knownIds = useRef(null);

  // 🔔 Confere pedidos novos a cada 20 segundos (em qualquer aba)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/orders`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
        });
        if (!res.ok) return;
        const ids = (await res.json()).map(o => o.id);
        if (knownIds.current) {
          const fresh = ids.filter(id => !knownIds.current.has(id));
          knownIds.current = new Set(ids); // antes de imprimir: nunca imprime o mesmo pedido duas vezes
          if (fresh.length > 0) {
            playBeep();
            setNewOrders(n => n + fresh.length);
            // 🖨️ Impressão automática (ligada na aba Loja, vale só neste computador)
            if (getAutoPrint()) {
              for (const id of [...fresh].sort((a, b) => a - b)) {
                await printOrderById(id).catch(err => console.error('Erro ao imprimir:', err));
              }
            }
          }
        }
        knownIds.current = new Set(ids);
      } catch (err) {
        console.error('Erro ao checar pedidos:', err);
      }
    };
    check();
    const timer = setInterval(check, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = newOrders > 0 ? `(${newOrders}) Novo pedido! - Empório` : 'EMPÓRIO BRUMADO - Delivery De Supermercado';
  }, [newOrders]);

  const openNewOrders = () => {
    setNewOrders(0);
    setActiveTab('orders');
  };

  useEffect(() => {
    // Verificar se é admin
    const token = localStorage.getItem('authToken');
    if (!token) {
      window.location.href = '/';
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      setUser(payload);
    } catch (error) {
      window.location.href = '/';
    }
  }, []);

  if (!user) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="admin-panel">
      <div className="admin-header-top">
        <h1>🔧 Painel de Administração</h1>
        <p className="admin-welcome">Bem-vindo, {user.username || user.email} (Admin)</p>
      </div>

      {newOrders > 0 && (
        <button className="admin-new-orders" onClick={openNewOrders}>
          🔔 {newOrders} {newOrders === 1 ? 'pedido novo' : 'pedidos novos'} — clique para ver
        </button>
      )}

      {/* MENU DE ABAS */}
      <div className="admin-tabs-container">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTEÚDO DAS ABAS */}
      <div className="admin-content">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'orders' && <AdminOrders />}
        {activeTab === 'store' && <AdminStore />}
        {activeTab === 'coupons' && <AdminCoupons />}
        {activeTab === 'motoboys' && <AdminMotoboys />}
        {activeTab === 'customers' && <AdminCustomers />}
        {activeTab === 'fees' && <AdminDeliveryFees />}
        {activeTab === 'categories' && <AdminCategories />}
        {activeTab === 'products' && <AdminProducts />}
        {activeTab === 'stock' && <AdminStockConfig />}
        {/* 🗂️ Organizar abas: setas mudam a posição; a 1ª abre ao entrar no painel */}
        {activeTab === 'tabs' && (
          <div className="admin-tabs-editor">
            <div className="ate-head">
              <strong>🗂️ Organizar abas</strong>
              <span>Use as setas para mudar a posição. A <b>1ª aba</b> é a que abre quando você entra no painel. A barra de cima já mostra como vai ficar.</span>
            </div>
            <ol className="ate-list">
              {tabs.map((tab, i) => (
                <li key={tab.id}>
                  <span className="ate-pos">{i + 1}º</span>
                  <span className="ate-label">{tab.label}</span>
                  <button onClick={() => moveTab(i, -1)} disabled={i === 0} title="Subir">▲</button>
                  <button onClick={() => moveTab(i, 1)} disabled={i === tabs.length - 1} title="Descer">▼</button>
                </li>
              ))}
            </ol>
            <div className="ate-actions">
              <button className="ate-reset" onClick={() => setTabs(DEFAULT_TABS)}>↺ Ordem original</button>
              <button className="ate-cancel" onClick={cancelTabs}>Desfazer</button>
              <button className="ate-save" onClick={saveTabs}>💾 Salvar ordem</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Admin;