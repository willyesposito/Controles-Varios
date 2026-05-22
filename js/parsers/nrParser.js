// nrParser.js — Parser del Reporte de No Remunerativos (NR)
//
// Columnas clave: LEGAJO/ID_EMPLEADO + los 18 conceptos NR
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

const NR_STD_COLS = {
  'LEGAJO':           'legajoColumn',
  'ID_EMPLEADO':      'legajoColumn',
  'REIN_HOME_OFICE':  'reinHomeOficeColumn',
  'INDEM_PREAVISO':   'indemPreavisoColumn',
  'SAC_PREAVISO':     'sacPreavisoColumn',
  'INDEM_ANT_DESP':   'indemAntDespColumn',
  'INDEM_ANT_FALLE':  'indemAntFalleColumn',
  'INDEM_INTEG':      'indemIntegColumn',
  'SAC_INDEM_INTEG':  'sacIndemIntegColumn',
  'INDM_MATERNIDAD':  'indmMaternidadColumn',
  'VAC_NO_GOZADAS':   'vacNoGozadasColumn',
  'VAC_NO_GOZ_SAC':   'vacNoGozSacColumn',
  'GRAT_VAC':         'gratVacColumn',
  'GRA_VACNOG_SAC':   'graVacnogSacColumn',
  'INDEM_FUER_MAY':   'indemFuerMayColumn',
  'INDEM_EMBARAZO':   'indemEmbarazoColumn',
  'GRAT_EXTRAORD':    'gratExtraordColumn',
  'ASIG_PAS':         'asigPasColumn',
  'REINT_GUARD':      'reintGuardColumn',
  'INCREMENTO_ST':    'incrementoStColumn',
};

const NR_REQUIRED_KEYS = ['legajoColumn'];

/**
 * Auto-detección de columnas del Reporte de NR.
 * Retorna el mapping si la columna de LEGAJO se encontró, null si no.
 */
export function autoDetectNrMapping(headers) {
  const mapping = {};
  for (const [colName, key] of Object.entries(NR_STD_COLS)) {
    if (mapping[key]) continue;
    const idx = headers.findIndex(h =>
      h === colName || h.toLowerCase() === colName.toLowerCase()
    );
    if (idx >= 0) mapping[key] = headers[idx];
  }
  return NR_REQUIRED_KEYS.every(k => mapping[k]) ? mapping : null;
}

/**
 * Parsea el Reporte de NR.
 * Excluye filas sin LEGAJO válido (subtotales, separadores).
 */
export function parseNr(arrayBuffer, mapping) {
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
