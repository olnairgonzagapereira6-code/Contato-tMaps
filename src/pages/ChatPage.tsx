
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Session } from '@supabase/supabase-js';
import Avatar from '../Avatar';
import AudioPlayer from '../components/AudioPlayer';
import { useNavigate } from 'react-router-dom';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Chat, Message, Call, Profile } from '../types';
import './app.css';

// Garante que o Service Worker seja registrado para notificações push
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
    const { isSubscribed, subscribeToPush } = usePushNotifications();

    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');

    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const [isContactsOverlayVisible, setContactsOverlayVisible] = useState(false);
    const [isNewChatModalOpen, setNewChatModalOpen] = useState(false);
    
    const [callState, setCallState] = useState<{ inCall: boolean; incomingCall: IncomingCall | null; }>({ inCall: false, incomingCall: null });

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Função para buscar os chats do usuário
    const fetchChats = useCallback(async (currentSession: Session) => {
        const { data, error } = await supabase
            .from('chats')
            .select(`id, is_group, group_name, group_avatar_url, chat_participants(profiles(id, username, avatar_url, full_name, status))`)
            .eq('chat_participants.user_id', currentSession.user.id)
            .order('created_at', { ascending: false });

        if (error) console.error("Erro ao buscar chats:", error);
        else setChats(data as unknown as Chat[] || []);
    }, []);

    // Efeito para gerenciar a sessão do usuário
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
    }, [fetchChats]);

    // Função para buscar as mensagens de um chat
    const fetchMessages = useCallback(async (chatId: string) => {
        const { data, error } = await supabase.from('messages').select('*, profiles(id, username, avatar_url, full_name, status)').eq('chat_id', chatId).order('created_at', { ascending: true });
        if (error) console.error("Erro ao buscar mensagens:", error);
        else setMessages(data as unknown as Message[] || []);
    }, []);

    useEffect(() => {
        if (selectedChat) fetchMessages(selectedChat.id);
        else setMessages([]);
    }, [selectedChat, fetchMessages]);

    // Efeito para rolar para a última mensagem
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Efeito para ouvir eventos em tempo real (novas mensagens, chamadas, etc)
    useEffect(() => {
        if (!session?.user?.id) return;

        const handleNewMessage = (payload: any) => {
            if (selectedChat && payload.new.chat_id === selectedChat.id) {
                supabase.from('profiles').select('id, username, avatar_url, full_name, status').eq('id', payload.new.user_id).single().then(({ data: sender }) => {
                    if (sender) setMessages(currentMessages => [...currentMessages, { ...payload.new, profiles: sender }]);
                });
            }
        };
        const handleNewChatParticipant = (payload: any) => {
            if (payload.new.user_id === session.user.id && session) fetchChats(session);
        };
        const handleIncomingCall = async (payload: any) => {
            const newCall = payload.new as Call;
            if (newCall.caller_id !== session.user.id && newCall.status === 'initiated' && !callState.inCall) {
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

    // Funções para enviar mensagens (texto e áudio)
    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newMessage.trim() || !session || !selectedChat) return;
        const { error } = await supabase.from('messages').insert({ content: newMessage.trim(), user_id: session.user.id, chat_id: selectedChat.id });
        if (error) console.error("Erro ao enviar mensagem:", error);
        setNewMessage('');
    };
    
    const handleSendAudio = async (audioBlob: Blob) => {
        if (!session || !selectedChat) return;
        const fileName = `${Date.now()}.webm`;
        const { error: uploadError, data: uploadData } = await supabase.storage.from('audio-messages').upload(`${selectedChat.id}/${fileName}`, audioBlob);
        if (uploadError) { console.error("Erro no upload do áudio:", uploadError); return; }
        const { data: urlData } = supabase.storage.from('audio-messages').getPublicUrl(uploadData.path);
        const { error: messageError } = await supabase.from('messages').insert({ content: '', user_id: session.user.id, chat_id: selectedChat.id, media_url: urlData.publicUrl, media_type: 'audio' });
        if (messageError) console.error("Erro ao salvar mensagem de áudio:", messageError);
    };

    // Funções para gravação de áudio
    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunksRef.current = [];
            mediaRecorderRef.current.ondataavailable = event => audioChunksRef.current.push(event.data);
            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                handleSendAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };
            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) { console.error('Erro ao acessar o microfone', err); }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); setIsRecording(false); }
    };

    // Funções de chamada
    const handleInitiateCall = async () => {
        if (!selectedChat || selectedChat.is_group || !session) return;
        const otherParticipant = selectedChat.chat_participants.find(p => p.profiles.id !== session.user.id);
        if (!otherParticipant) return;
        try {
            const { data, error } = await supabase.from('calls').insert({ caller_id: session.user.id, chat_id: selectedChat.id, status: 'initiated' }).select().single();
            if (error) throw error;
            navigate(`/call/${data.id}`);
        } catch (error) { console.error("Erro ao iniciar chamada:", error); }
    };
    
    const handleLogout = async () => { await supabase.auth.signOut(); navigate('/'); };

    // Funções auxiliares para obter nome e avatar do chat
    const getOtherParticipant = (chat: Chat) => {
        return chat.chat_participants.find(p => p.profiles.id !== session?.user.id);
    }

    const getChatName = (chat: Chat) => {
        if (chat.is_group) return chat.group_name;
        const other = getOtherParticipant(chat);
        return other?.profiles.full_name || other?.profiles.username;
    };

    const getChatAvatar = (chat: Chat): string | undefined => {
        if (chat.is_group) return chat.group_avatar_url;
        const other = getOtherParticipant(chat);
        return other?.profiles.avatar_url;
    };
    
    const getChatStatus = (chat: Chat): string | undefined => {
        if (chat.is_group) return undefined;
        const other = getOtherParticipant(chat);
        return other?.profiles.status;
    }

    if (loading) return <div className="page-container" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Carregando...</div>;
    if (!session) { navigate('/'); return null; };
    
    return (
        <div className="app-container">
            {/* ... JSX para Chamada Recebida e Nova Conversa ... */}

            <section className="chat-panel" style={{ display: (isContactsOverlayVisible || isNewChatModalOpen) ? 'none' : 'flex' }}>
              <header className="chat-header">
                <div className="chat-left">
                  <button className="btn" title="Abrir conversas" onClick={() => setContactsOverlayVisible(true)}>☰</button>
                  <Avatar url={(selectedChat && getChatAvatar(selectedChat)) || null} size={40} readOnly />
                  <div className='chat-header-info'>
                    <span className="chat-user">{selectedChat ? getChatName(selectedChat) : 'Selecione uma conversa'}</span>
                    {selectedChat && <span className='chat-status'>{getChatStatus(selectedChat)}</span>}
                  </div>
                </div>
                <div className="chat-actions">
                   {selectedChat && !selectedChat.is_group && (<button onClick={handleInitiateCall} className="btn" title="Ligar">📞</button>)}
                   <button onClick={subscribeToPush} className={`btn notify ${isSubscribed ? 'subscribed' : ''}`} title={isSubscribed ? "Inscrito para notificações" : "Receber notificações"}>🔔</button>
                   <button className="btn exit" onClick={handleLogout}>Sair</button>
                </div>
              </header>

              <main className="chat-messages">
                {selectedChat ? (
                    messages.map(msg => (
                        <div key={msg.id} className={`message-container ${msg.user_id === session.user.id ? 'sent' : 'received'}`}>
                           <div className="message-bubble">
                               {selectedChat.is_group && msg.user_id !== session.user.id && (<div className="message-sender">{msg.profiles?.full_name || msg.profiles?.username}</div>)}
                               {msg.media_url && msg.media_type === 'audio' ? <AudioPlayer audioUrl={msg.media_url} /> : <p>{msg.content}</p> }
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
                        {isRecording ? (<button type="button" onClick={handleStopRecording} className="btn stop-recording">◼</button>) : (<button type="button" onClick={handleStartRecording} className="btn mic">🎤</button>)}                        <button type="submit" className="btn send" disabled={isRecording}>➤</button>
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
                       <Avatar url={getChatAvatar(chat) || null} size={40} readOnly />
                       <span>{getChatName(chat)}</span>
                    </li>
                ))}
              </ul>
            </div>
        </div>
    );
}

export default ChatPage;
