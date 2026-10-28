-- 12_papel_usuario.sql — o administrador muda o papel de uma pessoa (ex.: promover o Filipe de operador a gestor).
-- Rode DEPOIS do 11. É seguro repetir.
create or replace function definir_papel(p_usuario uuid, p_papel papel_usuario) returns void
language plpgsql security definer set search_path = public as
$$
declare v_alvo perfis%rowtype;
begin
  if meu_papel() is distinct from 'admin' then raise exception 'só o administrador muda o papel' using errcode = '42501'; end if;
  select * into v_alvo from perfis where id = p_usuario and organizacao_id = minha_org();
  if not found then raise exception 'pessoa não encontrada'; end if;
  if p_usuario = auth.uid() then raise exception 'você não pode mudar o seu próprio papel'; end if;
  update perfis set papel = p_papel where id = p_usuario;
  insert into historico (usuario_id, acao, detalhe) values (auth.uid(), 'papel_alterado', jsonb_build_object('para', v_alvo.email, 'de', v_alvo.papel, 'papel', p_papel));
end $$;
revoke all on function definir_papel(uuid, papel_usuario) from public, anon;
grant execute on function definir_papel(uuid, papel_usuario) to authenticated;

-- Conferência: quem tem acesso e com qual papel
select nome, email, papel, ativo from perfis order by papel, nome;
