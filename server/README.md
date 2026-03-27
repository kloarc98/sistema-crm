# 🗄️ Conexión a Base de Datos MySQL

Este servidor Node.js/Express proporciona una conexión completa a MySQL para tu aplicación React.

## 📋 Requisitos

- Node.js (v16+)
- MySQL Server corriendo localmente
- npm o yarn

## 🚀 Instalación

### 1. Instalar dependencias del servidor

```bash
cd server
npm install
```

### 2. Configurar la base de datos

#### Opción A: Script SQL (Recomendado)
Ejecuta el archivo `schema.sql` en tu cliente MySQL:

```bash
mysql -u root -p < schema.sql
```

#### Opción B: Manualmente
Abre MySQL y ejecuta:
```sql
CREATE DATABASE sistema_ventas;
USE sistema_ventas;
-- Luego copia el contenido de schema.sql
```

### 3. Configurar variables de entorno

Edita `.env` con tus credenciales de MySQL:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_contraseña
DB_NAME=sistema_ventas
PORT=3001

# SMTP para recuperacion de contrasena
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_correo@dominio.com
SMTP_PASS=tu_password_o_app_password
SMTP_FROM=Sistema de Gestion <tu_correo@dominio.com>
```

## ▶️ Ejecutar el servidor

```bash
# Modo desarrollo (con auto-reload)
npm run dev

# Modo producción
npm start
```

El servidor estará disponible en `http://localhost:3001`

## 📡 Endpoints disponibles

### Health Check
- `GET /api/health` - Verifica que el servidor está funcionando

### Usuarios (Auth)
- `GET /api/auth/users` - Obtener todos los usuarios
- `POST /api/auth/users` - Crear nuevo usuario
- `POST /api/auth/forgot-password` - Recuperar acceso enviando la contrasena al correo por NIT
- `GET /api/auth/users/:id` - Obtener usuario por ID
- `GET /api/auth/users/:id/login-history?limit=50` - Obtener historial de ingresos del usuario (solo admin)

### Productos
- `GET /api/products` - Obtener todos los productos
- `POST /api/products` - Crear nuevo producto
- `GET /api/products/:id` - Obtener producto por ID
- `PUT /api/products/:id` - Actualizar producto
- `DELETE /api/products/:id` - Eliminar producto

### Órdenes
- `GET /api/orders` - Obtener todas las órdenes
- `POST /api/orders` - Crear nueva orden
- `GET /api/orders/:id` - Obtener orden por ID
- `GET /api/orders/:id/actions` - Obtener historial de acciones de la orden
- `PUT /api/orders/:id` - Actualizar orden

## 🔗 Conectar desde React

Ejemplo de llamada API desde tu frontend:

```javascript
// En tu componente React
const fetchProducts = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/products');
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error('Error:', error);
  }
};
```

Configura las URLs en Vite si usas proxy:

```javascript
// vite.config.ts
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
}
```

## 📦 Estructura del servidor

```
server/
├── server.js           # Servidor principal
├── db.js              # Conexión a MySQL
├── package.json       # Dependencias
├── .env               # Variables de entorno
├── schema.sql         # Esquema de BD
└── routes/
    ├── auth.js        # Rutas de usuarios
    ├── products.js    # Rutas de productos
  └── orders.js      # Rutas de órdenes
```

## 🔐 Notas de seguridad

- En producción, usa contraseñas seguras
- Implementa autenticación (JWT recomendado)
- Valida y sanitiza todas las entradas
- Usa variables de entorno para credenciales
- Implementa rate limiting

## 📝 Ejemplos de uso

### Crear un producto

```bash
curl -X POST http://localhost:3001/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "description": "Laptop gaming",
    "price": 1200.00,
    "stock": 5
  }'
```

### Crear un usuario

```bash
curl -X POST http://localhost:3001/api/auth/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }'
```

## 🆘 Solución de problemas

**Error: "Cannot find module 'mysql2'"**
```bash
npm install
```

**Error: "connect ECONNREFUSED 127.0.0.1:3306"**
- Verifica que MySQL está corriendo
- Comprueba las credenciales en `.env`

**Error: "Unknown database 'sistema_ventas'"**
- Ejecuta el script `schema.sql`
- O crea manualmente la BD

## 🎯 Próximos pasos

1. Implementar autenticación JWT
2. Agregar validación de datos
3. Implementar logging
4. Crear middleware de error handling
5. Agregar tests

---

¡Listo! Tu conexión a MySQL está configurada y funcionando. 🎉
