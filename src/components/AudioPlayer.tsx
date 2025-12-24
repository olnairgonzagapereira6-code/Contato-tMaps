
interface AudioPlayerProps {
  audioUrl: string;
}

const AudioPlayer = ({ audioUrl }: AudioPlayerProps) => {
  if (!audioUrl) {
    return <div>URL do áudio não fornecida.</div>;
  }

  return (
    <div>
      <audio src={audioUrl} controls preload="metadata" style={{ width: '100%' }} />
    </div>
  );
};

export default AudioPlayer;
