-- Script de Limpeza de Banco de Dados (Corrigido)

-- O uso de CASCADE torna desnecessário apagar as políticas individualmente.
-- Ele apaga a tabela e todos os objetos dependentes (foreign keys, policies, etc).

DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.calls CASCADE;
DROP TABLE IF EXISTS public.contacts CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

SELECT 'Tabelas e dependências removidas com sucesso!' as status;-- Script de Limpeza de Banco de Dados (Corrigido)

-- O uso de CASCADE torna desnecessário apagar as políticas individualmente.
-- Ele apaga a tabela e todos os objetos dependentes (foreign keys, policies, etc).

DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.calls CASCADE;
DROP TABLE IF EXISTS public.contacts CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

SELECT 'Tabelas e dependências removidas com sucesso!' as status;
