// src/features/battles/ui/useBattlesList.ts
import { useEffect, useState } from "react";
import type { BattleListItem } from "../model/battles.types";
import { BattlesApi } from "../api/batles.api";

export function useBattlesList() {
  const [rows, setRows] = useState<BattleListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const raw = await BattlesApi.list({ limit: 200, offset: 0 });
      setRows(raw);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load battles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return { rows, loading, error, refresh };
}