import { useEffect, useState } from "react";
import { ShieldCheck, Plus, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useAlert } from "../context/AlertContext";

interface ScreenPermission {
  screenId: number;
  screenKey: string;
  screenName: string;
  screenPath: string;
  canView: boolean;
}

interface RoleScreenPermissionsRecord {
  roleId: number;
  roleName: string;
  roleStatus?: string;
  screens: ScreenPermission[];
}

export function RoleScreenPermissions() {
  const { darkMode } = useTheme();
  const { user } = useAuth();
  const { addAlert } = useAlert();
  const normalizedRole = (user?.role || "").toLowerCase().trim();
  const isAdmin = normalizedRole === "admin" || normalizedRole.includes("admin");

  const [roleScreenPermissions, setRoleScreenPermissions] = useState<RoleScreenPermissionsRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingRoleId, setIsSavingRoleId] = useState<number | null>(null);
  const [isStatusChangingRoleId, setIsStatusChangingRoleId] = useState<number | null>(null);
  const [roleNameInput, setRoleNameInput] = useState("");
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isEditScreensOpen, setIsEditScreensOpen] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [draftRoleName, setDraftRoleName] = useState("");
  const [draftScreens, setDraftScreens] = useState<ScreenPermission[]>([]);
  const [maxTotalUsersInput, setMaxTotalUsersInput] = useState("");
  const [isLoadingUserLimit, setIsLoadingUserLimit] = useState(false);
  const [isSavingUserLimit, setIsSavingUserLimit] = useState(false);
  const [maxTotalProductsInput, setMaxTotalProductsInput] = useState("");
  const [isLoadingProductLimit, setIsLoadingProductLimit] = useState(false);
  const [isSavingProductLimit, setIsSavingProductLimit] = useState(false);
  const [error, setError] = useState("");

  const loadRoleScreenPermissions = async () => {
    if (!isAdmin) {
      setRoleScreenPermissions([]);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/settings/roles/screens", {
        headers: {
          "x-user-role": String(user?.role || ""),
        },
      });

      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudieron cargar permisos por rol");
      }

      setRoleScreenPermissions(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setRoleScreenPermissions([]);
      setError(err instanceof Error ? err.message : "No se pudieron cargar permisos por rol");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRoleScreenPermissions();
  }, [isAdmin, user?.role]);

  const loadMaxTotalUsersSetting = async () => {
    if (!isAdmin) {
      setMaxTotalUsersInput("");
      return;
    }

    setIsLoadingUserLimit(true);
    try {
      const response = await fetch("/api/auth/settings/max-total-users", {
        headers: {
          "x-user-role": String(user?.role || ""),
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo cargar el límite global de usuarios");
      }

      const nextValue = payload?.maxTotalUsers;
      setMaxTotalUsersInput(nextValue === null || typeof nextValue === "undefined" ? "" : String(nextValue));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el límite global de usuarios");
    } finally {
      setIsLoadingUserLimit(false);
    }
  };

  useEffect(() => {
    loadMaxTotalUsersSetting();
  }, [isAdmin, user?.role]);

  const loadMaxTotalProductsSetting = async () => {
    if (!isAdmin) {
      setMaxTotalProductsInput("");
      return;
    }

    setIsLoadingProductLimit(true);
    try {
      const response = await fetch("/api/auth/settings/max-total-products", {
        headers: {
          "x-user-role": String(user?.role || ""),
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo cargar el límite global de productos");
      }

      const nextValue = payload?.maxTotalProducts;
      setMaxTotalProductsInput(nextValue === null || typeof nextValue === "undefined" ? "" : String(nextValue));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el límite global de productos");
    } finally {
      setIsLoadingProductLimit(false);
    }
  };

  useEffect(() => {
    loadMaxTotalProductsSetting();
  }, [isAdmin, user?.role]);

  const selectedRole = roleScreenPermissions.find((entry) => entry.roleId === selectedRoleId) || null;

  const openEditScreensModal = (roleId: number) => {
    const roleItem = roleScreenPermissions.find((entry) => entry.roleId === roleId);
    if (!roleItem) {
      return;
    }

    setSelectedRoleId(roleId);
    setDraftRoleName(String(roleItem.roleName || ""));
    setDraftScreens(roleItem.screens.map((screen) => ({ ...screen })));
    setIsEditScreensOpen(true);
  };

  const updateDraftScreenToggle = (screenId: number, canView: boolean) => {
    setDraftScreens((prev) =>
      prev.map((screen) => (screen.screenId === screenId ? { ...screen, canView } : screen))
    );
  };

  const handleSaveRolePermissions = async () => {
    if (!selectedRoleId || !selectedRole) {
      return;
    }

    setError("");
    setIsSavingRoleId(selectedRoleId);

    try {
      const normalizedRoleName = draftRoleName.trim();
      if (!normalizedRoleName) {
        throw new Error("El nombre del rol es requerido");
      }

      const response = await fetch(`/api/auth/settings/roles/${selectedRoleId}/screens`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": String(user?.role || ""),
        },
        body: JSON.stringify({
          roleName: normalizedRoleName,
          screenPermissions: draftScreens.map((screen) => ({
            screenId: screen.screenId,
            canView: screen.canView,
          })),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudieron guardar permisos por rol");
      }

      setRoleScreenPermissions((prev) =>
        prev.map((roleItem) =>
          roleItem.roleId === selectedRoleId
            ? {
                ...roleItem,
                roleName: normalizedRoleName,
                screens: draftScreens.map((screen) => ({ ...screen })),
              }
            : roleItem
        )
      );

      addAlert(`✓ Rol actualizado: ${normalizedRoleName}`, "success");
      window.dispatchEvent(new CustomEvent("role-permissions:changed"));
      setIsEditScreensOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar permisos por rol");
    } finally {
      setIsSavingRoleId(null);
    }
  };

  const handleChangeRoleStatus = async (roleId: number, nextStatus: "activo" | "inactivo") => {
    setError("");
    setIsStatusChangingRoleId(roleId);

    try {
      const response = await fetch(`/api/auth/settings/roles/${roleId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": String(user?.role || ""),
        },
        body: JSON.stringify({ estado: nextStatus }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo cambiar estado del rol");
      }

      setRoleScreenPermissions((prev) =>
        prev.map((roleItem) =>
          roleItem.roleId === roleId ? { ...roleItem, roleStatus: nextStatus } : roleItem
        )
      );

      addAlert(`✓ Rol ${nextStatus === "activo" ? "activado" : "inhabilitado"} correctamente`, "success");
      window.dispatchEvent(new CustomEvent("role-permissions:changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar estado del rol");
    } finally {
      setIsStatusChangingRoleId(null);
    }
  };

  const handleCreateRole = async () => {
    const roleName = roleNameInput.trim().toLowerCase();
    if (!roleName) {
      setError("Ingresa un nombre de rol valido");
      return;
    }

    setError("");
    setIsCreatingRole(true);

    try {
      const response = await fetch("/api/auth/settings/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": String(user?.role || ""),
        },
        body: JSON.stringify({ roleName }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo crear el rol");
      }

      addAlert(`✓ Rol ${roleName} creado correctamente`, "success");
      setRoleNameInput("");
      await loadRoleScreenPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el rol");
    } finally {
      setIsCreatingRole(false);
    }
  };

  const handleSaveMaxTotalUsers = async () => {
    setError("");
    setIsSavingUserLimit(true);

    try {
      const trimmed = maxTotalUsersInput.trim();
      const isUnlimited = trimmed === "";

      if (!isUnlimited && !Number.isFinite(Number(trimmed))) {
        throw new Error("Debes ingresar un número válido o dejar el campo vacío para sin límite");
      }

      if (!isUnlimited && Number(trimmed) < 0) {
        throw new Error("El límite global de usuarios no puede ser negativo");
      }

      const response = await fetch("/api/auth/settings/max-total-users", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": String(user?.role || ""),
          "x-user-id": String(user?.id || ""),
        },
        body: JSON.stringify({
          maxTotalUsers: isUnlimited ? null : Number(trimmed),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo guardar el límite global de usuarios");
      }

      const nextValue = payload?.maxTotalUsers;
      setMaxTotalUsersInput(nextValue === null || typeof nextValue === "undefined" ? "" : String(nextValue));
      addAlert("✓ Límite global de usuarios actualizado", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el límite global de usuarios");
    } finally {
      setIsSavingUserLimit(false);
    }
  };

  const handleSaveMaxTotalProducts = async () => {
    setError("");
    setIsSavingProductLimit(true);

    try {
      const trimmed = maxTotalProductsInput.trim();
      const isUnlimited = trimmed === "";

      if (!isUnlimited && !Number.isFinite(Number(trimmed))) {
        throw new Error("Debes ingresar un número válido o dejar el campo vacío para sin límite");
      }

      if (!isUnlimited && Number(trimmed) < 0) {
        throw new Error("El límite global de productos no puede ser negativo");
      }

      const response = await fetch("/api/auth/settings/max-total-products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": String(user?.role || ""),
          "x-user-id": String(user?.id || ""),
        },
        body: JSON.stringify({
          maxTotalProducts: isUnlimited ? null : Number(trimmed),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo guardar el límite global de productos");
      }

      const nextValue = payload?.maxTotalProducts;
      setMaxTotalProductsInput(nextValue === null || typeof nextValue === "undefined" ? "" : String(nextValue));
      addAlert("✓ Límite global de productos actualizado", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el límite global de productos");
    } finally {
      setIsSavingProductLimit(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className={`min-h-screen ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <CardTitle className={darkMode ? "text-white" : ""}>Acceso restringido</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                Solo el administrador puede acceder a esta pantalla.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8 sm:mb-10">
          <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? "text-white" : ""}`}>
            Asignación de Roles y Pantallas
          </h1>
          <p className={`text-sm sm:text-base ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
            Gestiona los permisos por pantalla para cada rol del sistema.
          </p>
        </div>

        <div className="space-y-6">
          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <CardTitle className={darkMode ? "text-white" : ""}>Límite global de usuarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Máximo total de usuarios en el sistema</Label>
                <Input
                  type="number"
                  min="0"
                  value={maxTotalUsersInput}
                  onChange={(e) => setMaxTotalUsersInput(e.target.value)}
                  placeholder="Vacío = sin límite"
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                  disabled={isLoadingUserLimit || isSavingUserLimit}
                />
                <p className={`text-xs mt-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                  Este límite aplica para todo el sistema y no depende del rol.
                </p>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={handleSaveMaxTotalUsers} disabled={isLoadingUserLimit || isSavingUserLimit}>
                  {isSavingUserLimit ? "Guardando..." : "Guardar límite"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <CardTitle className={darkMode ? "text-white" : ""}>Límite global de productos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Máximo total de productos en el sistema</Label>
                <Input
                  type="number"
                  min="0"
                  value={maxTotalProductsInput}
                  onChange={(e) => setMaxTotalProductsInput(e.target.value)}
                  placeholder="Vacío = sin límite"
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                  disabled={isLoadingProductLimit || isSavingProductLimit}
                />
                <p className={`text-xs mt-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                  Este límite aplica para todo el inventario y no depende del rol.
                </p>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={handleSaveMaxTotalProducts} disabled={isLoadingProductLimit || isSavingProductLimit}>
                  {isSavingProductLimit ? "Guardando..." : "Guardar límite"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plus className="size-5 text-green-600" />
                <CardTitle className={darkMode ? "text-white" : ""}>Crear nuevo rol</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Nombre del rol</Label>
                <Input
                  value={roleNameInput}
                  onChange={(e) => setRoleNameInput(e.target.value.toUpperCase())}
                  placeholder="Ejemplo: supervisor"
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={handleCreateRole} disabled={isCreatingRole}>
                  {isCreatingRole ? "Creando..." : "Crear rol"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-blue-600" />
                <CardTitle className={darkMode ? "text-white" : ""}>Roles existentes</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading && (
                <p className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                  Cargando permisos por rol...
                </p>
              )}

              {!!error && <p className="text-sm text-red-600">{error}</p>}

              {!isLoading && roleScreenPermissions.length === 0 && !error && (
                <p className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                  No hay datos de permisos para mostrar.
                </p>
              )}

              {roleScreenPermissions.map((roleItem) => {
                const roleStatus = String(roleItem.roleStatus || "activo").toLowerCase() === "inactivo" ? "inactivo" : "activo";
                return (
                <div
                  key={roleItem.roleId}
                  className={`rounded-lg border p-4 space-y-3 ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className={`font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>
                        Rol: {roleItem.roleName}
                      </p>
                      <p className={`text-xs ${roleStatus === "activo" ? "text-green-600" : "text-orange-600"}`}>
                        Estado: {roleStatus}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openEditScreensModal(roleItem.roleId)}
                      >
                        <Pencil className="size-4 mr-2" />
                        Modificar pantallas
                      </Button>

                      {roleStatus === "inactivo" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleChangeRoleStatus(roleItem.roleId, "activo")}
                          disabled={isStatusChangingRoleId === roleItem.roleId}
                        >
                          <CheckCircle2 className="size-4 mr-2" />
                          {isStatusChangingRoleId === roleItem.roleId ? "Procesando..." : "Activar"}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => handleChangeRoleStatus(roleItem.roleId, "inactivo")}
                          disabled={isStatusChangingRoleId === roleItem.roleId}
                        >
                          <Ban className="size-4 mr-2" />
                          {isStatusChangingRoleId === roleItem.roleId ? "Procesando..." : "Inhabilitar"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )})}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isEditScreensOpen} onOpenChange={setIsEditScreensOpen}>
        <DialogContent className={darkMode ? "sm:max-w-2xl bg-gray-900 border-gray-700 text-gray-100" : "sm:max-w-2xl"}>
          <DialogHeader>
            <DialogTitle>
              Modificar pantallas {selectedRole ? `- ${selectedRole.roleName}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div>
            <Label className={darkMode ? "text-gray-200" : ""}>Nombre del rol</Label>
            <Input
              value={draftRoleName}
              onChange={(e) => setDraftRoleName(e.target.value.toUpperCase())}
              placeholder="Nombre del rol"
              className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {draftScreens.map((screen) => (
              <div
                key={`modal-screen-${screen.screenId}`}
                className={`rounded-md border px-3 py-2 flex items-center justify-between ${darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
              >
                <div className="pr-3">
                  <p className={`text-sm font-medium ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                    {screen.screenName}
                  </p>
                  <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                    {screen.screenPath}
                  </p>
                </div>
                <Switch
                  checked={screen.canView}
                  onCheckedChange={(checked) => updateDraftScreenToggle(screen.screenId, checked)}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditScreensOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRolePermissions} disabled={!selectedRole || isSavingRoleId === selectedRole.roleId}>
              {isSavingRoleId ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
