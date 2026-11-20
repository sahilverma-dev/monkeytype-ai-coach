import { createRoot } from "react-dom/client";
import { Dashboard } from "@/ui/dashboard/Dashboard";
import "@/styles/base.css";

document.body.classList.add("mtai-root");
createRoot(document.getElementById("root") as HTMLElement).render(<Dashboard />);
