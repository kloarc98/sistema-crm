import express from 'express';
import { query } from '../db.js';
import pool from '../db.js';
import {
  emitOrderCancelled,
  emitOrderCreated,
  emitOrderUpdated,
  emitStockChanged,
} from '../realtime.js';
import {
  notifyNoStockToAdminAndJefe,
  notifyOverdueOrdersToAdminAndJefe,
} from '../services/alertEmailService.js';

const router = express.Router();

async function triggerStockAndOverdueEmailAlerts(changes = []) {
  try {
    if (Array.isArray(changes) && changes.length > 0) {
      for (const change of changes) {
        await notifyNoStockToAdminAndJefe({
          productId: Number(change.productId || 0),
          productName: `Producto #${Number(change.productId || 0)}`,
          previousStock: Number(change.previousStock || 0),
          newStock: Number(change.newStock || 0),
          source: 'pedido',
        });
      }
    }

    await notifyOverdueOrdersToAdminAndJefe();
  } catch (error) {
    console.error('Error enviando alertas por correo (pedidos):', error.message);
  }
}

async function tableExists(tableName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function columnExistsWithConnection(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function insertOrderAction(connection, {
  orderId,
  phaseId,
  userId,
  action,
  description,
}) {
  await connection.execute(
    `INSERT INTO historial_acciones_pedido (ped_id, est_ped_id, usr_id, hap_accion, hap_descripcion)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, phaseId ?? null, userId ?? null, action, description || null]
  );
}

async function getEstadoPedidoNameById(connection, estadoId) {
  if (!estadoId) {
    return 'pendiente';
  }

  const [rows] = await connection.execute(
    'SELECT est_ped_nombre FROM estado_pedido WHERE est_ped_id = ? LIMIT 1',
    [estadoId]
  );

  if (rows.length > 0) {
    return String(rows[0].est_ped_nombre || 'pendiente');
  }

  return 'pendiente';
}

async function ensureEstadoPedidoByName(connection, statusName, preferredId = null) {
  const [rows] = await connection.execute(
    'SELECT est_ped_id FROM estado_pedido WHERE LOWER(est_ped_nombre) = LOWER(?) LIMIT 1',
    [statusName]
  );

  if (rows.length > 0) {
    return Number(rows[0].est_ped_id);
  }

  if (Number.isInteger(preferredId) && preferredId > 0) {
    const [preferredRows] = await connection.execute(
      'SELECT est_ped_id FROM estado_pedido WHERE est_ped_id = ? LIMIT 1',
      [preferredId]
    );

    if (preferredRows.length === 0) {
      await connection.execute(
        'INSERT INTO estado_pedido (est_ped_id, est_ped_nombre) VALUES (?, ?)',
        [preferredId, statusName]
      );
      return preferredId;
    }
  }

  const [result] = await connection.execute(
    'INSERT INTO estado_pedido (est_ped_nombre) VALUES (?)',
    [statusName]
  );

  return Number(result.insertId);
}

async function getEstadoPedidoIdByName(statusName) {
  if (!statusName) {
    return null;
  }

  const rows = await query(
    'SELECT est_ped_id FROM estado_pedido WHERE LOWER(est_ped_nombre) = LOWER(?) LIMIT 1',
    [statusName]
  );

  if (rows.length > 0) {
    return Number(rows[0].est_ped_id);
  }

  const fallback = await query('SELECT est_ped_id FROM estado_pedido ORDER BY est_ped_id ASC LIMIT 1');
  if (fallback.length > 0) {
    return Number(fallback[0].est_ped_id);
  }

  return null;
}

async function ensureEstadoPedidoPhaseGlobal(phase) {
  const phaseNumber = Number(phase);
  if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 3) {
    throw new Error('La fase de pedido debe ser 1, 2 o 3');
  }

  const existingRows = await query(
    'SELECT est_ped_id FROM estado_pedido WHERE est_ped_id = ? LIMIT 1',
    [phaseNumber]
  );

  if (existingRows.length > 0) {
    return phaseNumber;
  }

  await query(
    'INSERT INTO estado_pedido (est_ped_id, est_ped_nombre) VALUES (?, ?)',
    [phaseNumber, `FASE ${phaseNumber}`]
  );

  return phaseNumber;
}

async function ensureEstadoPedidoPhase(phase, connection) {
  const phaseNumber = Number(phase);
  if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 3) {
    throw new Error('La fase de pedido debe ser 1, 2 o 3');
  }

  const [existingRows] = await connection.execute(
    'SELECT est_ped_id FROM estado_pedido WHERE est_ped_id = ? LIMIT 1',
    [phaseNumber]
  );

  if (existingRows.length > 0) {
    return phaseNumber;
  }

  await connection.execute(
    'INSERT INTO estado_pedido (est_ped_id, est_ped_nombre) VALUES (?, ?)',
    [phaseNumber, `FASE ${phaseNumber}`]
  );

  return phaseNumber;
}

async function generateUniquePedidoId(connection) {
  let attempts = 0;

  while (attempts < 200) {
    const generatedId = Math.floor(1000 + Math.random() * 9000);
    const [rows] = await connection.execute(
      'SELECT ped_id FROM pedidos WHERE ped_id = ? LIMIT 1',
      [generatedId]
    );

    if (rows.length === 0) {
      return generatedId;
    }

    attempts += 1;
  }

  throw new Error('No fue posible generar un ID único para el pedido');
}

function parseOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('El pedido debe incluir al menos un producto');
  }

  const parsedItems = items
    .map((item) => ({
      prod_id: Number(item?.prod_id),
      det_cantidad: Number(item?.det_cantidad),
      det_precio_unitario: Number(item?.det_precio_unitario),
    }))
    .filter(
      (item) =>
        Number.isInteger(item.prod_id) &&
        item.prod_id > 0 &&
        Number.isFinite(item.det_cantidad) &&
        item.det_cantidad > 0 &&
        Number.isFinite(item.det_precio_unitario) &&
        item.det_precio_unitario >= 0
    );

  if (parsedItems.length !== items.length) {
    throw new Error('Hay productos inválidos en el detalle del pedido');
  }

  return parsedItems;
}

async function adjustProductStock(connection, productId, deltaQuantity) {
  if (!deltaQuantity) {
    return null;
  }

  const [rows] = await connection.execute(
    'SELECT prod_stock FROM producto WHERE prod_id = ? LIMIT 1 FOR UPDATE',
    [productId]
  );

  if (rows.length === 0) {
    throw new Error(`Producto ${productId} no existe`);
  }

  const currentStock = Number(rows[0].prod_stock || 0);
  const updatedStock = currentStock + Number(deltaQuantity);

  if (updatedStock < 0) {
    throw new Error(`Stock insuficiente para producto ${productId}`);
  }

  await connection.execute(
    'UPDATE producto SET prod_stock = ? WHERE prod_id = ?',
    [updatedStock, productId]
  );

  return {
    productId: Number(productId),
    previousStock: currentStock,
    newStock: updatedStock,
    deltaQuantity: Number(deltaQuantity),
  };
}

function toStockAdjustmentPayload(change) {
  return {
    productId: Number(change.productId),
    previousStock: Number(change.previousStock || 0),
    newStock: Number(change.newStock || 0),
    deltaQuantity: Number(change.deltaQuantity || 0),
  };
}

function accumulateStockChange(changesMap, change) {
  if (!change) {
    return;
  }

  const normalized = toStockAdjustmentPayload(change);
  const current = changesMap.get(normalized.productId);

  if (!current) {
    changesMap.set(normalized.productId, normalized);
    return;
  }

  current.newStock = normalized.newStock;
  current.deltaQuantity += normalized.deltaQuantity;
}

function buildStockEventPayload({ orderId, action, actorUserId, changes }) {
  return {
    orderId: Number(orderId),
    action,
    actorUserId: actorUserId ? Number(actorUserId) : null,
    emittedAt: new Date().toISOString(),
    changes: changes.map(toStockAdjustmentPayload),
  };
}

function buildOrderEventPayload({ orderId, action, phase, total, userId, clientId = null }) {
  return {
    orderId: Number(orderId),
    action,
    phase: phase === null || typeof phase === 'undefined' ? null : Number(phase),
    total: Number(total || 0),
    userId: userId ? Number(userId) : null,
    clientId: clientId ? Number(clientId) : null,
    emittedAt: new Date().toISOString(),
  };
}

function parseReciboValue(recibo) {
  if (recibo === null || typeof recibo === 'undefined' || recibo === '') {
    return null;
  }

  if (Buffer.isBuffer(recibo)) {
    return recibo;
  }

  if (typeof recibo === 'string') {
    return Buffer.from(recibo, 'base64');
  }

  return null;
}

async function getProductNamesByIds(connection, productIds) {
  const ids = Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) {
    return new Map();
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT prod_id, prod_nombre FROM producto WHERE prod_id IN (${placeholders})`,
    ids
  );

  const names = new Map();
  for (const row of rows) {
    names.set(Number(row.prod_id), String(row.prod_nombre || `Producto #${row.prod_id}`));
  }
  return names;
}

function buildItemsMap(items) {
  const map = new Map();
  for (const item of items) {
    const productId = Number(item.prod_id);
    const qty = Number(item.det_cantidad || 0);
    const unitPrice = Number(item.det_precio_unitario || 0);

    const existing = map.get(productId);
    if (existing) {
      existing.qty += qty;
      existing.unitPrice = unitPrice;
    } else {
      map.set(productId, { qty, unitPrice });
    }
  }
  return map;
}

function formatProductLine(name, productId, qty, unitPrice) {
  return `- ${name} (ID ${productId}): ${qty} x Q${Number(unitPrice || 0).toFixed(2)}`;
}

async function buildCreatedOrderProductsDescription(connection, items) {
  const itemMap = buildItemsMap(items);
  const productIds = Array.from(itemMap.keys());
  const productNames = await getProductNamesByIds(connection, productIds);

  const lines = productIds.map((productId) => {
    const item = itemMap.get(productId);
    const name = productNames.get(productId) || `Producto #${productId}`;
    return formatProductLine(name, productId, item.qty, item.unitPrice);
  });

  if (lines.length === 0) {
    return '';
  }

  return `Productos ingresados:\n${lines.join('\n')}`;
}

async function buildDetailUpdateDescription(connection, currentItems, nextItems) {
  const currentMap = buildItemsMap(currentItems);
  const nextMap = buildItemsMap(nextItems);
  const allProductIds = Array.from(new Set([...currentMap.keys(), ...nextMap.keys()]));
  const productNames = await getProductNamesByIds(connection, allProductIds);

  const added = [];
  const modified = [];

  for (const productId of allProductIds) {
    const before = currentMap.get(productId);
    const after = nextMap.get(productId);
    const name = productNames.get(productId) || `Producto #${productId}`;

    if (!before && after) {
      added.push(formatProductLine(name, productId, after.qty, after.unitPrice));
      continue;
    }

    if (before && after) {
      const qtyChanged = Number(before.qty) !== Number(after.qty);
      const priceChanged = Number(before.unitPrice) !== Number(after.unitPrice);

      if (qtyChanged || priceChanged) {
        modified.push(
          `- ${name} (ID ${productId}): Cantidad ${before.qty} -> ${after.qty}, Precio Q${Number(before.unitPrice || 0).toFixed(2)} -> Q${Number(after.unitPrice || 0).toFixed(2)}`
        );
      }
    }
  }

  const sections = [];
  if (added.length > 0) {
    sections.push(`Productos agregados:\n${added.join('\n')}`);
  }
  if (modified.length > 0) {
    sections.push(`Productos modificados:\n${modified.join('\n')}`);
  }

  if (sections.length === 0) {
    return 'Se actualizó el detalle de productos del pedido';
  }

  return `Se actualizó el detalle de productos del pedido\n${sections.join('\n\n')}`;
}

router.get('/', async (req, res) => {
  try {
    const [hasShippingProviderId, hasShippingGuide, hasShippingProvidersTable, hasDetallePedidoTable, hasSaldoPag, hasSaldoPen, hasRecibo] = await Promise.all([
      columnExists('pedidos', 'proveedor_envio_id'),
      columnExists('pedidos', 'ped_guia'),
      tableExists('proveedor_envio'),
      tableExists('detalle_pedido'),
      columnExists('pedidos', 'ped_saldo_pag'),
      columnExists('pedidos', 'ped_saldo_pen'),
      columnExists('pedidos', 'ped_recibo'),
    ]);

    const orderDetailTable = hasDetallePedidoTable ? 'detalle_pedido' : 'pedido_detalle';

    const shippingProviderIdSelect = hasShippingProviderId
      ? 'p.proveedor_envio_id'
      : 'NULL';
    const shippingProviderNameSelect = hasShippingProviderId && hasShippingProvidersTable
      ? 'pe.prov_envio_nombre'
      : "''";
    const shippingGuideSelect = hasShippingGuide ? 'p.ped_guia' : "''";
    const saldoPagSelect = hasSaldoPag ? 'p.ped_saldo_pag' : '0';
    const saldoPenSelect = hasSaldoPen ? 'p.ped_saldo_pen' : '0';
    const reciboSelect = hasRecibo ? 'p.ped_recibo' : 'NULL';
    const shippingProviderJoin = hasShippingProviderId && hasShippingProvidersTable
      ? 'LEFT JOIN proveedor_envio pe ON pe.prov_envio_id = p.proveedor_envio_id'
      : '';

    const includeCancelled =
      String(req.query.includeCancelled || '').toLowerCase() === 'true' ||
      String(req.query.includeCancelled || '') === '1';

    const cancelledFilter = includeCancelled
      ? ''
      : "WHERE LOWER(COALESCE(ep.est_ped_nombre, 'pendiente')) NOT LIKE 'cancel%'";

    const orders = await query(
      `SELECT
        p.ped_id AS id,
        p.usr_id AS user_id,
        TRIM(CONCAT(COALESCE(u.usr_nombre, ''), ' ', COALESCE(u.usr_apellido, ''))) AS user_name,
        p.cli_id AS cli_id,
        COALESCE(c.cli_nombre_empresa, '') AS client_name,
        COALESCE(c.cli_direccion, '') AS client_address,
        COALESCE(c.cli_telefono, '') AS client_phone,
        COALESCE(c.cli_correo, '') AS client_email,
        p.est_ped_id AS phase,
        p.ped_monto_tot AS total,
        ${saldoPagSelect} AS ped_saldo_pag,
        ${saldoPenSelect} AS ped_saldo_pen,
        ${reciboSelect} AS ped_recibo,
        COALESCE(ep.est_ped_nombre, 'pendiente') AS status,
        ${shippingProviderIdSelect} AS shipping_provider_id,
        ${shippingProviderNameSelect} AS shipping_provider_name,
        ${shippingGuideSelect} AS shipping_guide,
        p.fecha_creacion AS created_at,
        p.fecha_actualizacion AS updated_at,
        p.usr_modif AS usr_modif,
        TRIM(CONCAT(COALESCE(um.usr_nombre, ''), ' ', COALESCE(um.usr_apellido, ''))) AS usr_modif_name,
        (
          SELECT COALESCE(SUM(pd.det_cantidad), 0)
          FROM ${orderDetailTable} pd
          WHERE pd.ped_id = p.ped_id
        ) AS items_qty,
        (
          SELECT COUNT(*)
          FROM ${orderDetailTable} pd
          WHERE pd.ped_id = p.ped_id
        ) AS items_count,
        (
          SELECT COALESCE(GROUP_CONCAT(DISTINCT COALESCE(pr.prod_nombre, '') ORDER BY pr.prod_nombre SEPARATOR '||'), '')
          FROM ${orderDetailTable} pd
          LEFT JOIN producto pr ON pr.prod_id = pd.prod_id
          WHERE pd.ped_id = p.ped_id
        ) AS product_names
      FROM pedidos p
      LEFT JOIN usuario u ON u.usr_id = p.usr_id
      LEFT JOIN usuario um ON um.usr_id = p.usr_modif
      LEFT JOIN cliente c ON c.cli_id = p.cli_id
      LEFT JOIN estado_pedido ep ON ep.est_ped_id = p.est_ped_id
      ${shippingProviderJoin}
      ${cancelledFilter}
      ORDER BY p.ped_id DESC`
    );
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/payment-types', async (req, res) => {
  try {
    const hasTipoPagoTable = await tableExists('tipo_pago');
    if (!hasTipoPagoTable) {
      return res.json([]);
    }

    const rows = await query(
      `SELECT tp_id_meto, tp_descrip
       FROM tipo_pago
       ORDER BY tp_descrip ASC`
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id/payment-methods', async (req, res) => {
  const orderId = Number(req.params.id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  try {
    const [hasMetodoPagoTable, hasFechaIngreso] = await Promise.all([
      tableExists('metodo_pago'),
      columnExists('metodo_pago', 'fecha_ingreso'),
    ]);
    if (!hasMetodoPagoTable) {
      return res.json([]);
    }

    const fechaIngresoSelect = hasFechaIngreso ? 'mp.fecha_ingreso' : 'NULL';

    const rows = await query(
      `SELECT
        mp.mp_id,
        mp.ped_id,
        mp.tp_id_meto,
        COALESCE(tp.tp_descrip, '') AS tp_descrip,
        mp.mp_monto_pago,
        mp.mp_no_pago,
        ${fechaIngresoSelect} AS fecha_ingreso
      FROM metodo_pago mp
      LEFT JOIN tipo_pago tp ON tp.tp_id_meto = mp.tp_id_meto
      WHERE mp.ped_id = ?
      ORDER BY fecha_ingreso DESC, mp.mp_id DESC`,
      [orderId]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [hasShippingProviderId, hasShippingGuide, hasShippingProvidersTable, hasSaldoPag, hasSaldoPen, hasRecibo] = await Promise.all([
      columnExists('pedidos', 'proveedor_envio_id'),
      columnExists('pedidos', 'ped_guia'),
      tableExists('proveedor_envio'),
      columnExists('pedidos', 'ped_saldo_pag'),
      columnExists('pedidos', 'ped_saldo_pen'),
      columnExists('pedidos', 'ped_recibo'),
    ]);

    const shippingProviderIdSelect = hasShippingProviderId
      ? 'p.proveedor_envio_id'
      : 'NULL';
    const shippingProviderNameSelect = hasShippingProviderId && hasShippingProvidersTable
      ? 'pe.prov_envio_nombre'
      : "''";
    const shippingGuideSelect = hasShippingGuide ? 'p.ped_guia' : "''";
    const saldoPagSelect = hasSaldoPag ? 'p.ped_saldo_pag' : '0';
    const saldoPenSelect = hasSaldoPen ? 'p.ped_saldo_pen' : '0';
    const reciboSelect = hasRecibo ? 'p.ped_recibo' : 'NULL';
    const shippingProviderJoin = hasShippingProviderId && hasShippingProvidersTable
      ? 'LEFT JOIN proveedor_envio pe ON pe.prov_envio_id = p.proveedor_envio_id'
      : '';

    const orders = await query(
      `SELECT
        p.ped_id AS id,
        p.usr_id AS user_id,
        TRIM(CONCAT(COALESCE(u.usr_nombre, ''), ' ', COALESCE(u.usr_apellido, ''))) AS user_name,
        p.cli_id AS cli_id,
        COALESCE(c.cli_nombre_empresa, '') AS client_name,
        COALESCE(c.cli_direccion, '') AS client_address,
        COALESCE(c.cli_telefono, '') AS client_phone,
        COALESCE(c.cli_correo, '') AS client_email,
        p.est_ped_id AS phase,
        p.ped_monto_tot AS total,
        ${saldoPagSelect} AS ped_saldo_pag,
        ${saldoPenSelect} AS ped_saldo_pen,
        ${reciboSelect} AS ped_recibo,
        COALESCE(ep.est_ped_nombre, 'pendiente') AS status,
        ${shippingProviderIdSelect} AS shipping_provider_id,
        ${shippingProviderNameSelect} AS shipping_provider_name,
        ${shippingGuideSelect} AS shipping_guide,
        p.fecha_creacion AS created_at,
        p.fecha_actualizacion AS updated_at,
        p.usr_modif AS usr_modif,
        TRIM(CONCAT(COALESCE(um.usr_nombre, ''), ' ', COALESCE(um.usr_apellido, ''))) AS usr_modif_name
      FROM pedidos p
      LEFT JOIN usuario u ON u.usr_id = p.usr_id
      LEFT JOIN usuario um ON um.usr_id = p.usr_modif
      LEFT JOIN cliente c ON c.cli_id = p.cli_id
      LEFT JOIN estado_pedido ep ON ep.est_ped_id = p.est_ped_id
      ${shippingProviderJoin}
      WHERE p.ped_id = ?`,
      [req.params.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const details = await query(
      `SELECT
        pd.det_id AS det_id,
        pd.ped_id AS ped_id,
        pd.prod_id AS prod_id,
        COALESCE(pr.prod_nombre, '') AS product_name,
        pd.det_cantidad AS quantity,
        pd.det_precio_unitario AS unit_price,
        pd.det_subtotal AS subtotal
      FROM pedido_detalle pd
      LEFT JOIN producto pr ON pr.prod_id = pd.prod_id
      WHERE pd.ped_id = ?
      ORDER BY pd.det_id ASC`,
      [req.params.id]
    );

    res.json({
      ...orders[0],
      details,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/actions', async (req, res) => {
  const orderId = Number(req.params.id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  try {
    const actions = await query(
      `SELECT
        h.hap_id AS id,
        h.ped_id AS order_id,
        h.est_ped_id AS phase,
        COALESCE(ep.est_ped_nombre, 'pendiente') AS status,
        h.usr_id AS user_id,
        TRIM(CONCAT(COALESCE(u.usr_nombre, ''), ' ', COALESCE(u.usr_apellido, ''))) AS user_name,
        h.hap_accion AS action,
        COALESCE(h.hap_descripcion, '') AS description,
        h.fecha_creacion AS created_at
      FROM historial_acciones_pedido h
      LEFT JOIN estado_pedido ep ON ep.est_ped_id = h.est_ped_id
      LEFT JOIN usuario u ON u.usr_id = h.usr_id
      WHERE h.ped_id = ?
      ORDER BY h.fecha_creacion ASC, h.hap_id ASC`,
      [orderId]
    );

    return res.json(actions);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  const { user_id, cli_id, phase, status, usr_modif, items, ped_saldo_pag, ped_saldo_pen, ped_recibo } = req.body;

  if (!user_id || !cli_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'user_id, cli_id e items son requeridos' });
  }

  let parsedItems = [];
  try {
    parsedItems = parseOrderItems(items);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const calculatedTotal = parsedItems.reduce(
    (sum, item) => sum + item.det_cantidad * item.det_precio_unitario,
    0
  );

  const connection = await pool.getConnection();
  const stockChanges = new Map();
  try {
    await connection.beginTransaction();

    const resolvedPhase =
      typeof phase !== 'undefined'
        ? Number(phase)
        : typeof status !== 'undefined'
          ? Number(status)
          : 1;

    const estadoId = await ensureEstadoPedidoPhase(resolvedPhase, connection);
    const generatedPedidoId = await generateUniquePedidoId(connection);
    const [hasSaldoPag, hasSaldoPen, hasRecibo] = await Promise.all([
      columnExistsWithConnection(connection, 'pedidos', 'ped_saldo_pag'),
      columnExistsWithConnection(connection, 'pedidos', 'ped_saldo_pen'),
      columnExistsWithConnection(connection, 'pedidos', 'ped_recibo'),
    ]);

    const requestedQtyByProduct = new Map();
    for (const item of parsedItems) {
      requestedQtyByProduct.set(
        item.prod_id,
        (requestedQtyByProduct.get(item.prod_id) || 0) + item.det_cantidad
      );
    }

    for (const [productId, quantity] of requestedQtyByProduct.entries()) {
      const change = await adjustProductStock(connection, productId, -quantity);
      accumulateStockChange(stockChanges, change);
    }

    const orderColumns = ['ped_id', 'usr_id', 'cli_id', 'est_ped_id', 'ped_monto_tot', 'usr_modif'];
    const orderValues = [
      generatedPedidoId,
      Number(user_id),
      Number(cli_id),
      estadoId,
      calculatedTotal,
      Number(usr_modif || user_id),
    ];

    if (hasSaldoPag) {
      orderColumns.push('ped_saldo_pag');
      orderValues.push(typeof ped_saldo_pag === 'undefined' ? 0 : Number(ped_saldo_pag) || 0);
    }

    if (hasSaldoPen) {
      orderColumns.push('ped_saldo_pen');
      orderValues.push(typeof ped_saldo_pen === 'undefined' ? calculatedTotal : Number(ped_saldo_pen) || 0);
    }

    if (hasRecibo) {
      orderColumns.push('ped_recibo');
      orderValues.push(parseReciboValue(ped_recibo));
    }

    const insertPlaceholders = orderColumns.map(() => '?').join(', ');

    await connection.execute(
      `INSERT INTO pedidos (${orderColumns.join(', ')}) VALUES (${insertPlaceholders})`,
      orderValues
    );

    const estadoNombre = await getEstadoPedidoNameById(connection, estadoId);
    const createdProductsDescription = await buildCreatedOrderProductsDescription(connection, parsedItems);
    await insertOrderAction(connection, {
      orderId: generatedPedidoId,
      phaseId: estadoId,
      userId: Number(usr_modif || user_id),
      action: 'CREADO',
      description: createdProductsDescription
        ? `Pedido creado en estado ${estadoNombre}\n${createdProductsDescription}`
        : `Pedido creado en estado ${estadoNombre}`,
    });

    for (const item of parsedItems) {
      const subtotal = item.det_cantidad * item.det_precio_unitario;
      await connection.execute(
        `INSERT INTO pedido_detalle (ped_id, prod_id, det_cantidad, det_precio_unitario, det_subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [
          generatedPedidoId,
          item.prod_id,
          item.det_cantidad,
          item.det_precio_unitario,
          subtotal,
        ]
      );
    }

    await connection.commit();

    emitOrderCreated(
      buildOrderEventPayload({
        orderId: generatedPedidoId,
        action: 'created',
        phase: estadoId,
        total: calculatedTotal,
        userId: Number(user_id),
        clientId: Number(cli_id),
      })
    );

    const emittedStockChanges = Array.from(stockChanges.values());

    if (emittedStockChanges.length > 0) {
      emitStockChanged(
        buildStockEventPayload({
          orderId: generatedPedidoId,
          action: 'created',
          actorUserId: Number(usr_modif || user_id),
          changes: emittedStockChanges,
        })
      );
    }

    await triggerStockAndOverdueEmailAlerts(emittedStockChanges);

    res.status(201).json({
      id: generatedPedidoId,
      user_id: Number(user_id),
      cli_id: Number(cli_id),
      phase: estadoId,
      total: calculatedTotal,
      items: parsedItems.map((item) => ({
        ...item,
        det_subtotal: item.det_cantidad * item.det_precio_unitario,
      })),
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

router.put('/:id', async (req, res) => {
  const {
    total,
    status,
    phase,
    usr_modif,
    items,
    shipping_provider_id,
    shipping_guide,
    ped_saldo_pag,
    ped_saldo_pen,
    ped_recibo,
    tp_id_meto,
    mp_monto_pago,
    mp_no_pago,
  } = req.body;
  const orderId = Number(req.params.id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  let parsedItems = null;
  if (typeof items !== 'undefined') {
    try {
      parsedItems = parseOrderItems(items);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  const connection = await pool.getConnection();
  const stockChanges = new Map();
  try {
    await connection.beginTransaction();

    const [existingOrderRows] = await connection.execute(
      'SELECT ped_id, est_ped_id, usr_id, ped_monto_tot FROM pedidos WHERE ped_id = ? LIMIT 1 FOR UPDATE',
      [orderId]
    );

    if (existingOrderRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const setClauses = [];
    const params = [];
    const currentOrder = existingOrderRows[0];
    let nextOrderTotal = Number(currentOrder.ped_monto_tot || 0);
    let resolvedPhaseId =
      currentOrder.est_ped_id === null || typeof currentOrder.est_ped_id === 'undefined'
        ? null
        : Number(currentOrder.est_ped_id);

    if (parsedItems) {
      const [currentDetailsRows] = await connection.execute(
        'SELECT prod_id, det_cantidad, det_precio_unitario FROM pedido_detalle WHERE ped_id = ? FOR UPDATE',
        [orderId]
      );

      const currentQtyByProduct = new Map();
      for (const row of currentDetailsRows) {
        const productId = Number(row.prod_id);
        const qty = Number(row.det_cantidad || 0);
        currentQtyByProduct.set(productId, (currentQtyByProduct.get(productId) || 0) + qty);
      }

      const nextQtyByProduct = new Map();
      for (const item of parsedItems) {
        nextQtyByProduct.set(item.prod_id, (nextQtyByProduct.get(item.prod_id) || 0) + item.det_cantidad);
      }

      const productIds = new Set([...currentQtyByProduct.keys(), ...nextQtyByProduct.keys()]);
      for (const productId of productIds) {
        const currentQty = currentQtyByProduct.get(productId) || 0;
        const nextQty = nextQtyByProduct.get(productId) || 0;
        const stockDelta = currentQty - nextQty;
        const change = await adjustProductStock(connection, productId, stockDelta);
        accumulateStockChange(stockChanges, change);
      }

      await connection.execute('DELETE FROM pedido_detalle WHERE ped_id = ?', [orderId]);

      for (const item of parsedItems) {
        const subtotal = item.det_cantidad * item.det_precio_unitario;
        await connection.execute(
          `INSERT INTO pedido_detalle (ped_id, prod_id, det_cantidad, det_precio_unitario, det_subtotal)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.prod_id, item.det_cantidad, item.det_precio_unitario, subtotal]
        );
      }

      const recalculatedTotal = parsedItems.reduce(
        (sum, item) => sum + item.det_cantidad * item.det_precio_unitario,
        0
      );
      nextOrderTotal = recalculatedTotal;
      setClauses.push('ped_monto_tot = ?');
      params.push(recalculatedTotal);

      const detailUpdateDescription = await buildDetailUpdateDescription(connection, currentDetailsRows, parsedItems);

      await insertOrderAction(connection, {
        orderId,
        phaseId: resolvedPhaseId,
        userId: Number(usr_modif || currentOrder.usr_id || 0) || null,
        action: 'DETALLE_ACTUALIZADO',
        description: detailUpdateDescription,
      });
    } else if (typeof total !== 'undefined') {
      const parsedTotal = Number(total);
      nextOrderTotal = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : 0;
      setClauses.push('ped_monto_tot = ?');
      params.push(nextOrderTotal);

      await insertOrderAction(connection, {
        orderId,
        phaseId: resolvedPhaseId,
        userId: Number(usr_modif || currentOrder.usr_id || 0) || null,
        action: 'TOTAL_ACTUALIZADO',
        description: `Monto total actualizado a Q${Number(total || 0).toFixed(2)}`,
      });
    }

    if (typeof phase !== 'undefined') {
      const phaseNumber = Number(phase);
      if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 3) {
        await connection.rollback();
        return res.status(400).json({ error: 'La fase debe ser 1, 2 o 3' });
      }

      await ensureEstadoPedidoPhase(phaseNumber, connection);
      setClauses.push('est_ped_id = ?');
      params.push(phaseNumber);
      resolvedPhaseId = phaseNumber;

      const oldStatusName = await getEstadoPedidoNameById(connection, currentOrder.est_ped_id);
      const newStatusName = await getEstadoPedidoNameById(connection, phaseNumber);

      await insertOrderAction(connection, {
        orderId,
        phaseId: phaseNumber,
        userId: Number(usr_modif || currentOrder.usr_id || 0) || null,
        action: 'ESTADO_CAMBIADO',
        description: `Estado actualizado de ${oldStatusName} a ${newStatusName}`,
      });
    } else if (typeof status !== 'undefined') {
      const estadoId = await getEstadoPedidoIdByName(status);
      setClauses.push('est_ped_id = ?');
      params.push(estadoId);
      resolvedPhaseId = estadoId;

      const oldStatusName = await getEstadoPedidoNameById(connection, currentOrder.est_ped_id);
      const newStatusName = await getEstadoPedidoNameById(connection, estadoId);

      await insertOrderAction(connection, {
        orderId,
        phaseId: estadoId,
        userId: Number(usr_modif || currentOrder.usr_id || 0) || null,
        action: 'ESTADO_CAMBIADO',
        description: `Estado actualizado de ${oldStatusName} a ${newStatusName}`,
      });
    }

    if (typeof usr_modif !== 'undefined') {
      setClauses.push('usr_modif = ?');
      params.push(Number(usr_modif));
    }

    const hasShippingProviderId = await columnExistsWithConnection(connection, 'pedidos', 'proveedor_envio_id');
    const hasShippingGuide = await columnExistsWithConnection(connection, 'pedidos', 'ped_guia');
    const hasSaldoPag = await columnExistsWithConnection(connection, 'pedidos', 'ped_saldo_pag');
    const hasSaldoPen = await columnExistsWithConnection(connection, 'pedidos', 'ped_saldo_pen');
    const hasRecibo = await columnExistsWithConnection(connection, 'pedidos', 'ped_recibo');
    const hasMetodoPagoTable = await tableExists('metodo_pago');
    let nextPaidTotal = null;

    if (typeof shipping_provider_id !== 'undefined' && hasShippingProviderId) {
      setClauses.push('proveedor_envio_id = ?');
      params.push(Number(shipping_provider_id) || null);
    }

    if (typeof shipping_guide !== 'undefined' && hasShippingGuide) {
      setClauses.push('ped_guia = ?');
      params.push(String(shipping_guide).trim() || null);
    }

    if (typeof ped_saldo_pag !== 'undefined' && hasSaldoPag) {
      const paidAmount = Number(ped_saldo_pag);
      if (!Number.isFinite(paidAmount) || paidAmount < 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'El monto pagado es inválido' });
      }

      if (paidAmount > nextOrderTotal) {
        await connection.rollback();
        return res.status(400).json({ error: 'El monto pagado no puede ser mayor al monto total del pedido' });
      }

      nextPaidTotal = paidAmount;
      setClauses.push('ped_saldo_pag = ?');
      params.push(paidAmount);
    }

    if (nextPaidTotal !== null && hasSaldoPen) {
      setClauses.push('ped_saldo_pen = ?');
      params.push(Math.max(0, nextOrderTotal - nextPaidTotal));
    } else if (typeof ped_saldo_pen !== 'undefined' && hasSaldoPen) {
      setClauses.push('ped_saldo_pen = ?');
      params.push(Number(ped_saldo_pen) || 0);
    }

    if (typeof ped_recibo !== 'undefined' && hasRecibo) {
      setClauses.push('ped_recibo = ?');
      params.push(parseReciboValue(ped_recibo));
    }

    if (
      hasMetodoPagoTable &&
      typeof tp_id_meto !== 'undefined' &&
      typeof mp_monto_pago !== 'undefined' &&
      typeof mp_no_pago !== 'undefined'
    ) {
      const paymentTypeId = Number(tp_id_meto);
      const paymentAmount = Number(mp_monto_pago) || 0;
      const paymentNumber = Number(mp_no_pago) || 0;

      if (paymentAmount > nextOrderTotal) {
        await connection.rollback();
        return res.status(400).json({ error: 'El monto pagado no puede ser mayor al monto total del pedido' });
      }

      if (Number.isInteger(paymentTypeId) && paymentTypeId > 0) {
        await connection.execute(
          `INSERT INTO metodo_pago (ped_id, tp_id_meto, mp_monto_pago, mp_no_pago)
           VALUES (?, ?, ?, ?)`,
          [orderId, paymentTypeId, paymentAmount, paymentNumber]
        );
      }
    }

    if (setClauses.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    params.push(orderId);

    await connection.execute(
      `UPDATE pedidos SET ${setClauses.join(', ')} WHERE ped_id = ?`,
      params
    );

    await connection.commit();

    emitOrderUpdated(
      buildOrderEventPayload({
        orderId,
        action: 'updated',
        phase: resolvedPhaseId,
        total: nextOrderTotal,
        userId: Number(usr_modif || currentOrder.usr_id || 0) || null,
        clientId: null,
      })
    );

    const emittedStockChanges = Array.from(stockChanges.values());

    if (emittedStockChanges.length > 0) {
      emitStockChanged(
        buildStockEventPayload({
          orderId,
          action: 'updated',
          actorUserId: Number(usr_modif || currentOrder.usr_id || 0) || null,
          changes: emittedStockChanges,
        })
      );
    }

    await triggerStockAndOverdueEmailAlerts(emittedStockChanges);

    res.json({ message: 'Orden actualizada' });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

router.put('/:id/cancel', async (req, res) => {
  const orderId = Number(req.params.id);
  const modifierUserId = Number(req.body?.usr_modif || 0);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  const connection = await pool.getConnection();
  const stockChanges = new Map();
  try {
    await connection.beginTransaction();

    const cancelledEstadoId = await ensureEstadoPedidoByName(connection, 'cancelado', 4);

    const [existingOrderRows] = await connection.execute(
      `SELECT
        p.ped_id,
        p.est_ped_id,
        p.usr_id,
        COALESCE(ep.est_ped_nombre, '') AS estado_nombre
      FROM pedidos p
      LEFT JOIN estado_pedido ep ON ep.est_ped_id = p.est_ped_id
      WHERE p.ped_id = ?
      LIMIT 1 FOR UPDATE`,
      [orderId]
    );

    if (existingOrderRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const currentOrder = existingOrderRows[0];
    const alreadyCancelled = String(currentOrder.estado_nombre || '').toLowerCase().includes('cancel');

    if (alreadyCancelled) {
      await connection.rollback();
      return res.json({ message: 'El pedido ya está cancelado' });
    }

    const [detailRows] = await connection.execute(
      'SELECT prod_id, det_cantidad FROM pedido_detalle WHERE ped_id = ? FOR UPDATE',
      [orderId]
    );

    const restoredQtyByProduct = new Map();
    for (const row of detailRows) {
      const productId = Number(row.prod_id);
      restoredQtyByProduct.set(productId, (restoredQtyByProduct.get(productId) || 0) + Number(row.det_cantidad || 0));
    }

    for (const [productId, quantity] of restoredQtyByProduct.entries()) {
      const change = await adjustProductStock(connection, productId, quantity);
      accumulateStockChange(stockChanges, change);
    }

    const modifierId = modifierUserId > 0 ? modifierUserId : Number(currentOrder.usr_id || 0) || null;

    await connection.execute(
      'UPDATE pedidos SET est_ped_id = ?, usr_modif = ? WHERE ped_id = ?',
      [cancelledEstadoId, modifierId, orderId]
    );

    await insertOrderAction(connection, {
      orderId,
      phaseId: cancelledEstadoId,
      userId: modifierId,
      action: 'CANCELADO',
      description: 'Pedido cancelado y stock restaurado',
    });

    await connection.commit();

    emitOrderCancelled(
      buildOrderEventPayload({
        orderId,
        action: 'cancelled',
        phase: cancelledEstadoId,
        total: 0,
        userId: modifierId,
        clientId: null,
      })
    );

    const emittedStockChanges = Array.from(stockChanges.values());

    if (emittedStockChanges.length > 0) {
      emitStockChanged(
        buildStockEventPayload({
          orderId,
          action: 'cancelled',
          actorUserId: modifierId,
          changes: emittedStockChanges,
        })
      );
    }

    await triggerStockAndOverdueEmailAlerts(emittedStockChanges);

    res.json({ message: 'Pedido cancelado y stock restaurado', phase: cancelledEstadoId, status: 'cancelado' });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
