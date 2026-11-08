import { describe, expect, test } from 'bun:test';
import { apiStep, epgStep, hlsNext, loginSteps, m3uStep, softenVideo, streamStep, summarize } from '../src/data/health';
import type { ProbeResult } from '../src/data/xtream';

const NOW = Date.UTC(2026, 10, 8, 14, 0, 0);
const DAY = 86400000;
const NGINX_404 = '<html>\r\n<head><title>404 Not Found</title></head>\r\n<body>\r\n<center><h1>404 Not Found</h1></center>\r\n<hr><center>nginx</center>';

const res = (over: Partial<ProbeResult>): ProbeResult => ({ status: 200, ms: 120, timedOut: false, error: '', type: 'application/json', bytes: 100, first: 123, text: '', url: 'http://x/', ...over });
const login = (ui: Record<string, unknown>) => res({ text: JSON.stringify({ user_info: { auth: 1, status: 'Active', active_cons: '0', max_connections: '2', exp_date: String((NOW + 30 * DAY) / 1000), ...ui } }) });

describe('loginSteps: servidor', () => {
  test('nginx de pé com o painel caído (404 HTML) = servidor fora', () => {
    const r = loginSteps(res({ status: 404, type: 'text/html', text: NGINX_404 }), NOW);
    expect(r.server).toMatchObject({ state: 'fail', reason: 'http', detail: 'HTTP 404 · nginx' });
    expect(r.account.state).toBe('skip');
  });
  test('sem resposta no prazo', () => {
    expect(loginSteps(res({ status: 0, timedOut: true, ms: 6000, error: 'aborted' }), NOW).server).toMatchObject({ state: 'fail', reason: 'timeout' });
  });
  test('sem rede / DNS', () => {
    expect(loginSteps(res({ status: 0, error: 'Failed to fetch' }), NOW).server).toMatchObject({ state: 'fail', reason: 'network' });
  });
  test('200 com página HTML no lugar do JSON', () => {
    expect(loginSteps(res({ type: 'text/html', text: '<!DOCTYPE html><html>' }), NOW).server).toMatchObject({ state: 'fail', reason: 'notJson', detail: 'HTML' });
  });
});

describe('loginSteps: conta', () => {
  test('ativa', () => {
    const r = loginSteps(login({ active_cons: '1' }), NOW);
    expect(r.server.state).toBe('ok');
    expect(r.account).toMatchObject({ state: 'ok', detail: 'Active · 1/2' });
    expect(r.account.vars!.date).toBe(NOW + 30 * DAY);
  });
  test('usuário ou senha errados', () => {
    expect(loginSteps(login({ auth: 0 }), NOW).account.reason).toBe('auth');
    expect(loginSteps(res({ text: '[]' }), NOW).account.reason).toBe('auth');
  });
  test('vencida pela data, mesmo com status Active', () => {
    expect(loginSteps(login({ exp_date: String((NOW - 60000) / 1000) }), NOW).account).toMatchObject({ state: 'fail', reason: 'expired' });
  });
  test('vencida pelo status', () => {
    expect(loginSteps(login({ status: 'Expired' }), NOW).account.reason).toBe('expired');
  });
  test('banida, desativada, outro status', () => {
    expect(loginSteps(login({ status: 'Banned' }), NOW).account.reason).toBe('banned');
    expect(loginSteps(login({ status: 'Disabled' }), NOW).account.reason).toBe('disabled');
    expect(loginSteps(login({ status: 'Paused' }), NOW).account).toMatchObject({ reason: 'inactive', vars: { status: 'Paused' } });
  });
  test('todas as telas em uso = aviso (o login funciona, o vídeo não)', () => {
    expect(loginSteps(login({ active_cons: '2' }), NOW).account).toMatchObject({ state: 'warn', reason: 'connections', vars: { active: 2, max: 2 } });
  });
  test('vence em menos de 3 dias = aviso com os dias', () => {
    expect(loginSteps(login({ exp_date: String((NOW + 10 * 3600000) / 1000) }), NOW).account).toMatchObject({ state: 'warn', reason: 'expiring', vars: { days: 1 } });
  });
  test('sem data de vencimento', () => {
    const r = loginSteps(login({ exp_date: null }), NOW);
    expect(r.account.state).toBe('ok');
    expect(r.account.vars!.date).toBe(0);
  });
});

describe('outras etapas', () => {
  test('API do catálogo responde lista', () => {
    expect(apiStep(res({ text: '[{"category_id":"1"}]' }))).toMatchObject({ state: 'ok', vars: { n: 1 } });
    expect(apiStep(res({ status: 404, text: NGINX_404 })).reason).toBe('http');
    expect(apiStep(res({ text: '{"user_info":{}}' })).reason).toBe('badData');
  });
  test('M3U', () => {
    expect(m3uStep(res({ text: '#EXTM3U\n#EXTINF:-1,Canal' })).state).toBe('ok');
    expect(m3uStep(res({ text: '<html>' })).reason).toBe('badData');
  });
  test('stream: bytes de vídeo, vazio ou página de erro', () => {
    expect(streamStep('live', res({ bytes: 16384, first: 0x47, type: 'video/mp2t' }))).toMatchObject({ state: 'ok', detail: '16 KB · TS' });
    expect(streamStep('live', res({ bytes: 0 })).reason).toBe('badData');
    expect(streamStep('live', res({ text: '<html>', type: 'text/html' })).detail).toBe('HTML');
    expect(streamStep('movie', res({ status: 403, text: '' })).detail).toBe('HTTP 403');
  });
  test('grade', () => {
    expect(epgStep(res({ text: '<?xml version="1.0"?><tv>' })).state).toBe('ok');
    expect(epgStep(res({ text: '', bytes: 0 })).detail).toBe('0 bytes');
  });
  test('HLS: segue para o segmento pelo endereço final', () => {
    expect(hlsNext('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nseg/1.ts\n', 'http://cdn.x/live/a/b/1.m3u8')).toBe('http://cdn.x/live/a/b/seg/1.ts');
    expect(hlsNext('#EXTM3U\n/hls/abc.ts', 'http://cdn.x/live/1.m3u8')).toBe('http://cdn.x/hls/abc.ts');
    expect(hlsNext('#EXTM3U\n', 'http://cdn.x/')).toBe('');
  });
});

describe('summarize', () => {
  test('a primeira falha explica o resultado, antes de qualquer aviso', () => {
    const l = loginSteps(login({ active_cons: '2' }), NOW);
    const api = apiStep(res({ status: 404, text: NGINX_404 }));
    const r = summarize([l.server, l.account, api], NOW, false);
    expect(r.state).toBe('fail');
    expect(r.main!.id).toBe('api');
  });
  test('só aviso', () => {
    const l = loginSteps(login({ active_cons: '2' }), NOW);
    expect(summarize([l.server, l.account], NOW, false)).toMatchObject({ state: 'warn', main: { reason: 'connections' } });
  });
  test('tudo ok', () => {
    const l = loginSteps(login({}), NOW);
    expect(summarize([l.server, l.account], NOW, false)).toMatchObject({ state: 'ok', main: null });
  });
});

describe('softenVideo', () => {
  const ok = streamStep('live', res({ bytes: 16384, first: 0x47 }));
  test('canal abriu e filme não = aviso, não falha', () => {
    const movie = streamStep('movie', res({ status: 404, text: NGINX_404 }));
    const steps = [ok, movie];
    softenVideo(steps);
    expect(movie.state).toBe('warn');
    expect(summarize(steps, NOW, true).state).toBe('warn');
  });
  test('os dois falharam = falha', () => {
    const live = streamStep('live', res({ status: 404, text: NGINX_404 }));
    const movie = streamStep('movie', res({ status: 404, text: NGINX_404 }));
    softenVideo([live, movie]);
    expect([live.state, movie.state]).toEqual(['fail', 'fail']);
  });
});
