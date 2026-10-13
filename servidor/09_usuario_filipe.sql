-- 09_usuario_filipe.sql — convite do Filipe para entrar por USUÁRIO (sem e-mail real).
-- Ele entra no painel digitando só "filipe" e a senha; internamente o login é filipe@gfa-campo.app.
-- Troque 'gestor' por 'campo' se ele for só usar o app do celular (o painel é só para admin e gestor).
-- ORDEM: 1) rode este script;  2) Authentication → Users → Add user: e-mail filipe@gfa-campo.app, a senha, marque "Auto Confirm User".

-- (Só se você cadastrou um e-mail errado antes) — apague o usuário errado em Authentication → Users (⋯ → Delete user)
-- e depois rode estas duas linhas trocando ERRADO@dominio pelo e-mail que você digitou por engano:
-- delete from convites where email = 'ERRADO@dominio';
-- delete from perfis   where email = 'ERRADO@dominio';   -- (já some sozinho ao apagar o usuário no Auth)

insert into convites (organizacao_id, email, nome, papel)
select (select id from organizacoes order by criado_em limit 1), 'filipe@gfa-campo.app', 'Filipe', 'gestor'
on conflict do nothing;
select email, nome, papel, usado_em from convites order by criado_em desc limit 5;
