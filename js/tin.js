/* tin.js — triangulação de Delaunay (Bowyer–Watson) dos pontos do levantamento, para a planta e o DXF.
   BU.TIN.triangular(pontos[{E,N,Z}], { maxAresta }) → { tri: [[i,j,k]], arestas: [[i,j]] }  (índices do vetor recebido).
   Triângulos com lado acima de 100 m (padrão do Civil 3D) são descartados; fora isso a superfície cobre todos os pontos. */
(function () {
  'use strict';
  const BU = window.BU;

  function triangular(pts, opc = {}) {
    // pontos únicos (o mesmo E,N com cotas diferentes entra uma vez, com a menor cota)
    const mapa = new Map(), idx = [];
    pts.forEach((p, i) => { const k = p.E.toFixed(3) + '|' + p.N.toFixed(3); if (!mapa.has(k)) { mapa.set(k, idx.length); idx.push(i); } });
    const n = idx.length; if (n < 3) return { tri: [], arestas: [] };
    const E0 = Math.min(...idx.map(i => pts[i].E)), N0 = Math.min(...idx.map(i => pts[i].N));
    const P = idx.map(i => ({ x: pts[i].E - E0, y: pts[i].N - N0, i }));
    const xs = P.map(p => p.x), ys = P.map(p => p.y), dx = Math.max(...xs) - Math.min(...xs), dy = Math.max(...ys) - Math.min(...ys), d = Math.max(dx, dy, 1) * 20;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const V = P.concat([{ x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx, y: cy + d }]);
    const circ = (a, b, c) => {
      const A = V[a], B = V[b], C = V[c], D = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
      if (Math.abs(D) < 1e-12) return null;
      const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) + (B.x ** 2 + B.y ** 2) * (C.y - A.y) + (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / D;
      const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) + (B.x ** 2 + B.y ** 2) * (A.x - C.x) + (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / D;
      return { x: ux, y: uy, r2: (A.x - ux) ** 2 + (A.y - uy) ** 2 };
    };
    let T = [{ v: [n, n + 1, n + 2], c: circ(n, n + 1, n + 2) }];
    for (let p = 0; p < n; p++) {
      const ruins = [], resto = [];
      for (const t of T) { if (t.c && (V[p].x - t.c.x) ** 2 + (V[p].y - t.c.y) ** 2 <= t.c.r2 * (1 + 1e-12)) ruins.push(t); else resto.push(t); }
      const borda = new Map();
      for (const t of ruins) for (let e = 0; e < 3; e++) {
        const a = t.v[e], b = t.v[(e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a;
        borda.set(k, borda.has(k) ? null : [a, b]);
      }
      T = resto;
      for (const e of borda.values()) { if (!e) continue; const c = circ(e[0], e[1], p); if (c) T.push({ v: [e[0], e[1], p], c }); }
    }
    let tri = T.filter(t => t.v.every(v => v < n)).map(t => t.v.map(v => P[v].i));
    // limite de aresta
    const len = (a, b) => Math.hypot(pts[a].E - pts[b].E, pts[a].N - pts[b].N);
    const lim = opc.maxAresta || 100; // como no Civil 3D: a superfície cobre todos os pontos; só triângulos com lado acima de 100 m são descartados
    tri = tri.filter(t => len(t[0], t[1]) <= lim && len(t[1], t[2]) <= lim && len(t[2], t[0]) <= lim);
    const ar = new Map();
    tri.forEach(t => { for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a; if (!ar.has(k)) ar.set(k, a < b ? [a, b] : [b, a]); } });
    return { tri, arestas: [...ar.values()], limite: lim };
  }

  BU.TIN = { triangular };
})();
