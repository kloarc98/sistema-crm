CREATE DATABASE IF NOT EXISTS sistema_ventas;
USE sistema_ventas;

CREATE TABLE proveedor_envio (
    prov_envio_id INT AUTO_INCREMENT PRIMARY KEY,
    prov_envio_nombre VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE pedidos (
    ped_id INT AUTO_INCREMENT PRIMARY KEY,
    usr_id INT,
    cli_id INT,
    est_ped_id INT,
    ped_monto_tot DECIMAL(10,2),
    ped_saldo_pag DECIMAL(10,2),
    ped_saldo_pen DECIMAL(10,2),
    ped_recibo BLOB,
    proveedor_envio_id INT,
    ped_guia VARCHAR(100),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    usr_modif INT,

    CONSTRAINT fk_pedido_usuario
        FOREIGN KEY (usr_id) REFERENCES usuario(usr_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_pedido_cliente
        FOREIGN KEY (cli_id) REFERENCES cliente(cli_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_pedido_estado
        FOREIGN KEY (est_ped_id) REFERENCES estado_pedido(est_ped_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_pedido_proveedor_envio
        FOREIGN KEY (proveedor_envio_id) REFERENCES proveedor_envio(prov_envio_id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;
    usr_telefono VARCHAR(20),
    usr_nit VARCHAR(20),
    usr_pass VARCHAR(255) NOT NULL,
    rl_id INT,
    est_id INT,
    usr_id_creacion INT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_usuario_rol
        FOREIGN KEY (rl_id) REFERENCES rol(rl_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_usuario_estado
        FOREIGN KEY (est_id) REFERENCES estado_usr(est_id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =========================
-- TABLA HISTORIAL_INGRESO_USUARIO
-- =========================
CREATE TABLE historial_ingreso_usuario (
    hiu_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usr_id INT NOT NULL,
    hiu_fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hiu_ip VARCHAR(45),
    hiu_user_agent VARCHAR(255),

    CONSTRAINT fk_historial_ingreso_usuario
        FOREIGN KEY (usr_id) REFERENCES usuario(usr_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_hiu_usr_id_fecha (usr_id, hiu_fecha_ingreso)
) ENGINE=InnoDB;

-- =========================
-- TABLA ESTADO_CLIENTE
-- =========================
CREATE TABLE estado_cliente (
    est_cli_id INT AUTO_INCREMENT PRIMARY KEY,
    est_cli_nombre VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

-- =========================
-- TABLA DEPARTAMENTO
-- =========================
CREATE TABLE departamento (
    dep_id INT PRIMARY KEY,
    dep_nombre VARCHAR(100) NOT NULL,
    CONSTRAINT uq_departamento_nombre UNIQUE (dep_nombre)
) ENGINE=InnoDB;

-- =========================
-- TABLA MUNICIPIO
-- =========================
CREATE TABLE municipio (
    dep_id INT NOT NULL,
    mun_id INT NOT NULL,
    mun_nombre VARCHAR(120) NOT NULL,

    PRIMARY KEY (dep_id, mun_id),
    CONSTRAINT uq_municipio_dep_nombre UNIQUE (dep_id, mun_nombre),
    CONSTRAINT uq_municipio_id_dep UNIQUE (mun_id, dep_id),

    CONSTRAINT fk_municipio_departamento
        FOREIGN KEY (dep_id) REFERENCES departamento(dep_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =========================
-- TABLA USUARIO_DEPARTAMENTO
-- =========================
CREATE TABLE usuario_departamento (
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
) ENGINE=InnoDB;

-- =========================
-- TABLA USUARIO_DEPARTAMENTO_MUNICIPIO
-- =========================
CREATE TABLE usuario_departamento_municipio (
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
) ENGINE=InnoDB;

-- =========================
-- TABLA CLIENTE
-- =========================
CREATE TABLE cliente (
    cli_id INT AUTO_INCREMENT PRIMARY KEY,
    cli_nombre_empresa VARCHAR(150),
    cli_dueño VARCHAR(150),
    cli_direccion TEXT,
    dep_id INT,
    mun_id INT,
    cli_telefono VARCHAR(20),
    cli_telefono_op VARCHAR(20),
    cli_correo VARCHAR(150),
    cli_nit VARCHAR(20),
    est_cli_id INT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_cliente_estado
        FOREIGN KEY (est_cli_id) REFERENCES estado_cliente(est_cli_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_cliente_departamento
        FOREIGN KEY (dep_id) REFERENCES departamento(dep_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_cliente_municipio_departamento
        FOREIGN KEY (mun_id, dep_id) REFERENCES municipio(mun_id, dep_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_cliente_dep_id (dep_id),
    INDEX idx_cliente_mun_dep (mun_id, dep_id)
) ENGINE=InnoDB;

-- =========================
-- TABLA ESTADO_PRODUCTO
-- =========================
CREATE TABLE estado_producto (
    est_pro_id INT AUTO_INCREMENT PRIMARY KEY,
    est_pro_nombre VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

-- =========================
-- TABLA PRODUCTO
-- =========================
CREATE TABLE producto (
    prod_id INT AUTO_INCREMENT PRIMARY KEY,
    prod_nombre VARCHAR(150) NOT NULL,
    prod_precio DECIMAL(10,2) NOT NULL,
    prod_costo DECIMAL(10,2),
    prod_stock INT DEFAULT 0,
    prod_categoria VARCHAR(150),
    prod_barr VARCHAR(100),
    prod_descrip TEXT,
    est_pro_id INT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_producto_estado
        FOREIGN KEY (est_pro_id) REFERENCES estado_producto(est_pro_id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =========================
-- TABLA ESTADO_PEDIDO
-- =========================
CREATE TABLE estado_pedido (
    est_ped_id INT AUTO_INCREMENT PRIMARY KEY,
    est_ped_nombre VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

-- =========================
-- TABLA PEDIDOS
-- =========================
CREATE TABLE pedidos (
    ped_id INT AUTO_INCREMENT PRIMARY KEY,
    usr_id INT,
    cli_id INT,
    est_ped_id INT,
    ped_monto_tot DECIMAL(10,2),
    ped_saldo_pag DECIMAL(10,2),
    ped_saldo_pen DECIMAL(10,2),
    ped_recibo BLOB,
    proveedor_envio_id INT,
    ped_guia VARCHAR(100),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    usr_modif INT,

    CONSTRAINT fk_pedido_usuario
        FOREIGN KEY (usr_id) REFERENCES usuario(usr_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_pedido_cliente
        FOREIGN KEY (cli_id) REFERENCES cliente(cli_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_pedido_estado
        FOREIGN KEY (est_ped_id) REFERENCES estado_pedido(est_ped_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_pedido_proveedor_envio
        FOREIGN KEY (proveedor_envio_id) REFERENCES proveedor_envio(prov_envio_id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =========================
-- TABLA HISTORIAL_ACCIONES_PEDIDO
-- =========================
CREATE TABLE historial_acciones_pedido (
    hap_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ped_id INT NOT NULL,
    est_ped_id INT,
    usr_id INT,
    hap_accion VARCHAR(100) NOT NULL,
    hap_descripcion TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_hap_pedido
        FOREIGN KEY (ped_id) REFERENCES pedidos(ped_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_hap_estado_pedido
        FOREIGN KEY (est_ped_id) REFERENCES estado_pedido(est_ped_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_hap_usuario
        FOREIGN KEY (usr_id) REFERENCES usuario(usr_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_hap_pedido_fecha (ped_id, fecha_creacion),
    INDEX idx_hap_estado (est_ped_id)
) ENGINE=InnoDB;

-- =========================
-- TABLA HISTORIAL_MOVIMIENTOS_PRODUCTO
-- =========================
CREATE TABLE historial_movimientos_producto (
    hmp_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    prod_id INT NOT NULL,
    usr_id INT,
    hmp_tipo VARCHAR(100) NOT NULL,
    hmp_descripcion TEXT,
    hmp_stock_anterior INT,
    hmp_stock_nuevo INT,
    hmp_precio_anterior DECIMAL(10,2),
    hmp_precio_nuevo DECIMAL(10,2),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_hmp_producto
        FOREIGN KEY (prod_id) REFERENCES producto(prod_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_hmp_usuario
        FOREIGN KEY (usr_id) REFERENCES usuario(usr_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_hmp_producto_fecha (prod_id, fecha_creacion),
    INDEX idx_hmp_tipo (hmp_tipo)
) ENGINE=InnoDB;

-- =========================
-- TABLA PEDIDO_DETALLE
-- =========================
CREATE TABLE pedido_detalle (
    det_id INT AUTO_INCREMENT PRIMARY KEY,
    ped_id INT NOT NULL,
    prod_id INT NOT NULL,
    det_cantidad INT NOT NULL,
    det_precio_unitario DECIMAL(10,2) NOT NULL,
    det_subtotal DECIMAL(10,2) NOT NULL,

    CONSTRAINT fk_detalle_pedido
        FOREIGN KEY (ped_id) REFERENCES pedidos(ped_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_detalle_producto
        FOREIGN KEY (prod_id) REFERENCES producto(prod_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =========================
-- TABLA TIPO_PAGO
-- =========================
CREATE TABLE tipo_pago (
    tp_id_meto INT AUTO_INCREMENT PRIMARY KEY,
    tp_descrip VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- =========================
-- TABLA METODO_PAGO
-- =========================
CREATE TABLE metodo_pago (
    mp_id INT AUTO_INCREMENT PRIMARY KEY,
    ped_id INT NOT NULL,
    tp_id_meto INT NOT NULL,
    mp_monto_pago DECIMAL(10,2) NOT NULL,
    mp_no_pago INT NOT NULL,
    fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_metodo_pago_pedido
        FOREIGN KEY (ped_id) REFERENCES pedidos(ped_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_metodo_pago_tipo
        FOREIGN KEY (tp_id_meto) REFERENCES tipo_pago(tp_id_meto)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_metodo_pago_ped_id (ped_id),
    INDEX idx_metodo_pago_tp_id_meto (tp_id_meto)
) ENGINE=InnoDB;