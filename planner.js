(() => {
  "use strict";

  const planning = window.BssMapPlanning;
  const viewerApi = window.BssMapViewer;
  if (!planning || !viewerApi) {
    console.error("Der Tauchgangsplaner konnte nicht initialisiert werden.");
    return;
  }

  const byId = (id) => document.getElementById(id);
  const mapShell = document.querySelector(".map-shell");
  const viewerElement = byId("viewer");
  const panel = byId("planner-panel");
  const openButton = byId("planner-open");
  const warningDialog = byId("planner-warning-dialog");
  const objectPanel = byId("object-panel");
  const STORAGE_KEY = "bssmap.dive-plan.v1";
  const WARNING_ACKNOWLEDGEMENT_KEY = "bssmap.dive-plan-warning.v1";
  const MAX_WAYPOINTS = 30;
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const numberFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
  const integerFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

  const settingsInputs = {
    swimSpeedMetersPerMinute: byId("planner-swim-speed"),
    descentSpeedMetersPerMinute: byId("planner-descent-speed"),
    ascentSpeedMetersPerMinute: byId("planner-ascent-speed"),
    rmvLitersPerMinute: byId("planner-rmv"),
    cylinderVolumeLiters: byId("planner-cylinder-volume"),
    startPressureBar: byId("planner-start-pressure"),
    reservePressureBar: byId("planner-reserve-pressure")
  };

  let keySequence = 0;
  let waypoints = [];
  let settings = { ...planning.DEFAULT_SETTINGS };
  let currentPlan = null;
  let planningActive = false;
  let panelOpen = false;
  let warningAcknowledgedInMemory = false;
  let routeRenderFrame = null;

  const routeOverlay = document.createElementNS(SVG_NAMESPACE, "svg");
  routeOverlay.classList.add("planner-route-overlay");
  routeOverlay.setAttribute("aria-hidden", "true");
  routeOverlay.setAttribute("preserveAspectRatio", "none");
  const routeDefinitions = document.createElementNS(SVG_NAMESPACE, "defs");
  const arrowMarker = document.createElementNS(SVG_NAMESPACE, "marker");
  arrowMarker.setAttribute("id", "planner-route-arrow");
  arrowMarker.setAttribute("markerWidth", "8");
  arrowMarker.setAttribute("markerHeight", "8");
  arrowMarker.setAttribute("refX", "7");
  arrowMarker.setAttribute("refY", "4");
  arrowMarker.setAttribute("orient", "auto");
  arrowMarker.setAttribute("markerUnits", "strokeWidth");
  const arrowPath = document.createElementNS(SVG_NAMESPACE, "path");
  arrowPath.setAttribute("d", "M 0 0 L 8 4 L 0 8 z");
  arrowMarker.append(arrowPath);
  routeDefinitions.append(arrowMarker);
  routeOverlay.append(routeDefinitions);
  const routeGroup = document.createElementNS(SVG_NAMESPACE, "g");
  routeOverlay.append(routeGroup);
  viewerElement.append(routeOverlay);
  routeOverlay.style.display = "none";

  const nextKey = () => `waypoint-${Date.now()}-${keySequence += 1}`;

  const parseNumber = (input) => {
    const value = Number.parseFloat(input.value);
    return Number.isFinite(value) ? value : null;
  };

  const readSettings = () => ({
    swimSpeedMetersPerMinute: parseNumber(settingsInputs.swimSpeedMetersPerMinute),
    descentSpeedMetersPerMinute: parseNumber(settingsInputs.descentSpeedMetersPerMinute),
    ascentSpeedMetersPerMinute: parseNumber(settingsInputs.ascentSpeedMetersPerMinute),
    gasEnabled: byId("planner-gas-enabled").checked,
    rmvLitersPerMinute: parseNumber(settingsInputs.rmvLitersPerMinute),
    cylinderVolumeLiters: parseNumber(settingsInputs.cylinderVolumeLiters),
    startPressureBar: parseNumber(settingsInputs.startPressureBar),
    reservePressureBar: parseNumber(settingsInputs.reservePressureBar)
  });

  const applySettingsToForm = () => {
    Object.entries(settingsInputs).forEach(([name, input]) => {
      const value = settings[name];
      if (Number.isFinite(value)) {
        input.value = String(value);
      }
    });
    byId("planner-gas-enabled").checked = settings.gasEnabled !== false;
    updateGasFields();
  };

  const updateGasFields = () => {
    const enabled = byId("planner-gas-enabled").checked;
    byId("planner-gas-fields").classList.toggle("is-disabled", !enabled);
    [
      settingsInputs.rmvLitersPerMinute,
      settingsInputs.cylinderVolumeLiters,
      settingsInputs.startPressureBar,
      settingsInputs.reservePressureBar
    ].forEach((input) => {
      input.disabled = !enabled;
    });
  };

  const storedState = () => ({
    schemaVersion: 1,
    waypoints: waypoints.map(({ objectId, stopMinutes }) => ({ objectId, stopMinutes })),
    settings
  });

  const persistState = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState()));
    } catch (error) {
      console.warn("Die Tauchgangsplanung konnte nicht lokal gespeichert werden.", error);
    }
  };

  const loadStoredState = () => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (!stored || stored.schemaVersion !== 1) {
        return;
      }
      if (Array.isArray(stored.waypoints)) {
        waypoints = stored.waypoints.slice(0, MAX_WAYPOINTS)
          .filter((waypoint) => typeof waypoint.objectId === "string")
          .map((waypoint) => ({
            key: nextKey(),
            objectId: waypoint.objectId,
            stopMinutes: Number.isFinite(waypoint.stopMinutes)
              ? Math.min(120, Math.max(0, waypoint.stopMinutes))
              : 0
          }));
      }
      if (stored.settings && typeof stored.settings === "object") {
        settings = { ...settings, ...stored.settings };
      }
    } catch (error) {
      console.warn("Die gespeicherte Tauchgangsplanung ist ungültig und wurde ignoriert.", error);
    }
  };

  const loadRouteFromUrl = () => {
    const routeParameter = new URL(window.location.href).searchParams.get("route");
    if (!routeParameter) {
      return false;
    }
    const objectIds = routeParameter.split(",")
      .map((objectId) => objectId.trim())
      .filter((objectId) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(objectId))
      .slice(0, MAX_WAYPOINTS);
    waypoints = objectIds.map((objectId) => ({
      key: nextKey(),
      objectId,
      stopMinutes: 0
    }));
    return true;
  };

  const synchronizeRouteUrl = () => {
    const url = new URL(window.location.href);
    if (waypoints.length > 0) {
      url.searchParams.set("route", waypoints.map((waypoint) => waypoint.objectId).join(","));
    } else {
      url.searchParams.delete("route");
    }
    window.history.replaceState(window.history.state, "", url);
  };

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  };

  const isSurfaceObject = (object) => object?.id === "einstieg"
    || String(object?.category || "").toLocaleLowerCase("de-DE") === "einstieg";

  const calculationWaypoints = () => waypoints.map((waypoint) => {
    const object = viewerApi.getObject(waypoint.objectId);
    return {
      ...waypoint,
      name: object?.name || waypoint.objectId,
      category: object?.category || "Unbekannt",
      depthMeters: object?.depthMeters ?? null,
      isSurface: isSurfaceObject(object),
      position: viewerApi.positionForObject(waypoint.objectId)
    };
  });

  const formatMeters = (value) => Number.isFinite(value) ? `${integerFormatter.format(value)} m` : "–";
  const formatDepth = (value) => Number.isFinite(value) ? `${numberFormatter.format(value)} m` : "–";
  const formatMinutes = (value) => Number.isFinite(value) ? `${numberFormatter.format(value)} min` : "–";
  const formatPressure = (value) => Number.isFinite(value)
    ? value < 0 ? "< 0 bar" : `${numberFormatter.format(value)} bar`
    : "–";

  const button = (label, className, onClick, disabled = false) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.setAttribute("aria-label", label);
    element.title = label;
    element.disabled = disabled;
    element.addEventListener("click", onClick);
    return element;
  };

  const moveWaypoint = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= waypoints.length) {
      return;
    }
    [waypoints[index], waypoints[targetIndex]] = [waypoints[targetIndex], waypoints[index]];
    updatePlanState();
  };

  const removeWaypoint = (index) => {
    waypoints.splice(index, 1);
    updatePlanState();
  };

  const renderWaypoints = () => {
    const list = byId("planner-waypoints");
    list.replaceChildren();
    byId("planner-empty").hidden = waypoints.length > 0;

    currentPlan.waypoints.forEach((waypoint, index) => {
      const item = document.createElement("li");
      item.className = "planner-waypoint";
      if (Number.isFinite(waypoint.departurePressureBar)
          && waypoint.departurePressureBar < settings.reservePressureBar) {
        item.classList.add("is-danger");
      }

      const heading = document.createElement("div");
      heading.className = "planner-waypoint-heading";
      const number = document.createElement("span");
      number.className = "planner-waypoint-number";
      number.textContent = String(index + 1);
      const name = document.createElement("strong");
      name.textContent = waypoint.name;
      const depth = document.createElement("span");
      depth.className = "planner-waypoint-depth";
      depth.textContent = formatDepth(waypoint.depthMeters);
      const controls = document.createElement("span");
      controls.className = "planner-waypoint-controls";
      const up = button(`${waypoint.name} nach oben verschieben`, "planner-mini-button", () => moveWaypoint(index, -1), index === 0);
      up.textContent = "↑";
      const down = button(`${waypoint.name} nach unten verschieben`, "planner-mini-button", () => moveWaypoint(index, 1), index === waypoints.length - 1);
      down.textContent = "↓";
      const remove = button(`${waypoint.name} aus der Route entfernen`, "planner-mini-button is-danger", () => removeWaypoint(index));
      remove.textContent = "×";
      controls.append(up, down, remove);
      heading.append(number, name, depth, controls);
      item.append(heading);

      const details = document.createElement("p");
      details.className = "planner-waypoint-details";
      if (index === 0) {
        details.textContent = settings.gasEnabled
          ? `Start · ${formatPressure(waypoint.departurePressureBar)}`
          : "Start";
      } else {
        const parts = [
          `${formatMeters(waypoint.segmentDistanceMeters)} ab vorherigem Punkt`,
          `Ankunft ${formatMinutes(waypoint.arrivalMinutes)}`
        ];
        if (settings.gasEnabled) {
          parts.push(`Druck danach ${formatPressure(waypoint.departurePressureBar)}`);
        }
        details.textContent = parts.join(" · ");
      }
      item.append(details);

      if (index > 0) {
        const stopLabel = document.createElement("label");
        stopLabel.className = "planner-stop-field";
        const labelText = document.createElement("span");
        labelText.textContent = "Aufenthalt am Objekt";
        const inputWrap = document.createElement("span");
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = "120";
        input.step = "0.5";
        input.inputMode = "decimal";
        input.value = String(waypoints[index].stopMinutes || 0);
        input.setAttribute("aria-label", `Aufenthalt bei ${waypoint.name} in Minuten`);
        input.addEventListener("change", () => {
          const value = Number.parseFloat(input.value);
          waypoints[index].stopMinutes = Number.isFinite(value)
            ? Math.min(120, Math.max(0, value))
            : 0;
          updatePlanState();
        });
        inputWrap.append(input, document.createTextNode(" min"));
        stopLabel.append(labelText, inputWrap);
        item.append(stopLabel);
      }

      list.append(item);
    });

    byId("planner-reverse").disabled = waypoints.length < 2;
    byId("planner-clear").disabled = waypoints.length === 0;
    byId("planner-copy-link").disabled = waypoints.length < 2;
  };

  const setSummary = (id, value) => {
    byId(id).textContent = value;
  };

  const renderSummary = () => {
    const totals = currentPlan.totals;
    const completeRouteSelected = waypoints.length >= 2;
    setSummary("planner-total-distance", completeRouteSelected ? formatMeters(totals.distanceMeters) : "–");
    setSummary("planner-total-time", formatMinutes(totals.totalMinutes));
    setSummary("planner-average-depth", completeRouteSelected ? formatDepth(totals.averageDepthMeters) : "–");
    setSummary("planner-max-depth", completeRouteSelected ? formatDepth(totals.maxDepthMeters) : "–");
    setSummary("planner-gas-used", settings.gasEnabled && Number.isFinite(totals.gasUsedLiters)
      ? `${integerFormatter.format(totals.gasUsedLiters)} l`
      : settings.gasEnabled ? "–" : "aus");
    setSummary("planner-end-pressure", settings.gasEnabled
      ? formatPressure(totals.endPressureBar)
      : "aus");

    const endPressure = byId("planner-end-pressure");
    endPressure.classList.toggle(
      "is-danger",
      Number.isFinite(totals.endPressureBar) && totals.endPressureBar < settings.reservePressureBar
    );
  };

  const renderProfile = () => {
    const figure = byId("planner-profile-figure");
    const profile = currentPlan.profile.filter((point) => Number.isFinite(point.minutes)
      && Number.isFinite(point.depthMeters));
    const totalMinutes = currentPlan.totals.totalMinutes;
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0 || profile.length < 2) {
      figure.hidden = true;
      return;
    }

    figure.hidden = false;
    const left = 44;
    const top = 18;
    const width = 536;
    const height = 178;
    const maxDepth = Math.max(1, currentPlan.totals.maxDepthMeters || 1);
    const startPressure = Math.max(1, settings.startPressureBar || 1);
    const x = (minutes) => left + minutes / totalMinutes * width;
    const depthY = (depthMeters) => top + depthMeters / maxDepth * height;
    const pressureY = (pressureBar) => top + (1 - Math.max(0, pressureBar) / startPressure) * height;

    byId("planner-depth-profile").setAttribute(
      "points",
      profile.map((point) => `${x(point.minutes).toFixed(1)},${depthY(point.depthMeters).toFixed(1)}`).join(" ")
    );
    const pressurePoints = settings.gasEnabled
      ? profile.filter((point) => Number.isFinite(point.pressureBar))
      : [];
    byId("planner-pressure-profile").setAttribute(
      "points",
      pressurePoints.map((point) => `${x(point.minutes).toFixed(1)},${pressureY(point.pressureBar).toFixed(1)}`).join(" ")
    );
    byId("planner-profile-depth-label").textContent = `Tiefe 0–${numberFormatter.format(maxDepth)} m`;
    byId("planner-profile-pressure-label").textContent = settings.gasEnabled
      ? `Druck ${numberFormatter.format(startPressure)}–0 bar`
      : "";
    byId("planner-profile-time-label").textContent = `${numberFormatter.format(totalMinutes)} min`;
  };

  const renderIssues = () => {
    const list = byId("planner-issues");
    list.replaceChildren();
    const issues = [...currentPlan.issues];
    const routePoints = currentPlan.waypoints;
    if (routePoints.length >= 2) {
      const firstDepth = routePoints[0].depthMeters;
      const lastDepth = routePoints.at(-1).depthMeters;
      if (Number.isFinite(firstDepth) && firstDepth > 0.5) {
        issues.push({ severity: "warning", message: "Die Route beginnt nicht an einem Oberflächenpunkt." });
      }
      if (Number.isFinite(lastDepth) && lastDepth > 0.5) {
        issues.push({ severity: "warning", message: "Die Route endet nicht an einem Oberflächenpunkt." });
      }
      issues.push({
        severity: "info",
        message: "Die Wegpunkte werden geradlinig verbunden; die Darstellung bestätigt keine tatsächlich vorhandene Leine oder freie Passage."
      });
    }

    issues.forEach((entry) => {
      const item = document.createElement("li");
      item.className = `is-${entry.severity}`;
      item.textContent = entry.message;
      list.append(item);
    });
  };

  const routePixels = () => waypoints.map((waypoint) => {
    const position = viewerApi.positionForObject(waypoint.objectId);
    return position ? viewerApi.imagePositionToViewerPixel(position) : null;
  });

  const renderRouteOverlay = () => {
    routeRenderFrame = null;
    routeGroup.replaceChildren();
    if (!panelOpen) {
      return;
    }
    const width = viewerElement.clientWidth;
    const height = viewerElement.clientHeight;
    routeOverlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const pixels = routePixels();
    for (let index = 1; index < pixels.length; index += 1) {
      const from = pixels[index - 1];
      const to = pixels[index];
      if (!from || !to) {
        continue;
      }
      const line = document.createElementNS(SVG_NAMESPACE, "line");
      line.classList.add("planner-route-segment");
      line.setAttribute("x1", from.x.toFixed(1));
      line.setAttribute("y1", from.y.toFixed(1));
      line.setAttribute("x2", to.x.toFixed(1));
      line.setAttribute("y2", to.y.toFixed(1));
      line.setAttribute("marker-end", "url(#planner-route-arrow)");
      routeGroup.append(line);
    }
  };

  const scheduleRouteRender = () => {
    if (routeRenderFrame === null) {
      routeRenderFrame = window.requestAnimationFrame(renderRouteOverlay);
    }
  };

  const render = () => {
    const currentMap = viewerApi.getCurrentMap();
    byId("planner-map-name").textContent = currentMap?.name || "Karte wird geladen";
    currentPlan = planning.calculateDivePlan({
      waypoints: calculationWaypoints(),
      metersPerPixel: currentMap?.metersPerPixel,
      settings
    });
    viewerApi.setPlannerRouteMarkers(
      panelOpen ? waypoints.map((waypoint) => waypoint.objectId) : []
    );
    renderWaypoints();
    renderSummary();
    renderProfile();
    renderIssues();
    scheduleRouteRender();
  };

  const updatePlanState = () => {
    settings = readSettings();
    persistState();
    synchronizeRouteUrl();
    render();
  };

  const setPanelOpen = (open, { keepPlanningActive = false } = {}) => {
    panelOpen = open;
    if (open) {
      planningActive = true;
      viewerApi.closeObjectPanel();
    } else if (!keepPlanningActive) {
      planningActive = false;
    }
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    openButton.setAttribute("aria-expanded", String(open));
    openButton.setAttribute("aria-pressed", String(planningActive));
    mapShell.classList.toggle("planner-active", planningActive);
    mapShell.classList.toggle("planner-panel-open", open);
    mapShell.classList.toggle("panel-open", open || objectPanel.classList.contains("is-open"));
    routeOverlay.style.display = open ? "" : "none";
    viewerApi.setPlannerRouteMarkers(
      open ? waypoints.map((waypoint) => waypoint.objectId) : []
    );
    scheduleRouteRender();
    if (open) {
      window.setTimeout(() => byId("planner-close").focus(), 220);
    }
  };

  const warningAcknowledged = () => {
    if (warningAcknowledgedInMemory) {
      return true;
    }
    try {
      return window.sessionStorage.getItem(WARNING_ACKNOWLEDGEMENT_KEY) === "accepted";
    } catch (error) {
      console.warn("Die Bestätigung des Planer-Hinweises konnte nicht gelesen werden.", error);
      return false;
    }
  };

  const rememberWarningAcknowledgement = () => {
    warningAcknowledgedInMemory = true;
    try {
      window.sessionStorage.setItem(WARNING_ACKNOWLEDGEMENT_KEY, "accepted");
    } catch (error) {
      console.warn("Die Bestätigung des Planer-Hinweises konnte nicht gespeichert werden.", error);
    }
  };

  const openPlanner = () => {
    if (warningAcknowledged()) {
      setPanelOpen(true);
      render();
      return;
    }

    if (typeof warningDialog.showModal === "function") {
      warningDialog.returnValue = "";
      warningDialog.showModal();
      return;
    }

    const accepted = window.confirm(
      "Experimentelle Planungshilfe: Entfernungen, Tiefen, Zeiten und Gaswerte sind nur Schätzwerte. "
      + "Der Planer berechnet keine Nullzeit oder Dekompression und ersetzt keine eigenständige Tauchgangs- und Gasplanung. "
      + "Verlasse dich unter Wasser niemals darauf. Trotzdem öffnen?"
    );
    if (accepted) {
      rememberWarningAcknowledgement();
      setPanelOpen(true);
      render();
    } else {
      openButton.focus();
    }
  };

  const addWaypoint = (objectId) => {
    const object = viewerApi.getObject(objectId);
    if (!object) {
      viewerApi.showStatus("Dieses Tauchziel ist nicht verfügbar.", 2400);
      return;
    }
    if (waypoints.length >= MAX_WAYPOINTS) {
      viewerApi.showStatus(`Eine Route kann höchstens ${MAX_WAYPOINTS} Wegpunkte enthalten.`, 3200);
      return;
    }
    waypoints.push({ key: nextKey(), objectId, stopMinutes: 0 });
    updatePlanState();
    viewerApi.showStatus(`${object.name} als Wegpunkt ${waypoints.length} hinzugefügt`, 2000);
  };

  loadStoredState();
  let openRouteOnNextMap = loadRouteFromUrl();
  applySettingsToForm();

  openButton.addEventListener("click", () => {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    openPlanner();
  });
  warningDialog.addEventListener("close", () => {
    if (warningDialog.returnValue === "accept") {
      rememberWarningAcknowledgement();
      setPanelOpen(true);
      render();
      return;
    }
    openButton.focus();
  });
  byId("planner-close").addEventListener("click", () => {
    setPanelOpen(false);
    openButton.focus();
  });
  byId("planner-choose-object").addEventListener("click", () => {
    setPanelOpen(false, { keepPlanningActive: true });
    viewerApi.openObjectBrowser();
  });

  byId("objects-open").addEventListener("click", () => {
    if (!planningActive) {
      return;
    }
    if (objectPanel.classList.contains("is-open")) {
      setPanelOpen(false, { keepPlanningActive: true });
    } else if (!panelOpen) {
      setPanelOpen(true);
    }
  });

  window.addEventListener("bssmap:object-activate", (event) => {
    if (!planningActive) {
      return;
    }
    event.preventDefault();
    addWaypoint(event.detail.objectId);
    if (event.detail.source === "list") {
      viewerApi.closeObjectPanel();
      setPanelOpen(true);
    }
  });

  byId("planner-reverse").addEventListener("click", () => {
    waypoints.reverse();
    updatePlanState();
  });
  byId("planner-clear").addEventListener("click", () => {
    if (waypoints.length > 0 && !window.confirm("Die gesamte geplante Route löschen?")) {
      return;
    }
    waypoints = [];
    updatePlanState();
  });
  byId("planner-copy-link").addEventListener("click", async () => {
    synchronizeRouteUrl();
    try {
      await copyText(window.location.href);
      viewerApi.showStatus("Routenlink kopiert", 1800);
    } catch (error) {
      console.error("Routenlink konnte nicht kopiert werden", error);
      viewerApi.showStatus("Der Routenlink konnte nicht kopiert werden.", 2800);
    }
  });

  byId("planner-settings").addEventListener("input", () => {
    updateGasFields();
    updatePlanState();
  });

  window.addEventListener("bssmap:map-opened", () => {
    const before = waypoints.length;
    waypoints = waypoints.filter((waypoint) => viewerApi.getObject(waypoint.objectId));
    if (before !== waypoints.length) {
      viewerApi.showStatus("Unbekannte Wegpunkte aus der gespeicherten Route wurden entfernt.", 3200);
    }
    if (openRouteOnNextMap && waypoints.length >= 2) {
      openPlanner();
    }
    openRouteOnNextMap = false;
    persistState();
    render();
  });
  window.addEventListener("bssmap:viewport-change", scheduleRouteRender);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panelOpen) {
      event.preventDefault();
      setPanelOpen(false);
      openButton.focus();
    }
  });

  render();
})();
