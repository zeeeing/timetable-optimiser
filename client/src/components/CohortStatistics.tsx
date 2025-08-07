import type { Statistics } from "../types";
import OptimisationScoreHistogram from "./OptimisationScoreHistogram";
import OptimisationScoreTable from "./OptimisationScoreTable";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./ui/card";

type Props = {
  statistics: Statistics;
  residents: Array<{
    mcr: string;
    name: string;
  }>;
};

const CohortStatistics: React.FC<Props> = ({ residents, statistics }) => {
  const { total_residents, cohort } = statistics;
  const { optimisation_scores } = cohort;

  // Map optimisation scores to resident scores with actual names
  const mappedScores = optimisation_scores.map((score, index) => {
    const resident = residents[index];
    return {
      residentName: resident ? resident.name : `Resident ${index + 1}`,
      score: score,
    };
  });

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle>Cohort Statistics</CardTitle>
        <CardDescription>Total Residents: {total_residents}</CardDescription>
      </CardHeader>

      {/* histogram of optimisation scores */}
      <CardContent className="flex flex-col md:flex-row justify-center items-center gap-6">
        <OptimisationScoreHistogram
          optimisationScores={mappedScores.map((r) => r.score)}
        />
        <OptimisationScoreTable scores={mappedScores} />
      </CardContent>
    </Card>
  );
};

export default CohortStatistics;
