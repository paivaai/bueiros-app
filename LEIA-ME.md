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
