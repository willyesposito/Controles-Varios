// rendimientoParser.js — Parser del Reporte de Rendimiento por Centro de Costo
//
// Columnas clave: CC code (primera col, sin encabezado), CENTRO COSTO,
//   PRECIO, ASIGNACIÓN ESTIMULO, RETIROS, CARGAS SOCIALES, PROVISIÓN MES,
//   PROVISIÓN CARGAS SOCIALES MES, COSTO TOTAL
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

// Mapa de nombre de columna (uppercase) → clave de mapping
const REND_COL_MAP = {
  'PRECIO':                          'precioColumn',
  'ASIGNACIÓN ESTIMULO':             'estimuloColumn',
  'ASIGNACION ESTIMULO':             'estimuloColumn',
  'RETIROS':                         'retirosColumn',
  'CARGAS SOCIALES (SIN SAC)':       'cargasColumn',
  'CARGAS SOCIALES':                 'cargasColumn',
  'PROVISIÓN MES':                   'provMesColumn',
  'PROVISION MES':                   'provMesColumn',
  'PROVISIÓN CARGAS SOCIALES MES':   'provCcssColumn',
  'PROVISION CARGAS SOCIALES MES':   'provCcssColumn',
  'COSTO TOTAL':                     'costoTotalColumn',
};

const CC_NAME_VARIANTS = ['CENTRO COSTO', 'CENTRO DE COSTO', 'CENTRO_COSTO'];

/**
 * Auto-detección de columnas del Reporte de Rendimiento.
 * @param {string[]} headers  — resultado de detectHeaders(), '' para celdas vacías
 */
export function autoDetectRendimientoMapping(headers) {
  // detectHeaders() devuelve '' para celdas vacías; sheet_to_json (sin header:1)
  // genera '__EMPTY', '__EMPTY_1'… para esas mismas posiciones.
  let emptyCount = 0;
  const normalizedHeaders = headers.map(h => {
    if (h !== '') return h;
    return emptyCount++ === 0 ? '__EMPTY' : `__EMPTY_${emptyCount - 1}`;
  });

  const uc = h => String(h ?? '').trim().toUpperCase();
  const mapping = {};

  // Col CC code: primera columna (habitualmente sin encabezado → '__EMPTY')
  mapping.ccCodeColumn = normalizedHeaders[0] ?? null;

  // CC name
  mapping.ccNameColumn =
    normalizedHeaders.find(h => CC_NAME_VARIANTS.includes(uc(h))) || null;

  // Columnas de importes: exactas, case-insensitive
  for (const h of normalizedHeaders) {
    const key = REND_COL_MAP[uc(h)];
    if (key && !mapping[key]) mapping[key] = h;
  }

  // Requeridas: CC name + PRECIO
  if (!mapping.ccNameColumn || !mapping.precioColumn) return null;
  return mapping;
}

/**
 * Parsea el Reporte de Rendimiento.
 * Excluye filas sin nombre de CC (cabeceras vacías, subtotales "Total general…").
 */
export function parseRendimiento(arrayBuffer, mapping) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows  = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rawRows.length === 0) throw new Error('El archivo está vacío o no tiene filas de datos.');

  const ccNameCol = mapping.ccNameColumn;
  if (!ccNameCol) throw new Error('No se configuró la columna de Centro de Costo.');

  const parsedRows = rawRows.filter(row => {
    const name = String(row[ccNameCol] ?? '').trim();
    if (!name) return false;
    if (name.toLowerCase().startsWith('total')) return false;
    return true;
  });

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      parsedAt:  new Date().toISOString(),
    },
  };
}
