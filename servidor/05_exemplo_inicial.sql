-- 05_exemplo_inicial.sql — primeiro acesso: cria a organização, o primeiro admin (por convite) e um projeto.
-- 1) TROQUE o e-mail abaixo pelo seu.  2) Rode.  3) No app/painel, crie a conta com ESSE e-mail: ela vira admin automaticamente.

with org as (insert into organizacoes (nome) values ('GFA Engenharia') returning id),
     conv as (insert into convites (organizacao_id, email, nome, papel) select id, 'troque-por-seu-email@exemplo.com', 'Administrador', 'admin' from org returning 1)
insert into projetos (organizacao_id, nome, descricao, rodovia, fuso)
select id, 'BGROTA – Fora Melhoria 03', 'Cadastro de bueiros da BR-101/RJ', 'BR-101', '23' from org;
