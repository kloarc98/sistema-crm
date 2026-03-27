import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// GET /api/shipping-providers - Listar todos los proveedores de envío
router.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT prov_envio_id AS id, prov_envio_nombre AS nombre FROM proveedor_envio ORDER BY prov_envio_nombre ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
