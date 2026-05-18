# ROADMAP — Controles Nómina

> **Última actualización:** 18 de mayo de 2026
> Documento vivo: actualizar después de cada release y cuando aparezcan ideas nuevas que no entran al alcance actual.

---

## Convención

Cada ítem tiene:
- **Prioridad:** 1 (más alta) a 10 (más baja).
- **Esfuerzo estimado:** S (chico, <1 día) · M (mediano, 1-3 días) · L (grande, >3 días).
- **Estado:** planeado · en progreso · hecho · descartado.

---

## v1 — MVP (en construcción)

Ver detalle en `PRD.md` sección 5.1. Esto es el alcance comprometido.

### Bloques de trabajo

| # | Bloque | Prio | Esfuerzo | Estado |
|---|---|---|---|---|
| 1.1 | Bootstrap del proyecto (estructura de carpetas, HTML base, tokens.css con marca H&A) | 1 | S | **hecho** ✅ |
| 1.2 | DB layer con Dexie + schemas + helpers CRUD básicos | 1 | M | **hecho** ✅ |
| 1.3 | UI de gestión de clientes (listar, crear, editar, borrar) | 2 | S | **hecho** ✅ |
| 1.4 | UI de editor de agrupadores por cliente | 2 | M | **hecho** ✅ |
| 1.5 | Parser de Nómina Maestra Excel + UI de mapeo | 3 | M | **hecho** ✅ |
| 1.6 | Parser de Resumen Largo Excel + UI de mapeo | 3 | M | **hecho** ✅ |
| 1.7 | Parser de Resumen Tabulado Horizontal Excel + UI de mapeo | 3 | S | **hecho** ✅ |
| 1.8 | Wizard de ejecución (pasos 1 a 5 del flujo) | 4 | M | **hecho** ✅ |
| 1.9 | Lógica de matching y cálculo de diferencias | 4 | M | **hecho** ✅ |
| 1.10 | Cálculo de insights (totales, faltantes, top diffs, altas/bajas, mes a mes) | 5 | M | parcial ⚠️ (sin mes a mes) |
| 1.11 | Pantalla de análisis (multi-sección scrolleable) | 5 | M | **hecho** ✅ |
| 1.12 | Listado de sesiones históricas por cliente | 6 | S | planeado |
| 1.13 | Marcar sesión como definitiva (con validación de unicidad) | 6 | S | planeado |
| 1.14 | Export a Excel multi-hoja | 7 | M | planeado |
| 1.15 | Export / Import JSON de sesión | 8 | M | planeado |
| 1.16 | README.md de uso para el equipo + screenshots básicos | 9 | S | planeado |
| 1.17 | Set de archivos de prueba anonimizados + testing manual | 10 | S | planeado |

**Definition of Done de v1:**
- [ ] Un analista puede ejecutar el flujo completo de punta a punta con un cliente de prueba.
- [ ] El Excel exportado se ve presentable para mandar al cliente sin retoques.
- [ ] El banner de privacidad está visible.
- [ ] La marca H&A está aplicada correctamente (paleta, tipografía, logo).
- [ ] No hay errores en consola durante el flujo normal.
- [ ] El README explica cómo instalar y usar.

---

## v2 — Features descartadas del MVP

Ítems explícitamente excluidos del MVP que pasan a v2.

| # | Feature | Prio | Esfuerzo | Notas |
|---|---|---|---|---|
| 2.1 | **PDF como tipo de archivo de cruce** | 2 | L | pdf.js. Limitación: solo PDFs con texto seleccionable; los escaneados requieren OCR (fuera de browser-side simple). |
| 2.2 | **Multi-liquidación** (SAC, vacaciones, ajustes como períodos paralelos al mensual) | 3 | M | Cambio de schema: `liquidationType` ya está en `sessions`, falta UI. |
| 2.3 | **Reglas personalizadas de alerta** ("si concepto X cae >Y% mes a mes, alertar") | 4 | M | Mini DSL de reglas evaluado contra resultado del cruce. |
| 2.4 | **Cruce por CUIL como alternativa a legajo** | 5 | S | Cambio en lógica de matching, mapping de columna CUIL en fileProfiles. |
| 2.5 | **Autodetección de mapeo de columnas** | 6 | M | Heurísticas: detectar columna "legajo" por nombre, columnas de concepto por valor numérico, etc. |
| 2.6 | **Histórico de variaciones del cliente más allá de un mes vs el anterior** | 6 | M | Gráfico de tendencia con últimos 6/12 meses. |
| 2.7 | **Anotaciones / comentarios sobre líneas con diferencia** | 7 | S | Tabla `sessionNotes` con (sessionId, legajo, grouperId, note). |
| 2.8 | **Filtros y búsqueda en pantalla de análisis** | 7 | S | Filtrar tabla de detalle por legajo, grupo, magnitud de diferencia. |
| 2.9 | **Export del Excel con marca H&A aplicada** (colores en headers, logo embebido) | 8 | S | Usar `XLSX-style` o equivalente. |
| 2.10 | **Mensajes de validación más ricos en el parser** (preview de las primeras filas parseadas para confirmar mapping) | 8 | S | UX win. |

---

## v3 — Trabajo en equipo / backend

Features que requieren compartir estado entre miembros del equipo.

| # | Feature | Prio | Esfuerzo | Notas |
|---|---|---|---|---|
| 3.1 | **Backend en SharePoint** para compartir agrupadores y sesiones entre el equipo | 1 | L | SharePoint Lists vía Graph API; auth con M365. Requiere repensar el flujo de auth en una herramienta que hoy es offline. |
| 3.2 | **Versionado de archivos cargados** con histórico (no solo "definitiva" vs "borrador") | 3 | M | Si hay SharePoint, este caso se cubre con su versionado nativo. |
| 3.3 | **Roles y permisos** (analista, supervisor, admin) | 4 | M | Solo aplica si hay backend. |
| 3.4 | **Log de auditoría** (quién ejecutó qué cruce, cuándo, con qué umbrales) | 5 | M | Solo aplica si hay backend. |
| 3.5 | **Notificaciones por email** cuando una sesión definitiva se marca | 7 | S | Vía Graph API. |

---

## Ideas sueltas / parking lot

Cosas que se mencionaron pero no están priorizadas todavía.

- Integración con monday.com para crear items automáticamente cuando se detectan diferencias críticas.
- Plantillas de agrupadores compartibles entre clientes similares (ej: importar agrupadores de Cliente A en Cliente B).
- Modo "dry run" que valida los archivos sin guardar la sesión.
- Importación de plan de cuentas desde Excel para generar agrupadores automáticamente.
- Detección de outliers estadísticos (legajos con variación > 2 desvíos estándar del promedio del grupo).
- Modo oscuro de la UI.
- Atajos de teclado para power users.
- PWA installable (manifest + service worker) para uso offline garantizado.
- Embedding del archivo dentro del export JSON como base64 vs solo `parsedRows`.

---

## Histórico de releases

| Versión | Fecha | Cambios principales |
|---|---|---|
| (pendiente) | (pendiente) | v1.0 — MVP |
