# CHANGELOG — Controles Nómina

> Formato: [Conventional Commits](https://www.conventionalcommits.org/). Mensajes en español.
> Cada entrada: versión · fecha · tipo · descripción.

---

## [Unreleased] — MVP en desarrollo

### feat: bootstrap del proyecto (bloque 1.1) — 2026-05-18

- `index.html` — shell de la app con header H&A (logo + wordmark + fallback CSS offline), banner de privacidad obligatorio, área de contenido principal y footer corporativo con las 3 sedes y datos de contacto.
- `css/tokens.css` — variables CSS de diseño: paleta H&A (`#00ACD4`, `#8C837B`), tipografía Source Sans Pro, escala de espaciado, bordes, sombras, z-index.
- `css/base.css` — reset, estilos generales, estructura del header y footer, clases utilitarias (text-muted, text-primary, container, page-content).
- `css/components.css` — sistema completo de componentes UI: botones (primary/secondary/ghost/danger), pills de agrupadores, badges, cards, tablas de datos con paginación, wizard de pasos, formularios, file upload, spinner, toast, modal, empty state, alert, welcome screen.
- `js/main.js` — bootstrap: inicialización de la app, verificación de CDNs (SheetJS + Dexie), setup del banner de privacidad, router básico, helper `showToast()` exportable, pantalla de bienvenida con estado del MVP.
- `DECISIONS.md` — creado. Log de decisiones técnicas (D-001 a D-003).

---

*Próximo: bloque 1.2 — DB layer con Dexie + schemas + helpers CRUD.*
