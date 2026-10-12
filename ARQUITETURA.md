# Cadastro de Bueiros — Arquitetura Campo + Gestão

Versão para aprovação · GFA Engenharia · base: app de campo v4

## 1. Objetivo

Duas modalidades do mesmo sistema, integradas:

- **Operação (campo):** o app atual, no celular, funcionando sem internet. A equipe levanta os bueiros.
- **Gestão (escritório):** um painel web que acompanha os levantamentos quase em tempo real, distribui o trabalho, revisa, aprova ou devolve e exporta.

Ambos usam **login e senha** e enxergam apenas os projetos aos quais pertencem.

## 2. Visão geral

```
 CAMPO (celular, PWA)                       ESCRITÓRIO (navegador)
 app atual + login + sincronização          painel /gestao
 IndexedDB local (funciona offline)         lê e revisa
        │  grava por RPC / envia fotos             │  lê, revisa, atribui
        ▼                                          ▼
 ┌──────────────────────── SUPABASE (nuvem, sa-east-1) ───────────────────────┐
 │ Auth (e-mail+senha) · Postgres + RLS · Storage (fotos) · Realtime         │
 └────────────────────────────────────────────────────────────────────────────┘
```

Princípio: **o celular continua sendo a fonte da verdade enquanto está offline**. O servidor recebe quando há sinal. Nada do que funciona hoje deixa de funcionar sem internet.

## 3. Perfis e permissões

| Ação | admin | gestor | campo |
|---|:-:|:-:|:-:|
| Ver projetos | todos da organização | os que é membro | os que é membro |
| Criar projeto, convidar pessoas, definir papéis | ✔ | – | – |
| Importar cadastro (KMZ) no projeto | ✔ | ✔ | – |
| Atribuir bueiros à equipe de campo | ✔ | ✔ | – |
| Gravar levantamento | ✔ | – | só os seus ou sem dono |
| Marcar “concluído” | ✔ | – | ✔ |
| Aprovar / devolver (com comentário) | ✔ | ✔ | – |
| Editar bueiro já aprovado | – | – | – |
| Enviar fotos | ✔ | – | ✔ |
| Ver histórico | ✔ | ✔ | ✔ (dos seus projetos) |

Regras de segurança aplicadas **no servidor** (RLS e funções), não só na tela:

- Sem convite, a conta é criada mas **não tem perfil e não vê nada**.
- Ninguém grava direto na tabela de bueiros: tudo passa por `salvar_bueiro`, `revisar_bueiro`, `atribuir_bueiros` e `importar_bueiros`.
- Organizações são isoladas entre si.

## 4. Fluxo de status

```
a_vistoriar → rascunho → concluido → aprovado
                  ▲           │
                  └─ devolvido ◄┘   (gestor devolve com comentário; campo corrige e conclui de novo)
```

## 5. Modelo de dados

`organizacoes` · `perfis` (um por usuário) · `convites` · `projetos` · `projeto_membros` · `bueiros` · `fotos` · `historico`

- `bueiros.id` é o mesmo id que o app de campo já usa. O levantamento inteiro fica em `dados` (jsonb); as colunas soltas (código, km, status, UTM, atribuído a…) servem para filtrar, ordenar e mapear.
- `versao` sobe a cada gravação e evita que duas pessoas sobrescrevam uma à outra.
- `historico` registra quem fez o quê e quando.
- Fotos: arquivo no bucket privado `fotos` em `<projeto>/<bueiro>/<foto>.jpg`; metadados na tabela `fotos`.
- PostGIS é opcional (script 06), para consultas espaciais futuras.

## 6. Sincronização do app de campo

1. Cada alteração continua sendo salva no IndexedDB (autosave de 700 ms). O registro ganha a marca “pendente de envio”.
2. Com internet (evento `online`, abertura do app ou botão “Sincronizar”), o app envia os pendentes por `salvar_bueiro(dados, versão_base)`.
3. **Conflito:** se o servidor responde `conflito`, o app guarda a cópia do servidor ao lado, avisa e deixa a pessoa escolher qual manter. Nada é perdido em silêncio.
4. Fotos sobem em fila, uma a uma, e podem ser retomadas se a conexão cair.
5. Recebimento: o app baixa o que mudou desde a última sincronização (`atualizado_em > desde`), o que traz as atribuições, devoluções e aprovações feitas pelo escritório.
6. Login: a sessão fica guardada no aparelho para uso offline. **O primeiro login precisa de internet.**
7. A biblioteca do Supabase será copiada para dentro do repositório, para o service worker guardá-la e o app abrir offline.

## 7. Painel de gestão (`/gestao`)

Telas previstas:

1. **Login.**
2. **Projetos** — lista com andamento (a vistoriar, rascunho, concluído, devolvido, aprovado).
3. **Visão geral** — contadores, gráfico de andamento, produção por pessoa e por dia, última atividade. Atualiza ao vivo (Realtime).
4. **Mapa** — bueiros coloridos por status.
5. **Tabela** — filtros por status, responsável, km e busca por código.
6. **Detalhe do bueiro** — dados, prancha, fotos, histórico, botões Aprovar e Devolver (com comentário).
7. **Atribuição** — seleção de vários bueiros e escolha da pessoa de campo.
8. **Usuários e convites** — quem tem acesso, em qual projeto e com qual papel.
9. **Exportações** — relatório, CSV e lote de pranchas.

## 8. Organização do repositório

```
bueiros-app/
├── (raiz)     app de campo — mantém a URL atual
├── gestao/    painel do escritório
└── servidor/  scripts SQL e documentação
```

O GitHub Pages é público: **no repositório entra apenas a chave `anon` do Supabase**, que é feita para ser pública e protegida pelas regras do banco. Nunca a `service_role`, nunca KMZ ou dados reais de cliente.

## 9. Custos e limites (conferir no site do Supabase antes de fechar)

- Plano gratuito: cerca de 500 MB de banco e 1 GB de arquivos; o projeto **pausa após uns 7 dias sem uso**. Serve para o piloto.
- Plano Pro: cerca de US$ 25 por mês. Recomendado para uso real, por causa da pausa e dos backups.
- Região sugerida: **São Paulo (sa-east-1)**.
- Fotos reduzidas (já são) mantêm o armazenamento baixo.

## 10. Plano em fases

| Fase | Entrega | Situação |
|---|---|---|
| **A** | Servidor: tabelas, regras, funções, fotos, tempo real | **Pronta e testada** (esta entrega) |
| **B** | App de campo: login, sincronização, fila de fotos, tela “meus bueiros” | Aguarda sua aprovação |
| **C** | Painel `/gestao`: login, visão geral, mapa, tabela, detalhe | **Primeira versão pronta em modo demonstração** (falta ligar ao Supabase real) |
| **D** | Revisão, atribuição, convites, relatórios em lote | Depois de C |

## 11. Decisões já tomadas (12/10/2026)

1. Arquitetura aprovada.
2. Por enquanto, só o Arthur é administrador.
3. Campo: aceita os dois modos — bueiro atribuído a uma pessoa **ou** bueiro livre, assumido por quem gravar primeiro.
4. Fuso: guardado **em cada bueiro**, junto com Este/Norte. Vem do cadastro (KMZ, lat/lon) ou do que for informado; o fuso do projeto é só o valor sugerido. Observação: Este/Norte sozinhos não dizem o fuso, então o fuso sempre acompanha o par de coordenadas.
5. Plano gratuito do Supabase no piloto.
6. Nuvem comum aceita; São Paulo recomendada.
7. Logo da GFA aplicada ao app de campo (v5); será aplicada também ao painel.
