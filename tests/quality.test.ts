import { describe, expect, test } from 'bun:test';
import { DEFAULT_RULES, nextFallback, pickStart, StallMonitor, stallRules } from '../src/player/quality';
import type { PlaySource, Quality } from '../src/data/types';

const src = (...q: Quality[]): PlaySource[] => q.map((quality, i) => ({ url: 'u' + i, quality, streamId: i }));

describe('pickStart', () => {
  const s = src('4K', 'FHD', 'HD', 'SD');
  test('preferência exata', () => expect(pickStart(s, 'HD', null)).toBe(2));
  test('automático começa em FHD, não em 4K', () => expect(pickStart(s, 'auto', null)).toBe(1));
  test('escolha salva do canal vence a preferência', () => expect(pickStart(s, 'FHD', 'SD')).toBe(3));
  test('sem a qualidade pedida, pega a melhor abaixo', () => expect(pickStart(src('HD', 'SD'), 'FHD', null)).toBe(0));
  test('canal sem marcação', () => expect(pickStart(src(''), 'FHD', null)).toBe(0));
});

describe('nextFallback', () => {
  const s = src('4K', 'FHD', 'HD', 'SD');
  test('desce uma qualidade por vez', () => {
    const tried = new Set([1]);
    expect(nextFallback(s, tried, 1)).toBe(2);
    tried.add(2);
    expect(nextFallback(s, tried, 2)).toBe(3);
    tried.add(3);
    expect(nextFallback(s, tried, 3)).toBe(0); // sobrou só a melhor: tenta como último recurso
  });
  test('fonte reserva da mesma qualidade', () => {
    expect(nextFallback(src('FHD', 'FHD', 'HD'), new Set([0]), 0)).toBe(1);
  });
});

describe('StallMonitor', () => {
  let t = 0;
  const m = new StallMonitor({ startupMs: 9000, windowMs: 60000, maxStalls: 3, maxBufferingMs: 7000 }, () => t);

  test('demora para abrir', () => {
    t = 0;
    m.reset();
    t = 5000;
    expect(m.verdict()).toBeNull();
    t = 9500;
    expect(m.verdict()).toBe('startup');
  });

  test('três travadas em um minuto', () => {
    t = 0;
    m.reset();
    m.playing();
    for (const at of [10000, 20000, 30000]) {
      t = at;
      m.buffering();
      t = at + 800;
      m.playing();
    }
    expect(m.verdict()).toBe('stalls');
  });

  test('travadas espalhadas não disparam', () => {
    t = 0;
    m.reset();
    m.playing();
    for (const at of [10000, 80000, 150000]) {
      t = at;
      m.buffering();
      t = at + 800;
      m.playing();
    }
    expect(m.verdict()).toBeNull();
  });

  test('carregando por muito tempo', () => {
    t = 0;
    m.reset();
    m.playing();
    t = 10000;
    m.buffering();
    t = 17500;
    expect(m.verdict()).toBe('buffering');
  });
});

describe('stallRules (buffer escolhido)', () => {
  test('automático = regras padrão', () => {
    expect(stallRules(0)).toEqual(DEFAULT_RULES);
  });

  test('buffer de 10 s não desce a qualidade só por esperar o buffer', () => {
    let t = 0;
    const m = new StallMonitor(stallRules(10), () => t);
    m.reset();
    t = 15000; // ainda juntando os 10 s antes de tocar
    expect(m.verdict()).toBeNull();
    t = 19500;
    expect(m.verdict()).toBe('startup');

    m.reset();
    m.playing();
    t = 30000;
    m.buffering();
    t = 41000; // travou e está juntando 10 s para voltar
    expect(m.verdict()).toBeNull();
    t = 47500;
    expect(m.verdict()).toBe('buffering');
  });
});
