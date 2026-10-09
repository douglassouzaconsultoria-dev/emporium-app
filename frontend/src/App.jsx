import React, { useContext } from 'react';
import { API_URL } from './config';
import { AuthContext, AuthProvider } from './AuthContext';
import axios from 'axios';
import './App.css';
import Auth from './components/Auth';
import ProductList from './components/ProductList';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import { roundQty, lineTotal } from './utils/units';
import SearchBar from './components/SearchBar';
import Admin from './components/Admin';
import MyOrders from './components/MyOrders';
import Profile from './components/Profile';
import MotoboyPanel from './components/MotoboyPanel';

function AppContent() {
  const { user, token, loading, logout } = useContext(AuthContext);
  const [categories, setCategories] = React.useState([]);
  const [products, setProducts] = React.useState([]);
  const [selectedCategory, setSelectedCategory] = React.useState(null);
  const [cart, setCart] = React.useState([]);
  const [showCheckout, setShowCheckout] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [view, setView] = React.useState('store');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const headerRef = React.useRef(null);
  const [headerHeight, setHeaderHeight] = React.useState(0);

  // Altura do cabeçalho fixo: a barra de categorias gruda logo abaixo dele
  React.useEffect(() => {
    if (!headerRef.current) return;
    const measure = () => setHeaderHeight(headerRef.current ? headerRef.current.offsetHeight : 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [user]);


  React.useEffect(() => {
    if (token && user && user.role !== 'motoboy') {
      fetchCategories();
    }
  }, [token]);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/categories`);
      setCategories(response.data);
      fetchProducts();
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API_URL}/products`);
      setProducts(response.data);
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
    }
  };

  // Leva até a fileira da categoria
  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    setMenuOpen(false);
    const el = document.getElementById(`cat-${categoryId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const chip = document.querySelector(`[data-cat="${categoryId}"]`);
    if (chip) {
      const bar = chip.parentElement;
      bar.scrollTo({ left: chip.offsetLeft - bar.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
    }
  };

  const handleSearch = (term) => {
    setSearchTerm(term);
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Vitrine: uma seção por categoria (só as que têm produto)
  const sections = categories
    .map(category => ({ ...category, items: filteredProducts.filter(p => p.category_id === category.id) }))
    .filter(section => section.items.length > 0);

  // qty: 1 para unidade; em kg para produto por peso (ex: 0.25 = 250 g)
  const addToCart = (product, qty = 1) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: roundQty(item.quantity + qty) }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: qty }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(cart.map(item =>
        item.id === productId ? { ...item, quantity: roundQty(quantity) } : item
      ));
    }
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + lineTotal(item), 0);
  };

  const handleCheckoutSuccess = () => {
    setCart([]);
    setShowCheckout(false);
    setView('store');
    alert('Pedido realizado com sucesso!');
  };

  // 🔁 Pedir de novo: coloca no carrinho os itens de um pedido antigo
  const reorder = (items) => {
    let newCart = [...cart];
    const missing = [];
    items.forEach(item => {
      const product = products.find(p => p.id === item.product_id);
      if (!product || product.estoque <= 0) {
        missing.push(item.product_name);
        return;
      }
      const qty = Math.min(parseFloat(item.quantity), product.estoque);
      const existing = newCart.find(c => c.id === product.id);
      newCart = existing
        ? newCart.map(c => c.id === product.id ? { ...c, quantity: roundQty(Math.min(c.quantity + qty, product.estoque)) } : c)
        : [...newCart, { ...product, quantity: qty }];
    });
    setCart(newCart);
    setView('cart');
    if (missing.length) {
      alert(`Estes itens não estão disponíveis agora: ${missing.join(', ')}`);
    }
  };

  const toggleView = (target) => {
    setView(current => (current === target ? 'store' : target));
  };

  const isUserAdmin = user && user.role === 'admin';

  const handleAdminClick = () => {
    if (!isUserAdmin) {
      alert('❌ Acesso negado! Apenas administradores podem acessar esta área.');
      return;
    }
    toggleView('admin');
  };

  const handleLogout = () => {
    logout();
    setCart([]);
    setView('store');
  };

  if (loading) {
    return <div className="loading">Carregando...</div>;
  }

  if (!token || !user) {
    return <Auth />;
  }

  if (user.role === 'motoboy') {
    return <MotoboyPanel onLogout={handleLogout} />;
  }

  const firstName = (user.name || 'Cliente').trim().split(' ')[0];
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <div className="app">
      <header className="header" ref={headerRef}>
        <div className="header-left" onClick={() => setView('store')} style={{ cursor: 'pointer' }}>
          <img src="/logo-eb-branco.svg" alt="" className="brand-seal" />
          <div>
            <h1>EMPÓRIO BRUMADO</h1>
            <p>Delivery de Supermercado</p>
          </div>
        </div>
        <div className="header-right">
          <button
            className={`user-chip ${view === 'profile' ? 'active' : ''}`}
            onClick={() => toggleView('profile')}
            title="Meu Perfil"
          >
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={firstName} className="user-chip-avatar" />
            ) : (
              <span className="user-chip-initial">{initial}</span>
            )}
            <span className="user-chip-name">{firstName}</span>
          </button>

          <button className="cart-button" onClick={() => toggleView('cart')}>
            🛒 Carrinho ({cart.length})
          </button>

          <button className="my-orders-button" onClick={() => toggleView('orders')}>
            📦 Meus Pedidos
          </button>

          {isUserAdmin && (
            <button
              className="admin-button"
              onClick={handleAdminClick}
              title="Painel de Administração"
            >
              🔧 Admin
            </button>
          )}

          <button className="logout-btn" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>

      <div className="container">
        {view === 'admin' && isUserAdmin ? (
          <Admin />
        ) : view === 'orders' ? (
          <MyOrders user={user} onReorder={reorder} />
        ) : view === 'profile' ? (
          <Profile onClose={() => setView('store')} />
        ) : view === 'cart' ? (
          <Cart
            cart={cart}
            onRemove={removeFromCart}
            onUpdateQuantity={updateQuantity}
            onCheckout={() => setShowCheckout(true)}
          />
        ) : (
          <>
            <SearchBar onSearch={handleSearch} />

            <div className="cat-bar" style={{ top: headerHeight }}>
              <button className="cat-menu-btn" onClick={() => setMenuOpen(open => !open)}>
                ☰ Categorias
              </button>
              <div className="cat-chips">
                {sections.map(section => (
                  <button
                    key={section.id}
                    data-cat={section.id}
                    className={`category-btn ${selectedCategory === section.id ? 'active' : ''}`}
                    onClick={() => handleCategoryChange(section.id)}
                  >
                    {section.name}
                  </button>
                ))}
              </div>
              {menuOpen && (
                <div className="cat-menu">
                  {sections.map(section => (
                    <button key={section.id} onClick={() => handleCategoryChange(section.id)}>
                      <span>{section.name}</span>
                      <small>{section.items.length}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {sections.length === 0 ? (
              <p className="empty-store">Nenhum produto encontrado.</p>
            ) : (
              sections.map(section => (
                <section
                  key={section.id}
                  id={`cat-${section.id}`}
                  className="cat-section"
                  style={{ scrollMarginTop: headerHeight + 70 }}
                >
                  <ProductList title={section.name} products={section.items} onAddToCart={addToCart} row />
                </section>
              ))
            )}
          </>
        )}
      </div>

      {showCheckout && (
        <Checkout
          cart={cart}
          total={calculateTotal()}
          onClose={() => setShowCheckout(false)}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;