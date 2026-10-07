/* photos.js — fotos do levantamento: câmera/galeria, redução para 1600 px, JPEG, legenda e categoria.
   O arquivo da foto fica na store "fotos" (IndexedDB); em l.fotos ficam só os dados (id, categoria, legenda, data). */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, DB = BU.DB, esc = U.esc;

  const MAX = 1600, QUALIDADE = 0.82;
  const CATEGORIAS = [['', '— classificar —'], ['entrada', 'Entrada'], ['saida', 'Saída'], ['secao', 'Seção'], ['erosao', 'Erosão'], ['obstrucao', 'Obstrução'], ['outro', 'Outro']];
  const urls = new Map(); // id -> blob URL (miniaturas)

  async function reduzir(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((ok, er) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); er(new Error('Imagem inválida')); }; im.src = u; });
    }
    const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, MAX / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k), cv = document.createElement('canvas');
    cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', QUALIDADE));
    if (!blob) throw new Error('Não foi possível comprimir a imagem');
    return { blob, w, h };
  }

  async function adicionar(files, daCamera) {
    const App = BU.App, l = App.cur(), st = document.getElementById('fo-status'); if (!l) return;
    let n = 0;
    for (const f of files) {
      n++; if (st) st.textContent = `Processando foto ${n} de ${files.length}…`;
      try {
        const r = await reduzir(f), id = U.uid();
        await DB.salvarFoto({ id, levantamentoId: l.id, tipo: 'image/jpeg', blob: r.blob, criadoEm: U.agoraISO() });
        const quando = (!daCamera && f.lastModified) ? new Date(f.lastModified) : new Date();
        l.fotos.push({ id, categoria: '', legenda: '', dataHora: quando.toISOString(), w: r.w, h: r.h, bytes: r.blob.size });
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
      if (blob) adicionar([new File([blob], 'camera.jpg', { type: 'image/jpeg' })], true);
      else UI.toast('Não foi possível capturar a imagem', 'erro');
    }
  });

  function cartao(f, i) {
    return `<article class="card foto" data-id="${esc(f.id)}">
      <img class="thumb" data-foid="${esc(f.id)}" alt="Foto ${i + 1}" width="${f.w || 160}" height="${f.h || 120}">
      <div class="foto-corpo">
        <select data-fo="cat" aria-label="Categoria">${CATEGORIAS.map(([v, t]) => `<option value="${v}"${v === f.categoria ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <input type="text" data-fo="leg" value="${esc(f.legenda)}" placeholder="Legenda" aria-label="Legenda">
        <div class="muted small">${esc(U.dataHoraBR(f.dataHora))} · ${Math.round((f.bytes || 0) / 1024)} KB</div>
        <div class="row"><button type="button" class="btn sm" data-fo="ver">Ampliar</button><button type="button" class="btn sm" data-fo="baixar">Baixar</button><button type="button" class="btn sm danger" data-fo="excluir">Excluir</button></div>
      </div></article>`;
  }

  function etapaHTML(l) {
    const App = BU.App;
    return `<div class="card"><h3>Classificar o bueiro</h3>
        <div class="grid">${App.campoHTML({ p: 'caracteristicas.tipo', label: 'Tipo de bueiro', t: 'select', opts: ['Tubular', 'Celular', 'Aduela', 'Galeria', 'Outro'] })}
        ${App.campoHTML({ p: 'caracteristicas.formato', label: 'Formato da seção', t: 'select', opts: BU.Secao.FORMATOS })}</div></div>
      <div class="card"><b>${l.fotos.length} foto(s)</b>
        <div class="row" style="margin-top:10px"><button type="button" class="btn primary" data-fo="camera">📷 Tirar foto</button><button type="button" class="btn" data-fo="galeria">🖼️ Galeria</button></div>
        <button type="button" class="btn sm" data-fo="camera-ao-vivo" style="margin-top:8px;width:100%">Usar câmera ao vivo (webcam)</button>
        <input type="file" id="fo-cam" accept="image/*" capture="environment" hidden>
        <input type="file" id="fo-gal" accept="image/*" multiple hidden>
        <div id="fo-status" class="gps-status" role="status"></div>
        <p class="muted small">As fotos são reduzidas para no máximo 1600 px e ficam só neste aparelho.</p></div>
      <div id="fo-lista" class="lista-pt">${l.fotos.map(cartao).join('') || '<div class="card vazio">Nenhuma foto adicionada.</div>'}</div>`;
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
    const b = e.target.closest('[data-fo]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    const App = BU.App, l = App.cur(); if (!l) return;
    const a = b.dataset.fo, card = b.closest('[data-id]'), f = card ? l.fotos.find(x => x.id === card.dataset.id) : null;
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
    if (el.id === 'fo-cam' || el.id === 'fo-gal') { const fs = [...(el.files || [])]; el.value = ''; if (fs.length) adicionar(fs, el.id === 'fo-cam'); return; }
    if (!el.dataset.fo) return;
    const f = l.fotos.find(x => x.id === (el.closest('[data-id]') || {}).dataset?.id); if (!f) return;
    if (el.dataset.fo === 'cat') f.categoria = el.value; else if (el.dataset.fo === 'leg') f.legenda = el.value; else return;
    BU.App.marcarSujo();
  }
  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);

  BU.Fotos = { etapaHTML, aposRender, limpar };
})();
