import assert from "node:assert/strict";
import test from "node:test";

await import("../../planning-calculations.js");

const {
  ambientPressureFactor,
  calculateDivePlan,
  distanceMeters
} = globalThis.BssMapPlanning;

test("Kartenabstände werden mit der kalibrierten Pixelgröße in Meter umgerechnet", () => {
  assert.equal(distanceMeters({ x: 0, y: 0 }, { x: 3, y: 4 }, 0.5), 2.5);
  assert.equal(distanceMeters(null, { x: 3, y: 4 }, 0.5), null);
});

test("Zeit, Durchschnittstiefe und Gas werden segmentweise berechnet", () => {
  const plan = calculateDivePlan({
    metersPerPixel: 1,
    waypoints: [
      {
        objectId: "einstieg",
        name: "Einstieg",
        isSurface: true,
        depthMeters: null,
        position: { x: 0, y: 0 },
        stopMinutes: 0
      },
      {
        objectId: "ziel",
        name: "Ziel",
        depthMeters: 20,
        position: { x: 100, y: 0 },
        stopMinutes: 2
      }
    ],
    settings: {
      swimSpeedMetersPerMinute: 10,
      descentSpeedMetersPerMinute: 15,
      ascentSpeedMetersPerMinute: 9,
      gasEnabled: true,
      rmvLitersPerMinute: 20,
      cylinderVolumeLiters: 12,
      startPressureBar: 200,
      reservePressureBar: 70
    }
  });

  const expectedTravelGas = 20 * 10 * ambientPressureFactor(10);
  const expectedStopGas = 20 * 2 * ambientPressureFactor(20);

  assert.equal(plan.routeComplete, true);
  assert.equal(plan.gasComplete, true);
  assert.equal(plan.totals.distanceMeters, 100);
  assert.equal(plan.totals.totalMinutes, 12);
  assert.ok(Math.abs(plan.totals.averageDepthMeters - 11.6666667) < 0.0001);
  assert.equal(plan.totals.maxDepthMeters, 20);
  assert.ok(Math.abs(plan.totals.gasUsedLiters - expectedTravelGas - expectedStopGas) < 0.0001);
  assert.ok(Math.abs(
    plan.totals.endPressureBar
      - (200 - (expectedTravelGas + expectedStopGas) / 12)
  ) < 0.0001);
  assert.equal(plan.waypoints[1].arrivalMinutes, 10);
  assert.equal(plan.waypoints[1].departureMinutes, 12);
  assert.equal(plan.profile.length, 3);
});

test("Eine vertikale Geschwindigkeitsgrenze kann die Segmentzeit bestimmen", () => {
  const plan = calculateDivePlan({
    metersPerPixel: 1,
    waypoints: [
      { objectId: "a", name: "A", depthMeters: 30, position: { x: 0, y: 0 } },
      { objectId: "b", name: "B", depthMeters: 0, position: { x: 10, y: 0 } }
    ],
    settings: {
      swimSpeedMetersPerMinute: 10,
      descentSpeedMetersPerMinute: 15,
      ascentSpeedMetersPerMinute: 6,
      gasEnabled: false
    }
  });

  assert.equal(plan.segments[0].travelMinutes, 5);
  assert.equal(plan.totals.totalMinutes, 5);
});

test("Fehlende Tiefe verhindert eine scheinpräzise Zeit- und Gasprognose", () => {
  const plan = calculateDivePlan({
    metersPerPixel: 1,
    waypoints: [
      { objectId: "a", name: "A", depthMeters: 10, position: { x: 0, y: 0 } },
      { objectId: "b", name: "B", depthMeters: null, position: { x: 20, y: 0 } }
    ]
  });

  assert.equal(plan.routeComplete, false);
  assert.equal(plan.gasComplete, false);
  assert.equal(plan.totals.totalMinutes, null);
  assert.equal(plan.totals.endPressureBar, null);
  assert.ok(plan.issues.some((entry) => entry.code === "missing-depth"));
});

test("Eine Unterschreitung der Reserve wird ausdrücklich gemeldet", () => {
  const plan = calculateDivePlan({
    metersPerPixel: 1,
    waypoints: [
      { objectId: "a", name: "A", depthMeters: 30, position: { x: 0, y: 0 } },
      { objectId: "b", name: "B", depthMeters: 30, position: { x: 300, y: 0 } }
    ],
    settings: {
      swimSpeedMetersPerMinute: 10,
      descentSpeedMetersPerMinute: 15,
      ascentSpeedMetersPerMinute: 9,
      gasEnabled: true,
      rmvLitersPerMinute: 25,
      cylinderVolumeLiters: 12,
      startPressureBar: 200,
      reservePressureBar: 70
    }
  });

  assert.ok(plan.totals.endPressureBar < 70);
  assert.ok(plan.issues.some((entry) => entry.code === "reserve-breached"));
});
