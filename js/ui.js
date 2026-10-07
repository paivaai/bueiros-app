/* ui.js — utilidades e componentes simples (toast, confirmação). Expõe BU.U e BU.UI. */
(function () {
  'use strict';
  const BU = (window.BU = window.BU || {});

  /* ---------- utilidades ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const p2 = n => String(n).padStart(2, '0');

  function uid() {
    const c = window.crypto;
    if (c && c.randomUUID) { try { return c.randomUUID(); } catch (e) { /* contexto inseguro */ } }
    const b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0;
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => p2(x.toString(16))).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  const agoraISO = () => new Date().toISOString();
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  const horaAgora = () => { const d = new Date(); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  function dataBR(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
  function dataHoraBR(iso) {
    if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return '';
    return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function stamp() { const d = new Date(); return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`; }

  /* Aceita "1,25" ou "1.25". Retorna número ou null (inválido/vazio). */
  function parseNum(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  const numTxt = v => (v == null || v === '') ? '' : String(v).replace('.', ',');

  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.'); let x = o;
    for (let i = 0; i < ks.length - 1; i++) { if (x[ks[i]] == null) x[ks[i]] = {}; x = x[ks[i]]; }
    x[ks[ks.length - 1]] = v;
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg, tipo) {
    const el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg; el.className = 'toast' + (tipo ? ' ' + tipo : ''); el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, tipo === 'erro' ? 5000 : 2800);
  }

  /* ---------- confirmação (substitui window.confirm) ---------- */
  function confirmar(msg, { titulo = 'Confirmar', ok = 'Confirmar', cancelar = 'Cancelar', perigo = false } = {}) {
    return new Promise(resolve => {
      const back = document.getElementById('modal');
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-t">
        <h2 id="m-t">${esc(titulo)}</h2><p>${esc(msg)}</p>
        <div class="row"><button type="button" class="btn" data-m="n">${esc(cancelar)}</button>
        <button type="button" class="btn ${perigo ? 'danger-fill' : 'primary'}" data-m="s">${esc(ok)}</button></div></div>`;
      back.hidden = false;
      const fim = r => { back.hidden = true; back.innerHTML = ''; document.removeEventListener('keydown', tecla); resolve(r); };
      const tecla = e => { if (e.key === 'Escape') fim(false); };
      back.onclick = e => { const b = e.target.closest('[data-m]'); if (b) fim(b.dataset.m === 's'); else if (e.target === back) fim(false); };
      document.addEventListener('keydown', tecla);
      const f = back.querySelector('[data-m="n"]'); if (f) f.focus();
    });
  }


  /* ---------- diálogo com vários botões ---------- */
  function escolher(titulo, corpoHTML, botoes) {
    return new Promise(resolve => {
      const back = document.getElementById('modal');
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>${esc(titulo)}</h2>
        <div class="modal-corpo">${corpoHTML}</div>
        <div class="col">${botoes.map(b => `<button type="button" class="btn ${b.cls || ''}" data-m="${esc(b.k)}">${esc(b.label)}</button>`).join('')}</div></div>`;
      back.hidden = false;
      const fim = r => { back.hidden = true; back.innerHTML = ''; document.removeEventListener('keydown', tecla); resolve(r); };
      const tecla = e => { if (e.key === 'Escape') fim(null); };
      back.onclick = e => { const b = e.target.closest('[data-m]'); if (b) fim(b.dataset.m); else if (e.target === back) fim(null); };
      document.addEventListener('keydown', tecla);
    });
  }

  /* ---------- pedir um texto (substitui window.prompt) ---------- */
  function pedir(titulo, { valor = '', ph = '' } = {}) {
    return new Promise(resolve => {
      const back = document.getElementById('modal');
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>${esc(titulo)}</h2>
        <input id="m-in" type="text" autocomplete="off" value="${esc(valor)}" placeholder="${esc(ph)}">
        <div class="row"><button type="button" class="btn" data-m="n">Cancelar</button><button type="button" class="btn primary" data-m="s">OK</button></div></div>`;
      back.hidden = false;
      const inp = back.querySelector('#m-in');
      const fim = ok => { const v = inp.value.trim(); back.hidden = true; back.innerHTML = ''; document.removeEventListener('keydown', tecla); resolve(ok && v ? v : null); };
      const tecla = e => { if (e.key === 'Escape') fim(false); else if (e.key === 'Enter') fim(true); };
      back.onclick = e => { const b = e.target.closest('[data-m]'); if (b) fim(b.dataset.m === 's'); else if (e.target === back) fim(false); };
      document.addEventListener('keydown', tecla);
      setTimeout(() => inp.focus(), 50);
    });
  }

  /* ---------- baixar um arquivo gerado no aparelho ---------- */
  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  const nomeArquivo = s => String(s || 'levantamento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'levantamento';

  BU.U = { esc, clone, uid, agoraISO, hojeISO, horaAgora, dataBR, dataHoraBR, stamp, parseNum, numTxt, getPath, setPath, baixar, nomeArquivo };
  BU.UI = { toast, confirmar, escolher, pedir };
})();
