
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Session, RealtimeChannel, User, AuthChangeEvent } from '@supabase/supabase-js';
import Avatar from '../Avatar';
import AudioPlayer from '../components/AudioPlayer';
import { useNavigate } from 'react-router-dom';

// Importa o novo CSS do template.
// Estilos antigos de Contacts.css e ChatVideoRTC.css serão incorporados ou substituídos aqui.
import './app.css'; 

// Service Worker (mantido de ChatVideoRTC)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('Service Worker registrado com sucesso:', registration);
    }).catch(error => {
      console.log('Falha ao registrar o Service Worker:', error);
    });
  });
}

// Configuração de servidores STUN/TURN (mantido de ChatVideoRTC)
const peerConnectionConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

interface Profile extends User {
    username: string;
    avatar_url: string;
}

function ChatPage() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Estado combinado de Contacts.tsx e ChatVideoRTC.tsx
    const [users, setUsers] = useState<Profile[]>([]); // Lista de contatos
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const [callState, setCallState] = useState<{
        inCall: boolean;
        isJoining: boolean;
        callId: string | null;
        incomingCall: any | null;
    }>({
        inCall: false,
        isJoining: false,
        callId: null,
        incomingCall: null,
    });

    // Refs para elementos DOM e objetos WebRTC
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const rtcChannelRef = useRef<RealtimeChannel | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // --- LÓGICA DE AUTENTICAÇÃO E INICIALIZAÇÃO ---

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session) {
                fetchUsers(session);
            }
            setLoading(false);
        };
        getSession();

        const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session) => {
            if (_event === 'SIGNED_OUT') {
               cleanupCall();
               setSelectedUser(null);
               setUsers([]);
            }
            setSession(session);
            if (session) {
                fetchUsers(session);
            }
        });

        return () => {
            authSub.unsubscribe();
            cleanupCall();
        };
    }, []);

    // --- LÓGICA DE CONTATOS (de Contacts.tsx) ---

    const fetchUsers = async (currentSession: Session) => {
        const { data, error } = await supabase.from('profiles').select('id, username, avatar_url');
        if (error) {
            console.error("Erro ao buscar usuários:", error);
        } else {
            setUsers(data.filter(u => u.id !== currentSession.user.id) as Profile[]);
        }
    };

    const handleSelectUser = (user: Profile) => {
        if (selectedUser?.id === user.id) return;
        setSelectedUser(user);
    };
    
    // --- LÓGICA DE MENSAGENS (de ChatVideoRTC.tsx) ---

    const fetchMessages = useCallback(async (userId: string, peerId: string) => {
        const { data, error } = await supabase
          .from('messages')
          .select('*, sender:sender_id(id, username, avatar_url)')
          .or(`(sender_id.eq.${userId},receiver_id.eq.${peerId}),(sender_id.eq.${peerId},receiver_id.eq.${userId})`)
          .order('created_at', { ascending: true });

        if (error) console.error("Erro ao buscar mensagens:", error);
        else setMessages(data || []);
    }, []);

    useEffect(() => {
        if (selectedUser && session) {
            fetchMessages(session.user.id, selectedUser.id);
        } else {
            setMessages([]);
        }
    }, [selectedUser, session, fetchMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newMessage.trim() || !session || !selectedUser) return;

        const content = newMessage.trim();
        setNewMessage('');

        const { error } = await supabase.from('messages').insert({
          content,
          sender_id: session.user.id,
          receiver_id: selectedUser.id,
          is_audio: false,
        });

        if (error) console.error("Erro ao enviar mensagem:", error);
    };
    
    const handleClearChat = async () => {
        if (!session || !selectedUser || !window.confirm("Tem certeza que deseja apagar todas as mensagens desta conversa?")) return;

        const { error } = await supabase.rpc('delete_conversation_messages', {
            user_id_1: session.user.id,
            user_id_2: selectedUser.id
        });

        if (error) {
            alert("Não foi possível apagar as mensagens.");
            console.error("Erro ao apagar chat:", error);
        } else {
            setMessages([]);
        }
    };


    // --- LÓGICA DE ÁUDIO (de ChatVideoRTC.tsx) ---

    const handleStartRecording = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Seu navegador não suporta gravação de áudio.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];
            mediaRecorderRef.current.ondataavailable = event => audioChunksRef.current.push(event.data);
            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await handleSendAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };
            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (error) {
            console.error("Erro ao iniciar a gravação:", error);
            alert("Não foi possível acessar o microfone.");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleSendAudio = async (audioBlob: Blob) => {
        if (!session || !selectedUser) return;
        const fileName = `audio_${Date.now()}.webm`;
        const filePath = `${session.user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('audio_messages').upload(filePath, audioBlob);
        if (uploadError) {
            console.error('Erro no upload do áudio:', uploadError);
            return;
        }

        const { data: urlData } = supabase.storage.from('audio_messages').getPublicUrl(filePath);
        if (!urlData) return;
        
        const { error: messageError } = await supabase.from('messages').insert({ content: urlData.publicUrl, sender_id: session.user.id, receiver_id: selectedUser.id, is_audio: true });
        if (messageError) console.error('Erro ao salvar mensagem de áudio:', messageError);
    };

    // --- LÓGICA DE VIDEOCHAMADA (WebRTC, de ChatVideoRTC.tsx) ---

    const cleanupCall = useCallback(() => {
        console.log("Limpando recursos da chamada...");
        localStreamRef.current?.getTracks().forEach(track => track.stop());
        peerConnectionRef.current?.close();
        if(rtcChannelRef.current) supabase.removeChannel(rtcChannelRef.current);

        localStreamRef.current = null;
        peerConnectionRef.current = null;
        rtcChannelRef.current = null;
        
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

        setCallState({ inCall: false, isJoining: false, callId: null, incomingCall: null });
    }, [supabase]);


    const handleEndCall = useCallback(async () => {
        console.log("--- ENCERRANDO CHAMADA ---");
        const callIdToUpdate = callState.callId;
        cleanupCall(); 
    
        if (callIdToUpdate) {
          await supabase.from('calls').update({ end_time: new Date().toISOString() }).eq('id', callIdToUpdate);
        }
      }, [callState.callId, cleanupCall, supabase]);


    useEffect(() => {
        if (!session?.user?.id) return;
    
        const handleNewMessage = (payload: any) => {
            const message = payload.new;
            const isForMe = message.receiver_id === session.user.id && message.sender_id === selectedUser?.id;
            const isFromMe = message.sender_id === session.user.id && message.receiver_id === selectedUser?.id;

            if (selectedUser && (isForMe || isFromMe)) {
                supabase.from('profiles').select('id, username, avatar_url').eq('id', message.sender_id).single().then(({data: sender}) => {
                    setMessages(currentMessages => [...currentMessages, {...message, sender}]);
                })
            }
        };

        const messageChannel = supabase
          .channel('public:messages')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, handleNewMessage)
          .subscribe();
    
        const callChannel = supabase
          .channel('public:calls')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${session.user.id}` }, 
          (payload) => {
            if (!payload.new.end_time && !callState.inCall && !callState.incomingCall) {
              supabase.from('profiles').select('id, username, avatar_url').eq('id', payload.new.created_by).single().then(({ data: caller }) => {
                setCallState(prev => ({ ...prev, incomingCall: { ...payload.new, caller } }));
              });
            }
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, 
          (payload) => {
            if (payload.new.id === callState.callId && payload.new.end_time) {
              handleEndCall();
            }
          })
          .subscribe();
    
        return () => {
          supabase.removeChannel(messageChannel);
          supabase.removeChannel(callChannel);
        };
      }, [session?.user?.id, selectedUser, callState.inCall, callState.callId, handleEndCall, supabase]);

    const setupRtcConnection = async (stream: MediaStream, currentCallId: string, isCaller: boolean) => {
        const pc = new RTCPeerConnection(peerConnectionConfig);
        peerConnectionRef.current = pc;
    
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
    
        pc.ontrack = event => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        };
    
        const rtcCh = supabase.channel(`call:${currentCallId}`, { config: { broadcast: { self: true } } });
        rtcChannelRef.current = rtcCh;
    
        pc.onicecandidate = e => {
          if (e.candidate) rtcCh.send({ type: 'broadcast', event: 'ice-candidate', payload: e.candidate });
        };
    
        rtcCh.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
          if (payload) pc.addIceCandidate(new RTCIceCandidate(payload)).catch(e => console.error("ICE error:", e));
        });
    
        if (isCaller) {
          rtcCh.on('broadcast', { event: 'answer' }, async ({ payload }) => {
            if (payload && pc.signalingState !== 'stable') await pc.setRemoteDescription(new RTCSessionDescription(payload));
          });
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          rtcCh.subscribe(status => {
            if (status === 'SUBSCRIBED') rtcCh.send({ type: 'broadcast', event: 'offer', payload: offer });
          });
        } else { // Is Callee
          rtcCh.on('broadcast', { event: 'offer' }, async ({ payload }) => {
            if (payload) {
                await pc.setRemoteDescription(new RTCSessionDescription(payload));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                rtcCh.send({ type: 'broadcast', event: 'answer', payload: answer });
            }
          });
          rtcCh.subscribe();
        }
    };

    const getMediaAndStart = async (startFn: (stream: MediaStream) => Promise<void>) => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
          await startFn(stream);
        } catch (error: any) {
          alert(`Falha ao acessar câmera/microfone: ${error.message}.`);
          cleanupCall();
        }
    };

    const handleCreateCall = async () => {
        if (!session || !selectedUser || callState.inCall) return;
    
        setCallState(prev => ({ ...prev, isJoining: true }));
    
        await getMediaAndStart(async (stream) => {
          const { data, error } = await supabase.from('calls').insert({ created_by: session.user.id, receiver_id: selectedUser.id }).select().single();
    
          if (error || !data) {
            cleanupCall(); return;
          }
          
          const newCallId = data.id;
          setCallState(prev => ({ ...prev, callId: newCallId, inCall: true, incomingCall: null, isJoining: false }));
          await setupRtcConnection(stream, newCallId, true);
        });
    };

    const handleJoinCall = async () => {
        if (!session || !callState.incomingCall) return;
        
        // Garante que o usuário selecionado é quem está ligando
        if (callState.incomingCall.caller) setSelectedUser(callState.incomingCall.caller);
        
        setCallState(prev => ({ ...prev, isJoining: true }));
    
        await getMediaAndStart(async (stream) => {
            const { id: incomingCallId } = callState.incomingCall;    
            setCallState(prev => ({ ...prev, callId: incomingCallId, inCall: true, incomingCall: null, isJoining: false }));
            await setupRtcConnection(stream, incomingCallId, false);
        });
    };

    const handleDeclineCall = async () => {
        if (!callState.incomingCall) return;
        await supabase.from('calls').update({ end_time: new Date().toISOString() }).eq('id', callState.incomingCall.id);
        setCallState(prev => ({ ...prev, incomingCall: null }));
    };
    
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('Error logging out:', error);
        else navigate('/');
    }

    // --- RENDERIZAÇÃO ---
    if (loading) return <div>Carregando...</div>;
    if (!session) { navigate('/'); return null; };
    
    const isVideoPanelVisible = callState.inCall || callState.isJoining;

    return (
        <div className="app-container">
            {/* Modal de Chamada Recebida */}
            {callState.incomingCall && (
                <div className="incoming-call-modal">
                     <p>{callState.incomingCall.caller?.username || 'Alguém'} está te ligando...</p>
                    <button onClick={handleJoinCall} className="accept-call">Aceitar</button>
                    <button onClick={handleDeclineCall} className="decline-call">Recusar</button>
                </div>
            )}

            {/* COLUNA: LISTA DE CONTATOS */}
            <aside className="contacts-panel">
                <header className="contacts-header">Contatos</header>
                <ul className="contacts-list">
                    {users.length > 0 ? (
                        users.map(user => (
                            <li 
                                key={user.id} 
                                className={`contact ${selectedUser?.id === user.id ? 'active' : ''}`}
                                onClick={() => handleSelectUser(user)}
                            >
                                <Avatar url={user.avatar_url} size={40} readOnly/>
                                <span style={{marginLeft: '10px'}}>{user.username || 'Usuário'}</span>
                            </li>
                        ))
                    ) : (
                        <p style={{padding: '10px', textAlign: 'center'}}>Nenhum usuário encontrado.</p>
                    )}
                </ul>
            </aside>

            {/* COLUNA: CHAT */}
            <section className="chat-panel" style={{ display: selectedUser && !isVideoPanelVisible ? 'flex' : (selectedUser ? 'none' : 'flex') }}>
                {selectedUser ? (
                    <>
                    <header className="chat-header">
                        <span className="chat-user">{selectedUser.username}</span>
                        <div className="chat-actions">
                            <button className="btn video" title="Iniciar videochamada" onClick={handleCreateCall} disabled={callState.isJoining || callState.inCall}>📹</button>
                            <button className="btn clear" title="Limpar chat" onClick={handleClearChat}>🗑</button>
                            <button className="btn exit" title="Sair" onClick={handleLogout}>Sair</button>
                        </div>
                    </header>

                    <main className="chat-messages">
                        {messages.map(msg => (
                             <div key={msg.id} className={`msg ${msg.sender_id === session.user.id ? 'sent' : 'received'}`}>
                                {msg.is_audio ? (
                                    <AudioPlayer audioUrl={msg.content} />
                                ) : (
                                    msg.content
                                )}
                             </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </main>

                    <footer className="chat-input">
                        <button 
                            className="btn mic" 
                            onMouseDown={handleStartRecording} 
                            onMouseUp={handleStopRecording} 
                            onTouchStart={handleStartRecording} 
                            onTouchEnd={handleStopRecording}
                            style={{ color: isRecording ? 'red' : 'black' }}
                        >
                            🎤
                        </button>
                        <form onSubmit={handleSendMessage} style={{display: 'flex', flex: 1}}>
                            <input 
                                type="text" 
                                placeholder={isRecording ? "Gravando áudio..." : "Digite uma mensagem"}
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                disabled={isRecording}
                            />
                            <button type="submit" className="btn send">➤</button>
                        </form>
                    </footer>
                    </>
                ) : (
                    <div className="chat-placeholder">
                        <h2>Selecione um contato para começar a conversar.</h2>
                    </div>
                )}
            </section>

            {/* COLUNA: VIDEOCHAMADA */}
            {isVideoPanelVisible && (
                 <section className="video-panel">
                    <header className="video-header">
                        <span>Videochamada</span>
                        <button className="btn exit" onClick={handleEndCall}>Sair</button>
                    </header>
                    <div className="video-area">
                        <video ref={remoteVideoRef} autoPlay playsInline className="video remote"></video>
                        <video ref={localVideoRef} autoPlay muted playsInline className="video local"></video>
                    </div>
                     <footer className="video-controls">
                         <button className="vbtn mic">🎤</button>
                         <button className="vbtn cam">📷</button>
                         <button className="vbtn call" onClick={handleCreateCall} style={{display: 'none'}}>📞</button>
                         <button className="vbtn end" onClick={handleEndCall}>⛔</button>
                     </footer>
                 </section>
            )}
        </div>
    );
}

export default ChatPage;
