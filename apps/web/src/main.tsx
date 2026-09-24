import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { shadcn } from "@clerk/ui/themes";
import App from "./App.tsx";
import "./index.css";
import "@clerk/ui/themes/shadcn.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById("root")!).render(
  publishableKey ? (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      appearance={{ theme: shadcn }}
    >
      <App />
    </ClerkProvider>
  ) : (
    <App />
  )
);

