import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const CABECALHO_CORRELACAO = 'x-correlation-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const contexto = new AsyncLocalStorage<{ correlationId: string }>();

export function gerarCorrelationId(): string {
  return randomUUID();
}

export function aceitarCorrelationId(valor: unknown): string {
  const candidato = Array.isArray(valor) ? valor[0] : valor;
  return typeof candidato === 'string' && UUID_V4.test(candidato) ? candidato.toLowerCase() : gerarCorrelationId();
}

export function correlationIdAtual(): string | undefined {
  return contexto.getStore()?.correlationId;
}

export function comCorrelacao<T>(correlationId: string, executar: () => T): T {
  return contexto.run({ correlationId }, executar);
}

export function entrarNaCorrelacao(correlationId: string): void {
  contexto.enterWith({ correlationId });
}

export function comNovaCorrelacao<A extends unknown[], T>(executar: (...args: A) => T): (...args: A) => T {
  return (...args: A) => comCorrelacao(gerarCorrelationId(), () => executar(...args));
}

export interface PedidoComCabecalhos {
  headers: Record<string, string | string[] | undefined>;
}

export interface RespostaComCabecalho {
  header(nome: string, valor: string): unknown;
}

export function aplicarCorrelacaoHttp(pedido: PedidoComCabecalhos, resposta: RespostaComCabecalho): void {
  const correlationId = aceitarCorrelationId(pedido.headers[CABECALHO_CORRELACAO]);
  entrarNaCorrelacao(correlationId);
  resposta.header(CABECALHO_CORRELACAO, correlationId);
}
