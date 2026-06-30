# Legacy Custom Screen Migration

Use this reference only when an existing screen uses older custom-screen APIs.
Do not introduce legacy APIs in new work.

## Common Replacements

| Legacy pattern | Preferred V2 pattern |
| --- | --- |
| `leaveCustomScreen()` | `sdk.navigateNext()` |
| `backScreen()` | `sdk.navigateBack()` |
| global `inputs` proxy | `sdk.getVariable()` / `sdk.setVariable()` |
| static product ids and prices | `sdk.getProducts()` / `sdk.getProductPrice()` |
| hardcoded option arrays | `SingleSelectionList` / `MultipleSelectionList` |

## Migration Rules

- Preserve existing user-visible behavior first.
- Replace one legacy surface at a time.
- After changing variable or navigation logic, run healthcheck before applying
  more screens.
- Keep fallback text during migration so local preview remains readable.
