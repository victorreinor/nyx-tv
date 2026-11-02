// Grade (XMLTV): parse por regex (DOMParser não existe no worker e seria lento na TV)
// e limpeza de programas duplicados/sobrepostos que o provedor manda.
import { decodeEntities } from './normalize';
import type { Program } from './types';

const PROGRAMME = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/;
const DESC = /<desc[^>]*>([\s\S]*?)<\/desc>/;

function attr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : '';
}

/** "20261101213000 -0300" → epoch em segundos. */
export function parseXmltvDate(s: string): number {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) return 0;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000;
  if (!m[7]) return utc;
  const sign = m[7][0] === '-' ? -1 : 1;
  const off = sign * (parseInt(m[7].slice(1, 3), 10) * 3600 + parseInt(m[7].slice(3, 5), 10) * 60);
  return utc - off;
}

export interface EpgParseOptions {
  /** Ignora programas que terminam antes disso (segundos). */
  from?: number;
  /** Ignora programas que começam depois disso (segundos). */
  to?: number;
}

export function parseXmltv(xml: string, opts: EpgParseOptions = {}): Map<string, Program[]> {
  const from = opts.from || 0;
  const to = opts.to || Infinity;
  const out = new Map<string, Program[]>();
  PROGRAMME.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROGRAMME.exec(xml)) !== null) {
    const attrs = m[1];
    const channel = attr(attrs, 'channel');
    if (!channel) continue;
    const start = Number(attr(attrs, 'start_timestamp')) || parseXmltvDate(attr(attrs, 'start'));
    const stop = Number(attr(attrs, 'stop_timestamp')) || parseXmltvDate(attr(attrs, 'stop'));
    if (!start || !stop || stop <= start || stop < from || start > to) continue;
    const t = m[2].match(TITLE);
    const d = m[2].match(DESC);
    const p: Program = { start, stop, title: decodeEntities(t ? t[1].trim() : ''), desc: decodeEntities(d ? d[1].trim() : '') };
    const list = out.get(channel);
    if (list) list.push(p);
    else out.set(channel, [p]);
  }
  out.forEach((list, key) => out.set(key, cleanPrograms(list)));
  return out;
}

/**
 * Ordena e limpa: junta o mesmo título repetido em sequência, resolve sobreposição
 * cortando o anterior, e descarta duplicatas no mesmo horário (fica a mais longa).
 */
export function cleanPrograms(list: Program[]): Program[] {
  const sorted = list.slice().sort((a, b) => a.start - b.start || b.stop - a.stop);
  const out: Program[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...p });
      continue;
    }
    if (p.title === prev.title && p.start <= prev.stop + 300) {
      prev.stop = Math.max(prev.stop, p.stop);
      if (!prev.desc) prev.desc = p.desc;
      continue;
    }
    if (p.start === prev.start) continue;
    if (p.start < prev.stop) prev.stop = p.start;
    out.push({ ...p });
  }
  return out;
}

/** Programas que cruzam a janela [from, to). Busca binária: listas grandes não travam. */
export function programsInRange(list: Program[] | undefined, from: number, to: number): Program[] {
  if (!list || !list.length) return [];
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].stop <= from) lo = mid + 1;
    else hi = mid;
  }
  const out: Program[] = [];
  for (let i = lo; i < list.length && list[i].start < to; i++) out.push(list[i]);
  return out;
}
