import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Session } from '@supabase/supabase-js';
import Avatar from '../Avatar';
import './ChatVideoRTC.css';
import { useNavigate, useLocation } from 'react-router-dom';

// --- Ícones Inline (Evita erro de arquivo faltando) ---
const VideoIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
const MicIcon = () => <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>;
const SendIcon = () => <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>;
const AttachmentIcon = () => <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21.44 11.05l-9.19 9.19a6.003 6.003 0 1 1-8.49-8.49l9.19-9.19a4.002 4.002 0 0 1 5.66 5.66l-9.2 9.19a2.001 2.001 0 1 1-2.83-2.83l8.49-8.48"></path></svg>;

function ChatVideoRTC() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Gerenciar Sessão
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
  }, []);

  // 2. Verificar se há um usuário selecionado para conversar
  useEffect(() => {
    if (!loading) {
      if (location.state?.selectedUser) {
        setSelectedUser(location.state.selectedUser);
      } else {
        // Se não tem usuário selecionado, volta para a lista de contatos
        navigate('/account');
      }
    }
  }, [location.state, navigate, loading]);

  // 3. Carregar Mensagens e Realtime
  useEffect(() => {
    if (!session || !selectedUser) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${session.user.id})`)
        .order('created_at', { ascending: true });

      if (error) console.error("Erro ao carregar mensagens:", error);
      else setMessages(data || []);
    };

    fetchMessages();

    // Inscrição Realtime para novas mensagens
    const channel = supabase
      .channel(`chat-${selectedUser.id}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' }, 
        (payload) => {
          const newMsg = payload.new;
          if (
            (newMsg.sender_id === session.user.id && newMsg.receiver_id === selectedUser.id) ||
            (newMsg.sender_id === selectedUser.id && newMsg.receiver_id === session.user.id)
          ) {
            setMessages(prev => [...prev, newMsg]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedUser, session]);
  
  // Scroll automático para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session || !selectedUser) return;

    const { error } = await supabase.from('messages').insert({
      content: newMessage.trim(),
      sender_id: session.user.id,
      receiver_id: selectedUser.id,
      media_type: 'text'
    });

    if (error) alert("Erro ao enviar: " + error.message);
    setNewMessage('');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !session || !selectedUser) return;

    setUploading(true);
    try {
      const mediaType = file.type.startsWith('image') ? 'image' : 'video';
      const filePath = `chat/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('media_messages')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('media_messages').getPublicUrl(filePath);
      
      await supabase.from('messages').insert({
        content: data.publicUrl,
        sender_id: session.user.id,
        receiver_id: selectedUser.id,
        media_type: mediaType
      });
    } catch (err: any) {
      alert("Erro no envio do arquivo: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const renderMessageContent = (msg: any) => {
    if (msg.media_type === 'image') return <img src={msg.content} alt="mídia" className="message-image" style={{maxWidth: '200px', borderRadius: '8px'}} />;
    if (msg.media_type === 'video') return <video src={msg.content} controls className="message-video" style={{maxWidth: '200px'}} />;
    if (msg.media_type === 'audio') return <audio src={msg.content} controls />;
    return <p className="message-text">{msg.content}</p>;
  };

  if (loading || !selectedUser) return <div className="loading-screen">Iniciando Chat...</div>;

  return (
    <div className="chat-page-container">
      <header className="chat-header" style={{display: 'flex', alignItems: 'center', padding: '10px', background: '#fff', borderBottom: '1px solid #ddd'}}>
          <button onClick={() => navigate('/account')} className="back-button">←</button>
          <Avatar url={selectedUser.avatar_url} size={35} readOnly />
          <div className="chat-user-info" style={{marginLeft: '10px', flex: 1}}>
            <div className="chat-with-name" style={{fontWeight: 'bold'}}>{selectedUser.username || "Usuário"}</div>
          </div>
          <button onClick={() => alert("Chamada de vídeo em breve!")} className="header-button"><VideoIcon /></button>
      </header>

      <main className="messages-area" style={{flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
        {messages.map(msg => (
            <div key={msg.id} className={`message-bubble ${msg.sender_id === session?.user.id ? 'sent' : 'received'}`}>
              {renderMessageContent(msg)}
              <span className="message-time" style={{fontSize: '10px', opacity: 0.6}}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
        ))}
        {uploading && <div className="uploading">Enviando...</div>}
        <div ref={messagesEndRef} />
      </main>

      <footer className="message-input-area" style={{padding: '10px', display: 'flex', gap: '10px', alignItems: 'center', background: '#f0f0f0'}}>
          <button onClick={() => fileInputRef.current?.click()} className="icon-button"><AttachmentIcon /></button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
          
          <form onSubmit={handleSendMessage} style={{flex: 1}}>
            <input 
              type="text" 
              placeholder="Digite uma mensagem..." 
              value={newMessage} 
              onChange={e => setNewMessage(e.target.value)}
              style={{width: '100%', padding: '10px', borderRadius: '20px', border: '1px solid #ccc'}}
            />
          </form>

          <button onClick={handleSendMessage} className="send-button" style={{background: '#1877f2', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <SendIcon />
          </button>
      </footer>
    </div>
  );
}

export default ChatVideoRTC;
