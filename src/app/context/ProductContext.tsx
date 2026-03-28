import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

export interface Product {
  id: string;
  name: string;
  price: number;
  purchasePrice?: number;
  stock: number;
  category: string;
  barcode?: string;
  observations?: string;
  status?: string;
  statusId?: number;
}

export type ProductStatusFilter = "activos" | "inhabilitados" | "todos";

interface ProductContextType {
  products: Product[];
  isLoading: boolean;
  error: string;
  addProduct: (product: Omit<Product, "id">) => Promise<Product | null>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  setProductStatus: (id: string, status: "activo" | "inhabilitado") => Promise<void>;
  getProductByName: (name: string) => Product | undefined;
  getProductByBarcode: (barcode: string) => Product | undefined;
  refreshProducts: (statusFilter?: ProductStatusFilter) => Promise<void>;
}

interface StockChangedEntry {
  productId: number;
  previousStock: number;
  newStock: number;
  deltaQuantity: number;
}

interface StockChangedPayload {
  orderId: number;
  action: string;
  actorUserId: number | null;
  emittedAt: string;
  changes: StockChangedEntry[];
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

const notifyWindow = (eventName: string, detail?: unknown) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(eventName, { detail }));
};

const getRealtimeServerUrl = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const { hostname, port, origin } = window.location;
  const isLocalFrontend = hostname === "localhost" || hostname === "127.0.0.1";

  if (isLocalFrontend && port !== "3001") {
    return "http://localhost:3001";
  }

  return origin;
};

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentStatusFilter, setCurrentStatusFilter] = useState<ProductStatusFilter>("activos");
  const refreshProductsRef = useRef<((statusFilter?: ProductStatusFilter) => Promise<void>) | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const API_BASE = "";

  const apiUrl = (path: string) => `${API_BASE}${path}`;

  const getAuthHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    try {
      const rawUser = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (!rawUser) return headers;

      const parsedUser = JSON.parse(rawUser);
      const userId = Number(parsedUser?.id || 0);
      if (Number.isInteger(userId) && userId > 0) {
        headers["x-user-id"] = String(userId);
      }
    } catch {
      // Ignore user parsing errors and continue without actor header.
    }

    return headers;
  };

  const toReadableError = (err: unknown, fallback: string) => {
    if (err instanceof TypeError) {
      return "No se pudo conectar al backend. Verifica que el servidor en puerto 3001 esté encendido.";
    }
    if (err instanceof Error) {
      return err.message;
    }
    return fallback;
  };

  const mapApiProductToProduct = (product: any): Product => ({
    id: String(product.id),
    name: product.name,
    price: Number(product.price) || 0,
    purchasePrice:
      typeof product.purchasePrice === "number" || typeof product.purchasePrice === "string"
        ? Number(product.purchasePrice)
        : undefined,
    stock: Number(product.stock) || 0,
    category: product.categoria || product.description || "General",
    barcode: product.barcode || undefined,
    observations: product.observations || undefined,
    status: product.estado || undefined,
    statusId:
      typeof product.est_pro_id === "number" || typeof product.est_pro_id === "string"
        ? Number(product.est_pro_id)
        : undefined,
  });

  const refreshProducts = async (statusFilter?: ProductStatusFilter) => {
    setIsLoading(true);
    setError("");
    const activeFilter = statusFilter ?? currentStatusFilter;
    if (statusFilter) {
      setCurrentStatusFilter(statusFilter);
    }

    try {
      const response = await fetch(apiUrl(`/api/products?status=${activeFilter}`));
      if (!response.ok) {
        throw new Error("No se pudieron cargar los productos");
      }

      const data = await response.json();
      setProducts(Array.isArray(data) ? data.map(mapApiProductToProduct) : []);
    } catch (err) {
      setError(toReadableError(err, "Error cargando productos"));
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProductsRef.current = refreshProducts;
  }, [refreshProducts]);

  useEffect(() => {
    refreshProducts("activos");
  }, []);

  useEffect(() => {
    const realtimeUrl = getRealtimeServerUrl();
    if (!realtimeUrl) {
      return;
    }

    const socket = io(realtimeUrl, {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    const handleStockChanged = (payload: StockChangedPayload) => {
      const changes = Array.isArray(payload?.changes) ? payload.changes : [];
      if (changes.length === 0) {
        return;
      }

      setProducts((prev) => {
        let changed = false;

        const next = prev.map((product) => {
          const match = changes.find((entry) => String(entry.productId) === String(product.id));
          if (!match) {
            return product;
          }

          const nextStock = Number(match.newStock || 0);
          if (product.stock === nextStock) {
            return product;
          }

          changed = true;
          return { ...product, stock: nextStock };
        });

        return changed ? next : prev;
      });

      notifyWindow("products:changed", payload);
    };

    const handleOrderEvent = (payload: unknown) => {
      notifyWindow("orders:changed", payload);
    };

    const handleReconnect = () => {
      void refreshProductsRef.current?.();
      notifyWindow("orders:changed", { source: "socket:reconnect" });
    };

    socket.on("stock:changed", handleStockChanged);
    socket.on("order:created", handleOrderEvent);
    socket.on("order:updated", handleOrderEvent);
    socket.on("order:cancelled", handleOrderEvent);
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("stock:changed", handleStockChanged);
      socket.off("order:created", handleOrderEvent);
      socket.off("order:updated", handleOrderEvent);
      socket.off("order:cancelled", handleOrderEvent);
      socket.off("connect", handleReconnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const addProduct = async (product: Omit<Product, "id">): Promise<Product | null> => {
    setError("");
    try {
      const response = await fetch(apiUrl("/api/products"), {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: product.name,
          price: product.price,
          purchasePrice: product.purchasePrice,
          stock: product.stock,
          categoria: product.category,
          barcode: product.barcode,
          observations: product.observations,
        }),
      });

      if (!response.ok) {
        let backendMessage = "No se pudo guardar el producto";
        try {
          const payload = await response.json();
          if (payload?.error) {
            backendMessage = String(payload.error);
          }
        } catch {
          // ignore JSON parse errors and keep fallback message
        }
        throw new Error(backendMessage);
      }

      const created = await response.json();
      const newProduct = mapApiProductToProduct(created);
      setProducts((prev) => [newProduct, ...prev]);
      return newProduct;
    } catch (err) {
      setError(toReadableError(err, "Error guardando producto"));
      return null;
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    setError("");
    const current = products.find((p) => p.id === id);
    if (!current) {
      return;
    }

    const payload = {
      name: updates.name ?? current.name,
      price: updates.price ?? current.price,
      purchasePrice: updates.purchasePrice ?? current.purchasePrice,
      stock: updates.stock ?? current.stock,
      categoria: updates.category ?? current.category,
      barcode: updates.barcode ?? current.barcode,
      observations: updates.observations ?? current.observations,
    };

    try {
      const response = await fetch(apiUrl(`/api/products/${id}`), {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let backendMessage = "No se pudo actualizar el producto";
        try {
          const payload = await response.json();
          if (payload?.error) {
            backendMessage = String(payload.error);
          }
        } catch {
          // ignore JSON parse errors and keep fallback message
        }
        throw new Error(backendMessage);
      }

      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    } catch (err) {
      setError(toReadableError(err, "Error actualizando producto"));
    }
  };

  const deleteProduct = async (id: string) => {
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/products/${id}`), {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar el producto");
      }

      await refreshProducts(currentStatusFilter);
    } catch (err) {
      setError(toReadableError(err, "Error eliminando producto"));
    }
  };

  const setProductStatus = async (id: string, status: "activo" | "inhabilitado") => {
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/products/${id}/status`), {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("No se pudo actualizar el estado del producto");
      }

      await refreshProducts(currentStatusFilter);
    } catch (err) {
      setError(toReadableError(err, "Error actualizando estado del producto"));
    }
  };

  const getProductByName = (name: string) => {
    return products.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
  };

  const getProductByBarcode = (barcode: string) => {
    return products.find((p) => p.barcode === barcode);
  };

  return (
    <ProductContext.Provider
      value={{
        products,
        isLoading,
        error,
        addProduct,
        updateProduct,
        deleteProduct,
        setProductStatus,
        getProductByName,
        getProductByBarcode,
        refreshProducts,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error("useProducts must be used within a ProductProvider");
  }
  return context;
}
