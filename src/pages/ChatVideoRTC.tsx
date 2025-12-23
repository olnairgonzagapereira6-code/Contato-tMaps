
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
  const navigate = useNavigate();
  const location = useLocation();
  
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  // --- Novos estados para gravação de áudio ---
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
  }, []);

  useEffect(() => {
      if (location.state?.selectedUser) {
          setSelectedUser(location.state.selectedUser);
      }
  }, [location.state]);

  useEffect(() => {
    if (selectedUser && session) {
      fetchMessages(session.user.id, selectedUser.id);
    }
  }, [selectedUser, session]);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Efeito para monitorar o estado da tela cheia
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

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
          // Precisamos buscar o perfil do chamador
          supabase.from('profiles').select('id, username, avatar_url').eq('id', payload.new.created_by).single().then(({ data: caller }) => {
            console.log("Chamada recebida detectada:", payload.new);
            setCallState(prev => ({ ...prev, incomingCall: { ...payload.new, caller } }));
          });
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
  }, [session?.user?.id, selectedUser, callState.inCall, callState.callId]);


  // --- FUNÇÕES DE DADOS ---

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
      is_audio: false, // Adicionado para diferenciar
    });

    if (error) {
        alert("Não foi possível enviar a mensagem.");
        console.error("Erro ao enviar mensagem:", error);
    }
  };

  const handleCopyMessage = async (message: any) => {
    try {
      if (message.is_audio) {
        // Tenta usar a API de compartilhamento para áudios (melhor para mobile)
        if (navigator.share) {
          await navigator.share({
            title: 'Áudio compartilhado',
            text: `Mensagem de áudio de ${message.sender.username}`,
            url: message.content,
          });
        } else {
          // Fallback para copiar o link se a API de compartilhamento não estiver disponível
          await navigator.clipboard.writeText(message.content);
          alert('Link do áudio copiado para a área de transferência!');
        }
      } else {
        // Copia o texto da mensagem
        await navigator.clipboard.writeText(message.content);
        alert('Mensagem copiada!');
      }
    } catch (error) {
      console.error("Falha ao copiar/compartilhar:", error);
      alert("Não foi possível copiar ou compartilhar o conteúdo.");
    } finally {
        setSelectedMessageId(null); // Esconde o botão após a ação
    }
  };

  // --- FUNÇÕES DE MENSAGEM DE ÁUDIO ---

  const handleStartRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = event => {
            audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            await handleSendAudio(audioBlob);
            // Limpa as faixas de mídia para desligar o indicador do microfone
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

    const { error: uploadError } = await supabase.storage
        .from('audio_messages')
        .upload(filePath, audioBlob, {
            cacheControl: '3600',
            upsert: false,
        });

    if (uploadError) {
        console.error('Erro no upload do áudio:', uploadError);
        alert('Falha ao enviar o áudio.');
        return;
    }

    const { data: urlData } = supabase.storage
      .from('audio_messages')
      .getPublicUrl(filePath);

    if (!urlData) {
      console.error('Não foi possível obter a URL pública do áudio.');
      alert('Falha ao processar o áudio enviado.');
      return;
    }
    
    const publicURL = urlData.publicUrl;

    const { error: messageError } = await supabase.from('messages').insert({
        content: publicURL,
        sender_id: session.user.id,
        receiver_id: selectedUser.id,
        is_audio: true,
    });

    if (messageError) {
        console.error('Erro ao salvar a mensagem de áudio:', messageError);
        alert('Falha ao salvar a mensagem de áudio.');
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

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
        videoContainerRef.current?.requestFullscreen().catch(err => {
            console.error(`Erro ao tentar ativar o modo de tela cheia: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
  }, []);

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
    
    // Define o usuário selecionado como o chamador
    if (callState.incomingCall.caller) {
        setSelectedUser(callState.incomingCall.caller);
    }
    
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

    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    
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

  // Renderiza o botão de ação principal (Enviar vs Gravar)
  const renderMainActionButton = () => {
    if (newMessage.trim()) {
      return (
        <button type="submit" aria-label="Enviar mensagem">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      );
    }
    return (
      <button type="button" onClick={isRecording ? handleStopRecording : handleStartRecording} aria-label={isRecording ? 'Parar gravação' : 'Iniciar gravação'}>
        {isRecording ? 
            <svg viewBox="0 0 24 24" width="24" height="24" fill="red"><path d="M12 14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2S10 4.9 10 6v6c0 1.1.9 2 2 2zm-1-8c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V6zm5 4h-1v1c0 2.76-2.24 5-5 5s-5-2.24-5-5v-1H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92z"/></svg> : 
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2S10 4.9 10 6v6c0 1.1.9 2 2 2zm-1-8c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V6zm5 4h-1v1c0 2.76-2.24 5-5 5s-5-2.24-5-5v-1H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92z"/></svg>
        }
      </button>
    );
  };

  return (
    <div className="chat-page-container" onClick={() => setSelectedMessageId(null)}>
        {/* Modais de Chamada (ficam fora do layout principal) */}
        <NotificationBell />
        {callState.incomingCall && (
            <div className="incoming-call-modal">
                {/* ... conteúdo do modal de chamada recebida ... */}
            </div>
        )}
        {callState.inCall && (
            <div className="video-container" ref={videoContainerRef}>
                {/* ... conteúdo da video chamada ... */}
            </div>
        )}

        {/* Conteúdo principal do Chat */}
        {!callState.inCall && (
            selectedUser ? (
            <>
                <header className="chat-header">
                    <Avatar url={selectedUser.avatar_url} size={40} readOnly />
                    <div className="chat-with">{selectedUser.username}</div>
                    {/* Botões de ação do cabeçalho podem ser adicionados aqui */}
                </header>

                <main className="messages-area">
                {messages.map(msg => (
                    <div 
                      key={msg.id} 
                      className={`message-bubble ${msg.sender_id === session.user.id ? 'sent' : 'received'}`}
                      onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id);
                      }}
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
                    <form onSubmit={handleSendMessage} style={{ display: 'flex', flexGrow: 1 }}>
                        <input 
                            type="text" 
                            placeholder="Mensagem" 
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            disabled={isRecording}
                        />
                        {/* O botão será renderizado fora do form para alternar a função */} 
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
