import { logs, trace } from '@opentelemetry/api';
import { startNodeSdk } from '@opentelemetry/sdk-node';
import type { Atributos, Logador, Telemetria } from './telemetria.js';
import { correlationIdAtual } from './correlacao.js';
import { criarLogador, type Nivel } from './logador.js';

export interface OpcoesDaTelemetria {
  servico: string;
  versao?: string;
}

// No env, e não numa variável do módulo: pacotes `file:` trazem a própria cópia deste módulo.
const servicoAtual = () => process.env.OTEL_SERVICE_NAME ?? 'desconhecido';

function nivelDoEnv(): Nivel {
  const pedido = process.env.LOG_LEVEL?.toLowerCase();
  return pedido === 'debug' || pedido === 'info' || pedido === 'warn' || pedido === 'error' ? pedido : 'info';
}

function logadorDoProcesso(servico: () => string, exportar: boolean, fixos?: Atributos): Logador {
  return criarLogador({
    servico,
    emissor: exportar ? logs.getLogger(servico()) : undefined,
    nivel: nivelDoEnv,
    correlacao: correlationIdAtual,
    fixos
  });
}

/** Atributos padronizados de um erro: só tipo e mensagem, nunca o objeto inteiro (pode carregar URL com senha). */
export function atributosDoErro(erro: unknown): Atributos {
  if (erro instanceof Error) return { 'error.type': erro.name, 'error.message': erro.message };
  return { 'error.type': typeof erro, 'error.message': String(erro) };
}

/**
 * Logger para bibliotecas e módulos que não são dono do SDK. Escreve JSON no
 * stdout e, se `iniciarTelemetria` rodou no processo, também exporta por OTLP.
 */
export function obterLogger(componente: string): Logador {
  return logadorDoProcesso(servicoAtual, true, { componente });
}

export function iniciarTelemetria({ servico, versao }: OpcoesDaTelemetria): Telemetria {
  const env = process.env;
  env.OTEL_SERVICE_NAME = servico;
  const ativa = Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT);
  if (!ativa) {
    return { ativa, logger: logadorDoProcesso(() => servico, false), tracer: trace.getTracer(servico), fechar: async () => {} };
  }

  const temSpans = Boolean(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
  env.OTEL_LOGS_EXPORTER ??= 'otlp';
  env.OTEL_TRACES_EXPORTER ??= temSpans ? 'otlp' : 'none';
  env.OTEL_METRICS_EXPORTER ??= 'none';

  const sdk = startNodeSdk({
    resourceAttributes: { 'service.name': servico, ...(versao && { 'service.version': versao }) },
    instrumentations: [],
    resourceDetectors: []
  });

  return {
    ativa,
    logger: logadorDoProcesso(() => servico, true),
    tracer: trace.getTracer(servico, versao),
    fechar: () => sdk.shutdown()
  };
}
