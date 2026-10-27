# Cadastro de Bueiros — como publicar e usar

## 1. Publicar no GitHub Pages (grátis)
1. Crie conta em github.com. Clique em **New repository**: nome `bueiros-app`, **Public**, marque "Add a README", **Create repository**.
2. Descompacte o `bueiros-fase5.zip` no computador.
3. No repositório: **Add file > Upload files**. Arraste TUDO que está dentro da pasta (index.html, manifest.webmanifest, service-worker.js, offline.html e as pastas css, js, assets). O `index.html` precisa ficar na raiz.
4. Role a página e clique em **Commit changes**.
5. **Settings > Pages**: Source = *Deploy from a branch*, Branch = `main`, pasta `/ (root)`, **Save**.
6. Em 1 a 2 minutos o endereço aparece: `https://SEU-USUARIO.github.io/bueiros-app/`

## 2. Instalar no Android (Felipe)
1. Abrir o endereço no **Chrome**, com internet, e esperar carregar.
2. Menu ⋮ > **Instalar app** (ou "Adicionar à tela inicial"). Também aparece o botão "Instalar app no celular" na tela inicial do app.
3. Abrir pelo ícone. Permitir **localização** e **câmera** quando o Chrome perguntar.
4. A partir daí funciona sem internet (modo avião para testar).

## 3. Atualizar o app depois
1. Edite os arquivos no GitHub (ou envie os novos por Upload files, substituindo).
2. **Abra `service-worker.js` e aumente a `VERSAO`** (`v1` > `v2` > `v3`...). Sem isso os celulares continuam com a versão antiga.
3. No celular, ao abrir com internet, aparece o aviso amarelo "Nova versão disponível" > **Atualizar agora**.

## 4. Teste de campo (checklist)
- [ ] Novo levantamento > preencher > fechar o Chrome > reabrir > "Continuar levantamento"
- [ ] Capturar GPS ao ar livre e conferir a precisão
- [ ] Digitar coordenadas à mão (sem GPS)
- [ ] Importar o TXT do RTK (tela de Pontos ou tela inicial)
- [ ] Desenhar a seção, riscar com o dedo, anotar, gerar PNG
- [ ] Tirar 3 fotos e classificar
- [ ] Revisão > Gerar relatório > Imprimir / salvar PDF
- [ ] Exportar dados (backup) e Restaurar backup
- [ ] Modo avião: tudo acima continua funcionando

## 5. Onde ficam os dados
Só no celular (IndexedDB do Chrome). Não há servidor. **Limpar os dados do Chrome apaga tudo**: faça o backup (Exportar dados) no fim de cada dia de campo e envie para o Drive/WhatsApp.

## 6. Play Store (depois, se fizer sentido)
- Conta de desenvolvedor Google Play: US$ 25, pagamento único.
- Conta pessoal criada depois de 13/11/2023: exige teste fechado com 12 testadores por 14 dias seguidos antes de publicar. Conta de organização não tem essa exigência.
- O PWA pode ser empacotado como app Android (TWA, por exemplo com o PWABuilder). Para uma demonstração, instalar pelo Chrome já resolve e é imediato.

## 7. Importar o cadastro (KMZ/KML)
- Na tela Início: **Importar cadastro (KMZ/KML)** e escolha o arquivo (ex.: BGROTA_FORA_MELHORIA_03.kmz).
- Cada ponto vira um levantamento com status **A vistoriar**, já com coordenadas, tipo, dimensões, conservação e observações do cadastro.
- Importar o mesmo arquivo de novo não duplica (os já existentes são ignorados).
- **Não suba o KMZ para o GitHub público** (dados do cliente). Envie o arquivo ao celular por WhatsApp/Drive e importe pelo app.
- Ao atualizar, mantenha `VERSAO = 'v3'` (ou maior) no service-worker.js.

## 8. Revisão GFA (versão v4)
- **Responsável:** menu com os nomes já usados neste aparelho; "+ Novo responsável…" adiciona. **Empresa/equipe** já vem como GFA.
- **Coordenadas:** GPS do celular desativado. Etapa 2 usa **UTM (Este, Norte, Fuso, Hemisfério, Altitude Z)**. No botão "Usar o centro do bueiro" o app preenche com o centro entre GI MONT e GI JUS.
- **Características:** sem o campo "Linhas"; formatos só Circular, Retangular e Personalizada.
- **Planta, perfil e quadro de dados (Etapa 5):** gerados ao importar o TXT do RTK. Códigos reconhecidos: `GI MONT`, `GI JUS` (ou pares `OAC-GTZ`), `CB1…`/`OAC-ALA` (contorno), `EP`/`BD`/`BE`/`TER-ASF` (pista), `TN`/`TAL`/`TER-CA`/`TER-PA` (terreno), `RN`. Sem GI, o eixo é estimado e o app avisa.
- **Medições:** comprimento, declividade e cotas de entrada/saída vêm dos pontos (o que você digitar tem prioridade).
- **Fotos:** envie a logo na Etapa 7; as fotos novas saem com a logo e as coordenadas UTM da Etapa 2 estampadas.
- **Importar KMZ:** se o trecho cruza dois fusos UTM, o app pergunta qual fuso usar.
- **Atualizar:** suba todos os arquivos (há um novo, `js/prancha.js`) e mantenha `VERSAO = 'v4'`.

## 9. Identidade visual GFA (v5)
Logo da GFA na barra superior, nos ícones do app, na tela sem conexão, no relatório e na prancha. Nas fotos, a logo da GFA é o padrão até alguém enviar outra (Etapa Fotos → Trocar logo). Cor principal: laranja da marca. O arquivo da logo é `assets/logo-gfa.png`. Ao subir para o GitHub, suba tudo (a VERSAO do service worker agora é v5).

## 10. Login, sincronização, mapa e "não localizado" (versão v6/v7)
- **Entrar:** Início → "Conta e projeto" (ou o botão "Entrar" no topo). Usuário (`filipe`) ou e-mail e a senha. Escolha o projeto; o app baixa os bueiros planejados no escritório.
- **Sincronizar:** é automático (ao salvar, ao voltar a internet e a cada ~90 s) ou pelo botão "Sincronizar agora". O selo no topo mostra *Sincronizado*, *N a enviar* ou *com problema*. **Sem internet tudo continua funcionando**; o que foi feito vai quando a conexão voltar.
- **Conflito:** se o escritório alterou o mesmo bueiro, aparece em "Precisam de atenção": *Manter o meu* ou *Usar o do escritório*.
- **Devolvido:** o comentário do escritório aparece no cartão e no topo do formulário; corrija e salve de novo.
- **Mapa:** Início → Mapa. Pontos por situação, eixo, sua posição (GPS), "você está no km…" e os bueiros mais próximos. O fundo (satélite/mapa) guarda o que você já viu e reabre sem internet; **não há download em lote**. "Sem fundo" mostra só os pontos.
- **Não localizei:** botão no cartão do bueiro e na Etapa 1/9. Escolha o motivo; o app guarda a posição do GPS e envia para o escritório revisar. "Voltar a vistoriar" desfaz.
- **Qualidade do RTK (Etapa 2):** solução (fixa/flutuante), precisão, base, receptor, altura da antena, tipo de altitude. Os dados da base/receptor/antena viram padrão do próximo bueiro. A Etapa 9 avisa quando algo foge do esperado.
- **Atualizar:** suba todos os arquivos (novos: `js/vendor/`, `js/config.js`, `js/sync.js`, `js/mapa.js`, `js/conferencias.js`).

## 11. Ajustes de outubro/2026 (formulário em 11 etapas)

- **Login (Tela 01)**: o app abre na tela de entrada, com "olho" para ver a senha. O usuário é aceito com ou sem maiúsculas/espaços e a senha também é tentada sem espaços nas pontas. Há "Continuar sem conta" para uso só no aparelho.
- **Início (Tela 02/03)**: "Meus projetos" (os que você participa), os bueiros do projeto aberto abaixo e a barra inferior **Cadastro · Mapa · ＋ Novo bueiro · Projeto**.
- **Formulário**: Informação geral (tipo BSCC etc., metadados do cadastro) → Coordenadas (SIRGAS 2000) → Corpo → Boca de montante → Boca de jusante (com **Estado do dissipador**) → Levantamento RTK → Dispositivos (foto de cada) → Patologias (foto de cada) → Diagnóstico (foto de cada serviço, prioridade, observações) → Fotos (câmera direta, várias por legenda) → Revisão.
- **Bocas**: o desenho da boca (simples, duplo ou triplo) tem pontos vermelhos clicáveis (X, Y, Z) e **obrigatórios**; dá para importar a lista do RTK. Com todos marcados, planta e perfil são gerados.
- **GPS aqui** grava a presença na tabela `presencas` (rodar o script 11).
- **Importar KMZ** (app e painel): nome completo (ex.: `BU 101 RJ 002+47- N 1 (sentido norte)`) e todos os campos do cadastro vêm preenchidos.
- **Vistoriador e data**: sempre quem está logado e o dia de hoje; sem ID de banco na tela.
- **Painel**: "Quem participa" lista os operadores (marcar todos / adicionar na hora); Equipe permite criar pessoas, trocar senha e desativar.
- Os desenhos ilustrativos do **Diagnóstico** são pictogramas (não há fotos-exemplo reais).
