// ccXEmpleadoExcel.js — Parser del archivo CC x Empleado (override de centro de costo)
//
// Formato esperado (fijo):
//   Hoja: la primera del workbook (ej: "CC x Empleado").
//   Encabezados: EMPLEADO, APELLIDO Y NOMBRE, ID_CENTRO_COSTO, CENTRO_COSTO.
//   Una fila por empleado con su CC actualizado.
//
// Uso: cuando el CC_NOMBRE de CONTA está desactualizado, este archivo
// permite reasignar el CC a partir del ID_EMPLEADO.
//
/* global XLSX */

const REQUIRED_HEADERS = ['EMPLEADO', 'CENTRO_COSTO'];

function norm(v) { return v == null ? '' : String(v).trim(); }

/**
 * Parsea el Excel de CC x Empleado.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseCcXEmpleado(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas.');

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (rawRows.length === 0) throw new Error('La hoja de CC x Empleado está vacía.');

  const headers = Object.keys(rawRows[0]);
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias en CC x Empleado: ${missing.join(', ')}. `
      + `Encabezados encontrados: ${headers.join(', ')}`
    );
  }

  const parsedRows = [];
  for (const row of rawRows) {
    const empleado = norm(row['EMPLEADO']);
    const cc       = norm(row['CENTRO_COSTO']);
    if (!empleado || !cc) continue;
    parsedRows.push({
      id_empleado:     empleado,
      id_centro_costo: norm(row['ID_CENTRO_COSTO']),
      centro_costo:    cc,
    });
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      parsedAt:  new Date().toISOString(),
    },
  };
}
