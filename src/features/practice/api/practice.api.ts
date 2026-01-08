import type {
  PracticeScenarioRow,
  SelectedAction,
  PracticeAttemptRow,
  PracticeDetailsDto,
} from "../model/practice.types";

export const PracticeApi = {
  listMyScenarios: () =>
    window.api.practice.listMyScenarios() as Promise<PracticeScenarioRow[]>,

  createFromBattleTurn: (battle_id: string, turn_number: number) =>
    window.api.practice.createFromBattleTurn({ battle_id, turn_number }) as Promise<PracticeScenarioRow>,

  getScenario: (id: string) =>
    window.api.practice.getScenario(id) as Promise<PracticeScenarioRow | null>,

  getDetails: (id: string) =>
    window.api.practice.getDetails(id) as Promise<PracticeDetailsDto | null>,

  createAttempt: (scenarioId: string, selectedAction: SelectedAction) =>
    window.api.practice.createAttempt({
      scenario_id: scenarioId,
      selected_action: selectedAction,
    }) as Promise<PracticeAttemptRow>,
};