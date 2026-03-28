import { useEffect, useMemo, useState } from "react";
import { Plus, Package, Trash2, Search, Pencil, Filter, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { useTheme } from "../context/ThemeContext";
import { useAlert } from "../context/AlertContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { useProducts, type ProductStatusFilter } from "../context/ProductContext";
import { formatCurrency, formatNumber } from "../utils/numberFormat";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  fetchGlobalLowStockThreshold,
  loadLowStockThreshold,
  LOW_STOCK_THRESHOLD_CHANGED_EVENT,
} from "../utils/paymentReminderSettings";

interface DohRow {
  id: number;
  name: string;
  category: string;
  stock: number;
  sold: number;
  dailyAvg: number;
  doh: number | null;
}

interface ProductMovement {
  id: number;
  user_id: number | null;
  user_name: string;
  type: string;
  description: string;
  previous_stock: number | null;
  new_stock: number | null;
  previous_price: number | null;
  new_price: number | null;
  created_at: string | null;
}

export function Products() {
  const { products, isLoading, error, addProduct, updateProduct, deleteProduct, setProductStatus, refreshProducts } = useProducts();
  const { darkMode } = useTheme();
  const { addAlert } = useAlert();

  const [selectedProductId, setSelectedProductId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [stock, setStock] = useState("");
  const [productSelectorText, setProductSelectorText] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [observations, setObservations] = useState("");
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [isCategorySearchOpen, setIsCategorySearchOpen] = useState(false);
  const [isEditCategorySearchOpen, setIsEditCategorySearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("none");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("activos");
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(() => loadLowStockThreshold());

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<{
    id: string;
    name: string;
    price: string;
    purchasePrice?: string;
    stock: string;
    category: string;
    barcode: string;
    observations: string;
  } | null>(null);

  // Delete confirmation dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);

  // Product details dialog state
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<any>(null);
  const [productMovements, setProductMovements] = useState<ProductMovement[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [activeTab, setActiveTab] = useState("inventario");
  const [dohDays, setDohDays] = useState(30);
  const [dohData, setDohData] = useState<DohRow[]>([]);
  const [dohLoading, setDohLoading] = useState(false);
  const [dohSearch, setDohSearch] = useState("");

  const existingCategories = useMemo(() => {
    return Array.from(
      new Set(
        products
          .map((p) => String(p.category || "").trim().toUpperCase())
          .filter((c) => c.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  const filteredProductOptions = useMemo(() => {
    const query = productSelectorText.trim().toLowerCase();
    const base = [...products].sort((a, b) => a.name.localeCompare(b.name, "es"));
    const filtered = query
      ? base.filter((p) => String(p.name || "").toLowerCase().includes(query))
      : base;

    return [
      { id: "__NEW__", label: "+ NUEVO PRODUCTO", helper: "Crear producto nuevo" },
      ...filtered.slice(0, 12).map((p) => ({
        id: p.id,
        label: p.name,
        helper: `Stock: ${formatNumber(p.stock)} • ${formatCurrency(p.price)}`,
      })),
    ];
  }, [productSelectorText, products]);

  const filteredCategoryOptions = useMemo(() => {
    const query = category.trim().toLowerCase();
    const filtered = query
      ? existingCategories.filter((c) => c.toLowerCase().includes(query))
      : existingCategories;
    return filtered.slice(0, 12);
  }, [category, existingCategories]);

  const filteredEditCategoryOptions = useMemo(() => {
    const query = (editingProduct?.category || "").trim().toLowerCase();
    const filtered = query
      ? existingCategories.filter((c) => c.toLowerCase().includes(query))
      : existingCategories;
    return filtered.slice(0, 12);
  }, [editingProduct?.category, existingCategories]);

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "—";
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return String(iso);
    return parsed.toLocaleString();
  };

  const getMovementTypeLabel = (type: string) => {
    const normalized = String(type || "").toLowerCase();
    if (normalized === "creacion") return "Creación";
    if (normalized === "actualizacion") return "Actualización";
    if (normalized === "ajuste_stock") return "Ajuste de Stock";
    if (normalized === "inhabilitacion") return "Inhabilitación";
    if (normalized === "reactivacion") return "Reactivación";
    return type || "Movimiento";
  };

  const openDetailsWithMovements = async (product: any) => {
    setSelectedProductForDetails(product);
    setIsDetailsDialogOpen(true);
    setIsLoadingMovements(true);
    setProductMovements([]);

    try {
      const response = await fetch(`/api/products/${product.id}/movements`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el historial de movimientos");
      }

      const payload = await response.json();
      const parsedMovements: ProductMovement[] = Array.isArray(payload)
        ? payload.map((row: any) => ({
            id: Number(row?.id ?? 0),
            user_id: row?.user_id === null || typeof row?.user_id === "undefined" ? null : Number(row.user_id),
            user_name: String(row?.user_name || ""),
            type: String(row?.type || ""),
            description: String(row?.description || ""),
            previous_stock:
              row?.previous_stock === null || typeof row?.previous_stock === "undefined"
                ? null
                : Number(row.previous_stock),
            new_stock:
              row?.new_stock === null || typeof row?.new_stock === "undefined"
                ? null
                : Number(row.new_stock),
            previous_price:
              row?.previous_price === null || typeof row?.previous_price === "undefined"
                ? null
                : Number(row.previous_price),
            new_price:
              row?.new_price === null || typeof row?.new_price === "undefined"
                ? null
                : Number(row.new_price),
            created_at: row?.created_at ?? null,
          }))
        : [];

      parsedMovements.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateB !== dateA) {
          return dateB - dateA;
        }
        return Number(b.id || 0) - Number(a.id || 0);
      });

      setProductMovements(parsedMovements);
    } catch (err) {
      setProductMovements([]);
      addAlert(err instanceof Error ? err.message : "No se pudo cargar el historial de movimientos", "error");
    } finally {
      setIsLoadingMovements(false);
    }
  };

  const handleProductSelect = (productId: string) => {
    if (productId === "new") {
      setSelectedProductId("new");
      setProductSelectorText("+ NUEVO PRODUCTO");
      setIsProductSearchOpen(false);
      setName("");
      setPrice("");
      setStock("");
      setCategory("");
      setBarcode("");
      setObservations("");
    } else {
      setSelectedProductId(productId);
      setIsProductSearchOpen(false);
      const product = products.find((p) => p.id === productId);
      if (product) {
        setProductSelectorText(product.name);
        setName(product.name);
        setPrice(product.price.toString());
        setPurchasePrice((product.purchasePrice || 0).toString());
        setCategory(String(product.category || "").toUpperCase());
        setBarcode(product.barcode || "");
        setObservations((product as any).observations || "");
      }
      setStock("");
    }
  };

  const handleProductSelectorChange = (value: string) => {
    setProductSelectorText(value);
    setIsProductSearchOpen(true);
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      setSelectedProductId("");
      return;
    }

    if (normalized === "+ nuevo producto") {
      handleProductSelect("new");
      return;
    }

    const exact = products.find(
      (p) => String(p.name || "").trim().toLowerCase() === normalized
    );

    if (exact) {
      handleProductSelect(exact.id);
      return;
    }

    setSelectedProductId("");
  };

  const handleProductSuggestionSelect = (optionId: string) => {
    if (optionId === "__NEW__") {
      handleProductSelect("new");
      return;
    }

    handleProductSelect(optionId);
  };

  const handleCategorySuggestionSelect = (value: string) => {
    setCategory(value.toUpperCase());
    setIsCategorySearchOpen(false);
  };

  const handleEditCategorySuggestionSelect = (value: string) => {
    if (!editingProduct) return;
    setEditingProduct({ ...editingProduct, category: value.toUpperCase() });
    setIsEditCategorySearchOpen(false);
  };

  const handleAddProduct = async () => {
    if (isSubmittingProduct) {
      return;
    }

    if (!name || !stock || !category) {
      addAlert("Nombre, stock y categoría son requeridos", "error");
      return;
    }

    setIsSubmittingProduct(true);

    try {

      if (selectedProductId && selectedProductId !== "new") {
        // Update existing product - add to stock
        const existingProduct = products.find((p) => p.id === selectedProductId);
        if (existingProduct) {
          await updateProduct(selectedProductId, {
            stock: existingProduct.stock + parseInt(stock),
            price: price ? parseFloat(price) : existingProduct.price,
            purchasePrice: purchasePrice ? parseFloat(purchasePrice) : existingProduct.purchasePrice,
            barcode: barcode || existingProduct.barcode,
            observations: observations || (existingProduct as any).observations,
          });
          addAlert("✓ Producto actualizado correctamente", "success");
        }
      } else {
        // Add new product
        if (!price || !purchasePrice) {
          addAlert("Precio y precio de compra son requeridos para crear producto", "error");
          return;
        }

        const normalizedCategory = category.trim().toUpperCase();
        if (!normalizedCategory) {
          addAlert("La categoría es requerida", "error");
          return;
        }

        const normalizedName = name.trim().toLowerCase();
        const normalizedBarcode = barcode.trim().toLowerCase();

        const duplicateByName = products.find(
          (p) => String(p.name || "").trim().toLowerCase() === normalizedName
        );

        if (duplicateByName) {
          addAlert(
            `⚠ Ya existe ese producto (${duplicateByName.name}). Verifica el nombre antes de crear.`,
            "error"
          );
          return;
        }

        if (normalizedBarcode) {
          const duplicateByBarcode = products.find(
            (p) => String(p.barcode || "").trim().toLowerCase() === normalizedBarcode
          );

          if (duplicateByBarcode) {
            addAlert(
              `⚠ El código de barras ya existe en ${duplicateByBarcode.name}.`,
              "error"
            );
            return;
          }
        }

        const created = await addProduct({
          name,
          price: parseFloat(price),
          purchasePrice: parseFloat(purchasePrice),
          stock: parseInt(stock),
          category: normalizedCategory,
          barcode: barcode || undefined,
          observations: observations || undefined,
        });
        if (!created) {
          addAlert("No se pudo crear el producto", "error");
          return;
        }
        addAlert("✓ Producto creado correctamente", "success");
      }

      setSelectedProductId("");
      setName("");
      setPrice("");
      setPurchasePrice("");
      setStock("");
      setCategory("");
      setProductSelectorText("");
      setIsCategorySearchOpen(false);
      setBarcode("");
      setObservations("");
    } catch (err) {
      addAlert(err instanceof Error ? err.message : "No se pudo guardar el producto", "error");
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const handleDelete = (id: string) => {
    setProductToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleReactivate = async (id: string) => {
    await setProductStatus(id, "activo");
    addAlert("✓ Producto reactivado correctamente", "success");
  };

  const handleStatusFilterChange = async (value: string) => {
    const nextFilter = value as ProductStatusFilter;
    setStatusFilter(nextFilter);
    await refreshProducts(nextFilter);
  };

  const handleConfirmDelete = async () => {
    if (productToDelete) {
      await deleteProduct(productToDelete);
      setIsDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    addAlert("✓ Producto eliminado correctamente", "success");
    setIsDeleteDialogOpen(false);
    setProductToDelete(null);
  };

  const handleEditClick = (product: any) => {
    const normalizedCategory = String(product.category || "").trim().toUpperCase();
    setEditingProduct({
      id: product.id,
      name: product.name,
      price: product.price.toString(),
      purchasePrice: (product.purchasePrice || 0).toString(),
      stock: product.stock.toString(),
      category: normalizedCategory,
      barcode: product.barcode || "",
      observations: product.observations || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingProduct) {
      addAlert("No hay producto seleccionado para editar", "error");
      return;
    }

    if (!editingProduct.name || !editingProduct.price || !editingProduct.stock || !editingProduct.category) {
      addAlert("Nombre, precio, stock y categoría son requeridos", "error");
      return;
    }

    const normalizedEditName = editingProduct.name.trim().toLowerCase();
    const normalizedEditBarcode = editingProduct.barcode.trim().toLowerCase();
    const normalizedEditCategory = editingProduct.category.trim().toUpperCase();

    if (!normalizedEditCategory) {
      addAlert("La categoría es requerida", "error");
      return;
    }

    const duplicateByName = products.find(
      (p) =>
        p.id !== editingProduct.id &&
        String(p.name || "").trim().toLowerCase() === normalizedEditName
    );

    if (duplicateByName) {
      addAlert(
        `⚠ Ya existe ese producto (${duplicateByName.name}). Verifica el nombre antes de guardar.`,
        "error"
      );
      return;
    }

    if (normalizedEditBarcode) {
      const duplicateByBarcode = products.find(
        (p) =>
          p.id !== editingProduct.id &&
          String(p.barcode || "").trim().toLowerCase() === normalizedEditBarcode
      );

      if (duplicateByBarcode) {
        addAlert(
          `⚠ El código de barras ya existe en ${duplicateByBarcode.name}.`,
          "error"
        );
        return;
      }
    }
    
    await updateProduct(editingProduct.id, {
      name: editingProduct.name.toUpperCase(),
      price: parseFloat(editingProduct.price),
      purchasePrice: editingProduct.purchasePrice ? parseFloat(editingProduct.purchasePrice) : undefined,
      stock: parseInt(editingProduct.stock),
      category: normalizedEditCategory,
      barcode: editingProduct.barcode ? editingProduct.barcode.toUpperCase() : undefined,
      observations: editingProduct.observations ? editingProduct.observations.toUpperCase() : undefined,
    });

    addAlert("✓ Producto editado correctamente", "success");
    setIsEditDialogOpen(false);
    setEditingProduct(null);
  };

  const handleEditCancel = () => {
    setIsEditDialogOpen(false);
    setEditingProduct(null);
    setIsEditCategorySearchOpen(false);
  };

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Apply sorting
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case "stock-high":
        return b.stock - a.stock;
      case "stock-low":
        return a.stock - b.stock;
      case "price-high":
        return b.price - a.price;
      case "price-low":
        return a.price - b.price;
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      default:
        return 0;
    }
  });

  const [productsPage, setProductsPage] = useState(1);
  const productsTotalPages = Math.max(1, Math.ceil(sortedProducts.length / 10));
  const paginatedProducts = sortedProducts.slice((productsPage - 1) * 10, productsPage * 10);

  const totalProducts = products.length;
  const totalValue = products.reduce((sum, p) => sum + p.price * p.stock, 0);
  const lowStockCount = products.filter((p) => p.stock > 0 && p.stock <= lowStockThreshold).length;

  // Calculate transaction total
  const transactionTotal = price && stock 
    ? parseFloat(price) * parseInt(stock || "0")
    : 0;

  const isExistingProduct = selectedProductId && selectedProductId !== "new";

  useEffect(() => { setProductsPage(1); }, [searchQuery, sortBy, statusFilter]);

  useEffect(() => {
    refreshProducts(statusFilter);
  }, []);

  useEffect(() => {
    const handleOrdersChanged = () => {
      refreshProducts(statusFilter);
    };

    window.addEventListener("orders:changed", handleOrdersChanged);
    return () => {
      window.removeEventListener("orders:changed", handleOrdersChanged);
    };
  }, [statusFilter, refreshProducts]);

  useEffect(() => {
    const syncGlobalLowStockThreshold = async () => {
      const threshold = await fetchGlobalLowStockThreshold();
      setLowStockThreshold(threshold || DEFAULT_LOW_STOCK_THRESHOLD);
    };

    syncGlobalLowStockThreshold();
  }, []);

  useEffect(() => {
    const handleLowStockThresholdChanged = () => {
      setLowStockThreshold(loadLowStockThreshold());
    };

    window.addEventListener(LOW_STOCK_THRESHOLD_CHANGED_EVENT, handleLowStockThresholdChanged as EventListener);
    return () => {
      window.removeEventListener(LOW_STOCK_THRESHOLD_CHANGED_EVENT, handleLowStockThresholdChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "doh") return;
    setDohLoading(true);
    fetch(`/api/products/doh?days=${dohDays}`)
      .then((r) => r.json())
      .then((data) => setDohData(Array.isArray(data) ? data : []))
      .catch(() => setDohData([]))
      .finally(() => setDohLoading(false));
  }, [activeTab, dohDays]);

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8 sm:mb-10">
        <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? 'text-white' : ''}`}>Productos</h1>
        <p className={`text-sm sm:text-base ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Gestiona tu inventario y productos</p>
        {isLoading && (
          <p className={`mt-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Cargando productos desde la base de datos...
          </p>
        )}
        {!!error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total de Productos</p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-white' : ''}`}>{formatNumber(totalProducts)}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <Package className="size-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Valor de Inventario</p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-white' : ''}`}>{formatCurrency(totalValue)}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <Package className="size-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Productos con Bajo Stock (Min: {formatNumber(lowStockThreshold)})
                </p>
                <p className="text-2xl font-bold text-orange-600">{formatNumber(lowStockCount)}</p>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg">
                <Package className="size-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={`mb-6 ${darkMode ? 'bg-gray-700 text-gray-300' : ''}`}>
          <TabsTrigger value="inventario" className={darkMode ? 'data-[state=active]:bg-gray-900 data-[state=active]:text-white text-gray-400' : ''}>Inventario</TabsTrigger>
          <TabsTrigger value="doh" className={darkMode ? 'data-[state=active]:bg-gray-900 data-[state=active]:text-white text-gray-400' : ''}>Días de Inventario (DOH)</TabsTrigger>
        </TabsList>

        <TabsContent value="inventario">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Add Product Form */}
        <Card className={`lg:col-span-1 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <CardHeader>
            <CardTitle className={darkMode ? 'text-white' : ''}>Agregar Producto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="product-select" className={darkMode ? 'text-gray-200' : ''}>Seleccionar Producto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <Input
                    id="product-select"
                    placeholder="Escribe para buscar producto"
                    value={productSelectorText}
                    autoComplete="new-password"
                    onFocus={() => setIsProductSearchOpen(true)}
                    onBlur={() => setTimeout(() => setIsProductSearchOpen(false), 120)}
                    onChange={(e) => handleProductSelectorChange(e.target.value)}
                    className={`pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                  />

                  {isProductSearchOpen && (
                    <div
                      className={`absolute z-30 mt-1 w-full rounded-md border max-h-64 overflow-auto ${
                        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                      }`}
                    >
                      {filteredProductOptions.map((option) => (
                        <button
                          key={`product-search-${option.id}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleProductSuggestionSelect(option.id)}
                          className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${
                            darkMode
                              ? 'border-gray-700 hover:bg-gray-700 text-gray-100'
                              : 'border-gray-100 hover:bg-gray-50 text-gray-900'
                          }`}
                        >
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{option.helper}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="product-name" className={darkMode ? 'text-gray-200' : ''}>Nombre del Producto</Label>
                <Input
                  id="product-name"
                  placeholder="Ingresa el nombre del producto"
                  value={name}
                  autoComplete="new-password"
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  disabled={!!isExistingProduct}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="price" className={darkMode ? 'text-gray-200' : ''}>Precio de Venta (Q)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={price}
                  autoComplete="new-password"
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={!!isExistingProduct}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="purchase-price" className={darkMode ? 'text-gray-200' : ''}>Costo (Q)</Label>
                <Input
                  id="purchase-price"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={purchasePrice}
                  autoComplete="new-password"
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  disabled={!!isExistingProduct}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="stock" className={darkMode ? 'text-gray-200' : ''}>Cantidad de Stock</Label>
                <Input
                  id="stock"
                  type="number"
                  placeholder="0"
                  value={stock}
                  autoComplete="new-password"
                  onChange={(e) => setStock(e.target.value)}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
                {isExistingProduct && stock && (
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Se añadirán {stock} unidades al stock existente
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="product-category" className={darkMode ? 'text-gray-200' : ''}>Categoría</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <Input
                    id="product-category"
                    placeholder="Escribe para buscar o crear categoría"
                    value={category}
                    autoComplete="new-password"
                    onFocus={() => setIsCategorySearchOpen(true)}
                    onBlur={() => setTimeout(() => setIsCategorySearchOpen(false), 120)}
                    onChange={(e) => {
                      setCategory(e.target.value.toUpperCase());
                      setIsCategorySearchOpen(true);
                    }}
                    disabled={!!isExistingProduct}
                    className={`pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                  />

                  {isCategorySearchOpen && !isExistingProduct && (
                    <div
                      className={`absolute z-30 mt-1 w-full rounded-md border max-h-64 overflow-auto ${
                        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                      }`}
                    >
                      {filteredCategoryOptions.map((cat) => (
                        <button
                          key={`category-search-${cat}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleCategorySuggestionSelect(cat)}
                          className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${
                            darkMode
                              ? 'border-gray-700 hover:bg-gray-700 text-gray-100'
                              : 'border-gray-100 hover:bg-gray-50 text-gray-900'
                          }`}
                        >
                          <p className="text-sm font-medium">{cat}</p>
                        </button>
                      ))}
                      {filteredCategoryOptions.length === 0 && (
                        <div className={`px-3 py-2 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          No hay coincidencias. Puedes crear esta categoría.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="product-barcode" className={darkMode ? 'text-gray-200' : ''}>Código de Barras (Opcional)</Label>
                <Input
                  id="product-barcode"
                  placeholder="Ingresa código de barras"
                  value={barcode}
                  autoComplete="new-password"
                  onChange={(e) => setBarcode(e.target.value.toUpperCase())}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="product-observations" className={darkMode ? 'text-gray-200' : ''}>Observaciones (Opcional)</Label>
                <Textarea
                  id="product-observations"
                  placeholder="Ingresa notas u observaciones sobre el producto"
                  value={observations}
                  autoComplete="off"
                  onChange={(e) => setObservations(e.target.value.toUpperCase())}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                  rows={3}
                />
              </div>

              {transactionTotal > 0 && (
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                  <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total de la Transacción</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(transactionTotal)}</p>
                </div>
              )}

              <Button onClick={handleAddProduct} disabled={isSubmittingProduct} className="w-full">
                <Plus className="size-4 mr-2" />
                {isSubmittingProduct ? "Procesando..." : isExistingProduct ? "Añadir Stock" : "Agregar Producto"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Products List */}
        <Card className={`lg:col-span-2 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className={darkMode ? 'text-white' : ''}>Lista de Productos</CardTitle>
                <div className="relative w-full sm:w-64 max-w-full">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-gray-400" />
                  <Input
                    placeholder="Buscar productos..."
                    value={searchQuery}
                    autoComplete="new-password"
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                  />
                </div>
              </div>
              
              {/* Filter/Sort Options */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className={`size-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                <Label className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Estado:</Label>
                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className={`w-full sm:w-[180px] ${darkMode ? 'bg-gray-700 border-gray-600' : ''}`}>
                    <SelectValue placeholder="Filtrar por estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activos">Activos</SelectItem>
                    <SelectItem value="inhabilitados">Inhabilitados</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
                <Label className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ordenar por:</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className={`w-full sm:w-[200px] ${darkMode ? 'bg-gray-700 border-gray-600' : ''}`}>
                    <SelectValue placeholder="Sin ordenar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin ordenar</SelectItem>
                    <SelectItem value="name-asc">Nombre (A-Z)</SelectItem>
                    <SelectItem value="name-desc">Nombre (Z-A)</SelectItem>
                    <SelectItem value="price-high">Precio (Mayor a Menor)</SelectItem>
                    <SelectItem value="price-low">Precio (Menor a Mayor)</SelectItem>
                    <SelectItem value="stock-high">Stock (Mayor a Menor)</SelectItem>
                    <SelectItem value="stock-low">Stock (Menor a Mayor)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedProducts.length === 0 ? (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {searchQuery ? "No se encontraron productos" : "No hay productos agregados"}
                </div>
              ) : (
                <>
                {paginatedProducts.map((product) => (
                  (() => {
                    const isInactive =
                      (product.status || "").toLowerCase().includes("inhabilitado") ||
                      (product.status || "").toLowerCase().includes("inactivo");

                    return (
                  <div
                    key={product.id}
                    className={`flex flex-col gap-3 p-4 rounded-lg transition-colors sm:flex-row sm:items-center sm:justify-between ${
                      darkMode
                        ? 'bg-gray-700 hover:bg-gray-600'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3 sm:gap-4 flex-1 min-w-0">
                      <div className="bg-blue-100 p-3 rounded-lg shrink-0">
                        <Package className="size-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium break-words ${darkMode ? 'text-white' : ''}`}>{product.name}</p>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {product.category} • Stock: {formatNumber(product.stock)}
                          {product.stock === 0 && (
                            <span className="text-red-600 ml-2">(Sin Stock)</span>
                          )}
                          {product.stock > 0 && product.stock <= lowStockThreshold && (
                            <span className="text-orange-600 ml-2">(Bajo Stock)</span>
                          )}
                        </p>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Estado: <span className={((product.status || '').toLowerCase().includes('inhabilitado') || (product.status || '').toLowerCase().includes('inactivo')) ? 'text-red-600' : 'text-green-600'}>{product.status || 'Habilitado'}</span>
                        </p>
                      </div>
                      <div className="basis-full sm:basis-auto w-full sm:w-auto text-left sm:text-right sm:ml-auto">
                        <p className={`font-semibold text-lg ${darkMode ? 'text-white' : ''}`}>
                          {formatCurrency(product.price)}
                        </p>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Total: {formatCurrency(product.price * product.stock)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:ml-2 self-end sm:self-auto shrink-0">
                      {isInactive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReactivate(product.id)}
                          title="Rehabilitar producto"
                        >
                          <RotateCcw className="size-4 text-emerald-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDetailsWithMovements(product)}
                      >
                        <Package className="size-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(product)}
                        disabled={isInactive}
                        className={isInactive ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        <Pencil className="size-4 text-blue-600" />
                      </Button>
                      {!isInactive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                    );
                  })()
                ))}

                {productsTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t" style={{borderColor: darkMode ? '#4b5563' : '#e5e7eb'}}>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Página {productsPage} de {productsTotalPages} ({formatNumber(sortedProducts.length)} productos)
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={productsPage === 1}
                        onClick={() => setProductsPage((p) => Math.max(1, p - 1))}
                        className={darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}>
                        ← Anterior
                      </Button>
                      <Button variant="outline" size="sm" disabled={productsPage === productsTotalPages}
                        onClick={() => setProductsPage((p) => Math.min(productsTotalPages, p + 1))}
                        className={darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}>
                        Siguiente →
                      </Button>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="doh">
          <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className={darkMode ? 'text-white' : ''}>Días de Inventario (DOH)</CardTitle>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Cuántos días dura el stock actual al ritmo de venta de los últimos {dohDays} días
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Label className={`text-sm ${darkMode ? 'text-gray-300' : ''}`}>Período:</Label>
                  <Select value={String(dohDays)} onValueChange={(v) => setDohDays(Number(v))}>
                    <SelectTrigger className={`w-[130px] ${darkMode ? 'bg-gray-700 border-gray-600' : ''}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 días</SelectItem>
                      <SelectItem value="14">14 días</SelectItem>
                      <SelectItem value="30">30 días</SelectItem>
                      <SelectItem value="60">60 días</SelectItem>
                      <SelectItem value="90">90 días</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                    <Input
                      placeholder="Buscar producto..."
                      value={dohSearch}
                      autoComplete="new-password"
                      onChange={(e) => setDohSearch(e.target.value)}
                      className={`pl-10 w-full sm:w-52 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                <span className="flex items-center gap-1.5 text-xs text-red-600"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span>Crítico (&lt; 7 días)</span>
                <span className="flex items-center gap-1.5 text-xs text-orange-500"><span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-400"></span>Bajo (7–14 días)</span>
                <span className="flex items-center gap-1.5 text-xs text-green-600"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500"></span>OK (&gt; 14 días)</span>
                <span className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}><span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400"></span>Sin ventas en período</span>
              </div>
            </CardHeader>
            <CardContent>
              {dohLoading ? (
                <p className={`text-center py-8 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Calculando...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <th className={`text-left py-2 px-3 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Producto</th>
                        <th className={`text-left py-2 px-3 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Categoría</th>
                        <th className={`text-right py-2 px-3 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Stock</th>
                        <th className={`text-right py-2 px-3 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Vendido ({dohDays}d)</th>
                        <th className={`text-right py-2 px-3 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Venta/día</th>
                        <th className={`text-right py-2 px-3 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>DOH</th>
                        <th className={`text-center py-2 px-3 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const filtered = dohData
                          .filter(
                            (r) =>
                              dohSearch.trim() === "" ||
                              r.name.toLowerCase().includes(dohSearch.trim().toLowerCase()) ||
                              r.category.toLowerCase().includes(dohSearch.trim().toLowerCase())
                          )
                          .sort((a, b) => {
                            if (a.doh === null && b.doh === null) return 0;
                            if (a.doh === null) return 1;
                            if (b.doh === null) return -1;
                            return a.doh - b.doh;
                          });

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={7} className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {dohData.length === 0 ? "Sin datos de inventario" : "No se encontraron productos"}
                              </td>
                            </tr>
                          );
                        }

                        return filtered.map((row) => {
                          let dotColor = "bg-gray-400";
                          let statusLabel = "Sin ventas";
                          let statusClass = darkMode ? "text-gray-400" : "text-gray-500";
                          if (row.doh !== null) {
                            if (row.doh < 7) {
                              dotColor = "bg-red-500"; statusLabel = "Crítico"; statusClass = "text-red-600";
                            } else if (row.doh < 15) {
                              dotColor = "bg-orange-400"; statusLabel = "Bajo"; statusClass = "text-orange-500";
                            } else {
                              dotColor = "bg-green-500"; statusLabel = "OK"; statusClass = "text-green-600";
                            }
                          }
                          return (
                            <tr
                              key={row.id}
                              className={`border-b last:border-b-0 ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'}`}
                            >
                              <td className={`py-2.5 px-3 font-medium ${darkMode ? 'text-white' : ''}`}>{row.name}</td>
                              <td className={`py-2.5 px-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{row.category}</td>
                              <td className={`py-2.5 px-3 text-right ${darkMode ? 'text-white' : ''}`}>{formatNumber(row.stock)}</td>
                              <td className={`py-2.5 px-3 text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{formatNumber(row.sold)}</td>
                              <td className={`py-2.5 px-3 text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                {row.dailyAvg > 0 ? row.dailyAvg.toFixed(1) : "—"}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-bold ${darkMode ? 'text-white' : ''}`}>
                                {row.doh !== null ? `${formatNumber(row.doh)} días` : "∞"}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusClass}`}>
                                  <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`}></span>
                                  {statusLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Product Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className={`sm:max-w-[500px] ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Modificar Producto</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              Actualiza la información del producto en la base de datos
            </DialogDescription>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-name" className={darkMode ? 'text-gray-200' : ''}>Nombre del Producto</Label>
                <Input
                  id="edit-name"
                  value={editingProduct.name}
                  autoComplete="new-password"
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, name: e.target.value.toUpperCase() })
                  }
                  placeholder="Ingresa el nombre del producto"
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="edit-price" className={darkMode ? 'text-gray-200' : ''}>Precio de Venta (Q)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  value={editingProduct.price}
                  autoComplete="new-password"
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, price: e.target.value })
                  }
                  placeholder="0.00"
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="edit-purchase-price" className={darkMode ? 'text-gray-200' : ''}>Costo (Q)</Label>
                <Input
                  id="edit-purchase-price"
                  type="number"
                  step="0.01"
                  value={editingProduct.purchasePrice || ''}
                  autoComplete="new-password"
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, purchasePrice: e.target.value })
                  }
                  placeholder="0.00"
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="edit-stock" className={darkMode ? 'text-gray-200' : ''}>Cantidad de Stock</Label>
                <Input
                  id="edit-stock"
                  type="number"
                  value={editingProduct.stock}
                  autoComplete="new-password"
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, stock: e.target.value })
                  }
                  placeholder="0"
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="edit-category" className={darkMode ? 'text-gray-200' : ''}>Categoría</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <Input
                    id="edit-category"
                    value={editingProduct.category}
                    autoComplete="new-password"
                    onFocus={() => setIsEditCategorySearchOpen(true)}
                    onBlur={() => setTimeout(() => setIsEditCategorySearchOpen(false), 120)}
                    onChange={(e) => {
                      setEditingProduct({ ...editingProduct, category: e.target.value.toUpperCase() });
                      setIsEditCategorySearchOpen(true);
                    }}
                    placeholder="Escribe para buscar o crear categoría"
                    className={`pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                  />

                  {isEditCategorySearchOpen && (
                    <div
                      className={`absolute z-30 mt-1 w-full rounded-md border max-h-64 overflow-auto ${
                        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                      }`}
                    >
                      {filteredEditCategoryOptions.map((cat) => (
                        <button
                          key={`edit-category-search-${cat}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleEditCategorySuggestionSelect(cat)}
                          className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${
                            darkMode
                              ? 'border-gray-700 hover:bg-gray-700 text-gray-100'
                              : 'border-gray-100 hover:bg-gray-50 text-gray-900'
                          }`}
                        >
                          <p className="text-sm font-medium">{cat}</p>
                        </button>
                      ))}
                      {filteredEditCategoryOptions.length === 0 && (
                        <div className={`px-3 py-2 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          No hay coincidencias. Puedes crear esta categoría.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="edit-barcode" className={darkMode ? 'text-gray-200' : ''}>Código de Barras (Opcional)</Label>
                <Input
                  id="edit-barcode"
                  value={editingProduct.barcode}
                  autoComplete="new-password"
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, barcode: e.target.value.toUpperCase() })
                  }
                  placeholder="Ingresa código de barras"
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="edit-observations" className={darkMode ? 'text-gray-200' : ''}>Observaciones (Opcional)</Label>
                <Textarea
                  id="edit-observations"
                  value={editingProduct.observations}
                  autoComplete="off"
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, observations: e.target.value.toUpperCase() })
                  }
                  placeholder="Ingresa notas u observaciones sobre el producto"
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleEditCancel}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave}>
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className={`sm:max-w-[400px] ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Confirmar Inhabilitación</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              ¿Estás seguro de que deseas inhabilitar este producto?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDelete}>
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Inhabilitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className={`sm:max-w-[680px] max-h-[80vh] overflow-y-auto ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Detalles del Producto</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              Información completa del producto
            </DialogDescription>
          </DialogHeader>
          {selectedProductForDetails && (
            <div className="space-y-4 py-4">
              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Nombre</p>
                <p className={`font-semibold text-lg ${darkMode ? 'text-white' : ''}`}>
                  {selectedProductForDetails.name}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Categoría</p>
                  <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                    {selectedProductForDetails.category}
                  </p>
                </div>

                <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Stock</p>
                  <p className={`font-semibold text-lg ${darkMode ? 'text-white' : ''}`}>
                    {formatNumber(selectedProductForDetails.stock)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Precio de Venta</p>
                  <p className={`font-semibold text-lg text-green-600`}>
                    {formatCurrency(selectedProductForDetails.price)}
                  </p>
                </div>

                <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Precio de Compra</p>
                  <p className={`font-semibold text-lg text-blue-600`}>
                    {formatCurrency(selectedProductForDetails.purchasePrice || 0)}
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Beneficio por Unidad</p>
                <p className={`font-semibold text-lg text-purple-600`}>
                  {formatCurrency(selectedProductForDetails.price - (selectedProductForDetails.purchasePrice || 0))}
                </p>
              </div>

              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Valor Total en Inventario</p>
                <p className={`font-semibold text-lg text-blue-600`}>
                  {formatCurrency(selectedProductForDetails.price * selectedProductForDetails.stock)}
                </p>
              </div>

              {selectedProductForDetails.barcode && (
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Código de Barras</p>
                  <p className={`font-semibold font-mono ${darkMode ? 'text-white' : ''}`}>
                    {selectedProductForDetails.barcode}
                  </p>
                </div>
              )}

              {selectedProductForDetails.observations && (
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Observaciones</p>
                  <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                    {selectedProductForDetails.observations}
                  </p>
                </div>
              )}

              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <p className={`text-sm font-semibold mb-3 ${darkMode ? 'text-white' : ''}`}>
                  Historial de Movimientos
                </p>

                {isLoadingMovements ? (
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Cargando historial...
                  </p>
                ) : productMovements.length === 0 ? (
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No hay movimientos registrados para este producto.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {productMovements.map((movement) => (
                      <div
                        key={movement.id}
                        className={`p-3 rounded border ${darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-white'}`}
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {getMovementTypeLabel(movement.type)}
                          </p>
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {formatDateTime(movement.created_at)}
                          </p>
                        </div>

                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Usuario: <span className="font-semibold">{movement.user_name || movement.user_id || 'Sistema'}</span>
                        </p>

                        {!!movement.description && (
                          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {movement.description}
                          </p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Stock: {movement.previous_stock ?? '—'} {'->'} {movement.new_stock ?? '—'}
                          </p>
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Precio: {movement.previous_price === null ? '—' : formatCurrency(movement.previous_price)} {'->'} {movement.new_price === null ? '—' : formatCurrency(movement.new_price)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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


