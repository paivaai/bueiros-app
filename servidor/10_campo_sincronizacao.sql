-- 10_campo_sincronizacao.sql — deixa o campo operacional: situação "não localizado", contexto das fotos e leitura do eixo.
-- Rode depois do 08 (uma vez; é seguro repetir). Não rode junto com outros scripts na mesma execução.

-- 1) nova situação: o campo não achou o bueiro (não existe, soterrado, sem acesso…). Entra na fila de revisão do escritório.
alter type status_bueiro add value if not exists 'nao_localizado';

-- 2) fotos: de que parte do levantamento é cada foto ('' = geral, 'secao', 'pat:<id da patologia>')
alter table fotos add column if not exists ctx text;

-- 3) andamento: conta os não localizados (comparação por texto, pois o valor do enum acabou de ser criado)
create or replace view v_andamento with (security_invoker = true) as
select b.projeto_id,
       count(*)                                           as total,
       count(*) filter (where b.status = 'a_vistoriar')   as a_vistoriar,
       count(*) filter (where b.status = 'rascunho')      as rascunho,
       count(*) filter (where b.status = 'concluido')     as concluido,
       count(*) filter (where b.status = 'devolvido')     as devolvido,
       count(*) filter (where b.status = 'aprovado')      as aprovado,
       max(b.atualizado_em)                               as ultima_atividade,
       count(*) filter (where b.status::text = 'nao_localizado') as nao_localizado
  from bueiros b group by b.projeto_id;

-- 4) funções atualizadas para aceitar "nao_localizado"
-- gestor também grava levantamento (quem usa o painel e vai a campo, como o Filipe); trata-se como campo: só mexe no que é seu ou está livre.
create or replace function salvar_bueiro(p_bueiro jsonb, p_versao_base integer default 0) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_id uuid := (p_bueiro->>'id')::uuid;
  v_proj uuid := (p_bueiro->>'projeto_id')::uuid;
  v_dados jsonb := coalesce(p_bueiro->'dados', '{}'::jsonb);
  v_status status_bueiro := coalesce(nullif(p_bueiro->>'status', ''), 'rascunho')::status_bueiro;
  v_papel papel_usuario := meu_papel();
  a bueiros%rowtype; v_nova integer;
begin
  if auth.uid() is null or v_papel is null then raise exception 'sem acesso' using errcode = '42501'; end if;
  if not pode_ver_projeto(v_proj) then raise exception 'sem acesso ao projeto' using errcode = '42501'; end if;
  if v_papel in ('campo', 'gestor') and v_status in ('aprovado', 'devolvido') then
    raise exception 'campo não define aprovado/devolvido' using errcode = '42501';
  end if;

  select * into a from bueiros where id = v_id for update;
  if not found then
    insert into bueiros (id, projeto_id, codigo, cadastro_id, km, status, atribuido_a, responsavel_nome, latitude, longitude, leste, norte, zona, dados, atualizado_por)
    values (v_id, v_proj, coalesce(nullif(v_dados->>'codigo', ''), 'Sem código'), nullif(v_dados->>'cadastroId', ''), nullif(v_dados->>'km', ''), v_status,
            case when v_papel in ('campo', 'gestor') then auth.uid() end, nullif(v_dados->>'responsavel', ''),
            num_ou_null(v_dados->>'latitude')::double precision, num_ou_null(v_dados->>'longitude')::double precision,
            num_ou_null(v_dados->>'leste'), num_ou_null(v_dados->>'norte'), nullif(v_dados->>'zona', ''), v_dados, auth.uid());
    insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe) values (v_id, v_proj, auth.uid(), 'criado', jsonb_build_object('status', v_status));
    return jsonb_build_object('ok', true, 'versao', 1);
  end if;

  if a.projeto_id <> v_proj then raise exception 'bueiro de outro projeto' using errcode = '42501'; end if;
  if v_papel in ('campo', 'gestor') then
    if a.atribuido_a is not null and a.atribuido_a <> auth.uid() then raise exception 'bueiro atribuído a outra pessoa' using errcode = '42501'; end if;
    if a.status = 'aprovado' then raise exception 'bueiro já aprovado' using errcode = '42501'; end if;
  end if;
  if a.versao <> p_versao_base then
    return jsonb_build_object('ok', false, 'conflito', true, 'versao', a.versao,
                              'servidor', jsonb_build_object('id', a.id, 'status', a.status, 'dados', a.dados, 'atualizado_em', a.atualizado_em, 'atualizado_por', a.atualizado_por));
  end if;
  if v_papel in ('campo', 'gestor') and a.status = 'devolvido' and v_status not in ('concluido', 'nao_localizado') then v_status := 'rascunho'; end if;

  update bueiros set
    codigo = coalesce(nullif(v_dados->>'codigo', ''), codigo), cadastro_id = nullif(v_dados->>'cadastroId', ''), km = nullif(v_dados->>'km', ''),
    status = v_status, atribuido_a = coalesce(atribuido_a, case when v_papel in ('campo', 'gestor') then auth.uid() end),
    responsavel_nome = nullif(v_dados->>'responsavel', ''),
    latitude = num_ou_null(v_dados->>'latitude')::double precision, longitude = num_ou_null(v_dados->>'longitude')::double precision,
    leste = num_ou_null(v_dados->>'leste'), norte = num_ou_null(v_dados->>'norte'), zona = nullif(v_dados->>'zona', ''),
    dados = v_dados, versao = versao + 1, atualizado_em = now(), atualizado_por = auth.uid()
  where id = v_id returning versao into v_nova;
  insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe)
    values (v_id, v_proj, auth.uid(), case when v_status <> a.status then 'status' else 'editado' end, jsonb_build_object('de', a.status, 'para', v_status, 'versao', v_nova));
  return jsonb_build_object('ok', true, 'versao', v_nova);
end $$;

create or replace function revisar_bueiro(p_id uuid, p_aprovar boolean, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare a bueiros%rowtype; v_papel papel_usuario := meu_papel(); novo status_bueiro;
begin
  if v_papel not in ('admin', 'gestor') then raise exception 'só gestor ou admin revisa' using errcode = '42501'; end if;
  select * into a from bueiros where id = p_id for update;
  if not found or not pode_ver_projeto(a.projeto_id) then raise exception 'sem acesso' using errcode = '42501'; end if;
  if a.status not in ('concluido', 'nao_localizado', 'devolvido', 'aprovado') then raise exception 'só dá para revisar bueiro concluído ou não localizado (status atual: %)', a.status; end if;
  if not p_aprovar and coalesce(trim(p_comentario), '') = '' then raise exception 'explique o que precisa ser corrigido'; end if;
  novo := case when p_aprovar then 'aprovado' else 'devolvido' end;
  update bueiros set status = novo, revisado_por = auth.uid(), revisado_em = now(), comentario_revisao = nullif(trim(p_comentario), ''),
         versao = versao + 1, atualizado_em = now() where id = p_id;
  insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe)
    values (p_id, a.projeto_id, auth.uid(), case when p_aprovar then 'aprovado' else 'devolvido' end, jsonb_build_object('comentario', p_comentario));
  return jsonb_build_object('ok', true, 'status', novo);
end $$;

create or replace function atribuir_bueiros(p_ids uuid[], p_usuario uuid) returns integer
language plpgsql security definer set search_path = public as
$$
declare n integer;
begin
  if meu_papel() not in ('admin', 'gestor') then raise exception 'só gestor ou admin atribui' using errcode = '42501'; end if;
  if p_usuario is not null and not exists (select 1 from perfis where id = p_usuario and ativo and organizacao_id = minha_org()) then
    raise exception 'usuário inválido'; end if;
  update bueiros b set atribuido_a = p_usuario, atualizado_em = now()
   where b.id = any (p_ids) and pode_ver_projeto(b.projeto_id) and b.status in ('a_vistoriar', 'rascunho', 'devolvido', 'nao_localizado');
  get diagnostics n = row_count;
  insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe)
    select b.id, b.projeto_id, auth.uid(), 'atribuido', jsonb_build_object('para', p_usuario) from bueiros b where b.id = any (p_ids) and pode_ver_projeto(b.projeto_id);
  return n;
end $$;

grant execute on function salvar_bueiro(jsonb, integer), revisar_bueiro(uuid, boolean, text), atribuir_bueiros(uuid[], uuid) to authenticated;

-- 5) gestor também envia fotos (arquivo e metadados), como o campo
drop policy if exists fotos_inserir on fotos;
create policy fotos_inserir on fotos for insert to authenticated
  with check (pode_ver_projeto(projeto_id) and meu_papel() in ('admin', 'gestor', 'campo') and enviado_por = auth.uid()
              and exists (select 1 from bueiros b where b.id = bueiro_id and b.projeto_id = fotos.projeto_id));
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists fotos_arq_enviar on storage.objects';
    execute $p$ create policy fotos_arq_enviar on storage.objects for insert to authenticated
      with check (bucket_id = 'fotos' and meu_papel() in ('admin', 'gestor', 'campo') and pode_ver_projeto(((storage.foldername(name))[1])::uuid)) $p$;
    execute 'drop policy if exists fotos_arq_atualizar on storage.objects';
    execute $p$ create policy fotos_arq_atualizar on storage.objects for update to authenticated
      using (bucket_id = 'fotos' and (owner = auth.uid() or meu_papel() = 'admin') and pode_ver_projeto(((storage.foldername(name))[1])::uuid)) $p$;
  end if;
end $$;
