export function createTestSuite(title = "Unit Tests") {
  const tests = [];

  function test(name, fn) {
    tests.push({ name, fn });
  }

  async function run() {
    let passed = 0;
    let failed = 0;
    const failures = [];

    console.log(`\n${title}\n`);

    for (const { name, fn } of tests) {
      try {
        await fn();
        passed += 1;
        console.log(`  PASS ${name}`);
      } catch (error) {
        failed += 1;
        failures.push({ name, error });
        console.error(`  FAIL ${name}\n      ${error?.message ?? error}`);
      }
    }

    console.log(`\n${title}: ${passed} passed, ${failed} failed`);

    if (failures.length) {
      for (const { name, error } of failures) {
        console.error(`FAILED: ${name}`);
        console.error(error?.stack ?? error);
      }
      process.exitCode = 1;
    }
  }

  return { test, run };
}

