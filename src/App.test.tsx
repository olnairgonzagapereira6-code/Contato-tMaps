
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import { supabase } from './supabaseClient';

// Mock child components
vi.mock('./Auth', () => ({
  default: () => <div>Auth Component</div>,
}));

vi.mock('./pages/Account', () => ({
  default: () => <div>Account Component</div>,
}));

vi.mock('./pages/ChatVideoRTC', () => ({
  default: () => <div>ChatVideoRTC Component</div>,
}));

// Mock supabase client
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

describe('App', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Mock onAuthStateChange to return a subscription with an unsubscribe method
    (supabase.auth.onAuthStateChange as any).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('should render loading state initially', () => {
    (supabase.auth.getSession as any).mockResolvedValueOnce({ data: { session: null } });
    render(<App />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('should render Auth component for root path when not authenticated', async () => {
    (supabase.auth.getSession as any).mockResolvedValueOnce({ data: { session: null } });

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Auth Component')).toBeInTheDocument();
  });

  it('should render Account component for root path when authenticated', async () => {
    const session = { user: { id: '123' } };
    (supabase.auth.getSession as any).mockResolvedValueOnce({ data: { session } });

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Account Component')).toBeInTheDocument();
  });

  it('should render Auth component for /chat path when not authenticated', async () => {
    (supabase.auth.getSession as any).mockResolvedValueOnce({ data: { session: null } });

    render(
      <MemoryRouter initialEntries={['/chat']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Auth Component')).toBeInTheDocument();
  });

  it('should render ChatVideoRTC component for /chat path when authenticated', async () => {
    const session = { user: { id: '123' } };
    (supabase.auth.getSession as any).mockResolvedValueOnce({ data: { session } });

    render(
      <MemoryRouter initialEntries={['/chat']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('ChatVideoRTC Component')).toBeInTheDocument();
  });
});
