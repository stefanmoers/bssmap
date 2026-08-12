# Tauchplatzkarte Blausteinsee

Dieses Repository enthält einen Deep-Zoom-Viewer für zwei interaktive
Tauchplatzkarten des Blausteinsees. Große Karten werden als PNG-Kachelpyramiden
geladen und bleiben dadurch auch auf Mobilgeräten flüssig zoombar.

Das Projekt besitzt zwei Betriebsarten:

- **Statischer Modus** für GitHub Pages: Karten, Marker, Suche, lokale Fotos und
  Objektlinks funktionieren ohne Backend.
- **Servermodus** für den privaten Betrieb: zusätzlich Anmeldung,
  Beschreibungsbearbeitung und Foto-Upload für freigeschaltete Redakteure.

Verfügbar sind:

- **Objektkarte** mit dem vollständigen bisherigen Objektbestand
- **Detailkarte** mit Tiefenlinien, Leinenverläufen, Entfernungen und 62 sicher
  lokalisierten Tauchzielen

Der Umschalter lädt die jeweilige DZI-Quelle ohne vollständigen Seitenreload.
Marker, Suche, Detailinformationen und Fotos werden automatisch auf die Ziele
der aktiven Karte eingeschränkt. Der aktuelle Kartenausschnitt und die
Zoomstufe bleiben beim Wechsel relativ zur jeweiligen Gesamtkarte erhalten.

## Servermodus lokal einrichten

Benötigt wird Node.js 24.4 oder neuer. Nach dem Klonen sind unter Windows,
macOS und Linux dieselben Befehle verwendbar:

```bash
git clone https://github.com/stefanmoers/bssmap.git
cd bssmap
npm install
npm run setup
npm start
```

`npm run setup` fragt Benutzername und Passwort für den ersten Admin ab. Danach
ist die Anwendung unter `http://localhost:8080/` erreichbar. Über das Stift-
Symbol in der Werkzeugleiste öffnet sich die Anmeldung.

Die Datenbank und hochgeladenen Fotos liegen standardmäßig unter `var/` und
werden nicht in Git eingecheckt. Für ein vollständiges Backup genügt daher eine
Sicherung dieses Ordners.

Weitere Benutzer verwalten:

```bash
npm run user:add
npm run user:list
npm run user:disable -- --username NAME
```

Ein `editor` darf Beschreibungen ändern, Fotos hochladen und eigene Uploads
löschen. Ein `admin` darf zusätzlich Uploads anderer Benutzer löschen.

Für einen Test im lokalen Netzwerk:

```bash
npm start -- --host 0.0.0.0
```

Computer und Mobilgerät müssen sich im selben privaten Netzwerk befinden. Die
lokale IP-Adresse des Computers ermitteln und beispielsweise
`http://192.168.178.35:8080/` öffnen. Eine Firewall-Freigabe sollte nur für das
private Netzwerk erfolgen.

## Statischen GitHub-Pages-Modus lokal testen

Dieser Test startet bewusst kein Backend. Damit lässt sich prüfen, dass GitHub
Pages weiterhin alle öffentlichen Kartenfunktionen anbietet. Unter macOS oder
Linux:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

Unter Windows PowerShell:

```powershell
py -m http.server 8080 --bind 0.0.0.0
```

Anschließend `http://localhost:8080/` öffnen. Das Stift-Symbol für die Redaktion
ist in diesem Modus nicht sichtbar.

Ein direkter Doppelklick auf `index.html` ist nicht zuverlässig, weil Browser
das Nachladen lokaler JSON-, DZI- und Kacheldateien bei `file://` einschränken
können.

Den Server anschließend mit `Strg+C` beenden.

## Mit Docker betreiben

Docker ist optional. Die Einrichtung ist auf Windows mit Docker Desktop,
macOS und Linux identisch:

```bash
git clone https://github.com/stefanmoers/bssmap.git
cd bssmap
docker compose build
docker compose run --rm bssmap npm run setup
docker compose up -d
```

Die Anwendung ist danach unter `http://localhost:8080/` erreichbar. Datenbank
und Uploads bleiben im Docker-Volume `bssmap-data` erhalten. Aktualisierung:

```bash
git pull
docker compose up -d --build
```

Im öffentlichen Serverbetrieb muss ein HTTPS-Reverse-Proxy vor der Anwendung
stehen. Setze dann `BSSMAP_SECURE_COOKIES=true` und beispielsweise
`BSSMAP_PUBLIC_ORIGIN=https://karte.example.org`. Die Anwendung selbst sollte
nur an den Reverse-Proxy gebunden beziehungsweise per Firewall geschützt sein.
Die Datei `.env.example` kann dafür als Vorlage für eine nicht versionierte
`.env` verwendet werden.

## Bedienung

- **Objektkarte / Detailkarte**: Kartenansicht umschalten
- Ziehen: Kartenausschnitt verschieben
- Mausrad oder Zwei-Finger-Geste: zoomen
- Doppelklick oder Doppeltipp: hineinzoomen
- `+` / `-`: Zoom ändern
- `0`: Standardansicht der aktiven Karte öffnen
- `F`: Vollbildansicht umschalten
- `◎`: Tauchziele öffnen und durchsuchen
- `✎`: Redaktion öffnen, sofern der Servermodus aktiv ist
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

Im Servermodus können Redakteure Fotos direkt in der Detailansicht eines
Tauchziels hochladen. Erlaubt sind JPEG, PNG und WebP bis 10 MB. Der Server
erzeugt automatisch ein großes WebP mit maximal 2.000 Pixeln sowie ein
Vorschaubild mit maximal 500 Pixeln. Metadaten wie EXIF- und GPS-Daten werden
nicht übernommen. Statische und hochgeladene Fotos erscheinen gemeinsam in
derselben Galerie.

Bearbeitete Beschreibungen werden als Server-Override in SQLite gespeichert.
Die unveränderte Beschreibung aus `data/objects.json` bleibt der Fallback für
GitHub Pages.

## Kacheln reproduzierbar erzeugen

Voraussetzung ist Node.js 24.4 oder neuer. Abhängigkeiten installieren:

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
Fotoreferenzen. `npm test` führt außerdem die Servertests für Anmeldung,
Berechtigungen, Beschreibung, Upload, Bildverarbeitung und Löschen aus.

## Projektstruktur

```text
index.html                         Viewer-Seite und Kartenumschalter
styles.css                        Responsive Oberfläche und Marker
viewer.js                         OpenSeadragon- und Mehrkartenlogik
runtime-config.json               deaktiviert Serverfunktionen auf GitHub Pages
data/maps.json                    Kartendefinitionen
data/objects.json                 Objekte und kartenspezifische Positionen
maps/object-map/map.dzi           DZI der Objektkarte
maps/object-map/map_files/        Kacheln der Objektkarte
maps/detail-map/map.dzi           DZI der Detailkarte
maps/detail-map/map_files/        Kacheln der Detailkarte
images/objects/                   Unterwasserfotos
server/                           HTTP-Server, SQLite, Auth und Upload
var/                              lokale Laufzeitdaten, nicht versioniert
Dockerfile / compose.yaml         optionales Serverdeployment
vendor/openseadragon/             Lokale OpenSeadragon-Laufzeit
scripts/                          Kachelerzeugung und Projektvalidator
```

## GitHub Pages und Rechte

Alle Ressourcen verwenden relative Pfade und funktionieren unter einer
GitHub-Pages-Projektadresse. Die eingecheckte `runtime-config.json` deaktiviert
dort nur Anmeldung und Redaktionsfunktionen. Beide Karten, Marker, Suche,
Objektlinks und statische Fotos bleiben vollständig nutzbar.

Die Karten, Symbole, Texte und Fotos bleiben Eigentum ihrer jeweiligen Urheber;
vor einer öffentlichen Veröffentlichung sind Freigaben und Bildrechte zu
prüfen. OpenSeadragon wird unter der BSD-3-Clause-Lizenz ausgeliefert.
