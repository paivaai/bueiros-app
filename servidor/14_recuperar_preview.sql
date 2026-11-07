-- 14 · PRÉVIA (só leitura, não altera nada)
-- Lista os bueiros trabalhados em projetos antigos que ainda estão vazios no projeto novo.
-- Troque os dois ids se necessário.
with p as (select '257e6ac6'::text as ant, 'b9c0397c'::text as nov)
select o.codigo, o.status as status_antigo, o.versao as versao_antiga, o.atualizado_em as ultima_edicao_antiga,
       n.status as status_novo, n.versao as versao_nova,
       (select count(*) from fotos f where f.bueiro_id = o.id) as fotos_no_antigo
from bueiros o
join p on o.projeto_id::text like p.ant || '%'
left join bueiros n on n.projeto_id::text like p.nov || '%' and n.codigo = o.codigo
where o.versao > 1
order by o.codigo;
