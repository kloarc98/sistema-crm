import express from 'express';
import nodemailer from 'nodemailer';
import { query } from '../db.js';

const router = express.Router();

const GLOBAL_SETTINGS_TABLE = 'app_setting';
const PAYMENT_REMINDER_DAYS_SETTING_KEY = 'payment_reminder_days';
const LOW_STOCK_THRESHOLD_SETTING_KEY = 'low_stock_threshold';
const DEFAULT_PAYMENT_REMINDER_DAYS = 7;
const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const MIN_REMINDER_DAYS = 1;
const MAX_REMINDER_DAYS = 365;
const MIN_LOW_STOCK_THRESHOLD = 1;
const MAX_LOW_STOCK_THRESHOLD = 999;

let transporter;
let transporterInfo;

async function getEmailTransporter() {
  if (transporter) {
    return { transporter, info: transporterInfo };
  }

  const host = String(process.env.SMTP_HOST || '').trim();
  const rawPort = String(process.env.SMTP_PORT || '587').trim();
  const port = Number(rawPort);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();

  const missingVars = [];
  if (!host) missingVars.push('SMTP_HOST');
  if (!rawPort || Number.isNaN(port) || port <= 0) missingVars.push('SMTP_PORT');
  if (!user) missingVars.push('SMTP_USER');
  if (!pass) missingVars.push('SMTP_PASS');

  if (missingVars.length > 0) {
    if (nodeEnv !== 'production') {
      // In development, fallback to Ethereal test SMTP so password recovery works without real credentials.
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      transporterInfo = {
        mode: 'ethereal',
        defaultFrom: `Sistema de Gestion <${testAccount.user}>`,
      };

      return { transporter, info: transporterInfo };
    }

    throw new Error(
      `Configuracion SMTP incompleta. Define: ${missingVars.join(', ')} en server/.env`
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  transporterInfo = {
    mode: 'smtp',
    defaultFrom: user,
  };

  return { transporter, info: transporterInfo };
}

async function getRoleIdByName(roleName) {
  const roles = await query('SELECT rl_id FROM rol WHERE rl_nombre = ? LIMIT 1', [roleName]);
  if (roles.length > 0) {
    return Number(roles[0].rl_id);
  }

  const fallback = await query('SELECT rl_id FROM rol ORDER BY rl_id ASC LIMIT 1');
  if (fallback.length > 0) {
    return Number(fallback[0].rl_id);
  }

  return null;
}

async function getEstadoUsuarioId() {
  return getEstadoUsuarioIdByName('activo');
}

async function getEstadoUsuarioIdByName(estadoNombre) {
  const rows = await query(
    'SELECT est_id FROM estado_usr WHERE LOWER(est_nombre) = LOWER(?) LIMIT 1',
    [estadoNombre]
  );

  if (rows.length > 0) {
    return Number(rows[0].est_id);
  }

  const result = await query('INSERT INTO estado_usr (est_nombre) VALUES (?)', [estadoNombre]);
  return Number(result.insertId);
}

async function getCreatorUserId({ createdByUserId, createdByUsername }) {
  if (typeof createdByUserId !== 'undefined' && createdByUserId !== null && createdByUserId !== '') {
    const numericId = Number(createdByUserId);
    if (!Number.isNaN(numericId) && numericId > 0) {
      return numericId;
    }
  }

  if (typeof createdByUsername === 'string' && createdByUsername.trim() !== '') {
    const username = createdByUsername.trim();
    const users = await query(
      `SELECT usr_id
       FROM usuario
       WHERE usr_nit = ? OR usr_correo = ? OR usr_nombre = ?
       LIMIT 1`,
      [username, username, username]
    );

    if (users.length > 0) {
      return Number(users[0].usr_id);
    }
  }

  return null;
}

async function getUserRoleNameById(userId) {
  const numericId = Number(userId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return '';
  }

  const rows = await query(
    `SELECT COALESCE(r.rl_nombre, '') AS roleName
     FROM usuario u
     LEFT JOIN rol r ON r.rl_id = u.rl_id
     WHERE u.usr_id = ?
     LIMIT 1`,
    [numericId]
  );

  if (rows.length === 0) {
    return '';
  }

  return String(rows[0].roleName || '').toLowerCase().trim();
}

async function loadAllowedScreenPathsByUserId(userId) {
  const numericId = Number(userId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return ['/'];
  }

  const rows = await query(
    `SELECT DISTINCT p.pantalla_ruta AS path
     FROM usuario u
     INNER JOIN rol r ON r.rl_id = u.rl_id
     INNER JOIN rol_pantalla_permiso rpp ON rpp.rl_id = u.rl_id
     INNER JOIN pantalla p ON p.pantalla_id = rpp.pantalla_id
     WHERE u.usr_id = ?
       AND LOWER(COALESCE(r.rl_estado, 'activo')) = 'activo'
       AND p.activa = 1
       AND rpp.puede_ver = 1
     ORDER BY p.pantalla_id ASC`,
    [numericId]
  );

  const result = rows
    .map((row) => String(row.path || '').trim())
    .filter((value) => value !== '');

  if (!result.includes('/')) {
    result.unshift('/');
  }

  return [...new Set(result)];
}

function normalizeUserRow(row) {
  return {
    id: String(row.id),
    nombres: row.nombres || '',
    apellidos: row.apellidos || '',
    correo: row.correo || '',
    telefono: row.telefono || '',
    rol: row.rol || 'vendedor',
    usuario: row.usuario || '',
    est_id: typeof row.est_id === 'number' ? row.est_id : Number(row.est_id || 0),
    estado: row.estado || 'activo',
    fecha_creacion: row.fecha_creacion || null,
    creado_por: row.creado_por || '',
  };
}

function isAdminRole(roleValue) {
  const role = String(roleValue || '').toLowerCase().trim();
  return role === 'admin' || role.includes('admin');
}

function isJefeRole(roleValue) {
  const role = String(roleValue || '').toLowerCase().trim();
  return role === 'jefe' || role.includes('jefe');
}

function canManageUserStatusRole(roleValue) {
  return isAdminRole(roleValue) || isJefeRole(roleValue);
}

function canManageGlobalSettings(roleValue) {
  return isAdminRole(roleValue) || isJefeRole(roleValue);
}

function canManageRoleScreenPermissions(roleValue) {
  return isAdminRole(roleValue);
}

function getDefaultRoleScreenPermission(roleName, screenPath) {
  const normalizedRole = String(roleName || '').toLowerCase().trim();

  const adminPaths = new Set([
    '/', '/dashboard', '/income', '/orders', '/reporteria', '/pagos-pendientes', '/routes', '/products', '/clients', '/users', '/settings', '/role-screen-permissions',
  ]);
  const jefePaths = new Set(['/', '/dashboard', '/orders', '/reporteria', '/pagos-pendientes', '/products', '/clients', '/users', '/settings']);
  const vendedorPaths = new Set(['/', '/dashboard', '/income', '/reporteria', '/pagos-pendientes', '/clients', '/settings']);
  const defaultPaths = new Set(['/', '/dashboard', '/settings']);

  if (normalizedRole === 'admin' || normalizedRole.includes('admin')) {
    return adminPaths.has(screenPath);
  }

  if (normalizedRole === 'jefe' || normalizedRole.includes('jefe')) {
    return jefePaths.has(screenPath);
  }

  if (normalizedRole === 'vendedor' || normalizedRole.includes('vendedor')) {
    return vendedorPaths.has(screenPath);
  }

  return defaultPaths.has(screenPath);
}

function normalizeReminderDays(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_PAYMENT_REMINDER_DAYS;
  }

  const rounded = Math.round(numeric);
  if (rounded < MIN_REMINDER_DAYS) {
    return MIN_REMINDER_DAYS;
  }

  if (rounded > MAX_REMINDER_DAYS) {
    return MAX_REMINDER_DAYS;
  }

  return rounded;
}

function normalizeLowStockThreshold(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_LOW_STOCK_THRESHOLD;
  }

  const rounded = Math.round(numeric);
  if (rounded < MIN_LOW_STOCK_THRESHOLD) {
    return MIN_LOW_STOCK_THRESHOLD;
  }

  if (rounded > MAX_LOW_STOCK_THRESHOLD) {
    return MAX_LOW_STOCK_THRESHOLD;
  }

  return rounded;
}

async function ensureGlobalSettingsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS ${GLOBAL_SETTINGS_TABLE} (
      setting_key VARCHAR(120) PRIMARY KEY,
      setting_value VARCHAR(255) NOT NULL,
      updated_by INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_app_setting_updated_by
        FOREIGN KEY (updated_by) REFERENCES usuario(usr_id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB`
  );
}

async function getPaymentReminderDaysSetting() {
  await ensureGlobalSettingsTable();

  const rows = await query(
    `SELECT setting_value
     FROM ${GLOBAL_SETTINGS_TABLE}
     WHERE setting_key = ?
     LIMIT 1`,
    [PAYMENT_REMINDER_DAYS_SETTING_KEY]
  );

  if (rows.length === 0) {
    await query(
      `INSERT INTO ${GLOBAL_SETTINGS_TABLE} (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [PAYMENT_REMINDER_DAYS_SETTING_KEY, String(DEFAULT_PAYMENT_REMINDER_DAYS)]
    );

    return DEFAULT_PAYMENT_REMINDER_DAYS;
  }

  return normalizeReminderDays(rows[0]?.setting_value);
}

async function updatePaymentReminderDaysSetting(days, updatedBy) {
  await ensureGlobalSettingsTable();

  const normalized = normalizeReminderDays(days);
  await query(
    `INSERT INTO ${GLOBAL_SETTINGS_TABLE} (setting_key, setting_value, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       updated_by = VALUES(updated_by)`,
    [PAYMENT_REMINDER_DAYS_SETTING_KEY, String(normalized), updatedBy || null]
  );

  return normalized;
}

async function getLowStockThresholdSetting() {
  await ensureGlobalSettingsTable();

  const rows = await query(
    `SELECT setting_value
     FROM ${GLOBAL_SETTINGS_TABLE}
     WHERE setting_key = ?
     LIMIT 1`,
    [LOW_STOCK_THRESHOLD_SETTING_KEY]
  );

  if (rows.length === 0) {
    await query(
      `INSERT INTO ${GLOBAL_SETTINGS_TABLE} (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [LOW_STOCK_THRESHOLD_SETTING_KEY, String(DEFAULT_LOW_STOCK_THRESHOLD)]
    );

    return DEFAULT_LOW_STOCK_THRESHOLD;
  }

  return normalizeLowStockThreshold(rows[0]?.setting_value);
}

async function updateLowStockThresholdSetting(value, updatedBy) {
  await ensureGlobalSettingsTable();

  const normalized = normalizeLowStockThreshold(value);
  await query(
    `INSERT INTO ${GLOBAL_SETTINGS_TABLE} (setting_key, setting_value, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       updated_by = VALUES(updated_by)`,
    [LOW_STOCK_THRESHOLD_SETTING_KEY, String(normalized), updatedBy || null]
  );

  return normalized;
}

async function normalizeCoverageAssignments(inputAssignments) {
  if (typeof inputAssignments === 'undefined' || inputAssignments === null) {
    return [];
  }

  if (!Array.isArray(inputAssignments)) {
    throw new Error('coverageAssignments debe ser un arreglo');
  }

  const assignments = [];
  const seenDepartments = new Set();

  for (const item of inputAssignments) {
    const depId = Number(item?.depId);
    const coverage = String(item?.coverage || '').toUpperCase();
    const municipalityIdsRaw = Array.isArray(item?.municipalityIds) ? item.municipalityIds : [];
    const municipalityIds = [...new Set(municipalityIdsRaw.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];

    if (!Number.isInteger(depId) || depId <= 0) {
      throw new Error('Departamento inválido en cobertura de usuario');
    }

    if (coverage !== 'ALL' && coverage !== 'PARTIAL') {
      throw new Error('Cobertura inválida. Usa ALL o PARTIAL');
    }

    if (coverage === 'PARTIAL' && municipalityIds.length === 0) {
      throw new Error('Cuando la cobertura es PARTIAL debes seleccionar al menos un municipio');
    }

    if (seenDepartments.has(depId)) {
      throw new Error('No se permite repetir departamentos en coverageAssignments');
    }

    seenDepartments.add(depId);
    assignments.push({ depId, coverage, municipalityIds });
  }

  if (assignments.length === 0) {
    return [];
  }

  const departmentIds = assignments.map((item) => item.depId);
  const placeholders = departmentIds.map(() => '?').join(', ');
  const existingDepartments = await query(
    `SELECT dep_id
     FROM departamento
     WHERE dep_id IN (${placeholders})`,
    departmentIds
  );

  const existingDepSet = new Set(existingDepartments.map((row) => Number(row.dep_id)));
  for (const assignment of assignments) {
    if (!existingDepSet.has(assignment.depId)) {
      throw new Error(`Departamento no encontrado: ${assignment.depId}`);
    }
  }

  for (const assignment of assignments) {
    if (assignment.coverage !== 'PARTIAL') {
      continue;
    }

    const municipalityPlaceholders = assignment.municipalityIds.map(() => '?').join(', ');
    const rows = await query(
      `SELECT mun_id
       FROM municipio
       WHERE dep_id = ?
         AND mun_id IN (${municipalityPlaceholders})`,
      [assignment.depId, ...assignment.municipalityIds]
    );

    const existingMunicipalitySet = new Set(rows.map((row) => Number(row.mun_id)));
    for (const municipalityId of assignment.municipalityIds) {
      if (!existingMunicipalitySet.has(municipalityId)) {
        throw new Error(`Municipio ${municipalityId} no pertenece al departamento ${assignment.depId}`);
      }
    }
  }

  return assignments;
}

async function saveUserCoverageAssignments(userId, assignments) {
  await query('DELETE FROM usuario_departamento_municipio WHERE usr_id = ?', [userId]);
  await query('DELETE FROM usuario_departamento WHERE usr_id = ?', [userId]);

  for (const assignment of assignments) {
    await query(
      `INSERT INTO usuario_departamento (usr_id, dep_id, cobertura)
       VALUES (?, ?, ?)`,
      [userId, assignment.depId, assignment.coverage]
    );

    if (assignment.coverage === 'PARTIAL') {
      for (const municipalityId of assignment.municipalityIds) {
        await query(
          `INSERT INTO usuario_departamento_municipio (usr_id, dep_id, mun_id)
           VALUES (?, ?, ?)`,
          [userId, assignment.depId, municipalityId]
        );
      }
    }
  }
}

async function loadUserCoverageAssignments(userId) {
  const rows = await query(
    `SELECT
      ud.dep_id,
      d.dep_nombre,
      ud.cobertura,
      udm.mun_id,
      m.mun_nombre
    FROM usuario_departamento ud
    INNER JOIN departamento d ON d.dep_id = ud.dep_id
    LEFT JOIN usuario_departamento_municipio udm
      ON udm.usr_id = ud.usr_id
     AND udm.dep_id = ud.dep_id
    LEFT JOIN municipio m
      ON m.dep_id = udm.dep_id
     AND m.mun_id = udm.mun_id
    WHERE ud.usr_id = ?
    ORDER BY ud.dep_id ASC, udm.mun_id ASC`,
    [userId]
  );

  const byDepartment = new Map();
  for (const row of rows) {
    const depId = Number(row.dep_id);
    if (!byDepartment.has(depId)) {
      byDepartment.set(depId, {
        depId,
        depNombre: String(row.dep_nombre || ''),
        coverage: String(row.cobertura || 'PARTIAL'),
        municipalityIds: [],
        municipalities: [],
      });
    }

    const target = byDepartment.get(depId);
    const munId = row.mun_id === null || typeof row.mun_id === 'undefined' ? null : Number(row.mun_id);
    if (munId !== null && Number.isInteger(munId)) {
      target.municipalityIds.push(munId);
      target.municipalities.push({
        munId,
        munNombre: String(row.mun_nombre || ''),
      });
    }
  }

  return Array.from(byDepartment.values());
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim() !== '') {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
}

router.get('/roles', async (req, res) => {
  try {
    const roles = await query(
      `SELECT rl_id AS id, rl_nombre AS nombre, COALESCE(rl_estado, 'activo') AS estado
       FROM rol
       WHERE LOWER(COALESCE(rl_estado, 'activo')) = 'activo'
       ORDER BY rl_nombre ASC`
    );

    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/location/departments', async (req, res) => {
  try {
    const rows = await query(
      `SELECT dep_id AS id, dep_nombre AS nombre
       FROM departamento
       ORDER BY dep_id ASC`
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/location/departments/:depId/municipalities', async (req, res) => {
  const depId = Number(req.params.depId);
  if (!Number.isInteger(depId) || depId <= 0) {
    return res.status(400).json({ error: 'Departamento inválido' });
  }

  try {
    const rows = await query(
      `SELECT mun_id AS id, mun_nombre AS nombre
       FROM municipio
       WHERE dep_id = ?
       ORDER BY mun_id ASC`,
      [depId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/settings/payment-reminder-days', async (req, res) => {
  try {
    const days = await getPaymentReminderDaysSetting();
    return res.json({ days });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/settings/payment-reminder-days', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || req.body?.requesterRole || '').toLowerCase();
  const requesterUserId = Number(req.headers['x-user-id'] || req.body?.requesterUserId || 0);
  const requestedDays = req.body?.days;

  if (!canManageGlobalSettings(requesterRole)) {
    return res.status(403).json({ error: 'Solo admin o jefe pueden cambiar los dias de cobro' });
  }

  if (!Number.isFinite(Number(requestedDays))) {
    return res.status(400).json({ error: 'Debes enviar un numero valido de dias' });
  }

  try {
    const days = await updatePaymentReminderDaysSetting(requestedDays, requesterUserId || null);
    return res.json({ success: true, days });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/settings/low-stock-threshold', async (req, res) => {
  try {
    const threshold = await getLowStockThresholdSetting();
    return res.json({ threshold });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/settings/low-stock-threshold', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || req.body?.requesterRole || '').toLowerCase();
  const requesterUserId = Number(req.headers['x-user-id'] || req.body?.requesterUserId || 0);
  const requestedThreshold = req.body?.threshold;

  if (!canManageGlobalSettings(requesterRole)) {
    return res.status(403).json({ error: 'Solo admin o jefe pueden cambiar el minimo de bajo stock' });
  }

  if (!Number.isFinite(Number(requestedThreshold))) {
    return res.status(400).json({ error: 'Debes enviar un numero valido para el minimo de bajo stock' });
  }

  try {
    const threshold = await updateLowStockThresholdSetting(requestedThreshold, requesterUserId || null);
    return res.json({ success: true, threshold });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/settings/roles/screens', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || req.query?.requesterRole || '').toLowerCase();

  if (!canManageRoleScreenPermissions(requesterRole)) {
    return res.status(403).json({ error: 'Solo admin puede gestionar permisos por rol y pantalla' });
  }

  try {
    const rows = await query(
      `SELECT
        r.rl_id AS roleId,
        r.rl_nombre AS roleName,
        COALESCE(r.rl_estado, 'activo') AS roleStatus,
        p.pantalla_id AS screenId,
        p.pantalla_clave AS screenKey,
        p.pantalla_nombre AS screenName,
        p.pantalla_ruta AS screenPath,
        COALESCE(rpp.puede_ver, 0) AS canView
      FROM rol r
      CROSS JOIN pantalla p
      LEFT JOIN rol_pantalla_permiso rpp
        ON rpp.rl_id = r.rl_id
       AND rpp.pantalla_id = p.pantalla_id
      WHERE p.activa = 1
      ORDER BY r.rl_nombre ASC, p.pantalla_id ASC`
    );

    const rolesMap = new Map();

    for (const row of rows) {
      const roleId = Number(row.roleId);
      if (!rolesMap.has(roleId)) {
        rolesMap.set(roleId, {
          roleId,
          roleName: String(row.roleName || ''),
          roleStatus: String(row.roleStatus || 'activo'),
          screens: [],
        });
      }

      rolesMap.get(roleId).screens.push({
        screenId: Number(row.screenId),
        screenKey: String(row.screenKey || ''),
        screenName: String(row.screenName || ''),
        screenPath: String(row.screenPath || ''),
        canView: Number(row.canView || 0) === 1,
      });
    }

    return res.json(Array.from(rolesMap.values()));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/settings/roles/:roleId/screens', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || req.body?.requesterRole || '').toLowerCase();
  const roleId = Number(req.params.roleId);
  const screenPermissions = req.body?.screenPermissions;
  const roleNameRaw = typeof req.body?.roleName === 'string' ? req.body.roleName.trim() : '';

  if (!canManageRoleScreenPermissions(requesterRole)) {
    return res.status(403).json({ error: 'Solo admin puede gestionar permisos por rol y pantalla' });
  }

  if (!Number.isInteger(roleId) || roleId <= 0) {
    return res.status(400).json({ error: 'Rol invalido' });
  }

  if (!Array.isArray(screenPermissions)) {
    return res.status(400).json({ error: 'screenPermissions debe ser un arreglo' });
  }

  try {
    const roleRows = await query('SELECT rl_id, rl_nombre FROM rol WHERE rl_id = ? LIMIT 1', [roleId]);
    if (roleRows.length === 0) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }

    if (roleNameRaw) {
      const duplicate = await query(
        `SELECT rl_id
         FROM rol
         WHERE LOWER(COALESCE(rl_nombre, '')) = LOWER(?)
           AND rl_id <> ?
         LIMIT 1`,
        [roleNameRaw, roleId]
      );

      if (duplicate.length > 0) {
        return res.status(409).json({ error: 'Ya existe otro rol con ese nombre' });
      }

      await query(
        'UPDATE rol SET rl_nombre = ? WHERE rl_id = ?',
        [roleNameRaw, roleId]
      );
    }

    const normalized = [];
    const seenScreens = new Set();

    for (const item of screenPermissions) {
      const screenId = Number(item?.screenId);
      const canView = Boolean(item?.canView);

      if (!Number.isInteger(screenId) || screenId <= 0) {
        return res.status(400).json({ error: 'Pantalla invalida en screenPermissions' });
      }

      if (seenScreens.has(screenId)) {
        return res.status(400).json({ error: 'No se permite repetir pantallas en screenPermissions' });
      }

      seenScreens.add(screenId);
      normalized.push({ screenId, canView: canView ? 1 : 0 });
    }

    if (normalized.length === 0) {
      return res.status(400).json({ error: 'Debes enviar al menos una pantalla para actualizar permisos' });
    }

    const placeholders = normalized.map(() => '?').join(', ');
    const screenRows = await query(
      `SELECT pantalla_id
       FROM pantalla
       WHERE activa = 1
         AND pantalla_id IN (${placeholders})`,
      normalized.map((item) => item.screenId)
    );

    const validScreenIds = new Set(screenRows.map((row) => Number(row.pantalla_id)));
    for (const item of normalized) {
      if (!validScreenIds.has(item.screenId)) {
        return res.status(400).json({ error: `Pantalla no valida o inactiva: ${item.screenId}` });
      }
    }

    await query('DELETE FROM rol_pantalla_permiso WHERE rl_id = ?', [roleId]);

    for (const item of normalized) {
      await query(
        `INSERT INTO rol_pantalla_permiso (rl_id, pantalla_id, puede_ver)
         VALUES (?, ?, ?)`,
        [roleId, item.screenId, item.canView]
      );
    }

    return res.json({
      success: true,
      message: 'Rol y permisos actualizados',
      roleName: roleNameRaw || String(roleRows[0]?.rl_nombre || ''),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/settings/roles', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || req.body?.requesterRole || '').toLowerCase();
  const roleNameRaw = String(req.body?.roleName || '').trim();

  if (!canManageRoleScreenPermissions(requesterRole)) {
    return res.status(403).json({ error: 'Solo admin puede crear roles' });
  }

  if (!roleNameRaw) {
    return res.status(400).json({ error: 'El nombre del rol es requerido' });
  }

  const roleName = roleNameRaw.toLowerCase();

  try {
    const existingRole = await query(
      `SELECT rl_id
       FROM rol
       WHERE LOWER(COALESCE(rl_nombre, '')) = LOWER(?)
       LIMIT 1`,
      [roleName]
    );

    if (existingRole.length > 0) {
      return res.status(409).json({ error: 'Ya existe un rol con ese nombre' });
    }

    const insertResult = await query(
      'INSERT INTO rol (rl_nombre, rl_estado) VALUES (?, ?)',
      [roleName, 'activo']
    );

    const roleId = Number(insertResult.insertId);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return res.status(500).json({ error: 'No se pudo crear el rol' });
    }

    const screens = await query(
      `SELECT pantalla_id, pantalla_ruta
       FROM pantalla
       WHERE activa = 1`
    );

    for (const screen of screens) {
      const screenId = Number(screen.pantalla_id);
      const screenPath = String(screen.pantalla_ruta || '');

      if (!Number.isInteger(screenId) || screenId <= 0 || !screenPath) {
        continue;
      }

      await query(
        `INSERT INTO rol_pantalla_permiso (rl_id, pantalla_id, puede_ver)
         VALUES (?, ?, ?)`,
        [roleId, screenId, getDefaultRoleScreenPermission(roleName, screenPath) ? 1 : 0]
      );
    }

    return res.status(201).json({
      roleId,
      roleName,
      message: 'Rol creado correctamente',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/settings/roles/:roleId/status', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || req.body?.requesterRole || '').toLowerCase();
  const roleId = Number(req.params.roleId);
  const estado = String(req.body?.estado || '').toLowerCase().trim();

  if (!canManageRoleScreenPermissions(requesterRole)) {
    return res.status(403).json({ error: 'Solo admin puede cambiar estado de roles' });
  }

  if (!Number.isInteger(roleId) || roleId <= 0) {
    return res.status(400).json({ error: 'Rol invalido' });
  }

  if (estado !== 'activo' && estado !== 'inactivo') {
    return res.status(400).json({ error: 'Estado invalido. Usa activo o inactivo' });
  }

  try {
    const roleRows = await query('SELECT rl_id, rl_nombre FROM rol WHERE rl_id = ? LIMIT 1', [roleId]);
    if (roleRows.length === 0) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }

    await query(
      'UPDATE rol SET rl_estado = ? WHERE rl_id = ?',
      [estado, roleId]
    );

    return res.json({
      success: true,
      message: 'Estado del rol actualizado',
      roleId,
      estado,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || '').trim();

  if (!normalizedUsername || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  try {
    const users = await query(
      `SELECT
        u.usr_id AS id,
        u.usr_nit AS username,
        TRIM(CONCAT(COALESCE(u.usr_nombre, ''), ' ', COALESCE(u.usr_apellido, ''))) AS display_name,
        COALESCE(r.rl_nombre, 'vendedor') AS role,
        COALESCE(r.rl_estado, 'activo') AS role_status,
        COALESCE(eu.est_nombre, 'activo') AS estado
      FROM usuario u
      LEFT JOIN rol r ON r.rl_id = u.rl_id
      LEFT JOIN estado_usr eu ON eu.est_id = u.est_id
      WHERE u.usr_nit = ? AND u.usr_pass = ?
      LIMIT 1`,
      [normalizedUsername, password]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = users[0];
    if (String(user.estado || '').toLowerCase() === 'inactivo') {
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    if (String(user.role_status || 'activo').toLowerCase() === 'inactivo') {
      return res.status(403).json({ error: 'El rol asignado al usuario esta inactivo' });
    }

    const clientIp = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || '').trim() || null;

    await query(
      `INSERT INTO historial_ingreso_usuario (usr_id, hiu_ip, hiu_user_agent)
       VALUES (?, ?, ?)`,
      [Number(user.id), clientIp, userAgent]
    );

    const allowedPaths = await loadAllowedScreenPathsByUserId(Number(user.id));

    return res.json({
      id: Number(user.id),
      username: String(user.username || normalizedUsername),
      displayName: String(user.display_name || user.username || normalizedUsername),
      role: String(user.role || 'vendedor'),
      allowedPaths,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  const normalizedNit = String(req.body?.nit || '').trim().toUpperCase();

  if (!normalizedNit) {
    return res.status(400).json({ error: 'El NIT es requerido' });
  }

  try {
    const users = await query(
      `SELECT
        usr_nit AS nit,
        usr_correo AS correo,
        usr_pass AS password,
        TRIM(CONCAT(COALESCE(usr_nombre, ''), ' ', COALESCE(usr_apellido, ''))) AS nombre
      FROM usuario
      WHERE UPPER(COALESCE(usr_nit, '')) = ?
      LIMIT 1`,
      [normalizedNit]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'No existe un usuario registrado con ese NIT' });
    }

    const user = users[0];
    const userEmail = String(user.correo || '').trim();
    const userPassword = String(user.password || '').trim();
    const userName = String(user.nombre || normalizedNit).trim();

    if (!userEmail) {
      return res.status(400).json({ error: 'El usuario no tiene correo registrado en la base de datos' });
    }

    const { transporter: smtpTransporter, info } = await getEmailTransporter();
    const fromEmail = String(process.env.SMTP_FROM || process.env.SMTP_USER || info?.defaultFrom || '').trim();

    const mailInfo = await smtpTransporter.sendMail({
      from: fromEmail,
      to: userEmail,
      subject: 'Recuperacion de acceso - Sistema de Gestion',
      text: `Hola ${userName},\n\nRecibimos una solicitud de recuperacion para el usuario con NIT ${normalizedNit}.\n\nTu contrasena actual es: ${userPassword}\n\nSi no solicitaste este correo, ignora este mensaje.`,
      html: `<p>Hola <strong>${userName}</strong>,</p><p>Recibimos una solicitud de recuperacion para el usuario con NIT <strong>${normalizedNit}</strong>.</p><p>Tu contrasena actual es: <strong>${userPassword}</strong></p><p>Si no solicitaste este correo, ignora este mensaje.</p>`,
    });

    const previewUrl = nodemailer.getTestMessageUrl(mailInfo);

    return res.json({
      success: true,
      message:
        info?.mode === 'ethereal'
          ? `Correo de prueba generado para ${userEmail}. Revisa previewUrl para ver el mensaje.`
          : `Se envio un correo a ${userEmail} con la contrasena registrada`,
      previewUrl: previewUrl || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/me/password', async (req, res) => {
  const requesterId = Number(req.headers['x-user-id'] || req.body?.userId || 0);
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (!requesterId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseña actual y nueva contraseña son requeridas' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
  }

  try {
    const users = await query('SELECT usr_pass FROM usuario WHERE usr_id = ? LIMIT 1', [requesterId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (String(users[0].usr_pass || '') !== currentPassword) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    }

    await query('UPDATE usuario SET usr_pass = ? WHERE usr_id = ?', [newPassword, requesterId]);
    return res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await query(
      `SELECT
        u.usr_id AS id,
        UPPER(u.usr_nombre) AS nombres,
        UPPER(u.usr_apellido) AS apellidos,
        u.usr_correo AS correo,
        COALESCE(u.usr_telefono, '') AS telefono,
        COALESCE(r.rl_nombre, 'vendedor') AS rol,
        UPPER(COALESCE(u.usr_nit, '')) AS usuario,
        u.est_id AS est_id,
        COALESCE(eu.est_nombre, 'activo') AS estado
      FROM usuario u
      LEFT JOIN rol r ON r.rl_id = u.rl_id
      LEFT JOIN estado_usr eu ON eu.est_id = u.est_id
      ORDER BY u.usr_id DESC`
    );

    res.json(users.map(normalizeUserRow));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users', async (req, res) => {
  const { nombres, apellidos, correo, telefono, rol, usuario, password, createdByUserId, createdByUsername, coverageAssignments } = req.body;
  const creatorFromHeader = req.headers['x-user-id'];

  if (!nombres || !apellidos || !correo || !password) {
    return res.status(400).json({ error: 'Nombres, apellidos, correo y password son requeridos' });
  }

  try {
    const normalizedCoverageAssignments = await normalizeCoverageAssignments(coverageAssignments);
    const roleId = await getRoleIdByName(rol || 'vendedor');
    const estadoId = await getEstadoUsuarioId();
    const creatorId = await getCreatorUserId({
      createdByUserId: creatorFromHeader ?? createdByUserId,
      createdByUsername,
    });
    const targetRole = String(rol || 'vendedor').toLowerCase().trim();

    if (!creatorId) {
      return res.status(400).json({ error: 'No se pudo identificar el usuario logeado para usr_id_creacion' });
    }

    const creatorRole = await getUserRoleNameById(creatorId);
    if (isAdminRole(targetRole) && !isAdminRole(creatorRole)) {
      return res.status(403).json({ error: 'Solo un administrador puede crear usuarios administradores' });
    }

    await query(
      'INSERT INTO usuario (usr_nombre, usr_apellido, usr_correo, usr_telefono, usr_nit, usr_pass, rl_id, est_id, usr_id_creacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [String(nombres).toUpperCase(), String(apellidos).toUpperCase(), correo, telefono || null, String(usuario || '').toUpperCase(), password, roleId, estadoId, creatorId]
    );

    const created = await query('SELECT LAST_INSERT_ID() AS id');
    const createdId = Number(created[0].id);

    if (normalizedCoverageAssignments.length > 0) {
      await saveUserCoverageAssignments(createdId, normalizedCoverageAssignments);
    }

    res.status(201).json({
      id: String(createdId),
      nombres,
      apellidos,
      correo,
      telefono: telefono || '',
      rol: rol || 'vendedor',
      usuario: usuario || '',
      coverageAssignments: normalizedCoverageAssignments,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const users = await query(
      `SELECT
        u.usr_id AS id,
        UPPER(u.usr_nombre) AS nombres,
        UPPER(u.usr_apellido) AS apellidos,
        u.usr_correo AS correo,
        COALESCE(u.usr_telefono, '') AS telefono,
        COALESCE(r.rl_nombre, 'vendedor') AS rol,
        UPPER(COALESCE(u.usr_nit, '')) AS usuario,
        u.est_id AS est_id,
        COALESCE(eu.est_nombre, 'activo') AS estado,
        u.fecha_creacion AS fecha_creacion,
        UPPER(COALESCE(creator.usr_nombre, '')) AS creado_por
      FROM usuario u
      LEFT JOIN rol r ON r.rl_id = u.rl_id
      LEFT JOIN estado_usr eu ON eu.est_id = u.est_id
      LEFT JOIN usuario creator ON creator.usr_id = u.usr_id_creacion
      WHERE u.usr_id = ?`,
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const normalized = normalizeUserRow(users[0]);
    const coverageAssignments = await loadUserCoverageAssignments(Number(req.params.id));
    res.json({
      ...normalized,
      coverageAssignments,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id', async (req, res) => {
  const { nombres, apellidos, correo, telefono, rol, usuario, password, coverageAssignments } = req.body;

  try {
    const hasCoverageAssignments = typeof coverageAssignments !== 'undefined';
    const normalizedCoverageAssignments = hasCoverageAssignments
      ? await normalizeCoverageAssignments(coverageAssignments)
      : null;

    const setClauses = [];
    const params = [];

    if (typeof nombres !== 'undefined' && nombres !== '') {
      setClauses.push('usr_nombre = ?');
      params.push(String(nombres).toUpperCase());
    }

    if (typeof apellidos !== 'undefined' && apellidos !== '') {
      setClauses.push('usr_apellido = ?');
      params.push(String(apellidos).toUpperCase());
    }

    if (typeof correo !== 'undefined' && correo !== '') {
      setClauses.push('usr_correo = ?');
      params.push(correo);
    }

    if (typeof telefono !== 'undefined') {
      setClauses.push('usr_telefono = ?');
      params.push(telefono || null);
    }

    if (typeof usuario !== 'undefined' && usuario !== '') {
      setClauses.push('usr_nit = ?');
      params.push(String(usuario).toUpperCase());
    }

    if (typeof password !== 'undefined' && password !== '') {
      setClauses.push('usr_pass = ?');
      params.push(password);
    }

    if (typeof rol !== 'undefined' && rol !== '') {
      const roleId = await getRoleIdByName(rol);
      setClauses.push('rl_id = ?');
      params.push(roleId);
    }

    if (setClauses.length === 0 && !hasCoverageAssignments) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    if (setClauses.length > 0) {
      params.push(req.params.id);

      await query(
        `UPDATE usuario SET ${setClauses.join(', ')} WHERE usr_id = ?`,
        params
      );
    }

    if (hasCoverageAssignments) {
      await saveUserCoverageAssignments(Number(req.params.id), normalizedCoverageAssignments || []);
    }

    res.json({ message: 'Usuario actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id/status', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || req.body?.requesterRole || '').toLowerCase();
  if (!canManageUserStatusRole(requesterRole)) {
    return res.status(403).json({ error: 'Solo admin o jefe puede cambiar el estado del usuario' });
  }

  const estadoSolicitado = String(req.body?.estado || '').toLowerCase();
  if (estadoSolicitado !== 'activo' && estadoSolicitado !== 'inactivo') {
    return res.status(400).json({ error: 'Estado inválido. Usa activo o inactivo' });
  }

  try {
    const estadoId = await getEstadoUsuarioIdByName(estadoSolicitado);
    await query('UPDATE usuario SET est_id = ? WHERE usr_id = ?', [estadoId, req.params.id]);

    res.json({ message: 'Estado de usuario actualizado', est_id: estadoId, estado: estadoSolicitado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users/:id/login-history', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || '').toLowerCase();
  if (!isAdminRole(requesterRole)) {
    return res.status(403).json({ error: 'Solo el administrador puede consultar el historial de ingreso' });
  }

  const userId = Number(req.params.id);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);

  if (!userId) {
    return res.status(400).json({ error: 'ID de usuario inválido' });
  }

  try {
    const history = await query(
      `SELECT
        hiu_id AS id,
        usr_id,
        hiu_fecha_ingreso AS fecha_ingreso,
        COALESCE(hiu_ip, '') AS ip,
        COALESCE(hiu_user_agent, '') AS user_agent
      FROM historial_ingreso_usuario
      WHERE usr_id = ?
      ORDER BY hiu_fecha_ingreso DESC
      LIMIT ?`,
      [userId, limit]
    );

    return res.json(history);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || req.body?.requesterRole || '').toLowerCase();
  if (!canManageUserStatusRole(requesterRole)) {
    return res.status(403).json({ error: 'Solo admin o jefe puede inactivar usuarios' });
  }

  try {
    const estadoInactivoId = await getEstadoUsuarioIdByName('inactivo');
    await query('UPDATE usuario SET est_id = ? WHERE usr_id = ?', [estadoInactivoId, req.params.id]);
    res.json({ message: 'Usuario inactivado', est_id: estadoInactivoId, estado: 'inactivo' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
