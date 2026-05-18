// nominaMaestra.js — Lee un Excel de Nómina Maestra y lo convierte a lista de objetos
//
// Formato esperado: TABULADO HORIZONTAL
//   Fila 1: encabezados (Legajo, Apellido, Nombre, 100, 105, 200, ...)
//   Filas 2+: una fila por empleado, con su importe en cada columna de concepto
//
// También sirve para el "Resumen Tabulado Horizontal" que tiene el mismo formato.
//
/* global XLSX */
import { parseAmount } from '../utils/currency.js';

/**
 * Lee los encabezados de un Excel sin parsearlo completo.
 * Útil para mostrarle al usuario las columnas disponibles antes de mapear.
 *
 * @returns {{ headers: string[], preview: any[][] }}
 */
export function detectHeaders(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headers = (rawRows[0] || []).map(h => (h !== null ? String(h).trim() : ''));
  const preview = rawRows.slice(1, 4); // primeras 3 filas de datos para mostrar como ejemplo
  return { headers, preview };
}

/**
 * Parsea un Excel de Nómina Maestra con el mapeo ya definido.
 *
 * @param {ArrayBuffer} arrayBuffer - Contenido del archivo
 * @param {object} mapping - { legajoColumn, apellidoColumn?, nombreColumn?, conceptColumnsStartAt }
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseNominaMaestra(arrayBuffer, mapping) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (rawRows.length < 2) throw new Error('El archivo está vacío o no tiene filas de datos.');

  const headers = (rawRows[0] || []).map(h => (h !== null ? String(h).trim() : ''));
  const dataRows = rawRows.slice(1);

  const legajoIdx       = findColIdx(headers, mapping.legajoColumn);
  const apellidoIdx     = mapping.apellidoColumn  ? findColIdx(headers, mapping.apellidoColumn)  : -1;
  const nombreIdx       = mapping.nombreColumn    ? findColIdx(headers, mapping.nombreColumn)    : -1;
  const conceptStartIdx = findColIdx(headers, mapping.conceptColumnsStartAt);

  if (legajoIdx === -1)       throw new Error(`No se encontró la columna de legajo: "${mapping.legajoColumn}".`);
  if (conceptStartIdx === -1) throw new Error(`No se encontró la columna de inicio de conceptos: "${mapping.conceptColumnsStartAt}".`);

  // Los nombres de las columnas de conceptos son los encabezados desde esa columna en adelante
  const conceptHeaders = headers.slice(conceptStartIdx).filter(h => h !== '');

  const parsedRows = [];
  const warnings = [];
  let skippedRows = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rawLegajo = row[legajoIdx];

    // Filas sin legajo se omiten (pueden ser totales, filas vacías, etc.)
    if (rawLegajo === null || rawLegajo === undefined || String(rawLegajo).trim() === '') {
      skippedRows++;
      continue;
    }

    const entry = { legajo: String(rawLegajo).trim() };
    if (apellidoIdx >= 0 && row[apellidoIdx] != null) entry.apellido = String(row[apellidoIdx]).trim();
    if (nombreIdx   >= 0 && row[nombreIdx]   != null) entry.nombre   = String(row[nombreIdx]).trim();

    for (let c = 0; c < conceptHeaders.length; c++) {
      const code = conceptHeaders[c];
      const rawVal = row[conceptStartIdx + c];
      const amount = parseAmount(rawVal);
      // Solo avisamos si había algo que no fuera número ni vacío
      if (rawVal !== null && rawVal !== '' && typeof rawVal !== 'number' && amount === 0) {
        const strVal = String(rawVal).trim().replace(/\./g, '').replace(',', '.');
        if (isNaN(parseFloat(strVal))) {
          warnings.push(`Fila ${i + 2}, concepto "${code}": valor no numérico ("${rawVal}"), se usó 0.`);
        }
      }
      entry[code] = amount;
    }

    parsedRows.push(entry);
  }

  if (skippedRows > 0) warnings.push(`Se saltaron ${skippedRows} fila(s) con legajo vacío.`);

  const uniqueLegajos = new Set(parsedRows.map(r => r.legajo)).size;

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      uniqueLegajos,
      detectedConcepts: conceptHeaders,
      parsedAt: new Date().toISOString(),
      warnings,
    },
  };
}

/** Busca el índice de una columna por nombre (exacto primero, luego sin distinción de mayúsculas) */
function findColIdx(headers, columnName) {
  if (!columnName) return -1;
  let idx = headers.indexOf(columnName);
  if (idx >= 0) return idx;
  const lower = columnName.toLowerCase();
  return headers.findIndex(h => h.toLowerCase() === lower);
}
