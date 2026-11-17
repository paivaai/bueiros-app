/* folha.js — a folha A3 da prancha no modelo do CAD do cliente (ANTT / Arteris Fluminense) e o DXF correspondente.
   Esquerda/alto: PLANTA GERAL e PLANTA DE DETALHE (norte para cima, com a triangulação dos pontos).
   Embaixo: PERFIL LONGITUDINAL com grade e a tabela de estacas. Direita: notas, legenda, coordenadas, localização,
   revisões e carimbo (logos ANTT, Arteris Fluminense e GFA). Expõe BU.Folha = { preparar, svg, dxf, FOCOS }. */
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
  /* Curvas de nível da própria triangulação: de 0,50 em 0,50 m (mestras de 2,50 em 2,50 m), com a cota nas mestras. */
  function curvas(m, tin) {
    if (!tin || !tin.tri || !tin.tri.length) return { segs: [], rot: [] };
    const P = m.pts, zs = P.map(p => p.Z), zMin = Math.min(...zs), zMax = Math.max(...zs), segs = [], melhor = new Map();
    const lo = Math.ceil(zMin / 0.5 - 1e-9) * 0.5;
    for (const [a, b, c] of tin.tri) {
      const T = [P[a], P[b], P[c]], t0 = Math.min(T[0].Z, T[1].Z, T[2].Z), t1 = Math.max(T[0].Z, T[1].Z, T[2].Z);
      for (let z = Math.ceil(Math.max(t0, lo) / 0.5 - 1e-9) * 0.5; z <= t1 + 1e-9 && z <= zMax; z += 0.5) {
        const pts = [];
        for (let i = 0; i < 3; i++) { const u = T[i], v = T[(i + 1) % 3]; if ((u.Z - z) * (v.Z - z) < 0) { const k = (z - u.Z) / (v.Z - u.Z); pts.push({ E: u.E + (v.E - u.E) * k, N: u.N + (v.N - u.N) * k }); } }
        if (pts.length === 2) { const mestra = Math.abs(z / 2.5 - Math.round(z / 2.5)) < 1e-6, s = { z: +z.toFixed(2), mestra, a: pts[0], b: pts[1] }; segs.push(s); const len = Math.hypot(pts[0].E - pts[1].E, pts[0].N - pts[1].N); if (mestra && (!melhor.has(s.z) || len > melhor.get(s.z).len)) melhor.set(s.z, { len, s }); }
      }
    }
    return { segs, rot: [...melhor.values()].filter(r => r.len > 1.2).map(r => r.s) };
  }
  /* janela da planta de detalhe (1:50) centrada na boca de montante, um pouco para dentro do tubo */
  function janelaDetalhe(m) { const c = pontoEm(m, Math.min(2, m.L / 4), 0), sc = 1415 / 50; return { E: c.E, N: c.N, w: (A.p2.w - 34) / sc, h: (A.p2.h - 24) / sc }; }
  function planta(l, m, P, tin, modo) {
    const geral = modo === 'geral', cs = cantos(m);
    let E = cs.map(c => c.E), N = cs.map(c => c.N);
    if (geral) { E = E.concat(m.pts.map(p => p.E)); N = N.concat(m.pts.map(p => p.N)); }
    let e0 = Math.min(...E), e1 = Math.max(...E), n0 = Math.min(...N), n1 = Math.max(...N);
    const mg = geral ? Math.max(4, 0.06 * Math.max(e1 - e0, n1 - n0)) : Math.max(5, 0.4 * m.L);
    e0 -= mg; e1 += mg; n0 -= mg; n1 += mg;
    const R = { x: P.x + 26, y: P.y + 6, w: P.w - 34, h: P.h - 24 };
    let sc = Math.min(R.w / (e1 - e0), R.h / (n1 - n0)), cE = (e0 + e1) / 2, cN = (n0 + n1) / 2;
    /* escalas redondas, como no CAD: planta geral na menor escala 1:S que cabe; detalhe 1:50 centrado na boca de montante */
    const ESC = [50, 100, 150, 200, 250, 350, 500, 750, 1000, 1500, 2000, 2500, 5000], dj = janelaDetalhe(m);
    let S;
    if (geral) S = ESC.find(v => v >= 1415 / sc) || Math.round(1415 / sc); else { S = 50; cE = dj.E; cN = dj.N; }
    sc = 1415 / S;
    const X = e => R.x + R.w / 2 + (e - cE) * sc, Y = n => R.y + R.h / 2 - (n - cN) * sc;
    const id = 'cp-' + modo;
    let g = `<clipPath id="${id}"><rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}"/></clipPath>` + box(P.x, P.y, P.w, P.h, RED, .9) + `<g clip-path="url(#${id})">`;
    // grade de cruzetas com as coordenadas
    const st = passo(Math.max(R.w, R.h) / sc, 4);
    for (let e = Math.ceil((cE - R.w / 2 / sc) / st) * st; e <= cE + R.w / 2 / sc; e += st) {
      g += tx(X(e), P.y + P.h - 4, 'E=' + fmt(e, 0), { fs: 4.8, c: '#8A8F8C', a: 'middle' });
      for (let n = Math.ceil((cN - R.h / 2 / sc) / st) * st; n <= cN + R.h / 2 / sc; n += st) g += ln(X(e) - 3, Y(n), X(e) + 3, Y(n), 'stroke="#9AA09C" stroke-width=".5"') + ln(X(e), Y(n) - 3, X(e), Y(n) + 3, 'stroke="#9AA09C" stroke-width=".5"');
    }
    for (let n = Math.ceil((cN - R.h / 2 / sc) / st) * st; n <= cN + R.h / 2 / sc; n += st) g += tx(P.x + 9, Y(n), 'N=' + fmt(n, 0), { fs: 4.8, c: '#8A8F8C', a: 'middle', rot: -90 });
    // triangulação
    if (tin) g += `<g stroke="#6F7773" stroke-width="${geral ? .4 : .5}" fill="none">${tin.arestas.map(([a, b]) => ln(X(m.pts[a].E), Y(m.pts[a].N), X(m.pts[b].E), Y(m.pts[b].N))).join('')}</g>`;
    // curvas de nível (da triangulação)
    { const cv = curvas(m, tin); if (cv.segs.length < 4000) {
      g += `<g fill="none" stroke="#2E9E5B" stroke-linecap="round">${cv.segs.map(s => `<line x1="${p1(X(s.a.E))}" y1="${p1(Y(s.a.N))}" x2="${p1(X(s.b.E))}" y2="${p1(Y(s.b.N))}" stroke-width="${s.mestra ? .7 : .35}"/>`).join('')}</g>`;
      for (const s of cv.rot) { const x = (X(s.a.E) + X(s.b.E)) / 2, y = (Y(s.a.N) + Y(s.b.N)) / 2; let an = Math.atan2(Y(s.b.N) - Y(s.a.N), X(s.b.E) - X(s.a.E)) * 180 / Math.PI; if (an > 90) an -= 180; if (an < -90) an += 180; if (x > P.x + 30 && x < P.x + P.w - 10 && y > P.y + 6 && y < P.y + P.h - 14) g += tx(x, y, fmt(s.z, 1), { fs: geral ? 4.4 : 5.4, c: '#1F7A44', rot: p1(an), halo: 1, a: 'middle' }); } } }
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
    if (geral) { // janela da planta de detalhe (retângulo amarelo, como no CAD)
      const x1 = X(dj.E - dj.w / 2), x2 = X(dj.E + dj.w / 2), y1 = Y(dj.N + dj.h / 2), y2 = Y(dj.N - dj.h / 2);
      g += `<rect x="${p1(x1)}" y="${p1(y1)}" width="${p1(x2 - x1)}" height="${p1(y2 - y1)}" fill="none" stroke="#C9A400" stroke-width=".8" stroke-dasharray="4 2"/>` + tx(x1, y1 - 3, 'DETALHE 1', { fs: 5.6, b: 1, c: '#C9A400', halo: 1 });
      const ang0 = Math.atan2(-m.u.N, m.u.E) * 180 / Math.PI, ang = Math.abs(ang0) > 90 ? ang0 + (ang0 > 0 ? -180 : 180) : ang0, dir = Math.abs(ang0) > 90 ? -1 : 1;
      const lado = (b, h, s, nome) => { const q = pontoEm(m, s, 0), px = X(q.E), py = Y(q.N), d = 8 * dir * (s < 1 ? -1 : 1); return tx(px + d * Math.cos(ang * Math.PI / 180) * -0, py, '', {}) + tx(px - 0, py, nome + `  Ø/H=${fmt(h, 2)} m  GI=${fmt(b.Z, 3)}`, { fs: 4.8, b: 1, c: MAG, a: s < 1 ? (dir > 0 ? 'end' : 'start') : (dir > 0 ? 'start' : 'end'), rot: p1(ang), halo: 1 }); };
      g += lado(m.A, m.hA, -2, 'BOCA MONTANTE') + lado(m.B, m.hB, m.L + 2, 'BOCA JUSANTE');
    }
    g += '</g>';
    // norte (símbolo amarelo, como no modelo) e título + escala gráfica
    const nx = P.x + P.w - 20, ny = P.y + 20;
    g += `<circle cx="${nx}" cy="${ny}" r="9" fill="#F2C200" stroke="#7A6200" stroke-width=".6"/><polygon points="${nx},${ny - 7} ${nx + 3},${ny + 3} ${nx},${ny + 1} ${nx - 3},${ny + 3}" fill="${INK}"/>` + tx(nx, ny + 17, 'N', { fs: 6.5, b: 1, a: 'middle' });
    const alvo = Math.min(90 / sc, 200), lb = [1, 2, 5, 10, 20, 50, 100].filter(v => v <= alvo).pop() || 1, wB = lb * sc, bx = P.x + P.w - 12 - wB, by = P.y + P.h + 12;
    for (let i = 0; i < 4; i++) g += `<rect x="${p1(bx + i * wB / 4)}" y="${by}" width="${p1(wB / 4)}" height="4" fill="${i % 2 ? '#fff' : INK}" stroke="${INK}" stroke-width=".5"/>`;
    g += tx(bx, by - 2, '0', { fs: 5 }) + tx(bx + wB, by - 2, `${lb} m`, { fs: 5, a: 'middle' }) + tx(bx + wB, by + 13, `ESCALA GRÁFICA 1:${S}`, { fs: 5, b: 1, c: RED, a: 'end' });
    g += `<circle cx="${P.x + 10}" cy="${P.y + P.h + 13}" r="7" fill="none" stroke="${RED}" stroke-width=".8"/>` + tx(P.x + 10, P.y + P.h + 16, geral ? 'A' : '1', { fs: 8, b: 1, c: '#0B7C99', a: 'middle' })
      + tx(P.x + 22, P.y + P.h + 12, geral ? 'PLANTA PLANIALTIMÉTRICA CADASTRAL' : 'DETALHE 1 - BOCA MONTANTE E DRENAGEM', { fs: 8, b: 1, c: '#0B7C99' }) + tx(P.x + 22, P.y + P.h + 23, `ESC. 1:${S}`, { fs: 5.6, b: 1, c: '#9A8200' });
    return g;
  }

  /* Estacas da tabela do perfil: regulares em todo o trecho levantado do terreno (também fora do bueiro), mais as duas bocas. */
  function passoEstaca(m) { const t = m.L + 20; return t <= 40 ? 2 : t <= 80 ? 2.5 : t <= 150 ? 5 : 10; }
  function estacas(m, nl) {
    const L = +m.L.toFixed(3), pa = passoEstaca(m), s0 = Math.min(0, ...nl.map(p => p.s)), s1 = Math.max(L, ...nl.map(p => p.s));
    const r = [0, L];
    for (let s = Math.ceil(s0 / pa) * pa; s <= s1 + 1e-9; s += pa) { const v = +s.toFixed(3); if (Math.abs(v) > pa * 0.45 && Math.abs(v - L) > pa * 0.45) r.push(v); }
    return r.sort((a, b) => a - b);
  }
  /* ---------- perfil longitudinal ---------- */
  function perfil(l, m, P) {
    const nl = m.linha, L = m.L, tab = 5, rh = 28, th = tab * rh, labW = 104;
    const gi = s => m.A.Z + (m.B.Z - m.A.Z) * s / L, gsf = s => m.gs ? m.gs(s) : gi(s) + m.H;
    // alcance horizontal: 5 m antes da boca de montante até 5 m depois da jusante (múltiplos de 2,5 m)
    const sIni = -5, sFim = Math.ceil((L + 5) / 2.5) * 2.5;
    const zT = nl.filter(p => p.s >= sIni && p.s <= sFim).map(p => p.Z);
    const zLo = Math.floor(Math.min(m.A.Z, m.B.Z, ...(zT.length ? zT : [m.A.Z])) - 1), zHi = Math.ceil(Math.max(gsf(0), gsf(L), ...(zT.length ? zT : [m.A.Z])) + 1.5);
    // escala real 1:S (A1: 1 m = 1415/S unidades da folha), a maior que cabe
    const availW = P.w - labW - 34, availH = P.h - 70 - th - 40;
    const S = [50, 100, 200, 250, 500, 1000, 2000].find(s => (sFim - sIni) * 1415 / s <= availW && (zHi - zLo) * 1415 / s <= availH) || 2000, k = 1415 / S;
    const W = (sFim - sIni) * k, Hh = (zHi - zLo) * k;
    const x0 = P.x + labW + 14 + (availW - W) / 2, yTop = P.y + 70, yBase = yTop + Hh;
    const X = s => x0 + (s - sIni) * k, Y = z => yBase - (z - zLo) * k;
    let g = box(P.x, P.y, P.w, P.h, RED, .9) + `<clipPath id="cp-pf"><rect x="${p1(x0 - 2)}" y="${p1(yTop - 2)}" width="${p1(W + 4)}" height="${p1(Hh + 4)}"/></clipPath>`;
    g += `<pattern id="hach" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${MAG}" stroke-width=".6"/></pattern>`;
    // título (letra B), escala e barra gráfica
    g += `<circle cx="${P.x + 12}" cy="${P.y + 18}" r="7" fill="none" stroke="${RED}" stroke-width=".8"/>` + tx(P.x + 12, P.y + 21, 'B', { fs: 8, b: 1, c: '#0B7C99', a: 'middle' })
      + tx(P.x + 26, P.y + 17, 'PERFIL LONGITUDINAL DO BUEIRO (EIXO DO TUBO)', { fs: 9, b: 1, c: '#0B7C99' })
      + tx(P.x + 26, P.y + 28, `ESC. H = V = 1:${S} (sem exagero vertical) - distâncias a partir da boca de montante`, { fs: 5.4, c: '#9A8200' });
    { const lb = [1, 2, 5, 10, 20, 50].filter(v => v * k <= 120).pop() || 1, wB = lb * k, bx = P.x + P.w - 20 - wB, by = P.y + 22;
      for (let i = 0; i < 5; i++) g += `<rect x="${p1(bx + i * wB / 5)}" y="${by}" width="${p1(wB / 5)}" height="4" fill="${i % 2 ? '#fff' : INK}" stroke="${INK}" stroke-width=".5"/>`;
      g += tx(bx, by - 2, '0', { fs: 5, a: 'middle' }) + tx(bx + wB, by - 2, lb + ' m', { fs: 5, a: 'middle' }) + tx(bx, by + 12, `ESCALA GRÁFICA 1:${S}`, { fs: 4.8, c: MUTED }); }
    // grade: horizontais a cada 0,5 m (cotas a cada 1 m), verticais nas estacas
    for (let z = zLo; z <= zHi + 1e-9; z += 0.5) { const inteiro = Math.abs(z - Math.round(z)) < 1e-9; g += ln(x0, Y(z), x0 + W, Y(z), `stroke="${inteiro ? '#BFC5C1' : GRID}" stroke-width="${inteiro ? .45 : .3}"`); if (inteiro) g += tx(x0 - 4, Y(z) + 2, fmt(z, 2), { fs: 5.2, c: INK, a: 'end' }); }
    const passoSt = [2.5, 5, 10, 20, 50].find(v => v * k >= 20) || 50, est = [];
    for (let s = Math.ceil(sIni / passoSt) * passoSt; s <= sFim + 1e-9; s += passoSt) est.push(+s.toFixed(3));
    const iL = est.findIndex(s => Math.abs(s - L) < passoSt * 0.4); if (iL >= 0) est[iL] = +L.toFixed(2); else { est.push(+L.toFixed(2)); est.sort((a, b) => a - b); }
    est.forEach(s => { g += ln(X(s), yTop, X(s), yBase, `stroke="${GRID}" stroke-width=".4"`); });
    g += box(x0, yTop, W, Hh, '#9AA09C', .6) + `<g clip-path="url(#cp-pf)">`;
    // terreno pelo eixo (TIN) e corpo do tubo (GI → GS)
    const nv = nl.filter(p => p.s >= sIni - 0.01 && p.s <= sFim + 0.01);
    if (m.seLinha && nv.length > 1) g += `<polyline points="${nv.map(p => p1(X(p.s)) + ',' + p1(Y(p.Z))).join(' ')}" fill="none" stroke="#B4793A" stroke-width="1.1" stroke-linejoin="round"/>`;
    const tubo = [[0, gi(0)], [L, gi(L)], [L, gsf(L)], [0, gsf(0)]].map(q => p1(X(q[0])) + ',' + p1(Y(q[1]))).join(' ');
    g += `<polygon points="${tubo}" fill="url(#hach)" stroke="${MAG}" stroke-width="1"/>`;
    // alas / topo de ala e caixa coletora
    const perto = (E, N, r) => m.pts.filter(p => Math.hypot(p.E - E, p.N - N) <= r);
    const topoAla = (b) => { const a = perto(b.E, b.N, 6).filter(p => p.papel === 'contorno').map(p => p.Z); return a.length ? Math.max(...a) : null; };
    const tA = topoAla(m.A), tB = topoAla(m.B);
    [[0, m.A, tA], [L, m.B, tB]].forEach(([s, b, t]) => { if (t != null) g += ln(X(s), Y(b.Z), X(s), Y(t), `stroke="${MAG}" stroke-width="1.1"`) + ln(X(s) - 3, Y(t), X(s) + 3, Y(t), `stroke="${MAG}" stroke-width="1.1"`); });
    const cxs = m.pts.filter(p => /^DRE-?CX|CAIXA/i.test(String(p.cod || '')) && Math.abs(p.t) <= 3 && p.s >= -6 && p.s <= 6);
    if (cxs.length) { const a = Math.min(...cxs.map(p => p.s)) - 0.2, b = Math.max(...cxs.map(p => p.s)) + 0.2, zt = Math.max(...cxs.map(p => p.Z)), zb = Math.min(...cxs.map(p => p.Z)) - 0.15;
      g += `<rect x="${p1(X(a))}" y="${p1(Y(zt))}" width="${p1(X(b) - X(a))}" height="${p1(Y(zb) - Y(zt))}" fill="none" stroke="#2F4BD8" stroke-width=".9"/>` + tx(X(b) + 3, Y(zt) - 2, `CAIXA (topo ${fmt(zt, 3)})`, { fs: 4.8, halo: 1 }); }
    // pontos do terreno sobre o eixo: BA / CR / PA com chamada vertical
    const ROT = { ASF: 'BA', CA: 'CR', PA: 'PA' }; let ult = -1e9;
    const marc = m.pts.filter(p => { const c = String(p.cod || '').toUpperCase().match(/^TER-?(ASF|CA|PA)$/); return c && Math.abs(p.t) <= 2.2 && p.s >= sIni && p.s <= sFim; }).sort((a, b) => a.s - b.s);
    for (const p of marc) { const x = X(p.s); if (x - ult < 7.5) continue; ult = x; const ab = ROT[String(p.cod).toUpperCase().replace('TER-', '').replace('TER', '')];
      g += ln(x, Y(p.Z), x, Y(p.Z) - 16, 'stroke="#555" stroke-width=".5"') + tx(x + 1.8, Y(p.Z) - 18, `${ab} ${fmt(p.Z, 3)}`, { fs: 4.8, rot: -90 }); }
    // recobrimento máximo (cota roxa)
    if (m.cob && m.cob.valor > 0) { const xc = X(m.cob.s), yT = Y(gsf(m.cob.s)), yP = Y(m.cob.zTopoPista);
      g += ln(xc, yT, xc, yP, `stroke="${PURPLE}" stroke-width="1"`) + tx(xc + 3, (yT + yP) / 2 + 2, `rec. ${fmt(m.cob.valor, 2)} m`, { fs: 4.8, b: 1, c: PURPLE, halo: 1 }); }
    // rótulo do bueiro, paralelo ao tubo
    { const ang = Math.atan2(Y(gi(L)) - Y(gi(0)), X(L) - X(0)) * 180 / Math.PI, mx = X(L / 2), my = Y(gi(L / 2)) + 12;
      g += tx(mx, my, `BUEIRO Ø/H≈${fmt((m.hA + m.hB) / 2, 2)} m  -  L = ${fmt(L, 2)} m  -  i = ${fmt(m.decl, 2)} %`, { fs: 6, b: 1, a: 'middle', rot: p1(ang) }); }
    g += '</g>';
    // bocas: títulos, GI, Ø/H e topo de ala
    const bocaTxt = (s, b, h, t, nome) => tx(X(s), Y(b.Z) + 12, nome, { fs: 6.5, b: 1, a: 'middle' }) + tx(X(s), Y(b.Z) + 20, `GI = ${fmt(b.Z, 3)}  |  Ø/H≈${fmt(h, 2)} m`, { fs: 4.8, a: 'middle' }) + tx(X(s), Y(b.Z) + 27, `Topo ala = ${fmt(t != null ? t : b.Z + h, 3)}`, { fs: 4.8, a: 'middle' });
    g += bocaTxt(0, m.A, m.hA, tA, 'BOCA MONTANTE') + bocaTxt(L, m.B, m.hB, tB, 'BOCA JUSANTE');
    // tabela de estacas
    const terrenoEm = s => { if (nl.length < 2 || s < nl[0].s - 1e-6 || s > nl[nl.length - 1].s + 1e-6) return null; for (let i = 1; i < nl.length; i++) if (s <= nl[i].s) { const a = nl[i - 1], b = nl[i]; return b.s === a.s ? b.Z : a.Z + (b.Z - a.Z) * (s - a.s) / (b.s - a.s); } return nl[nl.length - 1].Z; };
    const ty = yBase + 10, rot = ['DISTÂNCIA (m)', 'COTA TERRENO (m)', 'COTA GI (m)', 'COTA GS (m)', 'RECOBRIMENTO (m)'], tx0 = x0 - labW;
    g += box(tx0, ty, labW + W, th, '#9AA09C', .6) + ln(x0, ty, x0, ty + th, 'stroke="#9AA09C" stroke-width=".6"');
    rot.forEach((t, i) => { g += tx(tx0 + 6, ty + i * rh + 11, t, { fs: 5.2 }) + (i ? ln(tx0, ty + i * rh, x0 + W, ty + i * rh, 'stroke="#C9CECB" stroke-width=".5"') : ''); });
    for (const s of est) {
      const x = X(s), dentro = s >= -1e-6 && s <= L + 1e-6, zt = terrenoEm(s), rec = dentro && zt != null && s < L - 1e-6 ? zt - gsf(s) : null;
      const v = [fmt(s, 2), zt != null ? fmt(zt, 3) : '-', dentro ? fmt(gi(s), 3) : '-', dentro ? fmt(gsf(s), 3) : '-', rec != null && rec > 0 ? fmt(rec, 2) : '-'];
      g += ln(x, yBase, x, ty + th, 'stroke="#C9CECB" stroke-width=".35" stroke-dasharray="1.5 2"');
      v.forEach((t, i) => { g += tx(x + 1.8, ty + i * rh + rh / 2, t, { fs: 4.6, a: 'middle', rot: -90 }); });
    }
    g += tx(x0, ty + th + 14, 'BA = borda do asfalto | CR = crista do aterro | PA = pé do aterro | GI/GS = geratriz inferior/superior', { fs: 5 });
    return g;
  }

  /* ---------- coluna da direita ---------- */
  const titulo = (P, t, cor = PURPLE) => box(P.x, P.y, P.w, P.h, cor, .8) + tx(P.x + P.w / 2, P.y + 11, t, { fs: 7, b: 1, c: '#0B7C99', a: 'middle' }) + ln(P.x, P.y + 15, P.x + P.w, P.y + 15, `stroke="${cor}" stroke-width=".5"`);
  function quebrar(t, n) { const o = []; let c = ''; for (const w of String(t).split(/\s+/)) { if ((c + ' ' + w).trim().length > n && c) { o.push(c); c = w; } else c = (c + ' ' + w).trim(); } if (c) o.push(c); return o; }

  function notas(l, m) {
    const P = A.nt, z = parseInt(l.zona, 10), hem = (l.hemisferio || 'S').toUpperCase();
    const epsg = z && hem === 'S' ? ` (EPSG:${31960 + z})` : '';
    const hA = m.hA, hB = m.hB, difere = Math.abs(hA - hB) > 0.05;
    let rmin = null, rmax = null;
    for (let s = 0.5; s < m.L - 0.4; s += 0.5) { const zt = (() => { const nl = m.linha; if (nl.length < 2 || s < nl[0].s || s > nl[nl.length - 1].s) return null; for (let i = 1; i < nl.length; i++) if (s <= nl[i].s) { const a = nl[i - 1], b = nl[i]; return b.s === a.s ? b.Z : a.Z + (b.Z - a.Z) * (s - a.s) / (b.s - a.s); } return null; })(); if (zt == null) continue; const r = zt - (m.gs ? m.gs(s) : m.A.Z + (m.B.Z - m.A.Z) * s / m.L + m.H); if (r > 0) { rmin = rmin == null ? r : Math.min(rmin, r); rmax = rmax == null ? r : Math.max(rmax, r); } }
    const N = [`Coordenadas UTM (m): SIRGAS 2000 / UTM ${z || ''}${hem}${epsg}. Cotas em metros (RN do levantamento).`,
      'Superfície por TIN com linhas de quebra.',
      `Bueiro: L = ${fmt(m.L, 2)} m; i = ${fmt(m.decl, 2)} %; GI ${fmt(m.A.Z, 3)} -> ${fmt(m.B.Z, 3)} m; Ø/H ≈ ${fmt(hA, 2)} / ${fmt(hB, 2)} m.`,
      rmin != null ? `Recobrimento do tubo: mín. ${fmt(rmin, 2)} m; máx. ${fmt(rmax, 2)} m.` : null,
      difere ? `Ø/H diferente nas bocas (${fmt(hA, 2)} x ${fmt(hB, 2)} m).` : null].filter(Boolean);
    let g = titulo(P, 'N O T A S'), y = P.y + 26;
    N.forEach((t, i) => quebrar(t, 74).forEach((ln_, j) => { if (y < P.y + P.h - 2) { g += tx(P.x + 6, y, (j ? '    ' : (i + 1) + '. ') + ln_, { fs: 5 }); y += 8; } }));
    return g;
  }
  function legenda() {
    const P = A.lg; let g = titulo(P, 'L E G E N D A');
    const Ym = '#C9A400', O = '#D9822B', V = '#7B2D8E';
    const sim = {
      tubo: (x, y) => ln(x, y - 3, x + 22, y - 3, `stroke="${MAG}" stroke-width=".9"`) + ln(x, y + 3, x + 22, y + 3, `stroke="${MAG}" stroke-width=".9"`) + ln(x, y - 4.5, x, y + 4.5, `stroke="${MAG}" stroke-width=".9"`) + ln(x + 22, y - 4.5, x + 22, y + 4.5, `stroke="${MAG}" stroke-width=".9"`),
      dr: (x, y) => `<path d="M ${x + 3} ${y - 6} L ${x + 3} ${y + 1} Q ${x + 8} ${y + 5} ${x + 11} ${y + 5} Q ${x + 14} ${y + 5} ${x + 19} ${y + 1} L ${x + 19} ${y - 6}" fill="none" stroke="${V}" stroke-width=".9"/>`,
      cx: (x, y) => `<rect x="${x + 5}" y="${y - 5}" width="12" height="10" fill="none" stroke="#18A0C8" stroke-width=".9"/>`,
      cn: (x, y) => ln(x + 2, y + 3, x + 20, y - 3, 'stroke="#2E9E5B" stroke-width=".8"') + ln(x + 2, y, x + 20, y - 6, 'stroke="#2E9E5B" stroke-width=".8"') + ln(x + 2, y + 6, x + 20, y, 'stroke="#2E9E5B" stroke-width=".8"'),
      pav: (x, y) => `<rect x="${x + 1}" y="${y - 5}" width="20" height="10" fill="#CFCFCF" stroke="#555" stroke-width=".6"/>`,
      eixo: (x, y) => ln(x, y, x + 22, y, `stroke="${MAG}" stroke-width="1" stroke-dasharray="6 2 1.5 2"`),
      ater: (x, y) => `<ellipse cx="${x + 11}" cy="${y}" rx="10" ry="5.5" fill="none" stroke="${O}" stroke-width=".8"/>` + ln(x + 3, y - 3, x + 3, y + 3, `stroke="${O}" stroke-width=".6"`) + ln(x + 8, y - 5, x + 8, y + 5, `stroke="${O}" stroke-width=".6"`) + ln(x + 14, y - 5, x + 14, y + 5, `stroke="${O}" stroke-width=".6"`) + ln(x + 19, y - 3, x + 19, y + 3, `stroke="${O}" stroke-width=".6"`),
      norte: (x, y) => `<circle cx="${x + 11}" cy="${y}" r="6" fill="#F2C200" stroke="#7A6200" stroke-width=".6"/><polygon points="${x + 11},${y - 5} ${x + 13.5},${y + 3} ${x + 11},${y + 1} ${x + 8.5},${y + 3}" fill="${INK}"/>`,
      pto: (x, y) => ln(x + 8, y, x + 14, y, 'stroke="#D32F2F" stroke-width="1"') + ln(x + 11, y - 3, x + 11, y + 3, 'stroke="#D32F2F" stroke-width="1"'),
      tin: (x, y) => `<polygon points="${x + 2},${y + 4} ${x + 11},${y - 5} ${x + 20},${y + 4}" fill="none" stroke="#6F7773" stroke-width=".7"/>`,
      lim: (x, y) => `<rect x="${x + 1}" y="${y - 4}" width="20" height="8" fill="none" stroke="${Ym}" stroke-width=".8" stroke-dasharray="3 1.5"/>`,
      vt: (x, y) => ln(x + 1, y - 2, x + 21, y - 2, `stroke="${V}" stroke-width=".8"`) + ln(x + 1, y + 2, x + 21, y + 2, `stroke="${V}" stroke-width=".8"`),
    };
    const it = [['tubo', 'BUEIRO TUBULAR (TUBO, ALAS E TESTAS)'], ['ater', 'ATERRO EXISTENTE (CRISTA / PÉ)'], ['dr', "DESCIDA D'ÁGUA TIPO RÁPIDA (DR)"], ['norte', 'INDICAÇÃO DE NORTE'], ['cx', 'CAIXA COLETORA'], ['pto', 'PONTO LEVANTADO'],
      ['cn', 'CURVAS DE NÍVEL'], ['tin', 'MALHA TRIANGULAR (TIN)'], ['pav', 'PAVIMENTO ASFÁLTICO'], ['lim', 'LIMITE DO DETALHE 1'], ['eixo', 'EIXO DO BUEIRO'], ['vt', 'VALETA (VT)']];
    it.forEach(([k, t], i) => {
      const col = i % 2, row = i >> 1, x = P.x + 8 + col * 122, yy = P.y + 32 + row * 20;
      g += sim[k](x, yy) + quebrar(t, 22).map((s, j) => tx(x + 27, yy + 1 + j * 6.5 - (quebrar(t, 22).length - 1) * 3, s, { fs: 4.6 })).join('');
    });
    return g;
  }
  /* quadro "rótulo do ponto e códigos do levantamento" (no lugar da tabela de coordenadas) */
  function coordenadas() {
    const P = A.co; let g = titulo(P, 'RÓTULO DO PONTO E CÓDIGOS DO LEVANTAMENTO');
    g += ln(P.x + 10, P.y + 28, P.x + 16, P.y + 28, 'stroke="#D32F2F" stroke-width="1"') + ln(P.x + 13, P.y + 25, P.x + 13, P.y + 31, 'stroke="#D32F2F" stroke-width="1"')
      + tx(P.x + 20, P.y + 26, '123', { fs: 5 }) + tx(P.x + 20, P.y + 32, '23,456', { fs: 4, c: MUTED }) + tx(P.x + 20, P.y + 38, 'TER-ASF', { fs: 4, c: '#18A0C8' }) + tx(P.x + 54, P.y + 31, 'número / cota (m) / código de campo', { fs: 4.8 });
    const C = [['TER-ASF', 'borda do asfalto'], ['TER-CA', 'crista do aterro'], ['TER-PA', 'pé do aterro'], ['TER-TN', 'terreno natural'], ['OAC-ALA', 'ala do bueiro'], ['OAC-GTZ', 'geratriz do tubo (inf./sup.)'], ['DRE-DR', "descida d'água rápida"], ['DRE-CX', 'caixa coletora'], ['DRE-VT', 'valeta'], ['DRE-NA', "nível d'água"], ['DRE-FR', 'fundo / talvegue']];
    const esq = C.filter((_, i) => i % 2 === 0), dir = C.filter((_, i) => i % 2 === 1);
    [esq, dir].forEach((col, c) => col.forEach(([k, d], i) => { const x = P.x + 8 + c * 122, y = P.y + 56 + i * 10; g += tx(x, y, k, { fs: 4.8, b: 1, c: '#18A0C8' }) + tx(x + 34, y, d, { fs: 4.8 }); }));
    return g;
  }
  /* Imagem de satélite (Esri World Imagery) centrada no bueiro: baixada uma vez, virada em JPEG e guardada em memória.
     Se estiver sem internet ou o servidor não responder, a folha usa o esquema antigo. */
  const MAPAS = new Map(), chaveMapa = l => (l.latitude != null && l.longitude != null) ? (+l.latitude).toFixed(5) + ',' + (+l.longitude).toFixed(5) : null;
  function preparar(l) {
    const k = chaveMapa(l); if (!k || MAPAS.has(k) || typeof document === 'undefined') return Promise.resolve();
    MAPAS.set(k, null);
    const Z = 14, lat = +l.latitude, lon = +l.longitude, n = 2 ** Z;
    const px = (lon + 180) / 360 * n, py = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
    const tx0 = Math.floor(px) - 1, ty0 = Math.floor(py) - 1, W = 540, H = 270;
    const img = (x, y) => new Promise(ok => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => ok(null); im.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${y}/${x}`; });
    const tempo = new Promise(ok => setTimeout(ok, 8000));
    const trabalho = (async () => {
      const ims = await Promise.all([0, 1, 2].flatMap(j => [0, 1, 2].map(i => img(tx0 + i, ty0 + j).then(im => ({ im, i, j })))));
      if (ims.some(t => !t.im)) return;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d');
      const ox = (px - tx0) * 256 - W / 2, oy = (py - ty0) * 256 - H / 2;
      ims.forEach(t => cx.drawImage(t.im, t.i * 256 - ox, t.j * 256 - oy));
      MAPAS.set(k, c.toDataURL('image/jpeg', .82));
    })().catch(() => { /* canvas contaminado ou sem rede: fica o esquema */ });
    return Promise.race([trabalho, tempo]).then(() => { if (MAPAS.get(k) == null) MAPAS.delete(k); });
  }
  function mapa(l) {
    const P = A.mp; let g = titulo(P, 'MAPA DE LOCALIZAÇÃO');
    const sat = MAPAS.get(chaveMapa(l) || '');
    if (sat) {
      const cx = P.x + P.w / 2, cy = P.y + 20 + 60;
      g += `<image href="${sat}" x="${P.x + 6}" y="${P.y + 20}" width="${P.w - 12}" height="120" preserveAspectRatio="xMidYMid slice"/><rect x="${P.x + 6}" y="${P.y + 20}" width="${P.w - 12}" height="120" fill="none" stroke="${INK}" stroke-width=".6"/>`
        + `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="#fff" stroke-width="1.2"/><circle cx="${cx}" cy="${cy}" r="4.5" fill="${COR.gi}" stroke="#fff" stroke-width="1.2"/>`
        + tx(cx + 12, cy - 6, l.codigo || 'Bueiro', { fs: 6.5, b: 1, c: '#fff', ex: ' stroke="#000" stroke-width="2" paint-order="stroke"' })
        + tx(P.x + 12, P.y + 32, (l.estrada || 'Rodovia') + (l.km ? ' · km ' + l.km : ''), { fs: 6.5, b: 1, c: '#fff', ex: ' stroke="#000" stroke-width="2" paint-order="stroke"' })
        + tx(P.x + P.w - 10, P.y + 134, 'Imagem: Esri, Maxar, Earthstar Geographics · escala aprox. 1:25.000', { fs: 4.2, c: '#fff', a: 'end', ex: ' stroke="#000" stroke-width="1.6" paint-order="stroke"' });
      return g + mapaDados(l, P);
    }
    const cy = P.y + 80, cx = P.x + 120;
    g += `<rect x="${P.x + 6}" y="${P.y + 20}" width="${P.w - 12}" height="120" fill="#F2F5F2" stroke="${GRID}" stroke-width=".6"/>`
      + `<path d="M ${P.x + 6} ${cy + 36} C ${P.x + 70} ${cy + 22}, ${P.x + 130} ${cy - 22}, ${P.x + P.w - 6} ${cy - 38}" fill="none" stroke="#9AA39C" stroke-width="7" stroke-linecap="round"/><path d="M ${P.x + 6} ${cy + 36} C ${P.x + 70} ${cy + 22}, ${P.x + 130} ${cy - 22}, ${P.x + P.w - 6} ${cy - 38}" fill="none" stroke="#fff" stroke-width=".8" stroke-dasharray="5 4"/>`
      + `<circle cx="${cx}" cy="${cy - 2}" r="5" fill="${COR.gi}" stroke="#fff" stroke-width="1.2"/>` + tx(cx, cy - 11, l.codigo || 'Bueiro', { fs: 6.5, b: 1, a: 'middle', halo: 1 })
      + tx(P.x + 12, P.y + 33, (l.estrada || 'Rodovia') + (l.km ? ' · km ' + l.km : ''), { fs: 6.5, b: 1, halo: 1 }) + tx(P.x + P.w - 10, P.y + 134, 'esquema sem escala', { fs: 4.6, c: MUTED, a: 'end' });
    return g + mapaDados(l, P);
  }
  function mapaDados(l, P) {
    let g = '';
    const u = BU.GPS.utmDe(l), Lx = [['MUNICÍPIO / UF', [l.municipio, l.estado].filter(Boolean).join(' / ') || '—'], ['LATITUDE / LONGITUDE', l.latitude != null ? `${fmt(l.latitude, 6)} / ${fmt(l.longitude, 6)}` : '—'], ['UTM (E / N)', u ? `${fmt(u.E, 1)} / ${fmt(u.N, 1)}` : '—'], ['PISTA / LADO', [l.pistaGe, l.lado].filter(Boolean).join(' / ') || '—']];
    Lx.forEach(([k, v], i) => { const x = P.x + 8 + (i % 2) * 124, y = P.y + 154 + (i >> 1) * 26; g += tx(x, y, k, { fs: 4.6, b: 1, c: MUTED }) + tx(x, y + 9, String(v).slice(0, 30), { fs: 5.8, b: 1 }); });
    return g;
  }
  function revisoes(l) {
    const P = A.rv, cx = [P.x, P.x + 26, P.x + 76], ac = '#B58900'; let g = box(P.x, P.y, P.w, P.h, ac, .8);
    g += tx(P.x + P.w / 2, P.y + 8, 'CONTROLE INTERNO DE REVISÕES', { fs: 5.4, b: 1, c: MUTED, a: 'middle' });
    g += ln(P.x, P.y + 12, P.x + P.w, P.y + 12, `stroke="${ac}" stroke-width=".5"`) + ln(P.x, P.y + 22, P.x + P.w, P.y + 22, `stroke="${ac}" stroke-width=".5"`);
    ['REV.', 'DATA', 'ASSUNTO'].forEach((t, i) => { g += tx(cx[i] + 3, P.y + 19, t, { fs: 4.6, b: 1, c: MUTED }); });
    cx.slice(1).forEach(x => { g += ln(x, P.y + 12, x, P.y + P.h, `stroke="${ac}" stroke-width=".5"`); });
    g += tx(cx[0] + 3, P.y + 31, '00', { fs: 5.6, b: 1 }) + tx(cx[1] + 3, P.y + 31, hoje(), { fs: 5.2, b: 1 }) + tx(cx[2] + 3, P.y + 31, 'EMISSÃO INICIAL', { fs: 5.2, b: 1 });
    return g;
  }
  function carimbo(l, m) {
    const P = A.cb, Lg = BU.Prancha.logos ? BU.Prancha.logos() : {}; let g = box(P.x, P.y, P.w, P.h, BLUE, 1);
    const hl = 46, L = (y) => ln(P.x, y, P.x + P.w, y, `stroke="${BLUE}" stroke-width=".7"`), Y = '#9A8200', C = '#0B7C99';
    g += ln(P.x + P.w / 2, P.y, P.x + P.w / 2, P.y + hl, `stroke="${BLUE}" stroke-width=".8"`) + L(P.y + hl);
    if (Lg.antt) g += `<image href="${Lg.antt}" x="${P.x + 14}" y="${P.y + 8}" width="${P.w / 2 - 28}" height="${hl - 16}" preserveAspectRatio="xMidYMid meet"/>`;
    if (Lg.arteris) g += `<image href="${Lg.arteris}" x="${P.x + P.w / 2 + 14}" y="${P.y + 5}" width="${P.w / 2 - 28}" height="${hl - 10}" preserveAspectRatio="xMidYMid meet"/>`;
    const lab = (x, y, t) => tx(x, y, t, { fs: 5.6, b: 1, c: Y });
    const rod = [l.estrada || 'BR-101', l.km ? 'KM ' + kmTxt(l.km) : ''].filter(Boolean).join(' '), rodovia = [l.estrada, l.estado].filter(Boolean).join('/') || '—';
    let y = P.y + hl;
    g += lab(P.x + 5, y + 11, 'PROJETISTA:') + tx(P.x + 70, y + 20, 'GFA', { fs: 8, b: 1, c: C });
    if (Lg.gfa) g += `<image href="${Lg.gfa}" x="${P.x + P.w - 46}" y="${y + 3}" width="40" height="20" preserveAspectRatio="xMidYMid meet"/>`;
    y += 24; g += L(y) + lab(P.x + 5, y + 11, 'TÍTULO:') + tx(P.x + 50, y + 11, rod, { fs: 7.5, b: 1, c: C }) + tx(P.x + 50, y + 21, 'ESTUDOS TOPOGRÁFICOS', { fs: 5.8, b: 1, c: C })
      + quebrar('LEVANTAMENTO CADASTRAL DE BUEIRO - PLANTA E PERFIL', 40).map((s, i) => tx(P.x + 50, y + 30 + i * 8, s, { fs: 5.8, b: 1, c: C })).join('');
    y += 42; g += L(y) + ln(P.x + P.w / 2, y, P.x + P.w / 2, y + 15, `stroke="${BLUE}" stroke-width=".5"`) + lab(P.x + 5, y + 11, 'RODOVIA:') + tx(P.x + 40, y + 11, rodovia.slice(0, 22), { fs: 5.6, b: 1, c: C }) + lab(P.x + P.w / 2 + 4, y + 11, 'TRECHO:') + tx(P.x + P.w / 2 + 38, y + 11, rod.slice(0, 22), { fs: 5.6, b: 1, c: C });
    y += 15; g += L(y) + lab(P.x + 5, y + 10, 'Nº DESENHO ANTT:') + tx(P.x + 76, y + 11, String(l.numeroDesenho || '—').slice(0, 34), { fs: 6, b: 1, c: '#1F3AD0' });
    y += 15; g += L(y) + ln(P.x + P.w / 2, y, P.x + P.w / 2, P.y + P.h, `stroke="${BLUE}" stroke-width=".5"`) + lab(P.x + 5, y + 11, 'ESCALA:') + tx(P.x + 40, y + 11, 'INDICADAS', { fs: 5.6, b: 1, c: C }) + lab(P.x + P.w / 2 + 4, y + 11, 'FOLHA:') + tx(P.x + P.w / 2 + 34, y + 11, '01/01', { fs: 5.6, b: 1, c: C });
    void m; return g;
  }

  /* ---------- a folha ---------- */
  function svg(l, { foco = 'tudo' } = {}) {
    const m = BU.Prancha.modelo(l); if (!m) return '';
    let tin = null; try { tin = m.pts.length >= 3 ? BU.TIN.triangular(m.pts) : null; } catch (e) { tin = null; }
    const v = FOCOS[foco] || FOCOS.tudo;
    const aviso = m.modo === 'estimado' ? tx(A.p1.x + 6, A.p1.y + 12, 'Eixo estimado: não achei GI MONT / GI JUS nem geratrizes. Use esses códigos no RTK.', { fs: 6, b: 1, c: '#B45309' }) : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.join(' ')}" width="${v[2]}" height="${v[3]}" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Folha da prancha: plantas, perfil longitudinal, legenda, coordenadas e carimbo do bueiro">
<rect x="0" y="0" width="${SW}" height="${SH}" fill="#fff"/><rect x="5" y="5" width="${SW - 10}" height="${SH - 10}" fill="none" stroke="${BLUE}" stroke-width="1.1"/><rect x="34" y="14" width="1143" height="812" fill="none" stroke="${BLUE}" stroke-width=".8"/>${[0.166, 0.34, 0.559].map(k => `<line x1="${p1(SW * k)}" y1="5" x2="${p1(SW * k)}" y2="14" stroke="${RED}" stroke-width=".7"/><line x1="${p1(SW * k)}" y1="${SH - 14}" x2="${p1(SW * k)}" y2="${SH - 5}" stroke="${RED}" stroke-width=".7"/>`).join('')}<line x1="5" y1="${SH / 2}" x2="34" y2="${SH / 2}" stroke="${RED}" stroke-width=".7"/><line x1="${SW - 34}" y1="${SH / 2}" x2="${SW - 5}" y2="${SH / 2}" stroke="${RED}" stroke-width=".7"/>
${planta(l, m, A.p1, tin, 'geral')}${planta(l, m, A.p2, tin, 'detalhe')}${perfil(l, m, A.p3)}${notas(l, m)}${legenda()}${coordenadas()}${mapa(l)}${revisoes(l)}${carimbo(l, m)}${aviso}</svg>`;
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
    const cols = estacas(m, nl).map(s => ({ s })), lab = ['ESTACA (m)', 'COTA TERRENO', 'COTA GI', 'RECOBRIMENTO', 'DECLIVIDADE %'], yT = Y(zMin) - h * 5;
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

  BU.Folha = { preparar, svg, dxf, FOCOS, SW, SH };
})();
