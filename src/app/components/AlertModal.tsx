import { useAlert } from "../context/AlertContext";
import { useTheme } from "../context/ThemeContext";
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";

export function AlertModal() {
  const { alerts, removeAlert } = useAlert();
  const { darkMode } = useTheme();

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {alerts.map((alert) => {
        const bgColorMap = {
          info: darkMode ? "bg-blue-900 border-blue-700" : "bg-blue-50 border-blue-200",
          success: darkMode ? "bg-green-900 border-green-700" : "bg-green-50 border-green-200",
          warning: darkMode ? "bg-yellow-900 border-yellow-700" : "bg-yellow-50 border-yellow-200",
          error: darkMode ? "bg-red-900 border-red-700" : "bg-red-50 border-red-200",
        };

        const textColorMap = {
          info: darkMode ? "text-blue-200" : "text-blue-900",
          success: darkMode ? "text-green-200" : "text-green-900",
          warning: darkMode ? "text-yellow-200" : "text-yellow-900",
          error: darkMode ? "text-red-200" : "text-red-900",
        };

        const iconColorMap = {
          info: darkMode ? "text-blue-300" : "text-blue-600",
          success: darkMode ? "text-green-300" : "text-green-600",
          warning: darkMode ? "text-yellow-300" : "text-yellow-600",
          error: darkMode ? "text-red-300" : "text-red-600",
        };

        const iconMap = {
          info: <Info className={`size-5 ${iconColorMap[alert.type]}`} />,
          success: <CheckCircle2 className={`size-5 ${iconColorMap[alert.type]}`} />,
          warning: <AlertTriangle className={`size-5 ${iconColorMap[alert.type]}`} />,
          error: <AlertCircle className={`size-5 ${iconColorMap[alert.type]}`} />,
        };

        return (
          <div
            key={alert.id}
            className={`pointer-events-auto border rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4 ${bgColorMap[alert.type]}`}
          >
            <div className="flex-shrink-0 mt-0.5">{iconMap[alert.type]}</div>
            <p className={`text-sm font-medium flex-1 ${textColorMap[alert.type]}`}>
              {alert.message}
            </p>
            <button
              onClick={() => removeAlert(alert.id)}
              className={`flex-shrink-0 ${darkMode ? "text-gray-400 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"}`}
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
