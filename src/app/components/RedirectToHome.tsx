import { Navigate } from "react-router";

export function RedirectToHome() {
  return <Navigate to="/" replace />;
}
