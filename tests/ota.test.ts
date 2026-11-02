import { describe, expect, test } from 'bun:test';
import { confirmBoot, CUR_MAX_TRIES, newer, type OtaState, pickBoot, rejectBoot, stageSlot, staged, unstaged, usedSlots } from '../src/boot/ota';

const SHELL = 'casca1';

/** Simula aberturas: o carregador salva o estado de pickBoot antes de rodar. */
function open(state: unknown, packaged = '1.0.0') {
  return pickBoot(state, packaged, SHELL);
}

describe('newer', () => {
  test('compara número a número', () => {
    expect(newer('1.0.10', '1.0.9')).toBe(true);
    expect(newer('2.0.0', '1.9.9')).toBe(true);
    expect(newer('1.0.0', '1.0.0')).toBe(false);
    expect(newer('1.0.0', '1.0.1')).toBe(false);
  });
});

describe('pickBoot', () => {
  test('sem nada baixado abre o pacote', () => {
    const p = open(null);
    expect(p.run).toBeUndefined();
    expect(p.state).toEqual({ shell: SHELL, bad: [] });
  });

  test('versão nova abre uma vez e confirma', () => {
    const s0 = staged(null, SHELL, '1.1.0', 'a');
    const p = open(s0);
    expect(p.run).toEqual({ v: '1.1.0', slot: 'a', tries: 1 });
    expect(p.fresh).toBe(true);
    const ok = confirmBoot(p.state, SHELL, '1.1.0');
    expect(ok.cur).toEqual({ v: '1.1.0', slot: 'a', tries: 0 });
    expect(ok.next).toBeUndefined();
    // aberturas seguintes usam a confirmada, sem "fresh"
    const p2 = open(ok);
    expect(p2.run!.v).toBe('1.1.0');
    expect(p2.fresh).toBe(false);
  });

  test('versão nova que não confirmou volta para a anterior e vira ruim', () => {
    let s: OtaState = { shell: SHELL, cur: { v: '1.1.0', slot: 'a', tries: 0 }, bad: [] };
    s = staged(s, SHELL, '1.2.0', 'b');
    const p1 = open(s);
    expect(p1.run!.v).toBe('1.2.0');
    // travou: não chamou ok(); próxima abertura
    const p2 = open(p1.state);
    expect(p2.rolledBack).toBe('1.2.0');
    expect(p2.run!.v).toBe('1.1.0');
    expect(p2.state.bad).toEqual(['1.2.0']);
    // e não aceita baixar a mesma de novo
    expect(stageSlot(p2.state, SHELL, '1.2.0', '1.1.0')).toBeUndefined();
    expect(stageSlot(p2.state, SHELL, '1.2.1', '1.1.0')).toBe('b');
  });

  test('a confirmada só é abandonada depois de várias aberturas sem confirmar', () => {
    let s: unknown = { shell: SHELL, cur: { v: '1.1.0', slot: 'a', tries: 0 }, bad: [] };
    for (let i = 0; i < CUR_MAX_TRIES; i++) {
      const p = open(s);
      expect(p.run!.v).toBe('1.1.0');
      s = p.state;
    }
    const last = open(s);
    expect(last.run).toBeUndefined();
    expect(last.rolledBack).toBe('1.1.0');
  });

  test('pacote reinstalado mais novo ignora o que foi baixado', () => {
    const s = { shell: SHELL, cur: { v: '1.1.0', slot: 'a', tries: 0 }, next: { v: '1.2.0', slot: 'b', tries: 0 }, bad: [] };
    const p = open(s, '1.2.0');
    expect(p.run).toBeUndefined();
    expect(usedSlots(p.state)).toEqual([]);
  });

  test('casca diferente zera tudo', () => {
    const s = { shell: 'velha', cur: { v: '1.1.0', slot: 'a', tries: 0 }, bad: ['1.0.5'] };
    const p = open(s);
    expect(p.run).toBeUndefined();
    expect(p.state).toEqual({ shell: SHELL, bad: [] });
  });

  test('estado corrompido não quebra', () => {
    expect(open('lixo').run).toBeUndefined();
    expect(open({ shell: SHELL, cur: { v: 3, slot: 'z' }, bad: 'x' }).state).toEqual({ shell: SHELL, bad: [] });
  });
});

describe('stageSlot', () => {
  test('nunca escreve por cima da confirmada', () => {
    const s = { shell: SHELL, cur: { v: '1.1.0', slot: 'a', tries: 0 }, bad: [] };
    expect(stageSlot(s, SHELL, '1.2.0', '1.1.0')).toBe('b');
    const s2 = { shell: SHELL, cur: { v: '1.1.0', slot: 'b', tries: 0 }, bad: [] };
    expect(stageSlot(s2, SHELL, '1.2.0', '1.1.0')).toBe('a');
  });

  test('não guarda versão igual ou mais velha, nem a que já está esperando', () => {
    expect(stageSlot(null, SHELL, '1.0.0', '1.0.0')).toBeUndefined();
    expect(stageSlot(null, SHELL, '0.9.0', '1.0.0')).toBeUndefined();
    const s = staged(null, SHELL, '1.1.0', 'a');
    expect(stageSlot(s, SHELL, '1.1.0', '1.0.0')).toBeUndefined();
    // mais nova que a que espera: substitui na mesma vaga
    expect(stageSlot(s, SHELL, '1.2.0', '1.0.0')).toBe('a');
    expect(unstaged(s, SHELL).next).toBeUndefined();
  });
});

test('rejectBoot tira a versão e anota como ruim', () => {
  const s = staged({ shell: SHELL, cur: { v: '1.1.0', slot: 'a', tries: 0 }, bad: [] }, SHELL, '1.2.0', 'b');
  const r = rejectBoot(s, SHELL, '1.2.0');
  expect(r.next).toBeUndefined();
  expect(r.cur!.v).toBe('1.1.0');
  expect(r.bad).toEqual(['1.2.0']);
  // a abertura seguinte avisa uma vez só
  const p1 = pickBoot(r, '1.0.0', SHELL);
  expect(p1.rolledBack).toBe('1.2.0');
  expect(p1.run!.v).toBe('1.1.0');
  expect(pickBoot(p1.state, '1.0.0', SHELL).rolledBack).toBeUndefined();
});
