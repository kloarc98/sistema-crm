import express from 'express';
import { query } from '../db.js';

const router = express.Router();

function isAdminRole(roleValue) {
  const role = String(roleValue || '').toLowerCase().trim();
  return role === 'admin' || role.includes('admin');
}

function isJefeRole(roleValue) {
  const role = String(roleValue || '').toLowerCase().trim();
  return role === 'jefe' || role.includes('jefe');
}

function canViewAllClients(roleValue) {
  return isAdminRole(roleValue) || isJefeRole(roleValue);
}

function getRequesterContext(req) {
  const requesterRole = String(req.headers['x-user-role'] || req.query?.requesterRole || '').trim();
  const requesterUserIdRaw = req.headers['x-user-id'] || req.query?.requesterUserId;
  const requesterUsername = String(req.headers['x-user-username'] || req.query?.requesterUsername || '').trim();
  const requesterUserId = Number(requesterUserIdRaw);

  return {
    requesterRole,
    requesterUsername,
    requesterUserId: Number.isInteger(requesterUserId) && requesterUserId > 0 ? requesterUserId : null,
  };
}

async function resolveRequesterUserId({ requesterUserId, requesterUsername }) {
  if (requesterUserId) {
    return requesterUserId;
  }

  if (!requesterUsername) {
    return null;
  }

  const rows = await query(
    `SELECT usr_id
     FROM usuario
     WHERE usr_nit = ? OR usr_correo = ? OR usr_nombre = ?
     LIMIT 1`,
    [requesterUsername, requesterUsername, requesterUsername]
  );

  if (rows.length === 0) {
    return null;
  }

  const numericId = Number(rows[0].usr_id);
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

async function getEstadoClienteIdByName(estadoNombre) {
  const rows = await query(
    'SELECT est_cli_id FROM estado_cliente WHERE LOWER(est_cli_nombre) = LOWER(?) LIMIT 1',
    [estadoNombre]
  );

  if (rows.length > 0) {
    return Number(rows[0].est_cli_id);
  }

  const result = await query('INSERT INTO estado_cliente (est_cli_nombre) VALUES (?)', [estadoNombre]);
  return Number(result.insertId);
}

async function validateMunicipioDepartamento(depId, munId) {
  if (!depId || !munId) {
    return false;
  }

  const rows = await query(
    `SELECT mun_id
     FROM municipio
     WHERE mun_id = ?
       AND dep_id = ?
     LIMIT 1`,
    [munId, depId]
  );

  return rows.length > 0;
}

router.get('/departments', async (req, res) => {
  try {
    const rows = await query(
      `SELECT dep_id AS id, dep_nombre AS nombre
       FROM departamento
       ORDER BY dep_id ASC`
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/departments/:depId/municipalities', async (req, res) => {
  const depId = Number(req.params.depId);
  if (!Number.isInteger(depId) || depId <= 0) {
    return res.status(400).json({ error: 'Departamento inválido' });
  }

  try {
    const rows = await query(
      `SELECT mun_id AS id, mun_nombre AS nombre
       FROM municipio
       WHERE dep_id = ?
       ORDER BY mun_id ASC`,
      [depId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats/departments', async (req, res) => {
  try {
    const rows = await query(
      `SELECT
         d.dep_id,
         d.dep_nombre,
         COUNT(DISTINCT c.cli_id) AS total_clientes,
         COUNT(DISTINCT p.ped_id)  AS total_pedidos,
         COALESCE(SUM(p.ped_monto_tot), 0) AS total_ventas
       FROM departamento d
       LEFT JOIN cliente c ON c.dep_id = d.dep_id
       LEFT JOIN pedidos p ON p.cli_id = c.cli_id
       GROUP BY d.dep_id, d.dep_nombre
       ORDER BY d.dep_id ASC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const requesterContext = getRequesterContext(req);
    const { requesterRole } = requesterContext;
    const hasFullAccess = canViewAllClients(requesterRole);
    const resolvedRequesterUserId = hasFullAccess ? null : await resolveRequesterUserId(requesterContext);

    if (!hasFullAccess && !resolvedRequesterUserId) {
      return res.status(400).json({ error: 'Falta identificar el usuario solicitante' });
    }

    const visibilityCondition = hasFullAccess
      ? ''
      : `WHERE EXISTS (
          SELECT 1
          FROM usuario_departamento ud
          WHERE ud.usr_id = ?
            AND ud.dep_id = c.dep_id
            AND (
              UPPER(TRIM(ud.cobertura)) = 'ALL'
              OR (
                UPPER(TRIM(ud.cobertura)) = 'PARTIAL'
                AND EXISTS (
                  SELECT 1
                  FROM usuario_departamento_municipio udm
                  WHERE udm.usr_id = ud.usr_id
                    AND udm.dep_id = ud.dep_id
                    AND udm.mun_id = c.mun_id
                )
              )
            )
        )`;

    const clients = await query(
      `SELECT
        c.cli_id AS id,
        UPPER(COALESCE(c.cli_nombre_empresa, '')) AS nombreEmpresa,
        UPPER(COALESCE(c.\`cli_dueño\`, '')) AS nombreDueno,
        COALESCE(c.cli_direccion, '') AS direccion,
        COALESCE(c.cli_telefono, '') AS telefono,
        COALESCE(c.cli_telefono_op, '') AS telefonoOpcional,
        COALESCE(c.cli_correo, '') AS correo,
        UPPER(COALESCE(c.cli_nit, '')) AS nit,
        COALESCE(c.cli_tipo, 'estandar') AS tipoCliente,
        c.dep_id AS departamentoId,
        COALESCE(d.dep_nombre, '') AS departamentoNombre,
        c.mun_id AS municipioId,
        COALESCE(m.mun_nombre, '') AS municipioNombre,
        c.est_cli_id AS est_id,
        COALESCE(ec.est_cli_nombre, 'activo') AS estado,
        c.fecha_creacion AS fecha_creacion
      FROM cliente c
      LEFT JOIN estado_cliente ec ON ec.est_cli_id = c.est_cli_id
      LEFT JOIN departamento d ON d.dep_id = c.dep_id
      LEFT JOIN municipio m ON m.mun_id = c.mun_id AND m.dep_id = c.dep_id
      ${visibilityCondition}
      ORDER BY c.cli_id DESC`,
      hasFullAccess ? [] : [resolvedRequesterUserId]
    );

    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const requesterContext = getRequesterContext(req);
    const { requesterRole } = requesterContext;
    const hasFullAccess = canViewAllClients(requesterRole);
    const resolvedRequesterUserId = hasFullAccess ? null : await resolveRequesterUserId(requesterContext);

    if (!hasFullAccess && !resolvedRequesterUserId) {
      return res.status(400).json({ error: 'Falta identificar el usuario solicitante' });
    }

    const visibilityCondition = hasFullAccess
      ? ''
      : `AND EXISTS (
          SELECT 1
          FROM usuario_departamento ud
          WHERE ud.usr_id = ?
            AND ud.dep_id = c.dep_id
            AND (
              UPPER(TRIM(ud.cobertura)) = 'ALL'
              OR (
                UPPER(TRIM(ud.cobertura)) = 'PARTIAL'
                AND EXISTS (
                  SELECT 1
                  FROM usuario_departamento_municipio udm
                  WHERE udm.usr_id = ud.usr_id
                    AND udm.dep_id = ud.dep_id
                    AND udm.mun_id = c.mun_id
                )
              )
            )
        )`;

    const clients = await query(
      `SELECT
        c.cli_id AS id,
        UPPER(COALESCE(c.cli_nombre_empresa, '')) AS nombreEmpresa,
        UPPER(COALESCE(c.\`cli_dueño\`, '')) AS nombreDueno,
        COALESCE(c.cli_direccion, '') AS direccion,
        COALESCE(c.cli_telefono, '') AS telefono,
        COALESCE(c.cli_telefono_op, '') AS telefonoOpcional,
        COALESCE(c.cli_correo, '') AS correo,
        UPPER(COALESCE(c.cli_nit, '')) AS nit,
        COALESCE(c.cli_tipo, 'estandar') AS tipoCliente,
        c.dep_id AS departamentoId,
        COALESCE(d.dep_nombre, '') AS departamentoNombre,
        c.mun_id AS municipioId,
        COALESCE(m.mun_nombre, '') AS municipioNombre,
        c.est_cli_id AS est_id,
        COALESCE(ec.est_cli_nombre, 'activo') AS estado,
        c.fecha_creacion AS fecha_creacion
      FROM cliente c
      LEFT JOIN estado_cliente ec ON ec.est_cli_id = c.est_cli_id
      LEFT JOIN departamento d ON d.dep_id = c.dep_id
      LEFT JOIN municipio m ON m.mun_id = c.mun_id AND m.dep_id = c.dep_id
      WHERE c.cli_id = ?
      ${visibilityCondition}`,
      hasFullAccess ? [req.params.id] : [req.params.id, resolvedRequesterUserId]
    );

    if (clients.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json(clients[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  const {
    nombreEmpresa,
    nombreDueno,
    direccion,
    telefono,
    telefonoOpcional,
    correo,
    nit,
    departamentoId,
    municipioId,
    tipoCliente,
  } = req.body;

  if (!nombreEmpresa) {
    return res.status(400).json({ error: 'El nombre de empresa es requerido' });
  }

  try {
    const depIdValue = departamentoId === null || typeof departamentoId === 'undefined' || departamentoId === ''
      ? null
      : Number(departamentoId);
    const munIdValue = municipioId === null || typeof municipioId === 'undefined' || municipioId === ''
      ? null
      : Number(municipioId);

    if ((depIdValue === null) !== (munIdValue === null)) {
      return res.status(400).json({ error: 'Debes enviar departamento y municipio juntos' });
    }

    if (depIdValue !== null && munIdValue !== null) {
      if (!Number.isInteger(depIdValue) || depIdValue <= 0 || !Number.isInteger(munIdValue) || munIdValue <= 0) {
        return res.status(400).json({ error: 'Departamento o municipio inválido' });
      }

      const isValidRelation = await validateMunicipioDepartamento(depIdValue, munIdValue);
      if (!isValidRelation) {
        return res.status(400).json({ error: 'El municipio no pertenece al departamento indicado' });
      }
    }

    const estadoId = await getEstadoClienteIdByName('activo');
    const tipoClienteValue = tipoCliente === 'premium' ? 'premium' : 'estandar';
    const result = await query(
      `INSERT INTO cliente (
        cli_nombre_empresa,
        \`cli_dueño\`,
        cli_direccion,
        dep_id,
        mun_id,
        cli_telefono,
        cli_telefono_op,
        cli_correo,
        cli_nit,
        cli_tipo,
        est_cli_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(nombreEmpresa).toUpperCase(),
        String(nombreDueno || '').toUpperCase() || null,
        direccion || null,
        depIdValue,
        munIdValue,
        telefono || null,
        telefonoOpcional || null,
        correo || null,
        String(nit || '').toUpperCase() || null,
        tipoClienteValue,
        estadoId,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      nombreEmpresa: String(nombreEmpresa).toUpperCase(),
      nombreDueno: String(nombreDueno || '').toUpperCase(),
      direccion: direccion || '',
      departamentoId: depIdValue,
      municipioId: munIdValue,
      telefono: telefono || '',
      telefonoOpcional: telefonoOpcional || '',
      correo: correo || '',
      nit: String(nit || '').toUpperCase(),
      tipoCliente: tipoClienteValue,
      estado: 'activo',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const {
    nombreEmpresa,
    nombreDueno,
    direccion,
    telefono,
    telefonoOpcional,
    correo,
    nit,
    departamentoId,
    municipioId,
    tipoCliente,
  } = req.body;

  try {
    const setClauses = [];
    const params = [];

    if (typeof nombreEmpresa !== 'undefined' && nombreEmpresa !== '') {
      setClauses.push('cli_nombre_empresa = ?');
      params.push(String(nombreEmpresa).toUpperCase());
    }

    if (typeof nombreDueno !== 'undefined') {
      setClauses.push('`cli_dueño` = ?');
      params.push(nombreDueno ? String(nombreDueno).toUpperCase() : null);
    }

    if (typeof direccion !== 'undefined') {
      setClauses.push('cli_direccion = ?');
      params.push(direccion || null);
    }

    if (typeof departamentoId !== 'undefined') {
      const depIdValue = departamentoId === null || departamentoId === '' ? null : Number(departamentoId);
      if (depIdValue !== null && (!Number.isInteger(depIdValue) || depIdValue <= 0)) {
        return res.status(400).json({ error: 'Departamento inválido' });
      }

      if (depIdValue === null) {
        setClauses.push('dep_id = NULL');
      } else {
        setClauses.push('dep_id = ?');
        params.push(depIdValue);
      }
    }

    if (typeof municipioId !== 'undefined') {
      const munIdValue = municipioId === null || municipioId === '' ? null : Number(municipioId);
      if (munIdValue !== null && (!Number.isInteger(munIdValue) || munIdValue <= 0)) {
        return res.status(400).json({ error: 'Municipio inválido' });
      }

      if (munIdValue === null) {
        setClauses.push('mun_id = NULL');
      } else {
        setClauses.push('mun_id = ?');
        params.push(munIdValue);
      }
    }

    if (typeof departamentoId !== 'undefined' || typeof municipioId !== 'undefined') {
      const relationRows = await query(
        'SELECT dep_id, mun_id FROM cliente WHERE cli_id = ? LIMIT 1',
        [req.params.id]
      );

      if (relationRows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const currentDepId = relationRows[0].dep_id === null ? null : Number(relationRows[0].dep_id);
      const currentMunId = relationRows[0].mun_id === null ? null : Number(relationRows[0].mun_id);

      const newDepId = typeof departamentoId === 'undefined'
        ? currentDepId
        : (departamentoId === null || departamentoId === '' ? null : Number(departamentoId));

      const newMunId = typeof municipioId === 'undefined'
        ? currentMunId
        : (municipioId === null || municipioId === '' ? null : Number(municipioId));

      if ((newDepId === null) !== (newMunId === null)) {
        return res.status(400).json({ error: 'Debes enviar departamento y municipio juntos' });
      }

      if (newDepId !== null && newMunId !== null) {
        const isValidRelation = await validateMunicipioDepartamento(newDepId, newMunId);
        if (!isValidRelation) {
          return res.status(400).json({ error: 'El municipio no pertenece al departamento indicado' });
        }
      }
    }

    if (typeof telefono !== 'undefined') {
      setClauses.push('cli_telefono = ?');
      params.push(telefono || null);
    }

    if (typeof telefonoOpcional !== 'undefined') {
      setClauses.push('cli_telefono_op = ?');
      params.push(telefonoOpcional || null);
    }

    if (typeof correo !== 'undefined') {
      setClauses.push('cli_correo = ?');
      params.push(correo || null);
    }

    if (typeof nit !== 'undefined') {
      setClauses.push('cli_nit = ?');
      params.push(nit ? String(nit).toUpperCase() : null);
    }

    if (typeof tipoCliente !== 'undefined') {
      const tipoValue = tipoCliente === 'premium' ? 'premium' : 'estandar';
      setClauses.push('cli_tipo = ?');
      params.push(tipoValue);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    params.push(req.params.id);

    await query(
      `UPDATE cliente SET ${setClauses.join(', ')} WHERE cli_id = ?`,
      params
    );

    res.json({ message: 'Cliente actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/status', async (req, res) => {
  const requesterRole = String(req.headers['x-user-role'] || req.body?.requesterRole || '').toLowerCase();
  if (!isAdminRole(requesterRole)) {
    return res.status(403).json({ error: 'Solo el administrador puede cambiar el estado del cliente' });
  }

  const estadoSolicitado = String(req.body?.estado || '').toLowerCase();
  if (estadoSolicitado !== 'activo' && estadoSolicitado !== 'inactivo') {
    return res.status(400).json({ error: 'Estado inválido. Usa activo o inactivo' });
  }

  try {
    const estadoId = await getEstadoClienteIdByName(estadoSolicitado);
    await query('UPDATE cliente SET est_cli_id = ? WHERE cli_id = ?', [estadoId, req.params.id]);

    res.json({ message: 'Estado de cliente actualizado', est_id: estadoId, estado: estadoSolicitado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
