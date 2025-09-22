import React from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

interface WeightageSelectorProps {
  value: {
    preference: number;
    seniority: number;
    elective_shortfall_penalty: number;
    core_shortfall_penalty: number;
    sr_preference: number;
    sr_y2_not_selected_penalty: number;
  };
  setValue: (val: {
    preference: number;
    seniority: number;
    elective_shortfall_penalty: number;
    core_shortfall_penalty: number;
    sr_preference: number;
    sr_y2_not_selected_penalty: number;
  }) => void;
}

const WeightageSelector: React.FC<WeightageSelectorProps> = ({
  value,
  setValue,
}) => {
  const handleChange =
    (
      field:
        | "preference"
        | "sr_preference"
        | "sr_y2_not_selected_penalty"
        | "seniority"
        | "elective_shortfall_penalty"
        | "core_shortfall_penalty"
    ) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue({ ...value, [field]: Number(e.target.value) });
    };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Weightages</h2>
      <p className="text-sm text-gray-500">
        Adjust the weightages to determine how much weight the different factors
        can contribute and influence the optimal timetable solution.
      </p>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4 items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="preference">
            Preference Satisfaction
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Residents get more points for hitting higher-rank choices.
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
          <Label htmlFor="sr_preference">
            SR Preference Satisfaction
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Residents get more points for hitting higher-rank SR choices.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="sr_preference"
            type="number"
            value={value.sr_preference}
            onChange={handleChange("sr_preference")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr_y2_not_selected_penalty">
            SR not given in Y2 Penalty
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Applies a small penalty if a Y2 resident has no SR posting.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="sr_y2_not_selected_penalty"
            type="number"
            value={value.sr_y2_not_selected_penalty}
            onChange={handleChange("sr_y2_not_selected_penalty")}
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
                Seniors will outrank juniors more strongly when slots conflict.
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
          <Label htmlFor="elective_shortfall_penalty">
            Elective Shortfall Penalty
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Failing to meet elective targets carries a higher point cost.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="elective_shortfall_penalty"
            type="number"
            value={value.elective_shortfall_penalty}
            onChange={handleChange("elective_shortfall_penalty")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="core_shortfall_penalty">
            Core Shortfall Penalty
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Missing core blocks becomes very expensive; solver fills them
                first.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="core_shortfall_penalty"
            type="number"
            value={value.core_shortfall_penalty}
            onChange={handleChange("core_shortfall_penalty")}
          />
        </div>
      </div>
    </div>
  );
};

export default WeightageSelector;
