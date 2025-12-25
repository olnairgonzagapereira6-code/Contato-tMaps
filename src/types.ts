
import { User } from '@supabase/supabase-js';

// Estendendo o tipo de usuário do Supabase para incluir nosso schema
export interface Profile extends User {
  username: string;
  full_name: string;
  avatar_url: string;
  status: 'online' | 'offline';
}

// Representa um participante dentro de um chat
export interface ChatParticipant {
  user_id: string;
  role: string;
  profiles: Profile; // Aninhamos o perfil do participante
}

// A estrutura principal de um Chat/Conversa
export interface Chat {
  id: string; // chat_id
  is_group: boolean;
  group_name?: string;
  group_avatar_url?: string;
  created_by: string;
  chat_participants: {profiles: Profile}[];
  messages: Message[]; 
}

// Estrutura para uma mensagem
export interface Message {
  id: string;
  chat_id: string;
  user_id: string;
  content?: string;
  media_url?: string;
  media_type?: 'audio' | 'image' | 'video';
  created_at: string;
  profiles: Profile; // Aninhamos o perfil de quem enviou
}

// Estrutura para uma chamada
export interface Call {
  id: string;
  chat_id: string;
  caller_id: string;
  start_time?: string;
  end_time?: string;
  status: 'initiated' | 'answered' | 'missed' | 'ended';
  created_at: string;
}

