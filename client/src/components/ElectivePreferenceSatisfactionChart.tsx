import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { ElectivePreferenceSatisfaction } from "@/types";

type Props = {
  data: ElectivePreferenceSatisfaction;
};

const ElectivePreferenceSatisfactionChart: React.FC<Props> = ({ data }) => {
  const chartData = Object.entries(data).map(([key, value]) => ({
    name: key
      .replace("_", " ")
      .replace("choice", " Choice")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
    count: value,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis label={{ value: "Resident Count", angle: -90, dx: -15 }} />
        <Tooltip />
        <Legend />
        <Bar
          dataKey="count"
          name="Resident Count"
          barSize={50}
          fill="#3b82f6"
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ElectivePreferenceSatisfactionChart;
