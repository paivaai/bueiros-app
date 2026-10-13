/* db.js — armazenamento local (IndexedDB). Expõe BU.DB.
   Banco novo ("levantamento-bueiros"); não interfere no banco do HTML antigo ("cadastro-bueiros").
   Já cria a store "fotos" e "config" para não precisar subir a versão do banco nas próximas fases. */
(function () {
  'use strict';
  const BU = (window.BU = window.BU || {});
  const clone = o => JSON.parse(JSON.stringify(o));

  const NOME = 'levantamento-bueiros';
  const VERSAO = 2;
  const LEV = 'levantamentos', FOTOS = 'fotos', CFG = 'config', SINC = 'sinc';

  let idb = null;
  const mem = { [LEV]: new Map(), [FOTOS]: new Map(), [CFG]: new Map(), [SINC]: new Map() }; // reserva se IndexedDB falhar

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
        if (!d.objectStoreNames.contains(SINC)) d.createObjectStore(SINC, { keyPath: 'id' }); // controle de sincronização: um registro por levantamento
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

    /* O clone é feito antes de qualquer espera: edições feitas durante a gravação não "vazam" para ela.
       Todo salvamento marca o levantamento como "a enviar" (sinc.sujo) e sobe sinc.rev; quem sincroniza só limpa a marca se o rev não mudou. */
    async salvar(rec, opc) { return this.salvarVarios([rec], opc); },

    /* Grava vários levantamentos de uma vez, em uma única transação (usado na importação do cadastro).
       opc.doServidor = meta: gravação vinda da sincronização (não marca "a enviar"; usa o meta informado). */
    async salvarVarios(lista, opc) {
      const cs = lista.map(clone), serv = opc && opc.doServidor;
      const marca = (m, id) => serv ? { ...(m || {}), id, ...serv(id), sujo: false, rev: (m && m.rev) || 0 } : { ...(m || {}), id, sujo: true, rev: ((m && m.rev) || 0) + 1 };
      if (!idb) { cs.forEach(c => { mem[LEV].set(c.id, c); mem[SINC].set(c.id, marca(mem[SINC].get(c.id), c.id)); }); return; }
      await new Promise((res, rej) => {
        const t = idb.transaction([LEV, SINC], 'readwrite'), L = t.objectStore(LEV), S = t.objectStore(SINC);
        for (const c of cs) {
          L.put(c);
          const g = S.get(c.id);
          g.onsuccess = () => S.put(marca(g.result, c.id));
        }
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transação abortada'));
      });
    },

    /* Exclui o levantamento e as fotos ligadas a ele. */
    async excluir(id) {
      if (!idb) { mem[LEV].delete(id); mem[SINC].delete(id); for (const [k, f] of mem[FOTOS]) if (f.levantamentoId === id) mem[FOTOS].delete(k); return; }
      await new Promise((res, rej) => {
        const t = idb.transaction([LEV, FOTOS, SINC], 'readwrite');
        t.objectStore(LEV).delete(id); t.objectStore(SINC).delete(id);
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

    /* ---- controle de sincronização ---- */
    async sincListar() {
      if (!idb) return [...mem[SINC].values()].map(clone);
      return tx(SINC, 'readonly', t => t.objectStore(SINC).getAll());
    },
    async sincObter(id) {
      if (!idb) { const r = mem[SINC].get(id); return r ? clone(r) : null; }
      return (await tx(SINC, 'readonly', t => t.objectStore(SINC).get(id))) || null;
    },
    /* Atualiza campos do meta (merge). Retorna o meta novo. */
    async sincAtualizar(id, campos) {
      if (!idb) { const m = { ...(mem[SINC].get(id) || { id, rev: 0 }), ...clone(campos), id }; mem[SINC].set(id, m); return clone(m); }
      return new Promise((res, rej) => {
        const t = idb.transaction(SINC, 'readwrite'), S = t.objectStore(SINC); let m;
        const g = S.get(id);
        g.onsuccess = () => { m = { ...(g.result || { id, rev: 0 }), ...clone(campos), id }; S.put(m); };
        t.oncomplete = () => res(m); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transação abortada'));
      });
    },
    /* Fim de um envio: guarda a versão do servidor e só limpa "sujo" se ninguém salvou nesse meio-tempo. */
    async sincConcluir(id, rev, versao, extra) {
      if (!idb) { const m = mem[SINC].get(id); if (m) { m.versao = versao; Object.assign(m, extra || {}); if (m.rev === rev) m.sujo = false; } return; }
      await new Promise((res, rej) => {
        const t = idb.transaction(SINC, 'readwrite'), S = t.objectStore(SINC), g = S.get(id);
        g.onsuccess = () => { const m = g.result; if (!m) return; m.versao = versao; Object.assign(m, extra || {}); if (m.rev === rev) m.sujo = false; S.put(m); };
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transação abortada'));
      });
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
