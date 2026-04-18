/**
 * Migración: Agrega precio premium a productos y tipo de cliente a la tabla cliente.
 *
 * Cambios:
 *  - producto.prod_precio_premium  DECIMAL(10,2) NULL  — precio para clientes premium
 *  - cliente.cli_tipo  ENUM('estandar','premium') DEFAULT 'estandar'
 */

import { query } from '../db.js';

async function run() {
  console.log('Ejecutando migración: precio_premium + tipo_cliente...');

  // 1. Columna prod_precio_premium en producto
  const [prodCols] = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'producto'
       AND COLUMN_NAME = 'prod_precio_premium'`
  ).then((rows) => [rows]);

  if (prodCols.length === 0) {
    await query(`
      ALTER TABLE producto
      ADD COLUMN prod_precio_premium DECIMAL(10,2) NULL
        COMMENT 'Precio especial para clientes tipo premium'
        AFTER prod_precio
    `);
    console.log('✓ Columna prod_precio_premium agregada a producto');
  } else {
    console.log('  prod_precio_premium ya existe, se omite');
  }

  // 2. Columna cli_tipo en cliente
  const [cliCols] = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'cliente'
       AND COLUMN_NAME = 'cli_tipo'`
  ).then((rows) => [rows]);

  if (cliCols.length === 0) {
    await query(`
      ALTER TABLE cliente
      ADD COLUMN cli_tipo ENUM('estandar','premium') NOT NULL DEFAULT 'estandar'
        COMMENT 'Tipo de cliente: estandar o premium'
        AFTER cli_nit
    `);
    console.log('✓ Columna cli_tipo agregada a cliente');
  } else {
    console.log('  cli_tipo ya existe, se omite');
  }

  console.log('Migración completada.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error en la migración:', err);
  process.exit(1);
});
