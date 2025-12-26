import './App.css'
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import { Session } from '@supabase/supabase-js'
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom'
import Account from './pages/Account'
import ChatVideoRTC from './pages/ChatVideoRTC'
import CallNotification from './components/CallNotification'

function App() {
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true) // Novo: Estado de carregamento
    const [incomingCall, setIncomingCall] = useState<any>(null)
    const [callerProfile, setCallerProfile] = useState<any>(null)
    const navigate = useNavigate()

    useEffect(() => {
        // Verifica a sessão atual ao abrir o app
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setLoading(false)
        })

        // Escuta mudanças na autenticação (login/logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    // Listener para chamadas recebidas via Supabase Realtime
    useEffect(() => {
        if (!session?.user?.id) return;

        const callChannel = supabase
            .channel('public:calls')
            .on(
                'postgres_changes',
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'calls', 
                    filter: `receiver_id=eq.${session.user.id}` 
                },
                async (payload) => {
                    if (payload.new && payload.new.status === 'initiated') {
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('full_name, username')
                            .eq('id', payload.new.caller_id)
                            .single();
                        
                        setCallerProfile(profile);
                        setIncomingCall(payload.new);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(callChannel);
        };
    }, [session?.user?.id]);

    const handleAcceptCall = async () => {
        if (!incomingCall) return;
        await supabase.from('calls').update({ status: 'answered' }).eq('id', incomingCall.id);
        navigate(`/chat`, { state: { selectedUser: { id: incomingCall.caller_id, ...callerProfile } } });
        setIncomingCall(null);
    };

    const handleDeclineCall = async () => {
        if (!incomingCall) return;
        await supabase.from('calls').update({ status: 'declined' }).eq('id', incomingCall.id);
        setIncomingCall(null);
    };

    // Enquanto estiver verificando se o usuário está logado, mostra uma tela vazia ou carregando
    if (loading) {
        return <div className="loading-screen">Carregando TheZap...</div>
    }

    return (
        <div className="container">
            {incomingCall && callerProfile && (
                <CallNotification 
                    caller={callerProfile}
                    onAccept={handleAcceptCall}
                    onDecline={handleDeclineCall}
                />
            )}
            <Routes>
                {/* Se não houver sessão, mostra Auth. Se houver, vai para Account */}
                <Route path="/" element={!session ? <Auth /> : <Navigate to="/account" />} />
                
                {/* Rotas protegidas: só acessa se tiver session */}
                <Route path="/account" element={!session ? <Navigate to="/" /> : <Account session={session} />} />
                <Route path="/chat" element={!session ? <Navigate to="/" /> : <ChatVideoRTC />} />
                
                {/* Rota de segurança para caminhos inexistentes */}
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </div>
    );
}

const AppWrapper = () => (
    <Router>
        <App />
    </Router>
);

export default AppWrapper;
