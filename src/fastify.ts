import { aplicarCorrelacaoHttp, CABECALHO_CORRELACAO } from './correlacao.js';
import type { Logador } from './telemetria.js';

// Forma mínima do que o hook usa. Evita importar o `fastify` dentro do pacote.
export interface PedidoHttp {
  method: string;
  routeOptions: { url?: string };
  headers: Record<string, string | string[] | undefined>;
}

export interface RespostaHttp {
  statusCode: number;
  elapsedTime: number;
  header(nome: string, valor: string): unknown;
  getHeader(nome: string): unknown;
}

export interface AppComHooks {
  addHook(nome: 'onRequest', fn: (pedido: PedidoHttp, resposta: RespostaHttp) => Promise<unknown>): unknown;
  addHook(nome: 'onResponse', fn: (pedido: PedidoHttp, resposta: RespostaHttp) => Promise<unknown>): unknown;
}

/**
 * Uma linha por requisição (`http_request`), com método, rota, status e duração.
 * Nunca a URL real, a query, o corpo ou o cookie. 5xx vira `error`. `/health` fica de fora.
 */
export function registrarLogDeRequisicoes(app: AppComHooks, logger: Pick<Logador, 'info' | 'error'>, rotasIgnoradas: string[] = ['/health']): void {
  app.addHook('onRequest', async (pedido, resposta) => aplicarCorrelacaoHttp(pedido, resposta));

  app.addHook('onResponse', async (pedido, resposta) => {
    const rota = pedido.routeOptions.url ?? 'desconhecida';
    if (rotasIgnoradas.includes(rota)) return;
    const status = resposta.statusCode;
    const duracaoMs = Math.round(resposta.elapsedTime);
    logger[status >= 500 ? 'error' : 'info'](
      'http_request',
      {
        'http.request.method': pedido.method,
        'http.route': rota,
        'http.response.status_code': status,
        'http.server.request.duration_ms': duracaoMs,
        correlation_id: String(resposta.getHeader(CABECALHO_CORRELACAO))
      },
      { stdout: false }
    );
  });
}
