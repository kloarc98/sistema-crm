import { createContext, useContext, useState, ReactNode } from "react";

export interface Alert {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

interface AlertContextType {
  alerts: Alert[];
  addAlert: (message: string, type?: Alert["type"]) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const addAlert = (message: string, type: Alert["type"] = "info") => {
    const id = Date.now().toString();
    const newAlert: Alert = { id, message, type };
    setAlerts((prev) => [...prev, newAlert]);

    // Auto remove after 5 seconds
    setTimeout(() => {
      removeAlert(id);
    }, 5000);
  };

  const removeAlert = (id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

  const clearAlerts = () => {
    setAlerts([]);
  };

  return (
    <AlertContext.Provider value={{ alerts, addAlert, removeAlert, clearAlerts }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
}
