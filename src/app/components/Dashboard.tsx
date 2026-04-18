import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { TrendingUp, Package, DollarSign, ShoppingCart, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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

interface ChartPoint {
  key: string;
  label: string;
  totalAmount: number;
  totalOrders: number;
}

export function Dashboard() {
  const { darkMode } = useTheme();
  const { user } = useAuth();
  const [orders, setOrders] = useState<DashboardOrderRow[]>([]);
  const [inventoryProductCount, setInventoryProductCount] = useState(0);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");
  const [chartPeriod, setChartPeriod] = useState<"week" | "month">("week");

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
      minimumFractionDigits: 2,
    }).format(value || 0);

  const normalizedRole = (user?.role || "").toLowerCase().trim();
  const isAdmin = normalizedRole === "admin" || normalizedRole.includes("admin");
  const isJefe = normalizedRole === "jefe" || normalizedRole.includes("jefe");
  const isVendedor = normalizedRole === "vendedor" || normalizedRole.includes("vendedor");

  useEffect(() => {
    const loadOrdersForChart = async () => {
      setIsChartLoading(true);
      setChartError("");

      try {
        const response = await fetch("/api/orders?includeCancelled=1");
        if (!response.ok) {
          throw new Error("No se pudo cargar la información para la gráfica");
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
        setChartError(err instanceof Error ? err.message : "No se pudo cargar la gráfica");
        setOrders([]);
      } finally {
        setIsChartLoading(false);
      }
    };

    loadOrdersForChart();
  }, []);

  useEffect(() => {
    const loadProductsCount = async () => {
      try {
        const response = await fetch("/api/products?status=todos");
        if (!response.ok) {
          throw new Error("No se pudo cargar el total de productos");
        }

        const payload = await response.json();
        setInventoryProductCount(Array.isArray(payload) ? payload.length : 0);
      } catch {
        setInventoryProductCount(0);
      }
    };

    loadProductsCount();
  }, []);

  const allowedJefePaths = ["/", "/orders", "/reporteria", "/products", "/clients", "/users", "/settings"];
  const allowedVendedorPaths = ["/", "/income", "/reporteria", "/clients", "/settings"];
  const allowedDefaultPaths = ["/", "/settings"];

  const allowedPaths = isAdmin
    ? ["/", "/income", "/orders", "/reporteria", "/routes", "/products", "/clients", "/users", "/settings"]
    : isJefe
      ? allowedJefePaths
      : isVendedor
        ? allowedVendedorPaths
        : allowedDefaultPaths;

  const currentMonthOrders = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentUserId = Number(user?.id || 0);

    return orders.filter((row) => {
      const normalizedStatus = String(row.status || "").toLowerCase();
      if (normalizedStatus.includes("cancel")) {
        return false;
      }

      if (!row.created_at) {
        return false;
      }

      const createdAt = new Date(row.created_at);
      if (Number.isNaN(createdAt.getTime())) {
        return false;
      }

      const isCurrentMonth = createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear;
      if (!isCurrentMonth) {
        return false;
      }

      if (isVendedor && !isAdmin && !isJefe) {
        return Number(row.user_id || 0) === currentUserId;
      }

      return true;
    });
  }, [orders, isAdmin, isJefe, isVendedor, user?.id]);

  const dashboardStats = useMemo(() => {
    const visibleOrders = currentMonthOrders;

    const totalSalesAmount = visibleOrders.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const totalOrdersCount = visibleOrders.length;

    const paidOrdersAmount = visibleOrders.reduce((sum, row) => {
      const status = String(row.status || "").toLowerCase();
      const isPaidStatus = status.includes("pag");
      const isPaidByBalance = Number(row.ped_saldo_pen || 0) <= 0 && Number(row.ped_saldo_pag || 0) > 0;
      return isPaidStatus || isPaidByBalance ? sum + Number(row.total || 0) : sum;
    }, 0);

    const uniqueProducts = new Set<string>();
    for (const row of visibleOrders) {
      const names = String(row.product_names || "")
        .split("||")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

      for (const name of names) {
        uniqueProducts.add(name.toUpperCase());
      }
    }

    if (isVendedor && !isAdmin && !isJefe) {
      return [
        {
          title: "Ventas Totales",
          value: formatMoney(totalSalesAmount),
          icon: DollarSign,
          color: "text-green-600",
          bgColor: "bg-green-50",
        },
        {
          title: "Pedidos Realizados",
          value: String(totalOrdersCount),
          icon: ShoppingCart,
          color: "text-blue-600",
          bgColor: "bg-blue-50",
        },
        {
          title: "Pedidos Pagados Totales",
          value: formatMoney(paidOrdersAmount),
          icon: DollarSign,
          color: "text-purple-600",
          bgColor: "bg-purple-50",
        },
        {
          title: "Productos Pedidos",
          value: String(uniqueProducts.size),
          icon: Package,
          color: "text-orange-600",
          bgColor: "bg-orange-50",
        },
      ];
    }

    return [
      {
        title: "Ventas Totales",
        value: formatMoney(totalSalesAmount),
        icon: DollarSign,
        color: "text-green-600",
        bgColor: "bg-green-50",
      },
      {
        title: "Pedidos",
        value: String(totalOrdersCount),
        icon: ShoppingCart,
        color: "text-blue-600",
        bgColor: "bg-blue-50",
      },
      {
        title: "Pedidos Pagados Totales",
        value: formatMoney(paidOrdersAmount),
        icon: DollarSign,
        color: "text-purple-600",
        bgColor: "bg-purple-50",
      },
      {
        title: "Productos",
        value: String(inventoryProductCount),
        icon: Package,
        color: "text-orange-600",
        bgColor: "bg-orange-50",
      },
    ];
  }, [currentMonthOrders, inventoryProductCount, isAdmin, isJefe, isVendedor]);

  const quickActions = [
    {
      title: "Ventas",
      description: "Registra ventas con escaneo de código de barras",
      link: "/income",
      icon: TrendingUp,
      color: "text-green-600",
    },
    {
      title: "Pedidos",
      description: "Gestiona los pedidos pendientes y enviados",
      link: "/orders",
      icon: ShoppingCart,
      color: "text-orange-600",
    },
    {
      title: "Productos",
      description: "Gestiona tu inventario y productos",
      link: "/products",
      icon: Package,
      color: "text-purple-600",
    },
    {
      title: "Configuración",
      description: "Configura las preferencias de tu tienda",
      link: "/settings",
      icon: SettingsIcon,
      color: "text-gray-600",
    },
  ];

  const visibleQuickActions = quickActions.filter((action) => allowedPaths.includes(action.link));

  const chartData = useMemo(() => {
    const visibleOrders = currentMonthOrders;

    const getWeekStart = (date: Date) => {
      const copy = new Date(date);
      copy.setHours(0, 0, 0, 0);
      const day = copy.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      copy.setDate(copy.getDate() + diff);
      return copy;
    };

    const getWeekLabel = (weekStart: Date) => {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const start = weekStart.toLocaleDateString("es-GT", { day: "2-digit", month: "2-digit" });
      const end = weekEnd.toLocaleDateString("es-GT", { day: "2-digit", month: "2-digit" });
      return `${start} - ${end}`;
    };

    const grouped = new Map<string, ChartPoint>();

    for (const row of visibleOrders) {
      if (!row.created_at) continue;
      const date = new Date(row.created_at);
      if (Number.isNaN(date.getTime())) continue;

      let key = "";
      let label = "";

      if (chartPeriod === "week") {
        const weekStart = getWeekStart(date);
        key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
        label = getWeekLabel(weekStart);
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        label = date.toLocaleDateString("es-GT", { month: "short", year: "numeric" });
      }

      const current = grouped.get(key) || {
        key,
        label,
        totalAmount: 0,
        totalOrders: 0,
      };

      current.totalAmount += Number(row.total || 0);
      current.totalOrders += 1;
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-12);
  }, [currentMonthOrders, chartPeriod]);

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8 sm:mb-10">
        <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? 'text-white' : ''}`}>Inicio</h1>
        <p className={`text-sm sm:text-base ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Vista general de inicio con resumen acumulado del mes actual.</p>
      </div>

      {/* Quick Actions - Moved to top */}
      <div className="mb-12 sm:mb-14">
        <h2 className={`text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 ${darkMode ? 'text-white' : ''}`}>Acciones Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {visibleQuickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.title} to={action.link}>
                <Card className={`hover:shadow-lg transition-shadow cursor-pointer h-full ${darkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : ''}`}>
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className={`size-6 ${action.color}`} />
                      <CardTitle className={`text-lg ${darkMode ? 'text-white' : ''}`}>{action.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>{action.description}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
        {dashboardStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
              <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{stat.title}</p>
                    <p className={`text-2xl font-bold ${darkMode ? 'text-white' : ''}`}>{stat.value}</p>
                  </div>
                  <div className={`${stat.bgColor} p-3 rounded-lg`}>
                    <Icon className={`size-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Totals Chart */}
      <div className="mb-8 sm:mb-12">
        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className={darkMode ? 'text-white' : ''}>Montos Totales y Pedidos Totales</CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={chartPeriod === "week" ? "default" : "outline"}
                  onClick={() => setChartPeriod("week")}
                >
                  Semana
                </Button>
                <Button
                  size="sm"
                  variant={chartPeriod === "month" ? "default" : "outline"}
                  onClick={() => setChartPeriod("month")}
                >
                  Mes
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isChartLoading && (
              <p className={`text-sm mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                Cargando grafica...
              </p>
            )}
            {!!chartError && <p className="text-sm mb-3 text-red-600">{chartError}</p>}
            <div className="w-full overflow-x-auto">
              <div className="min-w-[640px]">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
                    <XAxis dataKey="label" stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                    <YAxis yAxisId="amount" stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                    <YAxis yAxisId="orders" orientation="right" stroke={darkMode ? '#9ca3af' : '#6b7280'} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: darkMode ? '#1f2937' : '#fff',
                        border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                        color: darkMode ? '#f3f4f6' : '#000',
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === "Montos Totales") {
                          return [formatMoney(Number(value || 0)), name];
                        }
                        return [Number(value || 0), name];
                      }}
                    />
                    <Legend wrapperStyle={{ color: darkMode ? '#d1d5db' : '#000' }} />
                    <Bar yAxisId="amount" dataKey="totalAmount" fill="#10b981" name="Montos Totales" />
                    <Bar yAxisId="orders" dataKey="totalOrders" fill="#3b82f6" name="Pedidos Totales" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}