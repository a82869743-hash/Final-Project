"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { type Vehicle } from "@/lib/api";

export interface DispatchData {
  vehicle: Vehicle;
  hotspot: { lat: number; lng: number };
  eta: number;
}

interface DispatchContextType {
  dispatch: DispatchData | null;
  setDispatch: (data: DispatchData | null) => void;
}

const DispatchContext = createContext<DispatchContextType | null>(null);

export function DispatchProvider({ children }: { children: ReactNode }) {
  const [dispatch, setDispatch] = useState<DispatchData | null>(null);

  return (
    <DispatchContext.Provider value={{ dispatch, setDispatch }}>
      {children}
    </DispatchContext.Provider>
  );
}

export function useDispatchContext() {
  const context = useContext(DispatchContext);
  if (!context) {
    throw new Error("useDispatchContext must be used within a DispatchProvider");
  }
  return context;
}
