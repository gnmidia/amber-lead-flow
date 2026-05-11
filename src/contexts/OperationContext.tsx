import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Operation = {
  id: string;
  name: string;
  slug: string;
  instance_name: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
};

const STORAGE_KEY = "innova_current_operation_id";

type OperationContextValue = {
  operations: Operation[];
  currentOperation: Operation | null;
  currentOperationId: string | null;
  setCurrentOperation: (op: Operation) => void;
  isLoading: boolean;
};

const OperationContext = createContext<OperationContextValue | undefined>(undefined);

export function OperationProvider({ children }: { children: ReactNode }) {
  const { data: operations = [], isLoading } = useQuery({
    queryKey: ["operations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations" as any)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Operation[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const [currentId, setCurrentId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  // Once operations load, ensure currentId is valid; otherwise default to first.
  useEffect(() => {
    if (!operations.length) return;
    const stillValid = currentId && operations.some((o) => o.id === currentId);
    if (!stillValid) {
      const fallback = operations[0].id;
      setCurrentId(fallback);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, fallback);
    }
  }, [operations, currentId]);

  const currentOperation = useMemo(
    () => operations.find((o) => o.id === currentId) ?? null,
    [operations, currentId],
  );

  const setCurrentOperation = (op: Operation) => {
    setCurrentId(op.id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, op.id);
  };

  const value: OperationContextValue = {
    operations,
    currentOperation,
    currentOperationId: currentId,
    setCurrentOperation,
    isLoading,
  };

  return <OperationContext.Provider value={value}>{children}</OperationContext.Provider>;
}

export function useOperation() {
  const ctx = useContext(OperationContext);
  if (!ctx) throw new Error("useOperation must be used within an OperationProvider");
  return ctx;
}
