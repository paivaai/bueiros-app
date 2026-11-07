-- 15 · RECUPERAR bueiros do projeto antigo para o projeto novo (NÃO apaga nada do antigo)
-- Regras de segurança:
--  * só copia para a linha do projeto novo com o MESMO código;
--  * só se a linha nova ainda estiver "a_vistoriar" (nunca sobrescreve trabalho feito no novo);
--  * o projeto antigo fica intacto (backup).
-- Rode primeiro a prévia (14). Edite a lista de códigos abaixo (ou use all para todos com versao>1).
do $$
declare
  v_ant uuid := (select id from projetos where id::text like '257e6ac6%');
  v_nov uuid := (select id from projetos where id::text like 'b9c0397c%');
  v_codigos text[] := null;   -- null = todos com versao > 1 (pode trocar por array['codigo1','codigo2'])
  r record; n int := 0;
begin
  if v_ant is null or v_nov is null then raise exception 'projeto não encontrado'; end if;
  for r in
    select o.*, nv.id as novo_id from bueiros o
    join bueiros nv on nv.projeto_id = v_nov and nv.codigo = o.codigo and nv.status = 'a_vistoriar'
    where o.projeto_id = v_ant and o.versao > 1
      and (v_codigos is null or o.codigo = any(v_codigos))
  loop
    update bueiros set
      dados = r.dados || jsonb_build_object('id', r.novo_id),
      status = r.status, atribuido_a = r.atribuido_a, responsavel_nome = r.responsavel_nome,
      latitude = r.latitude, longitude = r.longitude, leste = r.leste, norte = r.norte, zona = r.zona,
      comentario_revisao = r.comentario_revisao,
      versao = versao + 1, atualizado_em = now()
    where id = r.novo_id;
    insert into historico (bueiro_id, projeto_id, acao, detalhe)
      values (r.novo_id, v_nov, 'recuperado', jsonb_build_object('de_projeto', v_ant, 'de_bueiro', r.id, 'versao_origem', r.versao));
    n := n + 1;
  end loop;
  -- bueiros que só existem no projeto antigo (sem linha no novo): cria a linha no novo (exceto testes)
  for r in
    select o.* from bueiros o
    where o.projeto_id = v_ant and o.versao > 1 and o.codigo !~* 'teste'
      and (v_codigos is null or o.codigo = any(v_codigos))
      and not exists (select 1 from bueiros x where x.projeto_id = v_nov and x.codigo = o.codigo)
  loop
    insert into bueiros (id, projeto_id, codigo, cadastro_id, km, status, atribuido_a, responsavel_nome,
                         latitude, longitude, leste, norte, zona, dados, versao, comentario_revisao)
    values (gen_random_uuid(), v_nov, r.codigo, r.cadastro_id, r.km, r.status, r.atribuido_a, r.responsavel_nome,
            r.latitude, r.longitude, r.leste, r.norte, r.zona, r.dados, r.versao + 1, r.comentario_revisao);
    update bueiros set dados = dados || jsonb_build_object('id', id)
      where projeto_id = v_nov and codigo = r.codigo;
    n := n + 1;
  end loop;
  raise notice 'bueiros recuperados: %', n;
end $$;
