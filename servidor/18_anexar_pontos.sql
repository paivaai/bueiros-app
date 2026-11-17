-- 18_anexar_pontos.sql — painel envia o TXT do levantamento (pontos RTK) para um bueiro.
-- Rode uma vez no SQL Editor do Supabase (é seguro repetir). Só admin e gestor.
create or replace function anexar_pontos(p_bueiro uuid, p_pontos jsonb, p_arquivo text default null, p_substituir boolean default true) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_papel papel_usuario := meu_papel();
  a bueiros%rowtype; v_novos jsonb; v_nova integer;
begin
  if auth.uid() is null or v_papel is null or v_papel not in ('admin', 'gestor') then raise exception 'sem acesso' using errcode = '42501'; end if;
  if jsonb_typeof(p_pontos) <> 'array' or jsonb_array_length(p_pontos) = 0 then raise exception 'nenhum ponto' using errcode = '22023'; end if;
  if jsonb_array_length(p_pontos) > 5000 then raise exception 'pontos demais (máximo 5000)' using errcode = '22023'; end if;
  select * into a from bueiros where id = p_bueiro for update;
  if not found then raise exception 'bueiro não encontrado' using errcode = '42501'; end if;
  if not pode_ver_projeto(a.projeto_id) then raise exception 'sem acesso ao projeto' using errcode = '42501'; end if;
  v_novos := case when p_substituir then p_pontos else coalesce(a.dados->'pontos', '[]'::jsonb) || p_pontos end;
  update bueiros set
    dados = jsonb_set(jsonb_set(coalesce(dados, '{}'::jsonb), '{pontos}', v_novos), '{pontosArquivo}', to_jsonb(coalesce(p_arquivo, ''))),
    versao = versao + 1, atualizado_em = now(), atualizado_por = auth.uid()
  where id = p_bueiro returning versao into v_nova;
  insert into historico (bueiro_id, projeto_id, usuario_id, acao, detalhe)
    values (p_bueiro, a.projeto_id, auth.uid(), 'editado', jsonb_build_object('pontos', jsonb_array_length(v_novos), 'arquivo', p_arquivo, 'versao', v_nova));
  return jsonb_build_object('ok', true, 'versao', v_nova);
end $$;
grant execute on function anexar_pontos(uuid, jsonb, text, boolean) to authenticated;
