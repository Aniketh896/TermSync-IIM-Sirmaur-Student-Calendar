// Run by `npm install` (the "prepare" script): points git at .githooks/, so
// `npm run verify` runs before every `git push`. Does nothing outside a git
// checkout (for example a downloaded ZIP) and never fails the install.
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
try {
  if (git(['rev-parse', '--is-inside-work-tree']).stdout.trim() !== 'true') process.exit(0);
  const current = git(['config', '--get', 'core.hooksPath']).stdout.trim();
  if (current && current !== '.githooks') {
    console.log('(git hooks: core.hooksPath is already "' + current + '" — left alone. Run npm run verify before pushing.)');
    process.exit(0);
  }
  if (!current) git(['config', 'core.hooksPath', '.githooks']);
  console.log('git hooks: npm run verify will run before every git push.');
} catch (e) {
  // never block an install over hooks
}
