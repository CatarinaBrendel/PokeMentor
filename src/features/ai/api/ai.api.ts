import type { EvTrainingRecipe, EvTrainingRequest } from "../model/evTraining.types";

export const AiApi = {
  getEvTrainingRecipe: (args: EvTrainingRequest): Promise<EvTrainingRecipe> =>
    window.api.ai.getEvTrainingRecipe(args),
};
