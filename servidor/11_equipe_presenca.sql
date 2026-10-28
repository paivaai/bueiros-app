-- 11_equipe_presenca.sql — (1) o painel cria usuário e senha direto, sem ir ao Supabase;
--                          (2) tabela separada de PRESENÇA (botão "GPS aqui" do app): onde a equipe esteve.
-- Rode DEPOIS dos scripts 01–10. É seguro repetir (create or replace / if not exists).

create extension if not exists pgcrypto with schema extensions;

-- ============================================================ 1) usuários criados pelo painel
-- Cria a conta (login por USUÁRIO: "joao" vira joao@gfa-campo.app), o perfil e a entrada nos projetos escolhidos.
-- Admin cria qualquer papel; gestor cria só quem é de campo. Devolve o usuário e o e-mail interno.
create or replace function criar_usuario(
  p_usuario text, p_nome text, p_senha text, p_papel papel_usuario default 'campo', p_projetos uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as
$$
declare
  v_meu papel_usuario := meu_papel(); v_org uuid := minha_org();
  v_user text := lower(regexp_replace(trim(coalesce(p_usuario, '')), '\s+', '', 'g'));
  v_email text; v_id uuid := gen_random_uuid(); pid uuid;
begin
  if v_meu is null or v_meu not in ('admin', 'gestor') then raise exception 'sem acesso' using errcode = '42501'; end if;
  if v_meu = 'gestor' and p_papel <> 'campo' then raise exception 'o gestor só cadastra pessoas de campo' using errcode = '42501'; end if;
  if v_user = '' then raise exception 'informe o usuário'; end if;
  v_email := case when position('@' in v_user) > 0 then v_user else v_user || '@gfa-campo.app' end;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'usuário ou e-mail inválido'; end if;
  if length(coalesce(p_senha, '')) < 6 then raise exception 'a senha precisa ter pelo menos 6 caracteres'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'já existe uma conta com "%"', v_user using errcode = '23505'; end if;

  -- o convite leva o papel, o nome e os projetos; o gatilho ao_criar_usuario cria o perfil e a participação nos projetos
  delete from convites where lower(email) = v_email and usado_em is null;
  insert into convites (organizacao_id, email, nome, papel, projetos, criado_por)
    values (v_org, v_email, nullif(trim(p_nome), ''), p_papel,
            coalesce((select array_agg(p.id) from projetos p where p.id = any (coalesce(p_projetos, '{}')) and p.organizacao_id = v_org), '{}'), auth.uid());

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, crypt(p_senha, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());

  if not exists (select 1 from perfis where id = v_id) then   -- se o gatilho não rodou, cria na mão
    insert into perfis (id, organizacao_id, nome, email, papel) values (v_id, v_org, coalesce(nullif(trim(p_nome), ''), split_part(v_email, '@', 1)), v_email, p_papel);
    foreach pid in array coalesce(p_projetos, '{}') loop
      if exists (select 1 from projetos where id = pid and organizacao_id = v_org) then insert into projeto_membros (projeto_id, usuario_id) values (pid, v_id) on conflict do nothing; end if;
    end loop;
    update convites set usado_em = now() where lower(email) = v_email and usado_em is null;
  end if;
  insert into historico (usuario_id, acao, detalhe) values (auth.uid(), 'usuario_criado', jsonb_build_object('usuario', v_user, 'papel', p_papel));
  return jsonb_build_object('id', v_id, 'usuario', v_user, 'email', v_email);
end $$;

-- Troca a senha de alguém da mesma organização (admin: qualquer um; gestor: só quem é de campo).
create or replace function redefinir_senha(p_usuario uuid, p_senha text) returns void
language plpgsql security definer set search_path = public, extensions, auth as
$$
declare v_meu papel_usuario := meu_papel(); v_alvo perfis%rowtype;
begin
  if v_meu is null or v_meu not in ('admin', 'gestor') then raise exception 'sem acesso' using errcode = '42501'; end if;
  select * into v_alvo from perfis where id = p_usuario and organizacao_id = minha_org();
  if not found then raise exception 'pessoa não encontrada'; end if;
  if v_meu = 'gestor' and v_alvo.papel <> 'campo' then raise exception 'o gestor só troca a senha de pessoas de campo' using errcode = '42501'; end if;
  if length(coalesce(p_senha, '')) < 6 then raise exception 'a senha precisa ter pelo menos 6 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_usuario;
  insert into historico (usuario_id, acao, detalhe) values (auth.uid(), 'senha_redefinida', jsonb_build_object('para', v_alvo.email));
end $$;

-- Ativa ou desativa o acesso de uma pessoa (não apaga nada do que ela levantou).
create or replace function definir_ativo(p_usuario uuid, p_ativo boolean) returns void
language plpgsql security definer set search_path = public as
$$
declare v_meu papel_usuario := meu_papel(); v_alvo perfis%rowtype;
begin
  if v_meu is null or v_meu not in ('admin', 'gestor') then raise exception 'sem acesso' using errcode = '42501'; end if;
  select * into v_alvo from perfis where id = p_usuario and organizacao_id = minha_org();
  if not found then raise exception 'pessoa não encontrada'; end if;
  if p_usuario = auth.uid() then raise exception 'você não pode desativar a si mesmo'; end if;
  if v_meu = 'gestor' and v_alvo.papel <> 'campo' then raise exception 'o gestor só altera pessoas de campo' using errcode = '42501'; end if;
  update perfis set ativo = coalesce(p_ativo, true) where id = p_usuario;
end $$;

revoke all on function criar_usuario(text, text, text, papel_usuario, uuid[]), redefinir_senha(uuid, text), definir_ativo(uuid, boolean) from public, anon;
grant execute on function criar_usuario(text, text, text, papel_usuario, uuid[]), redefinir_senha(uuid, text), definir_ativo(uuid, boolean) to authenticated;

-- ============================================================ 2) presença da equipe ("GPS aqui")
-- Cada toque em "GPS aqui" no app grava um registro aqui, numa tabela PRÓPRIA (não mistura com o levantamento).
-- Serve ao gerenciamento: conferir se a equipe passou no local e a que distância do ponto planejado.
create table if not exists presencas (
  id             uuid primary key,                       -- gerado no aparelho (evita duplicar quando reenvia)
  projeto_id     uuid not null references projetos(id) on delete cascade,
  bueiro_id      uuid references bueiros(id) on delete set null,
  usuario_id     uuid references perfis(id),
  usuario_nome   text,
  latitude       double precision not null,
  longitude      double precision not null,
  precisao_m     numeric,                                -- precisão informada pelo GPS do celular
  dist_planejado_m numeric,                              -- distância até o pin do planejamento (se existir)
  em             timestamptz not null,                   -- hora no aparelho
  recebido_em    timestamptz not null default now()
);
create index if not exists presencas_projeto on presencas (projeto_id, em desc);
create index if not exists presencas_bueiro on presencas (bueiro_id, em desc);
alter table presencas enable row level security;
drop policy if exists presencas_ler on presencas;
create policy presencas_ler on presencas for select to authenticated using (pode_ver_projeto(projeto_id));

-- O app envia os registros pendentes por aqui (idempotente: o mesmo id não duplica).
create or replace function registrar_presencas(p_lista jsonb) returns integer
language plpgsql security definer set search_path = public as
$$
declare it jsonb; n integer := 0; v_proj uuid; v_b uuid; v_nome text;
begin
  if auth.uid() is null or meu_papel() is null then raise exception 'sem acesso' using errcode = '42501'; end if;
  select nome into v_nome from perfis where id = auth.uid();
  for it in select * from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    v_proj := nullif(it->>'projeto_id', '')::uuid;
    if v_proj is null or not pode_ver_projeto(v_proj) then continue; end if;
    v_b := nullif(it->>'bueiro_id', '')::uuid;
    if v_b is not null and not exists (select 1 from bueiros where id = v_b and projeto_id = v_proj) then v_b := null; end if;
    insert into presencas (id, projeto_id, bueiro_id, usuario_id, usuario_nome, latitude, longitude, precisao_m, dist_planejado_m, em)
      values ((it->>'id')::uuid, v_proj, v_b, auth.uid(), v_nome, (it->>'latitude')::double precision, (it->>'longitude')::double precision,
              num_ou_null(it->>'precisao'), num_ou_null(it->>'distancia'), coalesce((it->>'em')::timestamptz, now()))
      on conflict (id) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function registrar_presencas(jsonb) from public, anon;
grant execute on function registrar_presencas(jsonb) to authenticated;
grant select on presencas to authenticated;

select 'ok' as resultado, (select count(*) from presencas) as presencas;
