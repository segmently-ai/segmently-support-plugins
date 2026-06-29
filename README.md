# Segmently Support Plugins

Public read-only marketplace for Segmently customer support plugins.


## Codex Install

```bash
codex plugin marketplace add segmently-ai/segmently-support-plugins --ref stable
codex plugin add segmently-launch-assistant@segmently-support
```

## Codex Update

```bash
codex plugin marketplace upgrade segmently-support
codex plugin add segmently-launch-assistant@segmently-support
```

Start a new Codex thread after reinstalling so updated plugin skills are loaded.

## Codex Pin A Release

```bash
codex plugin marketplace add segmently-ai/segmently-support-plugins --ref v0.1.0-codex.<hash>
codex plugin add segmently-launch-assistant@segmently-support
```

## Claude Code Install

```bash
claude plugin marketplace add segmently-ai/segmently-support-plugins@stable --scope user
claude plugin install segmently-launch-assistant@segmently-support --scope user
```

## Claude Code Update

```bash
claude plugin marketplace update segmently-support
claude plugin update segmently-launch-assistant@segmently-support --scope user
```

Start a new Claude Code thread after updating so refreshed plugin skills are loaded.

## Claude Code Pin A Release

```bash
claude plugin marketplace add segmently-ai/segmently-support-plugins@v0.1.0-codex.<hash> --scope user
claude plugin install segmently-launch-assistant@segmently-support --scope user
```

This repository is generated from Segmently SupportFlow source. Do not edit generated plugin files by hand.
