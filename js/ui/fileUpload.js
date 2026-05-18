// fileUpload.js — Pantalla de carga de un archivo Excel con mapeo de columnas
//
// Un "mapeo" es decirle a la app: "la columna que se llama 'Nro Legajo'
// en este Excel es el campo 'legajo' que la app necesita".
// La primera vez hay que hacerlo a mano; después se guarda automáticamente.

import { isValidExcelFile, readFileAsArrayBuffer } from '../utils/validators.js';
import { detectHeaders, parseNominaMaestra } from '../parsers/nominaMaestra.js';
import { parseResumenLargo } from '../parsers/resumenLargoExcel.js';
import { parseResumenTabulado } from '../parsers/resumenTabuladoHorizontalExcel.js';
import { getFileProfile, saveFileProfile } from '../db.js';

// Campos requeridos por tipo de archivo (para el formulario de mapeo)
const FIELD_DEFS = {
  nomina_maestra: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',                 required: true  },
    { key: 'apellidoColumn',         label: 'Columna de Apellido',               required: false },
    { key: 'nombreColumn',           label: 'Columna de Nombre',                 required: false },
    { key: 'conceptColumnsStartAt',  label: 'Primera columna de conceptos',      required: true  },
  ],
  resumen_largo_excel: [
    { key: 'legajoColumnLong',   label: 'Columna de Legajo',            required: true },
    { key: 'conceptCodeColumn',  label: 'Columna de Código de concepto', required: true },
    { key: 'importColumn',       label: 'Columna de Importe',            required: true },
  ],
  resumen_tabulado_horizontal: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',           required: true  },
    { key: 'apellidoColumn',         label: 'Columna de Apellido',         required: false },
    { key: 'nombreColumn',           label: 'Columna de Nombre',           required: false },
    { key: 'conceptColumnsStartAt',  label: 'Primera columna de conceptos', required: true  },
  ],
};

/**
 * Inicializa el paso de carga de archivo.
 *
 * @param {HTMLElement} container  - El div donde se renderiza este paso
 * @param {object}      opts
 * @param {number}      opts.clientId  - ID del cliente (para buscar/guardar el perfil)
 * @param {string}      opts.fileType  - Tipo de archivo ('nomina_maestra', etc.)
 * @param {object|null} opts.existingData - Si ya se cargó antes en esta sesión, mostrarlo
 * @param {function}    opts.onComplete   - Se llama con los datos parseados cuando el usuario confirma
 */
export async function initFileUploadStep(container, { clientId, fileType, existingData, onComplete }) {
  // Si ya hay datos cargados, mostrar resumen con opción de reemplazar
  if (existingData) {
    renderAlreadyLoaded(container, existingData, () => {
      initFileUploadStep(container, { clientId, fileType, existingData: null, onComplete });
    }, onComplete);
    return;
  }

  renderDropZone(container, fileType, async (file) => {
    // El usuario eligió un archivo — comenzamos el proceso
    renderLoading(container, 'Leyendo archivo...');

    let arrayBuffer;
    try {
      arrayBuffer = await readFileAsArrayBuffer(file);
    } catch (err) {
      renderError(container, err.message, () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete }));
      return;
    }

    let headers, preview;
    try {
      ({ headers, preview } = detectHeaders(arrayBuffer));
    } catch (err) {
      renderError(container, `No se pudo leer el Excel: ${err.message}`, () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete }));
      return;
    }

    // Buscamos si ya hay un perfil guardado para este cliente + tipo de archivo
    const savedProfile = await getFileProfile(clientId, fileType);
    const savedMapping = savedProfile?.mapping || null;

    renderMappingForm(container, {
      headers,
      preview,
      fileType,
      savedMapping,
      fileName: file.name,
      onConfirm: async (mapping) => {
        renderLoading(container, 'Procesando archivo...');
        try {
          const result = parseFile(arrayBuffer, fileType, mapping);
          // Guardamos el perfil para no tener que mapear de nuevo
          await saveFileProfile(clientId, fileType, mapping);
          onComplete({ ...result, mapping, fileName: file.name, fileType });
        } catch (err) {
          renderError(container, err.message, () =>
            renderMappingForm(container, { headers, preview, fileType, savedMapping: mapping, fileName: file.name, onConfirm: async (m) => {
              renderLoading(container, 'Procesando archivo...');
              try {
                const result = parseFile(arrayBuffer, fileType, m);
                await saveFileProfile(clientId, fileType, m);
                onComplete({ ...result, mapping: m, fileName: file.name, fileType });
              } catch (e2) {
                renderError(container, e2.message, () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete }));
              }
            }})
          );
        }
      },
      onCancel: () => initFileUploadStep(container, { clientId, fileType, existingData, onComplete }),
    });
  });
}

// ── Renders internos ──────────────────────────────────────────────────────────

function renderDropZone(container, fileType, onFile) {
  const label = fileTypeLabel(fileType);
  container.innerHTML = `
    <div class="file-drop" id="js-drop-zone">
      <div class="file-drop__icon">📂</div>
      <div class="file-drop__text">
        <strong>Arrastrá el Excel acá</strong> o hacé clic para elegir<br>
        <small>${label} (.xlsx)</small>
      </div>
      <input type="file" accept=".xlsx,.xls" style="display:none" id="js-file-input">
    </div>
    <p class="text-sm text-muted" style="margin-top:var(--sp-3);text-align:center;">
      Solo se abre en tu navegador. No se envía a ningún servidor.
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
    renderError(container, `El archivo "${file.name}" no es un Excel (.xlsx). Elegí un archivo Excel.`,
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
    <div class="alert alert--danger" style="margin-bottom:var(--sp-4);">
      ⚠️ ${msg}
    </div>
    <button class="btn btn--secondary" id="js-retry-btn">← Volver a intentar</button>
  `;
  container.querySelector('#js-retry-btn').addEventListener('click', onRetry);
}

function renderAlreadyLoaded(container, existingData, onReplace, onComplete) {
  const { fileName, parseMetadata } = existingData;
  container.innerHTML = `
    <div class="alert alert--info" style="margin-bottom:var(--sp-4);">
      ✅ <strong>${escHtml(fileName)}</strong> ya está cargado:
      ${parseMetadata.uniqueLegajos} legajos · ${parseMetadata.detectedConcepts.length} conceptos
      ${parseMetadata.warnings.length ? `· <span class="text-warning">${parseMetadata.warnings.length} aviso(s)</span>` : ''}
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
  const fields = FIELD_DEFS[fileType] || [];
  const options = ['', ...headers].map(h => `<option value="${escHtml(h)}">${escHtml(h) || '— Seleccioná —'}</option>`).join('');

  const fieldRows = fields.map(f => {
    const currentVal = savedMapping?.[f.key] || '';
    const opts = ['', ...headers].map(h =>
      `<option value="${escHtml(h)}" ${h === currentVal ? 'selected' : ''}>${escHtml(h) || '— Seleccioná —'}</option>`
    ).join('');
    return `
      <div class="form-group">
        <label class="form-label ${f.required ? 'form-label--required' : ''}">${f.label}</label>
        <select class="form-select" name="${f.key}">${opts}</select>
        ${!f.required ? '<p class="form-hint">Opcional</p>' : ''}
      </div>
    `;
  }).join('');

  // Preview de las primeras filas para ayudar a identificar las columnas
  const previewHtml = preview.length ? `
    <div style="margin-bottom:var(--sp-5);overflow-x:auto;">
      <p class="text-sm text-muted" style="margin-bottom:var(--sp-2);">
        Vista previa — primeras filas del archivo:
      </p>
      <table class="data-table data-table--compact">
        <thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${preview.slice(0,3).map(row =>
            `<tr>${headers.map((_, i) => `<td>${escHtml(String(row[i] ?? ''))}</td>`).join('')}</tr>`
          ).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  const hasSaved = savedMapping && Object.keys(savedMapping).length > 0;

  container.innerHTML = `
    <div class="alert alert--info" style="margin-bottom:var(--sp-4);">
      📄 <strong>${escHtml(fileName)}</strong>
      — Se detectaron <strong>${headers.length}</strong> columnas.
      ${hasSaved ? '💾 Se pre-completó con el perfil guardado.' : 'Es la primera vez: indicá qué columna es qué campo.'}
    </div>
    ${previewHtml}
    <form id="js-mapping-form">
      ${fieldRows}
      <div style="display:flex;gap:var(--sp-3);margin-top:var(--sp-4);">
        <button type="submit" class="btn btn--primary">✓ Confirmar y procesar</button>
        <button type="button" class="btn btn--ghost" id="js-cancel-mapping">← Cancelar</button>
      </div>
    </form>
  `;

  container.querySelector('#js-mapping-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const mapping = {};
    fields.forEach(f => {
      const val = form.querySelector(`[name="${f.key}"]`).value;
      if (val) mapping[f.key] = val;
    });
    // Validar campos requeridos
    const missing = fields.filter(f => f.required && !mapping[f.key]).map(f => f.label);
    if (missing.length) {
      alert(`Falta completar: ${missing.join(', ')}`);
      return;
    }
    onConfirm(mapping);
  });
  container.querySelector('#js-cancel-mapping').addEventListener('click', onCancel);
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
