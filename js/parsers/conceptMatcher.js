// conceptMatcher.js — Matching de headers de archivo contra un catálogo de conceptos
//
// Patrón: cada concepto del catálogo tiene un CODIGO canónico + lista de ALIAS.
// Esta utility provee:
//   - normalizeName(s)            — normalización agresiva (sin acentos/guiones/espacios)
//   - findHeaderForConcept(...)   — busca el header del archivo que matchea un concepto
//   - matchHeadersToCatalog(...)  — cruza todos los headers contra el catálogo
//
// Estrategia de matching (en orden):
//   1. Exact match (normalizado) contra CODIGO o cualquier ALIAS
//   2. Levenshtein distance ≤ 1 contra CODIGO (para typos como "SAL BASE" vs "SAL_BASE")
//   3. Sin match → header queda "huérfano"

/**
 * Normaliza un string para comparación robusta:
 *   - lowercase
 *   - sin tildes/acentos
 *   - sin guiones, underscores ni espacios
 */
export function normalizeName(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin acentos
    .toLowerCase()
    .replace(/[\s_\-]/g, '');
}

/**
 * Levenshtein distance (iterativo, O(n*m) — fine para strings cortos).
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // inserción
        prev[j]     + 1,        // eliminación
        prev[j - 1] + cost,     // sustitución
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Busca, dentro de `headers`, el que corresponde al concepto del catálogo.
 *
 * @param {object}   concept  — { codigo, alias?: string[] }
 * @param {string[]} headers  — lista de headers del archivo
 * @returns {{ header: string, strategy: 'exact'|'alias'|'fuzzy' } | null}
 */
export function findHeaderForConcept(concept, headers) {
  const nCodigo = normalizeName(concept.codigo);
  const nAliases = (concept.alias || []).map(normalizeName);
  const nHeaders = headers.map(h => ({ raw: h, norm: normalizeName(h) }));

  // 1. Exact match contra CODIGO
  const exactCodigo = nHeaders.find(h => h.norm === nCodigo);
  if (exactCodigo) return { header: exactCodigo.raw, strategy: 'exact' };

  // 2. Exact match contra cualquier ALIAS
  const exactAlias = nHeaders.find(h => nAliases.includes(h.norm));
  if (exactAlias) return { header: exactAlias.raw, strategy: 'alias' };

  // 3. Fuzzy contra CODIGO con distance ≤ 1 (sólo para CODIGOs de longitud ≥ 4
  //    para evitar matches absurdos en strings muy cortos)
  if (nCodigo.length >= 4) {
    const fuzzy = nHeaders
      .map(h => ({ ...h, dist: levenshtein(h.norm, nCodigo) }))
      .filter(h => h.dist <= 1)
      .sort((a, b) => a.dist - b.dist)[0];
    if (fuzzy) return { header: fuzzy.raw, strategy: 'fuzzy' };
  }

  return null;
}

/**
 * Cruza la lista de headers del archivo contra el catálogo completo.
 * Útil para el panel "Análisis del Tabulado".
 *
 * @param {string[]} headers      — headers del archivo
 * @param {Array}    catalogRows  — filas del catálogo (`{ codigo, alias, controles, ... }`)
 * @param {string[]} expectedCodes — opcional: lista de códigos que se esperan en este archivo;
 *                                   si se pasa, se calcula `missing` (esperados pero no encontrados)
 * @returns {{
 *   recognized: Array<{ header, concept, strategy }>,
 *   unrecognized: string[],
 *   missing: Array<{ codigo, concept }>,
 * }}
 */
export function matchHeadersToCatalog(headers, catalogRows, expectedCodes = null) {
  const recognized = [];
  const matchedHeaders = new Set();

  for (const concept of catalogRows) {
    const m = findHeaderForConcept(concept, headers);
    if (m && !matchedHeaders.has(m.header)) {
      recognized.push({ header: m.header, concept, strategy: m.strategy });
      matchedHeaders.add(m.header);
    }
  }

  const unrecognized = headers.filter(h => !matchedHeaders.has(h));

  let missing = [];
  if (Array.isArray(expectedCodes) && expectedCodes.length > 0) {
    const recognizedCodes = new Set(recognized.map(r => r.concept.codigo));
    const catalogByCodigo = new Map(catalogRows.map(c => [c.codigo, c]));
    missing = expectedCodes
      .filter(code => !recognizedCodes.has(code))
      .map(code => ({ codigo: code, concept: catalogByCodigo.get(code) || null }));
  }

  return { recognized, unrecognized, missing };
}

/**
 * Helper de conveniencia para los parsers:
 * recibe un mapa { CODIGO_CATALOGO → keyDeMapping } y devuelve `{ keyDeMapping: headerEncontrado }`.
 * Si un concepto requerido no se encuentra, su key queda sin asignar.
 *
 * @example
 *   const mapping = buildParserMapping(headers, catalogRows, {
 *     'LEGAJO':   'legajoColumn',
 *     'SAL_BASE': 'salBaseColumn',
 *   });
 *   // → { legajoColumn: 'LEGAJO', salBaseColumn: 'SAL_BASE' }
 */
export function buildParserMapping(headers, catalogRows, codigoToKey) {
  const mapping = {};
  const catalogByCodigo = new Map(catalogRows.map(c => [c.codigo, c]));

  for (const [codigo, key] of Object.entries(codigoToKey)) {
    const concept = catalogByCodigo.get(codigo) || { codigo, alias: [] };
    const m = findHeaderForConcept(concept, headers);
    if (m) mapping[key] = m.header;
  }

  return mapping;
}
