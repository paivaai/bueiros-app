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
  const SCHEMA = 1;
  const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
  const SN = ['Sim', 'Não', 'Não avaliado'];
  const OPCOES = {
    ambiente: ['Rural', 'Urbano'], sentido: ['Crescente', 'Decrescente'],
    pista: ['Norte', 'Sul', 'Leste', 'Oeste', 'Canteiro central'], lado: ['Direito', 'Esquerdo', 'Centro'],
  };
  const STATUS = { a_vistoriar: ['A vistoriar', 'avistoriar'], rascunho: ['Rascunho', 'rascunho'], concluido: ['Concluído', 'concluido'] };
  const BOCA = ['Boca simples', 'Com ala', 'Com muro de testa', 'Com caixa coletora', 'Sem proteção', 'Outro'];

  const ETAPAS = [
    { n: 1, nome: 'Identificação' }, { n: 2, nome: 'Localização' }, { n: 3, nome: 'Características' }, { n: 4, nome: 'Medições' },
    { n: 5, nome: 'Seção' }, { n: 6, nome: 'Pontos' }, { n: 7, nome: 'Fotos' }, { n: 8, nome: 'Revisão' },
  ];

  /* Cada campo: p = caminho dentro do levantamento; t = tipo; half = ocupa meia largura. */
  const CAMPOS = {
    1: [
      { p: 'codigo', label: 'Código do levantamento', req: true, ph: 'ex.: BU-001' },
      { p: 'estrada', label: 'Nome ou número da estrada', ph: 'ex.: BR-101' },
      { p: 'municipio', label: 'Município' },
      { p: 'estado', label: 'Estado', t: 'select', opts: UFS, half: true },
      { p: 'km', label: 'Km', ph: '001+470', half: true },
      { p: 'ambiente', label: 'Ambiente', t: 'select', opts: OPCOES.ambiente, half: true },
      { p: 'sentido', label: 'Sentido do km', t: 'select', opts: OPCOES.sentido, half: true },
      { p: 'pistaGe', label: 'Pista (sentido geográfico)', t: 'select', opts: OPCOES.pista, half: true },
      { p: 'lado', label: 'Lado da rodovia', t: 'select', opts: OPCOES.lado, half: true },
      { p: 'data', label: 'Data', t: 'date', req: true, half: true },
      { p: 'hora', label: 'Hora', t: 'time', half: true },
      { p: 'responsavel', label: 'Responsável', req: true },
      { p: 'equipe', label: 'Empresa ou equipe' },
      { p: 'observacoes', label: 'Observações gerais', t: 'textarea' },
    ],
    2: [
      { p: 'latitude', label: 'Latitude', t: 'num', unit: '°', min: -90, max: 90, neg: true, ph: '-21,2319210' },
      { p: 'longitude', label: 'Longitude', t: 'num', unit: '°', min: -180, max: 180, neg: true, ph: '-41,3173031' },
      { p: 'precisaoGps', label: 'Precisão (±)', t: 'num', unit: 'm', min: 0 },
      { p: 'altitude', label: 'Altitude', t: 'num', unit: 'm', neg: true },
    ],
    3: [
      { h: 'Tipo e geometria' },
      { p: 'caracteristicas.tipo', label: 'Tipo de bueiro', t: 'select', opts: ['Tubular', 'Celular', 'Aduela', 'Galeria', 'Outro'] },
      { p: 'caracteristicas.formato', label: 'Formato da seção', t: 'select', opts: ['Circular', 'Retangular', 'Quadrada', 'Trapezoidal', 'Aduela simples', 'Aduela dupla', 'Personalizada'] },
      { p: 'caracteristicas.linhas', label: 'Linhas', t: 'int', min: 0 },
      { p: 'caracteristicas.celulas', label: 'Células', t: 'int', min: 0 },
      { p: 'caracteristicas.material', label: 'Material', t: 'select', opts: ['Concreto', 'Concreto armado', 'Metal', 'PEAD', 'Pedra', 'Alvenaria', 'Outro'] },
      { h: 'Dimensões' },
      { p: 'caracteristicas.diametro', label: 'Diâmetro', t: 'num', unit: 'm', min: 0 },
      { p: 'caracteristicas.largura', label: 'Largura', t: 'num', unit: 'm', min: 0 },
      { p: 'caracteristicas.altura', label: 'Altura', t: 'num', unit: 'm', min: 0 },
      { p: 'caracteristicas.comprimento', label: 'Comprimento aprox.', t: 'num', unit: 'm', min: 0 },
      { h: 'Condição' },
      { p: 'caracteristicas.situacaoEstrutural', label: 'Situação estrutural', t: 'select', opts: ['Íntegra', 'Fissuras leves', 'Fissuras severas', 'Deformada', 'Colapsada', 'Não avaliada'] },
      { p: 'caracteristicas.conservacao', label: 'Estado de conservação', t: 'select', opts: ['Bom', 'Regular', 'Precário', 'Ruim', 'Crítico', 'Não avaliado'] },
      { p: 'caracteristicas.necessita', label: 'Intervenção necessária', ph: 'ex.: Limpeza, Roçada' },
      { h: 'Ocorrências' },
      { p: 'caracteristicas.erosao', label: 'Erosão', t: 'select', opts: SN, half: true },
      { p: 'caracteristicas.assoreamento', label: 'Assoreamento', t: 'select', opts: SN, half: true },
      { p: 'caracteristicas.obstrucao', label: 'Obstrução', t: 'select', opts: SN, half: true },
      { p: 'caracteristicas.agua', label: 'Presença de água', t: 'select', opts: SN, half: true },
      { p: 'caracteristicas.vegetacao', label: 'Vegetação', t: 'select', opts: SN, half: true },
      { h: 'Entrada, saída e fluxo' },
      { p: 'caracteristicas.tipoEntrada', label: 'Tipo de entrada', t: 'select', opts: BOCA },
      { p: 'caracteristicas.tipoSaida', label: 'Tipo de saída', t: 'select', opts: BOCA },
      { p: 'caracteristicas.sentidoFluxo', label: 'Sentido do fluxo', ph: 'ex.: Norte → Sul' },
      { p: 'caracteristicas.observacoes', label: 'Observações', t: 'textarea' },
    ],
    4: [
      { p: 'medicoes.larguraPista', label: 'Largura da pista', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.larguraAcostamento', label: 'Largura do acostamento', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.alturaEntrada', label: 'Altura da entrada', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.larguraEntrada', label: 'Largura da entrada', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.alturaSaida', label: 'Altura da saída', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.larguraSaida', label: 'Largura da saída', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.profMontante', label: 'Profundidade de montante', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.profJusante', label: 'Profundidade de jusante', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.comprimentoBueiro', label: 'Comprimento do bueiro', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.declividade', label: 'Declividade aprox.', t: 'num', unit: '%', neg: true },
      { p: 'medicoes.cotaEntrada', label: 'Cota de entrada', t: 'num', unit: 'm', neg: true },
      { p: 'medicoes.cotaSaida', label: 'Cota de saída', t: 'num', unit: 'm', neg: true },
      { p: 'medicoes.nivelAgua', label: 'Nível da água', t: 'num', unit: 'm', min: 0 },
      { p: 'medicoes.vazaoEstimada', label: 'Vazão estimada', t: 'num', unit: 'm³/s', min: 0 },
      { p: 'medicoes.observacoes', label: 'Observações de campo', t: 'textarea' },
    ],
  };

  function novoLevantamento() {
    const agora = U.agoraISO();
    return {
      versaoSchema: SCHEMA, id: U.uid(), status: 'rascunho',
      origem: 'campo', cadastroId: '', cadastro: null, coordOrigem: null,
      codigo: '', estrada: '', municipio: '', estado: '', km: '', ambiente: '', sentido: '', pistaGe: '', lado: '', data: U.hojeISO(), hora: U.horaAgora(),
      responsavel: '', equipe: '', observacoes: '',
      latitude: null, longitude: null, precisaoGps: null, altitude: null, gpsCapturadoEm: null, fuso: null,
      caracteristicas: {
        tipo: '', formato: '', linhas: null, celulas: null, material: '', diametro: null, largura: null, altura: null, comprimento: null, espessura: null, larguraTopo: null,
        situacaoEstrutural: '', conservacao: '', erosao: '', assoreamento: '', obstrucao: '', agua: '', vegetacao: '',
        tipoEntrada: '', tipoSaida: '', sentidoFluxo: '', observacoes: '', necessita: '',
      },
      medicoes: {
        larguraPista: null, larguraAcostamento: null, alturaEntrada: null, larguraEntrada: null, alturaSaida: null, larguraSaida: null,
        profMontante: null, profJusante: null, comprimentoBueiro: null, declividade: null, cotaEntrada: null, cotaSaida: null,
        nivelAgua: null, vazaoEstimada: null, observacoes: '',
      },
      secao: null, pontos: [], fotos: [],
      criadoEm: agora, atualizadoEm: agora,
    };
  }
  /* Completa registros antigos com campos que surgirem em fases futuras (compatibilidade). */
  function normalizar(r) {
    const b = novoLevantamento();
    return {
      ...b, ...r,
      caracteristicas: { ...b.caracteristicas, ...(r.caracteristicas || {}) },
      medicoes: { ...b.medicoes, ...(r.medicoes || {}) },
      pontos: r.pontos || [], fotos: r.fotos || [],
    };
  }

  /* =========================================================
     Estado
     ========================================================= */
  const S = {
    lista: [], q: '',
    cur: null, etapa: 1, persistido: false,
    dirty: false, rev: 0, timer: null, saveState: 'salvo',
    hashAtual: '#/', ignorar: false,
    filtro: 'todos', limite: 60, ultimoResp: null,
  };

  /* Ordem de trabalho: em andamento, depois os a vistoriar (na ordem do km), depois os concluídos. */
  const ORD = { rascunho: 0, a_vistoriar: 1, concluido: 2 };
  function ordenar(lista) {
    const cmp = (a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt', { numeric: true });
    return lista.slice().sort((a, b) => ((ORD[a.status] ?? 1) - (ORD[b.status] ?? 1))
      || (a.status === 'a_vistoriar' ? cmp(a, b) : String(b.atualizadoEm).localeCompare(String(a.atualizadoEm))));
  }
  /* Responsável: lembra o último nome usado neste aparelho para não digitar em cada bueiro. */
  async function prefillResponsavel(l) {
    if (l.responsavel) return;
    try { if (S.ultimoResp == null) S.ultimoResp = (await DB.cfgObter('ultimoResponsavel')) || ''; } catch (e) { S.ultimoResp = ''; }
    if (S.ultimoResp) l.responsavel = S.ultimoResp;
  }

  /* =========================================================
     Validação e pendências
     ========================================================= */
  function obrigatoriosFaltando(l) {
    const f = [];
    if (!String(l.codigo || '').trim()) f.push('código');
    if (!l.data) f.push('data');
    if (!String(l.responsavel || '').trim()) f.push('responsável');
    return f;
  }
  function pendencias(l) {
    const P = [];
    if (!String(l.codigo || '').trim()) P.push({ n: 'erro', t: 'Código do levantamento não preenchido', e: 1 });
    if (!l.data) P.push({ n: 'erro', t: 'Data não preenchida', e: 1 });
    if (!String(l.responsavel || '').trim()) P.push({ n: 'erro', t: 'Responsável não preenchido', e: 1 });
    if (l.latitude == null || l.longitude == null) P.push({ n: 'aviso', t: 'GPS não capturado (coordenadas não informadas)', e: 2 });
    else if (l.coordOrigem === 'cadastro') P.push({ n: 'aviso', t: 'Coordenadas vêm do cadastro: confirme com o GPS no local', e: 2 });
    if (!l.caracteristicas.tipo) P.push({ n: 'aviso', t: 'Tipo de bueiro não informado', e: 3 });
    if (l.medicoes.cotaEntrada == null) P.push({ n: 'aviso', t: 'Cota de entrada não preenchida', e: 4 });
    if (!l.secao || !l.secao.salvoEm) P.push({ n: 'aviso', t: 'Seção ainda não desenhada', e: 5 });
    if (!l.pontos.length) P.push({ n: 'aviso', t: 'Nenhum ponto cadastrado', e: 6 });
    if (!l.fotos.length) P.push({ n: 'aviso', t: 'Nenhuma foto adicionada', e: 7 });
    return P;
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
    if (S.cur && S.cur.status === 'a_vistoriar') S.cur.status = 'rascunho'; // começou a vistoria
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
  function viewHome() {
    const n = S.lista.length;
    const feitos = S.lista.filter(l => l.status !== 'a_vistoriar'), aVist = n - feitos.length;
    const ultimaData = feitos.map(l => l.data).filter(Boolean).sort().pop();
    const alvo = S.lista.find(l => l.status === 'rascunho') || S.lista.find(l => l.status === 'concluido') || ordenar(S.lista)[0];
    const proximo = !S.lista.some(l => l.status === 'rascunho') && aVist;
    $('#view').innerHTML = `
      <section class="page">
        <div class="card hero">
          <h1>Cadastro de Bueiros</h1>
          <p class="muted">Levantamento de campo. Funciona sem internet; os dados ficam neste aparelho.</p>
          <div class="stats">
            <div><b>${aVist ? feitos.length + ' / ' + n : n}</b><span>${aVist ? `vistoriados (${aVist} a vistoriar)` : (n === 1 ? 'levantamento salvo' : 'levantamentos salvos')}</span></div>
            <div><b>${ultimaData ? esc(U.dataBR(ultimaData)) : '—'}</b><span>último levantamento</span></div>
          </div>
        </div>
        <div class="menu">
          <button type="button" class="btn big primary" data-go="#/novo">+ Novo levantamento</button>
          <button type="button" class="btn big" data-a="continuar" ${alvo ? `data-id="${esc(alvo.id)}"` : 'disabled'}>${proximo ? 'Próximo bueiro a vistoriar' : 'Continuar levantamento'}
            <small>${alvo ? esc(alvo.codigo || 'Sem código') : 'nenhum levantamento ainda'}</small></button>
          <button type="button" class="btn big" data-go="#/lista">Projetos salvos</button>
          <button type="button" class="btn big" data-a="importar-kmz">Importar cadastro (KMZ/KML) <small>carrega os bueiros do arquivo do cadastro</small></button>
          <button type="button" class="btn big" data-a="importar-home">Importar arquivo TXT <small>cria um levantamento com os pontos do RTK</small></button>
          <button type="button" class="btn big" data-a="backup" ${n ? '' : 'disabled'}>Exportar dados <small>backup completo em JSON, com fotos</small></button>
          <button type="button" class="btn big" data-a="restaurar">Restaurar backup <small>volta os levantamentos de um JSON</small></button>
          ${S.instalar ? '<button type="button" class="btn big primary" data-a="instalar">Instalar app no celular</button>' : ''}
        </div>
      </section>`;
  }

  /* =========================================================
     Renderização — Lista
     ========================================================= */
  function resumoTecnico(l) {
    const c = l.caracteristicas, N = U.numTxt;
    const dim = c.diametro != null ? `Ø ${N(c.diametro)} m` : (c.largura != null && c.altura != null ? `${N(c.largura)} × ${N(c.altura)} m` : '');
    const n = (c.linhas > 1) ? `${c.linhas} linhas` : '';
    return [c.tipo, c.material, n, dim].filter(Boolean).join(' · ');
  }
  function cartaoLista(l) {
    const local = [l.km && 'km ' + l.km, l.municipio ? l.municipio + (l.estado ? '/' + l.estado : '') : '', !l.km && l.estrada].filter(Boolean).join(' · ') || 'Local não informado';
    const [rot, cls] = STATUS[l.status] || STATUS.rascunho, av = l.status === 'a_vistoriar', tec = resumoTecnico(l);
    const nav = (l.latitude != null && l.longitude != null)
      ? `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}&travelmode=driving">Navegar</a>` : '';
    return `<article class="card lev" data-id="${esc(l.id)}">
      <div class="lev-top"><b>${esc(l.codigo || 'Sem código')}</b><span class="chip ${cls}">${rot}</span></div>
      <div>${esc(local)}</div>
      ${tec ? `<div class="muted small">${esc(tec)}</div>` : ''}
      <div class="muted small">${av ? esc(l.observacoes ? l.observacoes.split('\n')[0] : 'Ainda não vistoriado') : `${esc(U.dataBR(l.data))} · ${esc(l.responsavel || 'sem responsável')} · atualizado ${esc(U.dataHoraBR(l.atualizadoEm))}`}</div>
      <div class="row">
        <button type="button" class="btn primary" data-a="abrir">${av ? 'Vistoriar' : 'Abrir'}</button>${nav}
      </div>
      <div class="row"><button type="button" class="btn sm" data-a="duplicar">Duplicar</button><button type="button" class="btn sm danger" data-a="excluir">Excluir</button></div></article>`;
  }
  function listaFiltrada() {
    const q = S.q.trim().toLowerCase();
    let l = S.filtro === 'todos' ? S.lista : S.lista.filter(x => x.status === S.filtro);
    if (q) l = l.filter(x => [x.codigo, x.estrada, x.municipio, x.responsavel, x.km, x.cadastroId].join(' ').toLowerCase().includes(q));
    return ordenar(l);
  }
  function itensLista() {
    if (!S.lista.length) return '<div class="card vazio">Nenhum levantamento salvo ainda.<br><button type="button" class="btn primary" data-go="#/novo">+ Novo levantamento</button><button type="button" class="btn" data-a="importar-kmz">Importar cadastro (KMZ/KML)</button></div>';
    const l = listaFiltrada();
    if (!l.length) return '<div class="card vazio">Nada encontrado para esse filtro ou busca.</div>';
    return `<div class="muted small">${l.length} bueiro(s)</div>` + l.slice(0, S.limite).map(cartaoLista).join('')
      + (l.length > S.limite ? `<button type="button" class="btn" data-a="mais-lista">Mostrar mais (${l.length - S.limite})</button>` : '');
  }
  function viewLista() {
    const cont = { todos: S.lista.length }; for (const k in STATUS) cont[k] = S.lista.filter(x => x.status === k).length;
    const chips = [['todos', 'Todos'], ['a_vistoriar', 'A vistoriar'], ['rascunho', 'Rascunho'], ['concluido', 'Concluído']]
      .map(([k, t]) => `<button type="button" class="fchip" data-a="filtro" data-v="${k}" aria-pressed="${S.filtro === k}">${t} <span>${cont[k]}</span></button>`).join('');
    $('#view').innerHTML = `
      <section class="page">
        <div class="page-head"><h1>Projetos salvos</h1><button type="button" class="btn primary" data-go="#/novo">+ Novo</button></div>
        <div class="filtros" role="group" aria-label="Filtrar por situação">${chips}</div>
        <input id="busca" class="busca" type="search" placeholder="Buscar por código, km, município…" value="${esc(S.q)}" aria-label="Buscar">
        <div id="itens">${itensLista()}</div>
        <button type="button" class="btn" data-go="#/">‹ Início</button>
      </section>`;
  }
  function verLista(filtro) { S.filtro = filtro || 'todos'; S.limite = 60; S.q = ''; if (location.hash === '#/lista') rotear(); else location.hash = '#/lista'; }

  /* =========================================================
     Renderização — Formulário em etapas
     ========================================================= */
  function campoHTML(c) {
    const v = U.getPath(S.cur, c.p), id = 'f-' + c.p.replace(/\./g, '-'), t = c.t || 'text';
    const lab = `<label for="${id}">${esc(c.label)}${c.req ? ' <span class="req" title="Obrigatório">*</span>' : ''}</label>`;
    let ctl;
    if (t === 'select') {
      ctl = `<select id="${id}" data-p="${c.p}"><option value="">—</option>${c.opts.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
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
    const coord = (l.latitude != null && l.longitude != null) ? `${N(l.latitude)}, ${N(l.longitude)}${l.precisaoGps != null ? ` (±${N(l.precisaoGps)} m)` : ''}` : '';
    return `
      <div class="card"><h3>Identificação</h3>
        ${linha('Código', l.codigo)}${linha('Local', [l.estrada, l.municipio ? l.municipio + (l.estado ? '/' + l.estado : '') : ''].filter(Boolean).join(' · '))}
        ${linha('Data e hora', [U.dataBR(l.data), l.hora].filter(Boolean).join(' '))}${linha('Responsável', l.responsavel)}${linha('Equipe', l.equipe)}</div>
      <div class="card"><h3>Localização</h3>${linha('Coordenadas', coord)}${linha('Altitude', l.altitude != null ? N(l.altitude) + ' m' : '')}</div>
      <div class="card"><h3>Bueiro</h3>
        ${linha('Tipo / formato', [c.tipo, c.formato].filter(Boolean).join(' / '))}${linha('Dimensões', dim)}${linha('Material', c.material)}
        ${linha('Conservação', c.conservacao)}${linha('Cota entrada / saída', (m.cotaEntrada != null || m.cotaSaida != null) ? `${N(m.cotaEntrada) || '—'} / ${N(m.cotaSaida) || '—'}` : '')}
        ${BU.Secao.miniatura(l)}</div>
      <div class="card"><h3>Registros</h3>${linha('Pontos', String(l.pontos.length))}${linha('Fotos', String(l.fotos.length))}</div>
      <div class="card"><h3>Pendências <span class="chip ${P.length ? 'rascunho' : 'concluido'}">${P.length || 'nenhuma'}</span></h3>
        ${P.length ? P.map(p => `<div class="pend ${p.n}"><span>${p.n === 'erro' ? '⛔' : '⚠️'} ${esc(p.t)}</span><button type="button" class="btn sm" data-etapa="${p.e}">Ir</button></div>`).join('') : '<p class="muted">Tudo preenchido.</p>'}
        <p class="muted small">Pendências são avisos: você pode salvar mesmo assim.</p></div>
      ${BU.Export.painelHTML()}
      <button type="button" class="btn" data-etapa="1">Editar</button>`;
  }

  function renderWizard() {
    const l = S.cur, n = S.etapa, et = ETAPAS[n - 1];
    let corpo;
    if (n === 2) corpo = BU.GPS.cartaoHTML(l) + `<div class="card"><h3>Coordenadas (graus decimais)</h3>${camposHTML(CAMPOS[2])}</div>`;
    else if (CAMPOS[n]) corpo = `<div class="card">${camposHTML(CAMPOS[n])}</div>` + (n === 1 ? cadastroHTML(l) : '');
    else if (n === 5) corpo = BU.Secao.etapaHTML(l);
    else if (n === 6) corpo = BU.Pontos.etapaHTML(l);
    else if (n === 7) corpo = BU.Fotos.etapaHTML(l);
    else corpo = revisaoHTML();
    if (n !== 7) BU.Fotos.limpar();

    $('#view').innerHTML = `
      <section class="page wiz">
        <div class="resumo">
          <div class="r-txt"><b id="r-cod">${esc(l.codigo || 'Novo levantamento')}</b><span id="r-sub">${esc(resumoTxt())}</span></div>
          <span id="save-state" class="chip save ${S.saveState}">${SAVE_TXT[S.saveState]}</span>
        </div>
        <nav class="steps" aria-label="Etapas">${ETAPAS.map(e => `<button type="button" class="seg${e.n === n ? ' atual' : ''}${e.n < n ? ' feito' : ''}" data-etapa="${e.n}" aria-label="Etapa ${e.n}: ${e.nome}"${e.n === n ? ' aria-current="step"' : ''}><span></span></button>`).join('')}</nav>
        <div class="step-title"><span>Etapa ${n} de 8</span><h1>${esc(et.nome)}</h1></div>
        ${corpo}
      </section>`;

    if (n === 7) BU.Fotos.aposRender();
    const bar = $('#actionbar'); bar.hidden = false;
    bar.innerHTML = n < 8
      ? `<button type="button" class="btn" data-a="voltar">‹ Voltar</button><button type="button" class="btn" data-a="salvar">Salvar</button><button type="button" class="btn primary" data-a="proximo">Próximo ›</button>`
      : `<button type="button" class="btn" data-a="voltar">‹ Voltar</button><button type="button" class="btn primary grow" data-a="concluir">Salvar levantamento</button>`;
  }

  /* =========================================================
     Eventos
     ========================================================= */
  function aoEditar(e) {
    const el = e.target;
    if (!S.cur || !el.dataset || !el.dataset.p) return;
    const t = el.dataset.t;
    let val = el.value;
    if (t === 'num' || t === 'int') {
      const r = validarNumero(el); mostrarErro(el, r.erro); val = r.val;
    }
    U.setPath(S.cur, el.dataset.p, val);
    if (el.dataset.p === 'latitude' || el.dataset.p === 'longitude') S.cur.coordOrigem = 'manual';
    marcarSujo();
    if (S.etapa === 5) { if (el.dataset.p === 'caracteristicas.formato') { if (e.type === 'change') renderWizard(); } else BU.Secao.redesenhar(); }
    if (['codigo', 'estrada', 'municipio'].includes(el.dataset.p)) {
      $('#r-cod').textContent = S.cur.codigo || 'Novo levantamento'; $('#r-sub').textContent = resumoTxt();
    }
  }

  function irEtapa(n) { location.hash = `#/lev/${S.cur.id}/${n}`; }

  async function duplicar(id) {
    const o = await DB.obter(id); if (!o) return;
    const c = U.clone(normalizar(o));
    c.id = U.uid(); c.codigo = (o.codigo || 'Sem código') + ' (cópia)'; c.status = 'rascunho';
    c.criadoEm = c.atualizadoEm = U.agoraISO();
    const fotos = [];
    for (const f of c.fotos) { // copia também o arquivo de cada foto, com novo id
      const r = await DB.obterFoto(f.id); if (!r) continue;
      const nid = U.uid(); await DB.salvarFoto({ ...r, id: nid, levantamentoId: c.id }); fotos.push({ ...f, id: nid });
    }
    c.fotos = fotos;
    await DB.salvar(c);
    S.lista = await DB.listar(); viewLista(); UI.toast('Levantamento duplicado');
  }
  async function excluir(id) {
    const l = S.lista.find(x => x.id === id);
    const ok = await UI.confirmar(`Excluir o levantamento “${(l && l.codigo) || 'Sem código'}”? Esta ação não pode ser desfeita.`, { titulo: 'Excluir levantamento', ok: 'Excluir', perigo: true });
    if (!ok) return;
    try { await DB.excluir(id); } catch (err) { UI.toast('Erro ao excluir: ' + err.message, 'erro'); return; }
    S.lista = await DB.listar(); viewLista(); UI.toast('Levantamento excluído');
  }
  const backup = () => BU.Export.backupTudo();
  async function concluir() {
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
    if (a === 'continuar' || a === 'abrir') location.hash = `#/lev/${id}/1`;
    else if (a === 'duplicar') duplicar(id);
    else if (a === 'excluir') excluir(id);
    else if (a === 'backup') backup();
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
  });
  document.addEventListener('input', e => { if (e.target.id === 'busca') { S.q = e.target.value; S.limite = 60; $('#itens').innerHTML = itensLista(); } });

  /* =========================================================
     Rotas
     ========================================================= */
  async function rotear() {
    if (S.ignorar) { S.ignorar = false; return; }
    const h = location.hash || '#/';
    // Sempre grava o que estiver pendente antes de trocar de tela.
    if (S.cur && S.dirty && !(await salvarAtual())) { S.ignorar = true; location.hash = S.hashAtual; return; }
    window.scrollTo(0, 0);
    const bar = $('#actionbar');

    const m = h.match(/^#\/lev\/([^/]+)\/(\d)$/);
    if (h === '#/novo') {
      S.cur = novoLevantamento(); await prefillResponsavel(S.cur); S.persistido = false; S.dirty = false; S.saveState = 'salvo';
      location.replace(`#/lev/${S.cur.id}/1`); return;
    }
    if (m) {
      const id = m[1], n = Math.min(8, Math.max(1, +m[2]));
      if (!S.cur || S.cur.id !== id) {
        const r = await DB.obter(id);
        if (!r) { UI.toast('Levantamento não encontrado', 'erro'); location.replace('#/lista'); return; }
        S.cur = normalizar(r); S.persistido = true; S.dirty = false; S.saveState = 'salvo';
        // Bueiro vindo do cadastro: data, hora e responsável entram na hora de vistoriar (só gravam quando você editar ou salvar).
        if (!S.cur.data) { S.cur.data = U.hojeISO(); S.cur.hora = U.horaAgora(); }
        await prefillResponsavel(S.cur);
      }
      S.etapa = n; renderWizard(); S.hashAtual = h; return;
    }
    // Telas fora do formulário
    S.cur = null; bar.hidden = true; bar.innerHTML = '';
    S.lista = await DB.listar();
    if (h === '#/lista') viewLista(); else viewHome();
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
    await BU.Pontos.iniciar();
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
    cur: () => S.cur, marcarSujo, salvarAtual, campoHTML, novo: novoLevantamento, normalizar, pendencias, CAMPOS, OPCOES, UFS, verLista,
    irParaLista: () => { location.hash = '#/lista'; if (S.hashAtual === '#/lista') rotear(); },
    renderEtapa: () => { if (S.cur) renderWizard(); },
  };
  iniciar();
})();
