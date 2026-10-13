/* codigo.js — quilometragem e código do bueiro (rodovia + km + metros). Expõe BU.Codigo.
   Usado pelo app de campo e pelo painel de gestão. Exemplo: rodovia "RJ-000", 170 km e 470 m  ->  "RJ-000 km 170+470". */
(function () {
  'use strict';
  const BU = (window.BU = window.BU || {});

  /* "170+470" | "170 + 47" | "170,47" | "170.5" | "170" -> metros totais (170470, 170470, 170470, 170500, 170000); inválido -> null */
  function kmParaMetros(txt) {
    let s = String(txt == null ? '' : txt).trim().toLowerCase().replace(/^km\s*/, '').replace(/\s+/g, '');
    if (!s) return null;
    let m = s.match(/^(\d{1,4})\+(\d{1,3})$/);
    if (m) return +m[1] * 1000 + Math.min(999, +m[2].padEnd(3, '0'));
    m = s.match(/^(\d{1,4})(?:[.,](\d{1,3}))?$/);
    if (m) return +m[1] * 1000 + (m[2] ? +m[2].padEnd(3, '0') : 0);
    return null;
  }
  /* metros totais -> "170+470" (km com 3 dígitos no mínimo: "001+470") */
  function metrosParaKm(metros) {
    if (metros == null || !isFinite(metros)) return '';
    const t = Math.max(0, Math.round(metros));
    return String(Math.floor(t / 1000)).padStart(3, '0') + '+' + String(t % 1000).padStart(3, '0');
  }
  /* Código do bueiro: rodovia + km + metros. Sem km, devolve '' (não inventa). */
  function codigo(rodovia, metros) {
    const km = typeof metros === 'number' ? metrosParaKm(metros) : metrosParaKm(kmParaMetros(metros));
    if (!km) return '';
    const r = String(rodovia || '').trim();
    return (r ? r + ' ' : '') + 'km ' + km;
  }
  BU.Codigo = { kmParaMetros, metrosParaKm, codigo };
})();
