# Minimal Segmently SDK Snippets

Use only the SDK calls needed for the current screen. Keep fallback text in the
DOM so local preview remains understandable.

## Ready

```js
segmentlySDK.ready().then(function (sdk) {
  init(sdk);
});
```

## Text Data Source

```js
function text(sdk, label, fallback) {
  var section = sdk.getChildSectionText(label);
  return section && section.title ? section.title : fallback;
}
```

## Generic Child Section

```js
var section = sdk.getChildSection('Benefits');
var sections = sdk.getChildSections();
```

## Media

```js
var media = sdk.getChildSectionMedia('Hero media');
if (media && media.url) {
  image.src = media.url;
}
```

## Variables

```js
var current = sdk.getVariable('goal');
sdk.setVariable('goal', 'improve_focus');
var definition = sdk.getVariableDefinition('goal');
```

## Child Data-Source Actions

Use child data-source actions for editor-managed branching from custom HTML.
These calls bypass the parent WebEmbed callback and route through graph action
keys on child sections.

```js
var cta = sdk.getChildSection('Continue CTA');
if (cta && cta.kind === 'Button') {
  document.querySelector('[data-action="continue"]').textContent =
    cta.data.buttonText || 'Continue';
  document.querySelector('[data-action="continue"]').onclick = function () {
    sdk.triggerButtonAction('Continue CTA');
  };
}

var goals = sdk.getChildSection('Goals');
var first = goals && goals.data && goals.data.options && goals.data.options[0];
if (first) {
  sdk.triggerOptionAction('Goals', first.optionId || 0);
}
```

- `triggerButtonAction(labelOrId)` routes through
  `section.{childSectionId}.button`.
- `triggerOptionAction(labelOrId, optionIdOrIndex)` routes through
  `section.{childSectionId}.item.{index}` for `OptionsList` and
  `SingleSelectionList`.
- `MultipleSelectionList` does not branch through `triggerOptionAction`; use
  `setVariable()` plus fallback navigation for custom multi-select flows.

## Fallback Navigation

```js
sdk.navigateNext();
sdk.navigateBack();
```

Use `navigateNext()` only for whole-screen fallback/continue behavior. It maps
to the parent WebEmbed `embed.callback` action key, not to child
`Button`/`SingleSelectionList` edges.

## Products

```js
var products = sdk.getProducts();
var price = sdk.getProductPrice(products[0].productId);
sdk.selectProduct(products[0].productId);
sdk.purchaseProduct(products[0].productId);
```

## Local Preview Guard

If a screen must preview outside Segmently, wrap SDK access in guards but keep
the production path simple:

```js
if (!window.segmentlySDK) {
  console.warn('Segmently SDK is unavailable in local preview.');
} else {
  segmentlySDK.ready().then(init);
}
```
