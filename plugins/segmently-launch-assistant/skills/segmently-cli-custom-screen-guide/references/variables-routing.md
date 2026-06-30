# Variables, Selection Data Sources, And Routing

Custom screens can read variables, write variables, and produce values used by
child action edges or callback edge conditions.

## SDK Access

```js
var value = sdk.getVariable('goal');
sdk.setVariable('goal', 'improve_focus');

var definition = sdk.getVariableDefinition('goal');
if (definition && Array.isArray(definition.options)) {
  definition.options.forEach(function (option) {
    // option.id is the stable value used by conditions.
  });
}
```

Healthcheck detects literal SDK references in:

- `getVariable('id')`;
- `setVariable('id', value)`;
- `getVariableDefinition('id')`;
- `onVariableChange('id', fn)`;
- `offVariableChange('id', fn)`.

## Selection Backing

Choice variables (`enum` and `enum[]`) collected on a WebEmbed screen should be
backed by a selection data source:

- `SingleSelectionList` for `enum`;
- `MultipleSelectionList` for `enum[]`;
- `OptionsList` only when that is the exported existing shape.

The variable should include:

- `boundScreenIds` containing the screen id;
- `boundSectionId` pointing to the selection section id;
- options whose IDs match values stored by the screen and used by route
  conditions.

For `SingleSelectionList` child action branching, `boundSectionId` is the link
between the variable, the child data source, and the runtime selection write
performed by `segmentlySDK.triggerOptionAction(labelOrId, optionIdOrIndex)`.
Prefer option IDs from the exported variable definition so conditions and
separate item edges continue to reference the same semantic choice.

## Option Values

Do not assume the user-facing label is the variable value. Prefer this order:

1. existing enum option id from the funnel export;
2. existing HTML `data-id` or stored value;
3. generated stable lowercase value only if no existing value exists.

If callback conditions already compare against option UUIDs, keep those UUIDs
as `variableValue` even when the display label is different.

## Child Data-Source Action Edges

Use child action edges for editor-managed branching from custom HTML:

- `Button` child data source: connect `section.{childSectionId}.button`.
- `SingleSelectionList` or existing `OptionsList` child data source: connect
  `section.{childSectionId}.item.{index}`.

In HTML, call:

```js
sdk.triggerButtonAction('Continue CTA');
sdk.triggerOptionAction('Goals', 'option-id-or-zero-based-index');
```

`triggerOptionAction()` writes the selected option through the bound selection
data source before routing. It is intentionally not supported for
`MultipleSelectionList`; multi-select flows should use `setVariable()` and a
fallback continue action.

## Callback Edges File

Use `--edges-file` only when parent WebEmbed callback routing changes are
required. This file replaces `embed.callback` edges; it does not create child
`Button` or `SingleSelectionList` action edges.

```json
[
  {
    "to": "next-screen-id",
    "conditions": [
      {
        "key": "goal",
        "operator": "equals",
        "value": "improve_focus"
      }
    ]
  }
]
```

After applying an edges file, run healthcheck on the source screen. It verifies
that condition variables are available at that point in the funnel and that the
operator matches the variable type.

For child action edges, use a graph manifest or editor handles instead of
`custom-screen apply --edges-file`.

## Variable Apply Flow

1. Generate `<run-dir>/variables.json`.
2. Run `variables apply --dry-run`.
3. Apply variables only after dry run succeeds.
4. Apply the custom screen.
5. Run healthcheck.

Do not apply a screen that references a missing variable.
