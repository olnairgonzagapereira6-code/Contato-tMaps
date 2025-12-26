import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function Avatar({ url, size, onUpload, readOnly }: { 
  url: string | null, 
  size: number, 
  onUpload?: (url: string) => void, 
  readOnly?: boolean 
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Sincroniza a imagem sempre que a URL vinda do perfil mudar
  useEffect(() => {
    if (url) {
      setAvatarUrl(url);
    } else {
      setAvatarUrl(null);
    }
  }, [url]);

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      setUploading(true);

      // Verifica se o arquivo foi selecionado
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Você precisa selecionar uma imagem da sua galeria.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      
      // Criamos um nome único usando timestamp para evitar problemas de cache no navegador
      const fileName = `${Math.random()}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Faz o upload para o bucket 'avatars'
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 2. Busca a URL pública definitiva
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      // 3. Atualiza o estado local para mostrar a foto na hora
      setAvatarUrl(publicUrl);

      // 4. Dispara a função de salvar no banco de dados (Account.tsx)
      if (onUpload) {
        onUpload(publicUrl);
      }

      alert('Foto de perfil atualizada!');

    } catch (error: any) {
      alert('Erro ao carregar foto: ' + (error.message || 'Erro desconhecido'));
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  }

  // Estilos inline para garantir funcionamento no celular mesmo sem CSS carregado
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '20px'
  };

  const circleStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: '#dfe3ee',
    border: '3px solid #1877f2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
  };

  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  };

  return (
    <div style={containerStyle}>
      <div style={circleStyle}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" style={imageStyle} />
        ) : (
          /* Ícone de usuário padrão (SVG) caso não tenha foto */
          <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="#8b9dc3">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        )}
        
        {uploading && (
          <div style={{
            position: 'absolute',
            background: 'rgba(255,255,255,0.7)',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#1877f2'
          }}>
            ...
          </div>
        )}
      </div>

      {!readOnly && (
        <div style={{ width: '100%', textAlign: 'center' }}>
          <label 
            htmlFor="avatar_upload" 
            style={{
              backgroundColor: '#1877f2',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-block',
              transition: '0.3s'
            }}
          >
            {uploading ? 'Enviando...' : 'Escolher da Galeria'}
          </label>
          <input
            type="file"
            id="avatar_upload"
            accept="image/*"
            onChange={uploadAvatar}
            disabled={uploading}
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: '0',
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              border: '0'
            }}
          />
        </div>
      )}
    </div>
  );
        }
