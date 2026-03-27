import { query } from '../db.js';

async function run() {
  const [tableExistsRow] = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = 'metodo_pago'`
  );

  const tableExists = Number(tableExistsRow?.total || 0) > 0;
  if (!tableExists) {
    console.log('metodo_pago: MISSING');
    console.log('fecha_ingreso: SKIPPED');
    return;
  }

  const [columnExistsRow] = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'metodo_pago'
       AND column_name = 'fecha_ingreso'`
  );

  const columnExists = Number(columnExistsRow?.total || 0) > 0;

  if (!columnExists) {
    await query(
      `ALTER TABLE metodo_pago
       ADD COLUMN fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER mp_no_pago`
    );
  }

  const [verifyRow] = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'metodo_pago'
       AND column_name = 'fecha_ingreso'`
  );

  console.log('metodo_pago:', tableExists ? 'OK' : 'MISSING');
  console.log('fecha_ingreso:', Number(verifyRow?.total || 0) > 0 ? 'OK' : 'MISSING');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('ERROR', error.message);
    process.exit(1);
  });
