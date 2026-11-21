export { atributosDoErro, iniciarTelemetria, obterLogger, type OpcoesDaTelemetria } from './iniciar.js';
export {
  aceitarCorrelationId,
  aplicarCorrelacaoHttp,
  CABECALHO_CORRELACAO,
  comCorrelacao,
  comNovaCorrelacao,
  correlationIdAtual,
  entrarNaCorrelacao,
  gerarCorrelationId
} from './correlacao.js';
export type { PedidoComCabecalhos, RespostaComCabecalho } from './correlacao.js';
export type { Atributos, Logador, OpcoesDoLog, Telemetria } from './telemetria.js';
