/* O painel só LÊ levantamentos: este stub impede que os módulos do app de campo (que escutam cliques) procurem o levantamento em edição. */
window.BU = window.BU || {};
window.BU.App = { cur: () => null, marcarSujo() {}, renderEtapa() {}, S: {}, novo: () => window.BU.Modelo.novo(), get OPCOES() { return window.BU.Modelo.OPCOES; }, get UFS() { return window.BU.Modelo.UFS; } };
