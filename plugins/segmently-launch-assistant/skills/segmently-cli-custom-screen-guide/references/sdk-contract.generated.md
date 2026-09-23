# Shared custom-screen authoring rules

Generated from the same catalog consumed by the backend specialist. Do not edit this projection by hand.

Version: custom-screen-authoring.v3. Source SHA-256: cceb4a9ba3e94d531db2399c8aa1066d5812048ca2b55b29b175b9243c74045b.

Select only the rules and methods required by the actual screen, render mode and authorized operation. Do not paste the entire skill or this catalog into the main strategy prompt.

Backend specialist profiles: variable-callback-v1 (iframe); editor-data-sources-v1 (iframe). Each request still requires a compatible example and approved packet. Disabled profiles are not granted by this catalog.

## SDK method meanings

### ready

Rule: sdk.ready. Capability: initialize.

window.segmentlySDK.ready() resolves to sdk but has no built-in rejection or timeout for a missing host initialization. Use a 10-second client deadline per initialization attempt. While waiting or failed, disable dependent inputs and actions; after failure show an accessible explanation and an enabled Retry control that starts a fresh attempt. Ignore late results from timed-out or superseded attempts, clear timers on completion/page exit, and prevent concurrent retries. Keep entered answers unchanged across retries; restore saved SDK answers once on the first successful initialization. Do not navigate or write answers before readiness.

### getVariable

Rule: sdk.getVariable. Capability: read-variables.

sdk.getVariable(id) reads only an approved read binding. Preserve zero, false and decimal text.

### setVariable

Rule: sdk.setVariable. Capability: write-variables.

sdk.setVariable(id, value) synchronously queues a validated value for an approved write binding; it returns no Promise. The web host stores scalar answers as text, including numeric variables. For user-entered numeric answers, pass the original validated decimal string unchanged (including trailing zeroes); do not convert through Number, parseFloat, toFixed or rounding before writing. Perform every required write before sdk.navigateNext(); pending writes travel with its callback.

### navigateNext

Rule: sdk.navigateNext. Capability: continue.

sdk.navigateNext() invokes the host-owned embed.callback; the SDK carries pending writes with that callback. Never guess a destination.

### navigateBack

Rule: sdk.navigateBack. Capability: back.

sdk.navigateBack() requests the previous screen from host history. Never guess a previous id, complete the current step or write fabricated answers. On a direct entry with no history, the host may leave this screen visible; retain retry controls.

### getChildSection

Rule: sdk.getChildSection. Capability: read-data-sources.

sdk.getChildSection(idOrLabel) returns an editor-owned child section with its id, label, kind and serialized data, or null. Use the supplied stable section id or unique label; verify the expected kind before using data.

### getChildSectionText

Rule: sdk.getChildSectionText. Capability: read-text.

sdk.getChildSectionText(idOrLabel) returns a Text section projection or null. Author Text as title-only unless the exported schema and editor support richer fields. Bind runtime copy to the supplied title; a preview fallback must not hide a missing required runtime source.

### getChildSectionMedia

Rule: sdk.getChildSectionMedia. Capability: read-media.

sdk.getChildSectionMedia(idOrLabel) returns a Media projection with url and type, or null. Read replaceable content media from this source. Use only approved completed assets with the supplied alternative text; preserve the intended aspect ratio.

### getVariableDefinition

Rule: sdk.getVariableDefinition. Capability: read-definitions.

sdk.getVariableDefinition(id) reads an approved canonical definition. Preserve complete option ids, labels and order; option labels are not stored values. Prefer each serialized selection item.optionId to positional mapping across different arrays.

### getChildSections

Rule: sdk.getChildSections. Capability: read-data-sources.

sdk.getChildSections() returns editor-owned child data sources. Restrict use to the approved sections in the packet; do not discover unrelated user or product data.

### triggerButtonAction

Rule: sdk.triggerButtonAction. Capability: button-actions.

sdk.triggerButtonAction(idOrLabel) routes an approved Button child section through section.{childSectionId}.button. The host graph owns the destination. Complete required validated writes before triggering this action; it does not use the parent embed.callback.

### triggerOptionAction

Rule: sdk.triggerOptionAction. Capability: single-choice-actions.

sdk.triggerOptionAction(idOrLabel, optionIdOrIndex) routes an approved SingleSelectionList or existing OptionsList through section.{childSectionId}.item.{index}. Prefer the canonical optionId. The host resolves its bound selection write before routing. MultipleSelectionList is unsupported: explicitly write its validated array and use the allowed whole-screen continuation.

### getProducts

Rule: sdk.getProducts. Capability: product-catalog.

sdk.getProducts() reads products from the owning ProductCatalog after readiness. Use canonical product ids and catalog text; never invent products or prices.

### getProductPrice

Rule: sdk.getProductPrice. Capability: product-catalog.

sdk.getProductPrice(productId) reads the resolved ProductCatalog price for an approved product. Preserve currency, interval and terms from the real catalog; do not infer missing prices.

### selectProduct

Rule: sdk.selectProduct. Capability: product-catalog.

sdk.selectProduct(productId) selects an approved product in the owning ProductCatalog. Selection is not purchase success and must not complete the checkout flow.

### purchaseProduct

Rule: sdk.purchaseProduct. Capability: product-catalog.

sdk.purchaseProduct(productId) starts the host-owned purchase action for the approved owning ProductCatalog product. Preserve the user gesture and supported paywall render profile. Only authoritative checkout confirmation establishes success; never fabricate payment state.

## Artifact and verification rules

### content.editor-owned

Applies to: create, data-source-update.

User-facing copy, option labels, validation messages and replaceable media belong to typed editor-owned data sources. Keep stable canonical ids. Structural styling and frozen decorative brand marks may remain static; localized or replaceable content may not.

### update.preserve-scope

Applies to: html-update, text-update.

For a saved artifact preserve identity, data sources, variables, graph, assets, structure and styling outside explicit allowed changes. HTML-only updates cannot introduce sections or rewire actions.

### design.frozen-kit

Applies to: create.

Use the resolved strategy theme, template primitives and versioned component kit. Compatible examples supply mechanics and composition; never copy sample product facts, labels, answers or an unrelated palette.

### design.responsive-media

Applies to: create, data-source-update, html-update.

Use a width-derived aspect-ratio box for width-scaling media; never a fixed-height container that clips or overlaps labels. Preserve supplied typography, spacing and visual proportions. Check narrow and wide runtime widths.

### render.iframe-scroll

Applies to: iframe-screen.

For a whole-screen iframe, honor the resolved page height and footer/scroll contract. Do not hardcode the source design frame width.

### render.shadow-scroll

Applies to: shadow-dom.

For shadow DOM, honor the host scroll owner and approved head-loaded fonts. Do not introduce iframe viewport-pinning rules such as min-height:100vh or overflow:hidden.

### selection.backing

Applies to: choice-collection.

Choice collection needs the canonical selection child section, matching boundSectionId/boundScreenIds/screenBindings and stable option ids. Keep option field visibility consistent with itemLayout. Do not create a floating selection variable.

### verification.interaction-map

Applies to: create, data-source-update.

Record every required interactive control with a stable unique registry-compatible selector, role and allowed action. Independently verify the DOM and actual SDK behavior; a self-reported interaction map is not acceptance proof.

### verification.published

Applies to: coordinator.

Validate data-source references and graph edges, read back saved artifacts, then verify the returned published runtime URL and visual parity. Healthcheck alone does not prove design fidelity or full-flow behavior.

### behavior.refusal-truthful

Applies to: stay-and-retry.

Declining confirmation does not make valid answers incomplete or invalid. Keep the current answers and editing controls; do not write, confirm or advance. Use neutral review/edit guidance for valid data. Preserve any unresolved validation, missing-source, initialization or write-failure explanation and its recovery action. Valid answers do not mean an SDK operation failure has recovered. Never manufacture an answer or clear it to implement refusal.

### content.editor-example-roles

Applies to: editor-data-sources.

The disclosure example uses exactly one Text source for each semantic label: screen.heading, system.unavailable, system.retry, system.action-failed and system.open-first. Their text is approved localized content, including recovery messages. Other Text, Media and list sources provide the explanation; Button and single-choice sources own their supplied graph actions. Preserve the actual ids and labels; these source roles do not grant new content or navigation.

### content.missing-source-recovery

Applies to: editor-data-sources.

Before SDK readiness or when a required source is unavailable, use the packet snapshot of the approved system.unavailable and system.retry Text values to show the error and label Retry. This is a bounded recovery fallback, not replacement product content: keep dependent actions disabled, never use a snapshot to conceal missing required content, and read current operational Text values from the SDK when available. Preserve unresolved errors through retries and ignore late readiness results.
