// matching.js — El corazón del cruce: compara nómina vs resumen
//
// Recibe dos listas de empleados (la nómina y el resumen) y una definición
// de agrupadores. Para cada agrupador, suma los importes de sus conceptos
// por empleado, calcula la diferencia y marca si supera los umbrales.

import { redondear } from './utils/currency.js';

/**
 * Ejecuta el cruce.
 *
 * @param {object[]} nominaRows    - Filas parseadas de la nómina maestra
 * @param {object[]} resumenRows   - Filas parseadas del resumen
 * @param {object}   grouperConceptsMap - { [grouperId]: string[] } - códigos de concepto por grupo
 * @param {object}   thresholds    - { absoluteAmount, percentage, flagMissing }
 *
 * @returns {object} { [grouperId]: RowResult[] }
 */
export function runMatching(nominaRows, resumenRows, grouperConceptsMap, thresholds) {
  const { absoluteAmount = 1, percentage = 0.1, flagMissing = true } = thresholds;

  // Indexamos por legajo para búsqueda rápida (O(1) en vez de O(n) por búsqueda)
  const nominaIdx  = indexarPorLegajo(nominaRows);
  const resumenIdx = indexarPorLegajo(resumenRows);

  // Unión de todos los legajos que aparecen en alguno de los dos archivos
  const todosLosLegajos = new Set([...nominaIdx.keys(), ...resumenIdx.keys()]);

  const resultadosPorGrupo = {};

  for (const [grouperId, concepts] of Object.entries(grouperConceptsMap)) {
    const conceptSet = new Set(concepts.map(String));
    const filas = [];

    for (const legajo of todosLosLegajos) {
      const filaNomina  = nominaIdx.get(legajo);
      const filaResumen = resumenIdx.get(legajo);

      const sumNom = sumarConceptos(filaNomina,  conceptSet);
      const sumRes = sumarConceptos(filaResumen, conceptSet);
      const diffAbs = redondear(sumNom - sumRes);

      // Diferencia porcentual respecto al total de nómina (evitamos dividir por cero)
      let diffPct = null;
      if (sumNom !== 0)      diffPct = redondear((diffAbs / Math.abs(sumNom)) * 100);
      else if (sumRes !== 0) diffPct = null; // no hay base de cálculo

      const tieneDiff = detectarDiferencia(sumNom, sumRes, diffAbs, diffPct, absoluteAmount, percentage, flagMissing);

      filas.push({
        legajo,
        apellido:  filaNomina?.apellido  || filaResumen?.apellido  || '',
        nombre:    filaNomina?.nombre    || filaResumen?.nombre    || '',
        sumNom,
        sumRes,
        diffAbs,
        diffPct,
        tieneDiff,
        soloEnNomina:  !!filaNomina  && !filaResumen,
        soloEnResumen: !filaNomina  && !!filaResumen,
      });
    }

    resultadosPorGrupo[grouperId] = filas;
  }

  return resultadosPorGrupo;
}

/** Convierte un array de filas en un Map legajo→fila para búsqueda rápida */
function indexarPorLegajo(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.legajo != null) map.set(String(row.legajo).trim(), row);
  }
  return map;
}

/** Suma los importes de los conceptos del agrupador para una fila */
function sumarConceptos(row, conceptSet) {
  if (!row) return 0;
  let suma = 0;
  for (const code of conceptSet) {
    const val = row[code];
    if (typeof val === 'number') suma += val;
  }
  return redondear(suma);
}

/** Decide si una fila tiene diferencia según los umbrales configurados */
function detectarDiferencia(sumNom, sumRes, diffAbs, diffPct, umbralAbs, umbralPct, flagMissing) {
  if (Math.abs(diffAbs) > umbralAbs) return true;
  if (diffPct !== null && Math.abs(diffPct) > umbralPct) return true;
  // Legajo que existe en uno pero no en el otro
  if (flagMissing && (sumNom === 0) !== (sumRes === 0)) return true;
  return false;
}
