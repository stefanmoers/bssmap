(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const status = byId("status");
  const viewerElement = byId("viewer");
  const mapShell = document.querySelector(".map-shell");
  const mapSwitcher = byId("map-switcher");
  const mapButtons = [...mapSwitcher.querySelectorAll("[data-map-id]")];
  const fullPageButton = byId("full-page");
  const objectPanel = byId("object-panel");
  const objectBrowser = byId("object-browser");
  const objectDetail = byId("object-detail");
  const objectSearch = byId("object-search");
  const objectList = byId("object-list");
  const objectCount = byId("object-count");
  const markerVisibility = byId("marker-visibility");
  const serverAccess = byId("server-access");
  const serverDialog = byId("server-dialog");
  const loginForm = byId("login-form");
  const sessionView = byId("session-view");
  const descriptionForm = byId("description-form");
  const photoUploadForm = byId("photo-upload-form");
  const objectEditorActions = byId("object-editor-actions");
  const coordinateEditor = byId("coordinate-editor");
  const coordinateOutput = byId("coordinate-output");
  const coordinateCopy = byId("coordinate-copy");
  const editorClose = byId("editor-close");
  const photoDialog = byId("photo-dialog");
  const editorFields = [byId("editor-name"), byId("editor-depth"), byId("editor-category")];
  const depthFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

  let maps = [];
  let mapById = new Map();
  let defaultMapId = "object-map";
  let currentMap = null;
  let staticObjects = [];
  let allObjects = [];
  let objects = [];
  let objectById = new Map();
  let visibleObjectById = new Map();
  const markers = new Map();
  const markerTrackers = [];
  let plannerRouteObjectIds = [];
  let selectedObject = null;
  let selectedPhoto = null;
  let pendingObjectId = null;
  let pendingStatusMessage = "";
  let pendingViewState = null;
  let mapIsOpening = false;
  let statusTimer = null;
  let editorEnabled = false;
  let editorPoint = null;
  let editorMarker = null;
  let runtimeConfig = { serverFeatures: false, apiBaseUrl: "" };
  let serverContent = { objects: {} };
  let session = null;

  if (!window.OpenSeadragon) {
    status.textContent = "OpenSeadragon konnte nicht geladen werden.";
    return;
  }

  const viewer = OpenSeadragon({
    id: "viewer",
    prefixUrl: "vendor/openseadragon/images/",
    showNavigationControl: false,
    showNavigator: true,
    navigatorAutoFade: false,
    navigatorPosition: "BOTTOM_RIGHT",
    animationTime: 0.7,
    blendTime: 0.1,
    constrainDuringPan: true,
    visibilityRatio: 1,
    minZoomImageRatio: 0.82,
    maxZoomPixelRatio: 2,
    homeFillsViewer: false,
    immediateRender: false,
    preserveImageSizeOnResize: false,
    gestureSettingsMouse: {
      clickToZoom: false,
      dblClickToZoom: true,
      scrollToZoom: true
    },
    gestureSettingsTouch: {
      clickToZoom: false,
      dblClickToZoom: true,
      pinchToZoom: true,
      flickEnabled: true
    }
  });

  const showStatus = (message, hideAfter = 0) => {
    if (statusTimer) {
      window.clearTimeout(statusTimer);
      statusTimer = null;
    }
    status.textContent = message;
    status.classList.remove("is-hidden");
    if (hideAfter > 0) {
      statusTimer = window.setTimeout(() => {
        status.classList.add("is-hidden");
        statusTimer = null;
      }, hideAfter);
    }
  };

  const zoomBy = (factor) => {
    viewer.viewport.zoomBy(factor);
    viewer.viewport.applyConstraints();
  };

  const formatDepth = (depthMeters) => Number.isFinite(depthMeters)
    ? `${depthFormatter.format(depthMeters)} m`
    : "nicht angegeben";

  const normalize = (value) => value
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const slugify = (value) => normalize(value)
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "neues-objekt";

  const positionFor = (object, mapId = currentMap?.id) => {
    if (!mapId) {
      return null;
    }
    const position = object?.positions?.[mapId];
    return Number.isInteger(position?.x) && Number.isInteger(position?.y) ? position : null;
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

  const openObjectPanel = ({ focusSearch = false } = {}) => {
    objectPanel.classList.add("is-open");
    objectPanel.setAttribute("aria-hidden", "false");
    byId("objects-open").setAttribute("aria-expanded", "true");
    mapShell.classList.add("panel-open");
    if (focusSearch && !objectDetail.hidden) {
      objectDetail.hidden = true;
      objectBrowser.hidden = false;
    }
    if (focusSearch) {
      window.setTimeout(() => objectSearch.focus(), 230);
    }
  };

  const closeObjectPanel = () => {
    objectPanel.classList.remove("is-open");
    objectPanel.setAttribute("aria-hidden", "true");
    byId("objects-open").setAttribute("aria-expanded", "false");
    mapShell.classList.remove("panel-open");
    byId("objects-open").focus();
  };

  const writeUrlState = (mapId, objectId, mode = "replace") => {
    const url = new URL(window.location.href);
    url.searchParams.set("map", mapId);
    if (objectId) {
      url.searchParams.set("object", objectId);
    } else {
      url.searchParams.delete("object");
    }
    const state = { mapId, objectId: objectId || null };
    if (mode === "push") {
      window.history.pushState(state, "", url);
    } else {
      window.history.replaceState(state, "", url);
    }
  };

  const setMarkerSelection = (objectId) => {
    markers.forEach((marker, id) => {
      marker.classList.toggle("is-selected", id === objectId);
    });
  };

  const setPlannerRouteMarkers = (objectIds = []) => {
    plannerRouteObjectIds = Array.isArray(objectIds) ? [...objectIds] : [];
    const routeNumbers = new Map();
    plannerRouteObjectIds.forEach((objectId, index) => {
      const numbers = routeNumbers.get(objectId) || [];
      numbers.push(index + 1);
      routeNumbers.set(objectId, numbers);
    });
    markers.forEach((marker, objectId) => {
      const numbers = routeNumbers.get(objectId) || [];
      marker.classList.toggle("is-route-waypoint", numbers.length > 0);
      let badge = marker.querySelector(".route-order");
      if (numbers.length > 0) {
        marker.dataset.routeOrder = numbers.join("/");
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "route-order";
          badge.setAttribute("aria-hidden", "true");
          marker.append(badge);
        }
        badge.textContent = numbers.join("/");
      } else {
        delete marker.dataset.routeOrder;
        badge?.remove();
      }
    });
  };

  const updateMarkerVisibility = () => {
    markers.forEach((marker) => {
      marker.hidden = !markerVisibility.checked;
    });
  };

  const updateMarkerAppearance = (zoom = viewer.viewport.getZoom(true)) => {
    const homeZoom = viewer.viewport.getHomeZoom();
    if (!Number.isFinite(zoom) || !Number.isFinite(homeZoom) || homeZoom <= 0) {
      return;
    }

    const zoomRatio = Math.max(1, zoom / homeZoom);
    // Der sichtbare Kreis bleibt bewusst klein. Die deutlich größere
    // Schaltfläche in CSS erhält trotzdem eine zuverlässige Touch-Klickfläche.
    const zoomSteps = Math.log2(zoomRatio);
    const markerSize = Math.min(20, 7 + zoomSteps * 6);
    const markerOpacity = Math.min(1, 0.2 + zoomSteps * 0.2);
    viewerElement.style.setProperty("--marker-visual-size", `${markerSize.toFixed(1)}px`);
    viewerElement.style.setProperty("--marker-fill-opacity", markerOpacity.toFixed(2));
  };

  const goToDefaultView = (immediately = false) => {
    const image = viewer.world.getItemAt(0);
    if (!image || !currentMap) {
      return;
    }
    const view = currentMap.defaultView;
    if (!view || (view.x === 0 && view.y === 0
        && view.width === currentMap.width && view.height === currentMap.height)) {
      viewer.viewport.goHome(immediately);
      return;
    }
    const bounds = image.imageToViewportRectangle(view.x, view.y, view.width, view.height);
    viewer.viewport.fitBounds(bounds, immediately);
    viewer.viewport.applyConstraints();
  };

  const captureViewState = () => {
    const image = viewer.world.getItemAt(0);
    const homeZoom = viewer.viewport.getHomeZoom();
    const zoom = viewer.viewport.getZoom(true);
    if (!image || !currentMap || !Number.isFinite(homeZoom) || homeZoom <= 0
        || !Number.isFinite(zoom) || zoom <= 0) {
      return null;
    }

    const center = image.viewportToImageCoordinates(viewer.viewport.getCenter(true));
    return {
      centerX: Math.min(1, Math.max(0, center.x / currentMap.width)),
      centerY: Math.min(1, Math.max(0, center.y / currentMap.height)),
      zoomRatio: zoom / homeZoom
    };
  };

  const applyViewState = (viewState) => {
    const image = viewer.world.getItemAt(0);
    const homeZoom = viewer.viewport.getHomeZoom();
    if (!image || !currentMap || !viewState || !Number.isFinite(homeZoom) || homeZoom <= 0) {
      return false;
    }

    const center = image.imageToViewportCoordinates(
      viewState.centerX * currentMap.width,
      viewState.centerY * currentMap.height
    );
    viewer.viewport.panTo(center, true);
    viewer.viewport.zoomTo(homeZoom * viewState.zoomRatio, center, true);
    viewer.viewport.panTo(center, true);
    viewer.viewport.applyConstraints();
    return true;
  };

  const focusObjectOnMap = (object) => {
    const image = viewer.world.getItemAt(0);
    const position = positionFor(object);
    if (!image || !position || !currentMap) {
      return;
    }
    const focusSize = Math.round(Math.min(currentMap.width, currentMap.height) * 0.17);
    const bounds = image.imageToViewportRectangle(
      position.x - focusSize / 2,
      position.y - focusSize / 2,
      focusSize,
      focusSize
    );
    viewer.viewport.fitBounds(bounds, false);
    viewer.viewport.applyConstraints();
  };

  const renderPhoto = (photo, index) => {
    selectedPhoto = photo;
    const image = byId("object-photo");
    image.onerror = () => {
      byId("photo-stage").hidden = true;
      byId("photo-placeholder").hidden = false;
      showStatus("Das Foto konnte nicht geladen werden.", 2200);
    };
    image.src = photo.src;
    image.alt = photo.alt || selectedObject.name;
    byId("photo-caption").textContent = photo.caption || "";
    byId("photo-delete").hidden = !(session?.authenticated && photo.managed && photo.canDelete);

    byId("photo-thumbnails").querySelectorAll("button").forEach((button, buttonIndex) => {
      button.classList.toggle("is-active", buttonIndex === index);
      button.setAttribute("aria-current", buttonIndex === index ? "true" : "false");
    });
  };

  const renderPhotos = (object) => {
    const photos = Array.isArray(object.photos) ? object.photos : [];
    const stage = byId("photo-stage");
    const placeholder = byId("photo-placeholder");
    const thumbnails = byId("photo-thumbnails");
    thumbnails.replaceChildren();
    selectedPhoto = null;

    if (photos.length === 0) {
      stage.hidden = true;
      placeholder.hidden = false;
      return;
    }

    stage.hidden = false;
    placeholder.hidden = true;
    thumbnails.hidden = photos.length < 2;

    photos.forEach((photo, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Foto ${index + 1} von ${object.name} anzeigen`);
      const image = document.createElement("img");
      image.src = photo.thumbnailSrc || photo.src;
      image.alt = "";
      button.append(image);
      button.addEventListener("click", () => renderPhoto(photo, index));
      thumbnails.append(button);
    });

    renderPhoto(photos[0], 0);
  };

  const renderObjectDetail = (object) => {
    byId("object-name").textContent = object.name;
    byId("object-depth").textContent = `Tiefe: ${formatDepth(object.depthMeters)}`;
    byId("object-category").textContent = object.category;
    byId("object-description").textContent = object.description || "Für dieses Tauchziel liegt noch keine Beschreibung vor.";
    renderPhotos(object);
    descriptionForm.hidden = true;
    photoUploadForm.hidden = true;
    objectEditorActions.hidden = !session?.authenticated;
    objectBrowser.hidden = true;
    objectDetail.hidden = false;
  };

  const clearSelectedObject = () => {
    selectedObject = null;
    selectedPhoto = null;
    setMarkerSelection(null);
    objectDetail.hidden = true;
    objectBrowser.hidden = false;
  };

  const selectObject = (objectId, { focusMap = true, updateUrl = true } = {}) => {
    const object = visibleObjectById.get(objectId);
    if (!object) {
      return false;
    }

    selectedObject = object;
    setMarkerSelection(object.id);
    renderObjectDetail(object);
    openObjectPanel();
    if (focusMap) {
      focusObjectOnMap(object);
    }
    if (updateUrl) {
      writeUrlState(currentMap.id, object.id);
    }
    return true;
  };

  const activateObject = (objectId, options = {}) => {
    const activation = new CustomEvent("bssmap:object-activate", {
      cancelable: true,
      detail: { objectId, source: options.source || "unknown" }
    });
    window.dispatchEvent(activation);
    return activation.defaultPrevented || selectObject(objectId, options);
  };

  const renderObjectList = () => {
    const query = normalize(objectSearch.value.trim());
    const matchingObjects = objects
      .filter((object) => normalize(`${object.name} ${object.category} ${object.depthMeters ?? ""}`).includes(query))
      .sort((left, right) => left.name.localeCompare(right.name, "de"));

    objectCount.textContent = query
      ? `${matchingObjects.length} von ${objects.length} Tauchzielen`
      : `${objects.length} Tauchziele`;
    objectList.replaceChildren();

    if (matchingObjects.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-result";
      empty.textContent = "Kein passendes Tauchziel gefunden.";
      objectList.append(empty);
      return;
    }

    matchingObjects.forEach((object) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "object-list-button";
      button.innerHTML = "<strong></strong><span class=\"list-category\"></span><span class=\"list-depth\"></span>";
      button.querySelector("strong").textContent = object.name;
      button.querySelector(".list-category").textContent = object.category;
      button.querySelector(".list-depth").textContent = formatDepth(object.depthMeters);
      button.addEventListener("click", () => activateObject(object.id, { source: "list" }));
      objectList.append(button);
    });
  };

  const removeObjectMarkers = () => {
    markerTrackers.splice(0).forEach((tracker) => {
      tracker.setTracking(false);
      if (typeof tracker.destroy === "function") {
        tracker.destroy();
      }
    });
    markers.forEach((marker) => viewer.removeOverlay(marker));
    markers.clear();
  };

  const addObjectMarkers = () => {
    const image = viewer.world.getItemAt(0);
    if (!image) {
      return;
    }

    objects.forEach((object) => {
      const position = positionFor(object);
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "map-marker";
      marker.setAttribute("aria-label", `${object.name}, Tiefe ${formatDepth(object.depthMeters)}`);
      marker.title = `${object.name} · Tiefe ${formatDepth(object.depthMeters)}`;

      // Der eigene Tracker hält Maus- und Touch-Klicks vom Karten-Tracker fern.
      // Die explizite Tastaturbehandlung bleibt davon unabhängig.
      marker.addEventListener("click", (event) => {
        if (event.detail !== 0) {
          return;
        }
        event.stopPropagation();
        activateObject(object.id, { source: "marker-keyboard" });
      });
      marker.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        activateObject(object.id, { source: "marker-keyboard" });
      });

      const markerTracker = new OpenSeadragon.MouseTracker({
        element: marker,
        preProcessEventHandler: (event) => {
          if (["pointerdown", "pointerup", "click"].includes(event.eventType)) {
            event.stopPropagation = true;
          }
        },
        clickHandler: (event) => {
          if (event.quick) {
            activateObject(object.id, { source: "marker" });
          }
        }
      });
      markerTracker.setTracking(true);
      markerTrackers.push(markerTracker);

      viewer.addOverlay({
        element: marker,
        location: image.imageToViewportCoordinates(position.x, position.y),
        placement: OpenSeadragon.Placement.CENTER,
        checkResize: false
      });
      markers.set(object.id, marker);
    });
    updateMarkerVisibility();
    setMarkerSelection(selectedObject?.id || null);
    setPlannerRouteMarkers(plannerRouteObjectIds);
  };

  const loadJson = async (url, label) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${label} konnten nicht geladen werden: HTTP ${response.status}`);
    }
    return response.json();
  };

  const apiUrl = (path) => `${runtimeConfig.apiBaseUrl.replace(/\/$/, "")}${path}`;

  const apiRequest = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const method = String(options.method || "GET").toUpperCase();
    if (!["GET", "HEAD"].includes(method) && session?.csrfToken) {
      headers.set("X-CSRF-Token", session.csrfToken);
    }
    const response = await fetch(apiUrl(path), {
      ...options,
      method,
      headers,
      credentials: "same-origin"
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(body?.error || `Serveranfrage fehlgeschlagen: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  };

  const mergeServerContent = () => {
    const overrides = serverContent?.objects || {};
    const selectedId = selectedObject?.id || null;
    allObjects = staticObjects.map((object) => {
      const override = overrides[object.id] || {};
      return {
        ...object,
        description: Object.hasOwn(override, "description") ? override.description : object.description,
        photos: [
          ...(Array.isArray(object.photos) ? object.photos : []),
          ...(Array.isArray(override.photos) ? override.photos : [])
        ]
      };
    });
    objectById = new Map(allObjects.map((object) => [object.id, object]));
    if (currentMap) {
      setCurrentObjects();
    }
    if (selectedId) {
      selectedObject = objectById.get(selectedId) || null;
      if (selectedObject) {
        renderObjectDetail(selectedObject);
      }
    }
  };

  const updateServerUi = () => {
    serverAccess.hidden = !runtimeConfig.serverFeatures;
    serverAccess.classList.toggle("is-authenticated", Boolean(session?.authenticated));
    serverAccess.title = session?.authenticated
      ? `Redaktion: ${session.username}`
      : "Redaktion öffnen";
    serverAccess.setAttribute("aria-label", serverAccess.title);

    loginForm.hidden = Boolean(session?.authenticated);
    sessionView.hidden = !session?.authenticated;
    byId("session-username").textContent = session?.username || "";
    byId("session-role").textContent = session?.role === "admin" ? "Rolle: Admin" : "Rolle: Redakteur";
    objectEditorActions.hidden = !(session?.authenticated && selectedObject);
    if (!session?.authenticated) {
      descriptionForm.hidden = true;
      photoUploadForm.hidden = true;
      byId("photo-delete").hidden = true;
    }
  };

  const refreshServerContent = async () => {
    serverContent = await apiRequest("/content");
    mergeServerContent();
  };

  const loadRuntimeConfig = async () => {
    try {
      const response = await fetch("runtime-config.json", { cache: "no-store" });
      if (!response.ok) {
        return { serverFeatures: false, apiBaseUrl: "" };
      }
      const config = await response.json();
      return config?.serverFeatures && typeof config.apiBaseUrl === "string"
        ? { serverFeatures: true, apiBaseUrl: config.apiBaseUrl }
        : { serverFeatures: false, apiBaseUrl: "" };
    } catch (error) {
      console.warn("Laufzeitkonfiguration konnte nicht geladen werden", error);
      return { serverFeatures: false, apiBaseUrl: "" };
    }
  };

  const setCurrentObjects = () => {
    objects = allObjects.filter((object) => positionFor(object));
    visibleObjectById = new Map(objects.map((object) => [object.id, object]));
    renderObjectList();
  };

  const updateMapControls = () => {
    mapButtons.forEach((button) => {
      const map = mapById.get(button.dataset.mapId);
      if (map) {
        button.textContent = map.name;
      }
      button.setAttribute("aria-pressed", String(button.dataset.mapId === currentMap?.id));
      button.disabled = mapIsOpening || !map;
    });
    mapSwitcher.setAttribute("aria-busy", String(mapIsOpening));
  };

  const resetEditorPoint = () => {
    if (editorMarker) {
      viewer.removeOverlay(editorMarker);
      editorMarker = null;
    }
    editorPoint = null;
    if (editorEnabled) {
      coordinateOutput.textContent = "Noch keine Position gewählt.";
      coordinateCopy.disabled = true;
    }
  };

  const updateEditorCloseLink = () => {
    if (!currentMap) {
      return;
    }
    const params = new URLSearchParams();
    params.set("map", currentMap.id);
    if (selectedObject && positionFor(selectedObject)) {
      params.set("object", selectedObject.id);
    }
    editorClose.href = `?${params.toString()}`;
  };

  const openMap = (map, { objectId = null, statusMessage = "", viewState = null } = {}) => {
    removeObjectMarkers();
    resetEditorPoint();
    currentMap = map;
    setCurrentObjects();
    pendingObjectId = objectId;
    pendingStatusMessage = statusMessage;
    pendingViewState = viewState;
    mapIsOpening = true;
    viewerElement.setAttribute("aria-busy", "true");
    viewerElement.setAttribute("aria-label", `Zoombare ${map.name} des Blausteinsees`);
    updateMapControls();
    updateEditorCloseLink();
    showStatus(`${map.name} wird geladen …`);
    viewer.open(map.tileSource);
  };

  const switchMap = (mapId, { historyMode = "push", objectId = selectedObject?.id || null, statusMessage = "" } = {}) => {
    const map = mapById.get(mapId) || mapById.get(defaultMapId);
    if (!map || mapIsOpening) {
      return;
    }

    const viewState = currentMap?.id === map.id ? null : captureViewState();

    const requestedObject = objectId ? objectById.get(objectId) : null;
    const objectIsAvailable = Boolean(requestedObject && positionFor(requestedObject, map.id));
    let nextObjectId = objectIsAvailable ? requestedObject.id : null;
    let nextStatus = statusMessage;

    if (objectId && !objectIsAvailable) {
      const objectName = requestedObject?.name || "Das angeforderte Tauchziel";
      nextStatus = `${objectName} ist auf der ${map.name} nicht verfügbar.`;
      clearSelectedObject();
    } else if (requestedObject) {
      selectedObject = requestedObject;
      renderObjectDetail(requestedObject);
    } else {
      clearSelectedObject();
    }

    if (currentMap?.id === map.id) {
      setCurrentObjects();
      if (nextObjectId) {
        selectObject(nextObjectId, { updateUrl: false });
      } else {
        goToDefaultView();
      }
      if (nextStatus) {
        showStatus(nextStatus, 3000);
      }
      if (historyMode !== "none") {
        writeUrlState(map.id, nextObjectId, historyMode);
      }
      return;
    }

    if (historyMode !== "none") {
      writeUrlState(map.id, nextObjectId, historyMode);
    }
    openMap(map, { objectId: nextObjectId, statusMessage: nextStatus, viewState });
  };

  const toggleFullScreen = async () => {
    if (!document.fullscreenEnabled || !mapShell.requestFullscreen) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await mapShell.requestFullscreen();
    }
  };

  const editorObject = () => {
    if (!editorPoint || !currentMap) {
      return null;
    }
    const name = byId("editor-name").value.trim() || "Neues Objekt";
    const depthValue = byId("editor-depth").value;
    const depth = Number.parseFloat(depthValue);
    return {
      id: slugify(name),
      name,
      depthMeters: depthValue !== "" && Number.isFinite(depth) ? depth : null,
      category: byId("editor-category").value.trim() || "Objekt",
      positions: {
        [currentMap.id]: { x: editorPoint.x, y: editorPoint.y }
      },
      description: "",
      photos: []
    };
  };

  const renderEditorOutput = () => {
    const object = editorObject();
    if (!object) {
      coordinateOutput.textContent = "Noch keine Position gewählt.";
      coordinateCopy.disabled = true;
      return;
    }
    coordinateOutput.textContent = JSON.stringify(object, null, 2);
    coordinateCopy.disabled = false;
  };

  const enableCoordinateEditor = () => {
    if (editorEnabled) {
      return;
    }
    editorEnabled = true;
    coordinateEditor.hidden = false;
    viewer.addHandler("canvas-click", (event) => {
      if (!event.quick || mapIsOpening) {
        return;
      }
      const image = viewer.world.getItemAt(0);
      if (!image) {
        return;
      }
      const viewportPoint = viewer.viewport.pointFromPixel(event.position);
      const imagePoint = image.viewportToImageCoordinates(viewportPoint);
      const x = Math.round(imagePoint.x);
      const y = Math.round(imagePoint.y);

      if (x < 0 || y < 0 || x > image.getContentSize().x || y > image.getContentSize().y) {
        return;
      }

      event.preventDefaultAction = true;
      editorPoint = { x, y };
      const markerLocation = image.imageToViewportCoordinates(x, y);
      if (!editorMarker) {
        editorMarker = document.createElement("span");
        editorMarker.className = "map-marker is-selected";
        editorMarker.setAttribute("aria-hidden", "true");
        viewer.addOverlay({
          element: editorMarker,
          location: markerLocation,
          placement: OpenSeadragon.Placement.CENTER,
          checkResize: false
        });
      } else {
        viewer.updateOverlay(editorMarker, markerLocation, OpenSeadragon.Placement.CENTER);
      }
      renderEditorOutput();
    });

    editorFields.forEach((field) => field.addEventListener("input", renderEditorOutput));
    coordinateCopy.addEventListener("click", async () => {
      await copyText(coordinateOutput.textContent);
      showStatus("JSON-Eintrag kopiert", 1800);
    });
  };

  const imagePositionToViewerPixel = (position) => {
    const image = viewer.world.getItemAt(0);
    if (!image || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return null;
    }
    const viewportPoint = image.imageToViewportCoordinates(position.x, position.y);
    const pixel = viewer.viewport.pixelFromPoint(viewportPoint, true);
    return Number.isFinite(pixel.x) && Number.isFinite(pixel.y)
      ? { x: pixel.x, y: pixel.y }
      : null;
  };

  window.BssMapViewer = Object.freeze({
    closeObjectPanel,
    getCurrentMap: () => currentMap,
    getObject: (objectId) => objectById.get(objectId) || null,
    getObjects: () => [...allObjects],
    imagePositionToViewerPixel,
    openObjectBrowser: () => openObjectPanel({ focusSearch: true }),
    positionForObject: (objectId, mapId = currentMap?.id) => positionFor(objectById.get(objectId), mapId),
    setPlannerRouteMarkers,
    showStatus
  });

  byId("zoom-in").addEventListener("click", () => zoomBy(1.45));
  byId("zoom-out").addEventListener("click", () => zoomBy(1 / 1.45));
  byId("home").addEventListener("click", () => goToDefaultView());
  byId("objects-open").addEventListener("click", () => {
    if (objectPanel.classList.contains("is-open")) {
      closeObjectPanel();
    } else {
      openObjectPanel({ focusSearch: true });
    }
  });
  byId("objects-close").addEventListener("click", closeObjectPanel);
  byId("object-back").addEventListener("click", () => {
    objectDetail.hidden = true;
    objectBrowser.hidden = false;
    objectSearch.focus();
  });
  objectSearch.addEventListener("input", renderObjectList);
  markerVisibility.addEventListener("change", updateMarkerVisibility);

  mapButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.mapId !== currentMap?.id) {
        switchMap(button.dataset.mapId);
      }
    });
  });
  mapSwitcher.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const currentIndex = mapButtons.indexOf(document.activeElement);
    if (currentIndex < 0) {
      return;
    }
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextButton = mapButtons[(currentIndex + direction + mapButtons.length) % mapButtons.length];
    nextButton.focus();
    nextButton.click();
  });

  serverAccess.addEventListener("click", () => {
    updateServerUi();
    byId("login-error").hidden = true;
    serverDialog.showModal();
    window.setTimeout(() => {
      if (session?.authenticated) {
        byId("logout").focus();
      } else {
        byId("login-username").focus();
      }
    }, 0);
  });
  byId("server-dialog-close").addEventListener("click", () => serverDialog.close());
  serverDialog.addEventListener("click", (event) => {
    if (event.target === serverDialog) {
      serverDialog.close();
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector("button[type='submit']");
    const errorOutput = byId("login-error");
    submitButton.disabled = true;
    errorOutput.hidden = true;
    try {
      session = await apiRequest("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: byId("login-username").value.trim(),
          password: byId("login-password").value
        })
      });
      byId("login-password").value = "";
      await refreshServerContent();
      updateServerUi();
      showStatus(`Als ${session.username} angemeldet`, 2200);
    } catch (error) {
      errorOutput.textContent = error.message;
      errorOutput.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });

  byId("logout").addEventListener("click", async () => {
    try {
      await apiRequest("/logout", { method: "POST" });
      session = null;
      await refreshServerContent();
      updateServerUi();
      serverDialog.close();
      showStatus("Abgemeldet", 1800);
    } catch (error) {
      if (error.status === 401) {
        session = null;
        try {
          await refreshServerContent();
        } catch (contentError) {
          console.warn("Serverinhalte konnten nach Sitzungsende nicht aktualisiert werden", contentError);
        }
        updateServerUi();
        serverDialog.close();
      }
      showStatus(error.message, 3000);
    }
  });

  byId("description-edit").addEventListener("click", () => {
    if (!selectedObject || !session?.authenticated) {
      return;
    }
    byId("description-input").value = selectedObject.description || "";
    descriptionForm.hidden = false;
    photoUploadForm.hidden = true;
    objectEditorActions.hidden = true;
    byId("description-input").focus();
  });
  byId("description-cancel").addEventListener("click", () => {
    descriptionForm.hidden = true;
    objectEditorActions.hidden = !session?.authenticated;
  });
  descriptionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedObject || !session?.authenticated) {
      return;
    }
    const objectId = selectedObject.id;
    const submitButton = descriptionForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      await apiRequest(`/objects/${encodeURIComponent(objectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: byId("description-input").value })
      });
      await refreshServerContent();
      showStatus("Beschreibung gespeichert", 2000);
    } catch (error) {
      if (error.status === 401) {
        session = null;
        updateServerUi();
      }
      showStatus(error.message, 3200);
    } finally {
      submitButton.disabled = false;
    }
  });

  byId("photo-upload-open").addEventListener("click", () => {
    if (!selectedObject || !session?.authenticated) {
      return;
    }
    photoUploadForm.reset();
    photoUploadForm.hidden = false;
    descriptionForm.hidden = true;
    objectEditorActions.hidden = true;
    byId("photo-file").focus();
  });
  byId("photo-upload-cancel").addEventListener("click", () => {
    photoUploadForm.hidden = true;
    objectEditorActions.hidden = !session?.authenticated;
  });
  photoUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedObject || !session?.authenticated) {
      return;
    }
    const file = byId("photo-file").files[0];
    if (!file) {
      showStatus("Bitte zuerst ein Foto auswählen.", 2600);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showStatus("Das Foto darf höchstens 10 MB groß sein.", 3200);
      return;
    }
    const objectId = selectedObject.id;
    const submitButton = photoUploadForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      await apiRequest(`/objects/${encodeURIComponent(objectId)}/photos`, {
        method: "POST",
        body: new FormData(photoUploadForm)
      });
      await refreshServerContent();
      showStatus("Foto hochgeladen", 2200);
    } catch (error) {
      if (error.status === 401) {
        session = null;
        updateServerUi();
      }
      showStatus(error.message, 3400);
    } finally {
      submitButton.disabled = false;
    }
  });

  byId("photo-delete").addEventListener("click", async () => {
    if (!selectedPhoto?.managed || !selectedPhoto.canDelete || !session?.authenticated) {
      return;
    }
    if (!window.confirm("Dieses hochgeladene Foto wirklich löschen?")) {
      return;
    }
    try {
      await apiRequest(`/photos/${encodeURIComponent(selectedPhoto.id)}`, { method: "DELETE" });
      await refreshServerContent();
      showStatus("Foto gelöscht", 2000);
    } catch (error) {
      if (error.status === 401) {
        session = null;
        updateServerUi();
      }
      showStatus(error.message, 3200);
    }
  });

  byId("object-link-copy").addEventListener("click", async () => {
    if (!selectedObject || !currentMap) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("map", currentMap.id);
    url.searchParams.set("object", selectedObject.id);
    await copyText(url.href);
    showStatus("Objektlink kopiert", 1800);
  });

  byId("photo-open").addEventListener("click", () => {
    if (!selectedPhoto) {
      return;
    }
    byId("photo-dialog-image").src = selectedPhoto.src;
    byId("photo-dialog-image").alt = selectedPhoto.alt || selectedObject.name;
    byId("photo-dialog-caption").textContent = selectedPhoto.caption || "";
    photoDialog.showModal();
  });
  byId("photo-dialog-close").addEventListener("click", () => photoDialog.close());
  photoDialog.addEventListener("click", (event) => {
    if (event.target === photoDialog) {
      photoDialog.close();
    }
  });

  if (document.fullscreenEnabled && mapShell.requestFullscreen) {
    fullPageButton.addEventListener("click", () => {
      toggleFullScreen().catch((error) => console.error("Fullscreen fehlgeschlagen", error));
    });
  } else {
    fullPageButton.hidden = true;
  }

  document.addEventListener("fullscreenchange", () => {
    const isFullScreen = Boolean(document.fullscreenElement);
    fullPageButton.setAttribute("aria-pressed", String(isFullScreen));
    viewer.viewport.applyConstraints();
  });

  viewer.addHandler("open", () => {
    viewerElement.setAttribute("tabindex", "0");
    viewerElement.setAttribute("aria-busy", "false");
    mapIsOpening = false;
    updateMapControls();
    const viewState = pendingViewState;
    pendingViewState = null;
    if (!applyViewState(viewState)) {
      goToDefaultView(true);
    }
    addObjectMarkers();
    updateMarkerAppearance();

    const requestedObjectId = pendingObjectId;
    const statusMessage = pendingStatusMessage;
    pendingObjectId = null;
    pendingStatusMessage = "";
    if (requestedObjectId) {
      selectObject(requestedObjectId, { focusMap: !viewState, updateUrl: false });
    }
    updateEditorCloseLink();
    if (statusMessage) {
      showStatus(statusMessage, 3200);
    } else {
      showStatus(`${currentMap.name} geladen`, 900);
    }
    window.dispatchEvent(new CustomEvent("bssmap:map-opened", {
      detail: { mapId: currentMap.id }
    }));
    window.dispatchEvent(new Event("bssmap:viewport-change"));
  });

  viewer.addHandler("open-failed", (event) => {
    mapIsOpening = false;
    viewerElement.setAttribute("aria-busy", "false");
    updateMapControls();
    showStatus("Die Kartenkacheln konnten nicht geladen werden.");
    console.error("OpenSeadragon open-failed", event);
  });

  viewer.addHandler("zoom", (event) => updateMarkerAppearance(event.zoom));
  viewer.addHandler("animation", () => window.dispatchEvent(new Event("bssmap:viewport-change")));
  viewer.addHandler("resize", () => window.dispatchEvent(new Event("bssmap:viewport-change")));

  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(window.location.search);
    const requestedMapId = params.get("map") || defaultMapId;
    const mapId = mapById.has(requestedMapId) ? requestedMapId : defaultMapId;
    const requestedObjectId = params.get("object");
    const message = mapId !== requestedMapId
      ? `Unbekannte Kartenansicht „${requestedMapId}“. Die Objektkarte wurde geöffnet.`
      : "";
    switchMap(mapId, {
      historyMode: "none",
      objectId: requestedObjectId,
      statusMessage: message
    });
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) {
      return;
    }

    // Dialog-Elemente verarbeiten ihre Tastaturereignisse selbst. Die
    // Objektansicht bleibt dabei geöffnet.
    if (photoDialog.open || serverDialog.open) {
      return;
    }

    if (event.key === "+" || event.key === "=") {
      zoomBy(1.45);
    } else if (event.key === "-") {
      zoomBy(1 / 1.45);
    } else if (event.key === "0") {
      goToDefaultView();
    } else if (event.key.toLowerCase() === "f") {
      toggleFullScreen().catch((error) => console.error("Fullscreen fehlgeschlagen", error));
    } else if (event.key === "Escape" && objectPanel.classList.contains("is-open")) {
      closeObjectPanel();
    } else {
      return;
    }
    event.preventDefault();
  });

  const initialize = async () => {
    try {
      const [mapData, objectData, loadedRuntimeConfig] = await Promise.all([
        loadJson("data/maps.json", "Kartendaten"),
        loadJson("data/objects.json", "Objektdaten"),
        loadRuntimeConfig()
      ]);
      if (!mapData || !Array.isArray(mapData.maps) || !mapData.defaultMapId) {
        throw new Error("Kartendaten haben ein ungültiges Format.");
      }
      if (!objectData || !Array.isArray(objectData.objects)) {
        throw new Error("Objektdaten haben ein ungültiges Format.");
      }

      maps = mapData.maps;
      mapById = new Map(maps.map((map) => [map.id, map]));
      defaultMapId = mapById.has(mapData.defaultMapId) ? mapData.defaultMapId : "object-map";
      staticObjects = objectData.objects;
      allObjects = staticObjects;
      runtimeConfig = loadedRuntimeConfig;
      let serverStatus = "";

      if (runtimeConfig.serverFeatures) {
        try {
          [session, serverContent] = await Promise.all([
            apiRequest("/session"),
            apiRequest("/content")
          ]);
        } catch (error) {
          console.warn("Serverfunktionen sind vorübergehend nicht erreichbar", error);
          session = null;
          serverContent = { objects: {} };
          serverStatus = "Die Redaktion ist vorübergehend nicht erreichbar. Die Karte funktioniert weiterhin.";
        }
      }
      mergeServerContent();
      updateServerUi();

      const params = new URLSearchParams(window.location.search);
      const requestedMapId = params.get("map") || defaultMapId;
      const initialMapId = mapById.has(requestedMapId) ? requestedMapId : defaultMapId;
      const requestedObjectId = params.get("object");
      let initialStatus = serverStatus;

      if (requestedMapId !== initialMapId) {
        initialStatus = `Unbekannte Kartenansicht „${requestedMapId}“. Die Objektkarte wurde geöffnet.`;
        const url = new URL(window.location.href);
        url.searchParams.set("map", initialMapId);
        window.history.replaceState({}, "", url);
      }

      window.history.replaceState(
        { mapId: initialMapId, objectId: requestedObjectId || null },
        "",
        window.location.href
      );
      if (params.get("edit") === "1") {
        enableCoordinateEditor();
      }
      switchMap(initialMapId, {
        historyMode: "none",
        objectId: requestedObjectId,
        statusMessage: initialStatus
      });
    } catch (error) {
      console.error(error);
      showStatus("Die Karten- und Objektdaten konnten nicht geladen werden.");
      byId("objects-open").disabled = true;
      mapButtons.forEach((button) => {
        button.disabled = true;
      });
    }
  };

  initialize();
})();
