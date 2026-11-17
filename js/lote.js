/* lote.js — TXT do RTK com vários bueiros: separa os pontos por bueiro e, em bueiro duplo/triplo/quádruplo,
   liga sozinho cada geratriz ao tubo certo (montante ↔ jusante) e cada ala ao tubo mais próximo. Expõe BU.Lote.

   Regras (todas conferidas na tela do painel antes de gravar):
   - Separação: pontos a menos de 40 m um do outro formam um grupo; o grupo vai para o bueiro cadastrado mais perto
     (pela coordenada do cadastro, até 150 m) usando o centro das geratrizes (GI/GTZ).
   - Tubos: pontos de geratriz a menos de 0,3 m (par topo/base) são o mesmo ponto; vale o de menor cota.
     A boca de montante é a de cota mais alta (ou a rotulada GI MONT). O tubo 1 é o da ESQUERDA olhando para jusante.
   - Ala: cada ponto de ala/muro vai para a boca mais próxima e para o tubo mais próximo dele. */
(function () {
  'use strict';
  const BU = window.BU;
  const nv = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; };
  const papelDe = p => BU.Prancha.papel(p.codigo);
  const ehGI = p => ['gim', 'gij', 'gtz'].includes(papelDe(p));
  const ehAla = p => /ALA|MURO|TESTA/i.test(String(p.codigo || '').replace(/[^A-Za-z]/g, '')) && !ehGI(p);
  const d2 = (a, b) => Math.hypot(a.E - b.E, a.N - b.N);
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

  /* Convenção do app: X = Norte, Y = Este. Arquivo invertido (X < 1.000.000 e Y > 1.000.000) é corrigido. */
  function coordenadas(pontos) {
    const v = pontos.map(p => ({ p, a: nv(p.x), b: nv(p.y), Z: nv(p.z) })).filter(q => q.a != null && q.b != null && q.Z != null);
    if (!v.length) return [];
    const troca = med(v.map(q => Math.abs(q.a))) < 1e6 && med(v.map(q => Math.abs(q.b))) > 1e6;
    return v.map(q => ({ p: q.p, E: troca ? q.a : q.b, N: troca ? q.b : q.a, Z: q.Z }));
  }
  const centro = a => ({ E: a.reduce((s, q) => s + q.E, 0) / a.length, N: a.reduce((s, q) => s + q.N, 0) / a.length });

  /* ---------- 1) separar os pontos por bueiro ---------- */
  function agrupar(pts, lim) { // união de pontos vizinhos (grade para ser rápido)
    const pai = pts.map((_, i) => i), raiz = i => { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; };
    const cel = new Map(), chave = (x, y) => x + ',' + y;
    pts.forEach((q, i) => { const k = chave(Math.floor(q.E / lim), Math.floor(q.N / lim)); if (!cel.has(k)) cel.set(k, []); cel.get(k).push(i); });
    pts.forEach((q, i) => {
      const cx = Math.floor(q.E / lim), cy = Math.floor(q.N / lim);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of cel.get(chave(cx + dx, cy + dy)) || []) {
        if (j > i && d2(q, pts[j]) <= lim) pai[raiz(j)] = raiz(i);
      }
    });
    const g = new Map(); pts.forEach((q, i) => { const r = raiz(i); if (!g.has(r)) g.set(r, []); g.get(r).push(q); });
    return [...g.values()];
  }

  /* pontos: lista do parsear(); bueiros: linhas do painel (id, codigo, km, leste, norte, zona). Devolve grupos ordenados do norte para o sul. */
  function separar(pontos, bueiros, { raio = 150, lim = 40 } = {}) {
    const pts = coordenadas(pontos), alvos = (bueiros || []).filter(b => b.leste != null && b.norte != null).map(b => ({ b, E: +b.leste, N: +b.norte }));
    const grupos = agrupar(pts, lim).map(g => {
      const gi = g.filter(q => ehGI(q.p)), ancora = centro(gi.length ? gi : g);
      const cand = alvos.map(a => ({ b: a.b, d: Math.hypot(a.E - ancora.E, a.N - ancora.N) })).sort((x, y) => x.d - y.d).slice(0, 6);
      const aviso = [];
      let escolha = cand.length && cand[0].d <= raio ? cand[0] : null;
      if (!gi.length) { aviso.push('sem geratriz (GI / GTZ)'); escolha = null; }
      else if (!escolha) aviso.push(cand.length ? `bueiro mais perto está a ${Math.round(cand[0].d)} m` : 'projeto sem coordenadas de cadastro');
      else if (cand[1] && cand[1].d - cand[0].d < 30) aviso.push('dois bueiros muito próximos: confira');
      if (escolha && escolha.b.status === 'aprovado') aviso.push('bueiro já aprovado: confirme antes de substituir os pontos');
      if (escolha && escolha.b.status === 'aprovado') escolha = null;
      return { pontos: g.map(q => q.p), n: g.length, nGI: gi.length, centro: ancora, cand, alvo: escolha ? escolha.b.id : '', dist: escolha ? escolha.d : null, aviso };
    });
    // dois grupos para o mesmo bueiro: fica o que tem mais geratrizes
    const usados = new Map();
    grupos.slice().sort((x, y) => y.nGI - x.nGI).forEach(g => { if (!g.alvo) return; if (usados.has(g.alvo)) { g.aviso.push('o mesmo bueiro já recebeu outro grupo'); g.alvo = ''; } else usados.set(g.alvo, g); });
    return grupos.sort((x, y) => y.centro.N - x.centro.N);
  }

  /* ---------- 2) ligar geratrizes e alas aos tubos ---------- */
  function parear(pontos, celulas) {
    const avisos = [], limpar = p => { if (/^(montante|jusante):(GTZ|ALA)/.test(String(p.ref || ''))) delete p.ref; delete p.tubo; };
    pontos.forEach(limpar);
    const todos = coordenadas(pontos), gi = todos.filter(q => ehGI(q.p));
    // unidades: par topo/base no mesmo lugar é um ponto só (vale o de menor cota)
    const un = [];
    gi.forEach(q => { const u = un.find(x => Math.hypot(x.E - q.E, x.N - q.N) <= 0.3); if (u) { u.q.push(q); if (q.Z < u.base.Z) u.base = q; } else un.push({ E: q.E, N: q.N, q: [q], base: q }); });
    un.forEach(u => { u.Z = u.base.Z; u.papel = papelDe(u.base.p); });
    if (un.length < 2) return { tubos: [], avisos: ['geratrizes insuficientes para ligar as bocas'] };
    // separa montante e jusante: pelo rótulo (GI MONT / GI JUS) ou pela distância e cota
    let M, J;
    const rm = un.filter(u => u.papel === 'gim'), rj = un.filter(u => u.papel === 'gij');
    if (rm.length && rj.length) { M = rm; J = rj; }
    else {
      let a = un[0], b = un[1], dm = -1;
      un.forEach(x => un.forEach(y => { const d = d2(x, y); if (d > dm) { dm = d; a = x; b = y; } }));
      const A = [], B = []; un.forEach(u => (d2(u, a) <= d2(u, b) ? A : B).push(u));
      const zA = A.reduce((s, u) => s + u.Z, 0) / A.length, zB = B.reduce((s, u) => s + u.Z, 0) / B.length;
      [M, J] = zA >= zB ? [A, B] : [B, A];
    }
    const cM = centro(M), cJ = centro(J), L = Math.hypot(cJ.E - cM.E, cJ.N - cM.N);
    if (L < 0.5) return { tubos: [], avisos: ['bocas de montante e jusante no mesmo lugar'] };
    const uE = (cJ.E - cM.E) / L, uN = (cJ.N - cM.N) / L, vE = -uN, vN = uE; // v = esquerda de quem olha para jusante
    const tDe = q => (q.E - cM.E) * vE + (q.N - cM.N) * vN;
    M.forEach(u => { u.t = tDe(u); }); J.forEach(u => { u.t = tDe(u); });
    M.sort((x, y) => y.t - x.t); J.sort((x, y) => y.t - x.t); // esquerda primeiro
    if (M.length !== J.length) avisos.push(`montante tem ${M.length} geratriz(es) e jusante ${J.length}: conferir os tubos`);
    if (celulas && +celulas > 1 && Math.max(M.length, J.length) !== +celulas) avisos.push(`o cadastro diz ${celulas} tubos, mas o arquivo tem ${Math.max(M.length, J.length)} geratriz(es) por boca`);
    const marca = (lado, arr) => arr.forEach((u, i) => u.q.forEach(q => { q.p.ref = `${lado}:GTZ-${i + 1}`; }));
    marca('montante', M); marca('jusante', J);
    const tubos = [];
    for (let i = 0; i < Math.max(M.length, J.length); i++) {
      const m = M[i], j = J[i], t = { k: i + 1, mont: m ? { id: m.base.p.id, Z: m.Z, E: m.E, N: m.N } : null, jus: j ? { id: j.base.p.id, Z: j.Z, E: j.E, N: j.N } : null, alas: 0 };
      if (m && j) { t.L = Math.hypot(j.E - m.E, j.N - m.N); t.decl = t.L > 0 ? (m.Z - j.Z) / t.L * 100 : null; }
      tubos.push(t);
    }
    // alas e muros: boca mais próxima + tubo mais próximo
    let ia = { montante: 0, jusante: 0 };
    todos.filter(q => ehAla(q.p)).forEach(q => {
      const lado = d2(q, cM) <= d2(q, cJ) ? 'montante' : 'jusante', arr = lado === 'montante' ? M : J; if (!arr.length) return;
      let k = 0; arr.forEach((u, i) => { if (d2(q, u) < d2(q, arr[k])) k = i; });
      q.p.ref = `${lado}:ALA-${tDe(q) >= 0 ? 'E' : 'D'}-${++ia[lado]}`; q.p.tubo = k + 1; if (tubos[k]) tubos[k].alas++;
    });
    return { tubos, avisos };
  }

  BU.Lote = { separar, parear, coordenadas };
})();
