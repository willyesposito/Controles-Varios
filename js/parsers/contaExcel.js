// contaExcel.js — Parser de la Contabilidad Desglosada (CONTA)
//
// Formato esperado (fijo):
//   Hoja: la primera del workbook (ej: "Contabilidad desglosada 04-2026").
//   Encabezados: FEC_PAGO, ID_EMPLEADO, NOMBRE, APELLIDO_1, ID_CONCEPTO,
//                NOMBRE_LARGO, CUENTA_CONTAB, ID_CONTA, ID_CENTRO_COSTO,
//                CC_NOMBRE, DEBE, HABER, N_CUENTA_CONTABLE, DEBE_HABER.
//   Una fila por (empleado, concepto, asiento). CC_NOMBRE = "Null" / vacío
//   son provisiones consolidadas sin CC — el control las descarta.
//
/* global XLSX */

const REQUIRED_HEADERS = ['ID_EMPLEADO', 'ID_CONCEPTO', 'CC_NOMBRE', 'DEBE', 'HABER'];

function norm(v) { return v == null ? '' : String(v).trim(); }

function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Parsea el Excel de Contabilidad Desglosada.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseConta(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas.');

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (rawRows.length === 0) throw new Error('La hoja de Contabilidad está vacía.');

  // Validar columnas obligatorias contra los headers de la primera fila
  const headers = Object.keys(rawRows[0]);
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias en CONTA: ${missing.join(', ')}. `
      + `Encabezados encontrados: ${headers.join(', ')}`
    );
  }

  let descartadasSinCC = 0;
  const parsedRows = [];

  for (const row of rawRows) {
    const cc = norm(row['CC_NOMBRE']);
    // Descartar filas con CC nulo, vacío o literal "Null" (provisiones sin imputar a CC)
    if (!cc || cc.toLowerCase() === 'null') {
      descartadasSinCC++;
      continue;
    }

    parsedRows.push({
      id_empleado:       norm(row['ID_EMPLEADO']),
      nombre:            norm(row['NOMBRE']),
      apellido_1:        norm(row['APELLIDO_1']),
      id_concepto:       norm(row['ID_CONCEPTO']),
      nombre_largo:      norm(row['NOMBRE_LARGO']),
      cc_nombre:         cc,
      id_centro_costo:   norm(row['ID_CENTRO_COSTO']),
      id_conta:          norm(row['ID_CONTA']),
      cuenta_contab:     norm(row['CUENTA_CONTAB']),
      n_cuenta_contable: norm(row['N_CUENTA_CONTABLE']),
      debe:              toNum(row['DEBE'])  ?? 0,
      haber:             toNum(row['HABER']) ?? 0,
    });
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows:        parsedRows.length,
      descartadasSinCC,
      parsedAt:         new Date().toISOString(),
    },
  };
}
