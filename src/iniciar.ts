import { logs, SeverityNumber, trace } from '@opentelemetry/api';
import { startNodeSdk } from '@opentelemetry/sdk-node';
import type { Atributos, Logador, OpcoesDoLog, Telemetria } from './telemetria.js';

export interface OpcoesDaTelemetria {
  servico: string;
  versao?: string;
}

const NIVEIS = {
  debug: [SeverityNumber.DEBUG, 'DEBUG', 10],
  info: [SeverityNumber.INFO, 'INFO', 20],
  warn: [SeverityNumber.WARN, 'WARN', 30],
  error: [SeverityNumber.ERROR, 'ERROR', 40]
} as const;

type Nivel = keyof typeof NIVEIS;

const SAIDA: Record<Nivel, 'log' | 'warn' | 'error'> = { debug: 'log', info: 'log', warn: 'warn', error: 'error' };

// No env, e não numa variável do módulo: pacotes `file:` trazem a própria cópia deste módulo.
const servicoAtual = () => process.env.OTEL_SERVICE_NAME ?? 'desconhecido';

function nivelMinimo(): number {
  const pedido = process.env.LOG_LEVEL?.toLowerCase();
  return pedido && pedido in NIVEIS ? NIVEIS[pedido as Nivel][2] : NIVEIS.info[2];
}

function linhaJson(nivel: Nivel, servico: string, mensagem: string, atributos?: Atributos): string {
  return JSON.stringify({ time: new Date().toISOString(), level: NIVEIS[nivel][1], service: servico, msg: mensagem, ...atributos });
}

function criarLogador(servico: () => string, exportar: boolean, fixos?: Atributos): Logador {
  const exportador = exportar ? logs.getLogger(servico()) : undefined;
  const em = (nivel: Nivel) => (mensagem: string, atributos?: Atributos, opcoes?: OpcoesDoLog) => {
    const [severityNumber, severityText, peso] = NIVEIS[nivel];
    if (peso < nivelMinimo()) return;
    const todos = { ...fixos, ...atributos };
    if (opcoes?.stdout !== false) console[SAIDA[nivel]](linhaJson(nivel, servico(), mensagem, todos));
    exportador?.emit({ severityNumber, severityText, body: mensagem, attributes: todos });
  };
  return { debug: em('debug'), info: em('info'), warn: em('warn'), error: em('error') };
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
  return criarLogador(servicoAtual, true, { componente });
}

export function iniciarTelemetria({ servico, versao }: OpcoesDaTelemetria): Telemetria {
  const env = process.env;
  env.OTEL_SERVICE_NAME = servico;
  const ativa = Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT);
  if (!ativa) {
    return { ativa, logger: criarLogador(() => servico, false), tracer: trace.getTracer(servico), fechar: async () => {} };
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
    logger: criarLogador(() => servico, true),
    tracer: trace.getTracer(servico, versao),
    fechar: () => sdk.shutdown()
  };
}
