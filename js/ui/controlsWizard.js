// controlsWizard.js — Wizard de ejecución de controles para un cliente
//
// Flujo de 3 pasos:
//   0. Seleccionar controles a ejecutar
//   1. Cargar archivos (Tabulado si hace falta + archivos adicionales de cada control)
//   2. Configurar período, ejecutar y ver resultados (inline, sin navegar)

import {
  getClient,
  createControlRun,
  updateControlRun,
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
import { autoDetectCostoTotalMapping }  from '../parsers/costoTotalParser.js';
import { buildParserMapping }           from '../parsers/conceptMatcher.js';
import { currentPeriod, periodOptions } from '../utils/dates.js';
import { renderConceptGroupingEditor }     from './rendVsTabuConceptEditor.js';
import { renderRendVsAsientoConfigEditor, DEFAULT_RVA_CONFIG } from '../controls/rendVsAsiento.js';
import { showToast, showConfirm }          from './toast.js';

// ── Caché de sesión del Tabulado ─────────────────────────────────────────────
// Evita re-subir el Tabulado entre runs mientras la página esté activa.
// Expira a las 2 horas con aviso 1 minuto antes.

const TAB_SESSION_TTL_MS  = 2 * 60 * 60 * 1000; // 2 horas
const TAB_SESSION_WARN_MS = 60 * 1000;            // aviso 1 min antes de expirar

let _tabSessionCache = null;   // { data, clientId }
let _tabSessionTimer = null;

function setTabSessionCache(data, clientId) {
  clearTabSessionCache();
  _tabSessionCache = { data: { ...data }, clientId };
  _tabSessionTimer = setTimeout(() => {
    showToast('⏳ El Tabulado en memoria expira en 1 minuto y será eliminado por seguridad.', 'warning');
    setTimeout(clearTabSessionCache, TAB_SESSION_WARN_MS);
  }, TAB_SESSION_TTL_MS - TAB_SESSION_WARN_MS);
}

function clearTabSessionCache() {
  if (_tabSessionTimer) { clearTimeout(_tabSessionTimer); _tabSessionTimer = null; }
  _tabSessionCache = null;
}

// Mapa: fileType → función de auto-detección de columnas
const AUTO_DETECT = {
  tab_control:   autoDetectTabMapping,
  cat_empleados: autoDetectCatMapping,
  brutos_file:   autoDetectBrutosMapping,
  gs_pers_file:  autoDetectGsPersMapping,
  nr_file:           autoDetectNrMapping,
  rend_file:         autoDetectRendimientoMapping,
  costo_total_file:  autoDetectCostoTotalMapping,
};

// IDs de controles agrupados (para validación y detección de grupos seleccionados)
const BRUTOS_IDS  = ['brutos', 'brutos_reporte'];
const GS_PERS_IDS = ['gs_pers', 'gs_pers_reporte'];
const NR_IDS      = ['nr', 'nr_reporte'];

// Controles que usan la agrupación de conceptos de Rend vs Tabulado
const REND_GROUPING_IDS = ['rend_vs_tabu', 'rend_x_ee'];

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

  const [savedBrutosConfig, savedCatalog, savedRendGrouping, savedRvaConfig] = await Promise.all([
    getFileProfile(Number(clientId), 'brutos_tab_config'),
    getClientCatalog(Number(clientId)),
    getFileProfile(Number(clientId), 'rendvstabu_concept_grouping'),
    getFileProfile(Number(clientId), 'rva_config'),
  ]);

  // Pre-cargar tabulado desde caché de sesión si existe y es del mismo cliente
  const cachedTab = (_tabSessionCache?.clientId === Number(clientId))
    ? _tabSessionCache.data
    : null;

  const state = {
    step:             0,
    clientId:         Number(clientId),
    client,
    tab:              cachedTab,
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
    // Config del Control 6 (Rendimiento vs Asiento): clasificación CUENTA_CONTAB,
    // conceptos PROV CCSS y redirects de CC. Editable por el usuario en el paso Archivos.
    rvaConfig:                 savedRvaConfig?.mapping || JSON.parse(JSON.stringify(DEFAULT_RVA_CONFIG)),
    expandedGroups:            new Set(),  // grupos de controles cuyo panel de modos está abierto
    lastRunId:                 null,       // runId del último execute exitoso (null si quickRun)
    lastRunResults:            null,       // { [controlId]: results } del último execute exitoso
    lastRunIsDefinitive:       false,      // si el último run está marcado como definitivo
    quickRun:                  false,      // si está marcado, no se guarda nada (modo prueba)
  };

  root.innerHTML = `
    <div class="page-content" style="padding-bottom:80px;">
      <div class="page-actions">
        <div class="page-actions__title">
          <a href="#/" class="btn btn--ghost btn--sm">← Inicio</a>
          <h2 style="margin:0 0 0 var(--sp-3);">Controles — ${esc(client.name)}</h2>
        </div>
      </div>
      <div class="wizard-steps" id="js-wizard-steps" style="margin:var(--sp-3) 0;"></div>
      <div class="card">
        <div class="card__body" id="js-step-content" style="padding:var(--sp-5);"></div>
      </div>
      <div id="js-wizard-nav" style="
        position:sticky;bottom:0;z-index:20;
        display:flex;justify-content:space-between;align-items:center;
        margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);
        background:var(--color-surface);
        border:1px solid var(--color-border);border-radius:var(--radius-md);
        box-shadow:var(--shadow-md);
      "></div>
    </div>
  `;

  render(root, state);
}

// ── Render central ────────────────────────────────────────────────────────────

function render(root, state) {
  // Indicadores de paso
  root.querySelector('#js-wizard-steps').innerHTML = buildStepDots(state.step);

  // Contenido del paso — envuelto en div para animación fade-in
  const content = root.querySelector('#js-step-content');
  content.innerHTML = '';
  const fadeWrap = document.createElement('div');
  fadeWrap.className = 'wizard-step-fade';
  content.appendChild(fadeWrap);
  switch (state.step) {
    case 0: renderStepControls(fadeWrap, state, root); break;
    case 1: renderStepFiles(fadeWrap, state, root);    break;
    case 2: renderStepExecute(fadeWrap, state, root);  break;
  }

  // Botones de navegación
  renderWizardNav(root, state);

  // Atajos de teclado: ← → para moverse entre pasos
  if (state._navController) state._navController.abort();
  state._navController = new AbortController();
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' && canGoNext(state) && state.step < 2) {
      state.step++;
      render(root, state);
    } else if (e.key === 'ArrowLeft' && state.step > 0) {
      if (state.step === 2) state.lastRunResults = null;
      state.step--;
      render(root, state);
    }
  }, { signal: state._navController.signal });
}

function buildStepDots(current) {
  const labels = ['Controles', 'Archivos', 'Ejecutar'];
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
  const isLast  = state.step === 2;
  const canNext = canGoNext(state);

  // En step 2 con resultados ya mostrados, el prev dice "Reconfigurar"
  const prevLabel = (state.step === 2 && state.lastRunResults) ? '← Reconfigurar' : '← Anterior';
  const hint = !canNext && !isLast ? nextStepHint(state) : '';

  nav.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--sp-3);">
      ${!isFirst
        ? `<button class="btn btn--ghost btn--sm" id="js-prev-btn">${prevLabel}</button>`
        : ''}
      ${!isLast ? `
        <span class="text-muted" style="font-size:11px;display:none;" id="js-kbd-hint">
          <kbd style="padding:1px 5px;border:1px solid var(--color-border);border-radius:3px;background:var(--color-surface);font-family:monospace;font-size:10px;">←</kbd>
          <kbd style="padding:1px 5px;border:1px solid var(--color-border);border-radius:3px;background:var(--color-surface);font-family:monospace;font-size:10px;">→</kbd>
          navegar
        </span>
      ` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:var(--sp-3);">
      ${hint ? `<span class="text-sm text-muted" style="font-style:italic;">${hint}</span>` : ''}
      ${!isLast
        ? `<button class="btn btn--primary" id="js-next-btn" ${canNext ? '' : 'disabled'}>
             Siguiente →
           </button>`
        : ''}
    </div>
  `;

  // Mostrar hint de teclado solo en pantallas anchas (>720px) para no quitar espacio en móvil
  const kbdHint = nav.querySelector('#js-kbd-hint');
  if (kbdHint && window.innerWidth > 720) kbdHint.style.display = 'inline';

  nav.querySelector('#js-prev-btn')?.addEventListener('click', () => {
    // Volver desde resultados → limpiar para forzar nueva ejecución
    if (state.step === 2) state.lastRunResults = null;
    state.step--;
    render(root, state);
  });
  nav.querySelector('#js-next-btn')?.addEventListener('click', () => {
    if (canGoNext(state)) { state.step++; render(root, state); }
  });
}

function nextStepHint(state) {
  switch (state.step) {
    case 0: return 'Seleccioná al menos un control para continuar';
    case 1: return 'Completá los archivos y columnas requeridas';
    default: return '';
  }
}

function canGoNext(state) {
  switch (state.step) {
    case 0:
      return state.selectedControls.length > 0;

    case 1: {
      // Tabulado: requerido si algún control seleccionado lo necesita
      const anyTabRequired = state.selectedControls.some(id => CONTROL_REGISTRY[id]?.tabRequired !== false);
      if (anyTabRequired && state.tab === null) return false;

      // Todos los archivos adicionales no-opcionales deben estar cargados
      const allFiles = state.selectedControls.every(id => {
        const ctrl = CONTROL_REGISTRY[id];
        if (!ctrl) return false;
        return ctrl.additionalFiles.every(f => f.optional || state.controlFiles[id]?.[f.key] != null);
      });
      if (!allFiles) return false;

      const cfg = state.tabExtraConfig;
      const hasBrutos = state.selectedControls.some(id => BRUTOS_IDS.includes(id));
      if (hasBrutos) {
        if (!cfg.tabSalBaseColumn || !cfg.tabACuFutAumenColumn) return false;
      }
      const hasGsPers = state.selectedControls.some(id => GS_PERS_IDS.includes(id));
      if (hasGsPers) {
        if (!cfg.tabGtosPersonalesColumn || !cfg.tabDtoCocheraColumn) return false;
      }
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

    default: return false;
  }
}

// ── Paso 0: Seleccionar controles ─────────────────────────────────────────────

// Construye la sección colapsable "¿Qué hace cada control?" del paso 1.
function buildHelpSection() {
  const allControls = Object.values(CONTROL_REGISTRY);

  const cards = allControls
    .filter(c => c.help)
    .map(c => {
      const stepsHtml = c.help.how.map((step) =>
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
    <h3 style="margin:0 0 var(--sp-1);">Paso 1 — Controles a ejecutar</h3>
    <p class="text-muted" style="margin:0 0 var(--sp-2);font-size:var(--text-sm);">
      Seleccioná los controles que querés ejecutar. En el siguiente paso se pedirán los archivos necesarios.
    </p>
    ${infoBubble('¿Qué es un control?', `
      <p style="margin:0 0 var(--sp-3);font-weight:var(--fw-semibold);">¿Qué es un control?</p>
      <p style="margin:0 0 var(--sp-3);">
        Cada control es un cruce automático entre el Tabulado y otro archivo del cliente
        (o entre filas del propio Tabulado). El sistema marca las diferencias por empleado
        y devuelve un Excel con el detalle.
      </p>
      <p style="margin:0 0 var(--sp-2);font-weight:var(--fw-semibold);">Ejemplos</p>
      <ul style="margin:0;padding-left:var(--sp-5);line-height:1.6;">
        <li><strong>Brutos:</strong> compara el sueldo del Tabulado con el del reporte de Brutos.</li>
        <li><strong>Rendimiento vs Tabulado:</strong> compara los conceptos del Tabulado con el reporte de Rendimiento por centro de costo.</li>
        <li><strong>Rendimiento vs Asiento:</strong> cruza el Rendimiento contra la Contabilidad Desglosada (no usa Tabulado).</li>
      </ul>
    `)}

    ${buildHelpSection()}

    <div style="display:flex;gap:var(--sp-2);margin-bottom:var(--sp-3);flex-wrap:wrap;">
      <button class="btn btn--secondary btn--sm" id="js-select-all-ctrls">
        ✓ Seleccionar todos
      </button>
      <button class="btn btn--ghost btn--sm" id="js-clear-ctrls">
        ✕ Limpiar selección
      </button>
      <span class="text-muted" style="font-size:var(--text-sm);align-self:center;">
        "Seleccionar todos" elige las variantes de Control de cada grupo (no las de Generar Reporte).
      </span>
    </div>

    <div class="pill-group" id="js-control-pills" style="margin-bottom:var(--sp-3);">
      ${blocksHtml}
    </div>
  `;

  // Botón "Seleccionar todos": selecciona standalones + las variantes "Controlar" de cada grupo
  container.querySelector('#js-select-all-ctrls').addEventListener('click', () => {
    const allControlarIds = Object.values(CONTROL_REGISTRY)
      .filter(c => !c.group || c.group.mode === 'Controlar')
      .map(c => c.id);
    state.selectedControls = [...allControlarIds];
    state.controlFiles = {};
    for (const id of allControlarIds) state.controlFiles[id] = {};
    // Expandir todos los grupos que ahora tienen modos activos
    for (const id of allControlarIds) {
      const gid = CONTROL_REGISTRY[id]?.group?.id;
      if (gid) state.expandedGroups.add(gid);
    }
    renderStepControls(container, state, root);
    renderWizardNav(root, state);
  });

  // Botón "Limpiar selección"
  container.querySelector('#js-clear-ctrls').addEventListener('click', () => {
    state.selectedControls = [];
    state.controlFiles = {};
    state.expandedGroups = new Set();
    renderStepControls(container, state, root);
    renderWizardNav(root, state);
  });

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
}

// ── Paso 1: Cargar todos los archivos ─────────────────────────────────────────

function renderStepFiles(container, state, root) {
  const anyTabRequired = state.selectedControls.some(
    id => CONTROL_REGISTRY[id]?.tabRequired !== false
  );

  const catMeta = state.catalog?.parseMetadata;
  const catSummary = state.catalog
    ? `✅ <strong>${esc(state.catalog.fileName)}</strong> — ${catMeta?.totalRows ?? 0} conceptos cargados`
    : `📂 Sin catálogo cargado — se usará el catálogo estándar (${CATALOGO_SEED.length} conceptos).`;

  container.innerHTML = `
    <h3 style="margin:0 0 var(--sp-1);">Paso 2 — Archivos</h3>
    <p class="text-muted" style="margin:0 0 var(--sp-4);font-size:var(--text-sm);">
      Cargá los archivos necesarios para los controles seleccionados.
    </p>

    ${anyTabRequired ? `
      <details style="margin-bottom:var(--sp-3);" ${state.catalog ? '' : 'open'}>
        <summary style="
          cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);
          color:var(--color-primary);list-style:none;display:flex;align-items:center;
          gap:var(--sp-2);user-select:none;margin-bottom:var(--sp-1);
        ">
          <span>▸</span> Catálogo de Conceptos (opcional)
        </summary>
        <div style="margin-top:var(--sp-2);padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
          <p class="text-sm text-muted" style="margin:0 0 var(--sp-2);">
            El catálogo define qué columnas del Tabulado corresponden a cada concepto. Si no cargás uno, se usa el catálogo estándar.
          </p>
          <div id="js-catalog-status" style="margin-bottom:var(--sp-2);">
            <div class="alert ${state.catalog ? 'alert--success' : 'alert--info'}" style="margin:0;padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">
              ${catSummary}
            </div>
          </div>
          <div id="js-catalog-upload" style="${state.catalog ? 'display:none' : ''}"></div>
          ${state.catalog ? `<button class="btn btn--ghost btn--sm" id="js-catalog-replace">↺ Reemplazar catálogo</button>` : ''}
        </div>
      </details>

      <div id="js-tab-upload"></div>
      <div id="js-tab-analysis"></div>
    ` : ''}

    <div id="js-control-files"></div>
  `;

  // ── Tabulado + catálogo ──────────────────────────────────────────────────────
  if (anyTabRequired) {
    const catalogUploadEl = container.querySelector('#js-catalog-upload');
    const analysisEl      = container.querySelector('#js-tab-analysis');
    const catalogRows     = state.catalog?.rows || CATALOGO_SEED;

    if (catalogUploadEl) {
      initFileUploadStep(catalogUploadEl, {
        clientId:    state.clientId,
        fileType:    'concept_catalog',
        existingData: null,
        onComplete:  async (data) => {
          state.catalog = { rows: data.rows, fileName: data.fileName, parseMetadata: data.parseMetadata };
          await saveClientCatalog(state.clientId, state.catalog);
          renderStepFiles(container, state, root);
        },
      });
    }

    container.querySelector('#js-catalog-replace')?.addEventListener('click', async () => {
      if (!await showConfirm('¿Reemplazar el catálogo guardado? Se perderá el catálogo actual.')) return;
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
          renderStepFiles(container, state, root);
        },
      });
    });

    if (state.tab) {
      renderTabuladoAnalysis(analysisEl, state.tab, catalogRows, state.selectedControls);
    }

    initFileUploadStep(container.querySelector('#js-tab-upload'), {
      clientId:    state.clientId,
      fileType:    'tab_control',
      existingData: state.tab,
      autoDetect:  AUTO_DETECT.tab_control,
      onComplete:  (data) => {
        const prev = state.tab;
        state.tab = data;
        setTabSessionCache(data, state.clientId);
        renderWizardNav(root, state);
        renderTabuladoAnalysis(analysisEl, state.tab, catalogRows, state.selectedControls);
        // Tabulado nuevo (no re-entrante) → re-renderizar el step completo para que el
        // panel "Columnas del Tabulado" (Brutos/GS Pers/NR) recalcule tabHeaders con las
        // columnas ya disponibles. Sin esto, ese panel quedaba armado con tabHeaders=[]
        // (calculado antes de que existiera el Tabulado) y sus selects nunca mostraban
        // ninguna columna para elegir. Guard de identidad: renderAlreadyLoaded llama a
        // onComplete de forma sincrónica al re-mostrar un archivo ya cargado — sin este
        // chequeo, el re-render volvería a dispararlo y entraría en bucle infinito.
        if (prev !== data) {
          renderStepFiles(container, state, root);
        }
      },
    });
  }

  // ── Archivos adicionales por control ────────────────────────────────────────
  const filesArea = container.querySelector('#js-control-files');

  for (const controlId of state.selectedControls) {
    const ctrl = CONTROL_REGISTRY[controlId];
    if (!ctrl) continue;

    for (const fileSpec of ctrl.additionalFiles) {
      const wrapper = document.createElement('div');
      wrapper.style.marginBottom = 'var(--sp-3)';
      wrapper.innerHTML = `
        <h4 style="margin:0 0 var(--sp-2);font-size:var(--text-base);">
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
          const prev = state.controlFiles[controlId][fileSpec.key];
          state.controlFiles[controlId][fileSpec.key] = data;
          renderWizardNav(root, state);
          // CONTA recién cargado → re-renderizar el step para que el editor de
          // rend_vs_asiento muestre los nombres de cuentas/conceptos al lado de cada código.
          // Guard de identidad: renderAlreadyLoaded llama a onComplete de forma sincrónica
          // al re-mostrar un archivo ya cargado. Sin este chequeo, el re-render volvería a
          // inicializar la carga de CONTA y dispararía onComplete otra vez → bucle re-entrante
          // que rompía/ocultaba el panel de mapeo. Solo re-renderizamos si la CONTA es nueva.
          if (controlId === 'rend_vs_asiento' && fileSpec.key === 'conta' && prev !== data) {
            renderStepFiles(container, state, root);
          }
        },
      });
    }

    // Editor de configuración de Rendimiento vs Asiento (visible junto a sus archivos)
    if (controlId === 'rend_vs_asiento') {
      const mapWrapper = document.createElement('div');
      mapWrapper.style.marginBottom = 'var(--sp-3)';
      filesArea.appendChild(mapWrapper);

      // Construir lookups a partir del CONTA si está cargado
      const contaData = state.controlFiles[controlId]?.conta;
      const accountNames = {};
      const conceptNames = {};
      for (const r of (contaData?.parsedRows || [])) {
        const cc = String(r.cuenta_contab || '').trim();
        const cn = String(r.n_cuenta_contable || '').trim();
        if (cc && cn && !accountNames[cc]) accountNames[cc] = cn;
        const co = String(r.id_concepto || '').trim();
        const nl = String(r.nombre_largo || '').trim();
        if (co && nl && !conceptNames[co]) conceptNames[co] = nl;
      }

      renderRendVsAsientoConfigEditor(mapWrapper, {
        config:       state.rvaConfig,
        accountNames,
        conceptNames,
        openByDefault: true,
        onChange:     (newConfig) => { state.rvaConfig = newConfig; },
      });
    }
  }

  // ── Panel de configuración de columnas del Tabulado ─────────────────────────
  const hasBrutos    = state.selectedControls.some(id => BRUTOS_IDS.includes(id));
  const hasGsPers    = state.selectedControls.some(id => GS_PERS_IDS.includes(id));
  const hasNr        = state.selectedControls.some(id => NR_IDS.includes(id));
  const hasRendGrouping = state.selectedControls.some(id => REND_GROUPING_IDS.includes(id));

  if (hasBrutos || hasGsPers || hasNr) {
    renderTabExtraConfig(filesArea, state, root, { hasBrutos, hasGsPers, hasNr });
  }

  if (hasRendGrouping && state.tab?.parsedRows?.length > 0) {
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

  const nombre   = find('nombre');
  const apellido = find('apellido');
  const idCentroTrab = find('id_centro_trab', 'centro_trab');
  const idCategoria  = find('id_categoria', 'categoria');

  const conceptMapping = buildParserMapping(tabHeaders, catalog, TAB_EXTRA_CODIGO_TO_KEY);

  return {
    ...conceptMapping,
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
  panel.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';
  panel.innerHTML = `
    <h4 style="margin:0 0 var(--sp-1);font-size:var(--text-base);">Columnas del Tabulado — ${esc(headerTitle)}</h4>
    ${autoDetected
      ? `<p class="text-sm" style="margin:0 0 var(--sp-2);color:var(--color-match-exact);">🤖 Se detectaron las columnas automáticamente — verificá que sean correctas.</p>`
      : `<p class="text-muted" style="margin:0 0 var(--sp-3);font-size:var(--text-sm);">Indicá qué columna del Tabulado corresponde a cada campo. FECHA_INI y FECHA_FIN se calculan del período.</p>`
    }
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
    sel.addEventListener('change', async () => {
      const k = sel.dataset.tabExtraKey;
      if (sel.value) state.tabExtraConfig[k] = sel.value;
      else delete state.tabExtraConfig[k];
      renderWizardNav(root, state);
      // Guardar inmediatamente para no perder la config si no se ejecuta el control
      if (Object.keys(state.tabExtraConfig).length > 0) {
        await saveFileProfile(state.clientId, 'brutos_tab_config', state.tabExtraConfig).catch(() => {});
      }
    });
  });

  container.appendChild(panel);
}

// ── Paso 2: Configurar período y ejecutar ────────────────────────────────────

function renderStepExecute(container, state, root) {
  // Modo resultados: ya se ejecutó, mostrar inline
  if (state.lastRunResults) {
    renderInlineResults(container, state, root);
    return;
  }

  // Modo pre-ejecución
  const periods  = periodOptions(13);
  const ctrlList = state.selectedControls
    .map(id => CONTROL_REGISTRY[id]?.label || id)
    .join(', ');

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
    <h3 style="margin:0 0 var(--sp-3);">Paso 3 — Período y ejecución</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-3);max-width:680px;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label form-label--required">Período</label>
        <select class="form-select" id="js-period-select">
          ${periods.map(p =>
            `<option value="${esc(p.value)}" ${p.value === state.period ? 'selected' : ''}>${esc(p.label)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Notas (opcional)</label>
        <input type="text" class="form-input" id="js-notes-input"
               value="${esc(state.notes)}"
               placeholder="Observaciones del analista...">
      </div>
    </div>
    <div class="alert alert--info" style="margin-bottom:var(--sp-3);">
      <strong>Cliente:</strong> ${esc(state.client.name)}<br>
      <strong>Controles:</strong> ${esc(ctrlList)}<br>
      <strong>Tabulado:</strong> ${esc(state.tab?.fileName || '—')} (${state.tab?.parseMetadata?.totalRows ?? 0} registros)<br>
      ${filesInfo}
    </div>

    <label style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-3);cursor:pointer;padding:var(--sp-2) var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);max-width:680px;">
      <input type="checkbox" id="js-quick-run" ${state.quickRun ? 'checked' : ''}>
      <div>
        <strong>⚡ Ejecución rápida</strong> — no guarda nada en el historial
        <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Útil para probar mapeos o configuraciones sin que este run aparezca después en el checklist o en la lista de runs.</p>
      </div>
    </label>

    <button class="btn btn--primary btn--lg" id="js-execute-btn">▶ Ejecutar controles</button>
    <div id="js-execute-status" style="margin-top:var(--sp-5);"></div>
  `;

  container.querySelector('#js-period-select').addEventListener('change', e => {
    state.period = e.target.value;
  });
  container.querySelector('#js-notes-input').addEventListener('input', e => {
    state.notes = e.target.value;
  });
  container.querySelector('#js-quick-run').addEventListener('change', e => {
    state.quickRun = e.target.checked;
  });
  container.querySelector('#js-execute-btn').addEventListener('click', () => {
    container.querySelector('#js-execute-btn').disabled = true;
    executeControls(state, container.querySelector('#js-execute-status'), container, root);
  });
}

function renderInlineResults(container, state, root) {
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-3);">
      <div>
        <h3 style="margin:0 0 var(--sp-1);">${esc(state.client.name)} — Controles ${esc(state.period)}</h3>
        <p class="text-muted" style="margin:0;font-size:var(--text-sm);">Ejecutado el ${new Date().toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
      </div>
      <button class="btn btn--ghost btn--sm" id="js-rerun-btn">↺ Ejecutar de nuevo</button>
    </div>

    <div id="js-status-banner" style="margin-bottom:var(--sp-4);"></div>
    <div id="js-inline-results"></div>
  `;

  renderStatusBanner(container.querySelector('#js-status-banner'), state);

  const resultsContainer = container.querySelector('#js-inline-results');

  for (const controlId of state.selectedControls) {
    const ctrl = CONTROL_REGISTRY[controlId];
    if (!ctrl || !state.lastRunResults[controlId]) continue;

    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = 'var(--sp-5)';
    resultsContainer.appendChild(wrapper);
    ctrl.renderResults(state.lastRunResults[controlId], wrapper);
  }

  container.querySelector('#js-rerun-btn').addEventListener('click', () => {
    state.lastRunResults = null;
    state.lastRunId = null;
    state.lastRunIsDefinitive = false;
    renderStepExecute(container, state, root);
    renderWizardNav(root, state);
  });
}

/**
 * Banner de estado del run (Quick / Borrador / Definitivo) con toggle.
 */
function renderStatusBanner(bannerEl, state) {
  if (!bannerEl) return;

  // Modo Quick: no se guardó nada
  if (state.lastRunId == null) {
    bannerEl.innerHTML = `
      <div style="padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);display:flex;align-items:center;gap:var(--sp-3);">
        <span style="font-size:1.4em;">⚡</span>
        <div style="flex:1;">
          <strong>Ejecución rápida</strong> — este run no se guardó.
          <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Los resultados están sólo en pantalla. Si cerrás la página se pierden.</p>
        </div>
      </div>
    `;
    return;
  }

  // Modo guardado: Borrador o Definitivo
  const isDef = state.lastRunIsDefinitive === true;
  const icon  = isDef ? '✅' : '📝';
  const title = isDef ? 'Definitivo' : 'Borrador';
  const desc  = isDef
    ? 'Este run aparece en el checklist mensual.'
    : 'Este run no aparece en el checklist hasta que lo marques como definitivo.';
  const btnLabel = isDef ? '↩ Volver a borrador' : '📌 Marcar como definitivo';
  const borderCol = isDef ? 'var(--color-match-exact, #00a651)' : 'var(--color-border)';
  const bgCol = isDef ? 'rgba(0,166,81,0.06)' : 'var(--color-surface)';

  bannerEl.innerHTML = `
    <div style="padding:var(--sp-3) var(--sp-4);border:1px solid ${borderCol};border-radius:var(--radius-md);background:${bgCol};display:flex;align-items:center;gap:var(--sp-3);">
      <span style="font-size:1.4em;">${icon}</span>
      <div style="flex:1;">
        <strong>${title}</strong>
        <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">${desc}</p>
      </div>
      <button class="btn ${isDef ? 'btn--ghost' : 'btn--primary'} btn--sm" id="js-toggle-definitive">${btnLabel}</button>
    </div>
  `;

  bannerEl.querySelector('#js-toggle-definitive').addEventListener('click', async () => {
    const newValue = !state.lastRunIsDefinitive;
    try {
      await updateControlRun(state.lastRunId, { isDefinitive: newValue });
      state.lastRunIsDefinitive = newValue;
      renderStatusBanner(bannerEl, state);
      showToast(newValue ? '✅ Marcado como definitivo' : '↩ Vuelto a borrador', 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'danger');
    }
  });
}

// ── Ejecución ─────────────────────────────────────────────────────────────────

async function executeControls(state, statusEl, container, root) {
  statusEl.innerHTML = `
    <div class="loading-screen">
      <div class="spinner"></div>
      <p class="text-muted">Ejecutando controles…</p>
    </div>
  `;

  try {
    const quickRun = state.quickRun === true;
    const tab = state.tab;

    // Las preferencias del usuario (mapeos de columnas) se guardan siempre,
    // sean borrador o quick — son configuración que el usuario reusa.
    const needsTabExtra = state.selectedControls.some(id =>
      BRUTOS_IDS.includes(id) || GS_PERS_IDS.includes(id) || NR_IDS.includes(id)
    );
    if (needsTabExtra && Object.keys(state.tabExtraConfig).length > 0) {
      await saveFileProfile(state.clientId, 'brutos_tab_config', state.tabExtraConfig);
    }
    if (state.selectedControls.some(id => REND_GROUPING_IDS.includes(id)) && state.rendVsTabuGrouping) {
      await saveFileProfile(state.clientId, 'rendvstabu_concept_grouping', state.rendVsTabuGrouping);
    }
    if (state.selectedControls.includes('rend_vs_asiento') && state.rvaConfig) {
      await saveFileProfile(state.clientId, 'rva_config', state.rvaConfig);
    }

    // El run en sí se crea sólo si NO es quickRun
    let runId = null;
    if (!quickRun) {
      runId = await createControlRun(
        state.clientId, state.period, state.selectedControls, state.notes
      );
      if (tab) {
        await saveControlRunFile(
          runId, 'tab_control', tab.fileName, tab.parsedRows, tab.parseMetadata, tab.mapping
        );
      }
    }

    // Por cada control: guardar archivos adicionales (si !quickRun) y ejecutar lógica
    const runResults = {};

    for (const controlId of state.selectedControls) {
      const ctrl = CONTROL_REGISTRY[controlId];
      if (!ctrl) continue;

      if (!quickRun) {
        for (const fileSpec of ctrl.additionalFiles) {
          const fileData = state.controlFiles[controlId]?.[fileSpec.key];
          if (fileData) {
            await saveControlRunFile(
              runId, fileSpec.fileType,
              fileData.fileName, fileData.parsedRows, fileData.parseMetadata, fileData.mapping
            );
          }
        }
      }

      const mapping = {
        tab:    { ...(tab?.mapping || {}), ...state.tabExtraConfig },
        period: state.period,
      };
      if ((REND_GROUPING_IDS.includes(controlId) || controlId === 'rend_vs_asiento') && state.rendVsTabuGrouping) {
        mapping.conceptGrouping = state.rendVsTabuGrouping;
      }
      if (controlId === 'rend_vs_asiento' && state.rvaConfig) {
        mapping.rvaConfig = state.rvaConfig;
      }
      for (const fileSpec of ctrl.additionalFiles) {
        const fileData = state.controlFiles[controlId]?.[fileSpec.key];
        if (fileData) {
          mapping[fileSpec.key]         = fileData.mapping || {};
          mapping[`${fileSpec.key}Rows`] = fileData.parsedRows || [];
        }
      }

      const tabRows     = tab?.parsedRows || [];
      const primaryKey  = ctrl.additionalFiles[0]?.key;
      const primaryRows = state.controlFiles[controlId]?.[primaryKey]?.parsedRows || [];

      const results = ctrl.run(primaryRows, tabRows, mapping);
      runResults[controlId] = results;

      if (!quickRun) await saveControlRunResults(runId, controlId, results);
    }

    // 5. Mostrar resultados inline (sin navegar a otra página).
    // Si fue quickRun, lastRunId queda null y el banner indica que no se guardó.
    // Si fue saved, arranca como borrador (isDefinitive=false) y el banner deja promoverlo.
    state.lastRunId            = runId;
    state.lastRunResults       = runResults;
    state.lastRunIsDefinitive  = false;
    renderInlineResults(container, state, root);
    renderWizardNav(root, state);

  } catch (err) {
    console.error('[controlsWizard] Error al ejecutar:', err);
    statusEl.innerHTML = `
      <div class="alert alert--danger" style="margin-bottom:0;">
        ❌ Error al ejecutar los controles: ${esc(err.message)}
      </div>
    `;
    const execBtn = statusEl.parentElement?.querySelector('#js-execute-btn');
    if (execBtn) execBtn.disabled = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function infoBubble(label, contentHtml, { mb = 3 } = {}) {
  return `
    <details style="margin-bottom:var(--sp-${mb});">
      <summary style="
        cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:var(--sp-2);
        padding:var(--sp-1) var(--sp-3);font-size:var(--text-sm);font-weight:var(--fw-semibold);
        color:var(--color-primary);background:var(--color-surface);
        border:1px solid var(--color-border);border-radius:var(--radius-full);
        user-select:none;transition:background var(--transition);
      ">
        <span style="
          display:inline-flex;align-items:center;justify-content:center;
          width:18px;height:18px;border-radius:50%;
          background:var(--color-primary);color:var(--color-white);
          font-size:11px;font-weight:var(--fw-bold);
        ">i</span>
        ${esc(label)}
      </summary>
      <div style="
        margin-top:var(--sp-2);padding:var(--sp-4);
        background:var(--color-surface);
        border:1px solid var(--color-border);border-radius:var(--radius-md);
        box-shadow:var(--shadow-md);font-size:var(--text-sm);
        color:var(--color-text);
      ">
        ${contentHtml}
      </div>
    </details>
  `;
}
