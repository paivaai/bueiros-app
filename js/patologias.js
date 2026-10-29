/* patologias.js — patologias observadas, dentro da etapa de cada lugar: boca de montante, boca de jusante e corpo.
   Cada lugar tem a sua lista; cada patologia marcada ganha gravidade, observação e fotos. Expõe BU.Patologias.
   Dados: l.patologias = [{ id ('mont:erosao', 'jus:armadura', 'corpo:trincas'), local, tipo (texto), gravidade, obs }];
   as fotos ficam em l.fotos com ctx = 'pat:<id>'. "Sem patologias" é guardado por lugar em l.semPatGrupo. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, esc = U.esc, Cat = BU.Cat;

  const GRUPOS = { mont: 'boca de montante', jus: 'boca de jusante', corpo: 'corpo' };
  const GRAV = ['Leve', 'Moderada', 'Severa'];
  const TIPOS = Cat.PATOLOGIAS.map(x => x[1]);
  const opts = (lista, v, vazio) => (vazio ? '<option value="">' + esc(vazio) + '</option>' : '') + lista.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('');
  const lista = g => (g === 'corpo' ? Cat.PAT_CORPO : Cat.PAT_BOCA);
  const idDe = (g, k) => g + ':' + k;
  const doGrupo = (l, g) => (l.patologias || []).filter(p => String(p.id).startsWith(g + ':'));
  const rotuloDe = p => { const g = String(p.id).split(':')[0], k = String(p.id).slice(g.length + 1); return p.tipo || Cat.patRotulo(g, k); };

  /* "Sem patologias" por lugar; l.semPatologias (usado nos relatórios) vale quando os três lugares estão marcados. */
  function sincSem(l) { l.semPatologias = ['mont', 'jus', 'corpo'].every(g => l.semPatGrupo && l.semPatGrupo[g]); }

  function cartao(l, p, g) {
    const k = String(p.id).slice(g.length + 1), nFotos = l.fotos.filter(f => f.ctx === 'pat:' + p.id).length;
    return `<div class="card pat" data-pid="${esc(p.id)}">
      <div class="linha-t"><b>${esc(k === 'outros' ? 'Outros' : rotuloDe(p))}</b> <span class="chip ${nFotos ? 'concluido' : 'rascunho'}">${nFotos ? nFotos + ' foto(s)' : 'sem foto'}</span></div>
      <div class="grid">
        ${k === 'outros' ? `<div class="f"><label>Qual patologia?</label><input type="text" data-pa="tipo" value="${esc(p.tipo && p.tipo !== 'Outros' ? p.tipo : '')}" placeholder="Descreva a patologia"></div>` : ''}
        <div class="f"><label>Gravidade</label><select data-pa="gravidade">${opts(GRAV, p.gravidade, '—')}</select></div>
        <div class="f"><label>Observação</label><textarea data-pa="obs" rows="2">${esc(p.obs || '')}</textarea></div>
      </div>
      ${BU.Fotos.blocoHTML(l, 'pat:' + p.id, 'Foto desta patologia')}</div>`;
  }

  /* Bloco de patologias de um lugar: g = 'mont' | 'jus' | 'corpo'. */
  function blocoHTML(l, g) {
    const marcadas = doGrupo(l, g), marc = new Set(marcadas.map(p => p.id)), sem = !!(l.semPatGrupo && l.semPatGrupo[g]);
    return `<div class="card" data-pg="${g}"><h3>Patologias · ${esc(GRUPOS[g])} <span class="chip ${marcadas.length ? 'rascunho' : sem ? 'concluido' : ''}">${marcadas.length || (sem ? 'nenhuma' : '—')}</span></h3>
        <label class="chk"><input type="checkbox" data-pa="sem" data-g="${g}"${sem ? ' checked' : ''}> Sem patologias aparentes ${g === 'corpo' ? 'no corpo' : 'nesta boca'}</label>
        ${sem ? '' : `<p class="muted small" style="margin:8px 0 6px">Marque o que foi observado. Cada patologia marcada permite anexar fotos.</p>
        <div class="icogrid pat-grid">${lista(g).map(([k, r]) => { const id = idDe(g, k), on = marc.has(id);
          return `<button type="button" class="icobtn pat${on ? ' on' : ''}" data-pa="tog" data-g="${g}" data-k="${k}" aria-pressed="${on}"><span>${esc(Cat.patRotulo(g, k))}</span>${on ? `<i class="cam${l.fotos.some(f => f.ctx === 'pat:' + id) ? ' ok' : ''}">📷</i>` : ''}</button>`; }).join('')}</div>`}</div>
      ${sem ? '' : marcadas.slice().sort((a, b) => lista(g).findIndex(x => x[0] === String(a.id).slice(g.length + 1)) - lista(g).findIndex(x => x[0] === String(b.id).slice(g.length + 1))).map(p => cartao(l, p, g)).join('')}`;
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('button[data-pa]'); if (!b) return;
    const App = BU.App, l = App.cur(); if (!l || b.dataset.pa !== 'tog') return;
    const g = b.dataset.g, k = b.dataset.k, id = idDe(g, k); l.patologias = l.patologias || [];
    const i = l.patologias.findIndex(p => p.id === id);
    if (i >= 0) {
      const nf = l.fotos.filter(f => f.ctx === 'pat:' + id).length;
      if (nf && !(await UI.confirmar(`Desmarcar esta patologia apaga ${nf} foto(s) dela. Continuar?`, { titulo: 'Desmarcar patologia', ok: 'Desmarcar', perigo: true }))) return;
      for (const f of l.fotos.filter(f => f.ctx === 'pat:' + id)) { try { await BU.DB.excluirFoto(f.id); } catch (err) { /* segue */ } }
      l.fotos = l.fotos.filter(f => f.ctx !== 'pat:' + id); l.patologias.splice(i, 1);
    } else l.patologias.push({ id, local: Cat.PAT_LOCAL[g], tipo: k === 'outros' ? '' : Cat.patRotulo(g, k), gravidade: '', obs: '' });
    if (BU.Form) BU.Form.sincDiag(l);
    App.marcarSujo(); App.renderEtapa();
  });

  async function aoMudar(e) {
    const el = e.target; if (!el.dataset || !el.dataset.pa || el.tagName === 'BUTTON') return;
    const App = BU.App, l = App.cur(); if (!l) return;
    if (el.dataset.pa === 'sem') {
      if (e.type !== 'change') return;
      const g = el.dataset.g; l.semPatGrupo = l.semPatGrupo || {};
      if (el.checked) {
        const ja = doGrupo(l, g);
        if (ja.length) {
          const nf = l.fotos.filter(f => ja.some(p => f.ctx === 'pat:' + p.id)).length;
          if (!(await UI.confirmar(`Marcar “sem patologias” apaga ${ja.length} patologia(s) marcada(s)${nf ? ' e ' + nf + ' foto(s)' : ''}. Continuar?`, { titulo: 'Sem patologias', ok: 'Apagar e marcar', perigo: true }))) { el.checked = false; return; }
          for (const f of l.fotos.filter(f => ja.some(p => f.ctx === 'pat:' + p.id))) { try { await BU.DB.excluirFoto(f.id); } catch (err) { /* segue */ } }
          l.fotos = l.fotos.filter(f => !ja.some(p => f.ctx === 'pat:' + p.id)); l.patologias = l.patologias.filter(p => !ja.includes(p));
        }
      }
      l.semPatGrupo[g] = el.checked; sincSem(l);
      if (BU.Form) BU.Form.sincDiag(l);
      App.marcarSujo(); App.renderEtapa(); return;
    }
    const card = el.closest('[data-pid]'); const p = card && (l.patologias || []).find(x => x.id === card.dataset.pid); if (!p) return;
    const k = el.dataset.pa; if (!['tipo', 'gravidade', 'obs'].includes(k)) return;
    p[k] = el.value; App.marcarSujo();
  }
  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);

  BU.Patologias = { blocoHTML, GRUPOS, GRAV, TIPOS, doGrupo, rotuloDe, sincSem };
})();
