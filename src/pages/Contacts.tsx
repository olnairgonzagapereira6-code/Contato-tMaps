
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import Avatar from '../Avatar';
import { useNavigate, Link } from 'react-router-dom';
import './Contacts.css'; // Importa os novos estilos

interface Profile extends User {
    username: string;
    avatar_url: string;
}

function Contacts() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<Profile[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            if (data.session) fetchUsers(data.session);
        }).finally(() => setLoading(false));

        const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (!session) {
                setUsers([]);
            } else {
                fetchUsers(session);
            }
        });

        return () => authSub.unsubscribe();
    }, []);

    const fetchUsers = async (currentSession: Session) => {
        const { data, error } = await supabase.from('profiles').select('id, username, avatar_url');
        if (error) {
            console.error("Erro ao buscar usuários:", error);
        } else {
            setUsers(data.filter(u => u.id !== currentSession.user.id) as Profile[]);
        }
    };

    const handleSelectUser = (user: Profile) => {
        navigate('/chat', { state: { selectedUser: user } });
    };

    if (loading) return <div>Carregando...</div>;
    if (!session) return <div>Você precisa estar logado para ver seus contatos.</div>;

    return (
        <div className="contacts-page-container">
            <div className="user-list-sidebar">
                <h1>CONTATOS</h1>
                <div className="user-list">
                    {users.length > 0 ? (
                        users.map(user => (
                            <div
                                key={user.id}
                                className="user-list-item"
                                onClick={() => handleSelectUser(user)}
                            >
                                <Avatar url={user.avatar_url} size={40} readOnly />
                                <span>{user.username || 'Usuário sem nome'}</span>
                            </div>
                        ))
                    ) : (
                        <p style={{ textAlign: 'center', marginTop: '20px', color: '#888' }}>Nenhum outro usuário encontrado.</p>
                    )}
                </div>
                <Link to="/chat" className="back-to-chat-button">Voltar para o Chat</Link>
            </div>
        </div>
    );
}

export default Contacts;
