/* modelo.js — o "formulário" do bueiro: catálogos (listas de opções) e o registro padrão de um levantamento. Expõe BU.Cat e BU.Modelo.
   Usado pelo app de campo, pelo importador de KMZ e pelo painel de gestão (que pré-preenche o bueiro planejado com o cadastro). */
(function () {
  'use strict';
  const BU = (window.BU = window.BU || {});
  const U = BU.U;

  const SCHEMA = 2;
  const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
  const SN = ['Sim', 'Não', 'Não avaliado'];
  const OPCOES = {
    ambiente: ['Rural', 'Urbano'], sentido: ['Crescente', 'Decrescente'],
    pista: ['Norte', 'Sul', 'Leste', 'Oeste', 'Canteiro central'], lado: ['Direito', 'Esquerdo', 'Centro'],
  };

  /* ---------- catálogos (iguais ao HTML de referência) ---------- */
  const Cat = {
    SITUACAO: ['Cadastrado', 'Não cadastrado', 'Novo em campo'],
    CLASSIFICACAO: ['Grota', 'Greide'],
    LINHAS: [[1, 'Simples'], [2, 'Duplo'], [3, 'Triplo'], [4, 'Quádruplo']],
    FORMAS: ['Tubular', 'Celular', 'Lenticular', 'Arco', 'Outra'],
    MATERIAIS: ['Concreto', 'Metálico', 'PEAD', 'PVC', 'Alvenaria / pedra', 'Outro'],
    ESTADOS: ['Bom', 'Regular', 'Precário'],
    BOCA_TIPOS: ['Muro de testa e alas', 'Muro de testa', 'Caixa coletora', 'Boca de lobo', 'Sem boca (ponta livre)', 'Outra'],
    BOCA_MATERIAIS: ['Concreto', 'Concreto ciclópico', 'Alvenaria / pedra', 'Metálica', 'Outro'],
    DISSIPADORES: ['Nenhum', 'Bacia de amortecimento', 'Enrocamento / rachão', 'Dissipador de concreto', 'Descida em degraus', 'Outro'],
    DISPOSITIVOS: [['caixa_coletora', 'Caixa coletora'], ['descida_agua', 'Descida d’água em aterro'], ['valeta_montante', 'Valeta / canal a montante'], ['canal_jusante', 'Canal a jusante'], ['sarjeta', 'Sarjeta / meio-fio afluente'], ['entrada_agua', 'Entrada d’água']],
    PATOLOGIAS: [['assoreamento', 'Assoreamento por sedimento'], ['vegetacao', 'Vegetação / entulho na boca'], ['trincas', 'Trincas / fissuras no corpo'], ['ruptura', 'Ruptura de tubo ou laje'], ['juntas', 'Juntas abertas ou desalinhadas'], ['armadura', 'Armadura exposta'], ['deformacao', 'Deformação / ovalização'], ['erosao_mont', 'Erosão a montante'], ['erosao_jus', 'Erosão / solapamento a jusante'], ['bocas_danificadas', 'Boca ou alas danificadas'], ['piping', 'Piping / infiltração no aterro'], ['recalque', 'Recalque / abatimento na pista'], ['agua_pista', 'Água transpondo a pista'], ['colapso', 'Colapso total ou parcial'], ['orificio', 'Trabalha em condição de orifício']],
    NECESSITA: [['desobstrucao', 'Desobstrução'], ['limpeza', 'Limpeza'], ['rocada', 'Roçada'], ['tampa', 'Reparo/Substituição na Tampa'], ['bocas_alas', 'Recuperação de bocas e alas'], ['estrutural', 'Recuperação estrutural'], ['dissipador', 'Implantação de dissipador'], ['prolongamento', 'Prolongamento'], ['substituicao', 'Substituição'], ['hidraulico', 'Estudo hidráulico']],
    PRIORIDADES: ['Baixa', 'Média', 'Alta', 'Urgente'],
    OBS1: ['Fora da faixa de domínio.', 'Elemento está em área particular cercada.', 'Vegetação densa no local impossibilitando melhor acesso.', 'Elemento está coberto pela vegetação.', 'Elemento está em local com difícil acesso.'],
    OBS2: ['OAC trabalha em condição de orifício.', 'Elemento à montante não localizado.', 'Elemento à jusante não localizado.', 'Passagem de fauna.'],
    FOTOS: [['montante', 'Boca de montante'], ['jusante', 'Boca de jusante'], ['corpo', 'Corpo / interior'], ['pista', 'Pista sobre o bueiro'], ['rn', 'RN'], ['patologia', 'Patologia'], ['geral', 'Vista geral']],
  };
  const rot = (lista, k) => { const x = lista.find(a => a[0] === k); return x ? x[1] : k; };
  Cat.rotulo = rot;

  /* Tipo de bueiro pela sigla do DNIT: B + linhas (S/D/T/Q) + forma (T/C/L/A) + material (C/M/P/V/A). Ex.: BSCC = simples, celular, concreto. */
  const SIGLA = { L: { 1: 'S', 2: 'D', 3: 'T', 4: 'Q' }, F: { Tubular: 'T', Celular: 'C', Lenticular: 'L', Arco: 'A' }, M: { Concreto: 'C', Metálico: 'M', PEAD: 'P', PVC: 'V', 'Alvenaria / pedra': 'A' } };
  const NOME_L = { 1: 'Simples', 2: 'Duplo', 3: 'Triplo', 4: 'Quádruplo' }, NOME_M = { C: 'Concreto', M: 'Metálico', P: 'PEAD', V: 'PVC', A: 'Alvenaria / pedra' };
  const NOME_F = { T: 'Tubular', C: 'Celular', L: 'Lenticular', A: 'em Arco' };
  function siglaDe(c) {
    const l = SIGLA.L[c.celulas], f = SIGLA.F[c.tipo], m = SIGLA.M[c.material];
    return l && f && m ? 'B' + l + f + m : '';
  }
  function descricaoDe(c) {
    const l = SIGLA.L[c.celulas], f = SIGLA.F[c.tipo], m = SIGLA.M[c.material];
    return l && f && m ? `Bueiro ${NOME_L[c.celulas]} ${NOME_F[f]} de ${NOME_M[m]}` : '';
  }
  Cat.siglaDe = siglaDe; Cat.descricaoDe = descricaoDe;

  function novoLevantamento() {
    const agora = U.agoraISO();
    return {
      versaoSchema: SCHEMA, id: U.uid(), status: 'rascunho',
      origem: 'campo', cadastroId: '', cadastro: null, coordOrigem: null,
      codigo: '', estrada: '', municipio: '', estado: '', km: '', ambiente: '', sentido: '', pistaGe: '', lado: '', data: U.hojeISO(), hora: U.horaAgora(),
      responsavel: '', equipe: 'GFA', observacoes: '',
      situacao: '', classificacao: '', meta: {},
      leste: null, norte: null, zona: '23', hemisferio: 'S', altitude: null,
      latitude: null, longitude: null, // só para o botão Navegar (derivadas do UTM)
      rtk: { ...RTK_PROJETO, alturaAntena: null },
      naoLocalizado: null, planejado: null, presencas: [],
      caracteristicas: {
        tipo: '', formato: '', celulas: null, material: '', diametro: null, largura: null, altura: null, comprimento: null, espessura: null, larguraTopo: null,
        situacaoEstrutural: '', conservacao: '', erosao: '', assoreamento: '', obstrucao: '', agua: '', vegetacao: '',
        tipoEntrada: '', tipoSaida: '', sentidoFluxo: '', observacoes: '', necessita: '',
        estadoCorpo: '', obstrucaoPct: 0, mesmaSecaoJusante: true,
      },
      medicoes: {
        larguraPista: null, larguraAcostamento: null, alturaEntrada: null, larguraEntrada: null, alturaSaida: null, larguraSaida: null,
        profMontante: null, profJusante: null, comprimentoBueiro: null, declividade: null, cotaEntrada: null, cotaSaida: null,
        nivelAgua: null, vazaoEstimada: null, esconsidade: null, recobrimento: null, observacoes: '',
      },
      bocas: { montante: novaBoca(), jusante: novaBoca() },
      rn: { lat: null, lon: null, leste: null, norte: null, cota: null, descricao: '' },
      dispositivos: {}, diagnostico: { necessita: [], prioridade: '', prioridadeManual: false, obs: '', obs2: '', obsPadrao: [], obs2Padrao: [] },
      secao: null, prancha: { inverter: false }, medicoesAuto: {}, pontosArquivo: '', pontos: [], fotos: [], patologias: [], semPatologias: false,
      criadoEm: agora, atualizadoEm: agora,
    };
  }
  /* RTK fixo do projeto: vale para todos os bueiros. Só a altura da antena é preenchida pelo operador. */
  const RTK_PROJETO = { solucao: 'Fixa', precisaoH: 0.015, precisaoV: 0.025, satelites: 15, tipoAltitude: 'Elipsoidal', geoide: 'HheoNor2020', base: 'RTK-Ntrip', receptor: 'Emlid RS3' };
  function novaBoca() {
    return { tipo: '', material: '', estado: '', dissipador: '', estadoDissipador: '', lat: null, lon: null, leste: null, norte: null, cota: null, naoMarcados: {} };
  }

  function aplicarRtkProjeto(rtk) { for (const k in RTK_PROJETO) if (rtk[k] == null || rtk[k] === '') rtk[k] = RTK_PROJETO[k]; return rtk; }

  /* Completa registros antigos (e os vindos do servidor/painel) com os campos novos. */
  function normalizar(r) {
    const b = novoLevantamento();
    const l = {
      ...b, ...r,
      caracteristicas: { ...b.caracteristicas, ...(r.caracteristicas || {}) },
      medicoes: { ...b.medicoes, ...(r.medicoes || {}) }, rtk: aplicarRtkProjeto({ ...b.rtk, ...(r.rtk || {}) }),
      prancha: { ...b.prancha, ...(r.prancha || {}) }, medicoesAuto: { ...(r.medicoesAuto || {}) },
      meta: { ...(r.meta || {}) }, rn: { ...b.rn, ...(r.rn || {}) },
      bocas: { montante: { ...novaBoca(), ...((r.bocas || {}).montante || {}) }, jusante: { ...novaBoca(), ...((r.bocas || {}).jusante || {}) } },
      dispositivos: { ...(r.dispositivos || {}) }, diagnostico: { ...b.diagnostico, ...(r.diagnostico || {}) },
      pontos: r.pontos || [], fotos: r.fotos || [], patologias: r.patologias || [], presencas: r.presencas || [],
    };
    ['montante', 'jusante'].forEach(k => { l.bocas[k].naoMarcados = { ...(l.bocas[k].naoMarcados || {}) }; });
    if (!String(l.equipe || '').trim()) l.equipe = 'GFA';
    // Formatos antigos (versões anteriores) viram os atuais.
    const c = l.caracteristicas;
    if (c.formato === 'Quadrada') { c.formato = 'Retangular'; if (c.altura == null) c.altura = c.largura; }
    else if (c.formato === 'Aduela simples') c.formato = 'Retangular';
    else if (c.formato === 'Aduela dupla') { c.formato = 'Retangular'; if (!(c.celulas > 1)) c.celulas = 2; }
    else if (c.formato === 'Trapezoidal') c.formato = 'Personalizada';
    if (c.tipo === 'Aduela' || c.tipo === 'Galeria') c.tipo = 'Celular';
    else if (c.tipo === 'Outro') c.tipo = 'Outra';
    const mat = { 'Concreto armado': 'Concreto', Metal: 'Metálico', Pedra: 'Alvenaria / pedra', Alvenaria: 'Alvenaria / pedra' };
    if (mat[c.material]) c.material = mat[c.material];
    if (c.tipo && !c.celulas) c.celulas = 1;
    if (!l.situacao) l.situacao = l.origem === 'cadastro' ? 'Cadastrado' : l.origem === 'campo' ? 'Novo em campo' : '';
    if (!c.estadoCorpo && ['Bom', 'Regular', 'Precário'].includes(c.conservacao)) c.estadoCorpo = c.conservacao;
    return BU.GPS ? BU.GPS.completarUTM(l) : l;
  }

  /* Formato da seção (usado pelo croqui) a partir da forma escolhida no Corpo. */
  const formatoDe = tipo => tipo === 'Tubular' ? 'Circular' : tipo === 'Celular' ? 'Retangular' : tipo ? 'Personalizada' : '';

  BU.Cat = Cat;
  BU.Modelo = { RTK_PROJETO, SCHEMA, UFS, SN, OPCOES, novo: novoLevantamento, novaBoca, normalizar, formatoDe };
})();
