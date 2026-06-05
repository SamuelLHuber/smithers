/** A scheduled workflow trigger. */
export type Cron = {
  id: string;
  name: string;
  pattern: string;
  workflow: string;
  next: string;
};

export const CRONS: Cron[] = [
  {
    id: "c1",
    name: "Nightly audit",
    pattern: "0 3 * * *",
    workflow: "security-audit",
    next: "03:00",
  },
  {
    id: "c2",
    name: "Weekly retro",
    pattern: "0 9 * * 1",
    workflow: "retro",
    next: "Mon 9:00",
  },
];
