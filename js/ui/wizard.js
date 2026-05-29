// wizard.js — El director de orquesta del proceso de validación
//
// El wizard lleva al usuario por 4 pasos:
//   Paso 1: Cargar la Nómina Maestra
//   Paso 2: Cargar el Resumen
//   Paso 3: Elegir período, agrupadores y umbrales
//   Paso 4: Revisar y ejecutar el cruce
//
// El estado de la sesión (qué archivos se cargaron, qué agrupadores se eligieron)
// se guarda en memoria mientras se usa el wizard. Al ejecutar, todo se persiste
// en la base de datos local.

import { getClient, getGroupers, getGrouperConcepts, createSession, saveSessionFile, saveSessionResults, getConfig, setConfig } from '../db.js';
import { initFileUploadStep } from './fileUpload.js';
import { runMatching } from '../matching.js';
import { computeInsights } from '../insights.js';
import { currentPeriod, periodOptions, periodToLabel } from '../utils/dates.js';
import { showToast } from './toast.js';

const STEPS = [
  { label: 'Nómina Maestra',     short: '1' },
  { label: 'Resumen',            short: '2' },
  { label: 'Configuración',      short: '3' },
  { label: 'Ejecutar',           short: '4' },
];

const RESUMEN_TYPES = [
  { value: 'resumen_largo_excel',         label: 'Resumen Largo Excel (una fila por concepto)' },
  { value: 'resumen_tabulado_horizontal', label: 'Resumen Tabulado Horizontal (mismo formato que nómina)' },
];

export async function renderWizard(root, clientId) {
  const client = await getClient(clientId);
  if (!client) {
    root.innerHTML = `<div class="page-content"><div class="alert alert--danger">Cliente no encontrado.</div></div>`;
    return;
  }

  // Estado de la sesión en memoria
  const state = {
    step: 0,
    clientId: Number(clientId),
    client,
    nomina: null,         // { parsedRows, parseMetadata, mapping, fileName, fileType }
    resumen: null,        // { parsedRows, parseMetadata, mapping, fileName, fileType }
    resumenType: 'resumen_largo_excel',
    period: currentPeriod(),
    groupers: [],         // todos los agrupadores del cliente
    selectedGrouperIds: [],
    thresholds: { absoluteAmount: 1, percentage: 0.1, flagMissing: true },
  };

  // Cargar agrupadores del cliente
  state.groupers = await getGroupers(clientId);

  // Recordar la última selección de agrupadores del usuario
  const lastSelected = await getConfig(`lastGrouperIds_${clientId}`);
  if (lastSelected?.length) {
    state.selectedGrouperIds = lastSelected.filter(id => state.groupers.some(g => g.id === id));
  } else {
    state.selectedGrouperIds = state.groupers.map(g => g.id);
  }

  root.innerHTML = `
    <div class="page-content">
      <div class="page-actions" style="margin-bottom:var(--sp-6);">
        <div class="page-actions__title">
          <button class="btn btn--ghost btn--sm" id="js-wizard-back">← Clientes</button>
          <h2>Nueva validación — <span style="color:var(--color-wordmark);font-weight:300;">${escHtml(client.name)}</span></h2>
        </div>
      </div>
      <div id="js-wizard-steps-indicator"></div>
      <div class="card">
        <div class="card__body" id="js-wizard-step-content" style="min-height:300px;"></div>
        <div class="card__footer" id="js-wizard-nav"></div>
      </div>
    </div>
  `;

  root.querySelector('#js-wizard-back').addEventListener('click', () => { window.location.hash = '#/'; });

  // Funciones de navegación
  const goToStep = (n) => {
    state.step = n;
    renderCurrentStep();
  };
  const goNext = () => goToStep(state.step + 1);
  const goPrev = () => goToStep(state.step - 1);

  function renderStepsIndicator() {
    const container = root.querySelector('#js-wizard-steps-indicator');
    container.innerHTML = `
      <div class="wizard-steps" style="margin-bottom:var(--sp-6);">
        ${STEPS.map((s, i) => {
          let cls = '';
          if (i < state.step)  cls = 'wizard-step--done';
          if (i === state.step) cls = 'wizard-step--active';
          return `
            ${i > 0 ? `<div class="wizard-step__connector ${i <= state.step ? 'wizard-step__connector--done' : ''}"></div>` : ''}
            <div class="wizard-step ${cls}">
              <div class="wizard-step__bubble">${i < state.step ? '✓' : s.short}</div>
              <span class="wizard-step__label">${s.label}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderNav(canGoNext, nextLabel = 'Siguiente →') {
    const nav = root.querySelector('#js-wizard-nav');
    nav.innerHTML = `
      ${state.step > 0 ? `<button class="btn btn--ghost" id="js-prev-btn">← Anterior</button>` : '<span></span>'}
      ${canGoNext ? `<button class="btn btn--primary" id="js-next-btn">${nextLabel}</button>` : ''}
    `;
    nav.querySelector('#js-prev-btn')?.addEventListener('click', goPrev);
    nav.querySelector('#js-next-btn')?.addEventListener('click', goNext);
  }

  function renderCurrentStep() {
    renderStepsIndicator();
    const content = root.querySelector('#js-wizard-step-content');
    const nav = root.querySelector('#js-wizard-nav');
    nav.innerHTML = '';

    switch (state.step) {
      case 0: renderStepNomina(content);     break;
      case 1: renderStepResumen(content);    break;
      case 2: renderStepConfig(content);     break;
      case 3: renderStepExecute(content);    break;
    }
  }

  // ── Paso 0: Nómina Maestra ─────────────────────────────────────────────
  function renderStepNomina(content) {
    content.innerHTML = `
      <h3 style="margin-bottom:var(--sp-4);">Paso 1: Nómina Maestra</h3>
      <p class="text-muted" style="margin-bottom:var(--sp-5);">
        Cargá el archivo Excel exportado de Meta4 que contiene la nómina completa del período.
      </p>
      <div id="js-upload-container"></div>
    `;
    initFileUploadStep(
      content.querySelector('#js-upload-container'),
      {
        clientId: state.clientId,
        fileType: 'nomina_maestra',
        existingData: state.nomina,
        onComplete: (data) => {
          state.nomina = data;
          renderNav(true);
        },
      }
    );
    renderNav(!!state.nomina);
  }

  // ── Paso 1: Resumen ────────────────────────────────────────────────────
  function renderStepResumen(content) {
    content.innerHTML = `
      <h3 style="margin-bottom:var(--sp-4);">Paso 2: Archivo de Resumen</h3>
      <p class="text-muted" style="margin-bottom:var(--sp-3);">
        ¿Qué formato tiene el archivo resumen?
      </p>
      <div class="form-group" style="margin-bottom:var(--sp-5);">
        <select class="form-select" id="js-resumen-type" style="max-width:420px;">
          ${RESUMEN_TYPES.map(t =>
            `<option value="${t.value}" ${t.value === state.resumenType ? 'selected' : ''}>${t.label}</option>`
          ).join('')}
        </select>
      </div>
      <div id="js-upload-container-res"></div>
    `;

    const typeSelect = content.querySelector('#js-resumen-type');
    typeSelect.addEventListener('change', (e) => {
      state.resumenType = e.target.value;
      // Si cambia el tipo, limpiamos el resumen cargado para que vuelva a mapear
      if (state.resumen?.fileType !== state.resumenType) state.resumen = null;
      initFileUploadStep(
        content.querySelector('#js-upload-container-res'),
        { clientId: state.clientId, fileType: state.resumenType, existingData: state.resumen, onComplete: onResumenComplete }
      );
    });

    const onResumenComplete = (data) => {
      state.resumen = data;
      renderNav(true);
    };

    initFileUploadStep(
      content.querySelector('#js-upload-container-res'),
      { clientId: state.clientId, fileType: state.resumenType, existingData: state.resumen, onComplete: onResumenComplete }
    );
    renderNav(!!state.resumen);
  }

  // ── Paso 2: Período, agrupadores y umbrales ────────────────────────────
  function renderStepConfig(content) {
    const periods = periodOptions(13);
    const noGroupers = state.groupers.length === 0;

    content.innerHTML = `
      <h3 style="margin-bottom:var(--sp-6);">Paso 3: Configuración</h3>

      <div class="form-group">
        <label class="form-label form-label--required">Período</label>
        <select class="form-select" id="js-period-select" style="max-width:240px;">
          ${periods.map(p => `<option value="${p.value}" ${p.value === state.period ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </div>

      <div class="form-group" style="margin-top:var(--sp-5);">
        <label class="form-label">Agrupadores a validar</label>
        ${noGroupers
          ? `<div class="alert alert--warning">
              ⚠️ Este cliente no tiene agrupadores configurados.
              <a href="#/client/${clientId}/groupers">Configurar ahora</a>
            </div>`
          : `<p class="form-hint" style="margin-bottom:var(--sp-3);">
              Hacé clic en los agrupadores que querés incluir en este cruce.
              Los seleccionados quedan en celeste.
            </p>
            <div class="pill-group" id="js-grouper-pills">
              ${state.groupers.map(g => `
                <button class="pill ${state.selectedGrouperIds.includes(g.id) ? 'pill--active' : ''}"
                  data-grouper-id="${g.id}">${escHtml(g.name)}</button>
              `).join('')}
            </div>`
        }
      </div>

      <div class="form-group" style="margin-top:var(--sp-5);">
        <label class="form-label">Umbrales de diferencia</label>
        <p class="form-hint" style="margin-bottom:var(--sp-3);">
          Una fila se marca como "con diferencia" si supera <em>cualquiera</em> de estos umbrales.
        </p>
        <div style="display:grid;grid-template-columns:auto auto;gap:var(--sp-3) var(--sp-6);align-items:center;max-width:400px;">
          <label class="text-sm">Diferencia en pesos mayor a</label>
          <div style="display:flex;align-items:center;gap:var(--sp-2);">
            <input type="number" class="form-input" id="js-threshold-abs" min="0" step="1"
              value="${state.thresholds.absoluteAmount}" style="width:100px;"> <span class="text-sm">$</span>
          </div>
          <label class="text-sm">Diferencia porcentual mayor a</label>
          <div style="display:flex;align-items:center;gap:var(--sp-2);">
            <input type="number" class="form-input" id="js-threshold-pct" min="0" step="0.01"
              value="${state.thresholds.percentage}" style="width:100px;"> <span class="text-sm">%</span>
          </div>
          <label class="text-sm">Marcar legajos que faltan</label>
          <input type="checkbox" id="js-flag-missing" ${state.thresholds.flagMissing ? 'checked' : ''}>
        </div>
      </div>
    `;

    // Toggle de agrupadores (pills clickeables)
    content.querySelectorAll('[data-grouper-id]').forEach(pill => {
      pill.addEventListener('click', () => {
        const id = Number(pill.dataset.grouperId);
        const idx = state.selectedGrouperIds.indexOf(id);
        if (idx >= 0) state.selectedGrouperIds.splice(idx, 1);
        else          state.selectedGrouperIds.push(id);
        pill.classList.toggle('pill--active', state.selectedGrouperIds.includes(id));
      });
    });

    // Guardar período y umbrales al cambiar
    content.querySelector('#js-period-select').addEventListener('change', (e) => { state.period = e.target.value; });
    content.querySelector('#js-threshold-abs').addEventListener('change', (e) => { state.thresholds.absoluteAmount = parseFloat(e.target.value) || 1; });
    content.querySelector('#js-threshold-pct').addEventListener('change', (e) => { state.thresholds.percentage    = parseFloat(e.target.value) || 0.1; });
    content.querySelector('#js-flag-missing').addEventListener('change',  (e) => { state.thresholds.flagMissing    = e.target.checked; });

    renderNav(!noGroupers || state.groupers.length === 0, 'Ver resumen →');
  }

  // ── Paso 3: Resumen final + botón Ejecutar ─────────────────────────────
  function renderStepExecute(content) {
    const selectedNames = state.groupers
      .filter(g => state.selectedGrouperIds.includes(g.id))
      .map(g => g.name);

    content.innerHTML = `
      <h3 style="margin-bottom:var(--sp-5);">Paso 4: Listo para ejecutar</h3>
      <div style="display:grid;gap:var(--sp-3);max-width:560px;">
        <div class="alert alert--info">
          📅 <strong>Período:</strong> ${periodToLabel(state.period)}
        </div>
        <div class="alert alert--info">
          📄 <strong>Nómina:</strong> ${escHtml(state.nomina?.fileName || '—')}
          (${state.nomina?.parseMetadata?.uniqueLegajos ?? 0} legajos)
        </div>
        <div class="alert alert--info">
          📄 <strong>Resumen:</strong> ${escHtml(state.resumen?.fileName || '—')}
          (${state.resumen?.parseMetadata?.uniqueLegajos ?? 0} legajos)
        </div>
        <div class="alert alert--info">
          🗂️ <strong>Agrupadores:</strong>
          ${selectedNames.length ? selectedNames.map(n => `<span class="badge badge--primary">${escHtml(n)}</span>`).join(' ') : '<em>Ninguno seleccionado</em>'}
        </div>
      </div>
      <div style="margin-top:var(--sp-8);" id="js-execute-area">
        <button class="btn btn--primary btn--lg" id="js-execute-btn">
          ▶ Ejecutar cruce
        </button>
      </div>
    `;

    root.querySelector('#js-wizard-nav').innerHTML = `
      <button class="btn btn--ghost" id="js-prev-btn">← Anterior</button>
    `;
    root.querySelector('#js-prev-btn').addEventListener('click', goPrev);

    content.querySelector('#js-execute-btn').addEventListener('click', () => executeMatching());
  }

  // ── Ejecución del cruce ────────────────────────────────────────────────
  async function executeMatching() {
    const execArea = root.querySelector('#js-execute-area');
    if (!execArea) return;

    if (!state.nomina?.parsedRows?.length) { showToast('Cargá la Nómina Maestra antes de ejecutar.', 'warning'); return; }
    if (!state.resumen?.parsedRows?.length) { showToast('Cargá el Resumen antes de ejecutar.', 'warning'); return; }
    if (!state.selectedGrouperIds.length) { showToast('Seleccioná al menos un agrupador.', 'warning'); return; }

    execArea.innerHTML = `
      <div class="loading-screen">
        <div class="spinner"></div>
        <p class="text-muted">Ejecutando cruce...</p>
      </div>
    `;
    root.querySelector('#js-wizard-nav').innerHTML = '';

    try {
      // 1. Construir el mapa grouperId → [códigos de concepto]
      const grouperConceptsMap = {};
      const selectedGroupers   = state.groupers.filter(g => state.selectedGrouperIds.includes(g.id));

      for (const g of selectedGroupers) {
        const concepts = await getGrouperConcepts(g.id);
        grouperConceptsMap[g.id] = concepts.map(c => c.conceptCode);
      }

      // 2. Cruce
      const resultsPorGrupo = runMatching(
        state.nomina.parsedRows,
        state.resumen.parsedRows,
        grouperConceptsMap,
        state.thresholds
      );

      // 3. Insights
      const insights = computeInsights(
        resultsPorGrupo,
        selectedGroupers,
        state.nomina.parsedRows,
        state.resumen.parsedRows
      );

      // 4. Guardar sesión en la base de datos
      const sessionId = await createSession({
        clientId:           state.clientId,
        period:             state.period,
        liquidationType:    'mensual',
        status:             'completed',
        isDefinitive:       false,
        selectedGrouperIds: state.selectedGrouperIds,
        thresholds:         state.thresholds,
      });

      await saveSessionFile(sessionId, 'nomina_maestra', state.nomina.fileName,
        state.nomina.parsedRows, state.nomina.parseMetadata);
      await saveSessionFile(sessionId, state.resumenType, state.resumen.fileName,
        state.resumen.parsedRows, state.resumen.parseMetadata);

      await saveSessionResults(sessionId, {
        byGrouper:        insights.byGrouper,
        missingInResumen: insights.missingInResumen,
        missingInNomina:  insights.missingInNomina,
        topDifferences:   insights.topDifferences,
        resultsPorGrupo,
        grouperDefs:      selectedGroupers,
      });

      // Guardar la selección de agrupadores para la próxima vez
      await setConfig(`lastGrouperIds_${state.clientId}`, state.selectedGrouperIds);

      // 5. Navegar a la pantalla de resultados
      window.location.hash = `#/results/${sessionId}`;

    } catch (err) {
      console.error('[wizard] Error en ejecución:', err);
      execArea.innerHTML = `
        <div class="alert alert--danger" style="margin-bottom:var(--sp-4);">
          ❌ ${escHtml(err.message)}
        </div>
        <button class="btn btn--secondary" id="js-retry-exec">← Volver al resumen</button>
      `;
      execArea.querySelector('#js-retry-exec').addEventListener('click', () => goToStep(3));
    }
  }

  // Arrancar el wizard en el paso 0
  renderCurrentStep();
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
