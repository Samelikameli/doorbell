"use client";

import {
  onAuthStateChanged,
  User,
  getAuth,
  signInAnonymously,
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";
import app from "@/firebase";
import { UserContextValue } from "@/types";

const UserContext = createContext<UserContextValue | null>(null);

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within <UserProvider />");
  return ctx;
};

export const UserProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(app);

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          // Ensure every visitor has a stable uid
          const cred = await signInAnonymously(auth);
          setUser(cred.user);
        } else {
          setUser(u);
        }
      } catch (e) {
        console.error("Anonymous sign-in failed:", e);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return <UserContext.Provider value={{ user, loading }}>{children}</UserContext.Provider>;
};
