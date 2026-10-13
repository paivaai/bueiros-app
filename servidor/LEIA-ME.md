# Servidor — Supabase

Passo a passo para montar a base. Leva uns 15 minutos.

## 1. Criar o projeto
1. Acesse supabase.com, entre e clique em **New project**.
2. Nome: `bueiros`. Região: **South America (São Paulo)**. Guarde a senha do banco.
3. Aguarde a criação.

## 2. Rodar os scripts
Em **SQL Editor → New query**, cole e rode **um por vez, nesta ordem**:

1. `01_tabelas.sql`
2. `02_funcoes.sql`
3. `03_seguranca.sql`
4. `04_fotos_e_tempo_real.sql`
5. `05_exemplo_inicial.sql` — **antes de rodar, troque o e-mail** pelo seu. Ele cria a organização, o projeto de exemplo e o convite de administrador.
6. `06_postgis_opcional.sql` — só se for usar consultas espaciais. Ative antes a extensão em Database → Extensions.

## 3. Primeiro administrador
1. Em **Authentication → Providers**, deixe **Email** ativo. Para o piloto, desligue “Confirm email” se não quiser depender do envio de e-mail.
2. Em **Authentication → Users → Add user**, crie o usuário com **o mesmo e-mail do convite** e uma senha.
3. Ele vira administrador automaticamente. Para conferir: `select email, papel from perfis;`

## 4. Convidar outras pessoas
Como admin, no SQL Editor (depois o painel fará isso por tela):

```sql
insert into convites (organizacao_id, email, nome, papel, projetos)
select organizacao_id, 'pessoa@exemplo.com', 'Nome', 'campo', array[(select id from projetos limit 1)]
  from perfis where email = 'SEU-EMAIL';
```
Papéis: `admin`, `gestor`, `campo`. A pessoa cria a conta com esse e-mail e entra já com o papel e o projeto certos.

## 5. Chaves para o app
Em **Project Settings → API** copie:
- **Project URL** e **anon public key** → podem ir no app (são públicas).
- **service_role** → **nunca** coloque no GitHub nem no app.

## 6. O que foi testado
Os scripts 01–05 rodaram sem erro em PostgreSQL 16 com uma simulação do `auth` do Supabase. Testado: criação de perfil só por convite; isolamento entre organizações; gestor não grava levantamento; campo não aprova nem atribui; conflito de versão; devolver exige comentário; aprovado não é editado; histórico; andamento; acesso anônimo negado.
**Não foi possível testar aqui:** o bucket de fotos, o tempo real e o PostGIS (existem só no Supabase). Eles serão conferidos na primeira conexão real.

## 07 — Criar projetos pelo painel (rodar UMA vez, separado)

Depois do `instalar_tudo.sql` e do `05`, cole `07_criar_projetos.sql` no SQL Editor e rode.
Habilita `criar_projeto`, `definir_membros_projeto` e `editar_projeto`:
**admin e gestor** criam projetos pelo painel ("+ Novo projeto"); o criador entra na equipe
automaticamente; o gestor só enxerga projetos onde é membro, o admin vê todos.

## 08 — Planejamento (rodar UMA vez, depois do 07)

Cria a coluna `projetos.eixo` e as funções `salvar_eixo`, `salvar_planejados` e `remover_planejados`.
Com elas, admin e gestor importam KMZ/KML, marcam bueiros no mapa e salvam o planejamento: cada ponto vira um
bueiro "A vistoriar". Quem já foi vistoriado nunca é alterado nem removido pelo planejamento.
