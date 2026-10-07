/* db.js — armazenamento local (IndexedDB). Expõe BU.DB.
   Banco novo ("levantamento-bueiros"); não interfere no banco do HTML antigo ("cadastro-bueiros").
   Já cria a store "fotos" e "config" para não precisar subir a versão do banco nas próximas fases. */
(function () {
  'use strict';
  const BU = (window.BU = window.BU || {});
  const clone = o => JSON.parse(JSON.stringify(o));

  const NOME = 'levantamento-bueiros';
  const VERSAO = 1;
  const LEV = 'levantamentos', FOTOS = 'fotos', CFG = 'config';

  let idb = null;
  const mem = { [LEV]: new Map(), [FOTOS]: new Map(), [CFG]: new Map() }; // reserva se IndexedDB falhar

  function abrir() {
    return new Promise(resolve => {
      if (!('indexedDB' in window)) { resolve(false); return; }
      let req, encerrado = false;
      const fim = ok => { if (!encerrado) { encerrado = true; resolve(ok); } };
      try { req = indexedDB.open(NOME, VERSAO); } catch (e) { fim(false); return; }
      const t = setTimeout(() => fim(false), 5000);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(LEV)) d.createObjectStore(LEV, { keyPath: 'id' }).createIndex('atualizadoEm', 'atualizadoEm');
        if (!d.objectStoreNames.contains(FOTOS)) d.createObjectStore(FOTOS, { keyPath: 'id' }).createIndex('levantamentoId', 'levantamentoId');
        if (!d.objectStoreNames.contains(CFG)) d.createObjectStore(CFG, { keyPath: 'chave' });
      };
      req.onsuccess = () => {
        clearTimeout(t);
        if (encerrado) { req.result.close(); return; }
        idb = req.result;
        idb.onversionchange = () => idb.close();
        fim(true);
      };
      req.onerror = () => { clearTimeout(t); fim(false); };
      req.onblocked = () => { clearTimeout(t); fim(false); };
    });
  }

  function tx(stores, modo, fn) {
    return new Promise((res, rej) => {
      const t = idb.transaction(stores, modo);
      let r; try { r = fn(t); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transação abortada'));
    });
  }

  const api = {
    ok: false,

    async iniciar() {
      this.ok = await abrir();
      // Pede ao navegador para não apagar os dados sozinho (ajuda no Android e iOS).
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignora */ }
      return this.ok;
    },

    /* Todos os levantamentos, do mais recente para o mais antigo. */
    async listar() {
      const todos = idb ? await tx(LEV, 'readonly', t => t.objectStore(LEV).getAll()) : [...mem[LEV].values()].map(clone);
      return todos.sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
    },

    async obter(id) {
      if (!idb) { const r = mem[LEV].get(id); return r ? clone(r) : null; }
      const r = await tx(LEV, 'readonly', t => t.objectStore(LEV).get(id));
      return r || null;
    },

    /* O clone é feito antes de qualquer espera: edições feitas durante a gravação não "vazam" para ela. */
    async salvar(rec) {
      const c = clone(rec);
      if (!idb) { mem[LEV].set(c.id, c); return; }
      await tx(LEV, 'readwrite', t => t.objectStore(LEV).put(c));
    },

    /* Grava vários levantamentos de uma vez, em uma única transação (usado na importação do cadastro). */
    async salvarVarios(lista) {
      const cs = lista.map(clone);
      if (!idb) { cs.forEach(c => mem[LEV].set(c.id, c)); return; }
      await tx(LEV, 'readwrite', t => { const s = t.objectStore(LEV); let r; for (const c of cs) r = s.put(c); return r; });
    },

    /* Exclui o levantamento e as fotos ligadas a ele. */
    async excluir(id) {
      if (!idb) { mem[LEV].delete(id); for (const [k, f] of mem[FOTOS]) if (f.levantamentoId === id) mem[FOTOS].delete(k); return; }
      await new Promise((res, rej) => {
        const t = idb.transaction([LEV, FOTOS], 'readwrite');
        t.objectStore(LEV).delete(id);
        const fs = t.objectStore(FOTOS);
        const cur = fs.index('levantamentoId').openKeyCursor(IDBKeyRange.only(id));
        cur.onsuccess = () => { const c = cur.result; if (c) { fs.delete(c.primaryKey); c.continue(); } };
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transação abortada'));
      });
    },

    /* ---- fotos (blob em store própria, ligada ao levantamento) ---- */
    async salvarFoto(f) {
      if (!idb) { mem[FOTOS].set(f.id, f); return; }
      await tx(FOTOS, 'readwrite', t => t.objectStore(FOTOS).put(f));
    },
    async obterFoto(id) {
      if (!idb) return mem[FOTOS].get(id) || null;
      return (await tx(FOTOS, 'readonly', t => t.objectStore(FOTOS).get(id))) || null;
    },
    async excluirFoto(id) {
      if (!idb) { mem[FOTOS].delete(id); return; }
      await tx(FOTOS, 'readwrite', t => t.objectStore(FOTOS).delete(id));
    },

    /* ---- configurações do aparelho (ex.: códigos de pontos cadastrados) ---- */
    async cfgObter(chave) {
      if (!idb) { const r = mem[CFG].get(chave); return r ? r.valor : null; }
      const r = await tx(CFG, 'readonly', t => t.objectStore(CFG).get(chave));
      return r ? r.valor : null;
    },
    async cfgSalvar(chave, valor) {
      const r = { chave, valor: clone(valor) };
      if (!idb) { mem[CFG].set(chave, r); return; }
      await tx(CFG, 'readwrite', t => t.objectStore(CFG).put(r));
    },
  };

  BU.DB = api;
})();
