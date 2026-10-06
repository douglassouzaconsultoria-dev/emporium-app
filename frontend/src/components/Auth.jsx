import React, { useState } from 'react';
import Login from './Login';
import Register from './Register';

function Auth() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <>
      {isLogin ? (
        <Login onSwitchToRegister={() => setIsLogin(false)} />
      ) : (
        <Register onSwitchToLogin={() => setIsLogin(true)} />
      )}
    </>
  );
}

export default Auth;