# Changelog

## 1.1.0

### OpenAI support

hm now works with OpenAI in addition to Anthropic. All three modes — single command, doctor, and agent — work with both providers.

On first run, hm asks which provider you want, then prompts for your API key and saves it to your system keychain. That's it — no env vars needed.

```bash
# Just works — uses whichever provider you set up
hm "list running docker containers"

# All modes work with both providers
hm                              # doctor mode
hm .. "help me fix this deploy" # agent mode
hm . "compress this folder"     # dry-run mode
```

To change your default provider:

```bash
hm --set-provider openai
hm --set-provider anthropic
```

Use `--provider` for a one-time override without changing your default:

```bash
hm --provider openai "show disk usage"
```

**Models used:**
- Anthropic: `claude-sonnet-4-6` (command) / `claude-opus-4-6` (agent)
- OpenAI: `gpt-5.4-mini` (command) / `gpt-5.4` (agent)

**Key management** supports both providers. Keys are stored separately in your system keychain. `--reset-key` clears all stored keys. Environment variables (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) can override the keychain if needed, but the keychain is the recommended default.

### Developer experience

- **Test suite**: 76 tests covering all modes × both providers, including compiled binary tests with live API calls.
- **Biome**: Linting and formatting enforced across all source and test files.
- **Git hooks via Lefthook**: Pre-commit runs typecheck + lint. Pre-push runs the full test suite.
- **CI**: Now runs lint and unit tests in addition to typecheck and build.

### Dependencies

- Added `openai` (runtime)
- Added `@biomejs/biome`, `lefthook` (dev)
