# PRD — Controles Nómina

> **Última actualización:** 18 de mayo de 2026
> **Versión:** 1.0 (MVP en planificación)
> **Owner:** Willy (Guille) — Payroll, IT & Implementation Manager, H&A

---

## 1. Resumen ejecutivo

**Controles Nómina** es una herramienta HTML browser-side, sin backend, que permite al equipo de Payroll de H&A validar la nómina maestra exportada de Meta4 / PeopleNet contra archivos resumen del mismo período, generar insights de calidad y entregar resultados al cliente — todo sin necesidad de reconfigurar reportes en Meta4 cada vez.

---

## 2. Problema que resuelve

Hoy, validar una nómina contra archivos de control implica:
- Reconfigurar reportes en Meta4 para cada cliente.
- Hacer cruces manuales en Excel cada mes.
- No tener un histórico estructurado de qué se validó, cómo y con qué criterio.
- Tiempo perdido en cada cliente repitiendo la misma operatoria.

La herramienta resuelve esto centralizando la operación en una interfaz reutilizable, persistiendo configuración de agrupadores por cliente, y permitiendo comparaciones mes a mes sin depender de Meta4.

---

## 3. Usuarios

| Persona | Rol | Uso |
|---|---|---|
| **Analista de Payroll** | Equipo H&A | Carga archivos, ejecuta cruces, revisa diferencias, exporta resultados al cliente |
| **PMA / Supervisor** | Equipo H&A | Configura agrupadores por cliente, define criterios de tolerancia, revisa históricos |
| **Cliente final** | Externo | **No usa la herramienta**, pero recibe el Excel exportable con los resultados del cruce |

---

## 4. Objetivos del MVP (v1)

### 4.1 Objetivo principal
Que un analista de Payroll pueda, en menos de 10 minutos, cargar una nómina y un resumen del mismo mes, ejecutar el cruce con los agrupadores ya configurados del cliente, y exportar un Excel listo para mandar al cliente.

### 4.2 Objetivos secundarios
- Eliminar la dependencia de configurar reportes en Meta4 para validaciones de control.
- Mantener histórico mensual auditable de cada validación ejecutada.
- Permitir comparativos mes a mes para detectar variaciones atípicas.

### 4.3 Criterios de éxito (medibles)
- Tiempo de validación por cliente: ↓ al menos 50% vs proceso actual.
- 100% de los clientes activos del equipo con agrupadores configurados en la herramienta dentro de 3 meses post-release.
- Cero exportaciones al cliente que requieran retoque manual en Excel post-export.

---

## 5. Alcance del MVP

### 5.1 Funcionalidades incluidas (IN)

#### 5.1.1 Gestión multi-cliente
- Crear, listar, editar y borrar clientes en la herramienta.
- Cada cliente tiene su propio set de agrupadores de conceptos.
- Los datos y sesiones de cada cliente están aislados entre sí.

#### 5.1.2 Carga de archivos
La herramienta acepta los siguientes tipos de archivo, identificados explícitamente por el usuario al cargarlos (no se intenta autodetección en v1):

| Tipo | Formato | Descripción |
|---|---|---|
| **Nómina Maestra** | Excel (.xlsx) | Archivo principal de Meta4. Tabulado horizontal: una fila por legajo, columnas con datos personales (legajo, apellido, nombre) y columnas por concepto (código de concepto como header, importe como valor). |
| **Resumen Largo Excel** | Excel (.xlsx) | Una fila por combinación legajo × concepto. Columnas mínimas: legajo, código de concepto, importe. |
| **Resumen Tabulado Horizontal Excel** | Excel (.xlsx) | Mismo formato que la nómina maestra pero generado por otro sistema o reporte de Meta4. |

Para cada archivo, la primera vez que se carga de un cliente, el usuario mapea qué columna del archivo corresponde a cada campo lógico (legajo, código de concepto, importe). Ese mapeo se guarda como **perfil de archivo** y se reutiliza en futuras cargas del mismo tipo para el mismo cliente.

#### 5.1.3 Agrupadores de conceptos
- Por cliente, el usuario crea grupos lógicos (ej: "Remunerativos", "No Remunerativos", "Aportes", "Descuentos").
- A cada grupo le asigna uno o más códigos de concepto.
- Un concepto puede pertenecer a más de un grupo (ej: el 100 puede estar en "Remunerativos" y "Sueldo Básico").
- Los agrupadores se persisten en IndexedDB del navegador.
- En el paso de ejecución del cruce, los grupos se muestran como **pills clickeables** y el usuario elige cuáles validar.
- El último set de grupos seleccionado por el usuario en una corrida se recuerda como default para la siguiente.

#### 5.1.4 Períodos y sesiones mensuales
- Al ejecutar una validación, el usuario indica explícitamente el **mes/año** del período.
- Por ahora **un único tipo de liquidación por mes** (mensual). El modelo de datos contempla extensión a multi-liquidación en v2.
- Cada ejecución del cruce puede guardarse como **sesión** asociada a un cliente + mes.
- Una sesión puede marcarse como **"definitiva del mes"** (solo una sesión definitiva por cliente × mes).
- Se puede ver el listado de sesiones de cada cliente, con fecha de creación, agrupadores usados y si es definitiva o borrador.

#### 5.1.5 Lógica de cruce
Cruce por **legajo** (único identificador en v1).

Por cada grupo seleccionado:
1. Sumar el importe de los conceptos del grupo en la nómina, por legajo.
2. Sumar el importe de los conceptos del grupo en el resumen, por legajo.
3. Calcular diferencia (nómina − resumen) absoluta y porcentual.
4. Marcar la fila como "con diferencia" si **alguno** de estos criterios se cumple (los tres configurables por el usuario antes de ejecutar, con defaults razonables):
   - Diferencia absoluta > umbral de pesos (default: $1).
   - Diferencia porcentual > umbral % (default: 0.1%).
   - Existe en un archivo pero no en el otro (legajo o concepto).

#### 5.1.6 Insights generados
La pantalla de resultados muestra:

1. **Totales por grupo:** total nómina, total resumen, diferencia absoluta, diferencia %.
2. **Legajos faltantes:** legajos presentes en nómina y no en resumen, y viceversa.
3. **Top N diferencias** (N configurable, default 10): legajos con mayor diferencia absoluta.
4. **Variación mes a mes:** comparativo del total por grupo contra la sesión definitiva del mes anterior del mismo cliente. Mostrado como tabla y como mini-gráfico de barras.
5. **Altas y bajas del mes:** legajos que aparecen este mes y no estaban el mes anterior (altas) y viceversa (bajas).

#### 5.1.7 Exports
- **Export a Excel** del resultado completo del cruce, listo para mandar al cliente. Múltiples hojas: resumen, detalle por grupo, legajos faltantes, top diferencias.
- **Export JSON de sesión** para backup o para compartir con otro miembro del equipo. Incluye archivos cargados + agrupadores + resultados + metadata.
- **Import JSON de sesión** para retomar una sesión exportada por otro miembro del equipo.

#### 5.1.8 UI y flujo
- **Wizard de pasos** para el flujo de validación (cada paso lleva a un slide separado):
  1. Seleccionar cliente.
  2. Cargar Nómina Maestra.
  3. Cargar Resumen de cruce (uno o varios).
  4. Indicar mes/año.
  5. Configurar/elegir agrupadores y umbrales.
  6. Ejecutar cruce.
  7. **Pantalla de análisis:** todos los insights en una sola pantalla (multi-sección, scrolleable) para no marear al usuario yendo de slide en slide en esta etapa.

- **Pantallas auxiliares (no parte del wizard):**
  - Listado de clientes.
  - Editor de agrupadores por cliente.
  - Listado de sesiones históricas por cliente.

#### 5.1.9 Privacidad
- Banner visible en pantalla inicial y antes de cualquier carga de archivo.
- Texto del banner: ver `CLAUDE.md` sección 5.
- 0 conexiones a backends externos salvo CDNs de librerías.
- Todo el procesamiento en el navegador.

### 5.2 Funcionalidades excluidas del MVP (OUT, ver `ROADMAP.md`)
- PDF como tipo de archivo de cruce.
- Multi-liquidación (SAC, vacaciones, ajustes como períodos paralelos al mensual).
- Backend compartido en SharePoint.
- Autodetección de mapeo de columnas.
- Reglas personalizadas tipo "alertar si concepto X baja más de Y%".
- Cruce por CUIL.
- Roles y permisos.
- Versionado de archivos cargados (más allá del export JSON manual).

---

## 6. Restricciones y supuestos

### 6.1 Restricciones técnicas
- **Sin backend.** Todo browser-side.
- **Sin build step.** Doble click al HTML debe funcionar.
- **Compatible con navegadores modernos** (últimas 2 versiones de Chrome, Edge, Firefox). No se soporta IE11 ni Safari antiguos.
- **Volumen esperado:** hasta 8.000 empleados × 300 conceptos en clientes grandes (uso poco frecuente). Volumen típico: <1.000 empleados × <100 conceptos.

### 6.2 Supuestos
- Los archivos de input vienen razonablemente limpios (sin merged cells, sin múltiples headers, sin filas de totales intercaladas).
- El equipo de Payroll tiene capacidad de configurar los agrupadores la primera vez para cada cliente.
- Los códigos de concepto son únicos por cliente y se mantienen estables en el tiempo (con bajas frecuencia de cambios).

---

## 7. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Archivos con formatos inesperados que rompan el parser | Alto | Validación previa con mensajes de error claros y muestra de la primera fila parseada |
| IndexedDB se llena o se corrompe en algún navegador | Medio | Export JSON regular como backup; documentar en README cómo limpiar IndexedDB |
| Cliente solicita feature que requiere backend | Medio | Se evalúa caso por caso; documentar en `ROADMAP.md` como candidato a v2 con SharePoint |
| Usuario sube datos sensibles a un equipo no autorizado | Alto | Banner visible, training al equipo, log de auditoría local |
| Cambio de plan de cuentas del cliente rompe agrupadores existentes | Medio | Permitir editar agrupadores y mostrar conceptos del archivo que no están en ningún grupo |

---

## 8. Glosario

| Término | Definición |
|---|---|
| **Nómina maestra** | Archivo principal exportado del sistema de payroll (Meta4) que se considera la fuente de verdad para el período. |
| **Resumen** | Archivo secundario, generalmente con totales o subconjuntos, contra el cual se valida la nómina maestra. |
| **Concepto** | Ítem de la liquidación (sueldo, antigüedad, aporte jubilatorio, etc.), identificado por un código numérico o alfanumérico. |
| **Agrupador / Grupo** | Conjunto de conceptos agrupados lógicamente por el usuario (ej: "Remunerativos"). |
| **Legajo** | Identificador único del empleado dentro del cliente. Es la clave de cruce en v1. |
| **Sesión** | Una ejecución de cruce guardada, con sus archivos, agrupadores y resultados, asociada a un cliente y un mes. |
| **Sesión definitiva** | La sesión que se considera oficial para un cliente × mes (usada para comparativos mes a mes). Una sola por cliente × mes. |
| **Perfil de archivo** | Mapeo guardado de columnas → campos lógicos para un cliente × tipo de archivo. |

---

## 9. Cambios sobre este PRD

Cada modificación de scope se anota acá con fecha y motivo:

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-05-18 | Versión inicial | Diseño del MVP en sesión con Claude |
