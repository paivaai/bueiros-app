/* dadosponto.js — janela "Dados do ponto" do painel: tudo o que veio do KMZ (como no Google Earth), o que está no cadastro e o % completo.
   Usada no mapa do projeto e no mapa do planejamento. Expõe BU.DadosPonto. */
(function () {
  'use strict';
  const BU = window.BU = window.BU || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = v => String(v).replace('.', ',');

  /* Mesmos itens do app de campo (22). Pontos da boca: conferidos pela lista de pontos quando a regra do app não está carregada. */
  function completude(d, b) {
    d = d || {}; b = b || {};
    const c = d.caracteristicas || {}, m = d.medicoes || {}, bo = d.bocas || { montante: {}, jusante: {} }, fotos = d.fotos || [];
    const mont = bo.montante || {}, jus = bo.jusante || {}, pts = d.pontos || [];
    const temPts = lado => !!pts.some(p => String(p.ref || '').indexOf(lado + ':') === 0);
    const utm = (BU.GPS && BU.GPS.utmDe) ? !!BU.GPS.utmDe(d) : (d.leste != null || b.leste != null);
    const tub = c.tipo === 'Tubular', foto = k => fotos.some(f => f.ctx === 'foto:' + k);
    let croqui = false; try { croqui = !!(BU.Prancha && BU.Prancha.croquiPronto(d)); } catch (e) { croqui = false; }
    const REQ = [
      ['Código', !!String(d.codigo || b.codigo || '').trim()], ['Classificação (grota/greide)', !!d.classificacao],
      ['km', !!(d.km || b.km)], ['Pista (sentido geográfico)', !!d.pistaGe], ['Lado da rodovia', !!d.lado], ['Coordenadas (RTK)', utm && d.coordOrigem !== 'cadastro'],
      ['Nº de linhas', !!c.celulas], ['Forma', !!c.tipo], ['Material', !!c.material],
      ['Seção do corpo', tub ? c.diametro != null : (c.largura != null && c.altura != null)], ['Comprimento', m.comprimentoBueiro != null],
      ['Tipo da boca de montante', !!mont.tipo], ['Pontos da boca de montante', !!mont.tipo && temPts('montante')], ['Estado da boca de montante', !!mont.estado],
      ['Tipo da boca de jusante', !!jus.tipo], ['Pontos da boca de jusante', !!jus.tipo && temPts('jusante')], ['Estado da boca de jusante', !!jus.estado],
      ['Croqui', croqui], ['Estado de conservação', !!c.conservacao],
      ['Foto da boca de montante', foto('montante')], ['Foto da boca de jusante', foto('jusante')], ['Foto da seção', fotos.some(f => f.ctx === 'secao')],
    ];
    const feitos = REQ.filter(x => x[1]).length;
    return { feitos, total: REQ.length, pct: Math.round(feitos / REQ.length * 100), faltam: REQ.filter(x => !x[1]).map(x => x[0]) };
  }

  function html(d, b) {
    d = d || {}; b = b || {};
    const c = d.caracteristicas || {}, cp = completude(d, b), orig = (d.meta && d.meta.atributos) || {}, rot = k => (BU.KMZ && BU.KMZ.rotulo ? BU.KMZ.rotulo(k) : k);
    const tab = it => `<div class="dp-kvs">${it.map(([k, v]) => `<div class="dp-kv"><span>${esc(k)}</span><b>${v !== '' && v != null ? esc(v) : '—'}</b></div>`).join('')}</div>`;
    const dim = c.diametro != null ? `Ø ${N(c.diametro)} m` : (c.largura != null && c.altura != null ? `${N(c.largura)} × ${N(c.altura)} m` : '');
    const lat = b.latitude != null ? b.latitude : (d.latitude != null ? d.latitude : null), lon = b.longitude != null ? b.longitude : d.longitude;
    const noApp = [
      ['Código', d.codigo || b.codigo], ['Rodovia', d.estrada], ['km', d.km || b.km], ['Município / UF', [d.municipio, d.estado].filter(Boolean).join(' / ')],
      ['Ambiente', d.ambiente], ['Pista (sentido geográfico)', d.pistaGe], ['Sentido do km', d.sentido], ['Lado da rodovia', d.lado],
      ['Latitude / Longitude', lat != null ? `${lat}, ${lon}` : ''], ['UTM (SIRGAS 2000)', b.leste != null ? `E ${N(b.leste)} · N ${N(b.norte)} · ${b.zona || ''}${d.hemisferio || 'S'}` : ''],
      ['Tipo de bueiro', [d.meta && d.meta.sigla, d.meta && d.meta.descricaoTipo].filter(Boolean).join(' — ')], ['Forma / material', [c.tipo, c.material].filter(Boolean).join(' · ')], ['Dimensão', dim],
      ['Estado de conservação', c.conservacao], ['Classificação', d.classificacao], ['Observações', d.observacoes],
    ];
    const ch = Object.keys(orig);
    return `<div class="dados-ponto"><p><b>${esc(d.codigo || b.codigo || 'Sem código')}</b> <span class="chip">${cp.pct}% completo</span></p>
      ${ch.length ? `<h4>Cadastro original (Google Earth / KMZ)</h4>${tab(ch.map(k => [rot(k), orig[k]]))}` : '<p class="muted small">Este ponto não veio de um arquivo KMZ.</p>'}
      <h4>Como está no sistema</h4>${tab(noApp)}
      ${cp.faltam.length ? `<h4>Ainda falta preencher (${cp.faltam.length})</h4><p class="small">${cp.faltam.map(esc).join(' · ')}</p>` : '<p class="small">Todos os itens preenchidos.</p>'}</div>`;
  }

  /* Abre a janela. "pin" é um ponto do planejamento ainda não salvo (traz os dados do KMZ); senão busca o bueiro no servidor. */
  async function abrir(D, id, pin) {
    let d = pin && pin.dados, b = pin ? { codigo: pin.codigo, km: pin.km, latitude: pin.lat, longitude: pin.lon } : {};
    if (!d && D && id) { try { const r = await D.bueiro(id); if (r) { b = r; d = r.dados || {}; } } catch (e) { console.warn(e); } }
    const velho = document.getElementById('dp-janela'); if (velho) velho.remove();
    const j = document.createElement('div'); j.id = 'dp-janela'; j.className = 'dp-fundo';
    j.innerHTML = `<div class="dp-caixa" role="dialog" aria-modal="true" aria-label="Dados do ponto"><h2>Dados do ponto</h2>${html(d || {}, b)}<div style="margin-top:14px;text-align:right"><button type="button" class="btn primary" data-dp-fechar>Fechar</button></div></div>`;
    const fecha = () => { j.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = e => { if (e.key === 'Escape') fecha(); };
    j.addEventListener('click', e => { if (e.target === j || e.target.closest('[data-dp-fechar]')) fecha(); });
    document.addEventListener('keydown', tecla); document.body.appendChild(j);
  }
  BU.DadosPonto = { abrir, html, completude, D: null, pinDe: null };
  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-dp]'); if (!t) return; ev.preventDefault();
    const dp = BU.DadosPonto, pin = dp.pinDe ? dp.pinDe(t.dataset.dp) : null;
    abrir(dp.D, t.dataset.dp, pin && pin.dados ? pin : null);
  });
})();
