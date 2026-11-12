/* O painel só LÊ levantamentos: este stub impede que os módulos do app de campo (que escutam cliques) procurem o levantamento em edição. */
window.BU = window.BU || {};
window.BU.App = { cur: () => null, marcarSujo() {}, renderEtapa() {}, S: {}, novo: () => window.BU.Modelo.novo(), get OPCOES() { return window.BU.Modelo.OPCOES; }, get UFS() { return window.BU.Modelo.UFS; } };

/* Fotos do bueiro aberto: o painel baixa os arquivos do servidor e os gêmeos do app de campo (ficha ANTT, relatório) as leem daqui. */
window.BU.App.pendencias = () => [];
window.BU.DB = { _fotos: new Map(), async obterFoto(id) { const b = this._fotos.get(id); return b ? { id, blob: b } : null; } };
