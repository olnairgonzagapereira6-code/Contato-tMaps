
import { useState } from "react";
import { supabase } from "./supabaseClient";
import './Auth.css'; // Importando o CSS para estilização

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authView, setAuthView] = useState("sign_in"); // 'sign_in', 'sign_up', 'magic_link'

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (authView === 'magic_link') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/chat` },
      });
      if (error) alert(error.message);
      else alert("Verifique seu e-mail para o link de login!");

    } else if (authView === 'sign_up') {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/chat` },
      });
      if (error) alert(error.message);
      else alert("Cadastro realizado! Verifique seu e-mail para confirmação.");

    } else { // sign_in
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }

    setLoading(false);
  };

  const renderForm = () => {
    switch (authView) {
      case 'sign_up':
        return (
          <>
            <h2 className="auth-title">Criar Nova Conta</h2>
            <p className="auth-description">Preencha os campos para se registrar.</p>
            <input
              id="email"
              className="inputField"
              type="email"
              placeholder="Seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              id="password"
              className="inputField"
              type="password"
              placeholder="Crie uma senha forte"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className={"button primary"} disabled={loading}>
              {loading ? "Registrando..." : "Cadastrar"}
            </button>
          </>
        );
      case 'magic_link':
        return (
          <>
            <h2 className="auth-title">Login com Magic Link</h2>
            <p className="auth-description">Enviaremos um link para seu e-mail. Sem senha, sem complicação.</p>
            <input
              id="email"
              className="inputField"
              type="email"
              placeholder="Seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit" className={"button primary"} disabled={loading || !email}>
              {loading ? "Enviando..." : "Enviar Magic Link"}
            </button>
          </>
        );
      default: // sign_in
        return (
          <>
            <h2 className="auth-title">Bem-vindo de volta!</h2>
            <p className="auth-description">Faça login para continuar.</p>
            <input
              id="email"
              className="inputField"
              type="email"
              placeholder="Seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              id="password"
              className="inputField"
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className={"button primary"} disabled={loading}>
              {loading ? "Entrando..." : "Login"}
            </button>
          </>
        );
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-widget">
        <header className="auth-header">
            <h1 className="brand-logo">TheZap</h1>
        </header>
        
        <form className="auth-form" onSubmit={handleAuthAction}>
            {renderForm()}
        </form>

        <footer className="auth-footer">
            {authView !== 'sign_in' &&
                <button onClick={() => setAuthView('sign_in')} className="toggle-button">Já tem conta? <strong>Faça Login</strong></button>
            }
            {authView !== 'sign_up' &&
                <button onClick={() => setAuthView('sign_up')} className="toggle-button">Não tem conta? <strong>Cadastre-se</strong></button>
            }
            {authView !== 'magic_link' &&
                <button onClick={() => setAuthView('magic_link')} className="toggle-button">Prefere um <strong>Magic Link</strong>?</button>
            }
        </footer>
      </div>
    </div>
  );
}
