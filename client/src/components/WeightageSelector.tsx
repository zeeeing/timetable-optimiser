import React from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

interface WeightageSelectorProps {
  value: {
    micu_rccm_weight: number;
    preference: number;
    seniority: number;
    elective_penalty: number;
    core_penalty: number;
  };
  setValue: (val: {
    micu_rccm_weight: number;
    preference: number;
    seniority: number;
    elective_penalty: number;
    core_penalty: number;
  }) => void;
}

const WeightageSelector: React.FC<WeightageSelectorProps> = ({
  value,
  setValue,
}) => {
  const handleChange =
    (
      field:
        | "micu_rccm_weight"
        | "preference"
        | "seniority"
        | "elective_penalty"
        | "core_penalty"
    ) =>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="micu_rccm_weight">
            MICU/RCCM Weight
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                How much the model should emphasise on encouraging MICU/RCCM
                pairings.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="micu_rccm_weight"
            type="number"
            value={value.micu_rccm_weight}
            onChange={handleChange("micu_rccm_weight")}
          />
        </div>
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
                Higher weightage correlates to higher chances of residents
                getting their top choices.
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
            Seniority Weight
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Higher weightage correlates to higher chances of seniors getting
                more optimal timetables compared to juniors.
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
          <Label htmlFor="elective_penalty">
            Elective Penalty
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Penalty for not completing elective requirements on time.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="elective_penalty"
            type="number"
            value={value.elective_penalty}
            onChange={handleChange("elective_penalty")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="core_penalty">
            Core Penalty
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Penalty for not completing core requirements on time.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="core_penalty"
            type="number"
            value={value.core_penalty}
            onChange={handleChange("core_penalty")}
          />
        </div>
      </div>
    </div>
  );
};

export default WeightageSelector;
