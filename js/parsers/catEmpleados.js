// catEmpleados.js — Parser del reporte de Catálogo de Empleados (Reporte de Categorías)
//
// Formato esperado: una fila por empleado con columnas como:
//   ID_EMP, PUESTO, ID_CEN, CENTRO_COSTO, DEPARTAMENTO, F. BAJA, CUIL, etc.
//
// Devuelve TODAS las filas válidas (activos + bajas). El control distingue
// activos vs bajas mediante F. BAJA. Las bajas no se descartan porque el reporte
// trae toda la nómina y el control las necesita para no marcarlas como faltantes.
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

// Columnas estándar esperadas en un archivo CAT (nombre exacto → clave de mapping)
const CAT_STD_COLS = {
  'ID_EMP':       'idEmpColumn',
  'PUESTO':       'puestoColumn',
  'ID_CEN':       'idCenColumn',
  'CENTRO_COSTO': 'centroCostoColumn',
  'DEPARTAMENTO': 'departamentoColumn',
  'F. BAJA':      'fBajaColumn',
  'F. ALTA':      'fAltaColumn',
  'APELLIDO_1':   'apellidoColumn',
  'NOMBRE':       'nombreColumn',
  'CUIL':         'cuilColumn',
  'ID_PUE':       'idPueColumn',
};

const CAT_REQUIRED_KEYS = [
  'idEmpColumn', 'puestoColumn', 'idCenColumn',
  'centroCostoColumn', 'departamentoColumn', 'fBajaColumn',
];

/**
 * Intenta detectar automáticamente el mapping a partir de los encabezados.
 * Retorna el mapping si todos los campos requeridos se encontraron, null si no.
 *
 * @param {string[]} headers - Encabezados del archivo
 * @returns {object|null}
 */
export function autoDetectCatMapping(headers) {
  const mapping = {};
  for (const [colName, key] of Object.entries(CAT_STD_COLS)) {
    const idx = headers.findIndex(h =>
      h === colName || h.toLowerCase() === colName.toLowerCase()
    );
    if (idx >= 0) mapping[key] = headers[idx];
  }
  const allRequired = CAT_REQUIRED_KEYS.every(k => mapping[k]);
  return allRequired ? mapping : null;
}

/**
 * Parsea un archivo CAT y retorna TODAS las filas válidas (activos + bajas).
 * El control de Empleados por Categoría las separa por F. BAJA.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {object} mapping - { idEmpColumn, fBajaColumn, puestoColumn, ... }
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseCatEmpleados(arrayBuffer, mapping) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rawRows.length === 0) throw new Error('El archivo está vacío o no tiene filas de datos.');

  const fBajaCol = mapping.fBajaColumn;
  if (!fBajaCol) throw new Error('No se configuró la columna de Fecha de Baja (F. BAJA).');

  const idEmpCol = mapping.idEmpColumn;
  if (!idEmpCol) throw new Error('No se configuró la columna de ID Empleado.');

  // IDs como "0870" pueden venir como número 870 con formato "0000". Recuperamos
  // el texto formateado de Excel para preservar los ceros a la izquierda.
  preserveFormattedTextColumn(sheet, rawRows, idEmpCol);

  const validRows = [];
  let activosCount   = 0;
  let inactivosCount = 0;
  let filtradas      = 0; // sumatorias, encabezados de sección, etc.

  for (const row of rawRows) {
    const rawId = row[idEmpCol];
    const idStr = rawId != null ? String(rawId).trim() : '';
    // Excluir filas donde el ID no es numérico (COUNTA, subtotales, separadores).
    // Con formato "0000" el texto sigue siendo numérico ("0870" → Number = 870).
    if (idStr === '' || isNaN(Number(idStr))) {
      filtradas++;
      continue;
    }

    const baja = row[fBajaCol];
    const esBaja = !(baja === null || baja === undefined || String(baja).trim() === '');
    if (esBaja) inactivosCount++;
    else        activosCount++;
    validRows.push(row);
  }

  return {
    parsedRows: validRows,
    parseMetadata: {
      total:     rawRows.length,
      activos:   activosCount,
      inactivos: inactivosCount,
      filtradas,
      parsedAt:  new Date().toISOString(),
    },
  };
}

/**
 * Recupera el texto formateado de Excel (cell.w) para una columna numérica.
 * Útil cuando el ID está guardado como número (870) pero formateado con ceros
 * a la izquierda ("0000" → "0870"). Sin este paso, sheet_to_json devuelve 870
 * y se pierde el cero adelante necesario para hacer match contra el Tabulado.
 */
function preserveFormattedTextColumn(sheet, rawRows, columnName) {
  if (!columnName || !sheet['!ref']) return;
  const range = XLSX.utils.decode_range(sheet['!ref']);

  let colIdx = -1;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (headerCell && String(headerCell.v).trim() === columnName) {
      colIdx = c;
      break;
    }
  }
  if (colIdx < 0) return;

  // Mapa: valor numérico crudo → texto formateado, cuando difieren.
  const map = new Map();
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: colIdx })];
    if (cell && cell.t === 'n' && cell.w && cell.w !== String(cell.v)) {
      map.set(String(cell.v), cell.w);
    }
  }
  if (map.size === 0) return;

  for (const row of rawRows) {
    const v = row[columnName];
    if (typeof v === 'number') {
      const key = String(v);
      if (map.has(key)) row[columnName] = map.get(key);
    }
  }
}
