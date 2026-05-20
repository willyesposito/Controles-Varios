// registry.js — Registro central de todos los controles disponibles
//
// Para agregar un control nuevo:
//   1. Crear js/controls/{id}.js con runXxx(), renderXxxResults() y summarizeXxx()
//   2. Importarlos acá y agregar la entrada al CONTROL_REGISTRY
//
// Cada entrada define:
//   id              — identificador único (snake_case)
//   label           — nombre visible al usuario
//   description     — descripción breve
//   tabRequired     — si necesita el Tabulado como archivo pivote
//   additionalFiles — archivos adicionales requeridos: [{ key, label, fileType }]
//   run(primaryRows, tabRows, mapping) → resultados
//   summarize(results)                 → { status, headline, insights[] } para la tarjeta colapsada
//   renderResults(results, container)  → HTML del detalle dentro del container

import {
  runCatXEmpleados,
  renderCatXEmpleadosResults,
  summarizeCatXEmpleados,
} from './catXEmpleados.js';

import {
  runBrutos,
  renderBrutosResults,
  summarizeBrutos,
  runBrutosReporte,
  renderBrutosReporteResults,
  summarizeBrutosReporte,
} from './brutos.js';

export const CONTROL_REGISTRY = {

  cat_x_empleados: {
    id:          'cat_x_empleados',
    label:       'EE x CATEG',
    description: 'Empleados por Categoría. Compara el catálogo del sistema contra el Tabulado: '
      + 'valida activos, diferencias de cantidad, discrepancias de campo y distribución por puesto y centro de costo.',
    tabRequired: true,
    additionalFiles: [
      { key: 'cat', label: 'Empleados por Categoría', fileType: 'cat_empleados' },
    ],
    run:           runCatXEmpleados,
    summarize:     summarizeCatXEmpleados,
    renderResults: renderCatXEmpleadosResults,
  },

  brutos: {
    id:          'brutos',
    label:       'Brutos — Controlar',
    description: 'Cruza SAL_BASE y A_CTA_FUT_AUMEN del Reporte de Brutos contra '
      + 'las columnas configuradas en el Tabulado (SUELDO y A_CTA_FUT_AUMEN). '
      + 'Requiere el archivo de Brutos y el Tabulado con las columnas de Brutos configuradas.',
    tabRequired: true,
    additionalFiles: [
      { key: 'brutos', label: 'Reporte de Brutos', fileType: 'brutos_file' },
    ],
    run:           runBrutos,
    summarize:     summarizeBrutos,
    renderResults: renderBrutosResults,
  },

  brutos_reporte: {
    id:          'brutos_reporte',
    label:       'Brutos — Generar Reporte',
    description: 'Genera el Reporte de Brutos directamente desde el Tabulado, '
      + 'sin necesitar el archivo de Brutos. '
      + 'El Tabulado debe tener configuradas las columnas de la sección Brutos. '
      + 'Exporta a .xlsx sin columnas de control ni colores.',
    tabRequired: true,
    additionalFiles: [],
    run:           runBrutosReporte,
    summarize:     summarizeBrutosReporte,
    renderResults: renderBrutosReporteResults,
  },

};
