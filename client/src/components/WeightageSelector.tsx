import React from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface WeightageSelectorProps {
  value: {
    preference: number;
    seniority: number;
    core: number;
    curr_nonad_penalty: number;
  };
  setValue: (val: {
    preference: number;
    seniority: number;
    core: number;
    curr_nonad_penalty: number;
  }) => void;
}

const WeightageSelector: React.FC<WeightageSelectorProps> = ({
  value,
  setValue,
}) => {
  const handleChange =
    (field: "preference" | "seniority" | "core" | "curr_nonad_penalty") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue({ ...value, [field]: Number(e.target.value) });
    };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Weightages</h2>
      <p className="text-sm text-gray-500">
        Adjust the weightages to prioritise different factors in the
        optimisation.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="preference">Preference Weight</Label>
          <Input
            id="preference"
            type="number"
            value={value.preference}
            onChange={handleChange("preference")}
            defaultValue={1}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="seniority">Seniority Bonus</Label>
          <Input
            id="seniority"
            type="number"
            value={value.seniority}
            onChange={handleChange("seniority")}
            defaultValue={2}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="core">Core Completion Bonus</Label>
          <Input
            id="core"
            type="number"
            value={value.core}
            onChange={handleChange("core")}
            defaultValue={10}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="curr_nonad_penalty">
            Curriculum Non-Adherence Penalty
          </Label>
          <Input
            id="curr_nonad_penalty"
            type="number"
            value={value.curr_nonad_penalty}
            onChange={handleChange("curr_nonad_penalty")}
            defaultValue={10}
          />
        </div>
      </div>
    </div>
  );
};

export default WeightageSelector;
