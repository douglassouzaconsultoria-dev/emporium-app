import React, { createContext, useState, useEffect } from 'react';
import { API_URL } from './config';

export const AuthContext = createContext();


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

  // Busca os dados mais recentes, valida o login e troca por um novo (o login não vence enquanto o app é usado)
  const renewSession = () => {
    const savedToken = localStorage.getItem('authToken');
    if (!savedToken) return;
    fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${savedToken}` }
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          logout();
          return;
        }
        if (res.ok) {
          const fresh = await res.json();
          saveSession(fresh.token, fresh.user);
        }
      })
      .catch(() => {
        // Sem conexão: mantém os dados salvos
      });
  };

  // Carregar sessão salva ao iniciar
  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('authUser');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));

      renewSession();
    }
    setLoading(false);
    // 🔐 Renova o login de 6 em 6 horas (o painel do admin fica aberto o dia todo imprimindo pedidos)
    const timer = setInterval(renewSession, 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <AuthContext.Provider value={{ user, token, loading, register, login, logout, updateUser, saveSession }}>
      {children}
    </AuthContext.Provider>
  );
}