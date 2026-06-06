import { useMemo } from "react";
import type { Edge } from "@xyflow/react";
import { workflowToFlow } from "../askme/workflowFlow";
import { WorkflowGraph } from "../askme/WorkflowGraph";
import { usePreferencesStore } from "../app/preferencesStore";
import { TEMPLATES, loopBack, proposeWorkflow } from "./createWorkflowFlow";
import { goalResponse } from "./onboardingScript";
import { useOnboardingStore } from "./onboardingStore";

/**
 * Phase three: the metaworkflow. Smithers proposes a real workflow from the
 * goal and renders it live in the same graph the rest of the app uses, so the
 * word "workflow" becomes a picture. Two plain-language toggles map onto node
 * kinds (an approval gate, a loop), a name, then Create. Everything is derived
 * from the draft in the store — flip a toggle and the graph re-lays-out.
 */
export function WorkflowBuilder() {
  const draft = useOnboardingStore((state) => state.draft);
  const pickTemplate = useOnboardingStore((state) => state.pickTemplate);
  const toggleApproval = useOnboardingStore((state) => state.toggleApproval);
  const toggleLoop = useOnboardingStore((state) => state.toggleLoop);
  const setName = useOnboardingStore((state) => state.setName);
  const editGoal = useOnboardingStore((state) => state.editGoal);
  const createWorkflow = useOnboardingStore((state) => state.createWorkflow);
  const theme = usePreferencesStore((state) => state.theme);

  const { nodes, edges } = useMemo(() => {
    const spec = proposeWorkflow(draft);
    const flow = workflowToFlow(spec);
    const back = loopBack(draft);
    if (!back) {
      return flow;
    }
    const loopEdge: Edge = {
      id: `${back.from}->${back.to}`,
      source: back.from,
      target: back.to,
      type: "smoothstep",
      animated: true,
      label: back.label,
      style: { stroke: "var(--brand)" },
      labelStyle: { fill: "var(--brand)", fontSize: 11, fontWeight: 600 },
    };
    return { nodes: flow.nodes, edges: [...flow.edges, loopEdge] };
  }, [draft]);

  const loopAvailable = TEMPLATES[draft.templateId].loop !== null;

  return (
    <div className="ob-build">
      <div className="ob-lines">
        {goalResponse(draft).map((line) => (
          <p className="ob-line" key={line.id}>
            {line.text}
          </p>
        ))}
      </div>

      <div className="ob-graph">
        <WorkflowGraph nodes={nodes} edges={edges} theme={theme} />
      </div>

      <div className="ob-refine">
        <div className="ob-templates" role="group" aria-label="Workflow shape">
          {Object.values(TEMPLATES).map((template) => (
            <button
              aria-pressed={template.id === draft.templateId}
              className={template.id === draft.templateId ? "ob-tmpl is-pick" : "ob-tmpl"}
              key={template.id}
              type="button"
              onClick={() => pickTemplate(template.id)}
            >
              {template.label}
            </button>
          ))}
        </div>

        <label className="ob-toggle">
          <input checked={draft.withApproval} type="checkbox" onChange={toggleApproval} />
          <span className="ob-switch" aria-hidden="true" />
          <span className="ob-toggle-label">Pause for my approval before it acts</span>
        </label>
        <label className={loopAvailable ? "ob-toggle" : "ob-toggle ob-toggle--disabled"}>
          <input
            checked={draft.withLoop}
            disabled={!loopAvailable}
            type="checkbox"
            onChange={toggleLoop}
          />
          <span className="ob-switch" aria-hidden="true" />
          <span className="ob-toggle-label">
            {loopAvailable
              ? "Loop until the check passes"
              : "Loop until the check passes (this shape doesn't loop)"}
          </span>
        </label>

        <label className="ob-name">
          <span className="ob-name-label">Name</span>
          <input
            aria-label="Workflow name"
            className="ob-name-input"
            value={draft.name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </div>

      <footer className="ob-foot">
        <button className="ob-back" type="button" onClick={editGoal}>
          ← Change goal
        </button>
        <button className="ob-create" type="button" onClick={createWorkflow}>
          Create workflow →
        </button>
      </footer>
    </div>
  );
}
