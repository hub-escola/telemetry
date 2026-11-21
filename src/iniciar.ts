import { logs, SeverityNumber, trace } from '@opentelemetry/api';
import { startNodeSdk } from '@opentelemetry/sdk-node';
import type { Atributos, Logador, OpcoesDoLog, Telemetria } from './telemetria.js';

export interface OpcoesDaTelemetria {
  servico: string;
  versao?: string;
}

const NIVEIS = {
  info: [SeverityNumber.INFO, 'INFO'],
  warn: [SeverityNumber.WARN, 'WARN'],
  error: [SeverityNumber.ERROR, 'ERROR']
} as const;

function criarLogador(servico: string, exportar: boolean): Logador {
  const logger = exportar ? logs.getLogger(servico) : undefined;
  const em = (nivel: keyof typeof NIVEIS) => (mensagem: string, atributos?: Atributos, opcoes?: OpcoesDoLog) => {
    const [severityNumber, severityText] = NIVEIS[nivel];
    if (opcoes?.stdout !== false) console[nivel === 'info' ? 'log' : nivel](mensagem);
    logger?.emit({ severityNumber, severityText, body: mensagem, attributes: atributos });
  };
  return { info: em('info'), warn: em('warn'), error: em('error') };
}

export function iniciarTelemetria({ servico, versao }: OpcoesDaTelemetria): Telemetria {
  const env = process.env;
  const ativa = Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT);
  if (!ativa) {
    return { ativa, logger: criarLogador(servico, false), tracer: trace.getTracer(servico), fechar: async () => {} };
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
    logger: criarLogador(servico, true),
    tracer: trace.getTracer(servico, versao),
    fechar: () => sdk.shutdown()
  };
}
