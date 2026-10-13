/* Configuração do painel de gestão.
   Com SUPABASE_URL preenchido o painel usa o servidor real. Para ver o MODO DEMONSTRAÇÃO (dados fictícios) abra o painel com ?demo=1 no final do endereço.
   Para usar de verdade, preencha com a "Project URL" e a chave "anon public" do Supabase
   (Project Settings → API). A chave anon pode ficar no GitHub; NUNCA coloque a service_role. */
window.GESTAO_CONFIG = {
  SUPABASE_URL: 'https://lvvjuwowymzuoeycdkgc.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_fUIKBYhP8Lkqw5ip3f0v6g_TREno7Kg', // chave PUBLICÁVEL (pode ficar no GitHub). Nunca a secret/service_role.
};
