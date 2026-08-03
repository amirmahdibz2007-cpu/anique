# Anique

Multi-domain terminal agent. One core. Many lenses.

## Conventions

- Prefer small, focused modules over god-files.
- Never commit API keys; they live in `~/.anique/config.json` (mode 600).
- Lenses are markdown packs under `lenses/` (shipped) and `~/.anique/lenses/` (user overrides).
- Default rhythm: plan before destructive act when unsure.

## Product boundaries (v1)

- No messaging gateway.
- No browser automation.
- CLI + TUI first, portable across Linux/macOS/WSL.
