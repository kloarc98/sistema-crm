import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useAlert } from "../context/AlertContext";
import { FileText, History, Pencil } from "lucide-react";
import { formatCurrency } from "../utils/numberFormat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface PendingPaymentRow {
  id: number;
  user_id: number | null;
  client_name: string;
  total: number;
  paid: number;
  pending: number;
  has_receipt: boolean;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

interface PaymentTypeOption {
  tp_id_meto: number;
  tp_descrip: string;
}

interface PaymentHistoryRow {
  mp_id: number;
  ped_id: number;
  tp_id_meto: number;
  tp_descrip: string;
  mp_monto_pago: number;
  mp_no_pago: number;
  fecha_ingreso: string | null;
}

interface ReceiptDetailRow {
  code: string;
  qty: string;
  description: string;
  unitPrice: string;
  lineTotal: string;
}

export function PagosPendientes() {
  const PAGE_SIZE_OPTIONS = [10, 25, 50];

  const { darkMode } = useTheme();
  const { user } = useAuth();
  const { addAlert } = useAlert();

  const [rows, setRows] = useState<PendingPaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchOrderId, setSearchOrderId] = useState("");
  const [paymentTypes, setPaymentTypes] = useState<PaymentTypeOption[]>([]);

  const [selectedRow, setSelectedRow] = useState<PendingPaymentRow | null>(null);
  const [selectedPaymentTypeId, setSelectedPaymentTypeId] = useState("");
  const [editPaidValue, setEditPaidValue] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [generatingReceiptOrderId, setGeneratingReceiptOrderId] = useState<number | null>(null);
  const [historyOrder, setHistoryOrder] = useState<PendingPaymentRow | null>(null);
  const [historyRows, setHistoryRows] = useState<PaymentHistoryRow[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [mainPage, setMainPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [mainPageSize, setMainPageSize] = useState(10);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  const loadRows = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Sin includeCancelled para excluir cancelados.
      const response = await fetch("/api/orders");
      if (!response.ok) {
        throw new Error("No se pudieron cargar los pagos pendientes");
      }

      const payload = await response.json();
      const normalized = Array.isArray(payload)
        ? payload.map((row: any) => {
            const total = Number(row.total) || 0;
            const paid = row.ped_saldo_pag === null || typeof row.ped_saldo_pag === "undefined"
              ? 0
              : Number(row.ped_saldo_pag) || 0;
            const pending = row.ped_saldo_pen === null || typeof row.ped_saldo_pen === "undefined"
              ? total
              : Number(row.ped_saldo_pen) || 0;

            return {
              id: Number(row.id),
              user_id: row.user_id === null || typeof row.user_id === "undefined" ? null : Number(row.user_id),
              client_name: String(row.client_name || ""),
              total,
              paid,
              pending,
              has_receipt: !!row.ped_recibo && (!Array.isArray(row.ped_recibo?.data) || row.ped_recibo.data.length > 0),
              status: String(row.status || "pendiente"),
              created_at: row.created_at ?? null,
              updated_at: row.updated_at ?? null,
            };
          })
        : [];

      const normalizedRole = (user?.role || "").toLowerCase().trim();
      const isVendedor = normalizedRole === "vendedor" || normalizedRole.includes("vendedor");
      const currentUserId = Number(user?.id || 0);
      const filtered = isVendedor
        ? normalized.filter((row) => Number(row.user_id || 0) === currentUserId)
        : normalized;
      setRows(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando pagos pendientes");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPaymentTypes = async () => {
    try {
      const response = await fetch("/api/orders/payment-types");
      if (!response.ok) {
        throw new Error("No se pudieron cargar los tipos de pago");
      }

      const payload = await response.json();
      const normalized = Array.isArray(payload)
        ? payload.map((row: any) => ({
            tp_id_meto: Number(row.tp_id_meto),
            tp_descrip: String(row.tp_descrip || ""),
          }))
        : [];

      setPaymentTypes(normalized);
    } catch {
      setPaymentTypes([]);
    }
  };

  useEffect(() => {
    loadRows();
    loadPaymentTypes();
  }, []);

  useEffect(() => {
    const handleOrdersChanged = () => {
      loadRows();
    };

    window.addEventListener("orders:changed", handleOrdersChanged);
    return () => {
      window.removeEventListener("orders:changed", handleOrdersChanged);
    };
  }, []);

  const orderedRows = useMemo(() => [...rows].sort((a, b) => b.id - a.id), [rows]);

  const visibleRows = useMemo(() => {
    const normalizedQuery = searchOrderId.trim().toLowerCase();
    const normalizedDigits = normalizedQuery.replace(/\D/g, "");

    if (!normalizedQuery) return orderedRows;

    return orderedRows.filter((row) => {
      const matchesClient = String(row.client_name || "").toLowerCase().includes(normalizedQuery);
      const matchesId = normalizedDigits.length > 0 && String(row.id).includes(normalizedDigits);
      return matchesClient || matchesId;
    });
  }, [orderedRows, searchOrderId]);

  const mainTotalPages = Math.max(1, Math.ceil(visibleRows.length / mainPageSize));

  const paginatedMainRows = useMemo(() => {
    const start = (mainPage - 1) * mainPageSize;
    return visibleRows.slice(start, start + mainPageSize);
  }, [visibleRows, mainPage, mainPageSize]);

  const historyTotalPages = Math.max(1, Math.ceil(historyRows.length / historyPageSize));

  const paginatedHistoryRows = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return historyRows.slice(start, start + historyPageSize);
  }, [historyRows, historyPage, historyPageSize]);

  useEffect(() => {
    setMainPage(1);
  }, [searchOrderId, rows.length, mainPageSize]);

  useEffect(() => {
    if (mainPage > mainTotalPages) {
      setMainPage(mainTotalPages);
    }
  }, [mainPage, mainTotalPages]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyRows.length, historyOrder?.id, historyPageSize]);

  useEffect(() => {
    if (historyPage > historyTotalPages) {
      setHistoryPage(historyTotalPages);
    }
  }, [historyPage, historyTotalPages]);

  const openEditDialog = async (row: PendingPaymentRow) => {
    setSelectedRow(row);
    setSelectedPaymentTypeId("");
    setEditPaidValue("");
    setPaymentReference("");
    setError("");
  };

  const closeEditDialog = () => {
    if (isSaving) return;
    setSelectedRow(null);
    setSelectedPaymentTypeId("");
    setEditPaidValue("");
    setPaymentReference("");
  };

  const normalizedPaid = Number(editPaidValue);
  const paymentAmountForCalc = Number.isFinite(normalizedPaid) ? Math.max(0, normalizedPaid) : 0;
  const totalForCalc = selectedRow ? Math.max(0, Number(selectedRow.total || 0)) : 0;
  const currentPaidForCalc = selectedRow ? Math.max(0, Number(selectedRow.paid || 0)) : 0;
  const currentPendingForCalc = Math.max(0, totalForCalc - currentPaidForCalc);
  const updatedPaidForCalc = Math.min(totalForCalc, currentPaidForCalc + paymentAmountForCalc);
  const pendingForCalc = selectedRow ? Math.max(0, totalForCalc - updatedPaidForCalc) : 0;

  const savePayment = async () => {
    if (!selectedRow) return;

    const selectedTypeId = Number(selectedPaymentTypeId);
    if (!Number.isInteger(selectedTypeId) || selectedTypeId <= 0) {
      addAlert("Selecciona un tipo de pago", "warning");
      return;
    }

    const paymentNumber = Number(paymentReference);
    if (!Number.isFinite(paymentNumber) || paymentNumber <= 0) {
      addAlert("Ingresa un número de Transferencia, Cheque o Depósito válido", "warning");
      return;
    }

    if (!Number.isFinite(paymentAmountForCalc) || paymentAmountForCalc <= 0) {
      addAlert("Ingresa un monto pagado válido", "warning");
      return;
    }

    if (paymentAmountForCalc > currentPendingForCalc + 0.00001) {
      addAlert("El monto pagado no puede ser mayor al monto pendiente", "error");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/orders/${selectedRow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ped_saldo_pag: updatedPaidForCalc,
          ped_saldo_pen: Math.max(0, totalForCalc - updatedPaidForCalc),
          tp_id_meto: selectedTypeId,
          mp_monto_pago: paymentAmountForCalc,
          mp_no_pago: paymentNumber,
          usr_modif: Number(user?.id || 0) || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo guardar el pago");
      }

      await loadRows();
      window.dispatchEvent(new CustomEvent("orders:changed"));
      addAlert("✓ Pago registrado correctamente", "success");
      closeEditDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el pago");
    } finally {
      setIsSaving(false);
    }
  };

  const generateReceiptForOrder = async (row: PendingPaymentRow) => {
    if (row.pending > 0.00001) {
      addAlert("El recibo solo se puede generar cuando el pendiente sea 0", "warning");
      return;
    }

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const formatMoney = (value: unknown) => {
      const amount = Number(value) || 0;
      return amount.toFixed(2);
    };

    setGeneratingReceiptOrderId(row.id);
    try {
      const orderResponse = await fetch(`/api/orders/${row.id}`);
      if (!orderResponse.ok) {
        throw new Error("No se pudo cargar la información del pedido");
      }

      const order = await orderResponse.json();
      const details = Array.isArray(order?.details) ? order.details : [];
      const issueDate = new Date(order?.created_at || Date.now());
      const issueDateLabel = Number.isNaN(issueDate.getTime())
        ? new Date().toLocaleDateString("es-GT")
        : issueDate.toLocaleDateString("es-GT");

      const detailRows: ReceiptDetailRow[] = details.map((item: any) => ({
        code: escapeHtml(item?.prod_id ?? ""),
        qty: escapeHtml(item?.quantity ?? ""),
        description: escapeHtml(item?.product_name ?? ""),
        unitPrice: formatMoney(item?.unit_price),
        lineTotal: formatMoney(item?.subtotal),
      }));

      while (detailRows.length < 10) {
        detailRows.push({
          code: "",
          qty: "",
          description: "",
          unitPrice: "",
          lineTotal: "",
        });
      }

      const total = Number(order?.total) || Number(row.total) || 0;

      const detailsHtml = detailRows
        .map(
          (entry: ReceiptDetailRow) => `
            <tr>
              <td>${entry.code}</td>
              <td style="text-align:center;">${entry.qty}</td>
              <td>${entry.description}</td>
              <td style="text-align:right;">${entry.unitPrice ? `Q ${entry.unitPrice}` : ""}</td>
              <td style="text-align:right;">${entry.lineTotal ? `Q ${entry.lineTotal}` : ""}</td>
            </tr>`
        )
        .join("");

      const receiptWindow = window.open("", `recibo-${row.id}`);
      if (!receiptWindow) {
        throw new Error("No se pudo abrir la ventana de impresión. Revisa el bloqueo de ventanas emergentes.");
      }

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Recibo Pedido ${row.id}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
    .sheet { border: 1px solid #333; padding: 10px; }
    .top { display: grid; grid-template-columns: 1fr 230px; gap: 10px; margin-bottom: 8px; }
    .box { border: 1px solid #333; padding: 6px; min-height: 40px; }
    .row { display: grid; grid-template-columns: 120px 1fr; border: 1px solid #333; border-bottom: none; }
    .row:last-child { border-bottom: 1px solid #333; }
    .label { border-right: 1px solid #333; padding: 6px; font-weight: 700; }
    .value { padding: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #333; padding: 6px; font-size: 12px; }
    th { text-align: left; }
    .footer { margin-top: 8px; border: 1px solid #333; padding: 6px; font-size: 12px; }
    .total { margin-top: 8px; display: flex; justify-content: flex-end; }
    .total-box { border: 1px solid #333; min-width: 220px; display: grid; grid-template-columns: 1fr 1fr; }
    .total-box div { padding: 8px; font-weight: 700; }
    .total-box div:first-child { border-right: 1px solid #333; }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { margin: 10px; }
      .sheet { border: 1px solid #333 !important; }
      .box { border: 1px solid #333 !important; }
      .row { border: 1px solid #333 !important; border-bottom: none !important; }
      .row:last-child { border-bottom: 1px solid #333 !important; }
      .label { border-right: 1px solid #333 !important; }
      th, td { border: 1px solid #333 !important; }
      .footer { border: 1px solid #333 !important; }
      .total-box { border: 1px solid #333 !important; }
      .total-box div:first-child { border-right: 1px solid #333 !important; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="box"></div>
      <div class="box"><strong>FECHA</strong><div>${escapeHtml(issueDateLabel)}</div></div>
    </div>

    <div class="row"><div class="label">Cliente</div><div class="value">${escapeHtml(order?.client_name || row.client_name || "-")}</div></div>
    <div class="row"><div class="label">Direccion</div><div class="value">direccion</div></div>
    <div class="row"><div class="label">Vendedor</div><div class="value">${escapeHtml(order?.user_name || "-")}</div></div>
    <div class="row"><div class="label">FAC. #</div><div class="value">${escapeHtml(row.id)}</div></div>

    <table>
      <thead>
        <tr>
          <th style="width: 16%;">CODIGO</th>
          <th style="width: 16%; text-align:center;">CANTIDAD</th>
          <th>DESCRIPCION</th>
          <th style="width: 16%; text-align:right;">P. UNIDAD</th>
          <th style="width: 16%; text-align:right;">P. TOTAL</th>
        </tr>
      </thead>
      <tbody>${detailsHtml}</tbody>
    </table>

    <div class="footer">Documento No Contable, Su factura será emitida al tener la cancelación total del pedido</div>

    <div class="total">
      <div class="total-box">
        <div>TOTAL</div>
        <div style="text-align:right;">Q ${formatMoney(total)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;

      // Persistimos exactamente el recibo generado para mantener trazabilidad.
      const base64Receipt = btoa(unescape(encodeURIComponent(html)));
      const saveResponse = await fetch(`/api/orders/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ped_recibo: base64Receipt,
          usr_modif: Number(user?.id || 0) || null,
        }),
      });

      const savePayload = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) {
        throw new Error(typeof savePayload?.error === "string" ? savePayload.error : "No se pudo registrar el recibo");
      }

      receiptWindow.document.open();
      receiptWindow.document.write(html);
      receiptWindow.document.close();
      receiptWindow.focus();
      receiptWindow.print();

      await loadRows();
      window.dispatchEvent(new CustomEvent("orders:changed"));
      addAlert("✓ Recibo generado correctamente", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo generar el recibo";
      setError(message);
      window.alert(message);
    } finally {
      setGeneratingReceiptOrderId(null);
    }
  };

  const openHistoryDialog = async (row: PendingPaymentRow) => {
    setHistoryOrder(row);
    setHistoryRows([]);
    setHistoryError("");
    setIsHistoryLoading(true);

    try {
      const response = await fetch(`/api/orders/${row.id}/payment-methods`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el historial de pagos");
      }

      const payload = await response.json();
      const normalized = Array.isArray(payload)
        ? payload.map((item: any) => ({
            mp_id: Number(item.mp_id),
            ped_id: Number(item.ped_id),
            tp_id_meto: Number(item.tp_id_meto),
            tp_descrip: String(item.tp_descrip || ""),
            mp_monto_pago: Number(item.mp_monto_pago) || 0,
            mp_no_pago: Number(item.mp_no_pago) || 0,
            fecha_ingreso: item.fecha_ingreso ? String(item.fecha_ingreso) : null,
          }))
            .sort((a, b) => {
              const timeA = a.fecha_ingreso ? new Date(a.fecha_ingreso).getTime() : 0;
              const timeB = b.fecha_ingreso ? new Date(b.fecha_ingreso).getTime() : 0;
              return timeB - timeA;
            })
        : [];

      setHistoryRows(normalized);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "No se pudo cargar el historial de pagos");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const closeHistoryDialog = () => {
    setHistoryOrder(null);
    setHistoryRows([]);
    setHistoryError("");
    setIsHistoryLoading(false);
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("es-GT");
  };

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
          <CardHeader>
            <CardTitle className={darkMode ? "text-white" : ""}>Pagos Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 max-w-sm">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar por ID o cliente"
                  value={searchOrderId}
                  onChange={(e) => setSearchOrderId(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSearchOrderId("")}
                  disabled={!searchOrderId}
                  className={darkMode ? "border-gray-600 text-gray-200 hover:bg-gray-800" : ""}
                >
                  Limpiar
                </Button>
              </div>
              <p className={`mt-1 text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                Mostrando {visibleRows.length} de {orderedRows.length} registros
              </p>
            </div>

            {isLoading && (
              <p className={`text-sm mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                Cargando ventas...
              </p>
            )}

            {!!error && <p className="text-sm mb-3 text-red-600">{error}</p>}

            {visibleRows.length === 0 ? (
              <div className={`rounded-lg border px-4 py-6 text-center text-sm ${darkMode ? "border-gray-700 bg-gray-900 text-gray-400" : "border-gray-200 bg-white text-gray-500"}`}>
                No hay ventas para mostrar
              </div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {paginatedMainRows.map((row) => (
                    <div key={`mobile-${row.id}`} className={`rounded-lg border p-3 ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>
                          Pedido #{row.id}
                        </p>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.has_receipt
                              ? darkMode
                                ? "bg-green-900 text-green-200"
                                : "bg-green-100 text-green-800"
                              : darkMode
                                ? "bg-gray-700 text-gray-300"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {row.has_receipt ? "Con recibo" : "Sin recibo"}
                        </span>
                      </div>

                      <p className={`mt-1 text-sm break-words ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                        {row.client_name || "-"}
                      </p>

                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                        <p className={darkMode ? "text-gray-300" : "text-gray-700"}><strong>Total:</strong> {formatCurrency(row.total)}</p>
                        <p className={darkMode ? "text-gray-300" : "text-gray-700"}><strong>Pagado:</strong> {formatCurrency(row.paid)}</p>
                        <p className={darkMode ? "text-gray-300" : "text-gray-700"}><strong>Pendiente:</strong> {formatCurrency(row.pending)}</p>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => generateReceiptForOrder(row)}
                          disabled={row.pending > 0.00001 || generatingReceiptOrderId === row.id}
                          className={darkMode ? "h-9 px-3 bg-emerald-700 hover:bg-emerald-600 text-white disabled:bg-gray-700 disabled:text-gray-400" : "h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-200 disabled:text-gray-500"}
                        >
                          <FileText className="size-4" /> {generatingReceiptOrderId === row.id ? "Generando..." : "Generar recibo"}
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openHistoryDialog(row)}
                          className={darkMode ? "h-9 px-3 bg-indigo-700 hover:bg-indigo-600 text-white" : "h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white"}
                        >
                          <History className="size-4" /> Historial
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openEditDialog(row)}
                          className={darkMode ? "h-9 px-3 bg-blue-700 hover:bg-blue-600 text-white" : "h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white"}
                        >
                          <Pencil className="size-4" /> Editar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={`hidden md:block overflow-x-auto rounded-lg border ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}>
                  <table className={`min-w-[980px] w-full table-auto divide-y ${darkMode ? "divide-gray-700 text-gray-200" : "divide-gray-200 text-gray-800"}`}>
                    <thead className={darkMode ? "bg-gray-800" : "bg-gray-50"}>
                      <tr>
                        <th className={`px-3 py-2 text-left text-sm font-medium whitespace-nowrap ${darkMode ? "text-gray-300" : "text-gray-600"}`}>ID Pedido</th>
                        <th className={`px-3 py-2 text-left text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Cliente</th>
                        <th className={`px-3 py-2 text-right text-sm font-medium whitespace-nowrap ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Total</th>
                        <th className={`px-3 py-2 text-right text-sm font-medium whitespace-nowrap ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Pagado</th>
                        <th className={`px-3 py-2 text-right text-sm font-medium whitespace-nowrap ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Pendiente de pago</th>
                        <th className={`px-3 py-2 text-center text-sm font-medium whitespace-nowrap ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Recibo</th>
                        <th className={`px-3 py-2 text-center text-sm font-medium whitespace-nowrap ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody className={darkMode ? "bg-gray-900 divide-y divide-gray-700" : "bg-white divide-y divide-gray-200"}>
                      {paginatedMainRows.map((row) => (
                        <tr key={row.id} className={darkMode ? "hover:bg-gray-800" : "hover:bg-gray-50"}>
                          <td className="px-3 py-3 text-sm">{row.id}</td>
                          <td className="px-3 py-3 text-sm break-words">{row.client_name || "-"}</td>
                          <td className="px-3 py-3 text-sm text-right">{formatCurrency(row.total)}</td>
                          <td className="px-3 py-3 text-sm text-right">{formatCurrency(row.paid)}</td>
                          <td className="px-3 py-3 text-sm text-right">{formatCurrency(row.pending)}</td>
                          <td className="px-3 py-3 text-sm text-center">
                            <div className="flex flex-col items-center gap-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  row.has_receipt
                                    ? darkMode
                                      ? "bg-green-900 text-green-200"
                                      : "bg-green-100 text-green-800"
                                    : darkMode
                                      ? "bg-gray-700 text-gray-300"
                                      : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {row.has_receipt ? "Con recibo" : "Sin recibo"}
                              </span>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => generateReceiptForOrder(row)}
                                disabled={row.pending > 0.00001 || generatingReceiptOrderId === row.id}
                                className={darkMode ? "h-8 px-3 bg-emerald-700 hover:bg-emerald-600 text-white disabled:bg-gray-700 disabled:text-gray-400" : "h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-200 disabled:text-gray-500"}
                              >
                                <FileText className="size-4" /> {generatingReceiptOrderId === row.id ? "Generando..." : "Generar recibo"}
                              </Button>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm text-center">
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => openHistoryDialog(row)}
                                className={darkMode ? "h-8 px-3 bg-indigo-700 hover:bg-indigo-600 text-white whitespace-nowrap" : "h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap"}
                              >
                                <History className="size-4" /> Historial
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => openEditDialog(row)}
                                className={`h-8 px-3 inline-flex items-center gap-2 whitespace-nowrap ${darkMode ? "bg-blue-700 hover:bg-blue-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                              >
                                <Pencil className="size-4" /> Editar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="pagos-main-size" className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      Filas por pagina
                    </label>
                    <select
                      id="pagos-main-size"
                      value={String(mainPageSize)}
                      onChange={(e) => setMainPageSize(Number(e.target.value) || 10)}
                      className={`h-8 rounded-md border px-2 text-xs ${
                        darkMode
                          ? "border-gray-600 bg-gray-900 text-gray-100"
                          : "border-gray-300 bg-white text-gray-900"
                      }`}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={`main-size-${size}`} value={String(size)}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                    Pagina {mainPage} de {mainTotalPages}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setMainPage(1)} disabled={mainPage === 1}>
                      Primera
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMainPage((prev) => Math.max(1, prev - 1))}
                      disabled={mainPage === 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMainPage((prev) => Math.min(mainTotalPages, prev + 1))}
                      disabled={mainPage === mainTotalPages}
                    >
                      Siguiente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMainPage(mainTotalPages)}
                      disabled={mainPage === mainTotalPages}
                    >
                      Ultima
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedRow} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className={darkMode ? "sm:max-w-lg max-h-[90vh] bg-gray-900 border-gray-700 text-gray-100" : "sm:max-w-lg max-h-[90vh] bg-white text-gray-900"}>
          <DialogHeader>
            <DialogTitle className={darkMode ? "text-white" : "text-gray-900"}>Editar pago pendiente</DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto pr-1">
              <p className={darkMode ? "text-gray-200" : "text-gray-800"}><strong>ID Pedido:</strong> {selectedRow.id}</p>
              <p className={darkMode ? "text-gray-200" : "text-gray-800"}><strong>Cliente:</strong> {selectedRow.client_name || "-"}</p>

              <div>
                <p className={`mb-1 ${darkMode ? "text-gray-200" : "text-gray-700"}`}><strong>Monto total</strong></p>
                <Input
                  value={formatCurrency(selectedRow.total)}
                  readOnly
                  className={darkMode ? "border-gray-600 bg-gray-800 text-gray-100" : "border-gray-300 bg-gray-50 text-gray-900"}
                />
              </div>

              <div>
                <p className={`mb-1 ${darkMode ? "text-gray-200" : "text-gray-700"}`}><strong>Tipo de pago</strong></p>
                <select
                  value={selectedPaymentTypeId}
                  onChange={(e) => setSelectedPaymentTypeId(e.target.value)}
                  className={`h-10 w-full rounded-md border px-3 text-sm ${
                    darkMode
                      ? "border-blue-600 bg-gray-800 text-white"
                      : "border-blue-400 bg-white text-gray-900"
                  }`}
                >
                  <option value="">Selecciona un tipo de pago</option>
                  {paymentTypes.map((type) => (
                    <option key={type.tp_id_meto} value={String(type.tp_id_meto)}>
                      {type.tp_descrip}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPaymentTypeId && (
                <>
                  <div>
                    <p className={`mb-1 ${darkMode ? "text-gray-200" : "text-gray-700"}`}><strong>Monto pagado</strong></p>
                    <Input
                      type="number"
                      min="0"
                      max={Math.max(0, currentPendingForCalc)}
                      step="0.01"
                      value={editPaidValue}
                      onChange={(e) => setEditPaidValue(e.target.value)}
                      className={darkMode ? "border-blue-600 bg-gray-800 text-white" : "border-blue-400 bg-white text-gray-900"}
                    />
                  </div>

                  <div>
                    <p className={`mb-1 ${darkMode ? "text-gray-200" : "text-gray-700"}`}><strong>Numero de Transferencia, Cheque o Deposito</strong></p>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value.replace(/\D/g, ""))}
                      className={darkMode ? "border-blue-600 bg-gray-800 text-white" : "border-blue-400 bg-white text-gray-900"}
                    />
                  </div>
                </>
              )}

              <div>
                <p className={`mb-1 ${darkMode ? "text-gray-200" : "text-gray-700"}`}><strong>Monto pendiente</strong></p>
                <Input
                  value={formatCurrency(pendingForCalc)}
                  readOnly
                  className={darkMode ? "border-gray-600 bg-gray-800 text-gray-100" : "border-gray-300 bg-gray-50 text-gray-900"}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="default"
                  onClick={closeEditDialog}
                  disabled={isSaving}
                  className={darkMode ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-900"}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={savePayment}
                  disabled={isSaving}
                  className={darkMode ? "bg-green-600 hover:bg-green-500 text-gray-950" : "bg-green-600 hover:bg-green-700 text-white"}
                >
                  {isSaving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyOrder} onOpenChange={(open) => !open && closeHistoryDialog()}>
        <DialogContent className={darkMode ? "sm:max-w-3xl max-h-[90vh] bg-gray-900 border-gray-700 text-gray-100" : "sm:max-w-3xl max-h-[90vh] bg-white text-gray-900"}>
          <DialogHeader>
            <DialogTitle className={darkMode ? "text-white" : "text-gray-900"}>
              Historial de pagos {historyOrder ? `(Pedido ${historyOrder.id})` : ""}
            </DialogTitle>
          </DialogHeader>

          {isHistoryLoading && (
            <p className={darkMode ? "text-sm text-gray-300" : "text-sm text-gray-600"}>Cargando historial...</p>
          )}

          {!!historyError && <p className="text-sm text-red-600">{historyError}</p>}

          {!isHistoryLoading && !historyError && (
            historyRows.length === 0 ? (
              <div className={`rounded-lg border px-4 py-6 text-center text-sm ${darkMode ? "border-gray-700 bg-gray-900 text-gray-400" : "border-gray-200 bg-white text-gray-500"}`}>
                No hay pagos registrados para este pedido
              </div>
            ) : (
              <>
                <div className="space-y-2 md:hidden max-h-[60vh] overflow-y-auto pr-1">
                  {paginatedHistoryRows.map((entry) => (
                    <div key={`mobile-history-${entry.mp_id}`} className={`rounded-lg border p-3 ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}>
                      <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>{entry.tp_descrip || "-"}</p>
                      <p className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}><strong>Monto:</strong> {formatCurrency(entry.mp_monto_pago)}</p>
                      <p className={`text-sm break-words ${darkMode ? "text-gray-300" : "text-gray-700"}`}><strong>No. Referencia:</strong> {entry.mp_no_pago || "-"}</p>
                      <p className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}><strong>Fecha y hora:</strong> {formatDateTime(entry.fecha_ingreso)}</p>
                    </div>
                  ))}
                </div>

                <div className={`hidden md:block overflow-x-auto rounded-lg border ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}>
                  <table className={`min-w-full divide-y ${darkMode ? "divide-gray-700 text-gray-200" : "divide-gray-200 text-gray-800"}`}>
                    <thead className={darkMode ? "bg-gray-800" : "bg-gray-50"}>
                      <tr>
                        <th className={`px-3 py-2 text-left text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Tipo</th>
                        <th className={`px-3 py-2 text-right text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Monto</th>
                        <th className={`px-3 py-2 text-left text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-600"}`}>No. Referencia</th>
                        <th className={`px-3 py-2 text-left text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Fecha y hora</th>
                      </tr>
                    </thead>
                    <tbody className={darkMode ? "bg-gray-900 divide-y divide-gray-700" : "bg-white divide-y divide-gray-200"}>
                      {paginatedHistoryRows.map((entry) => (
                        <tr key={entry.mp_id} className={darkMode ? "hover:bg-gray-800" : "hover:bg-gray-50"}>
                          <td className="px-3 py-3 text-sm">{entry.tp_descrip || "-"}</td>
                          <td className="px-3 py-3 text-sm text-right">{formatCurrency(entry.mp_monto_pago)}</td>
                          <td className="px-3 py-3 text-sm">{entry.mp_no_pago || "-"}</td>
                          <td className="px-3 py-3 text-sm">{formatDateTime(entry.fecha_ingreso)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="pagos-history-size" className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      Filas por pagina
                    </label>
                    <select
                      id="pagos-history-size"
                      value={String(historyPageSize)}
                      onChange={(e) => setHistoryPageSize(Number(e.target.value) || 10)}
                      className={`h-8 rounded-md border px-2 text-xs ${
                        darkMode
                          ? "border-gray-600 bg-gray-900 text-gray-100"
                          : "border-gray-300 bg-white text-gray-900"
                      }`}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={`history-size-${size}`} value={String(size)}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                    Pagina {historyPage} de {historyTotalPages}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setHistoryPage(1)} disabled={historyPage === 1}>
                      Primera
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                      disabled={historyPage === 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setHistoryPage((prev) => Math.min(historyTotalPages, prev + 1))}
                      disabled={historyPage === historyTotalPages}
                    >
                      Siguiente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setHistoryPage(historyTotalPages)}
                      disabled={historyPage === historyTotalPages}
                    >
                      Ultima
                    </Button>
                  </div>
                </div>
              </>
            )
          )}

          <div className="flex justify-end pt-2">
            <Button
              variant="default"
              onClick={closeHistoryDialog}
              className={darkMode ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-900"}
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
