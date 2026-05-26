// conceptCatalog.js — Parser del Catálogo de Conceptos (.xlsx por cliente)
//
// Estructura esperada del archivo:
//   CODIGO         (obligatoria) — identificador canónico del concepto
//   DESCRIPCION    (obligatoria) — nombre humano
//   CLASIFICACION  (obligatoria) — 'remu' | 'no_remu' | 'aporte' | 'contribucion'
//   CONTROLES      (opcional)    — ids de controles que lo usan, separados por '|'
//   ALIAS          (opcional)    — variantes de nombre de columna, separados por '|'
//
// El parser tolera variaciones de mayúsculas y espacios en los nombres de
// las columnas del archivo (no de los valores), y valida que las filas
// tengan CODIGO + DESCRIPCION + CLASIFICACION.
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

const REQUIRED_HEADERS = ['CODIGO', 'DESCRIPCION', 'CLASIFICACION'];
const OPTIONAL_HEADERS = ['CONTROLES', 'ALIAS'];
const VALID_CLASIFICACIONES = ['remu', 'no_remu', 'aporte', 'contribucion'];

/**
 * Parsea el .xlsx del catálogo de conceptos.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ rows: Array, parseMetadata: object }}
 */
export function parseConceptCatalog(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows  = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rawRows.length === 0) {
    throw new Error('El catálogo está vacío.');
  }

  // Mapeo header del archivo → key canónica (tolerante a variaciones de mayúsculas)
  const sample      = rawRows[0];
  const fileHeaders = Object.keys(sample);
  const headerMap   = {};
  for (const want of [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]) {
    const found = fileHeaders.find(h => normalize(h) === normalize(want));
    if (found) headerMap[want] = found;
  }

  const missing = REQUIRED_HEADERS.filter(h => !headerMap[h]);
  if (missing.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias en el catálogo: ${missing.join(', ')}. ` +
      `El archivo debe tener CODIGO, DESCRIPCION y CLASIFICACION como mínimo.`
    );
  }

  const rows      = [];
  const warnings  = [];

  rawRows.forEach((raw, i) => {
    const codigo        = norm(raw[headerMap.CODIGO]);
    const descripcion   = norm(raw[headerMap.DESCRIPCION]);
    const clasificacion = norm(raw[headerMap.CLASIFICACION]).toLowerCase();

    if (!codigo) {
      // Fila sin código — la salteamos sin warning (puede ser separador)
      return;
    }
    if (!descripcion) {
      warnings.push(`Fila ${i + 2}: "${codigo}" sin descripción.`);
    }
    if (!VALID_CLASIFICACIONES.includes(clasificacion)) {
      warnings.push(
        `Fila ${i + 2}: "${codigo}" tiene clasificación inválida "${clasificacion}". ` +
        `Debe ser una de: ${VALID_CLASIFICACIONES.join(', ')}.`
      );
      return; // saltamos esta fila — no se puede usar sin clasificación válida
    }

    const controles = headerMap.CONTROLES
      ? splitPipe(raw[headerMap.CONTROLES])
      : [];
    const alias = headerMap.ALIAS
      ? splitPipe(raw[headerMap.ALIAS])
      : [];

    rows.push({ codigo, descripcion, clasificacion, controles, alias });
  });

  // Detectar duplicados de CODIGO
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.codigo)) {
      warnings.push(`Código "${r.codigo}" aparece más de una vez — se usará la primera ocurrencia.`);
    } else {
      seen.set(r.codigo, r);
    }
  }
  const dedupedRows = Array.from(seen.values());

  return {
    rows: dedupedRows,
    parseMetadata: {
      totalRows:    dedupedRows.length,
      remu:         dedupedRows.filter(r => r.clasificacion === 'remu').length,
      noRemu:       dedupedRows.filter(r => r.clasificacion === 'no_remu').length,
      aporte:       dedupedRows.filter(r => r.clasificacion === 'aporte').length,
      contribucion: dedupedRows.filter(r => r.clasificacion === 'contribucion').length,
      warnings,
      parsedAt:     new Date().toISOString(),
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function norm(v) {
  return v != null ? String(v).trim() : '';
}

function splitPipe(v) {
  if (v == null) return [];
  return String(v).split('|').map(s => s.trim()).filter(Boolean);
}

function normalize(s) {
  return String(s ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
}
