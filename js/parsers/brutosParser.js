// brutosParser.js — Parser del Reporte de Brutos
//
// Columnas clave: LEGAJO, SAL_BASE, A_CTA_FUT_AUMEN
// El resto de columnas se preservan en parsedRows para futuros usos.
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

const BRUTOS_STD_COLS = {
  'LEGAJO':          'legajoColumn',
  'SAL_BASE':        'salBaseColumn',
  'A_CTA_FUT_AUMEN': 'aCuFutAumenColumn',
};

const BRUTOS_REQUIRED_KEYS = ['legajoColumn'];

/**
 * Auto-detección de columnas del Reporte de Brutos.
 * Retorna el mapping si la columna de LEGAJO se encontró, null si no.
 */
export function autoDetectBrutosMapping(headers) {
  const mapping = {};
  for (const [colName, key] of Object.entries(BRUTOS_STD_COLS)) {
    const idx = headers.findIndex(h =>
      h === colName || h.toLowerCase() === colName.toLowerCase()
    );
    if (idx >= 0) mapping[key] = headers[idx];
  }
  return BRUTOS_REQUIRED_KEYS.every(k => mapping[k]) ? mapping : null;
}

/**
 * Parsea el Reporte de Brutos.
 * Excluye filas sin LEGAJO válido (subtotales, separadores).
 */
export function parseBrutos(arrayBuffer, mapping) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rawRows.length === 0) throw new Error('El archivo está vacío o no tiene filas de datos.');

  const legajoCol = mapping.legajoColumn;
  if (!legajoCol) throw new Error('No se configuró la columna de Legajo.');

  const parsedRows = rawRows.filter(row => {
    const val = row[legajoCol];
    return val !== null && val !== undefined && String(val).trim() !== '';
  });

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      parsedAt:  new Date().toISOString(),
    },
  };
}
