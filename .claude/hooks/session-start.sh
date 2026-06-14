#!/bin/bash
set -euo pipefail

# Only run in remote (web) sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Set PYTHONPATH so `import modular_math` works from any working directory.
# The package lives at the repo root with no external pip dependencies.
echo "export PYTHONPATH=\"${CLAUDE_PROJECT_DIR}\"" >> "$CLAUDE_ENV_FILE"

# Sanity-check that the core package is importable
python3 -c "from modular_math.vm import VirtualMachine; print('modular_math: ok')"

# Sanity-check that node is available for the JS test suite
node --version > /dev/null && echo "node: ok"
