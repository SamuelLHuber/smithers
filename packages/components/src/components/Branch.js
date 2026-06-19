import React from "react";
/** @typedef {import("./BranchProps.ts").BranchProps} BranchProps */

/**
 * @param {BranchProps} props
 */
export function Branch(props) {
    if (props.skipIf)
        return null;
    const chosen = props.if ? props.then : (props.else ?? null);
    // The branch is resolved to `chosen` at render time, so the host element
    // carries no props of its own (align with the sanitizing structural components).
    return React.createElement("smithers:branch", {}, chosen);
}
