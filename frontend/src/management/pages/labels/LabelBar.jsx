// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0

/**
 * The color bar of a holder label: the item's metal above, the cost bracket
 * of one piece below (holder-labels-design.md, "The color bar").
 *
 * `bar` is `splitBar`'s: each color a `#rrggbb` or null for a block left
 * blank; `metalPattern` `'striped'` lays white diagonal lines over the metal's
 * color, to tell it from a solid metal of the same color. A filled block has a thin outline, so a white one (clad, nickel)
 * shows on white stock; a blank block is not drawn, and keeps its place, so
 * a block's place still says which it is. `title` names the colors where the
 * bar is shown on the screen rather than printed.
 */
export default function LabelBar({ bar, className = 'label-bar', title }) {
  const block = (color, which, pattern) => (
    <span
      className={['label-bar-block', color && 'filled', color && pattern]
        .filter(Boolean)
        .join(' ')}
      data-block={which}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
  return (
    <span className={className} aria-hidden={title ? undefined : true} title={title}>
      {block(bar.metal, 'metal', bar.metalPattern)}
      {block(bar.cost, 'cost')}
    </span>
  )
}
