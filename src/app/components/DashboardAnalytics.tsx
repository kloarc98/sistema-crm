import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { TrendingUp, ShoppingCart, CheckCircle, Clock, MapPin } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

interface DashboardOrderRow {
  id: number;
  user_id: number | null;
  total: number;
  status: string;
  created_at: string | null;
  ped_saldo_pag: number;
  ped_saldo_pen: number;
  product_names: string;
}

interface MonthlySalesPoint {
  key: string;
  label: string;
  ventas: number;
  pedidos: number;
}

interface ProductSalesPoint {
  name: string;
  value: number;
}

interface DepStat {
  dep_id: number;
  dep_nombre: string;
  total_clientes: number;
  total_pedidos: number;
  total_ventas: number;
}

// Normaliza nombres de dep de la BD (MAYUS, sin tilde) al nombre del GeoJSON
const DEP_NORMALIZE: Record<string, string> = {
  "GUATEMALA":         "Guatemala",
  "EL PROGRESO":       "El Progreso",
  "SACATEPEQUEZ":      "Sacatepéquez",
  "SACATEPÉQUEZ":      "Sacatepéquez",
  "CHIMALTENANGO":     "Chimaltenango",
  "ESCUINTLA":         "Escuintla",
  "SANTA ROSA":        "Santa Rosa",
  "SOLOLA":            "Sololá",
  "SOLOLÁ":            "Sololá",
  "TOTONICAPAN":       "Totonicapán",
  "TOTONICAPÁN":       "Totonicapán",
  "QUETZALTENANGO":    "Quetzaltenango",
  "SUCHITEPEQUEZ":     "Suchitepéquez",
  "SUCHITEPÉQUEZ":     "Suchitepéquez",
  "RETALHULEU":        "Retalhuleu",
  "SAN MARCOS":        "San Marcos",
  "HUEHUETENANGO":     "Huehuetenango",
  "QUICHE":            "Quiché",
  "QUICHÉ":            "Quiché",
  "BAJA VERAPAZ":      "Baja Verapaz",
  "ALTA VERAPAZ":      "Alta Verapaz",
  "PETEN":             "Petén",
  "PETÉN":             "Petén",
  "IZABAL":            "Izabal",
  "ZACAPA":            "Zacapa",
  "CHIQUIMULA":        "Chiquimula",
  "JALAPA":            "Jalapa",
  "JUTIAPA":           "Jutiapa",
};

// GeoJSON servido localmente por Vite desde /public para no depender de red externa
const GEOJSON_URL = "/maps/gtm-departments.geojson";

function normalizeRegionName(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export function DashboardAnalytics() {
  const { darkMode } = useTheme();
  const { user } = useAuth();
  const [orders, setOrders] = useState<DashboardOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [depStats, setDepStats] = useState<DepStat[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState("");
  const mapRegistered = useRef(false);

  const normalizedRole = (user?.role || "").toLowerCase().trim();
  const isAdmin = normalizedRole === "admin" || normalizedRole.includes("admin");
  const isJefe = normalizedRole === "jefe" || normalizedRole.includes("jefe");
  const isVendedor = normalizedRole === "vendedor" || normalizedRole.includes("vendedor");

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
      minimumFractionDigits: 2,
    }).format(value || 0);

  useEffect(() => {
    const loadOrders = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/orders?includeCancelled=1");
        if (!response.ok) {
          throw new Error("No se pudo cargar informacion del dashboard");
        }

        const payload = await response.json();
        const normalized = Array.isArray(payload)
          ? payload.map((row: any) => ({
              id: Number(row?.id || 0),
              user_id:
                row?.user_id === null || typeof row?.user_id === "undefined"
                  ? null
                  : Number(row.user_id),
              total: Number(row?.total || 0),
              status: String(row?.status || ""),
              created_at: row?.created_at ? String(row.created_at) : null,
              ped_saldo_pag: Number(row?.ped_saldo_pag || 0),
              ped_saldo_pen: Number(row?.ped_saldo_pen || 0),
              product_names: String(row?.product_names || ""),
            }))
          : [];

        setOrders(normalized);
      } catch (err) {
        setOrders([]);
        setError(err instanceof Error ? err.message : "No se pudo cargar dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    loadOrders();
  }, []);

  // Carga el GeoJSON y lo registra en ECharts (una sola vez)
  useEffect(() => {
    if (mapRegistered.current) return;
    fetch(GEOJSON_URL)
      .then((r) => {
        if (!r.ok) {
          throw new Error("No se pudo descargar el mapa local");
        }
        return r.json();
      })
      .then((geoData) => {
        (echarts as any).registerMap("guatemala", geoData);
        mapRegistered.current = true;
        setMapReady(true);
      })
      .catch((err) => {
        setMapLoadError(err instanceof Error ? err.message : "No se pudo cargar el mapa");
      });
  }, []);

  // Carga estadísticas por departamento
  useEffect(() => {
    const requesterHeaders = {
      "x-user-id": String(user?.id || ""),
      "x-user-role": String(user?.role || ""),
      "x-user-username": String(user?.username || ""),
    };

    const normalizeDepStats = (data: any[]) =>
      data.map((d: any) => ({
        dep_id: Number(d.dep_id || 0),
        dep_nombre: String(d.dep_nombre || ""),
        total_clientes: Number(d.total_clientes || 0),
        total_pedidos: Number(d.total_pedidos || 0),
        total_ventas: Number(d.total_ventas || 0),
      }));

    const loadDepartmentStats = async () => {
      try {
        const response = await fetch("/api/clients/stats/departments", {
          headers: requesterHeaders,
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            setDepStats(normalizeDepStats(data));
            return;
          }
        }

        // Fallback: si el endpoint nuevo no está disponible (backend sin reiniciar),
        // agregamos estadísticas a partir de /api/clients.
        const clientsResponse = await fetch("/api/clients", {
          headers: requesterHeaders,
        });
        if (!clientsResponse.ok) {
          return;
        }

        const clientsData = await clientsResponse.json();
        if (!Array.isArray(clientsData)) {
          return;
        }

        const grouped = new Map<string, DepStat>();
        for (const c of clientsData) {
          const depNombre = String(c?.departamentoNombre || "").trim();
          if (!depNombre) continue;
          const depId = Number(c?.departamentoId || 0);
          const key = `${depId}-${depNombre.toUpperCase()}`;
          const current = grouped.get(key) || {
            dep_id: depId,
            dep_nombre: depNombre,
            total_clientes: 0,
            total_pedidos: 0,
            total_ventas: 0,
          };
          current.total_clientes += 1;
          grouped.set(key, current);
        }

        setDepStats(Array.from(grouped.values()).sort((a, b) => a.dep_id - b.dep_id));
      } catch {
        // Silenciar para no romper el dashboard si el servicio está temporalmente caído.
      }
    };

    loadDepartmentStats();
  }, [user?.id, user?.role, user?.username]);

  const visibleOrders = useMemo(() => {
    const currentUserId = Number(user?.id || 0);

    return orders.filter((row) => {
      if (!row.id) {
        return false;
      }

      const status = String(row.status || "").toLowerCase();
      if (status.includes("cancel")) {
        return false;
      }

      if (isVendedor && !isAdmin && !isJefe) {
        return Number(row.user_id || 0) === currentUserId;
      }

      return true;
    });
  }, [orders, isAdmin, isJefe, isVendedor, user?.id]);

  const monthlySalesData = useMemo(() => {
    const grouped = new Map<string, MonthlySalesPoint>();

    for (const row of visibleOrders) {
      if (!row.created_at) {
        continue;
      }

      const date = new Date(row.created_at);
      if (Number.isNaN(date.getTime())) {
        continue;
      }

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("es-GT", { month: "short", year: "numeric" });

      const current = grouped.get(key) || {
        key,
        label,
        ventas: 0,
        pedidos: 0,
      };

      current.ventas += Number(row.total || 0);
      current.pedidos += 1;
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-12);
  }, [visibleOrders]);

  const productSalesData = useMemo(() => {
    const totals = new Map<string, number>();

    for (const row of visibleOrders) {
      const names = String(row.product_names || "")
        .split("||")
        .map((item) => item.trim().toUpperCase())
        .filter((item) => item.length > 0);

      const uniqueNames = [...new Set(names)];
      if (uniqueNames.length === 0) {
        uniqueNames.push("SIN PRODUCTO");
      }

      const total = Number(row.total || 0);
      const distributed = uniqueNames.length > 0 ? total / uniqueNames.length : 0;

      for (const name of uniqueNames) {
        totals.set(name, (totals.get(name) || 0) + distributed);
      }
    }

    const sorted = Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (sorted.length <= 7) {
      return sorted;
    }

    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7).reduce((sum, item) => sum + item.value, 0);
    return [...top, { name: "OTROS", value: rest }];
  }, [visibleOrders]);

  const paidVsPendingData = useMemo(() => {
    let paidAmount = 0;
    let pendingAmount = 0;

    for (const row of visibleOrders) {
      const status = String(row.status || "").toLowerCase();
      const total = Number(row.total || 0);
      const paid = Number(row.ped_saldo_pag || 0);
      const pendingByBalance = Number(row.ped_saldo_pen || 0);
      const inferredPending = Math.max(0, total - paid);
      const pending = pendingByBalance > 0 ? pendingByBalance : inferredPending;

      const isPaid = status.includes("pag") || pending <= 0;

      if (isPaid) {
        paidAmount += total;
      } else {
        pendingAmount += pending;
      }
    }

    return [
      { estado: "Pagado", monto: paidAmount },
      { estado: "Pendiente", monto: pendingAmount },
    ];
  }, [visibleOrders]);

  // Todos los estados (incluyendo cancelados) filtrando solo por rol
  const ordersByStatusData = useMemo(() => {
    const currentUserId = Number(user?.id || 0);
    const roleFiltered = orders.filter((row) => {
      if (!row.id) return false;
      if (isVendedor && !isAdmin && !isJefe) {
        return Number(row.user_id || 0) === currentUserId;
      }
      return true;
    });

    const grouped = new Map<string, { status: string; count: number; monto: number }>();
    for (const row of roleFiltered) {
      const st = String(row.status || "pendiente").trim();
      const key = st.toLowerCase();
      const current = grouped.get(key) || { status: st, count: 0, monto: 0 };
      current.count += 1;
      current.monto += Number(row.total || 0);
      grouped.set(key, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
  }, [orders, isAdmin, isJefe, isVendedor, user?.id]);

  // ── Paleta Power BI ──────────────────────────────────────────────
  const PBI_BLUE   = "#118DFF";
  const PBI_GREEN  = "#12239E";
  const PBI_TEAL   = "#01B8AA";
  const PBI_ORANGE = "#E66C37";
  const PBI_PURPLE = "#744EC2";
  const PBI_YELLOW = "#D9B300";
  const PBI_RED    = "#D64550";
  const PBI_CYAN   = "#197278";

  const cardBg     = darkMode ? "#1e2130" : "#ffffff";
  const cardBorder = darkMode ? "#2d3250" : "#e8eaf0";
  const textPrimary   = darkMode ? "#e8eaf6" : "#1a1a2e";
  const textSecondary = darkMode ? "#8b93b0" : "#6c757d";
  const gridColor     = darkMode ? "#2d3250" : "#f0f2f8";
  const tooltipBg     = darkMode ? "#16213e" : "#ffffff";
  const tooltipBorder = darkMode ? "#2d3250" : "#dee2e6";

  // ── KPIs ─────────────────────────────────────────────────────────
  const totalVentas   = visibleOrders.reduce((s, r) => s + r.total, 0);
  const totalPedidos  = visibleOrders.length;
  const totalPagado   = paidVsPendingData[0]?.monto ?? 0;
  const totalPendiente = paidVsPendingData[1]?.monto ?? 0;

  const avgOrdersNum = monthlySalesData.length > 0
    ? (monthlySalesData.reduce((s, m) => s + m.pedidos, 0) / monthlySalesData.length)
    : 0;

  // ── Opciones ECharts ──────────────────────────────────────────────
  const monthlySalesOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: { color: textPrimary, fontSize: 12 },
      formatter: (params: any[]) => {
        const p = params[0];
        return `<strong>${p.axisValue}</strong><br/>${p.marker} ${formatMoney(p.value)}`;
      },
    },
    grid: { left: 16, right: 16, top: 16, bottom: 0, containLabel: true },
    xAxis: {
      type: "category",
      data: monthlySalesData.map((d) => d.label),
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { show: false },
      axisLabel: { color: textSecondary, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: gridColor } },
      axisLabel: {
        color: textSecondary,
        fontSize: 11,
        formatter: (v: number) =>
          v >= 1000 ? `Q${(v / 1000).toFixed(0)}k` : `Q${v}`,
      },
    },
    series: [{
      name: "Ventas",
      type: "bar",
      data: monthlySalesData.map((d) => d.ventas),
      barMaxWidth: 48,
      itemStyle: {
        color: {
          type: "linear",
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: PBI_BLUE },
            { offset: 1, color: `${PBI_BLUE}66` },
          ],
        },
        borderRadius: [4, 4, 0, 0],
      },
      emphasis: {
        itemStyle: { color: PBI_BLUE },
      },
    }],
  }), [monthlySalesData, darkMode]);

  const productDonutOption = useMemo(() => {
    const PIE_PALETTE = [PBI_BLUE, PBI_TEAL, PBI_ORANGE, PBI_PURPLE, PBI_YELLOW, PBI_RED, PBI_CYAN, PBI_GREEN];
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: textPrimary, fontSize: 12 },
        formatter: (p: any) =>
          `${p.marker}<strong>${p.name}</strong><br/>` +
          `${formatMoney(p.value)}&nbsp;&nbsp;<em style="color:${textSecondary}">${p.percent}%</em>`,
      },
      legend: {
        orient: "vertical",
        right: 0,
        top: "center",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: textSecondary, fontSize: 11 },
        formatter: (name: string) =>
          name.length > 14 ? name.slice(0, 13) + "…" : name,
      },
      series: [{
        type: "pie",
        radius: ["42%", "72%"],
        center: ["38%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 13,
            fontWeight: "bold",
            color: textPrimary,
            formatter: (p: any) => `{a|${p.percent}%}\n{b|${p.name.slice(0, 12)}}`,
            rich: {
              a: { fontSize: 16, fontWeight: "bold", color: textPrimary },
              b: { fontSize: 11, color: textSecondary },
            },
          },
        },
        data: productSalesData.map((d, i) => ({
          name: d.name,
          value: Math.round(d.value * 100) / 100,
          itemStyle: { color: PIE_PALETTE[i % PIE_PALETTE.length] },
        })),
      }],
    };
  }, [productSalesData, darkMode]);

  const paidVsPendingOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: { color: textPrimary, fontSize: 12 },
      formatter: (params: any[]) => {
        const p = params[0];
        return `<strong>${p.axisValue}</strong><br/>${p.marker} ${formatMoney(p.value)}`;
      },
    },
    grid: { left: 16, right: 16, top: 16, bottom: 0, containLabel: true },
    xAxis: {
      type: "category",
      data: paidVsPendingData.map((d) => d.estado),
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { show: false },
      axisLabel: { color: textSecondary, fontSize: 12, fontWeight: "bold" },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: gridColor } },
      axisLabel: {
        color: textSecondary,
        fontSize: 11,
        formatter: (v: number) =>
          v >= 1000 ? `Q${(v / 1000).toFixed(0)}k` : `Q${v}`,
      },
    },
    series: [{
      type: "bar",
      data: paidVsPendingData.map((d, i) => ({
        value: d.monto,
        itemStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: i === 0 ? PBI_TEAL : PBI_ORANGE },
              { offset: 1, color: i === 0 ? `${PBI_TEAL}55` : `${PBI_ORANGE}55` },
            ],
          },
          borderRadius: [4, 4, 0, 0],
        },
      })),
      barMaxWidth: 80,
      label: {
        show: true,
        position: "top",
        color: textSecondary,
        fontSize: 11,
        formatter: (p: any) =>
          p.value >= 1000 ? `Q${(p.value / 1000).toFixed(1)}k` : `Q${p.value}`,
      },
    }],
  }), [paidVsPendingData, darkMode]);

  const ordersByStatusOption = useMemo(() => {
    const STATUS_COLORS = [PBI_BLUE, PBI_TEAL, PBI_ORANGE, PBI_PURPLE, PBI_YELLOW, PBI_RED, PBI_CYAN, PBI_GREEN];
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: textPrimary, fontSize: 12 },
        formatter: (p: any) =>
          `${p.marker} <strong>${p.name}</strong><br/>` +
          `Pedidos: <strong>${p.value}</strong><br/>` +
          `Monto: <strong>${formatMoney(p.data.monto)}</strong>`,
      },
      legend: {
        bottom: 4,
        left: "center",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: textSecondary, fontSize: 11 },
        formatter: (name: string) => name.charAt(0).toUpperCase() + name.slice(1),
      },
      series: [{
        type: "pie",
        radius: ["15%", "72%"],
        center: ["50%", "46%"],
        roseType: "area",
        itemStyle: { borderRadius: 6, borderColor: darkMode ? "#1e2130" : "#ffffff", borderWidth: 2 },
        label: {
          show: true,
          color: textPrimary,
          fontSize: 11,
          fontWeight: "bold",
          formatter: (p: any) =>
            `{count|${p.value}}\n{pct|${p.percent}%}`,
          rich: {
            count: { fontSize: 13, fontWeight: "bold", color: textPrimary },
            pct: { fontSize: 10, color: textSecondary },
          },
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0,0,0,0.4)" },
          label: { fontSize: 13 },
        },
        data: ordersByStatusData.map((d, i) => ({
          name: d.status,
          value: d.count,
          monto: d.monto,
          itemStyle: { color: STATUS_COLORS[i % STATUS_COLORS.length] },
        })),
      }],
    };
  }, [ordersByStatusData, darkMode]);

  const guatemalaMapOption = useMemo(() => {
    if (!mapReady) return {};

    const registeredMap = (echarts as any).getMap?.("guatemala");
    const featureNames: string[] = Array.isArray(registeredMap?.geoJSON?.features)
      ? registeredMap.geoJSON.features
          .map((f: any) => String(f?.properties?.shapeName || "").trim())
          .filter((n: string) => n.length > 0)
      : [];

    const featureNameByNormalized = new Map<string, string>(
      featureNames.map((name) => [normalizeRegionName(name), name])
    );

    const mapData = depStats.map((d) => {
      const normalizedFromDb = DEP_NORMALIZE[d.dep_nombre.toUpperCase()] ?? d.dep_nombre;
      const matchedFeatureName =
        featureNameByNormalized.get(normalizeRegionName(normalizedFromDb)) ??
        normalizedFromDb;

      return {
        name: matchedFeatureName,
        value: d.total_clientes,
        extraPedidos: d.total_pedidos,
        extraVentas: d.total_ventas,
      };
    });

    const maxVal = Math.max(...mapData.map((d) => d.value), 1);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: textPrimary, fontSize: 12 },
        formatter: (p: any) => {
          const extra = p.data || {};
          const clientes = p.value ?? 0;
          if (!clientes && !extra.extraPedidos) {
            return `<strong>${p.name}</strong><br/><span style="color:${textSecondary}">Sin datos</span>`;
          }
          return (
            `<strong>${p.name}</strong><br/>` +
            `👤 Clientes: <strong>${clientes}</strong><br/>` +
            `📦 Pedidos: <strong>${extra.extraPedidos ?? 0}</strong><br/>` +
            `💰 Ventas: <strong>${formatMoney(extra.extraVentas ?? 0)}</strong>`
          );
        },
      },
      visualMap: {
        min: 0,
        max: maxVal,
        show: true,
        left: 8,
        bottom: 8,
        orient: "horizontal",
        itemWidth: 12,
        itemHeight: 100,
        text: [`${maxVal}`, "0"],
        textStyle: { color: textSecondary, fontSize: 10 },
        calculable: true,
        inRange: {
          color: darkMode
            ? ["#1e2130", "#1550cc", "#118DFF"]
            : ["#e8f4ff", "#5b9fff", "#118DFF"],
        },
      },
      series: [{
        type: "map",
        map: "guatemala",
        roam: true,
        scaleLimit: { min: 0.8, max: 5 },
        data: mapData,
        nameProperty: "shapeName",
        emphasis: {
          label: { show: true, color: "#ffffff", fontSize: 10, fontWeight: "bold" },
          itemStyle: { areaColor: PBI_ORANGE, shadowBlur: 8 },
        },
        select: {
          label: { show: true, color: "#ffffff" },
          itemStyle: { areaColor: PBI_PURPLE },
        },
        label: {
          show: false,
        },
        itemStyle: {
          areaColor: darkMode ? "#2b3150" : "#eef2ff",
          borderColor: darkMode ? "#5a6897" : "#c7d2fe",
          borderWidth: 1,
        },
      }],
    };
  }, [mapReady, depStats, darkMode]);

  // ── KPI Card component ────────────────────────────────────────────
  const KpiCard = ({
    label,
    value,
    sub,
    icon: Icon,
    accent,
  }: {
    label: string;
    value: string;
    sub?: string;
    icon: React.ElementType;
    accent: string;
  }) => (
    <div
      style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
      className="rounded-xl p-5 flex items-center gap-4 shadow-sm"
    >
      <div
        className="flex items-center justify-center rounded-xl shrink-0"
        style={{ width: 48, height: 48, background: `${accent}22` }}
      >
        <Icon size={22} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p style={{ color: textSecondary }} className="text-xs font-medium uppercase tracking-wide truncate">
          {label}
        </p>
        <p style={{ color: textPrimary }} className="text-xl font-bold mt-0.5 truncate">
          {value}
        </p>
        {sub && (
          <p style={{ color: textSecondary }} className="text-xs mt-0.5 truncate">
            {sub}
          </p>
        )}
      </div>
    </div>
  );

  // ── Chart Card wrapper ────────────────────────────────────────────
  const ChartCard = ({
    title,
    children,
    className = "",
  }: {
    title: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <div
      style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
      className={`rounded-xl shadow-sm overflow-hidden ${className}`}
    >
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span
          className="block w-1 h-5 rounded-full"
          style={{ background: PBI_BLUE }}
        />
        <h2 style={{ color: textPrimary }} className="font-semibold text-sm">
          {title}
        </h2>
      </div>
      <div className="px-3 pb-4">{children}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: darkMode ? "#12142a" : "#f4f6fb" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 style={{ color: textPrimary }} className="text-2xl font-bold tracking-tight">
            Dashboard
          </h1>
          <p style={{ color: textSecondary }} className="text-sm mt-1">
            Resumen analítico de ventas, productos y estado de cobros
          </p>
          {isLoading && (
            <p style={{ color: textSecondary }} className="text-xs mt-2">
              Cargando métricas…
            </p>
          )}
          {!!error && (
            <p className="text-xs text-red-500 mt-2">{error}</p>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Ventas totales"
            value={formatMoney(totalVentas)}
            sub={`${totalPedidos} pedido${totalPedidos !== 1 ? "s" : ""}`}
            icon={TrendingUp}
            accent={PBI_BLUE}
          />
          <KpiCard
            label="Total pedidos"
            value={String(totalPedidos)}
            sub={`Prom. ${avgOrdersNum.toFixed(1)} / mes`}
            icon={ShoppingCart}
            accent={PBI_PURPLE}
          />
          <KpiCard
            label="Monto pagado"
            value={formatMoney(totalPagado)}
            icon={CheckCircle}
            accent={PBI_TEAL}
          />
          <KpiCard
            label="Monto pendiente"
            value={formatMoney(totalPendiente)}
            icon={Clock}
            accent={PBI_ORANGE}
          />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
          <ChartCard title="Ventas por mes" className="xl:col-span-2">
            <ReactECharts
              option={monthlySalesOption}
              style={{ height: 300 }}
              notMerge
            />
          </ChartCard>

          <ChartCard title="Distribución de productos">
            <ReactECharts
              option={productDonutOption}
              style={{ height: 300 }}
              notMerge
            />
          </ChartCard>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
          <ChartCard title="Pagado vs Pendiente" className="xl:col-span-2">
            <ReactECharts
              option={paidVsPendingOption}
              style={{ height: 260 }}
              notMerge
            />
          </ChartCard>

          {/* Promedio card */}
          <div
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
            className="rounded-xl shadow-sm p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="block w-1 h-5 rounded-full" style={{ background: PBI_PURPLE }} />
                <h2 style={{ color: textPrimary }} className="font-semibold text-sm">
                  Promedio mensual
                </h2>
              </div>
              <p
                style={{ color: PBI_BLUE, fontVariantNumeric: "tabular-nums" }}
                className="text-5xl font-bold tracking-tight"
              >
                {avgOrdersNum.toFixed(1)}
              </p>
              <p style={{ color: textSecondary }} className="text-sm mt-2">
                pedidos por mes
              </p>
            </div>
            <div
              style={{ background: darkMode ? "#1a1c35" : "#f0f4ff", borderRadius: 8 }}
              className="mt-4 p-3"
            >
              <p style={{ color: textSecondary }} className="text-xs leading-5">
                Basado en{" "}
                <span style={{ color: textPrimary }} className="font-semibold">
                  {monthlySalesData.length}
                </span>{" "}
                mes{monthlySalesData.length !== 1 ? "es" : ""} con actividad registrada.
              </p>
              <p style={{ color: textSecondary }} className="text-xs leading-5 mt-1">
                Total de{" "}
                <span style={{ color: textPrimary }} className="font-semibold">
                  {totalPedidos}
                </span>{" "}
                pedidos analizados.
              </p>
            </div>
          </div>
        </div>

        {/* Charts row 3 — estados de pedidos */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <ChartCard title="Estados de pedidos" className="xl:col-span-1">
            <ReactECharts
              option={ordersByStatusOption}
              style={{ height: 340 }}
              notMerge
            />
          </ChartCard>

          {/* Tabla resumen de estados */}
          <div
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
            className="rounded-xl shadow-sm overflow-hidden xl:col-span-2"
          >
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <span className="block w-1 h-5 rounded-full" style={{ background: PBI_ORANGE }} />
              <h2 style={{ color: textPrimary }} className="font-semibold text-sm">
                Resumen por estado
              </h2>
            </div>
            <div className="px-3 pb-4">
              <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {["Estado", "Pedidos", "% del total", "Monto"].map((col) => (
                      <th
                        key={col}
                        style={{
                          color: textSecondary,
                          borderBottom: `1px solid ${cardBorder}`,
                          paddingBottom: 8,
                          fontWeight: 600,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                        className={col === "Estado" ? "text-left pl-2" : "text-right pr-2"}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordersByStatusData.map((d, i) => {
                    const STATUS_COLORS = [PBI_BLUE, PBI_TEAL, PBI_ORANGE, PBI_PURPLE, PBI_YELLOW, PBI_RED, PBI_CYAN, PBI_GREEN];
                    const color = STATUS_COLORS[i % STATUS_COLORS.length];
                    const totalCount = ordersByStatusData.reduce((s, r) => s + r.count, 0);
                    const pct = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : "0.0";
                    return (
                      <tr
                        key={d.status}
                        style={{ borderBottom: `1px solid ${cardBorder}` }}
                      >
                        <td className="pl-2 py-2.5 flex items-center gap-2">
                          <span
                            className="shrink-0 rounded-full"
                            style={{ width: 8, height: 8, background: color }}
                          />
                          <span style={{ color: textPrimary, fontWeight: 500 }}>
                            {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                          </span>
                        </td>
                        <td className="text-right pr-2 py-2.5" style={{ color: textPrimary, fontWeight: 600 }}>
                          {d.count}
                        </td>
                        <td className="text-right pr-2 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <div
                              className="rounded-full"
                              style={{
                                width: 60,
                                height: 6,
                                background: darkMode ? "#2d3250" : "#f0f2f8",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, background: color }}
                              />
                            </div>
                            <span style={{ color: textSecondary, fontSize: 11, minWidth: 36, textAlign: "right" }}>
                              {pct}%
                            </span>
                          </div>
                        </td>
                        <td className="text-right pr-2 py-2.5" style={{ color: textSecondary, fontSize: 12 }}>
                          {formatMoney(d.monto)}
                        </td>
                      </tr>
                    );
                  })}
                  {ordersByStatusData.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-6" style={{ color: textSecondary, fontSize: 12 }}>
                        Sin datos de pedidos
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Charts row 4 — Mapa de Guatemala */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-5">
          {/* Mapa coroplético */}
          <ChartCard title="Distribución geográfica de clientes" className="xl:col-span-2">
            {mapReady ? (
              <ReactECharts
                option={guatemalaMapOption}
                style={{ height: 440 }}
                notMerge
              />
            ) : (
              <div
                className="flex items-center justify-center"
                style={{ height: 440, color: textSecondary, fontSize: 13 }}
              >
                {mapLoadError ? `Mapa no disponible: ${mapLoadError}` : "Cargando mapa..."}
              </div>
            )}
          </ChartCard>

          {/* Top departamentos tabla */}
          <div
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
            className="rounded-xl shadow-sm overflow-hidden"
          >
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <span className="block w-1 h-5 rounded-full" style={{ background: PBI_TEAL }} />
              <h2 style={{ color: textPrimary }} className="font-semibold text-sm">
                Top departamentos
              </h2>
            </div>
            <div className="px-3 pb-4 overflow-auto" style={{ maxHeight: 420 }}>
              {depStats
                .filter((d) => d.total_clientes > 0 || d.total_pedidos > 0)
                .sort((a, b) => b.total_clientes - a.total_clientes)
                .map((d, i) => {
                  const maxCli = Math.max(...depStats.map((x) => x.total_clientes), 1);
                  const pct = Math.round((d.total_clientes / maxCli) * 100);
                  const colors = [PBI_BLUE, PBI_TEAL, PBI_ORANGE, PBI_PURPLE, PBI_YELLOW];
                  const color = colors[i % colors.length];
                  const displayName =
                    DEP_NORMALIZE[d.dep_nombre.toUpperCase()] ?? d.dep_nombre;
                  return (
                    <div key={d.dep_id} className="py-2.5 border-b" style={{ borderColor: cardBorder }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin size={12} style={{ color, flexShrink: 0 }} />
                          <span
                            style={{ color: textPrimary, fontSize: 12, fontWeight: 500 }}
                            className="truncate"
                          >
                            {displayName}
                          </span>
                        </div>
                        <span style={{ color: textPrimary, fontSize: 12, fontWeight: 700, flexShrink: 0 }} className="ml-2">
                          {d.total_clientes}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 4,
                          borderRadius: 4,
                          background: darkMode ? "#2d3250" : "#f0f2f8",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span style={{ color: textSecondary, fontSize: 10 }}>
                          {d.total_pedidos} pedido{d.total_pedidos !== 1 ? "s" : ""}
                        </span>
                        <span style={{ color: textSecondary, fontSize: 10 }}>
                          {formatMoney(d.total_ventas)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              {depStats.every((d) => d.total_clientes === 0 && d.total_pedidos === 0) && (
                <p style={{ color: textSecondary, fontSize: 12 }} className="text-center py-8">
                  Sin datos geográficos
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
