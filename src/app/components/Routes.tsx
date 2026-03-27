import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { Package, MapPin, CheckCircle2, Eye, Truck, User, Search, Calendar, Check } from "lucide-react";
import { formatCurrency, formatNumber } from "../utils/numberFormat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

interface CompletedSale {
  id: string;
  itemsCount: number;
  total: number;
  date: string;
  time: string;
  customerName: string;
  customerAddress: string;
  createdAt: string;
  updatedAt: string;
  phase: number | null;
  status: string;
}

interface RouteDetailItem {
  det_id: number;
  prod_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface RouteDetails extends CompletedSale {
  items: RouteDetailItem[];
}

interface RouteAction {
  phase: number | null;
  created_at: string | null;
}

export function Routes() {
  const { darkMode } = useTheme();
  const { user } = useAuth();

  const [completedSales, setCompletedSales] = useState<CompletedSale[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const formatIso = (iso?: string) => {
    try {
      return iso ? new Date(iso).toLocaleString() : "";
    } catch {
      return iso || "";
    }
  };

  const formatCreated = (date?: string, time?: string) => {
    if (!date) return "—";
    try {
      const normalizedTime = time ? time.replace(/\./g, ':') : '00:00';
      const iso = `${date}T${normalizedTime}`;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return `${date} ${time || ''}`;
      return d.toLocaleString();
    } catch {
      return `${date} ${time || ''}`;
    }
  };

  const mapOrderRowToSale = (row: any): CompletedSale => {
    const createdAt = row?.created_at ? String(row.created_at) : "";
    const updatedAt = row?.updated_at ? String(row.updated_at) : "";
    const parsedDate = createdAt ? new Date(createdAt) : null;
    const hasValidDate = parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime());

    return {
      id: String(row?.id ?? ""),
      itemsCount: Number(row?.items_qty ?? row?.items_count ?? 0),
      total: Number(row?.total ?? 0),
      date: hasValidDate ? parsedDate!.toISOString().split("T")[0] : "",
      time: hasValidDate ? parsedDate!.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "",
      customerName: String(row?.client_name || `Cliente #${row?.cli_id ?? ""}`),
      customerAddress: String(row?.client_address || ""),
      createdAt,
      updatedAt,
      phase: row?.phase === null || typeof row?.phase === "undefined" ? null : Number(row.phase),
      status: String(row?.status || "pendiente"),
    };
  };

  const loadOrders = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/orders?includeCancelled=1");
      if (!response.ok) {
        throw new Error("No se pudo cargar la gestión de rutas");
      }

      const payload = await response.json();
      const mapped = Array.isArray(payload) ? payload.map(mapOrderRowToSale) : [];
      setCompletedSales(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando rutas");
      setCompletedSales([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
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

  // Search and sort state for delivered orders
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name">("date");

  // Details dialog state
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedRouteForDetails, setSelectedRouteForDetails] = useState<RouteDetails | null>(null);
  const [selectedRouteTimeline, setSelectedRouteTimeline] = useState<{ shippedAt: string; deliveredAt: string }>({
    shippedAt: "",
    deliveredAt: "",
  });

  // Get only shipped orders
  const shippedOrdersList = useMemo(() => {
    return completedSales.filter((sale) => sale.phase === 2);
  }, [completedSales]);

  // Get delivered orders with search and sort
  const deliveredOrdersList = useMemo(() => {
    let delivered = completedSales.filter((sale) => sale.phase === 3);

    // Filter by search query (orderId or customerName)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      delivered = delivered.filter(
        (sale) =>
          sale.id.toLowerCase().includes(query) ||
          sale.customerName.toLowerCase().includes(query)
      );
    }

    // Sort
    if (sortBy === "date") {
      delivered.sort((a, b) => {
        const dateA = new Date(a.createdAt || `${a.date}T${a.time.replace(/\./g, ':').split(':').slice(0, 2).join(':')}`);
        const dateB = new Date(b.createdAt || `${b.date}T${b.time.replace(/\./g, ':').split(':').slice(0, 2).join(':')}`);
        return dateB.getTime() - dateA.getTime();
      });
    } else if (sortBy === "name") {
      delivered.sort((a, b) => a.customerName.localeCompare(b.customerName));
    }

    return delivered;
  }, [completedSales, searchQuery, sortBy]);

  const notifyOrdersChanged = () => {
    window.dispatchEvent(new CustomEvent("orders:changed"));
  };

  const updateOrderPhase = async (orderId: string, phase: 1 | 2 | 3) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase,
          usr_modif: Number(user?.id || 0) || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo actualizar el pedido");
      }

      await loadOrders();
      notifyOrdersChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo actualizar el pedido");
    }
  };

  const handleMarkAsDelivered = (orderId: string) => {
    updateOrderPhase(orderId, 3);
  };

  const handleRemoveDelivered = (orderId: string) => {
    updateOrderPhase(orderId, 2);
  };

  const handleViewRouteDetails = async (route: CompletedSale) => {
    setSelectedRouteTimeline({ shippedAt: "", deliveredAt: "" });

    try {
      const [detailsResponse, actionsResponse] = await Promise.all([
        fetch(`/api/orders/${route.id}`),
        fetch(`/api/orders/${route.id}/actions`),
      ]);

      if (!detailsResponse.ok) {
        throw new Error("No se pudo cargar el detalle del pedido");
      }

      const payload = await detailsResponse.json();
      const detailItems: RouteDetailItem[] = Array.isArray(payload?.details)
        ? payload.details.map((detail: any) => ({
            det_id: Number(detail?.det_id ?? 0),
            prod_id: Number(detail?.prod_id ?? 0),
            product_name: String(detail?.product_name || `Producto #${detail?.prod_id ?? ""}`),
            quantity: Number(detail?.quantity ?? 0),
            unit_price: Number(detail?.unit_price ?? 0),
            subtotal: Number(detail?.subtotal ?? 0),
          }))
        : [];

      const createdAt = payload?.created_at ? String(payload.created_at) : route.createdAt;
      const updatedAt = payload?.updated_at ? String(payload.updated_at) : route.updatedAt;
      const parsedDate = createdAt ? new Date(createdAt) : null;
      const hasValidDate = parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime());

      setSelectedRouteForDetails({
        id: String(payload?.id ?? route.id),
        itemsCount: detailItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        total: Number(payload?.total ?? route.total),
        date: hasValidDate ? parsedDate!.toISOString().split("T")[0] : route.date,
        time: hasValidDate
          ? parsedDate!.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
          : route.time,
        customerName: String(payload?.client_name || route.customerName),
        customerAddress: String(payload?.client_address || route.customerAddress || ""),
        createdAt,
        updatedAt,
        phase: payload?.phase === null || typeof payload?.phase === "undefined" ? route.phase : Number(payload.phase),
        status: String(payload?.status || route.status || "pendiente"),
        items: detailItems,
      });

      if (actionsResponse.ok) {
        const actionsPayload = await actionsResponse.json();
        const actions: RouteAction[] = Array.isArray(actionsPayload) ? actionsPayload : [];
        const shippedAction = actions.find((action) => Number(action?.phase) === 2 && !!action?.created_at);
        const deliveredAction = actions.find((action) => Number(action?.phase) === 3 && !!action?.created_at);

        setSelectedRouteTimeline({
          shippedAt: shippedAction?.created_at ? String(shippedAction.created_at) : "",
          deliveredAt: deliveredAction?.created_at ? String(deliveredAction.created_at) : "",
        });
      }

      setIsDetailsDialogOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo cargar el detalle de la ruta");
    }
  };

  const renderRouteCard = (route: CompletedSale, section: "shipped" | "delivered") => (
    <Card
      key={route.id}
      className={`overflow-hidden transition-all ${
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white"
      } ${section === "delivered" ? "opacity-75" : ""}`}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className={`text-lg break-words ${darkMode ? "text-white" : ""}`}>
              {route.customerName}
            </CardTitle>
            <p className={`text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              ID: #{route.id.slice(-4)}
            </p>
          </div>
          <span
            className={`px-2 py-1 rounded text-xs font-semibold ${
              section === "shipped"
                ? darkMode
                  ? "bg-green-900 text-green-200"
                  : "bg-green-100 text-green-800"
                : darkMode
                  ? "bg-blue-900 text-blue-200"
                  : "bg-blue-100 text-blue-800"
            }`}
          >
            {section === "shipped" ? "En Ruta" : "Entregado"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <MapPin className={`size-4 flex-shrink-0 mt-0.5 ${darkMode ? "text-gray-400" : "text-gray-600"}`} />
          <p className={`text-sm break-words ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
            {route.customerAddress || "Sin domicilio"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
          <div className={`p-2 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
            <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Productos</p>
            <p className={`font-bold ${darkMode ? "text-white" : ""}`}>{formatNumber(route.itemsCount)}</p>
          </div>
          <div className={`p-2 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
            <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Total</p>
            <p className="font-bold text-green-600">{formatCurrency(route.total)}</p>
          </div>
        </div>

        <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
          <p>{route.date} • {route.time}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => handleViewRouteDetails(route)}
            variant="outline"
            className="w-full sm:flex-1 sm:w-auto flex items-center justify-center gap-2"
          >
            <Eye className="size-4" />
            Detalles
          </Button>

          {section === "shipped" ? (
            <Button
              onClick={() => handleMarkAsDelivered(route.id)}
              className="w-full sm:flex-1 sm:w-auto bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="size-4" />
              Entregado
            </Button>
          ) : (
            <Button
              onClick={() => handleRemoveDelivered(route.id)}
              variant="outline"
              className="w-full sm:flex-1 sm:w-auto"
            >
              Pendiente
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderRouteColumn = (
    section: "shipped" | "delivered",
    title: string,
    count: number,
    icon: "shipped" | "delivered",
    routesInSection: CompletedSale[],
    emptyText: string,
  ) => {
    const iconNode =
      icon === "shipped" ? <Truck className="size-5 text-green-600" /> : <CheckCircle2 className="size-5 text-blue-600" />;

    return (
      <Card className={`${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} h-full`}>
        <CardHeader className="pb-3">
          <h2 className={`text-lg sm:text-xl font-bold flex items-center gap-2 ${darkMode ? "text-white" : ""}`}>
            {iconNode}
            {title} ({formatNumber(count)})
          </h2>
        </CardHeader>

        <CardContent className="space-y-4">
          {routesInSection.length === 0 ? (
            <div className={`rounded-lg p-6 text-center ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
              <p className={`${darkMode ? "text-gray-400" : "text-gray-500"}`}>{emptyText}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {routesInSection.map((route) => renderRouteCard(route, section))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? 'text-white' : ''}`}>Gestión de Rutas</h1>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Total de pedidos en ruta: {formatNumber(shippedOrdersList.length)}
          </p>
          {isLoading && <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Cargando rutas...</p>}
          {!!error && <p className="text-sm mt-2 text-red-600">{error}</p>}
        </div>

        <Card className={`mb-6 sm:mb-8 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  placeholder="Buscar por código de pedido o nombre del cliente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                />
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Ordenar entregados por:
                </span>
                <Button
                  variant={sortBy === "date" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortBy("date")}
                  className="flex items-center gap-2"
                >
                  <Calendar className="size-4" />
                  Fecha (Reciente)
                </Button>
                <Button
                  variant={sortBy === "name" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortBy("name")}
                >
                  Cliente (A-Z)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {renderRouteColumn(
            "shipped",
            "Pedidos en Ruta",
            shippedOrdersList.length,
            "shipped",
            shippedOrdersList,
            "No hay pedidos en ruta para entregar",
          )}
          {renderRouteColumn(
            "delivered",
            "Pedidos Entregados",
            deliveredOrdersList.length,
            "delivered",
            deliveredOrdersList,
            "No hay pedidos entregados",
          )}
        </div>

        {/* Route Details Dialog */}
        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className={`sm:max-w-[600px] max-h-[80vh] overflow-y-auto ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Detalles de la Ruta</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              Información completa del pedido en ruta
            </DialogDescription>
          </DialogHeader>

          {selectedRouteForDetails && (
            <div className="space-y-4 py-4">
              {/* Route Header */}
              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      ID Ruta
                    </p>
                    <p className={`text-lg font-bold ${darkMode ? 'text-white' : ''}`}>
                      #{selectedRouteForDetails.id.slice(-4)}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Estado
                    </p>
                    <p className="text-lg font-bold text-green-600">
                      En Ruta
                    </p>
                  </div>
                </div>
              </div>

              {/* Customer Information */}
              <div className={`p-4 rounded-lg border-2 ${darkMode ? 'bg-gray-700 border-purple-600' : 'bg-purple-50 border-purple-200'}`}>
                <p className={`text-sm font-semibold mb-3 ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                  Cliente
                </p>
                <div className="flex gap-4">
                  <div className="flex-1 flex gap-2">
                    <User className={`size-4 flex-shrink-0 mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                    <div>
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Nombre
                      </p>
                      <p className={`font-semibold break-words ${darkMode ? 'text-white' : ''}`}>
                        {selectedRouteForDetails.customerName}
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 flex gap-2">
                    <MapPin className={`size-4 flex-shrink-0 mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                    <div>
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Dirección
                      </p>
                      <p className={`font-semibold break-words ${darkMode ? 'text-white' : ''}`}>
                        {selectedRouteForDetails.customerAddress || 'Sin especificar'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Products Section */}
              <div>
                <p className={`text-sm font-semibold mb-3 ${darkMode ? 'text-white' : ''}`}>
                  Productos ({formatNumber(selectedRouteForDetails.items.length)})
                </p>
                <div className="space-y-2">
                  {selectedRouteForDetails.items.map((item) => (
                    <div
                      key={item.det_id || item.prod_id}
                      className={`p-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                            {item.product_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${darkMode ? 'text-white' : ''}`}>
                            {formatCurrency(item.unit_price)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: darkMode ? '#4b5563' : '#e5e7eb' }}>
                        <div className="flex items-center gap-2">
                          <Package className={`size-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                          <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Cantidad: {formatNumber(item.quantity)}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-green-600">
                          {formatCurrency(item.subtotal || item.unit_price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Route Summary */}
              <div className={`p-4 rounded-lg border-t-2 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'}`}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Subtotal ({formatNumber(selectedRouteForDetails.items.length)} productos)
                    </p>
                    <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                      {formatCurrency(
                        selectedRouteForDetails.items.reduce(
                          (sum, item) => sum + Number(item.subtotal || item.unit_price * item.quantity),
                          0,
                        ),
                      )}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: darkMode ? '#4b5563' : '#bfdbfe' }}>
                    <p className={`text-lg font-bold ${darkMode ? 'text-white' : ''}`}>
                      Total
                    </p>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(selectedRouteForDetails.total)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Historial de Fechas */}
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                <p className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Historial</p>
                <ul className="text-sm mt-2 space-y-1">
                  <li className="flex items-center gap-2">
                    <Calendar className="size-4" />
                    <span>Pedido creado: {formatCreated(selectedRouteForDetails.date, selectedRouteForDetails.time)}</span>
                  </li>
                  {!!selectedRouteTimeline.shippedAt && (
                    <li className="flex items-center gap-2">
                      <Truck className="size-4" />
                      <span>Enviado: {formatIso(selectedRouteTimeline.shippedAt)}</span>
                    </li>
                  )}
                  {!!selectedRouteTimeline.deliveredAt && (
                    <li className="flex items-center gap-2">
                      <Check className="size-4" />
                      <span>Entregado: {formatIso(selectedRouteTimeline.deliveredAt)}</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setIsDetailsDialogOpen(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
