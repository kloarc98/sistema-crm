import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sistema_ventas',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const SCREEN_CATALOG = [
  { key: 'dashboard', name: 'Inicio', path: '/' },
  { key: 'dashboard-analytics', name: 'Dashboard', path: '/dashboard' },
  { key: 'income', name: 'Ventas', path: '/income' },
  { key: 'orders', name: 'Pedidos', path: '/orders' },
  { key: 'reporteria', name: 'Reporteria', path: '/reporteria' },
  { key: 'pagos-pendientes', name: 'Pagos Pendientes', path: '/pagos-pendientes' },
  { key: 'routes', name: 'Rutas', path: '/routes' },
  { key: 'products', name: 'Productos', path: '/products' },
  { key: 'clients', name: 'Clientes', path: '/clients' },
  { key: 'users', name: 'Usuarios', path: '/users' },
  { key: 'settings', name: 'Configuracion', path: '/settings' },
  { key: 'role-screen-permissions', name: 'Roles y Pantallas', path: '/role-screen-permissions' },
];

// Función para ejecutar queries
export function query(sql, params = []) {
  const statement = sql.trim().toUpperCase();
  const isReadQuery =
    statement.startsWith('SELECT') ||
    statement.startsWith('SHOW') ||
    statement.startsWith('DESCRIBE') ||
    statement.startsWith('EXPLAIN');

  if (isReadQuery) {
    return pool.execute(sql, params).then(([rows]) => rows || []);
  }

  return pool.execute(sql, params).then(([result]) => ({
    insertId: result.insertId,
    changes: result.affectedRows,
    success: true,
  }));
}

// Función para probar la conexión
export async function testConnection() {
  try {
    await query('SELECT 1');
    return { success: true, message: 'Conexión a MySQL exitosa' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export async function ensureLoginHistoryTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS historial_ingreso_usuario (
      hiu_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      usr_id INT NOT NULL,
      hiu_fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      hiu_ip VARCHAR(45),
      hiu_user_agent VARCHAR(255),
      CONSTRAINT fk_historial_ingreso_usuario
        FOREIGN KEY (usr_id) REFERENCES usuario(usr_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      INDEX idx_hiu_usr_id_fecha (usr_id, hiu_fecha_ingreso)
    ) ENGINE=InnoDB`
  );
}

export async function ensureOrderActionsHistoryTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS historial_acciones_pedido (
      hap_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      ped_id INT NOT NULL,
      est_ped_id INT,
      usr_id INT,
      hap_accion VARCHAR(100) NOT NULL,
      hap_descripcion TEXT,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_hap_pedido
        FOREIGN KEY (ped_id) REFERENCES pedidos(ped_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_hap_estado_pedido
        FOREIGN KEY (est_ped_id) REFERENCES estado_pedido(est_ped_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_hap_usuario
        FOREIGN KEY (usr_id) REFERENCES usuario(usr_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      INDEX idx_hap_pedido_fecha (ped_id, fecha_creacion),
      INDEX idx_hap_estado (est_ped_id)
    ) ENGINE=InnoDB`
  );
}

export async function ensureProductMovementsHistoryTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS historial_movimientos_producto (
      hmp_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      prod_id INT NOT NULL,
      usr_id INT,
      hmp_tipo VARCHAR(100) NOT NULL,
      hmp_descripcion TEXT,
      hmp_stock_anterior INT,
      hmp_stock_nuevo INT,
      hmp_precio_anterior DECIMAL(10,2),
      hmp_precio_nuevo DECIMAL(10,2),
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_hmp_producto
        FOREIGN KEY (prod_id) REFERENCES producto(prod_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_hmp_usuario
        FOREIGN KEY (usr_id) REFERENCES usuario(usr_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      INDEX idx_hmp_producto_fecha (prod_id, fecha_creacion),
      INDEX idx_hmp_tipo (hmp_tipo)
    ) ENGINE=InnoDB`
  );
}

export async function ensureProductCategoryColumn() {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'producto'
       AND column_name = 'prod_categoria'`
  );

  const exists = Number(rows?.[0]?.total || 0) > 0;
  if (exists) {
    return;
  }

  await query(`ALTER TABLE producto ADD COLUMN prod_categoria VARCHAR(150) NULL AFTER prod_stock`);
}

async function tableExists(tableName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [tableName]
  );

  return Number(rows?.[0]?.total || 0) > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );

  return Number(rows?.[0]?.total || 0) > 0;
}

async function foreignKeyExists(tableName, constraintName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.table_constraints
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND constraint_name = ?
       AND constraint_type = 'FOREIGN KEY'`,
    [tableName, constraintName]
  );

  return Number(rows?.[0]?.total || 0) > 0;
}

export async function ensureShippingProvidersSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS proveedor_envio (
      prov_envio_id INT AUTO_INCREMENT PRIMARY KEY,
      prov_envio_nombre VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB`
  );

  const hasProveedorEnvioId = await columnExists('pedidos', 'proveedor_envio_id');
  if (!hasProveedorEnvioId) {
    await query('ALTER TABLE pedidos ADD COLUMN proveedor_envio_id INT NULL AFTER ped_monto_tot');
  }

  const hasPedGuia = await columnExists('pedidos', 'ped_guia');
  if (!hasPedGuia) {
    await query('ALTER TABLE pedidos ADD COLUMN ped_guia VARCHAR(100) NULL AFTER proveedor_envio_id');
  }

  const hasShippingProviderFk = await foreignKeyExists('pedidos', 'fk_pedido_proveedor_envio');
  if (!hasShippingProviderFk) {
    await query(
      `ALTER TABLE pedidos
       ADD CONSTRAINT fk_pedido_proveedor_envio
       FOREIGN KEY (proveedor_envio_id) REFERENCES proveedor_envio(prov_envio_id)
       ON DELETE SET NULL ON UPDATE CASCADE`
    );
  }

  const hasProviderTable = await tableExists('proveedor_envio');
  if (hasProviderTable) {
    await query(
      `INSERT INTO proveedor_envio (prov_envio_nombre)
       SELECT 'FedEx'
       WHERE NOT EXISTS (
         SELECT 1 FROM proveedor_envio WHERE LOWER(prov_envio_nombre) = 'fedex'
       )`
    );
  }
}

function getDefaultRoleScreenPermission(roleName, screenPath) {
  const normalizedRole = String(roleName || '').toLowerCase().trim();

  const adminPaths = new Set(SCREEN_CATALOG.map((screen) => screen.path));
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

export async function ensureRoleScreenPermissionsSchema() {
  const hasRoleStatus = await columnExists('rol', 'rl_estado');
  if (!hasRoleStatus) {
    await query(`ALTER TABLE rol ADD COLUMN rl_estado VARCHAR(20) NOT NULL DEFAULT 'activo' AFTER rl_nombre`);
  }

  await query(
    `UPDATE rol
     SET rl_estado = 'activo'
     WHERE rl_estado IS NULL OR TRIM(rl_estado) = ''`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS pantalla (
      pantalla_id INT AUTO_INCREMENT PRIMARY KEY,
      pantalla_clave VARCHAR(80) NOT NULL,
      pantalla_nombre VARCHAR(120) NOT NULL,
      pantalla_ruta VARCHAR(160) NOT NULL,
      activa TINYINT(1) NOT NULL DEFAULT 1,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT uq_pantalla_clave UNIQUE (pantalla_clave),
      CONSTRAINT uq_pantalla_ruta UNIQUE (pantalla_ruta)
    ) ENGINE=InnoDB`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS rol_pantalla_permiso (
      rl_id INT NOT NULL,
      pantalla_id INT NOT NULL,
      puede_ver TINYINT(1) NOT NULL DEFAULT 0,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (rl_id, pantalla_id),
      CONSTRAINT fk_rol_pantalla_permiso_rol
        FOREIGN KEY (rl_id) REFERENCES rol(rl_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_rol_pantalla_permiso_pantalla
        FOREIGN KEY (pantalla_id) REFERENCES pantalla(pantalla_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      INDEX idx_rol_pantalla_permiso_pantalla (pantalla_id)
    ) ENGINE=InnoDB`
  );

  for (const screen of SCREEN_CATALOG) {
    await query(
      `INSERT INTO pantalla (pantalla_clave, pantalla_nombre, pantalla_ruta, activa)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         pantalla_nombre = VALUES(pantalla_nombre),
         pantalla_ruta = VALUES(pantalla_ruta),
         activa = VALUES(activa)`,
      [screen.key, screen.name, screen.path]
    );
  }

  const roles = await query(
    `SELECT rl_id, rl_nombre
     FROM rol`
  );

  const screens = await query(
    `SELECT pantalla_id, pantalla_ruta
     FROM pantalla
     WHERE activa = 1`
  );

  for (const role of roles) {
    const roleId = Number(role.rl_id);
    const roleName = String(role.rl_nombre || '');

    if (!Number.isInteger(roleId) || roleId <= 0) {
      continue;
    }

    for (const screen of screens) {
      const screenId = Number(screen.pantalla_id);
      const screenPath = String(screen.pantalla_ruta || '');

      if (!Number.isInteger(screenId) || screenId <= 0 || !screenPath) {
        continue;
      }

      await query(
        `INSERT IGNORE INTO rol_pantalla_permiso (rl_id, pantalla_id, puede_ver)
         VALUES (?, ?, ?)`,
        [roleId, screenId, getDefaultRoleScreenPermission(roleName, screenPath) ? 1 : 0]
      );
    }
  }
}

export default pool;
