
import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import Avatar from "../Avatar";
import { Session } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function Account({ session }: { session: Session }) {
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [website, setWebsite] = useState<string | null>(null);
  const [avatar_url, setAvatarUrl] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function getProfile() {
      setLoading(true);
      const { user } = session;

      const { data, error } = await supabase
        .from("profiles")
        .select(`username, website, avatar_url`)
        .eq("id", user.id)
        .single();

      if (!ignore) {
        if (error) {
          console.warn(error);
        } else if (data) {
          setUsername(data.username);
          setWebsite(data.website);
          setAvatarUrl(data.avatar_url);
        }
      }

      setLoading(false);
    }

    async function getUsers() {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) {
        console.error("Error fetching users:", error);
      } else {
        setUsers(data);
      }
    }

    getProfile();
    getUsers();

    return () => {
      ignore = true;
    };
  }, [session]);

  async function updateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    const { user } = session;

    const updates = {
      id: user.id,
      username,
      website,
      avatar_url,
      updated_at: new Date(),
    };

    const { error } = await supabase.from("profiles").upsert(updates);

    if (error) {
      alert("Error updating the data!");
      console.log(error)
    } else {
      alert("Profile updated successfully!");
    }
    setLoading(false);
  }

  const handleShareList = () => {
    let shareText = "Lista de Contatos:\n";
    users.forEach((user) => {
      shareText += `${user.username} - ${user.website || "N/A"}\n`;
    });

    if (navigator.share) {
      navigator
        .share({
          title: "Lista de Contatos",
          text: shareText,
        })
        .then(() => console.log("Successful share"))
        .catch((error) => console.log("Error sharing", error));
    } else {
      alert("A função de compartilhamento não é suportada neste navegador.");
      console.log(shareText);
    }
  };

  const generatePdf = () => {
    const input = document.getElementById("contacts-list");
    if (!input) {
        alert("Não foi possível encontrar a lista para gerar o PDF.");
        return;
    }

    html2canvas(input, { useCORS: true }).then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save("lista_contatos.pdf");
    });
  };

  return (
    <div className="form-widget">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Sua Conta</h1>
        <div className="dropdown-container" style={{ position: "relative" }}>
          <button
            className="button primary"
            onClick={() => setDropdownVisible(!dropdownVisible)}
          >
            Ações
          </button>
          {dropdownVisible && (
            <div 
              className="dropdown-menu"
              style={{ 
                position: "absolute", 
                top: "100%", 
                right: 0,
                border: "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: "white",
                zIndex: 1000
              }}
            >
              <button onClick={handleShareList} style={{ display: 'block', width: '100%', textAlign: 'left' }}>
                Compartilhar Lista
              </button>
              <button onClick={generatePdf} style={{ display: 'block', width: '100%', textAlign: 'left' }}>
                Gerar PDF da Lista
              </button>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={updateProfile} className="form-widget">
        <Avatar
          url={avatar_url}
          size={150}
          onUpload={(event: React.ChangeEvent<HTMLInputElement>, url: string) => {
            setAvatarUrl(url);
            updateProfile(event);
          }}
        />
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="text" value={session.user.email} disabled />
        </div>
        <div>
          <label htmlFor="username">Usuário</label>
          <input
            id="username"
            type="text"
            required
            value={username || ""}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="website">Link</label>
          <input
            id="website"
            type="url"
            value={website || ""}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div>
          <button
            className="button block primary"
            type="submit"
            disabled={loading}
          >
            {loading ? "Salvando..." : "Salvar Perfil"}
          </button>
        </div>
      </form>
      
      <div id="contacts-list">
        <h2>Todos os Usuários</h2>
        <table className="user-table">
          <thead>
            <tr>
              <th>Avatar</th>
              <th>Usuário</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <img
                    src={
                      user.avatar_url
                        ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${user.avatar_url}`
                        : "https://via.placeholder.com/40"
                    }
                    alt={user.username}
                    className="user-avatar"
                  />
                </td>
                <td>{user.username}</td>
                <td>
                  <a href={user.website} target="_blank" rel="noopener noreferrer">
                    {user.website}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        className="button block"
        type="button"
        onClick={() => supabase.auth.signOut()}
      >
        Sign Out
      </button>
    </div>
  );
}
