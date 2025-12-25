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
    const [incomingCall, setIncomingCall] = useState<any>(null);
    const [callerProfile, setCallerProfile] = useState<any>(null);
    const navigate = useNavigate();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    // Listener para chamadas recebidas
    useEffect(() => {
        if (!session?.user?.id) return;

        const callChannel = supabase
            .channel('public:calls')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${session.user.id}` },
                async (payload) => {
                    if (payload.new && payload.new.status === 'initiated') {
                        // Busca o perfil de quem está ligando
                        const { data: profile, error } = await supabase
                            .from('profiles')
                            .select('full_name, username')
                            .eq('id', payload.new.caller_id)
                            .single();
                        
                        if (error) console.error("Erro ao buscar perfil do chamador:", error);
                        
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

        await supabase
            .from('calls')
            .update({ status: 'answered' })
            .eq('id', incomingCall.id);
            
        navigate(`/chat`, { state: { selectedUser: { id: incomingCall.caller_id, ...callerProfile } } });
        setIncomingCall(null);
        setCallerProfile(null);
    };

    const handleDeclineCall = async () => {
        if (!incomingCall) return;

        await supabase
            .from('calls')
            .update({ status: 'declined', end_time: new Date().toISOString() })
            .eq('id', incomingCall.id);
        
        setIncomingCall(null);
        setCallerProfile(null);
    };

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
                <Route path="/" element={!session ? <Auth /> : <Navigate to="/account" />} />
                <Route path="/account" element={!session ? <Navigate to="/" /> : <Account key={session.user.id} session={session} />} />
                <Route path="/chat" element={!session ? <Navigate to="/" /> : <ChatVideoRTC />} />
            </Routes>
        </div>
    );
}

// Componente wrapper para usar o `useNavigate`
const AppWrapper = () => (
    <Router>
        <App />
    </Router>
);

export default AppWrapper;
