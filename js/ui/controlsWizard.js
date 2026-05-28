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
  getClientCatalog,
  saveClientCatalog,
} from '../db.js';
import { CATALOGO_SEED } from '../data/catalogoSeed.js';
import { initFileUploadStep, matchLevel, matchSelectStyle, matchBadge } from './fileUpload.js';
import { renderTabuladoAnalysis } from './tabuladoAnalysis.js';
import { CONTROL_REGISTRY }        from '../controls/registry.js';
import { autoDetectTabMapping }    from '../parsers/tabuladoControl.js';
import { autoDetectCatMapping }    from '../parsers/catEmpleados.js';
import { autoDetectBrutosMapping } from '../parsers/brutosParser.js';
import { autoDetectGsPersMapping } from '../parsers/gsPersParser.js';
import { autoDetectNrMapping }          from '../parsers/nrParser.js';
import { autoDetectRendimientoMapping } from '../parsers/rendimientoParser.js';
import { buildParserMapping }           from '../parsers/conceptMatcher.js';
import { currentPeriod, periodOptions } from '../utils/dates.js';
import { renderConceptGroupingEditor }  from './rendVsTabuConceptEditor.js';

// Mapa: fileType → función de auto-detección de columnas
const AUTO_DETECT = {
  tab_control:   autoDetectTabMapping,
  cat_empleados: autoDetectCatMapping,
  brutos_file:   autoDetectBrutosMapping,
  gs_pers_file:  autoDetectGsPersMapping,
  nr_file:        autoDetectNrMapping,
  rend_file:      autoDetectRendimientoMapping,
};

// IDs de controles agrupados (para validación y detección de grupos seleccionados)
const BRUTOS_IDS  = ['brutos', 'brutos_reporte'];
const GS_PERS_IDS = ['gs_pers', 'gs_pers_reporte'];
const NR_IDS      = ['nr', 'nr_reporte'];

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

  const [savedBrutosConfig, savedCatalog, savedRendGrouping] = await Promise.all([
    getFileProfile(Number(clientId), 'brutos_tab_config'),
    getClientCatalog(Number(clientId)),
    getFileProfile(Number(clientId), 'rendvstabu_concept_grouping'),
  ]);

  const state = {
    step:             0,
    clientId:         Number(clientId),
    client,
    tab:              null,
    catalog:          savedCatalog || null,  // { rows, fileName, parseMetadata } | null
    selectedControls: ['cat_x_empleados'],
    controlFiles:     { cat_x_empleados: {} },
    period:           currentPeriod(),
    notes:            '',
    // tabExtraConfig: columnas adicionales del Tabulado para Brutos y GS Pers
    // (se persiste bajo la clave 'brutos_tab_config' por compatibilidad histórica).
    tabExtraConfig:            savedBrutosConfig?.mapping || {},
    tabExtraConfigAutoDetected: false,
    rendVsTabuGrouping:        savedRendGrouping?.mapping || null,
    expandedGroups:            new Set(),  // grupos de controles cuyo panel de modos está abierto
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

      const cfg = state.tabExtraConfig;
      // Si hay controles de Brutos, las columnas de concepto son obligatorias
      const hasBrutos = state.selectedControls.some(id => BRUTOS_IDS.includes(id));
      if (hasBrutos) {
        if (!cfg.tabSalBaseColumn || !cfg.tabACuFutAumenColumn) return false;
      }
      // Si hay controles de GS Pers, las columnas de concepto son obligatorias
      const hasGsPers = state.selectedControls.some(id => GS_PERS_IDS.includes(id));
      if (hasGsPers) {
        if (!cfg.tabGtosPersonalesColumn || !cfg.tabDtoCocheraColumn) return false;
      }
      // Si hay controles de NR, los 20 campos extra son obligatorios
      const hasNr = state.selectedControls.some(id => NR_IDS.includes(id));
      if (hasNr) {
        const nrRequired = [
          ...TAB_NR_EXTRA_FIELDS,
          ...TAB_NR_INDEM_FIELDS,
          ...TAB_NR_OTROS_FIELDS,
        ].map(f => f.key);
        if (nrRequired.some(k => !cfg[k])) return false;
      }
      return true;
    }
    case 2: return !!state.period;
    default: return false;
  }
}

// ── Paso 0: Cargar Tabulado ───────────────────────────────────────────────────

function renderStepTab(container, state, root) {
  const catMeta = state.catalog?.parseMetadata;
  const catSummary = state.catalog
    ? `✅ <strong>${esc(state.catalog.fileName)}</strong> — ${catMeta?.totalRows ?? 0} conceptos cargados`
    : `📂 Sin catálogo cargado — se usará el catálogo estándar (${CATALOGO_SEED.length} conceptos).`;

  container.innerHTML = `
    <h3 style="margin-bottom:var(--sp-2);">Paso 1 — Tabulado estandarizado</h3>
    <p class="text-muted" style="margin-bottom:var(--sp-5);">
      Este archivo es la base para todos los controles. Se carga una vez por sesión
      y se comparte entre todos los controles seleccionados.
    </p>

    <details style="margin-bottom:var(--sp-5);" ${state.catalog ? '' : 'open'}>
      <summary style="
        cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);
        color:var(--color-primary);list-style:none;display:flex;align-items:center;
        gap:var(--sp-2);user-select:none;margin-bottom:var(--sp-1);
      ">
        <span>▸</span> Catálogo de Conceptos (opcional)
      </summary>
      <div style="margin-top:var(--sp-3);padding:var(--sp-4);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">

        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sp-3);margin-bottom:var(--sp-3);position:relative;">
          <p class="text-sm text-muted" style="margin:0;">
            El catálogo define qué columnas del Tabulado corresponden a cada concepto y a qué controles
            pertenecen. Si no cargás uno, se usa el catálogo estándar.
          </p>
          <details style="flex-shrink:0;">
            <summary style="
              list-style:none;cursor:pointer;font-size:1.15em;
              width:1.6em;height:1.6em;display:flex;align-items:center;justify-content:center;
              border-radius:50%;border:1px solid var(--color-border);background:var(--color-bg);
              color:var(--color-primary);user-select:none;
            " title="¿Qué es el catálogo? ¿Para qué sirve?">ℹ</summary>
            <div style="
              position:absolute;z-index:10;margin-top:var(--sp-2);right:0;
              max-width:560px;width:90vw;
              max-height:60vh;overflow-y:scroll;
              padding:var(--sp-5);background:var(--color-bg);
              border:1px solid var(--color-border);border-radius:var(--radius-md);
              box-shadow:0 4px 16px rgba(0,0,0,0.12);font-size:var(--text-sm);
            ">
              <p style="margin:0 0 var(--sp-4);font-weight:var(--fw-semibold);">¿Qué es el Catálogo de Conceptos?</p>

              <p style="margin:0 0 var(--sp-3);">
                Es el mapa que conecta los <strong>nombres de columnas</strong> de los archivos del cliente
                con los <strong>conceptos contables</strong> que la app conoce. Cargándolo una vez,
                el auto-detect mejora notablemente y el análisis del Tabulado pasa a ser visible y accionable.
              </p>

              <p style="margin:0 0 var(--sp-2);font-weight:var(--fw-semibold);">Estructura del archivo (.xlsx)</p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:var(--sp-4);">
                <thead>
                  <tr style="background:var(--color-surface);">
                    <th style="padding:4px 8px;text-align:left;border:1px solid var(--color-border);">Columna</th>
                    <th style="padding:4px 8px;text-align:left;border:1px solid var(--color-border);">Requerida</th>
                    <th style="padding:4px 8px;text-align:left;border:1px solid var(--color-border);">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style="padding:4px 8px;border:1px solid var(--color-border);font-family:monospace;">CODIGO</td><td style="padding:4px 8px;border:1px solid var(--color-border);">Sí</td><td style="padding:4px 8px;border:1px solid var(--color-border);">Identificador canónico del concepto. Ej: <code>SAL_BASE</code>, <code>INDEM_PREAVISO</code></td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--color-border);font-family:monospace;">DESCRIPCION</td><td style="padding:4px 8px;border:1px solid var(--color-border);">Sí</td><td style="padding:4px 8px;border:1px solid var(--color-border);">Nombre humano. Ej: "Sueldo Base", "Indemnización por Preaviso"</td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--color-border);font-family:monospace;">CLASIFICACION</td><td style="padding:4px 8px;border:1px solid var(--color-border);">Sí</td><td style="padding:4px 8px;border:1px solid var(--color-border);">Uno de: <code>remu</code> · <code>no_remu</code> · <code>aporte</code> · <code>contribucion</code></td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--color-border);font-family:monospace;">CONTROLES</td><td style="padding:4px 8px;border:1px solid var(--color-border);">No</td><td style="padding:4px 8px;border:1px solid var(--color-border);">IDs de controles que usan este concepto, separados por <code>|</code>. Ej: <code>brutos|nr</code></td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--color-border);font-family:monospace;">ALIAS</td><td style="padding:4px 8px;border:1px solid var(--color-border);">No</td><td style="padding:4px 8px;border:1px solid var(--color-border);">Otros nombres con que aparece la columna en archivos del cliente, separados por <code>|</code>. Ej: <code>sueldo|1003-|sal base</code></td></tr>
                </tbody>
              </table>

              <p style="margin:0 0 var(--sp-2);font-weight:var(--fw-semibold);">¿Qué se gana cargándolo?</p>
              <ul style="margin:0 0 var(--sp-3);padding-left:var(--sp-5);line-height:1.6;">
                <li><strong>Auto-detect mejorado:</strong> el sistema busca las columnas usando el código, todos sus alias, y también tolera variaciones de espacios, guiones y errores de tipeo de un carácter.</li>
                <li><strong>Panel de análisis del Tabulado:</strong> después de cargar el Tabulado se muestra qué columnas fueron reconocidas, cuáles son "huérfanas" (no están en el catálogo) y cuáles se esperaban pero no aparecen en el archivo.</li>
                <li><strong>Visibilidad de conceptos nuevos:</strong> si el cliente empieza a liquidar un concepto nuevo, aparecerá en "Huérfanas" y podés decidir si agregarlo al catálogo.</li>
              </ul>

              <p style="margin:0;color:var(--color-text-muted);">
                El catálogo se guarda por cliente. No hace falta cargarlo en cada sesión.
                Si no cargás uno, la app usa el catálogo estándar (22 conceptos conocidos).
              </p>
            </div>
          </details>
        </div>

        <div id="js-catalog-status" style="margin-bottom:var(--sp-3);">
          <div class="alert ${state.catalog ? 'alert--success' : 'alert--info'}" style="margin:0;">
            ${catSummary}
          </div>
        </div>
        <div id="js-catalog-upload" style="${state.catalog ? 'display:none' : ''}"></div>
        ${state.catalog ? `<button class="btn btn--ghost btn--sm" id="js-catalog-replace">↺ Reemplazar catálogo</button>` : ''}
      </div>
    </details>

    <div id="js-tab-upload"></div>
    <div id="js-tab-analysis"></div>
  `;

  // Inicializar el upload del catálogo
  const catalogUploadEl = container.querySelector('#js-catalog-upload');
  initFileUploadStep(catalogUploadEl, {
    clientId:    state.clientId,
    fileType:    'concept_catalog',
    existingData: null,
    onComplete:  async (data) => {
      state.catalog = { rows: data.rows, fileName: data.fileName, parseMetadata: data.parseMetadata };
      await saveClientCatalog(state.clientId, state.catalog);
      // Re-render el paso completo para reflejar el catálogo cargado
      renderStepTab(container, state, root);
    },
  });

  // Botón reemplazar
  container.querySelector('#js-catalog-replace')?.addEventListener('click', () => {
    const statusEl = container.querySelector('#js-catalog-status');
    const uploadEl = container.querySelector('#js-catalog-upload');
    statusEl.innerHTML = '<div class="alert alert--info" style="margin:0;">Cargá el nuevo catálogo:</div>';
    uploadEl.style.display = '';
    container.querySelector('#js-catalog-replace')?.remove();
    initFileUploadStep(uploadEl, {
      clientId:    state.clientId,
      fileType:    'concept_catalog',
      existingData: null,
      onComplete:  async (data) => {
        state.catalog = { rows: data.rows, fileName: data.fileName, parseMetadata: data.parseMetadata };
        await saveClientCatalog(state.clientId, state.catalog);
        renderStepTab(container, state, root);
      },
    });
  });

  const catalogRows = state.catalog?.rows || CATALOGO_SEED;
  const analysisEl  = container.querySelector('#js-tab-analysis');

  // Si el tabulado ya está cargado (ej: re-render tras cambio de catálogo), mostrar análisis de inmediato
  if (state.tab) {
    renderTabuladoAnalysis(analysisEl, state.tab, catalogRows, state.selectedControls);
  }

  initFileUploadStep(container.querySelector('#js-tab-upload'), {
    clientId:    state.clientId,
    fileType:    'tab_control',
    existingData: state.tab,
    autoDetect:  AUTO_DETECT.tab_control,
    onComplete:  (data) => {
      state.tab = data;
      renderWizardNav(root, state);
      renderTabuladoAnalysis(analysisEl, state.tab, catalogRows, state.selectedControls);
    },
  });
}

// ── Paso 1: Seleccionar controles y cargar archivos ───────────────────────────

// Construye la sección colapsable "¿Qué hace cada control?" del paso 2.
function buildHelpSection() {
  const allControls = Object.values(CONTROL_REGISTRY);

  const cards = allControls
    .filter(c => c.help)
    .map(c => {
      const stepsHtml = c.help.how.map((step, i) =>
        `<li style="margin-bottom:var(--sp-1);">${esc(step)}</li>`
      ).join('');
      return `
        <div style="
          padding: var(--sp-4);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-bg);
          min-width: 200px;
          flex: 1 1 220px;
        ">
          <p style="margin:0 0 var(--sp-2);font-weight:var(--fw-semibold);font-size:var(--text-sm);">
            ${esc(c.label)}
          </p>
          <p style="margin:0 0 var(--sp-3);font-size:var(--text-sm);color:var(--color-wordmark);">
            ${esc(c.help.what)}
          </p>
          <ol style="margin:0;padding-left:var(--sp-5);font-size:var(--text-sm);">
            ${stepsHtml}
          </ol>
        </div>
      `;
    }).join('');

  return `
    <details style="margin-bottom:var(--sp-5);">
      <summary style="
        cursor:pointer;
        font-size:var(--text-sm);
        font-weight:var(--fw-semibold);
        color:var(--color-primary);
        list-style:none;
        display:flex;
        align-items:center;
        gap:var(--sp-2);
        user-select:none;
        margin-bottom:var(--sp-1);
      ">
        <span class="js-help-arrow">▸</span> ¿Qué hace cada control?
      </summary>
      <div style="
        display:flex;
        flex-wrap:wrap;
        gap:var(--sp-3);
        margin-top:var(--sp-4);
        padding:var(--sp-4);
        background:var(--color-surface);
        border:1px solid var(--color-border);
        border-radius:var(--radius-md);
      ">
        ${cards}
      </div>
    </details>
  `;
}

// Agrupa los controles del REGISTRY por su `group.id`. Devuelve una lista de bloques
// en el orden de definición del registry. Cada bloque es:
//   - { kind: 'standalone', ctrl }                    → un solo control sin grupo
//   - { kind: 'group', groupMeta, controls: [...] }   → varios controles bajo un mismo grupo
function buildControlBlocks() {
  const blocks  = [];
  const seenIdx = new Map();  // groupId → posición en blocks
  for (const ctrl of Object.values(CONTROL_REGISTRY)) {
    if (!ctrl.group) {
      blocks.push({ kind: 'standalone', ctrl });
      continue;
    }
    const gid = ctrl.group.id;
    if (seenIdx.has(gid)) {
      blocks[seenIdx.get(gid)].controls.push(ctrl);
    } else {
      seenIdx.set(gid, blocks.length);
      blocks.push({ kind: 'group', groupMeta: ctrl.group, controls: [ctrl] });
    }
  }
  return blocks;
}

// Un grupo se renderiza expandido si: (a) el usuario lo abrió manualmente, o
// (b) alguno de sus modos está activo.
function isGroupExpanded(groupId, state) {
  if (state.expandedGroups.has(groupId)) return true;
  return Object.values(CONTROL_REGISTRY)
    .some(c => c.group?.id === groupId && state.selectedControls.includes(c.id));
}

function renderStepControls(container, state, root) {
  const blocks = buildControlBlocks();

  // Render de cada bloque como HTML
  const blocksHtml = blocks.map(b => {
    if (b.kind === 'standalone') {
      const active = state.selectedControls.includes(b.ctrl.id);
      return `
        <button class="pill ${active ? 'pill--active' : ''}"
                data-ctrl="${esc(b.ctrl.id)}"
                title="${esc(b.ctrl.description)}">
          ${esc(b.ctrl.label)}
        </button>
      `;
    }
    // Grupo con sub-modos
    const groupId   = b.groupMeta.id;
    const expanded  = isGroupExpanded(groupId, state);
    const anyActive = b.controls.some(c => state.selectedControls.includes(c.id));
    const arrow     = expanded ? '▾' : '▸';
    const subsHtml  = expanded
      ? `<div class="control-group__modes">
           ${b.controls.map(c => {
             const subActive = state.selectedControls.includes(c.id);
             return `
               <button class="pill pill--sub ${subActive ? 'pill--active' : ''}"
                       data-ctrl="${esc(c.id)}"
                       title="${esc(c.description)}">
                 ${esc(c.group.mode)}
               </button>
             `;
           }).join('')}
         </div>`
      : '';
    return `
      <div class="control-group">
        <button class="pill ${anyActive ? 'pill--active' : ''}"
                data-group="${esc(groupId)}">
          ${esc(b.groupMeta.label)} ${arrow}
        </button>
        ${subsHtml}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <h3 style="margin-bottom:var(--sp-2);">Paso 2 — Controles a ejecutar</h3>
    <p class="text-muted" style="margin-bottom:var(--sp-4);">
      Seleccioná los controles que querés ejecutar. Cada uno puede requerir cargar un archivo adicional.
    </p>

    ${buildHelpSection()}

    <div class="pill-group" id="js-control-pills" style="margin-bottom:var(--sp-5);">
      ${blocksHtml}
    </div>
    <div id="js-control-files"></div>
  `;

  // Click en sub-pill o en pill standalone: activa/desactiva ese control
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

  // Click en el pill principal de un grupo: toggle expansión.
  // Si el grupo tenía modos activos, los desactiva (master OFF).
  container.querySelectorAll('[data-group]').forEach(pill => {
    pill.addEventListener('click', () => {
      const gid = pill.dataset.group;
      const controlsInGroup = Object.values(CONTROL_REGISTRY)
        .filter(c => c.group?.id === gid);
      const activeSubs = controlsInGroup.filter(c => state.selectedControls.includes(c.id));

      if (activeSubs.length > 0) {
        // Tiene modos activos → desactiva todo y colapsa
        for (const c of activeSubs) {
          const i = state.selectedControls.indexOf(c.id);
          if (i >= 0) state.selectedControls.splice(i, 1);
          delete state.controlFiles[c.id];
        }
        state.expandedGroups.delete(gid);
      } else {
        // Sin modos activos → toggle visual
        if (state.expandedGroups.has(gid)) state.expandedGroups.delete(gid);
        else state.expandedGroups.add(gid);
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

      const baseDetect = AUTO_DETECT[fileSpec.fileType];
      const catalogRows = state.catalog?.rows || CATALOGO_SEED;
      const autoDetect = baseDetect
        ? (headers) => baseDetect(headers, catalogRows)
        : null;

      initFileUploadStep(uploadDiv, {
        clientId:    state.clientId,
        fileType:    fileSpec.fileType,
        existingData: state.controlFiles[controlId]?.[fileSpec.key] || null,
        autoDetect,
        onComplete:  (data) => {
          if (!state.controlFiles[controlId]) state.controlFiles[controlId] = {};
          state.controlFiles[controlId][fileSpec.key] = data;
          renderWizardNav(root, state);
        },
      });
    }
  }

  // Panel de configuración de columnas del Tabulado para Brutos, GS Pers, NR y/o RendvsTabu
  const hasBrutos    = state.selectedControls.some(id => BRUTOS_IDS.includes(id));
  const hasGsPers    = state.selectedControls.some(id => GS_PERS_IDS.includes(id));
  const hasNr        = state.selectedControls.some(id => NR_IDS.includes(id));
  const hasRendVsTabu = state.selectedControls.includes('rend_vs_tabu');

  if (hasBrutos || hasGsPers || hasNr) {
    renderTabExtraConfig(filesArea, state, root, { hasBrutos, hasGsPers, hasNr });
  }

  if (hasRendVsTabu && state.tab?.parsedRows?.length > 0) {
    const editorDiv = document.createElement('div');
    filesArea.appendChild(editorDiv);
    renderConceptGroupingEditor(
      editorDiv,
      state.tab.parsedRows,
      state.rendVsTabuGrouping,
      (newGrouping) => { state.rendVsTabuGrouping = newGrouping; }
    );
  }
}

// ── Configuración de columnas del Tabulado para Brutos / GS Pers ────────────

// Campos compartidos por ambos controles (precarga con auto-detección o perfil guardado)
const TAB_SHARED_FIELDS = [
  { key: 'tabNombreColumn',      label: 'Columna NOMBRE',     required: false },
  { key: 'tabApellido1Column',   label: 'Columna APELLIDO_1', required: false },
  { key: 'tabFecAltaColumn',     label: 'Columna FECHA_ALTA', required: false },
  { key: 'tabFecBajaColumn',     label: 'Columna FECHA_BAJA', required: false },
  { key: 'tabFecPagoColumn',     label: 'Columna FEC_PAGO',   required: false },
];

const TAB_BRUTOS_FIELDS = [
  { key: 'tabSalBaseColumn',     label: 'Sueldo — columna en Tabulado',          required: true },
  { key: 'tabACuFutAumenColumn', label: 'A_CTA_FUT_AUMEN — columna en Tabulado', required: true },
];

const TAB_GS_PERS_FIELDS = [
  { key: 'tabGtosPersonalesColumn', label: 'GTOS_PERSONALES — columna en Tabulado', required: true },
  { key: 'tabDtoCocheraColumn',     label: 'DTO_COCHERA — columna en Tabulado',      required: true },
];

const TAB_NR_EXTRA_FIELDS = [
  { key: 'tabIdCentroTrabColumn', label: 'ID_CENTRO_TRAB — columna en Tabulado', required: true },
  { key: 'tabIdCategoriaColumn',  label: 'ID_CATEGORIA — columna en Tabulado',   required: true },
];

const TAB_NR_INDEM_FIELDS = [
  { key: 'tabIndemPreavisoColumn',  label: 'INDEM_PREAVISO — columna en Tabulado',  required: true },
  { key: 'tabSacPreavisoColumn',    label: 'SAC_PREAVISO — columna en Tabulado',    required: true },
  { key: 'tabIndemAntDespColumn',   label: 'INDEM_ANT_DESP — columna en Tabulado',  required: true },
  { key: 'tabIndemAntFalleColumn',  label: 'INDEM_ANT_FALLE — columna en Tabulado', required: true },
  { key: 'tabIndemIntegColumn',     label: 'INDEM_INTEG — columna en Tabulado',     required: true },
  { key: 'tabSacIndemIntegColumn',  label: 'SAC_INDEM_INTEG — columna en Tabulado', required: true },
  { key: 'tabIndmMaternidadColumn', label: 'INDM_MATERNIDAD — columna en Tabulado', required: true },
  { key: 'tabVacNoGozadasColumn',   label: 'VAC_NO_GOZADAS — columna en Tabulado',  required: true },
  { key: 'tabVacNoGozSacColumn',    label: 'VAC_NO_GOZ_SAC — columna en Tabulado',  required: true },
  { key: 'tabGratVacColumn',        label: 'GRAT_VAC — columna en Tabulado',        required: true },
  { key: 'tabGraVacnogSacColumn',   label: 'GRA_VACNOG_SAC — columna en Tabulado',  required: true },
  { key: 'tabIndemFuerMayColumn',   label: 'INDEM_FUER_MAY — columna en Tabulado',  required: true },
  { key: 'tabIndemEmbarazoColumn',  label: 'INDEM_EMBARAZO — columna en Tabulado',  required: true },
];

const TAB_NR_OTROS_FIELDS = [
  { key: 'tabReinHomeOficeColumn',  label: 'REIN_HOME_OFICE — columna en Tabulado', required: true },
  { key: 'tabGratExtraordColumn',   label: 'GRAT_EXTRAORD — columna en Tabulado',   required: true },
  { key: 'tabAsigPasColumn',        label: 'ASIG_PAS — columna en Tabulado',        required: true },
  { key: 'tabReintGuardColumn',     label: 'REINT_GUARD — columna en Tabulado',     required: true },
  { key: 'tabIncrementoStColumn',   label: 'INCREMENTO_ST — columna en Tabulado',   required: true },
];

// Mapa CODIGO del catálogo → clave del tabExtraConfig (con prefijo "tab")
const TAB_EXTRA_CODIGO_TO_KEY = {
  'SAL_BASE':        'tabSalBaseColumn',
  'A_CTA_FUT_AUMEN': 'tabACuFutAumenColumn',
  'GTOS_PERSONALES': 'tabGtosPersonalesColumn',
  'DTO_COCHERA':     'tabDtoCocheraColumn',
  'INDEM_PREAVISO':  'tabIndemPreavisoColumn',
  'SAC_PREAVISO':    'tabSacPreavisoColumn',
  'INDEM_ANT_DESP':  'tabIndemAntDespColumn',
  'INDEM_ANT_FALLE': 'tabIndemAntFalleColumn',
  'INDEM_INTEG':     'tabIndemIntegColumn',
  'SAC_INDEM_INTEG': 'tabSacIndemIntegColumn',
  'INDM_MATERNIDAD': 'tabIndmMaternidadColumn',
  'VAC_NO_GOZADAS':  'tabVacNoGozadasColumn',
  'VAC_NO_GOZ_SAC':  'tabVacNoGozSacColumn',
  'GRAT_VAC':        'tabGratVacColumn',
  'GRA_VACNOG_SAC':  'tabGraVacnogSacColumn',
  'INDEM_FUER_MAY':  'tabIndemFuerMayColumn',
  'INDEM_EMBARAZO':  'tabIndemEmbarazoColumn',
  'REIN_HOME_OFICE': 'tabReinHomeOficeColumn',
  'GRAT_EXTRAORD':   'tabGratExtraordColumn',
  'ASIG_PAS':        'tabAsigPasColumn',
  'REINT_GUARD':     'tabReintGuardColumn',
  'INCREMENTO_ST':   'tabIncrementoStColumn',
};

function autoDetectTabExtraConfig(tabHeaders, catalogRows) {
  const catalog = catalogRows || CATALOGO_SEED;
  const lc = h => String(h).toLowerCase();
  const find = (...kws) => tabHeaders.find(h => kws.some(kw => lc(h).includes(lc(kw)))) || '';

  // Campos de empleado (no están en el catálogo) — detección hardcoded
  const nombre   = find('nombre');
  const apellido = find('apellido');

  // Campos NR fijos (ID_CENTRO_TRAB, ID_CATEGORIA) — también son campos de nómina, no conceptos
  const idCentroTrab = find('id_centro_trab', 'centro_trab');
  const idCategoria  = find('id_categoria', 'categoria');

  // Conceptos del catálogo → usar buildParserMapping con normalización + alias + fuzzy
  const conceptMapping = buildParserMapping(tabHeaders, catalog, TAB_EXTRA_CODIGO_TO_KEY);

  return {
    ...conceptMapping,
    // Campos de empleado (hardcoded, no conceptos)
    tabNombreColumn:      (nombre && nombre !== apellido) ? nombre : '',
    tabApellido1Column:   (apellido && apellido !== nombre) ? apellido : '',
    tabFecAltaColumn:     find('fecha_alta', 'fec_alta', 'f_alta', 'alta'),
    tabFecBajaColumn:     find('fecha_baja', 'fec_baja', 'f_baja', 'baja'),
    tabFecPagoColumn:     find('fec_pago', 'fecha_pago', 'pago'),
    tabIdCentroTrabColumn: idCentroTrab,
    tabIdCategoriaColumn:  idCategoria,
  };
}

function renderTabExtraConfig(container, state, root, { hasBrutos, hasGsPers, hasNr }) {
  const tabHeaders = state.tab?.parsedRows?.length > 0
    ? Object.keys(state.tab.parsedRows[0])
    : [];

  const catalogRows = state.catalog?.rows || CATALOGO_SEED;

  // Merge incremental: auto-detectar campos que aún no están configurados
  if (tabHeaders.length > 0) {
    const detected = autoDetectTabExtraConfig(tabHeaders, catalogRows);
    let anyNew = false;
    for (const [k, v] of Object.entries(detected)) {
      if (v && !state.tabExtraConfig[k]) {
        state.tabExtraConfig[k] = v;
        anyNew = true;
      }
    }
    if (anyNew) state.tabExtraConfigAutoDetected = true;
  }

  const hasSavedConfig = Object.values(state.tabExtraConfig).some(Boolean);
  const autoDetected   = state.tabExtraConfigAutoDetected;

  // Construir lista de campos a mostrar según los controles seleccionados.
  // { groupHeader: string } intercalado actúa como separador visual en el grid.
  const fields = [
    ...(hasBrutos ? TAB_BRUTOS_FIELDS  : []),
    ...(hasGsPers ? TAB_GS_PERS_FIELDS : []),
    ...(hasNr ? [
      ...TAB_NR_EXTRA_FIELDS,
      { groupHeader: 'Indemnizatorios' },
      ...TAB_NR_INDEM_FIELDS,
      { groupHeader: 'Otros NR' },
      ...TAB_NR_OTROS_FIELDS,
    ] : []),
    ...TAB_SHARED_FIELDS,
  ];

  const parts = [
    hasBrutos && 'Brutos',
    hasGsPers && 'GS Pers',
    hasNr     && 'Control NR',
  ].filter(Boolean);
  const headerTitle = parts.join(' / ');

  const opts = (selected = '') =>
    ['', ...tabHeaders]
      .map(h => `<option value="${esc(h)}" ${h === selected ? 'selected' : ''}>${esc(h) || '— Sin asignar —'}</option>`)
      .join('');

  const panel = document.createElement('div');
  panel.style.cssText = 'margin-top:var(--sp-6);padding:var(--sp-5);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';
  panel.innerHTML = `
    <h4 style="margin:0 0 var(--sp-2);">Columnas del Tabulado — ${esc(headerTitle)}</h4>
    <p class="text-muted" style="margin:0 0 var(--sp-4);font-size:var(--text-sm);">
      Indicá qué columna del Tabulado corresponde a cada campo.
      FECHA_INI y FECHA_FIN se calculan automáticamente del período seleccionado.
    </p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--sp-3);">
      ${fields.map(f => {
        if (f.groupHeader) {
          return `
            <div style="grid-column:1/-1;margin-top:var(--sp-2);padding-bottom:var(--sp-1);border-bottom:1px solid var(--color-border);">
              <span style="font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-wordmark);">${esc(f.groupHeader)}</span>
            </div>
          `;
        }
        const val   = state.tabExtraConfig[f.key] || '';
        const level = matchLevel(val, { autoDetected, hasSavedMapping: hasSavedConfig });
        const style = matchSelectStyle(level);
        const badge = matchBadge(level);
        return `
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label ${f.required ? 'form-label--required' : ''}">
              ${esc(f.label)}${badge}
            </label>
            <select class="form-select" data-tab-extra-key="${esc(f.key)}"${style ? ` style="${style}"` : ''}>
              ${opts(val)}
            </select>
          </div>
        `;
      }).join('')}
    </div>
  `;

  panel.querySelectorAll('[data-tab-extra-key]').forEach(sel => {
    sel.addEventListener('change', () => {
      const k = sel.dataset.tabExtraKey;
      if (sel.value) state.tabExtraConfig[k] = sel.value;
      else delete state.tabExtraConfig[k];
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

    // 3. Guardar config extra del Tabulado (Brutos / GS Pers) si aplica
    const needsTabExtra = state.selectedControls.some(id =>
      BRUTOS_IDS.includes(id) || GS_PERS_IDS.includes(id)
    );
    if (needsTabExtra && Object.keys(state.tabExtraConfig).length > 0) {
      // La clave de profile se mantiene como 'brutos_tab_config' por compatibilidad
      // histórica con perfiles ya guardados; el objeto ahora contiene campos de ambos.
      await saveFileProfile(state.clientId, 'brutos_tab_config', state.tabExtraConfig);
    }

    // 3b. Guardar agrupación de conceptos RendvsTabu si fue personalizada
    if (state.selectedControls.includes('rend_vs_tabu') && state.rendVsTabuGrouping) {
      await saveFileProfile(state.clientId, 'rendvstabu_concept_grouping', state.rendVsTabuGrouping);
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

      // Armar mapping: tab + tabExtraConfig (si aplica) + archivos adicionales + período
      const mapping = {
        tab:    { ...(tab.mapping || {}), ...state.tabExtraConfig },
        period: state.period,
      };
      if (controlId === 'rend_vs_tabu' && state.rendVsTabuGrouping) {
        mapping.conceptGrouping = state.rendVsTabuGrouping;
      }
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
