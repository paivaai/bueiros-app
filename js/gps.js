/* gps.js — captura de localização e conversão para UTM (SIRGAS 2000). Expõe BU.GPS. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI;

  function capturar() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) { rej({ code: 2 }); return; }
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, alt: p.coords.altitude, ts: p.timestamp || Date.now() }),
        rej, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
    });
  }
  function msgErro(e) {
    const ins = !window.isSecureContext ? ' O GPS só funciona em endereço https:// (ou localhost).' : '';
    switch (e && e.code) {
      case 1: return 'Permissão de localização negada. No Chrome, toque no cadeado ao lado do endereço > Permissões > Localização > Permitir. Ou digite as coordenadas abaixo.' + ins;
      case 2: return 'GPS indisponível agora. Vá para um local aberto, ligue a localização do aparelho ou digite as coordenadas abaixo.' + ins;
      case 3: return 'Tempo esgotado ao obter o GPS. Tente de novo em céu aberto.';
      default: return 'Não foi possível obter a localização.' + ins;
    }
  }
  function qualidade(acc) {
    if (acc == null) return null;
    if (acc <= 5) return { k: 'salvo', t: 'Boa' };
    if (acc <= 15) return { k: 'rascunho', t: 'Aceitável' };
    return { k: 'erro', t: 'Ruim: vá para céu aberto e atualize' };
  }

  /* lat/lon (graus) -> UTM SIRGAS 2000 (elipsoide GRS80). Validado contra pyproj (erro < 1 mm). */
  function paraUTM(lat, lon, zona) {
    const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, n = f / (2 - f), e = Math.sqrt(f * (2 - f));
    const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
    const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
    zona = zona || Math.floor((lon + 180) / 6) + 1;
    const lam = (lon - (zona * 6 - 183)) * Math.PI / 180, phi = lat * Math.PI / 180;
    const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
    const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
    let X = xi, Y = eta;
    for (let j = 1; j <= 3; j++) { X += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); Y += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
    return { zona, leste: 500000 + k0 * A * Y, norte: k0 * A * X + (lat < 0 ? 1e7 : 0) };
  }

  function cartaoHTML(l) {
    const tem = l.latitude != null && l.longitude != null, q = qualidade(l.precisaoGps), N = U.numTxt;
    return `<div class="card gps"><h3>GPS do aparelho</h3>
      ${tem ? `<div class="kv"><span>Latitude</span><b class="mono">${N(l.latitude)}</b></div>
        <div class="kv"><span>Longitude</span><b class="mono">${N(l.longitude)}</b></div>
        <div class="kv"><span>Precisão</span><b>${l.precisaoGps != null ? '±' + N(l.precisaoGps) + ' m' : '—'} ${q ? `<span class="chip ${q.k}">${U.esc(q.t)}</span>` : ''}</b></div>
        <div class="kv"><span>Altitude</span><b>${l.altitude != null ? N(l.altitude) + ' m' : '—'}</b></div>
        <div class="kv"><span>Capturado em</span><b>${l.gpsCapturadoEm ? U.esc(U.dataHoraBR(l.gpsCapturadoEm)) : (l.coordOrigem === 'cadastro' ? 'do cadastro (confirme no local)' : 'digitado')}</b></div>
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}&travelmode=driving">Navegar até o ponto</a>`
        : '<p class="muted">Nenhuma localização registrada ainda.</p>'}
      <div id="gps-status" class="gps-status" role="status"></div>
      <button type="button" class="btn primary" data-gps="capturar">${tem ? 'Atualizar GPS' : 'Capturar GPS'}</button>
      <p class="muted small">Sem GPS? Digite as coordenadas abaixo. O cadastro nunca é bloqueado.</p></div>`;
  }

  let ocupado = false;
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-gps="capturar"]'); if (!b || ocupado) return;
    const App = BU.App, l = App.cur(), st = document.getElementById('gps-status');
    if (!l) return;
    ocupado = true; b.disabled = true; if (st) { st.textContent = 'Obtendo localização… aguarde.'; st.className = 'gps-status'; }
    try {
      const r = await capturar();
      if (App.cur() !== l) return;
      l.latitude = +r.lat.toFixed(7); l.longitude = +r.lon.toFixed(7);
      l.precisaoGps = r.acc != null ? +r.acc.toFixed(1) : null;
      l.altitude = r.alt != null ? +r.alt.toFixed(1) : null;
      l.gpsCapturadoEm = new Date(r.ts).toISOString(); l.coordOrigem = 'gps';
      App.marcarSujo(); App.renderEtapa();
      if (r.acc > 15) UI.toast(`Precisão ruim (±${Math.round(r.acc)} m). Vá para céu aberto e atualize.`, 'aviso');
      else UI.toast('GPS capturado');
    } catch (err) {
      if (st) { st.textContent = msgErro(err); st.className = 'gps-status erro'; }
      b.disabled = false;
    } finally { ocupado = false; }
  });

  BU.GPS = { capturar, msgErro, paraUTM, cartaoHTML };
})();
