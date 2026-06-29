# Segmently Support Plugins

Public read-only Codex marketplace for Segmently customer support plugins.


## Install

```bash
codex plugin marketplace add segmently-ai/segmently-support-plugins --ref stable
codex plugin add segmently-launch-assistant@segmently-support
```

## Update

```bash
codex plugin marketplace upgrade segmently-support
codex plugin add segmently-launch-assistant@segmently-support
```

Start a new Codex thread after reinstalling so updated plugin skills are loaded.

## Pin A Release

```bash
codex plugin marketplace add segmently-ai/segmently-support-plugins --ref v0.1.0-codex.<hash>
codex plugin add segmently-launch-assistant@segmently-support
```

This repository is generated from Segmently SupportFlow source. Do not edit generated plugin files by hand.
