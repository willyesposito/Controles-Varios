// semaforo.js — Reglas y helpers compartidos del "semáforo" de estado por control
//
// Regla (ver appConfig.semaforoThresholdPct, default 2 — configurable a futuro):
//   0% de unidades con diferencia            → 'ok'
//   > 0% y <= threshold% de unidades con dif  → 'warn'
//   > threshold% de unidades con diferencia   → 'error'
//
// "Unidad" depende del control: legajo en la mayoría, centro de costo (CC) en
// Rendimiento vs Tabulado / Rendimiento vs Asiento. Cada summarize*() calcula
// su propio unitsTotal/unitsWithDiff — este módulo sólo aplica la regla y
// ofrece un helper común para recorrer filas y sacar unitsWithDiff/diffTotalAmount/worstCase.

export const DEFAULT_SEMAFORO_THRESHOLD_PCT = 2;

/**
 * @param {number|null} unitsWithDiff
 * @param {number|null} unitsTotal
 * @param {number} thresholdPct
 * @returns {'ok'|'warn'|'error'}
 */
export function computeSemaforoStatus(unitsWithDiff, unitsTotal, thresholdPct = DEFAULT_SEMAFORO_THRESHOLD_PCT) {
  if (!unitsTotal || !unitsWithDiff || unitsWithDiff <= 0) return 'ok';
  const pct = (unitsWithDiff / unitsTotal) * 100;
  return pct > thresholdPct ? 'error' : 'warn';
}

/**
 * Recorre `rows` y calcula, para uno o más campos numéricos de diferencia por
 * fila, las 3 métricas que necesita el hero de resultados:
 *   - unitsWithDiff:   filas con al menos un campo fuera de tolerancia
 *   - diffTotalAmount: suma de los valores absolutos de todos los campos con diferencia
 *   - worstCase:       {label, amount} de la diferencia individual más grande (con signo)
 *
 * @param {Array<object>} rows
 * @param {Array<{key:string, get:(row:object)=>(number|null), threshold?:number, label?:string}>} fields
 * @param {(row:object, field:object) => string} labelFn
 */
export function diffStats(rows, fields, labelFn) {
  let unitsWithDiff = 0;
  let diffTotalAmount = 0;
  let worstCase = null;

  for (const row of rows) {
    let rowHasDiff = false;
    for (const f of fields) {
      const v = f.get(row);
      if (v === null || v === undefined) continue;
      const abs = Math.abs(v);
      if (abs <= (f.threshold ?? 0.01)) continue;
      rowHasDiff = true;
      diffTotalAmount += abs;
      if (!worstCase || abs > Math.abs(worstCase.amount)) {
        worstCase = { label: labelFn(row, f), amount: v };
      }
    }
    if (rowHasDiff) unitsWithDiff++;
  }

  return { unitsWithDiff, diffTotalAmount, worstCase };
}
