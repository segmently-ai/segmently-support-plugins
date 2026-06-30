# FlexibleLayout CustomEmbed Section

Use this reference when a Claude Design output is a section inside an existing
Segmently `FlexibleLayout` screen, not a standalone WebEmbed screen.

## Target Requirements

- The host screen must be `FlexibleLayout`.
- The target section is a `CustomEmbed` section.
- For paywall-style sections, products should come from a `ProductCatalog`
  child section or an existing product catalog on the same screen.
- Do not convert a native `Paywall` screen into `FlexibleLayout` automatically.
  Ask the user to confirm the structural change in the editor first.

## Apply Flow

Read the host section before changing it:

```bash
segmently funnels custom-screen section get <funnelId> <versionId> <screenId> <projectId>
```

Apply one section at a time:

```bash
segmently funnels custom-screen section apply <funnelId> <versionId> <projectId> \
  --screen <hostScreenId> \
  --section <embedSectionId> \
  --html-file screens/<slug>/updated/index.html \
  --data-sources-file screens/<slug>/updated/data-sources.json
```

Use `--create-section` with `--label` and `--order` only when the target
`CustomEmbed` section does not exist yet.

## Purchase Button Schemes

- **Scheme A:** the embed owns both product selection and purchase; it calls the
  SDK purchase method with the selected product id.
- **Scheme B:** the embed owns product selection and a native Segmently purchase
  button charges the selected product. After applying the section, link the
  native button to the embed's product catalog with a screen patch that sets the
  section parent relationship.
- **Scheme C:** a selection embed writes the selected product id into a variable,
  and a separate button embed reads that variable and performs purchase. Use only
  when the user explicitly wants the purchase button to be custom HTML too.

## Verification

After every apply:

```bash
segmently funnels custom-screen healthcheck <funnelId> <versionId> <projectId>
segmently funnels export <funnelId> <versionId> <projectId>
```

For paywall sections, verify the published config contains the expected product
ids and run a test purchase only after the user approves publishing a test or
draft funnel.
