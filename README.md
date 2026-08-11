# Tauchplatzkarte Blausteinsee

Dieses Repository enthält einen vollständig statischen Deep-Zoom-Viewer für
zwei interaktive Tauchplatzkarten des Blausteinsees. Große Karten werden als
PNG-Kachelpyramiden geladen und bleiben dadurch auch auf Mobilgeräten flüssig
zoombar.

Verfügbar sind:

- **Objektkarte** mit dem vollständigen bisherigen Objektbestand
- **Detailkarte** mit Tiefenlinien, Leinenverläufen, Entfernungen und 62 sicher
  lokalisierten Tauchzielen

Der Umschalter lädt die jeweilige DZI-Quelle ohne vollständigen Seitenreload.
Marker, Suche, Detailinformationen und Fotos werden automatisch auf die Ziele
der aktiven Karte eingeschränkt.

## Lokal starten

Die Seite muss über HTTP geöffnet werden. Unter macOS oder Linux:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

Unter Windows PowerShell:

```powershell
py -m http.server 8080 --bind 0.0.0.0
```

Anschließend öffnen:

```text
http://localhost:8080/
```

Ein direkter Doppelklick auf `index.html` ist nicht zuverlässig, weil Browser
das Nachladen lokaler JSON-, DZI- und Kacheldateien bei `file://` einschränken
können.

### Auf Handy oder Tablet testen

Computer und Mobilgerät müssen sich im selben privaten Netzwerk befinden. Die
lokale IP-Adresse des Computers ermitteln und auf dem Mobilgerät beispielsweise
`http://192.168.178.35:8080/` öffnen. Den Server anschließend mit `Strg+C`
beenden.

## Bedienung

- **Objektkarte / Detailkarte**: Kartenansicht umschalten
- Ziehen: Kartenausschnitt verschieben
- Mausrad oder Zwei-Finger-Geste: zoomen
- Doppelklick oder Doppeltipp: hineinzoomen
- `+` / `-`: Zoom ändern
- `0`: Standardansicht der aktiven Karte öffnen
- `F`: Vollbildansicht umschalten
- `◎`: Tauchziele öffnen und durchsuchen
- gelbe Markierung: Informationen zum Tauchziel anzeigen

Der Kartenumschalter und die Marker sind mit Maus, Touch und Tastatur bedienbar.

## Direkte Links

Die Karten-ID wird mit `map`, das Tauchziel mit `object` angegeben:

```text
?map=object-map
?map=detail-map
?map=object-map&object=segelboot
?map=detail-map&object=segelboot
```

Bestehende Links ohne `map` bleiben gültig und öffnen die Objektkarte:

```text
?object=segelboot
```

Unbekannte Karten-IDs fallen auf die Objektkarte zurück. Fehlt einem Objekt die
Position auf der gewählten Karte, wird es dort weder in der Liste noch als
Marker angeboten.

## Karten- und Objektdaten pflegen

`data/maps.json` beschreibt Karten-ID, sichtbaren Namen, DZI-Quelle,
Bildabmessungen und Standardansicht. Objektmetadaten bleiben einmalig in
`data/objects.json`; nur die Koordinaten werden pro Karte gespeichert:

```json
{
  "id": "segelboot",
  "name": "Segelboot",
  "positions": {
    "object-map": { "x": 2800, "y": 5450 },
    "detail-map": { "x": 3846, "y": 7690 }
  }
}
```

Fehlt eine Karten-ID unter `positions`, ist das Objekt auf dieser Karte nicht
sichtbar. Koordinaten sind ganzzahlige Bildpixel und keine GPS-Koordinaten.

Zum Erfassen einer Position die gewünschte Karte im Bearbeitungsmodus öffnen:

```text
http://localhost:8080/?map=detail-map&edit=1
```

Nach einem Klick auf die tatsächliche Objektposition erzeugt der Editor einen
JSON-Eintrag mit der aktiven Karten-ID.

### Fotos ergänzen

Fotos liegen unter `images/objects/<objekt-id>/` und werden als optionale Liste
am kanonischen Objekt eingetragen:

```json
"photos": [
  {
    "src": "images/objects/segelboot/segelboot-01.jpg",
    "alt": "Segelboot auf dem Grund des Blausteinsees",
    "caption": "Aufnahme von der Steuerbordseite"
  }
]
```

Weitere Hinweise stehen in `images/objects/README.md`.

## Kacheln reproduzierbar erzeugen

Voraussetzung ist Node.js 20 oder neuer. Abhängigkeiten installieren:

```bash
npm install
```

Die Detailkarte basiert auf
`2026-08-11b_Blausteinsee-sz.ohne-Details.erweitert.pdf`. Die einzige relevante
PDF-Seite wurde verlustfrei mit 400 dpi als PNG mit `7997 × 11414` Pixeln
gerastert. Ein reproduzierbarer Ablauf ist:

```bash
mkdir -p tmp/pdfs
pdfinfo 2026-08-11b_Blausteinsee-sz.ohne-Details.erweitert.pdf
pdftoppm -f 1 -l 1 -singlefile -r 400 -png \
  2026-08-11b_Blausteinsee-sz.ohne-Details.erweitert.pdf \
  tmp/pdfs/detail-map-400
npm run generate-tiles -- \
  --input tmp/pdfs/detail-map-400.png \
  --output maps/detail-map/map
```

Das temporäre PNG wird nicht committed. Das Skript ersetzt dagegen bewusst die
angegebene `.dzi`-Datei und den zugehörigen `_files`-Ordner. Die Objektkarte
wurde unverändert nach `maps/object-map/` verschoben und nicht neu erzeugt.

OpenSeadragon wird lokal ausgeliefert und kontrolliert aktualisiert mit:

```bash
npm install
npm run copy-vendor
```

## Prüfung

```bash
npm test
git diff --check
```

Der Validator prüft beide Kartendefinitionen, DZI-Abmessungen, vollständige
Kachelpyramiden, kartenspezifische Objektpositionen, eindeutige IDs und alle
Fotoreferenzen.

## Projektstruktur

```text
index.html                         Viewer-Seite und Kartenumschalter
styles.css                        Responsive Oberfläche und Marker
viewer.js                         OpenSeadragon- und Mehrkartenlogik
data/maps.json                    Kartendefinitionen
data/objects.json                 Objekte und kartenspezifische Positionen
maps/object-map/map.dzi           DZI der Objektkarte
maps/object-map/map_files/        Kacheln der Objektkarte
maps/detail-map/map.dzi           DZI der Detailkarte
maps/detail-map/map_files/        Kacheln der Detailkarte
images/objects/                   Unterwasserfotos
vendor/openseadragon/             Lokale OpenSeadragon-Laufzeit
scripts/                          Kachelerzeugung und Projektvalidator
```

## GitHub Pages und Rechte

Alle Ressourcen verwenden relative Pfade und funktionieren unter einer
GitHub-Pages-Projektadresse. Die Karten, Symbole, Texte und Fotos bleiben
Eigentum ihrer jeweiligen Urheber; vor einer öffentlichen Veröffentlichung
sind Freigaben und Bildrechte zu prüfen. OpenSeadragon wird unter der
BSD-3-Clause-Lizenz ausgeliefert.
