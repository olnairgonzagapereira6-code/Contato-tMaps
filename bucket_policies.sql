-- Políticas de Segurança para os Buckets de Armazenamento

-- 1. Políticas para o Bucket `avatars` (Público)
-- Este bucket deve ser marcado como 'Público' no painel do Supabase.

-- Qualquer pessoa pode ver os avatares (SELECT)
CREATE POLICY "Public read access for avatars" 
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'avatars' );

-- Qualquer usuário autenticado pode fazer upload de um avatar (INSERT)
CREATE POLICY "Authenticated users can upload avatars" 
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'avatars' );

-- Um usuário só pode atualizar seu próprio avatar (UPDATE)
-- A política usa o `owner` do objeto, que é o `uid` do usuário que fez o upload.
CREATE POLICY "Users can update their own avatar" 
ON storage.objects FOR UPDATE
TO authenticated
USING ( auth.uid() = owner );

-- 2. Políticas para o Bucket `media_messages` (Privado)
-- Este bucket deve ser PRIVADO.

-- Primeiro, criamos uma função auxiliar que verifica se um usuário é participante de um chat.
-- Isso simplifica a lógica das políticas.
CREATE OR REPLACE FUNCTION is_chat_member(chat_id_to_check uuid, user_id_to_check uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
      SELECT 1
      FROM public.chat_participants
      WHERE chat_id = chat_id_to_check AND user_id = user_id_to_check
  );
$$ LANGUAGE sql SECURITY DEFINER;


-- IMPORTANTE: Para estas políticas funcionarem, o upload de arquivos de mídia deve ser feito
-- para um caminho que comece com o ID do chat. Ex: `/<chat_id>/audio.mp3`

-- Um usuário só pode ver (SELECT) arquivos de chats dos quais ele é membro.
CREATE POLICY "Chat members can view media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media_messages' AND
  is_chat_member( (storage.foldername(name))[1]::uuid, auth.uid() )
);

-- Um usuário só pode enviar (INSERT) arquivos para chats dos quais ele é membro.
CREATE POLICY "Chat members can upload media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media_messages' AND
  is_chat_member( (storage.foldername(name))[1]::uuid, auth.uid() )
);

SELECT 'Políticas dos buckets criadas com sucesso!' as status;