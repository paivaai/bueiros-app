/* antt.js — "Ficha padrão ANTT": relatório de drenagem (obra de arte corrente) em uma folha A4,
   no modelo da concessionária (logos ANTT e Arteris). Os campos já saem preenchidos pelo levantamento
   e podem ser ajustados na própria folha antes de imprimir / salvar em PDF. Expõe BU.Antt. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, esc = U.esc;

  const logoDataURL = async url => {
    try {
      const r = await fetch(url), b = await r.blob();
      return await new Promise((ok, er) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => er(fr.error); fr.readAsDataURL(b); });
    } catch (e) { return ''; }
  };
  const d2 = v => (v != null && v !== '' && isFinite(+v)) ? (+v).toFixed(2) : '';
  const kmPara = m => { const k = Math.floor(m / 1000), r = Math.round(m - k * 1000); return String(k).padStart(3, '0') + '+' + String(r).padStart(3, '0'); };
  const kmMetros = t => { const m = String(t || '').match(/(\d{1,3})\+(\d{1,3})/); return m ? +m[1] * 1000 + +m[2] : null; };

  /* Coordenadas (graus decimais) da boca; se só houver UTM, converte. */
  function latLon(l, b) {
    let la = b.lat, lo = b.lon;
    if ((la == null || lo == null) && b.leste != null && b.norte != null) {
      try { const g = BU.GPS.deUTM(+b.leste, +b.norte, +l.zona || 23, l.hemisferio || 'S'); la = g.lat; lo = g.lon; } catch (e) { /* segue */ }
    }
    return { la: la != null && isFinite(la) ? +la : null, lo: lo != null && isFinite(lo) ? +lo : null };
  }
  const fmtG = v => v == null ? '' : (+v).toFixed(6);

  function estrutura(b) {
    const t = b.tipo || '';
    if (/ala/i.test(t)) return 'BA';
    if (/Sem boca|ponta livre/i.test(t)) return 'Ponta livre';
    return t ? 'Muro de testa' : '';
  }
  function dims(c, m, jus) {
    if (c.tipo === 'Tubular') { const d = jus && c.mesmaSecaoJusante === false ? m.larguraSaida : c.diametro; return d2(d); }
    const w = jus && c.mesmaSecaoJusante === false ? m.larguraSaida : c.largura, h = jus && c.mesmaSecaoJusante === false ? m.alturaSaida : c.altura;
    return w != null && h != null ? d2(w) + 'x' + d2(h) : '';
  }

  /* Quadro de verificações por lugar (g = 'mont' | 'jus'). */
  function verificacoes(l, g) {
    const pat = k => (l.patologias || []).some(p => p.id === g + ':' + k), corpo = k => (l.patologias || []).some(p => p.id === 'corpo:' + k);
    const d = l.diagnostico || {}, nec = k => (d.necessita || []).includes(k) && ((d.onde || {})[k] || []).includes(g);
    const bc = l.bocas[g === 'mont' ? 'montante' : 'jusante'], tub = l.caracteristicas.tipo === 'Tubular';
    const limpeza = nec('limpeza') || nec('desobstrucao') || nec('rocada') || pat('vegetacao'), asso = pat('assoreamento'), afog = (+bc.obstrucaoPct || 0) >= 80;
    const corpoRuim = corpo('trincas') || corpo('deformacao') || corpo('armadura') || corpo('recalque');
    return {
      ok: !(limpeza || asso || afog), limpeza, asso, afog,
      testa: pat('bocas_danificadas') || pat('armadura') || nec('bocas_alas'),
      tubo: tub && corpoRuim, caixa: !tub && corpoRuim, erosao: pat('erosao'), fissura: corpo('trincas'), tampa: nec('tampa'),
    };
  }

  async function fotosPor(l) {
    const out = {};
    for (const f of l.fotos) {
      const r = await BU.DB.obterFoto(f.id); if (!r || !r.blob) continue;
      const du = await new Promise((ok, er) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => er(fr.error); fr.readAsDataURL(r.blob); });
      (out[f.ctx || ''] = out[f.ctx || ''] || []).push(du);
    }
    return out;
  }

  async function gerarHTML(l) {
    const c = l.caracteristicas, m = l.medicoes, mo = l.bocas.montante, ju = l.bocas.jusante;
    const [logoA, logoB, fotos] = await Promise.all([logoDataURL('assets/logo-antt.png'), logoDataURL('assets/logo-arteris.png'), fotosPor(l)]);
    const cm = latLon(l, mo), cj = latLon(l, ju), ext = m.comprimentoBueiro;
    const kmI = l.km ? String(l.km) : '', mI = kmMetros(kmI), kmF = mI != null && ext != null ? kmPara(mI + (+ext)) : kmI;
    const sigla = (l.meta && l.meta.sigla) || BU.Cat.siglaDe(c) || '';
    /* lado de cada boca pela posição relativa (montante x jusante) */
    let ladoM = '', ladoJ = '';
    if (cm.la != null && cj.la != null) {
      const dN = cm.la - cj.la, dE = cm.lo - cj.lo;
      if (Math.abs(dN) >= Math.abs(dE)) { ladoM = dN > 0 ? 'Norte' : 'Sul'; ladoJ = dN > 0 ? 'Sul' : 'Norte'; }
      else { ladoM = dE > 0 ? 'Leste' : 'Oeste'; ladoJ = dE > 0 ? 'Oeste' : 'Leste'; }
    }
    const vm = verificacoes(l, 'mont'), vj = verificacoes(l, 'jus');
    const x = v => v ? 'X' : '';
    const ed = t => `<span class="ed" contenteditable="true">${esc(t == null ? '' : t)}</span>`;
    const val = t => `<td class="v" colspan="3">${ed(t)}</td>`;
    const lab = t => `<th colspan="3">${esc(t)}</th>`;
    const par = (a, va, b, vb) => `<tr>${lab(a)}${val(va)}${lab(b)}${val(vb)}</tr>`;
    const chk = v => `<td class="v c">${ed(x(v))}</td>`;
    const foto = (arr, i) => arr && arr[i] ? `<img src="${arr[i]}" alt="">` : '';
    const patFoto = g => { const k = Object.keys(fotos).find(c => c.startsWith('pat:' + g + ':') || c === 'disp:' + g); return k ? fotos[k][0] : ''; };
    const detM = (fotos['foto:montante'] || [])[1] || patFoto('mont'), detJ = (fotos['foto:jusante'] || [])[1] || patFoto('jus');
    const hasM = (fotos['foto:montante'] || [])[0], hasJ = (fotos['foto:jusante'] || [])[0];
    const linhasCons = [['OK', 'ok'], ['Limpeza', 'limpeza'], ['Assoreado', 'asso'], ['Afogado', 'afog'], ['', null], ['', null]];
    const linhasEst = [['Testa ou ala danificada', 'testa'], ['Tubulação danificada', 'tubo'], ['Caixa danificada', 'caixa'], ['Erosão', 'erosao'], ['Fissuras/trincas', 'fissura'], ['Tampa danificada/inexist.', 'tampa']];
    const quadro = linhasCons.map(([r, k], i) => `<tr><th class="lin">${esc(r)}</th>${chk(k && vm[k])}${chk(k && vj[k])}<th class="lin">${esc(linhasEst[i][0])}</th>${chk(vm[linhasEst[i][1]])}${chk(vj[linhasEst[i][1]])}</tr>`).join('');
    const dataIns = U.dataBR(l.data);
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ficha ANTT ${esc(l.codigo || 'bueiro')}</title><style>
*{box-sizing:border-box}body{font:11px Arial,Helvetica,sans-serif;color:#000;margin:0;padding:10px;background:#fff}
.folha{max-width:190mm;margin:auto}table{width:100%;border-collapse:collapse;table-layout:fixed}
td,th{border:1px solid #000;padding:2px 4px;text-align:center;vertical-align:middle;font-size:11px}th{background:#D9D9D9;font-weight:700}
.v{background:#FFFF00}.c{font-weight:700}.topo td,.topo th{border:0}.topo td{padding:0}.titulo{font-size:15px;font-weight:700;text-align:center}
.logo-a{height:17mm;display:block}.logo-b{height:14mm;display:block;margin-left:auto}
.sep{border:0!important;background:#fff!important;height:7px;padding:0!important}
.vert{writing-mode:vertical-rl;transform:rotate(180deg);background:#fff;font-weight:700;font-size:10px;line-height:1.25;text-align:center}
.lin{background:#fff;height:7mm;font-size:10.5px}.cab th{background:#fff}.cab td,.cab th{height:7mm}
.foto{height:62mm;padding:2px;background:#fff}.foto img{width:100%;height:100%;object-fit:cover;display:block}
.ed{display:block;min-height:1em;outline:none}.ed:focus{background:rgba(255,255,255,.7)}
.btn{position:fixed;top:8px;right:8px;background:#C2410C;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-size:15px;font-weight:700;z-index:9}
.dica{max-width:190mm;margin:0 auto 8px;color:#56635A;font-size:12px}
@media print{.btn,.dica{display:none}body{padding:0}@page{size:A4 portrait;margin:8mm}.folha{max-width:none}}
</style></head><body>
<button class="btn" onclick="window.print()">Imprimir / salvar PDF</button>
<p class="dica">Os campos em amarelo já vêm do levantamento. Toque em qualquer um para ajustar antes de imprimir.</p>
<div class="folha">
<table class="topo"><colgroup><col style="width:25%"><col style="width:50%"><col style="width:25%"></colgroup><tr><td>${logoA ? `<img class="logo-a" src="${logoA}" alt="ANTT">` : ''}</td><td class="titulo">RELATÓRIO DE DRENAGEM - OBRA DE ARTE CORRENTE</td><td>${logoB ? `<img class="logo-b" src="${logoB}" alt="Arteris Fluminense">` : ''}</td></tr></table>
<table>
<colgroup>${'<col style="width:8.33%">'.repeat(12)}</colgroup>
<tr><th colspan="9">MONITORAÇÃO DE DRENAGEM</th><th>Data Insp.</th><td colspan="2" class="v">${ed(dataIns)}</td></tr>
<tr><th colspan="12">OBRAS DE ARTE CORRENTE ${esc((l.estrada || 'BR-101').toUpperCase().replace(/^BR\s*-?\s*(\d+)/, 'BR-$1'))} BU</th></tr>
<tr>${lab('IDENTIFICAÇÃO')}${val(l.codigo)}${lab('KM INICIAL')}${val(kmI)}</tr>
<tr>${lab('EXTENSÃO (m)')}${val(d2(ext))}${lab('KM FINAL')}${val(kmF)}</tr>
<tr><td class="sep" colspan="12"></td></tr>
${par('Coord. Montante N:', fmtG(cm.la), 'Coord. Jusante N:', fmtG(cj.la))}
${par('Coord. Montante E:', fmtG(cm.lo), 'Coord. Jusante E:', fmtG(cj.lo))}
${par('Tipo de Bueiro:', sigla, 'Forma:', (c.tipo || '').toUpperCase())}
<tr><th colspan="6" style="background:#fff">MONTANTE</th><th colspan="6" style="background:#fff">JUSANTE</th></tr>
${par('Dimensões (m):', dims(c, m, false), 'Dimensões (m):', dims(c, m, true))}
${par('Lado:', ladoM, 'Lado:', ladoJ)}
${par('Estrutura de entrada:', estrutura(mo), 'Estrutura de saída:', estrutura(ju))}
${par('Material:', mo.material || c.material, 'Material:', ju.material || c.material)}
${par('Estado de Conservação:', mo.estado, 'Estado de Conservação:', ju.estado)}
<tr><td class="sep" colspan="12"></td></tr>
</table>
<table><colgroup><col style="width:8%"><col style="width:26%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:26%"><col style="width:8%"><col style="width:8%"></colgroup>
<tr class="cab"><th rowspan="7" class="vert">VERIFICAÇÃO DE<br>CONSERVAÇÃO<br>(FUNCIONALIDADE)</th><td style="border-left:0"></td><th>MONT</th><th>JUS</th><th rowspan="7" class="vert">VERIFICAÇÃO<br>ESTRUTURAL<br>(ANOMALIAS)</th><td></td><th>MONT</th><th>JUS</th></tr>
${quadro}
</table>
<table><colgroup><col style="width:50%"><col style="width:50%"></colgroup>
<tr><th style="background:#fff">FOTO PANORÂMICA — MONTANTE</th><th style="background:#fff">FOTO PANORÂMICA — JUSANTE</th></tr>
<tr><td class="foto">${foto([hasM], 0)}</td><td class="foto">${foto([hasJ], 0)}</td></tr>
<tr><th style="background:#fff">FOTO DETALHE — MONTANTE</th><th style="background:#fff">FOTO DETALHE — JUSANTE</th></tr>
<tr><td class="foto">${foto([detM], 0)}</td><td class="foto">${foto([detJ], 0)}</td></tr>
</table>
</div></body></html>`;
  }
  BU.Antt = { gerarHTML };
})();
