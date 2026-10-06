import React, { useContext } from 'react';
import { AuthContext, AuthProvider } from './AuthContext';
import axios from 'axios';
import './App.css';
import Auth from './components/Auth';
import ProductList from './components/ProductList';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
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

  const API_URL = 'http://localhost:3001/api';

  React.useEffect(() => {
    if (token && user && user.role !== 'motoboy') {
      fetchCategories();
    }
  }, [token]);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/categories`);
      setCategories(response.data);
      if (response.data.length > 0) {
        setSelectedCategory(response.data[0].id);
        fetchProducts(response.data[0].id);
      }
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
    }
  };

  const fetchProducts = async (categoryId) => {
    try {
      const response = await axios.get(`${API_URL}/products`);
      const filtered = response.data.filter(p => p.category_id === categoryId);
      setProducts(filtered);
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
    }
  };

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    fetchProducts(categoryId);
  };

  const handleSearch = (term) => {
    setSearchTerm(term);
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
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
        item.id === productId ? { ...item, quantity } : item
      ));
    }
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + (parseFloat(item.price) * item.quantity), 0);
  };

  const handleCheckoutSuccess = () => {
    setCart([]);
    setShowCheckout(false);
    setView('store');
    alert('Pedido realizado com sucesso!');
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
      <header className="header">
        <div className="header-left" onClick={() => setView('store')} style={{ cursor: 'pointer' }}>
          <h1>🛒 EMPÓRIO BRUMADO</h1>
          <p>Delivery de Supermercado</p>
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
          <MyOrders user={user} />
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

            <div className="categories">
              <h2>Categorias</h2>
              <div className="category-list">
                {categories.map(category => (
                  <button
                    key={category.id}
                    className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                    onClick={() => handleCategoryChange(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <ProductList products={filteredProducts} onAddToCart={addToCart} />
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