// exportData.js — Helpers compartidos para exportar tablas de resultados.
//
// Antes cada control (brutos.js, catXEmpleados.js, gsPers.js, nr.js, etc.)
// tenía su propia copia de loadExcelJS()/downloadXlsx() — 7 veces el mismo
// código. Ahora viven acá una sola vez, más CSV y copiar al portapapeles.

let exceljsPromise = null;

/**
 * Carga ExcelJS (CDN) una sola vez, sin importar cuántos controles la pidan
 * en paralelo. ExcelJS (no SheetJS) porque el export necesita estilos/colores
 * de celda que SheetJS community no soporta.
 */
export function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  if (!exceljsPromise) {
    exceljsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs/dist/exceljs.min.js';
      s.onload = resolve;
      s.onerror = () => {
        exceljsPromise = null; // permitir reintentar si falló por conexión
        reject(new Error('No se pudo cargar ExcelJS. Verificá la conexión a internet.'));
      };
      document.head.appendChild(s);
    });
  }
  return exceljsPromise;
}

/** Dispara la descarga de un Workbook de ExcelJS ya armado. */
export async function downloadWorkbook(wb, fileName) {
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName
  );
}

/**
 * Exporta filas a un .csv. Separador ";" (no ",") porque en configuración
 * regional Argentina el "," es el separador decimal y Excel lo interpreta mal.
 *
 * @param {string[]} headers
 * @param {Array<Array<string|number|null>>} rows
 * @param {string} fileName
 */
export function downloadCsv(headers, rows, fileName) {
  const lines = [headers.map(escCsv).join(';'), ...rows.map(row => row.map(escCsv).join(';'))];
  // BOM al inicio para que Excel en Windows detecte UTF-8 y no rompa los acentos.
  downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), fileName);
}

/**
 * Copia filas al portapapeles como TSV (tab-separated) — se pega directo en
 * Excel/Sheets respetando columnas.
 *
 * @param {string[]} headers
 * @param {Array<Array<string|number|null>>} rows
 */
export async function copyRowsToClipboard(headers, rows) {
  const tsvLine = cells => cells.map(v => String(v ?? '')).join('\t');
  const text = [tsvLine(headers), ...rows.map(tsvLine)].join('\n');
  await navigator.clipboard.writeText(text);
}

function escCsv(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
