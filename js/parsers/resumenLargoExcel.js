// resumenLargoExcel.js — Lee un Excel de Resumen en formato LARGO y lo convierte
//
// Formato esperado: una FILA por combinación de empleado + concepto
//   Legajo | CódigoConcepto | Importe
//   001    | 100            | 50000
//   001    | 105            | 5000
//   002    | 100            | 45000
//   ...
//
// El parser lo convierte al mismo formato tabulado que la Nómina Maestra,
// para que el módulo de cruce pueda trabajar igual con ambos.
//
/* global XLSX */
import { parseAmount, redondear } from '../utils/currency.js';

export { detectHeaders } from './nominaMaestra.js';

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {object} mapping - { legajoColumnLong, conceptCodeColumn, importColumn }
 */
export function parseResumenLargo(arrayBuffer, mapping) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (rawRows.length < 2) throw new Error('El archivo está vacío o no tiene filas de datos.');

  const headers = (rawRows[0] || []).map(h => (h !== null ? String(h).trim() : ''));
  const dataRows = rawRows.slice(1);

  const legajoIdx  = findColIdx(headers, mapping.legajoColumnLong);
  const conceptIdx = findColIdx(headers, mapping.conceptCodeColumn);
  const importIdx  = findColIdx(headers, mapping.importColumn);

  if (legajoIdx  === -1) throw new Error(`No se encontró la columna de legajo: "${mapping.legajoColumnLong}".`);
  if (conceptIdx === -1) throw new Error(`No se encontró la columna de código de concepto: "${mapping.conceptCodeColumn}".`);
  if (importIdx  === -1) throw new Error(`No se encontró la columna de importe: "${mapping.importColumn}".`);

  // Acumulamos importe por (legajo, concepto) usando un mapa anidado
  const acum = new Map(); // legajo → Map(concepto → suma)
  const warnings = [];
  let skippedRows = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rawLegajo  = row[legajoIdx];
    const rawConcept = row[conceptIdx];

    if (rawLegajo === null || rawLegajo === undefined || String(rawLegajo).trim() === '') {
      skippedRows++;
      continue;
    }
    if (rawConcept === null || rawConcept === undefined || String(rawConcept).trim() === '') continue;

    const legajo  = String(rawLegajo).trim();
    const concept = String(rawConcept).trim();
    const amount  = parseAmount(row[importIdx]);

    if (!acum.has(legajo)) acum.set(legajo, new Map());
    const legajoMap = acum.get(legajo);
    legajoMap.set(concept, (legajoMap.get(concept) || 0) + amount);
  }

  if (skippedRows > 0) warnings.push(`Se saltaron ${skippedRows} fila(s) con legajo vacío.`);

  // Convertimos el mapa a filas en formato tabulado horizontal
  const parsedRows = [];
  const allConcepts = new Set();

  for (const [legajo, conceptMap] of acum) {
    const entry = { legajo };
    for (const [concept, sum] of conceptMap) {
      entry[concept] = redondear(sum);
      allConcepts.add(concept);
    }
    parsedRows.push(entry);
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      uniqueLegajos: parsedRows.length,
      detectedConcepts: [...allConcepts],
      parsedAt: new Date().toISOString(),
      warnings,
    },
  };
}

function findColIdx(headers, columnName) {
  if (!columnName) return -1;
  let idx = headers.indexOf(columnName);
  if (idx >= 0) return idx;
  return headers.findIndex(h => h.toLowerCase() === columnName.toLowerCase());
}
