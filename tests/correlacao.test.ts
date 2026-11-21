import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aceitarCorrelationId,
  aplicarCorrelacaoHttp,
  comCorrelacao,
  comNovaCorrelacao,
  correlationIdAtual,
  entrarNaCorrelacao,
  gerarCorrelationId,
  iniciarTelemetria
} from '../src/index.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID = '3f2b8c1e-9d4a-4b7e-8f1a-2c3d4e5f6a7b';

describe('correlação', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gera UUID v4', () => {
    expect(gerarCorrelationId()).toMatch(UUID_V4);
  });

  it('aceita um UUID v4 válido e normaliza para minúsculas', () => {
    expect(aceitarCorrelationId(ID.toUpperCase())).toBe(ID);
  });

  it('aceita o primeiro valor quando o cabeçalho vem repetido', () => {
    expect(aceitarCorrelationId([ID, 'outro'])).toBe(ID);
  });

  it.each([undefined, '', 'abc', '3f2b8c1e-9d4a-1b7e-8f1a-2c3d4e5f6a7b', `${ID}; drop table`])(
    'descarta valor inválido (%s) e gera outro',
    (valor) => {
      const id = aceitarCorrelationId(valor);
      expect(id).toMatch(UUID_V4);
      expect(id).not.toBe(valor);
    }
  );

  it('não tem correlação fora de um contexto', () => {
    expect(correlationIdAtual()).toBeUndefined();
  });

  it('mantém a correlação através de await e timers', async () => {
    const dentro = await comCorrelacao(ID, async () => {
      await new Promise((ok) => setTimeout(ok, 5));
      return correlationIdAtual();
    });
    expect(dentro).toBe(ID);
    expect(correlationIdAtual()).toBeUndefined();
  });

  it('não vaza a correlação para contextos paralelos', async () => {
    const [a, b] = await Promise.all([
      comCorrelacao(ID, async () => {
        await new Promise((ok) => setTimeout(ok, 10));
        return correlationIdAtual();
      }),
      comCorrelacao(gerarCorrelationId(), async () => correlationIdAtual())
    ]);
    expect(a).toBe(ID);
    expect(b).not.toBe(ID);
  });

  it('entrarNaCorrelacao vale para o restante da execução assíncrona atual', async () => {
    await comCorrelacao(ID, async () => {
      entrarNaCorrelacao(ID);
      await Promise.resolve();
      expect(correlationIdAtual()).toBe(ID);
    });
  });

  it('comNovaCorrelacao roda cada chamada com um id diferente', async () => {
    const ids: string[] = [];
    const tick = comNovaCorrelacao(async () => {
      await Promise.resolve();
      ids.push(correlationIdAtual() ?? 'sem');
    });
    await Promise.all([tick(), tick()]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(UUID_V4);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('aplicarCorrelacaoHttp reaproveita o id recebido, devolve no cabeçalho e entra no contexto', async () => {
    const cabecalhos: Record<string, string> = {};
    const resposta = { header: (nome: string, valor: string) => (cabecalhos[nome] = valor) };

    aplicarCorrelacaoHttp({ headers: { 'x-correlation-id': ID } }, resposta);

    expect(cabecalhos['x-correlation-id']).toBe(ID);
    expect(correlationIdAtual()).toBe(ID);
  });

  it('o logger inclui correlation_id no stdout dentro do contexto e omite fora dele', () => {
    const saida: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((linha: string) => saida.push(linha));
    const { logger } = iniciarTelemetria({ servico: 'teste' });

    logger.info('fora');
    comCorrelacao(ID, () => logger.info('dentro', { rota: '/x' }));

    const [fora, dentro] = saida.map((linha) => JSON.parse(linha));
    expect(fora).not.toHaveProperty('correlation_id');
    expect(dentro).toMatchObject({ msg: 'dentro', correlation_id: ID, rota: '/x' });
  });
});
