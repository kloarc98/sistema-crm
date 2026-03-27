import { useEffect, useMemo, useState } from "react";
import { Users, Plus, Pencil } from "lucide-react";
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

interface ClientRecord {
  id: string;
  nombreEmpresa: string;
  nombreDueno: string;
  direccion: string;
  departamentoId?: number | null;
  departamentoNombre?: string;
  municipioId?: number | null;
  municipioNombre?: string;
  telefono: string;
  telefonoOpcional: string;
  correo: string;
  nit: string;
  estado?: string;
  fecha_creacion?: string | null;
}

interface LocationOption {
  id: number;
  nombre: string;
}

const emptyForm = {
  nombreEmpresa: "",
  nombreDueno: "",
  direccion: "",
  departamentoId: "",
  municipioId: "",
  telefono: "",
  telefonoOpcional: "",
  correo: "",
  nit: "",
};

export function Clients() {
  const { darkMode } = useTheme();
  const { addAlert } = useAlert();
  const { user } = useAuth();
  const normalizedUserRole = (user?.role || "").toLowerCase().trim();
  const isAdmin = normalizedUserRole === "admin" || normalizedUserRole.includes("admin");

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "activos" | "inactivos">("todos");

  const [form, setForm] = useState(emptyForm);
  const [departments, setDepartments] = useState<LocationOption[]>([]);
  const [municipalities, setMunicipalities] = useState<LocationOption[]>([]);
  const [isLocationsLoading, setIsLocationsLoading] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientToDisable, setClientToDisable] = useState<string | null>(null);
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedClientDetails, setSelectedClientDetails] = useState<ClientRecord | null>(null);
  const [isSubmittingClient, setIsSubmittingClient] = useState(false);

  const fetchClients = async () => {
    setIsLoading(true);
    setError("");
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
        throw new Error("No se pudieron cargar los clientes");
      }
      const data = await response.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      setClients([]);
      setError(err instanceof Error ? err.message : "Error cargando clientes");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await fetch("/api/clients/departments");
      if (!response.ok) {
        throw new Error("No se pudo cargar el catalogo de departamentos");
      }

      const data = await response.json();
      setDepartments(Array.isArray(data) ? data : []);
    } catch (err) {
      setDepartments([]);
      setError(err instanceof Error ? err.message : "Error cargando departamentos");
    }
  };

  const fetchMunicipalities = async (depId: string, desiredMunicipalityId?: string) => {
    if (!depId) {
      setMunicipalities([]);
      setForm((prev) => ({ ...prev, municipioId: "" }));
      return;
    }

    setIsLocationsLoading(true);
    try {
      const response = await fetch(`/api/clients/departments/${depId}/municipalities`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el catalogo de municipios");
      }

      const data = await response.json();
      const options = Array.isArray(data) ? data : [];
      setMunicipalities(options);

      setForm((prev) => {
        if (desiredMunicipalityId) {
          const exists = options.some((m) => String(m.id) === desiredMunicipalityId);
          return { ...prev, municipioId: exists ? desiredMunicipalityId : "" };
        }

        const stillExists = options.some((m) => String(m.id) === prev.municipioId);
        return { ...prev, municipioId: stillExists ? prev.municipioId : "" };
      });
    } catch (err) {
      setMunicipalities([]);
      setForm((prev) => ({ ...prev, municipioId: "" }));
      setError(err instanceof Error ? err.message : "Error cargando municipios");
    } finally {
      setIsLocationsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchDepartments();
  }, [user?.id, user?.role]);

  const [clientsPage, setClientsPage] = useState(1);
  useEffect(() => { setClientsPage(1); }, [search, statusFilter]);

  const filteredClients = useMemo(() => {
    const query = search.toLowerCase().trim();

    return clients.filter((client) => {
      const estado = (client.estado || "activo").toLowerCase() === "inactivo" ? "inactivo" : "activo";
      const matchesStatus =
        statusFilter === "todos" ||
        (statusFilter === "activos" && estado === "activo") ||
        (statusFilter === "inactivos" && estado === "inactivo");

      if (!matchesStatus) return false;
      if (!query) return true;

      return [
        client.nombreEmpresa,
        client.nombreDueno,
        client.nit,
        client.correo,
        client.telefono,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [clients, search, statusFilter]);
  const clientsTotalPages = Math.max(1, Math.ceil(filteredClients.length / 10));
  const paginatedClients = useMemo(() => filteredClients.slice((clientsPage - 1) * 10, clientsPage * 10), [filteredClients, clientsPage]);
  const resetForm = () => {
    setForm(emptyForm);
    setMunicipalities([]);
    setEditingClientId(null);
  };

  const handleSubmit = async () => {
    if (isSubmittingClient) {
      return;
    }

    if (!form.nombreEmpresa || !form.nit) {
      addAlert("Nombre de empresa y NIT son requeridos", "error");
      setError("Nombre de empresa y NIT son requeridos");
      return;
    }

    setError("");
    setIsSubmittingClient(true);

    try {
      if (editingClientId) {
        const response = await fetch(`/api/clients/${editingClientId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

        if (!response.ok) {
          throw new Error("No se pudo actualizar el cliente");
        }
        addAlert("✓ Cliente actualizado correctamente", "success");
      } else {
        const response = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

        if (!response.ok) {
          throw new Error("No se pudo crear el cliente");
        }
        addAlert("✓ Cliente creado correctamente", "success");
      }

      await fetchClients();
      resetForm();
    } catch (err) {
      addAlert(err instanceof Error ? err.message : "Error guardando cliente", "error");
      setError(err instanceof Error ? err.message : "Error guardando cliente");
    } finally {
      setIsSubmittingClient(false);
    }
  };

  const handleEdit = (client: ClientRecord) => {
    const depId = client.departamentoId ? String(client.departamentoId) : "";
    const munId = client.municipioId ? String(client.municipioId) : "";

    setEditingClientId(client.id);
    setForm({
      nombreEmpresa: client.nombreEmpresa,
      nombreDueno: client.nombreDueno,
      direccion: client.direccion,
      departamentoId: depId,
      municipioId: munId,
      telefono: client.telefono,
      telefonoOpcional: client.telefonoOpcional,
      correo: client.correo,
      nit: client.nit,
    });

    if (depId) {
      fetchMunicipalities(depId, munId);
    } else {
      setMunicipalities([]);
    }
  };

  const handleViewDetails = async (clientId: string) => {
    setError("");
    try {
      const query = new URLSearchParams({
        requesterUserId: String(user?.id || ""),
        requesterRole: String(user?.role || ""),
        requesterUsername: String(user?.username || ""),
      });

      const response = await fetch(`/api/clients/${clientId}?${query.toString()}`, {
        headers: {
          "x-user-id": String(user?.id || ""),
          "x-user-role": String(user?.role || ""),
          "x-user-username": String(user?.username || ""),
        },
      });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los detalles del cliente");
      }

      const data = await response.json();
      setSelectedClientDetails(data);
      setIsDetailsDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando detalles de cliente");
    }
  };

  const handleChangeStatus = async (clientId: string, estado: "activo" | "inactivo") => {
    setError("");
    try {
      const response = await fetch(`/api/clients/${clientId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": isAdmin ? "admin" : normalizedUserRole,
        },
        body: JSON.stringify({ estado }),
      });

      if (!response.ok) {
        throw new Error("No se pudo cambiar el estado del cliente");
      }

      await fetchClients();
      setIsDisableDialogOpen(false);
      setClientToDisable(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cambiando estado de cliente");
    }
  };

  const totalClients = clients.length;
  const activeClients = clients.filter((c) => (c.estado || "activo").toLowerCase() !== "inactivo").length;
  const inactiveClients = totalClients - activeClients;

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8 sm:mb-10">
          <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? "text-white" : ""}`}>Clientes</h1>
          <p className={`text-sm sm:text-base ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
            Ingreso y gestión de clientes
          </p>
          {isLoading && (
            <p className={`mt-2 text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              Cargando clientes desde la base de datos...
            </p>
          )}
          {!!error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardContent className="p-6">
              <p className={`text-sm mb-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Total Clientes</p>
              <p className={`text-2xl font-bold ${darkMode ? "text-white" : ""}`}>{totalClients}</p>
            </CardContent>
          </Card>
          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardContent className="p-6">
              <p className={`text-sm mb-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Activos</p>
              <p className="text-2xl font-bold text-green-600">{activeClients}</p>
            </CardContent>
          </Card>
          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardContent className="p-6">
              <p className={`text-sm mb-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Inactivos</p>
              <p className="text-2xl font-bold text-orange-600">{inactiveClients}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <CardTitle className={darkMode ? "text-white" : ""}>
                {editingClientId ? "Editar Cliente" : "Nuevo Cliente"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>NIT</Label>
                <Input
                  value={form.nit}
                  onChange={(e) => setForm((prev) => ({ ...prev, nit: e.target.value.toUpperCase() }))}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Nombre Empresa</Label>
                <Input
                  value={form.nombreEmpresa}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombreEmpresa: e.target.value.toUpperCase() }))}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Nombre Dueño</Label>
                <Input
                  value={form.nombreDueno}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombreDueno: e.target.value.toUpperCase() }))}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Dirección</Label>
                <Input
                  value={form.direccion}
                  onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Departamento</Label>
                <Select
                  value={form.departamentoId || ""}
                  onValueChange={(value) => {
                    setForm((prev) => ({ ...prev, departamentoId: value, municipioId: "" }));
                    fetchMunicipalities(value);
                  }}
                >
                  <SelectTrigger className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}>
                    <SelectValue placeholder="Selecciona un departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dep) => (
                      <SelectItem key={dep.id} value={String(dep.id)}>
                        {String(dep.id).padStart(3, "0")} - {dep.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Municipio</Label>
                <Select
                  value={form.municipioId || ""}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, municipioId: value }))}
                  disabled={!form.departamentoId || isLocationsLoading}
                >
                  <SelectTrigger className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}>
                    <SelectValue
                      placeholder={
                        !form.departamentoId
                          ? "Primero selecciona departamento"
                          : isLocationsLoading
                            ? "Cargando municipios..."
                            : "Selecciona un municipio"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {municipalities.map((mun) => (
                      <SelectItem key={mun.id} value={String(mun.id)}>
                        {String(mun.id).padStart(2, "0")} - {mun.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Teléfono</Label>
                <Input
                  value={form.telefono}
                  onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value.replace(/\D/g, "") }))}
                  inputMode="numeric"
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Teléfono Opcional (No obligatorio)</Label>
                <Input
                  value={form.telefonoOpcional}
                  onChange={(e) => setForm((prev) => ({ ...prev, telefonoOpcional: e.target.value.replace(/\D/g, "") }))}
                  inputMode="numeric"
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>
              <div>
                <Label className={darkMode ? "text-gray-200" : ""}>Correo</Label>
                <Input
                  type="email"
                  value={form.correo}
                  onChange={(e) => setForm((prev) => ({ ...prev, correo: e.target.value }))}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSubmit} disabled={isSubmittingClient} className="w-full sm:flex-1 sm:w-auto">
                  <Plus className="size-4 mr-2" />
                  {isSubmittingClient ? "Procesando..." : editingClientId ? "Actualizar" : "Crear"}
                </Button>
                {editingClientId && (
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
                  <Users className="size-5 text-blue-600" />
                  Lista de Clientes ({filteredClients.length})
                </CardTitle>
                <Input
                  placeholder="Buscar cliente..."
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
              <div className="space-y-3">
                {paginatedClients.map((client) => {
                  const estado = (client.estado || "activo").toLowerCase() === "inactivo" ? "inactivo" : "activo";
                  return (
                    <div
                      key={client.id}
                      className={`p-4 rounded-lg border ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p className={`font-semibold break-words ${darkMode ? "text-white" : "text-gray-900"}`}>
                            {client.nombreEmpresa}
                          </p>
                          <p className={`text-sm break-words ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                            Dueño: {client.nombreDueno || "N/A"}
                          </p>
                          <p className={`text-sm break-words ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                            NIT: {client.nit}
                          </p>
                          <p className={`text-sm break-words ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                            Correo: {client.correo || "N/A"}
                          </p>
                          <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                            Tel: {client.telefono || "N/A"} • Estado: {estado}
                          </p>
                          <p className={`text-sm break-words ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                            Ubicacion: {client.departamentoNombre || "N/A"} - {client.municipioNombre || "N/A"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(client)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleViewDetails(client.id)}>
                            Detalles
                          </Button>
                          {isAdmin && (
                            estado === "inactivo" ? (
                              <Button size="sm" variant="outline" onClick={() => handleChangeStatus(client.id, "activo")}>
                                Activar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setClientToDisable(client.id);
                                  setIsDisableDialogOpen(true);
                                }}
                              >
                                Inhabilitar
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!isLoading && filteredClients.length === 0 && (
                  <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                    No hay clientes para mostrar.
                  </p>
                )}

                {clientsTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t" style={{borderColor: darkMode ? '#4b5563' : '#e5e7eb'}}>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Página {clientsPage} de {clientsTotalPages} ({filteredClients.length} clientes)
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={clientsPage === 1}
                        onClick={() => setClientsPage((p) => Math.max(1, p - 1))}
                        className={darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}>
                        ← Anterior
                      </Button>
                      <Button variant="outline" size="sm" disabled={clientsPage === clientsTotalPages}
                        onClick={() => setClientsPage((p) => Math.min(clientsTotalPages, p + 1))}
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

        <Dialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Inactivar cliente</DialogTitle>
            </DialogHeader>
            <p>¿Seguro que deseas inactivar este cliente?</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDisableDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (clientToDisable) {
                    handleChangeStatus(clientToDisable, "inactivo");
                  }
                }}
              >
                Inhabilitar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Detalles del cliente</DialogTitle>
            </DialogHeader>

            {selectedClientDetails ? (
              <div className="space-y-2 text-sm max-h-[70vh] overflow-y-auto pr-1">
                <p><strong>NIT:</strong> {selectedClientDetails.nit}</p>
                <p><strong>Nombre Empresa:</strong> {selectedClientDetails.nombreEmpresa}</p>
                <p><strong>Dueño:</strong> {selectedClientDetails.nombreDueno || "N/A"}</p>
                <p><strong>Dirección:</strong> {selectedClientDetails.direccion || "N/A"}</p>
                <p><strong>Departamento:</strong> {selectedClientDetails.departamentoNombre || "N/A"}</p>
                <p><strong>Municipio:</strong> {selectedClientDetails.municipioNombre || "N/A"}</p>
                <p><strong>Teléfono:</strong> {selectedClientDetails.telefono || "N/A"}</p>
                <p><strong>Teléfono Opcional:</strong> {selectedClientDetails.telefonoOpcional || "N/A"}</p>
                <p><strong>Correo:</strong> {selectedClientDetails.correo || "N/A"}</p>
                <p><strong>Estado:</strong> {(selectedClientDetails.estado || "activo").toLowerCase() === "inactivo" ? "inactivo" : "activo"}</p>
                <p><strong>Fecha de creación:</strong> {selectedClientDetails.fecha_creacion || "No disponible"}</p>
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
