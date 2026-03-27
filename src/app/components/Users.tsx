import { useEffect, useMemo, useState } from "react";
import { Users as UsersIcon, Pencil, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useTheme } from "../context/ThemeContext";
import { useAlert } from "../context/AlertContext";
import { useAuth } from "../context/AuthContext";
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
} from "./ui/dialog";

interface UserRecord {
  id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  telefono: string;
  rol: string;
  usuario: string;
  est_id?: number;
  estado?: string;
  fecha_creacion?: string | null;
  creado_por?: string;
  password?: string;
  coverageAssignments?: CoverageAssignment[];
}

interface DepartmentOption {
  id: number;
  nombre: string;
}

interface MunicipalityOption {
  id: number;
  nombre: string;
}

interface CoverageAssignment {
  depId: number;
  depNombre?: string;
  coverage: "ALL" | "PARTIAL";
  municipalityIds: number[];
  municipalities?: Array<{ munId: number; munNombre: string }>;
}

interface LoginHistoryRecord {
  id: number;
  usr_id: number;
  fecha_ingreso: string;
  ip: string;
  user_agent: string;
}

const emptyForm = {
  nombres: "",
  apellidos: "",
  correo: "",
  telefono: "",
  rol: "vendedor",
  usuario: "",
  password: "",
};

const isCoverageRoleEligible = (role: string) => {
  const normalized = String(role || "").toLowerCase().trim();
  return !normalized.includes("admin") && !normalized.includes("jefe");
};

const isAdminRoleName = (role: string) => {
  const normalized = String(role || "").toLowerCase().trim();
  return normalized === "admin" || normalized.includes("admin");
};

export function Users() {
  const { darkMode } = useTheme();
  const { user } = useAuth();
  const { addAlert } = useAlert();
  const normalizedUserRole = (user?.role || "").toLowerCase().trim();
  const isAdmin = normalizedUserRole === "admin" || normalizedUserRole.includes("admin");
  const isJefe = normalizedUserRole === "jefe" || normalizedUserRole.includes("jefe");
  const canManageUserStatus = isAdmin || isJefe;
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "activos" | "inactivos">("todos");

  const [form, setForm] = useState(emptyForm);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [municipalitiesByDepartment, setMunicipalitiesByDepartment] = useState<Record<string, MunicipalityOption[]>>({});
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [coverageByDepartment, setCoverageByDepartment] = useState<Record<string, { coverage: "ALL" | "PARTIAL"; municipalityIds: string[] }>>({});
  const [isCoverageLoading, setIsCoverageLoading] = useState(false);
  const [isCoverageDialogOpen, setIsCoverageDialogOpen] = useState(false);
  const [draftSelectedDepartmentIds, setDraftSelectedDepartmentIds] = useState<string[]>([]);
  const [draftCoverageByDepartment, setDraftCoverageByDepartment] = useState<Record<string, { coverage: "ALL" | "PARTIAL"; municipalityIds: string[] }>>({});
  const [activeDepartmentId, setActiveDepartmentId] = useState<string>("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState<UserRecord | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [selectedUserLoginHistory, setSelectedUserLoginHistory] = useState<LoginHistoryRecord[]>([]);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const isCoverageEnabledForForm = isCoverageRoleEligible(form.rol);
  const selectableRoles = useMemo(
    () => roles.filter((roleName) => isAdmin || !isAdminRoleName(roleName)),
    [roles, isAdmin]
  );

  const fetchUsers = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/users");
      if (!response.ok) {
        throw new Error("No se pudieron cargar los usuarios");
      }
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setUsers([]);
      setError(err instanceof Error ? err.message : "Error cargando usuarios");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await fetch("/api/auth/roles");
      if (!response.ok) {
        throw new Error("No se pudieron cargar los roles");
      }

      const data = await response.json();
      const roleNames = Array.isArray(data)
        ? data
            .map((item) => (typeof item?.nombre === "string" ? item.nombre : ""))
            .filter((value) => value.trim() !== "")
        : [];

      setRoles(roleNames);
    } catch {
      setRoles([]);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await fetch("/api/auth/location/departments");
      if (!response.ok) {
        throw new Error("No se pudieron cargar los departamentos");
      }

      const data = await response.json();
      setDepartments(Array.isArray(data) ? data : []);
    } catch {
      setDepartments([]);
    }
  };

  const fetchMunicipalities = async (depId: string) => {
    if (!depId) return [] as MunicipalityOption[];

    const cached = municipalitiesByDepartment[depId];
    if (cached) {
      return cached;
    }

    const response = await fetch(`/api/auth/location/departments/${depId}/municipalities`);
    if (!response.ok) {
      throw new Error("No se pudieron cargar los municipios");
    }

    const data = await response.json();
    const normalized = Array.isArray(data) ? data : [];
    setMunicipalitiesByDepartment((prev) => ({ ...prev, [depId]: normalized }));
    return normalized;
  };

  const resetCoverageSelection = () => {
    setSelectedDepartmentIds([]);
    setCoverageByDepartment({});
  };

  const buildCoverageAssignments = () =>
    selectedDepartmentIds.map((depId) => {
      const departmentCoverage = coverageByDepartment[depId] || { coverage: "PARTIAL" as const, municipalityIds: [] };
      return {
        depId: Number(depId),
        coverage: departmentCoverage.coverage,
        municipalityIds:
          departmentCoverage.coverage === "ALL"
            ? []
            : departmentCoverage.municipalityIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
      };
    });

  const applyCoverageAssignments = async (assignments: CoverageAssignment[]) => {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      resetCoverageSelection();
      return;
    }

    const depIds = assignments.map((item) => String(item.depId));
    const nextCoverage: Record<string, { coverage: "ALL" | "PARTIAL"; municipalityIds: string[] }> = {};

    for (const assignment of assignments) {
      const depId = String(assignment.depId);
      nextCoverage[depId] = {
        coverage: assignment.coverage === "ALL" ? "ALL" : "PARTIAL",
        municipalityIds: Array.isArray(assignment.municipalityIds)
          ? assignment.municipalityIds.map((id) => String(id))
          : [],
      };
    }

    setSelectedDepartmentIds(depIds);
    setCoverageByDepartment(nextCoverage);
    await Promise.all(depIds.map((depId) => fetchMunicipalities(depId).catch(() => [])));
  };

  const toggleDraftDepartmentSelection = async (depId: string, checked: boolean) => {
    if (checked) {
      setDraftSelectedDepartmentIds((prev) => (prev.includes(depId) ? prev : [...prev, depId]));
      setDraftCoverageByDepartment((prev) => ({
        ...prev,
        [depId]: prev[depId] || { coverage: "PARTIAL", municipalityIds: [] },
      }));
      setActiveDepartmentId(depId);

      try {
        await fetchMunicipalities(depId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los municipios");
      }

      return;
    }

    setDraftSelectedDepartmentIds((prev) => {
      const remaining = prev.filter((id) => id !== depId);
      setActiveDepartmentId((current) => (current === depId ? remaining[0] || "" : current));
      return remaining;
    });
    setDraftCoverageByDepartment((prev) => {
      const next = { ...prev };
      delete next[depId];
      return next;
    });
  };

  const openCoverageDialog = async () => {
    if (!isCoverageEnabledForForm) {
      return;
    }

    const nextDraftSelected = [...selectedDepartmentIds];
    const nextDraftCoverage: Record<string, { coverage: "ALL" | "PARTIAL"; municipalityIds: string[] }> = {};

    for (const depId of selectedDepartmentIds) {
      const current = coverageByDepartment[depId] || { coverage: "PARTIAL" as const, municipalityIds: [] };
      nextDraftCoverage[depId] = {
        coverage: current.coverage,
        municipalityIds: [...current.municipalityIds],
      };
    }

    setDraftSelectedDepartmentIds(nextDraftSelected);
    setDraftCoverageByDepartment(nextDraftCoverage);
    setActiveDepartmentId(nextDraftSelected[0] || (departments[0] ? String(departments[0].id) : ""));
    setIsCoverageDialogOpen(true);

    if (nextDraftSelected.length > 0) {
      await Promise.all(nextDraftSelected.map((depId) => fetchMunicipalities(depId).catch(() => [])));
    }
  };

  const handleSaveCoverageDialog = () => {
    const invalidPartial = draftSelectedDepartmentIds.some((depId) => {
      const config = draftCoverageByDepartment[depId] || { coverage: "PARTIAL" as const, municipalityIds: [] };
      return config.coverage === "PARTIAL" && config.municipalityIds.length === 0;
    });

    if (invalidPartial) {
      setError("Para cobertura PARTIAL debes seleccionar al menos un municipio");
      return;
    }

    setSelectedDepartmentIds([...draftSelectedDepartmentIds]);
    const committedCoverage: Record<string, { coverage: "ALL" | "PARTIAL"; municipalityIds: string[] }> = {};
    for (const depId of draftSelectedDepartmentIds) {
      const current = draftCoverageByDepartment[depId] || { coverage: "PARTIAL" as const, municipalityIds: [] };
      committedCoverage[depId] = {
        coverage: current.coverage,
        municipalityIds: [...current.municipalityIds],
      };
    }

    setCoverageByDepartment(committedCoverage);
    setIsCoverageDialogOpen(false);
  };

  useEffect(() => {
    if (!isCoverageDialogOpen || !activeDepartmentId) {
      return;
    }

    fetchMunicipalities(activeDepartmentId).catch(() => {
      setError("No se pudieron cargar los municipios");
    });
  }, [isCoverageDialogOpen, activeDepartmentId]);

  useEffect(() => {
    if (isCoverageEnabledForForm) {
      return;
    }

    resetCoverageSelection();
    setIsCoverageDialogOpen(false);
  }, [isCoverageEnabledForForm]);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchDepartments();
  }, []);

  const [usersPage, setUsersPage] = useState(1);
  useEffect(() => { setUsersPage(1); }, [search, statusFilter]);

  const filteredUsers = useMemo(() => {
    const query = search.toLowerCase().trim();

    return users.filter((user) => {
      const userStatus = (user.estado || "activo").toLowerCase() === "inactivo" ? "inactivo" : "activo";
      const matchesStatus =
        statusFilter === "todos" ||
        (statusFilter === "activos" && userStatus === "activo") ||
        (statusFilter === "inactivos" && userStatus === "inactivo");

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [user.nombres, user.apellidos, user.correo, user.usuario, user.rol, user.telefono]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [users, search, statusFilter]);

  const usersTotalPages = Math.max(1, Math.ceil(filteredUsers.length / 10));
  const paginatedUsers = useMemo(() => filteredUsers.slice((usersPage - 1) * 10, usersPage * 10), [filteredUsers, usersPage]);

  const resetForm = () => {
    setForm(emptyForm);
    resetCoverageSelection();
    setEditingUserId(null);
  };

  const handleSubmit = async () => {
    if (isSubmittingUser) {
      return;
    }

    if (!form.nombres || !form.apellidos || !form.correo || !form.telefono || !form.rol || !form.usuario) {
      addAlert("Todos los campos son requeridos", "error");
      return;
    }

    if (!editingUserId && !isAdmin && isAdminRoleName(form.rol)) {
      addAlert("Solo un usuario administrador puede crear otro administrador", "error");
      return;
    }

    if (!editingUserId && !form.password) {
      addAlert("La contraseña es requerida para crear usuario", "error");
      return;
    }

    const coverageAssignments = isCoverageEnabledForForm ? buildCoverageAssignments() : [];
    const hasInvalidPartialSelection = isCoverageEnabledForForm && coverageAssignments.some(
      (assignment) => assignment.coverage === "PARTIAL" && assignment.municipalityIds.length === 0
    );

    if (hasInvalidPartialSelection) {
      addAlert("Para cobertura PARTIAL debes seleccionar al menos un municipio", "error");
      return;
    }

    setError("");
    setIsSubmittingUser(true);

    try {
      if (editingUserId) {
        const response = await fetch(`/api/auth/users/${editingUserId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, coverageAssignments }),
        });

        if (!response.ok) {
          throw new Error("No se pudo actualizar el usuario");
        }
        addAlert("✓ Usuario actualizado correctamente", "success");
      } else {
        const payload = {
          ...form,
          coverageAssignments,
          createdByUserId: user?.id || null,
          createdByUsername: user?.username || "",
        };

        const response = await fetch("/api/auth/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": String(user?.id || ""),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("No se pudo crear el usuario");
        }
        addAlert("✓ Usuario creado correctamente", "success");
      }

      await fetchUsers();
      resetForm();
    } catch (err) {
      addAlert(err instanceof Error ? err.message : "Error guardando usuario", "error");
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleEdit = async (user: UserRecord) => {
    setError("");
    setIsCoverageLoading(true);

    try {
      const response = await fetch(`/api/auth/users/${user.id}`);
      if (!response.ok) {
        throw new Error("No se pudo cargar la configuracion del usuario");
      }

      const payload = await response.json();
      const userRole = String(payload?.rol || user.rol || "vendedor");

      setEditingUserId(String(payload?.id || user.id));
      setForm({
        nombres: String(payload?.nombres || user.nombres || "").toUpperCase(),
        apellidos: String(payload?.apellidos || user.apellidos || "").toUpperCase(),
        correo: String(payload?.correo || user.correo || ""),
        telefono: String(payload?.telefono || user.telefono || ""),
        rol: userRole,
        usuario: String(payload?.usuario || user.usuario || "").toUpperCase(),
        password: "",
      });

      if (isCoverageRoleEligible(userRole)) {
        await applyCoverageAssignments(Array.isArray(payload?.coverageAssignments) ? payload.coverageAssignments : []);
      } else {
        resetCoverageSelection();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la configuracion del usuario");
    } finally {
      setIsCoverageLoading(false);
    }
  };

  const handleViewDetails = async (userId: string) => {
    setIsDetailsLoading(true);
    setError("");
    setSelectedUserLoginHistory([]);
    try {
      const response = await fetch(`/api/auth/users/${userId}`);
      if (!response.ok) {
        throw new Error("No se pudieron cargar los detalles del usuario");
      }

      const data = await response.json();
      setSelectedUserDetails(data);

      if (isAdmin) {
        const historyResponse = await fetch(`/api/auth/users/${userId}/login-history?limit=20`, {
          headers: {
            "x-user-role": "admin",
          },
        });

        if (!historyResponse.ok) {
          throw new Error("No se pudo cargar el historial de ingresos");
        }

        const historyData = await historyResponse.json();
        setSelectedUserLoginHistory(Array.isArray(historyData) ? historyData : []);
      }

      setIsDetailsDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando detalles de usuario");
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    try {
      const response = await fetch(`/api/auth/users/${userToDelete}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": isAdmin ? "admin" : normalizedUserRole,
        },
      });

      if (!response.ok) {
        throw new Error("No se pudo inactivar el usuario");
      }

      await fetchUsers();
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inactivando usuario");
    }
  };

  const handleChangeUserStatus = async (userId: string, estado: "activo" | "inactivo") => {
    setError("");
    try {
      const response = await fetch(`/api/auth/users/${userId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": isAdmin ? "admin" : normalizedUserRole,
        },
        body: JSON.stringify({ estado }),
      });

      if (!response.ok) {
        throw new Error("No se pudo cambiar el estado del usuario");
      }

      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cambiando estado de usuario");
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8 sm:mb-10">
          <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? "text-white" : ""}`}>Usuarios</h1>
          <p className={`text-sm sm:text-base ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
            CRUD de usuarios del sistema
          </p>
          {isLoading && (
            <p className={`mt-2 text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              Cargando usuarios desde la base de datos...
            </p>
          )}
          {!!error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <CardTitle className={darkMode ? "text-white" : ""}>
                {editingUserId ? "Editar Usuario" : "Nuevo Usuario"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>NIT (Usuario)</Label>
                <Input
                  value={form.usuario}
                  onChange={(e) => setForm((prev) => ({ ...prev, usuario: e.target.value.toUpperCase() }))}
                  placeholder="Ingresa el NIT del usuario"
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>

              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Nombres</Label>
                <Input
                  value={form.nombres}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombres: e.target.value.toUpperCase() }))}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>

              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Apellidos</Label>
                <Input
                  value={form.apellidos}
                  onChange={(e) => setForm((prev) => ({ ...prev, apellidos: e.target.value.toUpperCase() }))}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>

              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Número Teléfono</Label>
                <Input
                  value={form.telefono}
                  onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value.replace(/\D/g, "") }))}
                  inputMode="numeric"
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>

              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Correo Electrónico</Label>
                <Input
                  type="email"
                  value={form.correo}
                  onChange={(e) => setForm((prev) => ({ ...prev, correo: e.target.value }))}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>

              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Rol</Label>
                <Select
                  value={form.rol}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, rol: value }))}
                >
                  <SelectTrigger className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}>
                    <SelectValue placeholder="Selecciona rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableRoles.length > 0 ? (
                      selectableRoles.map((roleName) => (
                        <SelectItem key={roleName} value={roleName}>
                          {roleName}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="vendedor">vendedor</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Contraseña</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder={editingUserId ? "Dejar vacío para no cambiar" : "Ingresa contraseña"}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>

              <div className={`rounded-md border p-3 space-y-2 ${darkMode ? "border-gray-600 bg-gray-700/30" : "border-gray-200 bg-gray-50"}`}>
                <p className={`text-sm font-semibold ${darkMode ? "text-gray-100" : "text-gray-800"}`}>
                  Cobertura de ubicacion
                </p>
                <p className={`text-xs ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                  {!isCoverageEnabledForForm
                    ? "Disponible solo para roles distintos de admin y jefe"
                    : selectedDepartmentIds.length === 0
                      ? "Sin departamentos asignados"
                      : `${selectedDepartmentIds.length} departamento(s) seleccionados`}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={openCoverageDialog}
                  className="w-full"
                  disabled={!isCoverageEnabledForForm}
                >
                  Configurar cobertura
                </Button>
                {isCoverageLoading && (
                  <p className={`text-xs ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                    Cargando cobertura de ubicacion...
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSubmit} disabled={isSubmittingUser} className="w-full sm:flex-1 sm:w-auto">
                  <Plus className="size-4 mr-2" />
                  {isSubmittingUser ? "Procesando..." : editingUserId ? "Actualizar" : "Crear"}
                </Button>
                {editingUserId && (
                  <Button variant="outline" onClick={resetForm} className="w-full sm:w-auto">
                    Cancelar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={`lg:col-span-2 ${darkMode ? "bg-gray-800 border-gray-700" : ""}`}>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <CardTitle className={`flex items-center gap-2 ${darkMode ? "text-white" : ""}`}>
                  <UsersIcon className="size-5 text-blue-600" />
                  Lista de Usuarios ({filteredUsers.length})
                </CardTitle>
                <Input
                  placeholder="Buscar usuario..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`w-full sm:max-w-xs ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
                />
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "todos" | "activos" | "inactivos") }>
                  <SelectTrigger className={`w-full sm:w-[160px] ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}>
                    <SelectValue placeholder="Filtrar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="activos">Activos</SelectItem>
                    <SelectItem value="inactivos">Inactivos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {!canManageUserStatus && (
                <p className={`mb-3 text-sm ${darkMode ? "text-amber-300" : "text-amber-700"}`}>
                  Solo admin o jefe puede inactivar o activar usuarios.
                </p>
              )}
              <div className="space-y-3">
                {paginatedUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`p-4 rounded-lg border ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className={`font-semibold break-words ${darkMode ? "text-white" : "text-gray-900"}`}>
                          {user.nombres} {user.apellidos}
                        </p>
                        <p className={`text-sm break-words ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                          NIT (Usuario): {user.usuario}
                        </p>
                        <p className={`text-sm break-words ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                          Correo: {user.correo}
                        </p>
                        <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                          Tel: {user.telefono} • Rol: {user.rol}
                        </p>
                        <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                          Estado: {(user.estado || "activo").toLowerCase() === "inactivo" ? "inactivo" : "activo"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(user)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetails(user.id)}
                          disabled={isDetailsLoading}
                        >
                          Detalles
                        </Button>
                        {canManageUserStatus && (
                          <>
                            {(user.estado || "activo").toLowerCase() === "inactivo" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleChangeUserStatus(user.id, "activo")}
                              >
                                Activar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setUserToDelete(user.id);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                Inhabilitar
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {!isLoading && filteredUsers.length === 0 && (
                  <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                    No hay usuarios para mostrar.
                  </p>
                )}

                {usersTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t" style={{borderColor: darkMode ? '#4b5563' : '#e5e7eb'}}>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Página {usersPage} de {usersTotalPages} ({filteredUsers.length} usuarios)
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={usersPage === 1}
                        onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                        className={darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}>
                        ← Anterior
                      </Button>
                      <Button variant="outline" size="sm" disabled={usersPage === usersTotalPages}
                        onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
                        className={darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}>
                        Siguiente →
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={isCoverageDialogOpen} onOpenChange={setIsCoverageDialogOpen}>
          <DialogContent className={darkMode ? "sm:max-w-5xl max-h-[90vh] bg-gray-900 border-gray-700 text-gray-100" : "sm:max-w-5xl max-h-[90vh]"}>
            <DialogHeader>
              <DialogTitle>Configurar cobertura por ubicacion</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`rounded-md border p-3 ${darkMode ? "border-gray-600 bg-gray-800" : "border-gray-200 bg-gray-50"}`}>
                <p className={`text-sm font-semibold mb-2 ${darkMode ? "text-gray-100" : "text-gray-800"}`}>
                  Departamentos
                </p>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {departments.map((department) => {
                    const depId = String(department.id);
                    const checked = draftSelectedDepartmentIds.includes(depId);
                    const current = draftCoverageByDepartment[depId] || { coverage: "PARTIAL" as const, municipalityIds: [] };
                    const isActive = activeDepartmentId === depId;

                    return (
                      <div
                        key={depId}
                        className={`rounded-md border p-2 ${isActive ? "ring-1 ring-blue-500" : ""} ${darkMode ? "border-gray-600" : "border-gray-200"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className={`flex items-center gap-2 text-sm ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                toggleDraftDepartmentSelection(depId, e.target.checked);
                              }}
                            />
                            <button
                              type="button"
                              className="text-left"
                              onClick={() => setActiveDepartmentId(depId)}
                            >
                              {depId.padStart(3, "0")} - {department.nombre}
                            </button>
                          </label>
                        </div>

                        {checked && (
                          <div className="mt-2">
                            <Label className={darkMode ? "text-gray-200" : ""}>Cobertura</Label>
                            <Select
                              value={current.coverage}
                              onValueChange={(value) => {
                                const normalized = value === "ALL" ? "ALL" : "PARTIAL";
                                setDraftCoverageByDepartment((prev) => ({
                                  ...prev,
                                  [depId]: {
                                    coverage: normalized,
                                    municipalityIds: normalized === "ALL" ? [] : prev[depId]?.municipalityIds || [],
                                  },
                                }));

                                if (!activeDepartmentId) {
                                  setActiveDepartmentId(depId);
                                }
                              }}
                            >
                              <SelectTrigger className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}>
                                <SelectValue placeholder="Selecciona cobertura" />
                              </SelectTrigger>
                              <SelectContent className={darkMode ? "bg-gray-800 border-gray-600 text-gray-100" : ""}>
                                <SelectItem value="ALL">Completa</SelectItem>
                                <SelectItem value="PARTIAL">Parcial</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`rounded-md border p-3 ${darkMode ? "border-gray-600 bg-gray-800" : "border-gray-200 bg-gray-50"}`}>
                <p className={`text-sm font-semibold mb-2 ${darkMode ? "text-gray-100" : "text-gray-800"}`}>
                  Municipios
                </p>

                {!activeDepartmentId ? (
                  <p className={`text-xs ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                    Selecciona un departamento para gestionar municipios.
                  </p>
                ) : !draftSelectedDepartmentIds.includes(activeDepartmentId) ? (
                  <p className={`text-xs ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                    Activa el departamento seleccionado para configurar su cobertura.
                  </p>
                ) : (
                  <>
                    <p className={`text-xs mb-2 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                      {(() => {
                        const selectedDepartment = departments.find((dep) => String(dep.id) === activeDepartmentId);
                        return selectedDepartment
                          ? `${String(selectedDepartment.id).padStart(3, "0")} - ${selectedDepartment.nombre}`
                          : activeDepartmentId;
                      })()}
                    </p>

                    {(draftCoverageByDepartment[activeDepartmentId]?.coverage || "PARTIAL") === "ALL" ? (
                      <p className={`text-xs ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                        Cobertura completa: incluye todos los municipios del departamento.
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                        {(municipalitiesByDepartment[activeDepartmentId] || []).map((municipality) => {
                          const municipalityId = String(municipality.id);
                          const current = draftCoverageByDepartment[activeDepartmentId] || { coverage: "PARTIAL" as const, municipalityIds: [] };
                          const checked = current.municipalityIds.includes(municipalityId);

                          return (
                            <label
                              key={`${activeDepartmentId}-${municipalityId}`}
                              className={`flex items-center gap-2 text-xs ${darkMode ? "text-gray-200" : "text-gray-700"}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setDraftCoverageByDepartment((prev) => {
                                    const existing = prev[activeDepartmentId] || { coverage: "PARTIAL" as const, municipalityIds: [] };
                                    const nextMunicipalities = e.target.checked
                                      ? [...existing.municipalityIds, municipalityId]
                                      : existing.municipalityIds.filter((id) => id !== municipalityId);

                                    return {
                                      ...prev,
                                      [activeDepartmentId]: {
                                        coverage: "PARTIAL",
                                        municipalityIds: [...new Set(nextMunicipalities)],
                                      },
                                    };
                                  });
                                }}
                              />
                              <span>{municipalityId.padStart(2, "0")} - {municipality.nombre}</span>
                            </label>
                          );
                        })}

                        {(municipalitiesByDepartment[activeDepartmentId] || []).length === 0 && (
                          <p className={`text-xs ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                            No hay municipios disponibles para este departamento.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCoverageDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveCoverageDialog}>
                Guardar cobertura
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Inactivar usuario</DialogTitle>
            </DialogHeader>
            <p>¿Seguro que deseas inactivar este usuario?</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Inactivar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Detalles del usuario</DialogTitle>
            </DialogHeader>

            {selectedUserDetails ? (
              <div className="space-y-2 text-sm max-h-[70vh] overflow-y-auto pr-1">
                <p><strong>NIT (Usuario):</strong> {selectedUserDetails.usuario}</p>
                <p><strong>Nombres:</strong> {selectedUserDetails.nombres}</p>
                <p><strong>Apellidos:</strong> {selectedUserDetails.apellidos}</p>
                <p><strong>Correo:</strong> {selectedUserDetails.correo}</p>
                <p><strong>Teléfono:</strong> {selectedUserDetails.telefono}</p>
                <p><strong>Rol:</strong> {selectedUserDetails.rol}</p>
                <p><strong>Estado:</strong> {(selectedUserDetails.estado || "activo").toLowerCase() === "inactivo" ? "inactivo" : "activo"}</p>
                <p><strong>Fecha de creación:</strong> {selectedUserDetails.fecha_creacion || "No disponible"}</p>
                <p>
                  <strong>Creado por:</strong>{" "}
                  <span className="font-semibold">{selectedUserDetails.creado_por || "No disponible"}</span>
                </p>

                <div className="mt-2">
                  <p><strong>Cobertura:</strong></p>
                  {Array.isArray(selectedUserDetails.coverageAssignments) && selectedUserDetails.coverageAssignments.length > 0 ? (
                    <div className="mt-1 space-y-2">
                      {selectedUserDetails.coverageAssignments.map((assignment) => (
                        <div key={`coverage-${assignment.depId}`} className="rounded border p-2 text-xs">
                          <p>
                            <strong>{String(assignment.depId).padStart(3, "0")}</strong> - {assignment.depNombre || "Departamento"} ({assignment.coverage === "ALL" ? "Completa" : "Parcial"})
                          </p>
                          {assignment.coverage === "PARTIAL" && Array.isArray(assignment.municipalities) && assignment.municipalities.length > 0 && (
                            <p>
                              Municipios: {assignment.municipalities.map((municipality) => `${String(municipality.munId).padStart(2, "0")}-${municipality.munNombre}`).join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs">Sin cobertura asignada.</p>
                  )}
                </div>

                {isAdmin && (
                  <div className="mt-4 border-t pt-3">
                    <p className="font-semibold">Historial de ingresos</p>
                    {selectedUserLoginHistory.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {selectedUserLoginHistory.map((item) => (
                          <div key={item.id} className="rounded-md border p-2 text-xs">
                            <p><strong>Fecha:</strong> {item.fecha_ingreso || "No disponible"}</p>
                            <p><strong>IP:</strong> {item.ip || "No disponible"}</p>
                            <p><strong>Dispositivo:</strong> {item.user_agent || "No disponible"}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs">Sin registros de ingreso.</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p>No hay datos para mostrar.</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
