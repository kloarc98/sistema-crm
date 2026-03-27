import mysql from 'mysql2/promise';
import { query } from '../db.js';

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

async function triggerExists(triggerName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.triggers
     WHERE trigger_schema = DATABASE()
       AND trigger_name = ?`,
    [triggerName]
  );

  return Number(rows?.[0]?.total || 0) > 0;
}

async function createRawConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_ventas',
  });
}

function buildRecalcTotalsSql(pedIdExpression) {
  return `
    UPDATE pedidos p
    SET
      p.ped_monto_tot = COALESCE((
        SELECT ROUND(SUM(pd.det_subtotal), 2)
        FROM pedido_detalle pd
        WHERE pd.ped_id = p.ped_id
      ), 0),
      p.ped_saldo_pag = COALESCE((
        SELECT ROUND(SUM(mp.mp_monto_pago), 2)
        FROM metodo_pago mp
        WHERE mp.ped_id = p.ped_id
      ), 0),
      p.ped_saldo_pen = GREATEST(
        0,
        COALESCE((
          SELECT ROUND(SUM(pd2.det_subtotal), 2)
          FROM pedido_detalle pd2
          WHERE pd2.ped_id = p.ped_id
        ), 0) -
        COALESCE((
          SELECT ROUND(SUM(mp2.mp_monto_pago), 2)
          FROM metodo_pago mp2
          WHERE mp2.ped_id = p.ped_id
        ), 0)
      )
    WHERE p.ped_id = ${pedIdExpression};
  `;
}

function buildRecalcSaldosSql(pedIdExpression) {
  return `
    UPDATE pedidos p
    SET
      p.ped_saldo_pag = COALESCE((
        SELECT ROUND(SUM(mp.mp_monto_pago), 2)
        FROM metodo_pago mp
        WHERE mp.ped_id = p.ped_id
      ), 0),
      p.ped_saldo_pen = GREATEST(
        0,
        COALESCE(p.ped_monto_tot, 0) -
        COALESCE((
          SELECT ROUND(SUM(mp2.mp_monto_pago), 2)
          FROM metodo_pago mp2
          WHERE mp2.ped_id = p.ped_id
        ), 0)
      )
    WHERE p.ped_id = ${pedIdExpression};
  `;
}

async function dropTriggerIfExists(connection, triggerName) {
  if (!(await triggerExists(triggerName))) {
    return;
  }

  await connection.query(`DROP TRIGGER ${triggerName}`);
  console.log(`DROPPED ${triggerName}`);
}

async function recreateTrigger(connection, triggerName, ddl) {
  await dropTriggerIfExists(connection, triggerName);
  await connection.query(ddl);
  console.log(`CREATED ${triggerName}`);
}

async function assertPrerequisites() {
  const requiredTables = ['pedidos', 'pedido_detalle', 'metodo_pago'];
  for (const tableName of requiredTables) {
    if (!(await tableExists(tableName))) {
      throw new Error(`Tabla requerida no existe: ${tableName}`);
    }
  }

  const requiredColumns = [
    ['pedido_detalle', 'ped_id'],
    ['pedido_detalle', 'det_cantidad'],
    ['pedido_detalle', 'det_precio_unitario'],
    ['pedido_detalle', 'det_subtotal'],
    ['pedidos', 'ped_id'],
    ['pedidos', 'ped_monto_tot'],
    ['pedidos', 'ped_saldo_pag'],
    ['pedidos', 'ped_saldo_pen'],
    ['metodo_pago', 'ped_id'],
    ['metodo_pago', 'mp_monto_pago'],
  ];

  for (const [tableName, columnName] of requiredColumns) {
    if (!(await columnExists(tableName, columnName))) {
      throw new Error(`Columna requerida no existe: ${tableName}.${columnName}`);
    }
  }
}

async function run() {
  await assertPrerequisites();
  const connection = await createRawConnection();

  try {
    await recreateTrigger(
      connection,
      'trg_pedido_detalle_bi_subtotal',
      `CREATE TRIGGER trg_pedido_detalle_bi_subtotal
       BEFORE INSERT ON pedido_detalle
       FOR EACH ROW
       BEGIN
         SET NEW.det_subtotal = ROUND(COALESCE(NEW.det_cantidad, 0) * COALESCE(NEW.det_precio_unitario, 0), 2);
       END`
    );

    await recreateTrigger(
      connection,
      'trg_pedido_detalle_bu_subtotal',
      `CREATE TRIGGER trg_pedido_detalle_bu_subtotal
       BEFORE UPDATE ON pedido_detalle
       FOR EACH ROW
       BEGIN
         SET NEW.det_subtotal = ROUND(COALESCE(NEW.det_cantidad, 0) * COALESCE(NEW.det_precio_unitario, 0), 2);
       END`
    );

    await recreateTrigger(
      connection,
      'trg_pedido_detalle_ai_recalc_pedido',
      `CREATE TRIGGER trg_pedido_detalle_ai_recalc_pedido
       AFTER INSERT ON pedido_detalle
       FOR EACH ROW
       BEGIN
         ${buildRecalcTotalsSql('NEW.ped_id')}
       END`
    );

    await recreateTrigger(
      connection,
      'trg_pedido_detalle_au_recalc_pedido',
      `CREATE TRIGGER trg_pedido_detalle_au_recalc_pedido
       AFTER UPDATE ON pedido_detalle
       FOR EACH ROW
       BEGIN
         ${buildRecalcTotalsSql('NEW.ped_id')}
         IF OLD.ped_id <> NEW.ped_id THEN
           ${buildRecalcTotalsSql('OLD.ped_id')}
         END IF;
       END`
    );

    await recreateTrigger(
      connection,
      'trg_pedido_detalle_ad_recalc_pedido',
      `CREATE TRIGGER trg_pedido_detalle_ad_recalc_pedido
       AFTER DELETE ON pedido_detalle
       FOR EACH ROW
       BEGIN
         ${buildRecalcTotalsSql('OLD.ped_id')}
       END`
    );

    await recreateTrigger(
      connection,
      'trg_metodo_pago_ai_recalc_saldos',
      `CREATE TRIGGER trg_metodo_pago_ai_recalc_saldos
       AFTER INSERT ON metodo_pago
       FOR EACH ROW
       BEGIN
         ${buildRecalcSaldosSql('NEW.ped_id')}
       END`
    );

    await recreateTrigger(
      connection,
      'trg_metodo_pago_au_recalc_saldos',
      `CREATE TRIGGER trg_metodo_pago_au_recalc_saldos
       AFTER UPDATE ON metodo_pago
       FOR EACH ROW
       BEGIN
         ${buildRecalcSaldosSql('NEW.ped_id')}
         IF OLD.ped_id <> NEW.ped_id THEN
           ${buildRecalcSaldosSql('OLD.ped_id')}
         END IF;
       END`
    );

    await recreateTrigger(
      connection,
      'trg_metodo_pago_ad_recalc_saldos',
      `CREATE TRIGGER trg_metodo_pago_ad_recalc_saldos
       AFTER DELETE ON metodo_pago
       FOR EACH ROW
       BEGIN
         ${buildRecalcSaldosSql('OLD.ped_id')}
       END`
    );

    console.log('OK financial triggers created');
  } finally {
    await connection.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('ERROR', error.message);
    process.exit(1);
  });
