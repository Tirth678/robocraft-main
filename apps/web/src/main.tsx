import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auth is Neon Auth via `contexts/AuthContext`. A Clerk provider used to wrap
// the app whenever VITE_CLERK_PUBLISHABLE_KEY was set, which left a dormant
// auth path and pulled Clerk into the client bundle for every visitor.
createRoot(document.getElementById("root")!).render(<App />);
