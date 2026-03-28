import express from 'express';
import { query } from '../db.js';

const router = express.Router();

function getRequesterUserId(req) {
  const candidate = req.headers['x-user-id'] ?? req.body?.usr_modif ?? null;
  const numeric = Number(candidate || 0);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

async function insertProductMovement({
  productId,
  userId,
  type,
  description,
  previousStock = null,
  newStock = null,
  previousPrice = null,
  newPrice = null,
}) {
  await query(
    `INSERT INTO historial_movimientos_producto
      (prod_id, usr_id, hmp_tipo, hmp_descripcion, hmp_stock_anterior, hmp_stock_nuevo, hmp_precio_anterior, hmp_precio_nuevo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(productId),
      userId,
      type,
      description || null,
      previousStock,
      newStock,
      previousPrice,
      newPrice,
    ]
  );
}

async function getEstadoProductoIdByName(estadoNombre) {
  const rows = await query(
    'SELECT est_pro_id FROM estado_producto WHERE LOWER(est_pro_nombre) = LOWER(?) LIMIT 1',
    [estadoNombre]
  );

  if (rows.length > 0) {
    return Number(rows[0].est_pro_id);
  }

  const inserted = await query(
    'INSERT INTO estado_producto (est_pro_nombre) VALUES (?)',
    [estadoNombre]
  );

  return Number(inserted.insertId);
}

async function getActiveEstadoProductoId() {
  const candidates = ['habilitado', 'activo'];
  for (const name of candidates) {
    const rows = await query(
      'SELECT est_pro_id FROM estado_producto WHERE LOWER(est_pro_nombre) = LOWER(?) LIMIT 1',
      [name]
    );
    if (rows.length > 0) {
      return Number(rows[0].est_pro_id);
    }
  }

  return getEstadoProductoIdByName('habilitado');
}

async function getInactiveEstadoProductoId() {
  const candidates = ['inhabilitado', 'inactivo'];
  for (const name of candidates) {
    const rows = await query(
      'SELECT est_pro_id FROM estado_producto WHERE LOWER(est_pro_nombre) = LOWER(?) LIMIT 1',
      [name]
    );
    if (rows.length > 0) {
      return Number(rows[0].est_pro_id);
    }
  }

  return getEstadoProductoIdByName('inhabilitado');
}

router.get('/', async (req, res) => {
  try {
    const activeEstadoId = await getActiveEstadoProductoId();
    const inactiveEstadoId = await getInactiveEstadoProductoId();
    const status = String(req.query.status || 'activos').toLowerCase();

    let whereClause = 'WHERE p.est_pro_id = ? OR p.est_pro_id IS NULL';
    let params = [activeEstadoId];

    if (status === 'inhabilitados') {
      whereClause = 'WHERE p.est_pro_id = ?';
      params = [inactiveEstadoId];
    } else if (status === 'todos') {
      whereClause = '';
      params = [];
    }

    const products = await query(
      `SELECT
        prod_id AS id,
        prod_nombre AS name,
        prod_precio AS price,
        COALESCE(prod_stock, 0) AS stock,
        COALESCE(prod_costo, 0) AS purchasePrice,
        COALESCE(prod_categoria, 'GENERAL') AS categoria,
        COALESCE(prod_descrip, '') AS observations,
        COALESCE(prod_barr, '') AS barcode,
        p.est_pro_id AS est_pro_id,
        COALESCE(ep.est_pro_nombre, '') AS estado
      FROM producto
      p LEFT JOIN estado_producto ep ON ep.est_pro_id = p.est_pro_id
      ${whereClause}
      ORDER BY prod_id DESC`,
      params
    );
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const products = await query(
      `SELECT
        prod_id AS id,
        prod_nombre AS name,
        prod_precio AS price,
        COALESCE(prod_stock, 0) AS stock,
        COALESCE(prod_costo, 0) AS purchasePrice,
        COALESCE(prod_categoria, 'General') AS categoria,
        COALESCE(prod_descrip, '') AS observations,
        COALESCE(prod_barr, '') AS barcode
      FROM producto
      WHERE prod_id = ?`,
      [req.params.id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(products[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/movements', async (req, res) => {
  const productId = Number(req.params.id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'ID de producto inválido' });
  }

  try {
    const exists = await query('SELECT prod_id FROM producto WHERE prod_id = ? LIMIT 1', [productId]);
    if (exists.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const movements = await query(
      `SELECT
        h.hmp_id AS id,
        h.prod_id AS product_id,
        h.usr_id AS user_id,
        TRIM(CONCAT(COALESCE(u.usr_nombre, ''), ' ', COALESCE(u.usr_apellido, ''))) AS user_name,
        h.hmp_tipo AS type,
        COALESCE(h.hmp_descripcion, '') AS description,
        h.hmp_stock_anterior AS previous_stock,
        h.hmp_stock_nuevo AS new_stock,
        h.hmp_precio_anterior AS previous_price,
        h.hmp_precio_nuevo AS new_price,
        h.fecha_creacion AS created_at
      FROM historial_movimientos_producto h
      LEFT JOIN usuario u ON u.usr_id = h.usr_id
      WHERE h.prod_id = ?
        AND LOWER(COALESCE(h.hmp_tipo, '')) IN ('actualizacion', 'ajuste_stock', 'reactivacion', 'inhabilitacion', 'estado')
      ORDER BY h.fecha_creacion DESC, h.hmp_id DESC`,
      [productId]
    );

    res.json(movements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  const { name, price, stock, purchasePrice, description, categoria, barcode, observations } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: 'Nombre y precio son requeridos' });
  }

  try {
    const normalizedName = String(name || '').trim();
    const normalizedBarcode = String(barcode || '').trim();

    if (normalizedName) {
      const duplicatedByName = await query(
        `SELECT prod_id, prod_nombre, COALESCE(prod_barr, '') AS prod_barr
         FROM producto
         WHERE LOWER(TRIM(prod_nombre)) = LOWER(TRIM(?))
         LIMIT 1`,
        [normalizedName]
      );

      if (duplicatedByName.length > 0) {
        return res.status(409).json({
          error: 'Ya existe un producto con ese nombre',
          duplicateBy: 'name',
          product: {
            id: Number(duplicatedByName[0].prod_id),
            name: String(duplicatedByName[0].prod_nombre || ''),
            barcode: String(duplicatedByName[0].prod_barr || ''),
          },
        });
      }
    }

    if (normalizedBarcode) {
      const duplicatedByBarcode = await query(
        `SELECT prod_id, prod_nombre, COALESCE(prod_barr, '') AS prod_barr
         FROM producto
         WHERE TRIM(COALESCE(prod_barr, '')) <> ''
           AND LOWER(TRIM(prod_barr)) = LOWER(TRIM(?))
         LIMIT 1`,
        [normalizedBarcode]
      );

      if (duplicatedByBarcode.length > 0) {
        return res.status(409).json({
          error: 'Ya existe un producto con ese código de barras',
          duplicateBy: 'barcode',
          product: {
            id: Number(duplicatedByBarcode[0].prod_id),
            name: String(duplicatedByBarcode[0].prod_nombre || ''),
            barcode: String(duplicatedByBarcode[0].prod_barr || ''),
          },
        });
      }
    }

    const activeEstadoId = await getActiveEstadoProductoId();
    const normalizedCategory = categoria || description || 'General';
    const normalizedObservations = observations || '';

    await query(
      `INSERT INTO producto (prod_nombre, prod_precio, prod_costo, prod_stock, prod_barr, prod_categoria, prod_descrip, est_pro_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        price,
        typeof purchasePrice === 'undefined' ? null : purchasePrice,
        typeof stock === 'undefined' ? 0 : stock,
        barcode || null,
        normalizedCategory,
        normalizedObservations,
        activeEstadoId,
      ]
    );

    const created = await query('SELECT LAST_INSERT_ID() AS id');
    const createdId = Number(created[0].id);

    res.status(201).json({
      id: createdId,
      name,
      price,
      stock: typeof stock === 'undefined' ? 0 : stock,
      purchasePrice: typeof purchasePrice === 'undefined' ? 0 : purchasePrice,
      categoria: normalizedCategory,
      observations: normalizedObservations,
      barcode: barcode || '',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, price, stock, purchasePrice, description, categoria, barcode, observations } = req.body;

  try {
    const requesterUserId = getRequesterUserId(req);
    const existing = await query(
      `SELECT prod_id, prod_nombre, prod_precio, prod_stock, COALESCE(prod_costo, 0) AS prod_costo,
              COALESCE(prod_barr, '') AS prod_barr,
              COALESCE(prod_categoria, 'General') AS prod_categoria,
              COALESCE(prod_descrip, '') AS prod_descrip
       FROM producto
       WHERE prod_id = ?
       LIMIT 1`,
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const current = existing[0];
    const nextName = typeof name === 'undefined' ? current.prod_nombre : name;
    const nextPrice = typeof price === 'undefined' ? Number(current.prod_precio || 0) : Number(price);
    const nextStock = typeof stock === 'undefined' ? Number(current.prod_stock || 0) : Number(stock);
    const nextPurchasePrice =
      typeof purchasePrice === 'undefined' ? Number(current.prod_costo || 0) : Number(purchasePrice || 0);
    const nextBarcode = typeof barcode === 'undefined' ? current.prod_barr : barcode;
    const nextCategory = categoria || description || current.prod_categoria || 'GENERAL';
    const nextObservations = typeof observations === 'undefined' ? current.prod_descrip || '' : observations;

    const currentProductId = Number(req.params.id);
    const normalizedNextName = String(nextName || '').trim();
    const normalizedNextBarcode = String(nextBarcode || '').trim();

    if (normalizedNextName) {
      const duplicatedByName = await query(
        `SELECT prod_id, prod_nombre, COALESCE(prod_barr, '') AS prod_barr
         FROM producto
         WHERE LOWER(TRIM(prod_nombre)) = LOWER(TRIM(?))
           AND prod_id <> ?
         LIMIT 1`,
        [normalizedNextName, currentProductId]
      );

      if (duplicatedByName.length > 0) {
        return res.status(409).json({
          error: 'Ya existe un producto con ese nombre',
          duplicateBy: 'name',
          product: {
            id: Number(duplicatedByName[0].prod_id),
            name: String(duplicatedByName[0].prod_nombre || ''),
            barcode: String(duplicatedByName[0].prod_barr || ''),
          },
        });
      }
    }

    if (normalizedNextBarcode) {
      const duplicatedByBarcode = await query(
        `SELECT prod_id, prod_nombre, COALESCE(prod_barr, '') AS prod_barr
         FROM producto
         WHERE TRIM(COALESCE(prod_barr, '')) <> ''
           AND LOWER(TRIM(prod_barr)) = LOWER(TRIM(?))
           AND prod_id <> ?
         LIMIT 1`,
        [normalizedNextBarcode, currentProductId]
      );

      if (duplicatedByBarcode.length > 0) {
        return res.status(409).json({
          error: 'Ya existe un producto con ese código de barras',
          duplicateBy: 'barcode',
          product: {
            id: Number(duplicatedByBarcode[0].prod_id),
            name: String(duplicatedByBarcode[0].prod_nombre || ''),
            barcode: String(duplicatedByBarcode[0].prod_barr || ''),
          },
        });
      }
    }

    const activeEstadoId = await getActiveEstadoProductoId();
    await query(
      `UPDATE producto
       SET prod_nombre = ?,
           prod_precio = ?,
           prod_stock = ?,
           prod_costo = ?,
           prod_barr = ?,
           prod_categoria = ?,
           prod_descrip = ?,
           est_pro_id = ?
       WHERE prod_id = ?`,
      [
        nextName,
        nextPrice,
        nextStock,
        nextPurchasePrice,
        nextBarcode || null,
        nextCategory,
        nextObservations,
        activeEstadoId,
        req.params.id,
      ]
    );

    const changes = [];
    if (String(current.prod_nombre || '') !== String(nextName || '')) {
      changes.push(`nombre: ${current.prod_nombre} -> ${nextName}`);
    }
    if (Number(current.prod_precio || 0) !== Number(nextPrice || 0)) {
      changes.push(`precio: ${current.prod_precio} -> ${nextPrice}`);
    }
    if (Number(current.prod_stock || 0) !== Number(nextStock || 0)) {
      changes.push(`stock: ${current.prod_stock} -> ${nextStock}`);
    }
    if (Number(current.prod_costo || 0) !== Number(nextPurchasePrice || 0)) {
      changes.push(`costo: ${current.prod_costo} -> ${nextPurchasePrice}`);
    }

    await insertProductMovement({
      productId: Number(req.params.id),
      userId: requesterUserId,
      type: Number(current.prod_stock || 0) !== Number(nextStock || 0) ? 'ajuste_stock' : 'actualizacion',
      description:
        changes.length > 0
          ? `Producto actualizado (${changes.join(', ')})`
          : 'Producto actualizado sin cambios detectados en campos principales',
      previousStock: Number(current.prod_stock || 0),
      newStock: Number(nextStock || 0),
      previousPrice: Number(current.prod_precio || 0),
      newPrice: Number(nextPrice || 0),
    });

    res.json({ message: 'Producto actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const requesterUserId = getRequesterUserId(req);
    const existing = await query(
      'SELECT prod_id, prod_nombre, prod_precio, COALESCE(prod_stock, 0) AS prod_stock FROM producto WHERE prod_id = ? LIMIT 1',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const current = existing[0];
    const inactiveEstadoId = await getInactiveEstadoProductoId();
    await query('UPDATE producto SET est_pro_id = ? WHERE prod_id = ?', [inactiveEstadoId, req.params.id]);

    await insertProductMovement({
      productId: Number(req.params.id),
      userId: requesterUserId,
      type: 'inhabilitacion',
      description: `Producto inhabilitado: ${current.prod_nombre}`,
      previousStock: Number(current.prod_stock || 0),
      newStock: Number(current.prod_stock || 0),
      previousPrice: Number(current.prod_precio || 0),
      newPrice: Number(current.prod_precio || 0),
    });

    res.json({ message: 'Producto inhabilitado', est_pro_id: inactiveEstadoId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/status', async (req, res) => {
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Estado requerido' });
  }

  try {
    const requesterUserId = getRequesterUserId(req);
    const existing = await query(
      `SELECT p.prod_id, p.prod_nombre, p.prod_precio, COALESCE(p.prod_stock, 0) AS prod_stock,
              COALESCE(ep.est_pro_nombre, '') AS estado_actual
       FROM producto p
       LEFT JOIN estado_producto ep ON ep.est_pro_id = p.est_pro_id
       WHERE p.prod_id = ?
       LIMIT 1`,
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const current = existing[0];
    const normalized = String(status).toLowerCase();
    const targetEstadoId =
      normalized === 'activo' || normalized === 'habilitado'
        ? await getActiveEstadoProductoId()
        : await getInactiveEstadoProductoId();

    await query('UPDATE producto SET est_pro_id = ? WHERE prod_id = ?', [targetEstadoId, req.params.id]);

    await insertProductMovement({
      productId: Number(req.params.id),
      userId: requesterUserId,
      type: normalized === 'activo' || normalized === 'habilitado' ? 'reactivacion' : 'inhabilitacion',
      description: `Cambio de estado: ${(current.estado_actual || 'desconocido').toLowerCase()} -> ${normalized}`,
      previousStock: Number(current.prod_stock || 0),
      newStock: Number(current.prod_stock || 0),
      previousPrice: Number(current.prod_precio || 0),
      newPrice: Number(current.prod_precio || 0),
    });

    res.json({ message: 'Estado de producto actualizado', est_pro_id: targetEstadoId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
