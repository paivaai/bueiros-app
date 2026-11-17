/* folha.js — a folha A3 da prancha no modelo do CAD do cliente (ANTT / Arteris Fluminense) e o DXF correspondente.
   Esquerda/alto: PLANTA GERAL e PLANTA DE DETALHE (norte para cima, com a triangulação dos pontos).
   Embaixo: PERFIL LONGITUDINAL com grade e a tabela de estacas. Direita: notas, legenda, coordenadas, localização,
   revisões e carimbo (logos ANTT, Arteris Fluminense e GFA). Expõe BU.Folha = { svg, dxf, FOCOS }. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, esc = U.esc;
  const SW = 1190, SH = 842;
  const INK = '#16201A', MUTED = '#5C6660', GRID = '#D9DEDA', RED = '#B3261E', PURPLE = '#8E24AA', BLUE = '#1F3A93', MAG = '#C2189A';
  const COR = { gi: '#C0392B', contorno: '#B58900', pista: '#D9822B', terreno: '#1E88C8', rn: '#7B2D8E', outro: '#6B7280' };

  const fmt = (n, d = 2) => BU.Prancha.fmt(n, d);
  const p1 = n => (Math.round(n * 10) / 10).toString();
  const grupo = p => (p === 'gim' || p === 'gij' || p === 'gtz') ? 'gi' : p;
  const tx = (x, y, t, o = {}) => `<text x="${p1(x)}" y="${p1(y)}" font-size="${o.fs || 6}"${o.b ? ' font-weight="700"' : ''} fill="${o.c || INK}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.rot ? ` transform="rotate(${o.rot} ${p1(x)} ${p1(y)})"` : ''}${o.halo ? ' stroke="#fff" stroke-width="2" paint-order="stroke" stroke-linejoin="round"' : ''}>${esc(t)}</text>`;
  const ln = (x1, y1, x2, y2, st = '') => `<line x1="${p1(x1)}" y1="${p1(y1)}" x2="${p1(x2)}" y2="${p1(y2)}" ${st}/>`;
  const box = (x, y, w, h, cor = INK, sw = .8) => `<rect x="${p1(x)}" y="${p1(y)}" width="${p1(w)}" height="${p1(h)}" fill="none" stroke="${cor}" stroke-width="${sw}"/>`;
  function passo(range, alvo) { const b = range / alvo, pot = Math.pow(10, Math.floor(Math.log10(b))), f = b / pot; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pot; }
  const SIMB = (g, x, y, k = 1) => g === 'gi' ? `<rect x="${p1(x - 2.2 * k)}" y="${p1(y - 2.2 * k)}" width="${p1(4.4 * k)}" height="${p1(4.4 * k)}" fill="${COR.gi}" stroke="#fff" stroke-width=".4"/>`
    : g === 'rn' ? `<polygon points="${p1(x)},${p1(y - 3.8 * k)} ${p1(x + 3.4 * k)},${p1(y + 2.6 * k)} ${p1(x - 3.4 * k)},${p1(y + 2.6 * k)}" fill="${COR.rn}" stroke="#fff" stroke-width=".4"/>`
    : g === 'terreno' ? `<polygon points="${p1(x)},${p1(y - 2.4 * k)} ${p1(x + 2.1 * k)},${p1(y + 1.6 * k)} ${p1(x - 2.1 * k)},${p1(y + 1.6 * k)}" fill="${COR.terreno}"/>`
    : `<circle cx="${p1(x)}" cy="${p1(y)}" r="${1.7 * k}" fill="${COR[g] || COR.outro}"/>`;
  const kmTxt = km => { const s = String(km || '').trim(); const m = s.match(/^(\d+)\s*\+\s*(\d+)/); return m ? `${m[1]} + ${m[2]}` : s; };
  const hoje = () => U.dataBR ? U.dataBR(new Date().toISOString().slice(0, 10)) : new Date().toLocaleDateString('pt-BR');

  /* ---------- áreas da folha (unidades do desenho; A3 = 1190 × 842) ---------- */
  const A = {
    p1: { x: 42, y: 26, w: 439, h: 349 }, p2: { x: 495, y: 26, w: 426, h: 349 }, p3: { x: 42, y: 425, w: 879, h: 397 },
    nt: { x: 927, y: 26, w: 249, h: 77 }, lg: { x: 927, y: 107, w: 249, h: 158 }, co: { x: 927, y: 269, w: 249, h: 118 },
    mp: { x: 927, y: 391, w: 249, h: 213 }, rv: { x: 927, y: 608, w: 249, h: 54 }, cb: { x: 927, y: 666, w: 249, h: 156 },
  };
  const FOCOS = { tudo: [0, 0, SW, SH], planta: [34, 18, 454, 372], detalhe: [488, 18, 440, 372], perfil: [34, 418, 894, 412], quadro: [920, 18, 262, 812] };

  /* ---------- geometria ---------- */
  function cantos(m) { // contorno do corpo do bueiro (E,N): montante-esq, jusante-esq, jusante-dir, montante-dir
    const w = m.Wplan / 2, vE = -m.u.N, vN = m.u.E, c = (s, t) => ({ E: m.A.E + m.u.E * s + vE * t, N: m.A.N + m.u.N * s + vN * t });
    return [c(0, w), c(m.L, w), c(m.L, -w), c(0, -w)];
  }
  const pontoEm = (m, s, t) => ({ E: m.A.E + m.u.E * s - m.u.N * t, N: m.A.N + m.u.N * s + m.u.E * t });
  function ligaAlas(m) { // polilinhas das alas/muros de cada boca (ordem do ID)
    const out = [];
    for (const lado of [0, 1]) {
      const c = m.pts.filter(p => p.papel === 'contorno' && ((p.s < m.L / 2) === !lado)).sort((x, y) => (parseFloat(x.id) - parseFloat(y.id)) || 0);
      if (c.length >= 2) out.push(c);
    }
    return out;
  }

  /* Linhas de feição: pontos com o mesmo código ligados na ordem do ID (pista, bordas, talude, terreno), como no CAD. */
  function feicoes(m) {
    const por = new Map();
    for (const p of m.pts) { const g = grupo(p.papel); if (g === 'gi' || g === 'rn' || g === 'contorno') continue; const k = String(p.cod || '').trim().toUpperCase(); if (!k) continue; if (!por.has(k)) por.set(k, []); por.get(k).push(p); }
    const out = [];
    for (const [cod, arr] of por) {
      arr.sort((a, b) => (parseFloat(a.id) - parseFloat(b.id)) || String(a.id).localeCompare(String(b.id)));
      let atual = [arr[0]];
      for (let i = 1; i < arr.length; i++) { if (Math.hypot(arr[i].E - arr[i - 1].E, arr[i].N - arr[i - 1].N) <= 40) atual.push(arr[i]); else { if (atual.length > 1) out.push({ cod, g: grupo(arr[0].papel), pts: atual }); atual = [arr[i]]; } }
      if (atual.length > 1) out.push({ cod, g: grupo(arr[0].papel), pts: atual });
    }
    return out;
  }
  const COR_FEICAO = { pista: '#D9822B', terreno: '#1B9E8A', outro: '#7A7F7C' };

  /* ---------- planta (norte para cima, com triangulação) ---------- */
  function planta(l, m, P, tin, modo) {
    const geral = modo === 'geral', cs = cantos(m);
    let E = cs.map(c => c.E), N = cs.map(c => c.N);
    if (geral) { E = E.concat(m.pts.map(p => p.E)); N = N.concat(m.pts.map(p => p.N)); }
    let e0 = Math.min(...E), e1 = Math.max(...E), n0 = Math.min(...N), n1 = Math.max(...N);
    const mg = geral ? Math.max(4, 0.06 * Math.max(e1 - e0, n1 - n0)) : Math.max(5, 0.4 * m.L);
    e0 -= mg; e1 += mg; n0 -= mg; n1 += mg;
    const R = { x: P.x + 26, y: P.y + 6, w: P.w - 34, h: P.h - 24 }, sc = Math.min(R.w / (e1 - e0), R.h / (n1 - n0)), cE = (e0 + e1) / 2, cN = (n0 + n1) / 2;
    const X = e => R.x + R.w / 2 + (e - cE) * sc, Y = n => R.y + R.h / 2 - (n - cN) * sc;
    const id = 'cp-' + modo;
    let g = `<clipPath id="${id}"><rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}"/></clipPath>` + box(P.x, P.y, P.w, P.h, RED, .9) + `<g clip-path="url(#${id})">`;
    // grade de cruzetas com as coordenadas
    const st = passo(Math.max(R.w, R.h) / sc, 4);
    for (let e = Math.ceil((cE - R.w / 2 / sc) / st) * st; e <= cE + R.w / 2 / sc; e += st) {
      g += tx(X(e), P.y + P.h - 4, fmt(e, 0), { fs: 4.8, c: '#8A8F8C', a: 'middle' });
      for (let n = Math.ceil((cN - R.h / 2 / sc) / st) * st; n <= cN + R.h / 2 / sc; n += st) g += ln(X(e) - 3, Y(n), X(e) + 3, Y(n), 'stroke="#9AA09C" stroke-width=".5"') + ln(X(e), Y(n) - 3, X(e), Y(n) + 3, 'stroke="#9AA09C" stroke-width=".5"');
    }
    for (let n = Math.ceil((cN - R.h / 2 / sc) / st) * st; n <= cN + R.h / 2 / sc; n += st) g += tx(P.x + 9, Y(n), fmt(n, 0), { fs: 4.8, c: '#8A8F8C', a: 'middle', rot: -90 });
    // triangulação
    if (tin) g += `<g stroke="#6F7773" stroke-width="${geral ? .4 : .5}" fill="none">${tin.arestas.map(([a, b]) => ln(X(m.pts[a].E), Y(m.pts[a].N), X(m.pts[b].E), Y(m.pts[b].N))).join('')}</g>`;
    // linhas de feição (pista, bordas, talude)
    for (const f of feicoes(m)) g += `<polyline points="${f.pts.map(p => p1(X(p.E)) + ',' + p1(Y(p.N))).join(' ')}" fill="none" stroke="${COR_FEICAO[f.g] || COR_FEICAO.outro}" stroke-width="${geral ? .7 : .9}" stroke-linejoin="round"/>`;
    // corpo, eixo e arestas do tubo
    g += `<polygon points="${cs.map(c => p1(X(c.E)) + ',' + p1(Y(c.N))).join(' ')}" fill="#CFCFCF" fill-opacity=".92" stroke="#555" stroke-width=".7"/>`;
    const ext = Math.max(4, 0.25 * m.L), a0 = pontoEm(m, -ext, 0), b0 = pontoEm(m, m.L + ext, 0);
    for (const t of [m.H / 2 + m.e / 2, -(m.H / 2 + m.e / 2)]) { const p = pontoEm(m, -ext, t), q = pontoEm(m, m.L + ext, t); g += ln(X(p.E), Y(p.N), X(q.E), Y(q.N), `stroke="${MAG}" stroke-width="${geral ? 1.3 : 1.8}"`); }
    g += ln(X(a0.E), Y(a0.N), X(b0.E), Y(b0.N), `stroke="${MAG}" stroke-width=".6" stroke-dasharray="7 2 1.5 2"`);
    // alas e muros
    for (const c of ligaAlas(m)) g += `<polyline points="${c.map(p => p1(X(p.E)) + ',' + p1(Y(p.N))).join(' ')}" fill="none" stroke="${COR.contorno}" stroke-width="1.3" stroke-linejoin="round"/>`;
    // pontos
    const rot = geral ? m.pts.filter(p => grupo(p.papel) === 'gi' || p.papel === 'rn') : m.pts, curto = m.pts.length > 140;
    for (const p of m.pts) g += SIMB(grupo(p.papel), X(p.E), Y(p.N), geral ? .8 : 1.15);
    for (const p of rot) g += tx(X(p.E) + 3, Y(p.N) - 3, geral ? String(p.id) : (curto ? String(p.id) : `${p.id}  ${fmt(p.Z, 2)}`), { fs: geral ? 4.8 : 4.6, c: grupo(p.papel) === 'gi' ? COR.gi : '#333', halo: 1 });
    g += tx(X(m.A.E) - 4, Y(m.A.N) + 12, 'MONTANTE', { fs: geral ? 6.5 : 7.5, b: 1, a: 'middle', halo: 1 }) + tx(X(m.B.E) + 4, Y(m.B.N) - 8, 'JUSANTE', { fs: geral ? 6.5 : 7.5, b: 1, a: 'middle', halo: 1 });
    // escoamento
    const f1 = pontoEm(m, m.L * 0.3, m.Wplan / 2 + 1.6), f2 = pontoEm(m, m.L * 0.7, m.Wplan / 2 + 1.6);
    g += ln(X(f1.E), Y(f1.N), X(f2.E), Y(f2.N), 'stroke="#2B6CB0" stroke-width="1.2"') + (() => { const x2 = X(f2.E), y2 = Y(f2.N), ang = Math.atan2(Y(f2.N) - Y(f1.N), X(f2.E) - X(f1.E)); const q = (d, a) => `${p1(x2 + d * Math.cos(ang + a))},${p1(y2 + d * Math.sin(ang + a))}`; return `<polygon points="${p1(x2)},${p1(y2)} ${q(-6, .45)} ${q(-6, -.45)}" fill="#2B6CB0"/>`; })();
    g += '</g>';
    // norte (símbolo amarelo, como no modelo) e título + escala gráfica
    const nx = P.x + P.w - 20, ny = P.y + 20;
    g += `<circle cx="${nx}" cy="${ny}" r="9" fill="#F2C200" stroke="#7A6200" stroke-width=".6"/><polygon points="${nx},${ny - 7} ${nx + 3},${ny + 3} ${nx},${ny + 1} ${nx - 3},${ny + 3}" fill="${INK}"/>` + tx(nx, ny + 17, 'N', { fs: 6.5, b: 1, a: 'middle' });
    const razao = 1000 / (sc * (420 / SW)), nice = [20, 25, 50, 75, 100, 150, 200, 250, 300, 500, 750, 1000, 1500, 2000, 2500, 5000], esc_ = nice.find(v => v >= razao) || Math.round(razao);
    const alvo = Math.min(90 / sc, 200), lb = [1, 2, 5, 10, 20, 50, 100].filter(v => v <= alvo).pop() || 1, wB = lb * sc, bx = P.x + P.w - 12 - wB, by = P.y + P.h + 12;
    for (let i = 0; i < 4; i++) g += `<rect x="${p1(bx + i * wB / 4)}" y="${by}" width="${p1(wB / 4)}" height="4" fill="${i % 2 ? '#fff' : INK}" stroke="${INK}" stroke-width=".5"/>`;
    g += tx(bx, by - 2, '0', { fs: 5 }) + tx(bx + wB, by - 2, `${lb} m`, { fs: 5, a: 'middle' }) + tx(bx + wB, by + 13, `ESC. APROX. 1:${esc_} (A3)`, { fs: 5, c: MUTED, a: 'end' });
    g += `<circle cx="${P.x + 8}" cy="${P.y + P.h + 12}" r="5" fill="none" stroke="${RED}" stroke-width=".8"/><circle cx="${P.x + 8}" cy="${P.y + P.h + 12}" r="2" fill="#18A0C8"/>`
      + tx(P.x + 18, P.y + P.h + 12, geral ? 'PLANTA GERAL DO LEVANTAMENTO' : 'PLANTA DE DETALHE DO BUEIRO', { fs: 8, b: 1, c: '#0B7C99' }) + tx(P.x + 18, P.y + P.h + 22, `COORDENADAS UTM · SIRGAS 2000 · FUSO ${l.zona || ''}${l.hemisferio || 'S'} · NORTE PARA CIMA`, { fs: 5.2, c: '#9A8200' });
    return g;
  }

  /* ---------- perfil longitudinal ---------- */
  function perfil(l, m, P) {
    const nl = m.linha, tab = 5, rh = 17, th = tab * rh;
    const R = { x: P.x + 112, y: P.y + 52, w: P.w - 112 - 18, h: P.h - 52 - th - 40 };
    const xMin = Math.min(-2, ...nl.map(p => p.s)) - 1, xMax = Math.max(m.L + 2, ...nl.map(p => p.s)) + 1;
    const zs = [m.A.Z - m.e, m.B.Z - m.e, m.A.Z + m.H + m.e, m.B.Z + m.H + m.e, ...nl.map(p => p.Z)], zMin = Math.min(...zs) - 0.4, zMax = Math.max(...zs) + 0.8;
    const sx = R.w / (xMax - xMin); let sy = R.h / (zMax - zMin); sy = Math.min(sy, sx * 8);
    const hh = (zMax - zMin) * sy, ex = sy / sx, X = s => R.x + (s - xMin) * sx, Y = z => R.y + R.h - (z - zMin) * sy;
    const yBase = R.y + R.h; // fundo do gráfico (a grade usa a altura cheia; o desenho fica encostado embaixo)
    void hh;
    let g = box(P.x, P.y, P.w, P.h, RED, .9) + `<clipPath id="cp-pf"><rect x="${R.x - 2}" y="${R.y - 22}" width="${R.w + 4}" height="${R.h + 24}"/></clipPath>`;
    g += `<pattern id="hach" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="${MAG}" stroke-width=".6"/></pattern>`;
    const pz = passo(zMax - zMin, Math.max(4, Math.round(R.h / 22))), px = passo(xMax - xMin, 14);
    for (let z = Math.ceil(zMin / pz) * pz; z <= zMax + 1e-9; z += pz) g += ln(R.x, Y(z), R.x + R.w, Y(z), `stroke="${GRID}" stroke-width=".6"`) + tx(R.x - 4, Y(z) + 2, fmt(z, pz < 1 ? 1 : 0), { fs: 5.2, c: MUTED, a: 'end' });
    for (let x = Math.ceil(xMin / px) * px; x <= xMax + 1e-9; x += px) g += ln(X(x), R.y, X(x), yBase, `stroke="${GRID}" stroke-width=".6"`);
    g += box(R.x, R.y, R.w, R.h, '#9AA09C', .6) + `<g clip-path="url(#cp-pf)">`;
    const L = m.L, e = m.e, H = m.H, poly = pts => pts.map(q => p1(X(q[0])) + ',' + p1(Y(q[1]))).join(' ');
    g += `<polygon points="${poly([[0, m.A.Z - e], [L, m.B.Z - e], [L, m.B.Z + H + e], [0, m.A.Z + H + e]])}" fill="url(#hach)" stroke="${MAG}" stroke-width="1"/>`
      + `<polygon points="${poly([[0, m.A.Z], [L, m.B.Z], [L, m.B.Z + H], [0, m.A.Z + H]])}" fill="#fff" fill-opacity=".85" stroke="${MAG}" stroke-width=".6"/>`
      + ln(X(0), Y(m.A.Z), X(L), Y(m.B.Z), `stroke="${COR.gi}" stroke-width="1.8"`);
    g += tx(X(0) - 3, Y(m.A.Z) + 10, `GI ${fmt(m.A.Z, 3)}`, { fs: 6, b: 1, c: COR.gi, a: 'end', halo: 1 }) + tx(X(L) + 3, Y(m.B.Z) + 10, `GI ${fmt(m.B.Z, 3)}`, { fs: 6, b: 1, c: COR.gi, halo: 1 });
    if (m.seLinha && nl.length > 1) g += `<polyline points="${nl.map(p => p1(X(p.s)) + ',' + p1(Y(p.Z))).join(' ')}" fill="none" stroke="#8A5A00" stroke-width="1.3" stroke-linejoin="round"/>`;
    let ult = -1e9;
    for (const p of (m.pontosEixo || [])) { g += `<circle cx="${p1(X(p.s))}" cy="${p1(Y(p.Z))}" r="1.5" fill="#fff" stroke="#8A5A00" stroke-width=".8"/>`; if (X(p.s) - ult >= 9) { g += tx(X(p.s) + 1.5, Y(p.Z) - 4, `${p.id}  ${fmt(p.Z, 3)}`, { fs: 4.6, c: '#444', rot: -90 }); ult = X(p.s); } }
    if (m.cob && m.cob.valor > 0) {
      const xc = X(m.cob.s), yT = Y(m.inv(m.cob.s) + H + e), yP = Y(m.cob.zTopoPista);
      g += ln(xc, yT, xc, yP, `stroke="${PURPLE}" stroke-width="1.2"`) + ln(xc - 3, yT, xc + 3, yT, `stroke="${PURPLE}" stroke-width="1.2"`) + ln(xc - 3, yP, xc + 3, yP, `stroke="${PURPLE}" stroke-width="1.2"`)
        + tx(xc - 5, (yT + yP) / 2 + 2, `recobrimento ${fmt(m.cob.valor, 2)} m`, { fs: 6.5, b: 1, c: PURPLE, a: 'end', halo: 1 });
    }
    g += tx(X(L / 2), Y(m.A.Z + (m.B.Z - m.A.Z) / 2 - e) + 14, `L = ${fmt(L, 2)} m · i = ${fmt(m.decl, 2)} % · ${m.dims ? m.dims.rotulo : 'H = ' + fmt(H, 2) + ' m'}`, { fs: 7, b: 1, a: 'middle', halo: 1 });
    g += '</g>';
    // título e escala
    g += `<circle cx="${P.x + 10}" cy="${P.y + 14}" r="5" fill="none" stroke="${RED}" stroke-width=".8"/><circle cx="${P.x + 10}" cy="${P.y + 14}" r="2" fill="#18A0C8"/>`
      + tx(P.x + 20, P.y + 16, 'PERFIL LONGITUDINAL PELO EIXO DO BUEIRO', { fs: 9, b: 1, c: '#0B7C99' })
      + tx(P.x + 20, P.y + 27, `EXAGERO VERTICAL ${String(ex.toFixed(1)).replace('.', ',')}× · DISTÂNCIAS A PARTIR DA GERATRIZ INFERIOR DE MONTANTE · COTAS EM METROS`, { fs: 5.2, c: '#9A8200' });
    // tabela de estacas
    const terrenoEm = s => { if (!nl.length) return null; if (s <= nl[0].s) return nl[0].Z; for (let i = 1; i < nl.length; i++) if (s <= nl[i].s) { const a = nl[i - 1], b = nl[i]; return b.s === a.s ? b.Z : a.Z + (b.Z - a.Z) * (s - a.s) / (b.s - a.s); } return nl[nl.length - 1].Z; };
    const passoE = L <= 12 ? 2 : L <= 30 ? 5 : L <= 80 ? 10 : 20, ests = new Set([0, +L.toFixed(3)]);
    for (let s = passoE; s < L - passoE * 0.35; s += passoE) ests.add(+s.toFixed(3));
    const sel = [...ests].sort((a, b) => a - b).map(s => ({ s, fixo: s === 0 || s === +L.toFixed(3) }));
    const ty = P.y + P.h - th - 22, rot = ['ESTACA / DIST. (m)', 'COTA DO TERRENO (m)', 'COTA GERATRIZ INF. (m)', 'RECOBRIMENTO (m)', 'DECLIVIDADE (%)'];
    g += box(P.x + 8, ty, R.x + R.w - P.x - 8, th, '#888', .6);
    rot.forEach((t, i) => { g += tx(P.x + 12, ty + i * rh + 11, t, { fs: 5.4, b: 1, c: '#0B7C99' }) + (i ? ln(P.x + 8, ty + i * rh, R.x + R.w, ty + i * rh, 'stroke="#BBB" stroke-width=".5"') : ''); });
    g += ln(R.x - 6, ty, R.x - 6, ty + th, 'stroke="#888" stroke-width=".6"');
    for (const c of sel) {
      const x = X(c.s), dentro = c.s >= -1e-6 && c.s <= L + 1e-6, Zt = terrenoEm(c.s), inv = dentro ? m.inv(c.s) : null;
      const rec = dentro && Zt != null ? Zt - (inv + H + e) : null;
      g += ln(x, yBase, x, ty, 'stroke="#C9CECB" stroke-width=".4" stroke-dasharray="1.5 2"');
      const v = [fmt(c.s, 1), Zt != null ? fmt(Zt, 3) : '—', inv != null ? fmt(inv, 3) : '—', rec != null && rec > 0 ? fmt(rec, 2) : '—', dentro ? fmt(m.decl, 2) : '—'];
      v.forEach((t, i) => { g += tx(x, ty + i * rh + 11, t, { fs: 5, a: 'middle', b: c.fixo }); });
    }
    g += tx(P.x + 12, P.y + P.h - 9, 'GI = geratriz inferior. Terreno interpolado na triangulação dos pontos levantados, ao longo do eixo; estacas a cada ' + String(passoE).replace('.', ',') + ' m.', { fs: 5, c: MUTED });
    return g;
  }

  /* ---------- coluna da direita ---------- */
  const titulo = (P, t, cor = PURPLE) => box(P.x, P.y, P.w, P.h, cor, .8) + tx(P.x + P.w / 2, P.y + 11, t, { fs: 7, b: 1, c: '#0B7C99', a: 'middle' }) + ln(P.x, P.y + 15, P.x + P.w, P.y + 15, `stroke="${cor}" stroke-width=".5"`);
  function quebrar(t, n) { const o = []; let c = ''; for (const w of String(t).split(/\s+/)) { if ((c + ' ' + w).trim().length > n && c) { o.push(c); c = w; } else c = (c + ' ' + w).trim(); } if (c) o.push(c); return o; }

  function notas(l, m) {
    const P = A.nt, u = BU.GPS.utmDe(l);
    const N = [`Coordenadas UTM, SIRGAS 2000${u ? ', ' + BU.GPS.rotuloUTM(u).replace(' · SIRGAS 2000', '') : ''}. Cotas e dimensões em metros.`,
      `Levantamento RTK${l.data ? ' em ' + U.dataBR(l.data) : ''}${l.equipe ? ' (' + l.equipe + ')' : ''}; ${m.pts.length} pontos.`,
      'Comprimento e declividade medidos de geratriz inferior a geratriz inferior.', 'Escalas aproximadas para a folha A3.'];
    let g = titulo(P, 'NOTAS'), y = P.y + 24;
    N.forEach((t, i) => quebrar(t, 56).forEach((ln_, j) => { if (y < P.y + P.h - 2) { g += tx(P.x + 6, y, (j ? '   ' : (i + 1) + '. ') + ln_, { fs: 5.2 }); y += 8; } }));
    return g;
  }
  function legenda() {
    const P = A.lg; let g = titulo(P, 'LEGENDA'), y = P.y + 27;
    const it = [['l', MAG, 'Eixo do bueiro'], ['r', '#CFCFCF', 'Corpo do bueiro (planta)'], ['p', COR.contorno, 'Ala / muro de boca'], ['s', 'gi', 'Geratriz inferior (GI)'], ['s', 'terreno', 'Ponto de terreno'],
      ['s', 'pista', 'Ponto de pista'], ['s', 'rn', 'RN — referência de nível'], ['t', '#6F7773', 'Triangulação dos pontos'], ['q', '#D9822B', 'Linha de pista / borda'], ['q', '#1B9E8A', 'Linha de terreno / talude'], ['q', '#8A5A00', 'Terreno no perfil'], ['q', COR.gi, 'GI no perfil']];
    it.forEach(([k, c, t], i) => {
      const col = i % 2, row = i >> 1, x = P.x + 8 + col * 122, yy = y + row * 18;
      g += k === 's' ? SIMB(c, x + 8, yy - 2, 1.2) : k === 'r' ? `<rect x="${x}" y="${yy - 6}" width="16" height="9" fill="${c}" stroke="#555" stroke-width=".6"/>` : `${ln(x, yy - 2, x + 16, yy - 2, `stroke="${c}" stroke-width="${k === 'l' ? 1.2 : 1.4}" ${k === 'l' ? 'stroke-dasharray="6 2 1.5 2"' : ''}`)}`;
      g += quebrar(t, 20).map((s, j) => tx(x + 21, yy + j * 7, s, { fs: 5.2 })).join('');
    });
    return g;
  }
  function coordenadas(m) {
    const P = A.co; let g = titulo(P, 'COORDENADAS DAS GERATRIZES E RN'); const cx = [P.x + 5, P.x + 38, P.x + 100, P.x + 168, P.x + 212];
    ['Ponto', 'Este (m)', 'Norte (m)', 'Cota (m)'].forEach((t, i) => { g += tx(cx[i], P.y + 25, t, { fs: 5, b: 1, c: MUTED }); });
    g += ln(P.x + 3, P.y + 27, P.x + P.w - 3, P.y + 27, 'stroke="#CCC" stroke-width=".5"');
    const gi = m.pts.filter(p => grupo(p.papel) === 'gi' && /GTZ|GI/i.test(String(p.ref || p.cod))).sort((a, b) => String(a.ref || '').localeCompare(String(b.ref || ''), 'pt', { numeric: true }));
    const lista = [...gi.filter(p => p.ref), ...(gi.some(p => p.ref) ? [] : [m.A, m.B].map((q, i) => ({ id: q.id || (i ? 'GI JUS' : 'GI MONT'), E: q.E, N: q.N, Z: q.Z, ref: i ? 'jusante' : 'montante' })))].slice(0, 9);
    if (m.rn) lista.push({ id: m.rn.id, E: m.rn.E, N: m.rn.N, Z: m.rn.Z, ref: 'RN' });
    lista.slice(0, 10).forEach((p, i) => { const y = P.y + 36 + i * 8.2, nome = p.ref === 'RN' ? 'RN ' + p.id : String(p.ref || '').replace('montante', 'MONT').replace('jusante', 'JUS').replace('GTZ-', 'GI ') || 'GI ' + p.id; g += tx(cx[0], y, nome, { fs: 5, b: 1 }) + tx(cx[1], y, fmt(p.E, 3), { fs: 5 }) + tx(cx[2], y, fmt(p.N, 3), { fs: 5 }) + tx(cx[3], y, fmt(p.Z, 3), { fs: 5 }); });
    return g;
  }
  function mapa(l) {
    const P = A.mp; let g = titulo(P, 'MAPA DE LOCALIZAÇÃO');
    const cy = P.y + 80, cx = P.x + 120;
    g += `<rect x="${P.x + 6}" y="${P.y + 20}" width="${P.w - 12}" height="120" fill="#F2F5F2" stroke="${GRID}" stroke-width=".6"/>`
      + `<path d="M ${P.x + 6} ${cy + 36} C ${P.x + 70} ${cy + 22}, ${P.x + 130} ${cy - 22}, ${P.x + P.w - 6} ${cy - 38}" fill="none" stroke="#9AA39C" stroke-width="7" stroke-linecap="round"/><path d="M ${P.x + 6} ${cy + 36} C ${P.x + 70} ${cy + 22}, ${P.x + 130} ${cy - 22}, ${P.x + P.w - 6} ${cy - 38}" fill="none" stroke="#fff" stroke-width=".8" stroke-dasharray="5 4"/>`
      + `<circle cx="${cx}" cy="${cy - 2}" r="5" fill="${COR.gi}" stroke="#fff" stroke-width="1.2"/>` + tx(cx, cy - 11, l.codigo || 'Bueiro', { fs: 6.5, b: 1, a: 'middle', halo: 1 })
      + tx(P.x + 12, P.y + 33, (l.estrada || 'Rodovia') + (l.km ? ' · km ' + l.km : ''), { fs: 6.5, b: 1, halo: 1 }) + tx(P.x + P.w - 10, P.y + 134, 'esquema sem escala', { fs: 4.6, c: MUTED, a: 'end' });
    const u = BU.GPS.utmDe(l), Lx = [['MUNICÍPIO / UF', [l.municipio, l.estado].filter(Boolean).join(' / ') || '—'], ['LATITUDE / LONGITUDE', l.latitude != null ? `${fmt(l.latitude, 6)} / ${fmt(l.longitude, 6)}` : '—'], ['UTM (E / N)', u ? `${fmt(u.E, 1)} / ${fmt(u.N, 1)}` : '—'], ['PISTA / LADO', [l.pistaGe, l.lado].filter(Boolean).join(' / ') || '—']];
    Lx.forEach(([k, v], i) => { const x = P.x + 8 + (i % 2) * 124, y = P.y + 154 + (i >> 1) * 26; g += tx(x, y, k, { fs: 4.6, b: 1, c: MUTED }) + tx(x, y + 9, String(v).slice(0, 30), { fs: 5.8, b: 1 }); });
    return g;
  }
  function revisoes(l) {
    const P = A.rv, cx = [P.x, P.x + 24, P.x + 120, P.x + 168]; let g = box(P.x, P.y, P.w, P.h, '#B58900', .8);
    ['REV.', 'DESCRIÇÃO', 'DATA', 'RESP. TÉCNICO / PROJETISTA'].forEach((t, i) => { g += tx(cx[i] + 3, P.y + 9, t, { fs: 4.6, b: 1, c: MUTED }); });
    g += ln(P.x, P.y + 13, P.x + P.w, P.y + 13, 'stroke="#B58900" stroke-width=".5"') + ln(P.x, P.y + 33, P.x + P.w, P.y + 33, 'stroke="#B58900" stroke-width=".5"');
    cx.slice(1).forEach(x => { g += ln(x, P.y, x, P.y + P.h, 'stroke="#B58900" stroke-width=".5"'); });
    const L = BU.Prancha.logos ? BU.Prancha.logos() : {};
    g += tx(P.x + 4, P.y + 25, '00', { fs: 6, b: 1 }) + tx(cx[1] + 3, P.y + 25, 'EMISSÃO INICIAL', { fs: 5.6, b: 1 }) + tx(cx[2] + 3, P.y + 25, hoje(), { fs: 5.6, b: 1 }) + tx(cx[3] + 3, P.y + 25, String(l.responsavel || 'GFA').slice(0, 22), { fs: 5.6, b: 1 });
    void L; return g;
  }
  function carimbo(l, m) {
    const P = A.cb, Lg = BU.Prancha.logos ? BU.Prancha.logos() : {}; let g = box(P.x, P.y, P.w, P.h, BLUE, 1);
    const hl = 46; g += ln(P.x + P.w / 2, P.y, P.x + P.w / 2, P.y + hl, `stroke="${BLUE}" stroke-width=".8"`) + ln(P.x, P.y + hl, P.x + P.w, P.y + hl, `stroke="${BLUE}" stroke-width=".8"`);
    if (Lg.antt) g += `<image href="${Lg.antt}" x="${P.x + 14}" y="${P.y + 8}" width="${P.w / 2 - 28}" height="${hl - 16}" preserveAspectRatio="xMidYMid meet"/>`;
    if (Lg.arteris) g += `<image href="${Lg.arteris}" x="${P.x + P.w / 2 + 14}" y="${P.y + 5}" width="${P.w / 2 - 28}" height="${hl - 10}" preserveAspectRatio="xMidYMid meet"/>`;
    let y = P.y + hl + 10;
    g += tx(P.x + 6, y, 'PROJETISTA:', { fs: 6, b: 1, c: '#9A8200' }) + tx(P.x + 66, y, 'GFA', { fs: 8, b: 1, c: '#0B7C99' });
    if (Lg.gfa) g += `<image href="${Lg.gfa}" x="${P.x + P.w - 44}" y="${y - 10}" width="38" height="20" preserveAspectRatio="xMidYMid meet"/>`;
    y += 14; g += tx(P.x + 6, y, 'TÍTULO:', { fs: 6, b: 1, c: '#9A8200' });
    const rod = [l.estrada || 'BR-101', l.km ? 'KM ' + kmTxt(l.km) : ''].filter(Boolean).join(' ');
    g += tx(P.x + 50, y, rod, { fs: 7.5, b: 1, c: '#0B7C99' }) + tx(P.x + 50, y + 9, 'ESTUDOS TOPOGRÁFICOS', { fs: 5.8, b: 1, c: '#0B7C99' }) + quebrar('LEVANTAMENTO CADASTRAL DE BUEIRO - PLANTA E PERFIL', 38).map((s, i) => tx(P.x + 50, y + 18 + i * 8, s, { fs: 5.8, b: 1, c: '#0B7C99' })).join('');
    y = P.y + P.h - 38; g += ln(P.x, y - 8, P.x + P.w, y - 8, `stroke="${BLUE}" stroke-width=".6"`);
    const cel = (x, yy, k, v) => tx(x, yy, k, { fs: 4.4, b: 1, c: '#9A8200' }) + tx(x, yy + 8, String(v || '—').slice(0, 26), { fs: 6.2, b: 1 });
    g += cel(P.x + 6, y, 'BUEIRO', l.codigo || 'Sem código') + cel(P.x + 90, y, 'DATA DO LEVANTAMENTO', U.dataBR(l.data)) + cel(P.x + 180, y, 'FOLHA', '01 / 01')
      + cel(P.x + 6, y + 20, 'MUNICÍPIO / UF', [l.municipio, l.estado].filter(Boolean).join(' / ')) + cel(P.x + 90, y + 20, 'REFERENCIAL', 'SIRGAS 2000 · UTM') + cel(P.x + 180, y + 20, 'FORMATO', 'A3');
    void m; return g;
  }

  /* ---------- a folha ---------- */
  function svg(l, { foco = 'tudo' } = {}) {
    const m = BU.Prancha.modelo(l); if (!m) return '';
    let tin = null; try { tin = m.pts.length >= 3 ? BU.TIN.triangular(m.pts) : null; } catch (e) { tin = null; }
    const v = FOCOS[foco] || FOCOS.tudo;
    const aviso = m.modo === 'estimado' ? tx(A.p1.x + 6, A.p1.y + 12, 'Eixo estimado: não achei GI MONT / GI JUS nem geratrizes. Use esses códigos no RTK.', { fs: 6, b: 1, c: '#B45309' }) : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.join(' ')}" width="${v[2]}" height="${v[3]}" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Folha da prancha: plantas, perfil longitudinal, legenda, coordenadas e carimbo do bueiro">
<rect x="0" y="0" width="${SW}" height="${SH}" fill="#fff"/><rect x="5" y="5" width="${SW - 10}" height="${SH - 10}" fill="none" stroke="${BLUE}" stroke-width="1.1"/><rect x="34" y="14" width="1143" height="812" fill="none" stroke="${BLUE}" stroke-width=".8"/>
${planta(l, m, A.p1, tin, 'geral')}${planta(l, m, A.p2, tin, 'detalhe')}${perfil(l, m, A.p3)}${notas(l, m)}${legenda()}${coordenadas(m)}${mapa(l)}${revisoes(l)}${carimbo(l, m)}${aviso}</svg>`;
  }

  /* ---------- DXF (R12, ASCII): planta em UTM real com triangulação, alas, corpo, eixo e perfil logo abaixo ---------- */
  function dxf(l) {
    const m = BU.Prancha.modelo(l); if (!m) return '';
    const sem = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');
    const CAM = { TIN: 8, CORPO: 8, EIXO: 6, BUEIRO: 6, ALAS: 2, PTS_GI: 1, PTS_PISTA: 30, PTS_TERRENO: 5, PTS_RN: 6, PTS_OUTROS: 8, LINHAS_PISTA: 30, LINHAS_TERRENO: 4, LINHAS_OUTROS: 8, TEXTO: 7, GRADE: 9, PERFIL_BUEIRO: 6, PERFIL_HACHURA: 6, PERFIL_TERRENO: 30, PERFIL_GI: 1, PERFIL_TEXTO: 7, TABELA: 7, CARIMBO: 4 };
    const mapaCam = { gi: 'PTS_GI', contorno: 'ALAS', pista: 'PTS_PISTA', terreno: 'PTS_TERRENO', rn: 'PTS_RN', outro: 'PTS_OUTROS' };
    const E = m.pts.map(p => p.E), N = m.pts.map(p => p.N), e0 = Math.min(...E), e1 = Math.max(...E), n0 = Math.min(...N), n1 = Math.max(...N), ext = Math.max(e1 - e0, n1 - n0, 10);
    const h = Math.min(1.2, Math.max(0.16, ext / 120)); // altura dos textos
    const o = []; const par = (c, v) => o.push(String(c), String(v)); const f = n => (+n).toFixed(3);
    par(0, 'SECTION'); par(2, 'HEADER'); par(9, '$ACADVER'); par(1, 'AC1009'); par(9, '$INSUNITS'); par(70, 6); par(9, '$PDMODE'); par(70, 35); par(9, '$PDSIZE'); par(40, f(h * 0.7)); par(0, 'ENDSEC');
    par(0, 'SECTION'); par(2, 'TABLES'); par(0, 'TABLE'); par(2, 'LAYER'); par(70, Object.keys(CAM).length + 1); par(0, 'LAYER'); par(2, '0'); par(70, 0); par(62, 7); par(6, 'CONTINUOUS');
    for (const k in CAM) { par(0, 'LAYER'); par(2, k); par(70, 0); par(62, CAM[k]); par(6, 'CONTINUOUS'); }
    par(0, 'ENDTAB'); par(0, 'ENDSEC'); par(0, 'SECTION'); par(2, 'ENTITIES');
    const LINE = (c, a, b) => { par(0, 'LINE'); par(8, c); par(10, f(a[0])); par(20, f(a[1])); par(30, 0); par(11, f(b[0])); par(21, f(b[1])); par(31, 0); };
    const TEXT = (c, x, y, ht, t, rot) => { par(0, 'TEXT'); par(8, c); par(10, f(x)); par(20, f(y)); par(30, 0); par(40, f(ht)); par(1, sem(t)); if (rot) par(50, rot); };
    const POLI = (c, arr, fechada) => { par(0, 'POLYLINE'); par(8, c); par(66, 1); par(70, fechada ? 1 : 0); arr.forEach(q => { par(0, 'VERTEX'); par(8, c); par(10, f(q[0])); par(20, f(q[1])); par(30, 0); }); par(0, 'SEQEND'); par(8, c); };
    const PT = (c, x, y, z) => { par(0, 'POINT'); par(8, c); par(10, f(x)); par(20, f(y)); par(30, f(z)); };
    // triangulação como superfície (3DFACE com as cotas reais)
    let tin = null; try { tin = m.pts.length >= 3 ? BU.TIN.triangular(m.pts) : null; } catch (er) { tin = null; }
    if (tin) tin.tri.forEach(t => { const [a, b, c] = t.map(i => m.pts[i]); par(0, '3DFACE'); par(8, 'TIN'); [[10, a], [11, b], [12, c], [13, c]].forEach(([g0, p]) => { par(g0, f(p.E)); par(g0 + 10, f(p.N)); par(g0 + 20, f(p.Z)); }); });
    // corpo do bueiro (sólido cinza), eixo e arestas do tubo
    const cs = cantos(m); par(0, 'SOLID'); par(8, 'CORPO'); [[10, cs[0]], [11, cs[1]], [12, cs[3]], [13, cs[2]]].forEach(([g0, p]) => { par(g0, f(p.E)); par(g0 + 10, f(p.N)); par(g0 + 20, 0); });
    POLI('CORPO', cs.map(c => [c.E, c.N]), true);
    const ext2 = Math.max(4, 0.25 * m.L), ax = (t, s0, s1) => [pontoEm(m, s0, t), pontoEm(m, s1, t)].map(p => [p.E, p.N]);
    LINE('EIXO', ...ax(0, -ext2, m.L + ext2)); for (const t of [m.H / 2 + m.e / 2, -(m.H / 2 + m.e / 2)]) LINE('BUEIRO', ...ax(t, -ext2, m.L + ext2));
    for (const c of ligaAlas(m)) POLI('ALAS', c.map(p => [p.E, p.N]), false);
    for (const fe of feicoes(m)) POLI(fe.g === 'pista' ? 'LINHAS_PISTA' : fe.g === 'terreno' ? 'LINHAS_TERRENO' : 'LINHAS_OUTROS', fe.pts.map(p => [p.E, p.N]), false);
    for (const p of m.pts) { PT(mapaCam[grupo(p.papel)] || 'PTS_OUTROS', p.E, p.N, p.Z); TEXT('TEXTO', p.E + h * 0.4, p.N + h * 0.4, h * 0.8, `${p.id} ${f(p.Z)}${p.cod ? ' ' + p.cod : ''}`); }
    TEXT('TEXTO', pontoEm(m, 0, 0).E - h * 6, pontoEm(m, 0, 0).N + h * 2, h * 1.4, 'MONTANTE'); TEXT('TEXTO', pontoEm(m, m.L, 0).E + h, pontoEm(m, m.L, 0).N + h * 2, h * 1.4, 'JUSANTE');
    TEXT('TEXTO', e0, n1 + h * 3, h * 2, `${l.codigo || ''}  PLANTA - UTM SIRGAS 2000 - L=${fmt(m.L, 2)} m  i=${fmt(m.decl, 2)} %`);
    // perfil, logo abaixo da planta (mesma escala horizontal; vertical exagerado)
    const nl = m.linha, sMin = Math.min(-2, ...nl.map(p => p.s)) - 1, sMax = Math.max(m.L + 2, ...nl.map(p => p.s)) + 1;
    const zs = [m.A.Z - m.e, m.B.Z - m.e, m.A.Z + m.H + m.e, ...nl.map(p => p.Z)], zMin = Math.min(...zs) - 0.5, zMax = Math.max(...zs) + 1;
    const EX = Math.max(2, Math.min(10, Math.round((0.28 * (sMax - sMin)) / Math.max(zMax - zMin, 0.5)))), hProf = (zMax - zMin) * EX, linhaH = h * 3.2;
    const x0 = e0 + Math.max(0, ((e1 - e0) - (sMax - sMin)) / 2) - sMin, base = n0 - 6 * h - hProf - 10 * h; // x0 + s ; y de zMin = base
    const X = s => x0 + s, Y = z => base + (z - zMin) * EX;
    TEXT('PERFIL_TEXTO', X(sMin), Y(zMax) + h * 4, h * 2, `PERFIL LONGITUDINAL - EXAGERO VERTICAL ${EX}x`);
    const pz = passo(zMax - zMin, 6), px = passo(sMax - sMin, 12);
    for (let z = Math.ceil(zMin / pz) * pz; z <= zMax; z += pz) { LINE('GRADE', [X(sMin), Y(z)], [X(sMax), Y(z)]); TEXT('PERFIL_TEXTO', X(sMin) - h * 5, Y(z) - h * 0.4, h * 0.9, fmt(z, 1)); }
    for (let s = Math.ceil(sMin / px) * px; s <= sMax; s += px) { LINE('GRADE', [X(s), Y(zMin)], [X(s), Y(zMax)]); TEXT('PERFIL_TEXTO', X(s) - h, Y(zMin) - h * 2, h * 0.9, fmt(s, 0)); }
    const L = m.L, H = m.H, e = m.e;
    POLI('PERFIL_BUEIRO', [[X(0), Y(m.A.Z - e)], [X(L), Y(m.B.Z - e)], [X(L), Y(m.B.Z + H + e)], [X(0), Y(m.A.Z + H + e)]], true);
    POLI('PERFIL_BUEIRO', [[X(0), Y(m.A.Z)], [X(L), Y(m.B.Z)], [X(L), Y(m.B.Z + H)], [X(0), Y(m.A.Z + H)]], true);
    const bx = z => (s => [Y(m.A.Z + (m.B.Z - m.A.Z) * s / L + z)]);
    for (let s = 0; s < L; s += Math.max(0.6, L / 40)) { const s2 = Math.min(L, s + (H + 2 * e) * 0.6), a = Y(m.A.Z + (m.B.Z - m.A.Z) * s / L - e), b = Y(m.A.Z + (m.B.Z - m.A.Z) * s2 / L + H + e); LINE('PERFIL_HACHURA', [X(s), a], [X(s2), b]); }
    void bx;
    LINE('PERFIL_GI', [X(0), Y(m.A.Z)], [X(L), Y(m.B.Z)]); TEXT('PERFIL_GI', X(0) - h * 8, Y(m.A.Z), h, `GI ${f(m.A.Z)}`); TEXT('PERFIL_GI', X(L) + h, Y(m.B.Z), h, `GI ${f(m.B.Z)}`);
    if (m.seLinha && nl.length > 1) POLI('PERFIL_TERRENO', nl.map(p => [X(p.s), Y(p.Z)]), false);
    (m.pontosEixo || []).forEach(p => { PT('PERFIL_TERRENO', X(p.s), Y(p.Z), 0); TEXT('PERFIL_TEXTO', X(p.s) + h * 0.3, Y(p.Z) + h * 0.8, h * 0.7, `${p.id} ${f(p.Z)}`, 90); });
    if (m.cob && m.cob.valor > 0) { const s = m.cob.s; LINE('PERFIL_TEXTO', [X(s), Y(m.inv(s) + H + e)], [X(s), Y(m.cob.zTopoPista)]); TEXT('PERFIL_TEXTO', X(s) + h * 0.6, (Y(m.inv(s) + H + e) + Y(m.cob.zTopoPista)) / 2, h, `recobrimento ${fmt(m.cob.valor, 2)} m`); }
    // tabela de estacas
    const terrenoEm = s => { if (!nl.length) return null; if (s <= nl[0].s) return nl[0].Z; for (let i = 1; i < nl.length; i++) if (s <= nl[i].s) { const a = nl[i - 1], b = nl[i]; return b.s === a.s ? b.Z : a.Z + (b.Z - a.Z) * (s - a.s) / (b.s - a.s); } return nl[nl.length - 1].Z; };
    const passoE = L <= 12 ? 2 : L <= 30 ? 5 : L <= 80 ? 10 : 20, ests = new Set([0, +L.toFixed(3)]); for (let s = passoE; s < L - passoE * 0.35; s += passoE) ests.add(+s.toFixed(3));
    const cols = [...ests].sort((a, b) => a - b).map(s => ({ s })), lab = ['ESTACA (m)', 'COTA TERRENO', 'COTA GI', 'RECOBRIMENTO', 'DECLIVIDADE %'], yT = Y(zMin) - h * 5;
    lab.forEach((t, i) => { LINE('TABELA', [X(sMin), yT - i * linhaH], [X(sMax), yT - i * linhaH]); TEXT('TABELA', X(sMin) - h * 12, yT - i * linhaH - linhaH * 0.7, h * 0.8, t); }); LINE('TABELA', [X(sMin), yT - 5 * linhaH], [X(sMax), yT - 5 * linhaH]);
    let ult = -1e9; for (const c of cols) {
      ult = c.s;
      const dentro = c.s >= 0 && c.s <= L, Zt = terrenoEm(c.s), inv = dentro ? m.inv(c.s) : null, rec = dentro && Zt != null ? Zt - (inv + H + e) : null;
      [fmt(c.s, 1), Zt != null ? fmt(Zt, 3) : '-', inv != null ? fmt(inv, 3) : '-', rec != null && rec > 0 ? fmt(rec, 2) : '-', dentro ? fmt(m.decl, 2) : '-'].forEach((t, i) => TEXT('TABELA', X(c.s) - h * 1.4, yT - i * linhaH - linhaH * 0.7, h * 0.75, t));
      LINE('TABELA', [X(c.s), yT - 5 * linhaH], [X(c.s), yT]);
    }
    // carimbo (texto)
    const yc = yT - 5 * linhaH - h * 5, rod = [l.estrada || 'BR-101', l.km ? 'KM ' + kmTxt(l.km) : ''].filter(Boolean).join(' ');
    ['PROJETISTA: GFA', `TITULO: ${rod}`, 'ESTUDOS TOPOGRAFICOS', 'LEVANTAMENTO CADASTRAL DE BUEIRO - PLANTA E PERFIL', `BUEIRO: ${l.codigo || ''}   DATA DO LEVANTAMENTO: ${U.dataBR(l.data)}`, 'CLIENTE: ANTT / ARTERIS FLUMINENSE'].forEach((t, i) => TEXT('CARIMBO', X(sMin), yc - i * h * 2, h * 1.3, t));
    par(0, 'ENDSEC'); par(0, 'EOF');
    return o.join('\r\n') + '\r\n';
  }

  BU.Folha = { svg, dxf, FOCOS, SW, SH };
})();
