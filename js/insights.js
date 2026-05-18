// insights.js — Calcula los "resúmenes ejecutivos" del cruce
//
// Toma el resultado del cruce (matching.js) y saca las conclusiones:
//   - Totales por grupo
//   - Legajos que faltan en alguno de los dos archivos
//   - Top 10 diferencias más grandes
// El comparativo mes a mes se agrega en bloque 1.10.

import { redondear } from './utils/currency.js';

/**
 * @param {object}   resultsPorGrupo - salida de runMatching()
 * @param {object[]} grouperDefs     - array de agrupadores con { id, name }
 * @param {object[]} nominaRows      - filas originales de la nómina
 * @param {object[]} resumenRows     - filas originales del resumen
 */
export function computeInsights(resultsPorGrupo, grouperDefs, nominaRows, resumenRows) {
  // Legajos faltantes
  const legajosNomina  = new Set(nominaRows.map(r => String(r.legajo)));
  const legajosResumen = new Set(resumenRows.map(r => String(r.legajo)));
  const missingInResumen = [...legajosNomina].filter(l => !legajosResumen.has(l));
  const missingInNomina  = [...legajosResumen].filter(l => !legajosNomina.has(l));

  // Totales e indicadores por grupo
  const byGrouper = grouperDefs.map(grouper => {
    const filas = resultsPorGrupo[grouper.id] || [];
    const totalNomina  = redondear(filas.reduce((s, r) => s + r.sumNom, 0));
    const totalResumen = redondear(filas.reduce((s, r) => s + r.sumRes, 0));
    const diffAbsolute = redondear(totalNomina - totalResumen);
    const diffPct      = totalNomina !== 0
      ? redondear((diffAbsolute / Math.abs(totalNomina)) * 100)
      : 0;

    return {
      grouperId:    grouper.id,
      grouperName:  grouper.name,
      totalNomina,
      totalResumen,
      diffAbsolute,
      diffPercentage: diffPct,
      rowsWithDiff: filas.filter(r => r.tieneDiff).length,
      rowsTotal:    filas.length,
    };
  });

  // Top 10 diferencias absolutas más grandes
  const todasLasDiffs = grouperDefs.flatMap(g =>
    (resultsPorGrupo[g.id] || [])
      .filter(r => r.tieneDiff)
      .map(r => ({ ...r, grouperId: g.id, grouperName: g.name }))
  );
  const topDifferences = todasLasDiffs
    .sort((a, b) => Math.abs(b.diffAbs) - Math.abs(a.diffAbs))
    .slice(0, 10);

  return { byGrouper, missingInResumen, missingInNomina, topDifferences };
}
