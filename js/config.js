/* config.js — ligação do app de campo com o servidor (Supabase).
   A chave abaixo é a PUBLICÁVEL (pode ficar no GitHub; quem protege os dados são as regras RLS do servidor).
   Nunca coloque aqui a chave secret/service_role nem a senha do banco. */
window.BU = window.BU || {};
window.BU.CONFIG = {
  SUPABASE_URL: 'https://lvvjuwowymzuoeycdkgc.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_fUIKBYhP8Lkqw5ip3f0v6g_TREno7Kg',
  USUARIO_DOMINIO: 'gfa-campo.app', // "filipe" vira filipe@gfa-campo.app; quem digita e-mail com @ usa o e-mail
};
