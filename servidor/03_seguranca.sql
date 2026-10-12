-- 03_seguranca.sql — segurança por linha (RLS): cada perfil só vê e altera o que pode.
--   admin  : tudo da própria organização
--   gestor : lê os projetos de que é membro; revisa e atribui (por função)
--   campo  : lê os projetos de que é membro; grava levantamento por salvar_bueiro; envia fotos
-- Gravações em bueiros/historico só passam pelas funções do 02 (nada de escrever direto na tabela).

alter table organizacoes    enable row level security;
alter table perfis          enable row level security;
alter table convites        enable row level security;
alter table projetos        enable row level security;
alter table projeto_membros enable row level security;
alter table bueiros         enable row level security;
alter table fotos           enable row level security;
alter table historico       enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant select on organizacoes, perfis, projetos, projeto_membros, bueiros, fotos, historico, v_andamento to authenticated;
grant select, insert, update, delete on convites, projetos, projeto_membros to authenticated;       -- só admin passa nas políticas
grant insert, update, delete on fotos to authenticated;
grant execute on function meu_papel(), minha_org(), pode_ver_projeto(uuid), salvar_bueiro(jsonb, integer), revisar_bueiro(uuid, boolean, text),
                          atribuir_bueiros(uuid[], uuid), importar_bueiros(uuid, jsonb) to authenticated;

create policy org_ler on organizacoes for select to authenticated using (id = minha_org());

create policy perfis_ler on perfis for select to authenticated
  using (id = auth.uid() or (organizacao_id = minha_org() and meu_papel() in ('admin', 'gestor')));
create policy perfis_admin on perfis for update to authenticated
  using (meu_papel() = 'admin' and organizacao_id = minha_org()) with check (organizacao_id = minha_org());

create policy convites_admin on convites for all to authenticated
  using (meu_papel() = 'admin' and organizacao_id = minha_org()) with check (meu_papel() = 'admin' and organizacao_id = minha_org());

create policy projetos_ler on projetos for select to authenticated using (pode_ver_projeto(id));
create policy projetos_admin on projetos for all to authenticated
  using (meu_papel() = 'admin' and organizacao_id = minha_org()) with check (meu_papel() = 'admin' and organizacao_id = minha_org());

create policy membros_ler on projeto_membros for select to authenticated using (pode_ver_projeto(projeto_id));
create policy membros_admin on projeto_membros for all to authenticated
  using (meu_papel() = 'admin' and pode_ver_projeto(projeto_id)) with check (meu_papel() = 'admin' and pode_ver_projeto(projeto_id));

create policy bueiros_ler on bueiros for select to authenticated using (pode_ver_projeto(projeto_id));
create policy historico_ler on historico for select to authenticated using (pode_ver_projeto(projeto_id));

create policy fotos_ler on fotos for select to authenticated using (pode_ver_projeto(projeto_id));
create policy fotos_inserir on fotos for insert to authenticated
  with check (pode_ver_projeto(projeto_id) and meu_papel() in ('admin', 'campo') and enviado_por = auth.uid()
              and exists (select 1 from bueiros b where b.id = bueiro_id and b.projeto_id = fotos.projeto_id));
create policy fotos_editar on fotos for update to authenticated
  using (enviado_por = auth.uid() or meu_papel() = 'admin') with check (pode_ver_projeto(projeto_id));
create policy fotos_apagar on fotos for delete to authenticated
  using ((enviado_por = auth.uid() and exists (select 1 from bueiros b where b.id = bueiro_id and b.status <> 'aprovado')) or (meu_papel() = 'admin' and pode_ver_projeto(projeto_id)));
