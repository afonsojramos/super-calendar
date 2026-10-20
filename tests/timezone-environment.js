// A jsdom environment that runs its test file in the IANA zone named by the
// file's `@jest-environment-options {"timeZone": "..."}` docblock, so DST tests
// don't depend on the machine's zone. Assigning `process.env.TZ` inside a test
// file only reaches Jest's sandboxed copy; here it reaches Node, which re-reads
// the zone on assignment. Workers run files one at a time, so restoring the
// previous zone on teardown keeps it from leaking into the next file.
const { TestEnvironment } = require("jest-environment-jsdom");

class TimeZoneEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.timeZone = config.projectConfig.testEnvironmentOptions.timeZone;
  }

  async setup() {
    await super.setup();
    this.previousTimeZone = process.env.TZ;
    process.env.TZ = this.timeZone;
  }

  async teardown() {
    if (this.previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = this.previousTimeZone;
    await super.teardown();
  }
}

module.exports = TimeZoneEnvironment;
