/* prancha.js — gera a estrutura completa do bueiro a partir dos pontos do RTK (TXT):
   Planta topográfica, Perfil longitudinal pelo eixo, Quadro de dados, tabela de pontos e carimbo.
   Tudo é refeito dos pontos e das dimensões (nada fixo). Expõe BU.Prancha.

   Convenção do TXT do app:  ID X Y Z "CÓDIGO"   com X = Norte e Y = Este (como no RTK).
   Códigos reconhecidos (maiúsculas, sem acento/espaço/hífen):
     GI MONT / GI JUS (ou GIM, GIJ)  geratriz inferior de montante / jusante
     OAC-GTZ / GTZ / GI              geratrizes nas bocas (par inferior + superior em cada boca)
     CB1, CB2… / OAC-ALA / MURO      contorno das bocas (alas, muros)
     TER-ASF / EP / BD / BE          pista (asfalto, eixo, bordas)
     TN / TAL / TER-CA / TER-PA      terreno (natural, talude, crista, pé)
     RN                              referência de nível
   Qualquer outro código entra como "outro" e, se estiver perto do eixo, ajuda a desenhar o perfil. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, esc = U.esc;

  const SW = 1190, SH = 842; // folha A3 paisagem (unidades do desenho)
  const INK = '#16201A', MUTED = '#56635A', GRID = '#E1E7E2', FRAME = '#16201A';
  const COR = { gi: '#C0392B', contorno: '#2E8B57', pista: '#1F3A93', terreno: '#D9822B', rn: '#7B2D8E', outro: '#6B7280' };
  const T = { foco: 'tudo', zoom: 1 };
  let LOGO = ''; // data URL da logo da empresa (config "logoEmpresa")

  /* ---------- números ---------- */
  const nv = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; };
  function fmt(n, d = 2) {
    if (n == null || !isFinite(n)) return '—';
    const neg = n < 0 && Math.abs(n) >= Math.pow(10, -d) / 2, [i, f] = Math.abs(n).toFixed(d).split('.');
    return (neg ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
  }
  const r1 = n => Math.round(n * 10) / 10;
  const p1 = n => (Math.round(n * 10) / 10).toString();
  const nz = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  /* ---------- classificação pelo código ---------- */
  function papel(cod) {
    const k = nz(cod);
    if (!k) return 'outro';
    if (/^GIM|GTZM|GERATRIZMONT/.test(k)) return 'gim';
    if (/^GIJ|GTZJ|GERATRIZJUS/.test(k)) return 'gij';
    if (/GTZ|GERATRIZ|^GI\d*$/.test(k)) return 'gtz';
    if (/^RN/.test(k)) return 'rn';
    if (/ASF|PISTA|^EP|^BD|^BE|BORDA|EIXO|ACOST|PAV|MEIOFIO/.test(k)) return 'pista';
    if (/^CB\d*$|^(OAC)?(ALA|MURO|BOCA|TESTA|CAB|CONT)/.test(k)) return 'contorno';
    if (/^TN|TER|TAL|CRISTA|^CA$|^PA$|SOLO|GREIDE/.test(k)) return 'terreno';
    return 'outro';
  }
  const grupoCor = p => (p === 'gim' || p === 'gij' || p === 'gtz') ? 'gi' : p;

  /* ---------- modelo geométrico ---------- */
  function lerPontos(l) {
    const brutos = (l.pontos || []).map(p => ({ id: String(p.id), a: nv(p.x), b: nv(p.y), Z: nv(p.z), cod: p.codigo || '', papel: papel(p.codigo) })).filter(p => p.a != null && p.b != null && p.Z != null);
    if (!brutos.length) return [];
    const med = arr => { const s = arr.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    // Padrão do app: X = Norte, Y = Este. Se o arquivo vier invertido (X pequeno, Y > 1.000.000), troca.
    const troca = med(brutos.map(p => Math.abs(p.a))) < 1e6 && med(brutos.map(p => Math.abs(p.b))) > 1e6;
    return brutos.map(p => ({ ...p, E: troca ? p.a : p.b, N: troca ? p.b : p.a }));
  }
  function agrupar(pts, lim) { // agrupamento por proximidade (single linkage)
    const g = [];
    for (const p of pts) {
      const achados = g.filter(c => c.some(q => Math.hypot(q.E - p.E, q.N - p.N) <= lim));
      if (!achados.length) g.push([p]);
      else { const base = achados[0]; base.push(p); for (const o of achados.slice(1)) { base.push(...o); g.splice(g.indexOf(o), 1); } }
    }
    return g;
  }
  const minZ = a => a.reduce((m, p) => (p.Z < m.Z ? p : m), a[0]);
  const maxZ = a => a.reduce((m, p) => (p.Z > m.Z ? p : m), a[0]);

  function acharEixo(pts) {
    const gim = pts.filter(p => p.papel === 'gim'), gij = pts.filter(p => p.papel === 'gij');
    if (gim.length && gij.length) {
      const a = minZ(gim), b = minZ(gij);
      if (Math.hypot(a.E - b.E, a.N - b.N) >= 0.5) return { A: { E: a.E, N: a.N, Z: a.Z, id: a.id }, B: { E: b.E, N: b.N, Z: b.Z, id: b.id }, modo: 'GI', rotulado: true };
    }
    const gs = pts.filter(p => p.papel === 'gim' || p.papel === 'gij' || p.papel === 'gtz');
    if (gs.length >= 2) {
      const cl = agrupar(gs, 1.5);
      if (cl.length >= 2) {
        let melhor = null;
        for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
          const ci = centro(cl[i]), cj = centro(cl[j]), d = Math.hypot(ci.E - cj.E, ci.N - cj.N);
          if (!melhor || d > melhor.d) melhor = { i, j, d };
        }
        if (melhor.d >= 0.5) {
          const mk = c => { const lo = minZ(c), hi = maxZ(c), ce = centro(c); return { E: ce.E, N: ce.N, Z: lo.Z, id: lo.id, topo: hi.Z - lo.Z }; };
          let a = mk(cl[melhor.i]), b = mk(cl[melhor.j]);
          const tops = [a.topo, b.topo].filter(t => t > 0.2);
          if (a.Z < b.Z) { const t = a; a = b; b = t; } // montante = boca mais alta
          return { A: a, B: b, modo: 'GTZ', Hgeratriz: tops.length ? tops.reduce((x, y) => x + y, 0) / tops.length : null };
        }
      }
    }
    // Sem geratrizes: estima o eixo pela direção principal dos pontos da estrutura (ou de todos).
    const base = (() => { const e = pts.filter(p => p.papel === 'contorno' || p.papel === 'gim' || p.papel === 'gij' || p.papel === 'gtz'); return e.length >= 3 ? e : pts.filter(p => p.papel !== 'rn'); })();
    if (base.length < 2) return null;
    const c = centro(base); let sxx = 0, syy = 0, sxy = 0;
    base.forEach(p => { const dx = p.E - c.E, dy = p.N - c.N; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
    const ss = base.map(p => (p.E - c.E) * ux + (p.N - c.N) * uy), lo = Math.min(...ss), hi = Math.max(...ss), L = hi - lo;
    if (L < 0.5) return null;
    const zEnd = (alvo) => { const perto = base.filter((p, i) => Math.abs(ss[i] - alvo) <= 0.2 * L); return (perto.length ? minZ(perto) : minZ(base)).Z; };
    let a = { E: c.E + ux * lo, N: c.N + uy * lo, Z: zEnd(lo), id: '' }, b = { E: c.E + ux * hi, N: c.N + uy * hi, Z: zEnd(hi), id: '' };
    if (a.Z < b.Z) { const t = a; a = b; b = t; }
    return { A: a, B: b, modo: 'estimado' };
  }
  function centro(a) { return { E: a.reduce((s, p) => s + p.E, 0) / a.length, N: a.reduce((s, p) => s + p.N, 0) / a.length }; }

  function modelo(l) {
    const pts = lerPontos(l);
    if (pts.length < 2) return null;
    const ex = acharEixo(pts);
    if (!ex) return null;
    let { A, B } = ex;
    if (l.prancha && l.prancha.inverter) { const t = A; A = B; B = t; }
    const L = Math.hypot(B.E - A.E, B.N - A.N);
    if (!(L >= 0.5)) return null;
    const uE = (B.E - A.E) / L, uN = (B.N - A.N) / L, vE = -uN, vN = uE;
    const loc = p => ({ s: (p.E - A.E) * uE + (p.N - A.N) * uN, t: (p.E - A.E) * vE + (p.N - A.N) * vN });
    pts.forEach(p => Object.assign(p, loc(p)));

    const d = BU.Secao.dims(l);
    const Hint = d ? d.H : (ex.Hgeratriz || 1), e = d ? d.e : Hint * 0.08, Wplan = d ? d.W : Hint + 2 * e;
    const ilustrativo = !d && !ex.Hgeratriz;
    const inv = s => A.Z + (B.Z - A.Z) * s / L;
    const decl = (A.Z - B.Z) / L * 100;

    // Linha do terreno/pista: pontos de terreno, pista e "outros" perto do eixo, em ordem de distância.
    const tol = Math.max(1.5, 0.06 * L);
    const cand = pts.filter(p => p.papel === 'terreno' || p.papel === 'pista' || p.papel === 'outro');
    let linha = cand.filter(p => Math.abs(p.t) <= tol).sort((x, y) => x.s - y.s), seLinha = true;
    if (linha.length < 2) { linha = cand.slice().sort((x, y) => x.s - y.s); seLinha = false; }
    const dentro = linha.filter(p => p.s >= 0 && p.s <= L);
    let cob = null;
    if (dentro.length) { const t = maxZ(dentro); cob = { s: t.s, zTopoPista: t.Z, valor: t.Z - (inv(t.s) + Hint + e) }; }
    return { pts, A, B, L, u: { E: uE, N: uN }, decl, H: Hint, e, Wplan, ilustrativo, modo: ex.modo, linha, seLinha, tol, cob, inv, rn: pts.find(p => p.papel === 'rn') || null, dims: d };
  }

  const temDados = l => { try { return !!modelo(l); } catch (e) { console.error(e); return false; } };
  const croquiPronto = l => temDados(l) || !!BU.Secao.forma(l) || !!(l.secao && l.secao.salvoEm);

  /* Cota de entrada/saída, comprimento e declividade vêm dos pontos (sem apagar o que a pessoa digitou). */
  function sincronizarMedicoes(l) {
    let m; try { m = modelo(l); } catch (e) { return false; }
    if (!m) return false;
    const novos = { comprimentoBueiro: +m.L.toFixed(2), declividade: +m.decl.toFixed(2), cotaEntrada: +m.A.Z.toFixed(3), cotaSaida: +m.B.Z.toFixed(3) };
    l.medicoesAuto = l.medicoesAuto || {};
    let mudou = false;
    for (const k in novos) {
      if (l.medicoes[k] == null || l.medicoesAuto[k]) { if (l.medicoes[k] !== novos[k]) { l.medicoes[k] = novos[k]; mudou = true; } l.medicoesAuto[k] = true; }
    }
    return mudou;
  }
  function usarCentroComoCoordenada(l) {
    const m = modelo(l); if (!m) return false;
    l.leste = +((m.A.E + m.B.E) / 2).toFixed(3); l.norte = +((m.A.N + m.B.N) / 2).toFixed(3);
    l.altitude = +((m.A.Z + m.B.Z) / 2).toFixed(3); l.coordOrigem = 'rtk';
    BU.GPS.atualizarLatLon(l);
    return true;
  }

  /* ---------- desenho ---------- */
  const tx = (x, y, t, o = {}) => `<text x="${p1(x)}" y="${p1(y)}" font-size="${o.fs || 7}"${o.b ? ' font-weight="700"' : ''} fill="${o.c || INK}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.rot ? ` transform="rotate(${o.rot} ${p1(x)} ${p1(y)})"` : ''}${o.halo ? ` stroke="#fff" stroke-width="2.2" paint-order="stroke" stroke-linejoin="round"` : ''}${o.ex || ''}>${esc(t)}</text>`;
  const ln = (x1, y1, x2, y2, st = '') => `<line x1="${p1(x1)}" y1="${p1(y1)}" x2="${p1(x2)}" y2="${p1(y2)}" ${st}/>`;
  const caixa = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${FRAME}" stroke-width=".9"/>`;
  function passoNice(range, alvo) {
    const bruto = range / alvo, pot = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / pot;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pot;
  }
  const SIMB = (g, x, y) => g === 'gi' ? `<rect x="${p1(x - 2.6)}" y="${p1(y - 2.6)}" width="5.2" height="5.2" fill="${COR.gi}" stroke="#fff" stroke-width=".6"/>`
    : g === 'rn' ? `<polygon points="${p1(x)},${p1(y - 4)} ${p1(x + 3.8)},${p1(y + 2.6)} ${p1(x - 3.8)},${p1(y + 2.6)}" fill="${COR.rn}" stroke="#fff" stroke-width=".6"/>`
    : `<circle cx="${p1(x)}" cy="${p1(y)}" r="${g === 'contorno' ? 2 : 2.2}" fill="${COR[g] || COR.outro}" stroke="#fff" stroke-width=".5"/>`;

  function planta(l, m, R0) {
    const P = { x: 14, y: 14, w: 790, h: 404 };
    const pts = m.pts, Wp = m.Wplan;
    const ss = pts.map(p => p.s).concat([0, m.L]), tt = pts.map(p => p.t).concat([Wp / 2, -Wp / 2]);
    let sMin = Math.min(...ss) - 2.5, sMax = Math.max(...ss) + 2.5, tMin = Math.min(...tt) - 2.2, tMax = Math.max(...tt) + 2.2;
    if (tMax - tMin < 6) { const c = (tMax + tMin) / 2; tMin = c - 3; tMax = c + 3; }
    const R = { x: P.x + 26, y: P.y + 50, w: P.w - 52, h: P.h - 50 - 44 };
    const sc = Math.min(R.w / (sMax - sMin), R.h / (tMax - tMin));
    const ox = R.x + (R.w - (sMax - sMin) * sc) / 2, oy = R.y + (R.h - (tMax - tMin) * sc) / 2;
    const X = s => ox + (s - sMin) * sc, Y = t => oy + (tMax - t) * sc;
    let g = caixa(P.x, P.y, P.w, P.h) + tx(P.x + 10, P.y + 18, 'PLANTA', { fs: 13, b: 1 })
      + tx(P.x + 10, P.y + 31, `Coordenadas UTM · SIRGAS 2000 · fuso ${l.zona || ''}${l.hemisferio || 'S'} · eixo do bueiro na horizontal, montante à esquerda`, { fs: 7, c: MUTED });
    g += `<clipPath id="cl-pl"><rect x="${P.x + 1}" y="${P.y + 38}" width="${P.w - 2}" height="${P.h - 39}"/></clipPath><g clip-path="url(#cl-pl)">`;
    // corpo do bueiro (faixa) e eixo
    g += `<rect x="${p1(X(0))}" y="${p1(Y(Wp / 2))}" width="${p1(m.L * sc)}" height="${p1(Wp * sc)}" fill="#E3EEE6" stroke="#5E8E73" stroke-width="1" stroke-dasharray="4 2"/>`;
    const sA = Math.min(...ss) - 1.5, sB = Math.max(...ss) + 1.5;
    g += ln(X(sA), Y(0), X(sB), Y(0), 'stroke="#2B6CB0" stroke-width=".9" stroke-dasharray="8 2 1.5 2"');
    // contorno das bocas: liga os pontos de cada boca na ordem do ID
    for (const lado of [0, 1]) {
      const c = pts.filter(p => p.papel === 'contorno' && ((p.s < m.L / 2) === !lado)).sort((x, y) => (parseFloat(x.id) - parseFloat(y.id)) || 0);
      if (c.length >= 2) g += `<polyline points="${c.map(p => p1(X(p.s)) + ',' + p1(Y(p.t))).join(' ')}" fill="none" stroke="${COR.contorno}" stroke-width="1.1" stroke-linejoin="round"/>`;
    }
    // pontos e rótulos
    const rotular = pts.length <= 90;
    const gi = pts.filter(p => grupoCor(p.papel) === 'gi' || p.papel === 'rn');
    for (const p of pts) {
      const x = X(p.s), y = Y(p.t), gp = grupoCor(p.papel);
      g += SIMB(gp, x, y);
      if (rotular || gi.includes(p)) g += tx(x + 3.5, y - 3, p.id, { fs: 5.2, c: gp === 'gi' ? COR.gi : MUTED, halo: 1 });
    }
    if (m.rn) g += tx(X(m.rn.s) + 6, Y(m.rn.t) + 11, `RN ${fmt(m.rn.Z, 3)}`, { fs: 6.5, b: 1, c: COR.rn, halo: 1 });
    // fluxo, montante e jusante
    const yf = Math.max(R.y - 4, Y(Wp / 2 + 0.2) - 18), s1 = X(m.L * 0.28), s2 = X(m.L * 0.62);
    g += ln(s1, yf, s2, yf, 'stroke="#2B6CB0" stroke-width="1.6"') + `<polygon points="${p1(s2)},${p1(yf)} ${p1(s2 - 7)},${p1(yf - 3.5)} ${p1(s2 - 7)},${p1(yf + 3.5)}" fill="#2B6CB0"/>`
      + tx((s1 + s2) / 2, yf - 5, 'escoamento', { fs: 7.5, c: '#2B6CB0', a: 'middle' });
    const yl = Math.min(R.y + R.h + 6, Y(-Wp / 2) + 26);
    g += tx(X(0), yl, 'MONTANTE', { fs: 9.5, b: 1, a: 'middle', halo: 1 }) + tx(X(m.L), yl, 'JUSANTE', { fs: 9.5, b: 1, a: 'middle', halo: 1 });
    g += '</g>';
    // norte (rotaciona conforme o eixo)
    const nE = 0, nN = 1, sN = nE * m.u.E + nN * m.u.N, tN = nE * (-m.u.N) + nN * m.u.E; // norte em coordenadas locais (s,t)
    const rot = Math.atan2(sN, tN) * 180 / Math.PI; // 0 = para cima na tela
    const cx = P.x + P.w - 30, cy = P.y + 34;
    g += `<g transform="translate(${cx} ${cy}) rotate(${p1(rot)})"><polygon points="0,-17 7,8 0,3 -7,8" fill="${INK}"/></g>` + tx(cx, cy + 22, 'N', { fs: 9, b: 1, a: 'middle' });
    // escala gráfica
    const alvo = Math.min(R.w * 0.28 / sc, 200), cand = [0.5, 1, 2, 5, 10, 20, 50, 100], Lb = cand.filter(c => c <= alvo).pop() || 0.5, bx = P.x + 14, by = P.y + P.h - 18, wB = Lb * sc;
    g += `<rect x="${p1(bx)}" y="${by}" width="${p1(wB / 2)}" height="5" fill="${INK}"/><rect x="${p1(bx + wB / 2)}" y="${by}" width="${p1(wB / 2)}" height="5" fill="#fff" stroke="${INK}" stroke-width=".7"/>`
      + `<rect x="${p1(bx)}" y="${by}" width="${p1(wB)}" height="5" fill="none" stroke="${INK}" stroke-width=".7"/>` + tx(bx, by - 3, '0', { fs: 6.5 }) + tx(bx + wB, by - 3, `${Lb} m`, { fs: 6.5, a: 'middle' });
    // legenda
    const usados = [...new Set(pts.map(p => grupoCor(p.papel)))], nomes = { gi: 'GI / geratriz', contorno: 'Contorno', pista: 'Pista', terreno: 'Terreno', rn: 'RN', outro: 'Outros' };
    let lx = P.x + P.w - 12; const ly = P.y + P.h - 14;
    for (const k of ['outro', 'terreno', 'pista', 'contorno', 'gi', 'rn'].filter(k => usados.includes(k))) {
      const w = 12 + nomes[k].length * 4; lx -= w; g += SIMB(k, lx + 3, ly - 2) + tx(lx + 9, ly, nomes[k], { fs: 6.5 });
    }
    if (m.modo === 'estimado') g += tx(P.x + P.w / 2, P.y + 44, 'Eixo estimado: não encontrei GI MONT / GI JUS nem geratrizes. Use esses códigos no RTK.', { fs: 7, c: '#B45309', a: 'middle', b: 1 });
    return g;
  }

  function perfil(l, m) {
    const P = { x: 14, y: 428, w: 790, h: 400 };
    const R = { x: P.x + 58, y: P.y + 58, w: P.w - 84, h: P.h - 58 - 44 };
    const ln_ = m.linha;
    const xMin = Math.min(-1.5, ...ln_.map(p => p.s)) - 0.8, xMax = Math.max(m.L + 1.5, ...ln_.map(p => p.s)) + 0.8;
    const zs = [m.A.Z - m.e, m.B.Z - m.e, m.A.Z + m.H + m.e, m.B.Z + m.H + m.e, ...ln_.map(p => p.Z)];
    const zMin = Math.min(...zs) - 0.5, zMax = Math.max(...zs) + 0.7;
    const sx = R.w / (xMax - xMin);
    let sy = sx * 2; if ((zMax - zMin) * sy > R.h) sy = R.h / (zMax - zMin);
    const ex = sy / sx, oy = R.y + (R.h - (zMax - zMin) * sy) / 2 + (zMax - zMin) * sy;
    const X = s => R.x + (s - xMin) * sx, Y = z => oy - (z - zMin) * sy;
    let g = caixa(P.x, P.y, P.w, P.h) + tx(P.x + 10, P.y + 18, 'PERFIL LONGITUDINAL PELO EIXO DO BUEIRO', { fs: 13, b: 1 })
      + tx(P.x + 10, P.y + 31, `Exagero vertical ${ex.toFixed(1).replace('.', ',')}× · distâncias horizontais a partir da GI de montante · cotas conforme o arquivo${m.seLinha ? '' : ' · pontos de terreno fora do eixo (projetados)'}`, { fs: 7, c: MUTED });
    g += `<clipPath id="cl-pf"><rect x="${P.x + 1}" y="${P.y + 38}" width="${P.w - 2}" height="${P.h - 39}"/></clipPath>`;
    // grade
    const pxs = passoNice(xMax - xMin, 8), pzs = passoNice(zMax - zMin, Math.max(3, Math.round(R.h / 38)));
    for (let x = Math.ceil(xMin / pxs) * pxs; x <= xMax + 1e-9; x += pxs) g += ln(X(x), R.y, X(x), R.y + R.h, `stroke="${GRID}" stroke-width=".6"`) + tx(X(x), R.y + R.h + 12, p1(x), { fs: 6.5, c: MUTED, a: 'middle' });
    for (let z = Math.ceil(zMin / pzs) * pzs; z <= zMax + 1e-9; z += pzs) g += ln(R.x, Y(z), R.x + R.w, Y(z), `stroke="${GRID}" stroke-width=".6"`) + tx(R.x - 4, Y(z) + 2.3, fmt(z, pzs < 1 ? 1 : 0), { fs: 6.5, c: MUTED, a: 'end' });
    g += tx(R.x + R.w / 2, P.y + P.h - 8, 'distância (m)', { fs: 7, c: MUTED, a: 'middle' }) + tx(P.x + 14, R.y + R.h / 2, 'cota (m)', { fs: 7, c: MUTED, a: 'middle', rot: -90 });
    g += `<g clip-path="url(#cl-pf)">`;
    // corpo do bueiro
    const A = m.A, B = m.B, L = m.L, e = m.e, H = m.H;
    const poly = (a, b, c, d) => `${p1(X(a[0]))},${p1(Y(a[1]))} ${p1(X(b[0]))},${p1(Y(b[1]))} ${p1(X(c[0]))},${p1(Y(c[1]))} ${p1(X(d[0]))},${p1(Y(d[1]))}`;
    g += `<polygon points="${poly([0, A.Z - e], [L, B.Z - e], [L, B.Z + H + e], [0, A.Z + H + e])}" fill="#DDE3EA" stroke="#55606F" stroke-width="1"/>`
      + `<polygon points="${poly([0, A.Z], [L, B.Z], [L, B.Z + H], [0, A.Z + H])}" fill="#F6F8FA" stroke="#55606F" stroke-width=".7"/>`
      + `<polygon points="${poly([0, A.Z + H], [L, B.Z + H], [L, B.Z + H + e], [0, A.Z + H + e])}" fill="#8C98A8" stroke="#55606F" stroke-width=".7"/>`
      + ln(X(0), Y(A.Z), X(L), Y(B.Z), `stroke="${COR.gi}" stroke-width="2.2"`);
    g += tx(X(0) - 4, Y(A.Z) + 11, `GI ${fmt(A.Z, 3)}`, { fs: 7.5, b: 1, c: COR.gi, a: 'end', halo: 1 }) + tx(X(L) + 4, Y(B.Z) + 11, `GI ${fmt(B.Z, 3)}`, { fs: 7.5, b: 1, c: COR.gi, a: 'start', halo: 1 });
    // terreno / pista
    if (m.seLinha) g += `<polyline points="${m.linha.map(p => p1(X(p.s)) + ',' + p1(Y(p.Z))).join(' ')}" fill="none" stroke="#8A6D1F" stroke-width="1.5" stroke-linejoin="round"/>`;
    const rotular = m.linha.length <= 40;
    for (const p of m.linha) {
      g += `<circle cx="${p1(X(p.s))}" cy="${p1(Y(p.Z))}" r="2" fill="#fff" stroke="#8A6D1F" stroke-width="1"/>`;
      if (rotular) g += tx(X(p.s) + 2.5, Y(p.Z) - 4, p.id, { fs: 5, c: MUTED, halo: 1 });
    }
    // recobrimento
    if (m.cob && m.cob.valor > 0) {
      const xc = X(m.cob.s), yT = Y(m.inv(m.cob.s) + H + e), yP = Y(m.cob.zTopoPista);
      g += ln(xc, yT, xc, yP, 'stroke="#6B2FA0" stroke-width="1.4"') + ln(xc - 3.5, yT, xc + 3.5, yT, 'stroke="#6B2FA0" stroke-width="1.4"') + ln(xc - 3.5, yP, xc + 3.5, yP, 'stroke="#6B2FA0" stroke-width="1.4"')
        + tx(xc - 5, (yT + yP) / 2 + 2.5, `recobrimento ${fmt(m.cob.valor, 2)} m`, { fs: 7.5, b: 1, c: '#6B2FA0', a: 'end', halo: 1 });
    }
    g += tx(X(L / 2), Y(A.Z + (B.Z - A.Z) / 2 + H / 2) + 3, `L = ${fmt(L, 2)} m · i = ${fmt(m.decl, 2)} % · H = ${fmt(H, 2)} m${m.ilustrativo ? ' (ilustrativo)' : ''}`, { fs: 8.5, b: 1, a: 'middle', halo: 1 });
    g += '</g>';
    // legenda
    const it = [['#8A6D1F', 'Terreno / pista (eixo)', 'l'], ['#DDE3EA', 'Corpo do bueiro', 'r'], [COR.gi, 'GI (geratriz inferior)', 'l'], ['#8C98A8', 'Laje superior', 'r']];
    let lx = P.x + P.w - 10; const ly = P.y + 18;
    for (const [c, t, k] of it.slice().reverse()) { const w = 22 + t.length * 3.6; lx -= w; g += (k === 'l' ? ln(lx, ly - 2.5, lx + 14, ly - 2.5, `stroke="${c}" stroke-width="2"`) : `<rect x="${p1(lx)}" y="${ly - 7}" width="14" height="8" fill="${c}" stroke="#55606F" stroke-width=".6"/>`) + tx(lx + 18, ly, t, { fs: 6.5 }); }
    return g;
  }

  function quadro(l, m) {
    const P = { x: 818, y: 14, w: 358, h: 318 }, d = m.dims, c = l.caracteristicas;
    let g = caixa(P.x, P.y, P.w, P.h) + tx(P.x + 10, P.y + 18, 'QUADRO DE DADOS', { fs: 12, b: 1 });
    const tipo = [c.tipo, c.formato, c.material].filter(Boolean).join(' · ') || '—';
    const E3 = p => `E ${fmt(p.E, 3)}  N ${fmt(p.N, 3)}  Z ${fmt(p.Z, 3)}`;
    const itens = [
      ['BUEIRO', l.codigo || 'Sem código'], ['TIPO', tipo], ['SEÇÃO', d ? d.rotulo : '—'],
      ['COMPRIMENTO (GI A GI)', `${fmt(m.L, 2)} m`], ['DECLIVIDADE', `${fmt(m.decl, 2)} %`],
      ['RECOBRIMENTO SOB A PISTA', m.cob && m.cob.valor > 0 ? `${fmt(m.cob.valor, 2)} m` : '—'],
      ['GI MONTANTE', E3(m.A)], ['GI JUSANTE', E3(m.B)],
      ...(m.rn ? [['RN', E3(m.rn)]] : []),
      ['PONTOS LEVANTADOS', String(m.pts.length)], ['ARQUIVO', l.pontosArquivo || '—'],
    ];
    const lh = Math.min(26, (P.h - 36) / itens.length);
    itens.forEach(([k, v], i) => { const y = P.y + 36 + i * lh; g += tx(P.x + 10, y, k, { fs: 5.4, c: MUTED, b: 1 }) + tx(P.x + 10, y + 9.5, v.length > 58 ? v.slice(0, 57) + '…' : v, { fs: 7.6, b: 1 }); });
    return g;
  }

  function tabela(l, m) {
    const P = { x: 818, y: 342, w: 358, h: 376 }, pts = m.pts;
    let g = caixa(P.x, P.y, P.w, P.h) + tx(P.x + 10, P.y + 18, 'PONTOS DO LEVANTAMENTO', { fs: 12, b: 1 });
    const cx = [P.x + 10, P.x + 52, P.x + 128, P.x + 214, P.x + 270], cab = ['Ponto', 'E', 'N', 'Cota', 'Código'];
    cab.forEach((t, i) => { g += tx(cx[i], P.y + 33, t, { fs: 5.6, c: MUTED, b: 1 }); });
    g += ln(P.x + 8, P.y + 36, P.x + P.w - 8, P.y + 36, 'stroke="#CBD4CC" stroke-width=".7"');
    const area = P.h - 44 - 8, max = 52, rh = Math.min(8.6, area / Math.min(pts.length, max)), fs = Math.min(6.4, rh * 0.74);
    pts.slice(0, max).forEach((p, i) => {
      const y = P.y + 36 + (i + 1) * rh - rh * 0.25, cor = COR[grupoCor(p.papel)] || INK;
      g += tx(cx[0], y, p.id, { fs }) + tx(cx[1], y, fmt(p.E, 3), { fs }) + tx(cx[2], y, fmt(p.N, 3), { fs }) + tx(cx[3], y, fmt(p.Z, 3), { fs }) + tx(cx[4], y, p.cod, { fs, c: cor, b: 1 });
    });
    if (pts.length > max) g += tx(P.x + 10, P.y + P.h - 6, `… e mais ${pts.length - max} ponto(s): veja a tabela completa no relatório`, { fs: 6, c: MUTED });
    return g;
  }

  function carimbo(l, m) {
    const P = { x: 818, y: 728, w: 358, h: 100 }, u = BU.GPS.utmDe(l);
    let g = caixa(P.x, P.y, P.w, P.h);
    const x0 = P.x + (LOGO ? 52 : 10);
    if (LOGO) g += `<image href="${LOGO}" x="${P.x + 6}" y="${P.y + 3}" width="42" height="16" preserveAspectRatio="xMidYMid meet"/>`;
    g += tx(x0, P.y + 10, (l.equipe || 'GFA').toUpperCase(), { fs: 6.5, b: 1, c: MUTED }) + tx(x0, P.y + 18, 'CADASTRO DE BUEIROS · LEVANTAMENTO TOPOGRÁFICO', { fs: 5.6, c: MUTED });
    g += tx(P.x + 10, P.y + 40, l.codigo || 'Sem código', { fs: 15, b: 1 });
    const col = [P.x + 10, P.x + 190], lin = [P.y + 54, P.y + 70, P.y + 86];
    const cel = (i, j, k, v) => tx(col[j], lin[i], k, { fs: 5, c: MUTED, b: 1 }) + tx(col[j], lin[i] + 8, String(v || '—').slice(0, 34), { fs: 7, b: 1 });
    g += cel(0, 0, 'RODOVIA', l.estrada) + cel(0, 1, 'KM', l.km) + cel(1, 0, 'PISTA / LADO', [l.pistaGe, l.lado].filter(Boolean).join(' / '))
      + cel(1, 1, 'MUNICÍPIO / UF', [l.municipio, l.estado].filter(Boolean).join(' / ')) + cel(2, 0, 'DATA DO LEVANTAMENTO', U.dataBR(l.data)) + cel(2, 1, 'REFERENCIAL · FOLHA', `${u ? BU.GPS.rotuloUTM(u).replace(' · SIRGAS 2000', '') : 'UTM'} · SIRGAS 2000 · A3`);
    g += ln(P.x, P.y + 21, P.x + P.w, P.y + 21, 'stroke="#CBD4CC" stroke-width=".7"');
    return g;
  }

  const FOCOS = { tudo: [0, 0, SW, SH], planta: [8, 8, 802, 416], perfil: [8, 422, 802, 414], quadro: [812, 8, 372, 828] };
  function gerarSVG(l, { foco = 'tudo' } = {}) {
    const m = modelo(l); if (!m) return '';
    const v = FOCOS[foco] || FOCOS.tudo;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.join(' ')}" width="${v[2]}" height="${v[3]}" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Planta, perfil e quadro de dados do bueiro">
<rect x="0" y="0" width="${SW}" height="${SH}" fill="#fff"/><rect x="5" y="5" width="${SW - 10}" height="${SH - 10}" fill="none" stroke="${FRAME}" stroke-width="1.4"/>
${planta(l, m)}${perfil(l, m)}${quadro(l, m)}${tabela(l, m)}${carimbo(l, m)}</svg>`;
  }

  /* ---------- tela (etapa 5) ---------- */
  function etapaHTML(l) {
    const m = (() => { try { return modelo(l); } catch (e) { console.error(e); return null; } })(), n = (l.pontos || []).length;
    if (!m) {
      return `<div class="card"><h3>Planta, perfil e quadro de dados</h3>
        <p>${n ? `Há <b>${n}</b> ponto(s), mas não foi possível montar o eixo do bueiro (precisa de pelo menos 2 pontos com X, Y e Z válidos).` : 'Importe o TXT do RTK na etapa Pontos: o app monta sozinho a <b>planta</b>, o <b>perfil longitudinal</b> e o <b>quadro de dados</b>.'}</p>
        <button type="button" class="btn primary" data-etapa="6">Ir para Pontos</button></div>`;
    }
    const aba = (k, t) => `<button type="button" data-pr="foco" data-v="${k}" aria-pressed="${T.foco === k}">${t}</button>`;
    const avisos = [];
    if (m.modo === 'estimado') avisos.push('O eixo foi <b>estimado</b>: não achei os códigos GI MONT / GI JUS nem geratrizes (GTZ). Confira a planta.');
    if (m.ilustrativo) avisos.push('Dimensões do bueiro não informadas (Etapa 3): altura ilustrativa.');
    if (!m.seLinha) avisos.push('Poucos pontos de terreno perto do eixo: o perfil mostra os pontos projetados, sem ligar a linha.');
    return `<div class="card prancha-card"><h3>Planta, perfil e quadro de dados</h3>
      <p class="muted small">Gerados a partir dos <b>${m.pts.length}</b> pontos${l.pontosArquivo ? ` de <span class="mono">${esc(l.pontosArquivo)}</span>` : ''}. Montante: <b>${esc(m.A.id ? 'ponto ' + m.A.id : 'cota ' + fmt(m.A.Z, 3))}</b> · Jusante: <b>${esc(m.B.id ? 'ponto ' + m.B.id : 'cota ' + fmt(m.B.Z, 3))}</b>.</p>
      ${avisos.map(a => `<div class="aviso-pr">⚠️ ${a}</div>`).join('')}
      <div class="seg-tools" role="group" aria-label="Parte da prancha">${aba('tudo', 'Prancha')}${aba('planta', 'Planta')}${aba('perfil', 'Perfil')}${aba('quadro', 'Quadro')}</div>
      <div class="row"><button type="button" class="btn sm" data-pr="zoom-">−</button><button type="button" class="btn sm" data-pr="ajustar">Ajustar</button><button type="button" class="btn sm" data-pr="zoom+">+</button>
        <button type="button" class="btn sm" data-pr="inverter">⇄ Inverter montante/jusante</button></div>
      <div id="prancha-box" class="prancha-wrap"><div id="prancha-svg" style="width:${Math.round(T.zoom * 100)}%">${gerarSVG(l, { foco: T.foco })}</div></div>
      <div class="row" style="margin-top:10px"><button type="button" class="btn primary" data-pr="png">Baixar PNG</button><button type="button" class="btn" data-pr="svg">Baixar SVG</button></div>
      <p class="muted small">A prancha segue junto no relatório e nas exportações.</p></div>`;
  }
  function redesenhar() {
    const l = BU.App.cur(), box = document.getElementById('prancha-svg'); if (!l || !box) return;
    box.style.width = Math.round(T.zoom * 100) + '%'; box.innerHTML = gerarSVG(l, { foco: T.foco });
  }
  function miniatura(l) { return temDados(l) ? `<div class="croqui-mini prancha-mini">${gerarSVG(l)}</div>` : BU.Secao.miniatura(l); }

  /* ---------- exportar ---------- */
  const nomeBase = l => 'PRANCHA-' + U.nomeArquivo(l.codigo);
  async function exportarPNG(l) {
    const svg = gerarSVG(l), img = new Image();
    if (!svg) { UI.toast('Importe os pontos do RTK para gerar a prancha', 'aviso'); return; }
    try {
      await new Promise((ok, er) => { img.onload = ok; img.onerror = er; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const cv = document.createElement('canvas'); cv.width = SW * 3; cv.height = SH * 3;
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => { if (b) U.baixar(b, nomeBase(l) + '.png'); else UI.toast('Não foi possível gerar a imagem', 'erro'); }, 'image/png');
    } catch (e) { UI.toast('Não foi possível gerar a imagem. Use "Baixar SVG".', 'erro'); }
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pr]'); if (!b) return;
    const l = BU.App.cur(); if (!l) return;
    const a = b.dataset.pr;
    if (a === 'foco') { T.foco = b.dataset.v; T.zoom = T.foco === 'tudo' ? 1 : 2; BU.App.renderEtapa(); }
    else if (a === 'zoom+') { T.zoom = Math.min(6, T.zoom * 1.5); redesenhar(); }
    else if (a === 'zoom-') { T.zoom = Math.max(1, T.zoom / 1.5); redesenhar(); }
    else if (a === 'ajustar') { T.zoom = 1; redesenhar(); }
    else if (a === 'inverter') { l.prancha = l.prancha || {}; l.prancha.inverter = !l.prancha.inverter; if (sincronizarMedicoes(l)) { /* atualiza cotas */ } BU.App.marcarSujo(); BU.App.renderEtapa(); }
    else if (a === 'png') exportarPNG(l);
    else if (a === 'svg') { const s = gerarSVG(l); if (s) U.baixar(new Blob([s], { type: 'image/svg+xml' }), nomeBase(l) + '.svg'); }
  });

  function setLogo(dataUrl) { LOGO = dataUrl || ''; }

  BU.Prancha = { get logo() { return LOGO; }, etapaHTML, redesenhar, miniatura, gerarSVG, exportarPNG, temDados, croquiPronto, modelo, sincronizarMedicoes, usarCentroComoCoordenada, setLogo, papel, fmt };
})();
