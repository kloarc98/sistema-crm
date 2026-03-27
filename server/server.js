import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import {
  ensureLoginHistoryTable,
  ensureOrderActionsHistoryTable,
  ensureProductCategoryColumn,
  ensureProductMovementsHistoryTable,
  ensureRoleScreenPermissionsSchema,
  ensureShippingProvidersSchema,
  testConnection,
} from './db.js';
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import ordersRoutes from './routes/orders.js';
import clientsRoutes from './routes/clients.js';
import shippingProvidersRoutes from './routes/shippingProviders.js';
import { attachRealtime } from './realtime.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

attachRealtime(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Verificar conexión a BD al iniciar
(async () => {
  const connectionTest = await testConnection();
  if (connectionTest.success) {
    console.log('✓ Conexión a BD establecida correctamente');
    try {
      await ensureLoginHistoryTable();
      console.log('✓ Tabla historial_ingreso_usuario verificada');
    } catch (error) {
      console.error('✗ Error al verificar historial_ingreso_usuario:', error.message);
    }

    try {
      await ensureOrderActionsHistoryTable();
      console.log('✓ Tabla historial_acciones_pedido verificada');
    } catch (error) {
      console.error('✗ Error al verificar historial_acciones_pedido:', error.message);
    }

    try {
      await ensureProductMovementsHistoryTable();
      console.log('✓ Tabla historial_movimientos_producto verificada');
    } catch (error) {
      console.error('✗ Error al verificar historial_movimientos_producto:', error.message);
    }

    try {
      await ensureProductCategoryColumn();
      console.log('✓ Columna producto.prod_categoria verificada');
    } catch (error) {
      console.error('✗ Error al verificar columna producto.prod_categoria:', error.message);
    }

    try {
      await ensureShippingProvidersSchema();
      console.log('✓ Tabla proveedor_envio y columnas de envio verificadas');
    } catch (error) {
      console.error('✗ Error al verificar esquema de proveedores de envio:', error.message);
    }

    try {
      await ensureRoleScreenPermissionsSchema();
      console.log('✓ Tablas de permisos por rol/pantalla verificadas');
    } catch (error) {
      console.error('✗ Error al verificar permisos por rol/pantalla:', error.message);
    }
  } else {
    console.error('✗ Error de conexión a BD:', connectionTest.message);
  }
})();

// Rutas
app.get('/', (req, res) => {
  res.json({
    mensaje: '🚀 Servidor System Backend funcionando',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      usuarios: {
        listar: 'GET /api/auth/users',
        crear: 'POST /api/auth/users',
        obtener: 'GET /api/auth/users/:id',
        historialIngreso: 'GET /api/auth/users/:id/login-history?limit=50'
      },
      productos: {
        listar: 'GET /api/products',
        crear: 'POST /api/products',
        obtener: 'GET /api/products/:id',
        actualizar: 'PUT /api/products/:id',
        eliminar: 'DELETE /api/products/:id'
      },
      clientes: {
        listar: 'GET /api/clients',
        crear: 'POST /api/clients',
        obtener: 'GET /api/clients/:id',
        actualizar: 'PUT /api/clients/:id',
        estado: 'PUT /api/clients/:id/status'
      },
      ordenes: {
        listar: 'GET /api/orders',
        crear: 'POST /api/orders',
        obtener: 'GET /api/orders/:id',
        actualizar: 'PUT /api/orders/:id'
      }
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'Servidor funcionando correctamente' });
});

// Rutas de API
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/shipping-providers', shippingProvidersRoutes);

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
