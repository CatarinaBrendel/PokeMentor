import type { DashboardKpis } from "../model/dashboard.types";

export const DashboardApi = {
  getKpis: (): Promise<DashboardKpis> => window.api.dashboard.getKpis(),
};