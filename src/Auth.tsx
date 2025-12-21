import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let error;

    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: window.location.origin,
        },
      });
      error = signUpError;
      if (!error) {
        alert("Verifique seu e-mail para o link de confirmação!");
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      error = signInError;
    }

    if (error) {
      alert(error.message);
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!email) {
        alert("Por favor, insira seu endereço de e-mail para redefinir sua senha.");
        return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
    });
    if (error) {
        alert(error.message);
    } else {
        alert("Verifique seu e-mail para o link de redefinição de senha!");
    }
    setLoading(false);
  };

  return (
    <div className="row flex-center">
      <div className="col-6 form-widget" aria-live="polite">
        <h1 className="header">Supabase + React</h1>
        <p className="description">
          {isSignUp ? "Crie uma nova conta" : "Faça login em sua conta"}
        </p>
        <form onSubmit={handleAuthAction}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            className="inputField"
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            className="inputField"
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className={"button block"} disabled={loading}>
            {loading ? <span>Carregando...</span> : <span>{isSignUp ? "Cadastrar" : "Login"}</span>}
          </button>
        </form>

        <button
            onClick={() => setIsSignUp(!isSignUp)}
            className={"button block"}
            disabled={loading}>
            {isSignUp ? "Já tem uma conta? Faça login" : "Não tem uma conta? Cadastre-se"}
        </button>

        {!isSignUp && (
            <button
                onClick={handlePasswordReset}
                className={"button block"}
                disabled={loading}>
                Esqueceu sua senha?
            </button>
        )}
      </div>
    </div>
  );
}
