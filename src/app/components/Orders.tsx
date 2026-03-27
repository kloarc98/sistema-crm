import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useTheme } from "../context/ThemeContext";
import { Clock, CheckCircle2, Eye, Truck, Check, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { useAuth } from "../context/AuthContext";
import { useAlert } from "../context/AlertContext";
import { formatCurrency, formatNumber } from "../utils/numberFormat";

interface OrderRow {
  id: number;
  user_id: number | null;
  user_name: string;
  cli_id: number | null;
  client_name: string;
  client_address?: string;
  phase: number | null;
  total: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  usr_modif: number | null;
  usr_modif_name?: string;
  items_qty: number;
  items_count: number;
}

interface OrderDetailRow {
  det_id: number;
  ped_id: number;
  prod_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface OrderDetailsResponse extends Omit<OrderRow, "items_qty" | "items_count"> {
  details: OrderDetailRow[];
  shipping_provider_name?: string;
  shipping_guide?: string;
}

export function Orders() {
  // Estado para modal de envío
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [sendOrderId, setSendOrderId] = useState<number | null>(null);
  const [shippingProviders, setShippingProviders] = useState<{ id: number; nombre: string }[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [shippingGuide, setShippingGuide] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const { darkMode } = useTheme();
  const { user } = useAuth();
  const { addAlert } = useAlert();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [sortBy, setSortBy] = useState<"newest" | "date" | "items">("newest");
  const [searchOrderId, setSearchOrderId] = useState("");

  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<OrderDetailsResponse | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const notifyOrdersChanged = () => {
    window.dispatchEvent(new CustomEvent("orders:changed"));
  };

  const normalizeOrder = (row: any): OrderRow => ({
    id: Number(row.id),
    user_id: row.user_id === null || typeof row.user_id === "undefined" ? null : Number(row.user_id),
    user_name: String(row.user_name || ""),
    cli_id: row.cli_id === null || typeof row.cli_id === "undefined" ? null : Number(row.cli_id),
    client_name: String(row.client_name || ""),
    client_address: String(row.client_address || ""),
    phase: row.phase === null || typeof row.phase === "undefined" ? null : Number(row.phase),
    total: Number(row.total) || 0,
    status: String(row.status || ""),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    usr_modif: row.usr_modif === null || typeof row.usr_modif === "undefined" ? null : Number(row.usr_modif),
    usr_modif_name: String(row.usr_modif_name || ""),
    items_qty: Number(row.items_qty) || 0,
    items_count: Number(row.items_count) || 0,
  });

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  };

  const getPhaseText = (phase: number | null) => {
    if (phase === 1) return "Pendiente";
    if (phase === 2) return "Enviado";
    if (phase === 3) return "Entregado";
    return "Pendiente";
  };

  const getPhaseClass = (phase: number | null) => {
    if (phase === 2) {
      return darkMode ? "bg-green-900 text-green-200" : "bg-green-100 text-green-800";
    }
    if (phase === 3) {
      return darkMode ? "bg-blue-900 text-blue-200" : "bg-blue-100 text-blue-800";
    }
    return darkMode ? "bg-orange-900 text-orange-200" : "bg-orange-100 text-orange-800";
  };

  const loadOrders = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/orders");
      if (!response.ok) {
        throw new Error("No se pudieron cargar los pedidos");
      }
      const data = await response.json();
      setOrders(Array.isArray(data) ? data.map(normalizeOrder) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando pedidos");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
      // Cargar proveedores de envío
      const fetchProviders = async () => {
        try {
          const res = await fetch("/api/shipping-providers");
          if (!res.ok) return;
          const data = await res.json();
          setShippingProviders(Array.isArray(data) ? data : []);
        } catch {}
      };
      fetchProviders();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadOrders();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const handleOrdersChanged = () => {
      loadOrders();
    };

    window.addEventListener("orders:changed", handleOrdersChanged);
    return () => {
      window.removeEventListener("orders:changed", handleOrdersChanged);
    };
  }, []);

  const sortedOrders = useMemo(() => {
    const q = searchOrderId.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const filtered = q
      ? orders.filter((o) => {
          const matchesId = digits.length > 0 && String(o.id).includes(digits);
          const matchesClient = o.client_name.toLowerCase().includes(q);
          return matchesId || matchesClient;
        })
      : orders;

    const sorted = [...filtered];
    if (sortBy === "newest") {
      sorted.sort((a, b) => {
        const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bd - ad;
      });
    } else if (sortBy === "date") {
      sorted.sort((a, b) => {
        const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ad - bd;
      });
    } else {
      sorted.sort((a, b) => b.items_qty - a.items_qty);
    }
    return sorted;
  }, [orders, sortBy, searchOrderId]);

  const pendingOrders = sortedOrders.filter((order) => (order.phase ?? 1) === 1);
  const shippedOrders = sortedOrders.filter((order) => order.phase === 2);
  const deliveredOrders = sortedOrders.filter((order) => order.phase === 3);

  const updateOrderPhase = async (orderId: number, phase: 1 | 2 | 3) => {
      // Si es fase 2 (enviar), abrir modal
      if (phase === 2) {
        setSendOrderId(orderId);
        setIsSendDialogOpen(true);
        setSelectedProviderId(null);
        setShippingGuide("");
        setSendError("");
        return;
      }
      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase,
            usr_modif: user?.id || null,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo actualizar el pedido");
        }
        await loadOrders();
        notifyOrdersChanged();
        addAlert("✓ Pedido actualizado correctamente", "success");
      } catch (err) {
        addAlert(err instanceof Error ? err.message : "No se pudo actualizar el pedido", "error");
      }
  };

  const handleViewOrderDetails = async (orderId: number) => {
    setIsLoadingDetails(true);
    setIsDetailsDialogOpen(true);
    setSelectedOrderForDetails(null);

    try {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el detalle del pedido");
      }

      const payload = await response.json();
      setSelectedOrderForDetails({
        id: Number(payload.id),
        user_id: payload.user_id === null || typeof payload.user_id === "undefined" ? null : Number(payload.user_id),
        user_name: String(payload.user_name || ""),
        cli_id: payload.cli_id === null || typeof payload.cli_id === "undefined" ? null : Number(payload.cli_id),
        client_name: String(payload.client_name || ""),
        client_address: String(payload.client_address || ""),
        phase: payload.phase === null || typeof payload.phase === "undefined" ? null : Number(payload.phase),
        total: Number(payload.total) || 0,
        status: String(payload.status || ""),
        created_at: payload.created_at ?? null,
        updated_at: payload.updated_at ?? null,
        usr_modif: payload.usr_modif === null || typeof payload.usr_modif === "undefined" ? null : Number(payload.usr_modif),
        usr_modif_name: String(payload.usr_modif_name || ""),
        shipping_provider_name: String(payload.shipping_provider_name || ""),
        shipping_guide: String(payload.shipping_guide || ""),
        details: Array.isArray(payload.details)
          ? payload.details.map((d: any) => ({
              det_id: Number(d.det_id),
              ped_id: Number(d.ped_id),
              prod_id: Number(d.prod_id),
              product_name: String(d.product_name || ""),
              quantity: Number(d.quantity) || 0,
              unit_price: Number(d.unit_price) || 0,
              subtotal: Number(d.subtotal) || 0,
            }))
          : [],
      });
    } catch (err) {
      addAlert(err instanceof Error ? err.message : "No se pudo cargar el detalle", "error");
      setIsDetailsDialogOpen(false);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const renderOrderCard = (order: OrderRow, section: "pending" | "shipped" | "delivered") => (
    <Card
      key={order.id}
      className={`overflow-hidden transition-all ${
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white"
      } ${section === "shipped" ? "opacity-80" : section === "delivered" ? "opacity-70" : ""}`}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className={`text-lg ${darkMode ? "text-white" : ""}`}>
              {order.client_name || `Cliente #${order.cli_id ?? "—"}`}
            </CardTitle>
            <p className={`text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              ID: #{order.id} • Usuario: {order.user_name || order.user_id || "—"}
            </p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-semibold ${getPhaseClass(order.phase)}`}>
            {getPhaseText(order.phase)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className={`p-2 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
            <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Cant. Productos</p>
            <p className={`font-bold ${darkMode ? "text-white" : ""}`}>{formatNumber(order.items_qty)}</p>
          </div>
          <div className={`p-2 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
            <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Total</p>
            <p className="font-bold text-green-600">{formatCurrency(order.total)}</p>
          </div>
        </div>

        <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
          <p>Creado: {formatDateTime(order.created_at)}</p>
          <p>Actualizado: {formatDateTime(order.updated_at)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => handleViewOrderDetails(order.id)}
            variant="outline"
            className="w-full sm:flex-1 sm:w-auto flex items-center justify-center gap-2"
          >
            <Eye className="size-4" />
            Ver Detalles
          </Button>

          {section === "pending" && (
            <Button
              onClick={() => updateOrderPhase(order.id, 2)}
              className="w-full sm:flex-1 sm:w-auto bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
            >
              <Truck className="size-4" />
              Enviar
            </Button>
          )}

          {section === "shipped" && (
            <Button
              onClick={() => updateOrderPhase(order.id, 1)}
              variant="outline"
              className="w-full sm:flex-1 sm:w-auto"
            >
              Pendiente
            </Button>
          )}

          {section === "shipped" && (
            <Button
              onClick={() => updateOrderPhase(order.id, 3)}
              className="w-full sm:flex-1 sm:w-auto bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
            >
              <Check className="size-4" />
              Entregar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderColumn = (
    section: "pending" | "shipped" | "delivered",
    title: string,
    count: number,
    icon: "pending" | "shipped" | "delivered",
    ordersInSection: OrderRow[],
    emptyText: string,
  ) => {
    const iconNode =
      icon === "pending" ? (
        <Clock className="size-5 text-orange-600" />
      ) : icon === "shipped" ? (
        <Truck className="size-5 text-green-600" />
      ) : (
        <Check className="size-5 text-blue-600" />
      );

    return (
      <Card className={`${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} h-full`}>
        <CardHeader className="pb-3">
          <h2 className={`text-lg sm:text-xl font-bold flex items-center gap-2 ${darkMode ? "text-white" : ""}`}>
            {iconNode}
            {title} ({formatNumber(count)})
          </h2>
        </CardHeader>

        <CardContent className="space-y-4">
          {ordersInSection.length === 0 ? (
            <div className={`rounded-lg p-6 text-center ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
              <p className={`${darkMode ? "text-gray-400" : "text-gray-500"}`}>{emptyText}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ordersInSection.map((order) => renderOrderCard(order, section))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8 sm:mb-10">
          <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? "text-white" : ""}`}>
            Gestión de Pedidos
          </h1>
          <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
            Total: {formatNumber(orders.length)} | Pendientes: {formatNumber(pendingOrders.length)} | Enviados: {formatNumber(shippedOrders.length)} | Entregados: {formatNumber(deliveredOrders.length)}
          </p>
          {isLoading && <p className={`text-sm mt-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Cargando pedidos...</p>}
          {!!error && <p className="text-sm mt-2 text-red-600">{error}</p>}
        </div>

        <Card className={`mb-6 sm:mb-8 ${darkMode ? "bg-gray-800 border-gray-700" : ""}`}>
          <CardContent className="pt-6 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <Input
                placeholder="Buscar por número de pedido o cliente..."
                value={searchOrderId}
                onChange={(e) => setSearchOrderId(e.target.value)}
                className={`pl-10 ${darkMode ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400" : ""}`}
              />
            </div>
            {/* Sort */}
            <div className="flex flex-wrap gap-3 items-center">
              <span className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>Ordenar por:</span>
              <Button
                variant={sortBy === "newest" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortBy("newest")}
                className="flex items-center gap-2"
              >
                <Clock className="size-4" />
                Más actual
              </Button>
              <Button
                variant={sortBy === "date" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortBy("date")}
                className="flex items-center gap-2"
              >
                <Clock className="size-4" />
                Más antiguo
              </Button>
              <Button
                variant={sortBy === "items" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortBy("items")}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="size-4" />
                Mayor cantidad
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {renderColumn("pending", "Pedidos Pendientes", pendingOrders.length, "pending", pendingOrders, "No hay pedidos pendientes")}
          {renderColumn("shipped", "Pedidos Enviados", shippedOrders.length, "shipped", shippedOrders, "No hay pedidos enviados")}
          {renderColumn("delivered", "Pedidos Entregados", deliveredOrders.length, "delivered", deliveredOrders, "No hay pedidos entregados")}
        </div>

        {/* Modal de envío */}
        <Dialog open={isSendDialogOpen} onOpenChange={setIsSendDialogOpen}>
          <DialogContent className={darkMode ? "sm:max-w-md bg-gray-800 border-gray-700" : "sm:max-w-md"}>
            <DialogHeader>
              <DialogTitle className={darkMode ? "text-white" : ""}>Enviar Pedido</DialogTitle>
              <DialogDescription className={darkMode ? "text-gray-400" : ""}>
                Selecciona el proveedor de envío y código de guía
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className={`block mb-2 text-sm font-medium ${darkMode ? "text-gray-200" : "text-gray-700"}`}>Proveedor de Envío</label>
                <select
                  value={selectedProviderId ?? ""}
                  onChange={e => setSelectedProviderId(Number(e.target.value) || null)}
                  className={`w-full h-10 rounded border px-3 text-sm ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                >
                  <option value="">Selecciona proveedor</option>
                  {shippingProviders.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block mb-2 text-sm font-medium ${darkMode ? "text-gray-200" : "text-gray-700"}`}>Código de Guía</label>
                <input
                  type="text"
                  value={shippingGuide}
                  onChange={e => setShippingGuide(e.target.value)}
                  className={`w-full h-10 rounded border px-3 text-sm ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  placeholder="Ingrese número de guía"
                />
              </div>
              {sendError && <p className="text-sm text-red-600">{sendError}</p>}
            </div>
            <DialogFooter>
              <Button
                disabled={isSending || !selectedProviderId || !shippingGuide.trim()}
                onClick={async () => {
                  setIsSending(true);
                  setSendError("");
                  try {
                    const response = await fetch(`/api/orders/${sendOrderId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        phase: 2,
                        usr_modif: user?.id || null,
                        shipping_provider_id: selectedProviderId,
                        shipping_guide: shippingGuide.trim(),
                      }),
                    });
                    const payload = await response.json().catch(() => ({}));
                    if (!response.ok) {
                      throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo enviar el pedido");
                    }
                    setIsSendDialogOpen(false);
                    setSendOrderId(null);
                    setSelectedProviderId(null);
                    setShippingGuide("");
                    await loadOrders();
                    notifyOrdersChanged();
                  } catch (err) {
                    setSendError(err instanceof Error ? err.message : "No se pudo enviar el pedido");
                  } finally {
                    setIsSending(false);
                  }
                }}
              >
                Enviar Pedido
              </Button>
              <Button variant="outline" onClick={() => setIsSendDialogOpen(false)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className={`sm:max-w-[650px] max-h-[80vh] overflow-y-auto ${darkMode ? "bg-gray-800 border-gray-700" : ""}`}>
            <DialogHeader>
              <DialogTitle className={darkMode ? "text-white" : ""}>Detalles del Pedido</DialogTitle>
              <DialogDescription className={darkMode ? "text-gray-400" : ""}>
                Información completa del pedido y productos incluidos
              </DialogDescription>
            </DialogHeader>

            {isLoadingDetails && (
              <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Cargando detalle...</p>
            )}

            {!isLoadingDetails && selectedOrderForDetails && (
                <div className="space-y-4 py-4">
                  <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className={`text-xs font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"}`}>ID Pedido</p>
                        <p className={`text-lg font-bold ${darkMode ? "text-white" : ""}`}>#{formatNumber(selectedOrderForDetails.id)}</p>
                      </div>
                      <div>
                        <p className={`text-xs font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Estado</p>
                        <p className="text-lg font-bold text-blue-600">{getPhaseText(selectedOrderForDetails.phase)}</p>
                      </div>
                    </div>
                    {/* Proveedor de envío y guía */}
                    {(selectedOrderForDetails.shipping_provider_name || selectedOrderForDetails.shipping_guide) && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className={`text-xs font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Proveedor de Envío</p>
                          <p className={`text-base font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>{selectedOrderForDetails.shipping_provider_name || "—"}</p>
                        </div>
                        <div>
                          <p className={`text-xs font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Número de Guía</p>
                          <p className={`text-base font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>{selectedOrderForDetails.shipping_guide || "—"}</p>
                        </div>
                      </div>
                    )}
                  </div>

                <div className={`p-4 rounded-lg border-2 ${darkMode ? "bg-gray-700 border-purple-600" : "bg-purple-50 border-purple-200"}`}>
                  <p className={`text-sm font-semibold mb-3 ${darkMode ? "text-purple-300" : "text-purple-700"}`}>Cliente</p>
                  <p className={`font-semibold break-words ${darkMode ? "text-white" : ""}`}>
                    {selectedOrderForDetails.client_name || `Cliente #${selectedOrderForDetails.cli_id ?? "—"}`}
                  </p>
                </div>

                <div>
                  <p className={`text-sm font-semibold mb-3 ${darkMode ? "text-white" : ""}`}>
                    Productos ({formatNumber(selectedOrderForDetails.details.length)})
                  </p>
                  <div className="space-y-2">
                    {selectedOrderForDetails.details.map((item) => (
                      <div
                        key={item.det_id}
                        className={`p-3 rounded-lg border ${darkMode ? "bg-gray-700 border-gray-600" : "bg-white border-gray-200"}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <p className={`font-semibold break-words ${darkMode ? "text-white" : ""}`}>{item.product_name || `Producto #${item.prod_id}`}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${darkMode ? "text-white" : ""}`}>{formatCurrency(item.unit_price)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: darkMode ? "#4b5563" : "#e5e7eb" }}>
                          <span className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Cantidad: {formatNumber(item.quantity)}</span>
                          <p className="text-sm font-bold text-green-600">{formatCurrency(item.subtotal)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`p-4 rounded-lg border-t-2 ${darkMode ? "bg-gray-700 border-gray-600" : "bg-blue-50 border-blue-200"}`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-lg font-bold ${darkMode ? "text-white" : ""}`}>Total</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(selectedOrderForDetails.total)}</p>
                  </div>
                </div>

                <div className={`p-3 rounded-lg ${darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-50 text-gray-700"}`}>
                  <p className={`text-sm font-semibold ${darkMode ? "text-gray-300" : "text-gray-700"}`}>Historial</p>
                  <ul className="text-sm mt-2 space-y-1">
                    <li>Pedido creado: {formatDateTime(selectedOrderForDetails.created_at)}</li>
                    <li>Última actualización: {formatDateTime(selectedOrderForDetails.updated_at)}</li>
                    <li>
                      Usuario modificación: <span className="font-semibold">{selectedOrderForDetails.usr_modif_name || selectedOrderForDetails.usr_modif || "—"}</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setIsDetailsDialogOpen(false)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
