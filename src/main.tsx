
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

const isNumberInput = (target: EventTarget | null): target is HTMLInputElement =>
  target instanceof HTMLInputElement && target.type === "number";

const sanitizeNumericValue = (value: string) => {
  const withoutInvalidChars = value.replace(/[^\d.]/g, "");
  const [integerPart = "", ...decimalParts] = withoutInvalidChars.split(".");
  if (decimalParts.length === 0) {
    return integerPart;
  }
  return `${integerPart}.${decimalParts.join("")}`;
};

window.addEventListener("keydown", (event) => {
  if (!isNumberInput(event.target)) {
    return;
  }

  if (["e", "E", "+", "-"].includes(event.key)) {
    event.preventDefault();
  }
});

window.addEventListener("input", (event) => {
  if (!isNumberInput(event.target)) {
    return;
  }

  const sanitized = sanitizeNumericValue(event.target.value);
  if (event.target.value !== sanitized) {
    event.target.value = sanitized;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
  