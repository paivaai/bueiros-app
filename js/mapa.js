/* mapa.js — mapa de campo: bueiros por situação, eixo da rodovia, posição do GPS e lista dos mais próximos.
   Funciona sem internet: os pontos e o eixo são desenhados pelo app; o fundo (satélite/mapa) mostra o que já foi visto antes
   (o service worker guarda os blocos visualizados). Sem fundo, o mapa fica esquemático. Expõe BU.Mapa. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, DB = BU.DB, esc = U.esc, $ = s => document.querySelector(s);

  const COR = { a_vistoriar: '#1D5FD0', rascunho: '#E0A100', concluido: '#1B8A3E', devolvido: '#D32F2F', aprovado: '#0B5D2A', nao_localizado: '#7B4FC4' };
  const ROT = { a_vistoriar: 'A vistoriar', rascunho: 'Rascunho', concluido: 'Concluído', devolvido: 'Devolvido', aprovado: 'Aprovado', nao_localizado: 'Não localizado' };
  const PENDENTES = ['a_vistoriar', 'rascunho', 'devolvido'];
  const ESRI = 'Imagens © Esri, Maxar, Earthstar Geographics';
  const BASES = {
    sat: { nome: 'Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: ESRI },
    osm: { nome: 'Mapa', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap' },
    nada: { nome: 'Sem fundo', url: null },
  };

  const M = { mapa: null, base: 'sat', camada: null, pins: new Map(), lista: [], eixo: null, pos: null, ponto: null, circ: null, watch: null, seguir: false, ult: 0, vazio: false };

  function parar() {
    if (M.watch != null) { try { navigator.geolocation.clearWatch(M.watch); } catch (e) { /* ignora */ } M.watch = null; }
    if (M.mapa) { try { M.mapa.remove(); } catch (e) { /* ignora */ } M.mapa = null; }
    M.pins.clear(); M.ponto = M.circ = M.camada = null;
  }

  const icone = (st, destaque) => L.divIcon({ className: 'mk-wrap', html: `<span class="mk${destaque ? ' mk-grande' : ''}" style="background:${COR[st] || '#666'}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] });

  function popup(l) {
    const nav = `https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}&travelmode=driving`;
    const t = (BU.Sync && BU.Sync.selo(l.id)) || '';
    return `<div class="mk-pop"><b>${esc(l.codigo || 'Sem código')}</b><div class="muted small">${esc(ROT[l.status] || l.status)}${l.km ? ' · km ' + esc(l.km) : ''}${BU.App && BU.App.completude ? ' · ' + BU.App.completude(l).pct + '% completo' : ''}</div>${t ? `<div>${t}</div>` : ''}
      <div class="row"><a class="btn sm primary" href="#/lev/${esc(l.id)}/1" data-go="#/lev/${esc(l.id)}/1">${l.status === 'a_vistoriar' ? 'Vistoriar' : 'Abrir'}</a><a class="btn sm" target="_blank" rel="noopener" href="${nav}">Navegar</a><button type="button" class="btn sm" data-a="dados" data-id="${esc(l.id)}">Dados</button></div></div>`;
  }

  function trocarBase(k) {
    M.base = k; DB.cfgSalvar('mapaBase', k).catch(() => {});
    if (M.camada) { M.mapa.removeLayer(M.camada); M.camada = null; }
    const b = BASES[k];
    if (b.url) M.camada = L.tileLayer(b.url, { maxZoom: 22, maxNativeZoom: 19, attribution: b.attr, crossOrigin: 'anonymous' }).addTo(M.mapa);
    document.querySelectorAll('[data-base]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.base === k)));
    $('#mapa-campo').classList.toggle('sem-fundo', !b.url);
    const av = $('#mapa-aviso'); if (av) av.hidden = !(b.url && !navigator.onLine);
  }

  function desenhar() {
    for (const p of M.pins.values()) M.mapa.removeLayer(p); M.pins.clear();
    const pts = [];
    for (const l of M.lista) {
      if (l.latitude == null || l.longitude == null || !isFinite(l.latitude) || !isFinite(l.longitude)) continue;
      const mk = L.marker([l.latitude, l.longitude], { icon: icone(l.status), title: l.codigo || '' }).addTo(M.mapa);
      mk.bindPopup(() => popup(l)); M.pins.set(l.id, mk); pts.push([l.latitude, l.longitude]);
    }
    return pts;
  }

  function atualizarProximos() {
    const el = $('#mapa-prox'); if (!el) return;
    if (!M.pos) { el.innerHTML = '<p class="muted small">Toque em “Minha posição” para ver os bueiros mais próximos.</p>'; return; }
    const { latitude: la, longitude: lo } = M.pos;
    const c = M.lista.filter(l => PENDENTES.includes(l.status) && l.latitude != null && l.longitude != null)
      .map(l => ({ l, d: BU.Eixo.dist(la, lo, l.latitude, l.longitude), r: BU.Eixo.rumo(la, lo, l.latitude, l.longitude) })).sort((a, b) => a.d - b.d).slice(0, 8);
    let h = '';
    if (M.eixo) { const k = BU.Eixo.kmDe(M.eixo, la, lo); if (k) h += `<div class="card mapa-km"><b>Você está no km ${BU.Codigo.metrosParaKm(k.metros)}</b><span class="muted small"> · a ${BU.Eixo.fmtDist(k.off)} do eixo</span></div>`; }
    h += c.length ? '<h3>Mais próximos</h3>' + c.map(({ l, d, r }) => `<div class="prox" data-id="${esc(l.id)}"><div><b>${esc(l.codigo || 'Sem código')}</b><div class="muted small">${esc(ROT[l.status])}</div></div>
      <div class="prox-d"><b>${BU.Eixo.fmtDist(d)}</b><span>${BU.Eixo.rumoTxt(r)}</span></div><button type="button" class="btn sm" data-mapa="foco" data-id="${esc(l.id)}">Mapa</button><a class="btn sm primary" href="#/lev/${esc(l.id)}/1" data-go="#/lev/${esc(l.id)}/1">${l.status === 'a_vistoriar' ? 'Vistoriar' : 'Abrir'}</a></div>`).join('')
      : '<p class="muted small">Nenhum bueiro pendente com coordenadas.</p>';
    el.innerHTML = h;
  }

  function aoPosicao(p) {
    const c = p.coords; M.pos = { latitude: c.latitude, longitude: c.longitude, precisao: c.accuracy };
    if (!M.mapa) return;
    const ll = [c.latitude, c.longitude];
    if (!M.ponto) { M.ponto = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#0A84FF', fillOpacity: 1 }).addTo(M.mapa); M.circ = L.circle(ll, { radius: c.accuracy || 10, color: '#0A84FF', weight: 1, fillOpacity: .12 }).addTo(M.mapa); }
    else { M.ponto.setLatLng(ll); M.circ.setLatLng(ll).setRadius(c.accuracy || 10); }
    if (M.seguir) { M.mapa.setView(ll, Math.max(M.mapa.getZoom(), 18)); M.seguir = false; }
    const t = Date.now(); if (t - M.ult > 2500) { M.ult = t; atualizarProximos(); }
    const pr = $('#mapa-prec'); if (pr) pr.textContent = c.accuracy ? `±${Math.round(c.accuracy)} m` : '';
  }
  function ligarGps(centralizar) {
    if (!navigator.geolocation) { UI.toast('Este aparelho não tem GPS disponível no navegador', 'aviso'); return; }
    M.seguir = !!centralizar;
    if (M.watch != null) { if (M.pos && centralizar) { M.mapa.setView([M.pos.latitude, M.pos.longitude], Math.max(M.mapa.getZoom(), 18)); M.seguir = false; } return; }
    M.watch = navigator.geolocation.watchPosition(aoPosicao, e => { UI.toast(e && e.code === 1 ? 'Permissão de localização negada. Libere no cadeado do endereço.' : 'Não foi possível obter a posição', 'aviso'); M.watch = null; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }

  function focar(id) {
    const l = M.lista.find(x => x.id === id), mk = M.pins.get(id); if (!l || !mk) return;
    M.mapa.setView([l.latitude, l.longitude], Math.max(M.mapa.getZoom(), 18)); mk.openPopup();
    $('#mapa-campo').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  async function view(lista) {
    parar();
    M.lista = lista || [];
    try { M.eixo = BU.Sync ? await BU.Sync.eixoAtivo() : null; } catch (e) { M.eixo = null; }
    let base = 'sat'; try { base = (await DB.cfgObter('mapaBase')) || 'sat'; } catch (e) { /* padrão */ }
    if (!BASES[base]) base = 'sat';
    const n = M.lista.filter(l => l.latitude != null && l.longitude != null).length;
    $('#view').innerHTML = `<section class="page mapa-page">
      <div class="page-head"><h1>Mapa</h1><span class="muted small">${n} de ${M.lista.length} com coordenadas</span></div>
      <div class="mapa-barra" role="group" aria-label="Fundo do mapa">${Object.entries(BASES).map(([k, b]) => `<button type="button" class="fchip" data-base="${k}" aria-pressed="${k === base}">${b.nome}</button>`).join('')}
        <button type="button" class="fchip" data-mapa="gps">📍 Minha posição <span id="mapa-prec"></span></button></div>
      <div id="mapa-campo" class="mapa-campo"></div>
      <div id="mapa-aviso" class="banner" hidden>Sem internet: o fundo só aparece nas áreas já visualizadas antes. Os pontos e o eixo continuam aparecendo.</div>
      <div class="mapa-leg">${Object.keys(COR).map(k => `<span><i style="background:${COR[k]}"></i>${ROT[k]}</span>`).join('')}</div>
      <div id="mapa-prox"></div>
      <button type="button" class="btn" data-go="#/">‹ Início</button></section>`;
    if (!window.L) { $('#mapa-campo').innerHTML = '<p class="muted" style="padding:16px">Mapa indisponível neste aparelho.</p>'; return; }
    M.mapa = L.map('mapa-campo', { zoomControl: true, maxZoom: 22, attributionControl: true }).setView([-15, -52], 4);
    trocarBase(base);
    if (M.eixo && M.eixo.pts && M.eixo.pts.length > 1) L.polyline(M.eixo.pts, { color: '#FF8A00', weight: 4, opacity: .9 }).addTo(M.mapa).bindTooltip(M.eixo.rodovia || 'Eixo', { sticky: true });
    const pts = desenhar();
    const todos = pts.concat(M.eixo && M.eixo.pts ? M.eixo.pts : []);
    if (todos.length) M.mapa.fitBounds(L.latLngBounds(todos).pad(0.15), { maxZoom: 18 });
    atualizarProximos();
    setTimeout(() => M.mapa && M.mapa.invalidateSize(), 150);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-base],[data-mapa]'); if (!b || !M.mapa) return;
    if (b.dataset.base) trocarBase(b.dataset.base);
    else if (b.dataset.mapa === 'gps') ligarGps(true);
    else if (b.dataset.mapa === 'foco') focar(b.dataset.id);
  });
  window.addEventListener('online', () => { const av = $('#mapa-aviso'); if (av) av.hidden = true; });
  window.addEventListener('offline', () => { const av = $('#mapa-aviso'); if (av && BASES[M.base].url) av.hidden = false; });

  BU.Mapa = { view, parar };
})();
