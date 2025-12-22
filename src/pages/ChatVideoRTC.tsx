import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Session, RealtimeChannel } from '@supabase/supabase-js';
import './ChatVideoRTC.css';

const peerConnectionConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function ChatVideoRTC() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [incomingCallId, setIncomingCallId] = useState<string | null>(null);
  const [isJoiningCall, setIsJoiningCall] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rtcChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // --- Autenticação ---
    supabase.auth.getSession().then(({data}) => setSession(data.session)).finally(() => setLoading(false));
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));

    // --- Assinatura Realtime para a tabela de chamadas ---
    const callChannel = supabase.channel('public:calls')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, (payload) => {
        // Se uma nova chamada for criada e não for por mim, é uma chamada recebida.
        if (payload.new.created_by !== session?.user.id && !payload.new.end_time) {
          console.log("Chamada recebida detectada:", payload.new.id);
          setIncomingCallId(payload.new.id);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, (payload) => {
        // Se a chamada recebida for encerrada, remove o aviso.
        if (payload.new.id === incomingCallId && payload.new.end_time) {
          setIncomingCallId(null);
        }
      })
      .subscribe();

    return () => {
      authSub.unsubscribe();
      supabase.removeChannel(callChannel);
      cleanupCall();
    };
  }, [session, incomingCallId]);

  const cleanupCall = () => {
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (rtcChannelRef.current) supabase.removeChannel(rtcChannelRef.current);
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    rtcChannelRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  // Configura a sinalização e a conexão WebRTC
  const setupRtcConnection = async (stream: MediaStream, currentCallId: string, isCaller: boolean) => {
    const pc = new RTCPeerConnection(peerConnectionConfig);
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    const rtcChannel = supabase.channel(`call:${currentCallId}`, { config: { broadcast: { self: true } } });
    rtcChannelRef.current = rtcChannel;

    pc.onicecandidate = e => e.candidate && rtcChannel.send({ type: 'broadcast', event: 'ice-candidate', payload: e.candidate });

    rtcChannel.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => pc.addIceCandidate(new RTCIceCandidate(payload)));

    if (isCaller) {
      rtcChannel.on('broadcast', { event: 'answer' }, ({ payload }) => pc.setRemoteDescription(new RTCSessionDescription(payload)));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      rtcChannel.subscribe(status => {
        if (status === 'SUBSCRIBED') rtcChannel.send({ type: 'broadcast', event: 'offer', payload: offer });
      });
    } else {
      rtcChannel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        rtcChannel.send({ type: 'broadcast', event: 'answer', payload: answer });
      });
      rtcChannel.subscribe();
    }
  };
  
  const getMediaAndStart = async (startFn: (stream: MediaStream) => Promise<void>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      await startFn(stream);
    } catch (error: any) {
      if (error.name === 'NotAllowedError') alert('Permissão de câmera/microfone negada.');
      else if (error.name === 'NotReadableError') alert('Câmera ou microfone já em uso.');
      else alert('Não foi possível iniciar a chamada.');
      cleanupCall();
      setInCall(false);
    }
  }

  const handleCreateCall = async () => {
    if (!session) return;
    setIsJoiningCall(true);
    await getMediaAndStart(async (stream) => {
        const { data } = await supabase.from('calls').insert({ created_by: session.user.id }).select().single();
        const newCallId = data!.id;
        setCallId(newCallId);
        setInCall(true);
        setIncomingCallId(null);
        await setupRtcConnection(stream, newCallId, true);
    });
    setIsJoiningCall(false);
  };

  const handleJoinCall = async () => {
    if (!session || !incomingCallId) return;
    setIsJoiningCall(true);
    await getMediaAndStart(async (stream) => {
        setCallId(incomingCallId);
        setInCall(true);
        setIncomingCallId(null);
        await setupRtcConnection(stream, incomingCallId, false);
    });
    setIsJoiningCall(false);
  };

  const handleEndCall = async () => {
    const callIdToUpdate = callId;
    cleanupCall();
    setInCall(false);
    setCallId(null);
    if (callIdToUpdate) {
        await supabase.from('calls').update({ end_time: new Date().toISOString() }).eq('id', callIdToUpdate);
    }
  };

  if (loading) return <div>Carregando...</div>;
  
  return (
    <div className="chat-container" role="main">
      {inCall ? (
        <div className="video-container">
          <div className="video-main">
            <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline ></video>
            <video ref={localVideoRef} className="local-video" autoPlay playsInline muted></video>
            <div className="call-controls">
              <button onClick={handleEndCall} className="control-button" aria-label="Encerrar chamada">📞</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="main-chat">
           <header className="chat-header">
            <div className="user-details">
              <img src="https://placekitten.com/40/40" alt="Avatar" />
              <span>Usuário 2</span>
            </div>
            { incomingCallId ? (
              <div className="incoming-call-controls">
                <span>Chamada de vídeo recebida!</span>
                <button onClick={handleJoinCall} disabled={isJoiningCall} className="video-call-button">
                  {isJoiningCall ? 'Atendendo...' : 'Atender'}
                </button>
              </div>
            ) : (
              <button onClick={handleCreateCall} className="video-call-button" disabled={isJoiningCall}>
                {isJoiningCall ? 'Iniciando...' : 'Iniciar Chamada de Vídeo'}
              </button>
            )}
          </header>
          <main className="message-area">
            <div className="message incoming"><p>Olá! Tudo bem?</p></div>
            <div className="message outgoing"><p>Tudo ótimo, e com você?</p></div>
          </main>
          <footer className="message-input">
            <input type="text" placeholder="Digite sua mensagem..." />
            <button>Enviar</button>
          </footer>
        </div>
      )}
    </div>
  );
}

export default ChatVideoRTC;
