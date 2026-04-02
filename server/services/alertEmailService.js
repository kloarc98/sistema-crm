import { Resend } from 'resend';
import { query } from '../db.js';

const GLOBAL_SETTINGS_TABLE = 'app_setting';
const PAYMENT_REMINDER_DAYS_SETTING_KEY = 'payment_reminder_days';
const DEFAULT_PAYMENT_REMINDER_DAYS = 7;
const NOTIFICATION_EVENTS_TABLE = 'notification_email_event';

let resendClient = null;
let overdueSchedulerId = null;

function formatStockAlertSourceLabel(source) {
  const normalized = String(source || '').trim().toLowerCase();

  if (normalized === 'pedido') {
    return 'Movimiento por pedido';
  }
  if (normalized === 'creacion_producto') {
    return 'Creacion de producto';
  }
  if (normalized === 'actualizacion_producto') {
    return 'Actualizacion de producto';
  }
  if (normalized === 'debug') {
    return 'Prueba manual';
  }

  return 'Actualizacion';
}

function isValidEmailAddress(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function getResendClient() {
  if (resendClient) {
    return resendClient;
  }

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Configuracion incompleta. Define RESEND_API_KEY en server/.env');
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

function getResendFrom() {
  const fromEmail = String(process.env.RESEND_FROM || '').trim();
  if (!fromEmail) {
    throw new Error('Configuracion incompleta. Define RESEND_FROM en server/.env');
  }
  return fromEmail;
}

export function maskEmailForPrivacy(email) {
  const normalized = String(email || '').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 1)}***${normalized.slice(-1)}`;
  }

  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

function normalizeReminderDays(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_PAYMENT_REMINDER_DAYS;
  }

  const rounded = Math.round(numeric);
  if (rounded < 1) {
    return 1;
  }

  if (rounded > 365) {
    return 365;
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
    return DEFAULT_PAYMENT_REMINDER_DAYS;
  }

  return normalizeReminderDays(rows[0]?.setting_value);
}

async function ensureNotificationEventsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS ${NOTIFICATION_EVENTS_TABLE} (
      event_key VARCHAR(190) PRIMARY KEY,
      event_type VARCHAR(80) NOT NULL,
      event_data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`
  );
}

async function hasNotificationEvent(eventKey) {
  await ensureNotificationEventsTable();

  const rows = await query(
    `SELECT event_key
     FROM ${NOTIFICATION_EVENTS_TABLE}
     WHERE event_key = ?
     LIMIT 1`,
    [eventKey]
  );

  return rows.length > 0;
}

async function upsertNotificationEvent(eventKey, eventType, eventData) {
  await ensureNotificationEventsTable();

  await query(
    `INSERT INTO ${NOTIFICATION_EVENTS_TABLE} (event_key, event_type, event_data)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       event_type = VALUES(event_type),
       event_data = VALUES(event_data)`,
    [eventKey, eventType, eventData || null]
  );
}

async function deleteNotificationEvent(eventKey) {
  await ensureNotificationEventsTable();
  await query(`DELETE FROM ${NOTIFICATION_EVENTS_TABLE} WHERE event_key = ?`, [eventKey]);
}

async function listNotificationEventKeysByPrefix(prefix) {
  await ensureNotificationEventsTable();

  const rows = await query(
    `SELECT event_key
     FROM ${NOTIFICATION_EVENTS_TABLE}
     WHERE event_key LIKE ?`,
    [`${prefix}%`]
  );

  return rows.map((row) => String(row.event_key || '')).filter((value) => value !== '');
}

async function loadAdminAndJefeRecipients() {
  const rows = await query(
    `SELECT DISTINCT
       TRIM(COALESCE(u.usr_correo, '')) AS email,
       TRIM(CONCAT(COALESCE(u.usr_nombre, ''), ' ', COALESCE(u.usr_apellido, ''))) AS full_name,
       LOWER(COALESCE(r.rl_nombre, '')) AS role_name
     FROM usuario u
     LEFT JOIN rol r ON r.rl_id = u.rl_id
     LEFT JOIN estado_usr eu ON eu.est_id = u.est_id
     WHERE TRIM(COALESCE(u.usr_correo, '')) <> ''
       AND LOWER(COALESCE(eu.est_nombre, 'activo')) = 'activo'
       AND LOWER(COALESCE(r.rl_estado, 'activo')) = 'activo'
       AND (
         LOWER(COALESCE(r.rl_nombre, '')) = 'admin'
         OR LOWER(COALESCE(r.rl_nombre, '')) LIKE '%admin%'
         OR LOWER(COALESCE(r.rl_nombre, '')) = 'jefe'
         OR LOWER(COALESCE(r.rl_nombre, '')) LIKE '%jefe%'
       )`
  );

  const recipients = rows
    .map((row) => ({
      email: String(row.email || '').trim(),
      fullName: String(row.full_name || '').trim(),
      roleName: String(row.role_name || '').trim(),
    }))
    .filter((row) => row.email !== '' && isValidEmailAddress(row.email));

  return recipients;
}

async function sendEmailToAdminAndJefe({ subject, text, html }) {
  const recipients = await loadAdminAndJefeRecipients();
  if (recipients.length === 0) {
    return { delivered: false, reason: 'no-recipients' };
  }

  const resend = getResendClient();
  const from = getResendFrom();
  const to = recipients.map((entry) => entry.email);

  const sendResult = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html,
  });

  if (sendResult?.error) {
    throw new Error(String(sendResult.error.message || 'No se pudo enviar correo con Resend'));
  }

  return { delivered: true, recipients: to.length };
}

async function cleanupOldDailyDigestEvents() {
  await ensureNotificationEventsTable();
  await query(
    `DELETE FROM ${NOTIFICATION_EVENTS_TABLE}
     WHERE event_type = ?
       AND created_at < DATE_SUB(NOW(), INTERVAL 45 DAY)`,
    ['overdue-digest']
  );
}

async function resolveProductNameById(productId, fallbackName) {
  const safeFallback = String(fallbackName || `Producto #${Number(productId || 0)}`);

  if (safeFallback && !safeFallback.startsWith('Producto #')) {
    return safeFallback;
  }

  const rows = await query(
    `SELECT COALESCE(prod_nombre, '') AS name
     FROM producto
     WHERE prod_id = ?
     LIMIT 1`,
    [Number(productId || 0)]
  );

  if (rows.length === 0) {
    return safeFallback;
  }

  const resolved = String(rows[0].name || '').trim();
  return resolved || safeFallback;
}

export async function notifyNoStockToAdminAndJefe({
  productId,
  productName,
  previousStock,
  newStock,
  source,
}) {
  const normalizedProductId = Number(productId || 0);
  const normalizedNewStock = Number(newStock || 0);
  const normalizedPreviousStock =
    previousStock === null || typeof previousStock === 'undefined' ? null : Number(previousStock);

  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
    return;
  }

  if (normalizedNewStock !== 0) {
    if (normalizedPreviousStock !== null && normalizedPreviousStock > 0) {
      await deleteNotificationEvent(`stock-zero:${normalizedProductId}`);
    }
    return;
  }

  const alreadyNotified = await hasNotificationEvent(`stock-zero:${normalizedProductId}`);
  if (alreadyNotified) {
    return;
  }

  const safeProductName = await resolveProductNameById(normalizedProductId, productName);
  const triggerLabel = formatStockAlertSourceLabel(source);

  const subject = `Alerta: producto sin stock (${safeProductName})`;
  const text = `El producto ${safeProductName} (ID ${normalizedProductId}) quedo sin stock.\nStock anterior: ${normalizedPreviousStock ?? 'N/A'}\nStock actual: ${normalizedNewStock}\nOrigen: ${triggerLabel}.`;
  const html = `<p>El producto <strong>${safeProductName}</strong> (ID ${normalizedProductId}) quedo sin stock.</p><p>Stock anterior: <strong>${normalizedPreviousStock ?? 'N/A'}</strong><br/>Stock actual: <strong>${normalizedNewStock}</strong><br/>Origen: <strong>${triggerLabel}</strong></p>`;

  const delivery = await sendEmailToAdminAndJefe({ subject, text, html });
  if (!delivery?.delivered) {
    return;
  }

  await upsertNotificationEvent(
    `stock-zero:${normalizedProductId}`,
    'stock-zero',
    JSON.stringify({ productId: normalizedProductId, productName: safeProductName, source: triggerLabel })
  );
}

function mapOverdueOrderRow(row) {
  const id = Number(row?.id || 0);
  const pending = Number(row?.pending || 0);
  const daysPending = Number(row?.days_pending || 0);
  return {
    id,
    clientName: String(row?.client_name || 'Cliente sin nombre'),
    pending,
    daysPending,
  };
}

async function loadOverdueOrders(reminderDays) {
  const rows = await query(
    `SELECT
       p.ped_id AS id,
       COALESCE(c.cli_nombre_empresa, 'Cliente sin nombre') AS client_name,
       COALESCE(p.ped_saldo_pen, 0) AS pending,
       TIMESTAMPDIFF(DAY, p.fecha_creacion, NOW()) AS days_pending
     FROM pedidos p
     LEFT JOIN cliente c ON c.cli_id = p.cli_id
     LEFT JOIN estado_pedido ep ON ep.est_ped_id = p.est_ped_id
     WHERE COALESCE(p.ped_saldo_pen, 0) > 0
       AND LOWER(COALESCE(ep.est_ped_nombre, 'pendiente')) NOT LIKE 'cancel%'
       AND TIMESTAMPDIFF(DAY, p.fecha_creacion, NOW()) >= ?
     ORDER BY days_pending DESC, p.ped_id DESC`,
    [Number(reminderDays || DEFAULT_PAYMENT_REMINDER_DAYS)]
  );

  return rows.map(mapOverdueOrderRow).filter((row) => row.id > 0 && row.pending > 0.00001);
}

export async function notifyOverdueOrdersToAdminAndJefe() {
  await cleanupOldDailyDigestEvents();

  const reminderDays = await getPaymentReminderDaysSetting();
  const overdueOrders = await loadOverdueOrders(reminderDays);

  if (overdueOrders.length === 0) {
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const dailyEventKey = `overdue-digest:${today}`;
  const alreadySentToday = await hasNotificationEvent(dailyEventKey);
  if (alreadySentToday) {
    return;
  }

  const groupedByClient = new Map();
  for (const order of overdueOrders) {
    const key = String(order.clientName || 'Cliente sin nombre').trim().toUpperCase();
    const current = groupedByClient.get(key);
    if (!current) {
      groupedByClient.set(key, {
        clientName: String(order.clientName || 'Cliente sin nombre'),
        maxDaysPending: Number(order.daysPending || 0),
        totalPending: Number(order.pending || 0),
        orderCount: 1,
      });
      continue;
    }

    current.maxDaysPending = Math.max(Number(current.maxDaysPending || 0), Number(order.daysPending || 0));
    current.totalPending += Number(order.pending || 0);
    current.orderCount += 1;
  }

  const clients = Array.from(groupedByClient.values()).sort(
    (a, b) => Number(b.maxDaysPending || 0) - Number(a.maxDaysPending || 0)
  );

  const subject = `Alerta diaria: ${clients.length} cliente(s) vencidos`;
  const textLines = clients.map(
    (entry) =>
      `${entry.clientName} | Dias vencido: ${entry.maxDaysPending} | Saldo pendiente: Q${Number(entry.totalPending || 0).toFixed(2)} | Pedidos: ${entry.orderCount}`
  );
  const text = `Resumen diario de clientes vencidos (umbral: ${reminderDays} dias).\n\n${textLines.join('\n')}`;
  const html = `<p>Resumen diario de clientes vencidos (umbral: <strong>${reminderDays} dias</strong>).</p><ul>${clients
    .map(
      (entry) =>
        `<li>Cliente: <strong>${entry.clientName}</strong> | Dias vencido: <strong>${entry.maxDaysPending}</strong> | Saldo pendiente: <strong>Q${Number(entry.totalPending || 0).toFixed(2)}</strong> | Pedidos: <strong>${entry.orderCount}</strong></li>`
    )
    .join('')}</ul>`;

  const delivery = await sendEmailToAdminAndJefe({ subject, text, html });
  if (!delivery?.delivered) {
    return;
  }

  await upsertNotificationEvent(
    dailyEventKey,
    'overdue-digest',
    JSON.stringify({
      day: today,
      reminderDays,
      clients: clients.length,
      orders: overdueOrders.length,
    })
  );
}

export function startAdminAndJefeOverdueScheduler() {
  if (overdueSchedulerId) {
    return;
  }

  const intervalMinutes = Math.max(5, Number(process.env.ALERT_CHECK_INTERVAL_MINUTES || 30));
  const run = async () => {
    try {
      await notifyOverdueOrdersToAdminAndJefe();
    } catch (error) {
      console.error('Error enviando alertas de vencidos:', error.message);
    }
  };

  void run();
  overdueSchedulerId = setInterval(run, intervalMinutes * 60 * 1000);
}
