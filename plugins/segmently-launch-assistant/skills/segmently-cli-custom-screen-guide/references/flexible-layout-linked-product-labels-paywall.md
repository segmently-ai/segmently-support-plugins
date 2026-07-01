# FlexibleLayout Linked Product Labels Paywall

Use this workflow when a native FlexibleLayout screen should update copy from the
currently selected ProductCatalog product without adding WebEmbed variable
bridges or changing the runtime SDK API.

## Supported No-API-Change Pattern

Build one FlexibleLayout screen with these sibling sections:

- `ProductCatalog` owns the products and product selection.
- `Text` links to that ProductCatalog through `parentSectionId`.
- `PurchaseButton` links to the same ProductCatalog through `parentSectionId`.

Author product item attributes in the ProductCatalog:

- `descriptionLabel`: copy for the linked Text section.
- `purchaseLabel`: copy for the linked PurchaseButton.

At runtime, the linked sections resolve the currently selected product from the
ProductCatalog selection state:

- linked Text renders `selectedProduct.descriptionLabel` only when its own title
  is empty or missing;
- linked PurchaseButton renders `selectedProduct.purchaseLabel` only when its
  own button label is empty;
- explicit section text always wins and is not overwritten;
- `@price`, `@introPrice`, `@interval`, and other product item variables are
  resolved from the selected product's baked `itemVariablesMap`;
- clicking the linked PurchaseButton still purchases the currently selected
  ProductCatalog product.

This also works when the linked ProductCatalog is a child section inside a
FlexibleLayout `CustomEmbed`, as long as the linked native section stores the
child ProductCatalog id in `parentSectionId`.

## Editor Authoring Checklist

1. Add a ProductCatalog section and configure real products.
2. Enable/fill `descriptionLabel` and `purchaseLabel` for each product item.
3. Add a Text section and clear its title if the selected product description
   should fully drive the label.
4. Link the Text section to the ProductCatalog.
5. Add a PurchaseButton section and clear its button text if the selected product
   should fully drive the CTA label.
6. Link the PurchaseButton section to the same ProductCatalog.
7. Connect the PurchaseButton graph edge with
   `section.{purchaseButtonSectionId}.button`.

Do not use the paywall footer button selector for this workflow. The purchase
control is the FlexibleLayout Button section itself.

## Verification

After publish, verify all of the following against the published URL:

1. The default selected product renders its `descriptionLabel` in the linked Text
   section.
2. The default selected product renders its `purchaseLabel` in the linked
   PurchaseButton.
3. Product variables inside both labels are resolved; raw `@price` /
   `@introPrice` text must not remain visible.
4. Selecting a different product updates both linked labels.
5. Clicking the PurchaseButton after selection sends the selected product to the
   payment wire layer, not the default product.
6. For paid-trial/no-trial/one-time products, assert a `payment_intent` with
   non-empty amount and currency. For free-trial products, assert `setup_intent`.

Capture screenshots for the default product state, selected product state, and
payment intent state. The screenshot comments should state which selected
product is represented and which label source is being proven.

## API Extension To Simplify Later

This workflow deliberately avoids API changes by using `parentSectionId` and the
existing ProductCatalog selection state. A cleaner future API could make more
advanced layouts easier by exposing:

- a global product lookup such as `sdk.getProduct(productId)`;
- a product-price lookup that does not require the caller to own the
  ProductCatalog child section;
- selected-product subscriptions such as `sdk.onSelectedProductChange(callback)`;
- editor bindings that let ordinary Text labels attach directly to a
  ProductCatalog attribute, not only a fallback when the local label is empty.

With those extensions, a WebEmbed or native label section could pass only a
`productId` and resolve product details globally. Until then, prefer this native
linked-section workflow for native FlexibleLayout paywalls and the aggregate
variable workflow only when sibling WebEmbedded sections must communicate.
