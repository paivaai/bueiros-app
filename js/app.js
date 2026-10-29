/* app.js — rotas, estado, formulário em etapas e listagem. (Fase 1) */
(function () {
  'use strict';
  const BU = window.BU;
  const { U, UI, DB } = BU;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = U.esc;

  /* =========================================================
     Modelo e opções
     ========================================================= */
  const { UFS, SN, OPCOES } = BU.Modelo;
  const STATUS = { a_vistoriar: ['A vistoriar', 'avistoriar'], rascunho: ['Rascunho', 'rascunho'], concluido: ['Concluído', 'concluido'], devolvido: ['Devolvido', 'devolvido'], aprovado: ['Aprovado', 'aprovado'], nao_localizado: ['Não localizado', 'naoloc'] };
  const BOCA = ['Boca simples', 'Com ala', 'Com muro de testa', 'Com caixa coletora', 'Sem proteção', 'Outro'];

  /* Etapas do formulário (a ordem segue o HTML de referência). */
  const ETAPAS = [
    { n: 1, nome: 'Informação geral' }, { n: 2, nome: 'Corpo' }, { n: 3, nome: 'Boca de montante' }, { n: 4, nome: 'Boca de jusante' }, { n: 5, nome: 'Diagnóstico' }, { n: 6, nome: 'Revisão' },
  ];
  /* Os pontos do RTK, os dispositivos, as patologias e as fotos agora ficam dentro de cada etapa (montante, jusante e corpo); os apelidos abaixo apontam para onde foram parar. */
  const E = { GERAL: 1, COORD: 1, CORPO: 2, MONT: 3, JUS: 4, DIAG: 5, REV: 6, RTK: 3, DISP: 3, PATO: 2 };
  const ETAPAS_FOTO = [E.GERAL, E.CORPO, E.MONT, E.JUS];

  /* Cada campo: p = caminho dentro do levantamento; t = tipo; half = ocupa meia largura. */
  const CAMPOS = {};

  const novoLevantamento = () => BU.Modelo.novo();
  const normalizar = r => BU.Modelo.normalizar(r);

  /* =========================================================
     Estado
     ========================================================= */
  const S = {
    lista: [], q: '',
    cur: null, etapa: 1, persistido: false,
    dirty: false, rev: 0, timer: null, saveState: 'salvo',
    hashAtual: '#/', ignorar: false,
    filtro: 'todos', limite: 60, ultimoResp: null, resp: [], ultimaZona: null, eixo: null, ultimoRtk: null,
  };

  /* Ordem de trabalho: em andamento, depois os a vistoriar (na ordem do km), depois os concluídos. */
  const ORD = { devolvido: 0, rascunho: 1, a_vistoriar: 2, nao_localizado: 3, concluido: 4, aprovado: 5 };
  function ordenar(lista) {
    const cmp = (a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt', { numeric: true });
    return lista.slice().sort((a, b) => ((ORD[a.status] ?? 1) - (ORD[b.status] ?? 1))
      || (a.status === 'a_vistoriar' ? cmp(a, b) : String(b.atualizadoEm).localeCompare(String(a.atualizadoEm))));
  }
  /* Responsável: lembra o último nome usado neste aparelho para não digitar em cada bueiro. */
  async function prefillResponsavel(l) {
    const logado = BU.Sync.nomeUsuario(); // com conta aberta, o vistoriador é sempre quem está logado
    if (logado && !['concluido', 'aprovado'].includes(l.status)) { l.responsavel = logado; return; }
    if (l.responsavel) return;
    try { if (S.ultimoResp == null) S.ultimoResp = (await DB.cfgObter('ultimoResponsavel')) || ''; } catch (e) { S.ultimoResp = ''; }
    if (S.ultimoResp) l.responsavel = S.ultimoResp;
  }

  /* Lista de responsáveis: nomes ficam cadastrados neste aparelho e aparecem num menu. */
  async function carregarResp() { try { const v = await DB.cfgObter('responsaveis'); if (Array.isArray(v)) S.resp = v; } catch (e) { /* segue vazio */ } }
  async function lembrarResp(nome) {
    nome = String(nome || '').trim();
    if (!nome || S.resp.includes(nome)) return;
    S.resp = [...S.resp, nome].sort((a, b) => a.localeCompare(b, 'pt'));
    try { await DB.cfgSalvar('responsaveis', S.resp); } catch (e) { /* não crítico */ }
  }
  async function removerResp(nome) {
    S.resp = S.resp.filter(x => x !== nome);
    try { await DB.cfgSalvar('responsaveis', S.resp); } catch (e) { /* não crítico */ }
  }
  async function novoResp() {
    const nome = await UI.pedir('Novo responsável', { ph: 'Nome completo' });
    if (S.cur) { if (nome) { await lembrarResp(nome); S.cur.responsavel = nome; marcarSujo(); } renderWizard(); }
  }

  const RTK_PADRAO = ['alturaAntena']; // o resto do RTK é fixo do projeto (BU.Modelo.RTK_PROJETO)
  async function prefillRtk(l) {
    try { if (S.ultimoRtk == null) S.ultimoRtk = (await DB.cfgObter('ultimoRtk')) || {}; } catch (e) { S.ultimoRtk = {}; }
    for (const k of RTK_PADRAO) if ((l.rtk[k] == null || l.rtk[k] === '') && S.ultimoRtk[k] != null && S.ultimoRtk[k] !== '') l.rtk[k] = S.ultimoRtk[k];
  }
  function lembrarRtk(l) {
    const v = {}; for (const k of RTK_PADRAO) v[k] = l.rtk[k];
    if (JSON.stringify(v) === JSON.stringify(S.ultimoRtk) || !RTK_PADRAO.some(k => v[k] != null && v[k] !== '')) return;
    S.ultimoRtk = v; DB.cfgSalvar('ultimoRtk', v).catch(() => {});
  }
  const conferenciasHTML = (l, etapa) => {
    const c = BU.Conf.analisar(l, S.eixo).filter(x => x.e === etapa);
    return c.length ? `<div class="card"><h3>Conferências automáticas</h3>${c.map(x => `<div class="pend ${x.n}"><span>${x.n === 'erro' ? '⛔' : '⚠️'} ${esc(x.t)}</span></div>`).join('')}</div>` : '';
  };

  async function prefillZona(l) {
    try { if (S.ultimaZona == null) S.ultimaZona = (await DB.cfgObter('ultimaZona')) || ''; } catch (e) { S.ultimaZona = ''; }
    if (S.ultimaZona) l.zona = S.ultimaZona;
  }

  /* =========================================================
     Validação e pendências
     ========================================================= */
  const nomeBoca = k => (k === 'montante' ? 'montante' : 'jusante');
  function pendencias(l) {
    const P = [], c = l.caracteristicas, m = l.medicoes, B = BU.Bocas;
    const ob = (t, e) => P.push({ n: 'erro', t, e, ob: true }), av = (t, e) => P.push({ n: 'aviso', t, e });
    if (!String(l.codigo || '').trim()) ob('Código do levantamento não preenchido', E.GERAL);
    if (!l.data) ob('Data não preenchida', E.GERAL);
    if (!String(l.responsavel || '').trim()) ob('Vistoriador não identificado', E.GERAL);
    if (l.status === 'nao_localizado') return P;
    if (!l.classificacao) av('Classificação (grota ou greide) não informada', E.GERAL);
    if (!c.celulas || !c.tipo || !c.material) av('Tipo de bueiro incompleto (nº de linhas, forma e material)', E.GERAL);
    if (l.rtk && l.rtk.alturaAntena == null) av('Altura da antena do RTK não informada', E.GERAL);
    if (!BU.GPS.utmDe(l)) av('Coordenadas não definidas: marque os pontos vermelhos das bocas', E.MONT);
    else if (l.coordOrigem === 'cadastro') av('Coordenadas ainda são as do cadastro: serão substituídas quando os pontos das bocas forem marcados', E.MONT);
    const dimOk = c.tipo === 'Tubular' ? c.diametro != null : (c.largura != null && c.altura != null);
    if (c.tipo && !dimOk) av(c.tipo === 'Tubular' ? 'Diâmetro do corpo não informado' : 'Base e altura do corpo não informadas', E.CORPO);
    if (m.comprimentoBueiro == null) av('Comprimento e declividade são calculados: marque os pontos das bocas de montante e de jusante', E.MONT);
    if (!c.estadoCorpo) av('Estado do corpo não informado', E.CORPO);
    ['montante', 'jusante'].forEach(k => {
      const bc = l.bocas[k], e = k === 'montante' ? E.MONT : E.JUS;
      if (!bc.tipo) ob(`Tipo da boca de ${nomeBoca(k)} não informado`, e);
      if (!bc.estado) av(`Estado da boca de ${nomeBoca(k)} não informado`, e);
      const f = B.faltando(l, k);
      if (f.length) ob(`Boca de ${nomeBoca(k)}: ${f.length} ponto(s) vermelho(s) sem marcar (${f.slice(0, 3).map(x => x.nome.split(' (')[0]).join('; ')}${f.length > 3 ? '…' : ''})`, e);
    });
    if (!l.pontos.length) av('Nenhum ponto cadastrado', E.MONT);
    if (!BU.Prancha.croquiPronto(l)) av('Croqui ainda não gerado (marque os pontos das bocas ou informe as dimensões)', E.MONT);
    [['mont', E.MONT], ['jus', E.JUS], ['corpo', E.CORPO]].forEach(([g, e]) => {
      const nome = BU.Patologias.GRUPOS[g], pats = BU.Patologias.doGrupo(l, g);
      if (!(l.semPatGrupo || {})[g] && !pats.length) av(`Patologias ${g === 'corpo' ? 'do corpo' : 'da ' + nome} não registradas (marque ou use “sem patologias”)`, e);
      for (const p of pats) if (!l.fotos.some(f => f.ctx === 'pat:' + p.id)) { av(`Patologia “${BU.Patologias.rotuloDe(p) || 'sem tipo'}” (${nome}) sem foto`, e); break; }
    });
    if (!c.conservacao) av('Estado de conservação não informado', E.DIAG);
    (l.diagnostico.necessita || []).forEach(k => { if (!((l.diagnostico.onde || {})[k] || []).length) av(`Serviço “${BU.Cat.rotulo(BU.Cat.NECESSITA, k)}”: informe onde aplicar (montante, corpo ou jusante)`, E.DIAG); });
    if (!l.fotos.some(f => f.ctx === 'secao')) av('Nenhuma foto da seção', E.CORPO);
    if (!l.fotos.some(f => f.ctx === 'foto:montante')) av('Nenhuma foto da boca de montante', E.MONT);
    if (!l.fotos.some(f => f.ctx === 'foto:jusante')) av('Nenhuma foto da boca de jusante', E.JUS);
    for (const cf of BU.Conf.analisar(l, S.eixo)) P.push({ n: cf.n, t: cf.t, e: cf.e });
    return P;
  }
  const obrigatoriosFaltando = l => pendencias(l).filter(p => p.ob).map(p => p.t);

  /* Percentual de preenchimento (mesmo critério do HTML de referência: lista de itens exigidos, % = feitos / total). */
  function completude(l) {
    const c = l.caracteristicas || {}, m = l.medicoes || {}, B = BU.Bocas, bo = l.bocas || { montante: {}, jusante: {} };
    const tub = c.tipo === 'Tubular';
    const foto = k => (l.fotos || []).some(f => f.ctx === 'foto:' + k);
    const REQ = [
      ['Código', !!String(l.codigo || '').trim()], ['Classificação (grota/greide)', !!l.classificacao],
      ['km', !!l.km], ['Pista (sentido geográfico)', !!l.pistaGe], ['Lado da rodovia', !!l.lado], ['Coordenadas', !!BU.GPS.utmDe(l) && l.coordOrigem !== 'cadastro'],
      ['Nº de linhas', !!c.celulas], ['Forma', !!c.tipo], ['Material', !!c.material],
      ['Seção do corpo', tub ? c.diametro != null : (c.largura != null && c.altura != null)], ['Comprimento', m.comprimentoBueiro != null],
      ['Tipo da boca de montante', !!bo.montante.tipo], ['Pontos da boca de montante', !!bo.montante.tipo && !B.faltando(l, 'montante').length], ['Estado da boca de montante', !!bo.montante.estado],
      ['Tipo da boca de jusante', !!bo.jusante.tipo], ['Pontos da boca de jusante', !!bo.jusante.tipo && !B.faltando(l, 'jusante').length], ['Estado da boca de jusante', !!bo.jusante.estado],
      ['Croqui', BU.Prancha.croquiPronto(l)], ['Estado de conservação', !!c.conservacao],
      ['Foto da boca de montante', foto('montante')], ['Foto da boca de jusante', foto('jusante')], ['Foto da seção', (l.fotos || []).some(f => f.ctx === 'secao')],
    ];
    const feitos = REQ.filter(x => x[1]).length;
    return { feitos, total: REQ.length, pct: Math.round(feitos / REQ.length * 100), faltam: REQ.filter(x => !x[1]).map(x => x[0]) };
  }
  const barraHTML = l => { const c = completude(l); return `<div class="compl"><span class="muted small">${c.pct}% completo</span><div class="progress" role="progressbar" aria-valuenow="${c.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${c.pct}%"></i></div></div>`; };

  /* Todas as informações do ponto, como o balão do Google Earth: o que veio do cadastro (KMZ) + o que está no app. */
  function dadosPontoHTML(l) {
    const N = U.numTxt, c = l.caracteristicas || {}, u = BU.GPS.utmDe(l), cp = completude(l);
    const orig = (l.meta && l.meta.atributos) || {};
    const tab = itens => `<div class="kvs">${itens.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${v !== '' && v != null ? esc(v) : '—'}</b></div>`).join('')}</div>`;
    const dim = c.diametro != null ? `Ø ${N(c.diametro)} m` : (c.largura != null && c.altura != null ? `${N(c.largura)} × ${N(c.altura)} m` : '');
    const noApp = [
      ['Código', l.codigo], ['Rodovia', l.estrada], ['km', l.km], ['Município / UF', [l.municipio, l.estado].filter(Boolean).join(' / ')],
      ['Ambiente', l.ambiente], ['Pista (sentido geográfico)', l.pistaGe], ['Sentido do km', l.sentido], ['Lado da rodovia', l.lado],
      ['Latitude / Longitude', l.latitude != null ? `${l.latitude}, ${l.longitude}` : ''], ['UTM (SIRGAS 2000)', u ? `E ${BU.GPS.fmtM(u.E, 3)} · N ${BU.GPS.fmtM(u.N, 3)} · ${BU.GPS.rotuloUTM(u)}` : ''],
      ['Tipo de bueiro', [l.meta && l.meta.sigla, l.meta && l.meta.descricaoTipo].filter(Boolean).join(' — ')], ['Forma / material', [c.tipo, c.material].filter(Boolean).join(' · ')], ['Dimensão', dim],
      ['Estado de conservação', c.conservacao], ['Classificação', l.classificacao], ['Observações', l.observacoes],
    ];
    const chaves = Object.keys(orig);
    return `<div class="dados-ponto"><p><b>${esc(l.codigo || 'Sem código')}</b> <span class="chip">${cp.pct}% completo</span></p>
      ${chaves.length ? `<h4>Cadastro original (Google Earth / KMZ)</h4>${tab(chaves.map(k => [BU.KMZ && BU.KMZ.rotulo ? BU.KMZ.rotulo(k) : k, orig[k]]))}` : '<p class="muted small">Este bueiro não veio de um arquivo KMZ.</p>'}
      <h4>Como está no app</h4>${tab(noApp)}
      ${cp.faltam.length ? `<h4>Ainda falta preencher (${cp.faltam.length})</h4><p class="small">${cp.faltam.map(esc).join(' · ')}</p>` : '<p class="small">Todos os itens preenchidos.</p>'}</div>`;
  }
  async function verDados(id) {
    let l = S.cur && S.cur.id === id ? S.cur : (S.lista || []).find(x => x.id === id);
    if (!l) { try { l = (await DB.listar()).find(x => x.id === id); } catch (e) { /* ignora */ } }
    if (!l) { UI.toast('Bueiro não encontrado', 'erro'); return; }
    await UI.escolher('Dados do ponto', dadosPontoHTML(l), [{ k: 'x', label: 'Fechar', cls: 'primary' }]);
  }

  function validarNumero(el) {
    const raw = el.value.trim(), t = el.dataset.t;
    if (raw === '') return { val: null, erro: '' };
    const n = U.parseNum(raw);
    if (n === null) return { val: null, erro: 'Digite um número (ex.: 1,25).' };
    if (t === 'int' && !Number.isInteger(n)) return { val: null, erro: 'Digite um número inteiro.' };
    const min = el.dataset.min === '' ? null : parseFloat(el.dataset.min);
    const max = el.dataset.max === '' ? null : parseFloat(el.dataset.max);
    if (min !== null && max !== null && (n < min || n > max)) return { val: null, erro: `${el.dataset.label} deve estar entre ${min} e ${max}.` };
    if (min === 0 && n < 0) return { val: null, erro: 'Não pode ser negativo.' };
    if (min !== null && n < min) return { val: null, erro: `Mínimo: ${min}.` };
    if (max !== null && n > max) return { val: null, erro: `Máximo: ${max}.` };
    return { val: n, erro: '' };
  }
  function mostrarErro(el, msg) {
    el.classList.toggle('invalido', !!msg); el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const e = document.getElementById(el.id + '-err'); if (e) { e.textContent = msg; e.hidden = !msg; }
  }

  /* =========================================================
     Salvamento (automático e manual)
     ========================================================= */
  const SAVE_TXT = { salvo: 'Salvo ✓', salvando: 'Salvando…', pendente: 'Alterações não salvas', erro: 'Erro ao salvar' };
  function setSaveState(s) {
    S.saveState = s;
    const el = $('#save-state');
    if (el) { el.textContent = SAVE_TXT[s]; el.className = 'chip save ' + s; }
  }
  function marcarSujo() {
    if (S.cur && (S.cur.status === 'a_vistoriar' || S.cur.status === 'devolvido')) S.cur.status = 'rascunho'; // começou (ou refez) a vistoria
    S.dirty = true; S.rev++; setSaveState('pendente');
    clearTimeout(S.timer); S.timer = setTimeout(() => salvarAtual(), 700);
  }
  async function salvarAtual({ forcar = false } = {}) {
    if (!S.cur) return true;
    if (!S.dirty && !forcar) return true;
    clearTimeout(S.timer);
    const rev = S.rev;
    S.cur.atualizadoEm = U.agoraISO();
    if (S.cur.status === 'concluido' && obrigatoriosFaltando(S.cur).length) S.cur.status = 'rascunho';
    setSaveState('salvando');
    try {
      await DB.salvar(S.cur);
      S.persistido = true;
      const resp = String(S.cur.responsavel || '').trim();
      if (resp && resp !== S.ultimoResp) { S.ultimoResp = resp; DB.cfgSalvar('ultimoResponsavel', resp).catch(() => {}); }
      lembrarResp(resp); lembrarRtk(S.cur);
      if (BU.Sync) BU.Sync.agendar();
      if (S.rev === rev) { S.dirty = false; setSaveState('salvo'); }
      else { setSaveState('pendente'); clearTimeout(S.timer); S.timer = setTimeout(() => salvarAtual(), 300); }
      return true;
    } catch (err) {
      console.error(err); setSaveState('erro');
      UI.toast('Não foi possível salvar: ' + ((err && err.message) || err), 'erro');
      return false;
    }
  }

  /* =========================================================
     Renderização — Início
     ========================================================= */
  /* Bueiros do projeto aberto: os do projeto escolhido e os que ainda são só deste aparelho. */
  const doProjeto = l => { const pid = BU.Sync.projetoId(), m = BU.Sync.meta(l.id); return !pid || !m || !m.projetoId || m.projetoId === pid; };
  function cartaoProjeto(p, ativo) {
    const mine = S.lista.filter(l => { const m = BU.Sync.meta(l.id); return m && m.projetoId === p.id; });
    const feitos = mine.filter(l => l.status !== 'a_vistoriar').length, n = mine.length, pc = n ? Math.round(100 * feitos / n) : 0;
    return `<article class="card proj${ativo ? ' ativo' : ''}" data-id="${esc(p.id)}">
      <div class="lev-top"><b>${esc(p.nome)}</b>${ativo ? '<span class="chip concluido">aberto</span>' : ''}</div>
      <div class="muted small">${esc([p.rodovia, p.fuso ? 'fuso ' + p.fuso + (p.hemisferio || '') : ''].filter(Boolean).join(' · ') || 'Projeto')}</div>
      <div class="prog" aria-hidden="true"><i style="width:${pc}%"></i></div>
      <div class="muted small">${n ? `${feitos} de ${n} vistoriados neste aparelho` : 'Nenhum bueiro baixado ainda'}</div>
      <div class="row"><button type="button" class="btn ${ativo ? '' : 'primary'}" data-a="projeto" data-id="${esc(p.id)}">${ativo ? 'Ver bueiros' : 'Abrir projeto'}</button></div></article>`;
  }
  function viewHome() {
    const logado = BU.Sync.logado(), projs = BU.Sync.projetos(), ativo = BU.Sync.projetoId();
    const visiveis = S.lista.filter(doProjeto), n = visiveis.length;
    const feitos = visiveis.filter(l => l.status !== 'a_vistoriar').length;
    const cont = { todos: n }; for (const k in STATUS) cont[k] = visiveis.filter(x => x.status === k).length;
    const chips = [['todos', 'Todos'], ['a_vistoriar', 'A vistoriar'], ['rascunho', 'Rascunho'], ['concluido', 'Concluído'], ['devolvido', 'Devolvido'], ['nao_localizado', 'Não localizado'], ['aprovado', 'Aprovado']]
      .map(([k, t]) => `<button type="button" class="fchip" data-a="filtro" data-v="${k}" aria-pressed="${S.filtro === k}">${t} <span>${cont[k]}</span></button>`).join('');
    const proj = BU.Sync.projeto();
    const escolher = logado && projs.length && !ativo;
    const cab = proj
      ? `<div class="saudacao"><div><small class="muted">Olá, ${esc(BU.Sync.nomeUsuario() || '')}</small><h1 class="titulo-proj">${esc(proj.nome)}</h1><small class="muted">${esc([proj.rodovia, proj.fuso ? 'fuso ' + proj.fuso + (proj.hemisferio || '') : ''].filter(Boolean).join(' · '))}${n ? ` · ${feitos} de ${n} vistoriados` : ''} · <a href="#/sync">trocar projeto</a></small></div></div>`
      : `<div class="saudacao"><div><small class="muted">${logado ? 'Olá,' : 'Sem conta'}</small><b>${esc(BU.Sync.nomeUsuario() || 'Dados só neste aparelho')}</b></div></div>`;
    $('#view').innerHTML = `
      <section class="page home">
        ${cab}
        ${BU.Sync.cartaoHome()}
        ${escolher ? `<h2 class="sec">Escolha o projeto</h2>${projs.map(p => cartaoProjeto(p, false)).join('')}` : ''}
        ${logado && !projs.length ? '<div class="card vazio">Nenhum projeto liberado para você ainda. Peça ao escritório para incluir você na equipe.</div>' : ''}
        ${escolher ? '' : `<div id="lista-bueiros"></div>
        <div class="filtros-fixos"><div class="filtros" role="group" aria-label="Filtrar por situação">${chips}</div></div>
        <input id="busca" class="busca" type="search" placeholder="Buscar por nome, km, município…" value="${esc(S.q)}" aria-label="Buscar">
        <div id="itens">${itensLista()}</div>`}
        <details class="card ferr"><summary><b>Ferramentas</b> <span class="muted small">importar, backup, instalar</span></summary>
          <div class="menu">
            <button type="button" class="btn big" data-a="importar-kmz">Importar cadastro (KMZ/KML) <small>carrega os bueiros com todos os campos do arquivo</small></button>
            <button type="button" class="btn big" data-a="importar-home">Importar arquivo TXT <small>cria um levantamento com os pontos do RTK</small></button>
            <button type="button" class="btn big" data-a="backup" ${S.lista.length ? '' : 'disabled'}>Exportar dados <small>backup completo em JSON, com fotos</small></button>
            <button type="button" class="btn big" data-a="restaurar">Restaurar backup <small>volta os levantamentos de um JSON</small></button>
            ${S.instalar ? '<button type="button" class="btn big primary" data-a="instalar">Instalar app no celular</button>' : ''}
          </div></details>
        <p class="muted small" style="text-align:center">${feitos} de ${n} bueiros vistoriados</p>
      </section>`;
    ajustarTopo();
  }
  /* altura do cabeçalho: os filtros ficam fixos logo abaixo dele ao rolar */
  function ajustarTopo() { const t = document.querySelector('.topbar'); if (t) document.documentElement.style.setProperty('--topbar-h', t.offsetHeight + 'px'); }
  window.addEventListener('resize', ajustarTopo);

  /* =========================================================
     Renderização — Lista
     ========================================================= */
  function resumoTecnico(l) {
    const c = l.caracteristicas, N = U.numTxt;
    const dim = c.diametro != null ? `Ø ${N(c.diametro)} m` : (c.largura != null && c.altura != null ? `${N(c.largura)} × ${N(c.altura)} m` : '');
    const sigla = (l.meta && l.meta.sigla) || (BU.Cat && BU.Cat.siglaDe ? BU.Cat.siglaDe(c) : '');
    return [sigla || [c.tipo, c.material].filter(Boolean).join(' · '), dim].filter(Boolean).join(' · ');
  }
  function cartaoLista(l) {
    const local = [l.km && 'km ' + l.km, l.municipio ? l.municipio + (l.estado ? '/' + l.estado : '') : '', !l.km && l.estrada].filter(Boolean).join(' · ') || 'Local não informado';
    const [rot, cls] = STATUS[l.status] || STATUS.rascunho, av = l.status === 'a_vistoriar', tec = resumoTecnico(l);
    const nav = (l.latitude != null && l.longitude != null)
      ? `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}&travelmode=driving">Navegar</a>` : '';
    return `<article class="card lev" data-id="${esc(l.id)}">
      <div class="lev-top"><b>${esc(l.codigo || 'Sem código')}</b><span class="chip ${cls}">${rot}</span></div>
      ${BU.Sync.selo(l.id) ? `<div>${BU.Sync.selo(l.id)}</div>` : ''}
      ${l.status === 'devolvido' && l.comentarioRevisao ? `<div class="pend aviso">↩ ${esc(l.comentarioRevisao)}</div>` : ''}
      <div>${esc(local)}</div>
      ${tec ? `<div class="muted small">${esc(tec)}</div>` : ''}
      ${barraHTML(l)}
      <div class="muted small">${av ? esc(l.observacoes ? l.observacoes.split('\n')[0] : 'Ainda não vistoriado') : `${esc(U.dataBR(l.data))} · ${esc(l.responsavel || 'sem responsável')} · atualizado ${esc(U.dataHoraBR(l.atualizadoEm))}`}</div>
      <div class="row">
        <button type="button" class="btn primary" data-a="abrir">${av ? 'Vistoriar' : 'Abrir'}</button>${nav}<button type="button" class="btn mais" data-a="menu" aria-label="Mais opções" title="Mais opções">⋯</button>
      </div></article>`;
  }
  /* "⋯": Dados, Não localizei e Excluir ficam recolhidos para ninguém apagar sem querer. */
  async function menuBueiro(id) {
    const l = S.lista.find(x => x.id === id); if (!l) return;
    const bot = [{ k: 'dados', label: 'Dados do ponto' }];
    if (['a_vistoriar', 'rascunho', 'devolvido'].includes(l.status)) bot.push({ k: 'nl', label: 'Não localizei este bueiro' });
    if (podeExcluir(l)) bot.push({ k: 'excluir', label: 'Excluir bueiro…', cls: 'danger' });
    bot.push({ k: 'x', label: 'Fechar' });
    const r = await UI.escolher(l.codigo || 'Sem código', '<p class="muted small">Escolha uma opção.</p>', bot);
    if (r === 'dados') verDados(id); else if (r === 'nl') marcarNaoLocalizado(id); else if (r === 'excluir') excluir(id);
  }
  function listaFiltrada() {
    const q = S.q.trim().toLowerCase();
    let l = S.lista.filter(doProjeto); if (S.filtro !== 'todos') l = l.filter(x => x.status === S.filtro);
    if (q) l = l.filter(x => [x.codigo, x.estrada, x.municipio, x.responsavel, x.km, x.cadastroId].join(' ').toLowerCase().includes(q));
    return ordenar(l);
  }
  function itensLista() {
    if (!S.lista.filter(doProjeto).length) return '<div class="card vazio">Nenhum bueiro ainda.<br><button type="button" class="btn primary" data-go="#/novo">+ Novo bueiro</button><button type="button" class="btn" data-a="importar-kmz">Importar cadastro (KMZ/KML)</button></div>';
    const l = listaFiltrada();
    if (!l.length) return '<div class="card vazio">Nada encontrado para esse filtro ou busca.</div>';
    return `<div class="muted small">${l.length} bueiro(s)</div>` + l.slice(0, S.limite).map(cartaoLista).join('')
      + (l.length > S.limite ? `<button type="button" class="btn" data-a="mais-lista">Mostrar mais (${l.length - S.limite})</button>` : '');
  }
  function viewLista() { viewHome(); const el = document.getElementById('lista-bueiros'); if (el) el.scrollIntoView(); }
  function verLista(filtro) { S.filtro = filtro || 'todos'; S.limite = 60; S.q = ''; if (location.hash === '#/lista') rotear(); else location.hash = '#/lista'; }

  /* =========================================================
     Renderização — Formulário em etapas
     ========================================================= */
  function campoHTML(c) {
    const v = U.getPath(S.cur, c.p), id = 'f-' + c.p.replace(/\./g, '-'), t = c.t || 'text';
    const lab = `<label for="${id}">${esc(c.label)}${c.req ? ' <span class="req" title="Obrigatório">*</span>' : ''}</label>`;
    let ctl;
    if (t === 'resp') {
      const nomes = [...new Set([...S.resp, ...(v ? [v] : [])])];
      ctl = `<select id="${id}" data-p="${c.p}"><option value="">— escolha o responsável —</option>${nomes.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}<option value="__novo__">+ Novo responsável…</option></select>`
        + (v && S.resp.includes(v) ? `<button type="button" class="btn sm linkbtn" data-a="resp-remover" data-nome="${esc(v)}">Remover “${esc(v)}” da lista</button>` : '');
    } else if (t === 'codigo') {
      ctl = `<div class="row" style="gap:6px"><input id="${id}" type="text" autocomplete="off" data-p="${c.p}" value="${esc(v || '')}" placeholder="${esc(c.ph || '')}" style="flex:1"><button type="button" class="btn sm" data-a="gerar-codigo" title="Monta o código com a rodovia e o km">Gerar pelo km</button></div>`;
    } else if (t === 'select') {
      ctl = `<select id="${id}" data-p="${c.p}">${c.sem ? '' : '<option value="">—</option>'}${c.opts.map(o => `<option value="${esc(o)}"${String(o) === String(v) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (t === 'textarea') {
      ctl = `<textarea id="${id}" data-p="${c.p}" rows="3">${esc(v || '')}</textarea>`;
    } else if (t === 'num' || t === 'int') {
      const im = (c.neg || c.min < 0) ? 'text' : 'decimal'; // teclado decimal do iPhone não tem sinal de menos
      ctl = `<div class="unitwrap"><input id="${id}" type="text" inputmode="${t === 'int' ? 'numeric' : im}" autocomplete="off" data-p="${c.p}" data-t="${t}"
        data-min="${c.min == null ? '' : c.min}" data-max="${c.max == null ? '' : c.max}" data-label="${esc(c.label)}"
        value="${esc(U.numTxt(v))}" placeholder="${esc(c.ph || '')}">${c.unit ? `<span class="unit">${esc(c.unit)}</span>` : ''}</div>`;
    } else if (t === 'date' || t === 'time') {
      ctl = `<input id="${id}" type="${t}" data-p="${c.p}" value="${esc(v || '')}">`;
    } else {
      ctl = `<input id="${id}" type="text" autocomplete="off" data-p="${c.p}" value="${esc(v || '')}" placeholder="${esc(c.ph || '')}">`;
    }
    const half = c.half || t === 'num' || t === 'int' || t === 'date' || t === 'time';
    return `<div class="f${half ? ' half' : ''}">${lab}${ctl}<div class="err" id="${id}-err" role="alert" hidden></div></div>`;
  }
  const camposHTML = lista => `<div class="grid">${lista.map(c => c.h ? `<h3 class="grp">${esc(c.h)}</h3>` : campoHTML(c)).join('')}</div>`;

  function resumoTxt() {
    const l = S.cur;
    return [l.estrada, l.municipio].filter(Boolean).join(' · ') || 'Preencha a identificação';
  }

  function cadastroHTML(l) {
    if (!l.cadastro || !l.cadastro.itens || !l.cadastro.itens.length) return '';
    return `<details class="card cad"><summary><b>Dados do cadastro</b> <span class="muted small">${esc(l.cadastro.arquivo || '')}</span></summary>
      ${l.cadastro.itens.map(([k, v]) => linha(k, v)).join('')}
      <p class="muted small">Vieram do arquivo importado e não são alterados. Confirme em campo e corrija nos campos do formulário.</p></details>`;
  }
  function linha(k, v) { return `<div class="kv"><span>${esc(k)}</span><b>${v ? esc(v) : '—'}</b></div>`; }
  function revisaoHTML() {
    const l = S.cur, c = l.caracteristicas, m = l.medicoes, N = U.numTxt;
    const dim = [c.diametro != null && `Ø ${N(c.diametro)} m`, c.largura != null && `L ${N(c.largura)} m`, c.altura != null && `A ${N(c.altura)} m`, c.comprimento != null && `C ${N(c.comprimento)} m`].filter(Boolean).join(' · ');
    const P = pendencias(l);
    const u = BU.GPS.utmDe(l);
    const coord = u ? `E ${BU.GPS.fmtM(u.E, 3)} · N ${BU.GPS.fmtM(u.N, 3)} · ${BU.GPS.rotuloUTM(u)}` : '';
    return `
      <div class="card"><h3>Identificação</h3>
        ${linha('Nome', l.codigo)}${linha('Local', [l.estrada, l.municipio ? l.municipio + (l.estado ? '/' + l.estado : '') : ''].filter(Boolean).join(' · '))}
        ${linha('Data e hora', [U.dataBR(l.data), l.hora].filter(Boolean).join(' '))}${linha('Vistoriador', l.responsavel)}${linha('Equipe', l.equipe)}</div>
      <div class="card"><h3>Localização</h3>${linha('Coordenadas', coord)}${linha('Altitude (Z)', l.altitude != null ? N(l.altitude) + ' m' : '')}</div>
      <div class="card"><h3>Bueiro</h3>
        ${linha('Tipo de bueiro', [l.meta && l.meta.sigla, l.meta && l.meta.descricaoTipo].filter(Boolean).join(' · ') || [c.tipo, c.formato].filter(Boolean).join(' / '))}${linha('Dimensões', dim)}${linha('Material', c.material)}
        ${linha('Conservação', c.conservacao)}${linha('Cota entrada / saída', (m.cotaEntrada != null || m.cotaSaida != null) ? `${N(m.cotaEntrada) || '—'} / ${N(m.cotaSaida) || '—'}` : '')}
        ${BU.Prancha.miniatura(l)}</div>
      <div class="card"><h3>Registros</h3>${linha('Pontos', String(l.pontos.length))}${linha('Patologias', l.semPatologias ? 'sem patologias aparentes' : String(l.patologias.length))}${linha('Fotos', `${l.fotos.length} (seção ${l.fotos.filter(f => f.ctx === 'secao').length} · bocas ${l.fotos.filter(f => /^foto:(montante|jusante)$/.test(f.ctx || '')).length} · patologias ${l.fotos.filter(f => (f.ctx || '').startsWith('pat:')).length})`)}</div>
      <div class="card"><h3>Pendências <span class="chip ${P.length ? 'rascunho' : 'concluido'}">${P.length || 'nenhuma'}</span></h3>
        ${P.length ? P.map(p => `<div class="pend ${p.n}"><span>${p.n === 'erro' ? '⛔' : '⚠️'} ${esc(p.t)}</span><button type="button" class="btn sm" data-etapa="${p.e}">Ir</button></div>`).join('') : '<p class="muted">Tudo preenchido.</p>'}
        <p class="muted small">Pendências são avisos: você pode salvar mesmo assim.</p></div>
      ${BU.Export.painelHTML()}
      <button type="button" class="btn" data-etapa="1">Editar</button>`;
  }

  /* Bueiro criado em campo: preenche o que estiver vazio com o cadastro (KMZ) do projeto: ponto mais próximo no km, e a pista pela letra do código (N/S/L/O). */
  const kmMetros = t => { const m = String(t || '').match(/(\d{1,3})\+(\d{2,3})/); return m ? +m[1] * 1000 + +m[2] : null; };
  const PISTA_LETRA = { N: 'Norte', S: 'Sul', L: 'Leste', O: 'Oeste' };
  function prefillDoCadastro(l) {
    if (['cadastro', 'planejamento'].includes(l.origem) || ['concluido', 'aprovado'].includes(l.status)) return false;
    const fontes = S.lista.filter(x => x.id !== l.id && doProjeto(x) && (x.planejado || ['cadastro', 'planejamento'].includes(x.origem)));
    if (!fontes.length) return false;
    const kmL = kmMetros(l.km) ?? kmMetros(l.codigo), cod = String(l.codigo || '').match(/\d\+\d{2,3}[^\s]*\s+([NSLO])\b/i);
    if (!l.pistaGe && cod) l.pistaGe = PISTA_LETRA[cod[1].toUpperCase()] || '';
    const proximo = lista => lista.map(x => ({ x, d: kmL != null && kmMetros(x.km) != null ? Math.abs(kmMetros(x.km) - kmL) : 1e9 })).sort((a, b) => a.d - b.d)[0];
    const geral = proximo(fontes), mesma = l.pistaGe ? proximo(fontes.filter(x => x.pistaGe === l.pistaGe)) : null;
    let mudou = false; const set = (k, v) => { if (v && !l[k]) { l[k] = v; mudou = true; } };
    if (geral) { const g = geral.x; set('estrada', g.estrada); set('estado', g.estado); set('municipio', g.municipio); set('ambiente', g.ambiente); if (!l.pistaGe && geral.d < 1e9) { /* pista só pela letra do código */ } }
    const ref = mesma || geral; if (ref) { set('sentido', ref.x.sentido); set('lado', ref.x.lado); if (mesma) set('ambiente', mesma.x.ambiente); }
    return mudou;
  }

  function renderWizard() {
    const l = S.cur, n = S.etapa, et = ETAPAS[n - 1];
    if (BU.Prancha.sincronizarMedicoes(l)) marcarSujo(); // cotas, comprimento, declividade e recobrimento vêm dos pontos do RTK
    try { if (l.pontos && l.pontos.length && l.coordOrigem !== 'rtk' && BU.Prancha.usarCentroComoCoordenada(l)) marcarSujo(); } catch (e) { /* sem modelo ainda */ } // coordenada do bueiro = centro dos pontos do RTK
    if (n === E.GERAL && prefillDoCadastro(l)) marcarSujo();
    let corpo;
    const F = BU.Form;
    if (n === E.GERAL) corpo = F.geralHTML(l) + conferenciasHTML(l, E.GERAL);
    else if (n === E.CORPO) corpo = F.corpoHTML(l);
    else if (n === E.MONT) corpo = BU.Bocas.etapaHTML(l, 'montante');
    else if (n === E.JUS) corpo = BU.Bocas.etapaHTML(l, 'jusante');
    else if (n === E.DIAG) corpo = F.diagnosticoHTML(l);
    else corpo = revisaoHTML();
    if (!ETAPAS_FOTO.includes(n)) BU.Fotos.limpar();

    $('#view').innerHTML = `
      <section class="page wiz">
        <div class="resumo">
          <div class="r-txt"><b id="r-cod">${esc(l.codigo || 'Novo levantamento')}</b><span id="r-sub">${esc(resumoTxt())}</span></div>
          <span id="save-state" class="chip save ${S.saveState}">${SAVE_TXT[S.saveState]}</span>
        </div>
        ${l.status === 'devolvido' ? `<div class="card devolvido"><b>↩ Devolvido pelo escritório</b><p>${esc(l.comentarioRevisao || 'Sem comentário.')}</p><p class="muted small">Corrija e salve de novo: ele volta para revisão.</p></div>` : ''}
        ${l.status === 'nao_localizado' ? `<div class="card naoloc"><b>Não localizado</b><p>${esc((l.naoLocalizado && l.naoLocalizado.motivo) || '')}${l.naoLocalizado && l.naoLocalizado.obs ? ' — ' + esc(l.naoLocalizado.obs) : ''}</p><button type="button" class="btn sm" data-a="reabrir-vistoria">Voltar a vistoriar</button></div>` : ''}
        ${l.status === 'aprovado' ? '<div class="card aprovado"><b>✔ Aprovado pelo escritório</b><p class="muted small">Não é mais enviado ao servidor. Alterações ficam só neste aparelho.</p></div>' : ''}
        <nav class="steps" aria-label="Etapas">${ETAPAS.map(e => `<button type="button" class="seg${e.n === n ? ' atual' : ''}${e.n < n ? ' feito' : ''}" data-etapa="${e.n}" aria-label="Etapa ${e.n}: ${e.nome}"${e.n === n ? ' aria-current="step"' : ''}><span></span></button>`).join('')}</nav>
        <div class="step-title"><span>Etapa ${n} de ${ETAPAS.length}</span><h1>${esc(et.nome)}</h1></div>
        ${corpo}
      </section>`;

    if (ETAPAS_FOTO.includes(n)) BU.Fotos.aposRender();
    const bar = $('#actionbar'); bar.hidden = false; bar.className = 'actionbar';
    bar.innerHTML = n < ETAPAS.length
      ? `<button type="button" class="btn" data-a="voltar">‹ Voltar</button><button type="button" class="btn" data-a="salvar">Salvar</button><button type="button" class="btn primary" data-a="proximo">Próximo ›</button>`
      : `<button type="button" class="btn" data-a="voltar">‹ Voltar</button><button type="button" class="btn primary grow" data-a="concluir">Salvar levantamento</button>`;
  }

  /* =========================================================
     Eventos
     ========================================================= */
  function aoEditar(e) {
    const el = e.target;
    if (!S.cur || !el.dataset || !el.dataset.p) return;
    if (el.dataset.p === 'responsavel' && el.value === '__novo__') { if (e.type === 'change') novoResp(); return; }
    const t = el.dataset.t;
    let val = el.value;
    if (t === 'num' || t === 'int') {
      const r = validarNumero(el); mostrarErro(el, r.erro); val = r.val;
    }
    U.setPath(S.cur, el.dataset.p, val);
    if (['leste', 'norte', 'zona', 'hemisferio'].includes(el.dataset.p)) {
      S.cur.coordOrigem = 'manual'; BU.GPS.atualizarLatLon(S.cur);
      if (el.dataset.p === 'zona' && val) { S.ultimaZona = val; DB.cfgSalvar('ultimaZona', val).catch(() => {}); }
    }
    if (el.dataset.p.startsWith('medicoes.') && S.cur.medicoesAuto) delete S.cur.medicoesAuto[el.dataset.p.slice(9)]; // o que o usuário digita vale mais que o calculado
    marcarSujo();
    BU.Form.aposCampo(S.cur, el.dataset.p);
    if (S.etapa === E.CORPO) { if (e.type === 'change' && el.dataset.p === 'caracteristicas.formato') renderWizard(); else { BU.Secao.redesenhar(); BU.Prancha.redesenhar(); } }
    if (['codigo', 'estrada', 'municipio'].includes(el.dataset.p)) {
      $('#r-cod').textContent = S.cur.codigo || 'Novo levantamento'; $('#r-sub').textContent = resumoTxt();
    }
  }

  function irEtapa(n) { location.hash = `#/lev/${S.cur.id}/${n}`; }

  /* Só o que o operador criou em campo pode ser excluído; o que veio do cadastro/planejamento do escritório não. */
  const podeExcluir = l => !['cadastro', 'planejamento'].includes(l.origem) && !l.planejado && l.status !== 'aprovado';
  async function excluir(id) {
    const l = S.lista.find(x => x.id === id);
    if (l && !podeExcluir(l)) { UI.toast('Este bueiro veio do cadastro do escritório e não pode ser excluído aqui.', 'aviso'); return; }
    const ok = await UI.confirmar(`Excluir o levantamento “${(l && l.codigo) || 'Sem código'}”? Esta ação não pode ser desfeita.`, { titulo: 'Excluir levantamento', ok: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      const m = BU.Sync.meta(id);
      if (l && m && !m.local && (m.versao > 0 || m.projetoId)) await BU.Sync.registrarExclusao(id, m.projetoId || BU.Sync.projetoId(), l.codigo, l.fotos); // sai também do servidor
      await DB.excluir(id);
    } catch (err) { UI.toast('Erro ao excluir: ' + err.message, 'erro'); return; }
    S.lista = await DB.listar(); viewLista(); UI.toast('Levantamento excluído');
  }
  const backup = () => BU.Export.backupTudo();

  /* ---------- bueiro não localizado ---------- */
  const MOTIVOS_NL = ['Não existe no local', 'Soterrado ou coberto', 'Sem acesso ao local', 'Posição planejada errada', 'Outro'];
  function posicaoAgora() {
    return new Promise(ok => {
      if (!navigator.geolocation) return ok(null);
      navigator.geolocation.getCurrentPosition(p => ok({ latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: p.coords.accuracy }), () => ok(null), { enableHighAccuracy: true, timeout: 7000, maximumAge: 15000 });
    });
  }
  function pedirNaoLocalizado(l) {
    return new Promise(resolve => {
      const back = $('#modal'), nl = l.naoLocalizado || {};
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>Bueiro não localizado</h2>
        <p class="muted small">${esc(l.codigo || 'Sem código')}. O escritório vai revisar este registro.</p>
        <div class="f"><label for="nl-m">Motivo <span class="req">*</span></label><select id="nl-m"><option value="">— escolha —</option>${MOTIVOS_NL.map(m => `<option${m === nl.motivo ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></div>
        <div class="f"><label for="nl-o">Observação</label><textarea id="nl-o" rows="3">${esc(nl.obs || '')}</textarea></div>
        <div class="err" id="nl-e" role="alert" hidden></div>
        <div class="row"><button type="button" class="btn" data-m="n">Cancelar</button><button type="button" class="btn primary" data-m="s">Marcar não localizado</button></div></div>`;
      back.hidden = false;
      const fim = r => { back.hidden = true; back.innerHTML = ''; resolve(r); };
      back.onclick = e => {
        const b = e.target.closest('[data-m]');
        if (b && b.dataset.m === 'n') return fim(null);
        if (b && b.dataset.m === 's') {
          const m = $('#nl-m').value, o = $('#nl-o').value.trim(), er = $('#nl-e');
          if (!m) { er.textContent = 'Escolha o motivo.'; er.hidden = false; return; }
          if (m === 'Outro' && !o) { er.textContent = 'Descreva o motivo na observação.'; er.hidden = false; return; }
          fim({ motivo: m, obs: o });
        } else if (e.target === back) fim(null);
      };
    });
  }
  async function marcarNaoLocalizado(id) {
    const emEdicao = S.cur && S.cur.id === id, l = emEdicao ? S.cur : (await DB.obter(id)) && normalizar(await DB.obter(id));
    if (!l) return;
    const r = await pedirNaoLocalizado(l); if (!r) return;
    const pos = await posicaoAgora();
    l.naoLocalizado = { ...r, em: U.agoraISO(), gps: pos };
    l.status = 'nao_localizado';
    if (!l.data) { l.data = U.hojeISO(); l.hora = U.horaAgora(); }
    await prefillResponsavel(l);
    if (emEdicao) { marcarSujo(); await salvarAtual({ forcar: true }); }
    else { l.atualizadoEm = U.agoraISO(); await DB.salvar(l); }
    if (BU.Sync) BU.Sync.agendar();
    UI.toast('Marcado como não localizado. Se quiser, anexe uma foto do local.');
    location.hash = `#/lev/${id}/${E.GERAL}`; if (S.hashAtual === `#/lev/${id}/${E.GERAL}`) rotear();
  }
  async function reabrirVistoria() {
    if (!S.cur) return; S.cur.status = 'rascunho'; S.cur.naoLocalizado = null; S.dirty = true; S.rev++;
    await salvarAtual({ forcar: true }); renderWizard(); UI.toast('Voltou para vistoria');
  }
  async function concluir() {
    if (S.cur.status === 'nao_localizado') { S.dirty = true; S.rev++; if (await salvarAtual({ forcar: true })) { UI.toast('Salvo'); location.hash = '#/lista'; } return; }
    const falt = obrigatoriosFaltando(S.cur);
    if (falt.length) {
      const ok = await UI.confirmar(`Faltam campos obrigatórios (${falt.join(', ')}). Salvar como rascunho?`, { titulo: 'Campos obrigatórios', ok: 'Salvar rascunho' });
      if (!ok) return;
      S.cur.status = 'rascunho';
    } else S.cur.status = 'concluido';
    S.dirty = true; S.rev++;
    if (await salvarAtual({ forcar: true })) { UI.toast(falt.length ? 'Salvo como rascunho' : 'Levantamento salvo'); location.hash = '#/lista'; }
  }

  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-go],[data-a],[data-etapa]');
    if (!t || t.disabled) return;
    if (t.dataset.go) { location.hash = t.dataset.go; return; }
    if (t.dataset.etapa) { if (S.cur) irEtapa(+t.dataset.etapa); return; }
    const a = t.dataset.a, id = t.dataset.id || (t.closest('[data-id]') || {}).dataset?.id;
    if (a === 'nao-localizado') marcarNaoLocalizado(id);
    else if (a === 'reabrir-vistoria') reabrirVistoria();
    else if (a === 'continuar' || a === 'abrir') location.hash = `#/lev/${id}/1`;
    else if (a === 'dados') verDados(id);
    else if (a === 'menu') menuBueiro(id);
    else if (a === 'excluir') excluir(id);
    else if (a === 'projeto') { if (BU.Sync.projetoId() !== id) await BU.Sync.escolherProjeto(id); S.lista = await DB.listar(); viewLista(); }
    else if (a === 'backup') backup();
    else if (a === 'resp-remover') { if (await UI.confirmar(`Tirar “${t.dataset.nome}” da lista de responsáveis? Os levantamentos já feitos não mudam.`, { titulo: 'Remover da lista', ok: 'Remover' })) { await removerResp(t.dataset.nome); renderWizard(); } }
    else if (a === 'coord-pontos') { if (BU.Prancha.usarCentroComoCoordenada(S.cur)) { marcarSujo(); renderWizard(); UI.toast('Coordenadas preenchidas com o centro do bueiro'); } else UI.toast('Não foi possível calcular o centro com os pontos atuais', 'aviso'); }
    else if (a === 'importar-home') $('#home-file').click();
    else if (a === 'importar-kmz') $('#kmz-file').click();
    else if (a === 'filtro') { S.filtro = t.dataset.v; S.limite = 60; viewLista(); }
    else if (a === 'mais-lista') { S.limite += 60; $('#itens').innerHTML = itensLista(); }
    else if (a === 'restaurar') $('#restore-file').click();
    else if (a === 'instalar' && S.instalar) { S.instalar.prompt(); try { await S.instalar.userChoice; } catch (e) { /* ignora */ } S.instalar = null; if (S.hashAtual === '#/' || S.hashAtual === '') viewHome(); }
    else if (a === 'voltar') { if (S.etapa > 1) irEtapa(S.etapa - 1); else location.hash = '#/'; }
    else if (a === 'proximo') irEtapa(S.etapa + 1);
    else if (a === 'salvar') { if (await salvarAtual({ forcar: true })) UI.toast('Salvo'); }
    else if (a === 'concluir') concluir();
    else if (a === 'gerar-codigo' && S.cur) {
      const c = BU.Codigo.codigo(S.cur.estrada, S.cur.km);
      if (!c) { UI.toast('Preencha a rodovia (Nome ou número da estrada) e o km (ex.: 170+470).', 'aviso'); return; }
      S.cur.codigo = c; marcarSujo(); renderWizard(); UI.toast('Código gerado');
    }
  });
  document.addEventListener('input', e => { if (e.target.id === 'busca') { S.q = e.target.value; S.limite = 60; $('#itens').innerHTML = itensLista(); } });

  /* =========================================================
     Rotas
     ========================================================= */
  /* Barra inferior das telas principais: Cadastro, Mapa, Novo bueiro, Projeto */
  function mostrarNav(h) {
    const bar = $('#actionbar'), on = k => ((k === 'cad' && (h === '#/' || h === '' || h === '#/lista')) || (k === 'mapa' && h === '#/mapa') || (k === 'proj' && h === '#/sync')) ? ' atual' : '';
    bar.hidden = false; bar.className = 'actionbar navbar';
    bar.innerHTML = `<button type="button" class="nav${on('cad')}" data-go="#/"><span class="i">▦</span>Cadastro</button><button type="button" class="nav${on('mapa')}" data-go="#/mapa"><span class="i">⌖</span>Mapa</button><button type="button" class="nav novo" data-go="#/novo"><span class="i">＋</span>Novo bueiro</button><button type="button" class="nav${on('proj')}" data-go="#/sync"><span class="i">☰</span>Projeto</button>`;
  }
  async function rotear() {
    if (S.ignorar) { S.ignorar = false; return; }
    const h = location.hash || '#/';
    // Sempre grava o que estiver pendente antes de trocar de tela.
    if (S.cur && S.dirty && !(await salvarAtual())) { S.ignorar = true; location.hash = S.hashAtual; return; }
    window.scrollTo(0, 0);
    if (BU.Mapa) BU.Mapa.parar();
    const bar = $('#actionbar');
    if (BU.Sync.precisaLogin()) { S.cur = null; bar.hidden = true; bar.innerHTML = ''; bar.className = 'actionbar'; BU.Sync.viewLogin(); S.hashAtual = h; return; }

    const m = h.match(/^#\/lev\/([^/]+)\/(\d{1,2})$/);
    if (h === '#/novo') {
      S.cur = novoLevantamento(); S.cur.data = U.hojeISO(); S.cur.hora = U.horaAgora(); await prefillResponsavel(S.cur); await prefillZona(S.cur); await prefillRtk(S.cur); BU.Sync.prefillNovo(S.cur); S.persistido = false; S.dirty = false; S.saveState = 'salvo';
      location.replace(`#/lev/${S.cur.id}/1`); return;
    }
    if (m) {
      const id = m[1], n = Math.min(ETAPAS.length, Math.max(1, +m[2]));
      if (!S.cur || S.cur.id !== id) {
        const r = await DB.obter(id);
        if (!r) { UI.toast('Levantamento não encontrado', 'erro'); location.replace('#/lista'); return; }
        S.cur = normalizar(r); S.persistido = true; S.dirty = false; S.saveState = 'salvo';
        // Bueiro vindo do cadastro: data, hora e responsável entram na hora de vistoriar (só gravam quando você editar ou salvar).
        if (!S.cur.data) { S.cur.data = U.hojeISO(); S.cur.hora = U.horaAgora(); }
        await prefillResponsavel(S.cur);
        if (['a_vistoriar', 'rascunho'].includes(S.cur.status) && S.cur.rtk.alturaAntena == null) await prefillRtk(S.cur);
      }
      try { S.eixo = await BU.Sync.eixoAtivo(); } catch (e) { S.eixo = null; }
      S.etapa = n; renderWizard(); S.hashAtual = h; return;
    }
    // Telas fora do formulário
    S.cur = null; bar.hidden = true; bar.innerHTML = '';
    S.lista = await DB.listar();
    if (h === '#/mapa') await BU.Mapa.view(S.lista.filter(doProjeto));
    else if (h === '#/sync') await BU.Sync.view();
    else { await BU.Sync.recarregar(); if (h === '#/lista') viewLista(); else viewHome(); }
    mostrarNav(h);
    S.hashAtual = h;
  }

  function atualizarConexao() {
    const el = $('#conn'), on = navigator.onLine;
    el.textContent = on ? 'Online' : 'Offline'; el.className = 'conn ' + (on ? 'on' : 'off');
  }

  /* ---------- PWA: instalação e atualização ---------- */
  function registrarPWA() {
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.instalar = e; if (S.hashAtual === '#/' || S.hashAtual === '') viewHome(); });
    window.addEventListener('appinstalled', () => { S.instalar = null; UI.toast('App instalado'); });
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('service-worker.js').then(reg => {
      const avisar = w => { $('#aviso-update').hidden = false; $('#btn-update').onclick = async () => { await salvarAtual(); w.postMessage({ tipo: 'PULAR_ESPERA' }); }; };
      if (reg.waiting && navigator.serviceWorker.controller) avisar(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) avisar(nw); });
      });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => { /* sem service worker o app continua funcionando online */ });
    let recarregou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (recarregou) return; recarregou = true; location.reload(); });
  }

  async function iniciar() {
    const ok = await DB.iniciar();
    if (!ok) $('#aviso-storage').hidden = false;
    atualizarConexao();
    window.addEventListener('online', atualizarConexao); window.addEventListener('offline', atualizarConexao);
    window.addEventListener('hashchange', rotear);
    await BU.Pontos.iniciar(); await carregarResp(); await BU.Fotos.iniciar(); await BU.Sync.iniciar();
    $('#restore-file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) BU.Export.restaurar(f); });
    registrarPWA();
    $('#kmz-file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) BU.KMZ.importar(f); });
    $('#home-file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) BU.Pontos.importarDaHome(f); });
    const v = $('#view'); v.addEventListener('input', aoEditar); v.addEventListener('change', aoEditar);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAtual(); });
    window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
    rotear();
  }
  /* Interface usada pelos módulos gps.js, points.js, section-drawing.js e photos.js */
  window.BU.App = {
    cur: () => S.cur, S, irEtapa: n => { if (S.cur) irEtapa(n); }, prefillNovo: async l => { await prefillResponsavel(l); await prefillZona(l); }, marcarSujo, salvarAtual, campoHTML, E, ETAPAS, novo: novoLevantamento, normalizar, pendencias, completude, dadosPontoHTML, verDados, CAMPOS, OPCOES, UFS, verLista,
    rotear, irParaLista: () => { location.hash = '#/lista'; if (S.hashAtual === '#/lista') rotear(); },
    renderEtapa: () => { if (S.cur) renderWizard(); },
    refrescar: async () => {
      if (S.cur) return;
      S.lista = await DB.listar(); const h = S.hashAtual;
      if (h === '#/lista') viewLista(); else if (h === '#/sync') BU.Sync.view(); else if (h === '#/' || h === '') viewHome();
    },
  };
  iniciar();
})();
