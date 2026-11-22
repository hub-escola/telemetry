import type { Atributos, Logador, OpcoesDoLog } from './telemetria.js';

// Núcleo puro: sem imports de Node e sem SDK, para rodar também no bundle do Next (`@hubescola/telemetry/logador`).
export type Nivel = 'debug' | 'info' | 'warn' | 'error';

// Números da escala de severidade do OpenTelemetry. Constantes locais para não importar a API de logs.
const SEVERIDADE: Record<Nivel, [number, string, number]> = {
  debug: [5, 'DEBUG', 10],
  info: [9, 'INFO', 20],
  warn: [13, 'WARN', 30],
  error: [17, 'ERROR', 40]
};

const SAIDA: Record<Nivel, 'log' | 'warn' | 'error'> = { debug: 'log', info: 'log', warn: 'warn', error: 'error' };

export interface RegistroDeLog {
  severityNumber: number;
  severityText: string;
  body: string;
  attributes: Atributos;
}

// Aceita o logger da API de logs que o consumidor usa: `logs` de `@opentelemetry/api` (Node) ou de `@opentelemetry/api-logs` (Next).
// A API precisa ser a mesma que registrou o provider, senão o log some sem erro.
export interface EmissorDeLog {
  emit(registro: RegistroDeLog): void;
}

export interface SaidaDoLogador {
  log(mensagem: string): void;
  warn(mensagem: string): void;
  error(mensagem: string): void;
}

export interface OpcoesDoLogador {
  servico: () => string;
  emissor?: EmissorDeLog;
  saida?: SaidaDoLogador;
  nivel?: () => Nivel;
  correlacao?: () => string | undefined;
  fixos?: Atributos;
}

/** Atributos padronizados de um erro: só tipo e mensagem, nunca o objeto inteiro (pode carregar URL com senha). */
export function atributosDoErro(erro: unknown): Atributos {
  if (erro instanceof Error) return { 'error.type': erro.name, 'error.message': erro.message };
  return { 'error.type': typeof erro, 'error.message': String(erro) };
}

function semIndefinidos(atributos: Atributos): Atributos {
  return Object.fromEntries(Object.entries(atributos).filter(([, valor]) => valor !== undefined));
}

function linhaJson(nivel: Nivel, servico: string, mensagem: string, atributos: Atributos): string {
  return JSON.stringify({ time: new Date().toISOString(), level: SEVERIDADE[nivel][1], service: servico, msg: mensagem, ...atributos });
}

// Frame [0] é "Error", [1] é o closure de em(), [2] é quem chamou o logger.
export function localDeOrigem(pilha: string | undefined): Atributos {
  const casamento = pilha?.split('\n')[2]?.match(/^\s*at (?:(.+?) \()?(.+):(\d+):\d+\)?$/);
  if (!casamento) return {};
  const [, funcao, arquivo, linha] = casamento;
  return {
    ...(funcao && { 'code.function.name': funcao }),
    'code.file.path': arquivo.replace(/^file:\/\//, ''),
    'code.line.number': Number(linha)
  };
}

export function criarLogador(opcoes: OpcoesDoLogador): Logador {
  const em = (nivel: Nivel) => (mensagem: string, atributos?: Atributos, opcoesDoLog?: OpcoesDoLog) => {
    const [severityNumber, severityText, peso] = SEVERIDADE[nivel];
    if (peso < SEVERIDADE[opcoes.nivel?.() ?? 'info'][2]) return;
    const origem = localDeOrigem(new Error().stack);
    const correlacao = opcoes.correlacao?.();
    const todos = semIndefinidos({ ...opcoes.fixos, ...origem, ...(correlacao && { correlation_id: correlacao }), ...atributos });
    if (opcoesDoLog?.stdout !== false) (opcoes.saida ?? console)[SAIDA[nivel]](linhaJson(nivel, opcoes.servico(), mensagem, todos));
    opcoes.emissor?.emit({ severityNumber, severityText, body: mensagem, attributes: todos });
  };
  return { debug: em('debug'), info: em('info'), warn: em('warn'), error: em('error') };
}
