// CCR postings bundle
export const CCR_POSTINGS: string[] = [
  "GM (NUH)",
  "GM (SGH)",
  "GM (CGH)",
  "GM (SKH)",
];

// for constraint accordion
export const SECTIONS = [
  {
    title: "Bonuses & Penalties",
    items: [
      // Preference & seniority
      {
        label: "Preference Satisfaction",
        text: "Points for each ranked choice filled: `preference * (6 − rank)`.",
      },
      {
        label: "Seniority Bonus",
        text: "Points per block weighted by postgraduate year (`seniority_weight × year × blocks`).",
      },

      // Elective shortfall
      {
        label: "Elective Shortfall Penalty",
        text: "Y2: must complete ≥2 electives (or ≥1 if no prefs). Y3: must complete ≥5 electives. Missing ones incur `elective_shortfall_penalty` each.",
      },

      // Core shortfall
      {
        label: "Core Shortfall Penalty",
        text: "Y3 only: missing blocks of ED, GRM or GM at year’s end incur `core_shortfall_penalty` per block.",
      },
    ],
  },
  {
    title: "Requirements",
    items: [
      {
        label: "ED & GRM Selections",
        text: "Exactly 1 ED and 1 GRM selection (unless already done historically).",
      },
      {
        label: "MICU/RCCM Contiguity",
        text: "If any MICU or RCCM blocks are assigned, they must form one contiguous run.",
      },
      {
        label: "Dec–Jan Boundary",
        text: "No posting may span the December (block 6) → January (block 7) boundary.",
      },
    ],
  },
];
