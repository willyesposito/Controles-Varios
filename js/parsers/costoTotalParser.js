// costoTotalParser.js — Parser del Reporte de Costo Total por empleado (M4)
//
// Columnas clave: ID Empleado (Legajo) y COSTO TOTAL.
// Es el reporte de Rendimiento bajado a nivel de empleado: una fila por legajo.
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

// Variantes de encabezado conocidas (uppercase) para cada campo
const LEGAJO_VARIANTS = ['ID_EMPLEADO', 'ID EMPLEADO', 'LEGAJO', 'EMPLEADO', 'ID'];
const COSTO_VARIANTS  = ['COSTO TOTAL', 'COSTO_TOTAL', 'COSTOTOTAL'];

/**
 * Auto-detección de columnas del Reporte de Costo Total.
 * @param {string[]} headers — resultado de detectHeaders(), '' para celdas vacías
 */
export function autoDetectCostoTotalMapping(headers) {
  // detectHeaders() devuelve '' para celdas vacías; sheet_to_json (sin header:1)
  // genera '__EMPTY', '__EMPTY_1'… para esas mismas posiciones.
  let emptyCount = 0;
  const normalizedHeaders = headers.map(h => {
    if (h !== '') return h;
    return emptyCount++ === 0 ? '__EMPTY' : `__EMPTY_${emptyCount - 1}`;
  });

  const uc = h => String(h ?? '').trim().toUpperCase();
  const mapping = {};

  mapping.legajoColumn =
    normalizedHeaders.find(h => LEGAJO_VARIANTS.includes(uc(h)))
    || normalizedHeaders.find(h => uc(h).includes('LEGAJO') || uc(h).includes('EMPLEADO'))
    || null;

  mapping.costoTotalColumn =
    normalizedHeaders.find(h => COSTO_VARIANTS.includes(uc(h)))
    || normalizedHeaders.find(h => uc(h).includes('COSTO'))
    || null;

  if (!mapping.legajoColumn || !mapping.costoTotalColumn) return null;
  return mapping;
}

/**
 * Parsea el Reporte de Costo Total por empleado.
 * Excluye filas sin legajo y filas de subtotales ("Total general…").
 */
export function parseCostoTotal(arrayBuffer, mapping) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows  = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rawRows.length === 0) throw new Error('El archivo está vacío o no tiene filas de datos.');

  const legajoCol = mapping.legajoColumn;
  if (!legajoCol) throw new Error('No se configuró la columna de Legajo.');

  const parsedRows = rawRows.filter(row => {
    const legajo = String(row[legajoCol] ?? '').trim();
    if (!legajo) return false;
    if (legajo.toLowerCase().startsWith('total')) return false;
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
