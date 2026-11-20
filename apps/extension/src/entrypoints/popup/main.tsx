import { createRoot } from "react-dom/client";
import { Popup } from "@/ui/popup/Popup";
import "@/styles/base.css";

document.body.classList.add("mtai-root", "mtai-popup");
createRoot(document.getElementById("root") as HTMLElement).render(<Popup />);
