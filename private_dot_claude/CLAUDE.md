# Global Claude Code Instructions

## LSP-First Code Navigation

When working in code files (TS, JS, Python, Rust, Go, etc.):

1. Use LSP goToDefinition instead of grepping for function/class definitions
2. Use LSP findReferences instead of grepping for symbol usages
3. Use LSP hover to check types instead of reading entire files
4. Use LSP documentSymbol to understand file structure
5. Only use Grep for: text searches, TODOs, string literals, log messages, config values
6. Only fall back to Grep when LSP returns empty results or is unavailable
# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.
