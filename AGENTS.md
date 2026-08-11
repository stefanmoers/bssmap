# AGENTS.md

## Geltungsbereich

Diese Datei gilt für das gesamte Repository. Sie richtet sich an KI-Assistenten,
die das Projekt analysieren, erweitern, testen oder dokumentieren.

Lies vor Änderungen mindestens diese Datei und `README.md`. Bei Arbeiten an
Objektfotos ist zusätzlich `images/objects/README.md` relevant.

## Projektziel

Dieses Repository stellt die Tauchplatzkarten des Blausteinsees als schnelle,
interaktive Webkarten bereit. Große Karten werden nicht als PDF im Browser
angezeigt, sondern als Deep-Zoom-Kacheln geladen. Dadurch sollen Zoomen und
Verschieben auf Desktop-PCs, Tablets und Mobiltelefonen flüssig funktionieren.

Der Viewer ist eine vollständig statische Website und wird über GitHub Pages
ausgeliefert. Es gibt keinen Server, keine Datenbank und keinen
Anwendungs-Build zur Laufzeit.

Die wichtigsten Nutzerfunktionen sind:

- Karte mit Maus, Touch und Tastatur zoomen und verschieben
- Tauchziele als anklickbare Marker anzeigen
- Tauchziele durchsuchen und nach Name sortiert auflisten
- Detailansicht mit Name, Tiefe, Kategorie und Beschreibung öffnen
- optionale Unterwasserfotos als Galerie und vergrößert anzeigen
- zwischen Objektkarte und Detailkarte ohne Seitenreload umschalten
- direkte Links über `?map=<id>&object=<id>` verwenden
- kartenspezifische Objektkoordinaten lokal über `?edit=1` erfassen
- Vollbild- und Navigatoransicht nutzen

## Aktueller Stand

Zum Zeitpunkt der Aktualisierung sind zwei Karten umgesetzt:

- **Objektkarte**: `maps/object-map/map.dzi`, 5.750 x 8.117 Pixel,
  67 kartenspezifische Positionen
- **Detailkarte**: `maps/detail-map/map.dzi`, 7.997 x 11.414 Pixel,
  62 visuell kontrollierte kartenspezifische Positionen
- Kachelformat: PNG
- Kachelgröße: 512 x 512 Pixel
- Überlappung: 1 Pixel
- OpenSeadragon: 6.1.0, lokal unter `vendor/openseadragon/`
- Kartendaten: `data/maps.json`
- Objektdaten: `data/objects.json`
- insgesamt 67 kanonische Tauchziele
- Fotos sind unter anderem für Fahrrad, M&M und Segelboot hinterlegt

Verlasse dich bei automatisch prüfbaren Zahlen nicht ausschließlich auf diesen
Text. `npm test` und die tatsächlich vorhandenen Daten sind die maßgebliche
Quelle.

## Zwei Kartenansichten

Die beiden Karten werden über einen responsiven Umschalter ohne Seitenreload
geöffnet. Marker, Suche, Detailinformationen und Fotos funktionieren auf beiden
Karten. Objektliste und Marker enthalten nur Ziele, die eine Position für die
aktive Karte besitzen.

Die implementierte Struktur lautet:

```text
maps/
  object-map/
    map.dzi
    map_files/
  detail-map/
    map.dzi
    map_files/
data/
  maps.json
  objects.json
```

`data/maps.json` beschreibt Karten-ID, Bezeichnung, Tile-Source,
Bildabmessungen und Standardansicht. Objektinformationen bleiben kanonisch in
`data/objects.json`; Koordinaten werden pro Karte gespeichert, zum Beispiel:

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

Fehlt eine Position für eine Karte, gilt das Objekt dort als nicht sichtbar.
Dupliziere Name, Tiefe, Beschreibung und Fotos nicht für jede Karte.

Beim Umschalten der Karten soll nach Möglichkeit:

- der aktuelle Mittelpunkt und die Zoomstufe relativ zur Gesamtkarte erhalten
  bleiben,
- die Detailansicht eines ausgewählten Objekts geöffnet bleiben, wenn das
  Objekt auf der Zielkarte vorhanden ist, ohne den übernommenen Ausschnitt zu
  verändern,
- andernfalls eine verständliche Statusmeldung erscheinen,
- die Karten-ID zusätzlich über `?map=<id>` verlinkbar sein,
- ein Objektlink sowohl `map` als auch `object` enthalten können.

Wenn Karten unterschiedliche Ausschnitte, Maßstäbe oder Ausrichtungen haben,
verwende keine ungeprüfte einfache Skalierung der Koordinaten. Ermittle
Positionen anhand gemeinsamer Referenzpunkte und kontrolliere jeden Marker
visuell.

Die Detailkarte basiert auf
`2026-08-11b_Blausteinsee-sz.ohne-Details.erweitert.pdf`. Die einzige Seite
wurde bei 400 dpi verlustfrei zu 7.997 x 11.414 Pixeln gerastert. Das temporäre
PNG gehört nicht ins Repository.

## Technische Architektur

Das Projekt verwendet bewusst wenige Bausteine:

- `index.html`: semantische Struktur und Bedienelemente
- `styles.css`: responsive Gestaltung, Marker und Dialoge
- `viewer.js`: OpenSeadragon, Mehrkarten-Zustand, History und UI-Verhalten
- `data/maps.json`: Kartendefinitionen und Standardansichten
- `data/objects.json`: Objektmetadaten, Koordinaten und Fotoreferenzen
- `images/objects/`: Unterwasserfotos
- `maps/object-map/`: DZI und Kacheln der Objektkarte
- `maps/detail-map/`: DZI und Kacheln der Detailkarte
- `vendor/openseadragon/`: lokal ausgelieferte Bibliothek und Bedienelemente
- `scripts/generate-tiles.mjs`: reproduzierbare Kachelerzeugung
- `scripts/validate-project.mjs`: strukturelle Projektprüfung

Die Website verwendet Vanilla-HTML, -CSS und -JavaScript. Führe kein Framework,
keinen Bundler und keinen Server ein, solange die Anforderung dies nicht
zwingend benötigt. Relative Pfade sind erforderlich, damit die Website auch
unter einer GitHub-Pages-Projektadresse funktioniert.

OpenSeadragon wird lokal ausgeliefert. Ersetze es nicht ohne Grund durch ein
CDN. Eine Aktualisierung erfolgt kontrolliert über:

```bash
npm install
npm run copy-vendor
```

## Wichtige Verhaltensregeln

### Karten und Kacheln

- Bearbeite einzelne Dateien in `map_files/` niemals manuell.
- Erzeuge die komplette Kachelpyramide reproduzierbar neu.
- Verwende verlustfreie PNG-Kacheln, weil Karte, Schrift und Liniengrafik
  dadurch sauber bleiben.
- Halte DZI-Abmessungen und die in den Datendateien eingetragenen
  Bildabmessungen synchron.
- Prüfe erzeugte Karten visuell in mehreren Zoomstufen.
- Behalte relative URLs und GitHub-Pages-Kompatibilität bei.

Kacheln werden mit Node.js 20 oder neuer erzeugt:

```bash
npm install
npm run generate-tiles -- --input /pfad/zur/karte.png --output maps/detail-map/map
```

Das Skript löscht und ersetzt die zum angegebenen Output gehörende `.dzi`-Datei
und den zugehörigen `_files`-Ordner. Wähle den Output daher bewusst und verwende
getrennte Ziele wie `maps/object-map/map` und `maps/detail-map/map`.

SVG-Ausgangsmaterial kann in einer kontrollierten Pixelgröße direkt oder über
einen verlustfreien PNG-Zwischenschritt gerastert werden. PDFs werden vor der
Kachelerzeugung mit einem geeigneten Renderer, beispielsweise Poppler, in einer
explizit gewählten Auflösung gerastert. Dokumentiere die gewählte Zielgröße.

### Objektkoordinaten

Koordinaten stehen unter `positions.<karten-id>` und beziehen sich direkt auf
das jeweilige Kartenbild. Sie sind keine GPS-Koordinaten. Die Objektkarte ist
5.750 x 8.117 Pixel, die Detailkarte 7.997 x 11.414 Pixel groß.

- Setze Marker auf die Illustration beziehungsweise die tatsächliche
  Objektposition, nicht auf Beschriftung, Tiefenangabe oder einen benachbarten
  Linienpunkt.
- Bei Linienobjekten verwende den tatsächlichen Knoten oder Kreuzungspunkt.
- Rate keine Koordinaten. Nutze den Bearbeitungsmodus oder einen visuell
  kontrollierten Koordinatenabgleich.
- Öffne zur Positionserfassung beispielsweise
  `http://localhost:8080/?map=detail-map&edit=1`.
- Kontrolliere nach größeren Koordinatenänderungen alle betroffenen Sektoren
  als Overlay auf dem Originalbild.
- Halte Koordinaten ganzzahlig und innerhalb der jeweiligen Bildabmessungen.

### Objekt-IDs und Daten

- Objekt-IDs sind stabile öffentliche Bezeichner und Bestandteil von URLs.
- Ändere bestehende IDs nur mit einer bewussten Migrationsentscheidung.
- IDs verwenden Kleinbuchstaben, Ziffern und Bindestriche.
- `depthMeters` ist eine Zahl in Metern oder `null`, wenn keine Tiefe angegeben
  ist. Erfinde keine fehlende Tiefe.
- `photos` ist immer ein Array, auch wenn es leer ist.
- Beschreibungen müssen belegbar und sachlich sein. Ergänze keine erfundenen
  Eigenschaften oder Geschichten zu einem Tauchziel.
- Erweitere bei Schemaänderungen gleichzeitig Viewer, Dokumentation und
  Validator.

Das aktuelle Schema sieht vereinfacht so aus:

```json
{
  "schemaVersion": 2,
  "objects": [
    {
      "id": "segelboot",
      "name": "Segelboot",
      "depthMeters": 26.5,
      "category": "Boot",
      "positions": {
        "object-map": { "x": 2800, "y": 5450 },
        "detail-map": { "x": 3846, "y": 7690 }
      },
      "description": "...",
      "photos": []
    }
  ]
}
```

### Marker und Interaktion

- Marker werden als OpenSeadragon-Overlays in Bildkoordinaten platziert.
- Die Markergröße skaliert abhängig vom Zoom und darf in der Gesamtansicht die
  Karte nicht verdecken.
- Marker müssen per Maus, Touch und Tastatur bedienbar bleiben.
- Entferne den eigenen `OpenSeadragon.MouseTracker` der Marker nicht
  unbedacht. Er verhindert, dass der Karten-Tracker einen Marker-Klick als
  Verschiebegeste abfängt.
- Auswahl über Marker und Auswahl über Objektliste müssen dasselbe Verhalten
  auslösen.
- Ein ausgewähltes Objekt wird in der Karte fokussiert und in der Detailansicht
  angezeigt.

### Fotos

- Lege Fotos unter `images/objects/<objekt-id>/` ab.
- Verwende sichere relative Pfade ohne `..` und ohne externe URL.
- JPEG oder WebP ist für Unterwasserfotos geeignet.
- Zielgröße: ungefähr 1.600 bis 2.000 Pixel Breite und möglichst unter 500 KB.
- Jedes Foto benötigt einen sinnvollen `alt`-Text; `caption` ist optional.
- Prüfe Urheber, Einwilligung und Veröffentlichungsrecht vor einer öffentlichen
  Bereitstellung.
- Bilder dürfen nicht ohne ausdrücklichen Auftrag generativ verändert werden.

### Oberfläche und Barrierefreiheit

- Die UI-Sprache ist Deutsch.
- Code-Bezeichner bleiben vorzugsweise Englisch.
- Behalte sichtbare Fokuszustände, ARIA-Beschriftungen und Tastaturbedienung
  bei.
- Neue Schaltflächen benötigen `type="button"`, einen verständlichen sichtbaren
  Text oder ein `aria-label` und einen ausreichend großen Touchbereich.
- Prüfe Desktop- und Mobilansicht. Seitenleisten und Dialoge dürfen den Viewer
  auf kleinen Bildschirmen nicht unbedienbar machen.
- Zeige Fehler verständlich über die vorhandene Statusanzeige und protokolliere
  technische Details zusätzlich in der Konsole.

## Lokaler Betrieb

Die Seite muss über HTTP geöffnet werden. `file://` ist wegen nachgeladener
JSON-, DZI- und Kacheldateien nicht zuverlässig.

Beispiel:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

Danach:

```text
http://localhost:8080/
```

## Prüfung vor Abschluss einer Änderung

Führe mindestens aus:

```bash
npm test
git diff --check
```

`npm test` prüft derzeit:

- JavaScript-Syntax von `viewer.js`
- erforderliche Dateien und HTML-IDs
- Schema, eindeutige IDs und Standardansichten in `data/maps.json`
- Schema und Werte in `data/objects.json`
- kartenspezifische Positionen innerhalb der jeweiligen Bildabmessungen
- referenzierte Fotodateien
- DZI-Abmessungen beider Karten
- Vollständigkeit und Pixelabmessungen beider Kachelpyramiden

Führe zusätzlich einen Browser-Smoke-Test über einen lokalen HTTP-Server durch:

1. Startseite laden und auf Konsolenfehler prüfen.
2. Zoomen, Verschieben, Home und Vollbild testen.
3. Objektpanel öffnen, suchen und ein Objekt auswählen.
4. Marker mit Maus und Touch beziehungsweise emuliertem Touch öffnen.
5. Fotos öffnen und schließen.
6. Direkte Links mit `?object=segelboot` sowie `?map=<id>&object=<id>` testen.
7. Bearbeitungsmodus `?map=<id>&edit=1` testen, wenn Koordinatenlogik geändert
   wurde.
8. Umschalter, gefilterte Objektliste, unbekannte Karten-IDs, Objektübernahme
   sowie Browser-Zurück und Browser-Vorwärts testen.

Prüfe mindestens eine typische Desktopgröße und eine schmale Mobilansicht.

## Git und Änderungsumfang

- Bewahre vorhandene Nutzeränderungen und bearbeite keine sachfremden Dateien.
- Committe keine temporären Renderings, Analyse-Overlays oder lokalen
  Serverdateien.
- Generierte Kartenkacheln werden dagegen benötigt und müssen zusammen mit der
  zugehörigen DZI-Datei committed werden.
- Große Binäränderungen müssen erwartbar und durch eine neue Kartenquelle
  begründet sein.
- Verwende präzise Commit-Nachrichten, zum Beispiel
  `Add detail map switcher` oder `Correct dive target coordinates`.

## Urheberrecht und Inhalt

Die Karten, Symbole, Texte und Fotos bleiben Eigentum ihrer jeweiligen Urheber.
Eine technische Verfügbarkeit im Repository bedeutet nicht automatisch eine
Freigabe zur öffentlichen Nutzung. Entferne keine Urheberhinweise aus dem
Kartenmaterial und dokumentiere die Quelle neuer Medien.

## Definition of Done

Eine Änderung ist erst abgeschlossen, wenn:

- die angeforderte Funktion vollständig umgesetzt ist,
- bestehende Objektlinks, Marker, Suche und Fotos weiterhin funktionieren,
- Desktop- und Mobilbedienung geprüft wurden,
- `npm test` erfolgreich ist,
- `git diff --check` keine Probleme meldet,
- Dokumentation und Validator zum neuen Verhalten passen,
- keine Koordinaten, Tiefen oder Inhalte ungeprüft erfunden wurden.
