# ARCHITECTURE — Controles Nómina

> **Última actualización:** 18 de mayo de 2026
> Documento técnico vivo. Actualizar cada vez que se cambie un schema, un módulo principal o un flujo importante.

---

## 1. Visión técnica de alto nivel

Aplicación 100% client-side. Sin servidor, sin build, sin transpilación.

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Chrome/Edge/Firefox)            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                       UI (HTML + JS)                  │  │
│  │  Wizard · File Upload · Groupers · Results · Sessions │  │
│  └─────────────┬─────────────────────────────────┬───────┘  │
│                │                                 │          │
│  ┌─────────────▼──────────┐    ┌────────────────▼────────┐  │
│  │  Parsers / Matching /  │    │  IndexedDB (Dexie.js)   │  │
│  │  Insights / Export     │    │  Clientes · Agrupadores │  │
│  │  (todo en JS local)    │    │  Sesiones · Archivos    │  │
│  └────────────────────────┘    └─────────────────────────┘  │
│                                                             │
│  Librerías externas (CDN, solo en carga inicial):           │
│  · SheetJS (xlsx) · Dexie.js · pdf.js (v2+)                 │
└─────────────────────────────────────────────────────────────┘
```

**No hay backend.** No hay tracking. No se envían datos a ningún lado. Las CDNs solo se contactan al cargar la página para servir las librerías.

---

## 2. Modelo de datos (IndexedDB vía Dexie)

### 2.1 Stores (tablas)

```js
db.version(1).stores({
  clients:        '++id, name, createdAt, updatedAt',
  groupers:       '++id, clientId, name, createdAt, updatedAt',
  // grouperConcepts: relación N a N entre groupers y conceptos
  grouperConcepts:'++id, grouperId, conceptCode, [grouperId+conceptCode]',
  fileProfiles:   '++id, clientId, fileType, [clientId+fileType]',
  sessions:       '++id, clientId, period, status, isDefinitive, createdAt, [clientId+period]',
  // sessionFiles: archivos cargados en cada sesión, guardados como arrays JSON
  sessionFiles:   '++id, sessionId, fileType',
  sessionResults: '++id, sessionId',
  appConfig:      'key', // configuración general (último cliente usado, defaults de umbral, etc.)
});
```

### 2.2 Schemas detallados

#### `clients`
```ts
{
  id: number;            // auto
  name: string;          // ej: "Cliente ACME SA" (genérico al exportar, ver PRD 4)
  notes?: string;        // notas internas opcionales
  createdAt: ISOString;
  updatedAt: ISOString;
}
```

#### `groupers`
```ts
{
  id: number;
  clientId: number;      // FK -> clients.id
  name: string;          // ej: "Remunerativos"
  description?: string;
  color?: string;        // hex para pill (opcional, default celeste H&A)
  createdAt: ISOString;
  updatedAt: ISOString;
}
```

#### `grouperConcepts`
```ts
{
  id: number;
  grouperId: number;     // FK -> groupers.id
  conceptCode: string;   // siempre string, aunque el código original sea numérico
  conceptLabel?: string; // descripción opcional para mostrar
}
```

> **Nota:** un mismo `conceptCode` puede aparecer en varios `groupers` distintos. El índice compuesto `[grouperId+conceptCode]` es para uniqueness *dentro* de un grouper, no global.

#### `fileProfiles`
Guarda el mapeo de columnas para no repetirlo cada mes.

```ts
{
  id: number;
  clientId: number;      // FK -> clients.id
  fileType: 'nomina_maestra' | 'resumen_largo_excel' | 'resumen_tabulado_horizontal';
  mapping: {
    // para 'nomina_maestra' y 'resumen_tabulado_horizontal':
    legajoColumn?: string;       // nombre de columna o índice
    apellidoColumn?: string;
    nombreColumn?: string;
    conceptColumnsStartAt?: string; // a partir de qué columna son conceptos

    // para 'resumen_largo_excel':
    legajoColumnLong?: string;
    conceptCodeColumn?: string;
    importColumn?: string;
  };
  notes?: string;
  createdAt: ISOString;
  updatedAt: ISOString;
}
```

#### `sessions`
```ts
{
  id: number;
  clientId: number;
  period: string;                // 'YYYY-MM' (ej: '2026-05')
  liquidationType: 'mensual';    // v1 solo mensual, v2 ampliar
  status: 'draft' | 'completed';
  isDefinitive: boolean;         // si está marcada como definitiva del mes
  selectedGrouperIds: number[];  // FK -> groupers.id que se usaron
  thresholds: {
    absoluteAmount: number;      // default 1
    percentage: number;          // default 0.1
    flagMissing: boolean;        // default true
  };
  createdAt: ISOString;
  updatedAt: ISOString;
  createdBy?: string;            // nombre del usuario (de un campo en appConfig)
}
```

> **Constraint de negocio:** debe haber máximo **una** sesión con `isDefinitive: true` por `(clientId, period)`. Esto se enforce a nivel de aplicación (no de DB), antes de cada UPDATE.

#### `sessionFiles`
```ts
{
  id: number;
  sessionId: number;
  fileType: 'nomina_maestra' | 'resumen_largo_excel' | 'resumen_tabulado_horizontal';
  originalFileName: string;
  // los datos parseados se guardan ya normalizados como array de objetos
  parsedRows: Array<{ legajo: string; [conceptCode: string]: any }>;
  // metadata del parsing
  parseMetadata: {
    totalRows: number;
    uniqueLegajos: number;
    detectedConcepts: string[];
    parsedAt: ISOString;
    warnings: string[];
  };
}
```

#### `sessionResults`
Resultado completo del cruce, cacheado para no recalcular al ver una sesión histórica.

```ts
{
  id: number;
  sessionId: number;
  computedAt: ISOString;
  byGrouper: Array<{
    grouperId: number;
    grouperName: string;
    totalNomina: number;
    totalResumen: number;
    diffAbsolute: number;
    diffPercentage: number;
    rowsWithDiff: number;
    rowsTotal: number;
  }>;
  missingInResumen: string[];    // legajos
  missingInNomina: string[];
  topDifferences: Array<{
    legajo: string;
    apellido?: string;
    nombre?: string;
    grouperId: number;
    diffAbsolute: number;
    diffPercentage: number;
  }>;
  monthOverMonth?: {
    previousSessionId: number | null;
    byGrouper: Array<{
      grouperId: number;
      currentTotal: number;
      previousTotal: number;
      variation: number;
      variationPct: number;
    }>;
    altas: string[];             // legajos nuevos este mes
    bajas: string[];             // legajos que ya no están
  };
}
```

#### `appConfig`
Configuración general, key-value.

```ts
{
  key: 'lastClientId' | 'lastUserName' | 'defaultThresholds' | ...;
  value: any;
}
```

---

## 3. Flujo de datos: ejecución de un cruce

```
1. Usuario selecciona cliente
   → carga groupers, fileProfiles, sessions previas en memoria

2. Usuario sube Nómina Maestra (.xlsx)
   → SheetJS parsea a JSON
   → si no hay fileProfile para (cliente, nomina_maestra): pedir mapping al usuario
   → si hay fileProfile: aplicar mapping automáticamente
   → validar (legajos no vacíos, columnas requeridas presentes)
   → guardar como sessionFile con status='draft'

3. Usuario sube Resumen
   → mismo flujo que paso 2, con su tipo de archivo

4. Usuario indica mes/año
   → se crea sessions row con status='draft'

5. Usuario configura agrupadores y umbrales
   → pills para elegir cuáles agrupadores usar
   → defaults: el set de la última sesión del cliente

6. Ejecutar cruce → matching.js
   FOR cada legajo en la unión de (nómina ∪ resumen):
     FOR cada grouper seleccionado:
       sum_nom = sum(importes de conceptos del grouper en nómina para ese legajo)
       sum_res = sum(importes de conceptos del grouper en resumen para ese legajo)
       diff_abs = sum_nom - sum_res
       diff_pct = sum_nom != 0 ? (diff_abs / sum_nom) * 100 : null
       has_diff = |diff_abs| > threshold.absoluteAmount
              OR |diff_pct| > threshold.percentage
              OR (sum_nom == 0 XOR sum_res == 0) [si flagMissing]
       store result

7. Calcular insights → insights.js
   - Totales por grupo
   - Legajos faltantes (set difference)
   - Top N diferencias (sort desc por |diff_abs|)
   - Variación mes a mes (buscar sesión definitiva del mes anterior)
   - Altas/bajas (set difference de legajos vs mes anterior)

8. Guardar sessionResults
   → status de la sesión pasa a 'completed'
   → usuario puede marcarla como definitiva (con validación: una sola por mes)

9. Visualización
   → render de pantalla de resultados (multi-sección scrolleable)

10. Export
   → toExcel: arma un workbook multi-hoja con todos los datos
   → toSessionJson: serializa toda la sesión + archivos parseados + resultados
```

---

## 4. Parsing de archivos

### 4.1 Estrategia general
SheetJS (`XLSX.read`) carga el archivo en memoria. Trabajamos siempre con la primera hoja (configurable a futuro).

```js
const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
// rawRows[0] son los headers, rawRows[1..] son los datos
```

### 4.2 Mapeo del usuario (primera vez por cliente × tipo)
La UI muestra los headers detectados y pide al usuario que indique cuál columna corresponde a cada campo lógico. El mapping se persiste en `fileProfiles`.

### 4.3 Normalización
Después del mapping, cada parser devuelve un array normalizado:

```js
// Para nómina maestra y tabulado horizontal:
[
  { legajo: '001', apellido: 'García', nombre: 'Juan', '100': 50000, '105': 5000, ... },
  ...
]

// Para resumen largo:
// Se transforma a tabulado horizontal antes de cruzar, sumando por legajo+concepto
[
  { legajo: '001', '100': 50000, '105': 5000, ... },
  ...
]
```

### 4.4 Manejo de números
- Argentina usa coma como separador decimal en Excel locales. SheetJS devuelve siempre número JS (punto decimal).
- Si el archivo tiene celdas con strings tipo "50.000,00", se parsean en `utils/currency.js` con regex.
- Importes se redondean a 2 decimales al guardarlos.

---

## 5. Render de UI

### 5.1 Wizard
Cada paso es una **vista independiente** que se monta/desmonta del DOM. El estado del wizard vive en un objeto `wizardState` en `main.js`. Al pasar al siguiente paso se valida el estado del paso actual y se persiste lo necesario en IndexedDB.

### 5.2 Pantalla de análisis
Una sola página con secciones scrolleables. Cada sección renderiza su propio componente:

```
┌─────────────────────────────────────┐
│ Header: cliente · mes · agrupadores │
├─────────────────────────────────────┤
│ Sección 1: Totales por grupo (tabla)│
├─────────────────────────────────────┤
│ Sección 2: Legajos faltantes        │
├─────────────────────────────────────┤
│ Sección 3: Top N diferencias        │
├─────────────────────────────────────┤
│ Sección 4: Variación mes a mes      │
├─────────────────────────────────────┤
│ Sección 5: Altas y bajas            │
├─────────────────────────────────────┤
│ Barra de acciones: Export · Guardar │
└─────────────────────────────────────┘
```

### 5.3 Componentes UI
- **Pills:** `<button class="pill" data-grouper-id="X">Nombre</button>`. Estado activo con clase `.pill--active`.
- **Tablas:** HTML semántico con `<table>`. Para volumen grande, paginación client-side con 50 filas por página.
- **Gráficos mes a mes:** SVG inline simple (barras horizontales) generado con JS plano. Si más adelante se necesita más, evaluar agregar Chart.js.

---

## 6. Export a Excel (estructura del workbook)

| Hoja | Contenido |
|---|---|
| **Resumen** | Cliente, mes, agrupadores usados, umbrales, totales por grupo. |
| **Detalle por legajo** | Una fila por legajo × grupo, con sum_nom, sum_res, diff, marca de "con diferencia". |
| **Legajos faltantes** | Listado de legajos en nómina y no en resumen, y viceversa. |
| **Top diferencias** | Top N legajos con mayor diferencia absoluta. |
| **Variación mes a mes** | Comparativo con mes anterior, si aplica. |
| **Altas y bajas** | Empleados que aparecen/desaparecen vs mes anterior. |
| **Metadata** | Fecha del cruce, versión de la herramienta, banner de confidencialidad. |

Generado con `XLSX.utils.book_new()` + `XLSX.writeFile()`.

---

## 7. Export / Import JSON de sesión

### 7.1 Formato

```json
{
  "format": "controles-nomina-session",
  "formatVersion": 1,
  "exportedAt": "2026-05-18T15:30:00Z",
  "exportedBy": "Willy",
  "warning": "Este archivo contiene datos sensibles de empleados. Tratar como confidencial.",
  "client": { /* objeto cliente */ },
  "session": { /* objeto session */ },
  "groupers": [ /* groupers usados */ ],
  "grouperConcepts": [ /* relaciones */ ],
  "files": [ /* sessionFiles con parsedRows */ ],
  "results": { /* sessionResults */ }
}
```

### 7.2 Import
- Validar `format` y `formatVersion`.
- Si `clientId` no existe en el destino, ofrecer crear el cliente o asociar a uno existente.
- Confirmación visual antes de sobrescribir.

---

## 8. Manejo de errores

| Tipo de error | Cómo se maneja |
|---|---|
| Archivo no es .xlsx válido | Mensaje claro: "El archivo no es un Excel válido. Verificá el formato." |
| Falta columna mapeada | Mensaje con nombre de la columna esperada. Permitir re-mapear. |
| Legajo vacío en alguna fila | Warning visible, fila se omite, contador de filas omitidas. |
| IndexedDB lleno (cuota) | Mensaje: "El almacenamiento local está lleno. Exportá sesiones viejas como JSON y borralas." |
| Importe no numérico | Warning, valor se interpreta como 0. Visible en metadata. |

---

## 9. Performance — consideraciones para el caso grande

Para clientes de 8.000 legajos × 300 conceptos:
- Tamaño aprox del JSON parseado: ~10-30 MB. Aceptable en IndexedDB.
- Tiempo de parse de Excel: 5-15 segundos. Mostrar loader.
- Tiempo de cruce: <2 segundos en hardware moderno (todo en RAM).
- Render de tabla de detalle: paginar a 50 filas. No renderizar 8.000 filas a la vez.

Si en algún momento el caso grande se vuelve frecuente, evaluar **Web Workers** para parsing y cruce (no bloquear UI thread).

---

## 10. Cambios sobre este documento

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-05-18 | Versión inicial | Diseño del MVP |
