
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

  async function updateProfile(event: React.FormEvent<HTMLFormElement> | null) {
    if (event) {
      event.preventDefault();
    }

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
      console.log(error);
    } else {
      // alert("Profile updated successfully!");
      const { data: usersData, error: usersError } = await supabase
        .from("profiles")
        .select(`username, website, avatar_url`);
      if (usersError) {
        console.warn(usersError);
      } else if (usersData) {
        setUsers(usersData);
      }
    }
    setLoading(false);
  }

  const handleCopyList = () => {
    const userList = users.map((user) => user.username || "Unnamed User").join("\n");
    navigator.clipboard
      .writeText(userList)
      .then(() => alert("Lista de usuários copiada!"))
      .catch((err) => console.error("Falha ao copiar lista: ", err));
  };

  const handleShareList = () => {
    const userList = users.map((user) => user.username || "Unnamed User").join("\n");
    if (navigator.share) {
      navigator
        .share({
          title: "Lista de Usuários",
          text: userList,
        })
        .catch((err) => console.error("Erro ao compartilhar: ", err));
    } else {
      alert("A função de compartilhar não é suportada neste navegador.");
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
    <div>
      <div className="account-header">
        <h1 className="header">Sua Conta</h1>
        <div className="menu-buttons">
          <div className="dropdown-container">
            <button
              className="button primary"
              onClick={() => setDropdownVisible(!dropdownVisible)}
            >
              Ações
            </button>
            {dropdownVisible && (
              <div className="dropdown-menu">
                <button onClick={() => { handleCopyList(); setDropdownVisible(false); }}>
                  Copiar Lista
                </button>
                <button onClick={() => { handleShareList(); setDropdownVisible(false); }}>
                  Compartilhar Lista
                </button>
                <button onClick={() => { generatePdf(); setDropdownVisible(false); }}>
                  Gerar PDF da Lista
                </button>
              </div>
            )}
          </div>
          <Link to="/chat" className="button primary">
            Entrar
          </Link>
          <button
            className="button button-logout"
            type="button"
            onClick={() => supabase.auth.signOut()}
          >
            Sair
          </button>
        </div>
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
            value={username || ""}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="website">Website</label>
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
            {loading ? "Carregando ..." : "Atualizar Perfil"}
          </button>
        </div>
      </form>

      <div id="contacts-list" className="user-list-section">
        <h2 className="header">Todos os Usuários</h2>
        <div className="user-list">
          {users.map((user, index) => (
            <div key={index} className="user-list-item">
              <Avatar url={user.avatar_url} size={50} readOnly={true} />
              <span>{user.username || "Unnamed"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
