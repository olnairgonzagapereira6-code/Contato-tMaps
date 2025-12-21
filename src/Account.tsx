import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Avatar from './Avatar'
import YouTubeBlock from './YouTubeBlock'
import { Session } from '@supabase/supabase-js'

interface Profile {
  username: string | null;
  website: string | null;
  avatar_url: string | null;
}

export default function Account({ session }: { session: Session }) {
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  const [website, setWebsite] = useState<string | null>(null)
  const [avatar_url, setAvatarUrl] = useState<string | null>(null)
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const youtubeVideoIds = ['dQw4w9WgXcQ', '3JZ_D3p_NPg', 'J---aiyznGQ']; // Example YouTube video IDs

  useEffect(() => {
    let ignore = false
    async function getProfileAndUsers() {
      setLoading(true)
      const { user } = session

      const { data, error } = await supabase
        .from('profiles')
        .select(`username, website, avatar_url`)
        .eq('id', user.id)
        .single()

      if (!ignore) {
        if (error) {
          console.warn(error)
        } else if (data) {
          setUsername(data.username)
          setWebsite(data.website)
          setAvatarUrl(data.avatar_url)
        }
      }

      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select(`username, website, avatar_url`)

      if (!ignore) {
        if (usersError) {
          console.warn(usersError)
        } else if (usersData) {
          setAllUsers(usersData)
        }
      }

      setLoading(false)
    }

    getProfileAndUsers()

    return () => {
      ignore = true
    }
  }, [session])

  async function updateProfile(event: React.FormEvent<HTMLFormElement> | null) {
    if (event) {
        event.preventDefault()
    }

    setLoading(true)
    const { user } = session

    const updates = {
      id: user.id,
      username,
      website,
      avatar_url,
      updated_at: new Date(),
    }

    const { error } = await supabase.from('profiles').upsert(updates)

    if (error) {
      alert(error.message)
    } else {
        const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select(`username, website, avatar_url`)
        if (usersError) {
            console.warn(usersError)
        } else if (usersData) {
            setAllUsers(usersData)
        }
    }
    setLoading(false)
  }

  const handleCopyList = () => {
    const userList = allUsers.map(user => user.username || 'Unnamed User').join('\n');
    navigator.clipboard.writeText(userList)
      .then(() => alert('Lista de usuários copiada!'))
      .catch(err => console.error('Falha ao copiar lista: ', err));
  };

  const handleShareList = () => {
    const userList = allUsers.map(user => user.username || 'Unnamed User').join('\n');
    if (navigator.share) {
      navigator.share({
        title: 'Lista de Usuários',
        text: userList,
      })
      .catch(err => console.error('Erro ao compartilhar: ', err));
    } else {
      alert('A função de compartilhar não é suportada neste navegador.');
    }
  };

  return (
    <div>
      <div className="top-nav">
        <div className="menu-buttons">
            <button className="button">Função 1</button>
            <button className="button">Função 2</button>
            <button className="button">Função 3</button>
        </div>
        <button className="button button-logout" type="button" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </div>
        <form onSubmit={updateProfile} className="form-widget">
            <Avatar
                url={avatar_url}
                size={150}
                onUpload={(url) => {
                    setAvatarUrl(url);
                    updateProfile(null);
                }}
            />
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="text" value={session.user.email} disabled />
        </div>
        <div>
          <label htmlFor="username">Name</label>
          <input
            id="username"
            type="text"
            value={username || ''}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="website">Website</label>
          <input
            id="website"
            type="url"
            value={website || ''}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div>
          <button className="button block primary" type="submit" disabled={loading}>
            {loading ? 'Carregando ...' : 'Atualizar Perfil'}
          </button>
        </div>

      </form>

      <div className="user-list-section">
        <h2 className="header">Todos os Usuários</h2>
        <div className="user-list">
          {allUsers.map((user, index) => (
            <div key={index} className="user-list-item">
              <Avatar url={user.avatar_url} size={50} readOnly={true} />
              <span>{user.username || 'Unnamed'}</span>
            </div>
          ))}
        </div>
        <div className="list-actions">
            <button className="button" onClick={handleCopyList} disabled={loading}>
                Copiar Lista
            </button>
            <button className="button" onClick={handleShareList} disabled={loading}>
                Compartilhar Lista
            </button>
        </div>
      </div>

      <YouTubeBlock videoIds={youtubeVideoIds} />

    </div>
  )
}
