import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabase() {
  console.log('🔍 Verificando conexión a MySQL...\n');

  // Mostrar configuración
  console.log('📋 Configuración actual:');
  console.log(`   Host: ${process.env.DB_HOST}`);
  console.log(`   Puerto: ${process.env.DB_PORT}`);
  console.log(`   Usuario: ${process.env.DB_USER}`);
  console.log(`   BD: ${process.env.DB_NAME}\n`);

  try {
    // Conexión sin especificar BD (para verificar credenciales)
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });

    console.log('✅ Conexión a MySQL establecida');

    // Verificar si la BD existe
    const [databases] = await connection.execute(
      'SHOW DATABASES LIKE ?',
      [process.env.DB_NAME]
    );

    if (databases.length === 0) {
      console.log(`❌ Base de datos "${process.env.DB_NAME}" NO existe`);
      console.log('\n📝 Para crear la BD y las tablas, ejecuta:');
      console.log(`   mysql -u ${process.env.DB_USER} -p < schema.sql`);
    } else {
      console.log(`✅ Base de datos "${process.env.DB_NAME}" existe`);

      // Conectar a la BD y verificar tablas
      await connection.changeUser({ database: process.env.DB_NAME });

      const [tables] = await connection.execute(
        'SHOW TABLES'
      );

      if (tables.length === 0) {
        console.log('⚠️  La BD existe pero NO tiene tablas');
        console.log('\n📝 Para crear las tablas, ejecuta:');
        console.log(`   mysql -u ${process.env.DB_USER} -p ${process.env.DB_NAME} < schema.sql`);
      } else {
        console.log(`✅ Base de datos tiene ${tables.length} tablas`);
        console.log('   Tablas encontradas:');
        tables.forEach(row => {
          const tableName = Object.values(row)[0];
          console.log(`   - ${tableName}`);
        });
      }
    }

    await connection.end();
    console.log('\n✨ Verificación completada');

  } catch (error) {
    console.error('❌ Error de conexión:');
    console.error(`   ${error.message}`);
    console.log('\n💡 Soluciones:');
    console.log('   1. Verifica que MySQL está corriendo');
    console.log('   2. Comprueba que las credenciales en .env son correctas');
    console.log('   3. Asegúrate de que el usuario existe en MySQL');
    console.log(`   4. Intenta conectar manualmente:`);
    console.log(`      mysql -u ${process.env.DB_USER} -p`);
  }
}

checkDatabase();
