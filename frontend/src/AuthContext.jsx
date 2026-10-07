import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

   const API_URL = 'https://emporium-backend-7w10.onrender.com/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const saveSession = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUser', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  // 🔄 Atualiza os dados do usuário (e o token, se vier um novo)
  const updateUser = (newUser, newToken) => {
    setUser(newUser);
    localStorage.setItem('authUser', JSON.stringify(newUser));
    if (newToken) {
      setToken(newToken);
      localStorage.setItem('authToken', newToken);
    }
  };

  // Carregar sessão salva ao iniciar
  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('authUser');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));

      // Busca os dados mais recentes e valida o login
      fetch(`${API_URL}/auth/profile`, {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      })
        .then(async (res) => {
          if (res.status === 401 || res.status === 403) {
            logout();
            return;
          }
          if (res.ok) {
            const freshUser = await res.json();
            setUser(freshUser);
            localStorage.setItem('authUser', JSON.stringify(freshUser));
          }
        })
        .catch(() => {
          // Sem conexão: mantém os dados salvos
        });
    }
    setLoading(false);
  }, []);

  // 📝 Cadastro: recebe um objeto com os dados do formulário
  const register = async (formData) => {
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      saveSession(data.token, data.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // 🔑 Login: aceita usuário OU e-mail
  const login = async (identifier, password) => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: identifier, password })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      saveSession(data.token, data.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, register, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}