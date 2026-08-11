(() => {
  "use strict";

  const status = document.getElementById("status");
  const viewerElement = document.getElementById("viewer");
  const mapShell = document.querySelector(".map-shell");
  const fullPageButton = document.getElementById("full-page");

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

  const zoomBy = (factor) => {
    viewer.viewport.zoomBy(factor);
    viewer.viewport.applyConstraints();
  };

  document.getElementById("zoom-in").addEventListener("click", () => zoomBy(1.45));
  document.getElementById("zoom-out").addEventListener("click", () => zoomBy(1 / 1.45));
  document.getElementById("home").addEventListener("click", () => viewer.viewport.goHome());

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
    status.textContent = "Karte geladen";
    window.setTimeout(() => status.classList.add("is-hidden"), 900);
    viewerElement.setAttribute("tabindex", "0");
  });

  viewer.addHandler("open-failed", (event) => {
    status.textContent = "Die Kartenkacheln konnten nicht geladen werden.";
    status.classList.remove("is-hidden");
    console.error("OpenSeadragon open-failed", event);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") {
      zoomBy(1.45);
    } else if (event.key === "-") {
      zoomBy(1 / 1.45);
    } else if (event.key === "0") {
      viewer.viewport.goHome();
    } else if (event.key.toLowerCase() === "f") {
      toggleFullScreen().catch((error) => console.error("Fullscreen fehlgeschlagen", error));
    } else {
      return;
    }
    event.preventDefault();
  });
})();
