-- 16 · DIAGNÓSTICO DE FOTOS (só leitura): quantas fotos cada projeto tem no banco e no armazenamento
select p.nome, left(p.id::text,8) as projeto,
  (select count(*) from bueiros b where b.projeto_id = p.id) as bueiros,
  (select count(*) from fotos f where f.projeto_id = p.id) as fotos_no_banco,
  (select count(*) from storage.objects o where o.bucket_id='fotos' and (storage.foldername(o.name))[1] = p.id::text) as arquivos_no_storage
from projetos p order by 1,2;
