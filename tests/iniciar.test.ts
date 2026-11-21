import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { iniciarTelemetria } from '../src/index.js';

const CHAVES = [
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
    expect(log).toHaveBeenCalledWith('olá');
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
