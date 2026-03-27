import { query } from "../db.js";

const departamentos = [
  "Alta Verapaz",
  "Baja Verapaz",
  "Chimaltenango",
  "Chiquimula",
  "El Progreso",
  "Escuintla",
  "Guatemala",
  "Huehuetenango",
  "Izabal",
  "Jalapa",
  "Jutiapa",
  "Peten",
  "Quetzaltenango",
  "Quiche",
  "Retalhuleu",
  "Sacatepequez",
  "San Marcos",
  "Santa Rosa",
  "Solola",
  "Suchitepequez",
  "Totonicapan",
  "Zacapa",
];

const municipiosPorDepartamento = {
  Guatemala: [
    "Guatemala",
    "Santa Catarina Pinula",
    "San Jose Pinula",
    "San Jose del Golfo",
    "Palencia",
    "Chinautla",
    "San Pedro Ayampuc",
    "Mixco",
    "San Pedro Sacatepequez",
    "San Juan Sacatepequez",
    "San Raymundo",
    "Chuarrancho",
    "Fraijanes",
    "Amatitlan",
    "Villa Nueva",
    "Villa Canales",
    "San Miguel Petapa",
  ],
  "El Progreso": [
    "Guastatoya",
    "Morazan",
    "San Agustin Acasaguastlan",
    "San Cristobal Acasaguastlan",
    "El Jicaro",
    "Sansare",
    "Sanarate",
    "San Antonio La Paz",
  ],
  Sacatepequez: [
    "Antigua Guatemala",
    "Jocotenango",
    "Pastores",
    "Sumpango",
    "Santo Domingo Xenacoj",
    "Santiago Sacatepequez",
    "San Bartolome Milpas Altas",
    "San Lucas Sacatepequez",
    "Santa Lucia Milpas Altas",
    "Magdalena Milpas Altas",
    "Santa Maria de Jesus",
    "Ciudad Vieja",
    "San Miguel Duenas",
    "Alotenango",
    "San Antonio Aguas Calientes",
    "Santa Catarina Barahona",
  ],
  Chimaltenango: [
    "Chimaltenango",
    "San Jose Poaquil",
    "San Martin Jilotepeque",
    "San Juan Comalapa",
    "Santa Apolonia",
    "Tecpan Guatemala",
    "Patzun",
    "San Miguel Pochuta",
    "Patzicia",
    "Santa Cruz Balanya",
    "Acatenango",
    "San Pedro Yepocapa",
    "San Andres Itzapa",
    "Parramos",
    "Zaragoza",
    "El Tejar",
  ],
  Escuintla: [
    "Escuintla",
    "Santa Lucia Cotzumalguapa",
    "La Democracia",
    "Siquinala",
    "Masagua",
    "Pueblo Nuevo Tiquisate",
    "La Gomera",
    "Guanagazapa",
    "Puerto San Jose",
    "Iztapa",
    "Palin",
    "San Vicente Pacaya",
    "Nueva Concepcion",
  ],
  "Santa Rosa": [
    "Cuilapa",
    "Barberena",
    "Santa Rosa de Lima",
    "Casillas",
    "San Rafael Las Flores",
    "Oratorio",
    "San Juan Tecuaco",
    "Chiquimulilla",
    "Taxisco",
    "Santa Maria Ixhuatan",
    "Guazacapan",
    "Santa Cruz Naranjo",
    "Pueblo Nuevo Vinas",
    "Nueva Santa Rosa",
  ],
  Solola: [
    "Solola",
    "San Jose Chacaya",
    "Santa Maria Visitacion",
    "Santa Lucia Utatlan",
    "Nahuala",
    "Santa Catarina Ixtahuacan",
    "Santa Clara La Laguna",
    "Concepcion",
    "San Andres Semetabaj",
    "Panajachel",
    "Santa Catarina Palopo",
    "San Antonio Palopo",
    "San Lucas Toliman",
    "Santa Cruz La Laguna",
    "San Pablo La Laguna",
    "San Marcos La Laguna",
    "San Juan La Laguna",
    "San Pedro La Laguna",
    "Santiago Atitlan",
  ],
  Totonicapan: [
    "Totonicapan",
    "San Cristobal Totonicapan",
    "San Francisco El Alto",
    "San Andres Xecul",
    "Momostenango",
    "Santa Maria Chiquimula",
    "Santa Lucia La Reforma",
    "San Bartolo",
  ],
  Quetzaltenango: [
    "Quetzaltenango",
    "Salcaja",
    "Olintepeque",
    "San Carlos Sija",
    "Sibilia",
    "Cabrican",
    "Cajola",
    "San Miguel Siguila",
    "San Juan Ostuncalco",
    "San Mateo",
    "Concepcion Chiquirichapa",
    "San Martin Sacatepequez",
    "Almolonga",
    "Cantel",
    "Huitan",
    "Zunil",
    "Colomba",
    "San Francisco La Union",
    "El Palmar",
    "Coatepeque",
    "Genova",
    "Flores Costa Cuca",
    "La Esperanza",
    "Palestina de los Altos",
  ],
  Suchitepequez: [
    "Mazatenango",
    "Cuyotenango",
    "San Francisco Zapotitlan",
    "San Bernardino",
    "San Jose El Idolo",
    "Santo Domingo Suchitepequez",
    "San Lorenzo",
    "Samayac",
    "San Pablo Jocopilas",
    "San Antonio Suchitepequez",
    "San Miguel Panan",
    "San Gabriel",
    "Chicacao",
    "Patulul",
    "Santa Barbara",
    "San Juan Bautista",
    "Santo Tomas La Union",
    "Zunilito",
    "Pueblo Nuevo",
    "Rio Bravo",
  ],
  Retalhuleu: [
    "Retalhuleu",
    "San Sebastian",
    "Santa Cruz Mulua",
    "San Martin Zapotitlan",
    "San Felipe",
    "San Andres Villa Seca",
    "Champerico",
    "Nuevo San Carlos",
    "El Asintal",
  ],
  "San Marcos": [
    "San Marcos",
    "San Pedro Sacatepequez",
    "San Antonio Sacatepequez",
    "Comitancillo",
    "San Miguel Ixtahuacan",
    "Concepcion Tutuapa",
    "Tacana",
    "Sibinal",
    "Tajumulco",
    "Tejutla",
    "San Rafael Pie de la Cuesta",
    "Nuevo Progreso",
    "El Tumbador",
    "San Jose El Rodeo",
    "Malacatan",
    "Catarina",
    "Ayutla",
    "Ocos",
    "San Pablo",
    "El Quetzal",
    "La Reforma",
    "Pajapita",
    "Ixchiguan",
    "San Jose Ojetenam",
    "San Cristobal Cucho",
    "Sipacapa",
    "Esquipulas Palo Gordo",
    "Rio Blanco",
    "San Lorenzo",
  ],
  Huehuetenango: [
    "Huehuetenango",
    "Chiantla",
    "Malacatancito",
    "Cuilco",
    "Nenton",
    "San Pedro Necta",
    "Jacaltenango",
    "San Pedro Soloma",
    "San Ildefonso Ixtahuacan",
    "Santa Barbara",
    "La Libertad",
    "La Democracia",
    "San Miguel Acatan",
    "San Rafael La Independencia",
    "Todos Santos Cuchumatan",
    "San Juan Atitan",
    "Santa Eulalia",
    "San Mateo Ixtatan",
    "Colotenango",
    "San Sebastian Huehuetenango",
    "Tectitan",
    "Concepcion Huista",
    "San Juan Ixcoy",
    "San Antonio Huista",
    "San Sebastian Coatan",
    "Santa Cruz Barillas",
    "Aguacatan",
    "San Rafael Petzal",
    "San Gaspar Ixchil",
    "Santiago Chimaltenango",
    "Santa Ana Huista",
  ],
  Quiche: [
    "Santa Cruz del Quiche",
    "Chiche",
    "Chinique",
    "Zacualpa",
    "Chajul",
    "Santo Tomas Chichicastenango",
    "Patzite",
    "San Antonio Ilotenango",
    "San Pedro Jocopilas",
    "Cunen",
    "San Juan Cotzal",
    "Joyabaj",
    "Nebaj",
    "San Andres Sajcabaja",
    "Uspantan",
    "Sacapulas",
    "San Bartolome Jocotenango",
    "Canilla",
    "Chicaman",
    "Ixcan",
    "Pachalum",
  ],
  "Baja Verapaz": [
    "Salama",
    "San Miguel Chicaj",
    "Rabinal",
    "Cubulco",
    "Granados",
    "Santa Cruz El Chol",
    "San Jeronimo",
    "Purulha",
  ],
  "Alta Verapaz": [
    "Coban",
    "Santa Cruz Verapaz",
    "San Cristobal Verapaz",
    "Tactic",
    "Tamahu",
    "San Miguel Tucuru",
    "Panzos",
    "Senahu",
    "San Pedro Carcha",
    "San Juan Chamelco",
    "Lanquin",
    "Santa Maria Cahabon",
    "Chisec",
    "Chahal",
    "Fray Bartolome de las Casas",
  ],
  Peten: [
    "Flores",
    "San Jose",
    "San Benito",
    "San Andres",
    "La Libertad",
    "San Francisco",
    "Santa Ana",
    "Dolores",
    "San Luis",
    "Sayaxche",
    "Melchor de Mencos",
    "Poptun",
  ],
  Izabal: ["Puerto Barrios", "Livingston", "El Estor", "Morales", "Los Amates"],
  Zacapa: [
    "Zacapa",
    "Estanzuela",
    "Rio Hondo",
    "Gualan",
    "Teculutan",
    "Usumatlan",
    "Cabanas",
    "San Diego",
    "La Union",
    "Huite",
  ],
  Chiquimula: [
    "Chiquimula",
    "San Jose La Arada",
    "San Juan Ermita",
    "Jocotan",
    "Camotan",
    "Olopa",
    "Esquipulas",
    "Concepcion Las Minas",
    "Quezaltepeque",
    "San Jacinto",
    "Ipala",
  ],
  Jalapa: [
    "Jalapa",
    "San Pedro Pinula",
    "San Luis Jilotepeque",
    "San Manuel Chaparron",
    "San Carlos Alzatate",
    "Monjas",
    "Mataquescuintla",
  ],
  Jutiapa: [
    "Jutiapa",
    "El Progreso",
    "Santa Catarina Mita",
    "Agua Blanca",
    "Asuncion Mita",
    "Yupiltepeque",
    "Atescatempa",
    "Jerez",
    "El Adelanto",
    "Zapotitlan",
    "Comapa",
    "Jalpatagua",
    "Conguaco",
    "Moyuta",
    "Pasaco",
    "San Jose Acatempa",
    "Quesada",
  ],
};

const codigosDepartamento = {
  Guatemala: 10,
  "El Progreso": 20,
  Sacatepequez: 30,
  Chimaltenango: 40,
  Escuintla: 50,
  "Santa Rosa": 60,
  Solola: 70,
  Totonicapan: 80,
  Quetzaltenango: 90,
  Suchitepequez: 100,
  Retalhuleu: 110,
  "San Marcos": 120,
  Huehuetenango: 130,
  Quiche: 140,
  "Baja Verapaz": 150,
  "Alta Verapaz": 160,
  Peten: 170,
  Izabal: 180,
  Zacapa: 190,
  Chiquimula: 200,
  Jalapa: 210,
  Jutiapa: 220,
};

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

async function columnExists(tableName, columnName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function indexExists(tableName, indexName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [tableName, indexName]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function foreignKeyExists(tableName, constraintName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.table_constraints
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND constraint_name = ?
       AND constraint_type = 'FOREIGN KEY'`,
    [tableName, constraintName]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

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

function buildLocationCodeMaps() {
  const depCodeByName = new Map();
  const munCodeByDepAndName = new Map();

  for (const depName of departamentos) {
    const depCode = Number(codigosDepartamento[depName]);
    if (!Number.isInteger(depCode) || depCode <= 0) {
      throw new Error(`No se encontro codigo para departamento: ${depName}`);
    }

    depCodeByName.set(normalizeText(depName), depCode);

    const municipalities = municipiosPorDepartamento[depName] || [];
    municipalities.forEach((municipalityName, index) => {
      const munCode = index + 1;
      const key = `${depCode}|${normalizeText(municipalityName)}`;
      munCodeByDepAndName.set(key, munCode);
    });
  }

  return { depCodeByName, munCodeByDepAndName };
}

async function captureClientLocationNames() {
  const hasClienteTable = await tableExists("cliente");
  const hasDepartamentoTable = await tableExists("departamento");
  const hasMunicipioTable = await tableExists("municipio");
  if (!hasClienteTable || !hasDepartamentoTable || !hasMunicipioTable) {
    return [];
  }

  return query(
    `SELECT
      c.cli_id,
      d.dep_nombre,
      m.mun_nombre
    FROM cliente c
    LEFT JOIN departamento d ON d.dep_id = c.dep_id
    LEFT JOIN municipio m ON m.dep_id = c.dep_id AND m.mun_id = c.mun_id
    WHERE c.dep_id IS NOT NULL OR c.mun_id IS NOT NULL`
  );
}

async function dropClientLocationForeignKeys() {
  const hasClienteTable = await tableExists("cliente");
  if (!hasClienteTable) {
    return;
  }

  const hasFkDep = await foreignKeyExists("cliente", "fk_cliente_departamento");
  if (hasFkDep) {
    await query("ALTER TABLE cliente DROP FOREIGN KEY fk_cliente_departamento");
  }

  const hasFkMunDep = await foreignKeyExists("cliente", "fk_cliente_municipio_departamento");
  if (hasFkMunDep) {
    await query("ALTER TABLE cliente DROP FOREIGN KEY fk_cliente_municipio_departamento");
  }
}

async function createAndSeedTempCatalogTables() {
  await query("DROP TABLE IF EXISTS municipio_tmp");
  await query("DROP TABLE IF EXISTS departamento_tmp");

  await query(
    `CREATE TABLE departamento_tmp (
      dep_id INT NOT NULL PRIMARY KEY,
      dep_nombre VARCHAR(100) NOT NULL,
      CONSTRAINT uq_departamento_tmp_nombre UNIQUE (dep_nombre)
    ) ENGINE=InnoDB`
  );

  await query(
    `CREATE TABLE municipio_tmp (
      dep_id INT NOT NULL,
      mun_id INT NOT NULL,
      mun_nombre VARCHAR(120) NOT NULL,
      PRIMARY KEY (dep_id, mun_id),
      CONSTRAINT uq_municipio_tmp_dep_nombre UNIQUE (dep_id, mun_nombre),
      CONSTRAINT uq_municipio_tmp_id_dep UNIQUE (mun_id, dep_id),
      FOREIGN KEY (dep_id) REFERENCES departamento_tmp(dep_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`
  );

  for (const depName of departamentos) {
    const depCode = Number(codigosDepartamento[depName]);
    if (!Number.isInteger(depCode) || depCode <= 0) {
      throw new Error(`Codigo de departamento invalido: ${depName}`);
    }

    await query("INSERT INTO departamento_tmp (dep_id, dep_nombre) VALUES (?, ?)", [depCode, depName]);

    const municipalities = municipiosPorDepartamento[depName] || [];
    for (let index = 0; index < municipalities.length; index += 1) {
      if (index + 1 > 99) {
        throw new Error(`El departamento ${depName} supera el maximo de 99 municipios`);
      }
    }

    for (let i = 0; i < municipalities.length; i += 1) {
      const munCode = i + 1;
      const munName = municipalities[i];
      await query("INSERT INTO municipio_tmp (dep_id, mun_id, mun_nombre) VALUES (?, ?, ?)", [
        depCode,
        munCode,
        munName,
      ]);
    }
  }
}

async function replaceCatalogTables() {
  const hasDepartamento = await tableExists("departamento");
  const hasMunicipio = await tableExists("municipio");

  if (hasDepartamento && hasMunicipio) {
    await query("DROP TABLE IF EXISTS municipio_old");
    await query("DROP TABLE IF EXISTS departamento_old");
    await query(
      "RENAME TABLE departamento TO departamento_old, municipio TO municipio_old, departamento_tmp TO departamento, municipio_tmp TO municipio"
    );
    await query("DROP TABLE municipio_old");
    await query("DROP TABLE departamento_old");
    return;
  }

  if (hasMunicipio) {
    await query("DROP TABLE municipio");
  }
  if (hasDepartamento) {
    await query("DROP TABLE departamento");
  }

  await query("RENAME TABLE departamento_tmp TO departamento, municipio_tmp TO municipio");
}

async function ensureClienteColumnsAndIndexes() {
  const hasClienteTable = await tableExists("cliente");
  if (!hasClienteTable) {
    return;
  }

  const hasDepId = await columnExists("cliente", "dep_id");
  if (!hasDepId) {
    await query("ALTER TABLE cliente ADD COLUMN dep_id INT NULL AFTER cli_direccion");
  }

  const hasMunId = await columnExists("cliente", "mun_id");
  if (!hasMunId) {
    await query("ALTER TABLE cliente ADD COLUMN mun_id INT NULL AFTER dep_id");
  }

  const hasClienteDepIndex = await indexExists("cliente", "idx_cliente_dep_id");
  if (!hasClienteDepIndex) {
    await query("CREATE INDEX idx_cliente_dep_id ON cliente (dep_id)");
  }

  const hasClienteMunDepIndex = await indexExists("cliente", "idx_cliente_mun_dep");
  if (!hasClienteMunDepIndex) {
    await query("CREATE INDEX idx_cliente_mun_dep ON cliente (mun_id, dep_id)");
  }
}

async function remapClientLocationsByName(clientLocationRows) {
  if (!Array.isArray(clientLocationRows) || clientLocationRows.length === 0) {
    return;
  }

  const { depCodeByName, munCodeByDepAndName } = buildLocationCodeMaps();
  await query("UPDATE cliente SET dep_id = NULL, mun_id = NULL");

  for (const row of clientLocationRows) {
    const clientId = Number(row?.cli_id || 0);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      continue;
    }

    const depCode = depCodeByName.get(normalizeText(row?.dep_nombre || "")) || null;
    if (!depCode) {
      continue;
    }

    const munCode = munCodeByDepAndName.get(`${depCode}|${normalizeText(row?.mun_nombre || "")}`) || null;
    await query("UPDATE cliente SET dep_id = ?, mun_id = ? WHERE cli_id = ?", [depCode, munCode, clientId]);
  }
}

async function ensureClienteRelationship() {
  await ensureClienteColumnsAndIndexes();

  const hasFkDep = await foreignKeyExists("cliente", "fk_cliente_departamento");
  if (!hasFkDep) {
    await query(
      `ALTER TABLE cliente
       ADD CONSTRAINT fk_cliente_departamento
       FOREIGN KEY (dep_id) REFERENCES departamento(dep_id)
       ON DELETE SET NULL ON UPDATE CASCADE`
    );
  }

  const hasFkMunDep = await foreignKeyExists("cliente", "fk_cliente_municipio_departamento");
  if (!hasFkMunDep) {
    await query(
      `ALTER TABLE cliente
       ADD CONSTRAINT fk_cliente_municipio_departamento
       FOREIGN KEY (mun_id, dep_id) REFERENCES municipio(mun_id, dep_id)
       ON DELETE SET NULL ON UPDATE CASCADE`
    );
  }
}

async function main() {
  const clientLocationRows = await captureClientLocationNames();
  await ensureClienteColumnsAndIndexes();
  await dropClientLocationForeignKeys();
  await createAndSeedTempCatalogTables();
  await replaceCatalogTables();
  await remapClientLocationsByName(clientLocationRows);
  await ensureClienteRelationship();

  const depCountRows = await query("SELECT COUNT(*) AS total FROM departamento");
  const munCountRows = await query("SELECT COUNT(*) AS total FROM municipio");

  console.log(`DEPARTAMENTOS: ${Number(depCountRows?.[0]?.total || 0)}`);
  console.log(`MUNICIPIOS: ${Number(munCountRows?.[0]?.total || 0)}`);
  console.log("OK: tablas y relaciones de ubicacion de clientes listas");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR", error?.message || error);
    process.exit(1);
  });
