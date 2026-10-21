import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import { notify } from '../utils/dialog';
import './Admin.css';
import AdminProducts from './AdminProducts';
import AdminOrders from './AdminOrders';
import AdminDashboard from './AdminDashboard';
import AdminCategories from './AdminCategories';
import AdminStockConfig from './AdminStockConfig';
import AdminMedia from './AdminMedia';
import AdminPushButton from './AdminPushButton';
import AdminMotoboys from './AdminMotoboys';
import AdminDeliveryFees from './AdminDeliveryFees';
import AdminCustomers from './AdminCustomers';
import AdminStore from './AdminStore';
import AdminCoupons from './AdminCoupons';
import AdminStorefront from './AdminStorefront';
import AdminSubcategoryBoard from './AdminSubcategoryBoard';
import AdminQuickProduct from './AdminQuickProduct';
import axios from 'axios';
import { getAutoPrint, printOrderById } from '../utils/printOrder';

// Ordem padrão das abas (o admin pode mudar em "Organizar abas")
const DEFAULT_TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'orders', label: '📦 Pedidos' },
  { id: 'quick', label: '➕ Cadastrar produto' },
  { id: 'store', label: '🏪 Loja' },
  { id: 'coupons', label: '🎟️ Cupons' },
  { id: 'motoboys', label: '🛵 Motoboys' },
  { id: 'customers', label: '👥 Clientes' },
  { id: 'fees', label: '🏘️ Taxas de entrega' },
  { id: 'categories', label: '📁 Categorias' },
  { id: 'products', label: '🛍️ Produtos' },
  { id: 'stock', label: '⚙️ Estoque' },
  { id: 'media', label: '🖼️ Imagens' },
  { id: 'tabs', label: '🗂️ Organizar' }
];

// 🧭 Grupos do menu lateral (dentro de cada grupo vale a ordem de "Organizar abas")
const GROUPS = [
  { title: 'Vendas', ids: ['dashboard', 'orders', 'quick', 'customers', 'coupons'] },
  { title: 'Produtos', ids: ['products', 'categories', 'stock', 'tabs'] },
  { title: 'Entregas', ids: ['motoboys', 'fees'] },
  { title: 'Loja', ids: ['store', 'media'] }
];

// Aplica a ordem salva; abas novas (que não estão na lista salva) vão para o fim
// Aba nova (que não está na ordem salva) entra logo depois da aba que vem antes dela na ordem padrão
const sortTabs = (order) => {
  const list = order.map(id => DEFAULT_TABS.find(t => t.id === id)).filter(Boolean);
  DEFAULT_TABS.forEach((tab, i) => {
    if (list.includes(tab)) return;
    const prev = list.indexOf(DEFAULT_TABS[i - 1]);
    list.splice(prev + 1, 0, tab);
  });
  return list;
};

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
  const [organizeSection, setOrganizeSection] = useState('admin'); // 'admin' | 'categories' | 'products'
  const [menuOpen, setMenuOpen] = useState(false); // celular: lista do menu aberta

  // O menu lateral gruda logo abaixo do cabeçalho do site (que também fica fixo no topo)
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    const header = document.querySelector('.header');
    if (!header) return;
    const measure = () => setHeaderH(header.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const openTab = (id) => {
    setActiveTab(id);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };

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
      notify('✅ Ordem das abas salva!');
    } catch (err) {
      notify('❌ Erro ao salvar a ordem das abas', 'error');
    }
  };

  const cancelTabs = () => setTabs(savedTabs);
  const [user, setUser] = useState(null);
  const [newOrders, setNewOrders] = useState(0);
  const knownIds = useRef(null);
  const [problems, setProblems] = useState([]); // 🚫 entregas que o motoboy devolveu
  const knownProblems = useRef(null);

  // 🔔 Confere pedidos novos a cada 20 segundos (em qualquer aba)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/orders`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
        });
        if (!res.ok) return;
        const list = await res.json();
        const ids = list.map(o => o.id);

        // 🚫 Entrega devolvida pelo motoboy: apita e mostra o aviso
        const withProblem = list.filter(o => o.problem && !['Entregue', 'Cancelado'].includes(o.status));
        if (knownProblems.current && withProblem.some(o => !knownProblems.current.has(o.id))) playBeep();
        knownProblems.current = new Set(withProblem.map(o => o.id));
        setProblems(withProblem.map(o => ({ id: o.id, problem: o.problem })));

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
        <div className="admin-push"><AdminPushButton /></div>
      </div>

      {newOrders > 0 && (
        <button className="admin-new-orders" onClick={openNewOrders}>
          🔔 {newOrders} {newOrders === 1 ? 'pedido novo' : 'pedidos novos'} — clique para ver
        </button>
      )}

      {problems.length > 0 && (
        <button className="admin-new-orders admin-problem-orders" onClick={() => setActiveTab('orders')}>
          ⚠️ {problems.length === 1
            ? `Pedido #${problems[0].id} voltou: ${problems[0].problem}`
            : `${problems.length} entregas voltaram com problema`} — clique para ver
        </button>
      )}

      <div className="admin-body" style={{ '--admin-top': `${headerH}px` }}>
      {/* 🧭 MENU: coluna à esquerda no computador; botão ☰ no celular */}
      <div className="admin-menu-bar">
        <button type="button" className="admin-menu-toggle" onClick={() => setMenuOpen(o => !o)}>
          ☰ {['orders', 'quick'].includes(activeTab) ? 'Menu' : tabs.find(t => t.id === activeTab)?.label}
        </button>
        {/* Atalhos: Pedidos e Cadastrar produto sempre a um toque */}
        <button type="button" className={`admin-menu-quick ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => openTab('orders')}>
          📦 Pedidos{newOrders > 0 && <span className="admin-menu-badge">{newOrders}</span>}
        </button>
        <button type="button" className={`admin-menu-quick ${activeTab === 'quick' ? 'active' : ''}`} onClick={() => openTab('quick')}>
          ➕ Cadastrar
        </button>
      </div>
      {menuOpen && <div className="admin-menu-backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`admin-menu ${menuOpen ? 'open' : ''}`}>
        {GROUPS.map(g => (
          <div key={g.title} className="admin-menu-group">
            <span className="admin-menu-title">{g.title}</span>
            {tabs.filter(t => g.ids.includes(t.id)).map(tab => (
              <button
                key={tab.id}
                className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => openTab(tab.id)}
              >
                {tab.label}
                {tab.id === 'orders' && newOrders > 0 && <span className="admin-menu-badge">{newOrders}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* CONTEÚDO DAS ABAS */}
      <div className="admin-content">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'orders' && <AdminOrders />}
        {activeTab === 'quick' && <AdminQuickProduct />}
        {activeTab === 'store' && <AdminStore />}
        {activeTab === 'coupons' && <AdminCoupons />}
        {activeTab === 'motoboys' && <AdminMotoboys />}
        {activeTab === 'customers' && <AdminCustomers />}
        {activeTab === 'fees' && <AdminDeliveryFees />}
        {activeTab === 'categories' && <AdminCategories />}
        {activeTab === 'products' && <AdminProducts />}
        {activeTab === 'stock' && <AdminStockConfig />}
        {activeTab === 'media' && <AdminMedia />}
        {/* 🗂️ Organizar abas: setas mudam a posição; a 1ª abre ao entrar no painel */}
        {activeTab === 'tabs' && (
          <div className="sf-switch">
            <button className={organizeSection === 'admin' ? 'active' : ''} onClick={() => setOrganizeSection('admin')}>🔧 Abas do painel</button>
            <button className={organizeSection === 'categories' ? 'active' : ''} onClick={() => setOrganizeSection('categories')}>📁 Vitrine: categorias</button>
            <button className={organizeSection === 'products' ? 'active' : ''} onClick={() => setOrganizeSection('products')}>🛍️ Vitrine: produtos</button>
            <button className={organizeSection === 'subcats' ? 'active' : ''} onClick={() => setOrganizeSection('subcats')}>🏷️ Vitrine: subcategorias</button>
          </div>
        )}
        {activeTab === 'tabs' && (organizeSection === 'categories' || organizeSection === 'products') && <AdminStorefront section={organizeSection} />}
        {activeTab === 'tabs' && organizeSection === 'subcats' && <AdminSubcategoryBoard />}
        {activeTab === 'tabs' && organizeSection === 'admin' && (
          <div className="admin-tabs-editor">
            <div className="ate-head">
              <strong>🔧 Abas do painel</strong>
              <span>Use as setas para mudar a posição. A <b>1ª aba</b> é a que abre quando você entra no painel. O menu já mostra como vai ficar (cada aba continua no seu grupo).</span>
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
    </div>
  );
}

export default Admin;