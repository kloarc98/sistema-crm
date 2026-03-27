import { useState } from "react";
import { Package, TrendingDown, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useTheme } from "../context/ThemeContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useProducts } from "../context/ProductContext";
import { formatCurrency, formatNumber } from "../utils/numberFormat";

interface Expense {
  id: string;
  productName: string;
  category: string;
  cost: number;
  quantity: number;
  supplier: string;
  date: string;
}

export function Expenses() {
  const { products } = useProducts();
  const { darkMode } = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([
    {
      id: "1",
      productName: "Wireless Mouse",
      category: "Electronics",
      cost: 15.50,
      quantity: 50,
      supplier: "Tech Supplies Inc",
      date: "2026-02-14",
    },
    {
      id: "2",
      productName: "USB Cable",
      category: "Accessories",
      cost: 5.99,
      quantity: 100,
      supplier: "Cable World",
      date: "2026-02-13",
    },
    {
      id: "3",
      productName: "Laptop Stand",
      category: "Accessories",
      cost: 25.00,
      quantity: 30,
      supplier: "Office Pro",
      date: "2026-02-12",
    },
  ]);

  const [selectedProductName, setSelectedProductName] = useState("");
  const [category, setCategory] = useState("");
  const [cost, setCost] = useState("");
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");

  const handleAddExpense = () => {
    if (!selectedProductName || !category || !cost || !quantity || !supplier) return;

    const newExpense: Expense = {
      id: Date.now().toString(),
      productName: selectedProductName,
      category,
      cost: parseFloat(cost),
      quantity: parseInt(quantity),
      supplier,
      date: new Date().toISOString().split("T")[0],
    };

    setExpenses([newExpense, ...expenses]);
    setSelectedProductName("");
    setCategory("");
    setCost("");
    setQuantity("");
    setSupplier("");
  };

  const handleProductSelect = (productName: string) => {
    setSelectedProductName(productName);
    const product = products.find(p => p.name === productName);
    if (product) {
      setCategory(product.category);
    }
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses(expenses.filter((e) => e.id !== id));
  };

  const totalExpenses = expenses.reduce((sum, expense) => sum + (expense.cost * expense.quantity), 0);
  const totalItems = expenses.reduce((sum, expense) => sum + expense.quantity, 0);
  const totalProducts = expenses.length;

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8 sm:mb-10">
        <h1 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-white' : ''}`}>Compras</h1>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Registra las compras de productos</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm text-gray-600 mb-1 ${darkMode ? 'text-gray-400' : ''}`}>Total de Compras</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(totalExpenses)}
                </p>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <TrendingDown className="size-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total de Artículos</p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-white' : ''}`}>{formatNumber(totalItems)}</p>
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
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tipos de Productos</p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-white' : ''}`}>{formatNumber(totalProducts)}</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <Package className="size-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Expense Form */}
        <Card className={`lg:col-span-1 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="size-5 text-red-600" />
              <CardTitle className={darkMode ? 'text-white' : ''}>Agregar Compra</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="expense-product" className={darkMode ? 'text-gray-200' : ''}>Nombre del Producto</Label>
                <Select value={selectedProductName} onValueChange={handleProductSelect}>
                  <SelectTrigger className={darkMode ? 'bg-gray-700 border-gray-600' : ''}>
                    <SelectValue placeholder="Selecciona un producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.name}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Si el producto no existe, agrégalo en la sección de Productos
                </p>
              </div>

              <div>
                <Label htmlFor="expense-category" className={darkMode ? 'text-gray-200' : ''}>Categoría</Label>
                <Input
                  id="expense-category"
                  placeholder="Ej: Electrónica, Accesorios"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={!!selectedProductName}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="expense-cost" className={darkMode ? 'text-gray-200' : ''}>Costo por Unidad (Q)</Label>
                <Input
                  id="expense-cost"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="expense-quantity" className={darkMode ? 'text-gray-200' : ''}>Cantidad</Label>
                <Input
                  id="expense-quantity"
                  type="number"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <div>
                <Label htmlFor="expense-supplier" className={darkMode ? 'text-gray-200' : ''}>Proveedor</Label>
                <Input
                  id="expense-supplier"
                  placeholder="Ingresa el nombre del proveedor"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
                />
              </div>

              <Button onClick={handleAddExpense} className="w-full">
                <Plus className="size-4 mr-2" />
                Agregar Compra
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Expenses Product List */}
        <Card className={`lg:col-span-2 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
          <CardHeader>
            <CardTitle className={darkMode ? 'text-white' : ''}>Compras de Productos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expenses.length === 0 ? (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  No se han registrado compras aún
                </div>
              ) : (
                expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className={`flex flex-col gap-3 p-4 rounded-lg transition-colors sm:flex-row sm:items-center sm:justify-between ${
                      darkMode
                        ? 'bg-gray-700 hover:bg-gray-600'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4 flex-1 min-w-0">
                      <div className="bg-red-100 p-3 rounded-lg shrink-0">
                        <Package className="size-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium break-words ${darkMode ? 'text-white' : ''}`}>{expense.productName}</p>
                        <p className={`text-sm break-words ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {expense.category} • {expense.supplier} • Cant: {formatNumber(expense.quantity)}
                        </p>
                        <p className={`text-xs ${darkMode ? 'text-gray-500' : ''}`}>{expense.date}</p>
                      </div>
                      <div className="text-left sm:text-right sm:ml-auto">
                        <p className="font-semibold text-red-600 text-lg">
                          -{formatCurrency(expense.cost * expense.quantity)}
                        </p>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {formatCurrency(expense.cost)} por unidad
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteExpense(expense.id)}
                      className="self-end sm:self-auto sm:ml-2"
                    >
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}