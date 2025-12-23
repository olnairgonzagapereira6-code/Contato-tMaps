
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Session, RealtimeChannel, User } from '@supabase/supabase-js';
import Avatar from '../Avatar';
import NotificationBell from '../components/NotificationBell';
import './ChatVideoRTC.css';
import { useNavigate } from 'react-router-dom';

// Efeito para registrar o Service Worker uma vez
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('Service Worker registrado com sucesso:', registration);
    }).catch(error => {
      console.log('Falha ao registrar o Service Worker:', error);
    });
  });
}

const peerConnectionConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

interface Profile extends User {
    username: string;
    avatar_url: string;
}

function ChatVideoRTC() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const navigate = useNavigate();

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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rtcChannelRef = useRef<RealtimeChannel | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- EFEITOS (Lifecycle) ---

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        if (data.session) fetchUsers(data.session);
    }).finally(() => setLoading(false));

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        if (!session) {
            setUsers([]);
            setSelectedUser(null);
            cleanupCall();
        } else {
            fetchUsers(session);
        }
    });

    return () => authSub.unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedUser && session) {
      fetchMessages(session.user.id, selectedUser.id);
    }
  }, [selectedUser, session]);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Otimização de Subscrições ---
  useEffect(() => {
    if (!session?.user?.id) return;

    const handleNewMessage = (payload: any) => {
      const isForMe = payload.new.receiver_id === session.user.id && payload.new.sender_id === selectedUser?.id;
      const isFromMe = payload.new.sender_id === session.user.id && payload.new.receiver_id === selectedUser?.id;

      if (selectedUser && (isForMe || isFromMe)) {
          setMessages(currentMessages => [...currentMessages, payload.new]);
      }
    };

    const handleDeletedMessage = (payload: any) => {
      setMessages(currentMessages => currentMessages.filter(msg => msg.id !== payload.old.id));
    };

    const messageChannel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, handleNewMessage)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, handleDeletedMessage)
      .subscribe();

    const callChannel = supabase
      .channel('public:calls')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${session.user.id}` }, 
      (payload) => {
        if (!payload.new.end_time && !callState.inCall) {
          const caller = users.find(u => u.id === payload.new.created_by);
          console.log("Chamada recebida detectada:", payload.new);
          setCallState(prev => ({ ...prev, incomingCall: { ...payload.new, caller } }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, 
      (payload) => {
        if (payload.new.id === callState.callId && payload.new.end_time) {
          console.log("Chamada encerrada remotamente.");
          handleEndCall();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(callChannel);
    };
  }, [session?.user?.id, users, selectedUser, callState.inCall, callState.callId]);


  // --- FUNÇÕES DE DADOS ---

  const fetchUsers = async (currentSession: Session) => {
    const { data, error } = await supabase.from('profiles').select('id, username, avatar_url');
    if (error) {
      console.error("Erro ao buscar usuários:", error);
    } else {
      setUsers(data.filter(u => u.id !== currentSession.user.id) as Profile[]);
    }
  };

  const fetchMessages = async (userId: string, peerId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:sender_id(username, avatar_url)')
      .or(`(sender_id.eq.${userId},receiver_id.eq.${peerId}),(sender_id.eq.${peerId},receiver_id.eq.${userId})`)
      .order('created_at', { ascending: true });

    if (error) console.error("Erro ao buscar mensagens:", error);
    else setMessages(data || []);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session || !selectedUser) return;

    const content = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase.from('messages').insert({
      content,
      sender_id: session.user.id,
      receiver_id: selectedUser.id,
    });

    if (error) {
        alert("Não foi possível enviar a mensagem.");
        console.error("Erro ao enviar mensagem:", error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) {
      alert("Não foi possível apagar a mensagem.");
      console.error("Erro ao apagar mensagem:", error);
    }
    // A remoção da UI é tratada pelo listener de 'DELETE'
  };

  const handleDeleteConversation = async () => {
    if (!session || !selectedUser) return;

    const userConfirmation = window.confirm("Tem certeza de que deseja excluir esta conversa? Suas mensagens serão removidas permanentemente.");
    
    if (userConfirmation) {
      const messageIds = messages.map(msg => msg.id);

      if (messageIds.length > 0) {
        await supabase.from('messages').delete().in('id', messageIds);
      }
      
      setMessages([]);
    }
  };


  // --- FUNÇÕES DE CHAMADA (WebRTC) ---

  const cleanupCall = useCallback(() => {
    console.log("Limpando recursos da chamada...");
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (rtcChannelRef.current) supabase.removeChannel(rtcChannelRef.current).catch(() => {});
    
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    rtcChannelRef.current = null;
    
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    setCallState({ inCall: false, isJoining: false, callId: null, incomingCall: null });
    console.log("Limpeza concluída. Estado da chamada resetado.");
  }, []);

  const setupRtcConnection = async (stream: MediaStream, currentCallId: string, isCaller: boolean) => {
    console.log(`Configurando conexão RTC para callId: ${currentCallId}. É o autor da chamada? ${isCaller}`);
    const pc = new RTCPeerConnection(peerConnectionConfig);
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => {
      console.log("Track remota recebida.");
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    const rtcCh = supabase.channel(`call:${currentCallId}`, { config: { broadcast: { self: true } } });
    rtcChannelRef.current = rtcCh;

    pc.onicecandidate = e => {
      if (e.candidate) {
        console.log("Enviando ICE candidate...");
        rtcCh.send({ type: 'broadcast', event: 'ice-candidate', payload: e.candidate });
      }
    };

    rtcCh.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
      if (payload) {
        console.log("Recebendo ICE candidate...");
        pc.addIceCandidate(new RTCIceCandidate(payload)).catch(e => console.error("Erro ao adicionar ICE candidate:", e));
      }
    });

    if (isCaller) {
      rtcCh.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload && pc.signalingState !== 'stable') {
          console.log("Recebendo resposta (answer)...");
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
        }
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      rtcCh.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          console.log("Canal RTC inscrito. Enviando oferta (offer)...");
          rtcCh.send({ type: 'broadcast', event: 'offer', payload: offer });
        }
      });
    } else { // Is callee
      rtcCh.on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload) {
            console.log("Recebendo oferta (offer)...");
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log("Enviando resposta (answer)...");
            rtcCh.send({ type: 'broadcast', event: 'answer', payload: answer });
        }
      });
      rtcCh.subscribe();
    }
  };

  const getMediaAndStart = async (startFn: (stream: MediaStream) => Promise<void>) => {
    console.log("Tentando acessar dispositivos de mídia (câmera e áudio)...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log("Acesso à mídia bem-sucedido.");
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      // Se a função de início for chamada, a UI de vídeo já deve estar visível
      await startFn(stream);
    } catch (error: any) {
      console.error("----------------------------------------------------");
      console.error("### ERRO CRÍTICO AO ACESSAR MÍDIA ###");
      console.error("Tipo de Erro:", error.name);
      console.error("Mensagem:", error.message);
      console.error("----------------------------------------------------");
      alert(`Falha ao acessar câmera/microfone: ${error.message}. Por favor, verifique as permissões do navegador e se os dispositivos estão conectados.`);
      cleanupCall(); // Limpa e reseta o estado
    }
  };

  const handleCreateCall = async () => {
    console.log("--- INICIANDO NOVA CHAMADA ---");
    if (!session || !selectedUser || callState.inCall) {
      console.log("Pré-condições para chamada não atendidas.");
      return;
    }

    setCallState(prev => ({ ...prev, isJoining: true }));
    console.log("1. Estado 'isJoining' definido como true.");

    await getMediaAndStart(async (stream) => {
      console.log("2. Mídia obtida. Criando registro de chamada no banco de dados...");
      const { data, error } = await supabase.from('calls').insert({
        created_by: session.user.id,
        receiver_id: selectedUser.id,
      }).select().single();

      if (error || !data) {
        console.error("Erro ao criar chamada no DB:", error);
        cleanupCall();
        return;
      }
      
      const newCallId = data.id;
      console.log(`3. Chamada criada no DB com ID: ${newCallId}. Adicionando participante...`);

      const { error: participantError } = await supabase.from('call_participants').insert({
          call_id: newCallId,
          user_id: session.user.id,
      });

      if (participantError) {
          console.error("Erro ao adicionar participante:", participantError);
          await supabase.from('calls').delete().eq('id', newCallId); // Rollback
          cleanupCall();
          return;
      }

      console.log("4. Participante adicionado. ATUALIZANDO ESTADO PARA 'inCall = true'.");
      // Este é o passo crucial para exibir o vídeo
      setCallState(prev => ({ ...prev, callId: newCallId, inCall: true, incomingCall: null, isJoining: false }));
      
      console.log("5. Estado 'inCall' definido como true. Configurando a conexão WebRTC...");
      await setupRtcConnection(stream, newCallId, true);
      console.log("6. Conexão WebRTC configurada.");
    });
  };

  const handleJoinCall = async () => {
    console.log("--- ACEITANDO CHAMADA ---");
    if (!session || !callState.incomingCall) return;
    
    const callerProfile = users.find(u => u.id === callState.incomingCall.created_by);
    if (callerProfile) setSelectedUser(callerProfile);
    
    setCallState(prev => ({ ...prev, isJoining: true }));
    console.log("1. Estado 'isJoining' definido como true.");

    await getMediaAndStart(async (stream) => {
        console.log("2. Mídia obtida. Adicionando participante à chamada...");
        const { id: incomingCallId } = callState.incomingCall;

        const { error: participantError } = await supabase.from('call_participants').insert({
            call_id: incomingCallId,
            user_id: session.user.id,
        });

        if (participantError) {
            console.error("Erro ao adicionar participante:", participantError);
            cleanupCall();
            return;
        }

        console.log("3. Participante adicionado. ATUALIZANDO ESTADO PARA 'inCall = true'.");
        setCallState(prev => ({ 
            ...prev, 
            callId: incomingCallId, 
            inCall: true, 
            incomingCall: null,
            isJoining: false,
        }));

        console.log("4. Estado 'inCall' definido como true. Configurando a conexão WebRTC...");
        await setupRtcConnection(stream, incomingCallId, false);
        console.log("5. Conexão WebRTC configurada.");
    });
  };

  const handleDeclineCall = async () => {
    if (!callState.incomingCall) return;
    await supabase.from('calls').update({ end_time: new Date().toISOString() }).eq('id', callState.incomingCall.id);
    setCallState(prev => ({ ...prev, incomingCall: null }));
  };

  const handleEndCall = useCallback(async () => {
    console.log("--- ENCERRANDO CHAMADA ---");
    const callIdToUpdate = callState.callId;
    
    if (callIdToUpdate && session) {
        await supabase.from('call_participants')
            .update({ left_at: new Date().toISOString() })
            .match({ call_id: callIdToUpdate, user_id: session.user.id });
    }

    cleanupCall(); // A função de limpeza já contém logs

    if (callIdToUpdate) {
      await supabase.from('calls').update({ end_time: new Date().toISOString() }).eq('id', callIdToUpdate);
    }
  }, [callState.callId, cleanupCall, session]);

  const handleExit = () => {
    handleEndCall();
    navigate('/');
  };

  // --- RENDERIZAÇÃO ---

  if (loading) return <div>Carregando...</div>;
  if (!session) return <div>Você precisa estar logado para usar o chat.</div>

  return (
    <div className="chat-page-container">
      <NotificationBell />

      {callState.incomingCall && (
        <div className="incoming-call-modal">
          <div className="incoming-call-content">
            <Avatar url={callState.incomingCall.caller?.avatar_url} size={60} readOnly />
            <h4>{callState.incomingCall.caller?.username || 'Alguém'} está te ligando...</h4>
            <div className="incoming-call-actions">
              <button onClick={handleDeclineCall} className="decline-button">Recusar</button>
              <button onClick={handleJoinCall} className="accept-button">Atender</button>
            </div>
          </div>
        </div>
      )}

      {callState.inCall && (
        <div className="video-container">
          <button onClick={handleExit} className="exit-button">X</button>
          <div className="video-main">
            <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline ></video>
            <video ref={localVideoRef} className="local-video" autoPlay playsInline muted></video>
            <div className="call-controls">
              <button onClick={handleEndCall} className="control-button end-call-button" aria-label="Encerrar chamada">Encerrar</button>
            </div>
          </div>
        </div>
      )}

      <aside className={`user-list-sidebar ${callState.inCall ? 'hidden' : ''}`}>
        <header className="user-list-header">Contatos</header>
        <div className="user-list">
          {users.map(user => (
            <div 
              key={user.id} 
              className={`user-list-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
              onClick={() => setSelectedUser(user)}
            >
              <Avatar url={user.avatar_url} size={40} readOnly />
              <span>{user.username || 'Usuário sem nome'}</span>
            </div>
          ))}
        </div>
      </aside>

      <main className={`chat-area-content ${callState.inCall ? 'hidden' : ''}`}>
        {selectedUser ? (
          <div className="main-chat">
            <header className="chat-header">
              <div className="user-details">
                <Avatar url={selectedUser.avatar_url} size={40} readOnly />
                <span>{selectedUser.username}</span>
              </div>
              <div className="chat-header-controls">
                 <button 
                    onClick={handleCreateCall} 
                    className="video-call-button" 
                    disabled={callState.isJoining || callState.inCall || !!callState.incomingCall}
                  >
                    {callState.isJoining ? 'Iniciando...' : 'Ligar'}
                  </button>
                  <button onClick={handleDeleteConversation} className="delete-conversation-button" aria-label="Excluir conversa">
                    Excluir Conversa
                  </button>
              </div>
            </header>

            <main className="message-area">
              {messages.map(msg => (
                <div key={msg.id} className={`message-wrapper ${msg.sender_id === session.user.id ? 'outgoing-wrapper' : 'incoming-wrapper'}`}>
                  <div className={`message ${msg.sender_id === session.user.id ? 'outgoing' : 'incoming'}`}>
                    <p>{msg.content}</p>
                  </div>
                  {msg.sender_id === session.user.id && (
                    <button onClick={() => handleDeleteMessage(msg.id)} className="delete-message-button" aria-label="Apagar mensagem">
                      🗑️
                    </button>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </main>

            <footer className="message-input">
              <form onSubmit={handleSendMessage} style={{ display: 'flex', width: '100%' }}>
                <input 
                  type="text" 
                  placeholder="Digite sua mensagem..." 
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  disabled={callState.inCall}
                />
                <button type="submit" disabled={callState.inCall}>Enviar</button>
              </form>
            </footer>
          </div>
        ) : (
          <div className="chat-placeholder">
            <h2>Selecione um usuário para começar a conversar</h2>
          </div>
        )}
      </main>
    </div>
  );
}

export default ChatVideoRTC;
