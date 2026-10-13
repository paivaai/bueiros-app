-- 08_planejamento.sql — PLANEJAMENTO do levantamento pelo escritório: eixo da rodovia, bueiros marcados no mapa / importados de KMZ.
-- Rode depois do 07 (uma vez; é seguro repetir). Admin e gestor planejam; o campo só recebe os pontos "A vistoriar".

alter table projetos add column if not exists eixo jsonb;   -- eixo da rodovia: { rodovia, kmIni, pts:[[lat,lon],…] }

-- Salva o eixo (a linha da rodovia com o km inicial) usado para dividir a estrada em km e nomear os bueiros.
create or replace function salvar_eixo(p_projeto uuid, p_eixo jsonb) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if meu_papel() not in ('admin', 'gestor') or not pode_ver_projeto(p_projeto) then raise exception 'sem acesso' using errcode = '42501'; end if;
  if p_eixo is not null and jsonb_typeof(p_eixo) <> 'object' then raise exception 'eixo inválido'; end if;
  update projetos set eixo = p_eixo where id = p_projeto;
  insert into historico (projeto_id, usuario_id, acao, detalhe)
    values (p_projeto, auth.uid(), 'eixo_definido', jsonb_build_object('pontos', coalesce(jsonb_array_length(p_eixo->'pts'), 0)));
end $$;

-- Cria ou atualiza bueiros planejados (status "A vistoriar"). Quem já foi vistoriado NÃO é alterado.
-- p_lista = [ {id, codigo, km, latitude, longitude, leste, norte, zona, dados:{…}} ]
create or replace function salvar_planejados(p_projeto uuid, p_lista jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare it jsonb; v_id uuid; v_novo uuid; v_st status_bueiro; novos integer := 0; alterados integer := 0; bloqueados integer := 0; v_cod text; v_dados jsonb;
begin
  if meu_papel() not in ('admin', 'gestor') or not pode_ver_projeto(p_projeto) then raise exception 'sem acesso' using errcode = '42501'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    v_cod := nullif(trim(coalesce(it->>'codigo', '')), '');
    if v_cod is null then raise exception 'todo bueiro precisa de um código (nome)'; end if;
    v_id := nullif(it->>'id', '')::uuid; v_novo := coalesce(v_id, gen_random_uuid());
    v_dados := coalesce(it->'dados', '{}'::jsonb) || jsonb_build_object('codigo', v_cod, 'km', it->>'km', 'latitude', it->'latitude', 'longitude', it->'longitude',
                 'leste', it->'leste', 'norte', it->'norte', 'zona', it->>'zona', 'status', 'a_vistoriar');
    select status into v_st from bueiros where id = v_id and projeto_id = p_projeto;
    if found then
      if v_st <> 'a_vistoriar' then bloqueados := bloqueados + 1; continue; end if;
      begin
        update bueiros set codigo = v_cod, km = nullif(it->>'km', ''), latitude = num_ou_null(it->>'latitude')::double precision, longitude = num_ou_null(it->>'longitude')::double precision,
               leste = num_ou_null(it->>'leste'), norte = num_ou_null(it->>'norte'), zona = nullif(it->>'zona', ''), dados = dados || v_dados,
               versao = versao + 1, atualizado_em = now(), atualizado_por = auth.uid()
         where id = v_id;
      exception when unique_violation then raise exception 'já existe outro bueiro com o código "%"', v_cod using errcode = '23505';
      end;
      alterados := alterados + 1;
    else
      begin
        insert into bueiros (id, projeto_id, codigo, km, status, latitude, longitude, leste, norte, zona, dados, atualizado_por)
        values (v_novo, p_projeto, v_cod, nullif(it->>'km', ''), 'a_vistoriar',
                num_ou_null(it->>'latitude')::double precision, num_ou_null(it->>'longitude')::double precision,
                num_ou_null(it->>'leste'), num_ou_null(it->>'norte'), nullif(it->>'zona', ''),
                v_dados || jsonb_build_object('id', v_novo, 'origem', 'planejamento'), auth.uid());
      exception when unique_violation then raise exception 'já existe um bueiro com o código "%"', v_cod using errcode = '23505';
      end;
      novos := novos + 1;
    end if;
  end loop;
  insert into historico (projeto_id, usuario_id, acao, detalhe) values (p_projeto, auth.uid(), 'planejamento', jsonb_build_object('novos', novos, 'alterados', alterados, 'bloqueados', bloqueados));
  return jsonb_build_object('novos', novos, 'alterados', alterados, 'bloqueados', bloqueados);
end $$;

-- Remove bueiros planejados que ainda não foram vistoriados (mais nada é apagado).
create or replace function remover_planejados(p_projeto uuid, p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as
$$
declare n integer;
begin
  if meu_papel() not in ('admin', 'gestor') or not pode_ver_projeto(p_projeto) then raise exception 'sem acesso' using errcode = '42501'; end if;
  delete from bueiros where projeto_id = p_projeto and id = any(coalesce(p_ids, '{}')) and status = 'a_vistoriar'
    and coalesce(dados->>'responsavel', '') = '' and not exists (select 1 from fotos f where f.bueiro_id = bueiros.id);
  get diagnostics n = row_count;
  insert into historico (projeto_id, usuario_id, acao, detalhe) values (p_projeto, auth.uid(), 'planejados_removidos', jsonb_build_object('quantidade', n));
  return n;
end $$;

revoke all on function salvar_eixo(uuid, jsonb), salvar_planejados(uuid, jsonb), remover_planejados(uuid, uuid[]) from public, anon;
grant execute on function salvar_eixo(uuid, jsonb), salvar_planejados(uuid, jsonb), remover_planejados(uuid, uuid[]) to authenticated;
