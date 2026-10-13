-- 04_fotos_e_tempo_real.sql — bucket privado de fotos e atualização ao vivo no painel.
-- Só funciona no Supabase (usa os esquemas storage e supabase_realtime). Em Postgres comum, os blocos são ignorados.

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict (id) do nothing;

    -- caminho do arquivo: <projeto_id>/<bueiro_id>/<foto_id>.jpg  → o 1º trecho é o projeto
    execute $p$ create policy fotos_arq_ler on storage.objects for select to authenticated
      using (bucket_id = 'fotos' and pode_ver_projeto(((storage.foldername(name))[1])::uuid)) $p$;
    execute $p$ create policy fotos_arq_enviar on storage.objects for insert to authenticated
      with check (bucket_id = 'fotos' and meu_papel() in ('admin', 'campo') and pode_ver_projeto(((storage.foldername(name))[1])::uuid)) $p$;
    execute $p$ create policy fotos_arq_apagar on storage.objects for delete to authenticated
      using (bucket_id = 'fotos' and (owner = auth.uid() or meu_papel() = 'admin') and pode_ver_projeto(((storage.foldername(name))[1])::uuid)) $p$;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table bueiros;
    alter publication supabase_realtime add table fotos;
  end if;
end $$;
