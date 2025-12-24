import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Session, RealtimeChannel, User } from '@supabase/supabase-js';
import Avatar from '../Avatar';
import NotificationBell from '../components/NotificationBell';
import './ChatVideoRTC.css';
import { useNavigate, useLocation } from 'react-router-dom';

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

// Configuração de servidores STUN/TURN aprimorada
const peerConnectionConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

interface Profile extends User {
    username: string;
    avatar_url: string;
}

function ChatVideoRTC() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

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
  const [isFullscreen, setIsFullscreen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rtcChannelRef = useRef<RealtimeChannel | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // --- EFEITOS (Lifecycle) ---

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

    setCallState(prev => ({ ...prev, inCall: false, isJoining: false, callId: null, incomingCall: null }));
    console.log("Limpeza concluída. Estado da chamada resetado.");
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
    }).finally(() => setLoading(false));

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        if (!session) {
            setSelectedUser(null);
            cleanupCall();
        }
    });

    return () => authSub.unsubscribe();
  }, [cleanupCall]);

  useEffect(() => {
      if (location.state?.selectedUser) {
          setSelectedUser(location.state.selectedUser);
      }
  }, [location.state]);

  const fetchMessages = async (userId: string, peerId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:sender_id(username, avatar_url)')
      .or(`(sender_id.eq.${userId},receiver_id.eq.${peerId}),(sender_id.eq.${peerId},receiver_id.eq.${userId})`)
      .order('created_at', { ascending: true });

    if (error) console.error("Erro ao buscar mensagens:", error);
    else setMessages(data || []);
  };

  useEffect(() => {
    if (selectedUser && session) {
      fetchMessages(session.user.id, selectedUser.id);
    }
  }, [selectedUser, session]);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleEndCall = useCallback(async () => {
    console.log("--- ENCERRANDO CHAMADA ---");
    const callIdToUpdate = callState.callId;

    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    
    cleanupCall(); 

    if (callIdToUpdate) {
      // Notifica o outro lado que a chamada terminou
      await supabase.from('calls').update({ end_time: new Date().toISOString(), status: 'encerrada' }).eq('id', callIdToUpdate);
    }
  }, [callState.callId, cleanupCall]);


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
        // Ignora chamadas que já terminaram ou se já estiver em uma
        if (!payload.new.end_time && !callState.inCall) {
          // Busca o perfil de quem está ligando
          supabase.from('profiles').select('id, username, avatar_url').eq('id', payload.new.caller_id).single().then(({ data: caller }) => {
            console.log("Chamada recebida detectada:", payload.new);
            setCallState(prev => ({ ...prev, incomingCall: { ...payload.new, caller } }));
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, 
      (payload) => {
        // Se a chamada atual foi atualizada com um end_time, encerra
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
  }, [session?.user?.id, selectedUser, callState.inCall, callState.callId, handleEndCall]);


  // --- FUNÇÕES DE MENSAGENS ---

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session || !selectedUser) return;

    const content = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase.from('messages').insert({
      content,
      sender_id: session.user.id,
      receiver_id: selectedUser.id,
      is_audio: false,
    });

    if (error) {
        alert("Não foi possível enviar a mensagem.");
        console.error("Erro ao enviar mensagem:", error);
    }
  };

  const handleCopyMessage = async (message: any) => {
    try {
      if (message.is_audio) {
        if (navigator.share) {
          await navigator.share({ title: 'Áudio compartilhado', text: `Mensagem de áudio de ${message.sender.username}`, url: message.content });
        } else {
          await navigator.clipboard.writeText(message.content);
          alert('Link do áudio copiado para a área de transferência!');
        }
      } else {
        await navigator.clipboard.writeText(message.content);
        alert('Mensagem copiada!');
      }
    } catch (error) {
      console.error("Falha ao copiar/compartilhar:", error);
      alert("Não foi possível copiar ou compartilhar o conteúdo.");
    } finally {
        setSelectedMessageId(null);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) {
      alert("Não foi possível apagar a mensagem.");
      console.error("Erro ao apagar mensagem:", error);
    }
  };
  
  // --- FUNÇÕES DE MENSAGEM DE ÁUDIO ---

  const handleStartRecording = async () => {
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
        console.error("Erro ao iniciar a gravação de áudio:", error);
        alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
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
        alert('Falha ao enviar o áudio.');
        return;
    }

    const { data: urlData } = supabase.storage.from('audio_messages').getPublicUrl(filePath);
    if (!urlData) {
      console.error('Não foi possível obter a URL pública do áudio.');
      return;
    }
    
    const { error: messageError } = await supabase.from('messages').insert({ content: urlData.publicUrl, sender_id: session.user.id, receiver_id: selectedUser.id, is_audio: true });
    if (messageError) console.error('Erro ao salvar a mensagem de áudio:', messageError);
  };

  // --- FUNÇÕES DE CHAMADA (WebRTC) ---

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
        videoContainerRef.current?.requestFullscreen().catch(err => console.error(`Erro ao ativar tela cheia: ${err.message}`));
    } else {
        document.exitFullscreen();
    }
  }, []);

  const setupRtcConnection = async (stream: MediaStream, currentCallId: string, isCaller: boolean) => {
    console.log(`Configurando RTC para callId: ${currentCallId}. É o autor da chamada? ${isCaller}`);
    const pc = new RTCPeerConnection(peerConnectionConfig);
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => {
      console.log('Remote stream received!', event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    const rtcCh = supabase.channel(`call:${currentCallId}`, { config: { broadcast: { self: true } } });
    rtcChannelRef.current = rtcCh;

    pc.onicecandidate = e => {
      if (e.candidate) {
        rtcCh.send({ type: 'broadcast', event: 'ice-candidate', payload: e.candidate });
      }
    };

    rtcCh.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
      if (payload) {
        pc.addIceCandidate(new RTCIceCandidate(payload)).catch(e => console.error("Erro ao adicionar ICE candidate:", e));
      }
    });

    if (isCaller) {
      rtcCh.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
        }
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      rtcCh.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          rtcCh.send({ type: 'broadcast', event: 'offer', payload: offer });
        }
      });
    } else { // Receiver
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
      alert(`Falha ao acessar câmera/microfone: ${error.message}. Verifique as permissões do navegador.`);
      cleanupCall();
    }
  };

  const handleCreateCall = async () => {
    if (!session || !selectedUser || callState.inCall) return;

    setCallState(prev => ({ ...prev, isJoining: true }));

    await getMediaAndStart(async (stream) => {
      const { data, error } = await supabase.from('calls').insert({ caller_id: session.user.id, receiver_id: selectedUser.id, status: 'iniciada' }).select().single();

      if (error || !data) {
        console.error("Erro ao criar chamada no DB:", error);
        cleanupCall();
        return;
      }
      
      const newCallId = data.id;
      setCallState(prev => ({ ...prev, callId: newCallId, inCall: true, incomingCall: null, isJoining: false }));
      await setupRtcConnection(stream, newCallId, true);
    });
  };

  const handleJoinCall = async () => {
    if (!session || !callState.incomingCall) return;
    
    if (!selectedUser && callState.incomingCall.caller) {
      setSelectedUser(callState.incomingCall.caller);
    }
    
    setCallState(prev => ({ ...prev, isJoining: true }));

    await getMediaAndStart(async (stream) => {
        const { id: incomingCallId } = callState.incomingCall;

        // Atualiza o status da chamada para 'atendida'
        await supabase.from('calls').update({ status: 'atendida' }).eq('id', incomingCallId);

        setCallState(prev => ({ ...prev, callId: incomingCallId, inCall: true, incomingCall: null, isJoining: false }));
        await setupRtcConnection(stream, incomingCallId, false);
    });
  };

  const handleDeclineCall = async () => {
    if (!callState.incomingCall) return;
    await supabase.from('calls').update({ end_time: new Date().toISOString(), status: 'recusada' }).eq('id', callState.incomingCall.id);
    setCallState(prev => ({ ...prev, incomingCall: null }));
  };

  // --- RENDERIZAÇÃO ---

  if (loading) return <div>Carregando...</div>;
  if (!session) return <div>Você precisa estar logado para usar o chat.</div>

  const renderMainActionButton = () => {
    if (newMessage.trim()) {
      return (
        <button type="submit" form="message-form" aria-label="Enviar mensagem">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      );
    }
    return (
      <button type="button" onMouseDown={handleStartRecording} onMouseUp={handleStopRecording} onTouchStart={handleStartRecording} onTouchEnd={handleStopRecording} aria-label={isRecording ? 'Parar gravação' : 'Iniciar gravação'}>
        {isRecording ? 
            <svg viewBox="0 0 24 24" width="24" height="24" fill="red"><path d="M12 14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2S10 4.9 10 6v6c0 1.1.9 2 2 2zm-1-8c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V6zm5 4h-1v1c0 2.76-2.24 5-5 5s-5-2.24-5-5v-1H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92z"/></svg> : 
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2S10 4.9 10 6v6c0 1.1.9 2 2 2zm-1-8c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V6zm5 4h-1v1c0 2.76-2.24 5-5 5s-5-2.24-5-5v-1H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92z"/></svg>
        }
      </button>
    );
  };

  return (
    <div className="chat-page-container" onClick={() => setSelectedMessageId(null)}>
        <NotificationBell />

        {callState.incomingCall && (
            <div className="incoming-call-modal">
                <p>{callState.incomingCall.caller?.username || 'Alguém'} está te ligando...</p>
                <button onClick={handleJoinCall} className="accept-call">Aceitar</button>
                <button onClick={handleDeclineCall} className="decline-call">Recusar</button>
            </div>
        )}

        {callState.inCall && (
            <div className="video-container" ref={videoContainerRef}>
                <video ref={localVideoRef} autoPlay muted playsInline className="local-video"></video>
                <video ref={remoteVideoRef} autoPlay playsInline className="remote-video"></video>
                <div className="call-controls">
                    <button onClick={handleEndCall} className="end-call">Encerrar</button>
                    <button onClick={toggleFullscreen}>{isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}</button>
                </div>
            </div>
        )}

        {!callState.inCall && (
            selectedUser ? (
            <>
                <header className="chat-header">
                    <button onClick={() => navigate('/contacts')} className="back-button">←</button>
                    <Avatar url={selectedUser.avatar_url} size={40} readOnly />
                    <div className="chat-with">{selectedUser.username}</div>
                    <div className="header-actions">
                      <button onClick={handleCreateCall} disabled={callState.isJoining}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                      </button>
                    </div>
                </header>

                <main className="messages-area">
                {messages.map(msg => (
                    <div 
                      key={msg.id} 
                      className={`message-bubble ${msg.sender_id === session.user.id ? 'sent' : 'received'}`}
                      onClick={(e) => { e.stopPropagation(); setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id); }}
                    >
                      {selectedMessageId === msg.id && (
                          <div className="message-actions">
                              <button onClick={() => handleCopyMessage(msg)}>Copiar</button>
                              {msg.sender_id === session.user.id && (
                                <button onClick={() => handleDeleteMessage(msg.id)}>Apagar</button>
                              )}
                          </div>
                      )}
                      
                      {msg.is_audio ? (
                        <audio controls src={msg.content} style={{maxWidth: '100%'}}></audio>
                      ) : (
                        <p className="message-content">{msg.content}</p>
                      )}
                       <span className="message-timestamp">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                ))}
                <div ref={messagesEndRef} />
                </main>

                <footer className="message-input-area">
                    <form id="message-form" onSubmit={handleSendMessage} style={{ display: 'flex', flexGrow: 1 }}>
                        <input 
                            type="text" 
                            placeholder={isRecording ? 'Gravando...' : 'Mensagem'}
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            disabled={isRecording}
                        />
                    </form>
                    {renderMainActionButton()}
                </footer>
            </>
            ) : (
                <div className="chat-placeholder">
                    <h2>Selecione um contato para começar a conversar</h2>
                    <button onClick={() => navigate('/contacts')} className="select-contact-button">
                        Ver Contatos
                    </button>
                </div>
            )
        )}
    </div>
  );
}

export default ChatVideoRTC;
