/* conferencias.js — projeção no eixo da rodovia (km) e conferências automáticas do levantamento. Expõe BU.Eixo e BU.Conf.
   Usado pelo app de campo (mapa e aviso na revisão) e pelo painel de gestão (card "Conferências"). */
(function () {
  'use strict';
  const BU = (window.BU = window.BU || {});

  /* ---------- eixo: { rodovia, kmIni (m), pts: [[lat, lon], ...] } ---------- */
  const zonaDe = lon => Math.floor((lon + 180) / 6) + 1;
  function geo(eixo) {
    if (!eixo || !eixo.pts || eixo.pts.length < 2) return null;
    if (eixo._g) return eixo._g;
    const z = zonaDe(eixo.pts[0][1]), xy = eixo.pts.map(([la, lo]) => { const u = BU.GPS.paraUTM(la, lo, z); return [u.leste, u.norte]; }), cum = [0];
    for (let i = 1; i < xy.length; i++) cum[i] = cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    const g = { z, xy, cum, total: cum[cum.length - 1] };
    try { Object.defineProperty(eixo, '_g', { value: g, enumerable: false }); } catch (e) { /* objeto congelado: sem cache */ }
    return g;
  }
  /* Posição (lat/lon) -> { metros: km do ponto em metros, off: distância ao eixo em metros } */
  function kmDe(eixo, lat, lon) {
    const g = geo(eixo); if (!g || lat == null || lon == null) return null;
    const u = BU.GPS.paraUTM(lat, lon, g.z); let best = null;
    for (let i = 0; i < g.xy.length - 1; i++) {
      const [ax, ay] = g.xy[i], [bx, by] = g.xy[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((u.leste - ax) * dx + (u.norte - ay) * dy) / l2)) : 0;
      const d = Math.hypot(u.leste - (ax + t * dx), u.norte - (ay + t * dy));
      if (!best || d < best.off) best = { off: d, along: g.cum[i] + t * Math.sqrt(l2) };
    }
    return { metros: (eixo.kmIni || 0) + best.along, off: best.off };
  }

  /* Distância (m) entre dois pontos lat/lon e rumo (graus, 0 = norte). */
  function dist(la1, lo1, la2, lo2) {
    const R = 6371008.8, r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function rumo(la1, lo1, la2, lo2) {
    const r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r), x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  const PONTOS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const rumoTxt = g => PONTOS[Math.round(g / 45) % 8];
  const fmtDist = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',') + ' km';

  /* ---------- conferências ---------- */
  const LIM = { precisaoH: 0.10, distPlanoAviso: 50, distPlanoErro: 200, foraEixo: 150, kmDiverge: 100 };
  const SOLUCOES_FIXAS = ['Fixa'];
  const num = v => { const n = BU.U.parseNum(v); return n; };

  /* l = levantamento (dados); eixo opcional. Devolve [{ n: 'erro'|'aviso', cod, t, e (etapa) }]. */
  function analisar(l, eixo) {
    const P = [], rtk = l.rtk || {}, u = BU.GPS.utmDe(l);
    if (l.status === 'nao_localizado' || l.status === 'a_vistoriar') return P;
    if (!u) return P; // sem coordenadas: já é pendência do formulário
    const add = (n, cod, t, e) => P.push({ n, cod, t, e: e || 1 });
    if (!rtk.solucao || rtk.solucao === 'Não informado') add('aviso', 'rtk_sem_solucao', 'Solução do RTK (fixa/flutuante) não informada');
    else if (!SOLUCOES_FIXAS.includes(rtk.solucao)) add('aviso', 'rtk_nao_fixa', `Solução do RTK “${rtk.solucao}” não é fixa: a precisão pode não atender`);
    const ph = num(rtk.precisaoH);
    if (ph != null && ph > LIM.precisaoH) add('aviso', 'rtk_precisao', `Precisão horizontal do RTK ${String(ph).replace('.', ',')} m (acima de ${String(LIM.precisaoH).replace('.', ',')} m)`);
    if (u.Z == null) add('aviso', 'sem_altitude', 'Altitude (Z) não informada');
    else if (!rtk.tipoAltitude) add('aviso', 'sem_tipo_altitude', 'Altitude: informe se é elipsoidal ou ortométrica');
    const la = l.latitude, lo = l.longitude, pl = l.planejado;
    if (la != null && lo != null && pl && pl.latitude != null && pl.longitude != null) {
      const d = dist(la, lo, pl.latitude, pl.longitude);
      if (d > LIM.distPlanoAviso) add(d > LIM.distPlanoErro ? 'erro' : 'aviso', 'longe_plano', `Posição do RTK a ${fmtDist(d)} do ponto planejado: confirme se é o mesmo bueiro`);
      const zp = zonaDe(pl.longitude);
      if (l.zona && parseInt(l.zona, 10) !== zp && d > 1000) add('erro', 'fuso', `Fuso informado (${l.zona}) não bate com a localização planejada (fuso ${zp})`);
    }
    if (eixo && la != null && lo != null) {
      const k = kmDe(eixo, la, lo);
      if (k) {
        if (k.off > LIM.foraEixo) add('aviso', 'fora_eixo', `Bueiro a ${fmtDist(k.off)} do eixo da rodovia`);
        const kc = BU.Codigo.kmParaMetros(l.km);
        if (kc != null && Math.abs(kc - k.metros) > LIM.kmDiverge) add('aviso', 'km_diverge', `Km informado (${l.km}) difere do km da posição (${BU.Codigo.metrosParaKm(k.metros)}) em ${fmtDist(Math.abs(kc - k.metros))}`, 1);
      }
    }
    return P;
  }
  BU.Eixo = { kmDe, dist, rumo, rumoTxt, fmtDist, zonaDe };
  BU.Conf = { analisar, LIM };
})();
