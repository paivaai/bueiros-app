/* kmz.js — importa o cadastro de bueiros de um arquivo KMZ/KML (Google Earth, QGIS). Expõe BU.KMZ.
   Cada ponto do arquivo vira um levantamento com status "A vistoriar", já com os dados do cadastro e as coordenadas.
   Tudo roda no aparelho: o arquivo não é enviado a nenhum servidor. Sem bibliotecas externas.
   O mapeamento de campos segue o do HTML anterior (cadastro-bueiros-offline). */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, DB = BU.DB, esc = U.esc;

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const chave = s => norm(fixText(s)).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  /* Corrige texto UTF-8 que foi lido como Latin-1 ("RoÃ§ada" -> "Roçada") e perdas típicas da conversão SHP -> KMZ. */
  function fixText(v) {
    if (v == null) return '';
    let s = String(v).replace(/^﻿/, '').replace(/^ï»¿/, '');
    if (/[ÂÃ]/.test(s)) {
      s = s.replace(/[ÂÃ][\u0080-¿]/g, m => {
        try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([m.charCodeAt(0), m.charCodeAt(1)])); } catch (e) { return m; }
      });
      s = s.replace(/(\p{L})?Ã\?/gu, (m, pre) => (pre ? pre + 'í' : 'Á'));
      s = s.replace(/Ã (?=\p{Ll})/gu, 'à ');
    }
    return s.replace(/\bcondi o\b/g, 'condição').replace(/\borif cio\b/g, 'orifício').trim();
  }

  /* ---------- leitura do arquivo: KMZ (zip) ou KML (texto) ---------- */
  function lerBuffer(file) {
    return new Promise((ok, er) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = () => er(fr.error || new Error('Não foi possível ler o arquivo.'));
      fr.readAsArrayBuffer(file);
    });
  }
  async function inflar(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não abre KMZ. Atualize o Chrome ou envie o arquivo .kml (descompactado).');
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(bytes).catch(() => {}); w.close().catch(() => {});
    const r = ds.readable.getReader(), partes = []; let total = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; partes.push(value); total += value.length; }
    const out = new Uint8Array(total); let o = 0;
    for (const p of partes) { out.set(p, o); o += p.length; }
    return out;
  }
  async function kmlDoZip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder('utf-8');
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Arquivo KMZ inválido (não é um zip).');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true), alvo = null;
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const nome = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      if (/\.kml$/i.test(nome) && (!alvo || /(^|\/)doc\.kml$/i.test(nome))) alvo = { nome, metodo, csize, off };
      p += 46 + nl + el + cl;
    }
    if (!alvo) throw new Error('Nenhum arquivo .kml dentro do KMZ.');
    const nl = dv.getUint16(alvo.off + 26, true), el = dv.getUint16(alvo.off + 28, true), ini = alvo.off + 30 + nl + el;
    const dados = u8.subarray(ini, ini + alvo.csize);
    if (alvo.metodo === 0) return dec.decode(dados);
    if (alvo.metodo === 8) return dec.decode(await inflar(dados));
    throw new Error('Tipo de compactação do KMZ não suportado.');
  }
  async function textoKml(file) {
    const buf = await lerBuffer(file), u8 = new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) return kmlDoZip(buf); // "PK" = zip
    return new TextDecoder('utf-8').decode(u8);
  }

  /* ---------- KML -> lista de pontos com atributos ---------- */
  function parseKml(texto) {
    const doc = new DOMParser().parseFromString(texto, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('O arquivo KML está corrompido ou não é um KML.');
    const feicoes = []; let ignoradas = 0;
    for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
      const pt = pm.getElementsByTagName('Point')[0];
      if (!pt) { ignoradas++; continue; }
      const filho = [...pm.children].find(c => c.localName === 'name');
      const attrs = {};
      for (const sd of Array.from(pm.getElementsByTagName('SimpleData'))) attrs[sd.getAttribute('name') || ''] = sd.textContent || '';
      for (const d of Array.from(pm.getElementsByTagName('Data'))) {
        const v = [...d.children].find(c => c.localName === 'value');
        attrs[d.getAttribute('name') || ''] = v ? v.textContent || '' : '';
      }
      const co = (pt.getElementsByTagName('coordinates')[0] || {}).textContent || '';
      const [lon, lat] = co.trim().split(/[,\s]+/).map(Number);
      feicoes.push({ nome: filho ? filho.textContent.trim() : '', attrs, lat, lon });
    }
    return { feicoes, ignoradas };
  }

  /* ---------- atributos do cadastro -> campos do app ---------- */
  const CAMPOS = [
    ['cont', 'Nº no cadastro', k => /(^|_)cont$/.test(k)],
    ['nome', 'Nome', k => k === 'nome' || k === 'name'],
    ['id', 'ID', k => k === 'id' || k === 'uuid' || k === 'globalid'],
    ['ambiente', 'Ambiente', k => /^ambiente/.test(k)],
    ['estado', 'Estado de conservação', k => /^estado/.test(k)],
    ['necessita', 'Necessita', k => /^necessit/.test(k)],
    ['obs', 'Observação', k => /^observa/.test(k) && !/_2$/.test(k)],
    ['uf', 'UF', k => /^unidade_fe|^uf$/.test(k)],
    ['municipio', 'Município', k => /^munic/.test(k)],
    ['pistaGe', 'Sentido geográfico (pista)', k => /^sentido_ge|^pista/.test(k)],
    ['sentido', 'Sentido do km', k => k === 'sentido'],
    ['lado', 'Lado da rodovia', k => /^lado/.test(k)],
    ['sigla', 'Tipo (sigla)', k => /^tipo/.test(k)],
    ['descricao', 'Descrição', k => /^descri/.test(k)],
    ['forma', 'Forma', k => /^forma/.test(k)],
    ['dimJus', 'Dimensão 1 (diâmetro jusante)', k => /^dimens\w*_1$/.test(k)],
    ['secMont', 'Dimensão 2 (seção montante, B x H)', k => /^dimens\w*_2$/.test(k)],
    ['secJus', 'Dimensão 3 (seção jusante, B x H)', k => /^dimens\w*_3$/.test(k)],
    ['dimMont', 'Dimensão (diâmetro montante)', k => /^dimens\w*$/.test(k) && !/_\d$/.test(k)],
    ['obs2', 'Observação 2', k => /^observa\w*_2$/.test(k)],
    ['obras', 'Obras de arte', k => /^obras/.test(k)],
    ['classif', 'Classificação', k => /^classific/.test(k)],
    ['verif', 'Verificação', k => k === 'verif'],
    ['verifCatt', 'Verificação CATT', k => /^verif_?catt/.test(k)],
  ];
  /* Nome legível para um campo do cadastro ("MUNICÃ_P" -> "Município"); os que não são reconhecidos só são limpos. */
  function rotulo(k) {
    const ch = chave(String(k).replace(/^(ï__|ï»¿|\uFEFF)/, ''));
    const hit = CAMPOS.find(c => c[3] ? false : c[2](ch));
    if (/^(lat|lon)$/.test(ch)) return ch === 'lat' ? 'Latitude' : 'Longitude';
    if (hit) return hit[1];
    return fixText(String(k).replace(/^(ï__|ï»¿|\uFEFF)/, '')).replace(/[_�]+$/g, '').replace(/_/g, ' ').trim() || String(k);
  }
  function lerAtributos(f) {
    const A = {}; for (const k in f.attrs) A[chave(k)] = f.attrs[k];
    const keys = Object.keys(A), v = {};
    for (const [nome, , teste] of CAMPOS) { const hit = keys.find(kk => teste(kk)); v[nome] = hit ? fixText(A[hit]) : ''; }
    v._lat = U.parseNum(A.lat); v._lon = U.parseNum(A.lon);
    v._todos = {}; for (const k in f.attrs) { const val = fixText(f.attrs[k]); if (k && val !== '') v._todos[fixText(k)] = val; } // tudo o que veio do Google Earth
    return v;
  }

  const mapOpt = (val, opts) => { const n = norm(val); return n ? (opts.find(o => norm(o) === n) || '') : ''; };
  function dimFix(v) { const n = U.parseNum(v); if (n == null || n === 0) return null; if (n >= 200) return n / 1000; if (n > 10) return n / 100; return n; }
  function parseBxH(v) { const m = String(v || '').replace(/,/g, '.').match(/([\d.]+)\s*[xX×*]\s*([\d.]+)/); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null; }
  function mapConservacao(s) { // o app usa três estados: Bom, Regular, Precário
    s = norm(s); if (!s) return '';
    if (/crit|colap|prec|ruim|pess/.test(s)) return 'Precário';
    if (/reg/.test(s)) return 'Regular';
    if (/bom|boa|otim/.test(s)) return 'Bom';
    return '';
  }
  const mapClassif = s => { s = norm(s); return /grot/.test(s) ? 'Grota' : /greid/.test(s) ? 'Greide' : ''; };
  const LINHAS = { S: 1, D: 2, T: 3, Q: 4 }, FORMA = { T: 'Tubular', C: 'Celular', L: 'Lenticular', A: 'Arco' };
  const MATERIAL = { C: 'Concreto', M: 'Metálico', P: 'PEAD', V: 'PVC', A: 'Alvenaria / pedra' };
  function formaPorTexto(t) { t = norm(t); if (/tub|circ/.test(t)) return 'Tubular'; if (/celul|galer|aduela|retang|quadr/.test(t)) return 'Celular'; if (/lentic/.test(t)) return 'Lenticular'; if (/arco/.test(t)) return 'Arco'; return ''; }
  function linhasPorTexto(t) { t = norm(t); return /quadr/.test(t) ? 4 : /tripl/.test(t) ? 3 : /dupl/.test(t) ? 2 : /simpl/.test(t) ? 1 : null; }
  function materialPorTexto(t) { t = norm(t); return /conc/.test(t) ? 'Concreto' : /metal|aco|armco|corrug|chapa/.test(t) ? 'Metálico' : /pead|polie/.test(t) ? 'PEAD' : /pvc/.test(t) ? 'PVC' : /alvenar|pedra/.test(t) ? 'Alvenaria / pedra' : ''; }

  const RE_NOME = /^BU\s+(\d{1,3})\s+([A-Z]{2})\s+(\d{1,3}\+\d{3}(?:[.,]\d+)?)\s+([A-Z]{1,2})\s+(\d+)$/i;
  const RE_KM = /^\d{1,3}\+\d{3}(?:[.,]\d+)?$/;

  /* Rodovia e UF predominantes no arquivo: completam os pontos que vieram só com o km no nome. */
  function contexto(feicoes) {
    const cont = {};
    for (const f of feicoes) {
      const m = RE_NOME.exec(String(f.attrs.nome || f.nome || '').trim());
      if (m) { const k = m[1] + '|' + m[2].toUpperCase(); cont[k] = (cont[k] || 0) + 1; }
    }
    const top = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
    return top ? { rod: top[0].split('|')[0], uf: top[0].split('|')[1] } : { rod: '', uf: '' };
  }
  const coordOk = (la, lo) => la != null && lo != null && isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0);

  function paraRegistro(f, ctx, arquivo) {
    const a = lerAtributos(f), O = BU.App.OPCOES, l = BU.App.novo(), c = l.caracteristicas, m = l.medicoes;
    let nome = a.nome || fixText(f.nome), codigo = nome, km = '', estrada = '', uf = a.uf;
    const mn = RE_NOME.exec(nome);
    if (mn) { km = mn[3]; estrada = 'BR-' + mn[1]; uf = uf || mn[2].toUpperCase(); }
    else if (RE_KM.test(nome)) { km = nome; if (ctx.rod) { codigo = `BU ${ctx.rod} ${ctx.uf} ${nome}`.replace(/\s+/g, ' ').trim(); estrada = 'BR-' + ctx.rod; } uf = uf || ctx.uf; }
    else { const mk = nome.match(/(\d{1,3}\+\d{2,3})/); if (mk) km = mk[1]; const mu = nome.match(/\bBU\s+(\d{1,3})\s+([A-Z]{2})\b/i); if (mu) { estrada = 'BR-' + mu[1]; uf = uf || mu[2].toUpperCase(); } uf = uf || ctx.uf; }

    l.status = 'a_vistoriar'; l.origem = 'cadastro'; l.data = ''; l.hora = ''; l.responsavel = '';
    l.codigo = codigo; l.cadastroId = a.id; l.estrada = estrada; l.estado = mapOpt(uf, BU.App.UFS) || ''; l.municipio = a.municipio;
    l.km = km; l.ambiente = mapOpt(a.ambiente, O.ambiente); l.sentido = mapOpt(a.sentido, O.sentido); l.pistaGe = mapOpt(a.pistaGe, O.pista); l.lado = mapOpt(a.lado, O.lado);

    const geo = coordOk(f.lat, f.lon) ? [f.lat, f.lon] : coordOk(a._lat, a._lon) ? [a._lat, a._lon] : null;
    if (geo) { l.latitude = +geo[0].toFixed(7); l.longitude = +geo[1].toFixed(7); l.coordOrigem = 'cadastro'; BU.GPS.completarUTM(l); }

    // tipo de bueiro pela sigla do cadastro (ex.: BSCC = simples, celular, concreto)
    const sg = String(a.sigla || '').toUpperCase().match(/B([SDTQ])([TCLA])([CMPVA])/);
    let forma = '', linhas = null, material = '';
    if (sg) { linhas = LINHAS[sg[1]]; forma = FORMA[sg[2]]; material = MATERIAL[sg[3]]; }
    else { const t = a.descricao || a.sigla; forma = formaPorTexto(t); linhas = linhasPorTexto(t); material = materialPorTexto(t); }
    forma = formaPorTexto(a.forma) || forma;
    c.tipo = forma; c.material = material; c.celulas = forma ? (linhas || 1) : null; c.formato = BU.Modelo.formatoDe(c.tipo);
    BU.Form ? BU.Form.aposTipo(l) : (l.meta.sigla = BU.Cat.siglaDe(c), l.meta.descricaoTipo = BU.Cat.descricaoDe(c));

    const dM = dimFix(a.dimMont), dJ = dimFix(a.dimJus), sM = parseBxH(a.secMont), sJ = parseBxH(a.secJus), notas = [];
    if (forma === 'Tubular') {
      c.diametro = dM;
      if (dM) { m.larguraEntrada = dM; m.alturaEntrada = dM; }
      if (dJ) { m.larguraSaida = dJ; m.alturaSaida = dJ; }
      if (dM && dJ && dM !== dJ) notas.push(`Diâmetro de jusante no cadastro: ${U.numTxt(dJ)} m.`);
    } else if (forma === 'Celular') {
      if (sM) { c.largura = sM[0]; c.altura = sM[1]; m.larguraEntrada = sM[0]; m.alturaEntrada = sM[1]; }
      if (sJ) { m.larguraSaida = sJ[0]; m.alturaSaida = sJ[1]; }
    }
    c.conservacao = mapConservacao(a.estado); c.estadoCorpo = c.conservacao;
    c.necessita = a.necessita;
    if (notas.length) c.observacoes = notas.join(' ');
    l.observacoes = [a.obs, a.obs2].filter(Boolean).join('\n');

    // metadados do cadastro (Google Earth): tudo o que veio no arquivo entra no formulário, para o vistoriador conferir
    l.situacao = 'Cadastrado'; l.classificacao = mapClassif(a.classif);
    l.meta = { ...l.meta, cont: a.cont, descricao: a.descricao, forma: a.forma, dimMont: a.dimMont, dimJus: a.dimJus, secMont: a.secMont, secJus: a.secJus,
      estadoCad: a.estado, necessitaCad: a.necessita, obsCad: a.obs, obs2Cad: a.obs2, obras: a.obras, verif: a.verif, verifCatt: a.verifCatt, classifCad: a.classif,
      sigla: BU.Cat.siglaDe(c), descricaoTipo: BU.Cat.descricaoDe(c), nomeKml: nome, atributos: a._todos };
    if (geo) l.planejado = { latitude: l.latitude, longitude: l.longitude }; // pin do planejamento (base da conferência de presença)

    const itens = [];
    for (const [k, rotulo] of CAMPOS.map(x => [x[0], x[1]])) if (a[k] && k !== 'id') itens.push([rotulo, a[k]]);
    l.cadastro = { arquivo, importadoEm: U.agoraISO(), itens };
    return l;
  }

  /* ---------- fluxo de importação ---------- */
  async function importar(file) {
    try {
      UI.toast('Lendo arquivo…');
      const { feicoes, ignoradas } = parseKml(await textoKml(file));
      if (!feicoes.length) {
        await UI.escolher('Nada para importar', `<p>Nenhum ponto foi encontrado em <b>${esc(file.name)}</b>.</p>${ignoradas ? `<p>${ignoradas} feição(ões) que não são pontos foram ignoradas.</p>` : ''}`, [{ k: 'x', label: 'Fechar' }]);
        return;
      }
      const ctx = contexto(feicoes), regs = feicoes.map(f => paraRegistro(f, ctx, file.name));
      const existentes = await DB.listar();
      const ids = new Set(existentes.map(x => x.cadastroId).filter(Boolean));
      const cods = new Set(existentes.map(x => String(x.codigo || '').trim().toLowerCase()));
      const novos = [], repetidos = [], vistos = new Map();
      for (const r of regs) {
        const kc = r.codigo.trim().toLowerCase();
        if ((r.cadastroId && ids.has(r.cadastroId)) || cods.has(kc)) { repetidos.push(r); continue; }
        const n = (vistos.get(kc) || 0) + 1; vistos.set(kc, n);
        if (n > 1) r.codigo += ` #${n}`; // mesmo código duas vezes no arquivo: não perde nenhum
        novos.push(r);
      }
      const semCoord = novos.filter(r => r.latitude == null).length, semTipo = novos.filter(r => !r.caracteristicas.tipo).length;
      const resumo = `<p><b>${feicoes.length}</b> ponto(s) em <b>${esc(file.name)}</b>:</p><ul class="lista-res">
        <li><b>${novos.length}</b> novo(s) para importar</li>
        ${repetidos.length ? `<li><b>${repetidos.length}</b> já estão no app e serão mantidos como estão</li>` : ''}
        ${semTipo ? `<li>${semTipo} sem tipo no cadastro (ex.: “não cadastrado”)</li>` : ''}
        ${semCoord ? `<li>${semCoord} sem coordenadas</li>` : ''}
        ${ignoradas ? `<li>${ignoradas} feição(ões) que não são pontos foram ignoradas</li>` : ''}</ul>
        <p class="muted small">Cada ponto vira um levantamento <b>A vistoriar</b>, já com os dados do cadastro. Nada é enviado a servidor.</p>`;
      if (!novos.length) { await UI.escolher('Nada novo', resumo, [{ k: 'x', label: 'Fechar' }]); return; }
      // Um trecho pode cruzar dois fusos UTM: deixa escolher o fuso do projeto (o mesmo do RTK) ou manter o fuso de cada ponto.
      const zc = {}; novos.forEach(r => { if (r.zona && r.latitude != null) zc[r.zona] = (zc[r.zona] || 0) + 1; });
      const zonas = Object.keys(zc).sort((x, y) => zc[y] - zc[x]);
      const botoes = zonas.length > 1
        ? [...zonas.map((z, i) => ({ k: 'z' + z, label: `Importar no fuso ${z}S (${zc[z]} ponto(s) nesse fuso)`, cls: i === 0 ? 'primary' : '' })), { k: 'nat', label: 'Cada ponto no seu próprio fuso' }, { k: 'x', label: 'Cancelar' }]
        : [{ k: 'nat', label: `Importar ${novos.length} bueiro(s)`, cls: 'primary' }, { k: 'x', label: 'Cancelar' }];
      const aviso = zonas.length > 1 ? `<p class="muted small"><b>Atenção:</b> o trecho cruza dois fusos UTM (${zonas.map(z => z + 'S').join(' e ')}). Escolha o mesmo fuso que o RTK da equipe usa, para as coordenadas do cadastro e do levantamento ficarem na mesma base.</p>` : '';
      const ac = await UI.escolher('Importar cadastro', resumo + aviso, botoes);
      if (!ac || ac === 'x') return;
      if (/^z\d+$/.test(ac)) novos.forEach(r => { if (r.latitude != null) { const u = BU.GPS.paraUTM(r.latitude, r.longitude, +ac.slice(1)); r.zona = String(u.zona); r.hemisferio = u.hem; r.leste = +u.leste.toFixed(3); r.norte = +u.norte.toFixed(3); } });
      await DB.salvarVarios(novos);
      UI.toast(`${novos.length} bueiro(s) importado(s)`);
      BU.App.verLista('a_vistoriar');
    } catch (e) {
      console.error(e); UI.toast('Não foi possível importar: ' + ((e && e.message) || e), 'erro');
    }
  }

  BU.KMZ = { rotulo, importar, parseKml, textoKml, paraRegistro, contexto, fixText };
})();
