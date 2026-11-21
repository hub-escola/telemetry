import type { Tracer } from '@opentelemetry/api';

export type Atributos = Record<string, string | number | boolean | undefined>;

export interface OpcoesDoLog {
  stdout?: boolean;
}

export interface Logador {
  debug(mensagem: string, atributos?: Atributos, opcoes?: OpcoesDoLog): void;
  info(mensagem: string, atributos?: Atributos, opcoes?: OpcoesDoLog): void;
  warn(mensagem: string, atributos?: Atributos, opcoes?: OpcoesDoLog): void;
  error(mensagem: string, atributos?: Atributos, opcoes?: OpcoesDoLog): void;
}

export interface Telemetria {
  readonly ativa: boolean;
  readonly logger: Logador;
  readonly tracer: Tracer;
  fechar(): Promise<void>;
}
