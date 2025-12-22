
import { render, screen, fireEvent } from "@testing-library/react";
import Account from "./Account";
import { vi } from "vitest";
import { Session } from "@supabase/supabase-js";

// Mock dependencies
vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: {
              username: "testuser",
              website: "test.com",
              avatar_url: "avatar.png",
            },
          })),
        })),
      })),
      upsert: vi.fn(),
    })),
  },
}));

vi.mock("../Avatar", () => ({
  __esModule: true,
  default: ({ onUpload }: { onUpload: (url: string) => void }) => (
    <div>
      <button onClick={() => onUpload("new-avatar.png")}>Upload</button>
    </div>
  ),
}));

vi.mock("jspdf", () => ({
  __esModule: true,
  default: vi.fn(() => ({
    getImageProperties: vi.fn(() => ({ width: 100, height: 100 })),
    internal: {
      pageSize: {
        getWidth: vi.fn(() => 200),
      },
    },
    addImage: vi.fn(),
    save: vi.fn(),
  })),
}));

vi.mock("html2canvas", () => ({
  __esModule: true,
  default: vi.fn(() =>
    Promise.resolve({
      toDataURL: vi.fn(() => "image-data-url"),
    })
  ),
}));

describe("Account", () => {
  const session: Session = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "test-id",
      email: "test@test.com",
      app_metadata: {},
      user_metadata: {},
      aud: "",
      created_at: "",
    },
  };

  it("renders the account form and user list", async () => {
    render(<Account session={session} />);

    expect(screen.getByLabelText("Email")).toHaveValue("test@test.com");
    expect(await screen.findByLabelText("Name")).toHaveValue("testuser");
    expect(await screen.findByLabelText("Website")).toHaveValue("test.com");
  });

  it("updates the profile", async () => {
    render(<Account session={session} />);

    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "newuser" },
    });
    fireEvent.click(screen.getByText("Atualizar Perfil"));
  });

  it("handles dropdown actions", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(() => Promise.resolve()),
      },
      share: vi.fn(() => Promise.resolve()),
    });

    render(<Account session={session} />);

    fireEvent.click(screen.getByText("Ações"));
    fireEvent.click(screen.getByText("Copiar Lista"));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Ações"));
    fireEvent.click(screen.getByText("Compartilhar Lista"));
    expect(navigator.share).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Ações"));
    fireEvent.click(screen.getByText("Gerar PDF da Lista"));
  });

  it("signs out the user", () => {
    render(<Account session={session} />);
    fireEvent.click(screen.getByText("Sair"));
  });
});
