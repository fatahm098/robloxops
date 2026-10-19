import { createTRPCRouter } from "../trpc";
import { agentsRouter } from "./agents";
import { deliverablesRouter } from "./deliverables";
import { projectsRouter } from "./projects";
import { settingsRouter } from "./settings";
import { tasksRouter } from "./tasks";

export const appRouter = createTRPCRouter({
  projects: projectsRouter,
  tasks: tasksRouter,
  agents: agentsRouter,
  settings: settingsRouter,
  deliverables: deliverablesRouter,
});

export type AppRouter = typeof appRouter;
