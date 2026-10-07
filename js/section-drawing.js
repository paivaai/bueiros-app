/* section-drawing.js — croqui da seção do bueiro em SVG, com cotas, riscos à mão, anotações e fluxo.
   O desenho paramétrico é sempre refeito a partir das dimensões (nada de valores fixos).
   Em l.secao ficam só: riscos, anotações, sentido do fluxo e uma cópia do SVG para exportação. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, esc = U.esc;

  const VBW = 400, VBH = 380, AREA = { x: 34, y: 38, w: 236, h: 168 };
  const INK = '#16201A', COTA = '#0B3D91', NOTA = '#9A2A0B';
  const FORMATOS = ['Circular', 'Retangular', 'Quadrada', 'Trapezoidal', 'Aduela simples', 'Aduela dupla', 'Personalizada'];
  const CAMPOS_TIPO = {
    'Circular': ['diametro', 'espessura'], 'Retangular': ['largura', 'altura', 'espessura'], 'Quadrada': ['largura', 'espessura'],
    'Trapezoidal': ['largura', 'larguraTopo', 'altura', 'espessura'], 'Aduela simples': ['largura', 'altura', 'espessura'],
    'Aduela dupla': ['largura', 'altura', 'espessura'], 'Personalizada': ['largura', 'altura', 'espessura'],
  };
  function rotulo(tipo, c) {
    if (c === 'diametro') return 'Diâmetro interno';
    if (c === 'espessura') return 'Espessura da parede';
    if (c === 'altura') return 'Altura interna';
    if (c === 'larguraTopo') return 'Largura do topo (interna)';
    if (tipo === 'Quadrada') return 'Lado interno';
    if (tipo === 'Trapezoidal') return 'Largura da base (interna)';
    if (tipo === 'Aduela dupla') return 'Largura de cada célula';
    return 'Largura interna';
  }

  const T = { modo: 'ver' };
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const r1 = n => Math.round(n * 10) / 10;
  const f2 = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

  /* ---------- cotas ---------- */
  const ln = (x1, y1, x2, y2, ex = '') => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" ${ex}/>`;
  function cotaH(x1, x2, y, txt, refY) {
    const ext = refY == null ? '' : ln(x1, refY, x1, y + 3, 'stroke-dasharray="2 2" opacity=".6"') + ln(x2, refY, x2, y + 3, 'stroke-dasharray="2 2" opacity=".6"');
    return `<g stroke="${COTA}" stroke-width="1" fill="none">${ext}${ln(x1, y, x2, y)}${ln(x1, y - 4, x1, y + 4)}${ln(x2, y - 4, x2, y + 4)}</g>`
      + `<text x="${r1((x1 + x2) / 2)}" y="${r1(y + 13)}" text-anchor="middle" font-size="11" font-weight="700" fill="${COTA}">${esc(txt)}</text>`;
  }
  function cotaV(x, y1, y2, txt, refX) {
    const ext = refX == null ? '' : ln(refX, y1, x + 3, y1, 'stroke-dasharray="2 2" opacity=".6"') + ln(refX, y2, x + 3, y2, 'stroke-dasharray="2 2" opacity=".6"');
    const tx = r1(x + 13), ty = r1((y1 + y2) / 2);
    return `<g stroke="${COTA}" stroke-width="1" fill="none">${ext}${ln(x, y1, x, y2)}${ln(x - 4, y1, x + 4, y1)}${ln(x - 4, y2, x + 4, y2)}</g>`
      + `<text x="${tx}" y="${ty}" transform="rotate(-90 ${tx} ${ty})" text-anchor="middle" font-size="11" font-weight="700" fill="${COTA}">${esc(txt)}</text>`;
  }
  const fit = (outW, outH) => {
    const s = Math.min(AREA.w / outW, AREA.h / outH);
    return { s, ox: AREA.x + (AREA.w - outW * s) / 2, oy: AREA.y + (AREA.h - outH * s) / 2 };
  };
  const PAT = 'url(#hach)', STROKE = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"`;
  const rect = (x, y, w, h) => `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${-r1(w)}z`;
  const poly = pts => 'M' + pts.map(p => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'z';

  /* ---------- geometria por tipo ---------- */
  function forma(l) {
    const c = l.caracteristicas, tipo = c.formato;
    const W0 = num(c.largura), H0 = num(c.altura), D = num(c.diametro), Wt = num(c.larguraTopo), e0 = num(c.espessura) || 0;
    const eInf = e0 > 0;

    if (tipo === 'Circular') {
      if (!(D > 0)) return null;
      const n = Math.min(4, Math.max(1, Math.round(num(c.linhas) || 1))); // várias linhas = tubos lado a lado
      const ev = eInf ? e0 : D * 0.08, outD = D + 2 * ev, gap = n > 1 ? D * 0.4 : 0, W = n * outD + (n - 1) * gap;
      const { s, ox, oy } = fit(W, outD), ro = outD * s / 2, ri = D * s / 2, cy = oy + ro;
      const circ = (cx, r) => `M${r1(cx - r)} ${r1(cy)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${-r1(2 * r)} 0z`;
      let d = ''; for (let i = 0; i < n; i++) { const cx = ox + ro + i * (outD + gap) * s; d += circ(cx, ro) + circ(cx, ri); }
      const cx0 = ox + ro, b = oy + outD * s;
      return { e: eInf ? e0 : null, corpo: `<path d="${d}" fill="${PAT}" fill-rule="evenodd" ${STROKE}/>`,
        cot: cotaH(cx0 - ri, cx0 + ri, b + 16, `Ø int ${f2(D)} m`, b) + (eInf ? cotaH(cx0 - ro, cx0 + ro, b + 34, `Ø ext ${f2(outD)} m`, b) : '') };
    }

    if (['Retangular', 'Quadrada', 'Aduela simples', 'Aduela dupla'].includes(tipo)) {
      const W = W0, H = tipo === 'Quadrada' ? W0 : H0;
      if (!(W > 0 && H > 0)) return null;
      const n = tipo === 'Aduela dupla' ? 2 : 1, ev = eInf ? e0 : Math.min(W, H) * 0.08;
      const outW = n * W + (n + 1) * ev, outH = H + 2 * ev, { s, ox, oy } = fit(outW, outH);
      const cs = tipo.startsWith('Aduela') ? Math.min(W, H) * 0.1 * s : 0;
      let d = rect(ox, oy, outW * s, outH * s);
      for (let i = 0; i < n; i++) {
        const x0 = ox + (ev + i * (W + ev)) * s, y0 = oy + ev * s, w = W * s, h = H * s;
        d += cs > 0 ? poly([[x0 + cs, y0], [x0 + w - cs, y0], [x0 + w, y0 + cs], [x0 + w, y0 + h - cs], [x0 + w - cs, y0 + h], [x0 + cs, y0 + h], [x0, y0 + h - cs], [x0, y0 + cs]]) : rect(x0, y0, w, h);
      }
      const R = ox + outW * s, B = oy + outH * s, iy1 = oy + ev * s, iy2 = oy + (ev + H) * s;
      let cot = cotaH(ox + ev * s, ox + (ev + W) * s, B + 16, `${n > 1 ? 'L célula' : 'L int'} ${f2(W)} m`, B);
      if (eInf) cot += cotaH(ox, R, B + 34, `L total ${f2(outW)} m`, B);
      cot += cotaV(R + 14, iy1, iy2, `A int ${f2(H)} m`, R);
      if (eInf) cot += cotaV(R + 38, oy, B, `A total ${f2(outH)} m`, R);
      return { e: eInf ? e0 : null, corpo: `<path d="${d}" fill="${PAT}" fill-rule="evenodd" ${STROKE}/>`, cot };
    }

    if (tipo === 'Trapezoidal') {
      const W = W0, H = H0;
      if (!(W > 0 && H > 0 && Wt > 0 && Wt <= W)) return null;
      const dx = (W - Wt) / 2, ev = eInf ? e0 : Math.min(W, H) * 0.08, k = Math.sqrt(1 + (dx / H) ** 2);
      const xl = y => dx * (1 - y / H) - ev * k, xr = y => W - dx * (1 - y / H) + ev * k;
      const top = -ev, bot = H + ev, minX = xl(bot), outW = xr(bot) - minX, outH = bot - top, { s, ox, oy } = fit(outW, outH);
      const X = x => ox + (x - minX) * s, Y = y => oy + (y - top) * s;
      const outer = [[X(xl(top)), Y(top)], [X(xr(top)), Y(top)], [X(xr(bot)), Y(bot)], [X(xl(bot)), Y(bot)]];
      const inner = [[X(dx), Y(0)], [X(W - dx), Y(0)], [X(W), Y(H)], [X(0), Y(H)]];
      const B = Y(bot), R = X(xr(bot));
      let cot = cotaH(X(0), X(W), B + 16, `Base ${f2(W)} m`, B);
      if (eInf) cot += cotaH(X(minX), X(minX + outW), B + 34, `L total ${f2(outW)} m`, B);
      cot += `<text x="${r1(X(W / 2))}" y="${r1(Y(0) - (eInf ? ev * s : 0) - 6)}" text-anchor="middle" font-size="11" font-weight="700" fill="${COTA}">Topo ${f2(Wt)} m</text>`;
      cot += cotaV(R + 14, Y(0), Y(H), `A int ${f2(H)} m`, R);
      return { e: eInf ? e0 : null, corpo: `<path d="${poly(outer)}${poly(inner)}" fill="${PAT}" fill-rule="evenodd" ${STROKE}/>`, cot };
    }

    if (tipo === 'Personalizada') { // moldura de referência; o formato é riscado à mão
      const ok = W0 > 0 && H0 > 0, W = ok ? W0 : 1, H = ok ? H0 : 0.75, { s, ox, oy } = fit(W, H);
      const B = oy + H * s, R = ox + W * s;
      let grade = ''; for (let gx = ox; gx <= R + .1; gx += (R - ox) / 8) grade += ln(gx, oy, gx, B); for (let gy = oy; gy <= B + .1; gy += (B - oy) / 6) grade += ln(ox, gy, R, gy);
      return { e: null, corpo: `<g stroke="#C9D2CB" stroke-width=".7">${grade}</g><rect x="${r1(ox)}" y="${r1(oy)}" width="${r1(W * s)}" height="${r1(H * s)}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-dasharray="5 3"/>`,
        cot: ok ? cotaH(ox, R, B + 16, `L ${f2(W)} m`, B) + cotaV(R + 14, oy, B, `A ${f2(H)} m`, R) : '' };
    }
    return null;
  }

  /* ---------- SVG completo ---------- */
  function gerarSVG(l) {
    const F = forma(l), s = l.secao || {}, c = l.caracteristicas, m = l.medicoes, fluxo = s.fluxo === 'esquerda' ? 'esquerda' : 'direita';
    let corpo = F ? F.corpo + F.cot : `<text x="${VBW / 2}" y="${AREA.y + AREA.h / 2}" text-anchor="middle" font-size="13" fill="#56635A">${c.formato ? 'Informe as dimensões para desenhar' : 'Escolha o tipo de seção'}</text>`;
    const riscos = (s.tracos || []).map(t => `<polyline points="${t.map(p => p.join(',')).join(' ')}" fill="none" stroke="${NOTA}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    const notas = (s.notas || []).map(n => `<text x="${n.x}" y="${n.y}" font-size="12" font-weight="700" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round">${esc(n.t)}</text><text x="${n.x}" y="${n.y}" font-size="12" font-weight="700" fill="${NOTA}">${esc(n.t)}</text>`).join('');
    const par = (a, b) => (a != null && b != null) ? `${f2(a)} × ${f2(b)} m` : null;
    const leg = [
      [c.formato, c.material, c.tipo, (num(c.linhas) > 1 && c.formato !== 'Aduela dupla') ? c.linhas + ' linhas' : ''].filter(Boolean).join(' · '),
      F && F.e ? `Espessura da parede: ${f2(F.e)} m` : (F ? 'Espessura não informada (parede ilustrativa)' : ''),
      par(m.larguraEntrada, m.alturaEntrada) ? `Entrada: ${par(m.larguraEntrada, m.alturaEntrada)}` : '',
      par(m.larguraSaida, m.alturaSaida) ? `Saída: ${par(m.larguraSaida, m.alturaSaida)}` : '',
    ].filter(Boolean).map((t, i) => `<text x="14" y="${272 + i * 14}" font-size="11" fill="${INK}">${esc(t)}</text>`).join('');
    const L = fluxo === 'direita', ax1 = L ? 60 : 340, ax2 = L ? 340 : 60, hd = L ? -8 : 8;
    const fl = `<text x="${VBW / 2}" y="334" text-anchor="middle" font-size="10" fill="#56635A">SENTIDO DO FLUXO</text>`
      + `<line x1="${ax1}" y1="348" x2="${ax2}" y2="348" stroke="${INK}" stroke-width="2.5"/><polygon points="${ax2},348 ${ax2 + hd},343 ${ax2 + hd},353" fill="${INK}"/>`
      + `<text x="${ax1 + (L ? -6 : 6)}" y="368" text-anchor="${L ? 'start' : 'end'}" font-size="11" font-weight="700" fill="${INK}" transform="translate(${L ? 0 : 0},0)">MONTANTE</text>`
      + `<text x="${ax2 + (L ? 6 : -6)}" y="368" text-anchor="${L ? 'end' : 'start'}" font-size="11" font-weight="700" fill="${INK}">JUSANTE</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VBW} ${VBH}" width="${VBW}" height="${VBH}" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Croqui da seção do bueiro">
<defs><pattern id="hach" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#E9EEE9"/><line x1="0" y1="0" x2="0" y2="6" stroke="#9AA79D" stroke-width="1"/></pattern></defs>
<rect width="${VBW}" height="${VBH}" fill="#fff"/>
<text x="10" y="16" font-size="12" font-weight="700" fill="${INK}">${esc(l.codigo || 'Sem código')}${l.estrada ? ' · ' + esc(l.estrada) : ''}</text>
${corpo}${riscos}${notas}${leg}${fl}</svg>`;
  }

  /* ---------- tela ---------- */
  function ensureSecao(l) {
    if (!l.secao) l.secao = { tipo: l.caracteristicas.formato || '', fluxo: 'direita', tracos: [], notas: [], hist: [], svg: '', salvoEm: null };
    return l.secao;
  }
  function sincronizar(l) { if (l.secao) { l.secao.tipo = l.caracteristicas.formato || ''; l.secao.svg = gerarSVG(l); } }
  function redesenhar() {
    const l = BU.App.cur(), box = document.getElementById('croqui'); if (!l || !box) return;
    sincronizar(l); box.innerHTML = gerarSVG(l);
  }

  function etapaHTML(l) {
    sincronizar(l);
    const App = BU.App, tipo = l.caracteristicas.formato, s = l.secao || {};
    const campos = (CAMPOS_TIPO[tipo] || []).map(c => App.campoHTML({ p: 'caracteristicas.' + c, label: rotulo(tipo, c), t: 'num', unit: 'm', min: 0 })).join('');
    const seg = (v, t) => `<button type="button" data-sc="modo" data-v="${v}" aria-pressed="${T.modo === v}">${t}</button>`;
    return `<div class="card"><div class="grid">
        ${App.campoHTML({ p: 'caracteristicas.formato', label: 'Tipo de seção', t: 'select', opts: FORMATOS })}
        ${campos}</div>
        <p class="muted small">Dimensões em metros. O desenho se atualiza sozinho e usa os mesmos valores da etapa Características.</p></div>
      <div class="card croqui-card">
        <div class="seg-tools" role="group" aria-label="Ferramenta">${seg('ver', 'Ver')}${seg('riscar', '✏️ Riscar')}${seg('anotar', '📝 Anotar')}</div>
        <div id="croqui-wrap" class="modo-${T.modo}"><div id="croqui">${gerarSVG(l)}</div></div>
        <p class="muted small" id="sc-dica">${T.modo === 'riscar' ? 'Arraste o dedo sobre o desenho para riscar.' : T.modo === 'anotar' ? 'Toque no desenho onde quer colocar o texto.' : 'Escolha Riscar ou Anotar para complementar o croqui.'}</p>
        <div class="row"><button type="button" class="btn sm" data-sc="desfazer">↶ Desfazer</button><button type="button" class="btn sm" data-sc="limpar">Limpar desenho</button>
          <button type="button" class="btn sm" data-sc="fluxo">Fluxo: ${s.fluxo === 'esquerda' ? '← direita para esquerda' : 'esquerda para direita →'}</button></div>
        <div class="row" style="margin-top:10px"><button type="button" class="btn primary" data-sc="salvar">Salvar seção</button>
          <button type="button" class="btn" data-sc="png">Gerar imagem (PNG)</button><button type="button" class="btn" data-sc="svg">Baixar SVG</button></div>
        ${s.salvoEm ? `<p class="muted small">Seção salva em ${esc(U.dataHoraBR(s.salvoEm))}.</p>` : ''}
      </div>`;
  }

  function miniatura(l) { return (l.secao && l.secao.salvoEm) || (l.secao && forma(l)) ? `<div class="croqui-mini">${gerarSVG(l)}</div>` : '<div class="croqui-ph">Seção ainda não desenhada</div>'; }

  /* ---------- exportar imagem ---------- */
  function nomeBase(l) { return 'SECAO-' + U.nomeArquivo(l.codigo); }
  async function exportarPNG(l) {
    const svg = gerarSVG(l), img = new Image();
    try {
      await new Promise((ok, er) => { img.onload = ok; img.onerror = er; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const cv = document.createElement('canvas'); cv.width = VBW * 3; cv.height = VBH * 3;
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => { if (b) U.baixar(b, nomeBase(l) + '.png'); else UI.toast('Não foi possível gerar a imagem', 'erro'); }, 'image/png');
    } catch (e) { UI.toast('Não foi possível gerar a imagem. Use "Baixar SVG".', 'erro'); }
  }

  /* ---------- eventos ---------- */
  function mudou() { const l = BU.App.cur(); sincronizar(l); BU.App.marcarSujo(); redesenhar(); }
  function posicao(e, svg) { const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; return [r1((e.clientX - r.left) / r.width * vb.width), r1((e.clientY - r.top) / r.height * vb.height)]; }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-sc]'), App = BU.App, l = App.cur();
    if (b && l) {
      const a = b.dataset.sc;
      if (a === 'modo') { T.modo = b.dataset.v; App.renderEtapa(); }
      else if (a === 'desfazer') {
        const s = ensureSecao(l), k = s.hist.pop();
        if (k === 't') s.tracos.pop(); else if (k === 'n') s.notas.pop(); else { UI.toast('Nada para desfazer'); return; }
        mudou();
      } else if (a === 'limpar') {
        const s = l.secao;
        if (!s || (!s.tracos.length && !s.notas.length)) { UI.toast('Não há riscos ou anotações'); return; }
        if (await UI.confirmar('Apagar todos os riscos e anotações? As cotas e o formato continuam.', { titulo: 'Limpar desenho', ok: 'Limpar', perigo: true })) { s.tracos = []; s.notas = []; s.hist = []; mudou(); }
      } else if (a === 'fluxo') { const s = ensureSecao(l); s.fluxo = s.fluxo === 'esquerda' ? 'direita' : 'esquerda'; mudou(); App.renderEtapa(); }
      else if (a === 'salvar') {
        const s = ensureSecao(l);
        if (!forma(l) && !s.tracos.length && !s.notas.length) { UI.toast('Informe as dimensões ou faça um risco antes de salvar', 'aviso'); return; }
        s.salvoEm = U.agoraISO(); sincronizar(l); App.marcarSujo();
        if (await App.salvarAtual({ forcar: true })) { UI.toast('Seção salva'); App.renderEtapa(); }
      }
      else if (a === 'png') exportarPNG(l);
      else if (a === 'svg') U.baixar(new Blob([gerarSVG(l)], { type: 'image/svg+xml' }), nomeBase(l) + '.svg');
      return;
    }
    // modo anotar: toque no desenho
    const sv = e.target.closest('#croqui svg');
    if (sv && l && T.modo === 'anotar') {
      const [x, y] = posicao(e, sv), t = await UI.pedir('Anotação', { ph: 'ex.: fissura na laje' });
      if (t && App.cur() === l) { const s = ensureSecao(l); s.notas.push({ x, y, t: t.slice(0, 40) }); s.hist.push('n'); mudou(); }
    }
  });

  /* modo riscar: desenho à mão livre com o dedo */
  let tracando = null;
  document.addEventListener('pointerdown', e => {
    const sv = e.target.closest && e.target.closest('#croqui svg');
    if (!sv || T.modo !== 'riscar' || !BU.App.cur()) return;
    e.preventDefault();
    tracando = { sv, pts: [posicao(e, sv)], id: e.pointerId };
    sv.insertAdjacentHTML('beforeend', `<polyline id="sc-live" fill="none" stroke="${NOTA}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points=""/>`);
  });
  document.addEventListener('pointermove', e => {
    if (!tracando || e.pointerId !== tracando.id) return;
    const p = posicao(e, tracando.sv), u = tracando.pts[tracando.pts.length - 1];
    if (Math.hypot(p[0] - u[0], p[1] - u[1]) < 1.5) return;
    tracando.pts.push(p);
    const live = document.getElementById('sc-live'); if (live) live.setAttribute('points', tracando.pts.map(q => q.join(',')).join(' '));
  });
  function fimTraco(e) {
    if (!tracando || (e.pointerId !== undefined && e.pointerId !== tracando.id)) return;
    const pts = tracando.pts; tracando = null;
    const live = document.getElementById('sc-live'); if (live) live.remove();
    const l = BU.App.cur(); if (!l || pts.length < 2) return;
    const s = ensureSecao(l); s.tracos.push(pts); s.hist.push('t'); mudou();
  }
  document.addEventListener('pointerup', fimTraco);
  document.addEventListener('pointercancel', fimTraco);

  BU.Secao = { etapaHTML, redesenhar, miniatura, gerarSVG, exportarPNG, FORMATOS };
})();
