// tabuladoAnalysis.js — Panel "Análisis del Tabulado" (paso 1 del wizard)
//
// Cruza los headers del Tabulado contra el catálogo activo y muestra tres secciones:
//   - Reconocidas: columnas que matchearon con un concepto del catálogo
//   - Huérfanas:   columnas del Tabulado que no están en ningún concepto
//   - Esperadas faltantes: conceptos del catálogo asignados a controles activos que no aparecen

import { matchHeadersToCatalog } from '../parsers/conceptMatcher.js';

/**
 * Renderiza el panel de análisis dentro de `container`.
 *
 * @param {HTMLElement} container
 * @param {object}      tabData          — resultado parseado del Tabulado ({ parsedRows, parseMetadata, ... })
 * @param {Array}       catalogRows      — filas del catálogo activo (seed o custom)
 * @param {string[]}    selectedControls — IDs de controles activos (para calcular "esperadas faltantes")
 */
export function renderTabuladoAnalysis(container, tabData, catalogRows, selectedControls) {
  if (!tabData || !catalogRows?.length) {
    container.innerHTML = '';
    return;
  }

  // Extraer headers del Tabulado
  const headers = tabData.parseMetadata?.headers
    || (tabData.parsedRows?.length ? Object.keys(tabData.parsedRows[0]) : []);

  if (!headers.length) {
    container.innerHTML = '';
    return;
  }

  // Códigos esperados = los que el catálogo asigna a alguno de los controles seleccionados
  const expectedCodes = catalogRows
    .filter(c => c.controles?.some(ctrl => selectedControls.includes(ctrl)))
    .map(c => c.codigo);

  const { recognized, unrecognized, missing } = matchHeadersToCatalog(
    headers, catalogRows, expectedCodes
  );

  const total = headers.length;
  const nRec  = recognized.length;
  const nOrph = unrecognized.length;
  const nMiss = missing.length;

  // Helper para badge de clasificación — usa tokens semánticos que se adaptan a dark mode
  const classBadge = (clas) => {
    const colors = {
      remu:          'background:var(--color-success-bg);color:var(--color-success);',
      no_remu:       'background:var(--color-warning-bg);color:var(--color-warning);',
      aporte:        'background:var(--color-info-bg);color:var(--color-primary);',
      contribucion:  'background:var(--color-match-saved-bg);color:var(--color-match-saved);',
    };
    const style = colors[clas] || 'background:var(--color-bg-subtle);color:var(--color-text);';
    return `<span style="font-size:0.7em;padding:1px 6px;border-radius:9999px;${style}">${esc(clas)}</span>`;
  };

  // Helper para badge de estrategia de match
  const stratBadge = (strategy) => {
    if (strategy === 'exact') return '<span style="color:var(--color-match-exact);font-size:0.75em;font-weight:600;">✓ exacto</span>';
    if (strategy === 'alias') return '<span style="color:var(--color-match-exact);font-size:0.75em;">↺ alias</span>';
    if (strategy === 'contains') return '<span style="color:var(--color-warning);font-size:0.75em;">⊃ parcial</span>';
    if (strategy === 'fuzzy') return '<span style="color:var(--color-warning);font-size:0.75em;">~ fuzzy</span>';
    return '';
  };

  // ── Sección: Reconocidas ────────────────────────────────────────────────────
  const recRows = recognized.map(r => {
    const ctrls = r.concept.controles?.length
      ? r.concept.controles.map(c => `<code style="font-size:0.75em;">${esc(c)}</code>`).join(' ')
      : '<span style="color:var(--color-text-muted);font-size:0.8em;">—</span>';
    return `
      <tr>
        <td style="font-size:var(--text-sm);">${esc(r.header)}</td>
        <td style="font-size:var(--text-sm);font-weight:var(--fw-semibold);">${esc(r.concept.codigo)}</td>
        <td>${classBadge(r.concept.clasificacion)}</td>
        <td>${ctrls}</td>
        <td>${stratBadge(r.strategy)}</td>
      </tr>
    `;
  }).join('');

  const recHtml = `
    <table class="data-table data-table--compact" style="width:100%;">
      <thead>
        <tr>
          <th>Columna en Tabulado</th>
          <th>Código</th>
          <th>Clasificación</th>
          <th>Controles</th>
          <th>Match</th>
        </tr>
      </thead>
      <tbody>${recRows}</tbody>
    </table>
  `;

  // ── Sección: Huérfanas ─────────────────────────────────────────────────────
  const orphRows = unrecognized.map(h => `
    <tr>
      <td style="font-size:var(--text-sm);">${esc(h)}</td>
      <td style="font-size:0.8em;color:var(--color-text-muted);">¿Concepto nuevo? Agregalo al catálogo.</td>
    </tr>
  `).join('');

  const orphHtml = orphRows
    ? `<table class="data-table data-table--compact" style="width:100%;"><tbody>${orphRows}</tbody></table>`
    : '<p class="text-sm text-muted" style="margin:0;">— Todas las columnas tienen un concepto asignado.</p>';

  // ── Sección: Esperadas faltantes ────────────────────────────────────────────
  const missRows = missing.map(m => {
    const ctrls = m.concept?.controles?.map(c => `<code style="font-size:0.75em;">${esc(c)}</code>`).join(' ') || '';
    return `
      <tr>
        <td style="font-size:var(--text-sm);font-weight:var(--fw-semibold);">${esc(m.codigo)}</td>
        <td style="font-size:var(--text-sm);">${esc(m.concept?.descripcion || '—')}</td>
        <td>${m.concept ? classBadge(m.concept.clasificacion) : ''}</td>
        <td>${ctrls}</td>
      </tr>
    `;
  }).join('');

  const missHtml = missRows
    ? `<table class="data-table data-table--compact" style="width:100%;"><thead><tr><th>Código</th><th>Descripción</th><th>Clasificación</th><th>Control</th></tr></thead><tbody>${missRows}</tbody></table>`
    : '<p class="text-sm text-muted" style="margin:0;">— Todos los conceptos esperados están presentes.</p>';

  // ── Render del panel completo ──────────────────────────────────────────────
  // Reconocidas se colapsa por defecto (lo más largo). Huérfanas/faltantes se abren solo si hay algo.
  const summaryCounts = `
    <span style="color:var(--color-match-exact);font-weight:600;">✓ ${nRec}</span>
    <span style="color:var(--color-text-muted);">·</span>
    <span style="color:${nOrph > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)'};font-weight:${nOrph > 0 ? '600' : 'normal'};">⚠ ${nOrph} huérfanas</span>
    <span style="color:var(--color-text-muted);">·</span>
    <span style="color:${nMiss > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'};font-weight:${nMiss > 0 ? '600' : 'normal'};">✗ ${nMiss} faltantes</span>
  `;

  const isAllGood = nOrph === 0 && nMiss === 0;

  container.innerHTML = `
    <details style="margin-bottom:var(--sp-3);">

      <summary style="
        cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);
        color:var(--color-primary);list-style:none;display:flex;align-items:center;
        gap:var(--sp-2);user-select:none;flex-wrap:wrap;
      ">
        <span>▸</span> 📊 Análisis del Tabulado (${total} cols)
        <span style="margin-left:var(--sp-2);display:flex;gap:var(--sp-2);align-items:center;font-size:var(--text-sm);font-weight:400;">
          ${summaryCounts}
        </span>
      </summary>
      <div style="margin-top:var(--sp-2);padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);display:flex;flex-direction:column;gap:var(--sp-3);">

        <details>
          <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);list-style:none;display:flex;gap:var(--sp-2);align-items:center;">
            <span>▸</span> ✅ Reconocidas (${nRec})
          </summary>
          <div style="margin-top:var(--sp-2);overflow-x:auto;">${nRec ? recHtml : '<p class="text-sm text-muted" style="margin:0;">— Ninguna columna reconocida.</p>'}</div>
        </details>

        ${nOrph > 0 ? `
        <details>
          <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);list-style:none;display:flex;gap:var(--sp-2);align-items:center;color:var(--color-warning);">
            <span>▸</span> ⚠ Huérfanas (${nOrph}) <span style="color:var(--color-text-muted);font-weight:400;font-size:0.85em;">— no están en el catálogo</span>
          </summary>
          <div style="margin-top:var(--sp-2);overflow-x:auto;">${orphHtml}</div>
        </details>
        ` : ''}

        ${nMiss > 0 ? `
        <details open>
          <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);list-style:none;display:flex;gap:var(--sp-2);align-items:center;color:var(--color-danger);">
            <span>▾</span> ✗ Esperadas faltantes (${nMiss}) <span style="color:var(--color-text-muted);font-weight:400;font-size:0.85em;">— conceptos del catálogo que faltan en el Tabulado</span>
          </summary>
          <div style="margin-top:var(--sp-2);overflow-x:auto;">${missHtml}</div>
        </details>
        ` : ''}

      </div>
    </details>
  `;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
