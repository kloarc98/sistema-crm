import { query } from "../db.js";

async function tableExists(tableName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [tableName]
  );

  return Number(rows?.[0]?.total || 0) > 0;
}

async function createCoverageTables() {
  const hasUsuario = await tableExists("usuario");
  const hasDepartamento = await tableExists("departamento");
  const hasMunicipio = await tableExists("municipio");

  if (!hasUsuario || !hasDepartamento || !hasMunicipio) {
    throw new Error("Faltan tablas requeridas: usuario, departamento o municipio");
  }

  await query(
    `CREATE TABLE IF NOT EXISTS usuario_departamento (
      usr_id INT NOT NULL,
      dep_id INT NOT NULL,
      cobertura ENUM('ALL', 'PARTIAL') NOT NULL DEFAULT 'PARTIAL',
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (usr_id, dep_id),
      CONSTRAINT fk_usuario_departamento_usuario
        FOREIGN KEY (usr_id) REFERENCES usuario(usr_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_usuario_departamento_departamento
        FOREIGN KEY (dep_id) REFERENCES departamento(dep_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      INDEX idx_usuario_departamento_dep_id (dep_id),
      INDEX idx_usuario_departamento_cobertura (cobertura)
    ) ENGINE=InnoDB`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS usuario_departamento_municipio (
      usr_id INT NOT NULL,
      dep_id INT NOT NULL,
      mun_id INT NOT NULL,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (usr_id, dep_id, mun_id),
      CONSTRAINT fk_udm_usuario_departamento
        FOREIGN KEY (usr_id, dep_id) REFERENCES usuario_departamento(usr_id, dep_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_udm_municipio
        FOREIGN KEY (dep_id, mun_id) REFERENCES municipio(dep_id, mun_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      INDEX idx_udm_dep_mun (dep_id, mun_id)
    ) ENGINE=InnoDB`
  );
}

async function main() {
  await createCoverageTables();

  const depCoverageRows = await query("SELECT COUNT(*) AS total FROM usuario_departamento");
  const munCoverageRows = await query("SELECT COUNT(*) AS total FROM usuario_departamento_municipio");

  console.log(`USUARIO_DEPARTAMENTO: ${Number(depCoverageRows?.[0]?.total || 0)}`);
  console.log(`USUARIO_DEPARTAMENTO_MUNICIPIO: ${Number(munCoverageRows?.[0]?.total || 0)}`);
  console.log("OK: cobertura por usuario/departamento/municipio lista");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR", error?.message || error);
    process.exit(1);
  });
