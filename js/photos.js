/* photos.js — fotos do levantamento: câmera/galeria, redução para 1600 px, JPEG, legenda e categoria.
   O arquivo da foto fica na store "fotos" (IndexedDB); em l.fotos ficam só os dados (id, categoria, legenda, data). */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, DB = BU.DB, esc = U.esc;

  const MAX = 1600, QUALIDADE = 0.82;
  const CATEGORIAS = [['', '— classificar —'], ['entrada', 'Entrada'], ['saida', 'Saída'], ['secao', 'Seção'], ['erosao', 'Erosão'], ['obstrucao', 'Obstrução'], ['patologia', 'Patologia'], ['outro', 'Outro']];
  let ctxPend = ''; // contexto da próxima foto: '' = geral, 'secao', 'pat:<id da patologia>'
  const urls = new Map(); // id -> blob URL (miniaturas)

  /* ---------- marca d'água (logo da empresa) e coordenadas UTM ---------- */
  const CFG = { ativo: true, logo: '' };
  let logoImg = null;
  async function iniciar() {
    let v = null;
    try { v = await DB.cfgObter('fotoMarca'); } catch (e) { /* segue com o padrão */ }
    if (v && typeof v === 'object') { CFG.ativo = v.ativo !== false; CFG.logo = v.logo || ''; }
    else CFG.logo = await logoPadrao(); // nunca configurado: usa a logo da GFA que vai junto com o app
    BU.Prancha.setLogo(CFG.logo); logoImg = null;
  }
  async function logoPadrao() {
    try {
      const r = await fetch('assets/logo-gfa.png'); if (!r.ok) return '';
      const b = await r.blob();
      return await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => ok(''); fr.readAsDataURL(b); });
    } catch (e) { return ''; }
  }
  async function salvarCfg() {
    try { await DB.cfgSalvar('fotoMarca', { ativo: CFG.ativo, logo: CFG.logo }); } catch (e) { UI.toast('Não foi possível guardar a logo neste aparelho', 'aviso'); }
    BU.Prancha.setLogo(CFG.logo); logoImg = null;
  }
  async function carregarLogo() {
    if (!CFG.logo) return null;
    if (logoImg) return logoImg;
    logoImg = await new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = CFG.logo; });
    return logoImg;
  }
  /* Logo enviada: reduz para no máximo 600 px e guarda como PNG (mantém transparência). */
  async function lerLogo(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (e) { bmp = await new Promise((ok, er) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); er(new Error('Imagem inválida')); }; im.src = u; }); }
    const k = Math.min(1, 600 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    return cv.toDataURL('image/png');
  }
  const caixaArred = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  async function carimbar(cv, l, quando) {
    const c = cv.getContext('2d'), w = cv.width, h = cv.height, u = BU.GPS.utmDe(l), fs = Math.max(12, Math.round(Math.min(w, h) * 0.027)), m = Math.round(fs * 0.6);
    const F = BU.GPS.fmtM, linhas = [];
    if (u) { linhas.push(`E ${F(u.E, 3)}   N ${F(u.N, 3)}${u.Z != null ? '   Z ' + F(u.Z, 3) : ''}`, BU.GPS.rotuloUTM(u)); }
    else linhas.push('Coordenadas UTM não informadas');
    linhas.push([l.codigo, U.dataHoraBR(quando.toISOString())].filter(Boolean).join('  ·  '));
    c.font = `600 ${fs}px Arial, Helvetica, sans-serif`; c.textBaseline = 'top';
    const lh = Math.round(fs * 1.3), tw = Math.min(w - 2 * m, Math.max(...linhas.map(t => c.measureText(t).width)) + 2 * m), th = linhas.length * lh + m;
    c.fillStyle = 'rgba(0,0,0,.58)'; c.fillRect(0, h - th - m, tw + m, th + m);
    c.fillStyle = '#fff';
    linhas.forEach((t, i) => c.fillText(t, m, h - th - m + Math.round(m / 2) + i * lh, w - 2 * m));
    const im = await carregarLogo();
    if (im) {
      const k = Math.min(w * 0.24 / im.width, h * 0.16 / im.height), lw = Math.round(im.width * k), lh2 = Math.round(im.height * k), p = Math.round(fs * 0.4);
      c.globalAlpha = 0.72; c.fillStyle = '#fff'; caixaArred(c, w - lw - 2 * p - m, h - lh2 - 2 * p - m, lw + 2 * p, lh2 + 2 * p, p); c.fill();
      c.globalAlpha = 0.9; c.drawImage(im, w - lw - p - m, h - lh2 - p - m, lw, lh2); c.globalAlpha = 1;
    }
  }

  async function reduzir(file, l, quando) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((ok, er) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); er(new Error('Imagem inválida')); }; im.src = u; });
    }
    const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, MAX / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k), cv = document.createElement('canvas');
    cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    if (CFG.ativo && l) { try { await carimbar(cv, l, quando || new Date()); } catch (e) { console.error(e); } }
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', QUALIDADE));
    if (!blob) throw new Error('Não foi possível comprimir a imagem');
    return { blob, w, h };
  }

  async function adicionar(files, daCamera, ctx) {
    ctx = ctx || '';
    const App = BU.App, l = App.cur(), st = document.getElementById('fo-status'); if (!l) return;
    let n = 0;
    if (CFG.ativo && !BU.GPS.utmDe(l)) UI.toast('Coordenadas UTM não informadas (Etapa 2): as fotos ficam só com a logo.', 'aviso');
    for (const f of files) {
      n++; if (st) st.textContent = `Processando foto ${n} de ${files.length}…`;
      try {
        const quando = (!daCamera && f.lastModified) ? new Date(f.lastModified) : new Date();
        const r = await reduzir(f, l, quando), id = U.uid();
        await DB.salvarFoto({ id, levantamentoId: l.id, tipo: 'image/jpeg', blob: r.blob, criadoEm: U.agoraISO() });
        l.fotos.push({ id, categoria: ctx === 'secao' ? 'secao' : ctx.startsWith('pat:') ? 'patologia' : '', ctx, legenda: '', dataHora: quando.toISOString(), w: r.w, h: r.h, bytes: r.blob.size });
        App.marcarSujo();
      } catch (e) {
        UI.toast('Erro na foto: ' + (e && e.message || e) + (e && e.name === 'QuotaExceededError' ? ' (armazenamento cheio)' : ''), 'erro');
      }
    }
    if (App.cur() === l) App.renderEtapa();
  }

  /* ---------- câmera ao vivo (webcam do PC ou câmera do celular) ---------- */
  let cam = null; // { stream, overlay, facing }
  function fecharCamera() {
    if (!cam) return;
    cam.stream.getTracks().forEach(t => t.stop()); cam.overlay.remove();
    document.removeEventListener('keydown', teclaCam); cam = null;
  }
  const teclaCam = e => { if (e.key === 'Escape') fecharCamera(); };
  async function iniciarStream(facing) {
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  }
  async function abrirCamera() {
    const usarSistema = () => document.getElementById('fo-cam').click();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { UI.toast('Câmera ao vivo indisponível aqui. Abrindo o seletor.', 'aviso'); usarSistema(); return; }
    let stream;
    try { stream = await iniciarStream('environment'); }
    catch (e) {
      UI.toast(e && e.name === 'NotAllowedError' ? 'Permissão da câmera negada. Libere no cadeado do endereço (Permissões > Câmera).' : 'Nenhuma câmera encontrada. Abrindo o seletor de arquivos.', 'aviso');
      usarSistema(); return;
    }
    const overlay = document.createElement('div'); overlay.className = 'cam-overlay';
    overlay.innerHTML = `<video playsinline autoplay muted></video>
      <div class="cam-bar"><button type="button" class="btn" data-cam="fechar">Fechar</button>
      <button type="button" class="btn primary cam-shot" data-cam="foto" aria-label="Tirar foto">📷 Tirar foto</button>
      <button type="button" class="btn" data-cam="trocar">Trocar</button></div>`;
    document.body.appendChild(overlay);
    const v = overlay.querySelector('video'); v.srcObject = stream; v.play().catch(() => {});
    cam = { stream, overlay, facing: 'environment' };
    document.addEventListener('keydown', teclaCam);
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-cam]'); if (!b || !cam) return;
    const a = b.dataset.cam;
    if (a === 'fechar') fecharCamera();
    else if (a === 'trocar') {
      const novo = cam.facing === 'environment' ? 'user' : 'environment';
      try { const s2 = await iniciarStream(novo); cam.stream.getTracks().forEach(t => t.stop()); cam.stream = s2; cam.facing = novo; cam.overlay.querySelector('video').srcObject = s2; }
      catch (err) { UI.toast('Não foi possível trocar de câmera', 'aviso'); }
    } else if (a === 'foto') {
      const v = cam.overlay.querySelector('video');
      if (!v.videoWidth) { UI.toast('Aguarde a câmera abrir', 'aviso'); return; }
      const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
      cv.getContext('2d').drawImage(v, 0, 0);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
      fecharCamera();
      if (blob) adicionar([new File([blob], 'camera.jpg', { type: 'image/jpeg' })], true, ctxPend);
      else UI.toast('Não foi possível capturar a imagem', 'erro');
    }
  });

  function cartao(f, i, compacto) {
    return `<article class="card foto" data-id="${esc(f.id)}">
      <img class="thumb" data-foid="${esc(f.id)}" alt="Foto ${i + 1}" width="${f.w || 160}" height="${f.h || 120}">
      <div class="foto-corpo">
        ${compacto ? '' : `<select data-fo="cat" aria-label="Categoria">${CATEGORIAS.map(([v, t]) => `<option value="${v}"${v === f.categoria ? ' selected' : ''}>${t}</option>`).join('')}</select>`}
        <input type="text" data-fo="leg" value="${esc(f.legenda)}" placeholder="Legenda" aria-label="Legenda">
        <div class="muted small">${esc(U.dataHoraBR(f.dataHora))} · ${Math.round((f.bytes || 0) / 1024)} KB</div>
        <div class="row"><button type="button" class="btn sm" data-fo="ver">Ampliar</button><button type="button" class="btn sm" data-fo="baixar">Baixar</button><button type="button" class="btn sm danger" data-fo="excluir">Excluir</button></div>
      </div></article>`;
  }

  /* Entradas de arquivo (câmera e galeria) e a linha de status: uma vez por etapa que tem fotos. */
  function entradasHTML() {
    return `<input type="file" id="fo-cam" accept="image/*" capture="environment" hidden>
        <input type="file" id="fo-gal" accept="image/*" multiple hidden>
        <div id="fo-status" class="gps-status" role="status"></div>`;
  }
  /* Bloco de fotos de um contexto: '' (gerais), 'secao' ou 'pat:<id>'. Botões + miniaturas. */
  function blocoHTML(l, ctx, titulo, opc) {
    opc = opc || {}; ctx = ctx || '';
    const lista = l.fotos.filter(f => (f.ctx || '') === ctx);
    const ao = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    return `<div class="card foto-bloco" data-ctxbloco="${esc(ctx)}"><div class="linha-t"><b>${esc(titulo || 'Fotos')}</b> <span class="muted small">${lista.length} foto(s)</span></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn primary" data-fo="camera" data-ctx="${esc(ctx)}">📷 Tirar foto</button><button type="button" class="btn" data-fo="galeria" data-ctx="${esc(ctx)}">🖼️ Galeria</button>${ao ? '' : `<button type="button" class="btn sm" data-fo="camera-ao-vivo" data-ctx="${esc(ctx)}">Webcam</button>`}</div>
        ${opc.entradas ? entradasHTML() : ''}
        ${lista.length ? `<div class="lista-pt">${lista.map((f, i) => cartao(f, i, true)).join('')}</div>` : ''}</div>`;
  }

  function etapaHTML(l) {
    const u = BU.GPS.utmDe(l);
    const nSec = l.fotos.filter(f => f.ctx === 'secao').length, nPat = l.fotos.filter(f => (f.ctx || '').startsWith('pat:')).length;
    return blocoHTML(l, '', 'Fotos gerais do bueiro', { entradas: true })
      + `<p class="muted small" style="margin:0 4px">As fotos são reduzidas para no máximo 1600 px e ficam só neste aparelho. Fotos da seção (${nSec}) e das patologias (${nPat}) são tiradas nas etapas Seção e Patologias.</p>
      <div class="card marca"><h3>Marca d'água e coordenadas</h3>
        <label class="chk"><input type="checkbox" data-fm="ativo"${CFG.ativo ? ' checked' : ''}> Estampar a logo e as coordenadas UTM nas fotos novas</label>
        <div class="logo-linha">${CFG.logo ? `<img class="logo-prev" src="${esc(CFG.logo)}" alt="Logo da empresa">` : '<span class="muted small">Nenhuma logo enviada.</span>'}
          <button type="button" class="btn sm" data-fm="logo">${CFG.logo ? 'Trocar logo' : 'Enviar logo'}</button>${CFG.logo ? '<button type="button" class="btn sm danger" data-fm="logo-remover">Remover</button>' : ''}</div>
        <input type="file" id="fo-logo" accept="image/*" hidden>
        <p class="muted small">${u ? `Coordenadas da Etapa 2: E ${esc(BU.GPS.fmtM(u.E, 3))} · N ${esc(BU.GPS.fmtM(u.N, 3))} · ${esc(BU.GPS.rotuloUTM(u))}.` : '<b>Coordenadas UTM ainda não informadas na Etapa 2:</b> as fotos saem só com a logo.'} A marca fica gravada na foto e vale só para as fotos tiradas depois.</p></div>`;
  }

  async function aposRender() {
    const l = BU.App.cur(); if (!l) return;
    for (const im of document.querySelectorAll('img[data-foid]')) {
      const id = im.dataset.foid;
      try {
        if (!urls.has(id)) { const r = await DB.obterFoto(id); if (!r) continue; urls.set(id, URL.createObjectURL(r.blob)); }
        im.src = urls.get(id);
      } catch (e) { /* miniatura indisponível */ }
    }
  }
  function limpar() { urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); }

  document.addEventListener('click', async e => {
    const fm = e.target.closest('[data-fm]');
    if (fm && fm.tagName === 'BUTTON') {
      if (fm.dataset.fm === 'logo') document.getElementById('fo-logo').click();
      else if (fm.dataset.fm === 'logo-remover') { CFG.logo = ''; await salvarCfg(); BU.App.renderEtapa(); }
      return;
    }
    const b = e.target.closest('[data-fo]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    const App = BU.App, l = App.cur(); if (!l) return;
    const a = b.dataset.fo, card = b.closest('[data-id]'), f = card ? l.fotos.find(x => x.id === card.dataset.id) : null;
    if (['camera', 'galeria', 'camera-ao-vivo'].includes(a)) ctxPend = b.dataset.ctx || '';
    if (a === 'camera') {
      // celular: abre o app de câmera do aparelho (melhor qualidade); computador: câmera ao vivo no app
      if (window.matchMedia && matchMedia('(pointer: coarse)').matches) document.getElementById('fo-cam').click(); else abrirCamera();
    }
    else if (a === 'galeria') document.getElementById('fo-gal').click();
    else if (a === 'camera-ao-vivo') abrirCamera();
    else if (a === 'ver' && f) {
      if (!urls.has(f.id)) await aposRender();
      await UI.escolher(f.legenda || 'Foto', `<img class="foto-grande" src="${urls.get(f.id) || ''}" alt="">`, [{ k: 'x', label: 'Fechar', cls: 'primary' }]);
    }
    else if (a === 'baixar' && f) { const r = await DB.obterFoto(f.id); if (r) U.baixar(r.blob, `FOTO-${U.nomeArquivo(l.codigo)}-${f.categoria || 'foto'}-${f.id.slice(0, 6)}.jpg`); }
    else if (a === 'excluir' && f) {
      if (!(await UI.confirmar('Excluir esta foto? Esta ação não pode ser desfeita.', { titulo: 'Excluir foto', ok: 'Excluir', perigo: true }))) return;
      try { await DB.excluirFoto(f.id); } catch (err) { UI.toast('Erro ao excluir foto', 'erro'); return; }
      if (urls.has(f.id)) { URL.revokeObjectURL(urls.get(f.id)); urls.delete(f.id); }
      l.fotos = l.fotos.filter(x => x.id !== f.id); App.marcarSujo(); App.renderEtapa();
    }
  });
  function aoMudar(e) {
    const el = e.target, l = BU.App.cur(); if (!l) return;
    if (el.dataset && el.dataset.fm === 'ativo') { if (e.type === 'change') { CFG.ativo = el.checked; salvarCfg(); } return; }
    if (el.id === 'fo-logo') {
      if (e.type !== 'change') return;
      const f = el.files && el.files[0]; el.value = ''; if (!f) return;
      lerLogo(f).then(async d => { CFG.logo = d; await salvarCfg(); BU.App.renderEtapa(); UI.toast('Logo guardada'); }).catch(err => UI.toast('Não foi possível ler a logo: ' + (err && err.message || err), 'erro'));
      return;
    }
    if (el.id === 'fo-cam' || el.id === 'fo-gal') { const fs = [...(el.files || [])]; el.value = ''; if (fs.length) adicionar(fs, el.id === 'fo-cam', ctxPend); return; }
    if (!el.dataset.fo) return;
    const f = l.fotos.find(x => x.id === (el.closest('[data-id]') || {}).dataset?.id); if (!f) return;
    if (el.dataset.fo === 'cat') f.categoria = el.value; else if (el.dataset.fo === 'leg') f.legenda = el.value; else return;
    BU.App.marcarSujo();
  }
  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);

  BU.Fotos = { iniciar, etapaHTML, blocoHTML, entradasHTML, aposRender, limpar };
})();
