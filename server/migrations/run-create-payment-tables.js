import { query } from '../db.js';

async function run() {
  await query(
    `CREATE TABLE IF NOT EXISTS tipo_pago (
      tp_id_meto INT AUTO_INCREMENT PRIMARY KEY,
      tp_descrip VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS metodo_pago (
      mp_id INT AUTO_INCREMENT PRIMARY KEY,
      ped_id INT NOT NULL,
      tp_id_meto INT NOT NULL,
      mp_monto_pago DECIMAL(10,2) NOT NULL,
      mp_no_pago INT NOT NULL,
      fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_metodo_pago_pedido
        FOREIGN KEY (ped_id) REFERENCES pedidos(ped_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_metodo_pago_tipo
        FOREIGN KEY (tp_id_meto) REFERENCES tipo_pago(tp_id_meto)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      INDEX idx_metodo_pago_ped_id (ped_id),
      INDEX idx_metodo_pago_tp_id_meto (tp_id_meto)
    ) ENGINE=InnoDB`
  );

  const defaultTypes = ['Transferencia', 'Cheque', 'Deposito'];
  for (const type of defaultTypes) {
    await query(
      `INSERT INTO tipo_pago (tp_descrip)
       SELECT ?
       WHERE NOT EXISTS (
         SELECT 1 FROM tipo_pago WHERE LOWER(tp_descrip) = LOWER(?)
       )`,
      [type, type]
    );
  }

  const [tipoPagoExists, metodoPagoExists] = await Promise.all([
    query(
      `SELECT COUNT(*) AS total
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'tipo_pago'`
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'metodo_pago'`
    ),
  ]);

  console.log('tipo_pago:', Number(tipoPagoExists?.[0]?.total || 0) > 0 ? 'OK' : 'MISSING');
  console.log('metodo_pago:', Number(metodoPagoExists?.[0]?.total || 0) > 0 ? 'OK' : 'MISSING');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('ERROR', error.message);
    process.exit(1);
  });
