(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const status = byId("status");
  const viewerElement = byId("viewer");
  const mapShell = document.querySelector(".map-shell");
  const fullPageButton = byId("full-page");
  const objectPanel = byId("object-panel");
  const objectBrowser = byId("object-browser");
  const objectDetail = byId("object-detail");
  const objectSearch = byId("object-search");
  const objectList = byId("object-list");
  const objectCount = byId("object-count");
  const markerVisibility = byId("marker-visibility");
  const coordinateEditor = byId("coordinate-editor");
  const coordinateOutput = byId("coordinate-output");
  const coordinateCopy = byId("coordinate-copy");
  const photoDialog = byId("photo-dialog");
  const editorFields = [byId("editor-name"), byId("editor-depth"), byId("editor-category")];
  const depthFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

  let objects = [];
  let objectById = new Map();
  const markers = new Map();
  const markerTrackers = [];
  let selectedObject = null;
  let selectedPhoto = null;
  let editorPoint = null;
  let editorMarker = null;

  if (!window.OpenSeadragon) {
    status.textContent = "OpenSeadragon konnte nicht geladen werden.";
    return;
  }

  const viewer = OpenSeadragon({
    id: "viewer",
    tileSources: "map.dzi",
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
    status.textContent = message;
    status.classList.remove("is-hidden");
    if (hideAfter > 0) {
      window.setTimeout(() => status.classList.add("is-hidden"), hideAfter);
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

  const updateObjectUrl = (objectId) => {
    const url = new URL(window.location.href);
    if (objectId) {
      url.searchParams.set("object", objectId);
    } else {
      url.searchParams.delete("object");
    }
    window.history.replaceState({}, "", url);
  };

  const setMarkerSelection = (objectId) => {
    markers.forEach((marker, id) => {
      marker.classList.toggle("is-selected", id === objectId);
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

  const focusObjectOnMap = (object) => {
    const bounds = viewer.viewport.imageToViewportRectangle(
      object.x - 500,
      object.y - 500,
      1000,
      1000
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
      image.src = photo.src;
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
    objectBrowser.hidden = true;
    objectDetail.hidden = false;
  };

  const selectObject = (objectId, { focusMap = true, updateUrl = true } = {}) => {
    const object = objectById.get(objectId);
    if (!object) {
      return;
    }

    selectedObject = object;
    setMarkerSelection(object.id);
    renderObjectDetail(object);
    openObjectPanel();
    if (focusMap) {
      focusObjectOnMap(object);
    }
    if (updateUrl) {
      updateObjectUrl(object.id);
    }
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
      button.addEventListener("click", () => selectObject(object.id));
      objectList.append(button);
    });
  };

  const addObjectMarkers = () => {
    objects.forEach((object) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "map-marker";
      marker.setAttribute("aria-label", `${object.name}, Tiefe ${formatDepth(object.depthMeters)}`);
      marker.title = `${object.name} · Tiefe ${formatDepth(object.depthMeters)}`;

      // Die native Klickbehandlung bleibt für Tastaturbedienung erhalten.
      // Zeiger- und Touch-Ereignisse innerhalb des Viewers übernimmt dagegen
      // ein eigener OpenSeadragon-Tracker, damit der Karten-Tracker den Klick
      // nicht als Beginn einer Verschiebegeste abfängt.
      marker.addEventListener("click", (event) => {
        if (event.detail !== 0) {
          return;
        }
        event.stopPropagation();
        selectObject(object.id);
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
            selectObject(object.id);
          }
        }
      });
      markerTracker.setTracking(true);
      markerTrackers.push(markerTracker);

      viewer.addOverlay({
        element: marker,
        location: viewer.viewport.imageToViewportCoordinates(object.x, object.y),
        placement: OpenSeadragon.Placement.CENTER,
        checkResize: false
      });
      markers.set(object.id, marker);
    });
    updateMarkerVisibility();
  };

  const loadObjectData = async () => {
    const response = await fetch("data/objects.json");
    if (!response.ok) {
      throw new Error(`Objektdaten konnten nicht geladen werden: HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.objects)) {
      throw new Error("Objektdaten haben ein ungültiges Format.");
    }
    return data.objects;
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
    if (!editorPoint) {
      return null;
    }
    const name = byId("editor-name").value.trim() || "Neues Objekt";
    const depth = Number.parseFloat(byId("editor-depth").value);
    return {
      id: slugify(name),
      name,
      depthMeters: Number.isFinite(depth) ? depth : 0,
      category: byId("editor-category").value.trim() || "Objekt",
      x: editorPoint.x,
      y: editorPoint.y,
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
    coordinateEditor.hidden = false;
    viewer.addHandler("canvas-click", (event) => {
      if (!event.quick) {
        return;
      }
      const image = viewer.world.getItemAt(0);
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

  byId("zoom-in").addEventListener("click", () => zoomBy(1.45));
  byId("zoom-out").addEventListener("click", () => zoomBy(1 / 1.45));
  byId("home").addEventListener("click", () => viewer.viewport.goHome());
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

  byId("object-link-copy").addEventListener("click", async () => {
    if (!selectedObject) {
      return;
    }
    const url = new URL(window.location.href);
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

  viewer.addHandler("open", async () => {
    viewerElement.setAttribute("tabindex", "0");
    showStatus("Karte geladen", 900);

    try {
      objects = await loadObjectData();
      objectById = new Map(objects.map((object) => [object.id, object]));
      renderObjectList();
      addObjectMarkers();
      updateMarkerAppearance();

      const params = new URLSearchParams(window.location.search);
      const requestedObject = params.get("object");
      if (requestedObject && objectById.has(requestedObject)) {
        selectObject(requestedObject, { updateUrl: false });
      }
      if (params.get("edit") === "1") {
        enableCoordinateEditor();
      }
    } catch (error) {
      console.error(error);
      showStatus("Die interaktiven Objektdaten konnten nicht geladen werden.");
      byId("objects-open").disabled = true;
    }
  });

  viewer.addHandler("open-failed", (event) => {
    showStatus("Die Kartenkacheln konnten nicht geladen werden.");
    console.error("OpenSeadragon open-failed", event);
  });

  viewer.addHandler("zoom", (event) => updateMarkerAppearance(event.zoom));

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) {
      return;
    }

    // Das Dialog-Element verarbeitet Escape selbst. Die Objektansicht soll
    // dabei geöffnet bleiben, damit man nach dem Foto zur Beschreibung
    // zurückkehrt.
    if (event.key === "Escape" && photoDialog.open) {
      return;
    }

    if (event.key === "+" || event.key === "=") {
      zoomBy(1.45);
    } else if (event.key === "-") {
      zoomBy(1 / 1.45);
    } else if (event.key === "0") {
      viewer.viewport.goHome();
    } else if (event.key.toLowerCase() === "f") {
      toggleFullScreen().catch((error) => console.error("Fullscreen fehlgeschlagen", error));
    } else if (event.key === "Escape" && objectPanel.classList.contains("is-open")) {
      closeObjectPanel();
    } else {
      return;
    }
    event.preventDefault();
  });
})();
