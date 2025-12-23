import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import Account from './pages/Account' 
import ChatPage from './pages/ChatPage' // Importa a nova página de Chat
import { Session } from '@supabase/supabase-js'
import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false);
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div>Carregando...</div>
  }

  return (
    <BrowserRouter>
      <div className="App">
        <Routes>
            {/* A rota principal agora renderiza a ChatPage se o usuário estiver logado */}
            <Route path="/" element={!session ? <Auth /> : <ChatPage />} />
            {/* A rota de conta ainda pode ser acessada se necessário */}
            <Route path="/account" element={!session ? <Auth /> : <Account key={session.user.id} session={session} />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
