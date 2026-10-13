-- 02_funcoes.sql — funções de apoio, convite automático no cadastro e operações do app (salvar, revisar, importar)

-- ---------- apoio ----------
create or replace function meu_papel() returns papel_usuario
language sql stable security definer set search_path = public as
$$ select papel from perfis where id = auth.uid() and ativo $$;

create or replace function minha_org() returns uuid
language sql stable security definer set search_path = public as
$$ select organizacao_id from perfis where id = auth.uid() and ativo $$;

-- true se a pessoa é admin da organização do projeto, ou é membro do projeto
create or replace function pode_ver_projeto(p_projeto uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from perfis u join projetos p on p.id = p_projeto
      where u.id = auth.uid() and u.ativo and u.organizacao_id = p.organizacao_id
        and (u.papel = 'admin' or exists (select 1 from projeto_membros m where m.projeto_id = p.id and m.usuario_id = u.id)))
$$;

create or replace function num_ou_null(t text) returns numeric
language plpgsql immutable as
$$ begin return nullif(trim(t), '')::numeric; exception when others then return null; end $$;

-- ---------- convite: ao criar a conta, o perfil nasce do convite (sem convite = sem acesso) ----------
create or replace function ao_criar_usuario() returns trigger
language plpgsql security definer set search_path = public as
$$
declare c convites%rowtype; pid uuid;
begin
  select * into c from convites where lower(email) = lower(new.email) and usado_em is null limit 1;
  if not found then return new; end if;
  insert into perfis (id, organizacao_id, nome, email, papel)
    values (new.id, c.organizacao_id, coalesce(nullif(c.nome, ''), split_part(new.email, '@', 1)), new.email, c.papel);
  foreach pid in array c.projetos loop
    insert into projeto_membros (projeto_id, usuario_id) values (pid, new.id) on conflict do nothing;
  end loop;
  update convites set usado_em = now() where id = c.id;
  return new;
end $$;
create trigger trg_ao_criar_usuario after insert on auth.users for each row execute function ao_criar_usuario();

-- ---------- salvar_bueiro: o app de campo (e o admin) gravam por aqui ----------
-- p_bueiro = { id, projeto_id, status, dados:{...levantamento...} }.  p_versao_base = versão que o app tinha ao editar (0 = novo).
-- Retorna { ok, versao } ou { ok:false, conflito:true, servidor:{...} } se outra pessoa gravou antes.
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
  if v_papel = 'gestor' then raise exception 'gestor não grava levantamento: use revisar_bueiro' using errcode = '42501'; end if;
  if not pode_ver_projeto(v_proj) then raise exception 'sem acesso ao projeto' using errcode = '42501'; end if;
  if v_papel = 'campo' and v_status in ('aprovado', 'devolvido') then
    raise exception 'campo não define aprovado/devolvido' using errcode = '42501';
  end if;

  select * into a from bueiros where id = v_id for update;
  if not found then
    insert into bueiros (id, projeto_id, codigo, cadastro_id, km, status, atribuido_a, responsavel_nome, latitude, longitude, leste, norte, zona, dados, atualizado_por)
    values (v_id, v_proj, coalesce(nullif(v_dados->>'codigo', ''), 'Sem código'), nullif(v_dados->>'cadastroId', ''), nullif(v_dados->>'km', ''), v_status,
            case when v_papel = 'campo' then auth.uid() end, nullif(v_dados->>'responsavel', ''),
            num_ou_null(v_dados->>'latitude')::double precision, num_ou_null(v_dados->>'longitude')::double precision,
            num_ou_null(v_dados->>'leste'), num_ou_null(v_dados->>'norte'), nullif(v_dados->>'zona', ''), v_dados, auth.uid());
    insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe) values (v_id, v_proj, auth.uid(), 'criado', jsonb_build_object('status', v_status));
    return jsonb_build_object('ok', true, 'versao', 1);
  end if;

  if a.projeto_id <> v_proj then raise exception 'bueiro de outro projeto' using errcode = '42501'; end if;
  if v_papel = 'campo' then
    if a.atribuido_a is not null and a.atribuido_a <> auth.uid() then raise exception 'bueiro atribuído a outra pessoa' using errcode = '42501'; end if;
    if a.status = 'aprovado' then raise exception 'bueiro já aprovado' using errcode = '42501'; end if;
  end if;
  if a.versao <> p_versao_base then
    return jsonb_build_object('ok', false, 'conflito', true, 'versao', a.versao,
                              'servidor', jsonb_build_object('id', a.id, 'status', a.status, 'dados', a.dados, 'atualizado_em', a.atualizado_em, 'atualizado_por', a.atualizado_por));
  end if;
  if v_papel = 'campo' and a.status = 'devolvido' and v_status <> 'concluido' then v_status := 'rascunho'; end if;

  update bueiros set
    codigo = coalesce(nullif(v_dados->>'codigo', ''), codigo), cadastro_id = nullif(v_dados->>'cadastroId', ''), km = nullif(v_dados->>'km', ''),
    status = v_status, atribuido_a = coalesce(atribuido_a, case when v_papel = 'campo' then auth.uid() end),
    responsavel_nome = nullif(v_dados->>'responsavel', ''),
    latitude = num_ou_null(v_dados->>'latitude')::double precision, longitude = num_ou_null(v_dados->>'longitude')::double precision,
    leste = num_ou_null(v_dados->>'leste'), norte = num_ou_null(v_dados->>'norte'), zona = nullif(v_dados->>'zona', ''),
    dados = v_dados, versao = versao + 1, atualizado_em = now(), atualizado_por = auth.uid()
  where id = v_id returning versao into v_nova;
  insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe)
    values (v_id, v_proj, auth.uid(), case when v_status <> a.status then 'status' else 'editado' end, jsonb_build_object('de', a.status, 'para', v_status, 'versao', v_nova));
  return jsonb_build_object('ok', true, 'versao', v_nova);
end $$;

-- ---------- revisar_bueiro: escritório aprova ou devolve (só um bueiro "concluído") ----------
create or replace function revisar_bueiro(p_id uuid, p_aprovar boolean, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare a bueiros%rowtype; v_papel papel_usuario := meu_papel(); novo status_bueiro;
begin
  if v_papel not in ('admin', 'gestor') then raise exception 'só gestor ou admin revisa' using errcode = '42501'; end if;
  select * into a from bueiros where id = p_id for update;
  if not found or not pode_ver_projeto(a.projeto_id) then raise exception 'sem acesso' using errcode = '42501'; end if;
  if a.status not in ('concluido', 'devolvido', 'aprovado') then raise exception 'só dá para revisar bueiro concluído (status atual: %)', a.status; end if;
  if not p_aprovar and coalesce(trim(p_comentario), '') = '' then raise exception 'explique o que precisa ser corrigido'; end if;
  novo := case when p_aprovar then 'aprovado' else 'devolvido' end;
  update bueiros set status = novo, revisado_por = auth.uid(), revisado_em = now(), comentario_revisao = nullif(trim(p_comentario), ''),
         versao = versao + 1, atualizado_em = now() where id = p_id;
  insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe)
    values (p_id, a.projeto_id, auth.uid(), case when p_aprovar then 'aprovado' else 'devolvido' end, jsonb_build_object('comentario', p_comentario));
  return jsonb_build_object('ok', true, 'status', novo);
end $$;

-- ---------- atribuir_bueiros: escritório distribui bueiros para a equipe de campo ----------
create or replace function atribuir_bueiros(p_ids uuid[], p_usuario uuid) returns integer
language plpgsql security definer set search_path = public as
$$
declare n integer;
begin
  if meu_papel() not in ('admin', 'gestor') then raise exception 'só gestor ou admin atribui' using errcode = '42501'; end if;
  if p_usuario is not null and not exists (select 1 from perfis where id = p_usuario and ativo and organizacao_id = minha_org()) then
    raise exception 'usuário inválido'; end if;
  update bueiros b set atribuido_a = p_usuario, atualizado_em = now()
   where b.id = any (p_ids) and pode_ver_projeto(b.projeto_id) and b.status in ('a_vistoriar', 'rascunho', 'devolvido');
  get diagnostics n = row_count;
  insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe)
    select b.id, b.projeto_id, auth.uid(), 'atribuido', jsonb_build_object('para', p_usuario) from bueiros b where b.id = any (p_ids) and pode_ver_projeto(b.projeto_id);
  return n;
end $$;

-- ---------- importar_bueiros: carrega o cadastro (KMZ já convertido pelo app) no projeto, sem duplicar ----------
-- p_lista = [ {id, codigo, cadastroId, km, status:'a_vistoriar', ... , dados:{...}} ]
create or replace function importar_bueiros(p_projeto uuid, p_lista jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare it jsonb; v_dados jsonb; novos integer := 0; repetidos integer := 0; v_cod text;
begin
  if meu_papel() not in ('admin', 'gestor') or not pode_ver_projeto(p_projeto) then raise exception 'sem acesso' using errcode = '42501'; end if;
  for it in select * from jsonb_array_elements(p_lista) loop
    v_dados := coalesce(it->'dados', it);
    v_cod := coalesce(nullif(v_dados->>'codigo', ''), 'Sem código');
    if exists (select 1 from bueiros where projeto_id = p_projeto and (codigo = v_cod or (nullif(v_dados->>'cadastroId', '') is not null and cadastro_id = v_dados->>'cadastroId'))) then
      repetidos := repetidos + 1; continue;
    end if;
    insert into bueiros (id, projeto_id, codigo, cadastro_id, km, status, latitude, longitude, leste, norte, zona, dados, atualizado_por)
    values (coalesce(nullif(it->>'id', '')::uuid, nullif(v_dados->>'id', '')::uuid, gen_random_uuid()), p_projeto, v_cod, nullif(v_dados->>'cadastroId', ''), nullif(v_dados->>'km', ''), 'a_vistoriar',
            num_ou_null(v_dados->>'latitude')::double precision, num_ou_null(v_dados->>'longitude')::double precision,
            num_ou_null(v_dados->>'leste'), num_ou_null(v_dados->>'norte'), nullif(v_dados->>'zona', ''), v_dados, auth.uid());
    novos := novos + 1;
  end loop;
  insert into historico (projeto_id, usuario_id, acao, detalhe) values (p_projeto, auth.uid(), 'importacao', jsonb_build_object('novos', novos, 'repetidos', repetidos));
  return jsonb_build_object('novos', novos, 'repetidos', repetidos);
end $$;

-- ---------- andamento (para o painel): respeita a segurança por linha do usuário que consulta ----------
create or replace view v_andamento with (security_invoker = true) as
select b.projeto_id,
       count(*)                                           as total,
       count(*) filter (where b.status = 'a_vistoriar')   as a_vistoriar,
       count(*) filter (where b.status = 'rascunho')      as rascunho,
       count(*) filter (where b.status = 'concluido')     as concluido,
       count(*) filter (where b.status = 'devolvido')     as devolvido,
       count(*) filter (where b.status = 'aprovado')      as aprovado,
       max(b.atualizado_em)                               as ultima_atividade
  from bueiros b group by b.projeto_id;
