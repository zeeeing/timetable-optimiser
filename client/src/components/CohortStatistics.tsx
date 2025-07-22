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
  const { optimisation_scores } = cohort;

  // mock data
  // const mockOptimisationScores = [
  //   10, 12, 12, 13, 14, 14, 14, 15, 16, 16, 17, 18, 18, 18, 18, 19, 20, 20, 20,
  //   21,
  // ];

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle>Cohort Statistics</CardTitle>
        <CardDescription>Total Residents: {total_residents}</CardDescription>
      </CardHeader>

      {/* histogram of optimisation scores */}
      <CardContent>
        <OptimiseScoreHistogram optimisationScores={optimisation_scores} />
      </CardContent>
      <CardFooter className="flex justify-center">
        <p>Optimisation Score Distribution</p>
      </CardFooter>
    </Card>
  );
};

export default CohortStatistics;
