/* formulario.js — etapas do formulário do bueiro: Informação geral, Coordenadas, Corpo, Dispositivos associados e Diagnóstico.
   (Boca de montante/jusante estão em bocas.js; Patologias em patologias.js; Fotos em photos.js.) Expõe BU.Form. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, esc = U.esc, Cat = BU.Cat, M = BU.Modelo;

  /* ---------- ícones ilustrativos (traço simples, 32×32) ---------- */
  const ic = s => `<svg class="ico" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${s}</svg>`;
  const ICONES = {
    caixa_coletora: ic('<rect x="6" y="9" width="20" height="16" rx="1"/><path d="M6 14h20M12 25v-6h8v6"/>'),
    descida_agua: ic('<path d="M4 6h6v6h6v6h6v6h6M4 6v20h24"/><path d="M8 20c2 2 4-2 6 0"/>'),
    valeta_montante: ic('<path d="M4 10l8 14h8l8-14"/><path d="M10 18c2 2 4-2 6 0s4-2 6 0"/>'),
    canal_jusante: ic('<path d="M3 12h26M3 12v10h26V12"/><path d="M8 17h5l-2-2m2 2l-2 2M19 17h5l-2-2m2 2l-2 2"/>'),
    sarjeta: ic('<path d="M3 22h26M3 22v-7l8-3h18"/><path d="M8 26c2 2 4-2 6 0s4-2 6 0"/>'),
    entrada_agua: ic('<path d="M16 4c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/><path d="M6 28h20"/>'),
    desobstrucao: ic('<rect x="3" y="11" width="26" height="10" rx="5"/><path d="M10 14l5 4m0-4l-5 4M20 14l4 4m0-4l-4 4"/>'),
    limpeza: ic('<path d="M22 4l-7 12M9 18l6-2 8 6-3 7H8z"/><path d="M12 22l-1 5M17 24l-1 4"/>'),
    rocada: ic('<path d="M6 28c0-8 2-14 4-20 1 7 2 12 2 20M14 28c0-6 2-12 5-18 0 6 0 12-1 18M22 28c0-7 1-11 4-16"/>'),
    tampa: ic('<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="6"/><path d="M5 16h22M16 5v22"/>'),
    bocas_alas: ic('<path d="M4 8v18h24V8"/><path d="M4 8l-0 0M10 26V14h12v12"/><path d="M4 8h5M23 8h5"/>'),
    estrutural: ic('<rect x="4" y="6" width="24" height="20" rx="2"/><path d="M14 6l-3 7 5 3-3 10"/>'),
    dissipador: ic('<path d="M4 8h6v5h6v5h6v5h6M4 8v18h24"/><path d="M20 27l2-3 2 3"/>'),
    prolongamento: ic('<rect x="3" y="12" width="14" height="8" rx="2"/><path d="M20 16h9M25 12l4 4-4 4"/>'),
    substituicao: ic('<path d="M5 12h20l-4-4M27 20H7l4 4"/>'),
    hidraulico: ic('<path d="M4 24h24M4 24V8"/><path d="M8 20c3-2 4-8 8-8s4 6 8 4"/>'),
  };

  /* ---------- pequenos componentes ---------- */
  const chipsHTML = (p, lista, v, extra = '') => `<div class="chips" role="group">${lista.map(o => { const [val, rot] = Array.isArray(o) ? o : [o, o];
    return `<button type="button" class="fchip${String(val) === String(v) ? ' on' : ''}" data-fm="set" data-p="${esc(p)}" data-v="${esc(val)}" aria-pressed="${String(val) === String(v)}"${extra}>${esc(rot)}</button>`; }).join('')}</div>`;
  const campo = c => BU.App.campoHTML(c);
  const grade = lista => `<div class="grid">${lista.map(campo).join('')}</div>`;

  /* ============================================================ 1. Informação geral */
  function nomeLogado() { try { return BU.Sync.nomeUsuario(); } catch (e) { return ''; } }
  function geralHTML(l) {
    const c = l.caracteristicas, sigla = M && Cat.siglaDe(c), desc = Cat.descricaoDe(c), logado = nomeLogado();
    const vist = logado
      ? `<div class="f"><label>Vistoriador</label><div class="ro">${esc(l.responsavel || logado)}</div></div>`
      : campo({ p: 'responsavel', label: 'Vistoriador', req: true, t: 'resp' });
    const R = M.RTK_PROJETO, f3 = v => String(v).replace('.', ',');
    return `<div class="card"><h3>Identificação</h3><div class="grid">
        ${campo({ p: 'codigo', label: 'Código (nome no cadastro)', req: true, ph: 'ex.: BU 101 RJ 001+470 N 1', t: 'codigo' })}
        <div class="f"><label>Situação no cadastro</label>${chipsHTML('situacao', Cat.SITUACAO, l.situacao)}</div>
        <div class="f"><label>Classificação <span class="req">*</span></label>${chipsHTML('classificacao', Cat.CLASSIFICACAO, l.classificacao)}</div>
        ${vist}
        <div class="f half"><label>Data da vistoria</label><div class="ro">${esc(U.dataBR(l.data) || U.dataBR(U.hojeISO()))}</div></div>
        <div class="f half"><label>Hora</label><div class="ro">${esc(l.hora || U.horaAgora())}</div></div></div>
        <p class="muted small" style="margin:4px 0 0">A data é sempre a de hoje e o vistoriador é quem está com a conta aberta.</p></div>
      <div class="card"><h3>Tipo de bueiro ${sigla ? `<span class="chip concluido">${esc(sigla)}</span>` : ''}</h3>
        <div class="f"><label>Nº de linhas <span class="req">*</span></label>${chipsHTML('caracteristicas.celulas', Cat.LINHAS, c.celulas)}</div>
        <div class="f"><label>Forma <span class="req">*</span></label>${chipsHTML('caracteristicas.tipo', Cat.FORMAS, c.tipo)}</div>
        <div class="f"><label>Material <span class="req">*</span></label>${chipsHTML('caracteristicas.material', Cat.MATERIAIS, c.material)}</div>
        <p class="${desc ? 'ok-txt' : 'muted'} small" style="margin:8px 0 0">${desc ? `<b>${esc(sigla)}</b> · ${esc(desc)}` : 'Escolha linhas, forma e material para ver o tipo (ex.: BSCC = Bueiro Simples Celular de Concreto).'}</p></div>
      <div class="card"><h3>Localização na rodovia</h3>${grade([
        { p: 'estrada', label: 'Rodovia', ph: 'ex.: BR-101' }, { p: 'municipio', label: 'Município' },
        { p: 'estado', label: 'UF', t: 'select', opts: M.UFS, half: true }, { p: 'km', label: 'Km + metros', ph: '001+470', half: true },
        { p: 'ambiente', label: 'Ambiente', t: 'select', opts: M.OPCOES.ambiente, half: true }, { p: 'sentido', label: 'Sentido do km', t: 'select', opts: M.OPCOES.sentido, half: true },
        { p: 'pistaGe', label: 'Pista (sentido geográfico)', t: 'select', opts: M.OPCOES.pista, half: true }, { p: 'lado', label: 'Lado da rodovia', t: 'select', opts: M.OPCOES.lado, half: true },
        { p: 'equipe', label: 'Empresa ou equipe', ph: 'GFA' }])}</div>
      <div class="card"><h3>RTK do projeto <span class="chip concluido">fixo</span></h3>
        <p class="small" style="margin:0 0 10px">Solução <b>${esc(R.solucao)}</b> · <b>${R.satelites}</b> satélites · precisão <b>${f3(R.precisaoH)} m</b> (horizontal) e <b>${f3(R.precisaoV)} m</b> (vertical) · altitude ${esc(R.tipoAltitude.toLowerCase())} · modelo geoidal <b>${esc(R.geoide)}</b> · base ${esc(R.base)} · receptor ${esc(R.receptor)}.</p>
        ${campo({ p: 'rtk.alturaAntena', label: 'Altura da antena', t: 'num', unit: 'm', min: 0 })}
        <p class="muted small" style="margin:6px 0 0">Esses dados valem para todos os bueiros do projeto. Só a altura da antena é preenchida por você.</p></div>
      <div class="card"><div class="f"><label for="f-observacoes">Observações gerais</label><textarea id="f-observacoes" data-p="observacoes" rows="3">${esc(l.observacoes || '')}</textarea></div></div>`;
  }

  /* ============================================================ 3. Corpo */
  function corpoCampos(l) {
    const c = l.caracteristicas, tub = c.tipo === 'Tubular';
    const dims = tub ? [{ p: 'caracteristicas.diametro', label: 'Diâmetro interno na montante', t: 'num', unit: 'm', min: 0, req: true }]
      : [{ p: 'caracteristicas.largura', label: 'Base na montante', t: 'num', unit: 'm', min: 0, req: true }, { p: 'caracteristicas.altura', label: 'Altura na montante', t: 'num', unit: 'm', min: 0, req: true }];
    return dims;
  }
  function corpoHTML(l) {
    const c = l.caracteristicas, m = l.medicoes, tub = c.tipo === 'Tubular';
    const semTipo = !c.tipo ? '<div class="pend aviso" style="display:block">Escolha primeiro o <b>tipo de bueiro</b> na etapa Informação geral (linhas, forma e material).</div>' : '';
    return `${semTipo}<div class="card"><h3>Corpo (tubo ou galeria) ${c.tipo ? `<span class="chip">${esc(Cat.siglaDe(c) || c.tipo)}</span>` : ''}</h3>
        ${grade(corpoCampos(l))}
        <label class="chk" style="margin-top:6px"><input type="checkbox" data-fm="mesma" ${c.mesmaSecaoJusante !== false ? 'checked' : ''}> Mesma seção na jusante</label>
        ${c.mesmaSecaoJusante === false ? grade(tub ? [{ p: 'medicoes.larguraSaida', label: 'Diâmetro na jusante', t: 'num', unit: 'm', min: 0 }]
          : [{ p: 'medicoes.larguraSaida', label: 'Base na jusante', t: 'num', unit: 'm', min: 0 }, { p: 'medicoes.alturaSaida', label: 'Altura na jusante', t: 'num', unit: 'm', min: 0 }]) : ''}
        <div class="f"><label>Estado do corpo</label>${chipsHTML('caracteristicas.estadoCorpo', Cat.ESTADOS, c.estadoCorpo)}</div>
        <div class="f"><label for="f-obstr">Obstrução da seção: <b id="obstr-v">${+c.obstrucaoPct || 0}%</b></label><input id="f-obstr" type="range" min="0" max="100" step="5" value="${+c.obstrucaoPct || 0}" data-fm="obstr"></div></div>
      <details class="card auto"><summary><b>Medidas calculadas</b> <span class="muted small">automáticas, sem preencher</span></summary>
        ${[['Comprimento', m.comprimentoBueiro, 'm'], ['Declividade', m.declividade, '%'], ['Esconsidade', m.esconsidade, '°'], ['Recobrimento (aterro)', m.recobrimento, 'm']].map(([r, v, u]) => `<div class="kv"><span>${r}</span><b>${v != null && v !== '' ? esc(U.numTxt(v)) + ' ' + u : '—'}</b></div>`).join('')}
        <p class="muted small" style="margin:6px 0 0">Calculadas pelas cotas e coordenadas dos pontos de montante e jusante (etapa Levantamento RTK). Aparecem aqui depois de importar os pontos.</p></details>
      ${BU.Secao.croquiHTML(l)}${BU.Fotos.blocoHTML(l, 'secao', 'Fotos da seção', { entradas: true })}`;
  }
  function medirEntreBocas(l) {
    const a = l.bocas.montante, b = l.bocas.jusante;
    let d = null;
    if (a.leste != null && b.leste != null && a.zona === b.zona) d = Math.hypot(a.leste - b.leste, a.norte - b.norte);
    if (d == null) { const m = (() => { try { return BU.Prancha.modelo(l); } catch (e) { return null; } })(); if (m) d = m.L; }
    return d;
  }

  /* ============================================================ 7. Dispositivos associados */
  function dispositivosHTML(l) {
    const marc = Cat.DISPOSITIVOS.filter(([k]) => l.dispositivos[k]);
    return `<div class="card"><h3>Dispositivos associados <span class="chip ${marc.length ? 'concluido' : ''}">${marc.length || 'nenhum'}</span></h3>
        <p class="muted small" style="margin:0 0 8px">Marque o que existe no local. Para cada dispositivo marcado, tire a foto.</p>
        <div class="icogrid">${Cat.DISPOSITIVOS.map(([k, r]) => `<button type="button" class="icobtn${l.dispositivos[k] ? ' on' : ''}" data-fm="disp" data-k="${k}" aria-pressed="${!!l.dispositivos[k]}">${ICONES[k] || ''}<span>${esc(r)}</span>${l.dispositivos[k] ? `<i class="cam${l.fotos.some(f => f.ctx === 'disp:' + k) ? ' ok' : ''}">📷</i>` : ''}</button>`).join('')}</div></div>
      ${marc.map(([k, r]) => BU.Fotos.blocoHTML(l, 'disp:' + k, 'Foto · ' + r)).join('')}
      ${BU.Fotos.entradasHTML()}`;
  }

  /* ============================================================ 9. Diagnóstico */
  const GRAVES = ['colapso', 'ruptura', 'piping', 'recalque', 'agua_pista'];
  function conservacaoSugerida(l) {
    const v = [l.caracteristicas.estadoCorpo, l.bocas.montante.estado, l.bocas.jusante.estado].filter(Boolean), pior = { Bom: 0, Regular: 1, Precário: 2 };
    if (!v.length) return '';
    return v.reduce((a, b) => (pior[b] > pior[a] ? b : a));
  }
  function prioridadeSugerida(l) {
    const c = l.caracteristicas, d = l.diagnostico, cons = c.conservacao || conservacaoSugerida(l);
    let p = { Bom: 0, Regular: 2, Precário: 5 }[cons] || 0;
    const ob = +c.obstrucaoPct || 0; p += ob >= 75 ? 4 : ob >= 50 ? 3 : ob >= 25 ? 1 : 0;
    const pats = l.semPatologias ? [] : (l.patologias || []);
    if (pats.some(x => x.id === 'colapso')) return 'Urgente';
    p += Math.min(5, pats.reduce((s, x) => s + (GRAVES.includes(x.id) ? 3 : 1), 0));
    (d.necessita || []).forEach(k => { p += ['estrutural', 'substituicao', 'prolongamento'].includes(k) ? 2 : 1; });
    return p >= 9 ? 'Urgente' : p >= 6 ? 'Alta' : p >= 3 ? 'Média' : 'Baixa';
  }
  function prioridadeDe(l) { const d = l.diagnostico; return d.prioridadeManual && d.prioridade ? d.prioridade : prioridadeSugerida(l); }
  function textoObs(l) { const d = l.diagnostico; return [...(d.obsPadrao || []), d.obs, ...(d.obs2Padrao || []), d.obs2].map(x => String(x || '').trim()).filter(Boolean).join(' '); }
  function sincDiag(l) {
    const d = l.diagnostico, c = l.caracteristicas;
    c.necessita = (d.necessita || []).map(k => Cat.rotulo(Cat.NECESSITA, k)).join(', ');
    l.observacoes = textoObs(l) || l.observacoes || '';
    d.prioridade = prioridadeDe(l);
  }
  const marcaOpc = (lista, sel, tipo) => `<div class="checks">${lista.map(t => `<label class="chk"><input type="checkbox" data-fm="${tipo}" data-v="${esc(t)}" ${sel.includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>`;
  function diagnosticoHTML(l) {
    const c = l.caracteristicas, d = l.diagnostico, sug = conservacaoSugerida(l), pr = prioridadeDe(l), nec = d.necessita || [];
    const corP = { Baixa: 'baixa', Média: 'media', Alta: 'alta', Urgente: 'urgente' }[pr] || 'baixa';
    return `<div class="card"><h3>Diagnóstico</h3>
        <div class="f"><label>Estado de conservação <span class="req">*</span></label>${chipsHTML('caracteristicas.conservacao', Cat.ESTADOS, c.conservacao)}
          <p class="muted small" style="margin:6px 0 0">${sug ? `Sugestão pelo corpo e pelas bocas: <b>${esc(sug)}</b>${c.conservacao ? '' : ' (toque para aceitar)'}.` : 'Classifique o corpo e as bocas para ter uma sugestão.'}</p>
          ${sug && !c.conservacao ? `<button type="button" class="btn sm" data-fm="aceitar-cons" data-v="${esc(sug)}">Usar ${esc(sug)}</button>` : ''}</div>
        <div class="f"><label>Necessita</label><p class="muted small" style="margin:0 0 6px">Cada serviço marcado pede uma foto do que precisa ser feito.</p>
          <div class="icogrid">${Cat.NECESSITA.map(([k, r]) => `<button type="button" class="icobtn${nec.includes(k) ? ' on' : ''}" data-fm="nec" data-k="${k}" aria-pressed="${nec.includes(k)}">${ICONES[k] || ''}<span>${esc(r)}</span>${nec.includes(k) ? `<i class="cam${l.fotos.some(f => f.ctx === 'diag:' + k) ? ' ok' : ''}">📷</i>` : ''}</button>`).join('')}</div></div></div>
      ${nec.map(k => BU.Fotos.blocoHTML(l, 'diag:' + k, 'Foto · ' + Cat.rotulo(Cat.NECESSITA, k))).join('')}
      <div class="card"><h3>Prioridade</h3>
        <div class="prio ${corP}"><b>${esc(pr)}</b><span>${d.prioridadeManual ? 'definida por você' : 'sugerida pelo app'}</span></div>
        <p class="muted small" style="margin:6px 0">Calculada por estado, obstrução, patologias e serviços necessários.</p>
        <div class="f"><label>Alterar prioridade</label>${chipsHTML('diagnostico.prioridadeEscolhida', Cat.PRIORIDADES, d.prioridadeManual ? d.prioridade : '')}</div>
        ${d.prioridadeManual ? '<button type="button" class="btn sm" data-fm="prio-auto">Voltar para a sugestão do app</button>' : ''}</div>
      <div class="card"><h3>Observação (local e acesso)</h3>${marcaOpc(Cat.OBS1, d.obsPadrao || [], 'obs1')}
        <div class="f"><label for="f-dobs">Texto livre</label><textarea id="f-dobs" data-fm="obs" rows="3" placeholder="Escreva o que for preciso.">${esc(d.obs || '')}</textarea></div></div>
      <div class="card"><h3>Observação 2 (funcionamento e técnica)</h3>${marcaOpc(Cat.OBS2, d.obs2Padrao || [], 'obs2')}
        <div class="f"><label for="f-dobs2">Texto livre</label><textarea id="f-dobs2" data-fm="obs2t" rows="3">${esc(d.obs2 || '')}</textarea></div></div>
      ${BU.Fotos.entradasHTML()}`;
  }

  /* ============================================================ eventos */
  function aposTipo(l) {
    const c = l.caracteristicas;
    c.formato = M.formatoDe(c.tipo);
    l.meta = l.meta || {}; l.meta.sigla = Cat.siglaDe(c); l.meta.descricaoTipo = Cat.descricaoDe(c);
    sincronizarSecao(l);
  }
  /* mesma seção na jusante: entrada e saída seguem a seção de montante */
  function sincronizarSecao(l) {
    const c = l.caracteristicas, m = l.medicoes, tub = c.tipo === 'Tubular';
    const W = tub ? c.diametro : c.largura, H = tub ? c.diametro : c.altura;
    if (W != null) m.larguraEntrada = W; if (H != null) m.alturaEntrada = H;
    if (c.mesmaSecaoJusante !== false) { m.larguraSaida = W != null ? W : m.larguraSaida; m.alturaSaida = H != null ? H : m.alturaSaida; }
  }
  const aposCampo = (l, p) => { if (/^caracteristicas\.(largura|altura|diametro)$/.test(p)) sincronizarSecao(l); if (p.startsWith('diagnostico.') || p === 'caracteristicas.conservacao') sincDiag(l); };

  async function aoClicar(e) {
    const b = e.target.closest('[data-fm]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'TEXTAREA') return;
    const App = BU.App, l = App.cur(); if (!l) return; const a = b.dataset.fm;
    let refaz = true;
    if (a === 'set') {
      const p = b.dataset.p; let v = b.dataset.v;
      if (p === 'caracteristicas.celulas') v = +v;
      if (p === 'diagnostico.prioridadeEscolhida') { l.diagnostico.prioridade = v; l.diagnostico.prioridadeManual = true; sincDiag(l); }
      else { const atual = U.getPath(l, p); U.setPath(l, p, String(atual) === String(v) && p !== 'caracteristicas.celulas' ? '' : v); }
      if (/^caracteristicas\.(tipo|celulas|material)$/.test(p)) aposTipo(l);
      if (p === 'caracteristicas.conservacao' || p === 'caracteristicas.estadoCorpo') sincDiag(l);
    } else if (a === 'aceitar-cons') { l.caracteristicas.conservacao = b.dataset.v; sincDiag(l); }
    else if (a === 'prio-auto') { l.diagnostico.prioridadeManual = false; sincDiag(l); }
    else if (a === 'disp') { const k = b.dataset.k; if (l.dispositivos[k]) { delete l.dispositivos[k]; } else l.dispositivos[k] = true; }
    else if (a === 'nec') { const k = b.dataset.k, n = l.diagnostico.necessita || (l.diagnostico.necessita = []), i = n.indexOf(k); if (i >= 0) n.splice(i, 1); else n.push(k); sincDiag(l); }
    else refaz = false;
    if (refaz) { App.marcarSujo(); App.renderEtapa(); }
  }
  function aoMudar(e) {
    const el = e.target, l = BU.App.cur(); if (!l || !el.dataset || !el.dataset.fm) return;
    const a = el.dataset.fm;
    if (a === 'mesma') { l.caracteristicas.mesmaSecaoJusante = el.checked; sincronizarSecao(l); BU.App.marcarSujo(); BU.App.renderEtapa(); }
    else if (a === 'obstr') { l.caracteristicas.obstrucaoPct = +el.value; const v = document.getElementById('obstr-v'); if (v) v.textContent = el.value + '%'; if (e.type === 'change') { sincDiag(l); } BU.App.marcarSujo(); }
    else if (a === 'obs1' || a === 'obs2') {
      const k = a === 'obs1' ? 'obsPadrao' : 'obs2Padrao', arr = l.diagnostico[k] || (l.diagnostico[k] = []), i = arr.indexOf(el.dataset.v);
      if (el.checked && i < 0) arr.push(el.dataset.v); else if (!el.checked && i >= 0) arr.splice(i, 1);
      sincDiag(l); BU.App.marcarSujo();
    }
    else if (a === 'obs' || a === 'obs2t') { l.diagnostico[a === 'obs' ? 'obs' : 'obs2'] = el.value; sincDiag(l); BU.App.marcarSujo(); }
  }
  document.addEventListener('click', aoClicar);
  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);

  BU.Form = { geralHTML, corpoHTML, dispositivosHTML, diagnosticoHTML, aposCampo, aposTipo, sincDiag, prioridadeDe, conservacaoSugerida, ICONES, textoObs, medirEntreBocas };
})();
