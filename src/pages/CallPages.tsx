import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Session, RealtimeChannel } from '@supabase/supabase-js';
import Avatar from '../Avatar';
import AudioPlayer from '../components/AudioPlayer';
import { useNavigate } from 'react-router-dom';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Chat, Message, Call, Profile } from '../types';
import './app.css';

// Registra o Service Worker para notificações push
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('Service Worker registrado com sucesso:', registration);
    }).catch(error => {
      console.log('Falha ao registrar o Service Worker:', error);
    });
  });
}

type IncomingCall = Call & { callerProfile: Profile };

function ChatPage() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { isSubscribed, subscribeToPush, isPushSupported } = usePushNotifications();

    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');

    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const [isContactsOverlayVisible, setContactsOverlayVisible] = useState(false);
    const [isNewChatModalOpen, setNewChatModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Profile[]>([]);
    
    const [callState, setCallState] = useState<{ inCall: boolean; incomingCall: IncomingCall | null; }>({ inCall: false, incomingCall: null });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session) await fetchChats(session);
            setLoading(false);
        };
        getSession();

        const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (_event === 'SIGNED_OUT') {
               setSelectedChat(null);
               setChats([]);
            }
            setSession(session);
            if (session) fetchChats(session);
        });

        return () => authSub.unsubscribe();
    }, []);

    const fetchChats = async (currentSession: Session) => {
        const { data, error } = await supabase
            .from('chats')
            .select(`id, is_group, group_name, group_avatar_url, chat_participants(profiles(id, username, avatar_url))`)
            .eq('chat_participants.user_id', currentSession.user.id)
            .order('created_at', { ascending: false });

        if (error) console.error("Erro ao buscar chats:", error);
        else setChats(data as unknown as Chat[] || []);
    };
    
    const fetchMessages = useCallback(async (chatId: string) => {
        const { data, error } = await supabase.from('messages').select('*, profiles(*)').eq('chat_id', chatId).order('created_at', { ascending: true });
        if (error) console.error("Erro ao buscar mensagens:", error);
        else setMessages(data as unknown as Message[] || []);
    }, []);

    useEffect(() => {
        if (selectedChat) fetchMessages(selectedChat.id);
        else setMessages([]);
    }, [selectedChat, fetchMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (!session?.user?.id) return;

        const handleNewMessage = (payload: any) => {
            if (selectedChat && payload.new.chat_id === selectedChat.id) {
                supabase.from('profiles').select('*').eq('id', payload.new.user_id).single().then(({ data: sender }) => {
                    if (sender) setMessages(currentMessages => [...currentMessages, { ...payload.new, profiles: sender }]);
                });
            }
        };
        const handleNewChatParticipant = (payload: any) => {
            if (payload.new.user_id === session.user.id && session) fetchChats(session);
        };
        const handleIncomingCall = async (payload: any) => {
            const newCall = payload.new as Call;
            if (newCall.callee_id === session.user.id && newCall.status === 'initiated' && !callState.inCall) {
                const { data: callerProfile, error } = await supabase.from('profiles').select('*').eq('id', newCall.caller_id).single();
                if (error) console.error("Erro ao buscar perfil do chamador:", error);
                else setCallState(prev => ({ ...prev, incomingCall: { ...newCall, callerProfile } }));
            }
        };

        const messageChannel = supabase.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, handleNewMessage).subscribe();
        const participantChannel = supabase.channel('public:chat_participants').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_participants' }, handleNewChatParticipant).subscribe();
        const callChannel = supabase.channel('public:calls').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, handleIncomingCall).subscribe();

        return () => {
          supabase.removeChannel(messageChannel);
          supabase.removeChannel(participantChannel);
          supabase.removeChannel(callChannel);
        };
    }, [session, selectedChat, callState.inCall, fetchChats]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newMessage.trim() || !session || !selectedChat) return;
        const { error } = await supabase.from('messages').insert({ content: newMessage.trim(), user_id: session.user.id, chat_id: selectedChat.id });
        if (error) console.error("Erro ao enviar mensagem:", error);
        setNewMessage('');
    };
    
    const handleStartRecording = async () => { /* ... (mesma implementação anterior) ... */ };
    const handleStopRecording = () => { /* ... (mesma implementação anterior) ... */ };
    const handleSendAudio = async (audioBlob: Blob) => { /* ... (mesma implementação anterior) ... */ };

    const handleInitiateCall = async () => {
        if (!selectedChat || selectedChat.is_group || !session) return;
        const otherParticipant = selectedChat.chat_participants.find(p => p.profiles.id !== session.user.id);
        if (!otherParticipant) return;
        try {
            const { data, error } = await supabase.from('calls').insert({ caller_id: session.user.id, callee_id: otherParticipant.profiles.id, chat_id: selectedChat.id, status: 'initiated' }).select().single();
            if (error) throw error;
            navigate(`/call/${data.id}`);
        } catch (error) { console.error("Erro ao iniciar chamada:", error); }
    };
    
    const handleAnswerCall = async () => {
        if (!callState.incomingCall) return;
        try {
            localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            await supabase.from('calls').update({ status: 'answered' }).eq('id', callState.incomingCall.id);
            navigate(`/call/${callState.incomingCall.id}`);
            setCallState({ inCall: true, incomingCall: null });
        } catch (error) {
            console.error("Erro ao atender chamada:", error);
            await handleDeclineCall();
        }
    };

    const handleDeclineCall = async () => {
        if (callState.incomingCall) await supabase.from('calls').update({ status: 'missed' }).eq('id', callState.incomingCall.id);
        setCallState(prev => ({ ...prev, incomingCall: null }));
    };

    const handleSearchUsers = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim() || !session) return;
        const { data, error } = await supabase.from('profiles').select('*').ilike('username', `%${searchQuery}%`).neq('id', session.user.id);
        if (error) console.error("Erro ao buscar usuários:", error);
        else setSearchResults(data || []);
    };
    
    const handleStartNewChat = async (otherUserId: string) => {
        if (!session) return;
        try {
            const { data, error } = await supabase.rpc('find_or_create_private_chat', { other_user_id: otherUserId });
            if (error) throw error;
            await fetchChats(session); // Atualiza a lista de chats
            const newChat = chats.find(c => c.id === data); // Encontra o novo chat
            if (newChat) setSelectedChat(newChat); // Seleciona o novo chat
            setNewChatModalOpen(false);
            setContactsOverlayVisible(false);
        } catch (error) { console.error("Erro ao criar nova conversa:", error); }
    };

    const handleLogout = async () => { await supabase.auth.signOut(); navigate('/'); };

    const getChatName = (chat: Chat) => {
        if (chat.is_group) return chat.group_name;
        const other = chat.chat_participants.find(p => p.profiles.id !== session?.user.id);
        return other?.profiles.username;
    };

    const getChatAvatar = (chat: Chat) => {
        if (chat.is_group) return chat.group_avatar_url;
        const other = chat.chat_participants.find(p => p.profiles.id !== session?.user.id);
        return other?.profiles.avatar_url;
    };

    if (loading) return <div className="page-container" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Carregando...</div>;
    if (!session) { navigate('/'); return null; };
    
    return (
        <div className="app-container">
            {callState.incomingCall && (
                <div className="incoming-call-overlay">
                    <div className="incoming-call-box">
                        <h3>Chamada Recebida</h3>
                        <Avatar url={callState.incomingCall.callerProfile.avatar_url} size={80} readOnly />
                        <p><strong>{callState.incomingCall.callerProfile.username}</strong> está te ligando...</p>
                        <div className="incoming-call-actions">
                            <button onClick={handleAnswerCall} className="btn accept-call">✔️</button>
                            <button onClick={handleDeclineCall} className="btn decline-call">❌</button>
                        </div>
                    </div>
                </div>
            )}
            
            {isNewChatModalOpen && (
                <div className="contacts-overlay" style={{left: 0}}>
                    <header className="overlay-header">
                        <span>Nova Conversa</span>
                        <button className="btn" onClick={() => setNewChatModalOpen(false)}>✖</button>
                    </header>
                    <div style={{padding: '10px', background: '#f0f0f0'}}>
                       <form onSubmit={handleSearchUsers} style={{display: 'flex'}}>
                           <input type="text" placeholder="Buscar usuário..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{flex: 1, padding: '8px', borderRadius: '20px', border: '1px solid #ccc'}} />
                           <button type="submit" className="btn send">🔍</button>
                       </form>
                    </div>
                    <ul className="contacts-list">
                        {searchResults.map(user => (
                            <li key={user.id} className="contact" onClick={() => handleStartNewChat(user.id)}>
                                <Avatar url={user.avatar_url} size={40} readOnly />
                                <span>{user.username}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <section className="chat-panel" style={{ display: (isContactsOverlayVisible || isNewChatModalOpen) ? 'none' : 'flex' }}>
              <header className="chat-header">
                <div className="chat-left">
                  <button className="btn" title="Abrir conversas" onClick={() => setContactsOverlayVisible(true)}>☰</button>
                  <Avatar url={selectedChat ? getChatAvatar(selectedChat) : undefined} size={40} readOnly />
                  <span className="chat-user">{selectedChat ? getChatName(selectedChat) : 'Selecione uma conversa'}</span>
                </div>
                <div className="chat-actions">
                   {selectedChat && !selectedChat.is_group && (<button onClick={handleInitiateCall} className="btn" title="Ligar">📞</button>)}
                   <button onClick={subscribeToPush} className={`btn notify ${isSubscribed ? 'subscribed' : ''} ${!isPushSupported ? 'unsupported' : ''}`} title={isSubscribed ? "Inscrito para notificações" : "Receber notificações"}>🔔</button>
                   <button className="btn exit" onClick={handleLogout}>Sair</button>
                </div>
              </header>

              <main className="chat-messages">
                {selectedChat ? (
                    messages.map(msg => (
                        <div key={msg.id} className={`message-container ${msg.user_id === session.user.id ? 'sent' : 'received'}`}>
                           <div className="message-bubble">
                               {selectedChat.is_group && msg.user_id !== session.user.id && (<div className="message-sender">{msg.profiles?.username}</div>)}
                               {msg.audio_url ? <AudioPlayer src={msg.audio_url} /> : <p>{msg.content}</p> }
                               <div className="message-time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                           </div>
                       </div>
                    ))
                ) : <div style={{textAlign: 'center', marginTop: '20px'}}>Selecione uma conversa para começar.</div> }
                <div ref={messagesEndRef} />
              </main>

              <footer className="chat-input">
                {selectedChat && (
                    <form onSubmit={handleSendMessage} style={{ display: 'flex', width: '100%' }}>
                        <input type="text" className="message-input" placeholder="Digite uma mensagem..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} disabled={isRecording} />
                        {isRecording ? (<button type="button" onClick={handleStopRecording} className="btn stop-recording">◼</button>) : (<button type="button" onClick={handleStartRecording} className="btn mic">🎤</button>)}
                        <button type="submit" className="btn send" disabled={isRecording}>➤</button>
                    </form>
                )}
              </footer>
            </section>
            
            <div className="contacts-overlay" style={{ left: isContactsOverlayVisible ? '0' : '-100%' }}>
              <header className="overlay-header">
                <span>Conversas</span>
                <div>
                    <button className="btn" title="Nova conversa" onClick={() => {setNewChatModalOpen(true); setContactsOverlayVisible(false);}}>+</button>
                    <button className="btn" onClick={() => setContactsOverlayVisible(false)}>✖</button>
                </div>
              </header>
              <ul className="contacts-list">
                {chats.map(chat => (
                    <li key={chat.id} className={`contact ${selectedChat?.id === chat.id ? 'active' : ''}`} onClick={() => {setSelectedChat(chat); setContactsOverlayVisible(false);}}>
                       <Avatar url={getChatAvatar(chat)} size={40} readOnly />
                       <span>{getChatName(chat)}</span>
                    </li>
                ))}
              </ul>
            </div>
        </div>
    );
}

export default ChatPage;
