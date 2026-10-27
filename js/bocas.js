/* bocas.js — etapas "Boca de montante" e "Boca de jusante": localização (GPS aqui / mapa / digitar, em SIRGAS 2000),
   tipo, material e estado da boca, e o DESENHO da boca com os pontos vermelhos a levantar (X, Y, Z de cada um).
   Os pontos marcados viram pontos do levantamento (l.pontos, com ref = "montante:GTZ-I1"), então a planta e o perfil (prancha.js)
   se desenham sozinhos. Expõe BU.Bocas e BU.Presenca. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, esc = U.esc, Cat = BU.Cat;
  const LADOS = { montante: 'Boca de montante', jusante: 'Boca de jusante' };

  /* ---------- números e ids ---------- */
  const numTxt = v => { const t = String(v == null ? '' : v).trim().replace(/\s/g, '').replace(',', '.'); return /^[-+]?\d+(\.\d+)?$/.test(t) ? t.replace(/^\+/, '') : null; };
  const nv = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; };
  function proximoId(l) {
    const ns = l.pontos.map(p => parseInt(p.id, 10)).filter(n => !isNaN(n));
    return ns.length ? String(Math.max(...ns) + 1) : '1';
  }

  /* ---------- quais pontos esta boca pede ---------- */
  function perfilBoca(l, lado) {
    const c = l.caracteristicas, b = l.bocas[lado], n = Math.min(4, Math.max(1, +c.celulas || 1));
    const t = b.tipo, alas = t === 'Muro de testa e alas', muro = alas || t === 'Muro de testa', caixa = t === 'Caixa coletora' || t === 'Boca de lobo';
    return { n, tub: c.tipo === 'Tubular' || (!c.tipo && !c.largura), tipo: t, alas, muro, caixa };
  }
  /* Lista ordenada dos pontos vermelhos: { k, nome, cod, curto } */
  function pontosDaBoca(l, lado) {
    const P = perfilBoca(l, lado), out = [], sufx = k => (P.n > 1 ? ` · linha ${k}` : '');
    for (let k = 1; k <= P.n; k++) {
      out.push({ k: `GTZ-I${k}`, nome: 'Fundo da galeria (geratriz inferior)' + sufx(k), cod: 'OAC-GTZ' });
      out.push({ k: `GTZ-S${k}`, nome: 'Topo interno (geratriz superior)' + sufx(k), cod: 'OAC-GTZ' });
    }
    const cod = P.alas ? 'OAC-ALA' : 'OAC-MURO';
    if (P.muro) {
      [['AE', 'esquerda'], ['AD', 'direita']].forEach(([s, lado2]) => {
        out.push({ k: `${s}-JT`, nome: `${P.alas ? 'Ala' : 'Muro'} ${lado2} · junção · topo`, cod });
        out.push({ k: `${s}-JB`, nome: `${P.alas ? 'Ala' : 'Muro'} ${lado2} · junção · base`, cod });
        if (P.alas) {
          out.push({ k: `${s}-PT`, nome: `Ala ${lado2} · ponta · topo`, cod });
          out.push({ k: `${s}-PB`, nome: `Ala ${lado2} · ponta · base`, cod });
        }
      });
    }
    if (P.caixa) {
      out.push({ k: 'CX-TE', nome: 'Caixa · canto superior esquerdo', cod: 'OAC-BOCA' }, { k: 'CX-TD', nome: 'Caixa · canto superior direito', cod: 'OAC-BOCA' },
        { k: 'CX-BE', nome: 'Caixa · fundo esquerdo', cod: 'OAC-BOCA' }, { k: 'CX-BD', nome: 'Caixa · fundo direito', cod: 'OAC-BOCA' });
    }
    return out;
  }
  const refDe = (lado, k) => `${lado}:${k}`;
  const pontoDe = (l, lado, k) => l.pontos.find(p => p.ref === refDe(lado, k)) || null;
  function estado(l, lado, k) {
    const p = pontoDe(l, lado, k); if (p) return { p };
    const nao = l.bocas[lado].naoMarcados[k]; if (nao) return { nao };
    return {};
  }
  /* Pontos que ainda faltam marcar (nem levantados, nem justificados). Só conta depois de escolher o tipo da boca. */
  function faltando(l, lado) {
    if (!l.bocas[lado].tipo) return [];
    return pontosDaBoca(l, lado).filter(d => { const s = estado(l, lado, d.k); return !s.p && !s.nao; });
  }

  /* ---------- desenho (vista frontal da boca) ---------- */
  function desenho(l, lado) {
    const P = perfilBoca(l, lado), pts = pontosDaBoca(l, lado), pos = {};
    const W = 360, H = 250, solo = 205, topo = 62, XL = 80, XR = 280;
    let corpo = '', xs = [];
    // aberturas
    const span = 168, gap = 10, w = (span - (P.n - 1) * gap) / P.n, x0 = (W - span) / 2;
    const dmax = 104, hAb = Math.min(dmax, w * (P.tub ? 1 : 1.15), 110), base = solo - 22;
    for (let k = 0; k < P.n; k++) {
      const cx = x0 + k * (w + gap) + w / 2, d = Math.min(w, hAb), yt = base - hAb;
      xs.push(cx);
      if (P.tub) corpo += `<circle cx="${cx}" cy="${base - d / 2}" r="${d / 2}" fill="#fff" stroke="#16201A" stroke-width="2.4"/>`;
      else corpo += `<rect x="${cx - w / 2}" y="${yt}" width="${w}" height="${hAb}" rx="2" fill="#fff" stroke="#16201A" stroke-width="2.4"/>`;
      pos[`GTZ-I${k + 1}`] = [cx, base]; pos[`GTZ-S${k + 1}`] = [cx, P.tub ? base - d : yt];
    }
    let parede = '';
    if (P.caixa) {
      parede = `<rect x="${XL - 10}" y="${topo + 8}" width="${XR - XL + 20}" height="${solo - topo - 8}" fill="#e7ece8" stroke="#16201A" stroke-width="2.4"/>`;
      pos['CX-TE'] = [XL - 10, topo + 8]; pos['CX-TD'] = [XR + 10, topo + 8]; pos['CX-BE'] = [XL - 10, solo]; pos['CX-BD'] = [XR + 10, solo];
    } else if (P.muro) {
      const ala = P.alas;
      parede = `<path d="M${XL} ${topo} H${XR} V${solo} H${XL} Z" fill="#e7ece8" stroke="#16201A" stroke-width="2.4"/>`;
      if (ala) parede += `<path d="M${XL} ${topo} L${XL - 62} ${topo + 52} V${solo} H${XL} Z M${XR} ${topo} L${XR + 62} ${topo + 52} V${solo} H${XR} Z" fill="#dfe6e1" stroke="#16201A" stroke-width="2.4" stroke-linejoin="round"/>`;
      pos['AE-JT'] = [XL, topo]; pos['AE-JB'] = [XL, solo]; pos['AD-JT'] = [XR, topo]; pos['AD-JB'] = [XR, solo];
      if (ala) { pos['AE-PT'] = [XL - 62, topo + 52]; pos['AE-PB'] = [XL - 62, solo]; pos['AD-PT'] = [XR + 62, topo + 52]; pos['AD-PB'] = [XR + 62, solo]; }
    } else {
      // sem muro: o tubo sai do aterro (talude)
      parede = `<path d="M18 ${solo} L${XL + 20} ${topo + 10} H${XR - 20} L${W - 18} ${solo} Z" fill="#efe9dc" stroke="#9b8b66" stroke-width="1.6"/>`;
    }
    const chao = `<line x1="8" y1="${solo}" x2="${W - 8}" y2="${solo}" stroke="#56635A" stroke-width="2"/><path d="M8 ${solo} h${W - 16}" stroke="#56635A" stroke-dasharray="2 5" transform="translate(0 6)"/>`;
    const bolas = pts.map((d, i) => {
      const p = pos[d.k]; if (!p) return '';
      const s = estado(l, lado, d.k), cls = s.p ? 'ok' : s.nao ? 'nao' : 'falta';
      const lado2 = d.k.startsWith('AE') || d.k === 'CX-TE' || d.k === 'CX-BE' ? -1 : 1;
      return `<g class="dot ${cls}" data-bc="dot" data-lado="${lado}" data-k="${esc(d.k)}" tabindex="0" role="button" aria-label="${esc(d.nome)}">
        <circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="12" class="halo"/><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="9"/>
        <text x="${p[0].toFixed(1)}" y="${(p[1] + 3.6).toFixed(1)}" text-anchor="middle">${i + 1}</text></g>`;
    }).join('');
    return `<svg class="boca-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Desenho da ${LADOS[lado].toLowerCase()}">${chao}${parede}${corpo}${bolas}
      <text x="${W / 2}" y="${H - 6}" text-anchor="middle" class="leg">vista de frente, de fora do bueiro olhando para a boca</text></svg>`;
  }

  /* ---------- localização da boca ---------- */
  function utmTxt(b, l) {
    if (b.leste == null || b.norte == null) return '';
    return `E ${BU.GPS.fmtM(b.leste, 3)} · N ${BU.GPS.fmtM(b.norte, 3)} · UTM ${esc(b.zona || l.zona)}${esc(l.hemisferio || 'S')} · SIRGAS 2000`;
  }
  function aplicarLatLon(l, lado, lat, lon, origem) {
    const b = l.bocas[lado], z = parseInt(l.zona, 10) || undefined, u = BU.GPS.paraUTM(lat, lon, z);
    b.lat = +lat.toFixed(7); b.lon = +lon.toFixed(7); b.zona = String(u.zona); b.leste = +u.leste.toFixed(3); b.norte = +u.norte.toFixed(3); b.origem = origem;
  }
  function localizacaoHTML(l, lado) {
    const b = l.bocas[lado], tem = b.leste != null && b.norte != null;
    return `<div class="card"><h3>${LADOS[lado]} · SIRGAS 2000</h3>
      <p class="${tem ? 'ok-txt' : 'muted'} small">${tem ? utmTxt(b, l) + (b.origem === 'gps' ? ' · do GPS do celular' : b.origem === 'mapa' ? ' · marcado no mapa' : '') : 'Sem coordenadas. Capture pelo GPS no local, marque no mapa ou digite.'}</p>
      <div class="row"><button type="button" class="btn primary" data-bc="gps" data-lado="${lado}">📍 GPS aqui</button><button type="button" class="btn" data-bc="mapa" data-lado="${lado}">🗺️ Marcar no mapa</button><button type="button" class="btn" data-bc="digitar" data-lado="${lado}">⌨️ Digitar</button></div>
      <p class="muted small" style="margin:8px 0 0">O “GPS aqui” converte a posição do celular para UTM SIRGAS 2000 e registra a sua presença no local para o escritório acompanhar a equipe.</p></div>`;
  }

  /* ---------- tela da etapa ---------- */
  const sel = (id, p, lista, v, vazio = '—', lado = '') => `<select id="${id}" data-bc-f="${p}" data-lado="${lado}">${v ? '' : `<option value="">${esc(vazio)}</option>`}${lista.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  function chips(p, lista, v, lado) {
    return `<div class="chips" role="group">${lista.map(o => `<button type="button" class="fchip${o === v ? ' on' : ''}" data-bc-f="${p}" data-lado="${lado}" data-v="${esc(o)}" aria-pressed="${o === v}">${esc(o)}</button>`).join('')}</div>`;
  }
  function etapaHTML(l, lado) {
    const b = l.bocas[lado], P = perfilBoca(l, lado), pts = pontosDaBoca(l, lado);
    const marcados = pts.filter(d => { const s = estado(l, lado, d.k); return s.p || s.nao; }).length, falta = pts.length - marcados;
    const jus = lado === 'jusante';
    const lista = pts.map((d, i) => { const s = estado(l, lado, d.k);
      return `<button type="button" class="dotrow ${s.p ? 'ok' : s.nao ? 'nao' : 'falta'}" data-bc="dot" data-lado="${lado}" data-k="${esc(d.k)}">
        <span class="n">${i + 1}</span><span class="t"><b>${esc(d.nome)}</b><small>${s.p ? `X ${esc(s.p.x)} · Y ${esc(s.p.y)} · Z ${esc(s.p.z)}` : s.nao ? 'Não levantado: ' + esc(s.nao) : 'toque para marcar'}</small></span><span class="st">${s.p ? '✔' : s.nao ? '—' : '●'}</span></button>`; }).join('');
    const aviso = !b.tipo ? '<p class="pend aviso" style="display:block">Escolha o <b>tipo de boca</b> acima para o desenho mostrar os pontos certos. Enquanto isso valem só os pontos da galeria.</p>' : '';
    return `${localizacaoHTML(l, lado)}
      <div class="card"><h3>${LADOS[lado]}</h3><div class="grid">
        <div class="f"><label for="bc-tipo-${lado}">Tipo de boca <span class="req">*</span></label>${sel('bc-tipo-' + lado, 'tipo', Cat.BOCA_TIPOS, b.tipo, '— escolha —', lado)}</div>
        <div class="f"><label for="bc-mat-${lado}">Material da boca</label>${sel('bc-mat-' + lado, 'material', Cat.BOCA_MATERIAIS, b.material, '—', lado)}</div>
        ${jus ? `<div class="f"><label for="bc-dis-${lado}">Dissipador de energia</label>${sel('bc-dis-' + lado, 'dissipador', Cat.DISSIPADORES, b.dissipador, '—', lado)}</div>
          ${b.dissipador && b.dissipador !== 'Nenhum' ? `<div class="f"><label>Estado do dissipador <span class="req">*</span></label>${chips('estadoDissipador', Cat.ESTADOS, b.estadoDissipador, lado)}</div>` : ''}` : ''}
        <div class="f"><label>Estado da boca <span class="req">*</span></label>${chips('estado', Cat.ESTADOS, b.estado, lado)}</div></div></div>
      <div class="card boca"><h3>Pontos a levantar <span class="chip ${falta ? 'rascunho' : 'concluido'}">${marcados}/${pts.length}</span></h3>
        <p class="muted small" style="margin:0 0 6px">Cada ponto vermelho é uma posição que o topógrafo precisa marcar (X, Y e Z). Toque no ponto para preencher. Com todos marcados o app monta a planta (2D), o perfil e o modelo 3D.</p>
        ${aviso}${desenho(l, lado)}
        <div class="row" style="margin-top:8px"><button type="button" class="btn" data-bc="importar" data-lado="${lado}">⬆️ Importar lista do RTK (TXT)</button>${falta && l.pontos.some(p => !p.ref) ? `<button type="button" class="btn" data-bc="distribuir" data-lado="${lado}">Distribuir pelos códigos</button>` : ''}</div>
        <input type="file" id="bc-file" accept=".txt,.csv,.dat,.xyz,text/*" hidden>
        <div class="dotlist">${lista}</div></div>`;
  }

  /* ---------- editor de um ponto ---------- */
  function abrirDot(lado, k) {
    const App = BU.App, l = App.cur(); if (!l) return;
    const d = pontosDaBoca(l, lado).find(x => x.k === k); if (!d) return;
    const s = estado(l, lado, k), p = s.p, livres = l.pontos.filter(q => !q.ref);
    const back = document.getElementById('modal');
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>${esc(d.nome)}</h2>
      <p class="muted small">${esc(LADOS[lado])} · código ${esc(d.cod)}. Coordenadas UTM do RTK: X = Norte, Y = Este, Z = cota.</p>
      <div class="grid">
        <div class="f half"><label for="dt-id">ID do ponto</label><input id="dt-id" type="text" inputmode="numeric" value="${esc(p ? p.id : proximoId(l))}"></div>
        <div class="f half"><label for="dt-z">Z (cota) *</label><input id="dt-z" type="text" inputmode="text" value="${esc(p ? p.z : '')}" placeholder="15,904"></div>
        <div class="f half"><label for="dt-x">X (Norte) *</label><input id="dt-x" type="text" inputmode="decimal" value="${esc(p ? p.x : '')}" placeholder="7480303,180"></div>
        <div class="f half"><label for="dt-y">Y (Este) *</label><input id="dt-y" type="text" inputmode="decimal" value="${esc(p ? p.y : '')}" placeholder="712392,430"></div></div>
      <div class="err" id="dt-erro" role="alert" hidden></div>
      ${livres.length ? `<div class="f"><label for="dt-lista">Ou escolha um ponto da lista importada</label><select id="dt-lista"><option value="">— ${livres.length} ponto(s) sem uso —</option>${livres.map(q => `<option value="${esc(q.uid)}">${esc(q.id)} · ${esc(q.codigo || 'sem código')} · Z ${esc(q.z)}</option>`).join('')}</select></div>` : ''}
      <div class="col"><button type="button" class="btn primary" data-dt="salvar">Salvar ponto</button>
        <button type="button" class="btn" data-dt="nao">${s.nao ? 'Alterar motivo: ' : ''}Não consegui levantar este ponto</button>
        ${p || s.nao ? '<button type="button" class="btn danger" data-dt="limpar">Limpar ponto</button>' : ''}<button type="button" class="btn" data-dt="fechar">Cancelar</button></div></div>`;
    back.hidden = false;
    const fim = () => { back.hidden = true; back.innerHTML = ''; back.onclick = null; };
    const erro = m => { const e = back.querySelector('#dt-erro'); e.textContent = m; e.hidden = !m; };
    back.onclick = async e => {
      if (e.target === back) return fim();
      const b = e.target.closest('[data-dt]'); if (!b) return;
      const a = b.dataset.dt;
      if (a === 'fechar') return fim();
      if (a === 'limpar') {
        const q = pontoDe(l, lado, k); if (q) l.pontos = l.pontos.filter(x => x !== q);
        delete l.bocas[lado].naoMarcados[k]; fim(); App.marcarSujo(); App.renderEtapa(); return;
      }
      if (a === 'nao') {
        fim(); const m = await UI.pedir('Por que não foi possível levantar?', { ph: 'ex.: coberto por vegetação, estrutura soterrada', valor: s.nao || '' });
        if (m) { const q = pontoDe(l, lado, k); if (q) { delete q.ref; } l.bocas[lado].naoMarcados[k] = m; App.marcarSujo(); }
        App.renderEtapa(); return;
      }
      if (a === 'salvar') {
        const lista = back.querySelector('#dt-lista');
        if (lista && lista.value) { // usa um ponto já importado
          const q = l.pontos.find(x => x.uid === lista.value); if (q) {
            const antigo = pontoDe(l, lado, k); if (antigo && antigo !== q) delete antigo.ref;
            q.ref = refDe(lado, k); if (!q.codigo) q.codigo = d.cod; delete l.bocas[lado].naoMarcados[k]; fim(); App.marcarSujo(); App.renderEtapa(); return;
          }
        }
        const x = numTxt(back.querySelector('#dt-x').value), y = numTxt(back.querySelector('#dt-y').value), z = numTxt(back.querySelector('#dt-z').value);
        const id = String(back.querySelector('#dt-id').value || '').trim();
        if (x === null || y === null || z === null) return erro('X, Y e Z precisam ser números (use ponto ou vírgula).');
        if (!id) return erro('Informe o ID do ponto.');
        const antigo = pontoDe(l, lado, k);
        if (antigo) Object.assign(antigo, { id, x, y, z, codigo: antigo.codigo || d.cod });
        else l.pontos.push({ uid: U.uid(), id, x, y, z, codigo: d.cod, obs: '', ref: refDe(lado, k) });
        delete l.bocas[lado].naoMarcados[k]; fim(); App.marcarSujo(); App.renderEtapa();
      }
    };
    setTimeout(() => { const f = back.querySelector('#dt-x'); if (f) f.focus(); }, 60);
  }

  /* ---------- importar a lista do RTK e distribuir pelos pontos vermelhos ---------- */
  const papelCod = c => BU.Prancha.papel(c);
  const isGtz = p => /GTZ|GERATRIZ|^GI/i.test(String(p.codigo || '').replace(/[^A-Za-z]/g, ''));
  const isAla = p => /ALA|MURO|TESTA/i.test(String(p.codigo || '').replace(/[^A-Za-z]/g, ''));
  const isCx = p => /BOCA|CX|CAIXA/i.test(String(p.codigo || '').replace(/[^A-Za-z]/g, '')) && !isGtz(p);
  /* Agrupa pontos que estão no mesmo lugar (pares topo/base na mesma vertical) */
  function unidades(pts, lim) {
    const us = [];
    for (const p of pts) {
      const a = nv(p.x), b = nv(p.y), z = nv(p.z); if (a == null || b == null || z == null) continue;
      const u = us.find(q => Math.hypot(q.N - a, q.E - b) <= lim);
      if (u) { u.p.push(p); u.Z.push(z); u.N = (u.N * (u.p.length - 1) + a) / u.p.length; u.E = (u.E * (u.p.length - 1) + b) / u.p.length; }
      else us.push({ N: a, E: b, p: [p], Z: [z] });
    }
    us.forEach(u => { const o = u.p.map((p, i) => [p, u.Z[i]]).sort((x, y) => y[1] - x[1]); u.topo = o[0][0]; u.base = o[o.length - 1][0]; u.zmin = o[o.length - 1][1]; u.zmax = o[0][1]; u.par = o.length > 1; });
    return us;
  }
  function dist(a, b) { return Math.hypot(a.N - b.N, a.E - b.E); }
  function distribuir(l) {
    const livres = l.pontos.filter(p => !p.ref); let n = 0;
    const atrib = (lado, k, p) => { if (!p || p.ref || !pontosDaBoca(l, lado).some(d => d.k === k)) return; p.ref = refDe(lado, k); delete l.bocas[lado].naoMarcados[k]; n++; };
    const gU = unidades(livres.filter(isGtz), 0.3);
    const nM = pontosDaBoca(l, 'montante').filter(d => d.k.startsWith('GTZ-I')).length, nJ = pontosDaBoca(l, 'jusante').filter(d => d.k.startsWith('GTZ-I')).length;
    // separa as galerias em duas bocas (a mais alta é a montante)
    let grupo = { montante: [], jusante: [] };
    if (gU.length >= 2) {
      let a = gU[0], b = gU[0], dm = -1;
      for (const x of gU) for (const y of gU) { const d = dist(x, y); if (d > dm) { dm = d; a = x; b = y; } }
      const A = [], B = [];
      gU.forEach(u => (dist(u, a) <= dist(u, b) ? A : B).push(u));
      const zA = Math.min(...A.map(u => u.zmin)), zB = Math.min(...B.map(u => u.zmin));
      grupo = zA >= zB ? { montante: A, jusante: B } : { montante: B, jusante: A };
    } else if (gU.length === 1) grupo.montante = gU;
    const centro = us => us.length ? { N: us.reduce((s, u) => s + u.N, 0) / us.length, E: us.reduce((s, u) => s + u.E, 0) / us.length } : null;
    const cM = centro(grupo.montante), cJ = centro(grupo.jusante);
    ['montante', 'jusante'].forEach(lado => {
      const us = grupo[lado].slice().sort((u, v) => u.E - v.E || u.N - v.N);
      us.forEach((u, i) => { const k = i + 1; if (u.par) { atrib(lado, `GTZ-I${k}`, u.base); atrib(lado, `GTZ-S${k}`, u.topo); } else atrib(lado, `GTZ-I${k}`, u.p[0]); });
    });
    // alas / muros / caixa: cada unidade vai para a boca mais próxima
    const aU = unidades(livres.filter(p => isAla(p) && !p.ref), 0.3);
    const porLado = { montante: [], jusante: [] };
    aU.forEach(u => { const dm = cM ? dist(u, cM) : 1e9, dj = cJ ? dist(u, cJ) : 1e9; (dm <= dj ? porLado.montante : porLado.jusante).push(u); });
    ['montante', 'jusante'].forEach(lado => {
      const us = porLado[lado], c = lado === 'montante' ? cM : cJ; if (!us.length) return;
      const ordem = us.slice().sort((u, v) => (c ? dist(u, c) - dist(v, c) : 0));
      const alas = perfilBoca(l, lado).alas, juncoes = alas ? ordem.slice(0, 2) : ordem.slice(0, 2), pontas = alas ? ordem.slice(2, 4) : [];
      const esq = (arr) => arr.slice().sort((u, v) => u.E - v.E || u.N - v.N);
      const J = esq(juncoes);
      const pt = (arr, j) => arr.slice().sort((u, v) => dist(u, j) - dist(v, j))[0];
      const jPar = (u, s) => { if (!u) return; atrib(lado, `${s}-JT`, u.par ? u.topo : u.p[0]); if (u.par) atrib(lado, `${s}-JB`, u.base); };
      jPar(J[0], 'AE'); jPar(J[1], 'AD');
      if (alas && J[0] && pontas.length) { const e = pt(pontas, J[0]); jPar2(e, 'AE'); const resto = pontas.filter(x => x !== e); if (resto[0]) jPar2(resto[0], 'AD'); }
      function jPar2(u, s) { if (!u) return; atrib(lado, `${s}-PT`, u.par ? u.topo : u.p[0]); if (u.par) atrib(lado, `${s}-PB`, u.base); }
    });
    const cx = unidades(livres.filter(p => isCx(p) && !p.ref), 0.3);
    ['montante', 'jusante'].forEach(lado => {
      if (!perfilBoca(l, lado).caixa) return;
      const c = lado === 'montante' ? cM : cJ; const us = cx.filter(u => !c || dist(u, c) < 15).sort((u, v) => u.E - v.E);
      if (us[0]) { atrib(lado, 'CX-TE', us[0].topo); if (us[0].par) atrib(lado, 'CX-BE', us[0].base); }
      if (us[1]) { atrib(lado, 'CX-TD', us[1].topo); if (us[1].par) atrib(lado, 'CX-BD', us[1].base); }
    });
    return n;
  }
  async function importar(file, lado) {
    const App = BU.App, l = App.cur(); if (!l) return;
    let texto; try { texto = await new Promise((ok, er) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => er(fr.error); fr.readAsText(file); }); } catch (e) { UI.toast('Não foi possível ler o arquivo', 'erro'); return; }
    const r = BU.Pontos.parsear(texto);
    if (!r.ok.length) { await UI.escolher('Nada para importar', '<p>Nenhuma linha no formato <span class="mono">ID X Y Z "CÓDIGO"</span> foi encontrada.</p>', [{ k: 'x', label: 'Fechar' }]); return; }
    const ids = new Set(l.pontos.map(p => String(p.id)));
    const novos = r.ok.filter(p => !ids.has(String(p.id)));
    l.pontos.push(...novos); l.pontosArquivo = file.name;
    const n = distribuir(l);
    App.marcarSujo(); App.renderEtapa();
    UI.toast(`${novos.length} ponto(s) importado(s); ${n} colocado(s) nos pontos vermelhos.${r.ruins.length ? ` ${r.ruins.length} linha(s) ignorada(s).` : ''}`, n ? '' : 'aviso');
  }

  /* ---------- GPS aqui, mapa e digitar ---------- */
  function posicaoAgora() {
    return new Promise((ok, er) => {
      if (!navigator.geolocation) return er(new Error('Este aparelho não tem GPS disponível.'));
      navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy }),
        e => er(new Error(e && e.code === 1 ? 'Permissão de localização negada. Libere o GPS para este site.' : 'Não foi possível obter a posição. Vá para um local aberto e tente de novo.')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }
  async function gpsAqui(lado) {
    const App = BU.App, l = App.cur(); if (!l) return;
    UI.toast('Buscando o GPS…');
    try {
      const p = await posicaoAgora();
      aplicarLatLon(l, lado, p.lat, p.lon, 'gps'); l.bocas[lado].precisaoGps = +p.precisao.toFixed(1);
      BU.Presenca.registrar(l, lado, p);
      App.marcarSujo(); App.renderEtapa();
      UI.toast(`Posição registrada (precisão ${Math.round(p.precisao)} m) e convertida para SIRGAS 2000.`);
    } catch (e) { UI.toast(e.message || String(e), 'erro'); }
  }
  function digitar(lado) {
    const App = BU.App, l = App.cur(); if (!l) return;
    const b = l.bocas[lado], back = document.getElementById('modal');
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>${esc(LADOS[lado])} · digitar</h2>
      <p class="muted small">Coordenadas UTM SIRGAS 2000 (metros).</p><div class="grid">
      <div class="f"><label for="dg-e">Este (E)</label><input id="dg-e" type="text" inputmode="decimal" value="${esc(b.leste == null ? '' : String(b.leste).replace('.', ','))}"></div>
      <div class="f"><label for="dg-n">Norte (N)</label><input id="dg-n" type="text" inputmode="decimal" value="${esc(b.norte == null ? '' : String(b.norte).replace('.', ','))}"></div>
      <div class="f half"><label for="dg-z">Fuso</label><select id="dg-z">${BU.GPS.ZONAS.map(z => `<option${String(b.zona || l.zona) === z ? ' selected' : ''}>${z}</option>`).join('')}</select></div>
      <div class="f half"><label for="dg-c">Cota (Z)</label><input id="dg-c" type="text" inputmode="text" value="${esc(b.cota == null ? '' : String(b.cota).replace('.', ','))}"></div></div>
      <div class="err" id="dg-erro" role="alert" hidden></div>
      <div class="row"><button type="button" class="btn" data-m="n">Cancelar</button><button type="button" class="btn primary" data-m="s">Salvar</button></div></div>`;
    back.hidden = false;
    const fim = () => { back.hidden = true; back.innerHTML = ''; back.onclick = null; };
    back.onclick = e => {
      if (e.target === back) return fim();
      const bt = e.target.closest('[data-m]'); if (!bt) return;
      if (bt.dataset.m === 'n') return fim();
      const E = nv(back.querySelector('#dg-e').value), N = nv(back.querySelector('#dg-n').value), Z = back.querySelector('#dg-z').value, c = back.querySelector('#dg-c').value.trim();
      const er = back.querySelector('#dg-erro');
      if (E == null || N == null || E < 100000 || E > 900000 || N < 0 || N > 10000000) { er.textContent = 'Informe Este e Norte válidos (metros).'; er.hidden = false; return; }
      b.leste = E; b.norte = N; b.zona = Z; b.origem = 'manual'; b.cota = c ? nv(c) : null;
      const g = BU.GPS.deUTM(E, N, +Z, l.hemisferio === 'N' ? 'N' : 'S'); b.lat = +g.lat.toFixed(7); b.lon = +g.lon.toFixed(7);
      fim(); App.marcarSujo(); App.renderEtapa();
    };
  }
  function marcarNoMapa(lado) {
    const App = BU.App, l = App.cur(); if (!l) return;
    const b = l.bocas[lado], back = document.getElementById('modal'), L = window.L;
    if (!L) { UI.toast('Mapa indisponível neste aparelho. Use GPS aqui ou digite.', 'aviso'); return; }
    const centro = b.lat != null ? [b.lat, b.lon] : l.latitude != null ? [l.latitude, l.longitude] : [-15.8, -47.9], zoom = (b.lat != null || l.latitude != null) ? 19 : 4;
    back.innerHTML = `<div class="modal mapmodal" role="dialog" aria-modal="true"><h2>${esc(LADOS[lado])} · marcar no mapa</h2>
      <p class="muted small">Toque no mapa na posição da boca.</p><div id="mp-pick" class="mp-pick"></div>
      <div class="row"><button type="button" class="btn" data-m="n">Cancelar</button><button type="button" class="btn primary" data-m="s" disabled>Usar esta posição</button></div></div>`;
    back.hidden = false;
    const el = back.querySelector('#mp-pick'), m = L.map(el, { maxZoom: 21 }).setView(centro, zoom);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagens © Esri' }).addTo(m);
    let mk = b.lat != null ? L.marker(centro).addTo(m) : null, pos = b.lat != null ? { lat: b.lat, lng: b.lon } : null;
    m.on('click', ev => { pos = ev.latlng; if (mk) mk.setLatLng(pos); else mk = L.marker(pos).addTo(m); back.querySelector('[data-m=s]').disabled = false; });
    setTimeout(() => m.invalidateSize(), 80);
    const fim = () => { try { m.remove(); } catch (e) { /* já removido */ } back.hidden = true; back.innerHTML = ''; back.onclick = null; };
    back.onclick = e => {
      if (e.target === back) return fim();
      const bt = e.target.closest('[data-m]'); if (!bt || bt.disabled) return;
      if (bt.dataset.m === 'n') return fim();
      aplicarLatLon(l, lado, pos.lat, pos.lng, 'mapa'); fim(); App.marcarSujo(); App.renderEtapa();
    };
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', e => {
    const dot = e.target.closest('[data-bc]'); if (!dot) return;
    const a = dot.dataset.bc, lado = dot.dataset.lado;
    if (a === 'dot') abrirDot(lado, dot.dataset.k);
    else if (a === 'gps') gpsAqui(lado);
    else if (a === 'mapa') marcarNoMapa(lado);
    else if (a === 'digitar') digitar(lado);
    else if (a === 'importar') { window.__bocaLado = lado; const f = document.getElementById('bc-file'); if (f) f.click(); }
    else if (a === 'distribuir') { const l = BU.App.cur(); if (!l) return; const n = distribuir(l); BU.App.marcarSujo(); BU.App.renderEtapa(); UI.toast(n ? `${n} ponto(s) colocado(s) nos pontos vermelhos.` : 'Nenhum ponto da lista combinou. Toque num ponto vermelho para escolher.', n ? '' : 'aviso'); }
  });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('g[data-bc=dot]')) { e.preventDefault(); abrirDot(e.target.dataset.lado, e.target.dataset.k); } });
  function aoMudar(e) {
    const el = e.target, l = BU.App.cur(); if (!l) return;
    if (el.id === 'bc-file') { if (e.type !== 'change') return; const f = el.files && el.files[0]; el.value = ''; if (f) importar(f, window.__bocaLado || 'montante'); return; }
    const t = el.closest('[data-bc-f]'); if (!t) return;
    const lado = t.dataset.lado || 'montante', p = t.dataset.bcF;
    if (t.tagName === 'BUTTON') { if (e.type !== 'click') return; l.bocas[lado][p] = l.bocas[lado][p] === t.dataset.v ? '' : t.dataset.v; BU.App.marcarSujo(); BU.App.renderEtapa(); return; }
    l.bocas[lado][p] = el.value; BU.App.marcarSujo();
    if (e.type === 'change' && (p === 'tipo' || p === 'dissipador')) BU.App.renderEtapa();
  }
  document.addEventListener('click', e => { const t = e.target.closest('button[data-bc-f]'); if (t) aoMudar(e); });
  document.addEventListener('change', e => { if (e.target.matches && (e.target.matches('select[data-bc-f]') || e.target.id === 'bc-file')) aoMudar(e); });

  /* ---------- presença ("GPS aqui"): fila que o sync envia para a tabela própria ---------- */
  const rad = Math.PI / 180;
  function distM(la1, lo1, la2, lo2) {
    const R = 6371008.8, dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad, a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  const Presenca = {
    registrar(l, onde, p) {
      const pl = l.planejado && l.planejado.latitude != null ? l.planejado : null;
      const reg = { id: U.uid(), local: onde || 'geral', latitude: +p.lat.toFixed(7), longitude: +p.lon.toFixed(7), precisao: +(+p.precisao || 0).toFixed(1), em: U.agoraISO(),
        distancia: pl ? +distM(p.lat, p.lon, pl.latitude, pl.longitude).toFixed(1) : null, enviado: false };
      l.presencas = (l.presencas || []).concat(reg).slice(-50);
      return reg;
    },
    pendentes(l) { return (l.presencas || []).filter(x => !x.enviado); },
  };

  BU.Bocas = { etapaHTML, pontosDaBoca, faltando, estado, distribuir, perfilBoca, LADOS };
  BU.Presenca = Presenca;
})();
