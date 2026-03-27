import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const connectionConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sistema_ventas',
};

async function viewTable(connection, tableName) {
  try {
    const [rows] = await connection.execute(`SELECT * FROM ${tableName}`);
    console.log(`\n📊 Tabla: ${tableName.toUpperCase()}`);
    console.log('═'.repeat(80));
    if (rows.length === 0) {
      console.log('   (vacía)');
    } else {
      console.table(rows);
    }
  } catch (error) {
    console.error(`❌ Error en tabla ${tableName}:`, error.message);
  }
}

async function viewDatabase() {
  console.log(`\n🗄️  BASE DE DATOS MYSQL - ${connectionConfig.database}\n`);
  const connection = await mysql.createConnection(connectionConfig);

  const tables = [
    'rol',
    'estado_usr',
    'estado_pedido',
    'estado_cliente',
    'estado_producto',
    'proveedor_envio',
    'usuario',
    'historial_ingreso_usuario',
    'cliente',
    'producto',
    'pedidos',
    'historial_acciones_pedido',
    'pedido_detalle',
  ];

  for (const table of tables) {
    await viewTable(connection, table);
  }

  await connection.end();
  console.log('\n✨ Listo\n');
}

viewDatabase().catch((error) => {
  console.error('❌ Error al visualizar la BD:', error.message);
  process.exit(1);
});
