import { query } from './db.js';

const users = await query('SELECT usr_id, usr_nit, usr_nombre, usr_apellido FROM usuario ORDER BY usr_id DESC LIMIT 10');
const coverage = await query('SELECT usr_id, dep_id, cobertura FROM usuario_departamento ORDER BY usr_id DESC, dep_id ASC LIMIT 50');
const coverageMun = await query('SELECT usr_id, dep_id, mun_id FROM usuario_departamento_municipio ORDER BY usr_id DESC, dep_id ASC, mun_id ASC LIMIT 100');
const clients = await query('SELECT cli_id, cli_nombre_empresa, dep_id, mun_id, est_cli_id FROM cliente ORDER BY cli_id DESC LIMIT 50');

console.log('USERS', users);
console.log('COVERAGE', coverage);
console.log('COVERAGE_MUN', coverageMun);
console.log('CLIENTS', clients);
