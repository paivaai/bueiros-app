/* patologias.js — etapa "Patologias": defeitos da estrutura (montante, jusante, galeria…), cada um com a sua foto. Expõe BU.Patologias.
   Dados: l.patologias = [{ id, local, tipo, gravidade, obs }]; as fotos ficam em l.fotos com ctx = 'pat:<id>'. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, esc = U.esc;

  const LOCAIS = ['Montante (boca de entrada)', 'Jusante (boca de saída)', 'Galeria (interior)', 'Cabeceira / ala / muro de testa', 'Aterro / pista sobre o bueiro', 'Outro'];
  const TIPOS = ['Assoreamento', 'Obstrução', 'Vegetação', 'Fissura', 'Trinca', 'Infiltração / percolação', 'Desagregação do concreto', 'Armadura exposta', 'Corrosão (metal)', 'Deformação', 'Deslocamento / junta aberta', 'Erosão', 'Recalque', 'Dano por impacto', 'Colapso parcial', 'Outro'];
  const GRAV = ['Leve', 'Moderada', 'Severa'];

  const opts = (lista, v, vazio) => (vazio ? '<option value="">' + esc(vazio) + '</option>' : '') + lista.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('');

  function cartao(l, p, i) {
    const nFotos = l.fotos.filter(f => f.ctx === 'pat:' + p.id).length;
    return `<div class="card pat" data-pid="${esc(p.id)}">
      <div class="linha-t"><b>Patologia ${i + 1}</b> <span class="chip ${nFotos ? 'concluido' : 'rascunho'}">${nFotos ? nFotos + ' foto(s)' : 'sem foto'}</span>
        <button type="button" class="btn sm danger" data-pa="del">Excluir</button></div>
      <div class="grid">
        <div class="f"><label>Onde</label><select data-pa="local">${opts(LOCAIS, p.local, '— onde está —')}</select></div>
        <div class="f"><label>Tipo de patologia</label><select data-pa="tipo">${opts(TIPOS, p.tipo, '— escolha —')}</select></div>
        <div class="f half"><label>Gravidade</label><select data-pa="gravidade">${opts(GRAV, p.gravidade, '—')}</select></div>
        <div class="f"><label>Observação</label><textarea data-pa="obs" rows="2">${esc(p.obs || '')}</textarea></div>
      </div>
      ${BU.Fotos.blocoHTML(l, 'pat:' + p.id, 'Foto desta patologia')}</div>`;
  }

  function etapaHTML(l) {
    const lista = l.patologias || [];
    return `<div class="card"><label class="chk"><input type="checkbox" data-pa="sem"${l.semPatologias ? ' checked' : ''}> Sem patologias aparentes neste bueiro</label>
        <p class="muted small" style="margin:6px 0 0">Para cada patologia, registre onde está (montante, jusante ou galeria), o tipo e tire a foto.</p></div>
      ${l.semPatologias ? '' : lista.map((p, i) => cartao(l, p, i)).join('')}
      ${l.semPatologias ? '' : '<button type="button" class="btn primary big" data-pa="add">+ Adicionar patologia</button>'}
      ${BU.Fotos.entradasHTML()}`;
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('button[data-pa]'); if (!b) return;
    const App = BU.App, l = App.cur(); if (!l) return;
    if (b.dataset.pa === 'add') {
      l.patologias = l.patologias || []; l.patologias.push({ id: U.uid(), local: '', tipo: '', gravidade: '', obs: '' });
      App.marcarSujo(); App.renderEtapa();
    } else if (b.dataset.pa === 'del') {
      const pid = b.closest('[data-pid]').dataset.pid;
      if (!(await UI.confirmar('Excluir esta patologia e as fotos dela?', { titulo: 'Excluir patologia', ok: 'Excluir', perigo: true }))) return;
      const fs = l.fotos.filter(f => f.ctx === 'pat:' + pid);
      for (const f of fs) { try { await BU.DB.excluirFoto(f.id); } catch (err) { /* segue */ } }
      l.fotos = l.fotos.filter(f => f.ctx !== 'pat:' + pid); l.patologias = l.patologias.filter(p => p.id !== pid);
      App.marcarSujo(); App.renderEtapa();
    }
  });
  function aoMudar(e) {
    const el = e.target; if (!el.dataset || !el.dataset.pa || el.tagName === 'BUTTON') return;
    const App = BU.App, l = App.cur(); if (!l) return;
    if (el.dataset.pa === 'sem') { if (e.type !== 'change') return; l.semPatologias = el.checked; App.marcarSujo(); App.renderEtapa(); return; }
    const card = el.closest('[data-pid]'); const p = card && (l.patologias || []).find(x => x.id === card.dataset.pid); if (!p) return;
    const k = el.dataset.pa; if (!['local', 'tipo', 'gravidade', 'obs'].includes(k)) return;
    p[k] = el.value; App.marcarSujo();
  }
  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);

  BU.Patologias = { etapaHTML, LOCAIS, TIPOS, GRAV };
})();
