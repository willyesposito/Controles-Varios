// catEmpleados.js — Parser del reporte de Catálogo de Empleados (CAT)
//
// Formato esperado: una fila por empleado con columnas como:
//   ID_EMP, PUESTO, ID_CEN, CENTRO_COSTO, DEPARTAMENTO, F. BAJA, CUIL, etc.
//
// Un empleado es "activo" cuando la columna F. BAJA está vacía o nula.
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
 * Parsea un archivo CAT y retorna solo los empleados activos (F. BAJA vacía).
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {object} mapping - { idEmpColumn, fBajaColumn, puestoColumn, ... }
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseCatEmpleados(arrayBuffer, mapping) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // sheet_to_json sin header:1 usa la primera fila como claves → objetos con nombres de columna
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rawRows.length === 0) throw new Error('El archivo está vacío o no tiene filas de datos.');

  const fBajaCol = mapping.fBajaColumn;
  if (!fBajaCol) throw new Error('No se configuró la columna de Fecha de Baja (F. BAJA).');

  const activos   = [];
  const inactivos = [];

  for (const row of rawRows) {
    const baja = row[fBajaCol];
    const esActivo = baja === null || baja === undefined || String(baja).trim() === '';
    if (esActivo) {
      activos.push(row);
    } else {
      inactivos.push(row);
    }
  }

  return {
    parsedRows: activos,
    parseMetadata: {
      total:     rawRows.length,
      activos:   activos.length,
      inactivos: inactivos.length,
      parsedAt:  new Date().toISOString(),
    },
  };
}
