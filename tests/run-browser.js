const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
function runBrowser(file, virtualTime = false) {
  const profile = mkdtempSync(join(tmpdir(),'quiz-assistant-test-'));
  const result = spawnSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions',
    `--user-data-dir=${profile}`, ...(virtualTime ? ['--virtual-time-budget=45000'] : []),
    '--dump-dom', pathToFileURL(file).href],
    { encoding:'utf8', timeout:60000, windowsHide:true, maxBuffer:2000000 });
  if (result.error) throw result.error;
  const report = result.stdout.match(/<pre id="results">([\s\S]*?)<\/pre>/)?.[1] || `No browser test report (exit ${result.status})`;
  console.log(report);
  if (!report.includes('ALL_TESTS_PASSED')) process.exitCode = 1;
}
async function main() {
  runBrowser(join(__dirname,'browser.html'));
  runBrowser(join(__dirname,'runtime-browser.html'),true);
  if (!process.argv.includes('--moodle')) return;
  // Test against the real upstream handler; keep third-party files only in a temporary directory.
  const directory = mkdtempSync(join(tmpdir(),'quiz-moodle-fixture-'));
  const sources = {
    JQUERY: 'https://code.jquery.com/jquery-3.7.1.min.js',
    MOODLE: 'https://raw.githubusercontent.com/moodle/moodle/MOODLE_405_STABLE/question/type/ddwtos/amd/src/ddwtos.js',
    STYLE: 'https://raw.githubusercontent.com/moodle/moodle/MOODLE_405_STABLE/question/type/ddwtos/styles.css'
  };
  let html = readFileSync(join(__dirname,'moodle-browser.html'),'utf8');
  for (const [name,url] of Object.entries(sources)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fixture download failed: ${response.status}`);
    const file = join(directory, name === 'STYLE' ? 'moodle.css' : `${name.toLowerCase()}.js`);
    writeFileSync(file, await response.text());
    html = html.replace(`__${name}_URL__`,pathToFileURL(file).href);
  }
  html = html.replace('__CONTENT_URL__',pathToFileURL(join(__dirname,'../content.js')).href);
  const file = join(directory,'test.html');
  writeFileSync(file,html);
  runBrowser(file,true);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
