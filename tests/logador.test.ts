import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { atributosDoErro, criarLogador, type EmissorDeLog, type RegistroDeLog } from '../src/logador.js';

function montar(nivel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
  const registros: RegistroDeLog[] = [];
  const emissor: EmissorDeLog = { emit: (r) => void registros.push(r) };
  const saida = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logador = criarLogador({ servico: () => 'teste', emissor, saida, nivel: () => nivel });
  return { logador, registros, saida };
}

describe('criarLogador', () => {
  it('escreve JSON no stdout e emite o mesmo registro com severidade', () => {
    const { logador, registros, saida } = montar();

    logador.info('pedido criado', { 'http.route': '/x', 'erro.campo': undefined });

    const linha = JSON.parse(saida.log.mock.calls[0]![0] as string);
    expect(linha).toMatchObject({ level: 'INFO', service: 'teste', msg: 'pedido criado', 'http.route': '/x' });
    expect(linha).not.toHaveProperty('erro.campo');
    expect(registros[0]).toMatchObject({ severityNumber: 9, severityText: 'INFO', body: 'pedido criado' });
    expect(registros[0]!.attributes).not.toHaveProperty('erro.campo');
  });

  it('warn e error vão para a saída certa com a severidade certa', () => {
    const { logador, registros, saida } = montar();

    logador.warn('atencao');
    logador.error('falhou');

    expect(saida.warn).toHaveBeenCalledTimes(1);
    expect(saida.error).toHaveBeenCalledTimes(1);
    expect(registros.map((r) => r.severityNumber)).toEqual([13, 17]);
  });

  it('respeita o nível mínimo', () => {
    const { logador, registros, saida } = montar('warn');

    logador.info('oculto');
    logador.warn('visível');

    expect(saida.log).not.toHaveBeenCalled();
    expect(registros.map((r) => r.body)).toEqual(['visível']);
  });

  it('injeta a correlação quando existe e omite quando não existe', () => {
    const id = '0b8f2a4e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
    const saida = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    let atual: string | undefined = id;
    const logador = criarLogador({ servico: () => 'teste', saida, correlacao: () => atual });

    logador.info('com');
    atual = undefined;
    logador.info('sem');

    expect(JSON.parse(saida.log.mock.calls[0]![0] as string)).toMatchObject({ correlation_id: id });
    expect(JSON.parse(saida.log.mock.calls[1]![0] as string)).not.toHaveProperty('correlation_id');
  });

  it('stdout: false envia só para o emissor', () => {
    const { logador, registros, saida } = montar();

    logador.info('so otel', undefined, { stdout: false });

    expect(saida.log).not.toHaveBeenCalled();
    expect(registros).toHaveLength(1);
  });

  it('a origem aponta para o arquivo e a linha de quem chamou', () => {
    const { logador, registros } = montar();
    const linhaDoTeste = new Error().stack!.split('\n')[1]!.match(/:(\d+):\d+\)?$/)![1]!;
    logador.info('ponto');

    expect(registros[0]!.attributes['code.file.path']).toMatch(/logador\.test\.ts$/);
    expect(registros[0]!.attributes['code.line.number']).toBe(Number(linhaDoTeste) + 1);
  });

  it('atributosDoErro traz só tipo e mensagem, nunca a URL do objeto', () => {
    const erro = Object.assign(new TypeError('falhou em https://u:senha@host'), { url: 'https://u:senha@host' });

    expect(atributosDoErro(erro)).toEqual({ 'error.type': 'TypeError', 'error.message': 'falhou em https://u:senha@host' });
    expect(atributosDoErro('texto')).toEqual({ 'error.type': 'string', 'error.message': 'texto' });
  });

  it('o núcleo não importa nada de Node nem do SDK (precisa rodar no bundle do Next)', () => {
    const fonte = readFileSync(fileURLToPath(new URL('../src/logador.ts', import.meta.url)), 'utf8').replace(/\/\/.*$/gm, '');
    const importacoes = [...fonte.matchAll(/^import\s.*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

    expect(importacoes).toEqual(['./telemetria.js']);
    expect(fonte).not.toMatch(/node:|@opentelemetry\/(sdk|api)/);
  });
});
