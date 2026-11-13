/* documentos.js — gera no painel a Ficha padrão ANTT, o Relatório geral e a Prancha de um bueiro,
   com os mesmos geradores do app de campo (js/antt.js, js/export.js, js/prancha.js). Expõe Documentos.gerar(tipo, bueiro, D). */
(function () {
  'use strict';
  const BU = window.BU;

  /* Monta o levantamento completo a partir da linha do servidor (igual ao que o app de campo faz ao receber). */
  function levantamento(b) {
    const d = b.dados || {};
    return BU.Modelo.normalizar({
      ...d, id: b.id, status: b.status, codigo: d.codigo || b.codigo, km: d.km || b.km || '',
      latitude: d.latitude != null ? d.latitude : b.latitude, longitude: d.longitude != null ? d.longitude : b.longitude,
      leste: d.leste != null ? d.leste : b.leste, norte: d.norte != null ? d.norte : b.norte, zona: d.zona || b.zona || '23',
    });
  }

  /* tipo: 'antt' | 'relatorio' | 'prancha' */
  async function gerar(tipo, b, D, janela) {
    const l = levantamento(b);
    if (tipo === 'prancha-pdf') {
      if (!BU.Prancha.temDados(l)) { if (janela) janela.close(); throw new Error('Este bueiro ainda não tem pontos do RTK para gerar a prancha.'); }
      await BU.Prancha.imprimir(l, janela); return;
    }
    if (tipo === 'prancha') {
      if (!BU.Prancha.temDados(l)) throw new Error('Este bueiro ainda não tem pontos do RTK para gerar a prancha.');
      await BU.Prancha.exportarPNG(l); return;
    }
    // baixa os arquivos das fotos para a memória; os geradores leem de BU.DB.obterFoto
    const mapa = await D.fotoBlobs(b.id);
    BU.DB._fotos = mapa;
    try {
      const r = await BU.Export.gerar(tipo, l);
      const url = URL.createObjectURL(r.blob);
      if (janela && !janela.closed) janela.location = url;
      else { const a = document.createElement('a'); a.href = url; a.download = r.nome; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return { faltam: (l.fotos || []).filter(f => !mapa.has(f.id)).length, total: (l.fotos || []).length };
    } catch (e) { if (janela && !janela.closed) janela.close(); throw e; } finally { BU.DB._fotos = new Map(); }
  }
  window.Documentos = { gerar, levantamento };
})();
