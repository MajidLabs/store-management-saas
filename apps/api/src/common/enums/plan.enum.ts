export enum Plan {
  FREE = 'FREE',
  PRO = 'PRO',
}

/** Placeholder limits per plan - trivial to change later, see ARCHITECTURE.md section 12. */
export const PLAN_LIMITS: Record<
  Plan,
  { maxProducts: number; maxStaff: number }
> = {
  [Plan.FREE]: { maxProducts: 20, maxStaff: 1 },
  [Plan.PRO]: { maxProducts: Infinity, maxStaff: 10 },
};
