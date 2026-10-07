/* export.js — exportação (JSON, CSV, TXT, relatório HTML imprimível), compartilhamento, backup e restauração. Expõe BU.Export. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, DB = BU.DB, esc = U.esc;

  const CATEG = { entrada: 'Entrada', saida: 'Saída', secao: 'Seção', erosao: 'Erosão', obstrucao: 'Obstrução', outro: 'Outro' };
  const blobParaDataURL = b => new Promise((ok, er) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => er(fr.error); fr.readAsDataURL(b); });
  function dataURLParaBlob(u) {
    const [cab, b64] = u.split(','), mime = (/data:([^;]+)/.exec(cab) || [])[1] || 'image/jpeg', bin = atob(b64), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime });
  }
  async function fotosDe(l) {
    const out = [];
    for (const f of l.fotos) { const r = await DB.obterFoto(f.id); if (r && r.blob) out.push({ meta: f, dataUrl: await blobParaDataURL(r.blob) }); }
    return out;
  }

  /* Valor legível de um campo do formulário */
  function valorTxt(l, c) {
    const v = U.getPath(l, c.p);
    if (v == null || v === '') return '';
    if (c.t === 'date') return U.dataBR(v);
    if (c.t === 'num' || c.t === 'int') return U.numTxt(v) + (c.unit ? ' ' + c.unit : '');
    return String(v);
  }
  /* [{grupo, itens:[[rotulo, valor]]}] a partir das etapas 1 a 4 */
  function secoes(l) {
    const C = BU.App.CAMPOS, nomes = { 1: 'Identificação', 2: 'Localização', 3: 'Características', 4: 'Medições' }, out = [];
    for (const n of [1, 2, 3, 4]) {
      let grupo = nomes[n], itens = [];
      const fecha = () => { if (itens.length) out.push({ grupo, itens }); itens = []; };
      for (const c of C[n]) {
        if (c.h) { fecha(); grupo = nomes[n] + ' — ' + c.h; continue; }
        const v = valorTxt(l, c); if (v) itens.push([c.label, v]);
      }
      if (n === 2 && l.gpsCapturadoEm) itens.push(['GPS capturado em', U.dataHoraBR(l.gpsCapturadoEm)]);
      if (n === 2 && l.latitude != null && l.longitude != null) {
        const u = BU.GPS.paraUTM(l.latitude, l.longitude, l.fuso || undefined);
        itens.push([`UTM ${u.zona}${l.latitude < 0 ? 'S' : 'N'} (SIRGAS 2000)`, `N ${u.norte.toFixed(3)} · E ${u.leste.toFixed(3)}`]);
      }
      fecha();
    }
    return out;
  }
  const quando = () => U.dataHoraBR(U.agoraISO());

  /* ---------- formatos ---------- */
  function gerarJSON(l, fotos) {
    return new Blob([JSON.stringify({ app: 'cadastro-bueiros', versaoSchema: l.versaoSchema, exportadoEm: U.agoraISO(), levantamento: l, fotosDados: fotos.map(f => ({ id: f.meta.id, dataUrl: f.dataUrl })) }, null, 2)], { type: 'application/json' });
  }
  function gerarCSV(l) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const linhas = [['Grupo', 'Campo', 'Valor']];
    secoes(l).forEach(s => s.itens.forEach(([k, v]) => linhas.push([s.grupo, k, v])));
    linhas.push(['Registros', 'Pontos', l.pontos.length], ['Registros', 'Fotos', l.fotos.length], ['Registros', 'Seção salva', l.secao && l.secao.salvoEm ? 'Sim' : 'Não']);
    return new Blob(['\uFEFF' + linhas.map(r => r.map(q).join(';')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  }
  function gerarRelatorio(l, fotos) {
    const pend = BU.App.pendencias(l);
    const sec = secoes(l).map(s => `<section><h2>${esc(s.grupo)}</h2><table class="kv">${s.itens.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table></section>`).join('');
    const croqui = (l.secao || BU.Secao.gerarSVG && l.caracteristicas.formato) ? `<section class="fig"><h2>Seção do bueiro (croqui)</h2>${BU.Secao.gerarSVG(l)}</section>` : '';
    const pts = l.pontos.length ? `<section><h2>Pontos topográficos (${l.pontos.length})</h2><table class="grade"><thead><tr><th>ID</th><th>X (Norte)</th><th>Y (Leste)</th><th>Z</th><th>Código</th><th>Obs.</th></tr></thead><tbody>${l.pontos.map(p => `<tr><td>${esc(p.id)}</td><td>${esc(p.x)}</td><td>${esc(p.y)}</td><td>${esc(p.z)}</td><td>${esc(p.codigo)}</td><td>${esc(p.obs)}</td></tr>`).join('')}</tbody></table></section>` : '';
    const fts = fotos.length ? `<section><h2>Fotos (${fotos.length})</h2><div class="fotos">${fotos.map(f => `<figure><img src="${f.dataUrl}" alt=""><figcaption><b>${esc(CATEG[f.meta.categoria] || 'Sem categoria')}</b>${f.meta.legenda ? ' — ' + esc(f.meta.legenda) : ''}<br><small>${esc(U.dataHoraBR(f.meta.dataHora))}</small></figcaption></figure>`).join('')}</div></section>` : '';
    const pe = pend.length ? `<section><h2>Pendências</h2><ul>${pend.map(p => `<li>${esc(p.t)}</li>`).join('')}</ul></section>` : '';
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório ${esc(l.codigo || 'bueiro')}</title><style>
body{font:14px/1.45 Arial,Helvetica,sans-serif;color:#16201A;margin:0;padding:16px;max-width:820px;margin-inline:auto}
header{border-bottom:3px solid #0D6A44;padding-bottom:8px;margin-bottom:12px}h1{margin:0;font-size:22px;color:#0D6A44}.sub{color:#56635A}
h2{font-size:16px;margin:18px 0 6px;color:#0D6A44;border-bottom:1px solid #CBD4CC;padding-bottom:3px}
table{width:100%;border-collapse:collapse}.kv th{text-align:left;width:42%;color:#56635A;font-weight:600;padding:4px 8px 4px 0;vertical-align:top}.kv td{padding:4px 0;font-weight:600}
.kv tr{border-bottom:1px dashed #CBD4CC}.grade th,.grade td{border:1px solid #CBD4CC;padding:4px 6px;text-align:left;font-size:13px}.grade th{background:#E6EBE5}
.fig svg{width:100%;max-width:560px;height:auto;display:block;margin:auto;border:1px solid #CBD4CC}
.fotos{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0;break-inside:avoid;border:1px solid #CBD4CC;border-radius:6px;overflow:hidden}figure img{width:100%;display:block}figcaption{padding:6px 8px;font-size:13px}
section{break-inside:avoid-page}footer{margin-top:24px;color:#56635A;font-size:12px;border-top:1px solid #CBD4CC;padding-top:6px}
.btn{position:sticky;top:8px;float:right;background:#0D6A44;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-size:15px;font-weight:700}
@media print{.btn{display:none}body{padding:0}@page{margin:14mm}}</style></head><body>
<button class="btn" onclick="window.print()">Imprimir / salvar PDF</button>
<header><h1>Relatório de levantamento de bueiro</h1><div class="sub"><b>${esc(l.codigo || 'Sem código')}</b>${l.estrada ? ' · ' + esc(l.estrada) : ''}${l.municipio ? ' · ' + esc(l.municipio) + (l.estado ? '/' + esc(l.estado) : '') : ''}<br>${esc(U.dataBR(l.data))} ${esc(l.hora || '')} · ${esc(l.responsavel || '')}</div></header>
${sec}${croqui}${pts}${fts}${pe}
<footer>Gerado em ${esc(quando())} · Cadastro de Bueiros · ${l.pontos.length} ponto(s) · ${fotos.length} foto(s)</footer></body></html>`;
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  }

  /* ---------- ações ---------- */
  const base = l => U.nomeArquivo(l.codigo);
  async function gerar(tipo, l) {
    if (tipo === 'csv') return { blob: gerarCSV(l), nome: `DADOS-${base(l)}.csv` };
    if (tipo === 'txt') {
      if (!l.pontos.length) throw new Error('Nenhum ponto cadastrado');
      return { blob: new Blob([BU.Pontos.textoTXT(l)], { type: 'text/plain;charset=utf-8' }), nome: `PONTOS-${base(l)}.txt` };
    }
    const fotos = await fotosDe(l);
    if (tipo === 'json') return { blob: gerarJSON(l, fotos), nome: `LEVANTAMENTO-${base(l)}.json` };
    return { blob: gerarRelatorio(l, fotos), nome: `RELATORIO-${base(l)}.html` };
  }
  async function executar(tipo, l) {
    try {
      await BU.App.salvarAtual({ forcar: true });
      const r = await gerar(tipo, l);
      if (tipo === 'relatorio') {
        const url = URL.createObjectURL(r.blob), w = window.open(url, '_blank');
        if (!w) { U.baixar(r.blob, r.nome); UI.toast('Relatório baixado. Abra o arquivo para imprimir ou salvar em PDF.'); }
        else setTimeout(() => URL.revokeObjectURL(url), 120000);
      } else { U.baixar(r.blob, r.nome); UI.toast('Arquivo gerado: ' + r.nome); }
    } catch (e) { UI.toast('Não foi possível exportar: ' + (e && e.message || e), 'erro'); }
  }
  async function compartilhar(l) {
    if (!navigator.share) { UI.toast('Este navegador não compartilha arquivos. Use os botões de baixar.', 'aviso'); return; }
    const k = await UI.escolher('Compartilhar arquivo', '<p>Qual arquivo enviar?</p>', [
      { k: 'relatorio', label: 'Relatório (HTML)', cls: 'primary' }, { k: 'json', label: 'JSON completo (com fotos)' }, { k: 'csv', label: 'CSV dos dados' }, { k: 'txt', label: 'TXT dos pontos' }, { k: 'x', label: 'Cancelar' }]);
    if (!k || k === 'x') return;
    try {
      await BU.App.salvarAtual({ forcar: true });
      const r = await gerar(k, l), f = new File([r.blob], r.nome, { type: r.blob.type.split(';')[0] });
      if (navigator.canShare && !navigator.canShare({ files: [f] })) { U.baixar(r.blob, r.nome); UI.toast('Compartilhamento indisponível; arquivo baixado.', 'aviso'); return; }
      await navigator.share({ files: [f], title: r.nome });
    } catch (e) { if (e && e.name !== 'AbortError') UI.toast('Não foi possível compartilhar: ' + (e.message || e), 'erro'); }
  }

  function painelHTML() {
    return `<div class="card"><h3>Exportar</h3><div class="col2">
      <button type="button" class="btn primary" data-ex="relatorio">Gerar relatório</button>
      <button type="button" class="btn" data-ex="json">Exportar JSON</button>
      <button type="button" class="btn" data-ex="csv">Exportar CSV</button>
      <button type="button" class="btn" data-ex="txt">Exportar TXT (pontos)</button>
      <button type="button" class="btn" data-ex="croqui">Imagem do croqui</button>
      <button type="button" class="btn" data-ex="compartilhar">Compartilhar arquivo</button></div>
      <p class="muted small">O relatório reúne tudo, com croqui, pontos e fotos. Abra e use “Imprimir / salvar PDF”. O JSON inclui as fotos e serve de backup.</p></div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]'); if (!b) return;
    const l = BU.App.cur(); if (!l) return;
    const a = b.dataset.ex;
    if (a === 'compartilhar') compartilhar(l);
    else if (a === 'croqui') BU.Secao.exportarPNG(l);
    else executar(a, l);
  });

  /* ---------- backup geral e restauração ---------- */
  async function backupTudo() {
    const todos = await DB.listar();
    if (!todos.length) { UI.toast('Nada para exportar'); return; }
    UI.toast('Gerando backup…');
    const fotosDados = [];
    for (const l of todos) for (const f of await fotosDe(l)) fotosDados.push({ id: f.meta.id, dataUrl: f.dataUrl });
    const env = { app: 'cadastro-bueiros', versaoSchema: 1, exportadoEm: U.agoraISO(), levantamentos: todos, fotosDados };
    U.baixar(new Blob([JSON.stringify(env)], { type: 'application/json' }), `bueiros-backup-${U.stamp()}.json`);
  }
  async function restaurar(file) {
    let env;
    try { env = JSON.parse(await new Promise((ok, er) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => er(fr.error); fr.readAsText(file); })); }
    catch (e) { UI.toast('Arquivo inválido: não é um JSON', 'erro'); return; }
    const lista = env.levantamentos || (env.levantamento ? [env.levantamento] : null);
    if (env.app !== 'cadastro-bueiros' || !lista) { UI.toast('Este JSON não é um backup do app', 'erro'); return; }
    const ok = await UI.confirmar(`Restaurar ${lista.length} levantamento(s)? Os que já existem neste aparelho não são sobrescritos: entram como cópia.`, { titulo: 'Restaurar backup', ok: 'Restaurar' });
    if (!ok) return;
    const fotos = new Map((env.fotosDados || []).map(f => [f.id, f.dataUrl]));
    const existentes = new Set((await DB.listar()).map(x => x.id));
    let n = 0;
    for (const o of lista) {
      const l = BU.App.normalizar(o);
      if (existentes.has(l.id)) { l.id = U.uid(); l.codigo = (l.codigo || 'Sem código') + ' (restaurado)'; }
      const novas = [];
      for (const f of l.fotos) {
        const du = fotos.get(f.id); if (!du) continue;
        const nid = existentes.has(o.id) ? U.uid() : f.id;
        await DB.salvarFoto({ id: nid, levantamentoId: l.id, tipo: 'image/jpeg', blob: dataURLParaBlob(du), criadoEm: U.agoraISO() });
        novas.push({ ...f, id: nid });
      }
      l.fotos = novas; await DB.salvar(l); n++;
    }
    UI.toast(`${n} levantamento(s) restaurado(s)`); BU.App.irParaLista();
  }

  BU.Export = { painelHTML, backupTudo, restaurar };
})();
