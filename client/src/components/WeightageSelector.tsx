import React from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

interface WeightageSelectorProps {
  value: {
    preference: number;
    seniority: number;
    core: number;
    curr_deviation_penalty: number;
  };
  setValue: (val: {
    preference: number;
    seniority: number;
    core: number;
    curr_deviation_penalty: number;
  }) => void;
}

const WeightageSelector: React.FC<WeightageSelectorProps> = ({
  value,
  setValue,
}) => {
  const handleChange =
    (field: "preference" | "seniority" | "core" | "curr_deviation_penalty") =>
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
          <Label htmlFor="preference">
            Preference Weight
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                How much weightage to give each preference level.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="preference"
            type="number"
            value={value.preference}
            onChange={handleChange("preference")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="seniority">
            Seniority Bonus
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Prioritise more senior residents (e.g. R3 {">"} R2 {">"} R1).
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="seniority"
            type="number"
            value={value.seniority}
            onChange={handleChange("seniority")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="core">
            Core Completion Bonus
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Bonus for completing all required core postings earlier.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="core"
            type="number"
            value={value.core}
            onChange={handleChange("core")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="curr_deviation_penalty">
            Curriculum Deviation Penalty
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Penalty for deviating from set curriculum timeline (e.g.
                completing at least 2 electives by year 2).
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="curr_deviation_penalty"
            type="number"
            value={value.curr_deviation_penalty}
            onChange={handleChange("curr_deviation_penalty")}
          />
        </div>
      </div>
    </div>
  );
};

export default WeightageSelector;
