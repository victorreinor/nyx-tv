// i18n: t('chave', { var }) reativo ao idioma escolhido nas configurações.
import { en } from './en';
import { es } from './es';
import { ptBR, type MessageKey } from './pt-BR';
import { settings } from '../settings';

export type Locale = 'pt-BR' | 'en' | 'es';
export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];

const DICTS: Record<Locale, Record<MessageKey, string>> = { 'pt-BR': ptBR, en, es };

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const dict = DICTS[settings.locale] || ptBR;
  let s = dict[key] || ptBR[key] || key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

const timeFmt: Partial<Record<Locale, Intl.DateTimeFormat>> = {};
const dayFmt: Partial<Record<Locale, Intl.DateTimeFormat>> = {};

/** 21:42 */
export function fmtTime(epochSec: number): string {
  const l = settings.locale;
  const f = timeFmt[l] || (timeFmt[l] = new Intl.DateTimeFormat(l, { hour: '2-digit', minute: '2-digit', hour12: false }));
  return f.format(new Date(epochSec * 1000));
}

/** seg., 2 de nov. */
export function fmtDay(epochSec: number): string {
  const l = settings.locale;
  const f = dayFmt[l] || (dayFmt[l] = new Intl.DateTimeFormat(l, { weekday: 'short', day: 'numeric', month: 'short' }));
  return f.format(new Date(epochSec * 1000));
}

/** 23 min · 1h 05 */
export function fmtDuration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  return min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}` : t('common.min', { n: min });
}

/** 01:02:03 / 12:34 */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(r).padStart(2, '0');
}

/** "há 2 h" no idioma atual. */
export function fmtAgo(epochMs: number): string {
  const l = settings.locale;
  const diff = Math.round((epochMs - Date.now()) / 60000);
  // RelativeTimeFormat existe no Chrome 71+, mas fica fora do lib ES2019 do TypeScript.
  const RTF = (Intl as unknown as { RelativeTimeFormat: new (l: string, o: object) => { format(v: number, u: string): string } }).RelativeTimeFormat;
  const rtf = new RTF(l, { numeric: 'auto' });
  if (Math.abs(diff) < 60) return rtf.format(diff, 'minute');
  if (Math.abs(diff) < 48 * 60) return rtf.format(Math.round(diff / 60), 'hour');
  return rtf.format(Math.round(diff / 1440), 'day');
}

export function greeting(): string {
  const h = new Date().getHours();
  return t(h < 12 && h >= 5 ? 'greet.morning' : h < 18 && h >= 12 ? 'greet.afternoon' : 'greet.night');
}

export type { MessageKey };
