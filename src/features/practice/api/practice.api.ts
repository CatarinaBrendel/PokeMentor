import type { PracticeScenarioDetails } from "../model/practice.types";
import type { PracticeScenarioRow } from "../model/practice.types";

export const PracticeApi = {
  listMyScenarios: () =>
    window.api.practice.listMyScenarios() as Promise<PracticeScenarioRow[]>,

  createFromBattleTurn: (battle_id: string, turn_number: number) =>
    window.api.practice.createFromBattleTurn({ battle_id, turn_number }) as Promise<PracticeScenarioRow>,

  getScenario: (id: string) =>
    window.api.practice.getScenario(id) as Promise<PracticeScenarioRow | null>,

  getDetails: (id: string) =>
    window.api.practice.getDetails(id) as Promise<PracticeScenarioDetails> | null,
};