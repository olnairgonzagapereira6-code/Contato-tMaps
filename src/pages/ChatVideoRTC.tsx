
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Session, RealtimeChannel, User } from '@supabase/supabase-js';
import Avatar from '../Avatar';
import './ChatVideoRTC.css';

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

    const messageChannel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, 
      (payload) => {
        const isForMe = payload.new.receiver_id === session.user.id && payload.new.sender_id === selectedUser?.id;
        const isFromMe = payload.new.sender_id === session.user.id && payload.new.receiver_id === selectedUser?.id;

        if (selectedUser && (isForMe || isFromMe)) {
            setMessages(currentMessages => [...currentMessages, payload.new]);
        }
      })
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

  // --- FUNÇÕES DE CHAMADA (WebRTC) ---

  const cleanupCall = useCallback(() => {
    console.log("Cleaning up call resources...");
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (rtcChannelRef.current) supabase.removeChannel(rtcChannelRef.current).catch(() => {});
    
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    rtcChannelRef.current = null;
    
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    setCallState({ inCall: false, isJoining: false, callId: null, incomingCall: null });
  }, []);

  const setupRtcConnection = async (stream: MediaStream, currentCallId: string, isCaller: boolean) => {
    const pc = new RTCPeerConnection(peerConnectionConfig);
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    const rtcCh = supabase.channel(`call:${currentCallId}`, { config: { broadcast: { self: true } } });
    rtcChannelRef.current = rtcCh;

    pc.onicecandidate = e => e.candidate && rtcCh.send({ type: 'broadcast', event: 'ice-candidate', payload: e.candidate });

    rtcCh.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
        if (payload) pc.addIceCandidate(new RTCIceCandidate(payload));
    });

    if (isCaller) {
      rtcCh.on('broadcast', { event: 'answer' }, ({ payload }) => {
        if (payload) pc.setRemoteDescription(new RTCSessionDescription(payload));
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
      alert(`Falha ao obter mídia: ${error.message}`);
      console.error("Erro de mídia:", error);
      cleanupCall();
    }
  };

  const handleCreateCall = async () => {
    if (!session || !selectedUser || callState.inCall) return;

    setCallState(prev => ({ ...prev, isJoining: true }));
    await getMediaAndStart(async (stream) => {
      // 1. Criar a chamada
      const { data, error } = await supabase.from('calls').insert({
        created_by: session.user.id,
        receiver_id: selectedUser.id,
      }).select().single();

      if (error || !data) {
        console.error("Erro ao criar chamada:", error);
        cleanupCall();
        return;
      }
      
      const newCallId = data.id;

      // 2. Adicionar o criador como participante
      const { error: participantError } = await supabase.from('call_participants').insert({
          call_id: newCallId,
          user_id: session.user.id,
      });

      if (participantError) {
          console.error("Erro ao inserir criador na chamada:", participantError);
          // Tenta reverter a chamada criada
          await supabase.from('calls').delete().eq('id', newCallId);
          cleanupCall();
          return;
      }

      // 3. Continuar com o estado e WebRTC
      setCallState(prev => ({ ...prev, callId: newCallId, inCall: true, incomingCall: null, isJoining: false }));
      await setupRtcConnection(stream, newCallId, true);
    });
  };

  const handleJoinCall = async () => {
    if (!session || !callState.incomingCall) return;
    
    const callerProfile = users.find(u => u.id === callState.incomingCall.created_by);
    if (callerProfile) setSelectedUser(callerProfile);
    
    setCallState(prev => ({ ...prev, isJoining: true }));

    await getMediaAndStart(async (stream) => {
        const { id: incomingCallId } = callState.incomingCall;

        // 1. Adicionar o usuário que atende como participante
        const { error: participantError } = await supabase.from('call_participants').insert({
            call_id: incomingCallId,
            user_id: session.user.id,
        });

        if (participantError) {
            console.error("Erro ao inserir participante na chamada:", participantError);
            cleanupCall();
            return;
        }

        // 2. Continuar com o estado e WebRTC
        setCallState(prev => ({ 
            ...prev, 
            callId: incomingCallId, 
            inCall: true, 
            incomingCall: null,
            isJoining: false,
        }));
        await setupRtcConnection(stream, incomingCallId, false);
    });
  };

  const handleDeclineCall = async () => {
    if (!callState.incomingCall) return;
    await supabase.from('calls').update({ end_time: new Date().toISOString() }).eq('id', callState.incomingCall.id);
    setCallState(prev => ({ ...prev, incomingCall: null }));
  };

  const handleEndCall = useCallback(async () => {
    const callIdToUpdate = callState.callId;
    
    // Atualiza o 'left_at' para o usuário atual
    if (callIdToUpdate && session) {
        await supabase.from('call_participants')
            .update({ left_at: new Date().toISOString() })
            .match({ call_id: callIdToUpdate, user_id: session.user.id });
    }

    cleanupCall(); // Limpa estados locais primeiro

    // Encerra a chamada na tabela 'calls'
    if (callIdToUpdate) {
      await supabase.from('calls').update({ end_time: new Date().toISOString() }).eq('id', callIdToUpdate);
    }
  }, [callState.callId, cleanupCall, session]);

  // --- RENDERIZAÇÃO ---

  if (loading) return <div>Carregando...</div>;
  if (!session) return <div>Você precisa estar logado para usar o chat.</div>

  return (
    <div className="chat-page-container">
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
              <div className="video-call-controls">
                 <button 
                    onClick={handleCreateCall} 
                    className="video-call-button" 
                    disabled={callState.isJoining || callState.inCall || !!callState.incomingCall}
                  >
                    {callState.isJoining ? 'Iniciando...' : 'Ligar'}
                  </button>
              </div>
            </header>

            <main className="message-area">
              {messages.map(msg => (
                <div key={msg.id} className={`message ${msg.sender_id === session.user.id ? 'outgoing' : 'incoming'}`}>
                  <p>{msg.content}</p>
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
