# Project Profile

`project-profile.json` stores reusable Figma-to-WebEmbed conversion decisions
for one product, project, or design system. It prevents repeated questions
while keeping decisions explicit and reviewable.

The profile is optional, but recommended for repeated imports from the same
Figma file family.

## Location

Keep the profile beside the run artifacts by default:

```text
<run-dir>/project-profile.json
```

If the user wants a durable shared profile, store it in a project-controlled
location and copy or reference it for each run. Do not hardcode local absolute
paths inside the skill or generated catalogs.

## Shape

```json
{
  "schemaVersion": "figma-webembed-project-profile/v1",
  "name": "Project WebEmbed Import Profile",
  "source": {
    "figmaFileKey": "<fileKey>",
    "projectId": "<optional-project-id>"
  },
  "defaults": {
    "statusBar": "omit",
    "footerCta": "fixed-outside-scroll",
    "headerActions": {
      "back": { "action": "navigateBack" },
      "skip": { "action": "navigateNext" },
      "close": { "action": "disabled" }
    },
    "testIdPattern": "screen-{screenId}-{role}",
    "optionTestIdPattern": "screen-{screenId}-option-{slug}"
  },
  "screenOverrides": {
    "S005": {
      "footerCta": "scroll-with-content",
      "headerActions": {
        "skip": { "action": "navigateTo:S011" }
      }
    }
  },
  "classification": {
    "paywallLayerSignals": ["Paywall", "Pricing", "Subscription"],
    "paywallScreenNamePatterns": ["paywall", "pricing", "purchase"]
  },
  "notes": []
}
```

## Decision Precedence

Use this order:

1. screen override in the profile;
2. explicit run answer from the user;
3. profile default;
4. unresolved decision.

Record the source on each screen:

```json
{
  "conversionDecisions": {
    "footerCta": {
      "detected": true,
      "decision": "fixed-outside-scroll",
      "source": "project-profile"
    }
  }
}
```

If the source is unresolved, keep the screen in `needs-user-decision`.

## Device Chrome Rule

The `defaults.statusBar` decision covers all Figma device preview chrome, not
only the text/time row. When it is `omit`, generated WebEmbed artifacts must
remove or hide:

- the top OS/browser status bar;
- battery, wifi, cellular, URL, notch, and browser control preview elements;
- the bottom iOS home indicator stripe;
- decorative footer preview strips.

Those elements must not be represented as runtime `Media` data sources because
they are preview chrome, not screen content.

## Extending The Profile

When a new pattern is discovered, ask the user whether the answer should be:

- applied only to the current screen;
- applied to all screens in the current run;
- saved to the project profile as a reusable default.

Never silently promote a one-off answer into a project default.

## Public Skill Constraint

The profile may contain project-specific design decisions, but it must not
contain secrets, local filesystem paths, or assumptions about a specific user's
machine.
