import type { ImportReplaysArgs, ImportReplaysResult, BattleListRow, BattleDetailsDto } from "../model/battles.types";

export const BattlesApi = {
  importReplays: (args: ImportReplaysArgs): Promise<ImportReplaysResult> =>
    window.api.battles.importReplays(args),
  
  list: (args?: { limit?: number; offset?: number }): Promise<BattleListRow[]> =>
    window.api.battles.list(args),

  getDetails: (battleId: string) => window.api.battles.getDetails(battleId) as Promise<BattleDetailsDto>,
  
};