/* planejamento.js — PLANEJAMENTO do levantamento (escritório): importa KMZ/KML do Google Earth, marca bueiros no mapa,
   define o eixo da rodovia (divide em km) e nomeia cada bueiro pela quilometragem (ex.: RJ-000 km 170+470).
   Os pontos salvos entram no projeto como "A vistoriar" para a equipe de campo vistoriar um a um.
   Expõe window.Planejamento.view(ctx). */
(function () {
  'use strict';
  const BU = window.BU, esc = BU.U.esc, C = BU.Codigo;

  const P = { projId: null, pins: [], removidos: new Set(), eixo: { rodovia: '', kmIni: 0, pts: [] }, eixoSujo: false, modo: 'ver', sel: null, mapa: null, L: null, cam: {}, imp: null, cache: null, ctx: null };
  const ED = 'a_vistoriar';                                   // só dá para editar/mover quem ainda não foi vistoriado
  const sujo = () => P.eixoSujo || P.pins.some(p => p.dirty || p.novo) || P.removidos.size > 0;
  /* O fuso UTM NÃO é fixo: vem da localização de cada ponto (meridiano central mais próximo). O fuso do projeto só serve de padrão sem coordenadas. */
  const zonaDe = lo => Math.floor((lo + 180) / 6) + 1;
  const zona = () => (P.eixo.pts.length ? zonaDe(P.eixo.pts[0][1]) : (parseInt(P.ctx.S.projeto.fuso, 10) || 23)); // fuso do eixo (usado nas distâncias ao longo dele)
  const hemi = () => (P.eixo.pts.length ? (P.eixo.pts[0][0] < 0 ? 'S' : 'N') : (P.ctx.S.projeto.hemisferio || 'S'));
  const utm = (la, lo) => BU.GPS.paraUTM(la, lo, zona());
  const coordOk = (la, lo) => isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0);

  /* ------------------------------------------------------------- eixo: distâncias ao longo da rodovia */
  function eixoGeo() {
    const e = P.eixo, k = e.pts.map(p => p.join(',')).join(';') + '|' + zona();
    if (P.cache && P.cache.k === k) return P.cache;
    const xy = e.pts.map(([la, lo]) => { const u = utm(la, lo); return [u.leste, u.norte]; }), cum = [0];
    for (let i = 1; i < xy.length; i++) cum[i] = cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    return (P.cache = { k, xy, cum, total: xy.length > 1 ? cum[cum.length - 1] : 0 });
  }
  const temEixo = () => P.eixo.pts.length > 1 && eixoGeo().total > 0;
  /* ponto -> km: projeta o ponto no eixo e soma ao km inicial */
  function projetar(la, lo) {
    const g = eixoGeo(), u = utm(la, lo); let best = null;
    for (let i = 0; i < g.xy.length - 1; i++) {
      const [ax, ay] = g.xy[i], [bx, by] = g.xy[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((u.leste - ax) * dx + (u.norte - ay) * dy) / l2)) : 0;
      const d = Math.hypot(u.leste - (ax + t * dx), u.norte - (ay + t * dy));
      if (!best || d < best.off) best = { off: d, along: g.cum[i] + t * Math.sqrt(l2) };
    }
    return { metros: P.eixo.kmIni + best.along, off: best.off };
  }
  /* distância ao longo do eixo -> lat/lon */
  function deAlong(a) {
    const g = eixoGeo(); a = Math.max(0, Math.min(g.total, a)); let i = 0;
    while (i < g.xy.length - 2 && g.cum[i + 1] < a) i++;
    const seg = g.cum[i + 1] - g.cum[i] || 1, t = (a - g.cum[i]) / seg, x = g.xy[i][0] + t * (g.xy[i + 1][0] - g.xy[i][0]), y = g.xy[i][1] + t * (g.xy[i + 1][1] - g.xy[i][1]);
    const r = BU.GPS.deUTM(x, y, zona(), hemi()); return [r.lat, r.lon];
  }
  const kmsDoEixo = () => {
    if (!temEixo()) return [];
    const g = eixoGeo(), out = [], ini = P.eixo.kmIni, fim = ini + g.total;
    for (let m = Math.ceil(ini / 1000) * 1000; m <= fim; m += 1000) out.push({ km: m / 1000, pos: deAlong(m - ini) });
    return out;
  };

  /* ------------------------------------------------------------- pontos */
  function unico(cod, pin) {
    let c = cod, n = 1;
    while (P.pins.some(p => p !== pin && p.codigo.toLowerCase() === c.toLowerCase())) { n++; c = `${cod} (${n})`; }
    return c;
  }
  function proximoBU() {
    let max = 0; P.pins.forEach(p => { const m = p.codigo.match(/^BU-(\d+)$/i); if (m) max = Math.max(max, +m[1]); });
    return 'BU-' + String(max + 1).padStart(3, '0');
  }
  function nomear(pin) {
    if (temEixo()) { const r = projetar(pin.lat, pin.lon); pin.off = r.off; pin.km = C.metrosParaKm(r.metros); pin.codigo = unico(C.codigo(P.eixo.rodovia, r.metros), pin); }
    else { pin.off = null; if (!pin.codigo) pin.codigo = unico(proximoBU(), pin); }
  }
  function novoPin(la, lo, nome) {
    const pin = { id: BU.U.uid(), codigo: nome || '', km: '', lat: +la.toFixed(7), lon: +lo.toFixed(7), auto: !nome, novo: true, dirty: true, status: ED, off: null };
    if (!nome) nomear(pin); else { if (temEixo()) pin.off = projetar(pin.lat, pin.lon).off; pin.codigo = unico(pin.codigo, pin); const k = pin.codigo.match(/(\d{1,4}\+\d{1,3})/); if (k) pin.km = k[1]; }
    P.pins.push(pin); return pin;
  }
  const editavel = p => p.status === ED;

  /* ------------------------------------------------------------- KMZ / KML */
  const DADOS_CAD = ['codigo', 'cadastroId', 'estrada', 'estado', 'municipio', 'km', 'ambiente', 'sentido', 'pistaGe', 'lado', 'situacao', 'classificacao', 'meta', 'caracteristicas', 'medicoes', 'observacoes', 'cadastro', 'planejado', 'origem'];
  async function lerArquivo(file) {
    const txt = await BU.KMZ.textoKml(file);
    const doc = new DOMParser().parseFromString(txt, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('O arquivo KML está corrompido ou não é um KML.');
    const pontos = [], linhas = [];
    // atributos do cadastro (Google Earth): cada ponto já vem com o formulário pré-preenchido
    let feic = [], ctxK = { rod: '', uf: '' };
    try { feic = BU.KMZ.parseKml(txt).feicoes; ctxK = BU.KMZ.contexto(feic); } catch (e) { feic = []; }
    const dadosDe = (nome, lat, lon) => {
      const f = feic.find(x => Math.abs(x.lat - lat) < 1e-9 && Math.abs(x.lon - lon) < 1e-9 && (x.nome === nome || BU.KMZ.fixText(x.nome) === nome)) || feic.find(x => Math.abs(x.lat - lat) < 1e-9 && Math.abs(x.lon - lon) < 1e-9);
      if (!f || !Object.keys(f.attrs).length) return null;
      try { const r = BU.KMZ.paraRegistro(f, ctxK, file.name), d = {}; for (const k of DADOS_CAD) if (r[k] !== undefined) d[k] = r[k]; return d; } catch (e) { console.warn(e); return null; }
    };
    const parse = s => String(s || '').trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1])).map(a => [a[1], a[0]]);
    for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
      const nomeEl = [...pm.children].find(c => c.localName === 'name'), nome = BU.KMZ.fixText(nomeEl ? nomeEl.textContent : '');
      for (const pt of Array.from(pm.getElementsByTagName('Point'))) {
        const [c] = parse((pt.getElementsByTagName('coordinates')[0] || {}).textContent); if (c && coordOk(c[0], c[1])) pontos.push({ nome, lat: c[0], lon: c[1], dados: dadosDe(nome, c[0], c[1]) });
      }
      for (const ln of Array.from(pm.getElementsByTagName('LineString'))) {
        const c = parse((ln.getElementsByTagName('coordinates')[0] || {}).textContent).filter(a => coordOk(a[0], a[1])); if (c.length > 1) linhas.push({ nome, pts: c });
      }
    }
    linhas.sort((a, b) => b.pts.length - a.pts.length);
    return { arquivo: file.name, pontos, linha: linhas[0] || null, nLinhas: linhas.length };
  }
  /* Nomes do tipo "Sem título", "Marcador 3", "Untitled Placemark" não servem de código: o planejamento nomeia pelo km. */
  const nomeGenerico = n => !String(n || '').trim() || /^(sem t[ií]tulo|untitled|marcador|placemark|ponto|pin|point)\b/i.test(String(n).trim());

  function aplicarImportacao() {
    const I = P.imp, g = id => document.getElementById(id), usarLinha = g('imp-linha') && g('imp-linha').checked, nomearKm = g('imp-km') && g('imp-km').checked, trazer = g('imp-pts').checked;
    if (usarLinha && I.linha) {
      P.eixo.pts = I.linha.pts.map(p => [+p[0].toFixed(7), +p[1].toFixed(7)]); P.eixoSujo = true;
      if (!P.eixo.rodovia) P.eixo.rodovia = (P.ctx.S.projeto.rodovia || '').trim();
    }
    let n = 0, dup = 0;
    if (trazer) for (const q of I.pontos) {
      if (P.pins.some(p => Math.abs(p.lat - q.lat) < 3e-5 && Math.abs(p.lon - q.lon) < 3e-5)) { dup++; continue; } // ~3 m: já existe
      const usaNome = (q.dados || !nomearKm) && !nomeGenerico(q.nome); // nome completo do cadastro vale sempre
      const pin = novoPin(q.lat, q.lon, usaNome ? q.nome : ''); if (q.dados) { pin.dados = q.dados; pin.auto = false; } n++;
    }
    if (usarLinha && P.pins.length) P.pins.forEach(p => { if (editavel(p) && p.auto) { nomear(p); p.dirty = true; } });
    P.imp = null; render();
    P.ctx.toast(`${n} ponto(s) importado(s)${dup ? `, ${dup} ignorado(s) por já existirem no mesmo local` : ''}${usarLinha && I.linha ? '. Eixo definido pela linha do arquivo' : ''}. Revise e clique em <b>Salvar planejamento</b>.`);
    ajustarMapa();
  }

  /* ------------------------------------------------------------- salvar / exportar */
  async function salvar() {
    const { D, S, toast } = P.ctx, btn = document.querySelector('[data-pl="salvar"]');
    const mexidos = P.pins.filter(p => editavel(p) && (p.novo || p.dirty));
    const cods = new Set();
    for (const p of P.pins) { const k = p.codigo.trim().toLowerCase(); if (!k) return toast('Há ponto sem nome. Preencha o nome (código) de todos.'); if (cods.has(k)) return toast(`Nome repetido: <b>${esc(p.codigo)}</b>. Cada bueiro precisa de um nome diferente.`); cods.add(k); }
    if (btn) btn.disabled = true;
    try {
      if (P.removidos.size) await D.removerPlanejados(S.projeto.id, [...P.removidos]);
      if (mexidos.length) {
        const lista = mexidos.map(p => { const u = BU.GPS.paraUTM(p.lat, p.lon, zonaDe(p.lon)); return { id: p.id, codigo: p.codigo.trim(), km: p.km || '', latitude: p.lat, longitude: p.lon, leste: +u.leste.toFixed(3), norte: +u.norte.toFixed(3), zona: String(u.zona),
          dados: { ...(p.dados || {}), estrada: (P.eixo.rodovia || (p.dados && p.dados.estrada) || S.projeto.rodovia || '').trim(), hemisferio: u.hem, coordOrigem: 'cadastro', origem: 'planejamento', observacoes: p.obs || (p.dados && p.dados.observacoes) || '', planejado: { latitude: p.lat, longitude: p.lon } } }; });
        const r = await D.salvarPlanejados(S.projeto.id, lista);
        if (r && r.bloqueados) toast(`${r.bloqueados} ponto(s) já vistoriados não foram alterados.`);
      }
      if (P.eixoSujo) await D.salvarEixo(S.projeto.id, { rodovia: P.eixo.rodovia, kmIni: P.eixo.kmIni, pts: P.eixo.pts });
      S.bueiros = await D.bueiros(S.projeto.id); P.projId = null; await view(P.ctx, true);
      toast(`Planejamento salvo: ${mexidos.length} ponto(s)${P.removidos.size ? '' : ''}. Eles aparecem como <b>A vistoriar</b> para a equipe de campo.`);
    } catch (e) { toast(esc(e.message || e)); if (btn) btn.disabled = false; }
  }
  function baixarKml() {
    const lista = P.pins.filter(editavel); if (!lista.length) return P.ctx.toast('Não há pontos a vistoriar para exportar.');
    const x = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(P.ctx.S.projeto.nome)} — bueiros planejados</name>\n`
      + lista.map(p => `<Placemark><name>${x(p.codigo)}</name><ExtendedData><Data name="ID"><value>${x(p.id)}</value></Data><Data name="KM"><value>${x(p.km)}</value></Data></ExtendedData><Point><coordinates>${p.lon},${p.lat},0</coordinates></Point></Placemark>`).join('\n')
      + (P.eixo.pts.length > 1 ? `\n<Placemark><name>Eixo ${x(P.eixo.rodovia)}</name><LineString><tessellate>1</tessellate><coordinates>${P.eixo.pts.map(p => p[1] + ',' + p[0] + ',0').join(' ')}</coordinates></LineString></Placemark>` : '') + '\n</Document></kml>';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }));
    a.download = 'planejamento_' + (P.eixo.rodovia || 'bueiros').replace(/[^\w-]+/g, '_') + '.kml'; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ------------------------------------------------------------- tela */
  const SEL = (id) => document.getElementById(id);
  function resumoKm() {
    const m = new Map();
    P.pins.forEach(p => { const t = C.kmParaMetros(p.km); if (t == null) return; const k = Math.floor(t / 1000); (m.get(k) || m.set(k, []).get(k)).push(p); });
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }
  function painelLateral() {
    const g = temEixo() ? eixoGeo() : null, fim = g ? P.eixo.kmIni + g.total : null, I = P.imp;
    const chipSt = s => P.ctx.chip(s);
    return `
      <div class="card"><h3>1. Eixo da rodovia e quilometragem</h3>
        <p class="muted small" style="margin:4px 0 8px">Trace a linha da rodovia no mapa (ou traga do KMZ). A partir dela o painel divide a estrada em km e dá o nome de cada bueiro (rodovia + km + metros).</p>
        <div class="grid g2" style="gap:8px"><label class="f">Rodovia<input id="pl-rod" value="${esc(P.eixo.rodovia)}" placeholder="ex.: RJ-000"></label>
          <label class="f">Km no 1º ponto do eixo<input id="pl-kmini" value="${esc(C.metrosParaKm(P.eixo.kmIni))}" placeholder="170+000"></label></div>
        <div class="linha" style="margin-top:8px;flex-wrap:wrap">
          <button class="btn sm${P.modo === 'eixo' ? ' pri' : ''}" data-pl="modo-eixo">${P.modo === 'eixo' ? 'Terminar o eixo' : 'Traçar o eixo no mapa'}</button>
          <button class="btn sm" data-pl="eixo-desfazer"${P.eixo.pts.length ? '' : ' disabled'}>Desfazer último ponto</button>
          <button class="btn sm" data-pl="eixo-limpar"${P.eixo.pts.length ? '' : ' disabled'}>Limpar eixo</button></div>
        <p class="small" style="margin:8px 0 0" id="pl-eixo-info">${g ? `Eixo com ${P.eixo.pts.length} pontos, <b>${(g.total / 1000).toFixed(3).replace('.', ',')} km</b> (do km ${esc(C.metrosParaKm(P.eixo.kmIni))} ao km ${esc(C.metrosParaKm(fim))}).` : '<span class="muted">Sem eixo: os pontos recebem nomes BU-001, BU-002… e você pode digitar o km à mão.</span>'}</p>
        ${g && !P.eixo.kmIni ? '<p class="small" style="margin:6px 0 0;color:var(--st-devolvido)"><b>Informe o km do 1º ponto do eixo</b> (hoje está 000+000). O 1º ponto é onde o km começa: trace no sentido do km crescente.</p>' : ''}</div>
      <div class="card"><h3>2. Importar do Google Earth (KMZ / KML)</h3>
        <p class="muted small" style="margin:4px 0 8px">Pontos (pins) viram bueiros a vistoriar, com o <b>nome completo</b> e <b>todos os dados do cadastro</b> (tipo, dimensões, estado, observações…) já preenchidos; uma linha vira o eixo da rodovia.</p>
        <input type="file" id="pl-arq" accept=".kmz,.kml" hidden><button class="btn sm" data-pl="arquivo">Escolher arquivo…</button>
        ${I ? `<div class="aviso" style="margin-top:8px"><b>${esc(I.arquivo)}</b>: ${I.pontos.length} ponto(s)${I.linha ? `, ${I.nLinhas} linha(s) (a maior tem ${I.linha.pts.length} vértices)` : ', nenhuma linha'}.
            <label style="display:flex;gap:6px;margin-top:6px"><input type="checkbox" id="imp-pts" checked> Trazer os ${I.pontos.length} ponto(s)</label>
            ${I.linha ? `<label style="display:flex;gap:6px"><input type="checkbox" id="imp-linha" ${temEixo() ? '' : 'checked'}> Usar a linha como eixo da rodovia${temEixo() ? ' (substitui o eixo atual)' : ''}</label>` : ''}
            <label style="display:flex;gap:6px"><input type="checkbox" id="imp-km" ${(temEixo() || I.linha) ? 'checked' : ''}> Nomear pelo km (se o arquivo não trouxer um nome útil)</label>
            <div class="linha" style="margin-top:8px"><button class="btn pri sm" data-pl="imp-ok">Importar</button><button class="btn sm" data-pl="imp-cancel">Cancelar</button></div></div>` : ''}</div>
      <div class="card"><h3>3. Marcar bueiros</h3>
        <div class="linha" style="flex-wrap:wrap"><button class="btn sm${P.modo === 'pin' ? ' pri' : ''}" data-pl="modo-pin">${P.modo === 'pin' ? 'Parar de marcar' : '+ Marcar bueiro no mapa'}</button>
          <span class="muted small">${P.modo === 'pin' ? 'Clique no mapa onde está (ou deve estar) o bueiro. Arraste o pino para ajustar.' : 'Ative e clique na imagem de satélite.'}</span></div>
        <form id="pl-coord" class="linha" style="margin-top:8px"><input id="pl-ll" placeholder="lat, lon  (ex.: -22,9068, -43,1729)" style="flex:1" aria-label="Coordenada"><button class="btn sm" type="submit">Adicionar por coordenada</button></form></div>
      <div class="card"><div class="linha"><h3>Pontos do planejamento</h3><span class="esp"></span><span class="muted small" id="pl-cont">${contagem()}</span></div>
        <div class="tab-wrap" style="max-height:300px;margin-top:8px"><table><thead><tr><th>Nome (código)</th><th>Km</th><th>Situação</th><th></th></tr></thead><tbody id="pl-lista">${linhasLista()}</tbody></table></div></div>
      <div class="card"><h3>Bueiros por km</h3><div id="pl-kms">${kmsHTML()}</div></div>
      <div class="card" style="position:sticky;bottom:8px;border-color:var(--marca)"><div class="linha" style="flex-wrap:wrap"><button class="btn pri" data-pl="salvar" ${sujo() ? '' : 'disabled'}>Salvar planejamento</button>
        <button class="btn sm" data-pl="kml">Baixar KML (para o app de campo)</button></div>
        <p class="small muted" style="margin:6px 0 0" id="pl-estado">${sujo() ? '<b style="color:var(--st-devolvido)">Alterações ainda não salvas.</b>' : 'Tudo salvo.'}</p></div>`;
  }
  function fusoTxt() {
    const z = new Set(P.pins.map(p => zonaDe(p.lon) + (p.lat < 0 ? 'S' : 'N'))); P.eixo.pts.forEach(q => z.add(zonaDe(q[1]) + (q[0] < 0 ? 'S' : 'N')));
    return z.size ? `Fuso UTM pela localização: ${[...z].sort().join(' e ')} (cada bueiro recebe E/N no fuso onde está)` : 'O fuso UTM é definido pela localização dos pontos (cada bueiro no seu fuso)';
  }
  const contagem = () => `${P.pins.filter(editavel).length} a vistoriar · ${P.pins.length} no total`;
  function kmsHTML() {
    const rk = resumoKm();
    return rk.length ? `<div class="small" style="margin-top:6px;display:flex;flex-direction:column;gap:3px">${rk.map(([k, l]) => `<div><b>Km ${k}</b>: ${l.length} bueiro(s) <span class="muted">(${l.map(p => esc(p.km)).join(', ')})</span></div>`).join('')}</div>` : '<p class="muted small" style="margin:6px 0 0">Nenhum ponto com km ainda.</p>';
  }
  function linhasLista() {
    const l = P.pins.slice().sort((a, b) => (C.kmParaMetros(a.km) ?? 1e12) - (C.kmParaMetros(b.km) ?? 1e12) || a.codigo.localeCompare(b.codigo, 'pt', { numeric: true }));
    return l.map(p => `<tr data-pid="${p.id}"${P.sel === p.id ? ' class="sel"' : ''}><td>${editavel(p) ? `<input class="pl-cod" data-pl-cod="${p.id}" value="${esc(p.codigo)}" aria-label="Nome do bueiro">` : `<b>${esc(p.codigo)}</b>`}${p.off != null && p.off > 150 ? `<br><small style="color:var(--st-devolvido)">a ${Math.round(p.off)} m do eixo</small>` : ''}</td>
      <td>${esc(p.km || '—')}</td><td>${P.ctx.chip(p.status)}${p.novo ? ' <small class="muted">novo</small>' : p.dirty ? ' <small class="muted">editado</small>' : ''}</td>
      <td>${editavel(p) ? `<button class="btn sm" data-pl="del" data-id="${p.id}" title="Remover">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum ponto ainda. Importe um KMZ ou marque no mapa.</td></tr>';
  }

  /* ------------------------------------------------------------- mapa */
  const icone = (cor, rot) => P.L.divIcon({ className: 'pl-pin', html: `<i style="background:${cor}"></i>${rot ? `<b>${esc(rot)}</b>` : ''}`, iconSize: [18, 18], iconAnchor: [9, 9] });
  function desenhar() {
    const L = P.L; if (!L || !P.mapa) return;
    Object.values(P.cam).forEach(c => c.clearLayers());
    const { COR } = P.ctx, rotulo = P.pins.length <= 60;
    P.pins.forEach(p => {
      const ed = editavel(p), mk = L.marker([p.lat, p.lon], { icon: icone(ed ? '#EF5A28' : COR[p.status] || '#555', rotulo ? p.codigo : ''), draggable: ed, title: p.codigo, keyboard: false });
      mk.on('dragend', () => { const ll = mk.getLatLng(); p.lat = +ll.lat.toFixed(7); p.lon = +ll.lng.toFixed(7); if (p.auto) nomear(p); else if (temEixo()) p.off = projetar(p.lat, p.lon).off; p.dirty = true; atualizarLista(); });
      mk.on('click', () => { P.sel = p.id; atualizarLista(); });
      mk.addTo(P.cam.pins);
    });
    if (P.eixo.pts.length) {
      L.polyline(P.eixo.pts, { color: '#EF5A28', weight: 4, opacity: .9 }).addTo(P.cam.eixo);
      if (P.modo === 'eixo') P.eixo.pts.forEach(q => L.circleMarker(q, { radius: 5, color: '#fff', weight: 2, fillColor: '#EF5A28', fillOpacity: 1 }).addTo(P.cam.eixo));
      kmsDoEixo().forEach(k => L.marker(k.pos, { icon: L.divIcon({ className: 'pl-km', html: `<span>km ${k.km}</span>`, iconSize: [54, 18], iconAnchor: [27, 9] }), interactive: false }).addTo(P.cam.km));
    }
  }
  function ajustarMapa() {
    if (!P.mapa) return;
    const pts = P.pins.map(p => [p.lat, p.lon]).concat(P.eixo.pts);
    if (pts.length) P.mapa.fitBounds(P.L.latLngBounds(pts).pad(0.15), { maxZoom: 18 });
  }
  async function montarMapa() {
    const el = SEL('pl-mapa'); if (!el) return;
    const tem = await P.ctx.carregarLeaflet();
    if (SEL('pl-mapa') !== el) return;
    if (!tem) { el.innerHTML = '<div class="aviso" style="margin:16px"><b>Não foi possível carregar o mapa.</b> Verifique a internet. Você ainda pode adicionar pontos pela coordenada e salvar.</div>'; return; }
    const L = (P.L = window.L);
    if (P.mapa) { try { P.mapa.remove(); } catch (e) { /* já removido */ } }
    const m = (P.mapa = L.map(el, { zoomControl: true, maxZoom: 22 }));
    // zoom além do que a imagem tem (maxNativeZoom) só amplia o último nível; por isso há 2 satélites e o atalho para o Google
    const esri = 'Imagens © Esri, Maxar, Earthstar Geographics';
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 22, maxNativeZoom: 19, attribution: esri });
    const clar = L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 22, maxNativeZoom: 19, attribution: esri + ' (Clarity)' });
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
    sat.addTo(m); L.control.layers({ 'Satélite (Esri)': sat, 'Satélite nítido (Esri Clarity)': clar, 'Mapa (OSM)': osm }, null, { position: 'topright' }).addTo(m);
    // atalho: abre o mesmo ponto no Google Maps em satélite (a imagem do Google costuma ser a mais recente e nítida)
    const G = L.control({ position: 'bottomleft' });
    G.onAdd = () => { const d = L.DomUtil.create('div', 'pl-gmaps'); d.innerHTML = '<a target="_blank" rel="noopener">Abrir no Google Maps (satélite)</a>'; L.DomEvent.disableClickPropagation(d); return d; };
    G.addTo(m);
    const atualizaG = () => { const c = m.getCenter(), a = el.querySelector('.pl-gmaps a'); if (a) a.href = `https://www.google.com/maps/@${c.lat.toFixed(6)},${c.lng.toFixed(6)},${Math.max(60, Math.round(40000000 / Math.pow(2, m.getZoom())))}m/data=!3m1!1e3`; };
    m.on('moveend', atualizaG);
    P.cam = { eixo: L.layerGroup().addTo(m), km: L.layerGroup().addTo(m), pins: L.layerGroup().addTo(m) };
    m.setView([-15.8, -47.9], 4); ajustarMapa(); desenhar(); atualizaG();
    m.on('click', ev => {
      const la = ev.latlng.lat, lo = ev.latlng.lng;
      if (P.modo === 'pin') { const p = novoPin(la, lo); P.sel = p.id; desenhar(); atualizarLista(); }
      else if (P.modo === 'eixo') { P.eixo.pts.push([+la.toFixed(7), +lo.toFixed(7)]); eixoMudou(); }
    });
    el.style.cursor = P.modo === 'ver' ? '' : 'crosshair';
    window.__plan.mapa = m;
  }
  function eixoMudou() {
    P.eixoSujo = true; P.cache = null;
    if (!P.eixo.rodovia) P.eixo.rodovia = (P.ctx.S.projeto.rodovia || '').trim();
    P.pins.forEach(p => { if (editavel(p) && p.auto) { nomear(p); p.dirty = true; } });
    render(true);
  }

  /* ------------------------------------------------------------- render */
  function atualizarLista() {
    const t = SEL('pl-lista'); if (t) t.innerHTML = linhasLista();
    const c = SEL('pl-cont'); if (c) c.textContent = contagem();
    const fz = SEL('pl-fuso'); if (fz) fz.textContent = fusoTxt();
    const kk = SEL('pl-kms'); if (kk) kk.innerHTML = kmsHTML();
    const s = SEL('pl-estado'); if (s) s.innerHTML = sujo() ? '<b style="color:var(--st-devolvido)">Alterações ainda não salvas.</b>' : 'Tudo salvo.';
    const b = document.querySelector('[data-pl="salvar"]'); if (b) b.disabled = !sujo();
  }
  /* mantém o mapa e redesenha só o painel lateral (e as camadas) */
  function render(soLateral) {
    const lat = SEL('pl-lateral'); if (!lat) return;
    lat.innerHTML = painelLateral();
    const el = SEL('pl-mapa'); if (el) el.style.cursor = P.modo === 'ver' ? '' : 'crosshair';
    desenhar();
  }
  async function view(ctx, forcar) {
    const { S, D, pagina } = ctx; P.ctx = ctx;
    if (P.projId !== S.projeto.id || forcar) {
      if (!(P.projId === S.projeto.id && sujo())) {
        P.projId = S.projeto.id; P.removidos = new Set(); P.imp = null; P.sel = null; P.modo = 'ver'; P.cache = null; P.eixoSujo = false;
        const e = await D.eixo(S.projeto.id);
        P.eixo = e && Array.isArray(e.pts) ? { rodovia: e.rodovia || S.projeto.rodovia || '', kmIni: +e.kmIni || 0, pts: e.pts } : { rodovia: S.projeto.rodovia || '', kmIni: 0, pts: [] };
        P.pins = S.bueiros.filter(b => b.latitude != null && b.longitude != null).map(b => ({ id: b.id, codigo: b.codigo, km: b.km || '', lat: b.latitude, lon: b.longitude, auto: false, novo: false, dirty: false, status: b.status, off: null }));
        if (temEixo()) P.pins.forEach(p => { p.off = projetar(p.lat, p.lon).off; });
      }
    }
    pagina('planejamento', `<div class="linha"><h1>Planejamento do levantamento</h1><span class="esp"></span><span class="muted small" id="pl-fuso">${fusoTxt()}</span></div>
      <div class="plan"><div class="card" style="padding:0;overflow:hidden"><div id="pl-mapa" role="application" aria-label="Mapa do planejamento"></div></div><div id="pl-lateral" class="plan-lat">${painelLateral()}</div></div>`);
    await montarMapa();
  }

  /* ------------------------------------------------------------- eventos */
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-pl]'); if (!b || !P.ctx || !SEL('pl-lateral')) return;
    const k = b.dataset.pl;
    if (k === 'modo-eixo') { P.modo = P.modo === 'eixo' ? 'ver' : 'eixo'; render(); }
    else if (k === 'modo-pin') { P.modo = P.modo === 'pin' ? 'ver' : 'pin'; render(); }
    else if (k === 'eixo-desfazer') { P.eixo.pts.pop(); eixoMudou(); }
    else if (k === 'eixo-limpar') { if (confirm('Apagar o eixo da rodovia? Os nomes já gerados não mudam.')) { P.eixo.pts = []; P.modo = 'ver'; eixoMudou(); } }
    else if (k === 'arquivo') SEL('pl-arq').click();
    else if (k === 'imp-ok') aplicarImportacao();
    else if (k === 'imp-cancel') { P.imp = null; render(); }
    else if (k === 'del') {
      const p = P.pins.find(x => x.id === b.dataset.id); if (!p) return;
      if (!p.novo && !confirm(`Remover o ponto ${p.codigo}? Ele some do projeto quando você salvar.`)) return;
      P.pins = P.pins.filter(x => x !== p); if (!p.novo) P.removidos.add(p.id); render();
    }
    else if (k === 'salvar') salvar();
    else if (k === 'kml') baixarKml();
  });
  document.addEventListener('click', ev => {
    const tr = ev.target.closest('#pl-lista tr[data-pid]'); if (!tr || ev.target.closest('input,button')) return;
    const p = P.pins.find(x => x.id === tr.dataset.pid); if (!p) return;
    P.sel = p.id; atualizarLista(); if (P.mapa) P.mapa.setView([p.lat, p.lon], Math.max(P.mapa.getZoom(), 17));
  });
  document.addEventListener('change', async ev => {
    const el = ev.target; if (!P.ctx || !SEL('pl-lateral')) return;
    if (el.id === 'pl-arq') {
      const f = el.files && el.files[0]; el.value = ''; if (!f) return;
      try { const r = await lerArquivo(f); if (!r.pontos.length && !r.linha) return P.ctx.toast('Nenhum ponto nem linha encontrados nesse arquivo.'); P.imp = r; render(); }
      catch (e) { P.ctx.toast(esc(e.message || e)); }
    } else if (el.id === 'pl-rod') { P.eixo.rodovia = el.value.trim(); P.eixoSujo = true; P.pins.forEach(p => { if (editavel(p) && p.auto) { nomear(p); p.dirty = true; } }); render(); }
    else if (el.id === 'pl-kmini') {
      const m = C.kmParaMetros(el.value); if (m == null) { P.ctx.toast('Km inválido. Use o formato 170+000.'); el.value = C.metrosParaKm(P.eixo.kmIni); return; }
      P.eixo.kmIni = m; P.eixoSujo = true; P.pins.forEach(p => { if (editavel(p) && p.auto) { nomear(p); p.dirty = true; } }); render();
    } else if (el.dataset && el.dataset.plCod) {
      const p = P.pins.find(x => x.id === el.dataset.plCod); if (!p) return;
      const v = el.value.trim(); if (!v) { el.value = p.codigo; return; }
      if (P.pins.some(q => q !== p && q.codigo.toLowerCase() === v.toLowerCase())) { P.ctx.toast('Já existe outro ponto com esse nome.'); el.value = p.codigo; return; }
      p.codigo = v; p.auto = false; p.dirty = true; const k = v.match(/(\d{1,4}\+\d{1,3})/); if (k) p.km = k[1]; atualizarLista(); desenhar();
    }
  });
  document.addEventListener('submit', ev => {
    if (ev.target.id !== 'pl-coord') return;
    ev.preventDefault();
    const v = SEL('pl-ll').value.replace(/;/g, ' ').trim().split(/[\s,]+(?=-?\d)/).map(s => parseFloat(s.replace(',', '.')));
    // aceita "lat, lon" com vírgula decimal ("-22,9068, -43,1729") ou ponto
    const txt = SEL('pl-ll').value.trim(); let la, lo;
    const m = txt.match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
    if (m) { la = parseFloat(m[1].replace(',', '.')); lo = parseFloat(m[2].replace(',', '.')); } else if (v.length === 2) { la = v[0]; lo = v[1]; }
    if (!coordOk(la, lo)) return P.ctx.toast('Coordenada inválida. Use: latitude, longitude (graus decimais).');
    const p = novoPin(la, lo); P.sel = p.id; SEL('pl-ll').value = ''; render(); if (P.mapa) P.mapa.setView([la, lo], 17);
  });
  window.addEventListener('beforeunload', e => { if (SEL('pl-lateral') && sujo()) { e.preventDefault(); e.returnValue = ''; } });

  window.__plan = { P, projetar, eixoGeo, novoPin, nomear };
  window.Planejamento = { view };
})();
