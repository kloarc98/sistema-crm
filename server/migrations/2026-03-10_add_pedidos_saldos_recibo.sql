-- Agrega columnas financieras y recibo en pedidos para bases ya existentes.
-- Requiere MySQL 8.0+ por el uso de IF NOT EXISTS.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS ped_saldo_pag DECIMAL(10,2) NULL AFTER ped_monto_tot,
  ADD COLUMN IF NOT EXISTS ped_saldo_pen DECIMAL(10,2) NULL AFTER ped_saldo_pag,
  ADD COLUMN IF NOT EXISTS ped_recibo BLOB NULL AFTER ped_saldo_pen;
