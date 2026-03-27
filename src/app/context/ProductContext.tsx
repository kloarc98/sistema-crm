import { createContext, useContext, useEffect, useState, ReactNode } from "react";

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

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentStatusFilter, setCurrentStatusFilter] = useState<ProductStatusFilter>("activos");

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
    refreshProducts("activos");
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
        throw new Error("No se pudo guardar el producto");
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
        throw new Error("No se pudo actualizar el producto");
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
