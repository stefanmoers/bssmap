# Tauchplatzkarte Blausteinsee - OpenSeadragon-Demo

Dieses Repository enthält einen vollständig statischen Deep-Zoom-Viewer für die
Tauchplatzkarte des Blausteinsees. Die Karte wird in kleinen Kacheln geladen und
lässt sich dadurch auch auf Mobilgeräten flüssig zoomen und verschieben.

## Lokal starten

Im Projektverzeichnis unter Windows PowerShell:

```powershell
py -m http.server 8080 --bind 0.0.0.0
```

Anschließend öffnen:

```text
http://localhost:8080
```

Ein direkter Doppelklick auf `index.html` ist nicht zuverlässig, weil Browser
das Nachladen lokaler Kacheln bei `file://` einschränken können.

### Auf Handy oder Tablet testen

PC und Mobilgerät müssen sich im selben WLAN befinden. Mit `ipconfig` die
IPv4-Adresse des PCs ermitteln und auf dem Mobilgerät beispielsweise öffnen:

```text
http://192.168.178.35:8080
```

Falls Windows nachfragt, den Zugriff nur für private Netzwerke erlauben. Den
Server anschließend mit `Strg+C` beenden.

## Auf GitHub Pages veröffentlichen

1. Ein neues GitHub-Repository anlegen.
2. Den vollständigen Inhalt dieses Ordners in das Repository übernehmen.
3. Committen und in den Branch `main` pushen.
4. Auf GitHub `Settings` -> `Pages` öffnen.
5. Unter `Build and deployment` die Quelle `Deploy from a branch` auswählen.
6. Branch `main`, Ordner `/(root)` auswählen und speichern.

Die Datei `.nojekyll` sorgt dafür, dass GitHub die statischen Viewer-Dateien
unverändert veröffentlicht. Alle Pfade sind relativ und funktionieren daher
auch unter einer Projektadresse wie:

```text
https://BENUTZERNAME.github.io/REPOSITORYNAME/
```

## Bedienung

- Ziehen: Kartenausschnitt verschieben
- Mausrad oder Zwei-Finger-Geste: zoomen
- Doppelklick oder Doppeltipp: hineinzoomen
- `+` / `-`: Zoom ändern
- `0`: gesamte Karte anzeigen
- `F`: Vollbildansicht umschalten
- `◎`: Tauchziele öffnen und durchsuchen
- gelbe Markierung: Informationen zum Tauchziel anzeigen

Direkte Links zu einzelnen Objekten funktionieren über den Query-Parameter
`object`, zum Beispiel:

```text
https://BENUTZERNAME.github.io/REPOSITORYNAME/?object=segelboot
```

## Interaktive Tauchziele pflegen

Die Tauchziele stehen getrennt von der Karte in `data/objects.json`. Koordinaten
beziehen sich auf das 5.750 x 8.117 Pixel große Kartenbild. Änderungen an der
JSON-Datei benötigen keine Neuerzeugung der Kartenkacheln.

Zum Erfassen einer neuen Position die Karte lokal mit `?edit=1` öffnen:

```text
http://localhost:8080/?edit=1
```

Nach einem Klick auf die Karte erzeugt der Bearbeitungsmodus einen JSON-Eintrag,
der nach `data/objects.json` kopiert werden kann.

### Fotos zu einem Tauchziel ergänzen

Fotos werden unter `images/objects/<objekt-id>/` abgelegt und beim Objekt als
optionale Liste eingetragen:

```json
"photos": [
  {
    "src": "images/objects/segelboot/segelboot-01.jpg",
    "alt": "Segelboot auf dem Grund des Blausteinsees",
    "caption": "Aufnahme von der Steuerbordseite"
  }
]
```

Mehrere Bilder werden als Galerie dargestellt und lassen sich vergrößern. Eine
ausführlichere Anleitung steht in `images/objects/README.md`.

## Karte später aus dem Originalmaterial neu erzeugen

Für die endgültige Fassung sollte aus der originalen Inkscape-Datei ein etwa
5.750 x 8.100 Pixel großes PNG exportiert werden. Die Kacheln können danach mit
dem enthaltenen Build-Skript neu erzeugt werden.

Voraussetzung: Node.js 20 oder neuer.

```powershell
npm install
npm run generate-tiles -- --input C:\Pfad\zur\karte.png
```

Der Befehl ersetzt `map.dzi` und den Ordner `map_files`. Verwendet werden
verlustfreie PNG-Kacheln mit 512 x 512 Pixeln. Anschließend die Änderung lokal
prüfen und gemeinsam mit den erzeugten Kacheln committen.

Falls OpenSeadragon später aktualisiert wird:

```powershell
npm install
npm run copy-vendor
```

Die vollständige Kachelpyramide lässt sich anschließend prüfen mit:

```powershell
npm test
```

## Projektstruktur

```text
index.html                 Viewer-Seite
styles.css                 Responsive Darstellung
viewer.js                  OpenSeadragon-Konfiguration
data/objects.json          Tauchziele, Koordinaten und Fotoreferenzen
images/objects/            Objektfotos und Fotoanleitung
map.dzi                    Beschreibung der Kachelpyramide
map_files/                 Kartenkacheln je Zoomstufe
vendor/openseadragon/      Lokale OpenSeadragon-Laufzeit
scripts/                   Skripte zur Neuerzeugung
```

## Hinweise

- Die Karte und ihre Inhalte bleiben Eigentum der jeweiligen Urheber.
- Vor einer öffentlichen Veröffentlichung sollten Freigabe und Bildrechte
  geklärt werden.
- OpenSeadragon wird unter der BSD-3-Clause-Lizenz bereitgestellt; der
  zugehörige Lizenztext liegt im Vendor-Verzeichnis.
