# Tauchplatzkarte Blausteinsee

Dieses Repository enthält einen Deep-Zoom-Viewer für zwei interaktive
Tauchplatzkarten des Blausteinsees. Große Karten werden als PNG-Kachelpyramiden
geladen und bleiben dadurch auch auf Mobilgeräten flüssig zoombar.

Das Projekt besitzt zwei Betriebsarten:

- **Statischer Modus** für GitHub Pages: Karten, Marker, Suche, lokale Fotos und
  Objektlinks funktionieren ohne Backend.
- **Servermodus** für den privaten Betrieb: zusätzlich Anmeldung,
  Beschreibungsbearbeitung und Foto-Upload für freigeschaltete Redakteure.

## Deployment-Varianten

| Variante | Geeignet für | Redaktion und Upload | Persistente Daten |
| --- | --- | --- | --- |
| GitHub Pages | öffentliche Demo und rein statischer Betrieb | nein | nur Dateien aus Git |
| Node.js lokal | Entwicklung und Tests unter Windows, macOS oder Linux | ja | lokaler Ordner `var/` |
| Docker Compose | einfacher privater oder öffentlicher Serverbetrieb | ja | Docker-Volume `bssmap-data` |
| Node.js + systemd | klassischer Linux-Server ohne Docker | ja | frei wählbares Datenverzeichnis |

GitHub Pages bleibt auch dann nutzbar, wenn dieselbe Codebasis zusätzlich auf
einem privaten Server läuft. Die eingecheckte Konfiguration deaktiviert dort
nur die Serverfunktionen; Karte, Marker, Suche, Objekttexte und statische Fotos
funktionieren weiterhin.

## Voraussetzungen

- Git
- Node.js **24.4 oder neuer** einschließlich npm für den Servermodus
- optional Docker mit Docker Compose
- optional Poppler (`pdfinfo` und `pdftoppm`) nur zur Neuerzeugung der Kacheln

Die aktuell verwendete Node-Version kann mit `node --version` geprüft werden.

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
Benutzernamen haben 3 bis 64 Zeichen; Passwörter müssen mindestens 12 Zeichen
lang sein. Die Befehle aktualisieren einen bereits vorhandenen Benutzer mit
demselben Namen und aktivieren ihn wieder.

Bei Docker werden dieselben Verwaltungsbefehle im Container ausgeführt:

```bash
docker compose run --rm bssmap npm run user:add
docker compose run --rm bssmap npm run user:list
docker compose run --rm bssmap npm run user:disable -- --username NAME
```

Bei einem nativen Produktionsdeployment muss das Datenverzeichnis mitgegeben
werden, zum Beispiel:

```bash
sudo -u bssmap env BSSMAP_DATA_DIR=/var/lib/bssmap npm run user:add
```

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

## Auf GitHub Pages veröffentlichen

Für GitHub Pages ist kein Build-Schritt erforderlich:

1. Änderungen in den Branch `main` pushen.
2. Im GitHub-Repository **Settings → Pages** öffnen.
3. Unter **Build and deployment** die Quelle **Deploy from a branch** wählen.
4. Branch **main** und Ordner **/(root)** auswählen und speichern.

Die Projektseite ist anschließend in der Regel unter dieser Adresse erreichbar:

```text
https://stefanmoers.github.io/bssmap/
```

Nach einem Push kann es einige Minuten dauern, bis GitHub die neue Version
ausliefert. Der Status steht unter **Actions** beziehungsweise **Settings →
Pages**.

`runtime-config.json` muss im Repository auf `"serverFeatures": false` bleiben.
Der Node-Server überschreibt diese Einstellung zur Laufzeit automatisch. Somit
darf für das Serverdeployment keine abweichende Datei committed werden.

GitHub Pages kann keine Anmeldung, SQLite-Datenbank oder Uploads bereitstellen.
Diese Einschränkung betrifft ausschließlich die Redaktionsfunktionen.

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
und Uploads bleiben im Docker-Volume `bssmap-data` erhalten.

Nützliche Befehle:

```bash
docker compose ps
docker compose logs -f bssmap
docker compose stop
docker compose start
docker compose down
```

`docker compose down` entfernt die Container, aber nicht das benannte
Daten-Volume. `docker compose down -v` würde hingegen Datenbank und Uploads
löschen und darf deshalb nicht für einen normalen Neustart verwendet werden.

Für einen öffentlichen Server zunächst `.env.example` als `.env` kopieren:

```bash
cp .env.example .env
```

Unter Windows PowerShell lautet der Kopierbefehl:

```powershell
Copy-Item .env.example .env
```

Danach die Werte in `.env` setzen:

```dotenv
BSSMAP_SECURE_COOKIES=true
BSSMAP_PUBLIC_ORIGIN=https://karte.example.org
```

`BSSMAP_PUBLIC_ORIGIN` muss exakt der öffentlich aufgerufenen HTTPS-Adresse
ohne abschließenden Schrägstrich entsprechen. Anschließend neu starten:

```bash
docker compose up -d --build
docker compose run --rm bssmap npm run setup
```

Der zweite Befehl ist nur einmal für den ersten Admin erforderlich. Damit Port
8080 auf einem öffentlichen Server nicht direkt erreichbar ist, kann in
`compose.yaml` die Portfreigabe auf den lokalen Rechner beschränkt werden:

```yaml
ports:
  - "127.0.0.1:8080:8080"
```

## Nativ auf einem Linux-Server betreiben

Diese Variante nutzt Node.js direkt und startet die Anwendung über systemd.
Im Beispiel liegt der Code unter `/opt/bssmap`, während alle veränderlichen
Daten getrennt unter `/var/lib/bssmap` gespeichert werden.

```bash
sudo git clone https://github.com/stefanmoers/bssmap.git /opt/bssmap
sudo useradd --system --home /var/lib/bssmap --shell /usr/sbin/nologin bssmap
sudo mkdir -p /var/lib/bssmap
sudo chown -R bssmap:bssmap /opt/bssmap /var/lib/bssmap
cd /opt/bssmap
sudo -u bssmap npm ci --omit=dev
sudo -u bssmap env BSSMAP_DATA_DIR=/var/lib/bssmap npm run setup
```

Vorher muss Node.js 24.4 oder neuer systemweit installiert sein. Mit
`command -v node` lässt sich der Pfad zur Node-Binärdatei prüfen. Anschließend
`/etc/systemd/system/bssmap.service` anlegen:

```ini
[Unit]
Description=Blausteinsee Tauchplatzkarte
After=network.target

[Service]
Type=simple
User=bssmap
Group=bssmap
WorkingDirectory=/opt/bssmap
Environment=NODE_ENV=production
Environment=BSSMAP_HOST=127.0.0.1
Environment=BSSMAP_PORT=8080
Environment=BSSMAP_DATA_DIR=/var/lib/bssmap
Environment=BSSMAP_SECURE_COOKIES=true
Environment=BSSMAP_PUBLIC_ORIGIN=https://karte.example.org
ExecStart=/usr/bin/node /opt/bssmap/server/cli.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/bssmap

[Install]
WantedBy=multi-user.target
```

Falls `command -v node` einen anderen Pfad meldet, muss `ExecStart` angepasst
werden. Dienst laden und starten:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bssmap
sudo systemctl status bssmap
sudo journalctl -u bssmap -f
```

## HTTPS-Reverse-Proxy

Der Redaktionsmodus soll öffentlich ausschließlich über HTTPS erreichbar sein.
Der Node-Prozess bleibt dabei auf `127.0.0.1:8080`; Caddy oder Nginx übernimmt
TLS und leitet Anfragen intern weiter.

Minimale Caddy-Konfiguration:

```caddyfile
karte.example.org {
  reverse_proxy 127.0.0.1:8080
}
```

Entsprechender Ausschnitt für Nginx innerhalb eines HTTPS-`server`-Blocks:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

TLS-Zertifikat, DNS und die allgemeine Härtung des Reverse-Proxys gehören zur
Serveradministration und sind nicht Bestandteil dieser Anwendung.

## Konfiguration des Servers

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `BSSMAP_HOST` | `127.0.0.1` | Adresse, auf der der Node-Server lauscht |
| `BSSMAP_PORT` | `8080` | HTTP-Port des Node-Servers |
| `BSSMAP_DATA_DIR` | `var` | Verzeichnis für SQLite und hochgeladene Fotos |
| `BSSMAP_SECURE_COOKIES` | abhängig von `NODE_ENV` | `true` erzwingt HTTPS-Session-Cookies |
| `BSSMAP_PUBLIC_ORIGIN` | leer | erlaubter Browser-Origin, zum Beispiel `https://karte.example.org` |
| `NODE_ENV` | nicht gesetzt | im öffentlichen Betrieb auf `production` setzen |

`--host` und `--port` können beim manuellen Start alternativ als Argumente
übergeben werden, zum Beispiel `npm start -- --host 0.0.0.0 --port 8081`.

## Daten sichern und wiederherstellen

Im nativen Betrieb enthält das Datenverzeichnis:

```text
var/bssmap.sqlite    Benutzer, Sitzungen, Beschreibungen und Fotometadaten
var/photos/          verarbeitete Uploads und Vorschaubilder
```

Bei abweichendem `BSSMAP_DATA_DIR` liegen beide Bestandteile dort. Datenbank
und Fotoordner müssen immer gemeinsam und konsistent gesichert werden.

Sicheres Backup eines systemd-Deployments:

```bash
sudo systemctl stop bssmap
sudo tar -C /var/lib -czf bssmap-backup-YYYY-MM-DD.tar.gz bssmap
sudo systemctl start bssmap
```

Wiederherstellung in ein leeres Datenverzeichnis:

```bash
sudo systemctl stop bssmap
sudo tar -C /var/lib -xzf bssmap-backup-YYYY-MM-DD.tar.gz
sudo chown -R bssmap:bssmap /var/lib/bssmap
sudo systemctl start bssmap
```

Bei Docker befindet sich alles im Volume `bssmap-data`. Für eine einfache
Sicherung den Container kurz anhalten und `/data` kopieren:

```bash
docker compose stop bssmap
docker cp "$(docker compose ps --all -q bssmap):/data" ./bssmap-backup-data
docker compose start bssmap
```

Unter PowerShell:

```powershell
docker compose stop bssmap
$container = docker compose ps --all -q bssmap
docker cp "${container}:/data" ./bssmap-backup-data
docker compose start bssmap
```

Wiederherstellung eines Docker-Backups unter Bash:

```bash
docker compose stop bssmap
container="$(docker compose ps --all -q bssmap)"
docker cp ./bssmap-backup-data/. "${container}:/data"
docker compose run --rm --user root bssmap chown -R node:node /data
docker compose start bssmap
```

In PowerShell wird lediglich die erste Zuweisung als
`$container = docker compose ps --all -q bssmap` geschrieben. Die Sicherung
sollte regelmäßig außerhalb des Servers aufbewahrt werden. Vor einer
Wiederherstellung müssen Anwendung und Datenbank vollständig gestoppt sein.

## Installation aktualisieren

Natives systemd-Deployment:

```bash
sudo systemctl stop bssmap
cd /opt/bssmap
sudo -u bssmap git pull --ff-only
sudo -u bssmap npm ci --omit=dev
sudo -u bssmap npm test
sudo systemctl start bssmap
```

Docker-Deployment:

```bash
git pull
docker compose up -d --build
```

Nach jeder Aktualisierung Anmeldung, Objektanzeige, Beschreibung und einen
Test-Upload prüfen. Vor Änderungen an einer produktiven Installation sollte
ein aktuelles Backup vorhanden sein.

## Bedienung

- **Objektkarte / Detailkarte**: Kartenansicht umschalten
- Ziehen: Kartenausschnitt verschieben
- Mausrad oder Zwei-Finger-Geste: zoomen
- Doppelklick oder Doppeltipp: hineinzoomen
- `+` / `-`: Zoom ändern
- `0`: Standardansicht der aktiven Karte öffnen
- `F`: Vollbildansicht umschalten
- `◎`: Tauchziele öffnen und durchsuchen
- `↝`: Tauchgangsplaner öffnen
- `✎`: Redaktion öffnen, sofern der Servermodus aktiv ist
- gelbe Markierung: Informationen zum Tauchziel anzeigen

Der Kartenumschalter und die Marker sind mit Maus, Touch und Tastatur bedienbar.

## Tauchgangsplaner

Der Planer funktioniert vollständig im Browser und steht deshalb sowohl auf
GitHub Pages als auch im Servermodus zur Verfügung. Nach dem Öffnen über `↝`
werden Marker beziehungsweise Einträge der Tauchzielliste in der angeklickten
Reihenfolge als Wegpunkte übernommen. Derselbe Punkt darf mehrfach vorkommen,
zum Beispiel der Einstieg als erster und letzter Wegpunkt.

Beim ersten Öffnen pro Browser-Sitzung erscheint ein verpflichtender Hinweis
auf den experimentellen Charakter und die Grenzen der Berechnung. Erst nach
einer ausdrücklichen Bestätigung wird der Planer geöffnet. Die Bestätigung gilt
nur für den aktuellen Browser-Tab und wird nicht dauerhaft gespeichert.

Für jeden Plan werden angezeigt:

- nummerierte Wegpunkte und Richtungslinien auf der aktiven Karte
- Distanz, Ankunftszeit und erwarteter Restdruck pro Wegpunkt
- einstellbare Aufenthaltszeit an jedem Ziel
- Gesamtstrecke, Laufzeit, zeitgewichtete Durchschnittstiefe und Maximaltiefe
- optional Gasverbrauch und Enddruck
- grafischer Tiefen- und Druckverlauf
- Warnungen bei fehlenden Daten oder Unterschreitung der Reserve

Wegpunkte lassen sich verschieben, löschen oder in ihrer Reihenfolge umkehren.
Die Planung wird automatisch im lokalen Browserspeicher gesichert. Der Button
**Routenlink kopieren** ergänzt die Objekt-IDs als `route`-Parameter:

```text
?map=detail-map&route=einstieg,plattform-9m,fahrrad,segelboot,einstieg
```

Der Link enthält Route und Kartenansicht, aber bewusst keine persönlichen
Gasparameter. Beim Öffnen eines Routenlinks werden Aufenthaltszeiten zunächst
auf 0 Minuten gesetzt.

### Distanz- und Zeitmodell

Die Karten besitzen eine explizite Meterkalibrierung in `data/maps.json`:

| Karte | Referenz | Kalibrierung |
| --- | --- | ---: |
| Objektkarte | Maßstabsbalken 0 bis 100 m = 1.125 Pixel | 0,0888888889 m/Pixel |
| Detailkarte | 10-m-Raster = 157,480315 Pixel bei 400 dpi | 0,0635 m/Pixel |

Die Strecke zwischen zwei Wegpunkten ist deren geradliniger Pixelabstand mal
`metersPerPixel`. Eine Linie im Planer bestätigt nicht, dass dort tatsächlich
eine Führungsleine oder freie Passage vorhanden ist.

Zwischen zwei Objekten wird die Tiefe linear interpoliert. Die Segmentzeit ist
das Maximum aus horizontal benötigter Zeit und der Zeit für den notwendigen
Auf- beziehungsweise Abstieg:

```text
horizontale Zeit = Distanz / horizontale Geschwindigkeit
vertikale Zeit   = Tiefenunterschied / Auf- oder Abstiegsgeschwindigkeit
Segmentzeit      = max(horizontale Zeit, vertikale Zeit)
```

Standardwerte sind 10 m/min horizontal, 15 m/min im Abstieg und 9 m/min im
Aufstieg. Die Durchschnittstiefe wird über Reise- und Aufenthaltszeiten
gewichtet. Der Einstieg wird als Oberflächenpunkt mit 0 m behandelt. Ein
anderes Objekt ohne hinterlegte Tiefe verhindert bewusst eine vollständige
Zeit- und Gasprognose.

### Einfaches OC-Gasmodell

Einstellbar sind RMV in Litern pro Minute, gesamtes Flascheninnenvolumen,
Startdruck und Reservedruck. Standardmäßig verwendet der Planer 20 l/min,
12 l, 200 bar und 70 bar Reserve. Alle Werte sind Planungsannahmen und müssen
zum Taucher und Tauchgang passen.

Der Verbrauch wird für jedes Reise- und Aufenthaltssegment einzeln berechnet.
Für Süßwasser gilt näherungsweise:

```text
Druckfaktor             = 1 + mittlere Tiefe / 10,3
Gas an der Oberfläche   = RMV × Zeit × Druckfaktor
erwarteter Druckverlust = Gas an der Oberfläche / Flascheninnenvolumen
```

Intern rechnet der Planer mit auf Oberflächendruck bezogenen Litern. Die
Gasplanung ist eine Prognose; reale Anstrengung, Kälte, Strömung,
Manometergenauigkeit und Atemverhalten können den tatsächlichen Verbrauch
deutlich verändern.

Der Planer berechnet ausdrücklich keine Nullzeit, Gewebesättigung oder
Dekompressionsstopps. Er ersetzt weder Ausbildung noch Tauchcomputer,
Tauchtabelle, geprüfte Dekompressionssoftware oder eine angemessene persönliche
und für den Buddy ausreichende Gasreserve.

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

## In eine bestehende Webseite einbetten

Die veröffentlichte Karte kann ohne merklichen Performance-Nachteil in einem
`iframe` eingebunden werden. Der Viewer lädt weiterhin nur die für den
sichtbaren Ausschnitt benötigten Kacheln:

```html
<iframe
  src="https://stefanmoers.github.io/bssmap/?map=object-map"
  title="Interaktive Tauchplatzkarte Blausteinsee"
  loading="lazy"
  allow="fullscreen"
  style="width: 100%; height: min(80vh, 900px); border: 0;"
></iframe>
```

Für eine produktive Einbindung kann statt der GitHub-Pages-Adresse die private
Serveradresse eingesetzt werden. Damit Anmeldung und Cookies zuverlässig
funktionieren, sollten einbettende Webseite und Kartenserver möglichst unter
derselben Hauptdomain liegen. Auf kleinen Displays muss der umgebende Container
ausreichend hoch sein; der Viewer selbst ist responsiv.

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

## Sicherheitsmodell

- Passwörter werden mit scrypt und individuellem Salt gehasht.
- Sitzungen verwenden zufällige, serverseitig gespeicherte Tokens und
  `HttpOnly`-/`SameSite`-Cookies.
- Schreibzugriffe benötigen Anmeldung, passende Rolle und CSRF-Token.
- Wiederholte fehlgeschlagene Anmeldungen werden begrenzt.
- Uploads werden dekodiert, neu als WebP geschrieben und verlieren dadurch
  eingebettete EXIF- und GPS-Metadaten.

Das ersetzt keine Serverwartung: Betriebssystem, Node.js, Docker und
Reverse-Proxy müssen aktuell gehalten werden. Der Ordner `var/`, die Datei
`.env`, Backups und sonstige Zugangsdaten dürfen nicht veröffentlicht oder in
Git committed werden.

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
Kachelpyramiden, Meterkalibrierungen, kartenspezifische Objektpositionen,
eindeutige IDs und alle Fotoreferenzen. `npm test` führt außerdem Unit-Tests
für Distanz-, Zeit- und Gasberechnung sowie die Servertests für Anmeldung,
Berechtigungen, Beschreibung, Upload, Bildverarbeitung und Löschen aus.

## Projektstruktur

```text
index.html                         Viewer-Seite und Kartenumschalter
styles.css                        Responsive Oberfläche und Marker
viewer.js                         OpenSeadragon- und Mehrkartenlogik
planner.js                        Planerzustand, Oberfläche, Route und Speicherung
planning-calculations.js          reine Distanz-, Zeit-, Tiefen- und Gasberechnung
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
