((root) => {
  "use strict";

  const FRESHWATER_METERS_PER_BAR = 10.3;

  const DEFAULT_SETTINGS = Object.freeze({
    swimSpeedMetersPerMinute: 10,
    descentSpeedMetersPerMinute: 15,
    ascentSpeedMetersPerMinute: 9,
    gasEnabled: true,
    rmvLitersPerMinute: 20,
    cylinderVolumeLiters: 12,
    startPressureBar: 200,
    reservePressureBar: 70
  });

  const finiteNumber = (value) => {
    const number = typeof value === "number" ? value : Number.parseFloat(value);
    return Number.isFinite(number) ? number : null;
  };

  const validPosition = (position) => Number.isFinite(position?.x) && Number.isFinite(position?.y);

  const distanceMeters = (from, to, metersPerPixel) => {
    if (!validPosition(from) || !validPosition(to)
        || !Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
      return null;
    }
    return Math.hypot(to.x - from.x, to.y - from.y) * metersPerPixel;
  };

  const ambientPressureFactor = (depthMeters) => {
    if (!Number.isFinite(depthMeters) || depthMeters < 0) {
      return null;
    }
    return 1 + depthMeters / FRESHWATER_METERS_PER_BAR;
  };

  const normalizeSettings = (settings = {}) => ({
    swimSpeedMetersPerMinute: finiteNumber(settings.swimSpeedMetersPerMinute),
    descentSpeedMetersPerMinute: finiteNumber(settings.descentSpeedMetersPerMinute),
    ascentSpeedMetersPerMinute: finiteNumber(settings.ascentSpeedMetersPerMinute),
    gasEnabled: settings.gasEnabled !== false,
    rmvLitersPerMinute: finiteNumber(settings.rmvLitersPerMinute),
    cylinderVolumeLiters: finiteNumber(settings.cylinderVolumeLiters),
    startPressureBar: finiteNumber(settings.startPressureBar),
    reservePressureBar: finiteNumber(settings.reservePressureBar)
  });

  const resolvedDepth = (waypoint) => {
    const depth = finiteNumber(waypoint.depthMeters);
    if (depth !== null && depth >= 0) {
      return depth;
    }
    return waypoint.isSurface ? 0 : null;
  };

  const issue = (severity, code, message, waypointIndex = null) => ({
    severity,
    code,
    message,
    waypointIndex
  });

  const calculateDivePlan = ({ waypoints = [], metersPerPixel, settings = {} } = {}) => {
    const normalized = normalizeSettings({ ...DEFAULT_SETTINGS, ...settings });
    const issues = [];
    const calibrated = Number.isFinite(metersPerPixel) && metersPerPixel > 0;

    if (!calibrated) {
      issues.push(issue("error", "missing-calibration", "Für diese Karte fehlt eine gültige Meterkalibrierung."));
    }
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      issues.push(issue("info", "route-too-short", "Wähle mindestens Einstieg und ein weiteres Tauchziel."));
    }

    const positiveSetting = (key, label, maximum) => {
      const value = normalized[key];
      if (value === null || value <= 0 || value > maximum) {
        issues.push(issue("error", `invalid-${key}`, `${label} muss größer als 0 und höchstens ${maximum} sein.`));
        return false;
      }
      return true;
    };

    const speedSettingsValid = [
      positiveSetting("swimSpeedMetersPerMinute", "Die horizontale Geschwindigkeit", 100),
      positiveSetting("descentSpeedMetersPerMinute", "Die Abstiegsgeschwindigkeit", 60),
      positiveSetting("ascentSpeedMetersPerMinute", "Die Aufstiegsgeschwindigkeit", 30)
    ].every(Boolean);

    let gasSettingsValid = true;
    if (normalized.gasEnabled) {
      gasSettingsValid = [
        positiveSetting("rmvLitersPerMinute", "Der RMV", 200),
        positiveSetting("cylinderVolumeLiters", "Das Flaschenvolumen", 100),
        positiveSetting("startPressureBar", "Der Startdruck", 400)
      ].every(Boolean);
      if (normalized.reservePressureBar === null || normalized.reservePressureBar < 0
          || normalized.reservePressureBar >= normalized.startPressureBar) {
        gasSettingsValid = false;
        issues.push(issue(
          "error",
          "invalid-reservePressureBar",
          "Der Reservedruck muss mindestens 0 und kleiner als der Startdruck sein."
        ));
      }
    }

    const normalizedWaypoints = Array.isArray(waypoints) ? waypoints.map((waypoint, index) => {
      const depthMeters = resolvedDepth(waypoint);
      const stopValue = finiteNumber(waypoint.stopMinutes);
      const stopMinutes = index === 0 ? 0 : Math.max(0, stopValue ?? 0);
      if (depthMeters === null) {
        issues.push(issue(
          "warning",
          "missing-depth",
          `Für „${waypoint.name || waypoint.objectId}“ ist keine Planungstiefe hinterlegt.`,
          index
        ));
      }
      if (!validPosition(waypoint.position)) {
        issues.push(issue(
          "warning",
          "missing-position",
          `„${waypoint.name || waypoint.objectId}“ hat auf dieser Karte keine Position.`,
          index
        ));
      }
      if (stopValue !== null && (stopValue < 0 || stopValue > 120)) {
        issues.push(issue(
          "warning",
          "invalid-stop",
          `Die Aufenthaltszeit bei „${waypoint.name || waypoint.objectId}“ wurde auf den erlaubten Bereich begrenzt.`,
          index
        ));
      }
      return {
        ...waypoint,
        depthMeters,
        stopMinutes: Math.min(120, stopMinutes)
      };
    }) : [];

    let cumulativeDistance = 0;
    let cumulativeMinutes = 0;
    let cumulativeGasLiters = 0;
    let weightedDepthMinutes = 0;
    let routeComplete = calibrated && speedSettingsValid && normalizedWaypoints.length >= 2;
    let gasComplete = routeComplete && normalized.gasEnabled && gasSettingsValid;
    const segments = [];
    const profile = [];
    const waypointResults = [];

    const remainingPressure = () => normalized.gasEnabled && gasSettingsValid
      ? normalized.startPressureBar - cumulativeGasLiters / normalized.cylinderVolumeLiters
      : null;

    if (normalizedWaypoints.length > 0) {
      const first = normalizedWaypoints[0];
      waypointResults.push({
        ...first,
        index: 0,
        segmentDistanceMeters: null,
        arrivalMinutes: 0,
        departureMinutes: 0,
        arrivalPressureBar: remainingPressure(),
        departurePressureBar: remainingPressure(),
        cumulativeDistanceMeters: 0
      });
      if (first.depthMeters !== null) {
        profile.push({ minutes: 0, depthMeters: first.depthMeters, pressureBar: remainingPressure() });
      } else {
        routeComplete = false;
        gasComplete = false;
      }
    }

    for (let index = 1; index < normalizedWaypoints.length; index += 1) {
      const from = normalizedWaypoints[index - 1];
      const to = normalizedWaypoints[index];
      const segmentDistance = distanceMeters(from.position, to.position, metersPerPixel);
      const depthsKnown = from.depthMeters !== null && to.depthMeters !== null;
      const segmentGeometryValid = segmentDistance !== null && depthsKnown && speedSettingsValid;
      let travelMinutes = null;
      let arrivalMinutes = null;
      let travelGasLiters = null;
      let stopGasLiters = null;
      let arrivalPressureBar = null;
      let departurePressureBar = null;

      if (segmentDistance !== null) {
        cumulativeDistance += segmentDistance;
      } else {
        routeComplete = false;
        gasComplete = false;
      }

      if (segmentGeometryValid) {
        const horizontalMinutes = segmentDistance / normalized.swimSpeedMetersPerMinute;
        const depthDifference = to.depthMeters - from.depthMeters;
        const verticalSpeed = depthDifference >= 0
          ? normalized.descentSpeedMetersPerMinute
          : normalized.ascentSpeedMetersPerMinute;
        const verticalMinutes = Math.abs(depthDifference) / verticalSpeed;
        travelMinutes = Math.max(horizontalMinutes, verticalMinutes);
        const averageDepth = (from.depthMeters + to.depthMeters) / 2;
        arrivalMinutes = cumulativeMinutes + travelMinutes;

        if (normalized.gasEnabled && gasSettingsValid && gasComplete) {
          travelGasLiters = normalized.rmvLitersPerMinute
            * travelMinutes
            * ambientPressureFactor(averageDepth);
          cumulativeGasLiters += travelGasLiters;
          arrivalPressureBar = remainingPressure();
          stopGasLiters = normalized.rmvLitersPerMinute
            * to.stopMinutes
            * ambientPressureFactor(to.depthMeters);
          cumulativeGasLiters += stopGasLiters;
          departurePressureBar = remainingPressure();
        }

        weightedDepthMinutes += averageDepth * travelMinutes + to.depthMeters * to.stopMinutes;
        cumulativeMinutes = arrivalMinutes + to.stopMinutes;
      } else {
        routeComplete = false;
        gasComplete = false;
      }

      const segment = {
        index: index - 1,
        fromObjectId: from.objectId,
        toObjectId: to.objectId,
        distanceMeters: segmentDistance,
        travelMinutes,
        averageDepthMeters: depthsKnown ? (from.depthMeters + to.depthMeters) / 2 : null,
        travelGasLiters,
        stopGasLiters
      };
      segments.push(segment);

      waypointResults.push({
        ...to,
        index,
        segmentDistanceMeters: segmentDistance,
        arrivalMinutes,
        departureMinutes: arrivalMinutes === null ? null : cumulativeMinutes,
        arrivalPressureBar,
        departurePressureBar,
        cumulativeDistanceMeters: segmentDistance === null ? null : cumulativeDistance
      });

      if (arrivalMinutes !== null) {
        profile.push({
          minutes: arrivalMinutes,
          depthMeters: to.depthMeters,
          pressureBar: arrivalPressureBar
        });
        if (to.stopMinutes > 0) {
          profile.push({
            minutes: cumulativeMinutes,
            depthMeters: to.depthMeters,
            pressureBar: departurePressureBar
          });
        }
      }
    }

    const knownDepths = normalizedWaypoints
      .map((waypoint) => waypoint.depthMeters)
      .filter(Number.isFinite);
    const totalMinutes = routeComplete ? cumulativeMinutes : null;
    const averageDepthMeters = routeComplete && cumulativeMinutes > 0
      ? weightedDepthMinutes / cumulativeMinutes
      : null;
    const maxDepthMeters = knownDepths.length > 0 ? Math.max(...knownDepths) : null;
    const endPressureBar = gasComplete ? remainingPressure() : null;
    const reserveMarginBar = endPressureBar === null
      ? null
      : endPressureBar - normalized.reservePressureBar;

    if (gasComplete && reserveMarginBar < 0) {
      issues.push(issue(
        "error",
        "reserve-breached",
        `Der erwartete Enddruck unterschreitet die Reserve um ${Math.abs(reserveMarginBar).toFixed(1)} bar.`
      ));
    } else if (gasComplete && reserveMarginBar < 10) {
      issues.push(issue(
        "warning",
        "reserve-close",
        `Der erwartete Enddruck liegt nur ${reserveMarginBar.toFixed(1)} bar über der Reserve.`
      ));
    }

    return {
      settings: normalized,
      issues,
      routeComplete,
      gasComplete,
      segments,
      waypoints: waypointResults,
      profile,
      totals: {
        distanceMeters: calibrated ? cumulativeDistance : null,
        totalMinutes,
        averageDepthMeters,
        maxDepthMeters,
        gasUsedLiters: gasComplete ? cumulativeGasLiters : null,
        pressureUsedBar: gasComplete
          ? cumulativeGasLiters / normalized.cylinderVolumeLiters
          : null,
        endPressureBar,
        reserveMarginBar
      }
    };
  };

  root.BssMapPlanning = Object.freeze({
    FRESHWATER_METERS_PER_BAR,
    DEFAULT_SETTINGS,
    ambientPressureFactor,
    calculateDivePlan,
    distanceMeters
  });
})(typeof window === "undefined" ? globalThis : window);
