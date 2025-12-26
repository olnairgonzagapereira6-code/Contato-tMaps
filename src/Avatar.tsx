import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function Avatar({ url, size, onUpload, readOnly }: { url: string | null, size: number, onUpload?: (url: string) => void, readOnly?: boolean }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Sincroniza a imagem quando a URL vinda do banco muda
  useEffect(() => {
    if (url) setAvatarUrl(url);
  }, [url]);

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Você deve selecionar uma imagem.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`; // Nome aleatório para evitar conflito
      const filePath = `${fileName}`;

      // 1. Faz o upload para o bucket 'avatars' no Supabase Storage
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Pega a URL pública da imagem
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      setAvatarUrl(publicUrl); // Atualiza a miniatura na hora
      if (onUpload) {
        onUpload(publicUrl); // Avisa o componente pai (Account) para salvar no banco
      }

    } catch (error: any) {
      alert('Erro ao carregar imagem: ' + error.message);
      console.error(error);
    } finally {
      setUploading(false);
    }
  }

  // Estilo para garantir que o círculo apareça mesmo sem CSS externo
  const avatarStyle: React.CSSProperties = {
    height: size,
    width: size,
    borderRadius: '50%',
    objectFit: 'cover',
    backgroundColor: '#e1e1e1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #ccc',
    overflow: 'hidden',
    marginBottom: '10px'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={avatarStyle}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Avatar"
            style={{ height: '100%', width: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ color: '#888', fontSize: size / 4 }}>Sem Foto</span>
        )}
      </div>
      
      {!readOnly && (
        <div style={{ textAlign: 'center' }}>
          <label className="button primary" htmlFor="single" style={{ cursor: 'pointer', padding: '8px 12px', backgroundColor: '#1877f2', color: 'white', borderRadius: '5px' }}>
            {uploading ? 'Enviando...' : 'Trocar Foto'}
          </label>
          <input
            style={{ visibility: 'hidden', position: 'absolute' }}
            type="file"
            id="single"
            accept="image/*"
            onChange={uploadAvatar}
            disabled={uploading}
          />
        </div>
      )}
    </div>
  );
}
