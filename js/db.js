// db.js — La base de datos local de la app
//
// Usamos Dexie.js, que es una capa amigable sobre IndexedDB.
// IndexedDB es como el "cajón de archivos" del navegador: guarda datos
// aunque el usuario cierre la pestaña o apague la computadora.
//
// Dexie (cargado desde el CDN en index.html) está disponible como variable global.
/* global Dexie */

const db = new Dexie('controles-nomina');

// Acá definimos las "tablas" de la base de datos y qué campos se pueden buscar.
// El '++id' significa que el id se genera automáticamente (1, 2, 3...).
db.version(1).stores({
  clients:         '++id, name, createdAt',
  groupers:        '++id, clientId, name',
  grouperConcepts: '++id, grouperId, conceptCode, [grouperId+conceptCode]',
  fileProfiles:    '++id, clientId, fileType, [clientId+fileType]',
  sessions:        '++id, clientId, period, isDefinitive, [clientId+period]',
  sessionFiles:    '++id, sessionId, fileType',
  sessionResults:  '++id, sessionId',
  appConfig:       'key',
});

// v2 — agrega las tablas del sistema de controles
db.version(2).stores({
  clients:           '++id, name, createdAt',
  groupers:          '++id, clientId, name',
  grouperConcepts:   '++id, grouperId, conceptCode, [grouperId+conceptCode]',
  fileProfiles:      '++id, clientId, fileType, [clientId+fileType]',
  sessions:          '++id, clientId, period, isDefinitive, [clientId+period]',
  sessionFiles:      '++id, sessionId, fileType',
  sessionResults:    '++id, sessionId',
  appConfig:         'key',
  controlRuns:       '++id, clientId, period, isDefinitive, createdAt, [clientId+period]',
  controlRunFiles:   '++id, controlRunId, fileType, [controlRunId+fileType]',
  controlRunResults: '++id, controlRunId, controlId, [controlRunId+controlId]',
});

// ── CLIENTES ────────────────────────────────────────────────────────────

export async function getClients() {
  return db.clients.orderBy('name').toArray();
}

export async function getClient(id) {
  return db.clients.get(Number(id));
}

export async function createClient(name, notes = '') {
  const now = new Date().toISOString();
  return db.clients.add({ name: name.trim(), notes, createdAt: now, updatedAt: now });
}

export async function updateClient(id, changes) {
  return db.clients.update(Number(id), { ...changes, updatedAt: new Date().toISOString() });
}

export async function deleteClient(id) {
  const cid = Number(id);
  // Borramos en cascada: primero los hijos, después el padre
  await db.transaction('rw',
    [db.clients, db.groupers, db.grouperConcepts, db.fileProfiles,
     db.sessions, db.sessionFiles, db.sessionResults],
    async () => {
      const grouperIds = (await db.groupers.where('clientId').equals(cid).toArray()).map(g => g.id);
      if (grouperIds.length) await db.grouperConcepts.where('grouperId').anyOf(grouperIds).delete();
      await db.groupers.where('clientId').equals(cid).delete();
      await db.fileProfiles.where('clientId').equals(cid).delete();
      const sessionIds = (await db.sessions.where('clientId').equals(cid).toArray()).map(s => s.id);
      if (sessionIds.length) {
        await db.sessionFiles.where('sessionId').anyOf(sessionIds).delete();
        await db.sessionResults.where('sessionId').anyOf(sessionIds).delete();
      }
      await db.sessions.where('clientId').equals(cid).delete();
      await db.clients.delete(cid);
    }
  );
}

// ── AGRUPADORES ─────────────────────────────────────────────────────────

export async function getGroupers(clientId) {
  return db.groupers.where('clientId').equals(Number(clientId)).sortBy('name');
}

export async function createGrouper(clientId, name, color = '') {
  const now = new Date().toISOString();
  return db.groupers.add({ clientId: Number(clientId), name: name.trim(), color, createdAt: now, updatedAt: now });
}

export async function updateGrouper(id, changes) {
  return db.groupers.update(Number(id), { ...changes, updatedAt: new Date().toISOString() });
}

export async function deleteGrouper(id) {
  const gid = Number(id);
  await db.transaction('rw', [db.groupers, db.grouperConcepts], async () => {
    await db.grouperConcepts.where('grouperId').equals(gid).delete();
    await db.groupers.delete(gid);
  });
}

// ── CONCEPTOS DE AGRUPADOR ──────────────────────────────────────────────

export async function getGrouperConcepts(grouperId) {
  return db.grouperConcepts.where('grouperId').equals(Number(grouperId)).toArray();
}

export async function addConceptToGrouper(grouperId, conceptCode, conceptLabel = '') {
  const gid = Number(grouperId);
  const code = String(conceptCode).trim();
  // Si ya existe ese código en este agrupador, no lo duplicamos
  const exists = await db.grouperConcepts
    .where('[grouperId+conceptCode]').equals([gid, code]).first();
  if (exists) return exists.id;
  return db.grouperConcepts.add({ grouperId: gid, conceptCode: code, conceptLabel });
}

export async function removeConceptFromGrouper(grouperId, conceptCode) {
  return db.grouperConcepts
    .where('[grouperId+conceptCode]').equals([Number(grouperId), String(conceptCode)]).delete();
}

// ── PERFILES DE ARCHIVO ─────────────────────────────────────────────────
// Un "perfil" es el mapeo de columnas que el usuario configuró la primera vez
// que cargó ese tipo de archivo para ese cliente. Se reutiliza automáticamente.

export async function getFileProfile(clientId, fileType) {
  return db.fileProfiles
    .where('[clientId+fileType]').equals([Number(clientId), fileType]).first();
}

export async function saveFileProfile(clientId, fileType, mapping) {
  const now = new Date().toISOString();
  const existing = await getFileProfile(clientId, fileType);
  if (existing) {
    return db.fileProfiles.update(existing.id, { mapping, updatedAt: now });
  }
  return db.fileProfiles.add({ clientId: Number(clientId), fileType, mapping, createdAt: now, updatedAt: now });
}

// ── SESIONES ─────────────────────────────────────────────────────────────

export async function getSessions(clientId) {
  const rows = await db.sessions.where('clientId').equals(Number(clientId)).toArray();
  return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getSession(id) {
  return db.sessions.get(Number(id));
}

export async function createSession(data) {
  const now = new Date().toISOString();
  return db.sessions.add({ ...data, createdAt: now, updatedAt: now });
}

export async function updateSession(id, changes) {
  return db.sessions.update(Number(id), { ...changes, updatedAt: new Date().toISOString() });
}

export async function getDefinitiveSession(clientId, period) {
  return db.sessions
    .where('[clientId+period]').equals([Number(clientId), period])
    .filter(s => s.isDefinitive === true).first();
}

// ── ARCHIVOS DE SESIÓN ──────────────────────────────────────────────────

export async function saveSessionFile(sessionId, fileType, originalFileName, parsedRows, parseMetadata) {
  const sid = Number(sessionId);
  const existing = await db.sessionFiles
    .where('sessionId').equals(sid).filter(f => f.fileType === fileType).first();
  const data = { sessionId: sid, fileType, originalFileName, parsedRows, parseMetadata };
  if (existing) {
    await db.sessionFiles.update(existing.id, data);
    return existing.id;
  }
  return db.sessionFiles.add(data);
}

export async function getSessionFiles(sessionId) {
  return db.sessionFiles.where('sessionId').equals(Number(sessionId)).toArray();
}

// ── RESULTADOS DE SESIÓN ────────────────────────────────────────────────

export async function saveSessionResults(sessionId, results) {
  const sid = Number(sessionId);
  const existing = await db.sessionResults.where('sessionId').equals(sid).first();
  const data = { sessionId: sid, ...results, computedAt: new Date().toISOString() };
  if (existing) {
    await db.sessionResults.update(existing.id, data);
    return existing.id;
  }
  return db.sessionResults.add(data);
}

export async function getSessionResults(sessionId) {
  return db.sessionResults.where('sessionId').equals(Number(sessionId)).first();
}

// ── CONFIGURACIÓN GENERAL ───────────────────────────────────────────────

export async function getConfig(key) {
  const row = await db.appConfig.get(key);
  return row ? row.value : null;
}

export async function setConfig(key, value) {
  return db.appConfig.put({ key, value });
}

// ── CONTROL RUNS ────────────────────────────────────────────────────────────
// Un "control run" es una ejecución de uno o más controles para un cliente/período.

export async function createControlRun(clientId, period, selectedControls, notes = '') {
  const now = new Date().toISOString();
  return db.controlRuns.add({
    clientId: Number(clientId), period, selectedControls, notes,
    isDefinitive: false, createdAt: now, updatedAt: now,
  });
}

export async function getControlRuns(clientId) {
  const rows = await db.controlRuns.where('clientId').equals(Number(clientId)).toArray();
  return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getControlRun(id) {
  return db.controlRuns.get(Number(id));
}

export async function updateControlRun(id, changes) {
  return db.controlRuns.update(Number(id), { ...changes, updatedAt: new Date().toISOString() });
}

// ── ARCHIVOS DE CONTROL RUN ─────────────────────────────────────────────────

export async function saveControlRunFile(controlRunId, fileType, fileName, parsedRows, parseMetadata, mapping) {
  const rid = Number(controlRunId);
  const existing = await db.controlRunFiles
    .where('[controlRunId+fileType]').equals([rid, fileType]).first();
  const data = { controlRunId: rid, fileType, fileName, parsedRows, parseMetadata, mapping };
  if (existing) {
    await db.controlRunFiles.update(existing.id, data);
    return existing.id;
  }
  return db.controlRunFiles.add(data);
}

export async function getControlRunFiles(controlRunId) {
  return db.controlRunFiles.where('controlRunId').equals(Number(controlRunId)).toArray();
}

// ── RESULTADOS DE CONTROL RUN ───────────────────────────────────────────────

export async function saveControlRunResults(controlRunId, controlId, results) {
  const rid = Number(controlRunId);
  const existing = await db.controlRunResults
    .where('[controlRunId+controlId]').equals([rid, controlId]).first();
  const data = { controlRunId: rid, controlId, results, computedAt: new Date().toISOString() };
  if (existing) {
    await db.controlRunResults.update(existing.id, data);
    return existing.id;
  }
  return db.controlRunResults.add(data);
}

export async function getControlRunResults(controlRunId) {
  return db.controlRunResults.where('controlRunId').equals(Number(controlRunId)).toArray();
}

export { db };
