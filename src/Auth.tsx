import { useState } from "react";
import { supabase } from "./supabaseClient";
import './Auth.css'; 

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authView, setAuthView] = useState("sign_in"); 

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Pega a URL atual para redirecionamento após login/cadastro
    const redirectUrl = window.location.origin + "/account";

    try {
      if (authView === 'magic_link') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        alert("Verifique seu e-mail para o link de login!");

      } else if (authView === 'sign_up') {
        const { error } = await supabase.auth.signUp({
          email, 
          password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        alert("Cadastro realizado! Verifique seu e-mail para confirmação.");

      } else { // sign_in
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // O Supabase onAuthStateChange no App.tsx cuidará do redirecionamento
      }
    } catch (error: any) {
      alert(error.message || "Ocorreu um erro na autenticação");
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    switch (authView) {
      case 'sign_up':
        return (
          <>
            <h2 className="auth-title">Criar Nova Conta</h2>
            <p className="auth-description">Preencha os campos para se registrar.</p>
            <input
              className="inputField"
              type="email"
              placeholder="Seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="inputField"
              type="password"
              placeholder="Crie uma senha forte"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="button primary" disabled={loading}>
              {loading ? "Registrando..." : "Cadastrar"}
            </button>
          </>
        );
      case 'magic_link':
        return (
          <>
            <h2 className="auth-title">Login com Magic Link</h2>
            <p className="auth-description">Enviaremos um link para seu e-mail.</p>
            <input
              className="inputField"
              type="email"
              placeholder="Seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit" className="button primary" disabled={loading || !email}>
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
              className="inputField"
              type="email"
              placeholder="Seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="inputField"
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="button primary" disabled={loading}>
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
            <div className="toggle-group">
                {authView !== 'sign_in' &&
                    <button type="button" onClick={() => setAuthView('sign_in')} className="toggle-button">Já tem conta? <strong>Entrar</strong></button>
                }
                {authView !== 'sign_up' &&
                    <button type="button" onClick={() => setAuthView('sign_up')} className="toggle-button">Criar <strong>Conta</strong></button>
                }
                {authView !== 'magic_link' &&
                    <button type="button" onClick={() => setAuthView('magic_link')} className="toggle-button">Usar <strong>Link Mágico</strong></button>
                }
            </div>
        </footer>
      </div>
    </div>
  );
}
