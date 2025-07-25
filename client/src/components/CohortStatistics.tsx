import type { Statistics } from "../types";
import OptimiseScoreHistogram from "./OptimiseScoreHistogram";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./ui/card";

const CohortStatistics: React.FC<{
  statistics: Statistics;
}> = ({ statistics }) => {
  const { total_residents, cohort } = statistics;
  const { optimisation_scores_normalised } = cohort;

  // mock data
  // const mockOptimisationScores = Array.from({ length: 100 }, () =>
  //   Math.floor(Math.random() * 51) + 50
  // );

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle>Cohort Statistics</CardTitle>
        <CardDescription>Total Residents: {total_residents}</CardDescription>
      </CardHeader>

      {/* histogram of optimisation scores */}
      <CardContent>
        <OptimiseScoreHistogram optimisationScores={optimisation_scores_normalised} />
      </CardContent>
      <CardFooter className="flex justify-center">
        <p>Optimisation Score Distribution</p>
      </CardFooter>
    </Card>
  );
};

export default CohortStatistics;
