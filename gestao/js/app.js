/* app.js — painel de gestão: telas, rotas e interação. Usa window.Dados (demo ou Supabase). */
(function () {
  'use strict';
  const BU = window.BU || {}, U = BU.U || { esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  const esc = U.esc;
  const raiz = document.getElementById('raiz');
  const D = window.Dados.criar();

  const ROT = { a_vistoriar: 'A vistoriar', rascunho: 'Em andamento', concluido: 'Aguardando revisão', devolvido: 'Devolvido', aprovado: 'Aprovado', nao_localizado: 'Não localizado' };
  const ORDEM = ['aprovado', 'concluido', 'nao_localizado', 'devolvido', 'rascunho', 'a_vistoriar'];
  const COR = { a_vistoriar: '#6B7280', rascunho: '#9A6700', concluido: '#1F5FBF', devolvido: '#B42318', aprovado: '#1B7F4B', nao_localizado: '#7B4FC4' };
  const chip = s => `<span class="chip" style="--c:${COR[s] || '#555'}">${esc(ROT[s] || s)}</span>`;
  const quando = iso => {
    if (!iso) return '—';
    const m = (Date.now() - Date.parse(iso)) / 60000;
    if (m < 1) return 'agora'; if (m < 60) return `há ${Math.round(m)} min`; if (m < 1440) return `há ${Math.round(m / 60)} h`;
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  const fmt = (v, d = 3) => (BU.GPS && v != null && v !== '' ? BU.GPS.fmtM(Number(v), d) : (v == null ? '—' : String(v)));

  const S = { perfil: null, projetos: [], projeto: null, bueiros: [], usuarios: [], membros: [], filtro: { q: '', st: '', resp: '', ord: 'codigo', dir: 1 }, sel: new Set(), parar: null, mapa: null };
  /* "felipe" -> felipe@gfa-campo.app (login por usuário, sem e-mail real); com @ fica como está */
  const DOM = (window.GESTAO_CONFIG || {}).USUARIO_DOMINIO || 'gfa-campo.app';
  const paraEmail = v => { v = String(v || '').trim().toLowerCase(); return v.includes('@') ? v : v.replace(/\s+/g, '') + '@' + DOM; };
  const mostraUsuario = e => (String(e || '').endsWith('@' + DOM) ? String(e).slice(0, -(DOM.length + 1)) + ' (usuário)' : e);
  const nomeDe = id => { const u = S.usuarios.find(x => x.id === id); return u ? u.nome : '—'; };

  function toast(html, ms = 5000) {
    const t = document.getElementById('toast'); t.innerHTML = html; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
  }

  /* ---------------------------------------------------------------- estrutura */
  function topo(abaAtual) {
    const p = S.projeto, rota = location.hash;
    const aba = (h, t, k) => `<a href="${h}"${abaAtual === k ? ' aria-current="page"' : ''}>${t}</a>`;
    return `<header class="topo">
        <a href="#/"><img src="logo-gfa.png" alt="GFA Engenharia"></a>
        <span class="tit">Gestão de Bueiros<span class="sub">${p ? esc(p.nome) : 'Acompanhamento do levantamento de campo'}</span></span>
        <span class="esp"></span>
        ${D.modo === 'demo' ? '<span class="pill demo" title="Dados fictícios; nada é gravado em servidor">MODO DEMONSTRAÇÃO</span>' : '<span class="pill live">● ao vivo</span>'}
        <span class="small muted">${esc(S.perfil.nome)} · ${esc(S.perfil.papel)}</span>
        <button class="btn sm" data-a="sair">Sair</button>
      </header>
      <nav class="abas" aria-label="Seções">
        ${aba('#/', 'Projetos', 'projetos')}
        ${p ? aba(`#/p/${p.id}`, 'Visão geral', 'geral') + aba(`#/p/${p.id}/planejamento`, 'Planejamento', 'planejamento') + aba(`#/p/${p.id}/bueiros`, 'Bueiros (mapa e tabela)', 'bueiros') : ''}
        ${aba('#/equipe', 'Equipe e acessos', 'equipe')}
      </nav>`;
  }
  function pagina(aba, corpo) { raiz.innerHTML = topo(aba) + `<main>${corpo}</main>`; }

  /* ---------------------------------------------------------------- login */
  function telaLogin(msg, email) {
    raiz.innerHTML = `<form class="login card" id="f-login" autocomplete="on">
      <img src="logo-gfa.png" alt="GFA Engenharia"><h1 style="text-align:center">Gestão de Bueiros</h1>
      ${D.modo === 'demo' ? '<div class="aviso"><b>Modo demonstração.</b> Dados fictícios. Entre com <b>arthur@gfa.demo</b> e a senha <b>demo</b>, ou use o botão abaixo.</div>' : ''}
      ${msg ? `<div class="erro" role="alert">${esc(msg)}</div>` : ''}
      <label class="f">E-mail ou usuário<input type="text" name="email" required autocomplete="username" autocapitalize="none" value="${esc(email || (D.modo === 'demo' ? 'arthur@gfa.demo' : ''))}"></label>
      <label class="f">Senha${BU.UI ? BU.UI.senhaHTML({ name: 'senha', value: D.modo === 'demo' ? 'demo' : '' }) : `<input type="password" name="senha" required autocomplete="current-password" value="${D.modo === 'demo' ? 'demo' : ''}">`}</label>
      <button class="btn pri" type="submit">Entrar</button>
      <p class="small muted" style="margin:0">Acesso só para administradores e gestores. A equipe de campo usa o aplicativo do celular.</p></form>`;
  }

  /* ---------------------------------------------------------------- dados */
  async function carregarProjetos() { S.projetos = await D.projetos(); }
  async function carregarProjeto(id) {
    S.projeto = S.projetos.find(p => p.id === id) || null;
    if (!S.projeto) return false;
    S.bueiros = await D.bueiros(id);
    return true;
  }
  function assinar() {
    if (S.parar) S.parar();
    S.parar = D.assinar(S.projeto.id, async ev => {
      S.bueiros = await D.bueiros(S.projeto.id);
      const r = location.hash;
      if (ev.codigo) toast(`<b>${esc(ev.quem || 'Campo')}</b> atualizou <b>${esc(ev.codigo)}</b>: ${esc(ROT[ev.para] || ev.para)}. <a href="#/p/${S.projeto.id}/b/${ev.id}">Ver</a>`);
      if (/^#\/p\/[^/]+$/.test(r)) viewGeral(); else if (/\/bueiros$/.test(r)) viewBueiros();
    });
  }

  /* ---------------------------------------------------------------- projetos */
  const podeCriar = () => S.perfil && (S.perfil.papel === 'admin' || S.perfil.papel === 'gestor');
  function barra(r) {
    const t = r.total || 1;
    return `<div class="bar" role="img" aria-label="${ORDEM.map(k => `${ROT[k]}: ${r[k] || 0}`).join(', ')}">${ORDEM.map(k => `<span style="width:${(100 * (r[k] || 0)) / t}%;background:${COR[k]}"></span>`).join('')}</div>`;
  }
  const legenda = r => `<div class="leg">${ORDEM.map(k => `<span><i style="background:${COR[k]}"></i>${ROT[k]} <b>${r[k] || 0}</b></span>`).join('')}</div>`;

  async function viewProjetos() {
    S.projeto = null; if (S.parar) { S.parar(); S.parar = null; }
    await carregarProjetos();
    pagina('projetos', `<div class="linha"><h1>Projetos</h1><span class="esp"></span>${podeCriar() ? '<a class="btn pri" href="#/novo" style="display:inline-flex;align-items:center;text-decoration:none">+ Novo projeto</a>' : ''}</div>
      ${S.projetos.length ? '' : `<div class="card"><p style="margin:0">Você ainda não participa de nenhum projeto.${podeCriar() ? ' Clique em <b>+ Novo projeto</b> para começar.' : ''}</p></div>`}
      <div class="grid g2">${S.projetos.map(p => `<a class="card proj" href="#/p/${p.id}">
        <div><h2>${esc(p.nome)}</h2><span class="muted small">${esc(p.rodovia || '')} ${p.descricao ? '· ' + esc(p.descricao) : ''}</span></div>
        ${p.resumo.total ? barra(p.resumo) + legenda(p.resumo) : '<span class="muted">Nenhum bueiro cadastrado ainda.</span>'}
        <span class="small muted">${p.resumo.total} bueiros · última atividade ${quando(p.resumo.ultima)}</span></a>`).join('')}</div>`);
  }

  /* ---------------------------------------------------------------- visão geral */
  function viewGeral() {
    const r = window.Dados.resumo(S.bueiros), pc = r.total ? Math.round((100 * r.aprovado) / r.total) : 0;
    const fila = S.bueiros.filter(b => b.status === 'concluido').sort((a, b) => a.atualizado_em.localeCompare(b.atualizado_em));
    const por = {};
    S.bueiros.forEach(b => { if (b.responsavel_nome && (b.status === 'concluido' || b.status === 'aprovado')) por[b.responsavel_nome] = (por[b.responsavel_nome] || 0) + 1; });
    const ranking = Object.entries(por).sort((a, b) => b[1] - a[1]), max = ranking.length ? ranking[0][1] : 1;
    const recentes = S.bueiros.slice().sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em)).slice(0, 8);
    const pessoas = S.usuarios.filter(u => u.papel !== 'admin');
    pagina('geral', `<div class="linha"><h1>${esc(S.projeto.nome)}</h1><a class="small" href="#/p/${S.projeto.id}/editar">Editar projeto</a><span class="esp"></span><span class="muted small">${D.modo === 'demo' ? 'Simulação ao vivo: a cada poucos segundos alguém do campo atualiza um bueiro.' : 'Atualiza sozinho quando o campo sincroniza.'}</span></div>
      <div class="grid g4">
        <div class="card kpi"><b>${r.total}</b><span>bueiros no projeto</span></div>
        <div class="card kpi"><b>${pc}%</b><span>aprovados (${r.aprovado} de ${r.total})</span></div>
        <div class="card kpi alerta"><b>${r.concluido}</b><span>aguardando a sua revisão</span></div>
        <div class="card kpi"><b style="color:var(--st-devolvido)">${r.devolvido}</b><span>devolvidos ao campo</span></div>
      </div>
      ${podeCriar() ? `<div class="card plan-cta"><div class="linha"><div><h3>Planejamento do levantamento</h3><span class="small">Importe o KMZ do Google Earth, marque os bueiros no mapa, divida a rodovia em km e nomeie cada bueiro (ex.: RJ-000 km 170+470). Eles chegam ao campo como “A vistoriar”.</span></div><span class="esp"></span><a class="btn pri" href="#/p/${S.projeto.id}/planejamento" style="text-decoration:none;display:inline-flex;align-items:center">Planejar bueiros</a></div></div>` : ''}
      <div class="card"><h3>Andamento</h3><div style="margin-top:10px">${barra(r)}${legenda(r)}</div></div>
      <div class="grid g2">
        <div class="card"><div class="linha"><h3>Fila de revisão</h3><span class="esp"></span><span class="muted small">mais antigos primeiro</span></div>
          ${fila.length ? `<ul class="hist" style="margin-top:10px">${fila.slice(0, 8).map(b => `<li><a href="#/p/${S.projeto.id}/b/${b.id}"><b>${esc(b.codigo)}</b></a> · km ${esc(b.km || '—')} · ${esc(b.responsavel_nome || '—')}<small>concluído ${quando(b.atualizado_em)}</small></li>`).join('')}</ul>${fila.length > 8 ? `<p class="small muted">+ ${fila.length - 8} na tabela de bueiros.</p>` : ''}` : '<p class="muted">Nada aguardando revisão.</p>'}</div>
        <div class="card"><h3>Produção por pessoa</h3>
          ${ranking.length ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">${ranking.map(([n, v]) => `<div><div class="linha small"><b>${esc(n)}</b><span class="esp"></span>${v} concluídos</div><div class="bar"><span style="width:${(100 * v) / max}%;background:var(--marca)"></span></div></div>`).join('')}</div>` : '<p class="muted">Ainda sem produção.</p>'}</div>
      </div>
      <div class="card"><h3>Equipe do projeto</h3><p class="muted small" style="margin:4px 0 10px">Só quem está marcado enxerga este projeto (o administrador enxerga todos). A equipe de campo precisa estar marcada para ver e levantar os bueiros.</p>
        <div id="equipe-proj" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 14px">${pessoas.map(u => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-membro="${u.id}"${S.membros.includes(u.id) || u.id === S.perfil.id ? ' checked' : ''}${u.id === S.perfil.id ? ' disabled' : ''}> ${esc(u.nome)} <span class="muted small">(${u.papel === 'campo' ? 'campo' : 'gestor'})</span></label>`).join('') || '<span class="muted">Nenhuma pessoa cadastrada.</span>'}</div>
        <div class="linha" style="margin-top:12px"><button class="btn pri sm" data-a="salvar-equipe">Salvar equipe</button><span id="equipe-msg" class="small"></span></div></div>
      <div class="card"><h3>Últimas atualizações</h3><div class="tab-wrap" style="margin-top:10px;max-height:none"><table><thead><tr><th>Código</th><th>Km</th><th>Situação</th><th>Responsável</th><th>Quando</th></tr></thead><tbody>
        ${recentes.map(b => `<tr data-ir="${b.id}"><td><b>${esc(b.codigo)}</b></td><td>${esc(b.km || '—')}</td><td>${chip(b.status)}</td><td>${esc(b.responsavel_nome || '—')}</td><td>${quando(b.atualizado_em)}</td></tr>`).join('')}</tbody></table></div></div>`);
  }

  /* ---------------------------------------------------------------- bueiros (tabela + mapa) */
  function filtrados() {
    const f = S.filtro, q = f.q.trim().toLowerCase();
    let l = S.bueiros.filter(b => (!f.st || b.status === f.st) && (!f.resp || (f.resp === '_sem' ? !b.atribuido_a : b.atribuido_a === f.resp)) &&
      (!q || [b.codigo, b.km, b.cadastro_id, b.responsavel_nome].some(x => String(x || '').toLowerCase().includes(q))));
    const k = f.ord, d = f.dir;
    l.sort((a, b) => { const x = a[k] == null ? '' : a[k], y = b[k] == null ? '' : b[k]; return (x < y ? -1 : x > y ? 1 : 0) * d || a.codigo.localeCompare(b.codigo, 'pt', { numeric: true }); });
    return l;
  }
  const TH = [['codigo', 'Código'], ['km', 'Km'], ['status', 'Situação'], ['responsavel_nome', 'Responsável'], ['atualizado_em', 'Atualizado']];

  function viewBueiros() {
    const lista = filtrados(), f = S.filtro, campo = S.usuarios.filter(u => u.papel === 'campo');
    const foco = document.activeElement && document.activeElement.id === 'f-q';
    pagina('bueiros', `<div class="linha"><h1>Bueiros</h1><span class="esp"></span>
        <button class="btn pri" data-a="exportar">Exportar…</button></div>
      <div class="card filtros">
        <label class="f">Buscar<input type="search" id="f-q" placeholder="código, km, responsável" value="${esc(f.q)}"></label>
        <label class="f">Situação<select id="f-st"><option value="">Todas</option>${ORDEM.map(k => `<option value="${k}"${f.st === k ? ' selected' : ''}>${ROT[k]}</option>`).join('')}</select></label>
        <label class="f">Atribuído a<select id="f-resp"><option value="">Todos</option><option value="_sem"${f.resp === '_sem' ? ' selected' : ''}>Sem atribuição</option>${campo.map(u => `<option value="${u.id}"${f.resp === u.id ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label>
        <span class="muted small">${lista.length} de ${S.bueiros.length}</span></div>
      <div class="card linha" id="barra-atrib"><b>${S.sel.size}</b> selecionado(s)
        <select id="atrib-quem" style="max-width:240px"><option value="">Escolha a pessoa de campo…</option><option value="_nenhum">(remover atribuição)</option>${campo.map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}</select>
        <button class="btn pri sm" data-a="atribuir"${S.sel.size ? '' : ' disabled'}>Atribuir</button>
        <button class="btn sm" data-a="sel-todos">Selecionar os filtrados</button><button class="btn sm" data-a="sel-nenhum">Limpar</button>
        <span class="muted small">Só bueiros ainda não concluídos podem ser atribuídos.</span></div>
      <div class="split"><div class="tab-wrap"><table><thead><tr><th></th>${TH.map(([k, t]) => `<th data-ord="${k}">${t}${f.ord === k ? (f.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
        ${lista.map(b => `<tr data-ir="${b.id}" data-b="${b.id}"><td><input type="checkbox" data-sel="${b.id}" aria-label="Selecionar ${esc(b.codigo)}"${S.sel.has(b.id) ? ' checked' : ''}></td><td><b>${esc(b.codigo)}</b></td><td>${esc(b.km || '—')}</td><td>${chip(b.status)}</td><td>${esc(b.responsavel_nome || (b.atribuido_a ? nomeDe(b.atribuido_a) + ' (atrib.)' : '—'))}</td><td>${quando(b.atualizado_em)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum bueiro com esses filtros.</td></tr>'}</tbody></table></div>
      <div><div id="mapa" role="application" aria-label="Mapa dos bueiros"></div><div class="leg" style="margin-top:6px">${ORDEM.map(k => `<span><i style="background:${COR[k]}"></i>${ROT[k]}</span>`).join('')}</div></div></div>`);
    if (foco) { const i = document.getElementById('f-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    desenharMapa(lista);
  }

  function carregarLeaflet() {
    return new Promise(ok => {
      if (window.L) return ok(true);
      const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(c);
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = () => ok(true); s.onerror = () => ok(false); document.head.appendChild(s);
    });
  }
  async function desenharMapa(lista) {
    const el = document.getElementById('mapa'); if (!el) return;
    const pts = lista.filter(b => b.latitude != null && b.longitude != null);
    if (!pts.length) { el.innerHTML = '<p class="muted" style="padding:16px">Sem coordenadas para mostrar.</p>'; return; }
    const tem = await carregarLeaflet();
    if (document.getElementById('mapa') !== el) return;
    if (!tem) { return mapaSimples(el, pts); }
    if (S.mapa) { try { S.mapa.remove(); } catch (e) { /* já removido */ } S.mapa = null; }
    const m = L.map(el); S.mapa = m;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    const g = L.featureGroup();
    pts.forEach(b => {
      const mk = L.circleMarker([b.latitude, b.longitude], { radius: 8, color: '#fff', weight: 2, fillColor: COR[b.status], fillOpacity: 1 }).addTo(g);
      mk.bindPopup(`<b>${esc(b.codigo)}</b><br>km ${esc(b.km || '—')} · ${esc(ROT[b.status])}<br><a href="#/p/${S.projeto.id}/b/${b.id}">Abrir</a>`);
      mk.on('mouseover', () => { document.querySelectorAll('tr.sel').forEach(t => t.classList.remove('sel')); const t = document.querySelector(`tr[data-b="${b.id}"]`); if (t) t.classList.add('sel'); });
    });
    g.addTo(m); m.fitBounds(g.getBounds().pad(0.15));
  }
  function mapaSimples(el, pts) {
    const la = pts.map(b => b.latitude), lo = pts.map(b => b.longitude), a0 = Math.min(...la), a1 = Math.max(...la), o0 = Math.min(...lo), o1 = Math.max(...lo);
    const W = 600, H = 560, px = o => 30 + ((o - o0) / ((o1 - o0) || 1)) * (W - 60), py = a => H - 30 - ((a - a0) / ((a1 - a0) || 1)) * (H - 60);
    el.innerHTML = `<svg class="mapa-svg" viewBox="0 0 ${W} ${H}"><text x="12" y="20" font-size="12" fill="#565C63">Mapa simples (sem fundo: não foi possível carregar o mapa-base)</text>${pts.map(b => `<a href="#/p/${S.projeto.id}/b/${b.id}"><circle cx="${px(b.longitude).toFixed(1)}" cy="${py(b.latitude).toFixed(1)}" r="8" fill="${COR[b.status]}" stroke="#fff" stroke-width="2"><title>${esc(b.codigo)} · ${esc(ROT[b.status])}</title></circle></a>`).join('')}</svg>`;
  }

  function csv() {
    const l = filtrados(), linhas = [['codigo', 'cadastro_id', 'km', 'situacao', 'responsavel', 'atribuido_a', 'leste', 'norte', 'zona', 'latitude', 'longitude', 'atualizado_em', 'comentario_revisao']];
    l.forEach(b => linhas.push([b.codigo, b.cadastro_id, b.km, ROT[b.status], b.responsavel_nome, nomeDe(b.atribuido_a), b.leste, b.norte, b.zona, b.latitude, b.longitude, b.atualizado_em, b.comentario_revisao]));
    const txt = '﻿' + linhas.map(r => r.map(c => { const s = c == null ? '' : String(c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = 'bueiros_' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------------------------------------------------------- detalhe */
  async function viewDetalhe(id) {
    const [b, hist, fotos, eixo, pres] = await Promise.all([D.bueiro(id), D.historico(id), D.fotos(id), D.eixo(S.projeto.id).catch(() => null), (D.presencas ? D.presencas(id) : Promise.resolve([])).catch(() => [])]);
    if (!b) { pagina('bueiros', '<div class="erro">Bueiro não encontrado.</div>'); return; }
    const d = b.dados || {}, c = d.caracteristicas || {}, campo = S.usuarios.filter(u => u.papel === 'campo');
    let prancha = '';
    if (BU.Prancha && Array.isArray(d.pontos) && d.pontos.length) {
      try { BU.Prancha.sincronizarMedicoes(d); prancha = BU.Prancha.gerarSVG(d, { foco: 'tudo' }); } catch (e) { prancha = ''; }
    }
    const revisavel = ['concluido', 'nao_localizado'].includes(b.status);
    const volta = `#/p/${S.projeto.id}/bueiros`;
    pagina('bueiros', `<div class="crumb"><a href="${volta}">← Bueiros</a></div>
      <div class="linha"><h1>${esc(b.codigo)}</h1>${chip(b.status)}<span class="esp"></span><span class="muted small">versão ${esc(b.versao)} · atualizado ${quando(b.atualizado_em)}</span></div>
      <div class="grid g2">
        <div class="card"><h3>Identificação</h3><dl class="kv" style="margin-top:10px">
          <dt>Km</dt><dd>${esc(b.km || '—')}</dd><dt>Rodovia / local</dt><dd>${esc([d.estrada, d.municipio, d.estado].filter(Boolean).join(' · ') || '—')}</dd>
          <dt>Coordenadas</dt><dd>${b.leste != null ? `E ${fmt(b.leste)} · N ${fmt(b.norte)}<br><span class="muted small">UTM ${esc(b.zona || '')}${esc(d.hemisferio || 'S')} · SIRGAS 2000</span>` : '—'}</dd>
          <dt>RTK</dt><dd>${d.rtk && (d.rtk.solucao || d.rtk.precisaoH != null) ? esc([d.rtk.solucao, d.rtk.precisaoH != null ? 'H ' + String(d.rtk.precisaoH).replace('.', ',') + ' m' : '', d.rtk.precisaoV != null ? 'V ' + String(d.rtk.precisaoV).replace('.', ',') + ' m' : '', d.rtk.base, d.rtk.tipoAltitude ? 'altitude ' + d.rtk.tipoAltitude.toLowerCase() : ''].filter(Boolean).join(' · ')) : '—'}</dd>
          <dt>Responsável</dt><dd>${esc(b.responsavel_nome || '—')}</dd><dt>Atribuído a</dt><dd>${esc(nomeDe(b.atribuido_a))}</dd><dt>Cadastro</dt><dd>${esc(b.cadastro_id || '—')}</dd></dl>
          ${['a_vistoriar', 'rascunho', 'devolvido'].includes(b.status) ? `<div class="linha" style="margin-top:12px"><select id="d-atrib" style="max-width:220px"><option value="">Atribuir a…</option><option value="_nenhum">(remover)</option>${campo.map(u => `<option value="${u.id}"${b.atribuido_a === u.id ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')}</select><button class="btn sm" data-a="atrib-um" data-id="${b.id}">Atribuir</button></div>` : ''}</div>
        <div class="card"><h3>Características</h3><dl class="kv" style="margin-top:10px">
          <dt>Tipo</dt><dd>${esc(((d.meta && d.meta.sigla) ? d.meta.sigla + ' · ' : '') + (c.tipo || '—'))}${d.classificacao ? ' <span class="muted small">(' + esc(d.classificacao) + ')</span>' : ''}</dd><dt>Boca montante / jusante</dt><dd>${esc(((d.bocas && d.bocas.montante && d.bocas.montante.tipo) || '—') + ' / ' + ((d.bocas && d.bocas.jusante && d.bocas.jusante.tipo) || '—'))}${d.bocas && d.bocas.jusante && d.bocas.jusante.estadoDissipador ? '<br><span class="muted small">Dissipador: ' + esc(d.bocas.jusante.estadoDissipador) + '</span>' : ''}</dd><dt>Material</dt><dd>${esc(c.material || '—')}</dd>
          <dt>Dimensão</dt><dd>${c.diametro != null ? 'Ø ' + esc(c.diametro) + ' m' : (c.largura != null ? esc(c.largura) + ' × ' + esc(c.altura) + ' m' : '—')}</dd>
          <dt>Conservação</dt><dd>${esc(c.conservacao || '—')}</dd><dt>Assoreamento</dt><dd>${esc(c.assoreamento || '—')}</dd></dl>
          ${d.observacoes ? `<p class="small" style="margin-bottom:0"><b>Observações:</b> ${esc(d.observacoes)}</p>` : ''}</div>
      </div>
      <div class="card"><h3>Presença da equipe <span class="muted small">(botão “GPS aqui”)</span></h3>${pres.length ? `<div class="tab-wrap" style="margin-top:8px;max-height:200px"><table><thead><tr><th>Quando</th><th>Quem</th><th>Precisão</th><th>Do ponto planejado</th></tr></thead><tbody>${pres.map(r => `<tr style="cursor:default"><td>${quando(r.em)}</td><td>${esc(r.usuario_nome || '—')}</td><td>${r.precisao_m != null ? '± ' + esc(String(r.precisao_m).replace('.', ',')) + ' m' : '—'}</td><td>${r.dist_planejado_m != null ? esc(String(Math.round(r.dist_planejado_m))) + ' m' : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small" style="margin:8px 0 0">Nenhum registro de presença ainda (a equipe ainda não tocou em “GPS aqui” neste bueiro, ou o script 11 do servidor não foi rodado).</p>'}</div>
      ${d.naoLocalizado ? `<div class="card" style="border-left:6px solid #7B4FC4"><h3>Não localizado em campo</h3><p style="margin:8px 0 0"><b>${esc(d.naoLocalizado.motivo || '')}</b>${d.naoLocalizado.obs ? ' — ' + esc(d.naoLocalizado.obs) : ''}</p>${d.naoLocalizado.gps ? `<p class="muted small" style="margin:6px 0 0">Posição do GPS do celular: ${(+d.naoLocalizado.gps.latitude).toFixed(6)}, ${(+d.naoLocalizado.gps.longitude).toFixed(6)} · <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${d.naoLocalizado.gps.latitude},${d.naoLocalizado.gps.longitude}">Google Maps</a></p>` : ''}</div>` : ''}
      ${(() => { const cf = BU.Conf ? BU.Conf.analisar({ ...d, status: b.status }, eixo) : []; return cf.length ? `<div class="card"><h3>Conferências automáticas</h3><ul style="margin:8px 0 0;padding-left:18px">${cf.map(k => `<li style="color:${k.n === 'erro' ? 'var(--st-devolvido)' : 'inherit'}">${esc(k.t)}</li>`).join('')}</ul></div>` : ''; })()}
      ${(Array.isArray(d.patologias) && d.patologias.length) || d.semPatologias ? `<div class="card"><h3>Patologias</h3>${d.semPatologias ? '<p class="muted" style="margin:8px 0 0">Sem patologias aparentes.</p>' : `<div class="tab-wrap" style="margin-top:10px;max-height:none"><table><thead><tr><th>Tipo</th><th>Onde</th><th>Gravidade</th><th>Observação</th></tr></thead><tbody>${d.patologias.map(p => `<tr style="cursor:default"><td><b>${esc(p.tipo || '—')}</b></td><td>${esc(p.local || '—')}</td><td>${esc(p.gravidade || '—')}</td><td style="white-space:normal">${esc(p.obs || '')}</td></tr>`).join('')}</tbody></table></div>`}</div>` : ''}
      <div class="card revisao${revisavel ? '' : ' fim'}"><h3>Revisão</h3>
        ${b.comentario_revisao ? `<p class="small" style="margin:8px 0"><b>Último comentário:</b> ${esc(b.comentario_revisao)}</p>` : ''}
        ${revisavel ? `<label class="f" style="margin-top:8px">Comentário (obrigatório para devolver)<textarea id="r-com" placeholder="Ex.: faltou a foto da boca de jusante"></textarea></label>
          <div class="linha" style="margin-top:10px"><button class="btn ok" data-a="aprovar" data-id="${b.id}">Aprovar</button><button class="btn dev" data-a="devolver" data-id="${b.id}">Devolver ao campo</button></div><div id="r-erro"></div>`
        : `<p class="muted" style="margin:8px 0 0">${b.status === 'aprovado' ? 'Bueiro aprovado. Não pode mais ser editado pelo campo.' : b.status === 'devolvido' ? 'Devolvido: aguardando o campo corrigir e concluir de novo.' : 'A revisão fica disponível quando o campo conclui o levantamento.'}</p>`}</div>
      <div class="card"><h3>Prancha (gerada dos pontos RTK)</h3><div style="margin-top:10px">${prancha ? `<div class="prancha">${prancha}</div>` : '<p class="muted" style="margin:0">Sem pontos RTK enviados ainda.</p>'}</div></div>
      <div class="card"><h3>Fotos</h3><div style="margin-top:10px">${fotos.length ? `<div class="fotos">${fotos.map(f => `<figure><a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt="${esc(f.categoria || 'Foto')}" loading="lazy"></a><figcaption>${esc(f.legenda || f.categoria || '')}</figcaption></figure>`).join('')}</div>` : '<p class="muted" style="margin:0">Sem fotos.</p>'}</div></div>
      <div class="card"><h3>Histórico</h3><ul class="hist" style="margin-top:10px">${hist.map(h => `<li><b>${esc(TXT_ACAO(h))}</b><small>${esc(h.usuario_nome || '—')} · ${quando(h.em)}</small>${h.detalhe && h.detalhe.comentario ? `<small>“${esc(h.detalhe.comentario)}”</small>` : ''}</li>`).join('') || '<li>Sem registros.</li>'}</ul></div>`);
  }
  function TXT_ACAO(h) {
    const dt = h.detalhe || {};
    if (h.acao === 'status') return `Status: ${ROT[dt.de] || dt.de || '—'} → ${ROT[dt.para] || dt.para || '—'}`;
    return ({ criado: 'Criado', editado: 'Editado', aprovado: 'Aprovado', devolvido: 'Devolvido ao campo', atribuido: 'Atribuído' + (dt.para ? ' a ' + nomeDe(dt.para) : ' (removido)'), importacao: 'Cadastro importado', planejado: 'Planejado pelo escritório', planejamento: 'Planejamento atualizado' })[h.acao] || h.acao;
  }

  /* ---------------------------------------------------------------- criar / editar projeto */
  const PAPEL = { admin: 'Administrador', gestor: 'Gestor (escritório)', campo: 'Operador (campo)' };
  const podeEquipe = () => S.perfil && ['admin', 'gestor'].includes(S.perfil.papel);
  const SENHA_CH = 'abcdefghjkmnpqrstuvwxyz23456789';
  function gerarSenha(n = 8) { const a = new Uint32Array(n); (window.crypto || { getRandomValues: x => x.forEach((_, i) => (x[i] = Math.random() * 4e9)) }).getRandomValues(a); return [...a].map(v => SENHA_CH[v % SENHA_CH.length]).join(''); }
  const campoSenha = (name, valor) => (BU.UI ? BU.UI.senhaHTML({ name, value: valor || '', auto: 'new-password' }) : `<input type="text" name="${name}" value="${esc(valor || '')}">`);
  const linhaMembro = u => `<label class="memb"><input type="checkbox" name="membro" value="${esc(u.id)}"> <span>${esc(u.nome)}</span> <span class="muted small">${esc(mostraUsuario(u.email).replace(' (usuário)', ''))}</span></label>`;

  async function viewProjetoForm(id) {
    const p = id ? S.projetos.find(x => x.id === id) : { nome: '', rodovia: '', descricao: '', fuso: '23', hemisferio: 'S', ativo: true };
    if (!p) return viewProjetos();
    try { S.usuarios = await D.usuarios(); } catch (e) { /* usa a lista que já temos */ }
    const fusos = (BU.GPS && BU.GPS.ZONAS) || ['18', '19', '20', '21', '22', '23', '24', '25'];
    const ops = S.usuarios.filter(u => u.papel === 'campo' && u.ativo !== false), ges = S.usuarios.filter(u => u.papel === 'gestor' && u.ativo !== false && u.id !== S.perfil.id);
    pagina(id ? 'geral' : 'projetos', `<div class="crumb"><a href="${id ? '#/p/' + id : '#/'}">← Voltar</a></div>
      <div class="linha"><h1>${id ? 'Editar projeto' : 'Novo projeto'}</h1></div>
      <form id="f-proj" class="card grid" style="max-width:760px;gap:14px" data-id="${esc(id || '')}">
        <label class="f">Nome do projeto *<input type="text" name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Cadastro de bueiros BR-101 — Lote 2"></label>
        <div class="grid g2"><label class="f">Rodovia<input type="text" name="rodovia" value="${esc(p.rodovia || '')}" placeholder="BR-101"></label>
          <label class="f">Descrição<input type="text" name="descricao" value="${esc(p.descricao || '')}"></label></div>
        <div class="grid g2"><label class="f">Fuso UTM padrão (SIRGAS 2000)<select name="fuso">${fusos.map(z => `<option value="${z}"${String(p.fuso) === z ? ' selected' : ''}>${z}</option>`).join('')}</select></label>
          <label class="f">Hemisfério<select name="hemisferio"><option value="S"${p.hemisferio !== 'N' ? ' selected' : ''}>Sul</option><option value="N"${p.hemisferio === 'N' ? ' selected' : ''}>Norte</option></select></label></div>
        <p class="muted small" style="margin:-6px 0 0">É só o valor sugerido ao campo. O fuso fica gravado em cada bueiro, junto com o Este e o Norte.</p>
        ${id ? '' : `<fieldset class="quem"><legend>Quem participa (além de você)</legend>
          <div class="linha" style="margin-bottom:6px"><b>Operadores (campo)</b><span class="esp"></span><button type="button" class="btn sm" data-a="memb-todos" data-g="campo">Marcar todos</button><button type="button" class="btn sm" data-a="memb-nenhum" data-g="campo">Limpar</button></div>
          <div class="membros" id="lista-operadores">${ops.map(linhaMembro).join('') || '<span class="muted">Nenhum operador cadastrado ainda. Adicione abaixo.</span>'}</div>
          ${ges.length ? `<div class="linha" style="margin:10px 0 6px"><b>Gestores (escritório)</b></div><div class="membros">${ges.map(linhaMembro).join('')}</div>` : ''}
          ${podeEquipe() ? `<details class="addop" style="margin-top:10px"><summary><b>+ Adicionar operador agora</b></summary>
            <div class="grid g2" style="margin-top:8px"><label class="f">Nome<input type="text" id="op-nome" autocomplete="off"></label><label class="f">Usuário (login)<input type="text" id="op-user" autocapitalize="none" autocomplete="off" placeholder="ex.: filipe"></label></div>
            <label class="f" style="margin-top:6px">Senha<span class="linha">${campoSenha('op-senha', gerarSenha())}<button type="button" class="btn sm" data-a="op-gerar">Gerar</button></span></label>
            <div class="linha" style="margin-top:8px"><button type="button" class="btn pri sm" data-a="op-add">Adicionar e marcar</button><span id="op-msg" class="small"></span></div></details>` : ''}</fieldset>`}
        <div id="proj-erro"></div>
        <div class="linha"><button class="btn pri" type="submit">${id ? 'Salvar alterações' : 'Criar projeto'}</button>${id ? '<button class="btn dev" type="button" data-a="arquivar">Arquivar projeto</button>' : ''}</div>
      </form>`);
  }

  /* ---------------------------------------------------------------- equipe */
  async function viewEquipe() {
    S.usuarios = await D.usuarios();
    if (!S.projetos.length) { try { await carregarProjetos(); } catch (e) { /* segue */ } }
    const admin = S.perfil.papel === 'admin', pode = podeEquipe();
    const dom = DOM;
    const gerencia = u => pode && u.id !== S.perfil.id && (admin || u.papel === 'campo');
    const projChecks = S.projetos.map(p => `<label class="memb"><input type="checkbox" name="proj" value="${esc(p.id)}"> <span>${esc(p.nome)}</span></label>`).join('') || '<span class="muted small">Nenhum projeto ainda.</span>';
    const papeis = admin ? '<option value="campo">Operador (usa o app do celular)</option><option value="gestor">Gestor (escritório: revisa e atribui)</option><option value="admin">Administrador</option>' : '<option value="campo">Operador (usa o app do celular)</option>';
    pagina('equipe', `<div class="linha"><h1>Equipe e acessos</h1></div>
      <div class="grid g2"><div class="card"><h3>Quem tem acesso <span class="muted small">(${S.usuarios.length})</span></h3><div class="tab-wrap" style="margin-top:10px;max-height:none"><table><thead><tr><th>Nome</th><th>Usuário / e-mail</th><th>Papel</th><th></th></tr></thead><tbody>
        ${S.usuarios.map(u => `<tr style="cursor:default${u.ativo === false ? ';opacity:.55' : ''}"><td><b>${esc(u.nome)}</b>${u.ativo === false ? ' <span class="muted small">(desativado)</span>' : ''}</td><td>${esc(mostraUsuario(u.email))}</td><td>${esc(PAPEL[u.papel] || u.papel)}${u.convite ? ' <span class="muted small">(convidado)</span>' : ''}</td>
          <td style="white-space:nowrap">${gerencia(u) ? `<button class="btn sm" data-a="pw-reset" data-id="${esc(u.id)}" data-nome="${esc(u.nome)}">Nova senha</button> <button class="btn sm" data-a="pessoa-ativo" data-id="${esc(u.id)}" data-ativo="${u.ativo === false ? '1' : '0'}">${u.ativo === false ? 'Reativar' : 'Desativar'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
      <div>${pode ? `<div class="card"><h3>Adicionar pessoa</h3><form id="f-pessoa" class="grid" style="margin-top:10px;gap:10px">
        <label class="f">Nome<input type="text" name="nome" required autocomplete="off"></label>
        <label class="f">Usuário ou e-mail<input type="text" name="usuario" required autocapitalize="none" autocomplete="off" placeholder="ex.: filipe  (vira filipe@${esc(dom)})"></label>
        <label class="f">Senha<span class="linha">${campoSenha('senha', gerarSenha())}<button type="button" class="btn sm" data-a="senha-gerar">Gerar</button></span></label>
        <label class="f">Papel<select name="papel">${papeis}</select></label>
        <fieldset class="quem"><legend>Projetos (opcional)</legend><div class="membros">${projChecks}</div></fieldset>
        <button class="btn pri" type="submit">Criar acesso</button><div id="pessoa-msg" class="small"></div>
        <p class="small muted" style="margin:0">A conta já nasce pronta: a pessoa entra no app com o usuário e a senha acima. Anote a senha (ela não aparece de novo) e envie por um canal seguro.</p></form></div>
      <div class="card" style="margin-top:14px"><details><summary><b>Adicionar várias pessoas de uma vez</b></summary>
        <form id="f-lote" class="grid" style="margin-top:10px;gap:10px"><label class="f">Uma pessoa por linha: <code>nome; usuário; senha</code> (senha pode ficar em branco para gerar)<textarea name="lote" rows="6" placeholder="Filipe Silva; filipe\nMaria Souza; maria; abc12345"></textarea></label>
          <label class="f">Papel<select name="papel"><option value="campo">Operador (campo)</option>${admin ? '<option value="gestor">Gestor</option>' : ''}</select></label>
          <button class="btn pri" type="submit">Criar todos</button><div id="lote-msg" class="small"></div></form></details></div>` : '<div class="card"><p class="muted">Só administradores e gestores adicionam pessoas.</p></div>'}</div></div>`);
  }

  /* ---------------------------------------------------------------- roteamento */
  let rotaN = 0;
  async function rotear() {
    if (!S.perfil) return telaLogin();
    const n = ++rotaN, h = location.hash || '#/';
    try {
      if (!S.usuarios.length) S.usuarios = await D.usuarios();
      let m;
      if (h === '#/' || h === '#') return await viewProjetos();
      if (h === '#/equipe') return await viewEquipe();
      if (h === '#/novo') { if (!podeCriar()) return viewProjetos(); S.projeto = null; if (S.parar) { S.parar(); S.parar = null; } return await viewProjetoForm(null); }
      if ((m = h.match(/^#\/p\/([^/]+)(?:\/(bueiros|editar|planejamento|b\/([^/]+)))?$/))) {
        if (!S.projetos.length) await carregarProjetos();
        if (!S.projeto || S.projeto.id !== m[1]) { if (!(await carregarProjeto(m[1]))) return viewProjetos(); assinar(); }
        else S.bueiros = await D.bueiros(m[1]);
        if (n !== rotaN) return;
        if (m[3]) return await viewDetalhe(m[3]);
        if (m[2] !== 'bueiros') S.membros = await D.membros(m[1]);
        if (n !== rotaN) return;
        if (m[2] === 'editar') return await viewProjetoForm(m[1]);
        if (m[2] === 'planejamento') { if (!podeCriar()) return viewGeral(); return await window.Planejamento.view({ S, D, pagina, toast, chip, COR, carregarLeaflet }); }
        return m[2] === 'bueiros' ? viewBueiros() : viewGeral();
      }
      location.hash = '#/';
    } catch (e) { pagina('projetos', `<div class="erro" role="alert">${esc(e.message || e)}</div>`); }
  }

  /* ---------------------------------------------------------------- eventos */
  document.addEventListener('click', async ev => {
    const t = ev.target;
    const a = t.closest('[data-a]');
    if (a) {
      const k = a.dataset.a;
      try {
        if (k === 'sair') { await D.sair(); S.perfil = null; S.projeto = null; S.usuarios = []; location.hash = '#/'; telaLogin(); }
        else if (k === 'csv') csv();
        else if (k === 'exportar') { const eixo = await D.eixo(S.projeto.id).catch(() => null); window.Exportacao.abrir({ projeto: S.projeto, bueiros: S.bueiros, filtrados: filtrados(), nomeDe, D, eixo }); }
        else if (k === 'salvar-equipe') {
          const ids = [...document.querySelectorAll('[data-membro]')].filter(c => c.checked && !c.disabled).map(c => c.dataset.membro);
          await D.definirMembros(S.projeto.id, ids); S.membros = await D.membros(S.projeto.id); toast('Equipe salva.');
        } else if (k === 'arquivar') {
          if (!confirm('Arquivar este projeto? Ele some da lista (os dados continuam no servidor).')) return;
          const id = document.getElementById('f-proj').dataset.id, p = S.projetos.find(x => x.id === id);
          await D.editarProjeto(id, { nome: p.nome, rodovia: p.rodovia, descricao: p.descricao, fuso: p.fuso, hemisferio: p.hemisferio, ativo: false });
          S.projeto = null; S.projetos = []; toast('Projeto arquivado.'); location.hash = '#/';
        }
        else if (k === 'memb-todos' || k === 'memb-nenhum') { document.querySelectorAll('#f-proj [name=membro]').forEach(c => { if (c.closest('#lista-operadores') || a.dataset.g !== 'campo') c.checked = k === 'memb-todos'; }); }
        else if (k === 'senha-gerar' || k === 'op-gerar') { const f = a.closest('form, fieldset'); const i = f && f.querySelector('input[name=senha], input[name=op-senha]'); if (i) i.value = gerarSenha(); }
        else if (k === 'op-add') {
          const nome = document.getElementById('op-nome').value.trim(), user = document.getElementById('op-user').value.trim(), senha = document.querySelector('[name=op-senha]').value, msg = document.getElementById('op-msg');
          if (!nome || !user) { msg.innerHTML = '<span class="erro">Preencha nome e usuário.</span>'; return; }
          a.disabled = true;
          try {
            const r = await D.criarUsuario(user, nome, senha, 'campo', []);
            S.usuarios = await D.usuarios(); const u = S.usuarios.find(x => x.id === r.id) || { id: r.id, nome, email: r.email, papel: 'campo' };
            const lista = document.getElementById('lista-operadores'); if (!lista.querySelector('.memb')) lista.innerHTML = '';
            lista.insertAdjacentHTML('beforeend', linhaMembro(u)); lista.lastElementChild.querySelector('input').checked = true;
            msg.innerHTML = `<span style="color:var(--st-aprovado);font-weight:700">Criado. Usuário <b>${esc(r.usuario)}</b>, senha <b>${esc(senha)}</b> (anote).</span>`;
            document.getElementById('op-nome').value = ''; document.getElementById('op-user').value = ''; document.querySelector('[name=op-senha]').value = gerarSenha();
          } catch (e) { msg.innerHTML = `<span class="erro" role="alert">${esc(e.message || e)}</span>`; }
          a.disabled = false;
        } else if (k === 'pw-reset') {
          const nova = gerarSenha(), ok = prompt(`Nova senha para ${a.dataset.nome} (pode editar):`, nova); if (!ok) return;
          await D.redefinirSenha(a.dataset.id, ok); toast(`Senha de <b>${esc(a.dataset.nome)}</b> trocada para <b>${esc(ok)}</b>. Anote e envie por um canal seguro.`, 15000);
        } else if (k === 'pessoa-ativo') {
          await D.definirAtivo(a.dataset.id, a.dataset.ativo === '1'); toast(a.dataset.ativo === '1' ? 'Acesso reativado.' : 'Acesso desativado.'); viewEquipe();
        }
        else if (k === 'sel-todos') { filtrados().forEach(b => S.sel.add(b.id)); viewBueiros(); }
        else if (k === 'sel-nenhum') { S.sel.clear(); viewBueiros(); }
        else if (k === 'atribuir') {
          const q = document.getElementById('atrib-quem').value; if (!q) return toast('Escolha a pessoa de campo.');
          const n = await D.atribuir([...S.sel], q === '_nenhum' ? null : q); S.sel.clear(); S.bueiros = await D.bueiros(S.projeto.id); viewBueiros(); toast(`${n} bueiro(s) atribuído(s).`);
        } else if (k === 'atrib-um') {
          const q = document.getElementById('d-atrib').value; if (!q) return toast('Escolha a pessoa.');
          await D.atribuir([a.dataset.id], q === '_nenhum' ? null : q); toast('Atribuição salva.'); rotear();
        } else if (k === 'aprovar' || k === 'devolver') {
          const com = (document.getElementById('r-com') || {}).value || '';
          if (k === 'devolver' && !com.trim()) { document.getElementById('r-erro').innerHTML = '<div class="erro" role="alert" style="margin-top:8px">Explique o que precisa ser corrigido.</div>'; return; }
          a.disabled = true; await D.revisar(a.dataset.id, k === 'aprovar', com); toast(k === 'aprovar' ? 'Bueiro aprovado.' : 'Devolvido ao campo.'); rotear();
        }
      } catch (e) { toast(esc(e.message || e)); const r = document.getElementById('r-erro'); if (r) r.innerHTML = `<div class="erro" role="alert" style="margin-top:8px">${esc(e.message || e)}</div>`; a.disabled = false; }
      return;
    }
    const th = t.closest('th[data-ord]');
    if (th) { const k = th.dataset.ord; S.filtro.dir = S.filtro.ord === k ? -S.filtro.dir : 1; S.filtro.ord = k; return viewBueiros(); }
    if (t.matches('[data-sel]')) { t.checked ? S.sel.add(t.dataset.sel) : S.sel.delete(t.dataset.sel); const b = document.querySelector('#barra-atrib b'); if (b) b.textContent = S.sel.size; const bt = document.querySelector('[data-a="atribuir"]'); if (bt) bt.disabled = !S.sel.size; return; }
    const tr = t.closest('tr[data-ir]');
    if (tr && !t.closest('a')) location.hash = `#/p/${S.projeto.id}/b/${tr.dataset.ir}`;
  });
  document.addEventListener('input', ev => { if (ev.target.id === 'f-q') { S.filtro.q = ev.target.value; viewBueiros(); } });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'f-st') { S.filtro.st = ev.target.value; viewBueiros(); }
    else if (ev.target.id === 'f-resp') { S.filtro.resp = ev.target.value; viewBueiros(); }
  });
  document.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    if (f.id === 'f-login') {
      try { S.perfil = await D.entrar(paraEmail(f.email.value), f.senha.value); S.usuarios = await D.usuarios(); rotear(); }
      catch (e) { telaLogin(e.message || String(e), f.email.value); }
    } else if (f.id === 'f-proj') {
      const e = document.getElementById('proj-erro'), id = f.dataset.id, btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      const d = { nome: f.nome.value, rodovia: f.rodovia.value, descricao: f.descricao.value, fuso: f.fuso.value, hemisferio: f.hemisferio.value, membros: [...f.querySelectorAll('[name=membro]:checked')].map(c => c.value) };
      try {
        if (id) { await D.editarProjeto(id, { ...d, ativo: true }); S.projetos = []; await carregarProjetos(); S.projeto = null; toast('Projeto atualizado.'); location.hash = '#/p/' + id; }
        else { const novo = await D.criarProjeto(d); S.projetos = []; S.projeto = null; toast('Projeto criado.'); location.hash = '#/p/' + novo; }
      } catch (er) { e.innerHTML = `<div class="erro" role="alert">${esc(er.message || er)}</div>`; btn.disabled = false; }
    } else if (f.id === 'f-pessoa') {
      const m = document.getElementById('pessoa-msg'), btn = f.querySelector('button[type=submit]'); btn.disabled = true; m.textContent = 'Criando…';
      try {
        const senha = f.senha.value, r = await D.criarUsuario(f.usuario.value, f.nome.value, senha, f.papel.value, [...f.querySelectorAll('[name=proj]:checked')].map(c => c.value));
        S.usuarios = await D.usuarios(); S.membros = [];
        toast(`Acesso criado: usuário <b>${esc(r.usuario)}</b>, senha <b>${esc(senha)}</b>. Anote a senha agora.`, 20000); viewEquipe();
      } catch (e) { m.innerHTML = `<span class="erro" role="alert">${esc(e.message || e)}</span>`; btn.disabled = false; }
    } else if (f.id === 'f-lote') {
      const m = document.getElementById('lote-msg'), btn = f.querySelector('button[type=submit]'); btn.disabled = true; m.textContent = 'Criando…';
      const linhas = f.lote.value.split(/\n+/).map(x => x.trim()).filter(Boolean), res = [];
      for (const ln of linhas) {
        const [nome, user, senha0] = ln.split(/[;\t]/).map(x => (x || '').trim()), senha = senha0 || gerarSenha();
        try { const r = await D.criarUsuario(user || nome, nome, senha, f.papel.value, []); res.push(`<tr><td>${esc(nome)}</td><td>${esc(r.usuario)}</td><td><b>${esc(senha)}</b></td><td style="color:var(--st-aprovado)">ok</td></tr>`); }
        catch (e) { res.push(`<tr><td>${esc(nome)}</td><td>${esc(user || nome)}</td><td>—</td><td class="erro">${esc(e.message || e)}</td></tr>`); }
      }
      S.usuarios = await D.usuarios(); btn.disabled = false;
      m.innerHTML = `<div class="tab-wrap" style="max-height:none"><table><thead><tr><th>Nome</th><th>Usuário</th><th>Senha</th><th></th></tr></thead><tbody>${res.join('')}</tbody></table></div><p class="muted small">Anote as senhas: elas não aparecem de novo.</p>`;
    } else if (f.id === 'f-conv') {
      const m = document.getElementById('conv-msg');
      try { await D.convidar(paraEmail(f.email.value), f.nome.value, f.papel.value); m.innerHTML = '<span style="color:var(--st-aprovado);font-weight:700">Convite cadastrado.</span>'; setTimeout(viewEquipe, 700); }
      catch (e) { m.innerHTML = `<span class="erro" role="alert">${esc(e.message || e)}</span>`; }
    }
  });
  document.addEventListener('keydown', ev => { // Enter nos campos de "adicionar operador" não envia o projeto
    if (ev.key === 'Enter' && ev.target.closest && ev.target.closest('.addop')) { ev.preventDefault(); const b = document.querySelector('[data-a="op-add"]'); if (b) b.click(); }
  });
  window.addEventListener('hashchange', rotear);

  (async function iniciar() {
    try {
      S.perfil = await D.iniciar();
      if (S.perfil) S.usuarios = await D.usuarios();
    } catch (e) { S.perfil = null; return telaLogin(e.message || String(e)); }
    rotear();
  })();

  window.__gestao = { S, D }; // para testes
})();
