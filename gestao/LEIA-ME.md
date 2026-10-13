# Painel de Gestão (escritório)

Acompanha os levantamentos de campo, revisa (aprova/devolve), atribui bueiros e gerencia acessos.
Endereço depois do deploy: `https://paivaai.github.io/bueiros-app/gestao/`

## Modo demonstração
Com `?demo=1` no fim do endereço (`.../gestao/?demo=1`) o painel usa dados fictícios (36 bueiros, equipe de exemplo, atualização "ao vivo" simulada). Nada é gravado em servidor.
Login: `arthur@gfa.demo` / `demo`.

## Supabase (dados reais) — já configurado em `js/config.js`
1. Crie o projeto e rode os SQL de `servidor/` (veja `servidor/LEIA-ME.md`).
2. Em `js/config.js` preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` (Project Settings → API → *anon public*). **Nunca** a `service_role`.
3. Entre com o e-mail do primeiro administrador (convite do script 05).
O painel só aceita administrador e gestor; a equipe de campo usa o app do celular.

## O que tem
Projetos · Visão geral (andamento, fila de revisão, produção por pessoa) · Bueiros (tabela filtrável + mapa, atribuição em lote, CSV) · Detalhe (dados, prancha gerada dos pontos RTK, fotos, histórico, aprovar/devolver) · Equipe e acessos (convites).

## Estado
- Testado em modo demonstração (navegador real). O modo Supabase foi escrito mas **ainda não foi testado contra um servidor real**.
- O mapa usa Leaflet + OpenStreetMap (precisa de internet); sem isso mostra um mapa simples sem fundo.
- Falta: importar cadastro (KMZ) pelo painel, relatório em lote, ligar o app de campo (login + sincronização).

## Planejamento (aba "Planejamento")

1. Informe a rodovia e o km do 1º ponto do eixo; trace o eixo no mapa (ou importe a linha de um KMZ). O painel divide a estrada em km.
2. Importe o KMZ/KML do Google Earth (pontos viram bueiros a vistoriar) e/ou clique em "Marcar bueiro no mapa". Arraste o pino para ajustar.
3. O nome sai do km: `RJ-000 km 170+470`. Dá para editar o nome na lista. "Salvar planejamento" grava no projeto (precisa do script `servidor/08_planejamento.sql`).
4. "Baixar KML" gera um arquivo que o app de campo já importa (Início → Importar cadastro).
