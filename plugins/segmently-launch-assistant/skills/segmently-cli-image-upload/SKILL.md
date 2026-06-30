---
name: segmently-cli-image-upload
description: Upload images shared during Codex work to the Segmently CDN and return reusable URLs. Use when the user asks to save, upload, host, or get a URL for a screenshot/image from the chat, macOS clipboard, or a local image file.
---

# Segmently CLI Image Upload

Use this skill when the user asks for a URL for an image during Codex work.
Upload through the public Segmently CLI asset command. This skill must work from
an installed skill/plugin copy and must not depend on the Segmently source
repository, internal dev projects, or private service endpoints.

## Default Destination

- If the user gives a project id or the task is tied to a known Segmently
  project, use that project id.
- If no project is known, ask explicitly for the Segmently `projectId` before
  uploading. Do not treat the account, email, funnel id, or screen id as a
  replacement for `projectId`. The helper also accepts `SEGMENTLY_ASSET_PROJECT`
  or `SEGMENTLY_PROJECT`.
- If the image was pasted into chat, first clarify whether you can access the
  attachment/clipboard in the current agent environment. If not, ask for an
  absolute local file path or ask the user to copy the image again.
- Store Codex-shared images under:
  `projects/<projectId>/cli-assets/agent-upload/<timestamp>_<name>`.
- Always include the project/namespace and storage path in the answer, even
  when the user mainly asked for the original URL.

## Workflow

1. If the image was pasted into the chat, first try to save it from the macOS
   clipboard. This requires running `osascript` with escalation.
2. If clipboard extraction fails or the clipboard is stale, ask for a local file
   path or ask the user to copy the image again.
3. If `projectId` is still missing, stop and ask for it before running upload.
4. Upload with:
   ```bash
   node scripts/upload-clipboard-image.mjs \
     --project <projectId>
   ```
5. For an existing local image file:
   ```bash
   node scripts/upload-clipboard-image.mjs \
     --file /absolute/path/image.png \
     --project <projectId>
   ```
6. Before upload, the helper checks the local image size. The default maximum
   is 10 MB, matching the Segmently image upload limit. For large raster
   images, downscale before upload on the client:
   ```bash
   node scripts/upload-clipboard-image.mjs \
     --file /absolute/path/image.png \
     --project <projectId> \
     --resize-max-edge 2400 \
     --resize-format webp \
     --resize-quality 85
   ```
   Resizing must preserve the original image proportions. The helper scales the
   image to fit inside the requested max edge; it must not crop, stretch, pad,
   or change aspect ratio.
   SVG and GIF files are not resized by the helper; reduce or replace them if
   they exceed `--max-upload-bytes`.
7. Return this compact shape to the user:
   ```text
   Project/namespace: <projectId>
   Path: projects/<projectId>/cli-assets/agent-upload/<name>
   Original URL: <origin>
   Small URL: <small>
   Asset: { "original": "<origin>", "small": "<small>" }
   ```

## Auth And Capability Rules

- Prefer `segmently assets upload-image`, which calls
  `/api/cli/v1/projects/:projectId/assets/upload/image`.
- CLI upload requires `assets:write` and the target project Billing Access
  capability `cli_assets.upload_image`.
- If the CLI reports `auth_required`, run `segmently auth status` and ask the
  user to authorize the target environment before retrying.
- If the CLI reports a missing project capability, tell the user the project
  needs `cli_assets.upload_image` enabled; do not retry through an alternate
  private endpoint.
- Segmently image upload rejects files over 10 MB. Run the helper with
  `--resize-max-edge` for client-side downscale when a screenshot or Figma
  export is too large. Segmently still produces its normal `origin` and
  `small` CDN variants after the preflight file is accepted.
- Never print API keys, CLI tokens, or refresh tokens.

## Useful Options

```bash
--project <id>       # defaults to SEGMENTLY_ASSET_PROJECT, then SEGMENTLY_PROJECT
--env <env>          # optional Segmently CLI environment override
--folder <folder>    # defaults to agent-upload under cli-assets
--name <name>        # defaults to clipboard
--file <path>        # upload a file instead of reading macOS clipboard
--max-upload-bytes <n>   # defaults to 10485760
--warn-upload-bytes <n>  # defaults to 5242880
--resize-max-edge <px>   # downscale raster images before upload
--resize-format <format> # keep, webp, jpeg, png; defaults to keep
--resize-quality <n>     # JPEG/WebP quality; defaults to 85
--asset              # print only { original, small }
--raw-url            # print only the original URL
```

## Verification

```bash
node --check scripts/upload-clipboard-image.mjs
node scripts/upload-clipboard-image.mjs --help
```
