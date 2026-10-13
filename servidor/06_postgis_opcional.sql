-- 06_postgis_opcional.sql — coluna geográfica para consultas espaciais (distância, interseção, exportar para QGIS).
-- No Supabase: Database > Extensions > postgis (ou o comando abaixo).
create extension if not exists postgis;
alter table bueiros add column if not exists geom geography(Point, 4326);
update bueiros set geom = st_setsrid(st_makepoint(longitude, latitude), 4326)::geography where latitude is not null and longitude is not null and geom is null;
create index if not exists bueiros_geom on bueiros using gist (geom);
create or replace function bueiros_geom_trg() returns trigger language plpgsql as
$$ begin
  new.geom := case when new.latitude is not null and new.longitude is not null then st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography end;
  return new; end $$;
drop trigger if exists trg_bueiros_geom on bueiros;
create trigger trg_bueiros_geom before insert or update of latitude, longitude on bueiros for each row execute function bueiros_geom_trg();
