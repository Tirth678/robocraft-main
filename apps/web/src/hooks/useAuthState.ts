import { useEffect, useState } from "react";
import { getStoredAuth, subscribeToAuthChange, type StoredAuth } from "@/lib/auth";

export const useAuthState = () => {
  const [auth, setAuth] = useState<StoredAuth | null>(() => getStoredAuth());

  useEffect(() => subscribeToAuthChange(() => setAuth(getStoredAuth())), []);

  return auth;
};
