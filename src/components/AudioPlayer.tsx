
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

interface AudioPlayerProps {
  audioUrl: string;
}

const AudioPlayer = ({ audioUrl }: AudioPlayerProps) => {
  const [playing, setPlaying] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioUrl) return;

    const downloadAudio = async () => {
      try {
        setLoading(true);
        // Extrai o caminho do arquivo da URL completa
        const urlParts = audioUrl.split('/public/audio_messages/');
        if (urlParts.length < 2) {
          throw new Error('URL de áudio inválida.');
        }
        const path = urlParts[1];

        const { data, error } = await supabase.storage
          .from('audio_messages')
          .download(path);

        if (error) {
          throw error;
        }
        
        const objectUrl = URL.createObjectURL(data);
        setAudioSrc(objectUrl);
      } catch (error) {
        console.error('Erro ao baixar o áudio:', error);
        // Opcional: definir uma URL de fallback ou mostrar um erro
      } finally {
        setLoading(false);
      }
    };

    downloadAudio();

    // Limpeza ao desmontar o componente
    return () => {
      if (audioSrc) {
        URL.revokeObjectURL(audioSrc);
      }
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  useEffect(() => {
    const audio = audioRef.current;
    const handleEnd = () => setPlaying(false);

    if (audio) {
      audio.addEventListener('ended', handleEnd);
    }

    return () => {
      if (audio) {
        audio.removeEventListener('ended', handleEnd);
      }
    };
  }, []);

  if (loading) {
    return <div>Carregando áudio...</div>;
  }

  return (
    <div>
        <audio ref={audioRef} src={audioSrc || ''} preload="auto" />
        <button onClick={togglePlay} disabled={!audioSrc}>
            {playing ? 'Pausar' : 'Ouvir'}
        </button>
    </div>
  );
};

export default AudioPlayer;
