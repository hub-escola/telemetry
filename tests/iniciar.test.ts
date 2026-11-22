import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atributosDoErro, iniciarTelemetria, obterLogger } from '../src/index.js';

const CHAVES = [
  'LOG_LEVEL',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT',
  'OTEL_EXPORTER_OTLP_PROTOCOL',
  'OTEL_LOGS_EXPORTER',
  'OTEL_TRACES_EXPORTER',
  'OTEL_METRICS_EXPORTER'
];

describe('iniciarTelemetria', () => {
  let servidor: Server | undefined;

  afterEach(async () => {
    for (const chave of CHAVES) delete process.env[chave];
    vi.restoreAllMocks();
    await new Promise((ok) => (servidor ? servidor.close(ok) : ok(undefined)));
    servidor = undefined;
  });

  it('sem endpoint fica inerte: escreve no stdout e não abre conexão', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const telemetria = iniciarTelemetria({ servico: 'teste' });
    telemetria.logger.info('olá');
    await telemetria.fechar();

    expect(telemetria.ativa).toBe(false);
    const linha = JSON.parse(log.mock.calls[0]![0] as string);
    expect(linha).toMatchObject({ level: 'INFO', service: 'teste', msg: 'olá' });
    expect(typeof linha.time).toBe('string');
  });

  it('atributos entram na linha, erro vai para stderr e debug só aparece com LOG_LEVEL=debug', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = iniciarTelemetria({ servico: 'teste' });

    logger.debug('oculto');
    logger.error('falhou', { fila: 'q.x', ...atributosDoErro(new TypeError('boom')) });
    process.env.LOG_LEVEL = 'debug';
    logger.debug('visível');

    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({ level: 'DEBUG', msg: 'visível' });
    expect(JSON.parse(err.mock.calls[0]![0] as string)).toMatchObject({
      level: 'ERROR',
      fila: 'q.x',
      'error.type': 'TypeError',
      'error.message': 'boom'
    });
  });

  it('obterLogger usa o serviço do processo e marca o componente', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    iniciarTelemetria({ servico: 'portal-api' });

    obterLogger('rabbitmq').info('conectado');

    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
      service: 'portal-api',
      componente: 'rabbitmq',
      msg: 'conectado'
    });
  });

  it('cada linha traz o arquivo e a linha de quem chamou o logger', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { logger } = iniciarTelemetria({ servico: 'teste' });
    const linhaDoTeste = new Error().stack!.split('\n')[1]!.match(/:(\d+):\d+\)?$/)![1]!;
    logger.info('ponto');

    const linha = JSON.parse(log.mock.calls[0]![0] as string);
    expect(linha['code.file.path']).toMatch(/iniciar\.test\.ts$/);
    expect(linha['code.line.number']).toBe(Number(linhaDoTeste) + 1);
  });

  it('atributosDoErro aceita valor que não é Error', () => {
    expect(atributosDoErro('texto')).toEqual({ 'error.type': 'string', 'error.message': 'texto' });
  });

  it('com endpoint envia o log por OTLP com service.name e os atributos', async () => {
    const recebidos: { url?: string; corpo: string }[] = [];
    servidor = createServer((req, res) => {
      let corpo = '';
      req.on('data', (parte) => (corpo += parte));
      req.on('end', () => {
        recebidos.push({ url: req.url, corpo });
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((ok) => servidor!.listen(0, '127.0.0.1', ok));
    const { port } = servidor.address() as AddressInfo;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${port}`;
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json';
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const telemetria = iniciarTelemetria({ servico: 'portal-api-teste', versao: '9.9.9' });
    telemetria.logger.info('conversa aberta', { canal: 'pwa' });
    await telemetria.fechar();

    expect(telemetria.ativa).toBe(true);
    const envio = recebidos.find((r) => r.url === '/v1/logs');
    expect(envio?.corpo).toContain('portal-api-teste');
    expect(envio?.corpo).toContain('conversa aberta');
    expect(envio?.corpo).toContain('canal');
    expect(envio?.corpo).not.toMatch(/host\.name|process\.pid|process\.owner|command_args/);
  });
});
