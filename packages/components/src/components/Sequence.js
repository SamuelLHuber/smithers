import React from "react";
/** @typedef {import("./SequenceProps.ts").SequenceProps} SequenceProps */

/**
 * @param {SequenceProps} props
 */
export function Sequence(props) {
    if (props.skipIf)
        return null;
    // Sequence carries no host props of its own; pass an empty bag (align with
    // the sanitizing structural components) so control props don't leak through.
    return React.createElement("smithers:sequence", {}, props.children);
}
