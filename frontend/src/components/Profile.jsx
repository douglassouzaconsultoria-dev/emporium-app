import React, { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../AuthContext';
import './Profile.css';

const API_URL = 'http://localhost:3001/api';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const sanitizeUsername = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20);

function Profile({ onClose }) {
  const { user, token, updateUser } = useContext(AuthContext);

  const [form, setForm] = useState({
    name: user?.name || '',
    username: user?.username || '',
    email: user?.email || '',
    phone_number: user?.phone_number || '',
    address: user?.address || '',
    neighborhood: user?.neighborhood || ''
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState({ type: '', text: '' });

  const fileInputRef = useRef(null);

  // Carrega os dados mais recentes do servidor
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch(`${API_URL}/auth/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        setForm({
          name: data.name || '',
          username: data.username || '',
          email: data.email || '',
          phone_number: data.phone_number || '',
          address: data.address || '',
          neighborhood: data.neighborhood || ''
        });
        updateUser(data);
      } catch (err) {
        console.error('Erro ao carregar perfil:', err);
      }
    };
    loadProfile();
  }, []);

  // Prévia da nova foto
  useEffect(() => {
    if (!avatarFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const showMsg = (setter, type, text) => {
    setter({ type, text });
    if (type === 'success') setTimeout(() => setter({ type: '', text: '' }), 3500);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showMsg(setMessage, 'error', '❌ Escolha um arquivo de imagem (JPG ou PNG)');
      return;
    }
    if (file.size > MAX_SIZE) {
      showMsg(setMessage, 'error', '❌ Imagem muito grande (máximo 5MB)');
      return;
    }
    setMessage({ type: '', text: '' });
    setAvatarFile(file);
  };

  const cancelNewPhoto = () => {
    setAvatarFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    const { name, username, phone_number, address, neighborhood } = form;
    if (!name.trim() || !username.trim() || !phone_number.trim() || !address.trim() || !neighborhood.trim()) {
      showMsg(setMessage, 'error', '❌ Preencha nome, usuário, telefone, endereço e bairro');
      return;
    }
    if (username.length < 3) {
      showMsg(setMessage, 'error', '❌ O usuário precisa ter pelo menos 3 caracteres');
      return;
    }

    try {
      setSaving(true);
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => fd.append(key, value));
      if (avatarFile) fd.append('avatar', avatarFile);

      const res = await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');

      updateUser(data.user, data.token);
      cancelNewPhoto();
      showMsg(setMessage, 'success', '✅ Perfil atualizado com sucesso!');
    } catch (err) {
      showMsg(setMessage, 'error', `❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!window.confirm('Remover sua foto de perfil?')) return;
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/auth/profile/avatar`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao remover foto');

      updateUser(data.user);
      showMsg(setMessage, 'success', '✅ Foto removida');
    } catch (err) {
      showMsg(setMessage, 'error', `❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!pw.current || !pw.next || !pw.confirm) {
      showMsg(setPwMessage, 'error', '❌ Preencha os 3 campos');
      return;
    }
    if (pw.next.length < 6) {
      showMsg(setPwMessage, 'error', '❌ A nova senha precisa ter pelo menos 6 caracteres');
      return;
    }
    if (pw.next !== pw.confirm) {
      showMsg(setPwMessage, 'error', '❌ A confirmação não é igual à nova senha');
      return;
    }

    try {
      setPwSaving(true);
      const res = await fetch(`${API_URL}/auth/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ current_password: pw.current, new_password: pw.next })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao trocar senha');

      setPw({ current: '', next: '', confirm: '' });
      showMsg(setPwMessage, 'success', '✅ Senha alterada com sucesso!');
    } catch (err) {
      showMsg(setPwMessage, 'error', `❌ ${err.message}`);
    } finally {
      setPwSaving(false);
    }
  };

  const avatarSrc = previewUrl || user?.avatar_url;
  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="profile-page">
      <div className="profile-top">
        <h2>👤 Meu Perfil</h2>
        <button className="profile-back" onClick={onClose}>← Voltar à loja</button>
      </div>

      <div className="profile-grid">
        {/* DADOS + FOTO */}
        <section className="profile-card">
          <div className="profile-avatar-area">
            <div className="profile-avatar">
              {avatarSrc ? <img src={avatarSrc} alt="Foto de perfil" /> : <span>{initial}</span>}
            </div>

            <div className="profile-avatar-actions">
              <button
                type="button"
                className="profile-btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                📸 {user?.avatar_url || avatarFile ? 'Trocar foto' : 'Adicionar foto'}
              </button>

              {avatarFile && (
                <button type="button" className="profile-btn-link" onClick={cancelNewPhoto} disabled={saving}>
                  Cancelar nova foto
                </button>
              )}

              {!avatarFile && user?.avatar_url && (
                <button type="button" className="profile-btn-danger" onClick={handleRemoveAvatar} disabled={saving}>
                  🗑️ Remover foto
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              {avatarFile ? (
                <small className="profile-hint-new">Nova foto selecionada. Clique em Salvar.</small>
              ) : (
                <small className="profile-hint">Opcional. Foto do rosto, de frente. Você pode remover quando quiser.</small>
              )}
            </div>
          </div>

          {message.text && <div className={`profile-msg ${message.type}`}>{message.text}</div>}

          <div className="profile-field">
            <label>Nome completo</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="profile-row">
            <div className="profile-field">
              <label>Usuário (para entrar)</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: sanitizeUsername(e.target.value) })}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
              />
            </div>
            <div className="profile-field">
              <label>E-mail (opcional)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoCapitalize="none"
              />
            </div>
          </div>

          <div className="profile-field">
            <label>Telefone / WhatsApp</label>
            <input
              type="tel"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
            />
          </div>

          <div className="profile-row">
            <div className="profile-field">
              <label>Endereço</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="profile-field">
              <label>Bairro</label>
              <input
                type="text"
                value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
              />
            </div>
          </div>

          <button className="profile-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Salvando...' : '💾 Salvar alterações'}
          </button>
        </section>

        {/* SENHA */}
        <section className="profile-card">
          <h3>🔑 Trocar senha</h3>

          {pwMessage.text && <div className={`profile-msg ${pwMessage.type}`}>{pwMessage.text}</div>}

          <div className="profile-field">
            <label>Senha atual</label>
            <input
              type="password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              autoComplete="current-password"
            />
          </div>

          <div className="profile-field">
            <label>Nova senha (mín. 6 caracteres)</label>
            <input
              type="password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              autoComplete="new-password"
            />
          </div>

          <div className="profile-field">
            <label>Confirmar nova senha</label>
            <input
              type="password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              autoComplete="new-password"
            />
          </div>

          <button className="profile-btn-primary" onClick={handlePasswordChange} disabled={pwSaving}>
            {pwSaving ? '⏳ Alterando...' : '🔑 Alterar senha'}
          </button>
        </section>
      </div>
    </div>
  );
}

export default Profile;