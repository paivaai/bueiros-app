-- 01_tabelas.sql — Cadastro de Bueiros: tabelas do servidor (Supabase / PostgreSQL 15+)
-- Rode os scripts na ordem: 01, 02, 03, 04. O 05 (exemplo) e o 06 (PostGIS) são opcionais.

create type papel_usuario  as enum ('admin', 'gestor', 'campo');
create type status_bueiro  as enum ('a_vistoriar', 'rascunho', 'concluido', 'aprovado', 'devolvido');

create table organizacoes (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  criado_em timestamptz not null default now()
);

-- Um perfil por usuário do Supabase Auth. O papel só é definido por convite de um admin.
create table perfis (
  id              uuid primary key references auth.users(id) on delete cascade,
  organizacao_id  uuid not null references organizacoes(id),
  nome            text not null,
  email           text not null,
  papel           papel_usuario not null default 'campo',
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- O admin cadastra o e-mail aqui ANTES da pessoa criar a conta; sem convite, a pessoa não entra.
create table convites (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references organizacoes(id),
  email           text not null,
  nome            text,
  papel           papel_usuario not null default 'campo',
  projetos        uuid[] not null default '{}',
  criado_por      uuid references perfis(id),
  criado_em       timestamptz not null default now(),
  usado_em        timestamptz
);
create unique index convites_email_aberto on convites (lower(email)) where usado_em is null;

create table projetos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references organizacoes(id),
  nome            text not null,
  descricao       text,
  rodovia         text,
  fuso            text not null default '23',
  hemisferio      text not null default 'S',
  ativo           boolean not null default true,
  criado_por      uuid references perfis(id),
  criado_em       timestamptz not null default now()
);

-- Quem enxerga/trabalha em cada projeto (admin da organização enxerga todos).
create table projeto_membros (
  projeto_id    uuid not null references projetos(id) on delete cascade,
  usuario_id    uuid not null references perfis(id) on delete cascade,
  adicionado_em timestamptz not null default now(),
  primary key (projeto_id, usuario_id)
);

-- Um bueiro = um levantamento. "dados" guarda o levantamento inteiro, exatamente como o app de campo o grava
-- (pontos, medições, seção etc.). As colunas soltas servem para filtrar, ordenar e mapear.
create table bueiros (
  id               uuid primary key,                 -- o mesmo id que o app de campo já usa
  projeto_id       uuid not null references projetos(id) on delete cascade,
  codigo           text not null,
  cadastro_id      text,
  km               text,
  status           status_bueiro not null default 'a_vistoriar',
  atribuido_a      uuid references perfis(id),
  responsavel_nome text,
  latitude         double precision,
  longitude        double precision,
  leste            numeric,
  norte            numeric,
  zona             text,
  dados            jsonb not null default '{}'::jsonb,
  versao           integer not null default 1,       -- sobe a cada gravação; evita um sobrescrever o outro
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid references perfis(id),
  revisado_por     uuid references perfis(id),
  revisado_em      timestamptz,
  comentario_revisao text,
  unique (projeto_id, codigo)
);
create index bueiros_projeto_status on bueiros (projeto_id, status);
create index bueiros_atribuido      on bueiros (atribuido_a);
create index bueiros_atualizado     on bueiros (projeto_id, atualizado_em);

-- Metadados das fotos; o arquivo fica no Storage (bucket "fotos", caminho projeto/bueiro/foto.jpg).
create table fotos (
  id            uuid primary key,
  bueiro_id     uuid not null references bueiros(id) on delete cascade,
  projeto_id    uuid not null references projetos(id) on delete cascade,
  storage_path  text not null,
  categoria     text,
  legenda       text,
  tirada_em     timestamptz,
  bytes         integer,
  largura       integer,
  altura        integer,
  enviado_por   uuid references perfis(id),
  criado_em     timestamptz not null default now()
);
create index fotos_bueiro on fotos (bueiro_id);

-- Quem fez o quê e quando (somente leitura para os usuários).
create table historico (
  id          bigint generated always as identity primary key,
  bueiro_id   uuid references bueiros(id) on delete cascade,
  projeto_id  uuid references projetos(id) on delete cascade,
  usuario_id  uuid references perfis(id),
  acao        text not null,
  detalhe     jsonb,
  em          timestamptz not null default now()
);
create index historico_bueiro on historico (bueiro_id, em desc);
