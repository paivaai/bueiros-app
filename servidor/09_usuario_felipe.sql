-- 09_usuario_felipe.sql — convite para o Felipe entrar por USUÁRIO (sem e-mail real).
-- Ele entra no painel digitando só "felipe" e a senha; internamente o login é felipe@gfa-campo.app.
-- Troque 'gestor' por 'campo' se ele for só usar o app do celular (o painel é só para admin e gestor).
-- ORDEM: 1) rode este script;  2) Authentication → Users → Add user: e-mail felipe@gfa-campo.app, uma senha, marque "Auto Confirm User".
insert into convites (organizacao_id, email, nome, papel)
select (select id from organizacoes order by criado_em limit 1), 'felipe@gfa-campo.app', 'Felipe', 'gestor'
on conflict do nothing;
select email, nome, papel from convites where email = 'felipe@gfa-campo.app';
