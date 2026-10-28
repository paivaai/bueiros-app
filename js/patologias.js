/* patologias.js — etapa "Patologias observadas": lista de verificação; cada patologia marcada mostra a sua foto. Expõe BU.Patologias.
   Dados: l.patologias = [{ id (chave da lista, ou uid em registros antigos), local, tipo (texto), gravidade, obs }]; as fotos ficam em l.fotos com ctx = 'pat:<id>'. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, esc = U.esc, Cat = BU.Cat;

  const LOCAIS = ['Montante (boca de entrada)', 'Jusante (boca de saída)', 'Galeria (interior)', 'Cabeceira / ala / muro de testa', 'Aterro / pista sobre o bueiro', 'Outro'];
  const GRAV = ['Leve', 'Moderada', 'Severa'];
  const TIPOS = Cat.PATOLOGIAS.map(x => x[1]);
  const opts = (lista, v, vazio) => (vazio ? '<option value="">' + esc(vazio) + '</option>' : '') + lista.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('');
  const chave = id => Cat.PATOLOGIAS.some(x => x[0] === id);

  function cartao(l, p) {
    const nFotos = l.fotos.filter(f => f.ctx === 'pat:' + p.id).length;
    return `<div class="card pat" data-pid="${esc(p.id)}">
      <div class="linha-t"><b>${esc(p.tipo || Cat.rotulo(Cat.PATOLOGIAS, p.id))}</b> <span class="chip ${nFotos ? 'concluido' : 'rascunho'}">${nFotos ? nFotos + ' foto(s)' : 'sem foto'}</span>
        ${chave(p.id) ? '' : '<button type="button" class="btn sm danger" data-pa="del">Excluir</button>'}</div>
      <div class="grid">
        <div class="f half"><label>Onde</label><select data-pa="local">${opts(LOCAIS, p.local, '—')}</select></div>
        <div class="f half"><label>Gravidade</label><select data-pa="gravidade">${opts(GRAV, p.gravidade, '—')}</select></div>
        <div class="f"><label>Observação</label><textarea data-pa="obs" rows="2">${esc(p.obs || '')}</textarea></div>
      </div>
      ${BU.Fotos.blocoHTML(l, 'pat:' + p.id, 'Foto desta patologia')}</div>`;
  }

  function etapaHTML(l) {
    const lista = l.patologias || [], marc = new Set(lista.map(p => p.id));
    const antigas = lista.filter(p => !chave(p.id));
    return `<div class="card"><label class="chk"><input type="checkbox" data-pa="sem"${l.semPatologias ? ' checked' : ''}> Sem patologias aparentes neste bueiro</label>
        ${l.semPatologias ? '' : `<p class="muted small" style="margin:8px 0 6px">Marque o que foi observado. Cada patologia marcada pede a foto.</p>
        <div class="icogrid pat-grid">${Cat.PATOLOGIAS.map(([k, r]) => `<button type="button" class="icobtn pat${marc.has(k) ? ' on' : ''}" data-pa="tog" data-k="${k}" aria-pressed="${marc.has(k)}"><span>${esc(r)}</span>${marc.has(k) ? `<i class="cam${l.fotos.some(f => f.ctx === 'pat:' + k) ? ' ok' : ''}">📷</i>` : ''}</button>`).join('')}</div>`}</div>
      ${l.semPatologias ? '' : lista.filter(p => chave(p.id)).sort((a, b) => Cat.PATOLOGIAS.findIndex(x => x[0] === a.id) - Cat.PATOLOGIAS.findIndex(x => x[0] === b.id)).map(p => cartao(l, p)).join('')}
      ${l.semPatologias || !antigas.length ? '' : `<h3 class="grp">Registradas antes (versão anterior)</h3>${antigas.map(p => cartao(l, p)).join('')}`}
      ${BU.Fotos.entradasHTML()}`;
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('button[data-pa]'); if (!b) return;
    const App = BU.App, l = App.cur(); if (!l) return;
    if (b.dataset.pa === 'tog') {
      const k = b.dataset.k; l.patologias = l.patologias || [];
      const i = l.patologias.findIndex(p => p.id === k);
      if (i >= 0) {
        const nf = l.fotos.filter(f => f.ctx === 'pat:' + k).length;
        if (nf && !(await UI.confirmar(`Desmarcar esta patologia apaga ${nf} foto(s) dela. Continuar?`, { titulo: 'Desmarcar patologia', ok: 'Desmarcar', perigo: true }))) return;
        for (const f of l.fotos.filter(f => f.ctx === 'pat:' + k)) { try { await BU.DB.excluirFoto(f.id); } catch (err) { /* segue */ } }
        l.fotos = l.fotos.filter(f => f.ctx !== 'pat:' + k); l.patologias.splice(i, 1);
      } else l.patologias.push({ id: k, local: '', tipo: Cat.rotulo(Cat.PATOLOGIAS, k), gravidade: '', obs: '' });
      if (BU.Form) BU.Form.sincDiag(l);
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
    if (el.dataset.pa === 'sem') { if (e.type !== 'change') return; l.semPatologias = el.checked; if (BU.Form) BU.Form.sincDiag(l); App.marcarSujo(); App.renderEtapa(); return; }
    const card = el.closest('[data-pid]'); const p = card && (l.patologias || []).find(x => x.id === card.dataset.pid); if (!p) return;
    const k = el.dataset.pa; if (!['local', 'tipo', 'gravidade', 'obs'].includes(k)) return;
    p[k] = el.value; App.marcarSujo();
  }
  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);

  BU.Patologias = { etapaHTML, LOCAIS, TIPOS, GRAV };
})();
