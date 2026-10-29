/* bocas.js — etapas "Boca de montante" e "Boca de jusante": localização (GPS aqui / mapa / digitar, em SIRGAS 2000),
   tipo, material e estado da boca, e o DESENHO da boca com os pontos vermelhos a levantar (X, Y, Z de cada um).
   Os pontos marcados viram pontos do levantamento (l.pontos, com ref = "montante:GTZ-1"), então a planta e o perfil (prancha.js)
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
    const t = b.tipo, inclinada = t === 'Muro de testa e ala inclinada', reta = t === 'Muro de testa e ala reta', soMuro = t === 'Muro de testa';
    return { n, tub: c.tipo === 'Tubular' || (!c.tipo && !c.largura), tipo: t, inclinada, reta, soMuro, alas: inclinada || reta, muro: inclinada || reta || soMuro };
  }
  /* Lista ordenada dos pontos vermelhos: { k, nome, cod } */
  function pontosDaBoca(l, lado) {
    const P = perfilBoca(l, lado), out = [], sufx = k => (P.n > 1 ? ` · linha ${k}` : '');
    for (let k = 1; k <= P.n; k++) out.push({ k: `GTZ-${k}`, nome: 'Geratriz da galeria (centro da boca)' + sufx(k), cod: 'OAC-GTZ' });
    const cod = P.alas ? 'OAC-ALA' : 'OAC-MURO', quem = P.alas ? 'Ala' : 'Muro';
    if (P.muro) {
      [['AE', 'esquerda'], ['AD', 'direita']].forEach(([s, lado2]) => {
        if (P.reta) out.push({ k: `${s}-JT`, nome: `Muro de testa ${lado2} · extremidade`, cod: 'OAC-MURO' });
        else { out.push({ k: `${s}-JT`, nome: `${quem} ${lado2} · junção · topo`, cod }); out.push({ k: `${s}-JB`, nome: `${quem} ${lado2} · junção · base`, cod }); }
        if (P.alas) { out.push({ k: `${s}-PT`, nome: `Ala ${lado2} · ponta · topo`, cod }); out.push({ k: `${s}-PB`, nome: `Ala ${lado2} · ponta · base`, cod }); }
      });
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

  /* ---------- desenho da boca (planta, igual às figuras de referência): estrutura em cinza, alas em dourado, pontos vermelhos clicáveis ---------- */
  const GR = '#C8C9CB', OURO = '#D9A21B', PASSO = 238; // PASSO = largura de cada linha do bueiro (unidades do desenho)
  function desenho(l, lado) {
    const P = perfilBoca(l, lado), pts = pontosDaBoca(l, lado), n = P.n, pos = {}, half = n * PASSO / 2, previa = !P.tipo;
    if (previa) { P.inclinada = true; P.muro = true; P.alas = true; } // sem tipo escolhido: mostra a estrutura completa esmaecida, só com os pontos da galeria ativos
    const f = v => Math.round(v * 10) / 10;
    let g = '', ext, y0, y1;
    const gx = k => (k - (n + 1) / 2) * PASSO;                     // posição x (relativa ao centro) da geratriz k
    const traco = d => `<path d="${d}" fill="none" stroke="${OURO}" stroke-width="2" stroke-linejoin="round"/>`;
    const cel = (x, yTop, h) => `<rect x="${f(x - 40)}" y="${f(yTop)}" width="80" height="${f(h)}" fill="${GR}"/>`;
    if (P.inclinada || P.soMuro) {
      // alas inclinadas (figuras 3, 4 e 5): trapézio dourado, "U" interno e muro de testa cinza com pernas inclinadas
      ext = half + 338; y0 = -30; y1 = 262;
      const tl = -(half + 218), bl = -(half + 338), u1 = -(half + 75), u2 = -(half + 14);
      let d = `M${f(tl)} 0H${f(-tl)}M${f(tl)} 0L${f(bl)} 208M${f(-tl)} 0L${f(-bl)} 208M${f(bl)} 208H${f(u1)}L${f(u2)} 60H${f(-u2)}L${f(-u1)} 208H${f(-bl)}`;
      g += traco(d);
      // marcações verticais: longas e médias perto das pontas, curtas no meio
      const lin = [], xs = []; for (let x = tl; x <= -tl + 0.1; x += 50) xs.push(x);
      xs.forEach((x, i) => { const dd = Math.min(i, xs.length - 1 - i), alt = dd === 0 || dd === 2 ? 208 : dd === 1 || dd === 3 ? 103 : 30; lin.push(`M${f(x)} 0v${alt}`); });
      g += traco(lin.join(''));
    } else if (P.reta) {
      // alas retas: trapézio dourado em cima e o muro reto cinza embaixo (figura de referência)
      ext = half + 219; y0 = -30; y1 = 262;
      const tl = -(half + 120), bl = -(half + 219);
      g += traco(`M${f(tl)} 0H${f(-tl)}M${f(tl)} 0L${f(bl)} 100M${f(-tl)} 0L${f(-bl)} 100M${f(bl)} 100H${f(-bl)}`);
      const lin = []; for (let x = tl + 30, i = 0; x < -tl - 5; x += 50, i++) lin.push(`M${f(x)} 0v${i % 2 ? 100 : 51}`);
      g += traco(lin.join(''));
    } else { ext = half + 60; y0 = -30; y1 = 140; }
    // aberturas (uma por linha)
    const yMuro = P.inclinada || P.soMuro ? 80 : P.reta ? 210 : 90, topo = P.inclinada || P.soMuro ? 0 : P.reta ? 121 : 20;
    for (let k = 1; k <= n; k++) { g += cel(gx(k), topo, yMuro - topo + (P.reta ? 0 : 0)); pos[`GTZ-${k}`] = [gx(k), P.reta ? 201 : yMuro]; }
    if (P.inclinada || P.soMuro) {
      g += `<path d="M${f(-half - 50)} 228L${f(-half)} 80H${f(half)}L${f(half + 50)} 228" fill="none" stroke="${GR}" stroke-width="28" stroke-linejoin="miter"/>`;
      pos['AE-JT'] = [-half, 80]; pos['AE-JB'] = [-half - 50, 228]; pos['AD-JT'] = [half, 80]; pos['AD-JB'] = [half + 50, 228];
      if (P.inclinada) { pos['AE-PT'] = [-(half + 218), 0]; pos['AE-PB'] = [-(half + 338), 208]; pos['AD-PT'] = [half + 218, 0]; pos['AD-PB'] = [half + 338, 208]; }
    } else if (P.reta) {
      g += `<path d="M${f(-half)} 210H${f(half)}" stroke="${GR}" stroke-width="22" fill="none"/>`;
      pos['AE-JT'] = [-half, 210]; pos['AD-JT'] = [half, 210];
      pos['AE-PT'] = [-(half + 120), 0]; pos['AE-PB'] = [-(half + 219), 100]; pos['AD-PT'] = [half + 120, 0]; pos['AD-PB'] = [half + 219, 100];
    }
    ext = Math.max(ext, 420);
    const W = 2 * ext + 80, H = y1 - y0 + 30, cx = W / 2;
    const bolas = pts.map((d, i) => {
      const p = pos[d.k]; if (!p) return '';
      const s = estado(l, lado, d.k), cls = s.p ? 'ok' : s.nao ? 'nao' : 'falta', x = f(cx + p[0]), y = f(p[1] - y0);
      return `<g class="dot ${cls}" data-bc="dot" data-lado="${lado}" data-k="${esc(d.k)}" tabindex="0" role="button" aria-label="${esc((i + 1) + '. ' + d.nome)}">
        <circle cx="${x}" cy="${y}" r="34" class="halo"/><circle cx="${x}" cy="${y}" r="15"/></g>`;
    }).join('');
    return `<div class="boca-wrap"><svg class="boca-svg" viewBox="0 0 ${f(W)} ${f(H)}" style="min-width:${Math.round(W * 0.44)}px" role="img" aria-label="Desenho da ${LADOS[lado].toLowerCase()}"><rect width="${f(W)}" height="${f(H)}" fill="#000" rx="10"/>
      <g transform="translate(${f(cx)} ${f(-y0)})"${previa ? ' opacity=".35"' : ''}>${g}</g>${bolas}
      <text x="${f(W / 2)}" y="${f(H - 8)}" text-anchor="middle" class="leg">toque no ponto vermelho para marcar X, Y e Z</text></svg></div>`;
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
    const b = l.bocas[lado], pts = pontosDaBoca(l, lado);
    const marcados = pts.filter(d => { const s = estado(l, lado, d.k); return s.p || s.nao; }).length, falta = pts.length - marcados;
    const ob = +b.obstrucaoPct || 0;
    const lista = pts.map((d, i) => { const s = estado(l, lado, d.k);
      return `<button type="button" class="dotrow ${s.p ? 'ok' : s.nao ? 'nao' : 'falta'}" data-bc="dot" data-lado="${lado}" data-k="${esc(d.k)}">
        <span class="n">${i + 1}</span><span class="t"><b>${esc(d.nome)}</b><small>${s.p ? `X ${esc(s.p.x)} · Y ${esc(s.p.y)} · Z ${esc(s.p.z)}` : s.nao ? 'Não levantado: ' + esc(s.nao) : 'toque para marcar'}</small></span><span class="st">${s.p ? '✔' : s.nao ? '—' : '●'}</span></button>`; }).join('');
    const aviso = !b.tipo ? '<p class="pend aviso" style="display:block">Escolha o <b>tipo de boca</b> acima para ver a estrutura certa e todos os pontos a levantar. Por enquanto só aparecem os pontos da galeria.</p>' : '';
    return `${localizacaoHTML(l, lado)}
      <div class="card"><h3>${LADOS[lado]}</h3><div class="grid">
        <div class="f"><label for="bc-tipo-${lado}">Tipo de boca <span class="req">*</span></label>${sel('bc-tipo-' + lado, 'tipo', Cat.BOCA_TIPOS, b.tipo, '— escolha —', lado)}</div>
        <div class="f"><label for="bc-mat-${lado}">Material da boca</label>${sel('bc-mat-' + lado, 'material', Cat.BOCA_MATERIAIS, b.material, '—', lado)}</div>
        <div class="f"><label>Estado da boca <span class="req">*</span></label>${chips('estado', Cat.ESTADOS, b.estado, lado)}</div>
        <div class="f"><label for="f-obstr-${lado}">Obstrução da seção: <b id="obstr-v-${lado}">${ob}%</b></label><input id="f-obstr-${lado}" type="range" min="0" max="100" step="5" value="${ob}" data-fm="obstr" data-lado="${lado}"></div></div></div>
      <div class="card boca"><h3>Pontos a levantar <span class="chip ${falta ? 'rascunho' : 'concluido'}">${marcados}/${pts.length}</span></h3>
        <p class="muted small" style="margin:0 0 6px">Cada ponto vermelho é uma posição que o topógrafo precisa marcar (X, Y e Z). Toque no ponto para preencher. Com todos marcados o app monta a planta (2D), o perfil e o modelo 3D.</p>
        ${aviso}${desenho(l, lado)}
        <div class="dotlist">${lista}</div></div>
      ${BU.Form.dispositivosHTML(l, lado)}
      ${BU.Patologias.blocoHTML(l, lado === 'montante' ? 'mont' : 'jus')}
      ${BU.Fotos.blocoHTML(l, 'foto:' + lado, 'Foto da boca de ' + lado, { entradas: true })}`;
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
    const nM = pontosDaBoca(l, 'montante').filter(d => d.k.startsWith('GTZ-')).length, nJ = pontosDaBoca(l, 'jusante').filter(d => d.k.startsWith('GTZ-')).length;
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
      us.forEach((u, i) => { const k = i + 1; atrib(lado, `GTZ-${k}`, u.base || u.p[0]); });
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
