# WebEmbed Paywall Flow

For custom paywalls, product identity and pricing should come from
`ProductCatalog` instead of hardcoded HTML. Non-product copy can stay in Text or
BulletList data sources.

## Render Mode

Web Embedded Paywalls must run in shadow DOM mode, not iframe mode. In catalog
artifacts set:

```json
{
  "screenKind": "webembed-paywall",
  "renderMode": "shadow-dom",
  "isIframe": false
}
```

When applying the screen through the CLI, pass `--iframe false` explicitly so
the saved screen does not fall back to the default iframe setting.

Because a paywall renders in a shadow root (not an iframe), it is subject to
shadow-DOM render rules that healthcheck does not catch: load web/icon fonts from
`document.head` (not the embedded `<head>`), and never viewport-pin the wrappers with
`min-height:100vh` / `overflow:hidden`. Run the post-publish render check in
`references/shadow-dom-rendering.md`.

## ProductCatalog Data Source

Use a `ProductCatalog` child section with products configured for the funnel.
The exact product ids come from the target environment. Keep copy labels in the
catalog only when they are meant to be rendered by the paywall HTML.

Materialized data sources should preserve `id`, `kind`, `label`, `order`, and
the product catalog content shape exported or accepted by the CLI.

## SDK Pattern

```js
segmentlySDK.ready().then(function (sdk) {
  var products = sdk.getProducts();
  products.forEach(function (product) {
    var price = sdk.getProductPrice(product.productId);
    // Render product.labels and price.displayPrice.
  });

  function choose(productId) {
    sdk.selectProduct(productId);
  }

  function buy(productId) {
    sdk.purchaseProduct(productId).then(function (result) {
      sdk.setVariable('payment_result', result && result.status ? result.status : 'unknown');
      sdk.navigateNext();
    });
  }
});
```

Use the screen's existing selection and purchase UI. Replace only the hardcoded
product text and price reads.

## Routing

If the funnel branches after payment, add a `payment_result` variable and an
edges file with success/cancel/failure routes. Run `variables apply --dry-run`
before applying the screen.

## Checks

Run:

```bash
segmently funnels custom-screen healthcheck <funnelId> <versionId> <screenId> <projectId>
segmently funnels audit <funnelId> <versionId> <projectId> --require-paywall
```

Healthcheck validates data-source references and variable availability. Audit
validates broader paywall readiness.

## Safety

- Do not hardcode prices such as `$9.99` when product price APIs are available.
- Do not create or mutate live payment products without explicit user approval.
- Preserve existing product selection behavior unless the task asks to change
  the paywall.
- Keep purchase error and retry copy in data sources when possible.
