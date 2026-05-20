// controlsWizard.js — Wizard de ejecución de controles para un cliente
//
// Flujo de 4 pasos:
//   1. Cargar Tabulado (archivo pivote, requerido por la mayoría de controles)
//   2. Seleccionar controles y cargar sus archivos adicionales
//   3. Elegir período y agregar notas
//   4. Ejecutar y navegar a resultados

import {
  getClient,
  createControlRun,
  saveControlRunFile,
  saveControlRunResults,
  getFileProfile,
  saveFileProfile,
} from '../db.js';
import { initFileUploadStep }      from './fileUpload.js';
import { CONTROL_REGISTRY }        from '../controls/registry.js';
import { autoDetectTabMapping }    from '../parsers/tabuladoControl.js';
import { autoDetectCatMapping }    from '../parsers/catEmpleados.js';
import { autoDetectBrutosMapping } from '../parsers/brutosParser.js';
import { currentPeriod, periodOptions } from '../utils/dates.js';

// Mapa: fileType → función de auto-detección de columnas
const AUTO_DETECT = {
  tab_control:   autoDetectTabMapping,
  cat_empleados: autoDetectCatMapping,
  brutos_file:   autoDetectBrutosMapping,
};

export async function renderControlsWizard(root, clientId) {
  const client = await getClient(clientId);
  if (!client) {
    root.innerHTML = `
      <div class="page-content">
        <div class="alert alert--danger">
          Cliente no encontrado. <a href="#/">← Volver</a>
        </div>
      </div>
    `;
    return;
  }

  const savedBrutosConfig = await getFileProfile(Number(clientId), 'brutos_tab_config');

  const state = {
    step:             0,
    clientId:         Number(clientId),
    client,
    tab:              null,
    selectedControls: ['cat_x_empleados'],
    controlFiles:     { cat_x_empleados: {} },
    period:           currentPeriod(),
    notes:            '',
    brutosTabConfig:  savedBrutosConfig?.mapping || {},
  };

  root.innerHTML = `
    <div class="page-content">
      <div class="page-actions">
        <div class="page-actions__title">
          <a href="#/" class="btn btn--ghost btn--sm">← Inicio</a>
          <h2 style="margin:0 0 0 var(--sp-3);">Controles — ${esc(client.name)}</h2>
        </div>
      </div>
      <div class="wizard-steps" id="js-wizard-steps" style="margin:var(--sp-5) 0;"></div>
      <div class="card">
        <div class="card__body" id="js-step-content" style="padding:var(--sp-6);"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:var(--sp-5);" id="js-wizard-nav"></div>
    </div>
  `;

  render(root, state);
}

// ── Render central ────────────────────────────────────────────────────────────

function render(root, state) {
  // Indicadores de paso
  root.querySelector('#js-wizard-steps').innerHTML = buildStepDots(state.step);

  // Contenido del paso
  const content = root.querySelector('#js-step-content');
  content.innerHTML = '';
  switch (state.step) {
    case 0: renderStepTab(content, state, root);     break;
    case 1: renderStepControls(content, state, root); break;
    case 2: renderStepConfig(content, state, root);   break;
    case 3: renderStepExecute(content, state, root);  break;
  }

  // Botones de navegación
  renderWizardNav(root, state);
}

function buildStepDots(current) {
  const labels = ['Tabulado', 'Controles', 'Período', 'Ejecutar'];
  return labels.map((lbl, i) => {
    const isDone   = i < current;
    const isActive = i === current;
    const stepClass = isDone ? 'wizard-step--done' : isActive ? 'wizard-step--active' : '';
    const step = `
      <div class="wizard-step ${stepClass}">
        <div class="wizard-step__bubble">${isDone ? '✓' : i + 1}</div>
        <div class="wizard-step__label">${lbl}</div>
      </div>`;
    const connector = i < labels.length - 1
      ? `<div class="wizard-step__connector ${isDone ? 'wizard-step__connector--done' : ''}"></div>`
      : '';
    return step + connector;
  }).join('');
}

function renderWizardNav(root, state) {
  const nav = root.querySelector('#js-wizard-nav');
  const isFirst = state.step === 0;
  const isLast  = state.step === 3;
  const canNext = canGoNext(state);

  nav.innerHTML = `
    <div>
      ${!isFirst
        ? `<button class="btn btn--secondary" id="js-prev-btn">← Anterior</button>`
        : ''}
    </div>
    <div>
      ${!isLast
        ? `<button class="btn btn--primary" id="js-next-btn" ${canNext ? '' : 'disabled'}>
             Siguiente →
           </button>`
        : ''}
    </div>
  `;

  nav.querySelector('#js-prev-btn')?.addEventListener('click', () => {
    state.step--;
    render(root, state);
  });
  nav.querySelector('#js-next-btn')?.addEventListener('click', () => {
    if (canGoNext(state)) { state.step++; render(root, state); }
  });
}

function canGoNext(state) {
  switch (state.step) {
    case 0: return state.tab !== null;
    case 1: {
      const allFiles = state.selectedControls.length > 0
        && state.selectedControls.every(id => {
          const ctrl = CONTROL_REGISTRY[id];
          if (!ctrl) return false;
          return ctrl.additionalFiles.every(f => state.controlFiles[id]?.[f.key] != null);
        });
      if (!allFiles) return false;
      // Si hay controles de Brutos, las columnas de concepto son obligatorias
      const hasBrutos = state.selectedControls.some(id => id === 'brutos' || id === 'brutos_reporte');
      if (hasBrutos) {
        const cfg = state.brutosTabConfig;
        if (!cfg.tabSalBaseColumn || !cfg.tabACuFutAumenColumn) return false;
      }
      return true;
    }
    case 2: return !!state.period;
    default: return false;
  }
}

// ── Paso 0: Cargar Tabulado ───────────────────────────────────────────────────

function renderStepTab(container, state, root) {
  container.innerHTML = `
    <h3 style="margin-bottom:var(--sp-2);">Paso 1 — Tabulado estandarizado</h3>
    <p class="text-muted" style="margin-bottom:var(--sp-5);">
      Este archivo es la base para todos los controles. Se carga una vez por sesión
      y se comparte entre todos los controles seleccionados.
    </p>
    <div id="js-tab-upload"></div>
  `;

  initFileUploadStep(container.querySelector('#js-tab-upload'), {
    clientId:    state.clientId,
    fileType:    'tab_control',
    existingData: state.tab,
    autoDetect:  AUTO_DETECT.tab_control,
    onComplete:  (data) => {
      state.tab = data;
      renderWizardNav(root, state);
    },
  });
}

// ── Paso 1: Seleccionar controles y cargar archivos ───────────────────────────

function renderStepControls(container, state, root) {
  const controls = Object.values(CONTROL_REGISTRY);

  container.innerHTML = `
    <h3 style="margin-bottom:var(--sp-2);">Paso 2 — Controles a ejecutar</h3>
    <p class="text-muted" style="margin-bottom:var(--sp-4);">
      Seleccioná los controles que querés ejecutar. Cada uno puede requerir cargar un archivo adicional.
    </p>
    <div class="pill-group" id="js-control-pills" style="margin-bottom:var(--sp-5);">
      ${controls.map(ctrl => `
        <button class="pill ${state.selectedControls.includes(ctrl.id) ? 'pill--active' : ''}"
                data-ctrl="${ctrl.id}"
                title="${esc(ctrl.description)}">
          ${esc(ctrl.label)}
        </button>
      `).join('')}
    </div>
    <div id="js-control-files"></div>
  `;

  // Toggle de selección de controles
  container.querySelectorAll('[data-ctrl]').forEach(pill => {
    pill.addEventListener('click', () => {
      const id  = pill.dataset.ctrl;
      const idx = state.selectedControls.indexOf(id);
      if (idx >= 0) {
        state.selectedControls.splice(idx, 1);
        delete state.controlFiles[id];
      } else {
        state.selectedControls.push(id);
        state.controlFiles[id] = {};
      }
      renderStepControls(container, state, root);
      renderWizardNav(root, state);
    });
  });

  // Áreas de carga de archivos adicionales por control seleccionado
  const filesArea = container.querySelector('#js-control-files');

  for (const controlId of state.selectedControls) {
    const ctrl = CONTROL_REGISTRY[controlId];
    if (!ctrl) continue;

    for (const fileSpec of ctrl.additionalFiles) {
      const wrapper = document.createElement('div');
      wrapper.style.marginBottom = 'var(--sp-6)';
      wrapper.innerHTML = `
        <h4 style="margin-bottom:var(--sp-3);">
          ${esc(ctrl.label)} — ${esc(fileSpec.label)}
        </h4>
      `;
      const uploadDiv = document.createElement('div');
      wrapper.appendChild(uploadDiv);
      filesArea.appendChild(wrapper);

      initFileUploadStep(uploadDiv, {
        clientId:    state.clientId,
        fileType:    fileSpec.fileType,
        existingData: state.controlFiles[controlId]?.[fileSpec.key] || null,
        autoDetect:  AUTO_DETECT[fileSpec.fileType] || null,
        onComplete:  (data) => {
          if (!state.controlFiles[controlId]) state.controlFiles[controlId] = {};
          state.controlFiles[controlId][fileSpec.key] = data;
          renderWizardNav(root, state);
        },
      });
    }
  }

  // Panel de configuración de columnas del Tabulado para controles de Brutos
  const hasBrutos = state.selectedControls.some(id => id === 'brutos' || id === 'brutos_reporte');
  if (hasBrutos) {
    renderBrutosTabConfig(filesArea, state, root);
  }
}

// ── Configuración de columnas del Tabulado para Brutos ───────────────────────

const BRUTOS_TAB_FIELDS = [
  { key: 'tabSalBaseColumn',     label: 'Sueldo — columna en Tabulado',            required: true  },
  { key: 'tabACuFutAumenColumn', label: 'A_CTA_FUT_AUMEN — columna en Tabulado',   required: true  },
  { key: 'tabNombreColumn',      label: 'Columna NOMBRE',                          required: false },
  { key: 'tabApellido1Column',   label: 'Columna APELLIDO_1',                      required: false },
  { key: 'tabFecAltaColumn',     label: 'Columna FECHA_ALTA',                      required: false },
  { key: 'tabFecBajaColumn',     label: 'Columna FECHA_BAJA',                      required: false },
  { key: 'tabFecPagoColumn',     label: 'Columna FEC_PAGO',                        required: false },
];

function autoDetectBrutosTabConfig(tabHeaders) {
  const lc = h => String(h).toLowerCase();
  const find = (...kws) => tabHeaders.find(h => kws.some(kw => lc(h).includes(lc(kw)))) || '';

  const nombre   = find('nombre');
  const apellido = find('apellido');

  return {
    tabSalBaseColumn:     find('sueldo', '1003-'),
    tabACuFutAumenColumn: find('a_cta_fut', 'acta_fut', '1017-', 'a cta fut'),
    tabNombreColumn:      (nombre && nombre !== apellido) ? nombre : '',
    tabApellido1Column:   (apellido && apellido !== nombre) ? apellido : '',
    tabFecAltaColumn:     find('fecha_alta', 'fec_alta', 'f_alta', 'alta'),
    tabFecBajaColumn:     find('fecha_baja', 'fec_baja', 'f_baja', 'baja'),
    tabFecPagoColumn:     find('fec_pago', 'fecha_pago', 'pago'),
  };
}

function renderBrutosTabConfig(container, state, root) {
  const tabHeaders = state.tab?.parsedRows?.length > 0
    ? Object.keys(state.tab.parsedRows[0])
    : [];

  // Auto-detectar solo si el config está vacío
  if (tabHeaders.length > 0 && !Object.values(state.brutosTabConfig).some(Boolean)) {
    Object.assign(state.brutosTabConfig, autoDetectBrutosTabConfig(tabHeaders));
  }

  const opts = (selected = '') =>
    ['', ...tabHeaders]
      .map(h => `<option value="${esc(h)}" ${h === selected ? 'selected' : ''}>${esc(h) || '— Sin asignar —'}</option>`)
      .join('');

  const panel = document.createElement('div');
  panel.style.cssText = 'margin-top:var(--sp-6);padding:var(--sp-5);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';
  panel.innerHTML = `
    <h4 style="margin:0 0 var(--sp-2);">Columnas del Tabulado — Brutos</h4>
    <p class="text-muted" style="margin:0 0 var(--sp-4);font-size:var(--text-sm);">
      Indicá qué columna del Tabulado corresponde a cada campo de Brutos.
      FECHA_INI y FECHA_FIN se calculan automáticamente del período seleccionado.
    </p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--sp-3);">
      ${BRUTOS_TAB_FIELDS.map(f => {
        const val  = state.brutosTabConfig[f.key] || '';
        const warn = f.required && !val;
        return `
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label ${f.required ? 'form-label--required' : ''}">
              ${esc(f.label)}
              ${warn ? '<span style="color:#B45309;font-size:.8em;"> ⚠ requerida</span>' : ''}
            </label>
            <select class="form-select" data-brutos-key="${esc(f.key)}"${warn ? ' style="border-color:#EAB308;"' : ''}>
              ${opts(val)}
            </select>
          </div>
        `;
      }).join('')}
    </div>
  `;

  panel.querySelectorAll('[data-brutos-key]').forEach(sel => {
    sel.addEventListener('change', () => {
      const k = sel.dataset.brutosKey;
      if (sel.value) state.brutosTabConfig[k] = sel.value;
      else delete state.brutosTabConfig[k];
      renderWizardNav(root, state);
    });
  });

  container.appendChild(panel);
}

// ── Paso 2: Configurar período ────────────────────────────────────────────────

function renderStepConfig(container, state) {
  const periods = periodOptions(13);

  container.innerHTML = `
    <h3 style="margin-bottom:var(--sp-5);">Paso 3 — Período</h3>
    <div class="form-group" style="max-width:320px;">
      <label class="form-label form-label--required">Período</label>
      <select class="form-select" id="js-period-select">
        ${periods.map(p =>
          `<option value="${esc(p.value)}" ${p.value === state.period ? 'selected' : ''}>${esc(p.label)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group" style="max-width:480px;margin-top:var(--sp-4);">
      <label class="form-label">Notas (opcional)</label>
      <input type="text" class="form-input" id="js-notes-input"
             value="${esc(state.notes)}"
             placeholder="Observaciones del analista...">
    </div>
  `;

  container.querySelector('#js-period-select').addEventListener('change', e => {
    state.period = e.target.value;
  });
  container.querySelector('#js-notes-input').addEventListener('input', e => {
    state.notes = e.target.value;
  });
}

// ── Paso 3: Resumen y ejecución ───────────────────────────────────────────────

function renderStepExecute(container, state, root) {
  const ctrlList = state.selectedControls
    .map(id => CONTROL_REGISTRY[id]?.label || id)
    .join(', ');

  // Línea por cada archivo adicional cargado
  const filesInfo = state.selectedControls.flatMap(id => {
    const ctrl = CONTROL_REGISTRY[id];
    if (!ctrl) return [];
    return ctrl.additionalFiles.map(f => {
      const fd = state.controlFiles[id]?.[f.key];
      if (!fd) return `<strong>${esc(f.label)}:</strong> —`;
      const count = fd.parseMetadata?.activos ?? fd.parseMetadata?.totalRows ?? '?';
      return `<strong>${esc(f.label)}:</strong> ${esc(fd.fileName)} (${count} registros)`;
    });
  }).join('<br>');

  container.innerHTML = `
    <h3 style="margin-bottom:var(--sp-5);">Paso 4 — Resumen</h3>
    <div class="alert alert--info" style="margin-bottom:var(--sp-5);">
      <strong>Cliente:</strong> ${esc(state.client.name)}<br>
      <strong>Período:</strong> ${esc(state.period)}<br>
      <strong>Controles:</strong> ${esc(ctrlList)}<br>
      <strong>Tabulado:</strong> ${esc(state.tab?.fileName || '—')} (${state.tab?.parseMetadata?.totalRows ?? 0} registros)<br>
      ${filesInfo}
      ${state.notes ? `<br><strong>Notas:</strong> ${esc(state.notes)}` : ''}
    </div>
    <button class="btn btn--primary btn--lg" id="js-execute-btn">⚡ Ejecutar controles</button>
    <div id="js-execute-status" style="margin-top:var(--sp-5);"></div>
  `;

  container.querySelector('#js-execute-btn').addEventListener('click', () => {
    container.querySelector('#js-execute-btn').disabled = true;
    executeControls(state, container.querySelector('#js-execute-status'));
  });
}

// ── Ejecución ─────────────────────────────────────────────────────────────────

async function executeControls(state, statusEl) {
  statusEl.innerHTML = `
    <div class="loading-screen">
      <div class="spinner"></div>
      <p class="text-muted">Ejecutando controles…</p>
    </div>
  `;

  try {
    // 1. Crear el run en la DB
    const runId = await createControlRun(
      state.clientId, state.period, state.selectedControls, state.notes
    );

    // 2. Guardar el Tabulado
    const tab = state.tab;
    await saveControlRunFile(
      runId, 'tab_control', tab.fileName, tab.parsedRows, tab.parseMetadata, tab.mapping
    );

    // 3. Guardar config de Brutos si aplica
    const hasBrutos = state.selectedControls.some(id => id === 'brutos' || id === 'brutos_reporte');
    if (hasBrutos && Object.keys(state.brutosTabConfig).length > 0) {
      await saveFileProfile(state.clientId, 'brutos_tab_config', state.brutosTabConfig);
    }

    // 4. Por cada control: guardar archivos adicionales y ejecutar lógica
    for (const controlId of state.selectedControls) {
      const ctrl = CONTROL_REGISTRY[controlId];
      if (!ctrl) continue;

      // Guardar archivos adicionales
      for (const fileSpec of ctrl.additionalFiles) {
        const fileData = state.controlFiles[controlId]?.[fileSpec.key];
        if (fileData) {
          await saveControlRunFile(
            runId, fileSpec.fileType,
            fileData.fileName, fileData.parsedRows, fileData.parseMetadata, fileData.mapping
          );
        }
      }

      // Armar mapping: tab + brutosTabConfig (si aplica) + archivos adicionales + período
      const mapping = {
        tab:    { ...(tab.mapping || {}), ...state.brutosTabConfig },
        period: state.period,
      };
      for (const fileSpec of ctrl.additionalFiles) {
        const fileData = state.controlFiles[controlId]?.[fileSpec.key];
        if (fileData) mapping[fileSpec.key] = fileData.mapping || {};
      }

      // Obtener filas: tab + la primera clave de archivos adicionales como "rows primarios"
      const tabRows    = tab.parsedRows;
      const primaryKey = ctrl.additionalFiles[0]?.key;
      const primaryRows = state.controlFiles[controlId]?.[primaryKey]?.parsedRows || [];

      // Ejecutar
      const results = ctrl.run(primaryRows, tabRows, mapping);

      // Guardar resultados
      await saveControlRunResults(runId, controlId, results);
    }

    // Navegar a resultados
    window.location.hash = `#/control-results/${runId}`;

  } catch (err) {
    console.error('[controlsWizard] Error al ejecutar:', err);
    statusEl.innerHTML = `
      <div class="alert alert--danger">
        ❌ Error al ejecutar los controles: ${esc(err.message)}<br>
        <button class="btn btn--ghost btn--sm" style="margin-top:var(--sp-3);"
                onclick="this.closest('#js-execute-status').innerHTML='';
                         document.querySelector('#js-execute-btn').disabled=false;">
          ← Volver a intentar
        </button>
      </div>
    `;
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
