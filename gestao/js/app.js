/* app.js — painel de gestão: telas, rotas e interação. Usa window.Dados (demo ou Supabase). */
(function () {
  'use strict';
  const BU = window.BU || {}, U = BU.U || { esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  const esc = U.esc;
  const raiz = document.getElementById('raiz');
  const D = window.Dados.criar();

  const ROT = { a_vistoriar: 'A vistoriar', rascunho: 'Em andamento', concluido: 'Aguardando revisão', devolvido: 'Devolvido', aprovado: 'Aprovado' };
  const ORDEM = ['aprovado', 'concluido', 'devolvido', 'rascunho', 'a_vistoriar'];
  const COR = { a_vistoriar: '#6B7280', rascunho: '#9A6700', concluido: '#1F5FBF', devolvido: '#B42318', aprovado: '#1B7F4B' };
  const chip = s => `<span class="chip" style="--c:${COR[s] || '#555'}">${esc(ROT[s] || s)}</span>`;
  const quando = iso => {
    if (!iso) return '—';
    const m = (Date.now() - Date.parse(iso)) / 60000;
    if (m < 1) return 'agora'; if (m < 60) return `há ${Math.round(m)} min`; if (m < 1440) return `há ${Math.round(m / 60)} h`;
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  const fmt = (v, d = 3) => (BU.GPS && v != null && v !== '' ? BU.GPS.fmtM(Number(v), d) : (v == null ? '—' : String(v)));

  const S = { perfil: null, projetos: [], projeto: null, bueiros: [], usuarios: [], filtro: { q: '', st: '', resp: '', ord: 'codigo', dir: 1 }, sel: new Set(), parar: null, mapa: null };
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
        ${p ? aba(`#/p/${p.id}`, 'Visão geral', 'geral') + aba(`#/p/${p.id}/bueiros`, 'Bueiros (mapa e tabela)', 'bueiros') : ''}
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
      <label class="f">E-mail<input type="email" name="email" required autocomplete="username" value="${esc(email || (D.modo === 'demo' ? 'arthur@gfa.demo' : ''))}"></label>
      <label class="f">Senha<input type="password" name="senha" required autocomplete="current-password" value="${D.modo === 'demo' ? 'demo' : ''}"></label>
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
  function barra(r) {
    const t = r.total || 1;
    return `<div class="bar" role="img" aria-label="${ORDEM.map(k => `${ROT[k]}: ${r[k] || 0}`).join(', ')}">${ORDEM.map(k => `<span style="width:${(100 * (r[k] || 0)) / t}%;background:${COR[k]}"></span>`).join('')}</div>`;
  }
  const legenda = r => `<div class="leg">${ORDEM.map(k => `<span><i style="background:${COR[k]}"></i>${ROT[k]} <b>${r[k] || 0}</b></span>`).join('')}</div>`;

  async function viewProjetos() {
    S.projeto = null; if (S.parar) { S.parar(); S.parar = null; }
    await carregarProjetos();
    pagina('projetos', `<div class="linha"><h1>Projetos</h1></div>
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
    pagina('geral', `<div class="linha"><h1>${esc(S.projeto.nome)}</h1><span class="esp"></span><span class="muted small">${D.modo === 'demo' ? 'Simulação ao vivo: a cada poucos segundos alguém do campo atualiza um bueiro.' : 'Atualiza sozinho quando o campo sincroniza.'}</span></div>
      <div class="grid g4">
        <div class="card kpi"><b>${r.total}</b><span>bueiros no projeto</span></div>
        <div class="card kpi"><b>${pc}%</b><span>aprovados (${r.aprovado} de ${r.total})</span></div>
        <div class="card kpi alerta"><b>${r.concluido}</b><span>aguardando a sua revisão</span></div>
        <div class="card kpi"><b style="color:var(--st-devolvido)">${r.devolvido}</b><span>devolvidos ao campo</span></div>
      </div>
      <div class="card"><h3>Andamento</h3><div style="margin-top:10px">${barra(r)}${legenda(r)}</div></div>
      <div class="grid g2">
        <div class="card"><div class="linha"><h3>Fila de revisão</h3><span class="esp"></span><span class="muted small">mais antigos primeiro</span></div>
          ${fila.length ? `<ul class="hist" style="margin-top:10px">${fila.slice(0, 8).map(b => `<li><a href="#/p/${S.projeto.id}/b/${b.id}"><b>${esc(b.codigo)}</b></a> · km ${esc(b.km || '—')} · ${esc(b.responsavel_nome || '—')}<small>concluído ${quando(b.atualizado_em)}</small></li>`).join('')}</ul>${fila.length > 8 ? `<p class="small muted">+ ${fila.length - 8} na tabela de bueiros.</p>` : ''}` : '<p class="muted">Nada aguardando revisão.</p>'}</div>
        <div class="card"><h3>Produção por pessoa</h3>
          ${ranking.length ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">${ranking.map(([n, v]) => `<div><div class="linha small"><b>${esc(n)}</b><span class="esp"></span>${v} concluídos</div><div class="bar"><span style="width:${(100 * v) / max}%;background:var(--marca)"></span></div></div>`).join('')}</div>` : '<p class="muted">Ainda sem produção.</p>'}</div>
      </div>
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
        <button class="btn" data-a="csv">Exportar CSV</button></div>
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
    const [b, hist, fotos] = await Promise.all([D.bueiro(id), D.historico(id), D.fotos(id)]);
    if (!b) { pagina('bueiros', '<div class="erro">Bueiro não encontrado.</div>'); return; }
    const d = b.dados || {}, c = d.caracteristicas || {}, campo = S.usuarios.filter(u => u.papel === 'campo');
    let prancha = '';
    if (BU.Prancha && Array.isArray(d.pontos) && d.pontos.length) {
      try { BU.Prancha.sincronizarMedicoes(d); prancha = BU.Prancha.gerarSVG(d, { foco: 'tudo' }); } catch (e) { prancha = ''; }
    }
    const revisavel = ['concluido'].includes(b.status);
    const volta = `#/p/${S.projeto.id}/bueiros`;
    pagina('bueiros', `<div class="crumb"><a href="${volta}">← Bueiros</a></div>
      <div class="linha"><h1>${esc(b.codigo)}</h1>${chip(b.status)}<span class="esp"></span><span class="muted small">versão ${esc(b.versao)} · atualizado ${quando(b.atualizado_em)}</span></div>
      <div class="grid g2">
        <div class="card"><h3>Identificação</h3><dl class="kv" style="margin-top:10px">
          <dt>Km</dt><dd>${esc(b.km || '—')}</dd><dt>Rodovia / local</dt><dd>${esc([d.estrada, d.municipio, d.estado].filter(Boolean).join(' · ') || '—')}</dd>
          <dt>Coordenadas</dt><dd>${b.leste != null ? `E ${fmt(b.leste)} · N ${fmt(b.norte)}<br><span class="muted small">UTM ${esc(b.zona || '')}${esc(d.hemisferio || 'S')} · SIRGAS 2000</span>` : '—'}</dd>
          <dt>Responsável</dt><dd>${esc(b.responsavel_nome || '—')}</dd><dt>Atribuído a</dt><dd>${esc(nomeDe(b.atribuido_a))}</dd><dt>Cadastro</dt><dd>${esc(b.cadastro_id || '—')}</dd></dl>
          ${['a_vistoriar', 'rascunho', 'devolvido'].includes(b.status) ? `<div class="linha" style="margin-top:12px"><select id="d-atrib" style="max-width:220px"><option value="">Atribuir a…</option><option value="_nenhum">(remover)</option>${campo.map(u => `<option value="${u.id}"${b.atribuido_a === u.id ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')}</select><button class="btn sm" data-a="atrib-um" data-id="${b.id}">Atribuir</button></div>` : ''}</div>
        <div class="card"><h3>Características</h3><dl class="kv" style="margin-top:10px">
          <dt>Tipo</dt><dd>${esc(c.tipo || '—')}</dd><dt>Formato</dt><dd>${esc(c.formato || '—')}</dd><dt>Material</dt><dd>${esc(c.material || '—')}</dd>
          <dt>Dimensão</dt><dd>${c.diametro != null ? 'Ø ' + esc(c.diametro) + ' m' : (c.largura != null ? esc(c.largura) + ' × ' + esc(c.altura) + ' m' : '—')}</dd>
          <dt>Conservação</dt><dd>${esc(c.conservacao || '—')}</dd><dt>Assoreamento</dt><dd>${esc(c.assoreamento || '—')}</dd></dl>
          ${d.observacoes ? `<p class="small" style="margin-bottom:0"><b>Observações:</b> ${esc(d.observacoes)}</p>` : ''}</div>
      </div>
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
    return ({ criado: 'Criado', editado: 'Editado', aprovado: 'Aprovado', devolvido: 'Devolvido ao campo', atribuido: 'Atribuído' + (dt.para ? ' a ' + nomeDe(dt.para) : ' (removido)'), importacao: 'Cadastro importado' })[h.acao] || h.acao;
  }

  /* ---------------------------------------------------------------- equipe */
  async function viewEquipe() {
    S.usuarios = await D.usuarios();
    const admin = S.perfil.papel === 'admin';
    pagina('equipe', `<div class="linha"><h1>Equipe e acessos</h1></div>
      <div class="grid g2"><div class="card"><h3>Quem tem acesso</h3><div class="tab-wrap" style="margin-top:10px;max-height:none"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th></tr></thead><tbody>
        ${S.usuarios.map(u => `<tr style="cursor:default"><td><b>${esc(u.nome)}</b></td><td>${esc(u.email)}</td><td>${esc({ admin: 'Administrador', gestor: 'Gestor (escritório)', campo: 'Campo' }[u.papel])}${u.convite ? ' <span class="muted small">(convidado)</span>' : ''}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h3>Convidar pessoa</h3>${admin ? `<form id="f-conv" class="grid" style="margin-top:10px;gap:10px">
        <label class="f">Nome<input type="text" name="nome" required></label><label class="f">E-mail<input type="email" name="email" required></label>
        <label class="f">Papel<select name="papel"><option value="campo">Campo (usa o app do celular)</option><option value="gestor">Gestor (escritório: revisa e atribui)</option><option value="admin">Administrador</option></select></label>
        <button class="btn pri" type="submit">Cadastrar convite</button><div id="conv-msg" class="small"></div>
        <p class="small muted" style="margin:0">A pessoa cria a conta com <b>esse e-mail</b> (no Supabase: Authentication → Add user) e entra já com o papel certo. Sem convite, a conta não enxerga nada.</p></form>` : '<p class="muted">Só o administrador convida pessoas.</p>'}</div></div>`);
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
      if ((m = h.match(/^#\/p\/([^/]+)(?:\/(bueiros|b\/([^/]+)))?$/))) {
        if (!S.projetos.length) await carregarProjetos();
        if (!S.projeto || S.projeto.id !== m[1]) { if (!(await carregarProjeto(m[1]))) return viewProjetos(); assinar(); }
        else S.bueiros = await D.bueiros(m[1]);
        if (n !== rotaN) return;
        if (m[3]) return await viewDetalhe(m[3]);
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
      try { S.perfil = await D.entrar(f.email.value, f.senha.value); S.usuarios = await D.usuarios(); rotear(); }
      catch (e) { telaLogin(e.message || String(e), f.email.value); }
    } else if (f.id === 'f-conv') {
      const m = document.getElementById('conv-msg');
      try { await D.convidar(f.email.value, f.nome.value, f.papel.value); m.innerHTML = '<span style="color:var(--st-aprovado);font-weight:700">Convite cadastrado.</span>'; setTimeout(viewEquipe, 700); }
      catch (e) { m.innerHTML = `<span class="erro" role="alert">${esc(e.message || e)}</span>`; }
    }
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
