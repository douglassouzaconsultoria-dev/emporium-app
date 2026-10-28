import React, { useContext } from 'react';
import { API_URL } from './config';
import { AuthContext, AuthProvider } from './AuthContext';
import axios from 'axios';
import './App.css';
import Auth from './components/Auth';
import ProductList, { ProductSkeleton } from './components/ProductList';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import { roundQty, lineTotal, isPromo } from './utils/units';
import { sortCategories, sortProducts, subcategoryOrder } from './utils/storefront';
import SearchBar from './components/SearchBar';
import Admin from './components/Admin';
import MyOrders from './components/MyOrders';
import { matchesSearch } from './utils/search';
import CustomerPush from './components/CustomerPush';
import OfflineBanner, { useOnline } from './components/OfflineBanner';
import Profile from './components/Profile';
import MotoboyPanel from './components/MotoboyPanel';
import InstallBanner from './components/InstallBanner';
import DialogHost from './components/DialogHost';
import BannerCarousel from './components/BannerCarousel';
import { brl } from './utils/format';

function AppContent() {
  const { user, token, loading, logout } = useContext(AuthContext);
  const [categories, setCategories] = React.useState([]);
  const [products, setProducts] = React.useState([]);
  const [productsLoaded, setProductsLoaded] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState(null);
  // Carrinho fica salvo no aparelho: recarregar a página não perde os itens
  const [cart, setCart] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cart')) || [];
    } catch {
      return [];
    }
  });
  const [store, setStore] = React.useState(null);
  const [toast, setToast] = React.useState('');
  const toastTimer = React.useRef(null);
  const [showCheckout, setShowCheckout] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  // Toque na notificação do pedido abre direto "Meus Pedidos" (/?ver=pedidos)
  const [view, setView] = React.useState(() => (new URLSearchParams(window.location.search).get('ver') === 'pedidos' ? 'orders' : 'store'));
  const [askPush, setAskPush] = React.useState(false); // 🔔 oferece os avisos logo depois do pedido
  const online = useOnline(); // 📶 sem internet: dá para olhar e montar o carrinho, mas não finalizar

  React.useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
    // App já aberto: o service worker manda a mensagem em vez de abrir outra janela
    const onMessage = (e) => { if (String(e.data?.url || '').includes('ver=pedidos')) setView('orders'); };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);
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

  React.useEffect(() => {
    try {
      localStorage.setItem('cart', JSON.stringify(cart));
    } catch {
      // sem armazenamento: o carrinho só vale até recarregar
    }
  }, [cart]);

  // 🏪 Horário, pedido mínimo e aviso da loja (confere de novo a cada minuto)
  React.useEffect(() => {
    if (!token || !user || user.role === 'motoboy') return;
    const load = () => axios.get(`${API_URL}/settings/store`)
      .then(res => setStore(res.data))
      .catch(err => console.error('Erro ao buscar dados da loja:', err));
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [token, user]);

  // ❤️ Favoritos (ficam na conta do cliente; uma cópia no aparelho para abrir sem internet)
  const [favorites, setFavorites] = React.useState([]);
  const favKey = user ? `favoritos-${user.id}` : null;
  const keepFavorites = (list) => {
    try { localStorage.setItem(favKey, JSON.stringify(list)); } catch { /* sem espaço: só não guarda */ }
  };
  React.useEffect(() => {
    if (!token || !user || user.role === 'motoboy') return;
    axios.get(`${API_URL}/favorites`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { setFavorites(res.data); keepFavorites(res.data); })
      .catch(() => {
        try { setFavorites(JSON.parse(localStorage.getItem(favKey)) || []); } catch { setFavorites([]); }
      });
  }, [token, user, favKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const favoriteSet = new Set(favorites);

  const toggleFavorite = (product) => {
    const on = !favoriteSet.has(product.id);
    setFavorites(list => (on ? [product.id, ...list] : list.filter(id => id !== product.id)));
    showToast(on ? `❤️ ${product.name} nos favoritos` : `${product.name} saiu dos favoritos`);
    axios({ method: on ? 'put' : 'delete', url: `${API_URL}/favorites/${product.id}`, headers: { Authorization: `Bearer ${token}` } })
      .then(() => keepFavorites(on ? [product.id, ...favorites] : favorites.filter(id => id !== product.id)))
      .catch(() => {
        // Não salvou: volta como estava
        setFavorites(list => (on ? list.filter(id => id !== product.id) : [product.id, ...list]));
        showToast('❌ Não consegui salvar o favorito. Tente de novo.', 3000);
      });
  };

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
      setProductsLoaded(true);
      // Atualiza preço/oferta do carrinho salvo e tira o que saiu da loja
      setCart(current => current
        .map(item => {
          const fresh = response.data.find(p => p.id === item.id);
          return fresh ? { ...fresh, quantity: item.quantity } : null;
        })
        .filter(Boolean));
    } catch (error) {
      setProductsLoaded(true);
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

  // 🖼️ Toque no banner: abre a categoria ou mostra o produto
  const openBanner = (banner) => {
    if (banner.link_type === 'category') {
      handleCategoryChange(banner.link_id);
      return;
    }
    const product = products.find(p => p.id === banner.link_id);
    if (!product) return;
    handleCategoryChange(product.category_id);
    setTimeout(() => {
      const card = document.querySelector(`[data-product-id="${product.id}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      card.classList.add('bnr-flash');
      setTimeout(() => card.classList.remove('bnr-flash'), 2000);
    }, 600);
  };

  const handleSearch = (term) => {
    setSearchTerm(term);
  };

  // 🔎 Sem acento, maiúscula ou plural; acha também pela categoria, subcategoria e código de barras
  const categoryName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const filteredProducts = products.filter(product => matchesSearch(
    searchTerm, product.name, product.description, product.subcategory, categoryName[product.category_id], product.barcode
  ));

  // Vitrine: ❤️ Favoritos e 🔥 Ofertas primeiro, depois uma seção por categoria (só as que têm produto)
  const hiddenCategories = new Set(categories.filter(c => c.active === false).map(c => c.id));
  const favoriteItems = favorites
    .map(id => filteredProducts.find(p => p.id === id))
    .filter(p => p && !hiddenCategories.has(p.category_id));
  const offers = sortProducts(
    filteredProducts.filter(p => isPromo(p) && p.estoque > 0 && !hiddenCategories.has(p.category_id)),
    'bestsellers'
  );
  const sections = [
    ...(favoriteItems.length ? [{ id: 'favoritos', name: '❤️ Seus favoritos', items: favoriteItems }] : []),
    ...(offers.length ? [{ id: 'ofertas', name: '🔥 Ofertas', items: offers }] : []),
    // Categorias na ordem escolhida no admin (🗂️ Organizar); ocultas não aparecem
    ...sortCategories(categories.filter(c => c.active !== false), store?.category_sort)
      .map(category => ({
        ...category,
        items: sortProducts(filteredProducts.filter(p => p.category_id === category.id), category.product_sort)
      }))
      .filter(section => section.items.length > 0)
  ];

  const inCart = Object.fromEntries(cart.map(item => [item.id, item.quantity]));

  // ⭐ Mais vendidos (últimos 30 dias): selo no card e sugestões no carrinho vazio
  const bestSellers = [...products]
    .filter(p => p.sold >= 2 && p.estoque > 0 && !hiddenCategories.has(p.category_id))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 8);
  const best = new Set(bestSellers.slice(0, 5).map(p => p.id));
  const adultCats = new Set(categories.filter(c => c.adult).map(c => c.id)); // 🔞 venda proibida p/ menores

  // Aviso que aparece embaixo e some sozinho (no lugar da janelinha do navegador)
  const showToast = (text, ms = 1800) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), ms);
  };

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
    showToast(`✓ ${product.name} no carrinho`);
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

  const storeOpen = !store || store.status.open;
  const minOrder = store ? store.min_order : 0;
  const cartTotal = calculateTotal();
  const missingForMin = Math.max(0, Math.round((minOrder - cartTotal) * 100) / 100);
  const cartCount = cart.length;

  // ✅ Finalizar direto da vitrine (sem precisar abrir o carrinho)
  const startCheckout = () => {
    if (!online) {
      showToast('📶 Sem internet. Seu carrinho está guardado: finalize quando a conexão voltar.', 4000);
      return;
    }
    if (!storeOpen) {
      showToast(`🔒 ${store.status.message || 'A loja está fechada no momento.'}`, 4000);
      return;
    }
    if (missingForMin > 0) {
      showToast(`O pedido mínimo é ${brl(minOrder)}. Faltam ${brl(missingForMin)}.`, 4000);
      return;
    }
    setShowCheckout(true);
  };

  const handleCheckoutSuccess = () => {
    setCart([]);
    setShowCheckout(false);
    setView('store');
    showToast('✅ Pedido realizado com sucesso!', 3500);
    setAskPush(true);
  };

  // 🔁 Pedir de novo: coloca no carrinho os itens de um pedido antigo
  const reorder = (items) => {
    let newCart = [...cart];
    const missing = [];
    items.forEach(item => {
      const product = products.find(p => p.id === item.product_id);
      if (!product || product.estoque <= 0 || product.available_now === false) { // 🗓️ fora do horário programado também fica de fora
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
      showToast(`Indisponível agora: ${missing.join(', ')}`, 5000);
    }
  };

  const toggleView = (target) => {
    setView(current => (current === target ? 'store' : target));
  };

  // 📱 Barra de baixo: troca de tela e volta ao topo
  const goTo = (target) => {
    setView(target);
    window.scrollTo(0, 0);
  };

  // 🔍 Buscar: volta para a loja e já abre o teclado na busca
  const goSearch = () => {
    goTo('store');
    setTimeout(() => document.querySelector('.search-input')?.focus(), 50);
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
            🛒 Carrinho{cartCount > 0 && <span className="cart-count">{cartCount}</span>}
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

      {store && (!storeOpen || store.notice) && view !== 'admin' && (
        <div className={`store-banner ${storeOpen ? 'info' : 'closed'}`}>
          {!storeOpen && <strong>🔒 {store.status.message}</strong>}
          {!storeOpen && store.notice && ' — '}
          {store.notice && <span>📢 {store.notice}</span>}
        </div>
      )}

      <div className={`container has-bottom-nav ${cartCount > 0 && (view === 'store' || view === 'cart') ? 'has-cart-bar' : ''}`}>
        {view === 'admin' && isUserAdmin ? (
          <Admin />
        ) : view === 'orders' ? (
          <MyOrders user={user} onReorder={reorder} />
        ) : view === 'profile' ? (
          <Profile onClose={() => setView('store')} onLogout={handleLogout} />
        ) : view === 'cart' ? (
          <Cart
            cart={cart}
            onRemove={removeFromCart}
            onUpdateQuantity={updateQuantity}
            onCheckout={startCheckout}
            onBack={() => setView('store')}
            suggestions={bestSellers.length ? bestSellers : products.filter(p => isPromo(p) && p.estoque > 0).slice(0, 8)}
            onAddToCart={addToCart}
            inCart={inCart}
          />
        ) : (
          <>
            <SearchBar onSearch={handleSearch} />
            {!searchTerm && <BannerCarousel onOpen={openBanner} />}

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

            {!productsLoaded ? (
              <ProductSkeleton />
            ) : sections.length === 0 ? (
              <p className="empty-store">Nenhum produto encontrado.</p>
            ) : (
              sections.map(section => (
                <section
                  key={section.id}
                  id={`cat-${section.id}`}
                  className="cat-section"
                  style={{ scrollMarginTop: headerHeight + 70 }}
                >
                  <ProductList title={section.name} adult={section.adult === true} adultCats={adultCats} products={section.items} onAddToCart={addToCart} onUpdateQuantity={updateQuantity} inCart={inCart} best={best} row subcats={!['ofertas', 'favoritos'].includes(section.id)} subOrder={!['ofertas', 'favoritos'].includes(section.id) ? subcategoryOrder(section, section.items) : null} favorites={favoriteSet} onToggleFavorite={toggleFavorite} />
                </section>
              ))
            )}
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
      <OfflineBanner text="Seu carrinho está guardado e dá para olhar os produtos. Para finalizar o pedido, espere a internet voltar." />
      {askPush && <CustomerPush variant="sheet" onClose={() => setAskPush(false)} />}

      {/* 🛒 Barra fixa: total e "Finalizar" sempre à mão */}
      {cartCount > 0 && (view === 'store' || view === 'cart') && !showCheckout && (
        <div className="cart-bar">
          <button className="cart-bar-info" onClick={() => setView(view === 'cart' ? 'store' : 'cart')}>
            <span className="cart-bar-count">{cartCount}</span>
            <span className="cart-bar-text">
              <strong>{brl(cartTotal)}</strong>
              <small>
                {!online
                  ? 'Sem internet: carrinho guardado'
                  : !storeOpen
                  ? 'Loja fechada agora'
                  : missingForMin > 0
                    ? `Faltam ${brl(missingForMin)} p/ o mínimo`
                    : view === 'cart' ? 'Voltar às compras' : 'Ver carrinho'}
              </small>
            </span>
          </button>
          <button className="cart-bar-go" onClick={startCheckout} disabled={!online || !storeOpen || missingForMin > 0}>
            Finalizar pedido →
          </button>
          {minOrder > 0 && missingForMin > 0 && (
            <div className="cart-bar-progress" style={{ width: `${Math.min(100, (cartTotal / minOrder) * 100)}%` }} />
          )}
        </div>
      )}

      {/* 📱 Navegação de baixo (só no celular) */}
      <nav className="bottom-nav">
        <button className={view === 'store' ? 'active' : ''} onClick={() => goTo('store')}>
          <span>🏠</span>Início
        </button>
        <button onClick={goSearch}>
          <span>🔍</span>Buscar
        </button>
        <button className={view === 'cart' ? 'active' : ''} onClick={() => goTo('cart')}>
          <span>🛒{cartCount > 0 && <b className="bottom-nav-badge">{cartCount}</b>}</span>Carrinho
        </button>
        <button className={view === 'orders' ? 'active' : ''} onClick={() => goTo('orders')}>
          <span>📦</span>Pedidos
        </button>
        <button className={view === 'profile' ? 'active' : ''} onClick={() => goTo('profile')}>
          <span>👤</span>Perfil
        </button>
        {isUserAdmin && (
          <button className={view === 'admin' ? 'active' : ''} onClick={() => goTo('admin')}>
            <span>🔧</span>Admin
          </button>
        )}
      </nav>

      {showCheckout && (
        <Checkout
          cart={cart}
          total={cartTotal}
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
      <InstallBanner />
      <DialogHost />
      <AppContent />
    </AuthProvider>
  );
}

export default App;