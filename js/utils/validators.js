// validators.js — Pequeñas funciones de validación

/** Verifica que el archivo sea un Excel (.xlsx o .xls) */
export function isValidExcelFile(file) {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls');
}

/** Verifica que un valor no esté vacío (null, undefined o string vacío) */
export function isNonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/**
 * Lee un File del navegador y devuelve su contenido como ArrayBuffer.
 * @param {File} file
 * @param {function(number):void} [onProgress] - Se llama con el porcentaje leído (0–100)
 */
export function readFileAsArrayBuffer(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`No se pudo leer el archivo "${file.name}".`));
    if (onProgress) {
      reader.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    reader.readAsArrayBuffer(file);
  });
}
