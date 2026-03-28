import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, Navigate } from "react-router";
import { Home, TrendingUp, Package, ShoppingCart, Truck, Settings, BarChart, Wallet, LogOut, Moon, Sun, Users, Menu, Building2, Bell, ShieldCheck, LayoutDashboard } from "lucide-react";
import { ProductProvider } from "../context/ProductContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { AlertProvider } from "../context/AlertContext";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { AlertModal } from "./AlertModal";
import { formatCurrency } from "../utils/numberFormat";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  fetchGlobalLowStockThreshold,
  fetchGlobalPaymentReminderDays,
  loadLowStockThreshold,
  LOW_STOCK_THRESHOLD_CHANGED_EVENT,
  loadPaymentReminderDays,
  PAYMENT_REMINDER_DAYS_CHANGED_EVENT,
} from "../utils/paymentReminderSettings";

interface OverdueOrderNotification {
  id: number;
  clientName: string;
  pending: number;
  daysPending: number;
}

interface LowStockNotification {
  id: number;
  name: string;
  stock: number;
  minStock?: number;
}

export function Root() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <RootContent />
      </AlertProvider>
    </ThemeProvider>
  );
}

function RootContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { logout, user, isAuthenticated } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const normalizedRole = (user?.role || "").toLowerCase().trim();
  const isAdmin = normalizedRole === "admin" || normalizedRole.includes("admin");
  const isJefe = normalizedRole === "jefe" || normalizedRole.includes("jefe");
  const isVendedor = normalizedRole === "vendedor" || normalizedRole.includes("vendedor");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [reminderDays, setReminderDays] = useState<number>(() => loadPaymentReminderDays());
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(() => loadLowStockThreshold());
  const [overdueOrders, setOverdueOrders] = useState<OverdueOrderNotification[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<LowStockNotification[]>([]);
  const [outOfStockProducts, setOutOfStockProducts] = useState<LowStockNotification[]>([]);
  const desktopMenuWidthClass = isMenuOpen ? "md:w-64" : "md:w-20";

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const navItems = [
    { path: "/", icon: Home, label: "Inicio" },
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/income", icon: TrendingUp, label: "Ventas" },
    { path: "/orders", icon: ShoppingCart, label: "Pedidos" },
    { path: "/reporteria", icon: BarChart, label: "Reportería" },
    { path: "/pagos-pendientes", icon: Wallet, label: "Pagos Pendientes" },
    { path: "/routes", icon: Truck, label: "Rutas" },
    { path: "/products", icon: Package, label: "Productos" },
    { path: "/clients", icon: Building2, label: "Clientes" },
    { path: "/users", icon: Users, label: "Usuarios" },
    { path: "/settings", icon: Settings, label: "Configuración" },
    { path: "/role-screen-permissions", icon: ShieldCheck, label: "Roles y Pantallas" },
  ];

  const allowedJefePaths = ["/", "/dashboard", "/orders", "/reporteria", "/pagos-pendientes", "/products", "/clients", "/users", "/settings"];
  const allowedVendedorPaths = ["/", "/dashboard", "/income", "/reporteria", "/pagos-pendientes", "/clients", "/settings"];
  const allowedDefaultPaths = ["/", "/dashboard", "/settings"];

  const dbAllowedPaths = Array.isArray(user?.allowedPaths)
    ? user.allowedPaths.map((path) => String(path || "").trim()).filter((path) => path !== "")
    : [];

  const fallbackAllowedPaths = isAdmin
    ? navItems.map((item) => item.path)
    : isJefe
      ? allowedJefePaths
      : isVendedor
        ? allowedVendedorPaths
        : allowedDefaultPaths;

  const allowedPaths = dbAllowedPaths.length > 0
    ? [...new Set(dbAllowedPaths)]
    : fallbackAllowedPaths;

  const visibleNavItems = navItems.filter((item) => allowedPaths.includes(item.path));

  const loadOverdueOrders = async () => {
    setIsNotificationsLoading(true);

    try {
      const response = await fetch("/api/orders");
      if (!response.ok) {
        throw new Error("No se pudieron cargar las alertas");
      }

      const payload = await response.json();
      const now = Date.now();
      const currentUserId = Number(user?.id || 0);

      const normalizedRows = Array.isArray(payload)
        ? payload.map((row: any) => {
            const total = Number(row?.total) || 0;
            const paid = row?.ped_saldo_pag === null || typeof row?.ped_saldo_pag === "undefined"
              ? 0
              : Number(row?.ped_saldo_pag) || 0;
            const pendingRaw = row?.ped_saldo_pen === null || typeof row?.ped_saldo_pen === "undefined"
              ? Math.max(0, total - paid)
              : Number(row?.ped_saldo_pen) || 0;
            const pending = Math.max(0, pendingRaw);
            const createdAt = row?.created_at ? new Date(String(row.created_at)) : null;
            const createdMs = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getTime() : null;
            const daysPending = createdMs === null ? 0 : Math.floor((now - createdMs) / (1000 * 60 * 60 * 24));

            return {
              id: Number(row?.id || 0),
              userId: row?.user_id === null || typeof row?.user_id === "undefined" ? null : Number(row.user_id),
              clientName: String(row?.client_name || "Cliente sin nombre"),
              pending,
              status: String(row?.status || "pendiente").toLowerCase(),
              daysPending,
            };
          })
        : [];

      const filteredByRole = isVendedor
        ? normalizedRows.filter((row) => Number(row.userId || 0) === currentUserId)
        : normalizedRows;

      const notifications = filteredByRole
        .filter((row) => row.id > 0 && row.pending > 0.00001 && row.status !== "cancelado" && row.daysPending >= reminderDays)
        .map((row) => ({
          id: row.id,
          clientName: row.clientName,
          pending: row.pending,
          daysPending: row.daysPending,
        }))
        .sort((a, b) => b.daysPending - a.daysPending || b.id - a.id);

      setOverdueOrders(notifications);
    } catch {
      setOverdueOrders([]);
    } finally {
      setIsNotificationsLoading(false);
    }
  };

  const loadStockNotifications = async () => {
    try {
      const response = await fetch("/api/products");
      if (!response.ok) {
        throw new Error("No se pudieron cargar los productos");
      }

      const products = await response.json();

      const outOfStock = Array.isArray(products)
        ? products
            .filter((product: any) => Number(product?.stock ?? 0) <= 0)
            .map((product: any) => ({
              id: Number(product?.id ?? 0),
              name: String(product?.name || "Producto sin nombre"),
              stock: Number(product?.stock ?? 0),
              minStock: lowStockThreshold,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
        : [];

      const lowStock = Array.isArray(products)
        ? products
            .filter((product: any) => {
              const stock = Number(product?.stock ?? 0);
              return stock <= lowStockThreshold && stock > 0;
            })
            .map((product: any) => ({
              id: Number(product?.id ?? 0),
              name: String(product?.name || "Producto sin nombre"),
              stock: Number(product?.stock ?? 0),
              minStock: lowStockThreshold,
            }))
            .sort((a, b) => a.stock - b.stock)
        : [];

      setOutOfStockProducts(outOfStock);
      setLowStockProducts(lowStock);
    } catch {
      setOutOfStockProducts([]);
      setLowStockProducts([]);
    }
  };

  useEffect(() => {
    loadOverdueOrders();
    loadStockNotifications();
  }, [user?.id, isVendedor, reminderDays, lowStockThreshold]);

  useEffect(() => {
    const handleOrdersChanged = () => {
      loadOverdueOrders();
    };

    const handleProductsChanged = () => {
      loadStockNotifications();
    };

    const handleReminderChanged = () => {
      setReminderDays(loadPaymentReminderDays());
    };

    const handleLowStockThresholdChanged = () => {
      setLowStockThreshold(loadLowStockThreshold());
    };

    window.addEventListener("orders:changed", handleOrdersChanged);
    window.addEventListener("products:changed", handleProductsChanged);
    window.addEventListener(PAYMENT_REMINDER_DAYS_CHANGED_EVENT, handleReminderChanged as EventListener);
    window.addEventListener(LOW_STOCK_THRESHOLD_CHANGED_EVENT, handleLowStockThresholdChanged as EventListener);
    return () => {
      window.removeEventListener("orders:changed", handleOrdersChanged);
      window.removeEventListener("products:changed", handleProductsChanged);
      window.removeEventListener(PAYMENT_REMINDER_DAYS_CHANGED_EVENT, handleReminderChanged as EventListener);
      window.removeEventListener(LOW_STOCK_THRESHOLD_CHANGED_EVENT, handleLowStockThresholdChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    const syncGlobalReminderDays = async () => {
      const days = await fetchGlobalPaymentReminderDays();
      setReminderDays(days);
    };

    syncGlobalReminderDays();
  }, []);

  useEffect(() => {
    const syncGlobalLowStockThreshold = async () => {
      const threshold = await fetchGlobalLowStockThreshold();
      setLowStockThreshold(threshold || DEFAULT_LOW_STOCK_THRESHOLD);
    };

    syncGlobalLowStockThreshold();
  }, []);

  const notificationSummary = useMemo(() => {
    const overdueText = overdueOrders.length === 0 
      ? `No hay clientes con mas de ${reminderDays} dias pendientes.`
      : overdueOrders.length === 1
        ? `1 cliente supero ${reminderDays} dias desde su pedido.`
        : `${overdueOrders.length} clientes superaron ${reminderDays} dias desde su pedido.`;
    
    const stockText = lowStockProducts.length === 0
      ? `No hay productos con stock bajo (minimo ${lowStockThreshold}).`
      : lowStockProducts.length === 1
        ? `1 producto con stock bajo (minimo ${lowStockThreshold}).`
        : `${lowStockProducts.length} productos con stock bajo (minimo ${lowStockThreshold}).`;
    
    return { overdueText, stockText };
  }, [overdueOrders.length, reminderDays, lowStockProducts.length, lowStockThreshold]);

  if (!allowedPaths.includes(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <ProductProvider>
      <div className={`min-h-screen flex ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {isMenuOpen && (
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 -translate-x-full border-r transition-transform duration-300 md:sticky md:top-0 md:h-screen md:z-auto md:translate-x-0 md:transition-all md:duration-300 ${desktopMenuWidthClass} ${
            isMenuOpen ? 'translate-x-0' : ''
          } ${
            darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          <div className={`h-16 flex items-center ${isMenuOpen ? 'justify-between px-3' : 'justify-center'} border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            {isMenuOpen && (
              <div className="flex items-center gap-2 min-w-0">
                <Package className={`size-5 shrink-0 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>Gestor de Tienda</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className={`rounded-md p-2 transition-colors ${darkMode ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'}`}
              aria-label="Abrir o cerrar menú"
            >
              <Menu className="size-5" />
            </button>
          </div>

          <div className={`mx-2 mt-3 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'} ${isMenuOpen ? 'p-3' : 'p-2 flex justify-center'}`}>
            <div className={`rounded-full ${isMenuOpen ? 'size-12' : 'size-10'} flex items-center justify-center font-semibold ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gray-200 text-gray-700'}`}>
              {String(user?.displayName || user?.username || 'U').trim().charAt(0).toUpperCase()}
            </div>
            {isMenuOpen && (
              <div className="mt-2 min-w-0">
                <p className={`text-sm font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{user?.displayName || user?.username}</p>
                <p className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{user?.role || 'usuario'}</p>
              </div>
            )}
          </div>

          <nav className="mt-2 px-2 pb-3 space-y-1 overflow-y-auto">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    navigate(item.path);
                    if (typeof window !== "undefined" && window.innerWidth < 768) {
                      setIsMenuOpen(false);
                    }
                  }}
                  title={isMenuOpen ? undefined : item.label}
                  className={`w-full rounded-lg py-2.5 text-sm transition-colors flex items-center ${
                    isMenuOpen ? 'px-3 gap-3 justify-start' : 'px-2 justify-center'
                  } ${
                    isActive
                      ? darkMode
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-900'
                      : darkMode
                        ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="size-5 shrink-0" />
                  {isMenuOpen && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className={`h-16 border-b px-3 sm:px-4 flex items-center justify-between sticky top-0 z-40 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="min-w-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className={`rounded-md p-2 transition-colors md:hidden ${darkMode ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'}`}
                aria-label="Abrir menú"
              >
                <Menu className="size-5" />
              </button>
              <p className={`text-sm truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Bienvenido, {user?.displayName || user?.username}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((prev) => !prev)}
                  className={`p-2 rounded-lg transition-colors relative ${
                    darkMode
                      ? "bg-gray-700 text-amber-300 hover:bg-gray-600"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                  aria-label="Abrir notificaciones"
                  title="Notificaciones de pagos pendientes"
                >
                  <Bell className="size-5" />
                  {(overdueOrders.length + lowStockProducts.length + outOfStockProducts.length) > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] leading-5 font-semibold text-center">
                      {(overdueOrders.length + lowStockProducts.length + outOfStockProducts.length) > 99
                        ? "99+"
                        : (overdueOrders.length + lowStockProducts.length + outOfStockProducts.length)}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div
                    className={`fixed left-2 right-2 top-16 mt-0 max-h-[70vh] overflow-auto rounded-lg border shadow-lg z-50 md:absolute md:left-auto md:right-0 md:top-auto md:mt-2 md:w-[340px] md:max-w-[340px] ${
                      darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
                    }`}
                  >
                    <div className={`px-4 py-3 border-b ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
                      <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>Centro de Notificaciones</p>
                    </div>

                    <div className="p-2">
                      {isNotificationsLoading ? (
                        <p className={`px-2 py-3 text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Cargando notificaciones...</p>
                      ) : (
                        <>
                          {/* Overdue Orders Section */}
                          {overdueOrders.length > 0 && (
                            <div className="mb-4">
                              <p className={`text-xs font-semibold px-2 py-2 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                                Pedidos Vencidos ({overdueOrders.length})
                              </p>
                              {overdueOrders.map((entry) => (
                                <div
                                  key={`order-${entry.id}`}
                                  className={`rounded-md px-3 py-2 mb-1 ${darkMode ? "bg-red-900 bg-opacity-30 border border-red-800" : "bg-red-50 border border-red-200"}`}
                                >
                                  <p className={`text-sm font-medium ${darkMode ? "text-red-200" : "text-red-900"}`}>
                                    Pedido #{entry.id} - {entry.clientName}
                                  </p>
                                  <p className={`text-xs ${darkMode ? "text-red-300" : "text-red-700"}`}>
                                    Lleva {entry.daysPending} días pendiente. Saldo: {formatCurrency(entry.pending)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Low Stock Products Section */}
                          {outOfStockProducts.length > 0 && (
                            <div className="mb-4">
                              <p className={`text-xs font-semibold px-2 py-2 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                                Productos Sin Stock ({outOfStockProducts.length})
                              </p>
                              {outOfStockProducts.map((product) => (
                                <div
                                  key={`out-stock-product-${product.id}`}
                                  className={`rounded-md px-3 py-2 mb-1 ${darkMode ? "bg-red-900 bg-opacity-30 border border-red-800" : "bg-red-50 border border-red-200"}`}
                                >
                                  <p className={`text-sm font-medium ${darkMode ? "text-red-200" : "text-red-900"}`}>
                                    {product.name}
                                  </p>
                                  <p className={`text-xs ${darkMode ? "text-red-300" : "text-red-700"}`}>
                                    Stock: 0 unid. Reabastecer cuanto antes.
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Low Stock Products Section */}
                          {lowStockProducts.length > 0 && (
                            <div className="mb-2">
                              <p className={`text-xs font-semibold px-2 py-2 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                                Productos con Stock Bajo ({lowStockProducts.length})
                              </p>
                              {lowStockProducts.map((product) => (
                                <div
                                  key={`product-${product.id}`}
                                  className={`rounded-md px-3 py-2 mb-1 ${darkMode ? "bg-yellow-900 bg-opacity-30 border border-yellow-800" : "bg-yellow-50 border border-yellow-200"}`}
                                >
                                  <p className={`text-sm font-medium ${darkMode ? "text-yellow-200" : "text-yellow-900"}`}>
                                    {product.name}
                                  </p>
                                  <p className={`text-xs ${darkMode ? "text-yellow-300" : "text-yellow-700"}`}>
                                    Stock: {product.stock} unid. (Mínimo: {product.minStock})
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}

                          {overdueOrders.length === 0 && lowStockProducts.length === 0 && outOfStockProducts.length === 0 && (
                            <p className={`px-2 py-3 text-sm text-center ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                              ✓ Sin notificaciones importantes
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={toggleDarkMode}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                aria-label="Cambiar tema"
              >
                {darkMode ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="flex items-center gap-2"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Salir</span>
              </Button>
            </div>
          </header>

          <main className={`flex-1 min-w-0 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <Outlet />
          </main>
        </div>
        <AlertModal />
      </div>
    </ProductProvider>
  );
}