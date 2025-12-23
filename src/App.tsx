import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import Account from './pages/Account' 
import ChatVideoRTC from './pages/ChatVideoRTC'
import Contacts from './pages/Contacts'
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
      <div className="container" style={{ padding: '50px 0 100px 0' }}>
        <Routes>
            <Route path="/chat" element={session ? <ChatVideoRTC /> : <Auth />} />
            <Route path="/contacts" element={session ? <Contacts /> : <Auth />} />
            <Route path="/" element={!session ? <Auth /> : <Account key={session.user.id} session={session} />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
