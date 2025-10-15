-- Trigger para actualizar stock al realizar venta
DELIMITER //
CREATE TRIGGER actualizar_stock_venta
AFTER INSERT ON detalle_ventas
FOR EACH ROW
BEGIN
    UPDATE lotes_inventario 
    SET cantidad_actual = cantidad_actual - NEW.cantidad
    WHERE id = NEW.lote_id;
END//

-- Trigger para generar número de factura automático
CREATE TRIGGER generar_numero_factura
BEFORE INSERT ON ventas
FOR EACH ROW
BEGIN
    DECLARE siguiente_numero INT;
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_venta, 4) AS UNSIGNED)), 0) + 1 
    INTO siguiente_numero 
    FROM ventas 
    WHERE numero_venta LIKE CONCAT('FAC', '%');
    
    SET NEW.numero_venta = CONCAT('FAC', LPAD(siguiente_numero, 8, '0'));
END//

-- Trigger para actualizar totales en cierre de caja
CREATE TRIGGER actualizar_totales_cierre
AFTER INSERT ON ventas
FOR EACH ROW
BEGIN
    UPDATE cierres_caja 
    SET 
        total_ventas = total_ventas + NEW.total,
        total_transacciones = total_transacciones + 1
    WHERE id = NEW.cierre_caja_id;
END//
DELIMITER ;