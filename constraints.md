# Posting Allocator Constraints

All constraints below are implemented in `server/services/posting_allocator.py`. Items marked “Hard” must hold in every solution, while “Soft” items allow trade-offs through penalties or bonuses in the objective.

## Linking and Pre-conditions

- Bindings: Block-level decision vars, selection flags, and run-count vars are tied together (block totals = run_count × duration; selecting a posting implies count ≥ 1 and vice versa).
- Pinned rows: Explicit pins and current-year history rows fix `x[mcr][posting][block] = 1`.
- Leave handling: Declared leaves force `OFF` in those blocks and reserve capacity for the leave’s posting code.

## Hard Constraints

1. Exclusivity per block: Exactly one posting or `OFF` per resident per block (leave blocks forced to `OFF`).
2. Posting capacity: Per-block headcount ≤ `max_residents` minus any leave-reserved slots.
3. Consecutive runs: Postings respect `required_block_duration` via an automaton.
4. CCR availability by stage: No CCR in stage 1; if CCR already done or no stage ≥2 blocks, zero CCR this year; otherwise exactly one CCR run from the offered CCR postings.
5. Core caps: Prevent assigning more core blocks than the base requirement; if already met, block further assignments of that core base.
6. Elective repetition: A resident may take at most one variant of an elective base; if already done historically, all variants of that base are disallowed.
   7a. MICU/RCCM institution consistency: Cannot pick MICU and RCCM from different institutions.
   7b. MICU/RCCM contiguity: Any MICU/RCCM run must be a single contiguous stretch and cannot span Dec→Jan.
7. Dec→Jan guardrail: No posting may have runs in both Dec (block 6) and Jan (block 7).
8. GRM start months: GRM can only start on odd blocks; any GRM on an even block must continue from the prior block.
9. Quarter starts for 3-month runs: Postings of duration 3 may only start on blocks 1, 4, 7, or 10 (non-start blocks must be continuations).
10. Stage-1 GM cap: Max three GM blocks in stage 1.
11. ED↔GRM contiguity: If ED/GRM appear, they must form one contiguous run.
12. ED↔GRM↔GM contiguity: If ED, GRM, and GM all appear, their combined blocks must form one contiguous run.
13. MICU/RCCM stage packs: Stage 1 may optionally do pack (1 MICU, 2 RCCM) or none; if pack not yet done historically, stage1+stage2 must deliver it. If first pack is already done and stage 2 exists, stage 2 may optionally deliver pack (2 MICU, 1 RCCM). Stage 3 must deliver remaining MICU/RCCM blocks to hit three each (adjusted for history).
14. Balancing within halves: For every posting except GM/ED/GRM, resident counts per block are equal within blocks 1–6 and within blocks 7–12 (min == max in each half).
15. SR scheduling limits: At most one SR posting; SR blocks only allowed when career block numbers are 19–30.

- Inactive guardrail: The commented “Hard Constraint 14” (force one ED and one GRM when neither is done historically) is currently disabled.

## Soft Constraints and Objective Terms

- Elective requirements:
  - Stage-2 residents must have at least one elective completed to date (historic + assigned).
  - Bonus for a second elective in stage 2 when elective preferences exist.
  - Stage-3 residents aim for five total electives; falling short incurs an `elective_shortfall_penalty`.
- Core requirements: For stage-3 residents with unmet core bases, equality to the requirement is enforced unless a slack var (`*_req_unmet`) is paid, which incurs `core_shortfall_penalty`.
- SR preference handling: SR preferences are normalised to base postings; only one SR may be selected. Eligibility for SR preference bonuses depends on variant availability and elective preference overlap; SR electives are only bonus-eligible when no elective preferences exist.
- Preference bonus: Weighted by rank (`preference` weight) for resident elective preferences.
- SR preference bonus: Rank-weighted bonus (sharing the `preference` weight) for eligible SR bases.
- Seniority bonus: Higher career stage assignments add value scaled by the `seniority` weight.
- Core prioritisation bonus: Fixed bonus for assigning any core posting.
- ED+GRM pairing bonus: Bonus when both an ED and a GRM are selected.
- Three-GM bonus: Bonus when exactly three GM blocks exist alongside at least one ED and one GRM.
- ED+GRM+GM half-year bundle bonus: Bonus when all three appear but stay within the same half of the year (no cross-boundary bundle).
- GM@KTPH bonus: Bonus for GM (KTPH) blocks in stage 1.
- OFF penalty: Strong penalty for `OFF` blocks that are not reserved for leave.
- S2 elective bonus: Additional bonus flag captured in stage 2 when more than one elective is present (pref-dependent).
