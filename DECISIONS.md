# DECISIONS — Log de decisiones técnicas

> Registrar aquí decisiones no obvias: por qué se eligió algo, qué alternativas se descartaron y cuál fue el motivo.
> Una entrada por decisión. Formato: fecha · contexto · decisión · alternativas descartadas · motivo.

---

## D-001 — Los archivos MD de planificación viven en `Claude md/`

**Fecha:** 2026-05-18
**Contexto:** Los documentos de planificación (PRD, ARCHITECTURE, ROADMAP, CLAUDE.md) fueron creados en una carpeta `Claude md/` antes del bootstrap del código.
**Decisión:** Dejarlos en `Claude md/` sin moverlos. Los documentos operativos nuevos (DECISIONS.md, CHANGELOG.md, README.md) viven en la raíz del proyecto.
**Alternativas descartadas:** Mover todo a la raíz (hubiera roto referencias previas y confundido a Willy).
**Motivo:** Mínima fricción, máxima compatibilidad con el estado existente.

---

## D-002 — `@import` en base.css para tokens.css

**Fecha:** 2026-05-18
**Contexto:** `tokens.css` define las variables CSS. `base.css` las usa.
**Decisión:** Usar `@import './tokens.css'` al inicio de `base.css` en lugar de requerir que `index.html` declare los dos `<link>` en orden correcto.
**Alternativas descartadas:** Solo declarar ambos en `index.html` (más frágil: depende del orden).
**Motivo:** La dependencia queda explícita en el código, no en el HTML.

---

## D-003 — Fallback CSS para el logo H&A

**Fecha:** 2026-05-18
**Contexto:** La herramienta se usa en equipos corporativos que pueden estar offline o con acceso restringido a URLs externas.
**Decisión:** Usar `<img onerror="...">` que reemplaza la imagen por el isotipo CSS (círculo celeste con "H&A") si la URL del logo no carga.
**Alternativas descartadas:** Solo imagen (falla offline), solo CSS (no muestra logo real cuando hay red).
**Motivo:** Mejor experiencia en todos los contextos, sin costo extra.
