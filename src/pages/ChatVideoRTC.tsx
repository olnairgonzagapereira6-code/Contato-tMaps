
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import Avatar from '../Avatar';
import NotificationBell from '../components/NotificationBell';
import AudioPlayer from '../components/AudioPlayer';
import './ChatVideoRTC.css';
import { useNavigate, useLocation } from 'react-router-dom';

// --- Ícones ---
const VideoIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72a12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const TrashIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const MicIcon = () => <svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2S10 4.9 10 6v6c0 1.1.9 2 2 2zm-1-8c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V6zm5 4h-1v1c0 2.76-2.24 5-5 5s-5-2.24-5-5v-1H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92z"/></svg>;
const RecordingIcon = () => <svg viewBox="0 0 24 24" width="24" height="24" fill="red"><path d="M12 14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2S10 4.9 10 6v6c0 1.1.9 2 2 2z"/></svg>;
const SendIcon = () => <svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>;
const AttachmentIcon = () => <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21.44 11.05l-9.19 9.19a6.003 6.003 0 1 1-8.49-8.49l9.19-9.19a4.002 4.002 0 0 1 5.66 5.66l-9.2 9.19a2.001 2.001 0 1 1-2.83-2.83l8.49-8.48"></path></svg>;

interface Profile extends User { username: string; avatar_url: string; full_name: string; }

function ChatVideoRTC() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingStartTime = useRef<number>(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).finally(() => setLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
      if (location.state?.selectedUser) setSelectedUser(location.state.selectedUser);
      else if (!loading) navigate('/account');
  }, [location.state, navigate, loading]);

  useEffect(() => {
    if (!session || !selectedUser) return;
    const fetchMessages = async () => {
        const { data, error } = await supabase.from('messages').select('*').or(`(sender_id.eq.${session.user.id},receiver_id.eq.${selectedUser.id}),(sender_id.eq.${selectedUser.id},receiver_id.eq.${session.user.id})`).order('created_at', { ascending: true });
        if (error) console.error("Error fetching messages:", error); else setMessages(data || []);
    };
    fetchMessages();
    const channel = supabase.channel(`public:messages:chat-with-${selectedUser.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
      if ((p.new.receiver_id === session.user.id && p.new.sender_id === selectedUser.id) || (p.new.sender_id === session.user.id && p.new.receiver_id === selectedUser.id)) setMessages(c => [...c, p.new]);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedUser, session]);
  
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session || !selectedUser) return;
    await supabase.from('messages').insert({ content: newMessage.trim(), sender_id: session.user.id, receiver_id: selectedUser.id, media_type: 'text' });
    setNewMessage('');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !session || !selectedUser) return;
    setUploading(true);
    const mediaType = file.type.startsWith('image') ? 'image' : 'video';
    const filePath = `${session.user.id}/${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('media_messages').upload(filePath, file);
    if (error) { alert('Falha ao enviar arquivo.'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('media_messages').getPublicUrl(filePath);
    if (publicUrl) await supabase.from('messages').insert({ content: publicUrl, sender_id: session.user.id, receiver_id: selectedUser.id, media_type: mediaType });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = e => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = async () => {
        const duration = (Date.now() - recordingStartTime.current) / 1000;
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const filePath = `${session!.user.id}/audio_${Date.now()}.webm`;
        const { error } = await supabase.storage.from('media_messages').upload(filePath, audioBlob);
        if (error) { alert('Falha no upload do áudio.'); return; }
        const { data: { publicUrl } } = supabase.storage.from('media_messages').getPublicUrl(filePath);
        if (publicUrl) await supabase.from('messages').insert({ content: publicUrl, sender_id: session!.user.id, receiver_id: selectedUser!.id, media_type: 'audio', media_duration: Math.round(duration) });
        stream.getTracks().forEach(track => track.stop());
      };
      recordingStartTime.current = Date.now();
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) { alert("Não foi possível iniciar a gravação."); }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    setIsRecording(false);
  };
  
  const renderMessageContent = (msg: any) => {
    switch (msg.media_type) {
      case 'image': return <img src={msg.content} alt="Imagem enviada" className="message-image" />;
      case 'video': return <video src={msg.content} controls className="message-video" />;
      case 'audio': return <AudioPlayer audioUrl={msg.content} />;
      default: return <p className="message-content">{msg.content}</p>;
    }
  };

  if (loading || !selectedUser) return <div className="loading-screen">Carregando...</div>;

  return (
    <div className="chat-page-container">
      <NotificationBell />
      <header className="chat-header">
          <button onClick={() => navigate('/account')} className="back-button">←</button>
          <Avatar url={selectedUser.avatar_url} size={40} readOnly />
          <div className="chat-with">{selectedUser.full_name || selectedUser.username}</div>
          <div className="header-actions">
            <button onClick={() => {}} className="header-button"><TrashIcon /></button>
            <button onClick={() => {}} className="header-button"><VideoIcon /></button>
          </div>
      </header>
      <main className="messages-area">
        {messages.map(msg => (
            <div key={msg.id} className={`message-bubble ${msg.sender_id === session?.user.id ? 'sent' : 'received'}`}>
              {renderMessageContent(msg)}
              <span className="message-timestamp">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        ))}
        {uploading && <div className="uploading-indicator">Enviando mídia...</div>}
        <div ref={messagesEndRef} />
      </main>
      <footer className="message-input-area">
          <button onClick={() => fileInputRef.current?.click()} className="attachment-button"><AttachmentIcon /></button>
          <input type="file" accept="image/*,video/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
          <form id="message-form" onSubmit={handleSendMessage}><input type="text" placeholder={isRecording ? 'Gravando...' : 'Mensagem'} value={newMessage} onChange={e => setNewMessage(e.target.value)} disabled={isRecording} /></form>
          {newMessage.trim() ? <button type="submit" form="message-form"><SendIcon /></button> : <button onMouseDown={handleStartRecording} onMouseUp={handleStopRecording} onTouchStart={handleStartRecording} onTouchEnd={handleStopRecording}>{isRecording ? <RecordingIcon /> : <MicIcon />}</button>}
      </footer>
    </div>
  );
}

export default ChatVideoRTC;
