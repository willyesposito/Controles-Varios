// fileUpload.js — Pantalla de carga de un archivo Excel con mapeo de columnas

import { isValidExcelFile, readFileAsArrayBuffer } from '../utils/validators.js';
import { showToast } from './toast.js';
import { detectHeaders, parseNominaMaestra } from '../parsers/nominaMaestra.js';
import { parseResumenLargo } from '../parsers/resumenLargoExcel.js';
import { parseResumenTabulado } from '../parsers/resumenTabuladoHorizontalExcel.js';
import { parseTabuladoControl } from '../parsers/tabuladoControl.js';
import { parseCatEmpleados } from '../parsers/catEmpleados.js';
import { parseBrutos } from '../parsers/brutosParser.js';
import { parseGsPers } from '../parsers/gsPersParser.js';
import { parseNr }     from '../parsers/nrParser.js';
import { parseRendimiento } from '../parsers/rendimientoParser.js';
import { parseConceptCatalog } from '../parsers/conceptCatalog.js';
import { getFileProfile, saveFileProfile } from '../db.js';

// Campos "estándar" por tipo de archivo.
// Los campos de nombre (apellido/nombre/nombreCompleto) se manejan aparte
// con un selector especial porque pueden venir en 1 o 2 columnas.
const FIELD_DEFS = {
  nomina_maestra: [
    { key: 'legajoColumn',         label: 'Columna de Legajo',                required: true  },
    { key: 'conceptColumnsStartAt', label: 'Primera columna de conceptos',     required: true  },
  ],
  resumen_largo_excel: [
    { key: 'legajoColumnLong',  label: 'Columna de Legajo',             required: true },
    { key: 'conceptCodeColumn', label: 'Columna de Código de concepto',  required: true },
    { key: 'importColumn',      label: 'Columna de Importe',             required: true },
  ],
  resumen_tabulado_horizontal: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',           required: true  },
    { key: 'conceptColumnsStartAt', label: 'Primera columna de conceptos', required: true  },
  ],
  tab_control: [
    { key: 'empleadoColumn',        label: 'Columna de Empleado (ID)',           required: true  },
    { key: 'apellidoNombreColumn',  label: 'Columna de Apellido y Nombre',       required: false },
    { key: 'puestoColumn',          label: 'Columna de Puesto',                  required: false },
    { key: 'idCCColumn',            label: 'Columna de ID Centro de Costo',      required: false },
    { key: 'ccColumn',              label: 'Columna de Centro de Costo',         required: false },
    { key: 'deptoColumn',           label: 'Columna de Departamento/Unidad',     required: false },
    { key: 'cuilColumn',            label: 'Columna de CUIL',                    required: false },
  ],
  cat_empleados: [
    { key: 'idEmpColumn',           label: 'Columna de ID Empleado',             required: true  },
    { key: 'puestoColumn',          label: 'Columna de Puesto',                  required: true  },
    { key: 'idCenColumn',           label: 'Columna de ID Centro de Costo',      required: true  },
    { key: 'centroCostoColumn',     label: 'Columna de Centro de Costo',         required: true  },
    { key: 'departamentoColumn',    label: 'Columna de Departamento',            required: true  },
    { key: 'fBajaColumn',           label: 'Columna de Fecha de Baja (F. BAJA)', required: true  },
    { key: 'fAltaColumn',           label: 'Columna de Fecha de Alta (F. ALTA)', required: false },
    { key: 'apellidoColumn',        label: 'Columna de Apellido',                required: false },
    { key: 'nombreColumn',          label: 'Columna de Nombre',                  required: false },
    { key: 'cuilColumn',            label: 'Columna de CUIL',                    required: false },
    { key: 'idPueColumn',           label: 'Columna de ID Puesto',               required: false },
  ],
  brutos_file: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',                  required: true  },
    { key: 'salBaseColumn',         label: 'Columna de SAL_BASE',                required: false },
    { key: 'aCuFutAumenColumn',     label: 'Columna de A_CTA_FUT_AUMEN',         required: false },
  ],
  gs_pers_file: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',                  required: true  },
    { key: 'gtosPersonalesColumn',  label: 'Columna de GTOS_PERSONALES',         required: false },
    { key: 'dtoCocheraColumn',      label: 'Columna de DTO_COCHERA',             required: false },
  ],
  nr_file: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',                  required: true  },
    { key: 'reinHomeOficeColumn',   label: 'Columna de REIN_HOME_OFICE',         required: false },
    { key: 'indemPreavisoColumn',   label: 'Columna de INDEM_PREAVISO',          required: false },
    { key: 'sacPreavisoColumn',     label: 'Columna de SAC_PREAVISO',            required: false },
    { key: 'indemAntDespColumn',    label: 'Columna de INDEM_ANT_DESP',          required: false },
    { key: 'indemAntFalleColumn',   label: 'Columna de INDEM_ANT_FALLE',         required: false },
    { key: 'indemIntegColumn',      label: 'Columna de INDEM_INTEG',             required: false },
    { key: 'sacIndemIntegColumn',   label: 'Columna de SAC_INDEM_INTEG',         required: false },
    { key: 'indmMaternidadColumn',  label: 'Columna de INDM_MATERNIDAD',         required: false },
    { key: 'vacNoGozadasColumn',    label: 'Columna de VAC_NO_GOZADAS',          required: false },
    { key: 'vacNoGozSacColumn',     label: 'Columna de VAC_NO_GOZ_SAC',          required: false },
    { key: 'gratVacColumn',         label: 'Columna de GRAT_VAC',                required: false },
    { key: 'graVacnogSacColumn',    label: 'Columna de GRA_VACNOG_SAC',          required: false },
    { key: 'indemFuerMayColumn',    label: 'Columna de INDEM_FUER_MAY',          required: false },
    { key: 'indemEmbarazoColumn',   label: 'Columna de INDEM_EMBARAZO',          required: false },
    { key: 'gratExtraordColumn',    label: 'Columna de GRAT_EXTRAORD',           required: false },
    { key: 'asigPasColumn',         label: 'Columna de ASIG_PAS',               required: false },
    { key: 'reintGuardColumn',      label: 'Columna de REINT_GUARD',             required: false },
    { key: 'incrementoStColumn',    label: 'Columna de INCREMENTO_ST',           required: false },
  ],
  rend_file: [
    { key: 'ccCodeColumn',     label: 'Columna de código CC (1ª col., sin encabezado)', required: false },
    { key: 'ccNameColumn',     label: 'Columna de Centro de Costo',                     required: true  },
    { key: 'precioColumn',     label: 'Columna de PRECIO',                               required: true  },
    { key: 'estimuloColumn',   label: 'Columna de ASIG. ESTÍMULO',                      required: false },
    { key: 'retirosColumn',    label: 'Columna de RETIROS',                              required: false },
    { key: 'cargasColumn',     label: 'Columna de CARGAS SOCIALES',                     required: false },
    { key: 'provMesColumn',    label: 'Columna de PROVISIÓN MES',                       required: false },
    { key: 'provCcssColumn',   label: 'Columna de PROV. CCSS MES',                      required: false },
    { key: 'costoTotalColumn', label: 'Columna de COSTO TOTAL',                         required: false },
  ],
  // Catálogo de conceptos: formato fijo, no requiere mapping de columnas
  concept_catalog: [],
};

// Tipos que soportan mapeo de nombre (horizontal: una fila por empleado)
const TIPOS_CON_NOMBRE = ['nomina_maestra', 'resumen_tabulado_horizontal'];

/**
 * Inicializa el paso de carga de archivo dentro de un contenedor.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 *   clientId     {number}         - ID del cliente (para buscar/guardar perfil)
 *   fileType     {string}         - Tipo de archivo
 *   existingData {object|null}    - Datos ya cargados en esta sesión (null = primera vez)
 *   onComplete   {function(data)} - Se llama cuando el archivo está parseado y listo
 */
export async function initFileUploadStep(container, { clientId, fileType, existingData, onComplete, autoDetect }) {
  if (existingData) {
    renderAlreadyLoaded(container, existingData,
      () => initFileUploadStep(container, { clientId, fileType, existingData: null, onComplete }),
      onComplete
    );
    return;
  }

  renderDropZone(container, fileType, async (file) => {
    renderLoadingProgress(container, 'reading', 0);

    let arrayBuffer;
    try {
      arrayBuffer = await readFileAsArrayBuffer(file, (pct) => {
        updateReadingProgress(container, pct);
      });
    } catch (err) {
      renderError(container, err.message,
        () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete, autoDetect }));
      return;
    }

    renderLoadingProgress(container, 'parsing');

    let headers, preview;
    try {
      ({ headers, preview } = detectHeaders(arrayBuffer));
    } catch (err) {
      renderError(container, `No se pudo leer el Excel: ${err.message}`,
        () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete, autoDetect }));
      return;
    }

    // Catálogo de conceptos: formato fijo → no necesita mapping, parsear directo
    if (fileType === 'concept_catalog') {
      renderLoadingProgress(container, 'parsing');
      try {
        const result = parseFile(arrayBuffer, fileType, null);
        const data = { ...result, mapping: {}, fileName: file.name, fileType };
        renderAlreadyLoaded(
          container,
          data,
          () => initFileUploadStep(container, { clientId, fileType, existingData: null, onComplete }),
          onComplete
        );
      } catch (err) {
        renderError(container, `Error al procesar el catálogo: ${err.message}`,
          () => initFileUploadStep(container, { clientId, fileType, existingData: null, onComplete }));
      }
      return;
    }

    const savedProfile = await getFileProfile(clientId, fileType);
    let savedMapping  = savedProfile?.mapping || null;
    let autoDetected  = false;

    // Auto-detección: si no hay perfil guardado y se pasó una función de detección, intentar
    if (!savedMapping && autoDetect) {
      const detected = autoDetect(headers);
      if (detected) {
        savedMapping  = detected;
        autoDetected  = true;
      }
    }

    renderMappingForm(container, {
      headers, preview, fileType, savedMapping, autoDetected,
      fileName: file.name,
      onConfirm: async (mapping) => {
        renderLoadingProgress(container, 'parsing');
        try {
          const result = parseFile(arrayBuffer, fileType, mapping);
          await saveFileProfile(clientId, fileType, mapping);

          const data = { ...result, mapping, fileName: file.name, fileType };

          // ✅ FIX: mostrar estado de éxito (antes se quedaba el spinner para siempre)
          renderAlreadyLoaded(
            container,
            data,
            () => initFileUploadStep(container, { clientId, fileType, existingData: null, onComplete }),
            onComplete
          );

        } catch (err) {
          renderError(container, `Error al procesar: ${err.message}`,
            () => renderMappingForm(container, {
              headers, preview, fileType, savedMapping, fileName: file.name,
              onConfirm: async (m) => {
                renderLoadingProgress(container, 'parsing');
                try {
                  const result = parseFile(arrayBuffer, fileType, m);
                  await saveFileProfile(clientId, fileType, m);
                  const data = { ...result, mapping: m, fileName: file.name, fileType };
                  renderAlreadyLoaded(container, data,
                    () => initFileUploadStep(container, { clientId, fileType, existingData: null, onComplete }),
                    onComplete);
                } catch (e2) {
                  renderError(container, e2.message,
                    () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete }));
                }
              },
              onCancel: () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete }),
            })
          );
        }
      },
      onCancel: () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete, autoDetect }),
    });
  });
}

// ── Renders internos ──────────────────────────────────────────────────────────

function renderDropZone(container, fileType, onFile) {
  container.innerHTML = `
    <div class="file-drop" id="js-drop-zone">
      <div class="file-drop__icon">📂</div>
      <div class="file-drop__text">
        <strong>${fileTypeLabel(fileType)}</strong> — arrastrá o hacé clic para elegir (.xlsx)
      </div>
      <input type="file" accept=".xlsx,.xls" style="display:none" id="js-file-input">
    </div>
  `;

  const dropZone  = container.querySelector('#js-drop-zone');
  const fileInput = container.querySelector('#js-file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file, onFile, container, fileType);
  });

  // Drop zone interno: stopPropagation para no duplicar con el handler del container
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.add('file-drop--dragover');
  });
  dropZone.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    dropZone.classList.remove('file-drop--dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove('file-drop--dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, onFile, container, fileType);
  });

  // Expandir el área de drop al contenedor completo (captura drops fuera del ícono)
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('file-drop--dragover');
  });
  container.addEventListener('dragleave', (e) => {
    if (!container.contains(e.relatedTarget)) dropZone.classList.remove('file-drop--dragover');
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('file-drop--dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, onFile, container, fileType);
  });
}

function handleFile(file, onFile, container, fileType) {
  if (!isValidExcelFile(file)) {
    renderError(container,
      `"${file.name}" no es un Excel (.xlsx). Elegí un archivo Excel.`,
      () => renderDropZone(container, fileType, onFile));
    return;
  }
  onFile(file);
}

/**
 * Muestra la pantalla de carga con barra de progreso.
 * phase = 'reading'  → barra real con porcentaje
 * phase = 'parsing'  → barra indeterminada animada
 */
function renderLoadingProgress(container, phase, pct = 0) {
  const label = phase === 'reading' ? `Leyendo archivo… ${pct}%` : 'Procesando…';
  const indet = phase === 'parsing';
  container.innerHTML = `
    <div class="loading-screen">
      <div class="spinner"></div>
      <p class="text-muted" id="js-progress-label">${label}</p>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill ${indet ? 'progress-bar-fill--indeterminate' : ''}"
             id="js-progress-fill"
             style="width:${indet ? '40' : pct}%"></div>
      </div>
    </div>
  `;
}

/** Actualiza el label y el ancho de la barra sin re-renderizar todo el DOM */
function updateReadingProgress(container, pct) {
  const label = container.querySelector('#js-progress-label');
  const fill  = container.querySelector('#js-progress-fill');
  if (label) label.textContent = `Leyendo archivo… ${pct}%`;
  if (fill)  fill.style.width  = `${pct}%`;
}

function renderError(container, msg, onRetry) {
  container.innerHTML = `
    <div class="alert alert--danger" style="margin-bottom:var(--sp-4);">⚠️ ${escHtml(msg)}</div>
    <button class="btn btn--secondary" id="js-retry-btn">← Volver a intentar</button>
  `;
  container.querySelector('#js-retry-btn').addEventListener('click', onRetry);
}

function renderAlreadyLoaded(container, existingData, onReplace, onComplete) {
  const { fileName, parseMetadata, fileType } = existingData;
  const warns = parseMetadata?.warnings?.length
    ? `<span class="badge badge--warning" style="margin-left:var(--sp-2);">${parseMetadata.warnings.length} aviso(s)</span>` : '';

  let metaLine;
  if (fileType === 'cat_empleados') {
    const fil = parseMetadata?.filtradas ?? 0;
    metaLine = `${parseMetadata?.activos ?? 0} activos de ${parseMetadata?.total ?? 0} filas`
      + (fil > 0 ? ` &nbsp;·&nbsp; <span class="badge badge--warning">${fil} sumatorias excluidas</span>` : '');
  } else if (fileType === 'concept_catalog') {
    metaLine = `${parseMetadata?.totalRows ?? 0} conceptos`
      + (parseMetadata?.remu         ? ` · ${parseMetadata.remu} remu`               : '')
      + (parseMetadata?.noRemu       ? ` · ${parseMetadata.noRemu} no_remu`          : '')
      + (parseMetadata?.aporte       ? ` · ${parseMetadata.aporte} aportes`          : '')
      + (parseMetadata?.contribucion ? ` · ${parseMetadata.contribucion} contribuciones` : '');
  } else if (fileType === 'tab_control' || fileType === 'brutos_file' || fileType === 'gs_pers_file' || fileType === 'nr_file' || fileType === 'rend_file') {
    metaLine = `${parseMetadata?.totalRows ?? 0} registros`;
  } else {
    metaLine = `${parseMetadata?.uniqueLegajos ?? 0} legajos · ${parseMetadata?.detectedConcepts?.length ?? 0} conceptos`;
  }

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) var(--sp-3);border:1px solid var(--color-match-exact);background:var(--color-match-exact-bg);border-radius:var(--radius-md);font-size:var(--text-sm);">
      <span style="color:var(--color-match-exact);font-weight:600;">✓</span>
      <strong style="flex-shrink:0;">${escHtml(fileName)}</strong>
      <span style="color:var(--color-text-muted);flex:1;">${metaLine}${warns}</span>
      <button class="btn btn--ghost btn--sm" id="js-replace-btn" style="flex-shrink:0;">↺ Cambiar</button>
    </div>
  `;
  // El archivo ya está confirmado — avisamos al wizard sin esperar click adicional
  onComplete(existingData);
  container.querySelector('#js-replace-btn').addEventListener('click', onReplace);
}

function renderMappingForm(container, { headers, preview, fileType, savedMapping, autoDetected, fileName, onConfirm, onCancel }) {
  const fields   = FIELD_DEFS[fileType] || [];
  const conNombre = TIPOS_CON_NOMBRE.includes(fileType);

  // Detectar el modo de nombre guardado previamente
  let savedNombreMode = 'junto'; // 'junto' = una columna, 'separado' = dos columnas
  if (savedMapping?.apellidoColumn || savedMapping?.nombreColumn) savedNombreMode = 'separado';
  if (savedMapping?.nombreApellidoColumn) savedNombreMode = 'junto';

  // Preview de las primeras filas
  const previewHtml = preview?.length ? `
    <details style="margin-bottom:var(--sp-3);">
      <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-primary);margin-bottom:var(--sp-2);">
        ▸ Vista previa del archivo (${preview.slice(0, 3).length} filas)
      </summary>
      <div style="overflow-x:auto;">
        <table class="data-table data-table--compact">
          <thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${(preview || []).slice(0, 3).map(row =>
              `<tr>${headers.map((_, i) => `<td>${escHtml(fmtPreviewCell(row[i]))}</td>`).join('')}</tr>`
            ).join('')}
          </tbody>
        </table>
      </div>
    </details>
  ` : '';

  // Construir opciones del selector de columnas
  const opts = (selected = '') => ['', ...headers]
    .map(h => `<option value="${escHtml(h)}" ${h === selected ? 'selected' : ''}>${escHtml(h) || '— Seleccioná —'}</option>`)
    .join('');

  // matchLevel: calidad del match pre-completado para un campo.
  //   'exact'  — auto-detectado en este archivo (nombre de columna idéntico encontrado)
  //   'saved'  — viene de sesión anterior (perfil guardado, no auto-detectado)
  //   'warn'   — había un mapping anterior pero el campo quedó vacío
  //   'none'   — sin mapping previo
  const matchLevel = (val) => {
    if (autoDetected && val)              return 'exact';
    if (!autoDetected && savedMapping && val) return 'saved';
    if (savedMapping && !val)             return 'warn';
    return 'none';
  };

  const fieldStyle = (level) => {
    if (level === 'exact') return 'border-color:var(--color-match-exact);background:var(--color-match-exact-bg);';
    if (level === 'saved') return 'border-color:var(--color-match-saved);background:var(--color-match-saved-bg);';
    if (level === 'warn')  return 'border-color:var(--color-warning);background:var(--color-warning-bg);';
    return '';
  };

  const fieldBadge = (level) => {
    if (level === 'exact') return ' <span style="color:var(--color-match-exact);font-size:0.75em;font-weight:600;">✓ auto</span>';
    if (level === 'saved') return ' <span style="color:var(--color-match-saved);font-size:0.75em;">↺ sesión anterior</span>';
    if (level === 'warn')  return ' <span style="color:var(--color-warning);font-size:0.8em;">⚠ sin asignar</span>';
    return '';
  };

  // Campos estándar en grid horizontal
  const stdFieldsHtml = fields.length === 0 ? '' : `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--sp-2) var(--sp-3);margin-bottom:var(--sp-3);">
      ${fields.map(f => {
        const val   = savedMapping?.[f.key] || '';
        const level = matchLevel(val);
        const style = fieldStyle(level);
        return `
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label ${f.required ? 'form-label--required' : ''}">${f.label}${fieldBadge(level)}</label>
            <select class="form-select" name="${f.key}"${style ? ` style="${style}"` : ''}>
              ${opts(val)}
            </select>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Sección especial de nombre (solo para formatos tabulados)
  const valNAC = savedMapping?.nombreApellidoColumn || '';
  const valAp  = savedMapping?.apellidoColumn || '';
  const valNm  = savedMapping?.nombreColumn || '';
  const lvlNAC = matchLevel(valNAC);
  const lvlAp  = matchLevel(valAp);
  const lvlNm  = matchLevel(valNm);

  const nombreHtml = conNombre ? `
    <div class="form-group" style="margin-top:var(--sp-2);">
      <label class="form-label">Apellido y nombre del empleado</label>
      <p class="form-hint" style="margin-bottom:var(--sp-3);">
        ¿Cómo aparecen en el archivo?
      </p>
      <div style="display:flex;flex-direction:column;gap:var(--sp-2);margin-bottom:var(--sp-4);">
        <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
          <input type="radio" name="nombre_mode" value="junto"
            ${savedNombreMode === 'junto' ? 'checked' : ''}>
          <span>En <strong>una sola columna</strong> (ej: "García Juan" o "GARCIA, JUAN")</span>
        </label>
        <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
          <input type="radio" name="nombre_mode" value="separado"
            ${savedNombreMode === 'separado' ? 'checked' : ''}>
          <span>En <strong>columnas separadas</strong> (una para apellido, otra para nombre)</span>
        </label>
        <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
          <input type="radio" name="nombre_mode" value="ninguno">
          <span>No hay columna de nombre en este archivo</span>
        </label>
      </div>

      <!-- Modo: una sola columna -->
      <div id="js-nombre-junto" style="display:${savedNombreMode === 'junto' ? 'block' : 'none'};">
        <label class="form-label">Columna con el nombre completo${fieldBadge(lvlNAC)}</label>
        <select class="form-select" name="nombreApellidoColumn" style="max-width:360px;${fieldStyle(lvlNAC)}">
          ${opts(valNAC)}
        </select>
      </div>

      <!-- Modo: columnas separadas -->
      <div id="js-nombre-separado" style="display:${savedNombreMode === 'separado' ? 'block' : 'none'};">
        <div class="form-group">
          <label class="form-label">Columna de Apellido${fieldBadge(lvlAp)}</label>
          <select class="form-select" name="apellidoColumn" style="max-width:360px;${fieldStyle(lvlAp)}">
            ${opts(valAp)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Columna de Nombre${fieldBadge(lvlNm)}</label>
          <select class="form-select" name="nombreColumn" style="max-width:360px;${fieldStyle(lvlNm)}">
            ${opts(valNm)}
          </select>
        </div>
      </div>
    </div>
  ` : '';

  const hasSaved = savedMapping && Object.keys(savedMapping).length > 0;
  const savedMsg = autoDetected
    ? '🤖 Se detectaron las columnas automáticamente — verificá que sean correctas.'
    : '💾 Se pre-completó con el perfil guardado — verificá que siga siendo correcto.';

  container.innerHTML = `
    <div class="alert alert--info" style="margin-bottom:var(--sp-2);padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">
      📄 <strong>${escHtml(fileName)}</strong> — ${headers.length} columnas detectadas.
      ${hasSaved ? savedMsg : 'Primera vez: indicá qué columna corresponde a cada campo.'}
    </div>
    ${previewHtml}
    <form id="js-mapping-form">
      ${stdFieldsHtml}
      ${nombreHtml}
      <div style="display:flex;gap:var(--sp-2);margin-top:var(--sp-3);">
        <button type="submit" class="btn btn--primary btn--sm">✓ Confirmar y procesar</button>
        <button type="button" class="btn btn--ghost btn--sm" id="js-cancel-mapping">← Cancelar</button>
      </div>
    </form>
  `;

  // Toggle para mostrar/ocultar las secciones de nombre
  if (conNombre) {
    const junto    = container.querySelector('#js-nombre-junto');
    const separado = container.querySelector('#js-nombre-separado');
    container.querySelectorAll('[name="nombre_mode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        junto.style.display    = radio.value === 'junto'    ? 'block' : 'none';
        separado.style.display = radio.value === 'separado' ? 'block' : 'none';
      });
    });
  }

  // Submit del formulario de mapeo
  container.querySelector('#js-mapping-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form    = e.target;
    const mapping = {};

    // Campos estándar
    fields.forEach(f => {
      const val = form.querySelector(`[name="${f.key}"]`)?.value;
      if (val) mapping[f.key] = val;
    });

    // Campos de nombre (según el modo elegido)
    if (conNombre) {
      const mode = form.querySelector('[name="nombre_mode"]:checked')?.value;
      if (mode === 'junto') {
        const val = form.querySelector('[name="nombreApellidoColumn"]')?.value;
        if (val) mapping.nombreApellidoColumn = val;
      } else if (mode === 'separado') {
        const ap = form.querySelector('[name="apellidoColumn"]')?.value;
        const nm = form.querySelector('[name="nombreColumn"]')?.value;
        if (ap) mapping.apellidoColumn = ap;
        if (nm) mapping.nombreColumn   = nm;
      }
    }

    // Validar campos requeridos
    const faltantes = fields.filter(f => f.required && !mapping[f.key]).map(f => f.label);
    if (faltantes.length) {
      showToast(`Falta completar: ${faltantes.join(', ')}`, 'warning');
      return;
    }

    onConfirm(mapping);
  });

  container.querySelector('#js-cancel-mapping')
    .addEventListener('click', onCancel);

  // Esc para cancelar el formulario de mapeo
  container.querySelector('#js-mapping-form').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onCancel();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFile(arrayBuffer, fileType, mapping) {
  switch (fileType) {
    case 'nomina_maestra':              return parseNominaMaestra(arrayBuffer, mapping);
    case 'resumen_largo_excel':         return parseResumenLargo(arrayBuffer, mapping);
    case 'resumen_tabulado_horizontal': return parseResumenTabulado(arrayBuffer, mapping);
    case 'tab_control':                 return parseTabuladoControl(arrayBuffer, mapping);
    case 'cat_empleados':               return parseCatEmpleados(arrayBuffer, mapping);
    case 'brutos_file':                 return parseBrutos(arrayBuffer, mapping);
    case 'gs_pers_file':                return parseGsPers(arrayBuffer, mapping);
    case 'nr_file':                     return parseNr(arrayBuffer, mapping);
    case 'rend_file':                   return parseRendimiento(arrayBuffer, mapping);
    case 'concept_catalog':             return parseConceptCatalog(arrayBuffer);
    default: throw new Error(`Tipo de archivo desconocido: "${fileType}".`);
  }
}

function fileTypeLabel(fileType) {
  return {
    nomina_maestra:              'Nómina Maestra',
    resumen_largo_excel:         'Resumen Largo Excel',
    resumen_tabulado_horizontal: 'Resumen Tabulado Horizontal',
    tab_control:                 'Tabulado (Controles)',
    cat_empleados:               'Catálogo de Empleados',
    brutos_file:                 'Reporte de Brutos',
    gs_pers_file:                'Reporte de GS Pers (Gastos Personales y Cochera)',
    nr_file:                     'Reporte de NR (No Remunerativos)',
    rend_file:                   'Reporte de Rendimiento',
    concept_catalog:             'Catálogo de Conceptos',
  }[fileType] || fileType;
}

// ── Helpers de calidad de match para selects de columnas ─────────────────────
// matchLevel: devuelve 'exact' | 'saved' | 'warn' | 'none'
//   exact  — valor pre-completado por auto-detección en esta carga
//   saved  — valor pre-completado desde el perfil de sesión anterior
//   warn   — había mapping pero el campo quedó vacío
//   none   — sin dato previo
export function matchLevel(val, { autoDetected, hasSavedMapping }) {
  if (autoDetected && val)              return 'exact';
  if (!autoDetected && hasSavedMapping && val) return 'saved';
  if (hasSavedMapping && !val)          return 'warn';
  return 'none';
}

export function matchSelectStyle(level) {
  if (level === 'exact') return 'border-color:var(--color-match-exact);background:var(--color-match-exact-bg);';
  if (level === 'saved') return 'border-color:var(--color-match-saved);background:var(--color-match-saved-bg);';
  if (level === 'warn')  return 'border-color:#EAB308;background:rgba(234,179,8,0.08);';
  return '';
}

export function matchBadge(level) {
  if (level === 'exact') return ' <span style="color:var(--color-match-exact);font-size:0.75em;font-weight:600;">✓ auto</span>';
  if (level === 'saved') return ' <span style="color:var(--color-match-saved);font-size:0.75em;">↺ sesión anterior</span>';
  if (level === 'warn')  return ' <span style="color:#B45309;font-size:0.8em;">⚠ sin asignar</span>';
  return '';
}

function fmtPreviewCell(val) {
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${val.getFullYear()}`;
  }
  return String(val ?? '');
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
