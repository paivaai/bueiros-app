/* exportacao.js — entregas do painel: CSV, GeoJSON, KML/KMZ, Shapefile, GeoPackage e relatório imprimível.
   Tudo é gerado no navegador, sem servidor. Coordenadas em SIRGAS 2000 geográficas (EPSG:4674); Este/Norte/Fuso UTM vão como atributos.
   Expõe window.Exportacao.abrir(ctx) — ctx: { projeto, bueiros (lista atual, sem dados), filtrados, nomeDe, D, ROT, eixo }. */
(function () {
  'use strict';
  const BU = window.BU || {}, esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = new TextEncoder();
  const ROT_ST = { a_vistoriar: 'A vistoriar', rascunho: 'Em andamento', concluido: 'Concluído', devolvido: 'Devolvido', aprovado: 'Aprovado', nao_localizado: 'Não localizado' };

  /* =============================================================== atributos (uma lista só para todos os formatos) */
  const num = v => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
  const pats = d => (d.patologias || []).map(p => `${p.tipo || '?'}${p.gravidade ? ' (' + p.gravidade + ')' : ''}${p.local ? ' - ' + String(p.local).split(' (')[0] : ''}`).join('; ');
  /* [chave longa, nome no DBF (≤10), tipo C/N, largura, casas, função] */
  const CAMPOS = [
    ['codigo', 'CODIGO', 'C', 60, 0, (b) => b.codigo],
    ['cadastro', 'CADASTRO', 'C', 40, 0, (b) => b.cadastro_id],
    ['km', 'KM', 'C', 14, 0, (b) => b.km],
    ['rodovia', 'RODOVIA', 'C', 40, 0, (b, d) => d.estrada],
    ['municipio', 'MUNICIPIO', 'C', 60, 0, (b, d) => d.municipio],
    ['uf', 'UF', 'C', 2, 0, (b, d) => d.estado],
    ['situacao', 'SITUACAO', 'C', 20, 0, (b) => ROT_ST[b.status] || b.status],
    ['responsavel', 'RESPONS', 'C', 60, 0, (b) => b.responsavel_nome],
    ['data', 'DATA', 'C', 10, 0, (b, d) => d.data],
    ['leste', 'LESTE', 'N', 14, 3, (b) => num(b.leste)],
    ['norte', 'NORTE', 'N', 15, 3, (b) => num(b.norte)],
    ['fuso', 'FUSO', 'C', 4, 0, (b, d) => b.zona ? b.zona + (d.hemisferio || 'S') : ''],
    ['latitude', 'LATITUDE', 'N', 13, 8, (b) => num(b.latitude)],
    ['longitude', 'LONGITUDE', 'N', 14, 8, (b) => num(b.longitude)],
    ['altitude', 'ALTITUDE', 'N', 10, 3, (b, d) => num(d.altitude)],
    ['alt_tipo', 'ALT_TIPO', 'C', 12, 0, (b, d) => (d.rtk || {}).tipoAltitude],
    ['tipo', 'TIPO', 'C', 24, 0, (b, d) => (d.caracteristicas || {}).tipo],
    ['formato', 'FORMATO', 'C', 20, 0, (b, d) => (d.caracteristicas || {}).formato],
    ['material', 'MATERIAL', 'C', 24, 0, (b, d) => (d.caracteristicas || {}).material],
    ['celulas', 'CELULAS', 'N', 4, 0, (b, d) => num((d.caracteristicas || {}).celulas)],
    ['diametro_m', 'DIAMETRO', 'N', 8, 3, (b, d) => num((d.caracteristicas || {}).diametro)],
    ['largura_m', 'LARGURA', 'N', 8, 3, (b, d) => num((d.caracteristicas || {}).largura)],
    ['altura_m', 'ALTURA', 'N', 8, 3, (b, d) => num((d.caracteristicas || {}).altura)],
    ['comprimento_m', 'COMPRIM', 'N', 8, 3, (b, d) => num((d.caracteristicas || {}).comprimento) ?? num((d.medicoes || {}).comprimentoBueiro)],
    ['cota_entrada', 'COTA_ENT', 'N', 10, 3, (b, d) => num((d.medicoes || {}).cotaEntrada)],
    ['cota_saida', 'COTA_SAI', 'N', 10, 3, (b, d) => num((d.medicoes || {}).cotaSaida)],
    ['declividade', 'DECLIV', 'N', 8, 3, (b, d) => num((d.medicoes || {}).declividade)],
    ['conservacao', 'CONSERV', 'C', 20, 0, (b, d) => (d.caracteristicas || {}).conservacao],
    ['sit_estrutural', 'ESTRUTURA', 'C', 24, 0, (b, d) => (d.caracteristicas || {}).situacaoEstrutural],
    ['erosao', 'EROSAO', 'C', 14, 0, (b, d) => (d.caracteristicas || {}).erosao],
    ['assoreamento', 'ASSOREAM', 'C', 14, 0, (b, d) => (d.caracteristicas || {}).assoreamento],
    ['obstrucao', 'OBSTRUCAO', 'C', 14, 0, (b, d) => (d.caracteristicas || {}).obstrucao],
    ['agua', 'AGUA', 'C', 14, 0, (b, d) => (d.caracteristicas || {}).agua],
    ['vegetacao', 'VEGETACAO', 'C', 14, 0, (b, d) => (d.caracteristicas || {}).vegetacao],
    ['tipo_entrada', 'ENTRADA', 'C', 30, 0, (b, d) => (d.caracteristicas || {}).tipoEntrada],
    ['tipo_saida', 'SAIDA', 'C', 30, 0, (b, d) => (d.caracteristicas || {}).tipoSaida],
    ['intervencao', 'INTERVENC', 'C', 80, 0, (b, d) => (d.caracteristicas || {}).necessita],
    ['patologias', 'PATOLOG', 'C', 254, 0, (b, d) => d.semPatologias ? 'Sem patologias' : pats(d)],
    ['n_patologias', 'N_PAT', 'N', 3, 0, (b, d) => (d.patologias || []).length],
    ['n_fotos', 'N_FOTOS', 'N', 4, 0, (b, d) => (d.fotos || []).length],
    ['n_pontos', 'N_PONTOS', 'N', 5, 0, (b, d) => (d.pontos || []).length],
    ['rtk_solucao', 'RTK_SOL', 'C', 12, 0, (b, d) => (d.rtk || {}).solucao],
    ['rtk_prec_h', 'RTK_PH', 'N', 8, 3, (b, d) => num((d.rtk || {}).precisaoH)],
    ['rtk_prec_v', 'RTK_PV', 'N', 8, 3, (b, d) => num((d.rtk || {}).precisaoV)],
    ['rtk_base', 'RTK_BASE', 'C', 60, 0, (b, d) => (d.rtk || {}).base],
    ['rtk_receptor', 'RTK_RECEP', 'C', 40, 0, (b, d) => (d.rtk || {}).receptor],
    ['nao_localizado', 'NAOLOC', 'C', 120, 0, (b, d) => d.naoLocalizado ? [d.naoLocalizado.motivo, d.naoLocalizado.obs].filter(Boolean).join(' - ') : ''],
    ['obs_revisao', 'REVISAO', 'C', 254, 0, (b) => b.comentario_revisao],
    ['atualizado_em', 'ATUALIZ', 'C', 20, 0, (b) => b.atualizado_em ? String(b.atualizado_em).slice(0, 19).replace('T', ' ') : ''],
    ['id', 'ID', 'C', 36, 0, (b) => b.id],
  ];
  const linha = b => { const d = b.dados || {}; return CAMPOS.map(c => { let v = c[5](b, d); if (v === undefined || v === '' ) v = null; return c[2] === 'N' ? (v == null ? null : num(v)) : (v == null ? null : String(v)); }); };
  const comCoord = b => b.latitude != null && b.longitude != null && isFinite(b.latitude) && isFinite(b.longitude);

  /* =============================================================== util: bytes, zip */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  /* ZIP sem compressão ("store"): suficiente para KMZ e shapefile, aberto por qualquer programa. */
  function zip(arquivos) {
    const partes = [], central = []; let off = 0;
    const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const a of arquivos) {
      const nome = enc.encode(a.nome), dados = a.dados instanceof Uint8Array ? a.dados : enc.encode(a.dados), crc = crc32(dados);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dosT, true); h.setUint16(12, dosD, true);
      h.setUint32(14, crc, true); h.setUint32(18, dados.length, true); h.setUint32(22, dados.length, true); h.setUint16(26, nome.length, true); h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), nome, dados);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dosT, true); c.setUint16(14, dosD, true);
      c.setUint32(16, crc, true); c.setUint32(20, dados.length, true); c.setUint32(24, dados.length, true); c.setUint16(28, nome.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nome);
      off += 30 + nome.length + dados.length;
    }
    const tamC = central.reduce((s, x) => s + x.length, 0), fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true); fim.setUint32(12, tamC, true); fim.setUint32(16, off, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/zip' });
  }

  /* =============================================================== formatos */
  const csvTxt = (lista) => {
    const l = [CAMPOS.map(c => c[0])].concat(lista.map(linha));
    return '﻿' + l.map(r => r.map(c => { const s = c == null ? '' : String(c).replace('.', typeof c === 'number' ? ',' : '.'); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
  };
  function geojson(lista) {
    const fs = lista.filter(comCoord).map(b => {
      const v = linha(b), p = {}; CAMPOS.forEach((c, i) => { p[c[0]] = v[i]; });
      return { type: 'Feature', id: b.id, geometry: { type: 'Point', coordinates: [+b.longitude, +b.latitude] }, properties: p };
    });
    return JSON.stringify({ type: 'FeatureCollection', name: 'bueiros', features: fs }, null, 1);
  }

  const COR_KML = { a_vistoriar: 'ff808080', rascunho: 'ff00a0e0', concluido: 'ffbf5f1f', devolvido: 'ff2318b4', aprovado: 'ff4b7f1b', nao_localizado: 'ffc44f7b' }; // aabbggrr
  function kml(lista, ctx) {
    const x = esc;
    const estilos = Object.keys(COR_KML).map(k => `<Style id="s_${k}"><IconStyle><color>${COR_KML[k]}</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>`).join('');
    const por = {};
    lista.filter(comCoord).forEach(b => { (por[b.status] = por[b.status] || []).push(b); });
    const pasta = Object.keys(ROT_ST).filter(k => por[k]).map(k => `<Folder><name>${x(ROT_ST[k])} (${por[k].length})</name>${por[k].map(b => {
      const v = linha(b), tab = CAMPOS.map((c, i) => v[i] != null && v[i] !== '' ? `<tr><td><b>${x(c[0])}</b></td><td>${x(v[i])}</td></tr>` : '').join('');
      return `<Placemark><name>${x(b.codigo)}</name><styleUrl>#s_${k}</styleUrl><description><![CDATA[<table>${tab}</table>]]></description><ExtendedData>${CAMPOS.map((c, i) => v[i] != null && v[i] !== '' ? `<Data name="${x(c[0])}"><value>${x(v[i])}</value></Data>` : '').join('')}</ExtendedData><Point><coordinates>${(+b.longitude).toFixed(8)},${(+b.latitude).toFixed(8)},0</coordinates></Point></Placemark>`;
    }).join('')}</Folder>`).join('');
    const ex = ctx.eixo && ctx.eixo.pts && ctx.eixo.pts.length > 1 ? `<Folder><name>Eixo</name><Placemark><name>${x(ctx.eixo.rodovia || 'Eixo')}</name><Style><LineStyle><color>ff008aff</color><width>3</width></LineStyle></Style><LineString><tessellate>1</tessellate><coordinates>${ctx.eixo.pts.map(p => `${p[1]},${p[0]},0`).join(' ')}</coordinates></LineString></Placemark></Folder>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x((ctx.projeto && ctx.projeto.nome) || 'Bueiros')}</name>${estilos}${ex}${pasta}</Document></kml>`;
  }

  /* ---------- shapefile (pontos) ---------- */
  const WKT_4674 = 'GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6674"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4674"]]';
  function cortaBytes(s, n) { let b = enc.encode(s); while (b.length > n) { s = s.slice(0, -1); b = enc.encode(s); } return b; }
  function shapefile(lista) {
    const pts = lista.filter(comCoord), n = pts.length;
    const shp = new DataView(new ArrayBuffer(100 + 28 * n)), shx = new DataView(new ArrayBuffer(100 + 8 * n));
    const xs = pts.map(b => +b.longitude), ys = pts.map(b => +b.latitude), mn = a => a.length ? Math.min(...a) : 0, mx = a => a.length ? Math.max(...a) : 0;
    for (const [v, tam] of [[shp, 100 + 28 * n], [shx, 100 + 8 * n]]) {
      v.setInt32(0, 9994); v.setInt32(24, tam / 2); v.setInt32(28, 1000, true); v.setInt32(32, 1, true);
      v.setFloat64(36, mn(xs), true); v.setFloat64(44, mn(ys), true); v.setFloat64(52, mx(xs), true); v.setFloat64(60, mx(ys), true);
    }
    pts.forEach((b, i) => {
      const o = 100 + 28 * i; shp.setInt32(o, i + 1); shp.setInt32(o + 4, 10); shp.setInt32(o + 8, 1, true); shp.setFloat64(o + 12, xs[i], true); shp.setFloat64(o + 20, ys[i], true);
      const q = 100 + 8 * i; shx.setInt32(q, o / 2); shx.setInt32(q + 4, 10);
    });
    // dbf
    const reclen = 1 + CAMPOS.reduce((s, c) => s + c[3], 0), hlen = 33 + 32 * CAMPOS.length, dbf = new Uint8Array(hlen + reclen * n + 1), dv = new DataView(dbf.buffer), hoje = new Date();
    dbf[0] = 3; dbf[1] = hoje.getFullYear() - 1900; dbf[2] = hoje.getMonth() + 1; dbf[3] = hoje.getDate(); dv.setUint32(4, n, true); dv.setUint16(8, hlen, true); dv.setUint16(10, reclen, true);
    CAMPOS.forEach((c, i) => { const o = 32 + 32 * i; dbf.set(enc.encode(c[1]).slice(0, 10), o); dbf[o + 11] = c[2].charCodeAt(0); dbf[o + 16] = c[3]; dbf[o + 17] = c[4]; });
    dbf[32 + 32 * CAMPOS.length] = 0x0D;
    pts.forEach((b, r) => {
      let o = hlen + r * reclen; dbf[o++] = 0x20; const v = linha(b);
      CAMPOS.forEach((c, i) => {
        const w = c[3]; let bytes;
        if (c[2] === 'N') { bytes = enc.encode(v[i] == null ? '' : v[i].toFixed(c[4])); if (bytes.length > w) bytes = enc.encode(''); const pad = new Uint8Array(w).fill(0x20); pad.set(bytes, w - bytes.length); bytes = pad; }
        else { const t = cortaBytes(v[i] == null ? '' : String(v[i]), w), pad = new Uint8Array(w).fill(0x20); pad.set(t); bytes = pad; }
        dbf.set(bytes, o); o += w;
      });
    });
    dbf[hlen + reclen * n] = 0x1A;
    return zip([{ nome: 'bueiros.shp', dados: new Uint8Array(shp.buffer) }, { nome: 'bueiros.shx', dados: new Uint8Array(shx.buffer) }, { nome: 'bueiros.dbf', dados: dbf },
      { nome: 'bueiros.prj', dados: WKT_4674 }, { nome: 'bueiros.cpg', dados: 'UTF-8' }]);
  }

  /* ---------- geopackage (SQLite via sql.js, carregado só quando precisa) ---------- */
  let sqlP = null;
  function carregarSql() {
    if (sqlP) return sqlP;
    sqlP = new Promise((ok, falha) => {
      const base = new URL('js/vendor/', document.baseURI).href, s = document.createElement('script'); s.src = base + 'sql-wasm.js';
      s.onload = () => window.initSqlJs({ locateFile: f => base + f }).then(ok, falha); s.onerror = () => falha(new Error('Não foi possível carregar o gerador de GeoPackage'));
      document.head.appendChild(s);
    });
    sqlP.catch(() => { sqlP = null; });
    return sqlP;
  }
  async function geopackage(lista) {
    const SQL = await carregarSql(), db = new SQL.Database(), pts = lista.filter(comCoord);
    db.run('PRAGMA application_id = 1196444487; PRAGMA user_version = 10300;');
    db.run(`CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
      CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
      CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name), CONSTRAINT uk_gc_table_name UNIQUE (table_name), CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name), CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id));`);
    const ins = db.prepare('INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?,?,?)');
    ins.run(['Undefined Cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined Cartesian coordinate reference system']);
    ins.run(['Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system']);
    ins.run(['SIRGAS 2000', 4674, 'EPSG', 4674, WKT_4674, 'SIRGAS 2000 geográficas']); ins.free();
    const cols = CAMPOS.map(c => `"${c[0]}" ${c[2] === 'N' ? (c[4] === 0 ? 'INTEGER' : 'REAL') : 'TEXT'}`).join(', ');
    db.run(`CREATE TABLE bueiros (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom POINT, ${cols});`);
    const xs = pts.map(b => +b.longitude), ys = pts.map(b => +b.latitude), mn = a => a.length ? Math.min(...a) : 0, mx = a => a.length ? Math.max(...a) : 0;
    db.run('INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id) VALUES (?,?,?,?,?,?,?,?,?)', ['bueiros', 'features', 'bueiros', 'Cadastro de bueiros (GFA Engenharia)', mn(xs), mn(ys), mx(xs), mx(ys), 4674]);
    db.run("INSERT INTO gpkg_geometry_columns VALUES ('bueiros','geom','POINT',4674,0,0)");
    const st = db.prepare(`INSERT INTO bueiros (geom, ${CAMPOS.map(c => '"' + c[0] + '"').join(',')}) VALUES (?, ${CAMPOS.map(() => '?').join(',')})`);
    db.run('BEGIN');
    pts.forEach(b => {
      const g = new DataView(new ArrayBuffer(29)); g.setUint8(0, 0x47); g.setUint8(1, 0x50); g.setUint8(2, 0); g.setUint8(3, 1); g.setInt32(4, 4674, true); g.setUint8(8, 1); g.setUint32(9, 1, true); g.setFloat64(13, +b.longitude, true); g.setFloat64(21, +b.latitude, true);
      st.run([new Uint8Array(g.buffer)].concat(linha(b)));
    });
    db.run('COMMIT'); st.free();
    const out = db.export(); db.close();
    return new Blob([out], { type: 'application/geopackage+sqlite3' });
  }

  /* =============================================================== relatório (imprimir / salvar em PDF) */
  async function relatorio(lista, ctx, comFotos) {
    const x = esc, N = v => (v == null || v === '' ? '—' : String(v).replace('.', ','));
    const cont = {}; lista.forEach(b => { cont[b.status] = (cont[b.status] || 0) + 1; });
    let corpo = '';
    for (const b of lista) {
      const d = b.dados || {}, c = d.caracteristicas || {}, m = d.medicoes || {}, r = d.rtk || {};
      let prancha = '';
      if (BU.Prancha && Array.isArray(d.pontos) && d.pontos.length) { try { BU.Prancha.sincronizarMedicoes(d); prancha = BU.Prancha.gerarSVG(d, { foco: 'tudo' }); } catch (e) { prancha = ''; } }
      let fotos = '';
      if (comFotos) { try { const fs = await ctx.D.fotos(b.id); fotos = fs.length ? `<h3>Fotos</h3><div class="fotos">${fs.map(f => `<figure><img src="${x(f.url)}" alt=""><figcaption>${x([f.categoria, f.legenda].filter(Boolean).join(' · '))}</figcaption></figure>`).join('')}</div>` : ''; } catch (e) { /* sem fotos */ } }
      const conf = BU.Conf ? BU.Conf.analisar({ ...d, status: b.status }, ctx.eixo) : [];
      const kv = (k, v) => `<tr><th>${x(k)}</th><td>${x(N(v))}</td></tr>`;
      const dim = c.diametro != null ? `Ø ${N(c.diametro)} m` : (c.largura != null ? `${N(c.largura)} × ${N(c.altura)} m` : '—');
      corpo += `<section class="pg"><h2>${x(b.codigo)} <span class="st">${x(ROT_ST[b.status] || b.status)}</span></h2>
        <div class="duas"><table>${kv('Km', b.km)}${kv('Rodovia / local', [d.estrada, d.municipio, d.estado].filter(Boolean).join(' · '))}${kv('Data', d.data)}${kv('Responsável', b.responsavel_nome)}
          ${kv('Coordenadas UTM', b.leste != null ? `E ${N(b.leste)}  N ${N(b.norte)}  (${b.zona || ''}${d.hemisferio || 'S'})` : '')}${kv('Lat / Lon', b.latitude != null ? `${(+b.latitude).toFixed(7)}  ${(+b.longitude).toFixed(7)}` : '')}${kv('Altitude', d.altitude != null ? N(d.altitude) + ' m' + (r.tipoAltitude ? ' (' + r.tipoAltitude.toLowerCase() + ')' : '') : '')}
          ${kv('RTK', [r.solucao, r.precisaoH != null ? 'H ' + N(r.precisaoH) + ' m' : '', r.base].filter(Boolean).join(' · '))}</table>
        <table>${kv('Tipo / formato', [c.tipo, c.formato].filter(Boolean).join(' / '))}${kv('Material', c.material)}${kv('Dimensão', dim)}${kv('Células', c.celulas)}${kv('Conservação', c.conservacao)}${kv('Situação estrutural', c.situacaoEstrutural)}
          ${kv('Ocorrências', ['erosao', 'assoreamento', 'obstrucao', 'agua', 'vegetacao'].filter(k => c[k] === 'Sim').join(', ') || 'nenhuma registrada')}${kv('Intervenção', c.necessita)}${kv('Cota entrada / saída', (m.cotaEntrada != null || m.cotaSaida != null) ? `${N(m.cotaEntrada)} / ${N(m.cotaSaida)}` : '')}</table></div>
        ${d.naoLocalizado ? `<p><b>Não localizado:</b> ${x(d.naoLocalizado.motivo || '')} ${x(d.naoLocalizado.obs || '')}</p>` : ''}
        ${(d.patologias || []).length ? `<h3>Patologias</h3><table class="grade"><tr><th>Local</th><th>Tipo</th><th>Gravidade</th><th>Observação</th></tr>${d.patologias.map(p => `<tr><td>${x(p.local || '')}</td><td>${x(p.tipo || '')}</td><td>${x(p.gravidade || '')}</td><td>${x(p.obs || '')}</td></tr>`).join('')}</table>` : (d.semPatologias ? '<p>Sem patologias aparentes.</p>' : '')}
        ${conf.length ? `<h3>Conferências</h3><ul>${conf.map(k => `<li>${x(k.t)}</li>`).join('')}</ul>` : ''}
        ${d.observacoes ? `<p><b>Observações:</b> ${x(d.observacoes)}</p>` : ''}
        ${prancha ? `<h3>Prancha</h3><div class="prancha">${prancha}</div>` : ''}${fotos}</section>`;
    }
    const resumo = Object.keys(ROT_ST).filter(k => cont[k]).map(k => `${x(ROT_ST[k])}: <b>${cont[k]}</b>`).join(' · ');
    const tabela = `<table class="grade"><tr><th>Código</th><th>Km</th><th>Situação</th><th>Tipo</th><th>Dimensão</th><th>Conservação</th><th>Patologias</th></tr>${lista.map(b => { const d = b.dados || {}, c = d.caracteristicas || {}; return `<tr><td>${x(b.codigo)}</td><td>${x(b.km || '')}</td><td>${x(ROT_ST[b.status] || b.status)}</td><td>${x(c.tipo || '')}</td><td>${c.diametro != null ? 'Ø ' + N(c.diametro) : (c.largura != null ? N(c.largura) + '×' + N(c.altura) : '')}</td><td>${x(c.conservacao || '')}</td><td>${(d.patologias || []).length}</td></tr>`; }).join('')}</table>`;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — ${x((ctx.projeto || {}).nome || 'Bueiros')}</title><style>
      body{font:13px/1.35 Arial,Helvetica,sans-serif;color:#111;margin:0;padding:18px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 8px;border-bottom:2px solid #c5421a;padding-bottom:4px}h3{font-size:14px;margin:12px 0 4px}
      .st{font-size:12px;font-weight:400;color:#555;margin-left:8px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:3px 6px;text-align:left;vertical-align:top}th{background:#f1f1f1;width:34%}
      .grade th{width:auto}.duas{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pg{page-break-before:always}.capa{margin-bottom:16px}.prancha svg{max-width:100%;height:auto}
      .fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.fotos img{width:100%;height:auto;border:1px solid #ccc}figure{margin:0;font-size:11px}.bar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px;border-bottom:1px solid #ddd}
      @media print{.bar{display:none}body{padding:0}}</style></head><body>
      <div class="bar"><button onclick="window.print()">Imprimir / salvar em PDF</button></div>
      <div class="capa"><h1>Cadastro de bueiros</h1><div>${x((ctx.projeto || {}).nome || '')}${(ctx.projeto || {}).rodovia ? ' · ' + x(ctx.projeto.rodovia) : ''}</div><div>Emitido em ${new Date().toLocaleDateString('pt-BR')} · ${lista.length} bueiro(s)</div><p>${resumo}</p>${tabela}</div>${corpo}</body></html>`;
  }

  /* =============================================================== interface */
  function baixar(blob, nome) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  }
  const slug = s => String(s || 'bueiros').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'bueiros';

  async function gerar(formato, lista, ctx, opc) {
    const base = slug((ctx.projeto || {}).nome) + '_' + new Date().toISOString().slice(0, 10);
    if (formato === 'csv') return baixar(new Blob([csvTxt(lista)], { type: 'text/csv;charset=utf-8' }), base + '.csv');
    if (formato === 'geojson') return baixar(new Blob([geojson(lista)], { type: 'application/geo+json' }), base + '.geojson');
    if (formato === 'kml') return baixar(new Blob([kml(lista, ctx)], { type: 'application/vnd.google-earth.kml+xml' }), base + '.kml');
    if (formato === 'kmz') return baixar(zip([{ nome: 'doc.kml', dados: kml(lista, ctx) }]).slice(0, undefined, 'application/vnd.google-earth.kmz'), base + '.kmz');
    if (formato === 'shp') return baixar(shapefile(lista), base + '_shapefile.zip');
    if (formato === 'gpkg') return baixar(await geopackage(lista), base + '.gpkg');
    if (formato === 'relatorio') { const html = await relatorio(lista, ctx, opc.fotos); return baixar(new Blob([html], { type: 'text/html;charset=utf-8' }), base + '_relatorio.html'); }
  }

  async function abrir(ctx) {
    const fundo = document.createElement('div'); fundo.className = 'exp-fundo'; fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-modal', 'true');
    const todos = ctx.bueiros, filtr = ctx.filtrados, aprov = todos.filter(b => b.status === 'aprovado');
    fundo.innerHTML = `<div class="exp card"><h2 style="margin:0 0 8px">Exportar</h2>
      <label class="f">O que exportar<select id="ex-q"><option value="filtrados">Os ${filtr.length} da tela (filtros atuais)</option><option value="aprovados">Só aprovados (${aprov.length})</option><option value="todos">Todos do projeto (${todos.length})</option></select></label>
      <p class="muted small" id="ex-n" style="margin:6px 0 10px"></p>
      <div class="exp-grade">
        <button class="btn" data-f="gpkg"><b>GeoPackage</b><small>.gpkg · QGIS, ArcGIS</small></button>
        <button class="btn" data-f="shp"><b>Shapefile</b><small>.zip · SIRGAS 2000</small></button>
        <button class="btn" data-f="kmz"><b>KMZ</b><small>Google Earth</small></button>
        <button class="btn" data-f="kml"><b>KML</b><small>Google Earth</small></button>
        <button class="btn" data-f="geojson"><b>GeoJSON</b><small>web e GIS</small></button>
        <button class="btn" data-f="csv"><b>CSV</b><small>Excel (;)</small></button>
        <button class="btn pri" data-f="relatorio"><b>Relatório</b><small>HTML p/ imprimir ou PDF</small></button></div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="ex-fotos"> Incluir fotos no relatório (mais lento)</label>
      <div id="ex-msg" class="small" style="margin-top:10px;min-height:20px" role="status"></div>
      <div class="linha" style="margin-top:8px"><span class="esp"></span><button class="btn" data-f="fechar">Fechar</button></div></div>`;
    document.body.appendChild(fundo);
    const q = fundo.querySelector('#ex-q'), msg = fundo.querySelector('#ex-msg');
    const escolhidos = () => q.value === 'aprovados' ? aprov : q.value === 'todos' ? todos : filtr;
    const nota = () => { const l = escolhidos(), sem = l.filter(b => !comCoord(b)).length; fundo.querySelector('#ex-n').textContent = `${l.length} bueiro(s)` + (sem ? ` · ${sem} sem coordenadas (ficam de fora dos formatos de mapa)` : ''); };
    q.onchange = nota; nota();
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', async e => {
      if (e.target === fundo) return fechar();
      const b = e.target.closest('[data-f]'); if (!b) return;
      if (b.dataset.f === 'fechar') return fechar();
      const sel = escolhidos(); if (!sel.length) { msg.textContent = 'Nada para exportar com esse filtro.'; return; }
      fundo.querySelectorAll('button').forEach(x => { x.disabled = true; }); msg.textContent = 'Preparando…';
      try {
        const completos = await ctx.D.bueirosCompletos(ctx.projeto.id, sel.map(x => x.id));
        const lista = completos.sort((a, b2) => String(a.codigo).localeCompare(String(b2.codigo), 'pt', { numeric: true }));
        await gerar(b.dataset.f, lista, ctx, { fotos: fundo.querySelector('#ex-fotos').checked });
        msg.innerHTML = '<span style="color:var(--st-aprovado,#1b7f4b);font-weight:700">Pronto: arquivo baixado.</span>';
      } catch (er) { console.error(er); msg.innerHTML = `<span style="color:#b42318">Não foi possível gerar: ${esc(er.message || er)}</span>`; }
      fundo.querySelectorAll('button').forEach(x => { x.disabled = false; });
    });
  }

  window.Exportacao = { abrir, gerar, shapefile, geojson, kml, csvTxt, zip, geopackage, CAMPOS };
})();
