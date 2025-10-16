import React, { useEffect, useRef } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Switch } from "./ui/switch";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { InfoIcon } from "lucide-react";

interface WeightageSelectorProps {
  value: {
    preference: number;
    sr_preference: number;
    seniority: number;
    elective_shortfall_penalty: number;
    core_shortfall_penalty: number;
  };
  setValue: (val: {
    preference: number;
    sr_preference: number;
    seniority: number;
    elective_shortfall_penalty: number;
    core_shortfall_penalty: number;
  }) => void;
}

const weightageKeys = [
  "preference",
  "sr_preference",
  "seniority",
  "elective_shortfall_penalty",
  "core_shortfall_penalty",
] as const;

type WeightageKey = (typeof weightageKeys)[number];

const DEFAULT_WEIGHTAGES: Record<WeightageKey, number> = {
  preference: 1,
  sr_preference: 5,
  seniority: 1,
  elective_shortfall_penalty: 10,
  core_shortfall_penalty: 10,
};

interface WeightageOption {
  key: WeightageKey;
  label: string;
  summary: string;
  tooltip?: React.ReactNode;
}

const WEIGHTAGE_OPTIONS: WeightageOption[] = [
  {
    key: "preference",
    label: "Preference Satisfaction",
    summary: "Bonus when a resident lands one of their top picks.",
  },
  {
    key: "sr_preference",
    label: "SR Preference Satisfaction",
    summary: "Rewards residents for matching their preferred SR departments.",
  },
  {
    key: "seniority",
    label: "Seniority Bonus",
    summary: "Pushes seniors ahead of juniors when slots are contested.",
  },
  {
    key: "elective_shortfall_penalty",
    label: "Elective Shortfall Penalty",
    summary: "Penalises residents who fall short of elective requirements.",
    tooltip: (
      <div className="space-y-1 text-xs">
        <p>R1: No specific requirements</p>
        <p>R2: 1 - 2 electives completed</p>
        <p>R3: 5 electives completed</p>
      </div>
    ),
  },
  {
    key: "core_shortfall_penalty",
    label: "Core Shortfall Penalty",
    summary: "Makes missing core postings by year 3 extremely costly.",
  },
];

const WeightageSelector: React.FC<WeightageSelectorProps> = ({
  value,
  setValue,
}) => {
  const lastNonZeroRef = useRef<Record<WeightageKey, number>>(
    (() => {
      const base = { ...DEFAULT_WEIGHTAGES };
      weightageKeys.forEach((key) => {
        if (value[key] > 0) {
          base[key] = value[key];
        }
      });
      return base;
    })()
  );

  useEffect(() => {
    weightageKeys.forEach((key) => {
      if (value[key] > 0) {
        lastNonZeroRef.current[key] = value[key];
      }
    });
  }, [value]);

  const toggleWeightage =
    (field: WeightageKey) =>
    (checked: boolean): void => {
      if (checked) {
        const restored =
          lastNonZeroRef.current[field] > 0
            ? lastNonZeroRef.current[field]
            : DEFAULT_WEIGHTAGES[field];
        setValue({ ...value, [field]: restored });
        return;
      }

      if (value[field] > 0) {
        lastNonZeroRef.current[field] = value[field];
      }
      setValue({ ...value, [field]: 0 });
    };

  const handleAdvancedChange =
    (field: WeightageKey) =>
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const rawValue = Number(event.target.value);
      const sanitized = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
      setValue({ ...value, [field]: sanitized });
    };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Weightages</h2>
          <p className="text-sm text-gray-500">
            Toggle the scoring factors that should influence the optimisation.
            Use advanced settings to fine-tune the underlying weightage values.
          </p>
        </div>

        {/* advanced settings */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              Advanced settings
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" side="bottom" align="end">
            <div className="flex flex-col gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Adjust weightage values</h3>
                <p className="text-xs text-muted-foreground">
                  Values greater than zero keep the factor enabled. Set to zero
                  to turn it off.
                </p>
              </div>
              {WEIGHTAGE_OPTIONS.map((option) => {
                const inputId = `advanced-${option.key}`;
                return (
                  <div key={option.key} className="flex flex-col gap-2">
                    <Label htmlFor={inputId}>{option.label}</Label>
                    <Input
                      id={inputId}
                      type="number"
                      min={0}
                      step="0.1"
                      value={value[option.key]}
                      onChange={handleAdvancedChange(option.key)}
                    />
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* switch toggles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {WEIGHTAGE_OPTIONS.map((option) => {
          const switchId = `weightage-${option.key}`;
          return (
            <Item className="border-md">
              <ItemContent>
                <ItemTitle>
                  {option.label}
                  <span>
                    {option.tooltip && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <InfoIcon size={16} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {option.tooltip}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </ItemTitle>
                <ItemDescription className="text-xs">
                  {option.summary}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch
                  id={switchId}
                  checked={value[option.key] > 0}
                  onCheckedChange={toggleWeightage(option.key)}
                />
              </ItemActions>
            </Item>
          );
        })}
      </div>
    </div>
  );
};

export default WeightageSelector;
