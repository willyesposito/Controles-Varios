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
//   group           — { id, label, mode } para agrupar variantes del mismo control bajo una pill
//                     Si está, se renderiza dentro del grupo. Si falta, el control es standalone.
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

import {
  runGsPers,
  renderGsPersResults,
  summarizeGsPers,
  runGsPersReporte,
  renderGsPersReporteResults,
  summarizeGsPersReporte,
} from './gsPers.js';

import {
  runNr,
  renderNrResults,
  summarizeNr,
  runNrReporte,
  renderNrReporteResults,
  summarizeNrReporte,
} from './nr.js';

export const CONTROL_REGISTRY = {

  cat_x_empleados: {
    id:          'cat_x_empleados',
    label:       'EE x CATEG',
    description: 'Empleados por Categoría. Compara el catálogo del sistema contra el Tabulado: '
      + 'valida activos, diferencias de cantidad, discrepancias de campo y distribución por puesto y centro de costo.',
    help: {
      what: 'Compara la lista de empleados del sistema de RRHH contra el Tabulado. '
        + 'Detecta empleados que están en uno y no en el otro, y diferencias en campos como puesto y centro de costo.',
      how: [
        'Bajá el reporte de Empleados por Categoría de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        'Ejecutá. El sistema cruza automáticamente los legajos.',
      ],
    },
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
      + 'las columnas configuradas en el Tabulado (SUELDO y A_CTA_FUT_AUMEN).',
    help: {
      what: 'Toma el Reporte de Brutos bajado de M4 y verifica que los valores de '
        + 'SAL_BASE y A_CTA_FUT_AUMEN coincidan con las columnas del Tabulado. '
        + 'Muestra en rojo los empleados con diferencias.',
      how: [
        'Bajá el Reporte de Brutos de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        'En el panel de configuración indicá qué columnas del Tabulado corresponden a Sueldo y A_CTA_FUT_AUMEN.',
        'Ejecutá.',
      ],
    },
    group:       { id: 'brutos', label: 'Brutos', mode: 'Controlar' },
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
      + 'sin necesitar el archivo de Brutos.',
    help: {
      what: 'Genera el archivo de Brutos directamente desde el Tabulado, '
        + 'sin necesitar bajar el reporte de M4. '
        + 'Útil para armar el archivo en el formato estándar o comparar períodos.',
      how: [
        'En el panel de configuración del Paso 2 indicá qué columnas del Tabulado corresponden a Sueldo y A_CTA_FUT_AUMEN.',
        'Ejecutá.',
        'Descargá el .xlsx generado desde el resultado.',
      ],
    },
    group:       { id: 'brutos', label: 'Brutos', mode: 'Generar Reporte' },
    tabRequired: true,
    additionalFiles: [],
    run:           runBrutosReporte,
    summarize:     summarizeBrutosReporte,
    renderResults: renderBrutosReporteResults,
  },

  gs_pers: {
    id:          'gs_pers',
    label:       'GS Pers — Controlar',
    description: 'Cruza GTOS_PERSONALES y DTO_COCHERA del Reporte de Gastos Personales y Cochera '
      + 'contra las columnas configuradas en el Tabulado.',
    help: {
      what: 'Toma el Reporte de Gastos Personales y Cochera de M4 y compara los valores de '
        + 'GTOS_PERSONALES y DTO_COCHERA contra las columnas del Tabulado. '
        + 'Muestra en rojo los empleados con diferencias.',
      how: [
        'Bajá el Reporte de Gastos Personales y Cochera de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        'En el panel de configuración indicá qué columnas del Tabulado corresponden a GTOS_PERSONALES y DTO_COCHERA.',
        'Ejecutá.',
      ],
    },
    group:       { id: 'gs_pers', label: 'GS Pers', mode: 'Controlar' },
    tabRequired: true,
    additionalFiles: [
      { key: 'gs_pers', label: 'Reporte de GS Pers', fileType: 'gs_pers_file' },
    ],
    run:           runGsPers,
    summarize:     summarizeGsPers,
    renderResults: renderGsPersResults,
  },

  gs_pers_reporte: {
    id:          'gs_pers_reporte',
    label:       'GS Pers — Generar Reporte',
    description: 'Genera el Reporte de Gastos Personales y Cochera directamente desde el Tabulado.',
    help: {
      what: 'Genera el archivo de GS Pers directamente desde el Tabulado, '
        + 'sin necesitar bajar el reporte de M4.',
      how: [
        'En el panel de configuración del Paso 2 indicá qué columnas del Tabulado corresponden a GTOS_PERSONALES y DTO_COCHERA.',
        'Ejecutá.',
        'Descargá el .xlsx generado desde el resultado.',
      ],
    },
    group:       { id: 'gs_pers', label: 'GS Pers', mode: 'Generar Reporte' },
    tabRequired: true,
    additionalFiles: [],
    run:           runGsPersReporte,
    summarize:     summarizeGsPersReporte,
    renderResults: renderGsPersReporteResults,
  },

  nr: {
    id:          'nr',
    label:       'Control NR — Controlar',
    description: 'Cruza los 18 conceptos No Remunerativos del Reporte de M4 contra '
      + 'las columnas configuradas en el Tabulado (Indemnizatorios y Otros NR).',
    help: {
      what: 'Controla que todos los 18 conceptos no remunerativos queden cargados '
        + 'correctamente en el Tabulado, comparando el Reporte de M4 contra los valores '
        + 'del Tabulado. Agrupa los conceptos en Indemnizatorios y Otros NR.',
      how: [
        'Bajá el Reporte de NR de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        'En el panel de configuración indicá las columnas del Tabulado para cada uno de los 18 conceptos.',
        'Ejecutá. Las diferencias se muestran en rojo.',
      ],
    },
    group:       { id: 'nr', label: 'Control NR', mode: 'Controlar' },
    tabRequired: true,
    additionalFiles: [
      { key: 'nr', label: 'Reporte de NR', fileType: 'nr_file' },
    ],
    run:           runNr,
    summarize:     summarizeNr,
    renderResults: renderNrResults,
  },

  nr_reporte: {
    id:          'nr_reporte',
    label:       'Control NR — Generar Reporte',
    description: 'Genera el Reporte de No Remunerativos directamente desde el Tabulado, '
      + 'sin necesitar el archivo de M4.',
    help: {
      what: 'Genera el archivo de NR directamente desde el Tabulado con los 18 conceptos '
        + 'no remunerativos. Todos los conceptos son obligatorios y deben estar mapeados '
        + 'para asegurar que queden todos incluidos en el reporte.',
      how: [
        'En el panel de configuración del Paso 2 indicá las columnas del Tabulado para cada uno de los 18 conceptos.',
        'Ejecutá.',
        'Descargá el .xlsx generado desde el resultado.',
      ],
    },
    group:       { id: 'nr', label: 'Control NR', mode: 'Generar Reporte' },
    tabRequired: true,
    additionalFiles: [],
    run:           runNrReporte,
    summarize:     summarizeNrReporte,
    renderResults: renderNrReporteResults,
  },

};
