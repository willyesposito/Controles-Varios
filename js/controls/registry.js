// registry.js — Registro central de todos los controles disponibles
//
// Para agregar un control nuevo:
//   1. Crear js/controls/{id}.js con runXxx() y renderXxxResults()
//   2. Importarlos acá y agregar la entrada al CONTROL_REGISTRY
//
// Cada entrada define:
//   id            — identificador único (snake_case)
//   label         — nombre visible al usuario
//   description   — descripción breve
//   tabRequired   — si necesita el Tabulado como archivo pivote
//   additionalFiles — archivos adicionales requeridos: [{ key, label, fileType }]
//   run(catActivos, tabRows, mapping) → resultados
//   renderResults(results, container)  → HTML dentro del container

import { runCatXEmpleados, renderCatXEmpleadosResults } from './catXEmpleados.js';

export const CONTROL_REGISTRY = {

  cat_x_empleados: {
    id:          'cat_x_empleados',
    label:       'Catálogo × Empleados',
    description: 'Compara el catálogo de empleados del sistema contra el Tabulado. '
      + 'Valida activos, diferencias de cantidad y distribución por puesto y centro de costo.',
    tabRequired: true,
    additionalFiles: [
      { key: 'cat', label: 'Catálogo de Empleados', fileType: 'cat_empleados' },
    ],
    run:           runCatXEmpleados,
    renderResults: renderCatXEmpleadosResults,
  },

  // Próximos controles se agregan aquí

};
