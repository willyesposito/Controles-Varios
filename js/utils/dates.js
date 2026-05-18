// dates.js — Manejo de períodos (mes/año)
//
// En esta app, un "período" es siempre un string 'YYYY-MM', ej: '2026-05'.
// Ese formato permite ordenarlos fácilmente como texto ('2026-05' < '2026-06').

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Convierte '2026-05' en 'Mayo 2026' */
export function periodToLabel(period) {
  if (!period) return '';
  const [year, month] = period.split('-');
  return `${MESES[parseInt(month, 10) - 1]} ${year}`;
}

/** Devuelve el período del mes actual, ej: '2026-05' */
export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Devuelve el período del mes anterior. Ej: '2026-01' → '2025-12' */
export function previousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Devuelve una lista de los últimos N períodos para usar en un selector.
 * Cada elemento tiene { value: '2026-05', label: 'Mayo 2026' }
 */
export function periodOptions(count = 13) {
  const options = [];
  let period = currentPeriod();
  for (let i = 0; i < count; i++) {
    options.push({ value: period, label: periodToLabel(period) });
    period = previousPeriod(period);
  }
  return options;
}
