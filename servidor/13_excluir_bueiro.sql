-- 13_excluir_bueiro.sql — excluir de verdade um bueiro criado em campo (rascunho).
-- Antes, o app apagava só no celular e o servidor devolvia o bueiro na próxima sincronização.
-- Regras: o operador (campo) e o gestor só excluem o que eles mesmos criaram e que NÃO veio do cadastro/planejamento do escritório;
--         o administrador exclui qualquer bueiro que ainda não foi aprovado. Bueiro aprovado nunca é excluído por aqui.
-- Como rodar: Supabase → SQL Editor → cole tudo → Run. Pode rodar de novo sem problema.

create or replace function excluir_bueiro(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  b bueiros%rowtype;
  v_papel papel_usuario := meu_papel();
begin
  if auth.uid() is null or v_papel is null then raise exception 'sem acesso' using errcode = '42501'; end if;
  select * into b from bueiros where id = p_id;
  if not found then return jsonb_build_object('ok', true, 'ja_excluido', true); end if;
  if not pode_ver_projeto(b.projeto_id) then raise exception 'sem acesso ao projeto' using errcode = '42501'; end if;
  if b.status::text = 'aprovado' then raise exception 'bueiro já aprovado não pode ser excluído' using errcode = '42501'; end if;
  if v_papel in ('campo', 'gestor') then
    if coalesce(b.dados->>'origem', '') in ('cadastro', 'planejamento') or b.dados ? 'planejado' then
      raise exception 'bueiro do cadastro/planejamento só o escritório exclui' using errcode = '42501';
    end if;
    if b.atribuido_a is not null and b.atribuido_a <> auth.uid() then
      raise exception 'bueiro de outra pessoa' using errcode = '42501';
    end if;
  end if;
  -- fotos do bueiro: o arquivo no Storage é removido pelo app; aqui saem os registros (o resto cai em cascata)
  delete from bueiros where id = p_id;
  insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe)
    values (null, b.projeto_id, auth.uid(), 'excluido', jsonb_build_object('bueiro', p_id, 'codigo', b.codigo, 'status', b.status));
  return jsonb_build_object('ok', true);
end $$;

grant execute on function excluir_bueiro(uuid) to authenticated;

select 'ok: excluir_bueiro criada' as resultado;
