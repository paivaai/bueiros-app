/* dados.js — acesso aos dados do painel. Dois "motores" com a mesma interface:
     Demo      → dados fictícios em memória (nada é gravado em servidor);
     Supabase  → dados reais (login, RLS, funções salvar/revisar/atribuir do servidor/02_funcoes.sql).
   Interface: iniciar, entrar, sair, perfil, projetos, bueiros, bueiro, historico, fotos, usuarios,
              revisar, atribuir, convidar, assinar.  Expõe window.Dados. */
(function () {
  'use strict';
  const CFG = window.GESTAO_CONFIG || {};
  const STATUS = ['a_vistoriar', 'rascunho', 'concluido', 'devolvido', 'aprovado'];

  /* ======================================================================= DEMO */
  function criarDemo() {
    let seed = 20261012;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const agora = Date.now(), H = 3600e3;
    const iso = ms => new Date(ms).toISOString();

    const usuarios = [
      { id: 'u-arthur', nome: 'Arthur', email: 'arthur@gfa.demo', papel: 'admin', ativo: true },
      { id: 'u-marina', nome: 'Marina Souza', email: 'marina@gfa.demo', papel: 'gestor', ativo: true },
      { id: 'u-joao', nome: 'João Pereira', email: 'joao@gfa.demo', papel: 'campo', ativo: true },
      { id: 'u-carlos', nome: 'Carlos Lima', email: 'carlos@gfa.demo', papel: 'campo', ativo: true },
      { id: 'u-bia', nome: 'Bia Nunes', email: 'bia@gfa.demo', papel: 'campo', ativo: true },
    ];
    const campo = usuarios.filter(u => u.papel === 'campo');
    const projetos = [
      { id: 'p-1', nome: 'BGROTA – Fora Melhoria 03', rodovia: 'BR-101', descricao: 'Cadastro de bueiros (exemplo)', fuso: '23', hemisferio: 'S', ativo: true },
      { id: 'p-2', nome: 'Duplicação km 120–160', rodovia: 'BR-116', descricao: 'Projeto de exemplo, ainda sem levantamentos', fuso: '23', hemisferio: 'S', ativo: true },
    ];

    /* um levantamento completo (com pontos RTK reais de teste) para mostrar a prancha */
    function levantamentoCompleto(id) {
      const pts = [];
      String(window.DEMO_TXT || '').split(/\n/).forEach(ln => {
        const m = ln.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+"([^"]*)"/);
        if (m) pts.push({ uid: 'pt' + m[1], id: m[1], x: parseFloat(m[2]), y: parseFloat(m[3]), z: parseFloat(m[4]), codigo: m[5], obs: '' });
      });
      return {
        id, status: 'concluido', origem: 'campo', codigo: 'B-001', estrada: 'BR-101', municipio: 'Exemplo', estado: 'SP', km: '12+340', sentido: 'Crescente', lado: 'Direito',
        data: iso(agora - 5 * H).slice(0, 10), hora: '09:40', responsavel: 'João Pereira', equipe: 'GFA', observacoes: 'Boca de montante com leve assoreamento.',
        leste: 259466.5, norte: 7658441.5, zona: '23', hemisferio: 'S', altitude: 12.4, coordOrigem: 'rtk',
        caracteristicas: { tipo: 'Bueiro tubular', formato: 'Circular', celulas: null, material: 'Concreto', diametro: 1.2, largura: null, altura: null, comprimento: null, conservacao: 'Regular', assoreamento: 'Parcial', obstrucao: 'Não', situacaoEstrutural: 'Sem patologias aparentes' },
        medicoes: {}, medicoesAuto: {}, secao: null, prancha: { inverter: false }, pontosArquivo: 'levantamento_rtk.txt', pontos: pts, fotos: [],
      };
    }

    const bueiros = [];
    const base = (window.BU && BU.GPS) ? BU.GPS.deUTM(259466.5, 7658441.5, 23, 'S') : { lat: -23.0, lon: -47.0 };
    const N = 36;
    const dist = { aprovado: 11, concluido: 7, devolvido: 3, rascunho: 5, a_vistoriar: 10 };
    const lista = [];
    Object.keys(dist).forEach(k => { for (let i = 0; i < dist[k]; i++) lista.push(k); });
    for (let i = 0; i < N; i++) {
      const st = i === 0 ? 'concluido' : lista[(i * 7) % lista.length];
      const id = 'b-' + String(i + 1).padStart(3, '0');
      const lat = base.lat + (i - N / 2) * 0.0021 + (rnd() - .5) * 0.0006;
      const lon = base.lon + (i - N / 2) * 0.0026 + Math.sin(i / 3) * 0.004;
      const u = BU.GPS ? BU.GPS.paraUTM(lat, lon, 23) : { leste: 0, norte: 0 };
      const resp = st === 'a_vistoriar' ? null : (i === 0 ? campo[0] : pick(campo));
      const atrib = st === 'a_vistoriar' ? (rnd() < .5 ? pick(campo) : null) : resp;
      const km = (12 + i * 0.35).toFixed(3).replace('.', '+');
      bueiros.push({
        id, projeto_id: 'p-1', codigo: 'B-' + String(i + 1).padStart(3, '0'), cadastro_id: 'CAD-' + (1000 + i), km, status: st,
        atribuido_a: atrib ? atrib.id : null, responsavel_nome: resp ? resp.nome : null,
        latitude: +lat.toFixed(7), longitude: +lon.toFixed(7), leste: +u.leste.toFixed(3), norte: +u.norte.toFixed(3), zona: '23',
        atualizado_em: iso(agora - Math.floor(rnd() * 70 * H) - (i === 0 ? 5 * H : 0)), versao: 1 + Math.floor(rnd() * 5),
        revisado_por: st === 'aprovado' || st === 'devolvido' ? 'u-marina' : null,
        comentario_revisao: st === 'devolvido' ? pick(['Faltou foto da saída.', 'Conferir a altura da boca de jusante.', 'Pontos RTK sem o código GI.']) : null,
        dados: i === 0 ? levantamentoCompleto(id) : {
          id, codigo: 'B-' + String(i + 1).padStart(3, '0'), estrada: 'BR-101', municipio: 'Exemplo', km,
          caracteristicas: { tipo: pick(['Bueiro tubular', 'Bueiro celular']), formato: pick(['Circular', 'Retangular']), material: 'Concreto', diametro: pick([0.8, 1.0, 1.2, 1.5]), conservacao: pick(['Bom', 'Regular', 'Ruim']) },
          pontos: [], fotos: [],
        },
      });
    }
    bueiros[0].atribuido_a = 'u-joao'; bueiros[0].responsavel_nome = 'João Pereira';
    { const b0 = bueiros[0], d0 = b0.dados; b0.leste = d0.leste; b0.norte = d0.norte; b0.latitude = +base.lat.toFixed(7); b0.longitude = +base.lon.toFixed(7); d0.km = b0.km; }

    const hist = {};
    bueiros.forEach(b => {
      const h = [{ id: b.id + 'h0', acao: 'criado', usuario_nome: 'Marina Souza', em: iso(agora - 96 * H), detalhe: { status: 'a_vistoriar' } }];
      if (b.status !== 'a_vistoriar') {
        h.push({ id: b.id + 'h1', acao: 'status', usuario_nome: b.responsavel_nome, em: iso(Date.parse(b.atualizado_em) - 2 * H), detalhe: { de: 'a_vistoriar', para: 'rascunho' } });
        if (b.status !== 'rascunho') h.push({ id: b.id + 'h2', acao: 'status', usuario_nome: b.responsavel_nome, em: iso(Date.parse(b.atualizado_em) - 1 * H), detalhe: { de: 'rascunho', para: 'concluido' } });
        if (b.status === 'aprovado' || b.status === 'devolvido') h.push({ id: b.id + 'h3', acao: b.status, usuario_nome: 'Marina Souza', em: b.atualizado_em, detalhe: { comentario: b.comentario_revisao } });
      }
      hist[b.id] = h.reverse();
    });

    const ouvintes = [];
    let timer = null;
    const D = {
      modo: 'demo', usuarioAtual: null,
      async iniciar() { return null; },
      async entrar(email) {
        const u = usuarios.find(x => x.email === String(email).trim().toLowerCase());
        if (!u) throw new Error('Usuário não encontrado. No modo demonstração use arthur@gfa.demo e a senha "demo".');
        if (u.papel === 'campo') throw new Error('Este painel é para o escritório (administrador ou gestor).');
        D.usuarioAtual = u; return u;
      },
      async sair() { D.usuarioAtual = null; this.assinarParar(); },
      perfil() { return D.usuarioAtual; },
      async projetos() {
        return projetos.map(p => ({ ...p, resumo: resumo(bueiros.filter(b => b.projeto_id === p.id)) }));
      },
      async bueiros(projetoId) { return bueiros.filter(b => b.projeto_id === projetoId).map(({ dados, ...r }) => ({ ...r })); },
      async bueiro(id) { const b = bueiros.find(x => x.id === id); return b ? JSON.parse(JSON.stringify(b)) : null; },
      async historico(id) { return hist[id] || []; },
      async fotos(id) {
        const b = bueiros.find(x => x.id === id);
        if (!b || b.status === 'a_vistoriar') return [];
        const cats = ['Boca de montante', 'Boca de jusante', 'Interior', 'Pista'];
        return cats.map((c, i) => ({ id: id + 'f' + i, categoria: c, legenda: c, url: placeholderFoto(c, b.codigo) }));
      },
      async usuarios() { return usuarios.map(u => ({ ...u })); },
      async revisar(id, aprovar, comentario) {
        const b = bueiros.find(x => x.id === id);
        if (!b || !['concluido', 'devolvido', 'aprovado'].includes(b.status)) throw new Error('Só dá para revisar bueiro concluído.');
        if (!aprovar && !String(comentario || '').trim()) throw new Error('Explique o que precisa ser corrigido.');
        b.status = aprovar ? 'aprovado' : 'devolvido'; b.revisado_por = D.usuarioAtual.id; b.comentario_revisao = aprovar ? null : comentario.trim();
        b.versao++; b.atualizado_em = iso(Date.now());
        hist[id].unshift({ id: id + 'h' + Date.now(), acao: b.status, usuario_nome: D.usuarioAtual.nome, em: b.atualizado_em, detalhe: { comentario } });
        avisar({ tipo: 'revisao', id });
      },
      async atribuir(ids, usuarioId) {
        let n = 0;
        ids.forEach(id => {
          const b = bueiros.find(x => x.id === id);
          if (b && ['a_vistoriar', 'rascunho', 'devolvido'].includes(b.status)) {
            b.atribuido_a = usuarioId || null; n++;
            hist[id].unshift({ id: id + 'a' + Date.now(), acao: 'atribuido', usuario_nome: D.usuarioAtual.nome, em: iso(Date.now()), detalhe: { para: usuarioId } });
          }
        });
        avisar({ tipo: 'atribuicao' }); return n;
      },
      async convidar(email, nome, papel) {
        email = String(email).trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('E-mail inválido.');
        if (usuarios.some(u => u.email === email)) throw new Error('Esse e-mail já tem acesso.');
        usuarios.push({ id: 'u-' + Date.now(), nome: nome || email.split('@')[0], email, papel, ativo: true, convite: true });
      },
      /* demonstração ao vivo: de tempos em tempos "alguém do campo" atualiza um bueiro */
      assinar(projetoId, cb) {
        ouvintes.push(cb);
        if (!timer) timer = setInterval(() => {
          const abertos = bueiros.filter(b => b.projeto_id === projetoId && (b.status === 'a_vistoriar' || b.status === 'rascunho'));
          if (!abertos.length) return;
          const b = pick(abertos), quem = b.responsavel_nome ? usuarios.find(u => u.nome === b.responsavel_nome) : pick(campo);
          const de = b.status; b.status = de === 'a_vistoriar' ? 'rascunho' : 'concluido';
          b.responsavel_nome = quem.nome; b.atribuido_a = quem.id; b.versao++; b.atualizado_em = iso(Date.now());
          hist[b.id].unshift({ id: b.id + 'l' + Date.now(), acao: 'status', usuario_nome: quem.nome, em: b.atualizado_em, detalhe: { de, para: b.status } });
          avisar({ tipo: 'campo', id: b.id, codigo: b.codigo, quem: quem.nome, para: b.status });
        }, 9000);
        return () => { const i = ouvintes.indexOf(cb); if (i >= 0) ouvintes.splice(i, 1); if (!ouvintes.length && timer) { clearInterval(timer); timer = null; } };
      },
      assinarParar() { ouvintes.length = 0; if (timer) { clearInterval(timer); timer = null; } },
    };
    function avisar(ev) { ouvintes.slice().forEach(f => { try { f(ev); } catch (e) { /* ignora */ } }); }
    return D;
  }

  function resumo(lista) {
    const r = { total: lista.length, a_vistoriar: 0, rascunho: 0, concluido: 0, devolvido: 0, aprovado: 0, ultima: null };
    lista.forEach(b => { r[b.status] = (r[b.status] || 0) + 1; if (!r.ultima || b.atualizado_em > r.ultima) r.ultima = b.atualizado_em; });
    return r;
  }

  function placeholderFoto(cat, cod) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#E7E2DC"/><path d="M0 330 L640 290 V480 H0Z" fill="#CFC8BF"/><circle cx="320" cy="250" r="78" fill="#8E877F"/><circle cx="320" cy="250" r="58" fill="#3D3935"/><text x="20" y="40" font-family="sans-serif" font-size="26" font-weight="700" fill="#16201A">${cat}</text><text x="20" y="72" font-family="sans-serif" font-size="20" fill="#56635A">${cod} · foto de exemplo</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ================================================================ SUPABASE */
  function criarSupabase() {
    let sb = null, perfil = null, canal = null;
    const COLS = 'id,projeto_id,codigo,cadastro_id,km,status,atribuido_a,responsavel_nome,latitude,longitude,leste,norte,zona,atualizado_em,versao,revisado_por,revisado_em,comentario_revisao';
    function carregarLib() {
      return new Promise((ok, er) => {
        if (window.supabase && window.supabase.createClient) return ok();
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
        s.onload = () => ok(); s.onerror = () => er(new Error('Não foi possível carregar a biblioteca do Supabase (sem internet?).'));
        document.head.appendChild(s);
      });
    }
    const erro = e => { if (e) throw new Error(e.message || String(e)); };
    async function lerPerfil() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;
      const { data, error } = await sb.from('perfis').select('id,nome,email,papel,ativo,organizacao_id').eq('id', session.user.id).maybeSingle();
      erro(error);
      if (!data || !data.ativo) { await sb.auth.signOut(); return null; }
      if (data.papel === 'campo') { await sb.auth.signOut(); throw new Error('Este painel é para o escritório (administrador ou gestor).'); }
      return data;
    }
    const D = {
      modo: 'supabase',
      async iniciar() { await carregarLib(); sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); perfil = await lerPerfil(); return perfil; },
      async entrar(email, senha) {
        const { error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password: senha });
        if (error) throw new Error(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message);
        perfil = await lerPerfil();
        if (!perfil) throw new Error('Sua conta ainda não tem acesso. Peça ao administrador para cadastrar o seu convite.');
        return perfil;
      },
      async sair() { if (canal) { sb.removeChannel(canal); canal = null; } await sb.auth.signOut(); perfil = null; },
      perfil() { return perfil; },
      async projetos() {
        const { data, error } = await sb.from('projetos').select('id,nome,rodovia,descricao,fuso,hemisferio,ativo').eq('ativo', true).order('nome'); erro(error);
        const { data: bs, error: e2 } = await sb.from('bueiros').select('projeto_id,status,atualizado_em'); erro(e2);
        return data.map(p => ({ ...p, resumo: resumo((bs || []).filter(b => b.projeto_id === p.id)) }));
      },
      async bueiros(projetoId) { const { data, error } = await sb.from('bueiros').select(COLS).eq('projeto_id', projetoId).order('codigo'); erro(error); return data; },
      async bueiro(id) { const { data, error } = await sb.from('bueiros').select(COLS + ',dados').eq('id', id).maybeSingle(); erro(error); return data; },
      async historico(id) {
        const { data, error } = await sb.from('historico').select('id,acao,detalhe,em,usuario_id').eq('bueiro_id', id).order('em', { ascending: false }).limit(100); erro(error);
        const { data: us } = await sb.from('perfis').select('id,nome');
        const nomes = {}; (us || []).forEach(u => { nomes[u.id] = u.nome; });
        return data.map(h => ({ ...h, usuario_nome: nomes[h.usuario_id] || '—' }));
      },
      async fotos(id) {
        const { data, error } = await sb.from('fotos').select('id,storage_path,categoria,legenda').eq('bueiro_id', id); erro(error);
        const out = [];
        for (const f of data || []) {
          const { data: s } = await sb.storage.from('fotos').createSignedUrl(f.storage_path, 3600);
          out.push({ id: f.id, categoria: f.categoria, legenda: f.legenda, url: s ? s.signedUrl : '' });
        }
        return out;
      },
      async usuarios() { const { data, error } = await sb.from('perfis').select('id,nome,email,papel,ativo').order('nome'); erro(error); return data; },
      async revisar(id, aprovar, comentario) { const { error } = await sb.rpc('revisar_bueiro', { p_id: id, p_aprovar: aprovar, p_comentario: comentario || null }); erro(error); },
      async atribuir(ids, usuarioId) { const { data, error } = await sb.rpc('atribuir_bueiros', { p_ids: ids, p_usuario: usuarioId || null }); erro(error); return data; },
      async convidar(email, nome, papel) {
        if (perfil.papel !== 'admin') throw new Error('Só o administrador convida pessoas.');
        const { error } = await sb.from('convites').insert({ organizacao_id: perfil.organizacao_id, email: String(email).trim(), nome: nome || null, papel, criado_por: perfil.id }); erro(error);
      },
      assinar(projetoId, cb) {
        canal = sb.channel('bueiros-' + projetoId)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'bueiros', filter: 'projeto_id=eq.' + projetoId }, p => {
            const n = p.new || {}; cb({ tipo: 'campo', id: n.id, codigo: n.codigo, quem: n.responsavel_nome, para: n.status });
          }).subscribe();
        return () => { if (canal) { sb.removeChannel(canal); canal = null; } };
      },
      assinarParar() { if (canal) { sb.removeChannel(canal); canal = null; } },
    };
    return D;
  }

  const usaServidor = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  window.Dados = { STATUS, resumo, usaServidor, criar: () => (usaServidor ? criarSupabase() : criarDemo()) };
})();
