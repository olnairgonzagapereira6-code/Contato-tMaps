import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { RealtimeChannel, Session } from '@supabase/supabase-js';
import './CallPage.css';
import { Call } from '../types';

const peerConnectionConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
};

function CallPage() {
    const { callId } = useParams();
    const navigate = useNavigate();
    const [session, setSession] = useState<Session | null>(null);
    const [call, setCall] = useState<Call | null>(null);
    const [status, setStatus] = useState('Conectando...');

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const rtcChannelRef = useRef<RealtimeChannel | null>(null);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    
    const [isMicMuted, setMicMuted] = useState(false);
    const [isVideoEnabled, setVideoEnabled] = useState(true);

    const cleanup = useCallback(() => {
        console.log('Cleaning up call resources...');
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (rtcChannelRef.current) {
            supabase.removeChannel(rtcChannelRef.current);
            rtcChannelRef.current = null;
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/');
                return;
            }
            setSession(session);

            const { data: callData, error } = await supabase.from('calls').select('*').eq('id', callId).single();
            if (error || !callData) {
                console.error('Call not found');
                navigate('/chat');
                return;
            }
            setCall(callData as Call);
            initCall(session.user.id, callData as Call);
        };
        init();

        window.addEventListener('beforeunload', cleanup);

        return () => {
            cleanup();
            window.removeEventListener('beforeunload', cleanup);
        };
    }, [callId, navigate, cleanup]);

    const initCall = async (userId: string, callData: Call) => {
        try {
            setStatus('Iniciando câmera e microfone...');
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            peerConnectionRef.current = new RTCPeerConnection(peerConnectionConfig);
            
            stream.getTracks().forEach(track => peerConnectionRef.current!.addTrack(track, stream));

            peerConnectionRef.current.onicecandidate = event => {
                if (event.candidate && rtcChannelRef.current) {
                    rtcChannelRef.current.send({
                        type: 'broadcast',
                        event: 'ice-candidate',
                        payload: { candidate: event.candidate },
                    });
                }
            };

            peerConnectionRef.current.ontrack = event => {
                remoteStreamRef.current = event.streams[0];
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = remoteStreamRef.current;
                }
                setStatus('Conectado');
            };
            
            peerConnectionRef.current.onconnectionstatechange = () => {
                const state = peerConnectionRef.current?.connectionState;
                if (state === 'disconnected' || state === 'closed' || state === 'failed') {
                    handleHangUp();
                }
            };

            setupRtcChannel(userId, callData.id);
            
            if (callData.caller_id === userId) {
                setStatus('Chamando...');
                const offer = await peerConnectionRef.current.createOffer();
                await peerConnectionRef.current.setLocalDescription(offer);
                rtcChannelRef.current!.send({
                    type: 'broadcast',
                    event: 'offer',
                    payload: { offer },
                });
            }

        } catch (error) {
            console.error("Error initializing call:", error);
            setStatus('Falha ao iniciar. Verifique as permissões.');
        }
    };
    
    const setupRtcChannel = (userId: string, currentCallId: string) => {
        const channel = supabase.channel(`call:${currentCallId}`, { config: { broadcast: { self: false } } });

        channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
            if (call?.callee_id === userId) {
                 await peerConnectionRef.current!.setRemoteDescription(new RTCSessionDescription(payload.offer));
                 const answer = await peerConnectionRef.current!.createAnswer();
                 await peerConnectionRef.current!.setLocalDescription(answer);
                 channel.send({ type: 'broadcast', event: 'answer', payload: { answer } });
            }
        });

        channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
             if (call?.caller_id === userId) {
                await peerConnectionRef.current!.setRemoteDescription(new RTCSessionDescription(payload.answer));
             }
        });

        channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
            await peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(payload.candidate));
        });

        channel.on('broadcast', { event: 'hang-up' }, () => {
            setStatus('Chamada finalizada');
            setTimeout(handleHangUp, 1500);
        });

        channel.subscribe();
        rtcChannelRef.current = channel;
    };

    const handleHangUp = useCallback(async () => {
        cleanup();
        if (rtcChannelRef.current) {
            rtcChannelRef.current.send({ type: 'broadcast', event: 'hang-up' });
        }
        if (callId) {
            await supabase.from('calls').update({ status: 'ended' }).eq('id', callId);
        }
        navigate('/chat');
    }, [callId, navigate, cleanup]);

    const toggleMic = () => {
        localStreamRef.current?.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
            setMicMuted(!track.enabled);
        });
    };

    const toggleVideo = () => {
        localStreamRef.current?.getVideoTracks().forEach(track => {
            track.enabled = !track.enabled;
            setVideoEnabled(!track.enabled);
        });
    };

    return (
        <div className="call-container">
            <div className="call-status">{status}</div>
            <div className="call-videos">
                <video id="remote-video" ref={remoteVideoRef} autoPlay playsInline></video>
                <video id="local-video" ref={localVideoRef} autoPlay playsInline muted></video>
            </div>
            <div className="call-controls">
                <button onClick={toggleMic} className={`call-btn mute-mic ${isMicMuted ? 'inactive' : ''}`}>
                    {isMicMuted ? '🔇' : '🎤'}
                </button>
                <button onClick={handleHangUp} className="call-btn hang-up">
                    📞
                </button>
                 <button onClick={toggleVideo} className={`call-btn toggle-video ${!isVideoEnabled ? 'inactive' : ''}`}>
                    {isVideoEnabled ? '📹' : '🚫'}
                </button>
            </div>
        </div>
    );
}

export default CallPage;
