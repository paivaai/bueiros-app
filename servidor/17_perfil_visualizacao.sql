-- 17_perfil_visualizacao.sql — novo perfil "Visualização" (cliente): vê o painel e comenta; NÃO edita nada.
-- Como rodar: Supabase → SQL Editor → cole tudo → Run. Pode rodar de novo sem problema.
-- Depois, no painel (Equipe e acessos), crie a pessoa com o papel "Visualização" e marque os projetos que ela pode ver.
--
-- Como a segurança funciona:
--  * meu_papel() passa a devolver NULL para o visualizador. Todas as funções de gravação (salvar, revisar, atribuir,
--    importar, excluir, presença, criar projeto, planejamento, envio de fotos…) já exigem um papel válido, então ficam
--    bloqueadas para ele sem mexer em nenhuma delas.
--  * A leitura continua pelas regras de sempre (pode_ver_projeto): ele só vê os projetos de que é membro.
--  * Comentários: tabela própria, gravada só pela função comentar_bueiro (admin, gestor e visualizador).

alter type papel_usuario add value if not exists 'visualizador';

create or replace function meu_papel() returns papel_usuario
language sql stable security definer set search_path = public as
$$ select case when papel::text = 'visualizador' then null else papel end from perfis where id = auth.uid() and ativo $$;

-- papel real (inclui visualizador), só para uso interno nas regras de comentário
create or replace function meu_papel_real() returns text
language sql stable security definer set search_path = public as
$$ select papel::text from perfis where id = auth.uid() and ativo $$;

create table if not exists comentarios (
  id            uuid primary key default gen_random_uuid(),
  bueiro_id     uuid not null references bueiros(id) on delete cascade,
  projeto_id    uuid not null references projetos(id) on delete cascade,
  usuario_id    uuid references perfis(id),
  usuario_nome  text,
  papel         text,
  texto         text not null check (length(btrim(texto)) between 1 and 2000),
  criado_em     timestamptz not null default now()
);
create index if not exists comentarios_bueiro on comentarios (bueiro_id, criado_em);
alter table comentarios enable row level security;
drop policy if exists comentarios_ler on comentarios;
create policy comentarios_ler on comentarios for select to authenticated
  using (pode_ver_projeto(projeto_id) and coalesce(meu_papel_real(), '') in ('admin', 'gestor', 'visualizador'));
-- sem política de insert/update/delete: ninguém grava direto, só pela função abaixo

create or replace function comentar_bueiro(p_bueiro uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare b bueiros%rowtype; v_papel text := meu_papel_real(); v_nome text; v_id uuid;
begin
  if auth.uid() is null or v_papel is null or v_papel not in ('admin', 'gestor', 'visualizador') then raise exception 'sem acesso' using errcode = '42501'; end if;
  select * into b from bueiros where id = p_bueiro;
  if not found or not pode_ver_projeto(b.projeto_id) then raise exception 'sem acesso ao bueiro' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_texto, ''))) = 0 then raise exception 'escreva o comentário'; end if;
  select nome into v_nome from perfis where id = auth.uid();
  insert into comentarios (bueiro_id, projeto_id, usuario_id, usuario_nome, papel, texto)
    values (b.id, b.projeto_id, auth.uid(), v_nome, v_papel, left(btrim(p_texto), 2000)) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function comentar_bueiro(uuid, text), meu_papel_real() from public, anon;
grant execute on function comentar_bueiro(uuid, text), meu_papel_real() to authenticated;
grant select on comentarios to authenticated;

select 'ok: perfil Visualização e comentários prontos' as resultado;
