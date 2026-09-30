#!/usr/bin/env bash
# Publishes site/ (from `npm run site`) to the gh-pages branch, which GitHub Pages serves at
# https://roofooevazan.github.io/pd2-filter-forge/
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-site.mjs
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -r site/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" commit -q -m "Site: download page and how-to guide"
git push -q -f "$REMOTE" gh-pages
echo "Published to gh-pages."
