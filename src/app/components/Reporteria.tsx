import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { CheckCircle2, Clock3, Eye, FileText, PackageCheck, Truck, ClipboardList, Users, Wallet, FileSpreadsheet } from "lucide-react";
import { formatCurrency } from "../utils/numberFormat";

interface PedidoRow {
  id: number;
  user_id: number | null;
  user_name: string;
  cli_id: number | null;
  client_name: string;
  phase: number | null;
  total: number;
  status: string;
  product_names: string;
  created_at: string | null;
  updated_at: string | null;
}

interface ActivityItem {
  id: number;
  action: string;
  status: string;
  description: string;
  date: string;
  phase: number | null;
  user_name: string;
}

interface ProductTableRow {
  row_id: string;
  product_name: string;
  pedido: PedidoRow;
}

interface FilterCriteria {
  order: string;
  product: string;
  user: string;
  client: string;
  startDateTime: number | null;
  endDateTime: number | null;
}

type SortKey = "id" | "product_name" | "user_name" | "client_name" | "total" | "status" | "created_at" | "updated_at";
type SortDirection = "asc" | "desc";
type PrimaryFilter = "" | "pedido" | "producto";

export function Reporteria() {
  const PAGE_SIZE_OPTIONS = [10, 25, 50];

  const { darkMode } = useTheme();
  const { user } = useAuth();

  const normalizedRole = String(user?.role || "").toLowerCase().trim();
  const isAdmin = normalizedRole === "admin" || normalizedRole.includes("admin");
  const isJefe = normalizedRole === "jefe" || normalizedRole.includes("jefe");
  const isVendedor = normalizedRole === "vendedor" || normalizedRole.includes("vendedor");

  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [userFilter, setUserFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [primaryFilter, setPrimaryFilter] = useState<PrimaryFilter>("");
  const [orderFilter, setOrderFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderActivities, setOrderActivities] = useState<ActivityItem[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [activitiesError, setActivitiesError] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(10);
  const [activityPageSize, setActivityPageSize] = useState(10);

  const loadPedidos = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/orders?includeCancelled=1");
      if (!response.ok) {
        throw new Error("No se pudieron cargar los pedidos");
      }

      const data = await response.json();
      const normalized = Array.isArray(data)
        ? data.map((row: any) => ({
            id: Number(row.id),
            user_id: row.user_id === null || typeof row.user_id === "undefined" ? null : Number(row.user_id),
            user_name: String(row.user_name || ""),
            cli_id: row.cli_id === null || typeof row.cli_id === "undefined" ? null : Number(row.cli_id),
            client_name: String(row.client_name || ""),
            phase: row.phase === null || typeof row.phase === "undefined" ? null : Number(row.phase),
            total: Number(row.total) || 0,
            status: String(row.status || "pendiente"),
            product_names: String(row.product_names || ""),
            created_at: row.created_at ?? null,
            updated_at: row.updated_at ?? null,
          }))
        : [];

      const roleFilteredOrders = isVendedor && !isAdmin && !isJefe
        ? normalized.filter((row) => Number(row.user_id || 0) === Number(user?.id || 0))
        : normalized;

      setPedidos(roleFilteredOrders);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError("Error cargando pedidos");
      setPedidos([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrderActivities = async (orderId: number) => {
    setIsLoadingActivities(true);
    setActivitiesError("");

    try {
      const response = await fetch(`/api/orders/${orderId}/actions`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el historial de acciones del pedido");
      }

      const payload = await response.json();
      const normalized = Array.isArray(payload)
        ? payload.map((row: any) => ({
            id: Number(row.id),
            action: String(row.action || ""),
            status: String(row.status || "pendiente"),
            description: String(row.description || ""),
            date: String(row.created_at || ""),
            phase: row.phase === null || typeof row.phase === "undefined" ? null : Number(row.phase),
            user_name: String(row.user_name || ""),
          }))
        : [];

      setOrderActivities(normalized);
    } catch (err) {
      setOrderActivities([]);
      setActivitiesError(err instanceof Error ? err.message : "Error cargando historial de acciones");
    } finally {
      setIsLoadingActivities(false);
    }
  };

  useEffect(() => {
    loadPedidos();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadPedidos();
      if (selectedOrderId) {
        loadOrderActivities(selectedOrderId);
      }
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedOrderId]);

  useEffect(() => {
    const handleOrdersChanged = () => {
      loadPedidos();
      if (selectedOrderId) {
        loadOrderActivities(selectedOrderId);
      }
    };

    window.addEventListener("orders:changed", handleOrdersChanged);
    return () => {
      window.removeEventListener("orders:changed", handleOrdersChanged);
    };
  }, [selectedOrderId]);

  const formatDateTime = (dateValue: string | null) => {
    if (!dateValue) return "—";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleString();
  };

  const formatRelativeTime = (dateValue: string | null) => {
    if (!dateValue) return "Sin fecha";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return String(dateValue);

    const diffMs = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.floor(diffMs / 60000));

    if (minutes < 60) return `Hace ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} ${hours === 1 ? "hora" : "horas"}`;

    const days = Math.floor(hours / 24);
    return `Hace ${days} ${days === 1 ? "día" : "días"}`;
  };

  const normalizedUserFilter = userFilter.trim().toLowerCase();
  const normalizedClientFilter = clientFilter.trim().toLowerCase();
  const normalizedOrderFilter = orderFilter.trim();
  const normalizedProductFilter = productFilter.trim().toLowerCase();

  const getProductNames = (pedido: PedidoRow) =>
    String(pedido.product_names || "")
      .split("||")
      .map((name) => name.trim())
      .filter(Boolean);

  const matchesCriteria = (pedido: PedidoRow, criteria: FilterCriteria) => {
    const userValue = (pedido.user_name || String(pedido.user_id ?? "")).toLowerCase();
    const clientValue = (pedido.client_name || String(pedido.cli_id ?? "")).toLowerCase();
    const orderValue = String(pedido.id);
    const productValues = getProductNames(pedido).map((name) => name.toLowerCase());
    const createdTime = pedido.created_at ? new Date(pedido.created_at).getTime() : NaN;

    const orderMatch = !criteria.order || orderValue.includes(criteria.order);
    const productMatch = !criteria.product || productValues.some((value) => value.includes(criteria.product));
    const userMatch = !criteria.user || userValue.includes(criteria.user);
    const clientMatch = !criteria.client || clientValue.includes(criteria.client);
    const startDateMatch = criteria.startDateTime === null || (!Number.isNaN(createdTime) && createdTime >= criteria.startDateTime);
    const endDateMatch = criteria.endDateTime === null || (!Number.isNaN(createdTime) && createdTime <= criteria.endDateTime);

    return orderMatch && productMatch && userMatch && clientMatch && startDateMatch && endDateMatch;
  };

  const applyCriteria = (rows: PedidoRow[], criteria: FilterCriteria) => rows.filter((pedido) => matchesCriteria(pedido, criteria));

  const getStartDateTime = (dateValue: string) => {
    if (!dateValue) return null;
    const value = new Date(`${dateValue}T00:00:00`);
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  };

  const getEndDateTime = (dateValue: string) => {
    if (!dateValue) return null;
    const value = new Date(`${dateValue}T23:59:59.999`);
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  };

  const startDateTime = getStartDateTime(startDateFilter);
  const endDateTime = getEndDateTime(endDateFilter);

  const pedidosForOrderOptions = useMemo(
    () => applyCriteria(pedidos, {
      order: "",
      product: normalizedProductFilter,
      user: normalizedUserFilter,
      client: normalizedClientFilter,
      startDateTime,
      endDateTime,
    }),
    [pedidos, normalizedProductFilter, normalizedUserFilter, normalizedClientFilter, startDateTime, endDateTime]
  );

  const pedidosForProductOptions = useMemo(
    () => applyCriteria(pedidos, {
      order: normalizedOrderFilter,
      product: "",
      user: normalizedUserFilter,
      client: normalizedClientFilter,
      startDateTime,
      endDateTime,
    }),
    [pedidos, normalizedOrderFilter, normalizedUserFilter, normalizedClientFilter, startDateTime, endDateTime]
  );

  const pedidosForUserOptions = useMemo(
    () => applyCriteria(pedidos, {
      order: normalizedOrderFilter,
      product: normalizedProductFilter,
      user: "",
      client: normalizedClientFilter,
      startDateTime,
      endDateTime,
    }),
    [pedidos, normalizedOrderFilter, normalizedProductFilter, normalizedClientFilter, startDateTime, endDateTime]
  );

  const pedidosForClientOptions = useMemo(
    () => applyCriteria(pedidos, {
      order: normalizedOrderFilter,
      product: normalizedProductFilter,
      user: normalizedUserFilter,
      client: "",
      startDateTime,
      endDateTime,
    }),
    [pedidos, normalizedOrderFilter, normalizedProductFilter, normalizedUserFilter, startDateTime, endDateTime]
  );

  const userOptions = useMemo(() => {
    const values = new Set<string>();
    pedidosForUserOptions.forEach((p) => {
      const value = (p.user_name || String(p.user_id ?? "")).trim();
      if (value) values.add(value);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [pedidosForUserOptions]);

  const clientOptions = useMemo(() => {
    const values = new Set<string>();
    pedidosForClientOptions.forEach((p) => {
      const value = (p.client_name || String(p.cli_id ?? "")).trim();
      if (value) values.add(value);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [pedidosForClientOptions]);

  const orderOptions = useMemo(() => {
    const values = new Set<string>();
    pedidosForOrderOptions.forEach((p) => {
      const value = String(p.id || "").trim();
      if (value) values.add(value);
    });
    return Array.from(values).sort((a, b) => Number(a) - Number(b));
  }, [pedidosForOrderOptions]);

  const productOptions = useMemo(() => {
    const values = new Set<string>();
    pedidosForProductOptions.forEach((p) => {
      getProductNames(p).forEach((name) => values.add(name));
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [pedidosForProductOptions]);

  useEffect(() => {
    setOrderFilter("");
    setProductFilter("");
    setUserFilter("");
    setClientFilter("");
    setStartDateFilter("");
    setEndDateFilter("");
    setSortBy(primaryFilter === "producto" ? "product_name" : "created_at");
    setSortDirection(primaryFilter === "producto" ? "asc" : "desc");
  }, [primaryFilter]);

  useEffect(() => {
    if (orderFilter && !orderOptions.includes(orderFilter)) {
      setOrderFilter("");
    }
  }, [orderFilter, orderOptions]);

  useEffect(() => {
    const exists = productOptions.some((product) => product.toLowerCase() === normalizedProductFilter);
    if (productFilter && !exists) {
      setProductFilter("");
    }
  }, [productFilter, normalizedProductFilter, productOptions]);

  useEffect(() => {
    const exists = userOptions.some((option) => option.toLowerCase() === normalizedUserFilter);
    if (userFilter && !exists) {
      setUserFilter("");
    }
  }, [userFilter, normalizedUserFilter, userOptions]);

  useEffect(() => {
    const exists = clientOptions.some((option) => option.toLowerCase() === normalizedClientFilter);
    if (clientFilter && !exists) {
      setClientFilter("");
    }
  }, [clientFilter, normalizedClientFilter, clientOptions]);

  const getPhaseClass = (phase: number | null, status?: string) => {
    if (String(status || '').toLowerCase().includes('cancel') || phase === 4) {
      return darkMode ? "bg-red-900 text-red-200" : "bg-red-100 text-red-800";
    }
    if (phase === 2) {
      return darkMode ? "bg-green-900 text-green-200" : "bg-green-100 text-green-800";
    }
    if (phase === 3) {
      return darkMode ? "bg-blue-900 text-blue-200" : "bg-blue-100 text-blue-800";
    }
    return darkMode ? "bg-orange-900 text-orange-200" : "bg-orange-100 text-orange-800";
  };

  const filtered = useMemo(() => {
    const hasPrimarySelection = primaryFilter === "pedido" || primaryFilter === "producto";

    if (
      !hasPrimarySelection ||
      !normalizedOrderFilter &&
      !normalizedProductFilter &&
      !normalizedUserFilter &&
      !normalizedClientFilter &&
      !startDateTime &&
      !endDateTime
    ) {
      return pedidos;
    }

    return applyCriteria(pedidos, {
      order: normalizedOrderFilter,
      product: normalizedProductFilter,
      user: normalizedUserFilter,
      client: normalizedClientFilter,
      startDateTime,
      endDateTime,
    });
  }, [
    pedidos,
    primaryFilter,
    normalizedOrderFilter,
    normalizedProductFilter,
    normalizedUserFilter,
    normalizedClientFilter,
    startDateTime,
    endDateTime,
  ]);

  const summary = useMemo(() => {
    const uniqueClients = new Set<string>();
    let totalAmount = 0;

    filtered.forEach((pedido) => {
      totalAmount += Number(pedido.total || 0);
      const clientKey = String(pedido.cli_id ?? "").trim() || String(pedido.client_name || "").trim();
      if (clientKey) {
        uniqueClients.add(clientKey.toLowerCase());
      }
    });

    return {
      totalOrders: filtered.length,
      totalAmount,
      totalClients: uniqueClients.size,
    };
  }, [filtered]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(key);
    setSortDirection("asc");
  };

  const renderSortLabel = (label: string, key: SortKey, align: "left" | "right" = "left") => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className={`inline-flex items-center gap-1 hover:underline ${align === "right" ? "justify-end w-full" : ""}`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{sortBy === key ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      if (sortBy === "id") {
        return (a.id - b.id) * direction;
      }

      if (sortBy === "total") {
        return (a.total - b.total) * direction;
      }

      if (sortBy === "product_name") {
        const firstProductA = String(a.product_names || "").split("||")[0] || "";
        const firstProductB = String(b.product_names || "").split("||")[0] || "";
        const compare = firstProductA.localeCompare(firstProductB, "es", { numeric: true, sensitivity: "base" });
        if (compare !== 0) {
          return compare * direction;
        }
        return (a.id - b.id) * direction;
      }

      if (sortBy === "created_at" || sortBy === "updated_at") {
        const dateA = a[sortBy] ? new Date(String(a[sortBy])).getTime() : 0;
        const dateB = b[sortBy] ? new Date(String(b[sortBy])).getTime() : 0;
        if (dateA !== dateB) {
          return (dateA - dateB) * direction;
        }
        return (a.id - b.id) * direction;
      }

      const valueA = String(a[sortBy as Exclude<SortKey, "id" | "total" | "created_at" | "updated_at" | "product_name">] || "").toLowerCase();
      const valueB = String(b[sortBy as Exclude<SortKey, "id" | "total" | "created_at" | "updated_at" | "product_name">] || "").toLowerCase();
      const compare = valueA.localeCompare(valueB, "es", { numeric: true, sensitivity: "base" });
      if (compare !== 0) {
        return compare * direction;
      }

      return (a.id - b.id) * direction;
    });
    return arr;
  }, [filtered, sortBy, sortDirection]);

  const productTableRows = useMemo(() => {
    const rows: ProductTableRow[] = [];

    filtered.forEach((pedido) => {
      const names = getProductNames(pedido);
      const visibleNames = normalizedProductFilter
        ? names.filter((name) => name.toLowerCase() === normalizedProductFilter)
        : names;

      if (visibleNames.length === 0) {
        rows.push({
          row_id: `${pedido.id}-sin-producto`,
          product_name: "Sin producto",
          pedido,
        });
        return;
      }

      visibleNames.forEach((name, index) => {
        rows.push({
          row_id: `${pedido.id}-${name}-${index}`,
          product_name: name,
          pedido,
        });
      });
    });

    return rows;
  }, [filtered, normalizedProductFilter]);

  const sortedProductRows = useMemo(() => {
    const rows = [...productTableRows];
    const direction = sortDirection === "asc" ? 1 : -1;

    rows.sort((a, b) => {
      if (sortBy === "product_name") {
        const compare = a.product_name.localeCompare(b.product_name, "es", { numeric: true, sensitivity: "base" });
        if (compare !== 0) return compare * direction;
        return (a.pedido.id - b.pedido.id) * direction;
      }

      if (sortBy === "id") {
        return (a.pedido.id - b.pedido.id) * direction;
      }

      if (sortBy === "total") {
        return (a.pedido.total - b.pedido.total) * direction;
      }

      if (sortBy === "created_at" || sortBy === "updated_at") {
        const dateA = a.pedido[sortBy] ? new Date(String(a.pedido[sortBy])).getTime() : 0;
        const dateB = b.pedido[sortBy] ? new Date(String(b.pedido[sortBy])).getTime() : 0;
        if (dateA !== dateB) return (dateA - dateB) * direction;
        return (a.pedido.id - b.pedido.id) * direction;
      }

      const valueA = String(a.pedido[sortBy] || "").toLowerCase();
      const valueB = String(b.pedido[sortBy] || "").toLowerCase();
      const compare = valueA.localeCompare(valueB, "es", { numeric: true, sensitivity: "base" });
      if (compare !== 0) return compare * direction;

      return (a.pedido.id - b.pedido.id) * direction;
    });

    return rows;
  }, [productTableRows, sortBy, sortDirection]);

  const tableTotalItems = primaryFilter === "producto" ? sortedProductRows.length : sorted.length;
  const tableTotalPages = Math.max(1, Math.ceil(tableTotalItems / tablePageSize));

  const paginatedSorted = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return sorted.slice(start, start + tablePageSize);
  }, [sorted, tablePage, tablePageSize]);

  const paginatedSortedProductRows = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return sortedProductRows.slice(start, start + tablePageSize);
  }, [sortedProductRows, tablePage, tablePageSize]);

  useEffect(() => {
    if (sorted.length === 0) {
      setSelectedOrderId(null);
      return;
    }

    const exists = sorted.some((pedido) => pedido.id === selectedOrderId);
    if (!exists) {
      setSelectedOrderId(sorted[0].id);
    }
  }, [sorted, selectedOrderId]);

  const selectedOrder = useMemo(
    () => sorted.find((pedido) => pedido.id === selectedOrderId) || null,
    [sorted, selectedOrderId]
  );

  useEffect(() => {
    if (!selectedOrderId) {
      setOrderActivities([]);
      setActivitiesError("");
      return;
    }

    loadOrderActivities(selectedOrderId);
  }, [selectedOrderId]);

  const orderedActivities = useMemo(
    () => [...orderActivities].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [orderActivities]
  );

  const activityTotalPages = Math.max(1, Math.ceil(orderedActivities.length / activityPageSize));

  const paginatedActivities = useMemo(() => {
    const start = (activityPage - 1) * activityPageSize;
    return orderedActivities.slice(start, start + activityPageSize);
  }, [orderedActivities, activityPage, activityPageSize]);

  useEffect(() => {
    setTablePage(1);
  }, [
    primaryFilter,
    orderFilter,
    productFilter,
    userFilter,
    clientFilter,
    startDateFilter,
    endDateFilter,
    sortBy,
    sortDirection,
    sorted.length,
    sortedProductRows.length,
    tablePageSize,
  ]);

  useEffect(() => {
    if (tablePage > tableTotalPages) {
      setTablePage(tableTotalPages);
    }
  }, [tablePage, tableTotalPages]);

  useEffect(() => {
    setActivityPage(1);
  }, [selectedOrderId, orderedActivities.length, activityPageSize]);

  useEffect(() => {
    if (activityPage > activityTotalPages) {
      setActivityPage(activityTotalPages);
    }
  }, [activityPage, activityTotalPages]);

  const exportToPdf = () => {
    const generatedAt = new Date().toLocaleString();
    const style = `
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
        .brand { display: flex; align-items: center; gap: 12px; }
        .logo-box {
          width: 64px;
          height: 64px;
          border: 2px solid #2563eb;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #2563eb;
          font-weight: 700;
          font-size: 16px;
        }
        .title { margin: 0; font-size: 24px; color: #1d4ed8; }
        .subtitle { margin: 4px 0 0; color: #334155; font-size: 13px; }
        .meta { text-align: right; font-size: 13px; color: #334155; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-card { border: 1px solid #2563eb; border-radius: 8px; padding: 10px 12px; }
        .summary-label { font-size: 13px; color: #1e3a8a; margin-bottom: 6px; }
        .summary-value { font-size: 24px; font-weight: 700; color: #0f172a; }
        .section-title { margin: 0 0 10px; font-size: 16px; color: #1e3a8a; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; text-align: left; word-break: break-word; }
        th { background: #eff6ff; color: #1e3a8a; font-weight: 700; }
        .text-right { text-align: right; }
      </style>
    `;
    const isProductTable = primaryFilter === "producto";

    const rows = isProductTable
      ? sortedProductRows.map((row) => {
          const p = row.pedido;
          return `<tr><td>${row.product_name}</td><td>${p.id}</td><td>${p.user_name || p.user_id || ''}</td><td>${p.client_name || p.cli_id || ''}</td><td style="text-align:right">${formatCurrency(p.total)}</td><td>${p.status}</td><td>${formatDateTime(p.created_at)}</td><td>${formatDateTime(p.updated_at)}</td></tr>`;
        }).join("")
      : sorted.map((p) => {
          return `<tr><td>${p.id}</td><td>${p.user_name || p.user_id || ''}</td><td>${p.client_name || p.cli_id || ''}</td><td style="text-align:right">${formatCurrency(p.total)}</td><td>${p.status}</td><td>${formatDateTime(p.created_at)}</td><td>${formatDateTime(p.updated_at)}</td></tr>`;
        }).join("");

    const reportTitle = isProductTable ? "Reporteria - Tabla Productos" : "Reporteria - Tabla Pedidos";
    const tableHeaders = isProductTable
      ? "<th>Producto</th><th>ID Pedido</th><th>Usuario</th><th>Cliente</th><th style=\"text-align:right\">Monto Total</th><th>Estado</th><th>Fecha Creación</th><th>Fecha Última Modificación</th>"
      : "<th>ID Pedido</th><th>Usuario</th><th>Cliente</th><th style=\"text-align:right\">Monto Total</th><th>Estado</th><th>Fecha Creación</th><th>Fecha Última Modificación</th>";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Reporteria</title>${style}</head><body>
      <header class="header">
        <div class="brand">
          <div class="logo-box">LOGO</div>
          <div>
            <h1 class="title">Reporteria</h1>
            <p class="subtitle">Fecha que se hizo el reporte: ${generatedAt}</p>
          </div>
        </div>
        <div class="meta">
          <div><strong>Vista:</strong> ${isProductTable ? "Producto" : "Pedido"}</div>
        </div>
      </header>

      <section class="summary-grid">
        <article class="summary-card">
          <div class="summary-label">Pedidos totales</div>
          <div class="summary-value">${summary.totalOrders}</div>
        </article>
        <article class="summary-card">
          <div class="summary-label">Monto total</div>
          <div class="summary-value">${formatCurrency(summary.totalAmount)}</div>
        </article>
        <article class="summary-card">
          <div class="summary-label">Cantidad clientes</div>
          <div class="summary-value">${summary.totalClients}</div>
        </article>
      </section>

      <section>
        <h2 class="section-title">${reportTitle}</h2>
        <table>
          <thead><tr>${tableHeaders}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    const isProductTable = primaryFilter === "producto";
    const headers = isProductTable
      ? ["Producto", "ID Pedido", "Usuario", "Cliente", "Monto Total", "Estado", "Fecha Creación", "Fecha Última Modificación"]
      : ["ID Pedido", "Usuario", "Cliente", "Monto Total", "Estado", "Fecha Creación", "Fecha Última Modificación"];

    const rows = isProductTable
      ? sortedProductRows.map((row) => {
          const p = row.pedido;
          return [
            row.product_name,
            p.id,
            p.user_name || p.user_id || "",
            p.client_name || p.cli_id || "",
            formatCurrency(p.total),
            p.status,
            formatDateTime(p.created_at),
            formatDateTime(p.updated_at),
          ];
        })
      : sorted.map((p) => [
          p.id,
          p.user_name || p.user_id || "",
          p.client_name || p.cli_id || "",
          formatCurrency(p.total),
          p.status,
          formatDateTime(p.created_at),
          formatDateTime(p.updated_at),
        ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporteria");

    const fileName = isProductTable ? "reporteria-productos.xlsx" : "reporteria-pedidos.xlsx";
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6">
          <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Pedidos Realizados</p>
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{summary.totalOrders}</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <ClipboardList className="size-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Monto Total</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalAmount)}</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <Wallet className="size-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Cantidad de Clientes</p>
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{summary.totalClients}</p>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg">
                  <Users className="size-6 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <div className="flex flex-col gap-3 w-full">
              <CardTitle className={darkMode ? 'text-white' : ''}>Reportería - Tabla Pedidos</CardTitle>
              <div className="space-y-2 w-full">
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <select
                    value={primaryFilter}
                    onChange={(e) => setPrimaryFilter(e.target.value as PrimaryFilter)}
                    className={`h-10 rounded-md border px-3 text-sm ${
                      darkMode
                        ? "border-gray-600 bg-gray-900 text-gray-100"
                        : "border-gray-300 bg-white text-gray-900"
                    }`}
                  >
                    <option value="">Filtrar primero por...</option>
                    <option value="pedido">Pedido</option>
                    <option value="producto">Producto</option>
                  </select>

                  {primaryFilter === "pedido" && (
                    <>
                      <input
                        id="reporteria-order-filter-primary"
                        list="reporteria-order-options"
                        value={orderFilter}
                        onChange={(e) => setOrderFilter(e.target.value.replace(/\D/g, ""))}
                        placeholder="Todos los pedidos"
                        className={`h-10 rounded-md border px-3 text-sm ${
                          darkMode
                            ? "border-gray-600 bg-gray-900 text-gray-100"
                            : "border-gray-300 bg-white text-gray-900"
                        }`}
                      />
                      <datalist id="reporteria-order-options">
                        {orderOptions.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </>
                  )}

                  {primaryFilter === "producto" && (
                    <>
                      <input
                        id="reporteria-product-filter-primary"
                        list="reporteria-product-options"
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value)}
                        placeholder="Todos los productos"
                        className={`h-10 rounded-md border px-3 text-sm ${
                          darkMode
                            ? "border-gray-600 bg-gray-900 text-gray-100"
                            : "border-gray-300 bg-white text-gray-900"
                        }`}
                      />
                      <datalist id="reporteria-product-options">
                        {productOptions.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </>
                  )}

                  {primaryFilter && primaryFilter !== "pedido" && (
                    <input
                      id="reporteria-order-filter-secondary"
                      list="reporteria-order-options"
                      value={orderFilter}
                      onChange={(e) => setOrderFilter(e.target.value.replace(/\D/g, ""))}
                      placeholder="Todos los pedidos"
                      className={`h-10 rounded-md border px-3 text-sm ${
                        darkMode
                          ? "border-gray-600 bg-gray-900 text-gray-100"
                          : "border-gray-300 bg-white text-gray-900"
                      }`}
                    />
                  )}

                  {primaryFilter && primaryFilter !== "producto" && (
                    <input
                      id="reporteria-product-filter-secondary"
                      list="reporteria-product-options"
                      value={productFilter}
                      onChange={(e) => setProductFilter(e.target.value)}
                      placeholder="Todos los productos"
                      className={`h-10 rounded-md border px-3 text-sm ${
                        darkMode
                          ? "border-gray-600 bg-gray-900 text-gray-100"
                          : "border-gray-300 bg-white text-gray-900"
                      }`}
                    />
                  )}

                  <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                    <Button onClick={exportToPdf} className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white">
                      <FileText className="size-4" /> PDF
                    </Button>
                    <Button onClick={exportToExcel} className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white">
                      <FileSpreadsheet className="size-4" /> Excel
                    </Button>
                  </div>
                </div>

                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <>
                  <input
                    id="reporteria-user-filter"
                    list="reporteria-user-options"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    disabled={!primaryFilter}
                    placeholder="Todos los usuarios"
                    className={`h-10 rounded-md border px-3 text-sm ${
                      darkMode
                        ? "border-gray-600 bg-gray-900 text-gray-100"
                        : "border-gray-300 bg-white text-gray-900"
                    } ${!primaryFilter ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                  <datalist id="reporteria-user-options">
                    {userOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </>

                <>
                  <input
                    id="reporteria-client-filter"
                    list="reporteria-client-options"
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    disabled={!primaryFilter}
                    placeholder="Todos los clientes"
                    className={`h-10 rounded-md border px-3 text-sm ${
                      darkMode
                        ? "border-gray-600 bg-gray-900 text-gray-100"
                        : "border-gray-300 bg-white text-gray-900"
                    } ${!primaryFilter ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                  <datalist id="reporteria-client-options">
                    {clientOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </>

                <input
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  disabled={!primaryFilter}
                  className={`h-10 rounded-md border px-3 text-sm ${
                    darkMode
                      ? "border-gray-600 bg-gray-900 text-gray-100"
                      : "border-gray-300 bg-white text-gray-900"
                  } ${!primaryFilter ? "opacity-60 cursor-not-allowed" : ""}`}
                  title="Fecha de creacion desde"
                />

                <input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  disabled={!primaryFilter}
                  className={`h-10 rounded-md border px-3 text-sm ${
                    darkMode
                      ? "border-gray-600 bg-gray-900 text-gray-100"
                      : "border-gray-300 bg-white text-gray-900"
                  } ${!primaryFilter ? "opacity-60 cursor-not-allowed" : ""}`}
                  title="Fecha de creacion hasta"
                />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <p className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Cargando pedidos desde base de datos...
              </p>
            )}
            {!!error && (
              <p className="text-sm mb-3 text-red-600">{error}</p>
            )}
            <div className="grid grid-cols-1 xl:grid-cols-8 gap-6">
              <div className={primaryFilter === "producto" ? "xl:col-span-8" : "xl:col-span-6"}>
                <div className={`overflow-x-auto rounded-lg border ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}>
                  <table className={`min-w-[1100px] w-full table-auto divide-y ${darkMode ? "divide-gray-700 text-gray-200" : "divide-gray-200 text-gray-800"}`}>
                    <thead className={darkMode ? "bg-gray-800" : "bg-gray-50"}>
                      <tr>
                        <th className={`w-[18%] px-3 py-2 text-left text-sm font-medium whitespace-normal break-words ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                          {primaryFilter === "producto" ? renderSortLabel("Producto", "product_name") : renderSortLabel("ID Pedido", "id")}
                        </th>
                        {primaryFilter === "producto" && (
                          <th className={`w-[10%] px-3 py-2 text-left text-sm font-medium whitespace-normal break-words ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                            {renderSortLabel("ID Pedido", "id")}
                          </th>
                        )}
                        <th className={`w-[11%] px-3 py-2 text-left text-sm font-medium whitespace-normal break-words ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{renderSortLabel("Usuario", "user_name")}</th>
                        <th className={`w-[18%] px-3 py-2 text-left text-sm font-medium whitespace-normal break-words ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{renderSortLabel("Cliente", "client_name")}</th>
                        <th className={`w-[11%] px-3 py-2 text-right text-sm font-medium whitespace-normal break-words ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{renderSortLabel("Monto Total", "total", "right")}</th>
                        <th className={`w-[9%] px-3 py-2 text-left text-sm font-medium whitespace-normal break-words ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{renderSortLabel("Estado", "status")}</th>
                        <th className={`w-[16%] px-3 py-2 text-left text-sm font-medium whitespace-normal break-words ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{renderSortLabel("Fecha Creación", "created_at")}</th>
                        <th className={`w-[20%] px-3 py-2 text-left text-sm font-medium whitespace-normal break-words ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{renderSortLabel("Fecha Última Modificación", "updated_at")}</th>
                        <th className={`w-[8%] px-3 py-2 text-left text-sm font-medium whitespace-normal break-words ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody className={darkMode ? "bg-gray-900 divide-y divide-gray-700" : "bg-white divide-y divide-gray-200"}>
                      {primaryFilter === "producto" ? (
                        sortedProductRows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className={`px-4 py-6 text-center text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                              No hay productos para mostrar
                            </td>
                          </tr>
                        ) : (
                            paginatedSortedProductRows.map((row) => {
                            const pedido = row.pedido;

                            return (
                              <tr key={row.row_id} className={darkMode ? "hover:bg-gray-800" : "hover:bg-gray-50"}>
                                <td className="px-3 py-3 text-sm whitespace-normal break-words">{row.product_name}</td>
                                <td className="px-3 py-3 text-sm whitespace-normal break-words">{pedido.id}</td>
                                <td className="px-3 py-3 text-sm whitespace-normal break-words">{pedido.user_name || pedido.user_id || '—'}</td>
                                <td className="px-3 py-3 text-sm whitespace-normal break-words">{pedido.client_name || pedido.cli_id || '—'}</td>
                                <td className="px-3 py-3 text-sm text-right whitespace-normal break-words">{formatCurrency(pedido.total)}</td>
                                <td className="px-3 py-3 text-sm whitespace-normal break-words">
                                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getPhaseClass(pedido.phase, pedido.status)}`}>
                                    {pedido.status}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-sm whitespace-normal break-words">{formatDateTime(pedido.created_at)}</td>
                                <td className="px-3 py-3 text-sm whitespace-normal break-words">{formatDateTime(pedido.updated_at)}</td>
                                <td className="px-3 py-3 text-sm">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedOrderId(pedido.id)}
                                    className={`h-8 w-8 p-0 ${darkMode ? "border-gray-600 text-gray-200 hover:bg-gray-700" : ""}`}
                                  >
                                    <Eye className="size-4" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })
                        )
                      ) : sorted.length === 0 ? (
                        <tr>
                          <td colSpan={8} className={`px-4 py-6 text-center text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                            No hay pedidos para mostrar
                          </td>
                        </tr>
                      ) : (
                        paginatedSorted.map((pedido) => (
                          <tr key={pedido.id} className={darkMode ? "hover:bg-gray-800" : "hover:bg-gray-50"}>
                            <td className="px-3 py-3 text-sm whitespace-normal break-words">{pedido.id}</td>
                            <td className="px-3 py-3 text-sm whitespace-normal break-words">{pedido.user_name || pedido.user_id || '—'}</td>
                            <td className="px-3 py-3 text-sm whitespace-normal break-words">{pedido.client_name || pedido.cli_id || '—'}</td>
                            <td className="px-3 py-3 text-sm text-right whitespace-normal break-words">{formatCurrency(pedido.total)}</td>
                            <td className="px-3 py-3 text-sm whitespace-normal break-words">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${getPhaseClass(pedido.phase, pedido.status)}`}>
                                {pedido.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-sm whitespace-normal break-words">{formatDateTime(pedido.created_at)}</td>
                            <td className="px-3 py-3 text-sm whitespace-normal break-words">{formatDateTime(pedido.updated_at)}</td>
                            <td className="px-3 py-3 text-sm">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedOrderId(pedido.id)}
                                className={`h-8 w-8 p-0 ${darkMode ? "border-gray-600 text-gray-200 hover:bg-gray-700" : ""}`}
                              >
                                <Eye className="size-4" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {tableTotalItems > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label htmlFor="reporteria-table-size" className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                        Filas por pagina
                      </label>
                      <select
                        id="reporteria-table-size"
                        value={String(tablePageSize)}
                        onChange={(e) => setTablePageSize(Number(e.target.value) || 10)}
                        className={`h-8 rounded-md border px-2 text-xs ${
                          darkMode
                            ? "border-gray-600 bg-gray-900 text-gray-100"
                            : "border-gray-300 bg-white text-gray-900"
                        }`}
                      >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={`table-size-${size}`} value={String(size)}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      Pagina {tablePage} de {tableTotalPages}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setTablePage(1)} disabled={tablePage === 1}>
                        Primera
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}
                        disabled={tablePage === 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTablePage((prev) => Math.min(tableTotalPages, prev + 1))}
                        disabled={tablePage === tableTotalPages}
                      >
                        Siguiente
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTablePage(tableTotalPages)}
                        disabled={tablePage === tableTotalPages}
                      >
                        Ultima
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {primaryFilter !== "producto" && (
              <Card className={`xl:col-span-2 h-fit max-w-full ${darkMode ? "bg-gray-900 border-gray-700" : "bg-white"}`}>
                <CardHeader>
                  <CardTitle className={`text-base ${darkMode ? "text-white" : "text-gray-900"}`}>
                    Actividad Reciente {selectedOrder ? `• Pedido #${selectedOrder.id}` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-[70vh] overflow-y-auto overflow-x-hidden">
                  {!selectedOrder && (
                    <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      Selecciona un pedido en Acciones para ver su actividad reciente.
                    </p>
                  )}

                  {selectedOrder && isLoadingActivities && (
                    <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      Cargando actividad reciente...
                    </p>
                  )}

                  {selectedOrder && !isLoadingActivities && !!activitiesError && (
                    <p className="text-sm text-red-600">{activitiesError}</p>
                  )}

                  {selectedOrder && !isLoadingActivities && !activitiesError && orderActivities.length === 0 && (
                    <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      No hay actividades registradas para este pedido.
                    </p>
                  )}

                  {selectedOrder && !isLoadingActivities && !activitiesError && orderActivities.length > 0 && (
                    <div className="space-y-3 overflow-hidden">
                      {paginatedActivities.map((activity, index) => {
                        const stepNumber = (activityPage - 1) * activityPageSize + index + 1;
                        const iconClass = getPhaseClass(activity.phase);

                        return (
                          <div key={activity.id} className="flex items-start gap-3">
                            <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full ${getPhaseClass(activity.phase, activity.status)}`}>
                              {activity.phase === 2 ? (
                                <Truck className="size-4" />
                              ) : activity.phase === 3 ? (
                                <PackageCheck className="size-4" />
                              ) : activity.action.toLowerCase().includes("creado") ? (
                                <Clock3 className="size-4" />
                              ) : (
                                <CheckCircle2 className="size-4" />
                              )}
                            </span>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className={`font-semibold break-all ${darkMode ? "text-white" : "text-gray-900"}`}>
                                  Paso {stepNumber}: {activity.action}
                                </p>
                                <span className={`max-w-full break-all px-2 py-0.5 rounded text-[11px] font-semibold ${getPhaseClass(activity.phase, activity.status)}`}>
                                  {activity.status}
                                </span>
                              </div>
                              <p className={`text-sm break-words whitespace-pre-line ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                                {activity.description || "Sin descripción"}
                              </p>
                              <p className={`text-xs mt-1 break-words ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                {formatDateTime(activity.date)}
                                {activity.user_name ? (
                                  <>
                                    {" "}• <span className="font-semibold">{activity.user_name}</span>
                                  </>
                                ) : ""}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedOrder && !isLoadingActivities && !activitiesError && orderedActivities.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label htmlFor="reporteria-activity-size" className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                          Filas por pagina
                        </label>
                        <select
                          id="reporteria-activity-size"
                          value={String(activityPageSize)}
                          onChange={(e) => setActivityPageSize(Number(e.target.value) || 10)}
                          className={`h-8 rounded-md border px-2 text-xs ${
                            darkMode
                              ? "border-gray-600 bg-gray-900 text-gray-100"
                              : "border-gray-300 bg-white text-gray-900"
                          }`}
                        >
                          {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={`activity-size-${size}`} value={String(size)}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                        Pagina {activityPage} de {activityTotalPages}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setActivityPage(1)} disabled={activityPage === 1}>
                          Primera
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActivityPage((prev) => Math.max(1, prev - 1))}
                          disabled={activityPage === 1}
                        >
                          Anterior
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActivityPage((prev) => Math.min(activityTotalPages, prev + 1))}
                          disabled={activityPage === activityTotalPages}
                        >
                          Siguiente
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActivityPage(activityTotalPages)}
                          disabled={activityPage === activityTotalPages}
                        >
                          Ultima
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
