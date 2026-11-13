/* hidraulica.js — capacidade hidráulica do bueiro pela equação de Manning (vazão máxima, sem comparar com a vazão da bacia).
   Referência (definida pelo Filipe): DNIT, Manual de Drenagem de Rodovias, IPR-724 (2ª ed., 2006), cap. 2 (Bueiros) e Apêndice B, tabelas 26 e 27.
     n: concreto 0,015 · metálico corrugado 0,019 / 0,021 / 0,024 (conforme o perfil da chapa) · aço corrugado (não destrutivo) 0,024
     Celular: lâmina máxima = 80% da altura (folga de 25% sobre o tirante).
     Tubular: tirante crítico dc = 0,716·D (o manual parte do regime crítico com energia específica mínima = D).
     Velocidade: no máximo 4,5 m/s nos tubos de concreto.
     Declividade: diferença de cota entre as geratrizes inferiores de montante e jusante (vem dos pontos do RTK em medicoes.declividade);
     sem isso, cotas de entrada/saída informadas; sem nada, estimada em 2,5% (mínimo) e sinalizada.
   Q = (1/n) · A · R^(2/3) · S^(1/2). Formas sem fórmula definida (lenticular, arco, outra) e materiais sem n (PEAD, PVC, alvenaria, outro) não são calculados. */
(function () {
  'use strict';
  const BU = window.BU;
  const N_CONCRETO = 0.015, N_METALICO = 0.024, S_MIN = 0.025, V_MAX = 4.5, Y_CRITICO = 0.716, Y_CELULAR = 0.8;
  const num = v => (v == null || v === '' || !isFinite(+v)) ? null : +v;

  function declividade(l) {
    const m = l.medicoes || {}, auto = l.medicoesAuto || {};
    const d = num(m.declividade);
    if (d != null && d > 0) return { S: d / 100, origem: auto.declividade ? 'geratrizes inferiores de montante e jusante (pontos do RTK)' : 'informada nas medições', estimada: false };
    const ce = num(m.cotaEntrada), cs = num(m.cotaSaida), L = num(m.comprimentoBueiro);
    if (ce != null && cs != null && L > 0 && ce > cs) return { S: (ce - cs) / L, origem: 'cotas de entrada e saída', estimada: false };
    return { S: S_MIN, origem: 'ESTIMADA: sem cotas das geratrizes, adotado o mínimo de 2,5%', estimada: true };
  }

  /* devolve { ok, motivo } ou { ok:true, ... } */
  function capacidade(l) {
    const c = l.caracteristicas || {};
    const forma = c.tipo, linhas = Math.max(1, +c.celulas || 1), avisos = [];
    let n, nNota = '';
    if (c.material === 'Concreto') n = N_CONCRETO;
    else if (c.material === 'Metálico') { n = N_METALICO; nNota = 'chapa corrugada sem o perfil informado: adotado o valor mais conservador (0,024); o manual dá 0,019 a 0,024 conforme o perfil'; }
    else return { ok: false, motivo: c.material ? `material “${c.material}” sem coeficiente n definido na referência` : 'material não informado' };

    let A, P, y, H;
    if (forma === 'Tubular') {
      const D = num(c.diametro); if (!(D > 0)) return { ok: false, motivo: 'diâmetro não informado' };
      H = D; y = Y_CRITICO * D;
      const th = 2 * Math.acos(1 - 2 * y / D);
      A = D * D / 8 * (th - Math.sin(th)); P = D * th / 2;
    } else if (forma === 'Celular') {
      const B = num(c.largura); H = num(c.altura); if (!(B > 0 && H > 0)) return { ok: false, motivo: 'largura e altura da célula não informadas' };
      y = Y_CELULAR * H; A = B * y; P = B + 2 * y;
    } else return { ok: false, motivo: forma ? `forma “${forma}” sem fórmula definida na referência` : 'forma da seção não informada' };

    const R = A / P, d = declividade(l);
    const Q1 = (1 / n) * A * Math.pow(R, 2 / 3) * Math.sqrt(d.S), v = Q1 / A, Q = Q1 * linhas;
    if (c.material === 'Concreto' && forma === 'Tubular' && v > V_MAX) avisos.push(`velocidade ${v.toFixed(2).replace('.', ',')} m/s acima do limite de 4,5 m/s para tubos de concreto`);
    if (d.estimada) avisos.push('declividade estimada: confirmar com as geratrizes do RTK');
    if (nNota) avisos.push(nNota);
    return { ok: true, forma, material: c.material, linhas, n, y, H, A, R, S: d.S, SOrigem: d.origem, SEstimada: d.estimada, V: v, Q1, Q, avisos };
  }

  const f = (v, d) => (+v).toFixed(d).replace('.', ',');
  /* pares [rótulo, valor] para o relatório / painel */
  function resumo(l) {
    const r = capacidade(l);
    if (!r.ok) return [['Capacidade (Manning)', 'não calculada: ' + r.motivo]];
    return [
      ['Vazão máxima (Manning)', `${f(r.Q, 2)} m³/s` + (r.linhas > 1 ? ` (${r.linhas} linhas × ${f(r.Q1, 2)} m³/s)` : '')],
      ['Velocidade', `${f(r.V, 2)} m/s`],
      ['Coeficiente n', f(r.n, 3)],
      ['Declividade', `${f(r.S * 100, 2)}% — ${r.SOrigem}`],
      ['Lâmina adotada', `${f(r.y, 2)} m (${f(100 * r.y / r.H, 0)}% da ${r.forma === 'Tubular' ? 'altura/diâmetro' : 'altura'})`],
      ['Observações', r.avisos.join('; ')],
      ['Critério', 'DNIT IPR-724 (2ª ed.): capacidade máxima; não compara com a vazão da bacia'],
    ];
  }
  BU.Hidraulica = { capacidade, resumo, declividade };
})();
