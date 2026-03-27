import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar a SQLite:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  console.log('🔧 Configurando base de datos SQLite...\n');

  // Habilitar foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Tabla usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('❌ Error creando tabla users:', err);
    else console.log('✅ Tabla "users" lista');
  });

  // Tabla productos
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('❌ Error creando tabla products:', err);
    else console.log('✅ Tabla "products" lista');
  });

  // Tabla órdenes
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'pendiente',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ Error creando tabla orders:', err);
    else console.log('✅ Tabla "orders" lista');
  });

  // Tabla gastos
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('❌ Error creando tabla expenses:', err);
    else console.log('✅ Tabla "expenses" lista');
  });

  // Crear índices
  db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)', (err) => {
    if (err) console.error('❌ Error creando índice idx_users_email:', err);
  });

  db.run('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)', (err) => {
    if (err) console.error('❌ Error creando índice idx_products_name:', err);
  });

  db.run('CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)', (err) => {
    if (err) console.error('❌ Error creando índice idx_orders_user_id:', err);
  });

  db.run('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)', (err) => {
    if (err) console.error('❌ Error creando índice idx_expenses_category:', err);
  });

  setTimeout(() => {
    db.close((err) => {
      if (err) console.error(err);
      else {
        console.log('\n✨ Base de datos SQLite configurada correctamente');
        console.log('📁 Archivo: database.sqlite');
        console.log('🚀 Ahora puedes ejecutar: npm run dev\n');
      }
    });
  }, 500);
});

