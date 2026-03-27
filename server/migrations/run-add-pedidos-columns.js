import { query } from '../db.js';

async function ensurePedidosColumns() {
  const checks = [
    [
      'ped_saldo_pag',
      'ALTER TABLE pedidos ADD COLUMN ped_saldo_pag DECIMAL(10,2) NULL AFTER ped_monto_tot',
    ],
    [
      'ped_saldo_pen',
      'ALTER TABLE pedidos ADD COLUMN ped_saldo_pen DECIMAL(10,2) NULL AFTER ped_saldo_pag',
    ],
    [
      'ped_recibo',
      'ALTER TABLE pedidos ADD COLUMN ped_recibo BLOB NULL AFTER ped_saldo_pen',
    ],
  ];

  for (const [columnName, ddl] of checks) {
    const rows = await query(
      `SELECT COUNT(*) AS total
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'pedidos'
         AND column_name = ?`,
      [columnName]
    );

    const exists = Number(rows?.[0]?.total || 0) > 0;
    if (exists) {
      console.log(`EXISTS ${columnName}`);
      continue;
    }

    await query(ddl);
    console.log(`ADDED ${columnName}`);
  }

  const cols = await query(`SHOW COLUMNS FROM pedidos LIKE 'ped_%'`);
  console.log('COLUMNS ped_%:', cols.map((col) => col.Field).join(', '));
}

ensurePedidosColumns()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('ERROR', error.message);
    process.exit(1);
  });
