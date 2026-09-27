#!/usr/bin/env bash
# Copies this sample into its own Git repository with a short fictional history,
# installs dependencies and initializes Maverick AI, so every CLI command and Lens
# view has real data to work with.
#
#   bash scripts/setup-playground.sh [target-dir] [--force] [--skip-install]
set -euo pipefail

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAVERICK_REPO="$(cd "$SOURCE/../.." && pwd)"
TARGET="$HOME/maverick-playground/nestjs-orders-api"
FORCE=0 INSTALL=1
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --skip-install) INSTALL=0 ;;
    -*) echo "unknown option: $arg" >&2; exit 1 ;;
    *) TARGET="$arg" ;;
  esac
done

if [ -e "$TARGET" ]; then
  if [ "$FORCE" = 1 ]; then rm -rf "$TARGET"; else echo "✗ $TARGET already exists (use --force to recreate it)" >&2; exit 1; fi
fi

# Resolve the Maverick CLI: a global/linked install wins, otherwise use this checkout.
if command -v maverick >/dev/null 2>&1; then
  MAVERICK=(maverick)
else
  [ -f "$MAVERICK_REPO/dist/app.js" ] || (cd "$MAVERICK_REPO" && npm run build --silent)
  MAVERICK=(node "$MAVERICK_REPO/bin/maverick.js")
fi

echo "→ copying sample to $TARGET"
mkdir -p "$TARGET"
(cd "$SOURCE" && tar --exclude=node_modules --exclude=dist --exclude=.maverick --exclude=seed --exclude='*.tsbuildinfo' -cf - .) | (cd "$TARGET" && tar -xf -)
cd "$TARGET"

echo "→ building a fictional Git history"
FILES_DIR="$(mktemp -d)"
cp -R . "$FILES_DIR/snapshot"
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git init -q -b main

ADA=("Ada Rivera" "ada@orders.example")
KENJI=("Kenji Sato" "kenji@orders.example")
LINA=("Lina Okafor" "lina@orders.example")
DAY=1

commit() { # commit <name> <email> <message> <paths...>
  local name="$1" email="$2" message="$3"; shift 3
  local date; date="$(printf '2026-08-%02dT1%d:00:00' "$DAY" $((DAY % 8)))"
  git add -A -- "$@"
  GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" GIT_COMMITTER_NAME="$name" GIT_COMMITTER_EMAIL="$email" \
    GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" git commit -q -m "$message"
  DAY=$((DAY + 2))
}
restore() { for path in "$@"; do mkdir -p "$(dirname "$path")"; cp -R "$FILES_DIR/snapshot/$path" "$path"; done; }
touch_files() { for path in "$@"; do printf '// %s\n' "$NOTE" >> "$path"; done; }

restore package.json tsconfig.json tsconfig.build.json nest-cli.json eslint.config.mjs .gitignore .env.example src/main.ts src/app.module.ts src/config src/health
commit "${ADA[@]}" "chore: bootstrap NestJS api" .
restore src/customers;                          commit "${KENJI[@]}" "feat: customers module" src
restore src/common src/orders/order.entity.ts src/orders/orders.repository.ts src/orders/dto src/orders/orders.controller.ts src/orders/orders.module.ts src/orders/orders.service.ts src/orders/order-pricing.ts
commit "${ADA[@]}" "feat: orders api with cache" src
restore src/payments;                           commit "${LINA[@]}" "feat: payments and webhooks" src
NOTE="charge before emitting order.created"; touch_files src/orders/orders.service.ts src/payments/payments.service.ts
commit "${LINA[@]}" "fix: charge orders before notifying" src
restore src/notifications;                      commit "${KENJI[@]}" "feat: order notifications" src
NOTE="refund on cancel"; touch_files src/orders/orders.service.ts src/payments/payments.service.ts src/orders/orders.controller.ts
commit "${ADA[@]}" "feat: refund paid orders on cancel" src
restore src/reports;                            commit "${KENJI[@]}" "feat: daily revenue report" src
NOTE="round totals to cents"; touch_files src/orders/order-pricing.ts src/payments/currency.ts src/reports/reports.service.ts src/payments/payments.service.ts
commit "${LINA[@]}" "fix: round order totals" src
restore src/orders/orders.service.spec.ts test; commit "${LINA[@]}" "test: orders service and e2e" src test
restore docs README.md scripts;                 commit "${ADA[@]}" "docs: api reference and pagination ADR" .
restore src/orders/orders.service.ts src/orders/order-pricing.ts src/payments/currency.ts src/payments/payments.service.ts src/orders/orders.controller.ts src/reports/reports.service.ts
commit "${KENJI[@]}" "refactor: tidy orders and payments" src
restore .
commit "${ADA[@]}" "chore: sync sample" .
rm -rf "$FILES_DIR"

if [ "$INSTALL" = 1 ]; then
  echo "→ installing dependencies (npm install)"
  npm install --no-audit --no-fund --loglevel=error
fi

echo "→ initializing Maverick AI"
"${MAVERICK[@]}" init </dev/null
# A planned task (PRD, technical spec and task graph) plus a ready solution patch for the full gate flow.
"${MAVERICK[@]}" new "Add cursor pagination to the orders list" --slug add-cursor-pagination --no-launch >/dev/null
cp -R "$SOURCE"/seed/tasks/add-cursor-pagination/. .maverick/tasks/add-cursor-pagination/
mkdir -p .maverick/seed && cp "$SOURCE/seed/add-cursor-pagination.patch" .maverick/seed/
git add -A && GIT_AUTHOR_NAME="${ADA[0]}" GIT_AUTHOR_EMAIL="${ADA[1]}" GIT_COMMITTER_NAME="${ADA[0]}" GIT_COMMITTER_EMAIL="${ADA[1]}" \
  git commit -q -m "chore: initialize Maverick AI and plan cursor pagination"

cat <<DONE

✓ playground ready: $TARGET

  cd "$TARGET"
DONE
if [ "${MAVERICK[0]}" != maverick ]; then
  cat <<DONE
  alias maverick="node $MAVERICK_REPO/bin/maverick.js"   # or: (cd "$MAVERICK_REPO" && npm link)
DONE
fi
cat <<DONE
  maverick doctor
  maverick lens --open

See README.md for a guided tour of every command.
DONE
