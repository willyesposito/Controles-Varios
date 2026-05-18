// currency.js — Todo lo relacionado con números y moneda
//
// Los Excels argentinos usan punto como separador de miles y coma como decimal:
//   "50.000,75" significa cincuenta mil con 75 centavos.
// JavaScript usa el sistema anglosajón: punto decimal, sin puntos de miles.
// Esta utilidad traduce entre los dos mundos.

/**
 * Convierte un valor del Excel a número JavaScript.
 * Acepta: número JS, string "50.000,75", string "50000.75", null, undefined.
 */
export function parseAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return redondear(value);

  const str = String(value).trim();
  if (!str) return 0;

  // Eliminar puntos de miles y convertir coma decimal a punto
  const normalizado = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalizado);
  return isNaN(num) ? 0 : redondear(num);
}

/** Redondea a 2 decimales (evita errores de coma flotante como 0.1+0.2=0.30000000004) */
export function redondear(num) {
  return Math.round(num * 100) / 100;
}

/** Formatea un número como moneda argentina: 50000.75 → "50.000,75" */
export function formatAmount(value, decimales = 2) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(value);
}

/** Formatea una diferencia con signo y color: +1.234,50 en verde, -500,00 en rojo */
export function formatDiff(value) {
  if (value === 0) return '<span class="text-success">$ 0,00</span>';
  const fmt = formatAmount(Math.abs(value));
  if (value > 0) return `<span class="text-success">+$ ${fmt}</span>`;
  return `<span class="text-danger">-$ ${fmt}</span>`;
}

/** Formatea un porcentaje con signo: +1,23% o -0,45% */
export function formatPct(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}
