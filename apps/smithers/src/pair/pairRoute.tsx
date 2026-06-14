import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "../app/rootRoute";
import { PairPage } from "./PairCoding";

export const pairRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pair",
  component: PairPage,
});
