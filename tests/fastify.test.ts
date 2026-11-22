import { describe, expect, it, vi } from 'vitest';
import { registrarLogDeRequisicoes, type AppComHooks, type PedidoHttp, type RespostaHttp } from '../src/index.js';
import { CABECALHO_CORRELACAO } from '../src/correlacao.js';

type Hook = (pedido: PedidoHttp, resposta: RespostaHttp) => Promise<unknown>;

function montarApp() {
  const hooks: Record<string, Hook> = {};
  const app: AppComHooks = {
    addHook: ((nome: string, fn: Hook) => (hooks[nome] = fn)) as AppComHooks['addHook']
  };
  return { app, hooks };
}

function pedido(url: string, method = 'GET'): PedidoHttp {
  return { method, routeOptions: { url }, headers: {} };
}

function resposta(status: number, duracao = 12.4) {
  const cabecalhos: Record<string, unknown> = {};
  return {
    statusCode: status,
    elapsedTime: duracao,
    header: (nome: string, valor: string) => (cabecalhos[nome] = valor),
    getHeader: (nome: string) => cabecalhos[nome]
  } as RespostaHttp;
}

describe('registrarLogDeRequisicoes', () => {
  it('loga método, rota, status e duração com mensagem fixa', async () => {
    const { app, hooks } = montarApp();
    const logger = { info: vi.fn(), error: vi.fn() };
    registrarLogDeRequisicoes(app, logger);

    await hooks.onResponse!(pedido('/api/vagas/:id'), resposta(200));

    expect(logger.info).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({ 'http.request.method': 'GET', 'http.route': '/api/vagas/:id', 'http.response.status_code': 200, 'http.server.request.duration_ms': 12 }),
      { stdout: false }
    );
  });

  it('5xx vira error e rotas ignoradas não logam', async () => {
    const { app, hooks } = montarApp();
    const logger = { info: vi.fn(), error: vi.fn() };
    registrarLogDeRequisicoes(app, logger);

    await hooks.onResponse!(pedido('/api/x'), resposta(503));
    await hooks.onResponse!(pedido('/health'), resposta(200));

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('o onRequest aplica o correlation id recebido e devolve o cabeçalho', async () => {
    const { app, hooks } = montarApp();
    registrarLogDeRequisicoes(app, { info: vi.fn(), error: vi.fn() });
    const id = '0b8f2a4e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
    const pedidoComId = { ...pedido('/x'), headers: { [CABECALHO_CORRELACAO]: id } };
    const res = resposta(200);

    await hooks.onRequest!(pedidoComId, res);

    expect(res.getHeader(CABECALHO_CORRELACAO)).toBe(id);
  });

  it('não loga a URL real nem a query: só a rota', async () => {
    const { app, hooks } = montarApp();
    const logger = { info: vi.fn(), error: vi.fn() };
    registrarLogDeRequisicoes(app, logger);

    await hooks.onResponse!({ ...pedido('/api/candidato/:id'), url: '/api/candidato/123?token=segredo' } as PedidoHttp, resposta(200));

    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/segredo|123\?/);
  });
});
