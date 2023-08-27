const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath));

module.exports = {
  name: packageJson.name,
  homepage: packageJson.homepage,
  issues: packageJson.bugs.url,
};
