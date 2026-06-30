# FlexibleLayout CustomEmbed Product Variable Paywall

Use this workflow when a FlexibleLayout screen has multiple WebEmbedded /
CustomEmbed sections and the selected product from one section must update copy
in another section before purchase.

## Supported No-API-Change Pattern

Build the paywall as one FlexibleLayout screen:

- CustomEmbed A owns the child `ProductCatalog` data source and renders the
  product cards.
- CustomEmbed A calls `sdk.selectProduct(productId)` on selection.
- CustomEmbed A writes one aggregate variable, for example
  `selected_product`, containing a JSON snapshot:

```js
sdk.setVariable('selected_product', JSON.stringify({
  id: product.productId,
  label: label,
  price: price
}));
```

- CustomEmbed B listens to the same aggregate variable and updates its label:

```js
sdk.onVariableChange('selected_product', function (event) {
  var selected = JSON.parse(String(event.newValue || '{}'));
  labelEl.textContent = selected.label || 'Select a plan';
  priceEl.textContent = selected.price || '';
});
```

Keep purchase in CustomEmbed A, because that section owns the `ProductCatalog`
and can safely resolve `sdk.purchaseProduct(selectedProductId)`.

## Why One Aggregate Variable

Do not write `selected_product_id`, `selected_product_label`, and
`selected_product_price` as separate variables in the same click handler when a
sibling CustomEmbed must react immediately. The runtime stores only the latest
`lastVariableUpdate` broadcast for sibling iframes, so React batching can cause
only the final variable to reach `onVariableChange()`.

Use one aggregate JSON variable so the sibling receives product id, label, and
price in one update.

## Purchase Button Pattern

Inside CustomEmbed A:

```js
var selectedProduct = null;

function select(product) {
  var price = sdk.getProductPrice(product.productId);
  selectedProduct = product;
  sdk.selectProduct(product.productId);
  sdk.setVariable('selected_product', JSON.stringify({
    id: product.productId,
    label: product.labels && (product.labels.topStart || product.labels.description) || product.productId,
    price: price && (price.displayPrice || price.priceAndCurrency || price.priceAmount) || ''
  }));
}

buyButton.onclick = function () {
  if (!selectedProduct) return;
  if (typeof sdk.setEmail === 'function') {
    sdk.setEmail('test-buyer@example.com');
  }
  sdk.purchaseProduct(selectedProduct.productId, {
    onSuccess: function () { statusEl.textContent = 'PAYMENT_SUCCESS'; },
    onCancel: function () { statusEl.textContent = 'PAYMENT_CANCEL'; },
    onError: function () { statusEl.textContent = 'PAYMENT_ERROR'; }
  });
};
```

For subscription products, ensure the funnel has an email value before purchase.
For tests, `sdk.setEmail()` can seed a runtime email variable; in production,
prefer a real email input screen or placement email binding.

## Verification

After publish, verify all of the following against the published URL:

1. Product cards render from `sdk.getProducts()`.
2. Selecting a non-default product calls `sdk.selectProduct(productId)`.
3. CustomEmbed B updates from `sdk.onVariableChange('selected_product', ...)`.
4. The purchase button calls `sdk.purchaseProduct(selectedProductId)`.
5. Wire-layer payment capture matches the selected product, not the default
   product. For paid-trial/no-trial/one-time products, assert a
   `payment_intent` with non-empty amount and currency. For free-trial
   products, assert `setup_intent`.

Customer-safe browser verification can be done after publishing with the
published funnel URL:

```bash
playwright-cli -s=customembed-paywall open <publishedUrl> --headed --persistent
```

In the browser, select a non-default product, confirm the sibling label/price
changes, then run the approved checkout/test-purchase flow only when the
customer explicitly authorizes it. The verification must prove the selected
product is the one passed to purchase, not just that a checkout page opened.

## API Extension To Simplify Later

This workflow deliberately avoids runtime API changes. A cleaner long-term API
would expose global product lookups and selected-product subscriptions, for
example:

- `sdk.getProduct(productId)`;
- `sdk.getProductPrice(productId)` from the screen/global product registry, not
  only the current CustomEmbed child `ProductCatalog`;
- `sdk.onSelectedProductChange(callback)`.

With those extensions, sibling sections could pass only `productId` and resolve
labels/prices without embedding a product snapshot or duplicating a catalog.
