#!/usr/bin/env node

import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(scriptDirectory);
const privateFixtures = path.join(scriptDirectory, 'fixtures');
const expectedEntryFields = [
  'avatarUrl',
  'email',
  'fullName',
  'message',
  'messageId',
  'timestamp',
  'userId',
].sort();

const parsedArguments = parseArguments(process.argv.slice(2));
const startedAt = new Date();
const report = {
  schemaVersion: 1,
  candidatePath: path.resolve(parsedArguments.candidatePath),
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  checks: [],
  notes: [],
  workDirectory: null,
};

let temporaryRoot;
let activeServer;

process.on('SIGINT', async () => {
  await stopServer(activeServer);
  process.exit(130);
});

try {
  requireNodeVersion();
  const candidateRoot = await resolveCandidateRoot(report.candidatePath);
  report.resolvedCandidateRoot = candidateRoot;

  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'seo-full-stack-eval-'));
  report.workDirectory = temporaryRoot;

  const baselineRoot = path.join(temporaryRoot, 'baseline');
  await copySubmission(candidateRoot, baselineRoot);

  await runCandidateBackendTests(baselineRoot);
  await runBaselineContract(baselineRoot);

  const alternateRoot = path.join(temporaryRoot, 'alternate');
  await copySubmission(candidateRoot, alternateRoot);
  await replaceFixtures(alternateRoot, 'alternate');
  await runGetFixtureCase(alternateRoot, 'alternate fixtures');

  const emptyRoot = path.join(temporaryRoot, 'empty');
  await copySubmission(candidateRoot, emptyRoot);
  await replaceFixtures(emptyRoot, 'empty');
  await runEmptyFixtureCase(emptyRoot);
} catch (error) {
  recordCheck('harness', 'evaluation completed without an unrecoverable harness error', false, errorMessage(error));
} finally {
  await stopServer(activeServer);
  activeServer = undefined;
  report.finishedAt = new Date().toISOString();
  const reportDirectory = await writeReports(report, parsedArguments.reportDirectory);
  const strictFailures = report.checks.filter((check) => !check.passed).length;

  console.log(`\nEvaluation report: ${path.join(reportDirectory, 'report.md')}`);
  console.log(`Checks: ${report.checks.length - strictFailures} passed, ${strictFailures} failed`);

  if (parsedArguments.keepWorkDirectory) {
    console.log(`Temporary submission copies kept at: ${temporaryRoot}`);
  } else if (temporaryRoot) {
    await rm(temporaryRoot, {recursive: true, force: true});
    report.workDirectory = null;
  }

  process.exitCode = strictFailures === 0 ? 0 : 1;
}

function parseArguments(argumentsList) {
  if (argumentsList.length === 0 || argumentsList.includes('--help')) {
    console.log('Usage: eval/run.sh /path/to/submission [--report-dir DIR] [--keep-workdir]');
    process.exit(0);
  }

  const candidatePath = argumentsList[0];
  let reportDirectory;
  let keepWorkDirectory = false;

  for (let index = 1; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--keep-workdir') {
      keepWorkDirectory = true;
    } else if (argument === '--report-dir') {
      reportDirectory = argumentsList[index + 1];
      index += 1;
      if (!reportDirectory) throw new Error('--report-dir requires a path');
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return {candidatePath, reportDirectory, keepWorkDirectory};
}

function requireNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new Error(`Node.js 22.12 or later is required; found ${process.versions.node}`);
  }
}

async function resolveCandidateRoot(candidatePath) {
  const resolved = path.resolve(candidatePath);
  if (await isProjectRoot(resolved)) return resolved;

  const children = await readdir(resolved, {withFileTypes: true});
  const projectDirectories = [];
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const childPath = path.join(resolved, child.name);
    if (await isProjectRoot(childPath)) projectDirectories.push(childPath);
  }

  if (projectDirectories.length === 1) return projectDirectories[0];
  throw new Error(`Could not identify one candidate project under ${resolved}`);
}

async function isProjectRoot(candidatePath) {
  return (await exists(path.join(candidatePath, 'README.md')))
    && (await exists(path.join(candidatePath, 'backend', 'pom.xml')))
    && (await exists(path.join(candidatePath, 'backend', 'mvnw')));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copySubmission(sourceRoot, destinationRoot) {
  const ignoredDirectoryNames = new Set([
    '.git',
    '.idea',
    '.vscode',
    'dist',
    'eval',
    'held-out-tests',
    'node_modules',
    'target',
  ]);

  await cp(sourceRoot, destinationRoot, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(sourceRoot, sourcePath);
      if (!relative) return true;
      const parts = relative.split(path.sep);
      if (parts.some((part) => ignoredDirectoryNames.has(part))) return false;
      return !relative.endsWith('.zip') && !relative.endsWith('.class');
    },
  });

  await chmod(path.join(destinationRoot, 'backend', 'mvnw'), 0o755);
}

async function runCandidateBackendTests(submissionRoot) {
  const logPath = path.join(submissionRoot, 'candidate-backend-tests.log');
  const result = await runCommand('./mvnw', ['test'], {
    cwd: path.join(submissionRoot, 'backend'),
    timeoutMilliseconds: 180_000,
    logPath,
  });

  recordCheck(
    'candidate tests',
    './mvnw test passes',
    result.exitCode === 0,
    result.exitCode === 0 ? 'candidate-visible backend tests passed' : tail(result.output),
  );
}

async function runBaselineContract(submissionRoot) {
  await withRunningServer(submissionRoot, 'baseline', async (baseUrl) => {
    const fixtureData = await readSubmissionFixtures(submissionRoot);
    const initialResponse = await getChatLog(baseUrl);

    await checkGetResponse('baseline GET', initialResponse, fixtureData);
    await checkSequentialPost(baseUrl, fixtureData, initialResponse.json);
  });
}

async function checkSequentialPost(baseUrl, fixtureData, initialChatLog) {
  const user = fixtureData.users[0];
  const nonce = `private-eval-${randomUUID()}`;
  const messageLines = [nonce, 'second private evaluation paragraph'];
  const requestStartedAt = Date.now();
  const response = await requestJson(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({userId: user.id, message: messageLines}),
  });
  const requestFinishedAt = Date.now();

  await check('POST', 'valid message returns 201', () => assert(response.status === 201, `received ${response.status}`));
  await check('POST', 'valid message response is JSON', () => assertJsonMediaType(response));
  await check('POST', 'created response matches the chat-entry schema', () => validateEntry(response.json));

  const originalMaximumId = Math.max(...fixtureData.messages.map((message) => message.id));
  await check('POST', 'backend generates an integer ID greater than loaded IDs', () => {
    assert(Number.isInteger(response.json?.messageId), `messageId was ${JSON.stringify(response.json?.messageId)}`);
    assert(response.json.messageId > originalMaximumId, `${response.json.messageId} was not greater than ${originalMaximumId}`);
  });
  await check('POST', 'backend preserves the submitted user and message paragraphs', () => {
    assert(response.json.userId === user.id, `userId was ${response.json.userId}`);
    assert(deepEqual(response.json.message, messageLines), 'message paragraphs changed');
    assert(response.json.fullName === `${user.firstName} ${user.lastName}`, `fullName was ${response.json.fullName}`);
    assert(response.json.email === user.email, `email was ${response.json.email}`);
    assert(response.json.avatarUrl === user.avatarUrl, `avatarUrl was ${response.json.avatarUrl}`);
  });
  await check('POST', 'backend generates a current parseable timestamp', () => {
    assert(response.status === 201, `POST returned ${response.status}`);
    const timestamp = Date.parse(response.json.timestamp);
    assert(Number.isFinite(timestamp), `timestamp was ${JSON.stringify(response.json.timestamp)}`);
    assert(timestamp >= requestStartedAt - 5_000, 'timestamp predates the request by more than five seconds');
    assert(timestamp <= requestFinishedAt + 5_000, 'timestamp is more than five seconds in the future');
  });

  if (response.status !== 201 || !Number.isInteger(response.json?.messageId)) {
    recordCheck('concurrent POST', 'concurrent creation checks can run', false, 'sequential POST did not establish the documented contract');
    return;
  }

  const afterSinglePost = await getChatLog(baseUrl);
  await check('POST', 'created message appears exactly once in the next GET', () => {
    const matches = afterSinglePost.json.filter((entry) => entry.messageId === response.json.messageId);
    assert(matches.length === 1, `found ${matches.length} entries with ID ${response.json.messageId}`);
    assert(deepEqual(matches[0].message, messageLines), 'stored message paragraphs changed');
    assert(afterSinglePost.json.length === initialChatLog.length + 1, `expected ${initialChatLog.length + 1} entries, got ${afterSinglePost.json.length}`);
  });

  await runConcurrentPosts(baseUrl, user, afterSinglePost.json, response.json.messageId);
}

async function runConcurrentPosts(baseUrl, user, chatLogBefore, minimumId) {
  const requestCount = 64;
  const runNonce = randomUUID();
  let releaseRequests;
  const startingGate = new Promise((resolve) => {
    releaseRequests = resolve;
  });

  const requests = Array.from({length: requestCount}, (_, index) => (async () => {
    await startingGate;
    const marker = `concurrent-${runNonce}-${index}`;
    const result = await requestJson(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({userId: user.id, message: [marker, `line-${index}`]}),
    });
    return {index, marker, result};
  })());

  releaseRequests();
  const responses = await Promise.all(requests);

  await check('concurrent POST', `${requestCount} concurrent valid requests return 201`, () => {
    const failures = responses.filter(({result}) => result.status !== 201);
    assert(failures.length === 0, `${failures.length} requests were not 201: ${failures.slice(0, 5).map(({result}) => result.status).join(', ')}`);
  });

  const returnedIds = responses.map(({result}) => result.json?.messageId);
  await check('concurrent POST', 'all concurrent responses contain distinct integer IDs', () => {
    assert(returnedIds.every(Number.isInteger), 'at least one response ID was not an integer');
    assert(new Set(returnedIds).size === requestCount, `received ${new Set(returnedIds).size} distinct IDs for ${requestCount} requests`);
    assert(returnedIds.every((id) => id > minimumId), 'at least one concurrent ID did not advance beyond the preceding creation');
  });

  await check('concurrent POST', 'every concurrent response preserves its request payload', () => {
    for (const {index, marker, result} of responses) {
      assert(result.json?.userId === user.id, `request ${index} returned userId ${result.json?.userId}`);
      assert(deepEqual(result.json?.message, [marker, `line-${index}`]), `request ${index} returned the wrong message`);
    }
  });

  const finalChatLog = await getChatLog(baseUrl);
  await check('concurrent POST', 'all successful writes are retained exactly once', () => {
    assert(finalChatLog.status === 200, `final GET returned ${finalChatLog.status}`);
    assert(Array.isArray(finalChatLog.json), 'final GET was not an array');
    assert(finalChatLog.json.length === chatLogBefore.length + requestCount, `expected ${chatLogBefore.length + requestCount} entries, got ${finalChatLog.json.length}`);

    for (const {marker, result} of responses) {
      const idMatches = finalChatLog.json.filter((entry) => entry.messageId === result.json.messageId);
      const markerMatches = finalChatLog.json.filter((entry) => entry.message?.includes(marker));
      assert(idMatches.length === 1, `ID ${result.json.messageId} appeared ${idMatches.length} times`);
      assert(markerMatches.length === 1, `${marker} appeared ${markerMatches.length} times`);
    }
  });
  await check('concurrent POST', 'final chat log remains chronologically ordered', () => assertChronological(finalChatLog.json));
}

async function runGetFixtureCase(submissionRoot, caseName) {
  await withRunningServer(submissionRoot, caseName, async (baseUrl) => {
    const fixtures = await readSubmissionFixtures(submissionRoot);
    const response = await getChatLog(baseUrl);
    await checkGetResponse(caseName, response, fixtures);
  });
}

async function runEmptyFixtureCase(submissionRoot) {
  await withRunningServer(submissionRoot, 'empty fixtures', async (baseUrl) => {
    const response = await getChatLog(baseUrl);
    await check('empty fixtures', 'GET returns 200', () => assert(response.status === 200, `received ${response.status}`));
    await check('empty fixtures', 'GET returns JSON', () => assertJsonMediaType(response));
    await check('empty fixtures', 'GET returns an empty array', () => assert(Array.isArray(response.json) && response.json.length === 0, `body was ${JSON.stringify(response.json)}`));
  });
}

async function checkGetResponse(group, response, fixtures) {
  await check(group, 'GET returns 200', () => assert(response.status === 200, `received ${response.status}`));
  await check(group, 'GET returns application/json', () => assertJsonMediaType(response));
  await check(group, 'GET returns a JSON array', () => assert(Array.isArray(response.json), `body was ${JSON.stringify(response.json)}`));

  if (!Array.isArray(response.json)) return;

  await check(group, 'every entry matches the documented schema and types', () => {
    for (const entry of response.json) validateEntry(entry);
  });
  await check(group, 'messages are joined, ordered, and preserved correctly', () => {
    validateChatLogAgainstFixtures(response.json, fixtures);
  });
}

function validateEntry(entry) {
  assert(entry && typeof entry === 'object' && !Array.isArray(entry), 'entry was not an object');
  assert(deepEqual(Object.keys(entry).sort(), expectedEntryFields), `fields were ${Object.keys(entry).sort().join(', ')}`);
  assert(Number.isInteger(entry.messageId), `messageId was ${JSON.stringify(entry.messageId)}`);
  assert(Number.isInteger(entry.userId), `userId was ${JSON.stringify(entry.userId)}`);
  assert(Array.isArray(entry.message) && entry.message.every((line) => typeof line === 'string'), 'message was not a string array');
  assert(typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp)), `timestamp was ${JSON.stringify(entry.timestamp)}`);
  for (const field of ['email', 'fullName', 'avatarUrl']) {
    assert(typeof entry[field] === 'string', `${field} was ${JSON.stringify(entry[field])}`);
  }
}

function validateChatLogAgainstFixtures(actualEntries, fixtures) {
  const usersById = new Map(fixtures.users.map((user) => [user.id, user]));
  const expectedMessages = fixtures.messages
    .filter((message) => usersById.has(message.userId))
    .toSorted((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));

  assert(actualEntries.length === expectedMessages.length, `expected ${expectedMessages.length} entries, got ${actualEntries.length}`);
  assertChronological(actualEntries);

  for (let index = 0; index < expectedMessages.length; index += 1) {
    const expectedMessage = expectedMessages[index];
    const expectedUser = usersById.get(expectedMessage.userId);
    const actual = actualEntries[index];
    assert(actual.messageId === expectedMessage.id, `entry ${index} messageId was ${actual.messageId}, expected ${expectedMessage.id}`);
    assert(actual.userId === expectedMessage.userId, `entry ${index} userId was ${actual.userId}, expected ${expectedMessage.userId}`);
    assert(deepEqual(actual.message, expectedMessage.message), `entry ${index} message paragraphs changed`);
    assert(Date.parse(actual.timestamp) === Date.parse(expectedMessage.timestamp), `entry ${index} timestamp changed`);
    assert(actual.email === expectedUser.email, `entry ${index} email was ${actual.email}`);
    assert(actual.fullName === `${expectedUser.firstName} ${expectedUser.lastName}`, `entry ${index} fullName was ${actual.fullName}`);
    assert(actual.avatarUrl === expectedUser.avatarUrl, `entry ${index} avatarUrl was ${actual.avatarUrl}`);
  }
}

function assertChronological(entries) {
  for (let index = 1; index < entries.length; index += 1) {
    const previous = Date.parse(entries[index - 1].timestamp);
    const current = Date.parse(entries[index].timestamp);
    assert(previous <= current, `entry ${index - 1} (${entries[index - 1].timestamp}) followed by older entry ${index} (${entries[index].timestamp})`);
  }
}

async function readSubmissionFixtures(submissionRoot) {
  const dataDirectory = path.join(submissionRoot, 'backend', 'src', 'main', 'resources', 'data');
  return {
    users: JSON.parse(await readFile(path.join(dataDirectory, 'users.json'), 'utf8')),
    messages: JSON.parse(await readFile(path.join(dataDirectory, 'messages.json'), 'utf8')),
  };
}

async function replaceFixtures(submissionRoot, fixtureName) {
  const destination = path.join(submissionRoot, 'backend', 'src', 'main', 'resources', 'data');
  if (!(await exists(destination))) {
    throw new Error(`Documented fixture directory is missing: ${destination}`);
  }

  await cp(path.join(privateFixtures, fixtureName, 'users.json'), path.join(destination, 'users.json'));
  await cp(path.join(privateFixtures, fixtureName, 'messages.json'), path.join(destination, 'messages.json'));
}

async function withRunningServer(submissionRoot, caseName, callback) {
  const port = await findFreePort();
  const backendDirectory = path.join(submissionRoot, 'backend');
  const logPath = path.join(submissionRoot, `${slug(caseName)}-server.log`);
  activeServer = startServer(backendDirectory, port, logPath);

  try {
    await waitForServer(`http://127.0.0.1:${port}`, activeServer, 90_000);
    recordCheck(caseName, 'application starts and exposes the HTTP endpoint', true, `port ${port}`);
    await callback(`http://127.0.0.1:${port}`);
  } catch (error) {
    recordCheck(caseName, 'application starts and exposes the HTTP endpoint', false, errorMessage(error));
  } finally {
    await stopServer(activeServer);
    activeServer = undefined;
  }
}

function startServer(backendDirectory, port, logPath) {
  const logStream = createWriteStream(logPath, {flags: 'w'});
  const child = spawn(
    './mvnw',
    ['spring-boot:run', `-Dspring-boot.run.arguments=--server.port=${port}`],
    {
      cwd: backendDirectory,
      env: process.env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  const capture = (chunk) => {
    const text = chunk.toString();
    output = (output + text).slice(-80_000);
    logStream.write(text);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('close', () => logStream.end());
  child.capturedOutput = () => output;
  return child;
}

async function waitForServer(baseUrl, serverProcess, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`server exited with ${serverProcess.exitCode}: ${tail(serverProcess.capturedOutput())}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/chat-log`, {signal: AbortSignal.timeout(1_000)});
      if (response.status > 0) return;
    } catch {
      // Startup is still in progress.
    }
    await delay(250);
  }
  throw new Error(`server did not become ready within ${timeoutMilliseconds / 1000} seconds`);
}

async function stopServer(serverProcess) {
  if (!serverProcess || serverProcess.exitCode !== null) return;

  try {
    if (process.platform === 'win32') serverProcess.kill('SIGTERM');
    else process.kill(-serverProcess.pid, 'SIGTERM');
  } catch {
    return;
  }

  const exited = await Promise.race([
    new Promise((resolve) => serverProcess.once('exit', () => resolve(true))),
    delay(5_000).then(() => false),
  ]);

  if (!exited) {
    try {
      if (process.platform === 'win32') serverProcess.kill('SIGKILL');
      else process.kill(-serverProcess.pid, 'SIGKILL');
    } catch {
      // Process already exited.
    }
  }
}

async function getChatLog(baseUrl) {
  return requestJson(`${baseUrl}/api/chat-log`);
}

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, {...options, signal: AbortSignal.timeout(15_000)});
    const text = await response.text();
    let json;
    let jsonError;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      jsonError = errorMessage(error);
    }
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      json,
      jsonError,
      text,
    };
  } catch (error) {
    return {status: 0, contentType: '', json: null, jsonError: errorMessage(error), text: ''};
  }
}

function assertJsonMediaType(response) {
  assert(response.contentType.toLowerCase().includes('application/json'), `content-type was ${JSON.stringify(response.contentType)}`);
  assert(!response.jsonError, `response was not valid JSON: ${response.jsonError}`);
}

async function check(group, name, assertion) {
  try {
    await assertion();
    recordCheck(group, name, true, '');
  } catch (error) {
    recordCheck(group, name, false, errorMessage(error));
  }
}

function recordCheck(group, name, passed, detail) {
  report.checks.push({group, name, passed, detail});
  console.log(`${passed ? 'PASS' : 'FAIL'} [${group}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function tail(value, maximumLength = 2_000) {
  return String(value).slice(-maximumLength).trim();
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function runCommand(command, argumentsList, {cwd, timeoutMilliseconds, logPath}) {
  const logStream = createWriteStream(logPath, {flags: 'w'});
  const child = spawn(command, argumentsList, {
    cwd,
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const capture = (chunk) => {
    const text = chunk.toString();
    output = (output + text).slice(-80_000);
    logStream.write(text);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Process already exited.
    }
  }, timeoutMilliseconds);

  const exitCode = await new Promise((resolve) => {
    child.once('error', () => resolve(127));
    child.once('exit', (code) => resolve(code ?? 1));
  });
  clearTimeout(timeout);
  logStream.end();
  return {exitCode: timedOut ? 124 : exitCode, output};
}

async function writeReports(reportData, requestedDirectory) {
  const timestamp = startedAt.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  const reportDirectory = requestedDirectory
    ? path.resolve(requestedDirectory)
    : path.join(repositoryRoot, 'eval', 'reports', timestamp);
  await mkdir(reportDirectory, {recursive: true});

  await writeFile(path.join(reportDirectory, 'report.json'), `${JSON.stringify(reportData, null, 2)}\n`);
  await writeFile(path.join(reportDirectory, 'report.md'), renderMarkdownReport(reportData));
  return reportDirectory;
}

function renderMarkdownReport(reportData) {
  const passed = reportData.checks.filter((check) => check.passed).length;
  const failed = reportData.checks.length - passed;
  const lines = [
    '# Backend evaluation report',
    '',
    `- Candidate: \`${reportData.candidatePath}\``,
    `- Started: ${reportData.startedAt}`,
    `- Finished: ${reportData.finishedAt}`,
    `- Result: **${passed} passed, ${failed} failed**`,
    '',
    '| Group | Check | Result | Detail |',
    '| --- | --- | --- | --- |',
  ];

  for (const check of reportData.checks) {
    lines.push(`| ${escapeTable(check.group)} | ${escapeTable(check.name)} | ${check.passed ? 'PASS' : 'FAIL'} | ${escapeTable(check.detail)} |`);
  }

  lines.push(
    '',
    '## Interpretation',
    '',
    '- Candidate-authored tests and private checks are separate evidence.',
    '- Review any harness/setup failure before attributing it to the candidate.',
    '- Invalid-input policy, frontend quality, written trade-offs, and AI ownership require human review.',
    '',
  );
  return lines.join('\n');
}

function escapeTable(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}
