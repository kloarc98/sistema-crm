import { createBrowserRouter, Navigate } from "react-router";
import { Root } from "./components/Root";
import { Dashboard } from "./components/Dashboard";
import { Income } from "./components/Income";
import { Products } from "./components/Products";
import { Clients } from "./components/Clients";
import { Orders } from "./components/Orders";
import { Routes } from "./components/Routes";
import { Reporteria } from "./components/Reporteria";
import { Settings } from "./components/Settings";
import { Users } from "./components/Users";
import { PagosPendientes } from "./components/PagosPendientes";
import { RedirectToHome } from "./components/RedirectToHome";
import { Login } from "./components/Login";
import { RoleScreenPermissions } from "./components/RoleScreenPermissions";
import { DashboardAnalytics } from "./components/DashboardAnalytics";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Dashboard },
      { path: "income", Component: Income },
      { path: "orders", Component: Orders },
        { path: "reporteria", Component: Reporteria },
      { path: "pagos-pendientes", Component: PagosPendientes },
      { path: "routes", Component: Routes },
      { path: "products", Component: Products },
      { path: "clients", Component: Clients },
      { path: "users", Component: Users },
      { path: "settings", Component: Settings },
      { path: "dashboard", Component: DashboardAnalytics },
      { path: "role-screen-permissions", Component: RoleScreenPermissions },
      { path: "*", Component: RedirectToHome },
    ],
  },
]);