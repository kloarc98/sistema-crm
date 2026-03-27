import { query } from './db.js';
const userId = 6;
const rows = await query(`SELECT c.cli_id, c.cli_nombre_empresa, c.dep_id, c.mun_id
FROM cliente c
WHERE EXISTS (
  SELECT 1
  FROM usuario_departamento ud
  WHERE ud.usr_id = ?
    AND ud.dep_id = c.dep_id
    AND (
      ud.cobertura = 'ALL'
      OR (
        ud.cobertura = 'PARTIAL'
        AND EXISTS (
          SELECT 1
          FROM usuario_departamento_municipio udm
          WHERE udm.usr_id = ud.usr_id
            AND udm.dep_id = ud.dep_id
            AND udm.mun_id = c.mun_id
        )
      )
    )
)
ORDER BY c.cli_id DESC`, [userId]);
console.log('VISIBLE_CLIENTS_FOR_6', rows);
