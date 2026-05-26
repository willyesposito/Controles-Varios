// gsPersParser.js — Parser del Reporte de Gastos Personales y Cochera (GS Pers)
//
// Columnas clave: LEGAJO, GTOS_PERSONALES, DTO_COCHERA
// El resto de columnas se preservan en parsedRows para futuros usos.
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';
import { buildParserMapping } from './conceptMatcher.js';
import { CATALOGO_SEED } from '../data/catalogoSeed.js';

const LEGAJO_ALIASES = ['LEGAJO', 'ID_EMPLEADO', 'LEGAJO_SAP'];

/**
 * Auto-detección de columnas del Reporte de GS Pers.
 * @param {string[]} headers
 * @param {Array}    [catalogRows] — catálogo activo; si no se pasa, usa CATALOGO_SEED
 */
export function autoDetectGsPersMapping(headers, catalogRows) {
  const catalog = catalogRows || CATALOGO_SEED;
  const lc = h => String(h).toLowerCase();

  const legajoHeader = headers.find(h => LEGAJO_ALIASES.some(a => lc(a) === lc(h)));
  if (!legajoHeader) return null;

  const conceptMapping = buildParserMapping(headers, catalog, {
    'GTOS_PERSONALES': 'gtosPersonalesColumn',
    'DTO_COCHERA':     'dtoCocheraColumn',
  });

  return { legajoColumn: legajoHeader, ...conceptMapping };
}

/**
 * Parsea el Reporte de GS Pers.
 * Excluye filas sin LEGAJO válido (subtotales, separadores).
 */
export function parseGsPers(arrayBuffer, mapping) {
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
