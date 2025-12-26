import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import Avatar from "../Avatar";
import { Session } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Link } from "react-router-dom";
import "./Account.css";

export default function Account({ session }: { session: Session }) {
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [website, setWebsite] = useState<string | null>(null);
  const [avatar_url, setAvatarUrl] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function fetchData() {
      setLoading(true);
      try {
        const { user } = session;

        // 1. Busca perfil do usuário logado
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select(`username, website, avatar_url`)
          .eq("id", user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') { // PGRST116 é "não encontrado", normal se for novo
           console.warn("Erro ao buscar perfil:", profileError.message);
        }

        if (!ignore && profileData) {
          setUsername(profileData.username);
          setWebsite(profileData.website);
          setAvatarUrl(profileData.avatar_url);
        }

        // 2. Busca lista de todos os usuários
        const { data: allUsers, error: usersError } = await supabase
          .from("profiles")
          .select("*")
          .order('username', { ascending: true });

        if (!ignore) {
          if (usersError) console.error("Erro ao buscar usuários:", usersError.message);
          else setUsers(allUsers || []);
        }

      } catch (err) {
        console.error("Erro geral no carregamento:", err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchData();

    return () => {
      ignore = true;
    };
  }, [session]);

  async function updateProfile(
    event: React.FormEvent<HTMLFormElement> | null,
    newAvatarUrl?: string
  ) {
    if (event) event.preventDefault();

    setLoading(true);
    try {
      const { user } = session;
      const updates = {
        id: user.id,
        username,
        website,
        avatar_url: newAvatarUrl !== undefined ? newAvatarUrl : avatar_url,
        updated_at: new Date(),
      };

      const { error } = await supabase.from("profiles").upsert(updates);
      if (error) throw error;
      
      if (newAvatarUrl !== undefined) setAvatarUrl(newAvatarUrl);
      alert("Perfil atualizado com sucesso!");
    } catch (error: any) {
      alert("Erro ao atualizar os dados: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleCopyList = () => {
    const userList = users.map((user) => user.username || "Usuário sem nome").join("\n");
    navigator.clipboard.writeText(userList)
      .then(() => alert("Lista de usuários copiada!"))
      .catch((err) => console.error("Falha ao copiar:", err));
  };

  const handleShareList = () => {
    const userList = users.map((user) => user.username || "Usuário sem nome").join("\n");
    if (navigator.share) {
      navigator.share({ title: "Lista de Usuários TheZap", text: userList })
        .catch((err) => console.error("Erro ao compartilhar:", err));
    } else {
      alert("Compartilhamento não suportado neste navegador.");
    }
  };

  const generatePdf = () => {
    const input = document.getElementById("contacts-list");
    if (!input) return;

    html2canvas(input, { useCORS: true }).then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF();
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save("contatos_thezap.pdf");
    });
  };

  return (
    <div className="account-container">
      <div className="account-header">
        <h1 className="header">TheZap - Conta</h1>
        <div className="menu-buttons">
          <div className="dropdown-container">
            <button className="button primary" onClick={() => setDropdownVisible(!dropdownVisible)}>
              Ações
            </button>
            {dropdownVisible && (
              <div className="dropdown-menu">
                <button onClick={() => { handleCopyList(); setDropdownVisible(false); }}>Copiar Lista</button>
                <button onClick={() => { handleShareList(); setDropdownVisible(false); }}>Compartilhar</button>
                <button onClick={() => { generatePdf(); setDropdownVisible(false); }}>Baixar PDF</button>
              </div>
            )}
          </div>
          <Link to="/chat" className="button chat-link">Ir para o Chat</Link>
          <button className="button button-logout" type="button" onClick={() => supabase.auth.signOut()}>
            Sair
          </button>
        </div>
      </div>

      <div className="account-content">
        {loading ? (
          <p>Carregando dados...</p>
        ) : (
          <>
            <form onSubmit={updateProfile} className="form-widget">
              <Avatar
                url={avatar_url}
                size={150}
                onUpload={(url) => updateProfile(null, url)}
              />
              <div className="input-group">
                <label>Email (Login)</label>
                <input type="text" value={session.user.email} disabled className="input-disabled" />
              </div>
              <div className="input-group">
                <label htmlFor="username">Seu Nome</label>
                <input
                  id="username"
                  type="text"
                  value={username || ""}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Como quer ser chamado?"
                />
              </div>
              <div className="input-group">
                <label htmlFor="website">Link/Website</label>
                <input
                  id="website"
                  type="url"
                  value={website || ""}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://exemplo.com"
                />
              </div>
              <button className="button block primary" type="submit" disabled={loading}>
                Salvar Alterações
              </button>
            </form>

            <div id="contacts-list" className="user-list-section">
              <h2 className="header">Contatos na Rede</h2>
              <div className="user-list">
                {users.length > 0 ? (
                  users.map((user) => (
                    <div key={user.id} className="user-list-item">
                      <Avatar url={user.avatar_url} size={40} readOnly={true} />
                      <span>{user.username || "Usuário sem nome"}</span>
                    </div>
                  ))
                ) : (
                  <p>Nenhum outro usuário encontrado.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
