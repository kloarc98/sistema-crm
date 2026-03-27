import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Store, AlertCircle, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [recoveryNit, setRecoveryNit] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false);
  const [isRecoveryDialogOpen, setIsRecoveryDialogOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Por favor ingresa usuario y contraseña");
      return;
    }

    const result = await login(username, password);
    if (result.success) {
      navigate("/");
    } else {
      setError(result.message || "Usuario o contraseña incorrectos");
    }
  };

  const handleRecoverPassword = async () => {
    setRecoveryError("");
    setRecoveryMessage("");

    const normalizedNit = recoveryNit.trim();
    if (!normalizedNit) {
      setRecoveryError("Por favor ingresa tu NIT");
      return;
    }

    setIsRecoveryLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nit: normalizedNit }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRecoveryError(typeof payload?.error === "string" ? payload.error : "No se pudo enviar el correo");
        return;
      }

      setRecoveryMessage(
        typeof payload?.message === "string"
          ? payload.message
          : "Se envio un correo con tu contraseña al email registrado"
      );
      setRecoveryNit("");
    } catch {
      setRecoveryError("No se pudo conectar al servidor");
    } finally {
      setIsRecoveryLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 transition-colors duration-300 ${
      darkMode 
        ? 'bg-gradient-to-br from-gray-900 to-gray-800' 
        : 'bg-gradient-to-br from-blue-50 to-indigo-100'
    }`}>
      <button
        onClick={() => setDarkMode(!darkMode)}
        className={`absolute top-6 right-6 p-3 rounded-full transition-colors ${
          darkMode
            ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
      >
        {darkMode ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>
      <Card className={`w-full max-w-md transition-colors ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <div className="bg-blue-600 p-4 rounded-full">
              <Store className="size-8 text-white" />
            </div>
          </div>
          <div className="text-center">
            <CardTitle className={`text-2xl ${darkMode ? 'text-white' : ''}`}>Sistema de Gestión de Tienda</CardTitle>
            <p className={`mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ingresa tus credenciales para continuar</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className={darkMode ? 'text-gray-200' : ''}>NIT (Usuario)</Label>
              <Input
                id="username"
                type="text"
                placeholder="Ingresa tu NIT"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className={darkMode ? 'text-gray-200' : ''}>Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>

            <Button type="submit" className="w-full" size="lg">
              <LogIn className="size-4 mr-2" />
              Iniciar Sesión
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setRecoveryError("");
                  setRecoveryMessage("");
                  setRecoveryNit("");
                  setIsRecoveryDialogOpen(true);
                }}
                className={`text-sm underline underline-offset-2 ${darkMode ? 'text-blue-300 hover:text-blue-200' : 'text-blue-700 hover:text-blue-900'}`}
              >
                Olvide mi contraseña
              </button>
            </div>

            <div className={`mt-6 p-4 rounded-lg ${darkMode ? 'bg-gray-700 border border-gray-600' : 'bg-blue-50'}`}>
              <p className={`text-sm text-center ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Ingresa tu NIT y contraseña registrados en el sistema
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={isRecoveryDialogOpen} onOpenChange={setIsRecoveryDialogOpen}>
        <DialogContent className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <DialogHeader>
            <DialogTitle className={darkMode ? 'text-white' : ''}>Recuperar contraseña</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {recoveryError && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{recoveryError}</AlertDescription>
              </Alert>
            )}

            {recoveryMessage && (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertDescription>{recoveryMessage}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="recoveryNit" className={darkMode ? 'text-gray-200' : ''}>NIT</Label>
              <Input
                id="recoveryNit"
                type="text"
                placeholder="Ingresa tu NIT"
                value={recoveryNit}
                onChange={(e) => setRecoveryNit(e.target.value)}
                autoComplete="username"
                className={darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}
              />
            </div>

            <Button type="button" className="w-full" disabled={isRecoveryLoading} onClick={handleRecoverPassword}>
              {isRecoveryLoading ? "Enviando correo..." : "Enviar contraseña al correo registrado"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}