import { mount } from "@calendar-browser/adapter";
import { Fixture } from "./Fixture";
import { PerformanceFixture } from "./PerformanceFixture";

mount(
  new URLSearchParams(location.search).get("view") === "performance" ? PerformanceFixture : Fixture,
);
