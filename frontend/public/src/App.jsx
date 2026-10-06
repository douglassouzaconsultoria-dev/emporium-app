import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import ProductList from './components/ProductList';
import Cart from './components/Cart';

function App() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);

  const API_URL = 'http://localhost:3001/api';

  useEffect(() => {
    fetchCategories();
  }, []);

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

  return (
    <div className="app">
      <header className="header">
        <h1>🛒 EMPÓRIO BRUMADO</h1>
        <p>Delivery de Supermercado</p>
        <button className="cart-button" onClick={() => setShowCart(!showCart)}>
          🛒 Carrinho ({cart.length})
        </button>
      </header>

      <div className="container">
        {!showCart ? (
          <>
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

            <ProductList products={products} onAddToCart={addToCart} />
          </>
        ) : (
          <Cart
            cart={cart}
            onRemove={removeFromCart}
            onUpdateQuantity={updateQuantity}
          />
        )}
      </div>
    </div>
  );
}

export default App;