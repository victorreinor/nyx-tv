// Funções puras de normalização. Sem DOM, sem estado: usadas no worker e nos testes.
import type { Quality } from './types';

const ACCENTS = /[̀-ͯ]/g;

/** Minúsculas, sem acento, só letras/números separados por um espaço. Base da busca e do agrupamento. */
export function searchKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(ACCENTS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const QUALITY_TOKENS = /\b(4k|uhd|fhd|hd|sd)\b/g;
const NOISE_TOKENS = /\b(4k|uhd|fhd|hd|sd|h265|hevc|60fps|alt|backup)\b/g;

/** Última marcação de qualidade no nome ("Record SP FHD" → "FHD"). */
export function detectQuality(name: string): Quality {
  let found = '';
  searchKey(name).replace(QUALITY_TOKENS, (m) => (found = m));
  if (found === '4k' || found === 'uhd') return '4K';
  if (found === 'fhd') return 'FHD';
  if (found === 'hd') return 'HD';
  if (found === 'sd') return 'SD';
  return '';
}

/** Chave que junta SD/HD/FHD/4K do mesmo canal. */
export function channelGroupKey(name: string): string {
  return searchKey(name).replace(NOISE_TOKENS, ' ').replace(/\s+/g, ' ').trim();
}

/** Nome para exibir, sem a marcação de qualidade ("RECORD SP 4K" → "RECORD SP"). */
export function cleanChannelName(name: string): string {
  return String(name || '')
    .replace(/\b(4K|UHD|FHD|HD|SD|H265|HEVC|60FPS)\b\*?/gi, ' ')
    .replace(/[*|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Versões que o provedor marca no nome: vira selo na capa (o título exibido fica limpo). */
export function versionTags(name: string): string[] {
  const n = String(name || '');
  const out: string[] = [];
  if (/\b(4k|uhd)\b/i.test(n)) out.push('4K');
  if (/\[l\]|\blegendad/i.test(n)) out.push('LEG');
  if (/dublad|\[d\]|\bdual\b/i.test(n)) out.push('DUB');
  return out;
}

/** Título para exibir: tira marcações do provedor ("Devorador [L]", "Nós [Lançamento]", "Filme 4K", "(Dublado)"). */
export function displayTitle(name: string): string {
  const clean = String(name || '')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s*\((dublado|legendado|dual [aá]udio)\)\s*/gi, ' ')
    .replace(/\s*\((19|20)\d{2}\)\s*$/, '')
    .replace(/\s+4K\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || String(name || '').trim();
}

export const QUALITY_RANK: Record<Quality, number> = { '4K': 4, FHD: 3, HD: 2, SD: 1, '': 0 };

const ADULT = /(adult|xxx|porn|onlyfans|privacy|\+ ?18|18 ?\+|sensual|brasileirinhas|er[oó]tic|hentai|⛔)/i;

export function isAdultCategory(name: string): boolean {
  return ADULT.test(name);
}

// Títulos explícitos (pt/en). Só palavras que quase nunca aparecem em título comum:
// "cum" e "cock" exatos (não "cumplicidade", "cocktail"); sem "dick" (Moby Dick) nem "sex" (Sex Education).
const EXPLICIT = /\b(fuck\w*|porn\w*|xxx|blowjobs?|anal|cum|cumshot|pussy|cocks?|milfs?|hentai|gangbang|threesome|bareback|creampie|horny|boquete|safad[ao]s?|ninfetas?|transando|fodendo|gozad[ao]|gozou|buceta|roludo|putaria|rabuda|siririca)\b/i;

export function isExplicitTitle(name: string): boolean {
  return EXPLICIT.test(name);
}

/**
 * Categoria adulta pelo conteúdo: o nome nem sempre diz ("Gay", "Diversidade & Estilos").
 * Marca a categoria (e os itens dela) quando ao menos `minShare` dos títulos e `minHits` itens são explícitos.
 * Retorna quantas categorias marcou.
 */
export function markAdultByContent<T extends { name: string; categories: string[]; adult: boolean }>(
  items: T[],
  categories: { id: string; adult: boolean }[],
  minShare = 0.3,
  minHits = 3,
): number {
  const stats = new Map<string, { n: number; hits: number }>();
  for (const it of items) {
    const hit = isExplicitTitle(it.name);
    for (const c of it.categories) {
      const st = stats.get(c) || { n: 0, hits: 0 };
      st.n++;
      if (hit) st.hits++;
      stats.set(c, st);
    }
  }
  const adult = new Set<string>();
  stats.forEach((st, c) => {
    if (st.hits >= minHits && st.hits / st.n >= minShare) adult.add(c);
  });
  if (!adult.size) return 0;
  let marked = 0;
  for (const c of categories) {
    if (!adult.has(c.id) || c.adult) continue;
    c.adult = true;
    marked++;
  }
  for (const it of items) if (!it.adult && it.categories.some((c) => adult.has(c))) it.adult = true;
  return marked;
}

/** Capas do TMDB vêm em w600; na TV usamos o tamanho exato do card. */
export function tmdbImage(url: string, size: 'w185' | 'w342' | 'w780' | 'w1280'): string {
  if (!url) return '';
  return url.replace(/(image\.tmdb\.org\/t\/p\/)(w\d+|original)\//, `$1${size}/`);
}

export function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) ? n : fallback;
}

export function yearOf(v: unknown): number {
  const m = String(v || '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : 0;
}

/** Decodifica entidades XML/HTML comuns da grade e do M3U. */
export function decodeEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
