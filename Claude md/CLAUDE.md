# CLAUDE.md — Instrucciones para Claude Code

> Este archivo se lee automáticamente en cada sesión de Claude Code en este repo.
> Define cómo Claude debe trabajar en este proyecto. Mantener corto y vigente.

---

## 1. Contexto del proyecto

**Nombre:** Controles Nómina
**Owner:** Willy (Guille) — Payroll, IT & Implementation Manager en Hidalgo & Asociados (H&A)
**Tipo:** Herramienta interna HTML browser-side para validación de nóminas.
**Audiencia:** Equipo de Payroll de H&A. Eventualmente exportables para clientes finales.

**Para qué sirve:** Validar la nómina maestra de un cliente (export de Meta4 / PeopleNet) contra archivos resumen del mismo período, generar insights, comparar mes a mes y exportar resultados al cliente — todo sin reconfigurar nada en Meta4.

**Para qué NO sirve:** No es una herramienta de cálculo de nómina, no escribe a Meta4, no se conecta a ningún sistema de origen. Es 100% lectura y análisis local.

---

## 2. Stack técnico

- **Frontend:** HTML + Vanilla JS con módulos ES6 (`import` / `export`). Sin framework.
- **Estilos:** CSS plano, sin preprocesadores. Variables CSS para la paleta H&A.
- **Excel:** SheetJS (`xlsx`) vía CDN — `https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js`
- **IndexedDB:** Dexie.js vía CDN — `https://unpkg.com/dexie@4/dist/dexie.min.js`
- **PDF (v2 en adelante):** pdf.js vía CDN — `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/`
- **Build:** Ninguno. Todo se sirve como archivos estáticos. Abrir `index.html` directamente o servir con un static server simple.
- **Sin transpilación, sin bundler, sin npm install.** Esto es deliberado: cualquiera del equipo tiene que poder abrir el repo, dar doble click al HTML y que funcione.

---

## 3. Estructura del repo (sugerida)

```
controles-nomina/
├── CLAUDE.md            ← este archivo
├── PRD.md               ← qué hace la herramienta y por qué
├── ARCHITECTURE.md      ← cómo está construida
├── ROADMAP.md           ← qué viene después del MVP
├── DECISIONS.md         ← log de decisiones (se va creando a demanda)
├── CHANGELOG.md         ← se va escribiendo a medida que se versiona
├── README.md            ← guía de uso para el equipo H&A
├── index.html           ← entry point único
├── css/
│   ├── tokens.css       ← variables CSS (paleta H&A, tipografía, espaciados)
│   ├── base.css         ← reset + estilos generales
│   └── components.css   ← componentes UI (pills, wizard, tablas, etc.)
├── js/
│   ├── main.js          ← bootstrap de la app
│   ├── db.js            ← capa de IndexedDB (Dexie schemas + helpers)
│   ├── parsers/         ← parseo de cada tipo de archivo
│   │   ├── nominaMaestra.js
│   │   ├── resumenLargoExcel.js
│   │   └── resumenTabuladoHorizontalExcel.js
│   ├── matching.js      ← lógica de cruce nómina vs resumen
│   ├── insights.js      ← cálculo de los insights (totales, top diffs, etc.)
│   ├── ui/              ← componentes de UI
│   │   ├── wizard.js
│   │   ├── fileUpload.js
│   │   ├── grouperEditor.js
│   │   ├── resultsView.js
│   │   └── sessionsList.js
│   ├── export/          ← exports a Excel y JSON de sesión
│   │   ├── toExcel.js
│   │   └── toSessionJson.js
│   └── utils/
│       ├── currency.js  ← formateo y parsing de números (es-AR)
│       ├── dates.js     ← manejo de períodos
│       └── validators.js
└── assets/
    └── (logos, íconos, etc.)
```

Claude Code puede ajustar esto si tiene buen motivo, pero documentar el cambio en `DECISIONS.md`.

---

## 4. Convenciones de código

- **Idioma:**
  - Código (nombres de variables, funciones, archivos): **inglés**.
  - Comentarios, mensajes de UI, strings visibles al usuario: **español argentino**.
- **Indentación:** 2 espacios.
- **Strings:** comillas simples por defecto. Template literals cuando hay interpolación.
- **Punto y coma:** sí, siempre.
- **Async:** `async/await`, no callbacks ni `.then()` encadenados largos.
- **Errores:** capturar siempre, mostrar mensajes claros al usuario en español. Nunca dejar un `console.error` como única respuesta al usuario.
- **Nombres:** `camelCase` para funciones y variables, `PascalCase` para clases, `UPPER_SNAKE` para constantes globales.
- **No usar `var`.** Solo `const` y `let`.
- **Imports relativos** dentro del proyecto (`import { x } from './utils/foo.js'`).
- **JSDoc** opcional pero bienvenido en funciones públicas de cada módulo.

---

## 5. Marca H&A — uso obligatorio

Todo HTML del proyecto debe aplicar el skill **`hya-brand`** ubicado en `/mnt/skills/user/hya-brand/SKILL.md`.

Reglas mínimas no negociables:
- Celeste primario **`#00ACD4`** como color de marca.
- Gris wordmark **`#8C837B`** para el texto "Hidalgo & Asociados".
- Tipografía **Source Sans Pro** (Google Fonts) con fallback Arial.
- Logo H&A en header de la app (usar fallback CSS de la sección 9.4 del skill si no hay conexión a red).
- Footer con datos de contacto corporativos cuando aplique.

**Aviso de privacidad obligatorio** (banner visible antes de cualquier input de archivo):

> ⚠ **Aviso de privacidad:** Esta herramienta procesa los datos 100% en tu navegador — nada se sube a internet. Aun así, **no compartas información personal identificable de empleados o clientes** fuera de los canales autorizados por H&A. Usá esta herramienta solo en equipos corporativos.

Snippet HTML del banner: ver `SKILL.md` sección 5.

---

## 6. Privacidad y seguridad

Esto es **crítico** y aplica a todo el código:

1. **Nada sale del navegador.** No hay backend, no hay API calls a servicios externos (salvo CDNs de librerías). Todos los datos viven en IndexedDB local del usuario.
2. **No loguear datos sensibles a consola.** En producción, los `console.log` de datos de empleados están prohibidos. En desarrollo, OK pero limpiar antes de mergear.
3. **El export JSON de sesión incluye datos personales.** Avisar al usuario al exportar: "Este archivo contiene datos sensibles de empleados. Tratalo como información confidencial."
4. **No telemetría, no analytics, no tracking.** Nada de Google Analytics, Sentry, etc.

---

## 7. Git workflow — obligatorio

**Cada cambio de código debe terminar con el ciclo completo: commit → push → PR → merge a main.** Sin excepciones, sin pedir confirmación a Willy.

Secuencia exacta:
```
git add <archivos modificados>
git commit -m "..."
git checkout -b feat/nombre-descriptivo   # o fix/ según corresponda
git push -u origin feat/nombre-descriptivo
"C:\Program Files\GitHub CLI\gh.exe" pr create --base main --head feat/nombre-descriptivo --title "..." --body "..."
"C:\Program Files\GitHub CLI\gh.exe" pr merge --merge --delete-branch
```

Notas:
- `gh` no está en el PATH — usar ruta completa `C:\Program Files\GitHub CLI\gh.exe`
- Willy es el único owner del repo, no hay reviewers — mergear directo
- El objetivo es que el cambio esté en `main` antes de terminar la respuesta

---

## 8. Estilo de commits

Usar **Conventional Commits** (es el estándar más práctico):

- `feat:` nueva funcionalidad
- `fix:` corrección de bug
- `docs:` cambios en documentación
- `refactor:` cambio de código sin cambiar comportamiento
- `style:` formato, espacios, sin cambio de lógica
- `test:` agregar/modificar tests
- `chore:` tareas de mantenimiento

Ejemplos:
```
feat: agregar parser de resumen tabulado horizontal
fix: corregir error en matching cuando legajo es numérico vs string
docs: actualizar PRD con insight de variación mes a mes
```

Mensajes en español, body opcional pero bienvenido cuando el cambio es no obvio.

---

## 8. Cómo trabajar con Willy

- **Brainstorming antes de código.** No tirarse a implementar de una si el pedido tiene ambigüedad. Validar el objetivo principal primero.
- **Opciones con ranking 1–10** cuando haya decisiones de diseño.
- **Datos reales, no suposiciones.** Si Claude no sabe algo (ej: cómo viene exactamente un archivo del cliente), preguntar.
- **Idioma:** español argentino, registro directo e informal.
- **Cuando sea posible, mostrar working output rápido** antes de pulir. Iteración visual > planificación exhaustiva.
- **No sobre-formatear** las respuestas (Willy lo agradece).

---

## 9. Testing

Para el MVP, **no se exige cobertura formal de tests automáticos.** Sí se exige:

- Tener archivos de prueba anonimizados en `tests/fixtures/` que cubran los formatos soportados.
- Testing manual documentado en `README.md` antes de cada release.
- Si Claude Code identifica una zona de alto riesgo (parsing, cálculos de diferencias), proponer tests unitarios concretos.

---

## 10. Documentos vivos del proyecto

Estos archivos se actualizan a medida que el proyecto evoluciona. Claude Code puede proponer cambios cuando detecte que están desactualizados:

| Documento | Frecuencia de actualización |
|---|---|
| `CLAUDE.md` | Cuando cambian convenciones o stack |
| `PRD.md` | Cuando cambia el scope o se redefine una feature |
| `ARCHITECTURE.md` | Cuando cambia un schema, módulo o flujo importante |
| `ROADMAP.md` | Después de cada release |
| `DECISIONS.md` | Cuando se toma una decisión técnica no obvia |
| `CHANGELOG.md` | En cada commit relevante |
| `README.md` | Cuando cambia el flujo de uso para el equipo |

---

**Última actualización:** 18 de mayo de 2026 — versión inicial del proyecto.
