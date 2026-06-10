// rendVsAsientoDrill.test.js — Tests del drill-down (zoom) de Rendimiento vs Asiento
//
// Verifica con los archivos reales de "archivos test/" que el desglose de cada
// celda CONTA (buildDrillRollup) sume EXACTAMENTE el valor que muestra la celda,
// a nivel concepto y a nivel empleado.
//
// Correr desde la raíz del proyecto (bash o cmd, PowerShell no soporta <):
//   node --input-type=module < tests/rendVsAsientoDrill.test.js

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
import { readFileSync } from 'node:fs';

globalThis.XLSX = XLSX;

const { parseConta } = await import('./js/parsers/contaExcel.js');
const { autoDetectRendimientoMapping, parseRendimiento, detectHeaders } =
  await import('./js/parsers/rendimientoParser.js');
const { runRendVsAsiento, buildDrillRollup, DEFAULT_RVA_CONFIG } =
  await import('./js/controls/rendVsAsiento.js');

// ── Mini framework de asserts (mismo patrón que costoTotalParser.test.js) ────

let ok = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log(`✓ ${msg}`); }
  else      { fail++; console.error(`✗ ${msg}`); }
}

// Réplica de normCCName del control (no está exportada): para mapear el nombre
// de CC de una fila de resultados a la clave usada por el detalle.
function normCCName(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    || null;
}

const close = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;

// ── Cargar archivos de prueba ─────────────────────────────────────────────────

const toAB = buf => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const contaAB = toAB(readFileSync('archivos test/TEST ASIENTO 04-2026.xlsx'));
const rendAB  = toAB(readFileSync('archivos test/REND 04.xlsx'));

const conta = parseConta(contaAB);
assert(conta.parsedRows.length > 0, `CONTA parseado: ${conta.parsedRows.length} filas con CC`);
// El archivo de prueba está anonimizado (NOMBRE/APELLIDO_1 vacíos) — acá solo
// verificamos que el parser conserve los campos; el valor se prueba más abajo
// con un fixture sintético.
assert(
  conta.parsedRows.every(r => 'nombre' in r && 'apellido_1' in r),
  'el parser de CONTA conserva los campos nombre / apellido_1'
);

const { headers } = detectHeaders(rendAB);
const rendMapping = autoDetectRendimientoMapping(headers);
assert(rendMapping !== null, 'auto-detección del Reporte de Rendimiento');

const rend = parseRendimiento(rendAB, rendMapping);
assert(rend.parsedRows.length > 0, `Rendimiento parseado: ${rend.parsedRows.length} CCs`);

// ── Ejecutar el control ───────────────────────────────────────────────────────

const results = runRendVsAsiento(rend.parsedRows, [], {
  rend:      rendMapping,
  contaRows: conta.parsedRows,
  rvaConfig: DEFAULT_RVA_CONFIG,
  period:    '2026-04',
});

assert(!results.error, 'el control corre sin error');
const { rows, ccsSoloEnConta, meta } = results;
const detalle = meta?.detalle || [];
assert(detalle.length > 0, `detalle disponible: ${detalle.length} filas clasificadas`);
assert(detalle.every(d => typeof d.ccKey === 'string' && d.ccKey.length > 0), 'toda fila del detalle tiene ccKey');
assert(detalle.every(d => 'empleadoNombre' in d), 'toda fila del detalle tiene el campo empleadoNombre');

// ── 1. Cada celda CONTA == suma de su desglose ───────────────────────────────

const CAT_DEFS = [
  { cKey: 'cPrecio',   label: 'PRECIO' },
  { cKey: 'cEstimulo', label: 'ASIG. ESTÍMULO' },
  { cKey: 'cCargas',   label: 'CARGAS SS' },
  { cKey: 'cProvMes',  label: 'PROV. MES' },
  { cKey: 'cProvCcss', label: 'PROV. CCSS MES' },
];

let cellsChecked = 0, cellsOkConcept = 0, cellsOkEmp = 0;
const allRows = [
  ...rows.filter(r => !r.sinContaData),
  ...ccsSoloEnConta,
];

for (const r of allRows) {
  const ccKey = normCCName(r.ccName);
  for (const { cKey, label } of CAT_DEFS) {
    const cellVal = r[cKey];
    if (cellVal === null || cellVal === undefined) continue;
    cellsChecked++;

    const conceptos = buildDrillRollup(detalle, { ccKey, catLabel: label });
    const sumConceptos = conceptos.reduce((s, c) => s + c.neto, 0);
    if (close(sumConceptos, cellVal)) cellsOkConcept++;
    else console.error(`  ✗ ${r.ccName} / ${label}: celda=${cellVal} vs conceptos=${sumConceptos}`);

    // Nivel empleado: la suma de empleados de cada concepto == neto del concepto
    const empOk = conceptos.every(c =>
      close(c.empleados.reduce((s, e) => s + e.neto, 0), c.neto)
    );
    if (empOk) cellsOkEmp++;
    else console.error(`  ✗ ${r.ccName} / ${label}: suma de empleados ≠ neto del concepto`);
  }
}

assert(cellsChecked > 0, `celdas CONTA con valor verificadas: ${cellsChecked}`);
assert(cellsOkConcept === cellsChecked, `desglose por concepto suma igual a la celda (${cellsOkConcept}/${cellsChecked})`);
assert(cellsOkEmp === cellsChecked, `desglose por empleado suma igual al concepto (${cellsOkEmp}/${cellsChecked})`);

// ── 2. COSTO TOTAL por CC == suma de las 5 categorías del desglose ──────────

let totalOk = true;
for (const r of allRows) {
  const ccKey = normCCName(r.ccName);
  const cTotal = r.cTotal;
  if (cTotal === null || cTotal === undefined) continue;
  const sumAll = CAT_DEFS.reduce((s, { label }) =>
    s + buildDrillRollup(detalle, { ccKey, catLabel: label }).reduce((ss, c) => ss + c.neto, 0), 0);
  if (!close(sumAll, cTotal)) {
    totalOk = false;
    console.error(`  ✗ ${r.ccName} / COSTO TOTAL: celda=${cTotal} vs desglose=${sumAll}`);
  }
}
assert(totalOk, 'COSTO TOTAL de cada CC coincide con el desglose de las 5 categorías');

// ── 3. Fila TOTAL GENERAL: filtro por Set de CCs matcheados ─────────────────

const matchedKeys = new Set(rows.filter(r => !r.sinContaData).map(r => normCCName(r.ccName)).filter(Boolean));
for (const { cKey, label } of CAT_DEFS) {
  const totCell = rows.reduce((s, r) => s + (r[cKey] ?? 0), 0);
  const conceptos = buildDrillRollup(detalle, { ccKey: matchedKeys, catLabel: label });
  const sumConceptos = conceptos.reduce((s, c) => s + c.neto, 0);
  assert(
    close(sumConceptos, totCell),
    `TOTAL GENERAL ${label}: desglose con Set (${sumConceptos.toFixed(2)}) == fila de totales (${totCell.toFixed(2)})`
  );
}

// ── 4. Orden y estructura del rollup ─────────────────────────────────────────

const sample = buildDrillRollup(detalle, { ccKey: null, catLabel: null });
assert(sample.length > 0, 'rollup sin filtros devuelve conceptos');
assert(
  sample.every((c, i) => i === 0 || Math.abs(sample[i - 1].neto) >= Math.abs(c.neto)),
  'conceptos ordenados por |neto| descendente'
);
assert(
  sample.every(c => c.empleados.every((e, i) => i === 0 || Math.abs(c.empleados[i - 1].neto) >= Math.abs(e.neto))),
  'empleados ordenados por |neto| descendente dentro de cada concepto'
);
assert(
  sample.every(c => Array.isArray(c.empleados) && c.asientos >= c.empleados.length),
  'cada concepto agrupa asientos por empleado (asientos >= empleados)'
);

// Compat: detalle de runs viejos sin ccKey ni empleadoNombre no rompe
const legacyDetalle = detalle.map(({ ccKey, empleadoNombre, ...rest }) => rest);
const legacyRollup = buildDrillRollup(legacyDetalle, { ccKey: [...matchedKeys][0], catLabel: 'PRECIO' });
assert(Array.isArray(legacyRollup), 'rollup tolera detalle de runs viejos (sin ccKey/empleadoNombre)');

// ── 5. Fixture sintético: nombres de empleados llegan al rollup ─────────────
// (el archivo de prueba real está anonimizado, así que el cableado
//  NOMBRE/APELLIDO_1 → empleadoNombre → rollup se prueba con datos inventados)

const synthHeaders = ['ID_EMPLEADO', 'NOMBRE', 'APELLIDO_1', 'ID_CONCEPTO', 'NOMBRE_LARGO',
  'CUENTA_CONTAB', 'ID_CONTA', 'ID_CENTRO_COSTO', 'CC_NOMBRE', 'DEBE', 'HABER', 'N_CUENTA_CONTABLE'];
const synthRows = [
  [1001, 'MARÍA',  'GÓMEZ', '1003', 'SUELDO BÁSICO', '5208001', 'A1', '10', 'PATENTES', 1000, 0, 'REMUNERACIONES'],
  [1001, 'MARÍA',  'GÓMEZ', '1003', 'SUELDO BÁSICO', '5208001', 'A2', '10', 'PATENTES',  500, 0, 'REMUNERACIONES'],
  [1002, 'JUAN',   'PÉREZ', '1003', 'SUELDO BÁSICO', '5208001', 'A1', '10', 'PATENTES',  800, 0, 'REMUNERACIONES'],
  [1002, 'JUAN',   'PÉREZ', '3572', 'PROV CCSS',     '5208005', 'A1', '10', 'PATENTES',  200, 50, 'PROVISIONES'],
];
const synthWs = XLSX.utils.aoa_to_sheet([synthHeaders, ...synthRows]);
const synthWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(synthWb, synthWs, 'CONTA');
const synthAB = XLSX.write(synthWb, { type: 'array', bookType: 'xlsx' });

const synthConta = parseConta(synthAB);
assert(synthConta.parsedRows.length === 4, 'fixture sintético: 4 filas parseadas');
assert(
  synthConta.parsedRows[0].nombre === 'MARÍA' && synthConta.parsedRows[0].apellido_1 === 'GÓMEZ',
  'fixture sintético: nombre y apellido conservados por el parser'
);

const synthResults = runRendVsAsiento(
  [{ CC: '10', 'CENTRO COSTO': 'PATENTES', PRECIO: 2300 }],
  [],
  {
    rend:      { ccCodeColumn: 'CC', ccNameColumn: 'CENTRO COSTO', precioColumn: 'PRECIO' },
    contaRows: synthConta.parsedRows,
    rvaConfig: DEFAULT_RVA_CONFIG,
    period:    '2026-04',
  }
);
const synthDrill = buildDrillRollup(synthResults.meta.detalle, { ccKey: 'patentes', catLabel: 'PRECIO' });
assert(synthDrill.length === 1, 'sintético: un concepto en PRECIO');
assert(close(synthDrill[0].neto, 2300), 'sintético: neto del concepto = 2300');
assert(synthDrill[0].empleados.length === 2, 'sintético: 2 empleados en el concepto');
assert(
  synthDrill[0].empleados[0].nombre === 'GÓMEZ, MARÍA' && close(synthDrill[0].empleados[0].neto, 1500),
  'sintético: empleado top = "GÓMEZ, MARÍA" con 1500 (2 asientos sumados)'
);
assert(synthDrill[0].empleados[0].asientos === 2, 'sintético: asientos del empleado top = 2');

const synthProv = buildDrillRollup(synthResults.meta.detalle, { ccKey: 'patentes', catLabel: 'PROV. CCSS MES' });
assert(
  synthProv.length === 1 && close(synthProv[0].neto, 150),
  'sintético: concepto 3572 clasifica exclusivo en PROV. CCSS MES (200−50=150)'
);

// ── Resultado ─────────────────────────────────────────────────────────────────

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
