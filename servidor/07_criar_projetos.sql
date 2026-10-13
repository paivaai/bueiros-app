-- 07_criar_projetos.sql — o ESCRITÓRIO (admin e gestor) cria projetos e define quem trabalha em cada um.
-- Rode depois dos scripts 01–05 (pode rodar uma vez só; é seguro repetir: usa "create or replace").
-- Quem cria o projeto entra nele automaticamente; o administrador enxerga todos os projetos da organização.

create or replace function criar_projeto(
  p_nome text, p_rodovia text default null, p_descricao text default null,
  p_fuso text default '23', p_hemisferio text default 'S', p_membros uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as
$$
declare v_org uuid := minha_org(); v_id uuid; m uuid;
begin
  if meu_papel() not in ('admin', 'gestor') then raise exception 'só gestor ou admin cria projeto' using errcode = '42501'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'informe o nome do projeto'; end if;
  if p_fuso !~ '^(1[0-9]|2[0-9]|[1-9])$' then raise exception 'fuso inválido'; end if;
  if p_hemisferio not in ('S', 'N') then raise exception 'hemisfério deve ser S ou N'; end if;
  insert into projetos (organizacao_id, nome, descricao, rodovia, fuso, hemisferio, criado_por)
    values (v_org, trim(p_nome), nullif(trim(p_descricao), ''), nullif(trim(p_rodovia), ''), p_fuso, p_hemisferio, auth.uid())
    returning id into v_id;
  insert into projeto_membros (projeto_id, usuario_id) values (v_id, auth.uid()) on conflict do nothing;
  foreach m in array coalesce(p_membros, '{}') loop
    if exists (select 1 from perfis where id = m and ativo and organizacao_id = v_org) then
      insert into projeto_membros (projeto_id, usuario_id) values (v_id, m) on conflict do nothing;
    end if;
  end loop;
  insert into historico (projeto_id, usuario_id, acao, detalhe) values (v_id, auth.uid(), 'projeto_criado', jsonb_build_object('nome', trim(p_nome)));
  return v_id;
end $$;

-- Define a equipe do projeto (quem enxerga e trabalha nele). Quem está logado nunca se remove por engano.
create or replace function definir_membros_projeto(p_projeto uuid, p_usuarios uuid[]) returns integer
language plpgsql security definer set search_path = public as
$$
declare v_org uuid := minha_org(); n integer := 0; m uuid;
begin
  if meu_papel() not in ('admin', 'gestor') or not pode_ver_projeto(p_projeto) then raise exception 'sem acesso' using errcode = '42501'; end if;
  delete from projeto_membros pm
   where pm.projeto_id = p_projeto and pm.usuario_id <> auth.uid() and not (pm.usuario_id = any (coalesce(p_usuarios, '{}')));
  foreach m in array coalesce(p_usuarios, '{}') loop
    if exists (select 1 from perfis where id = m and ativo and organizacao_id = v_org) then
      insert into projeto_membros (projeto_id, usuario_id) values (p_projeto, m) on conflict do nothing; n := n + 1;
    end if;
  end loop;
  insert into historico (projeto_id, usuario_id, acao, detalhe) values (p_projeto, auth.uid(), 'equipe_definida', jsonb_build_object('membros', n));
  return n;
end $$;

-- Gestor também pode editar os dados do projeto (nome, rodovia, descrição, fuso) e arquivar.
create or replace function editar_projeto(
  p_projeto uuid, p_nome text, p_rodovia text, p_descricao text, p_fuso text, p_hemisferio text, p_ativo boolean default true
) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if meu_papel() not in ('admin', 'gestor') or not pode_ver_projeto(p_projeto) then raise exception 'sem acesso' using errcode = '42501'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'informe o nome do projeto'; end if;
  if p_fuso !~ '^(1[0-9]|2[0-9]|[1-9])$' then raise exception 'fuso inválido'; end if;
  if p_hemisferio not in ('S', 'N') then raise exception 'hemisfério deve ser S ou N'; end if;
  update projetos set nome = trim(p_nome), rodovia = nullif(trim(p_rodovia), ''), descricao = nullif(trim(p_descricao), ''),
         fuso = p_fuso, hemisferio = p_hemisferio, ativo = coalesce(p_ativo, true) where id = p_projeto;
  insert into historico (projeto_id, usuario_id, acao, detalhe) values (p_projeto, auth.uid(), 'projeto_editado', jsonb_build_object('ativo', p_ativo));
end $$;

revoke all on function criar_projeto(text, text, text, text, text, uuid[]), definir_membros_projeto(uuid, uuid[]),
  editar_projeto(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function criar_projeto(text, text, text, text, text, uuid[]), definir_membros_projeto(uuid, uuid[]),
  editar_projeto(uuid, text, text, text, text, text, boolean) to authenticated;
