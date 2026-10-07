/* points.js — pontos topográficos: cadastro, lista, importação e exportação TXT. Expõe BU.Pontos.
   Formato do TXT (igual ao do RTK):  ID X Y Z "CÓDIGO"
   Os números são guardados como TEXTO para preservar as casas decimais exatamente (ex.: 15.9040). */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, DB = BU.DB, esc = U.esc;

  const CODIGOS_PADRAO = ['RN', 'TER-ASF', 'TER-CA', 'TER-PA', 'OAC-ALA', 'OAC-GTZ', 'OUTRO'];
  const P = { edit: null, filtro: '', ordem: 'cad', limite: 150, extras: [] };

  async function iniciar() {
    try { const v = await DB.cfgObter('codigosPontos'); if (Array.isArray(v)) P.extras = v; } catch (e) { /* segue com padrão */ }
  }
  function codigosDe(l) {
    const set = new Set([...CODIGOS_PADRAO, ...P.extras, ...l.pontos.map(p => p.codigo).filter(Boolean)]);
    return [...set];
  }
  async function lembrarCodigos(lista) {
    const novos = lista.filter(c => c && !CODIGOS_PADRAO.includes(c) && !P.extras.includes(c));
    if (!novos.length) return;
    P.extras = [...P.extras, ...new Set(novos)];
    try { await DB.cfgSalvar('codigosPontos', P.extras); } catch (e) { /* não crítico */ }
  }

  /* ---------- números e fuso ---------- */
  function numTxt(v) { // "7480303,1798" -> "7480303.1798"; inválido -> null
    const t = String(v == null ? '' : v).trim().replace(/\s/g, '').replace(',', '.');
    return /^[-+]?\d+(\.\d+)?$/.test(t) ? t.replace(/^\+/, '') : null;
  }
  function fusoDe(l) { return l.fuso || (l.longitude != null ? Math.floor((l.longitude + 180) / 6) + 1 : 23); }
  function proximoId(l) {
    const ns = l.pontos.map(p => parseInt(p.id, 10)).filter(n => !isNaN(n));
    return ns.length ? String(Math.max(...ns) + 1) : '';
  }
  const cmpId = (a, b) => String(a.id).localeCompare(String(b.id), 'pt', { numeric: true });

  /* ---------- importação ---------- */
  function parsear(texto) {
    const ok = [], ruins = [];
    texto.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).forEach((raw, i) => {
      let s = raw.trim();
      if (!s || s.startsWith('#') || s.startsWith('//')) return;
      let codigo = '';
      const m = s.match(/["“”]([^"“”]*)["“”]\s*$/);
      if (m) { codigo = m[1].trim(); s = s.slice(0, m.index).trim(); }
      let tok;
      if (/[;\t]/.test(s)) tok = s.split(/[;\t]+/);
      else if (/\s/.test(s)) tok = s.split(/\s+/).map(t => t.replace(/^,+|,+$/g, ''));
      else tok = s.split(',');
      tok = tok.map(t => t.trim()).filter(Boolean);
      if (!m && tok.length >= 5) { codigo = tok.slice(4).join(' ').replace(/^"|"$/g, ''); tok = tok.slice(0, 4); }
      if (tok.length !== 4) { ruins.push({ n: i + 1, t: raw, motivo: 'esperado: ID X Y Z "CÓDIGO"' }); return; }
      const [id, x, y, z] = [tok[0], numTxt(tok[1]), numTxt(tok[2]), numTxt(tok[3])];
      if (x === null || y === null || z === null) { ruins.push({ n: i + 1, t: raw, motivo: 'X, Y ou Z não é número' }); return; }
      ok.push({ uid: U.uid(), id, x, y, z, codigo: codigo.replace(/"/g, ''), obs: '' });
    });
    return { ok, ruins };
  }
  function resumoHTML(r, extra) {
    return `<p><b>${r.ok.length}</b> ponto(s) válido(s)${r.ruins.length ? ` · <b>${r.ruins.length}</b> linha(s) ignorada(s)` : ''}.</p>
      ${extra || ''}
      ${r.ruins.length ? `<div class="ruins">${r.ruins.slice(0, 6).map(x => `<div>Linha ${x.n}: <span class="mono">${esc(x.t.slice(0, 60))}</span><br><small>${esc(x.motivo)}</small></div>`).join('')}${r.ruins.length > 6 ? `<div>… e mais ${r.ruins.length - 6}</div>` : ''}</div>` : ''}`;
  }
  function lerArquivo(file) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsText(file); });
  }

  /* Importar dentro do levantamento aberto (etapa Pontos). */
  async function importarNoAtual(file) {
    const App = BU.App, l = App.cur(); if (!l) return;
    let texto; try { texto = await lerArquivo(file); } catch (e) { UI.toast('Não foi possível ler o arquivo', 'erro'); return; }
    const r = parsear(texto);
    if (!r.ok.length) { await UI.escolher('Nada para importar', resumoHTML(r, '<p>Nenhuma linha no formato <span class="mono">ID X Y Z "CÓDIGO"</span>.</p>'), [{ k: 'x', label: 'Fechar' }]); return; }
    const n = l.pontos.length;
    const ac = await UI.escolher('Importar ' + file.name, resumoHTML(r, n ? `<p>O levantamento já tem <b>${n}</b> ponto(s).</p>` : ''), [
      { k: 'add', label: n ? 'Adicionar aos existentes' : 'Importar', cls: 'primary' },
      ...(n ? [{ k: 'sub', label: `Substituir os ${n} atuais` }] : []),
      { k: 'x', label: 'Cancelar' }]);
    if (!ac || ac === 'x') return;
    if (ac === 'sub') {
      const ok = await UI.confirmar(`Isto apaga os ${n} pontos atuais e coloca os ${r.ok.length} do arquivo. Continuar?`, { titulo: 'Substituir pontos', ok: 'Substituir', perigo: true });
      if (!ok) return;
      l.pontos = [];
    }
    l.pontos.push(...r.ok);
    await lembrarCodigos(r.ok.map(p => p.codigo));
    App.marcarSujo(); App.renderEtapa();
    const dup = duplicados(l).size;
    UI.toast(`${r.ok.length} ponto(s) importado(s)` + (dup ? ` · atenção: ${dup} ID(s) repetido(s)` : ''), dup ? 'aviso' : '');
  }

  /* Importar a partir da tela inicial: cria um levantamento novo com os pontos. */
  async function importarDaHome(file) {
    let texto; try { texto = await lerArquivo(file); } catch (e) { UI.toast('Não foi possível ler o arquivo', 'erro'); return; }
    const r = parsear(texto);
    if (!r.ok.length) { await UI.escolher('Nada para importar', resumoHTML(r), [{ k: 'x', label: 'Fechar' }]); return; }
    const ac = await UI.escolher('Importar ' + file.name, resumoHTML(r, '<p>Será criado um novo levantamento com estes pontos.</p>'), [
      { k: 'novo', label: 'Criar levantamento com os pontos', cls: 'primary' }, { k: 'x', label: 'Cancelar' }]);
    if (ac !== 'novo') return;
    const l = BU.App.novo(); l.pontos = r.ok; l.codigo = '';
    await lembrarCodigos(r.ok.map(p => p.codigo));
    try { await DB.salvar(l); } catch (e) { UI.toast('Erro ao salvar: ' + e.message, 'erro'); return; }
    location.hash = `#/lev/${l.id}/6`;
  }

  /* ---------- exportação ---------- */
  function textoTXT(l) { return l.pontos.map(p => `${p.id} ${p.x} ${p.y} ${p.z} "${p.codigo || ''}"`).join('\r\n') + '\r\n'; }
  function nomeTXT(l) { return 'PONTOS-' + U.nomeArquivo(l.codigo) + '.txt'; }
  function exportar(l) {
    if (!l.pontos.length) { UI.toast('Nenhum ponto para exportar'); return; }
    U.baixar(new Blob([textoTXT(l)], { type: 'text/plain;charset=utf-8' }), nomeTXT(l));
  }
  async function compartilhar(l) {
    if (!l.pontos.length) { UI.toast('Nenhum ponto para compartilhar'); return; }
    const f = new File([textoTXT(l)], nomeTXT(l), { type: 'text/plain' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: nomeTXT(l) });
      else exportar(l);
    } catch (e) { if (e && e.name !== 'AbortError') exportar(l); }
  }

  /* ---------- tela ---------- */
  function duplicados(l) {
    const c = {}; l.pontos.forEach(p => { c[p.id] = (c[p.id] || 0) + 1; });
    return new Set(Object.keys(c).filter(k => c[k] > 1));
  }
  function visiveis(l) {
    let v = l.pontos.slice();
    if (P.filtro) v = v.filter(p => p.codigo === P.filtro);
    if (P.ordem === 'asc') v.sort(cmpId); else if (P.ordem === 'desc') v.sort((a, b) => cmpId(b, a));
    return v;
  }
  function cartaoPonto(p, dup) {
    return `<article class="card pt" data-uid="${esc(p.uid)}">
      <div class="pt-top"><b>ID ${esc(p.id)}</b><span class="chip">${esc(p.codigo || 'sem código')}</span>${dup ? '<span class="chip rascunho">ID repetido</span>' : ''}</div>
      <div class="mono pt-xyz"><span>X ${esc(p.x)}</span><span>Y ${esc(p.y)}</span><span>Z ${esc(p.z)}</span></div>
      ${p.obs ? `<div class="muted small">${esc(p.obs)}</div>` : ''}
      <div class="row"><button type="button" class="btn sm" data-pt="editar">Editar</button><button type="button" class="btn sm" data-pt="duplicar">Duplicar</button><button type="button" class="btn sm danger" data-pt="excluir">Excluir</button></div></article>`;
  }
  function listaHTML(l) {
    if (!l.pontos.length) return '<div class="card vazio">Nenhum ponto cadastrado. Adicione manualmente ou importe um TXT do RTK.</div>';
    const v = visiveis(l), dups = duplicados(l);
    if (!v.length) return '<div class="card vazio">Nenhum ponto com esse código.</div>';
    return v.slice(0, P.limite).map(p => cartaoPonto(p, dups.has(p.id))).join('')
      + (v.length > P.limite ? `<button type="button" class="btn" data-pt="mais">Mostrar mais (${v.length - P.limite})</button>` : '');
  }
  function contagemTxt(l) {
    const v = visiveis(l).length;
    return `${l.pontos.length} ponto(s)` + (P.filtro ? ` · ${v} com código ${P.filtro}` : '');
  }

  function campo(c, label, val, extra = '') {
    return `<div class="f half"><label for="pf-${c}">${esc(label)}</label><input id="pf-${c}" type="text" data-pf="${c}" value="${esc(val)}" autocomplete="off" ${extra}></div>`;
  }
  function editorHTML(l) {
    const d = P.edit.draft, cods = codigosDe(l), novo = d.codigo === '__novo__';
    return `<div class="card editor" id="pt-editor"><h3>${P.edit.uid ? 'Editar ponto' : 'Novo ponto'}</h3>
      <div class="grid">
        ${campo('id', 'ID do ponto *', d.id)}
        <div class="f half"><label for="pf-codigo">Código</label><select id="pf-codigo" data-pf="codigo"><option value="">—</option>${cods.map(c => `<option value="${esc(c)}"${c === d.codigo ? ' selected' : ''}>${esc(c)}</option>`).join('')}<option value="__novo__"${novo ? ' selected' : ''}>+ Novo código…</option></select></div>
        ${novo ? `<div class="f"><label for="pf-novo">Novo código</label><input id="pf-novo" type="text" data-pf="novoCodigo" value="${esc(d.novoCodigo || '')}" placeholder="ex.: OAC-MUR" autocapitalize="characters"></div>` : ''}
        ${campo('x', 'X (Norte) *', d.x, 'inputmode="decimal"')}
        ${campo('y', 'Y (Leste) *', d.y, 'inputmode="decimal"')}
        ${campo('z', 'Z (cota) *', d.z, 'inputmode="decimal"')}
        <div class="f half"><label for="pf-fuso">Fuso UTM (S)</label><select id="pf-fuso" data-pt-fuso>${[18, 19, 20, 21, 22, 23, 24, 25].map(z => `<option value="${z}"${z === fusoDe(l) ? ' selected' : ''}>${z}</option>`).join('')}</select></div>
        <div class="f"><label for="pf-obs">Observação</label><input id="pf-obs" type="text" data-pf="obs" value="${esc(d.obs)}"></div>
      </div>
      <div id="pt-erro" class="err" role="alert" hidden></div>
      <button type="button" class="btn" data-pt="gps">Preencher X/Y pelo GPS</button>
      <p class="muted small">Converte o GPS para UTM SIRGAS 2000 no fuso escolhido. A altitude do GPS é aproximada: prefira a cota do RTK.</p>
      <div class="row"><button type="button" class="btn" data-pt="cancelar">Cancelar</button><button type="button" class="btn primary" data-pt="salvar">Salvar ponto</button></div></div>`;
  }

  function etapaHTML(l) {
    const cods = [...new Set(l.pontos.map(p => p.codigo).filter(Boolean))];
    const ordTxt = { cad: 'Ordem: cadastro', asc: 'Ordem: ID ↑', desc: 'Ordem: ID ↓' }[P.ordem];
    return `<div class="card">
        <b id="pt-conta">${esc(contagemTxt(l))}</b>
        <div class="row" style="margin-top:10px">
          <button type="button" class="btn primary" data-pt="novo">+ Ponto</button>
          <button type="button" class="btn" data-pt="importar">Importar TXT</button>
          <button type="button" class="btn" data-pt="exportar">Exportar TXT</button>
          ${navigator.share ? '<button type="button" class="btn" data-pt="compartilhar">Compartilhar</button>' : ''}
        </div>
        <div class="row" style="margin-top:10px">
          <select data-pt-filtro aria-label="Filtrar por código"><option value="">Todos os códigos</option>${cods.map(c => `<option${c === P.filtro ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <button type="button" class="btn sm" data-pt="ordem">${ordTxt}</button>
        </div>
        <input type="file" id="pt-file" accept=".txt,.csv,.dat,.xyz,text/*" hidden>
      </div>
      ${P.edit ? editorHTML(l) : ''}
      <div id="pt-lista" class="lista-pt">${listaHTML(l)}</div>`;
  }

  /* ---------- eventos ---------- */
  function abrirEditor(l, base) {
    P.edit = { uid: base ? base.uid : null, draft: base ? { id: base.id, x: base.x, y: base.y, z: base.z, codigo: base.codigo, obs: base.obs || '' } : { id: proximoId(l), x: '', y: '', z: '', codigo: '', obs: '' } };
    BU.App.renderEtapa();
    const ed = document.getElementById('pt-editor'); if (ed) ed.scrollIntoView({ block: 'start' });
  }
  function erroEditor(msg) { const e = document.getElementById('pt-erro'); if (e) { e.textContent = msg; e.hidden = !msg; } }

  async function salvarPonto(l) {
    const d = P.edit.draft, id = String(d.id || '').trim();
    if (!id) { erroEditor('Informe o ID do ponto.'); return; }
    const x = numTxt(d.x), y = numTxt(d.y), z = numTxt(d.z);
    if (x === null || y === null || z === null) { erroEditor('X, Y e Z precisam ser números (use ponto ou vírgula).'); return; }
    let codigo = d.codigo === '__novo__' ? String(d.novoCodigo || '').trim().toUpperCase().replace(/"/g, '') : d.codigo;
    if (d.codigo === '__novo__' && !codigo) { erroEditor('Digite o novo código.'); return; }
    if (l.pontos.some(p => p.id === id && p.uid !== P.edit.uid)) {
      const ok = await UI.confirmar(`Já existe um ponto com ID ${id}. Salvar mesmo assim?`, { titulo: 'ID repetido', ok: 'Salvar mesmo assim' });
      if (!ok) return;
    }
    const reg = { uid: P.edit.uid || U.uid(), id, x, y, z, codigo, obs: String(d.obs || '').trim() };
    const i = l.pontos.findIndex(p => p.uid === reg.uid);
    if (i >= 0) l.pontos[i] = reg; else l.pontos.push(reg);
    await lembrarCodigos([codigo]);
    P.edit = null; BU.App.marcarSujo(); BU.App.renderEtapa(); UI.toast('Ponto salvo');
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-pt]'); if (!b) return;
    const App = BU.App, l = App.cur(); if (!l) return;
    const a = b.dataset.pt, uid = (b.closest('[data-uid]') || {}).dataset ? b.closest('[data-uid]').dataset.uid : null;
    const p = uid ? l.pontos.find(x => x.uid === uid) : null;
    if (a === 'novo') abrirEditor(l, null);
    else if (a === 'editar' && p) abrirEditor(l, p);
    else if (a === 'duplicar' && p) { abrirEditor(l, null); P.edit.draft = { id: proximoId(l), x: p.x, y: p.y, z: p.z, codigo: p.codigo, obs: p.obs || '' }; App.renderEtapa(); }
    else if (a === 'excluir' && p) {
      if (await UI.confirmar(`Excluir o ponto ${p.id}?`, { titulo: 'Excluir ponto', ok: 'Excluir', perigo: true })) { l.pontos = l.pontos.filter(x => x.uid !== uid); App.marcarSujo(); App.renderEtapa(); }
    }
    else if (a === 'cancelar') { P.edit = null; App.renderEtapa(); }
    else if (a === 'salvar') salvarPonto(l);
    else if (a === 'importar') document.getElementById('pt-file').click();
    else if (a === 'exportar') exportar(l);
    else if (a === 'compartilhar') compartilhar(l);
    else if (a === 'ordem') { P.ordem = { cad: 'asc', asc: 'desc', desc: 'cad' }[P.ordem]; App.renderEtapa(); }
    else if (a === 'mais') { P.limite += 150; App.renderEtapa(); }
    else if (a === 'gps') {
      const st = b; st.disabled = true; erroEditor('');
      try {
        const r = await BU.GPS.capturar(), fuso = +document.getElementById('pf-fuso').value || fusoDe(l);
        const u = BU.GPS.paraUTM(r.lat, r.lon, fuso);
        Object.assign(P.edit.draft, { x: u.norte.toFixed(4), y: u.leste.toFixed(4) });
        if (r.alt != null && !P.edit.draft.z) P.edit.draft.z = r.alt.toFixed(3);
        if (!l.fuso) l.fuso = fuso;
        App.renderEtapa(); if (r.acc > 15) UI.toast(`Precisão ruim (±${Math.round(r.acc)} m)`, 'aviso');
      } catch (err) { st.disabled = false; erroEditor(BU.GPS.msgErro(err)); }
    }
  });

  function aoMudar(e) {
    const el = e.target, App = BU.App, l = App.cur(); if (!l) return;
    if (el.dataset.pf && P.edit) {
      P.edit.draft[el.dataset.pf] = el.value;
      if (el.dataset.pf === 'codigo' && e.type === 'change') App.renderEtapa(); // mostra/oculta o campo "novo código"
    } else if ('ptFiltro' in el.dataset) { P.filtro = el.value; App.renderEtapa(); }
    else if ('ptFuso' in el.dataset) { l.fuso = +el.value; App.marcarSujo(); }
    else if (el.id === 'pt-file' && el.files && el.files[0]) { const f = el.files[0]; el.value = ''; importarNoAtual(f); }
  }
  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);

  BU.Pontos = { iniciar, etapaHTML, importarDaHome, parsear, textoTXT };
})();
