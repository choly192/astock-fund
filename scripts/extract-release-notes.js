'use strict';

const fs = require('fs');
const path = require('path');

const [tag, outputPath] = process.argv.slice(2);
if (!tag || !outputPath) {
  throw new Error('Usage: node scripts/extract-release-notes.js <tag> <output-file>');
}

const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
if (!match) {
  throw new Error(`Release tag must use the v<semver> format: ${tag}`);
}

const projectRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8'));
const version = match[1];
if (manifest.version !== version) {
  throw new Error(
    `Tag ${tag} does not match package.json version ${manifest.version}`
  );
}
if (lockfile.version !== version || lockfile.packages?.['']?.version !== version) {
  throw new Error(
    `package-lock.json version does not match package.json version ${version}`
  );
}

const changelog = fs.readFileSync(path.join(projectRoot, 'CHANGELOG.md'), 'utf8');
const lines = changelog.split(/\r?\n/);
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = new RegExp(`^##\\s+\\[?${escapedVersion}\\]?(?:\\s+-\\s+.+)?\\s*$`);
const start = lines.findIndex((line) => heading.test(line));
if (start === -1) {
  throw new Error(`CHANGELOG.md has no section for version ${version}`);
}

let end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
if (end === -1) end = lines.length;

const notes = lines.slice(start + 1, end).join('\n').trim();
if (!notes) {
  throw new Error(`CHANGELOG.md section ${version} is empty`);
}

fs.writeFileSync(outputPath, `${notes}\n`, 'utf8');
console.log(`Prepared release notes for ${tag}`);
