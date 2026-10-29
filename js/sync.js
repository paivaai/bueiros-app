/* sync.js — login e sincronização com o Supabase (offline-first). Expõe BU.Sync.
   Modelo: cada levantamento tem um registro de controle na store "sinc" do IndexedDB:
     { id, projetoId, versao (do servidor), sujo (há alteração a enviar), rev, erro, conflito, fotosOk[], fotosSig{}, local, legado }
   - Enviar: salvar_bueiro(dados, versao_base) — se alguém gravou antes, volta "conflito" e o usuário escolhe.
   - Receber: baixa só os bueiros do projeto que mudaram no servidor e que não têm alteração local pendente.
   - Fotos: o arquivo vai para o Storage (projeto/bueiro/foto.jpg); os metadados para a tabela fotos. */
(function () {
  'use strict';
  const BU = window.BU, U = BU.U, UI = BU.UI, DB = BU.DB, esc = U.esc, CFG = BU.CONFIG || {};
  const $ = s => document.querySelector(s);

  const E = {
    sb: null, sessao: null, perfil: null, projetos: [], projetoId: '', ocupado: false, ultima: null, msg: '', online: true,
    metas: new Map(), progresso: '', timer: null, deb: null, adotando: false, semConta: false, enviadas: new Set(),
  };
  const emailDe = t => { t = String(t || '').replace(/\s+/g, '').toLowerCase(); return t.includes('@') ? t : (t ? t + '@' + (CFG.USUARIO_DOMINIO || 'gfa-campo.app') : ''); };
  const ehRede = e => !navigator.onLine || (e && (e.name === 'TypeError' || /failed to fetch|networkerror|network request|load failed|timeout|fetch/i.test(String(e.message || e))) && !e.code);
  const projeto = () => E.projetos.find(p => p.id === E.projetoId) || null;
  const logado = () => !!(E.sessao && E.sessao.user);

  /* ---------- cliente e sessão ---------- */
  function cliente() {
    if (E.sb) return E.sb;
    if (!window.supabase || !window.supabase.createClient || !CFG.SUPABASE_URL) return null;
    E.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bueiros-campo-auth' } });
    E.sb.auth.onAuthStateChange((ev, ses) => { E.sessao = ses || null; if (ev === 'SIGNED_OUT') { E.perfil = null; } pintar(); });
    return E.sb;
  }
  async function iniciar() {
    try { E.perfil = await DB.cfgObter('sincPerfil'); E.projetos = (await DB.cfgObter('sincProjetos')) || []; E.projetoId = (await DB.cfgObter('sincProjetoAtivo')) || ''; E.ultima = await DB.cfgObter('sincUltima'); E.semConta = !!(await DB.cfgObter('semConta')); E.enviadas = new Set((await DB.cfgObter('presencasEnviadas')) || []); } catch (e) { /* segue vazio */ }
    const sb = cliente();
    if (sb) { try { const { data } = await sb.auth.getSession(); E.sessao = data && data.session || null; } catch (e) { /* offline: sem sessão lida */ } }
    if (!logado()) E.perfil = E.perfil && E.perfil.saiu ? null : E.perfil;
    // aparelho com dados de antes do controle de sincronização: marca como "legado" (pergunta antes de enviar)
    try {
      if (!(await DB.cfgObter('sincInit'))) {
        const metas = new Set((await DB.sincListar()).map(m => m.id));
        for (const l of await DB.listar()) if (!metas.has(l.id)) await DB.sincAtualizar(l.id, { sujo: true, rev: 1, legado: true });
        await DB.cfgSalvar('sincInit', 1);
      }
    } catch (e) { console.error(e); }
    await carregarMetas(); pintar();
    window.addEventListener('online', () => { pintar(); agendar(1500); });
    window.addEventListener('offline', pintar);
    clearInterval(E.timer); E.timer = setInterval(() => { if (document.visibilityState === 'visible') sincronizar({ silencioso: true }); }, 90000);
    if (logado() && E.projetoId) setTimeout(() => sincronizar({ silencioso: true }), 1200);
  }
  async function carregarMetas() { E.metas = new Map((await DB.sincListar()).map(m => [m.id, m])); }

  async function entrar(usuario, senha) {
    const sb = cliente(); if (!sb) throw new Error('Sem conexão com o servidor agora. Tente com internet.');
    const email = emailDe(usuario); if (!email) throw new Error('Informe o usuário.'); if (!senha) throw new Error('Informe a senha.');
    // tenta a senha como foi digitada e, se falhar, sem espaços nas pontas (o teclado do celular costuma colocar um espaço no fim)
    const tent = [senha]; if (senha.trim() !== senha) tent.push(senha.trim());
    let data = null, error = null;
    for (const pw of tent) { ({ data, error } = await sb.auth.signInWithPassword({ email, password: pw })); if (!error) break; if (!/invalid login/i.test(error.message)) break; }
    if (error) {
      const m = String(error.message || '');
      if (/invalid login/i.test(m)) throw new Error('Usuário ou senha incorretos. Confira o usuário (sem espaços) e use o “olho” para ver a senha digitada.');
      if (/not confirmed/i.test(m)) throw new Error('Esta conta ainda não foi confirmada. Fale com o escritório.');
      if (/rate limit|too many/i.test(m)) throw new Error('Muitas tentativas. Aguarde um minuto e tente de novo.');
      throw new Error(m);
    }
    E.sessao = data.session;
    await carregarPerfil(); await carregarProjetos();
    E.semConta = false; await DB.cfgSalvar('semConta', 0).catch(() => {});
    if (!E.projetoId && E.projetos.length === 1) await escolherProjeto(E.projetos[0].id, true);
    pintar();
  }
  const temServidor = () => !!(CFG.SUPABASE_URL && window.supabase);
  const precisaLogin = () => temServidor() && !logado() && !E.semConta && !(E.perfil && !navigator.onLine);
  const nomeUsuario = () => (logado() && E.perfil && E.perfil.nome) || '';
  async function seguirSemConta() { E.semConta = true; await DB.cfgSalvar('semConta', 1).catch(() => {}); }
  function loginHTML(extra) {
    return `<form class="card" id="sync-login" autocomplete="on"><h3>Entrar</h3>
        <div class="f"><label for="sl-u">Usuário</label><input id="sl-u" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" required></div>
        <div class="f"><label for="sl-s">Senha</label>${UI.senhaHTML({ id: 'sl-s', name: 'password' })}</div>
        <div class="err" id="sl-err" role="alert" hidden></div>
        <button class="btn primary" type="submit" id="sl-ok">Entrar</button>
        ${extra || ''}
        <p class="muted small">O usuário é o que o escritório cadastrou para você (ex.: <b>filipe</b>). Sem internet o app continua funcionando: tudo fica neste aparelho e vai para o servidor quando você entrar e estiver online.</p></form>`;
  }
  function ligarLogin(depois) {
    const f = $('#sync-login'); if (!f) return;
    f.addEventListener('submit', async ev => {
      ev.preventDefault(); const b = $('#sl-ok'), er = $('#sl-err'); b.disabled = true; er.hidden = true; b.textContent = 'Entrando…';
      try { await entrar(f.username.value, f.password.value); await depois(); }
      catch (e) { er.textContent = ehRede(e) ? 'Sem internet. Conecte-se para entrar a primeira vez.' : (e.message || String(e)); er.hidden = false; b.disabled = false; b.textContent = 'Entrar'; }
    });
    const sem = $('#sl-sem'); if (sem) sem.addEventListener('click', async () => { await seguirSemConta(); location.hash = '#/'; if (BU.App && BU.App.rotear) BU.App.rotear(); });
  }
  /* Tela 01: a primeira tela do app quando não há conta aberta */
  function viewLogin() {
    const alvo = $('#view'); if (!alvo) return;
    alvo.innerHTML = `<section class="page login-gate"><div class="login-logo"><img src="assets/logo-gfa.png" alt="GFA Engenharia"><h1>Cadastro de Bueiros</h1><p class="muted">Entre com a sua conta para receber os projetos e enviar o que levantar.</p></div>
      ${loginHTML('<button type="button" class="btn linkbtn" id="sl-sem">Continuar sem conta (dados só neste aparelho)</button>')}</section>`;
    ligarLogin(async () => { location.hash = '#/'; if (BU.App && BU.App.rotear) BU.App.rotear(); if (E.projetoId) sincronizar(); });
  }
  async function sair() {
    const n = [...E.metas.values()].filter(m => m.sujo && !m.local).length;
    if (n && !(await UI.confirmar(`${n} levantamento(s) ainda não foram enviados. Eles continuam neste aparelho e serão enviados quando você entrar de novo. Sair mesmo assim?`, { titulo: 'Sair da conta', ok: 'Sair' }))) return;
    try { await E.sb.auth.signOut(); } catch (e) { /* offline: limpa só o local */ try { await E.sb.auth.signOut({ scope: 'local' }); } catch (e2) { /* ignora */ } }
    E.sessao = null; E.perfil = null; await DB.cfgSalvar('sincPerfil', null).catch(() => {}); pintar();
  }
  async function carregarPerfil() {
    const { data, error } = await E.sb.from('perfis').select('id,nome,email,papel,ativo').eq('id', E.sessao.user.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !data.ativo) { await E.sb.auth.signOut().catch(() => {}); E.sessao = null; throw new Error('Esta conta ainda não foi liberada pelo escritório (sem convite). Fale com o administrador.'); }
    E.perfil = data; await DB.cfgSalvar('sincPerfil', data).catch(() => {});
  }
  async function carregarProjetos() {
    let r = await E.sb.from('projetos').select('id,nome,rodovia,fuso,hemisferio,eixo').eq('ativo', true).order('nome');
    if (r.error) r = await E.sb.from('projetos').select('id,nome,rodovia,fuso,hemisferio').eq('ativo', true).order('nome'); // sem o script 08
    if (r.error) throw new Error(r.error.message);
    E.projetos = r.data || []; await DB.cfgSalvar('sincProjetos', E.projetos).catch(() => {});
    if (E.projetoId && !projeto()) { E.projetoId = ''; await DB.cfgSalvar('sincProjetoAtivo', '').catch(() => {}); }
  }
  async function escolherProjeto(id, semSincronizar) {
    E.projetoId = id; await DB.cfgSalvar('sincProjetoAtivo', id).catch(() => {});
    await adotarLegado(); pintar();
    if (!semSincronizar) sincronizar();
  }

  /* Levantamentos que já estavam no aparelho antes do login: pergunta se vão para o projeto escolhido. */
  async function adotarLegado() {
    if (!E.projetoId || E.adotando) return; E.adotando = true;
    try {
      await carregarMetas();
      const lev = await DB.listar(), porId = new Map(lev.map(l => [l.id, l]));
      const leg = [...E.metas.values()].filter(m => m.legado && !m.projetoId && !m.local && porId.has(m.id) && porId.get(m.id).status !== 'a_vistoriar');
      const resto = [...E.metas.values()].filter(m => m.legado && !m.projetoId && !m.local && !leg.includes(m));
      for (const m of resto) await DB.sincAtualizar(m.id, { legado: false, local: true, sujo: false }); // "a vistoriar" do KMZ antigo: não vai
      if (leg.length) {
        const sim = await UI.confirmar(`Este aparelho tem ${leg.length} levantamento(s) feito(s) antes do login. Enviar para o projeto “${projeto().nome}”? (Se forem de outro projeto, escolha “Manter só aqui”.)`, { titulo: 'Levantamentos antigos', ok: 'Enviar para o projeto', cancelar: 'Manter só aqui' });
        for (const m of leg) await DB.sincAtualizar(m.id, sim ? { projetoId: E.projetoId, legado: false } : { local: true, legado: false, sujo: false });
      }
      await carregarMetas();
    } finally { E.adotando = false; }
  }

  /* ---------- sincronização ---------- */
  function agendar(ms) { clearTimeout(E.deb); E.deb = setTimeout(() => sincronizar({ silencioso: true }), ms == null ? 5000 : ms); }

  async function sincronizar({ silencioso = false } = {}) {
    if (E.ocupado) return;
    if (!logado()) { if (!silencioso) UI.toast('Entre na sua conta para sincronizar', 'aviso'); return; }
    if (!E.projetoId) { if (!silencioso) UI.toast('Escolha o projeto', 'aviso'); return; }
    if (!navigator.onLine) { if (!silencioso) UI.toast('Sem internet: fica para depois', 'aviso'); pintar(); return; }
    E.ocupado = true; E.msg = ''; pintar();
    try {
      await carregarProjetos().catch(() => {}); // traz também o eixo atualizado
      await carregarMetas();
      await enviarExclusoes();
      const env = await enviar();
      await enviarPresencas().catch(e => { if (ehRede(e)) throw e; console.warn('presenças:', e); });
      const rec = await receber();
      await baixarFotosFaltantes();
      E.ultima = new Date().toISOString(); await DB.cfgSalvar('sincUltima', E.ultima).catch(() => {});
      if (!silencioso) UI.toast(`Sincronizado${env ? ` · ${env} enviado(s)` : ''}${rec ? ` · ${rec} recebido(s)` : ''}`);
      if (rec && BU.App && BU.App.refrescar) BU.App.refrescar();
    } catch (e) {
      if (ehRede(e)) E.msg = 'Sem conexão com o servidor. Tentamos de novo depois.';
      else { E.msg = 'Erro: ' + (e && e.message || e); console.error(e); }
      if (!silencioso) UI.toast(E.msg, 'erro');
    } finally { E.ocupado = false; E.progresso = ''; await carregarMetas(); pintar(); if (location.hash === '#/sync') view(); }
  }

  async function enviar() {
    let enviados = 0;
    const pend = [...E.metas.values()].filter(m => m.sujo && !m.local && !m.conflito);
    for (const m0 of pend) {
      const l = await DB.obter(m0.id); if (!l) { await DB.sincAtualizar(m0.id, { sujo: false }); continue; }
      let m = (await DB.sincObter(m0.id)) || m0;
      if (!m.sujo) continue;
      const pid = m.projetoId || E.projetoId;
      if (l.status === 'a_vistoriar' && !(m.versao > 0)) { await DB.sincConcluir(m.id, m.rev, m.versao || 0); continue; } // planejado intocado: nada a enviar
      if (l.status === 'aprovado') { await DB.sincConcluir(m.id, m.rev, m.versao || 0); continue; } // aprovado pelo escritório: fechado
      if (!m.projetoId) m = await DB.sincAtualizar(m.id, { projetoId: pid });
      E.progresso = `Enviando ${l.codigo || 'levantamento'}…`; pintar();
      const rev = m.rev;
      let r;
      const payload = U.clone(l); delete payload.comentarioRevisao;
      try { r = await E.sb.rpc('salvar_bueiro', { p_bueiro: { id: l.id, projeto_id: pid, status: l.status === 'devolvido' ? 'rascunho' : l.status, dados: payload }, p_versao_base: m.versao || 0 }); }
      catch (e) { throw e; }
      if (r.error) {
        if (ehRede(r.error)) throw r.error;
        await DB.sincAtualizar(m.id, { erro: traduzir(r.error) }); continue;
      }
      const d = r.data || {};
      if (d.conflito) { await DB.sincAtualizar(m.id, { conflito: { versao: d.versao, servidor: d.servidor || null }, erro: '' }); continue; }
      await DB.sincConcluir(m.id, rev, d.versao, { erro: '', conflito: null });
      await enviarFotos(l, pid);
      enviados++;
    }
    // fotos de bueiros já enviados que ganharam foto/legenda depois
    return enviados;
  }

  /* Exclusões: o bueiro apagado no aparelho precisa sair também do servidor, senão volta na próxima sincronização.
     Fica uma lista de "lápides" (ids) no aparelho até o servidor confirmar. Requer o script 13 do servidor. */
  async function lapides() { try { return (await DB.cfgObter('sincExcluidos')) || []; } catch (e) { return []; } }
  async function salvarLapides(l) { await DB.cfgSalvar('sincExcluidos', l).catch(() => {}); }
  async function registrarExclusao(id, projetoId, codigo, fotos) {
    const l = await lapides();
    if (!l.some(x => x.id === id)) l.push({ id, projetoId: projetoId || '', codigo: codigo || '', fotos: (fotos || []).map(f => f.id) });
    await salvarLapides(l); agendar(800);
  }
  async function enviarExclusoes() {
    const l = await lapides(); if (!l.length) return;
    const resto = [];
    for (const x of l) {
      const r = await E.sb.rpc('excluir_bueiro', { p_id: x.id });
      if (!r.error) {
        E.msg = '';
        if (x.projetoId && (x.fotos || []).length) await E.sb.storage.from('fotos').remove(x.fotos.map(f => `${x.projetoId}/${x.id}/${f}.jpg`)).catch(() => {});
        continue;
      }
      if (ehRede(r.error)) throw r.error;
      const t = String(r.error.code || '') + ' ' + String(r.error.message || '');
      if (/does not exist|PGRST202|42883/i.test(t)) { E.msg = 'Falta rodar o script 13 no servidor para excluir de verdade.'; resto.push(x); continue; }
      if (/aprovado|cadastro|outra pessoa|sem acesso/i.test(t)) { E.msg = 'O servidor não permitiu excluir "' + (x.codigo || 'bueiro') + '": ' + (r.error.message || ''); continue; } // recusado: larga a lápide e deixa voltar
      resto.push(x);
    }
    await salvarLapides(resto);
  }

  /* "GPS aqui": envia os registros de presença para a tabela própria (script 11 do servidor). */
  async function enviarPresencas() {
    const lista = [];
    for (const l of await DB.listar()) {
      const m = E.metas.get(l.id); if (m && m.local) continue;
      const pid = (m && m.projetoId) || E.projetoId; if (!pid) continue;
      for (const r of (l.presencas || [])) if (r && r.id && !E.enviadas.has(r.id) && r.latitude != null) lista.push({ id: r.id, projeto_id: pid, bueiro_id: l.id, latitude: r.latitude, longitude: r.longitude, precisao: r.precisao, distancia: r.distancia, em: r.em });
    }
    for (let i = 0; i < lista.length; i += 100) {
      const lote = lista.slice(i, i + 100);
      const r = await E.sb.rpc('registrar_presencas', { p_lista: lote });
      if (r.error) { if (ehRede(r.error)) throw r.error; if (/does not exist|PGRST202|42883/i.test((r.error.code || '') + r.error.message)) return; throw new Error(r.error.message); } // sem o script 11: segue sem
      lote.forEach(x => E.enviadas.add(x.id));
      await DB.cfgSalvar('presencasEnviadas', [...E.enviadas].slice(-2000)).catch(() => {});
    }
  }
  function traduzir(er) {
    const t = String(er.message || er);
    if (er.code === '23505' || /unique|duplicate/i.test(t)) return 'Já existe outro bueiro com este código no projeto. Mude o código e sincronize de novo.';
    if (/atribuído a outra pessoa/i.test(t)) return 'Este bueiro está atribuído a outra pessoa.';
    if (/já aprovado/i.test(t)) return 'Este bueiro já foi aprovado pelo escritório e não pode mais ser alterado.';
    if (/sem acesso/i.test(t) || er.code === '42501') return 'Sem permissão neste projeto. Peça ao escritório para incluir você na equipe do projeto.';
    return t;
  }

  async function enviarFotos(l, pid) {
    let m = await DB.sincObter(l.id); if (!m) return;
    const ok = new Set(m.fotosOk || []), sig = { ...(m.fotosSig || {}) }, uid = E.sessao.user.id;
    const ids = new Set(l.fotos.map(f => f.id));
    for (const f of l.fotos) {
      const assinatura = [f.categoria, f.ctx, f.legenda].join('|'), caminho = `${pid}/${l.id}/${f.id}.jpg`;
      if (!ok.has(f.id)) {
        const reg = await DB.obterFoto(f.id); if (!reg || !reg.blob) continue;
        E.progresso = `Foto ${[...ids].indexOf(f.id) + 1}/${ids.size} de ${l.codigo || ''}…`; pintar();
        const up = await E.sb.storage.from('fotos').upload(caminho, reg.blob, { contentType: 'image/jpeg', upsert: true });
        if (up.error) { if (ehRede(up.error)) throw up.error; await DB.sincAtualizar(l.id, { erro: 'Foto não enviada: ' + up.error.message }); continue; }
      } else if (sig[f.id] === assinatura) continue;
      const row = { id: f.id, bueiro_id: l.id, projeto_id: pid, storage_path: caminho, categoria: f.categoria || null, ctx: f.ctx || '', legenda: f.legenda || null, tirada_em: f.dataHora || null, bytes: f.bytes || null, largura: f.w || null, altura: f.h || null, enviado_por: uid };
      const r = await E.sb.from('fotos').upsert(row, { onConflict: 'id' });
      if (r.error) { if (ehRede(r.error)) throw r.error; await DB.sincAtualizar(l.id, { erro: 'Foto: ' + r.error.message }); continue; }
      ok.add(f.id); sig[f.id] = assinatura;
    }
    // fotos apagadas no aparelho saem do servidor
    for (const id of [...ok]) if (!ids.has(id)) {
      await E.sb.storage.from('fotos').remove([`${pid}/${l.id}/${id}.jpg`]).catch(() => {});
      await E.sb.from('fotos').delete().eq('id', id).catch(() => {});
      ok.delete(id); delete sig[id];
    }
    await DB.sincAtualizar(l.id, { fotosOk: [...ok], fotosSig: sig });
  }

  async function receber() {
    const pid = E.projetoId, uid = E.sessao.user.id, leves = [];
    for (let de = 0; ; de += 1000) {
      const r = await E.sb.from('bueiros').select('id,versao,status,atribuido_a').eq('projeto_id', pid).or(`atribuido_a.is.null,atribuido_a.eq.${uid}`).order('id').range(de, de + 999);
      if (r.error) throw r.error;
      leves.push(...r.data); if (r.data.length < 1000) break;
    }
    await carregarMetas();
    const cur = BU.App && BU.App.cur && BU.App.cur();
    const mortos = new Set((await lapides()).map(x => x.id));
    const trazer = leves.filter(s => {
      if (mortos.has(s.id)) return false; // excluído neste aparelho, ainda não confirmado pelo servidor
      const m = E.metas.get(s.id);
      if (m && m.sujo) return false; // alteração local pendente: o envio resolve (ou aponta conflito)
      if (cur && cur.id === s.id) return false;
      return !m || m.versao == null || s.versao > m.versao || m.projetoId !== pid;
    });
    let n = 0;
    for (let i = 0; i < trazer.length; i += 40) {
      const ids = trazer.slice(i, i + 40).map(x => x.id);
      E.progresso = `Recebendo ${Math.min(i + 40, trazer.length)}/${trazer.length}…`; pintar();
      const r = await E.sb.from('bueiros').select('id,codigo,km,status,versao,comentario_revisao,atualizado_em,criado_em,latitude,longitude,leste,norte,zona,dados').in('id', ids);
      if (r.error) throw r.error;
      const recs = [], info = new Map();
      for (const b of r.data) {
        const d = b.dados || {};
        const plan = d.planejado || (b.status === 'a_vistoriar' && (d.latitude != null ? d.latitude : b.latitude) != null ? { latitude: d.latitude != null ? d.latitude : b.latitude, longitude: d.longitude != null ? d.longitude : b.longitude } : undefined);
        const rec = BU.App.normalizar({ ...d, planejado: plan, id: b.id, status: b.status, codigo: d.codigo || b.codigo, km: d.km || b.km || '', comentarioRevisao: b.comentario_revisao || '',
          latitude: d.latitude != null ? d.latitude : b.latitude, longitude: d.longitude != null ? d.longitude : b.longitude,
          leste: d.leste != null ? d.leste : b.leste, norte: d.norte != null ? d.norte : b.norte, zona: d.zona || b.zona || '23',
          atualizadoEm: b.atualizado_em, criadoEm: d.criadoEm || b.criado_em });
        // planejado pelo escritório e ainda sem vistoria: mantém "a vistoriar"
        recs.push(rec); info.set(b.id, { projetoId: pid, versao: b.versao, erro: '', conflito: null, fotosOk: (rec.fotos || []).map(f => f.id), fotosSig: Object.fromEntries((rec.fotos || []).map(f => [f.id, [f.categoria, f.ctx, f.legenda].join('|')])) });
      }
      await DB.salvarVarios(recs, { doServidor: id => info.get(id) });
      n += recs.length;
    }
    return n;
  }

  /* Fotos de levantamentos vindos do servidor: baixa o arquivo para o aparelho (só os que faltam). */
  async function baixarFotosFaltantes() {
    const pid = E.projetoId; let feitas = 0;
    for (const l of await DB.listar()) {
      const m = E.metas.get(l.id); if (!m || m.projetoId !== pid || !(m.fotosOk || []).length) continue;
      for (const f of l.fotos || []) {
        if (!m.fotosOk.includes(f.id) || await DB.obterFoto(f.id)) continue;
        E.progresso = `Baixando fotos (${++feitas})…`; pintar();
        const r = await E.sb.storage.from('fotos').download(`${pid}/${l.id}/${f.id}.jpg`);
        if (r.error) { if (ehRede(r.error)) throw r.error; continue; }
        await DB.salvarFoto({ id: f.id, levantamentoId: l.id, tipo: 'image/jpeg', blob: r.data, criadoEm: U.agoraISO() });
        if (feitas >= 60) return; // o resto vem na próxima rodada
      }
    }
  }

  /* ---------- resolver conflito ---------- */
  async function resolver(id, escolha) {
    const m = await DB.sincObter(id); if (!m || !m.conflito) return;
    if (escolha === 'meu') await DB.sincAtualizar(id, { versao: m.conflito.versao, conflito: null, erro: '', sujo: true, rev: (m.rev || 0) + 1 });
    else {
      const ok = await UI.confirmar('O que você fez neste bueiro neste aparelho será trocado pela versão do escritório. Continuar?', { titulo: 'Usar a versão do escritório', ok: 'Usar a do escritório', perigo: true });
      if (!ok) return;
      await DB.sincAtualizar(id, { conflito: null, erro: '', versao: -1 }); // força receber
      await DB.sincAtualizar(id, { sujo: false });
    }
    await carregarMetas(); view(); sincronizar();
  }

  /* ---------- aparência ---------- */
  function contagens() {
    const ms = [...E.metas.values()];
    return {
      aEnviar: ms.filter(m => m.sujo && !m.local && !m.conflito).length,
      conflitos: ms.filter(m => m.conflito).length, erros: ms.filter(m => m.erro && !m.conflito).length,
    };
  }
  function pintar() {
    const el = $('#sinc'); if (!el) return;
    const c = contagens(), prob = c.conflitos + c.erros;
    let t, cls, n = 0;
    if (!logado()) { t = 'Sem conta aberta: toque no bonequinho para entrar'; cls = 'off'; }
    else if (E.ocupado) { t = 'Sincronizando…'; cls = 'ocupado'; }
    else if (prob) { t = `${prob} com problema: toque para tentar de novo`; cls = 'erro'; n = prob; }
    else if (c.aEnviar) { t = `${c.aEnviar} a enviar: toque para sincronizar`; cls = 'pend'; n = c.aEnviar; }
    else { t = 'Sincronizado: toque para atualizar'; cls = 'on'; }
    el.className = 'syncbtn ' + cls; el.title = t; el.setAttribute('aria-label', t); el.setAttribute('aria-busy', String(!!E.ocupado));
    const b = el.querySelector('.b'); if (b) { b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); }
    if (BU.App && BU.App.S && BU.App.S.hashAtual === '#/' && !E.ocupado) { const h = $('#home-sync'); if (h) h.innerHTML = cartaoHomeInterno(); }
  }
  function selo(id) {
    const m = E.metas.get(id); if (!m || m.local || !logado()) return '';
    if (m.conflito) return '<span class="chip erro">conflito</span>';
    if (m.erro) return '<span class="chip erro">erro ao enviar</span>';
    if (m.sujo) return '<span class="chip pendente">a enviar</span>';
    return '';
  }
  function cartaoHomeInterno() {
    const p = projeto(), c = contagens();
    if (!logado()) return `<b>Sem conta</b><p class="muted small">Os dados ficam só neste aparelho. Entre para receber os bueiros do projeto e enviar o que for levantado.</p><a class="btn primary" href="#/sync">Entrar para sincronizar</a>`;
    return ''; // com a conta aberta, a sincronização é o ícone do cabeçalho
  }
  const cartaoHome = () => (logado() ? '' : `<div id="home-sync" class="card">${cartaoHomeInterno()}</div>`);

  async function view() {
    const alvo = $('#view'); if (!alvo) return;
    await carregarMetas();
    const c = contagens(), lev = new Map((await DB.listar()).map(l => [l.id, l]));
    let h = '<section class="page"><div class="page-head"><h1>Conta e projeto</h1></div>';
    if (!logado()) {
      h += loginHTML();
    } else {
      h += `<div class="card"><h3>Conta</h3><div class="kv"><span>Nome</span><b>${esc(E.perfil ? E.perfil.nome : '—')}</b></div><div class="kv"><span>Perfil</span><b>${esc(E.perfil ? ({ admin: 'Administrador', gestor: 'Gestor', campo: 'Campo' }[E.perfil.papel] || E.perfil.papel) : '—')}</b></div>
        <div class="row"><button type="button" class="btn" data-sync="sair">Sair da conta</button></div></div>
        <div class="card"><h3>Projeto</h3>
          ${E.projetos.length ? `<select id="sync-proj">${projeto() ? '' : '<option value="">— escolha o projeto —</option>'}${E.projetos.map(p => `<option value="${esc(p.id)}"${p.id === E.projetoId ? ' selected' : ''}>${esc(p.nome)}${p.rodovia ? ' · ' + esc(p.rodovia) : ''}</option>`).join('')}</select>`
            : '<p class="muted">Nenhum projeto liberado para você. Peça ao escritório para incluir você na equipe do projeto.</p>'}
          <div class="row"><button type="button" class="btn" data-sync="projetos">Atualizar lista de projetos</button></div></div>
        ${E.msg ? `<div class="card"><p class="pend aviso" style="margin:0">${esc(E.msg)}</p></div>` : ''}`;
      const prob = [...E.metas.values()].filter(m => m.conflito || m.erro);
      if (prob.length) h += `<div class="card"><h3>Precisam de atenção</h3>${prob.map(m => {
        const l = lev.get(m.id); const nome = l ? (l.codigo || 'Sem código') : m.id;
        return `<div class="pend erro" style="display:block"><b>${esc(nome)}</b><div class="small">${m.conflito ? 'O escritório (ou outra pessoa) alterou este bueiro enquanto você também alterava.' : esc(m.erro)}</div>
          ${m.conflito ? `<div class="row"><button type="button" class="btn sm" data-sync="meu" data-id="${esc(m.id)}">Manter o meu</button><button type="button" class="btn sm" data-sync="deles" data-id="${esc(m.id)}">Usar o do escritório</button></div>`
            : `<div class="row"><a class="btn sm" href="#/lev/${esc(m.id)}/1">Abrir</a><button type="button" class="btn sm" data-sync="tentar" data-id="${esc(m.id)}">Tentar de novo</button></div>`}</div>`; }).join('')}</div>`;
    }
    h += '<button type="button" class="btn" data-go="#/">‹ Início</button></section>';
    alvo.innerHTML = h;
    ligarLogin(async () => { await view(); if (E.projetoId) sincronizar(); });
    const sp = $('#sync-proj');
    if (sp) sp.addEventListener('change', async () => { if (sp.value) { await escolherProjeto(sp.value); view(); } });
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-sync]'); if (!b || b.disabled) return;
    const a = b.dataset.sync;
    if (a === 'agora') { if (!logado()) { location.hash = '#/sync'; return; } await sincronizar(); if (location.hash === '#/sync') view(); }
    else if (a === 'sair') { await sair(); view(); }
    else if (a === 'projetos') { try { await carregarProjetos(); UI.toast('Lista atualizada'); } catch (er) { UI.toast(ehRede(er) ? 'Sem internet' : er.message, 'erro'); } view(); }
    else if (a === 'meu' || a === 'deles') resolver(b.dataset.id, a);
    else if (a === 'tentar') { await DB.sincAtualizar(b.dataset.id, { erro: '', sujo: true }); await carregarMetas(); sincronizar(); }
  });

  /* Dados do projeto ativo para outras telas (mapa, novo levantamento). */
  async function eixoAtivo() {
    const p = projeto(); if (!p) return null;
    if (p.eixo) return p.eixo;
    try { return await DB.cfgObter('eixo:' + p.id); } catch (e) { return null; }
  }
  function prefillNovo(l) { const p = projeto(); if (p && p.rodovia && !l.estrada) l.estrada = p.rodovia; }

  BU.Sync = { registrarExclusao, precisaLogin, viewLogin, nomeUsuario, projetos: () => E.projetos, meta: id => E.metas.get(id) || null, escolherProjeto, perfil: () => E.perfil, recarregar: carregarMetas, iniciar, sincronizar, agendar, view, selo, cartaoHome, pintar, projeto, logado, eixoAtivo, prefillNovo, projetoId: () => E.projetoId };
})();
