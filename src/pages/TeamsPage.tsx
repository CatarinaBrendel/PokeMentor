// src/pages/TeamsPage.tsx
import TeamImportCard from "../features/teams/teamImportCard";

export function TeamsPage() {
  return (
    <div className="w-full p-8 space-y-8">
      <h1 className="text-2xl font-semibold text-dust-900">
        Teams
      </h1>

      <TeamImportCard />

      {/* Future:
          <TeamList />
          <TeamVersions />
      */}
    </div>
  );
}