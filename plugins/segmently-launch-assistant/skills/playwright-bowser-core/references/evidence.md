# Browser Evidence

Use screenshots for quick visual proof, traces for debugging, and video only
when a continuous interaction record is useful.

## Screenshot

```bash
playwright-cli -s=<name> screenshot --filename=segmently-show.png
```

## Trace

```bash
playwright-cli -s=<name> tracing-start
playwright-cli -s=<name> tracing-stop
```

## Video

```bash
playwright-cli -s=<name> video-start
playwright-cli -s=<name> video-stop segmently-flow.webm
```

Prefer screenshots for support answers. Traces and videos are larger and should
be used only when the user needs deeper debugging evidence.
