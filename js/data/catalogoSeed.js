// catalogoSeed.js — Catálogo de fallback con los conceptos hoy conocidos
//
// Se usa cuando el cliente todavía no cargó su propio Catálogo de Conceptos
// (concept_catalog.xlsx). Garantiza que la app funcione igual que antes
// para clientes existentes (backwards compatibility).
//
// Estructura de cada fila — misma forma que las filas del .xlsx del catálogo:
//   codigo:        string  — código canónico (ej. "SAL_BASE")
//   descripcion:   string  — nombre humano
//   clasificacion: 'remu' | 'no_remu' | 'aporte' | 'contribucion'
//   controles:     string[] — ids de controles que lo usan
//   alias:         string[] — variantes de nombre de columna conocidas

export const CATALOGO_SEED = [
  // ── Brutos ──────────────────────────────────────────────────────────────
  {
    codigo:        'SAL_BASE',
    descripcion:   'Sueldo Base',
    clasificacion: 'remu',
    controles:     ['brutos'],
    alias:         ['sueldo', '1003-', 'sal base', 'sueldo bruto', 'salario base', 'salario bruto', 'sueldo basico'],
  },
  {
    codigo:        'A_CTA_FUT_AUMEN',
    descripcion:   'A cuenta de futuros aumentos',
    clasificacion: 'remu',
    controles:     ['brutos'],
    alias:         ['a_cta_fut', 'acta_fut', '1017-', 'a cta fut', 'a cuenta aumento', 'a cuenta futuros aumentos', 'a cuenta de futuros aumentos', 'acuenta futuros aumentos'],
  },

  // ── GS Pers ─────────────────────────────────────────────────────────────
  {
    codigo:        'GTOS_PERSONALES',
    descripcion:   'Gastos Personales',
    clasificacion: 'remu',
    controles:     ['gs_pers'],
    alias:         ['gtos_personales', 'gastos_personales', 'gtos pers', 'gastos pers', 'gastos personales'],
  },
  {
    codigo:        'DTO_COCHERA',
    descripcion:   'Descuento Cochera',
    clasificacion: 'remu',
    controles:     ['gs_pers'],
    alias:         ['dto_cochera', 'dto cochera', 'cochera', 'descuento cochera'],
  },

  // ── NR — Indemnizatorios ────────────────────────────────────────────────
  { codigo: 'INDEM_PREAVISO',   descripcion: 'Indemnización por Preaviso',          clasificacion: 'no_remu', controles: ['nr'], alias: ['indem preaviso'] },
  { codigo: 'SAC_PREAVISO',     descripcion: 'SAC sobre Preaviso',                  clasificacion: 'no_remu', controles: ['nr'], alias: ['sac preaviso'] },
  { codigo: 'INDEM_ANT_DESP',   descripcion: 'Indemnización Antigüedad Despido',    clasificacion: 'no_remu', controles: ['nr'], alias: ['indem ant desp'] },
  { codigo: 'INDEM_ANT_FALLE',  descripcion: 'Indemnización Antigüedad Fallecim.',  clasificacion: 'no_remu', controles: ['nr'], alias: ['indem ant falle'] },
  { codigo: 'INDEM_INTEG',      descripcion: 'Indemnización Integración',           clasificacion: 'no_remu', controles: ['nr'], alias: [] },
  { codigo: 'SAC_INDEM_INTEG',  descripcion: 'SAC sobre Indem. Integración',        clasificacion: 'no_remu', controles: ['nr'], alias: ['sac indem integ'] },
  { codigo: 'INDM_MATERNIDAD',  descripcion: 'Indemnización Maternidad',            clasificacion: 'no_remu', controles: ['nr'], alias: ['indem_maternidad', 'maternidad'] },
  { codigo: 'VAC_NO_GOZADAS',   descripcion: 'Vacaciones No Gozadas',               clasificacion: 'no_remu', controles: ['nr'], alias: ['vac no gozadas'] },
  { codigo: 'VAC_NO_GOZ_SAC',   descripcion: 'SAC s/ Vacaciones No Gozadas',        clasificacion: 'no_remu', controles: ['nr'], alias: ['vac no goz sac'] },
  { codigo: 'GRAT_VAC',         descripcion: 'Gratificación Vacaciones',            clasificacion: 'no_remu', controles: ['nr'], alias: ['grat vac'] },
  { codigo: 'GRA_VACNOG_SAC',   descripcion: 'Gratif. SAC s/ Vacaciones No Goz.',   clasificacion: 'no_remu', controles: ['nr'], alias: ['gra vacnog sac'] },
  { codigo: 'INDEM_FUER_MAY',   descripcion: 'Indemnización Fuerza Mayor',          clasificacion: 'no_remu', controles: ['nr'], alias: ['indem fuer may'] },
  { codigo: 'INDEM_EMBARAZO',   descripcion: 'Indemnización Embarazo',              clasificacion: 'no_remu', controles: ['nr'], alias: ['indem embarazo'] },

  // ── NR — Otros NR ───────────────────────────────────────────────────────
  { codigo: 'REIN_HOME_OFICE',  descripcion: 'Reintegro Home Office',               clasificacion: 'no_remu', controles: ['nr'], alias: ['rein home ofice'] },
  { codigo: 'GRAT_EXTRAORD',    descripcion: 'Gratificación Extraordinaria',        clasificacion: 'no_remu', controles: ['nr'], alias: ['grat extraord'] },
  { codigo: 'ASIG_PAS',         descripcion: 'Asignación por Pasantía',             clasificacion: 'no_remu', controles: ['nr'], alias: ['asig pas'] },
  { codigo: 'REINT_GUARD',      descripcion: 'Reintegro de Guardería',              clasificacion: 'no_remu', controles: ['nr'], alias: ['reint guard'] },
  { codigo: 'INCREMENTO_ST',    descripcion: 'Incremento Salarial Transitorio',     clasificacion: 'no_remu', controles: ['nr'], alias: ['incremento st'] },
];
