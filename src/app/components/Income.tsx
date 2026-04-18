import { useState, useRef, useEffect, useMemo } from "react";
import { Scan, TrendingUp, Trash2, Plus, X, Edit2, AlertCircle, Users, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useTheme } from "../context/ThemeContext";
import { useAlert } from "../context/AlertContext";
import { useProducts } from "../context/ProductContext";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatNumber } from "../utils/numberFormat";
import { fetchGlobalPaymentReminderDays } from "../utils/paymentReminderSettings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";

interface CartItem {
  productId: string;
  name: string;
  barcode: string;
  price: number;
  quantity: number;
}

interface CompletedSale {
  id: string;
  user_id?: number | null;
  items: CartItem[];
  itemsCount?: number;
  total: number;
  phase?: number | null;
  status?: string;
  date: string;
  time: string;
  createdAt?: string;
  customerName: string;
  customerAddress: string;
  customerPhone?: string;
  customerEmail?: string;
}

interface ClientOption {
  id: string;
  nombreEmpresa: string;
  direccion?: string;
  tipoCliente?: string;
}

interface ClientDebtStatus {
  hasOverduePending: boolean;
  overdueCount: number;
  overdueTotal: number;
  maxDaysPending: number;
  reminderDays: number;
}

export function Income() {
  const { darkMode } = useTheme();
  const { products, refreshProducts } = useProducts();
  const { user } = useAuth();
  const { addAlert } = useAlert();
  const normalizedRole = (user?.role || "").toLowerCase().trim();
  const isVendedor = normalizedRole === "vendedor" || normalizedRole.includes("vendedor");
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [completedSales, setCompletedSales] = useState<CompletedSale[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<typeof products>([]);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<"cart" | "history">("cart");
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Edit sale states
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingSaleItems, setEditingSaleItems] = useState<CartItem[]>([]);
  const [selectedSaleForEdit, setSelectedSaleForEdit] = useState<CompletedSale | null>(null);
  const [editSearchInput, setEditSearchInput] = useState("");
  const [editFilteredProducts, setEditFilteredProducts] = useState<typeof products>([]);

  // Confirmation dialogs
  const [isConfirmSaveOpen, setIsConfirmSaveOpen] = useState(false);
  const [isConfirmCancelOpen, setIsConfirmCancelOpen] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState<string | null>(null);
  
  // Customer name dialog
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerSearchText, setCustomerSearchText] = useState("");
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [isCustomerDialogSearchOpen, setIsCustomerDialogSearchOpen] = useState(false);
  const [customerAddress, setCustomerAddress] = useState("");
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [selectedClientType, setSelectedClientType] = useState<"estandar" | "premium">("estandar");
  const [clientDebtStatus, setClientDebtStatus] = useState<ClientDebtStatus | null>(null);

  // Sales details dialog
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedSaleForDetails, setSelectedSaleForDetails] = useState<CompletedSale | null>(null);

  // Add product modal
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<any>(null);
  const [addProductQuantity, setAddProductQuantity] = useState(1);

  // Edit customer name dialog
  const [isEditCustomerDialogOpen, setIsEditCustomerDialogOpen] = useState(false);
  const [editingCustomerName, setEditingCustomerName] = useState("");
  const [editingCustomerAddress, setEditingCustomerAddress] = useState("");
  const [editingCustomerSaleId, setEditingCustomerSaleId] = useState<string | null>(null);
  const [isEditCustomerNameSearchOpen, setIsEditCustomerNameSearchOpen] = useState(false);

  const notifyOrdersChanged = () => {
    window.dispatchEvent(new CustomEvent("orders:changed"));
  };

  const productStockById = useMemo(
    () => new Map(products.map((product) => [String(product.id), Number(product.stock ?? 0)])),
    [products]
  );

  const mapOrderRowToSale = (row: any): CompletedSale => {
    const createdAt = row?.created_at ? String(row.created_at) : "";
    const parsedDate = createdAt ? new Date(createdAt) : null;
    const hasValidDate = parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime());

    return {
      id: String(row?.id ?? ""),
      user_id:
        row?.user_id === null || typeof row?.user_id === "undefined"
          ? null
          : Number(row.user_id),
      items: [],
      itemsCount: Number(row?.items_qty ?? row?.items_count ?? 0),
      total: Number(row?.total ?? 0),
      phase: row?.phase === null || typeof row?.phase === "undefined" ? null : Number(row?.phase),
      status: String(row?.status || "pendiente"),
      date: hasValidDate ? parsedDate!.toISOString().split("T")[0] : "",
      time: hasValidDate
        ? parsedDate!.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
        : "",
      createdAt,
      customerName: String(row?.client_name || `Cliente #${row?.cli_id ?? ""}`),
      customerAddress: String(row?.client_address || ""),
      customerPhone: String(row?.client_phone || ""),
      customerEmail: String(row?.client_email || ""),
    };
  };

  const loadSalesFromDb = async () => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const response = await fetch("/api/orders?includeCancelled=1");
      if (!response.ok) {
        throw new Error("No se pudo cargar el historial desde la base de datos");
      }

      const payload = await response.json();
      const mapped = Array.isArray(payload) ? payload.map(mapOrderRowToSale) : [];
      const filteredMapped = isVendedor
        ? mapped.filter((sale: any) => Number(sale?.user_id || 0) === Number(user?.id || 0))
        : mapped;
      setCompletedSales(filteredMapped);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Error cargando historial");
      setCompletedSales([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    setIsProductSearchOpen(true);
    const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name, "es"));
    
    if (!value.trim()) {
      setFilteredProducts(sortedProducts.slice(0, 20));
      return;
    }

    const filtered = sortedProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(value.toLowerCase()) ||
        (product.barcode && product.barcode.includes(value))
    );

    setFilteredProducts(filtered);
  };

  const getProductStock = (productId: string) => {
    return Number(productStockById.get(String(productId)) ?? 0);
  };

  const validateItemsStock = (items: CartItem[], contextLabel: string) => {
    for (const item of items) {
      const availableStock = getProductStock(item.productId);
      if (item.quantity > availableStock) {
        addAlert(`Stock insuficiente para ${item.name}${contextLabel}. Disponible: ${availableStock}`, "error");
        return false;
      }
    }

    return true;
  };

  const reconcileItemsWithStock = (items: CartItem[]) => {
    const adjustments: string[] = [];

    const nextItems = items.flatMap((item) => {
      const availableStock = getProductStock(item.productId);

      if (availableStock <= 0) {
        adjustments.push(`${item.name} quedó sin stock`);
        return [];
      }

      if (item.quantity > availableStock) {
        adjustments.push(`${item.name} se ajustó a ${availableStock}`);
        return [{ ...item, quantity: availableStock }];
      }

      return [item];
    });

    return { nextItems, adjustments };
  };

  const validateCartStock = () => {
    return validateItemsStock(cart, "");
  };

  const handleSelectProduct = (product: any) => {
    const availableStock = Number(product?.stock ?? 0);
    if (availableStock <= 0) {
      addAlert(`El producto ${product.name} no tiene stock disponible`, "warning");
      return;
    }
    setIsProductSearchOpen(false);
    setSelectedProductToAdd(product);
    setAddProductQuantity(1);
    setIsAddProductModalOpen(true);
  };

  const filterClientsByQuery = (query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    const sortedClients = [...clientOptions].sort((a, b) =>
      a.nombreEmpresa.localeCompare(b.nombreEmpresa, "es")
    );

    if (!normalizedQuery) {
      return sortedClients;
    }

    return sortedClients.filter((client) =>
      client.nombreEmpresa.toLowerCase().includes(normalizedQuery)
    );
  };

  const handleClientSelection = (client: ClientOption) => {
    setCustomerId(client.id);
    setCustomerName(client.nombreEmpresa);
    setCustomerSearchText(client.nombreEmpresa);
    setCustomerAddress(client.direccion || "");
    setSelectedClientType(client.tipoCliente === "premium" ? "premium" : "estandar");
    setIsCustomerSearchOpen(false);
    setIsCustomerDialogSearchOpen(false);
  };

  const getEffectiveUnitPrice = (product: any) => {
    const premiumPrice = Number(product?.precioPremium ?? 0);
    if (selectedClientType === "premium" && premiumPrice > 0) {
      return premiumPrice;
    }

    return Number(product?.price ?? 0);
  };

  const loadSelectedClientDebtStatus = async (clientId: string) => {
    if (!clientId) {
      setClientDebtStatus(null);
      return;
    }

    try {
      const [reminderDays, ordersResponse] = await Promise.all([
        fetchGlobalPaymentReminderDays(),
        fetch("/api/orders"),
      ]);

      if (!ordersResponse.ok) {
        throw new Error("No se pudo cargar el estado de cuentas del cliente");
      }

      const payload = await ordersResponse.json();
      const now = Date.now();
      const numericClientId = Number(clientId);

      const rows = Array.isArray(payload) ? payload : [];
      const overdueRows = rows.filter((row: any) => {
        const rowClientId = Number(row?.cli_id || 0);
        if (rowClientId !== numericClientId) return false;

        const total = Number(row?.total) || 0;
        const paid = row?.ped_saldo_pag === null || typeof row?.ped_saldo_pag === "undefined"
          ? 0
          : Number(row?.ped_saldo_pag) || 0;
        const pendingRaw = row?.ped_saldo_pen === null || typeof row?.ped_saldo_pen === "undefined"
          ? Math.max(0, total - paid)
          : Number(row?.ped_saldo_pen) || 0;
        const pending = Math.max(0, pendingRaw);

        if (pending <= 0.00001) return false;

        const status = String(row?.status || "pendiente").toLowerCase();
        if (status.includes("cancel")) return false;

        const createdAt = row?.created_at ? new Date(String(row.created_at)) : null;
        const createdMs = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getTime() : null;
        const daysPending = createdMs === null ? 0 : Math.floor((now - createdMs) / (1000 * 60 * 60 * 24));

        return daysPending >= reminderDays;
      });

      const overdueTotal = overdueRows.reduce((sum: number, row: any) => {
        const total = Number(row?.total) || 0;
        const paid = row?.ped_saldo_pag === null || typeof row?.ped_saldo_pag === "undefined"
          ? 0
          : Number(row?.ped_saldo_pag) || 0;
        const pendingRaw = row?.ped_saldo_pen === null || typeof row?.ped_saldo_pen === "undefined"
          ? Math.max(0, total - paid)
          : Number(row?.ped_saldo_pen) || 0;
        return sum + Math.max(0, pendingRaw);
      }, 0);

      const maxDaysPending = overdueRows.reduce((max: number, row: any) => {
        const createdAt = row?.created_at ? new Date(String(row.created_at)) : null;
        const createdMs = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getTime() : null;
        const daysPending = createdMs === null ? 0 : Math.floor((now - createdMs) / (1000 * 60 * 60 * 24));
        return Math.max(max, daysPending);
      }, 0);

      setClientDebtStatus({
        hasOverduePending: overdueRows.length > 0,
        overdueCount: overdueRows.length,
        overdueTotal,
        maxDaysPending,
        reminderDays,
      });
    } catch {
      setClientDebtStatus(null);
    }
  };

  const handleConfirmAddProduct = () => {
    if (!selectedProductToAdd) return;
    const product = selectedProductToAdd;
    const availableStock = Number(product?.stock ?? 0);
    const qty = addProductQuantity;

    if (qty <= 0) {
      addAlert("La cantidad debe ser mayor a 0", "warning");
      return;
    }

    const existingItem = cart.find((item) => item.productId === product.id);
    const effectivePrice = getEffectiveUnitPrice(product);

    if (existingItem) {
      if (existingItem.quantity + qty > availableStock) {
        addAlert(`No puedes agregar más de ${availableStock} unidades de ${product.name} (ya tienes ${existingItem.quantity} en el carrito)`, "warning");
        return;
      }
      setCart(cart.map((item) =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + qty, price: effectivePrice }
          : item
      ));
    } else {
      if (qty > availableStock) {
        addAlert(`No puedes agregar más de ${availableStock} unidades de ${product.name}`, "warning");
        return;
      }
      setCart([...cart, {
        productId: product.id,
        name: product.name,
        barcode: product.barcode || "",
        price: effectivePrice,
        quantity: qty,
      }]);
    }

    setIsAddProductModalOpen(false);
    setSelectedProductToAdd(null);
    setAddProductQuantity(1);
    setSearchInput("");
    setFilteredProducts([]);
  };

  const handleUpdateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }

    const availableStock = getProductStock(productId);
    if (newQuantity > availableStock) {
      const itemName = cart.find((item) => item.productId === productId)?.name || "este producto";
      addAlert(`Stock insuficiente para ${itemName}. Disponible: ${availableStock}`, "error");
      return;
    }

    setCart(
      cart.map((item) =>
        item.productId === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.productId !== productId));
  };

  const handleEditSale = async (sale: CompletedSale) => {
    const currentStatus = String(sale.status || "").toLowerCase().trim();
    if (currentStatus !== "pendiente") {
      addAlert("Solo puedes modificar pedidos en estado pendiente", "info");
      return;
    }

    try {
      const response = await fetch(`/api/orders/${sale.id}`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el detalle del pedido para editar");
      }

      const payload = await response.json();
      const detailItems: CartItem[] = Array.isArray(payload?.details)
        ? payload.details.map((detail: any) => ({
            productId: String(detail?.prod_id ?? ""),
            name: String(detail?.product_name || `Producto #${detail?.prod_id ?? ""}`),
            barcode: "",
            price: Number(detail?.unit_price ?? 0),
            quantity: Number(detail?.quantity ?? 0),
          }))
        : [];

      setEditingSaleId(String(sale.id));
      setEditingSaleItems(detailItems);
      setSelectedSaleForEdit(sale);
      setEditSearchInput("");
      setEditFilteredProducts(products);
      setIsEditDialogOpen(true);
    } catch (error) {
      addAlert(error instanceof Error ? error.message : "No se pudo abrir la edición del pedido", "error");
    }
  };

  const handleEditSearchInput = (value: string) => {
    setEditSearchInput(value);
    
    if (!value.trim()) {
      setEditFilteredProducts(products);
      return;
    }

    const filtered = products.filter(
      (product) =>
        product.name.toLowerCase().includes(value.toLowerCase()) ||
        (product.barcode && product.barcode.includes(value))
    );

    setEditFilteredProducts(filtered);
  };

  const handleAddItemToEditingSale = (product: any) => {
    const availableStock = getProductStock(String(product.id));
    if (availableStock <= 0) {
      addAlert(`El producto ${product.name} no tiene stock disponible`, "warning");
      return;
    }

    const existingItem = editingSaleItems.find(
      (item) => String(item.productId) === String(product.id)
    );

    if (existingItem) {
      if (existingItem.quantity + 1 > availableStock) {
        addAlert(`No puedes agregar más de ${availableStock} unidades de ${product.name}`, "warning");
        return;
      }

      setEditingSaleItems(
        editingSaleItems.map((item) =>
          String(item.productId) === String(product.id)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setEditingSaleItems([
        ...editingSaleItems,
        {
          productId: product.id,
          name: product.name,
          barcode: product.barcode || "",
          price: product.price,
          quantity: 1,
        },
      ]);
    }
  };

  const handleRemoveItemFromEditingSale = (productId: string) => {
    setEditingSaleItems(
      editingSaleItems.filter((item) => item.productId !== productId)
    );
  };

  const handleUpdateEditingItemQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemoveItemFromEditingSale(productId);
      return;
    }

    const availableStock = getProductStock(productId);
    if (newQuantity > availableStock) {
      const itemName = editingSaleItems.find((item) => item.productId === productId)?.name || "este producto";
      addAlert(`Stock insuficiente para ${itemName}. Disponible: ${availableStock}`, "error");
      return;
    }

    setEditingSaleItems(
      editingSaleItems.map((item) =>
        item.productId === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  };

  const handleSaveEditedSale = () => {
    setIsConfirmSaveOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!editingSaleId || editingSaleItems.length === 0) {
      return;
    }

    if (!validateItemsStock(editingSaleItems, " en la edición")) {
      return;
    }

    try {
      const response = await fetch(`/api/orders/${editingSaleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usr_modif: Number(user?.id || 0),
          items: editingSaleItems.map((item) => ({
            prod_id: Number(item.productId),
            det_cantidad: Number(item.quantity),
            det_precio_unitario: Number(item.price),
          })),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo modificar el pedido");
      }

      await loadSalesFromDb();
      await refreshProducts();
      notifyOrdersChanged();
      addAlert("✓ Pedido modificado correctamente", "success");
      setIsEditDialogOpen(false);
      setIsConfirmSaveOpen(false);
      setEditingSaleId(null);
      setEditingSaleItems([]);
      setSelectedSaleForEdit(null);
    } catch (error) {
      addAlert(error instanceof Error ? error.message : "No se pudo modificar el pedido", "error");
    }
  };

  const handleCancelSale = (saleId: string) => {
    const sale = completedSales.find((item) => item.id === saleId);
    const currentStatus = String(sale?.status || "").toLowerCase().trim();
    if (currentStatus !== "pendiente") {
      addAlert("Solo puedes cancelar pedidos en estado pendiente", "info");
      return;
    }

    setSaleToCancel(saleId);
    setIsConfirmCancelOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!saleToCancel) {
      return;
    }

    try {
      const response = await fetch(`/api/orders/${saleToCancel}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usr_modif: Number(user?.id || 0) }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo cancelar el pedido");
      }

      await loadSalesFromDb();
      await refreshProducts();
      notifyOrdersChanged();
      addAlert("✓ Pedido cancelado correctamente", "success");

      setIsConfirmCancelOpen(false);
      setSaleToCancel(null);
    } catch (error) {
      addAlert(error instanceof Error ? error.message : "No se pudo cancelar el pedido", "error");
    }
  };

  const handleCompleteSaleClick = () => {
    if (isCompletingSale) {
      return;
    }

    if (cart.length === 0) {
      addAlert("El carrito está vacío", "warning");
      return;
    }
    if (!validateCartStock()) {
      return;
    }
    if (!customerId.trim()) {
      addAlert("Por favor selecciona la empresa del cliente", "warning");
      return;
    }
    handleConfirmCompleteSale();
  };

  const handleConfirmCompleteSale = async () => {
    if (isCompletingSale) return;
    if (cart.length === 0 || !customerId.trim()) return;

    setIsCompletingSale(true);

    if (!user?.id) {
      addAlert("No se identificó el usuario autenticado para guardar el pedido", "error");
      setIsCompletingSale(false);
      return;
    }

    const pedidoPayload = {
      user_id: Number(user.id),
      cli_id: Number(customerId),
      phase: 1,
      usr_modif: Number(user.id),
      items: cart.map((item) => ({
        prod_id: Number(item.productId),
        det_cantidad: Number(item.quantity),
        det_precio_unitario: Number(item.price),
      })),
    };

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedidoPayload),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo guardar el pedido");
      }
      await loadSalesFromDb();
      await refreshProducts();
      notifyOrdersChanged();
      addAlert("✓ Compra finalizada correctamente", "success");
      setCart([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerSearchText("");
      setCustomerAddress("");
      setSelectedClientType("estandar");
      setIsCustomerDialogOpen(false);
      setCurrentTab("history");
    } catch (error) {
      addAlert(error instanceof Error ? error.message : "No se pudo guardar el pedido", "error");
    } finally {
      setIsCompletingSale(false);
    }
  };

  const handleViewSaleDetails = async (sale: CompletedSale) => {
    try {
      const response = await fetch(`/api/orders/${sale.id}`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el detalle del pedido");
      }

      const payload = await response.json();
      const createdAt = payload?.created_at ? String(payload.created_at) : sale.createdAt || "";
      const parsedDate = createdAt ? new Date(createdAt) : null;
      const hasValidDate = parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime());

      const detailItems: CartItem[] = Array.isArray(payload?.details)
        ? payload.details.map((detail: any) => ({
            productId: String(detail?.prod_id ?? ""),
            name: String(detail?.product_name || `Producto #${detail?.prod_id ?? ""}`),
            barcode: "",
            price: Number(detail?.unit_price ?? 0),
            quantity: Number(detail?.quantity ?? 0),
          }))
        : [];

      const detailSale: CompletedSale = {
        id: String(payload?.id ?? sale.id),
        items: detailItems,
        itemsCount: detailItems.reduce((sum, item) => sum + item.quantity, 0),
        total: Number(payload?.total ?? sale.total),
        date: hasValidDate ? parsedDate!.toISOString().split("T")[0] : sale.date,
        time: hasValidDate
          ? parsedDate!.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
          : sale.time,
        createdAt,
        customerName: String(payload?.client_name || sale.customerName),
        customerAddress: String(payload?.client_address || sale.customerAddress || ""),
        customerPhone: String(payload?.client_phone || sale.customerPhone || ""),
        customerEmail: String(payload?.client_email || sale.customerEmail || ""),
      };

      setSelectedSaleForDetails(detailSale);
      setIsDetailsDialogOpen(true);
    } catch (error) {
      addAlert(error instanceof Error ? error.message : "No se pudo cargar el detalle de la venta", "error");
    }
  };

  const handleEditCustomerName = (sale: CompletedSale) => {
    setEditingCustomerSaleId(sale.id);
    setEditingCustomerName(sale.customerName);
    setEditingCustomerAddress(sale.customerAddress || "");
    setIsEditCustomerDialogOpen(true);
  };

  const handleConfirmEditCustomerName = () => {
    if (editingCustomerSaleId && editingCustomerName.trim()) {
      setCompletedSales(
        completedSales.map((sale) =>
          sale.id === editingCustomerSaleId
            ? { 
                ...sale, 
                customerName: editingCustomerName.trim(),
                customerAddress: editingCustomerAddress.trim(),
              }
            : sale
        )
      );
      
      // Update details dialog if it's open
      if (selectedSaleForDetails && selectedSaleForDetails.id === editingCustomerSaleId) {
        setSelectedSaleForDetails({
          ...selectedSaleForDetails,
          customerName: editingCustomerName.trim(),
          customerAddress: editingCustomerAddress.trim(),
        });
      }

      setIsEditCustomerDialogOpen(false);
      setEditingCustomerSaleId(null);
      setEditingCustomerName("");
      setEditingCustomerAddress("");
      addAlert("✓ Información del cliente actualizada", "success");
    }
  };



  // Calculate stats
  const totalIncome = completedSales.reduce((sum, sale) => sum + sale.total, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const todaySales = completedSales.filter((s) => s.date === new Date().toISOString().split("T")[0]);
  const todayIncome = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const totalTransactions = completedSales.length;

  const orderedSales = useMemo(() => {
    const list = [...completedSales];
    list.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      if (dateB !== dateA) {
        return dateB - dateA;
      }

      return String(b.id).localeCompare(String(a.id));
    });
    return list;
  }, [completedSales]);

  const HISTORY_PAGE_SIZE = 10;
  const [historyPage, setHistoryPage] = useState(1);

  // Reset page when sales change
  useEffect(() => { setHistoryPage(1); }, [completedSales.length]);

  const historyTotalPages = Math.max(1, Math.ceil(orderedSales.length / HISTORY_PAGE_SIZE));
  const paginatedSales = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return orderedSales.slice(start, start + HISTORY_PAGE_SIZE);
  }, [orderedSales, historyPage]);

  useEffect(() => {
    loadSalesFromDb();
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!isProductSearchOpen) {
      return;
    }

    const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name, "es"));

    if (!searchInput.trim()) {
      setFilteredProducts(sortedProducts.slice(0, 20));
      return;
    }

    const filtered = sortedProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(searchInput.toLowerCase()) ||
        (product.barcode && product.barcode.includes(searchInput))
    );

    setFilteredProducts(filtered);
  }, [products, searchInput, isProductSearchOpen]);

  useEffect(() => {
    if (cart.length === 0) {
      return;
    }

    const { nextItems, adjustments } = reconcileItemsWithStock(cart);
    if (adjustments.length === 0) {
      return;
    }

    setCart(nextItems);
    addAlert(`Stock actualizado: ${adjustments.join("; ")}`, "warning");
  }, [products]);

  useEffect(() => {
    if (!isEditDialogOpen || editingSaleItems.length === 0) {
      return;
    }

    const { nextItems, adjustments } = reconcileItemsWithStock(editingSaleItems);
    if (adjustments.length === 0) {
      return;
    }

    setEditingSaleItems(nextItems);
    addAlert(`Se ajustó la edición del pedido: ${adjustments.join("; ")}`, "warning");
  }, [products, isEditDialogOpen]);

  useEffect(() => {
    const handleOrdersChanged = () => {
      loadSalesFromDb();
    };

    window.addEventListener("orders:changed", handleOrdersChanged);
    return () => {
      window.removeEventListener("orders:changed", handleOrdersChanged);
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const query = new URLSearchParams({
          requesterUserId: String(user?.id || ""),
          requesterRole: String(user?.role || ""),
          requesterUsername: String(user?.username || ""),
        });

        const response = await fetch(`/api/clients?${query.toString()}`, {
          headers: {
            "x-user-id": String(user?.id || ""),
            "x-user-role": String(user?.role || ""),
            "x-user-username": String(user?.username || ""),
          },
        });
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const mapped = Array.isArray(data)
          ? data
              .map((item) => ({
                id: String(item?.id || ""),
                nombreEmpresa: String(item?.nombreEmpresa || ""),
                direccion: String(item?.direccion || ""),
                tipoCliente: String(item?.tipoCliente || "estandar"),
              }))
              .filter((item) => item.id && item.nombreEmpresa)
          : [];

        setClientOptions(mapped);
      } catch {
        setClientOptions([]);
      }
    };

    fetchClients();
  }, [user?.id, user?.role, user?.username]);

  useEffect(() => {
    void loadSelectedClientDebtStatus(customerId);
  }, [customerId]);

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8 sm:mb-10">
        <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? 'text-white' : ''}`}>Ventas</h1>
        <p className={`text-sm sm:text-base ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Registra las ventas de productos con escaneo de código de barras</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ventas Totales</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalIncome)}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <TrendingUp className="size-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ventas de Hoy</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(todayIncome)}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <Scan className="size-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total de Transacciones</p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {formatNumber(totalTransactions)}
                </p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <TrendingUp className="size-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className={`lg:col-span-1 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="size-5 text-purple-600" />
              <CardTitle className={darkMode ? 'text-white' : ''}>Agregar a Pedido</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border-2 ${darkMode ? 'bg-gray-700 border-purple-600' : 'bg-purple-50 border-purple-200'}`}>
                <p className={`text-sm font-semibold mb-3 ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                  Información del Cliente
                </p>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="customer-name" className={darkMode ? 'text-gray-200' : ''}>
                      Empresa Cliente
                    </Label>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="customer-name"
                        placeholder="Buscar empresa cliente"
                        value={customerSearchText}
                        autoComplete="new-password"
                        onFocus={() => setIsCustomerSearchOpen(true)}
                        onBlur={() => setTimeout(() => setIsCustomerSearchOpen(false), 120)}
                        onChange={(e) => {
                          const value = e.target.value;
                          setCustomerSearchText(value);
                          setCustomerName(value);
                          setIsCustomerSearchOpen(true);

                          const exactMatch = clientOptions.find(
                            (client) =>
                              client.nombreEmpresa.trim().toLowerCase() === value.trim().toLowerCase()
                          );

                          if (exactMatch) {
                            setCustomerId(exactMatch.id);
                            setCustomerAddress(exactMatch.direccion || "");
                            setSelectedClientType(exactMatch.tipoCliente === "premium" ? "premium" : "estandar");
                          } else {
                            setCustomerId("");
                            setCustomerAddress("");
                            setSelectedClientType("estandar");
                          }
                        }}
                        className={`pl-10 ${darkMode ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : ''}`}
                      />

                      {isCustomerSearchOpen && (
                        <div
                          className={`absolute z-30 mt-1 w-full rounded-md border max-h-64 overflow-auto ${
                            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                          }`}
                        >
                          {filterClientsByQuery(customerSearchText).slice(0, 15).map((client) => (
                            <button
                              key={`client-search-${client.id}`}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleClientSelection(client)}
                              className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${
                                darkMode
                                  ? 'border-gray-700 hover:bg-gray-700 text-gray-100'
                                  : 'border-gray-100 hover:bg-gray-50 text-gray-900'
                              }`}
                            >
                              <p className="text-sm font-medium">{client.nombreEmpresa}</p>
                              {client.tipoCliente === "premium" && (
                                <p className="text-xs text-purple-600 font-semibold">★ Premium</p>
                              )}
                            </button>
                          ))}
                          {filterClientsByQuery(customerSearchText).length === 0 && (
                            <div className={`px-3 py-2 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              No hay coincidencias para esta empresa.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {customerId && (
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold w-fit ${
                      selectedClientType === "premium"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {selectedClientType === "premium" ? "★ Cliente Premium" : "Cliente Estándar"}
                    </div>
                  )}

                  {customerId && clientDebtStatus && (
                    <div className={`px-3 py-2 rounded-md text-xs font-semibold w-fit ${
                      clientDebtStatus.hasOverduePending
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {clientDebtStatus.hasOverduePending
                        ? `⚠ ${clientDebtStatus.overdueCount} cuenta(s) vencida(s) • ${formatCurrency(clientDebtStatus.overdueTotal)} • máx ${formatNumber(clientDebtStatus.maxDaysPending)} día(s)`
                        : `Al día (sin cuentas vencidas >= ${formatNumber(clientDebtStatus.reminderDays)} días)`}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="search-product" className={darkMode ? 'text-gray-200' : ''}>
                  Buscar por Código de Barras o Nombre
                </Label>
                <div className="relative mt-2">
                  <Scan className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-gray-400" />
                  <Input
                    ref={searchInputRef}
                    id="search-product"
                    placeholder="Escanea o busca un producto"
                    value={searchInput}
                    autoComplete="new-password"
                    onFocus={() => {
                      setIsProductSearchOpen(true);
                      if (!searchInput.trim()) {
                        setFilteredProducts([...products].sort((a, b) => a.name.localeCompare(b.name, "es")).slice(0, 20));
                      }
                    }}
                    onBlur={() => setTimeout(() => setIsProductSearchOpen(false), 120)}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    className={`pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                  />
                </div>

                {isProductSearchOpen ? (
                  filteredProducts.length > 0 ? (
                  <div className={`mt-2 border rounded-lg max-h-72 overflow-y-auto shadow-lg ${
                    darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                  }`}>
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => handleSelectProduct(product)}
                        disabled={product.stock <= 0}
                        className={`w-full text-left p-4 hover:bg-blue-500 hover:text-white transition-colors border-b last:border-b-0 ${
                          darkMode ? 'border-gray-600' : 'border-gray-200'
                        } ${product.stock <= 0 ? 'opacity-50 cursor-not-allowed hover:bg-transparent hover:text-inherit' : ''}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className={`font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{product.name}</p>
                            {product.barcode && (
                              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Código: {product.barcode}</p>
                            )}
                            {product.category && (
                              <p className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Categoría: {product.category}</p>
                            )}
                            {product.observations && (
                              <p className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Notas: {product.observations}</p>
                            )}
                          </div>
                          <div className="text-right ml-2">
                            <p className="font-bold text-green-600">{formatCurrency(getEffectiveUnitPrice(product))}</p>
                            {selectedClientType === "premium" && Number(product?.precioPremium ?? 0) > 0 && (
                              <p className="text-[11px] text-purple-600 font-semibold">Precio Premium</p>
                            )}
                            <p className={`text-xs opacity-75 mt-1 ${
                              product.stock > 0 ? 'text-blue-600' : 'text-red-600'
                            }`}>
                              Stock: {formatNumber(product.stock)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  ) : (
                  <div className={`mt-2 p-4 text-center text-sm rounded-lg ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                    {searchInput.trim() ? "No se encontraron productos que coincidan" : "No hay productos disponibles"}
                  </div>
                  )
                ) : null}
              </div>

              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Productos en carrito
                </p>
                <p className="text-2xl font-bold text-blue-600">{formatNumber(cart.length)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cart and History Tabs */}
        <Card className={`lg:col-span-2 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <CardHeader>
            <div className="flex items-center justify-between mb-4">
              <CardTitle className={darkMode ? 'text-white' : ''}>Carrito y Historial</CardTitle>
            </div>
            <div className="flex gap-2 border-b" role="tablist">
              <button
                role="tab"
                aria-selected={currentTab === "cart"}
                onClick={() => setCurrentTab("cart")}
                className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                  currentTab === "cart"
                    ? `border-blue-600 text-blue-600`
                    : `border-transparent ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`
                }`}
              >
                Carrito Actual ({formatNumber(cart.length)})
              </button>
              <button
                role="tab"
                aria-selected={currentTab === "history"}
                onClick={() => setCurrentTab("history")}
                className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                  currentTab === "history"
                    ? `border-blue-600 text-blue-600`
                    : `border-transparent ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`
                }`}
              >
                Historial de Ventas ({formatNumber(completedSales.length)})
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Cart Tab Content */}
            {currentTab === "cart" && (
              <div>
                {cart.length === 0 ? (
                  <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Scan className="size-12 mx-auto mb-3 opacity-50" />
                    <p>El carrito está vacío. Busca productos para comenzar.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-6">
                      {cart.map((item) => (
                        <div
                          key={item.productId}
                          className={`flex flex-col gap-3 p-4 rounded-lg transition-colors sm:flex-row sm:items-center sm:justify-between ${
                            darkMode
                              ? 'bg-gray-700 hover:bg-gray-600'
                              : 'bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex-1">
                            <p className={`font-medium ${darkMode ? 'text-white' : ''}`}>
                              {item.name}
                            </p>
                            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {formatCurrency(item.price)} c/u
                              {item.barcode && ` • Código: ${item.barcode}`}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  handleUpdateQuantity(item.productId, item.quantity - 1)
                                }
                                className={`px-2 py-1 rounded ${
                                  darkMode
                                    ? 'bg-gray-600 hover:bg-gray-500'
                                    : 'bg-gray-200 hover:bg-gray-300'
                                }`}
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  handleUpdateQuantity(
                                    item.productId,
                                    parseInt(e.target.value) || 1
                                  )
                                }
                                className={`w-12 text-center px-2 py-1 rounded ${
                                  darkMode
                                    ? 'bg-gray-600 border-gray-500 text-white'
                                    : 'bg-white border-gray-300'
                                } border`}
                              />
                              <button
                                onClick={() =>
                                  handleUpdateQuantity(item.productId, item.quantity + 1)
                                }
                                className={`px-2 py-1 rounded ${
                                  darkMode
                                    ? 'bg-gray-600 hover:bg-gray-500'
                                    : 'bg-gray-200 hover:bg-gray-300'
                                }`}
                              >
                                +
                              </button>
                            </div>

                            <div className="text-left sm:text-right">
                              <p className="font-semibold text-green-600">
                                {formatCurrency(item.price * item.quantity)}
                              </p>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveFromCart(item.productId)}
                            >
                              <X className="size-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Cart Summary */}
                    <div className={`p-4 rounded-lg mb-4 ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Total
                        </p>
                        <p className="text-3xl font-bold text-green-600">
                          {formatCurrency(cartTotal)}
                        </p>
                      </div>
                      <Button
                        onClick={handleCompleteSaleClick}
                        disabled={isCompletingSale}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        <Plus className="size-4 mr-2" />
                        {isCompletingSale ? "Procesando..." : "Finalizar Compra"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* History Tab Content */}
            {currentTab === "history" && (
              <div className="space-y-3">
                {historyLoading && (
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Cargando historial desde base de datos...
                  </p>
                )}
                {!!historyError && (
                  <p className="text-sm text-red-600">{historyError}</p>
                )}
                {orderedSales.length === 0 ? (
                  <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <TrendingUp className="size-12 mx-auto mb-3 opacity-50" />
                    <p>No hay ventas registradas en la base de datos.</p>
                  </div>
                ) : (
                  <>
                    {paginatedSales.map((sale) => {
                    const isPendingSale = String(sale.status || "").toLowerCase().trim() === "pendiente";

                    return (
                    <div
                      key={sale.id}
                      className={`p-4 rounded-lg ${
                        darkMode
                          ? 'bg-gray-700 hover:bg-gray-600'
                          : 'bg-gray-50 hover:bg-gray-100'
                      } transition-colors`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                        <div>
                          <p className={`font-medium ${darkMode ? 'text-white' : ''}`}>
                            Venta #{sale.id.slice(-4)}
                          </p>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Cliente: {sale.customerName}
                          </p>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {sale.date || '—'} {sale.time ? `a las ${sale.time}` : ''}
                          </p>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Productos: {formatNumber(sale.itemsCount ?? sale.items.reduce((sum, item) => sum + item.quantity, 0))}
                          </p>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Estado: {sale.status || 'pendiente'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 self-start sm:self-auto">
                          <p className="text-xl sm:text-2xl font-bold text-green-600 break-all">
                            {formatCurrency(sale.total)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-3 border-t" style={{borderColor: darkMode ? '#4b5563' : '#e5e7eb'}}>
                        <Button
                          onClick={() => handleViewSaleDetails(sale)}
                          variant="outline"
                          size="sm"
                          className={`w-full sm:w-auto ${darkMode ? 'border-gray-600 text-green-400 hover:bg-gray-600' : 'text-green-600'}`}
                        >
                          Ver Detalles
                        </Button>
                        <Button
                          onClick={() => handleEditSale(sale)}
                          variant="outline"
                          size="sm"
                          disabled={!isPendingSale}
                          className={`w-full sm:w-auto ${darkMode ? 'border-gray-600 text-blue-400 hover:bg-gray-600' : ''}`}
                        >
                          <Edit2 className="size-4 mr-1" />
                          Modificar
                        </Button>
                        <Button
                          onClick={() => handleCancelSale(sale.id)}
                          variant="outline"
                          size="sm"
                          disabled={!isPendingSale}
                          className={`w-full sm:w-auto ${darkMode ? 'border-gray-600 text-red-400 hover:bg-gray-600' : 'text-red-600'}`}
                        >
                          <Trash2 className="size-4 mr-1" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )})}

                    {/* Pagination */}
                    {historyTotalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t" style={{borderColor: darkMode ? '#4b5563' : '#e5e7eb'}}>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Página {historyPage} de {historyTotalPages} ({formatNumber(orderedSales.length)} ventas)
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={historyPage === 1}
                            onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                            className={darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}
                          >
                            ← Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={historyPage === historyTotalPages}
                            onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                            className={darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}
                          >
                            Siguiente →
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Sale Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className={`sm:max-w-[600px] max-h-[90vh] ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Modificar Pedido</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              Edita los productos, cantidades y datos del cliente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-96 overflow-y-auto py-4">
            {/* Customer Name */}
            <div>
              <Label htmlFor="edit-customer-name-field" className={darkMode ? 'text-gray-200' : ''}>
                Nombre del Cliente
              </Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  id="edit-customer-name-field"
                  value={selectedSaleForEdit?.customerName || ""}
                  autoComplete="new-password"
                  onFocus={() => setIsCustomerDialogSearchOpen(true)}
                  onBlur={() => setTimeout(() => setIsCustomerDialogSearchOpen(false), 120)}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (selectedSaleForEdit) {
                      setSelectedSaleForEdit({
                        ...selectedSaleForEdit,
                        customerName: value,
                      });
                    }
                  }}
                  placeholder="Busca un cliente"
                  className={`pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                />

                {isCustomerDialogSearchOpen && (
                  <div
                    className={`absolute z-30 mt-1 w-full rounded-md border max-h-64 overflow-auto ${
                      darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                    }`}
                  >
                    {filterClientsByQuery(selectedSaleForEdit?.customerName || "").slice(0, 12).map((client) => (
                      <button
                        key={`edit-sale-client-${client.id}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (!selectedSaleForEdit) return;
                          setSelectedSaleForEdit({
                            ...selectedSaleForEdit,
                            customerName: client.nombreEmpresa,
                          });
                          setIsCustomerDialogSearchOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${
                          darkMode
                            ? 'border-gray-700 hover:bg-gray-700 text-gray-100'
                            : 'border-gray-100 hover:bg-gray-50 text-gray-900'
                        }`}
                      >
                        <p className="text-sm font-medium">{client.nombreEmpresa}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Current Items */}
            <div>
              <Label className={darkMode ? 'text-gray-200 mb-2' : ''}>Productos en el Pedido</Label>
              <div className="space-y-2">
                {editingSaleItems.length === 0 ? (
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No hay productos en este pedido
                  </p>
                ) : (
                  editingSaleItems.map((item) => (
                    <div
                      key={item.productId}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg ${
                        darkMode ? 'bg-gray-700' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex-1">
                        <p className={`font-medium ${darkMode ? 'text-white' : ''}`}>
                          {item.name}
                        </p>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {formatCurrency(item.price)} c/u
                        </p>
                      </div>

                      <div className="flex items-center gap-2 mx-3">
                        <button
                          onClick={() =>
                            handleUpdateEditingItemQuantity(item.productId, item.quantity - 1)
                          }
                          className={`px-2 py-1 rounded text-sm ${
                            darkMode
                              ? 'bg-gray-600 hover:bg-gray-500'
                              : 'bg-gray-200 hover:bg-gray-300'
                          }`}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateEditingItemQuantity(
                              item.productId,
                              parseInt(e.target.value) || 1
                            )
                          }
                          className={`w-12 text-center px-2 py-1 rounded text-sm ${
                            darkMode
                              ? 'bg-gray-600 border-gray-500 text-white'
                              : 'bg-white border-gray-300'
                          } border`}
                        />
                        <button
                          onClick={() =>
                            handleUpdateEditingItemQuantity(item.productId, item.quantity + 1)
                          }
                          className={`px-2 py-1 rounded text-sm ${
                            darkMode
                              ? 'bg-gray-600 hover:bg-gray-500'
                              : 'bg-gray-200 hover:bg-gray-300'
                          }`}
                        >
                          +
                        </button>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="font-semibold text-green-600 text-sm">
                          {formatCurrency(item.price * item.quantity)}
                        </p>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItemFromEditingSale(item.productId)}
                        className="ml-2"
                      >
                        <X className="size-4 text-red-600" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add New Items */}
            <div className="pt-4 border-t" style={{borderColor: darkMode ? '#374151' : '#e5e7eb'}}>
              <Label htmlFor="edit-search" className={darkMode ? 'text-gray-200' : ''}>
                Agregar Más Productos
              </Label>
              <div className="relative mt-2">
                <Scan className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  id="edit-search"
                  placeholder="Buscar producto para agregar..."
                  value={editSearchInput}
                  onChange={(e) => handleEditSearchInput(e.target.value)}
                  className={`pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                />
              </div>

              {editFilteredProducts.length > 0 && (
                <div className={`mt-2 border rounded-lg max-h-40 overflow-y-auto ${
                  darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                }`}>
                  {editFilteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleAddItemToEditingSale(product)}
                      className={`w-full text-left p-2 hover:bg-blue-500 hover:text-white transition-colors text-sm ${
                        darkMode ? 'border-gray-600' : 'border-gray-200'
                      } border-b last:border-b-0`}
                    >
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs opacity-75">
                        {formatCurrency(product.price)} • Stock: {formatNumber(product.stock)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Total */}
            {editingSaleItems.length > 0 && (
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Total del Pedido
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(editingSaleItems.reduce((sum, item) => sum + item.price * item.quantity, 0))}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEditedSale}
              disabled={editingSaleItems.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Save Dialog */}
      <Dialog open={isConfirmSaveOpen} onOpenChange={setIsConfirmSaveOpen}>
        <DialogContent className={`sm:max-w-[400px] ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Confirmar Cambios</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              ¿Estás seguro de que deseas guardar los cambios en este pedido?
            </DialogDescription>
          </DialogHeader>
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Total del pedido: <span className="font-bold text-green-600">
                {formatCurrency(editingSaleItems.reduce((sum, item) => sum + item.price * item.quantity, 0))}
              </span>
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmSaveOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSave}
              className="bg-green-600 hover:bg-green-700"
            >
              Sí, Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Cancel Sale Dialog */}
      <Dialog open={isConfirmCancelOpen} onOpenChange={setIsConfirmCancelOpen}>
        <DialogContent className={`sm:max-w-[400px] ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Cancelar Pedido</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              ¿Estás seguro de que deseas cancelar este pedido? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className={`flex items-start gap-3 p-4 rounded-lg ${darkMode ? 'bg-red-900 bg-opacity-20 border border-red-800' : 'bg-red-50 border border-red-200'}`}>
            <AlertCircle className={`size-5 ${darkMode ? 'text-red-400' : 'text-red-600'} flex-shrink-0 mt-0.5`} />
            <p className={`text-sm ${darkMode ? 'text-red-200' : 'text-red-800'}`}>
              Se eliminará el pedido del historial de ventas.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmCancelOpen(false)}
            >
              No, Mantener
            </Button>
            <Button
              onClick={handleConfirmCancel}
              className="bg-red-600 hover:bg-red-700"
            >
              Sí, Cancelar Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Name Dialog */}
      <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
        <DialogContent className={`sm:max-w-[400px] ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Información del Cliente</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              Selecciona la empresa cliente para registrar la venta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="customer-name" className={darkMode ? 'text-gray-200' : ''}>
                Empresa Cliente
              </Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  id="customer-name"
                  placeholder="Buscar empresa cliente"
                  value={customerSearchText}
                  autoComplete="new-password"
                  onFocus={() => setIsCustomerDialogSearchOpen(true)}
                  onBlur={() => setTimeout(() => setIsCustomerDialogSearchOpen(false), 120)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCustomerSearchText(value);
                    setCustomerName(value);
                    setIsCustomerDialogSearchOpen(true);

                    const exactMatch = clientOptions.find(
                      (client) =>
                        client.nombreEmpresa.trim().toLowerCase() === value.trim().toLowerCase()
                    );

                    if (exactMatch) {
                      setCustomerId(exactMatch.id);
                      setCustomerAddress(exactMatch.direccion || "");
                    } else {
                      setCustomerId("");
                      setCustomerAddress("");
                    }
                  }}
                  className={`pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                />

                {isCustomerDialogSearchOpen && (
                  <div
                    className={`absolute z-30 mt-1 w-full rounded-md border max-h-64 overflow-auto ${
                      darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                    }`}
                  >
                    {filterClientsByQuery(customerSearchText).slice(0, 15).map((client) => (
                      <button
                        key={`dialog-client-search-${client.id}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleClientSelection(client)}
                        className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${
                          darkMode
                            ? 'border-gray-700 hover:bg-gray-700 text-gray-100'
                            : 'border-gray-100 hover:bg-gray-50 text-gray-900'
                        }`}
                      >
                        <p className="text-sm font-medium">{client.nombreEmpresa}</p>
                      </button>
                    ))}
                    {filterClientsByQuery(customerSearchText).length === 0 && (
                      <div className={`px-3 py-2 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        No hay coincidencias para esta empresa.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Total a vender: <span className="font-bold text-green-600">
                  {formatCurrency(cartTotal)}
                </span>
              </p>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                Productos: {formatNumber(cart.length)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCustomerDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmCompleteSale}
              disabled={!customerId.trim() || isCompletingSale}
              className="bg-green-600 hover:bg-green-700"
            >
              {isCompletingSale ? "Procesando..." : "Confirmar Venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Add Product Modal */}
      <Dialog open={isAddProductModalOpen} onOpenChange={(open) => {
        setIsAddProductModalOpen(open);
        if (!open) { setSelectedProductToAdd(null); setAddProductQuantity(1); }
      }}>
        <DialogContent className={`sm:max-w-[420px] ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Agregar al Pedido</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              Revisa la información del producto e indica la cantidad a agregar
            </DialogDescription>
          </DialogHeader>

          {selectedProductToAdd && (
            <div className="space-y-4 py-2">
              {/* Product info card */}
              <div className={`p-4 rounded-lg border-2 ${darkMode ? 'bg-gray-700 border-blue-600' : 'bg-blue-50 border-blue-200'}`}>
                <p className={`text-lg font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {selectedProductToAdd.name}
                </p>
                {selectedProductToAdd.barcode && (
                  <p className={`text-xs mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Código: {selectedProductToAdd.barcode}
                  </p>
                )}
                {selectedProductToAdd.category && (
                  <p className={`text-xs mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Categoría: {selectedProductToAdd.category}
                  </p>
                )}
                {selectedProductToAdd.observations && (
                  <p className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Notas: {selectedProductToAdd.observations}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2 pt-2 border-t"
                  style={{ borderColor: darkMode ? '#4b5563' : '#bfdbfe' }}>
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Precio unitario</span>
                  <span className="text-xl font-bold text-green-600">{formatCurrency(getEffectiveUnitPrice(selectedProductToAdd))}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Stock disponible</span>
                  <span className={`font-semibold ${selectedProductToAdd.stock <= 5 ? 'text-orange-500' : 'text-blue-600'}`}>
                    {formatNumber(selectedProductToAdd.stock)} unidades
                  </span>
                </div>
              </div>

              {/* Low stock warning */}
              {selectedProductToAdd.stock <= 5 && (
                <div className={`flex items-start gap-2 p-3 rounded-lg border ${darkMode ? 'bg-yellow-900 bg-opacity-30 border-yellow-700' : 'bg-yellow-50 border-yellow-300'}`}>
                  <AlertCircle className={`size-4 flex-shrink-0 mt-0.5 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                  <p className={`text-sm ${darkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>
                    {selectedProductToAdd.stock === 0
                      ? 'Sin stock disponible'
                      : `Stock bajo: solo quedan ${formatNumber(selectedProductToAdd.stock)} unidades`}
                  </p>
                </div>
              )}

              {/* Quantity selector */}
              <div>
                <Label className={`mb-2 block ${darkMode ? 'text-gray-200' : ''}`}>Cantidad a agregar</Label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAddProductQuantity(Math.max(1, addProductQuantity - 1))}
                    className={`w-10 h-10 rounded-lg text-lg font-bold ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={selectedProductToAdd.stock}
                    value={addProductQuantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setAddProductQuantity(Math.min(Math.max(1, val), selectedProductToAdd.stock));
                    }}
                    className={`w-20 text-center text-xl font-bold px-2 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                  />
                  <button
                    onClick={() => setAddProductQuantity(Math.min(selectedProductToAdd.stock, addProductQuantity + 1))}
                    className={`w-10 h-10 rounded-lg text-lg font-bold ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                  >
                    +
                  </button>
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    = {formatCurrency(getEffectiveUnitPrice(selectedProductToAdd) * addProductQuantity)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddProductModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmAddProduct} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="size-4 mr-2" />
              Agregar al Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sales Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className={`sm:max-w-[500px] max-h-[90vh] ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Detalles de la Venta</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              Información completa de la transacción
            </DialogDescription>
          </DialogHeader>

          {selectedSaleForDetails && (
            <div className="space-y-4 max-h-96 overflow-y-auto py-4">
              {/* Sale ID and Customer */}
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  ID de Venta
                </p>
                <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                  #{selectedSaleForDetails.id.slice(-4)}
                </p>
              </div>

              {/* Customer Information */}
              <div className={`p-4 rounded-lg border-2 ${darkMode ? 'bg-gray-700 border-purple-600' : 'bg-purple-50 border-purple-200'}`}>
                <p className={`text-sm font-semibold mb-3 ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                  Información del Cliente
                </p>
                <div className="space-y-3">
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Nombre
                    </p>
                    <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                      {selectedSaleForDetails.customerName || 'No especificado'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Dirección / Domicilio
                    </p>
                    <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                      {selectedSaleForDetails.customerAddress || 'No especificado'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Teléfono
                    </p>
                    <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                      {selectedSaleForDetails.customerPhone || 'No especificado'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Correo
                    </p>
                    <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                      {selectedSaleForDetails.customerEmail || 'No especificado'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Fecha
                  </p>
                  <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                    {selectedSaleForDetails.date}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Hora
                  </p>
                  <p className={`font-semibold ${darkMode ? 'text-white' : ''}`}>
                    {selectedSaleForDetails.time}
                  </p>
                </div>
              </div>

              {/* Products */}
              <div>
                <p className={`text-sm font-semibold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Productos
                </p>
                <div className="space-y-2">
                  {selectedSaleForDetails.items.map((item) => (
                    <div
                      key={item.productId}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 rounded ${
                        darkMode ? 'bg-gray-700' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex-1">
                        <p className={`font-medium text-sm ${darkMode ? 'text-white' : ''}`}>
                          {item.name}
                        </p>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {formatCurrency(item.price)} × {formatNumber(item.quantity)}
                        </p>
                      </div>
                      <p className="font-semibold text-green-600 text-left sm:text-right">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className={`p-3 rounded-lg border-t-2 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Total de la Venta
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(selectedSaleForDetails.total)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setIsDetailsDialogOpen(false);
              }}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Name Dialog */}
      <Dialog open={isEditCustomerDialogOpen} onOpenChange={setIsEditCustomerDialogOpen}>
        <DialogContent className={`sm:max-w-[400px] ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Editar Información del Cliente</DialogTitle>
            <DialogDescription className={darkMode ? 'text-gray-400' : ''}>
              Modifica el nombre y dirección del cliente para esta venta
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-customer-name" className={darkMode ? 'text-gray-200' : ''}>
                Nombre del Cliente
              </Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  id="edit-customer-name"
                  placeholder="Busca un cliente"
                  value={editingCustomerName}
                  autoComplete="new-password"
                  onFocus={() => setIsEditCustomerNameSearchOpen(true)}
                  onBlur={() => setTimeout(() => setIsEditCustomerNameSearchOpen(false), 120)}
                  onChange={(e) => {
                    setEditingCustomerName(e.target.value);
                    setIsEditCustomerNameSearchOpen(true);
                  }}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 pl-10' : 'pl-10'}
                />

                {isEditCustomerNameSearchOpen && (
                  <div
                    className={`absolute z-30 mt-1 w-full rounded-md border max-h-64 overflow-auto ${
                      darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                    }`}
                  >
                    {filterClientsByQuery(editingCustomerName).slice(0, 12).map((client) => (
                      <button
                        key={`edit-customer-dialog-${client.id}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setEditingCustomerName(client.nombreEmpresa);
                          setIsEditCustomerNameSearchOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${
                          darkMode
                            ? 'border-gray-700 hover:bg-gray-700 text-gray-100'
                            : 'border-gray-100 hover:bg-gray-50 text-gray-900'
                        }`}
                      >
                        <p className="text-sm font-medium">{client.nombreEmpresa}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="edit-customer-address" className={darkMode ? 'text-gray-200' : ''}>
                Dirección / Domicilio
              </Label>
              <Input
                id="edit-customer-address"
                placeholder="Ingresa la dirección de entrega"
                value={editingCustomerAddress}
                onChange={(e) => setEditingCustomerAddress(e.target.value)}
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 mt-2' : 'mt-2'}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && editingCustomerName.trim()) {
                    handleConfirmEditCustomerName();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditCustomerDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmEditCustomerName}
              disabled={!editingCustomerName.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}