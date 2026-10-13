/* gps.js — coordenadas UTM (SIRGAS 2000): conversão lat/lon <-> UTM e cartão da etapa Localização.
   A captura pelo GPS do celular foi desativada: as coordenadas vêm do RTK (digitadas ou importadas). Expõe BU.GPS. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U;

  const ZONAS = ['18', '19', '20', '21', '22', '23', '24', '25'];
  const A = 6378137, F = 1 / 298.257222101, K0 = 0.9996, N_ = F / (2 - F), E2 = Math.sqrt(F * (2 - F));
  const AA = A / (1 + N_) * (1 + N_ * N_ / 4 + N_ ** 4 / 64);

  /* lat/lon (graus) -> UTM SIRGAS 2000 (elipsoide GRS80). Validado contra pyproj (erro < 1 mm). */
  function paraUTM(lat, lon, zona) {
    const n = N_, e = E2, al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
    zona = zona || Math.floor((lon + 180) / 6) + 1;
    const lam = (lon - (zona * 6 - 183)) * Math.PI / 180, phi = lat * Math.PI / 180;
    const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
    const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
    let X = xi, Y = eta;
    for (let j = 1; j <= 3; j++) { X += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); Y += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
    return { zona, hem: lat < 0 ? 'S' : 'N', leste: 500000 + K0 * AA * Y, norte: K0 * AA * X + (lat < 0 ? 1e7 : 0) };
  }

  /* UTM -> lat/lon (graus). hem = 'S' ou 'N'. Série de Krüger (erro < 1 mm). */
  function deUTM(leste, norte, zona, hem) {
    const n = N_, be = [n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96, n * n / 48 + n ** 3 / 15, 17 * n ** 3 / 480];
    const de = [2 * n - 2 * n * n / 3 - 2 * n ** 3, 7 * n * n / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15];
    const N0 = hem === 'S' ? 1e7 : 0, xi = (norte - N0) / (K0 * AA), eta = (leste - 500000) / (K0 * AA);
    let xp = xi, ep = eta;
    for (let j = 1; j <= 3; j++) { xp -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
    const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
    let phi = chi; for (let j = 1; j <= 3; j++) phi += de[j - 1] * Math.sin(2 * j * chi);
    const lam = (zona * 6 - 183) * Math.PI / 180 + Math.atan2(Math.sinh(ep), Math.cos(xp));
    return { lat: phi * 180 / Math.PI, lon: lam * 180 / Math.PI };
  }

  const num = v => { const n = U.parseNum(v); return n; };
  /* Coordenadas UTM do levantamento: { E, N, Z, zona, hem } ou null se faltar Este/Norte. */
  function utmDe(l) {
    const E = num(l.leste), N = num(l.norte), zona = parseInt(l.zona, 10);
    if (E == null || N == null || !(zona >= 1 && zona <= 60)) return null;
    return { E, N, Z: num(l.altitude), zona, hem: l.hemisferio === 'N' ? 'N' : 'S' };
  }
  /* Mantém latitude/longitude (usadas só para o botão Navegar) coerentes com o UTM digitado. */
  function atualizarLatLon(l) {
    const u = utmDe(l);
    if (!u) return;
    try { const g = deUTM(u.E, u.N, u.zona, u.hem); if (isFinite(g.lat) && isFinite(g.lon)) { l.latitude = +g.lat.toFixed(7); l.longitude = +g.lon.toFixed(7); } } catch (e) { /* ignora */ }
  }
  /* Registros antigos ou do cadastro só têm lat/lon: completa o UTM. */
  function completarUTM(l) {
    if ((l.leste == null || l.norte == null) && l.latitude != null && l.longitude != null) {
      const u = paraUTM(l.latitude, l.longitude);
      l.zona = String(u.zona); l.hemisferio = u.hem; l.leste = +u.leste.toFixed(3); l.norte = +u.norte.toFixed(3);
    }
    if (!l.hemisferio) l.hemisferio = 'S';
    if (l.zona != null && typeof l.zona !== 'string') l.zona = String(l.zona);
    return l;
  }
  const rotuloUTM = u => u ? `UTM ${u.zona}${u.hem} · SIRGAS 2000` : '';
  const fmtM = (v, d = 3) => {
    if (v == null || !isFinite(v)) return '';
    const [i, f] = Math.abs(v).toFixed(d).split('.');
    return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
  };

  const ORIGEM = { cadastro: 'vieram do cadastro (confirme com o RTK)', manual: 'digitadas', rtk: 'do levantamento RTK (TXT)', gps: 'do GPS do aparelho (versão antiga)' };

  function cartaoHTML(l) {
    const tem = utmDe(l) != null && l.latitude != null && l.longitude != null;
    return `<div class="card gps"><h3>Origem das coordenadas</h3>
      <p class="muted small">O GPS do celular está desativado. Digite as coordenadas do equipamento GNSS (RTK) ou importe o TXT na etapa Pontos.</p>
      ${tem ? `<div class="kv"><span>Situação</span><b>${U.esc(ORIGEM[l.coordOrigem] || 'informadas')}</b></div>
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}&travelmode=driving">Navegar até o ponto</a>` : ''}
      ${l.pontos && l.pontos.length ? '<button type="button" class="btn" data-a="coord-pontos">Usar o centro do bueiro (pontos do TXT)</button>' : ''}</div>`;
  }

  BU.GPS = { ZONAS, paraUTM, deUTM, utmDe, atualizarLatLon, completarUTM, rotuloUTM, fmtM, cartaoHTML };
})();
