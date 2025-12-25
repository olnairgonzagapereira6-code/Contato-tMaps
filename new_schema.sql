-- 2. Recriar a Estrutura do Banco de Dados

-- Criar a tabela de perfis de usuário
-- Esta tabela armazena dados públicos dos usuários, vinculados à tabela auth.users.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (char_length(username) >= 3),
  full_name TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'offline',
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Comentário: A coluna 'status' pode ser usada para mostrar se o usuário está online.

-- Criar a tabela de chats
-- Representa uma conversa, que pode ser privada (1-a-1) ou em grupo.
CREATE TABLE public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group BOOLEAN NOT NULL DEFAULT false,
  group_name TEXT,
  group_avatar_url TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Comentário: Simplifica a lógica. DMs e Grupos são ambos 'chats'.

-- Criar a tabela de participantes do chat
-- Tabela de junção para vincular usuários a chats.
CREATE TABLE public.chat_participants (
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

-- Criar a tabela de mensagens
-- Armazena todas as mensagens de todos os chats.
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT, -- Para mensagens de texto
  media_url TEXT, -- Para áudio, imagens, etc.
  media_type TEXT, -- ex: 'audio', 'image'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Criar a tabela de chamadas
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL, -- ex: 'initiated', 'answered', 'missed'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Configurar Row Level Security (RLS)

-- Perfis
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Chats, Participantes, Mensagens, Chamadas
-- A lógica aqui é: você só pode ver/interagir com chats dos quais você é um participante.
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see chats they are a part of." ON public.chats FOR SELECT USING (
  id IN (SELECT chat_id FROM public.chat_participants WHERE user_id = auth.uid())
);
CREATE POLICY "Authenticated users can create chats." ON public.chats FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can only see participants of chats they are in." ON public.chat_participants FOR SELECT USING (
  chat_id IN (SELECT chat_id FROM public.chat_participants WHERE user_id = auth.uid())
);
CREATE POLICY "Users can join or be added to chats." ON public.chat_participants FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
-- Adicionar política para permitir que usuários saiam de chats

CREATE POLICY "Users can see messages in chats they are in." ON public.messages FOR SELECT USING (
  chat_id IN (SELECT chat_id FROM public.chat_participants WHERE user_id = auth.uid())
);
CREATE POLICY "Users can send messages in chats they are in." ON public.messages FOR INSERT WITH CHECK (
  user_id = auth.uid() AND chat_id IN (SELECT chat_id FROM public.chat_participants WHERE user_id = auth.uid())
);

CREATE POLICY "Users can see calls in chats they are in." ON public.calls FOR SELECT USING (
  chat_id IN (SELECT chat_id FROM public.chat_participants WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create calls in chats they are in." ON public.calls FOR INSERT WITH CHECK (
  caller_id = auth.uid() AND chat_id IN (SELECT chat_id FROM public.chat_participants WHERE user_id = auth.uid())
);

-- 4. Criar os Buckets de Armazenamento
-- Vá para o painel do Supabase -> Storage e crie os seguintes buckets:
-- 1. `avatars` (para fotos de perfil) - Marque-o como público.
--    - RLS Policy: Permitir que usuários autenticados façam upload.
--    - RLS Policy: Permitir que qualquer pessoa leia/baixe.
-- 2. `media_messages` (para áudios, imagens, etc. nas mensagens) - Deixe-o privado.
--    - RLS Policy: Permitir que usuários enviem mídia apenas em chats dos quais participam.
--    - RLS Policy: Permitir que usuários leiam mídia apenas de chats dos quais participam.

SELECT 'Novo schema criado com sucesso!' as status;
