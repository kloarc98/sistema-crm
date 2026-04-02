import { useEffect, useState } from "react";
import { Save, Store, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useAlert } from "../context/AlertContext";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  fetchGlobalLowStockThreshold,
  DEFAULT_PAYMENT_REMINDER_DAYS,
  fetchGlobalPaymentReminderDays,
  loadPaymentReminderDays,
  loadLowStockThreshold,
  saveGlobalLowStockThreshold,
  saveGlobalPaymentReminderDays,
} from "../utils/paymentReminderSettings";

const STORE_SETTINGS_KEY = "settings:store-info";

type StoreInfo = {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
};

const DEFAULT_STORE_INFO: StoreInfo = {
  storeName: "Mi Tienda",
  storeAddress: "",
  storePhone: "",
  storeEmail: "",
};

const loadStoreInfo = (): StoreInfo => {
  try {
    const raw = localStorage.getItem(STORE_SETTINGS_KEY);
    if (!raw) return DEFAULT_STORE_INFO;

    const parsed = JSON.parse(raw);
    return {
      storeName: typeof parsed?.storeName === "string" ? parsed.storeName : DEFAULT_STORE_INFO.storeName,
      storeAddress: typeof parsed?.storeAddress === "string" ? parsed.storeAddress : DEFAULT_STORE_INFO.storeAddress,
      storePhone: typeof parsed?.storePhone === "string" ? parsed.storePhone : DEFAULT_STORE_INFO.storePhone,
      storeEmail: typeof parsed?.storeEmail === "string" ? parsed.storeEmail : DEFAULT_STORE_INFO.storeEmail,
    };
  } catch {
    return DEFAULT_STORE_INFO;
  }
};

export function Settings() {
  const { darkMode } = useTheme();
  const { user } = useAuth();
  const { addAlert } = useAlert();
  const normalizedRole = (user?.role || "").toLowerCase().trim();
  const isAdmin = normalizedRole === "admin" || normalizedRole.includes("admin");
  const isJefe = normalizedRole === "jefe" || normalizedRole.includes("jefe");
  const canManageGlobalSettings = isAdmin || isJefe;
  const [storeInfo, setStoreInfo] = useState<StoreInfo>(loadStoreInfo);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [dailyReports, setDailyReports] = useState(false);
  const [paymentReminderDays, setPaymentReminderDays] = useState<string>(() => String(loadPaymentReminderDays()));
  const [paymentReminderError, setPaymentReminderError] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState<string>(() => String(loadLowStockThreshold()));
  const [lowStockThresholdError, setLowStockThresholdError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactError, setContactError] = useState("");

  useEffect(() => {
    localStorage.setItem(STORE_SETTINGS_KEY, JSON.stringify(storeInfo));
  }, [storeInfo]);

  useEffect(() => {
    const syncGlobalReminder = async () => {
      const [globalDays, globalLowStockThreshold] = await Promise.all([
        fetchGlobalPaymentReminderDays(),
        fetchGlobalLowStockThreshold(),
      ]);

      setPaymentReminderDays(String(globalDays));
      setLowStockThreshold(String(globalLowStockThreshold));
    };

    syncGlobalReminder();
  }, []);

  useEffect(() => {
    const loadMyContactData = async () => {
      try {
        const response = await fetch("/api/auth/me/contact");
        if (!response.ok) {
          return;
        }

        const payload = await response.json().catch(() => ({}));
        setContactEmail(String(payload?.correo || ""));
        setContactPhone(String(payload?.telefono || ""));
      } catch {
        // Ignore transient fetch errors
      }
    };

    loadMyContactData();
  }, []);

  const handleSave = async () => {
    if (!canManageGlobalSettings) {
      return;
    }

    const reminderDaysValue = Number(paymentReminderDays);
    if (!Number.isFinite(reminderDaysValue) || reminderDaysValue < 1 || reminderDaysValue > 365) {
      setPaymentReminderError("Ingresa un valor valido entre 1 y 365 dias");
      return;
    }

    const lowStockThresholdValue = Number(lowStockThreshold);
    if (!Number.isFinite(lowStockThresholdValue) || lowStockThresholdValue < 1 || lowStockThresholdValue > 999) {
      setLowStockThresholdError("Ingresa un valor valido entre 1 y 999");
      return;
    }

    try {
      const [normalizedReminderDays, normalizedLowStockThreshold] = await Promise.all([
        saveGlobalPaymentReminderDays(reminderDaysValue, {
          userId: user?.id,
          role: user?.role,
        }),
        saveGlobalLowStockThreshold(lowStockThresholdValue, {
          userId: user?.id,
          role: user?.role,
        }),
      ]);

      setPaymentReminderDays(String(normalizedReminderDays));
      setLowStockThreshold(String(normalizedLowStockThreshold));
      setPaymentReminderError("");
      setLowStockThresholdError("");
      addAlert("✓ Configuración de alertas guardada correctamente", "success");
    } catch (err) {
      setPaymentReminderError(err instanceof Error ? err.message : "No se pudo guardar la configuracion global");
    }
  };

  const handlePasswordSave = async () => {
    setPasswordError("");
    setPasswordMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Completa todos los campos de contraseña");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmación de contraseña no coincide");
      return;
    }

    try {
      const response = await fetch("/api/auth/me/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": String(user?.id || ""),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "No se pudo actualizar la contraseña");
      }

      setPasswordMessage("Contraseña actualizada correctamente");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "No se pudo actualizar la contraseña");
    }
  };

  const handleContactSave = async () => {
    setContactError("");
    setContactMessage("");

    const normalizedEmail = contactEmail.trim();
    const normalizedPhone = contactPhone.trim();

    if (!normalizedEmail) {
      setContactError("El correo es requerido");
      return;
    }

    try {
      const response = await fetch("/api/auth/me/contact", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          correo: normalizedEmail,
          telefono: normalizedPhone,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo actualizar la información de contacto");
      }

      setContactEmail(String(payload?.correo || normalizedEmail));
      setContactPhone(String(payload?.telefono || normalizedPhone));
      setContactMessage("Información de contacto actualizada correctamente");
      addAlert("✓ Información de contacto actualizada correctamente", "success");
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "No se pudo actualizar la información de contacto");
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8 sm:mb-10">
        <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? 'text-white' : ''}`}>Configuración</h1>
        <p className={`text-sm sm:text-base ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Configura las preferencias de tu tienda</p>
      </div>

      <div className="space-y-6 sm:space-y-8">
        {!canManageGlobalSettings && (
          <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardHeader>
              <CardTitle className={darkMode ? 'text-white' : ''}>Configuración de Vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Tienes acceso de solo lectura a esta sección. Solo puedes cambiar tu contraseña.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Store Information */}
        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Store className="size-5 text-blue-600" />
              <CardTitle className={darkMode ? 'text-white' : ''}>Información de la Tienda</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="store-name" className={darkMode ? 'text-gray-200' : ''}>Nombre de la Tienda</Label>
              <Input
                id="store-name"
                value={storeInfo.storeName}
                onChange={(e) => setStoreInfo((prev) => ({ ...prev, storeName: e.target.value }))}
                placeholder="Ingresa el nombre de tu tienda"
                disabled={!canManageGlobalSettings}
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>

            <div>
              <Label htmlFor="store-address" className={darkMode ? 'text-gray-200' : ''}>Dirección de la Tienda</Label>
              <Input
                id="store-address"
                value={storeInfo.storeAddress}
                onChange={(e) => setStoreInfo((prev) => ({ ...prev, storeAddress: e.target.value }))}
                placeholder="Calle 123, Ciudad, Estado, Código Postal"
                disabled={!canManageGlobalSettings}
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>

            <div>
              <Label htmlFor="store-phone" className={darkMode ? 'text-gray-200' : ''}>Número de Teléfono</Label>
              <Input
                id="store-phone"
                type="tel"
                value={storeInfo.storePhone}
                onChange={(e) => setStoreInfo((prev) => ({ ...prev, storePhone: e.target.value }))}
                placeholder="(555) 123-4567"
                disabled={!canManageGlobalSettings}
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>

            <div>
              <Label htmlFor="store-email" className={darkMode ? 'text-gray-200' : ''}>Correo Electrónico</Label>
              <Input
                id="store-email"
                type="email"
                value={storeInfo.storeEmail}
                onChange={(e) => setStoreInfo((prev) => ({ ...prev, storeEmail: e.target.value }))}
                placeholder="tienda@ejemplo.com"
                disabled={!canManageGlobalSettings}
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>
          </CardContent>
        </Card>

        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <CardTitle className={darkMode ? 'text-white' : ''}>Cambiar Contraseña</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="contact-email" className={darkMode ? 'text-gray-200' : ''}>Correo Electrónico</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => {
                  setContactEmail(e.target.value);
                  setContactError("");
                  setContactMessage("");
                }}
                placeholder="usuario@correo.com"
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>
            <div>
              <Label htmlFor="contact-phone" className={darkMode ? 'text-gray-200' : ''}>Teléfono</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => {
                  setContactPhone(e.target.value);
                  setContactError("");
                  setContactMessage("");
                }}
                placeholder="5555-5555"
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>

            {!!contactError && <p className="text-sm text-red-600">{contactError}</p>}
            {!!contactMessage && <p className="text-sm text-green-600">{contactMessage}</p>}

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleContactSave}>Actualizar Correo y Teléfono</Button>
            </div>

            <div className="border-t pt-4" style={{ borderColor: darkMode ? '#4b5563' : '#e5e7eb' }}>
              <p className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Cambio de Contraseña</p>
            </div>
            <div>
              <Label htmlFor="current-password" className={darkMode ? 'text-gray-200' : ''}>Contraseña Actual</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>
            <div>
              <Label htmlFor="new-password" className={darkMode ? 'text-gray-200' : ''}>Nueva Contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password" className={darkMode ? 'text-gray-200' : ''}>Confirmar Nueva Contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>

            {!!passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {!!passwordMessage && <p className="text-sm text-green-600">{passwordMessage}</p>}

            <div className="flex justify-end">
              <Button onClick={handlePasswordSave}>Actualizar Contraseña</Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="size-5 text-purple-600" />
              <CardTitle className={darkMode ? 'text-white' : ''}>Notificaciones y Alertas</CardTitle>
            </div>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Alertas actualizadas: saldo pendiente y bajo stock configurable.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className={darkMode ? 'text-gray-200' : ''}>Notificaciones por Correo</Label>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Recibe actualizaciones por correo sobre tu tienda
                </p>
              </div>
              <Switch
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
                disabled={!canManageGlobalSettings}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className={darkMode ? 'text-gray-200' : ''}>Alertas de Bajo Stock</Label>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Recibe notificaciones cuando los productos estén bajos
                </p>
              </div>
              <Switch
                checked={lowStockAlerts}
                onCheckedChange={setLowStockAlerts}
                disabled={!canManageGlobalSettings}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className={darkMode ? 'text-gray-200' : ''}>Reportes Diarios</Label>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Recibe resumen diario de ventas y compras
                </p>
              </div>
              <Switch
                checked={dailyReports}
                onCheckedChange={setDailyReports}
                disabled={!canManageGlobalSettings}
              />
            </div>

            <div>
              <Label htmlFor="payment-reminder-days" className={darkMode ? "text-gray-200" : ""}>
                Dias para alerta de cobro
              </Label>
              <Input
                id="payment-reminder-days"
                type="number"
                min="1"
                max="365"
                step="1"
                value={paymentReminderDays}
                onChange={(e) => {
                  setPaymentReminderDays(e.target.value.replace(/\D/g, ""));
                  setPaymentReminderError("");
                }}
                disabled={!canManageGlobalSettings}
                placeholder={String(DEFAULT_PAYMENT_REMINDER_DAYS)}
                className={darkMode ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400" : ""}
              />
              <p className={`mt-1 text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                La campana mostrara alertas cuando un pedido tenga saldo pendiente y se cumpla este numero de dias desde su creacion. Este valor es global para todos los usuarios con ventas.
              </p>
              {!!paymentReminderError && <p className="mt-1 text-sm text-red-600">{paymentReminderError}</p>}
            </div>

            <div>
              <Label htmlFor="low-stock-threshold" className={darkMode ? "text-gray-200" : ""}>
                Cantidad minima para bajo stock
              </Label>
              <Input
                id="low-stock-threshold"
                type="number"
                min="1"
                max="999"
                step="1"
                value={lowStockThreshold}
                onChange={(e) => {
                  setLowStockThreshold(e.target.value.replace(/\D/g, ""));
                  setLowStockThresholdError("");
                }}
                disabled={!canManageGlobalSettings}
                placeholder={String(DEFAULT_LOW_STOCK_THRESHOLD)}
                className={darkMode ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400" : ""}
              />
              <p className={`mt-1 text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                La campana mostrara productos con stock menor o igual a este valor. Solo admin o jefe pueden cambiarlo.
              </p>
              <p className={`mt-1 text-xs ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
                Valor actual aplicado en notificaciones: {lowStockThreshold || DEFAULT_LOW_STOCK_THRESHOLD}
              </p>
              {!!lowStockThresholdError && <p className="mt-1 text-sm text-red-600">{lowStockThresholdError}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        {canManageGlobalSettings && (
          <div className="flex justify-end">
            <Button onClick={handleSave} size="lg">
              <Save className="size-4 mr-2" />
              Guardar Configuración
            </Button>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}