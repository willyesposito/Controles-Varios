// fileUpload.js — Pantalla de carga de un archivo Excel con mapeo de columnas

import { isValidExcelFile, readFileAsArrayBuffer } from '../utils/validators.js';
import { detectHeaders, parseNominaMaestra } from '../parsers/nominaMaestra.js';
import { parseResumenLargo } from '../parsers/resumenLargoExcel.js';
import { parseResumenTabulado } from '../parsers/resumenTabuladoHorizontalExcel.js';
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
export async function initFileUploadStep(container, { clientId, fileType, existingData, onComplete }) {
  if (existingData) {
    renderAlreadyLoaded(container, existingData,
      () => initFileUploadStep(container, { clientId, fileType, existingData: null, onComplete }),
      onComplete
    );
    return;
  }

  renderDropZone(container, fileType, async (file) => {
    renderLoading(container, 'Leyendo archivo…');

    let arrayBuffer;
    try {
      arrayBuffer = await readFileAsArrayBuffer(file);
    } catch (err) {
      renderError(container, err.message,
        () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete }));
      return;
    }

    let headers, preview;
    try {
      ({ headers, preview } = detectHeaders(arrayBuffer));
    } catch (err) {
      renderError(container, `No se pudo leer el Excel: ${err.message}`,
        () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete }));
      return;
    }

    const savedProfile = await getFileProfile(clientId, fileType);
    const savedMapping  = savedProfile?.mapping || null;

    renderMappingForm(container, {
      headers, preview, fileType, savedMapping,
      fileName: file.name,
      onConfirm: async (mapping) => {
        renderLoading(container, 'Procesando archivo…');
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

          // Avisarle al wizard que el archivo está listo
          onComplete(data);

        } catch (err) {
          renderError(container, `Error al procesar: ${err.message}`,
            () => renderMappingForm(container, {
              headers, preview, fileType, savedMapping, fileName: file.name,
              onConfirm: async (m) => {
                renderLoading(container, 'Procesando archivo…');
                try {
                  const result = parseFile(arrayBuffer, fileType, m);
                  await saveFileProfile(clientId, fileType, m);
                  const data = { ...result, mapping: m, fileName: file.name, fileType };
                  renderAlreadyLoaded(container, data,
                    () => initFileUploadStep(container, { clientId, fileType, existingData: null, onComplete }),
                    onComplete);
                  onComplete(data);
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
      onCancel: () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete }),
    });
  });
}

// ── Renders internos ──────────────────────────────────────────────────────────

function renderDropZone(container, fileType, onFile) {
  container.innerHTML = `
    <div class="file-drop" id="js-drop-zone">
      <div class="file-drop__icon">📂</div>
      <div class="file-drop__text">
        <strong>Arrastrá el Excel acá</strong> o hacé clic para elegir<br>
        <small>${fileTypeLabel(fileType)} (.xlsx)</small>
      </div>
      <input type="file" accept=".xlsx,.xls" style="display:none" id="js-file-input">
    </div>
    <p class="text-sm text-muted" style="margin-top:var(--sp-3);text-align:center;">
      Los datos se procesan en tu navegador — no se envían a ningún servidor.
    </p>
  `;

  const dropZone  = container.querySelector('#js-drop-zone');
  const fileInput = container.querySelector('#js-file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file, onFile, container, fileType);
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('file-drop--dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('file-drop--dragover'));
  dropZone.addEventListener('drop', (e) => {
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

function renderLoading(container, msg) {
  container.innerHTML = `
    <div class="loading-screen">
      <div class="spinner"></div>
      <p class="text-muted">${msg}</p>
    </div>
  `;
}

function renderError(container, msg, onRetry) {
  container.innerHTML = `
    <div class="alert alert--danger" style="margin-bottom:var(--sp-4);">⚠️ ${escHtml(msg)}</div>
    <button class="btn btn--secondary" id="js-retry-btn">← Volver a intentar</button>
  `;
  container.querySelector('#js-retry-btn').addEventListener('click', onRetry);
}

function renderAlreadyLoaded(container, existingData, onReplace, onComplete) {
  const { fileName, parseMetadata } = existingData;
  const warns = parseMetadata?.warnings?.length
    ? `<span class="badge badge--warning" style="margin-left:var(--sp-2);">${parseMetadata.warnings.length} aviso(s)</span>` : '';

  container.innerHTML = `
    <div class="alert alert--success" style="margin-bottom:var(--sp-4);">
      ✅ <strong>${escHtml(fileName)}</strong> — procesado correctamente
      <br>
      <span class="text-sm">
        ${parseMetadata?.uniqueLegajos ?? 0} legajos ·
        ${parseMetadata?.detectedConcepts?.length ?? 0} conceptos
        ${warns}
      </span>
    </div>
    <div style="display:flex;gap:var(--sp-3);">
      <button class="btn btn--primary" id="js-keep-btn">✓ Usar este archivo</button>
      <button class="btn btn--ghost" id="js-replace-btn">↺ Cargar otro</button>
    </div>
  `;
  container.querySelector('#js-keep-btn').addEventListener('click', () => onComplete(existingData));
  container.querySelector('#js-replace-btn').addEventListener('click', onReplace);
}

function renderMappingForm(container, { headers, preview, fileType, savedMapping, fileName, onConfirm, onCancel }) {
  const fields   = FIELD_DEFS[fileType] || [];
  const conNombre = TIPOS_CON_NOMBRE.includes(fileType);

  // Detectar el modo de nombre guardado previamente
  let savedNombreMode = 'junto'; // 'junto' = una columna, 'separado' = dos columnas
  if (savedMapping?.apellidoColumn || savedMapping?.nombreColumn) savedNombreMode = 'separado';
  if (savedMapping?.nombreApellidoColumn) savedNombreMode = 'junto';

  // Preview de las primeras filas
  const previewHtml = preview?.length ? `
    <div style="margin-bottom:var(--sp-5);overflow-x:auto;">
      <p class="text-sm text-muted" style="margin-bottom:var(--sp-2);">
        Vista previa — primeras filas del archivo (para que puedas identificar las columnas):
      </p>
      <table class="data-table data-table--compact">
        <thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${(preview || []).slice(0, 3).map(row =>
            `<tr>${headers.map((_, i) => `<td>${escHtml(String(row[i] ?? ''))}</td>`).join('')}</tr>`
          ).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  // Construir opciones del selector de columnas
  const opts = (selected = '') => ['', ...headers]
    .map(h => `<option value="${escHtml(h)}" ${h === selected ? 'selected' : ''}>${escHtml(h) || '— Seleccioná —'}</option>`)
    .join('');

  // Campos estándar (legajo, conceptos, importe, etc.)
  const stdFieldsHtml = fields.map(f => `
    <div class="form-group">
      <label class="form-label ${f.required ? 'form-label--required' : ''}">${f.label}</label>
      <select class="form-select" name="${f.key}" style="max-width:360px;">
        ${opts(savedMapping?.[f.key] || '')}
      </select>
    </div>
  `).join('');

  // Sección especial de nombre (solo para formatos tabulados)
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
        <label class="form-label">Columna con el nombre completo</label>
        <select class="form-select" name="nombreApellidoColumn" style="max-width:360px;">
          ${opts(savedMapping?.nombreApellidoColumn || '')}
        </select>
      </div>

      <!-- Modo: columnas separadas -->
      <div id="js-nombre-separado" style="display:${savedNombreMode === 'separado' ? 'block' : 'none'};">
        <div class="form-group">
          <label class="form-label">Columna de Apellido</label>
          <select class="form-select" name="apellidoColumn" style="max-width:360px;">
            ${opts(savedMapping?.apellidoColumn || '')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Columna de Nombre</label>
          <select class="form-select" name="nombreColumn" style="max-width:360px;">
            ${opts(savedMapping?.nombreColumn || '')}
          </select>
        </div>
      </div>
    </div>
  ` : '';

  const hasSaved = savedMapping && Object.keys(savedMapping).length > 0;

  container.innerHTML = `
    <div class="alert alert--info" style="margin-bottom:var(--sp-4);">
      📄 <strong>${escHtml(fileName)}</strong> — ${headers.length} columnas detectadas.
      ${hasSaved
        ? '💾 Se pre-completó con el perfil guardado — verificá que siga siendo correcto.'
        : 'Primera vez: indicá qué columna corresponde a cada campo.'}
    </div>
    ${previewHtml}
    <form id="js-mapping-form">
      ${stdFieldsHtml}
      ${nombreHtml}
      <div style="display:flex;gap:var(--sp-3);margin-top:var(--sp-5);">
        <button type="submit" class="btn btn--primary">✓ Confirmar y procesar</button>
        <button type="button" class="btn btn--ghost" id="js-cancel-mapping">← Cancelar</button>
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
      alert(`Falta completar: ${faltantes.join(', ')}`);
      return;
    }

    onConfirm(mapping);
  });

  container.querySelector('#js-cancel-mapping')
    .addEventListener('click', onCancel);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFile(arrayBuffer, fileType, mapping) {
  switch (fileType) {
    case 'nomina_maestra':              return parseNominaMaestra(arrayBuffer, mapping);
    case 'resumen_largo_excel':         return parseResumenLargo(arrayBuffer, mapping);
    case 'resumen_tabulado_horizontal': return parseResumenTabulado(arrayBuffer, mapping);
    default: throw new Error(`Tipo de archivo desconocido: "${fileType}".`);
  }
}

function fileTypeLabel(fileType) {
  return {
    nomina_maestra:              'Nómina Maestra',
    resumen_largo_excel:         'Resumen Largo Excel',
    resumen_tabulado_horizontal: 'Resumen Tabulado Horizontal',
  }[fileType] || fileType;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
