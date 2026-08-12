# Tauchplatzkarte Blausteinsee

Dieses Repository enthÃ¤lt einen Deep-Zoom-Viewer fÃ¼r zwei interaktive
Tauchplatzkarten des Blausteinsees. GroÃŸe Karten werden als PNG-Kachelpyramiden
geladen und bleiben dadurch auch auf MobilgerÃ¤ten flÃ¼ssig zoombar.

Das Projekt besitzt zwei Betriebsarten:

- **Statischer Modus** fÃ¼r GitHub Pages: Karten, Marker, Suche, lokale Fotos und
  Objektlinks funktionieren ohne Backend.
- **Servermodus** fÃ¼r den privaten Betrieb: zusÃ¤tzlich Anmeldung,
  Beschreibungsbearbeitung und Foto-Upload fÃ¼r freigeschaltete Redakteure.

## Deployment-Varianten

| Variante | Geeignet fÃ¼r | Redaktion und Upload | Persistente Daten |
| --- | --- | --- | --- |
| GitHub Pages | Ã¶ffentliche Demo und rein statischer Betrieb | nein | nur Dateien aus Git |
| Node.js lokal | Entwicklung und Tests unter Windows, macOS oder Linux | ja | lokaler Ordner `var/` |
| Docker Compose | einfacher privater oder Ã¶ffentlicher Serverbetrieb | ja | Docker-Volume `bssmap-data` |
| Node.js + systemd | klassischer Linux-Server ohne Docker | ja | frei wÃ¤hlbares Datenverzeichnis |

GitHub Pages bleibt auch dann nutzbar, wenn dieselbe Codebasis zusÃ¤tzlich auf
einem privaten Server lÃ¤uft. Die eingecheckte Konfiguration deaktiviert dort
nur die Serverfunktionen; Karte, Marker, Suche, Objekttexte und statische Fotos
funktionieren weiterhin.

## Voraussetzungen

- Git
- Node.js **24.4 oder neuer** einschlieÃŸlich npm fÃ¼r den Servermodus
- optional Docker mit Docker Compose
- optional Poppler (`pdfinfo` und `pdftoppm`) nur zur Neuerzeugung der Kacheln

Die aktuell verwendete Node-Version kann mit `node --version` geprÃ¼ft werden.

VerfÃ¼gbar sind:

- **Objektkarte** mit dem vollstÃ¤ndigen bisherigen Objektbestand
- **Detailkarte** mit Tiefenlinien, LeinenverlÃ¤ufen, Entfernungen und 62 sicher
  lokalisierten Tauchzielen

Der Umschalter lÃ¤dt die jeweilige DZI-Quelle ohne vollstÃ¤ndigen Seitenreload.
Marker, Suche, Detailinformationen und Fotos werden automatisch auf die Ziele
der aktiven Karte eingeschrÃ¤nkt. Der aktuelle Kartenausschnitt und die
Zoomstufe bleiben beim Wechsel relativ zur jeweiligen Gesamtkarte erhalten.

## Servermodus lokal einrichten

BenÃ¶tigt wird Node.js 24.4 oder neuer. Nach dem Klonen sind unter Windows,
macOS und Linux dieselben Befehle verwendbar:

```bash
git clone https://github.com/stefanmoers/bssmap.git
cd bssmap
npm install
npm run setup
npm start
```

`npm run setup` fragt Benutzername und Passwort fÃ¼r den ersten Admin ab. Danach
ist die Anwendung unter `http://localhost:8080/` erreichbar. Ãœber das Stift-
Symbol in der Werkzeugleiste Ã¶ffnet sich die Anmeldung.

Die Datenbank und hochgeladenen Fotos liegen standardmÃ¤ÃŸig unter `var/` und
werden nicht in Git eingecheckt. FÃ¼r ein vollstÃ¤ndiges Backup genÃ¼gt daher eine
Sicherung dieses Ordners.

Weitere Benutzer verwalten:

```bash
npm run user:add
npm run user:list
npm run user:disable -- --username NAME
```

Ein `editor` darf Beschreibungen Ã¤ndern, Fotos hochladen und eigene Uploads
lÃ¶schen. Ein `admin` darf zusÃ¤tzlich Uploads anderer Benutzer lÃ¶schen.
Benutzernamen haben 3 bis 64 Zeichen; PasswÃ¶rter mÃ¼ssen mindestens 12 Zeichen
lang sein. Die Befehle aktualisieren einen bereits vorhandenen Benutzer mit
demselben Namen und aktivieren ihn wieder.

Bei Docker werden dieselben Verwaltungsbefehle im Container ausgefÃ¼hrt:

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

FÃ¼r einen Test im lokalen Netzwerk:

```bash
npm start -- --host 0.0.0.0
```

Computer und MobilgerÃ¤t mÃ¼ssen sich im selben privaten Netzwerk befinden. Die
lokale IP-Adresse des Computers ermitteln und beispielsweise
`http://192.168.178.35:8080/` Ã¶ffnen. Eine Firewall-Freigabe sollte nur fÃ¼r das
private Netzwerk erfolgen.

## Statischen GitHub-Pages-Modus lokal testen

Dieser Test startet bewusst kein Backend. Damit lÃ¤sst sich prÃ¼fen, dass GitHub
Pages weiterhin alle Ã¶ffentlichen Kartenfunktionen anbietet. Unter macOS oder
Linux:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

Unter Windows PowerShell:

```powershell
py -m http.server 8080 --bind 0.0.0.0
```

AnschlieÃŸend `http://localhost:8080/` Ã¶ffnen. Das Stift-Symbol fÃ¼r die Redaktion
ist in diesem Modus nicht sichtbar.

Ein direkter Doppelklick auf `index.html` ist nicht zuverlÃ¤ssig, weil Browser
das Nachladen lokaler JSON-, DZI- und Kacheldateien bei `file://` einschrÃ¤nken
kÃ¶nnen.

Den Server anschlieÃŸend mit `Strg+C` beenden.

## Auf GitHub Pages verÃ¶ffentlichen

FÃ¼r GitHub Pages ist kein Build-Schritt erforderlich:

1. Ã„nderungen in den Branch `main` pushen.
2. Im GitHub-Repository **Settings â†’ Pages** Ã¶ffnen.
3. Unter **Build and deployment** die Quelle **Deploy from a branch** wÃ¤hlen.
4. Branch **main** und Ordner **/(root)** auswÃ¤hlen und speichern.

Die Projektseite ist anschlieÃŸend in der Regel unter dieser Adresse erreichbar:

```text
https://stefanmoers.github.io/bssmap/
```

Nach einem Push kann es einige Minuten dauern, bis GitHub die neue Version
ausliefert. Der Status steht unter **Actions** beziehungsweise **Settings â†’
Pages**.

`runtime-config.json` muss im Repository auf `"serverFeatures": false` bleiben.
Der Node-Server Ã¼berschreibt diese Einstellung zur Laufzeit automatisch. Somit
darf fÃ¼r das Serverdeployment keine abweichende Datei committed werden.

GitHub Pages kann keine Anmeldung, SQLite-Datenbank oder Uploads bereitstellen.
Diese EinschrÃ¤nkung betrifft ausschlieÃŸlich die Redaktionsfunktionen.

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

NÃ¼tzliche Befehle:

```bash
docker compose ps
docker compose logs -f bssmap
docker compose stop
docker compose start
docker compose down
```

`docker compose down` entfernt die Container, aber nicht das benannte
Daten-Volume. `docker compose down -v` wÃ¼rde hingegen Datenbank und Uploads
lÃ¶schen und darf deshalb nicht fÃ¼r einen normalen Neustart verwendet werden.

FÃ¼r einen Ã¶ffentlichen Server zunÃ¤chst `.env.example` als `.env` kopieren:

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

`BSSMAP_PUBLIC_ORIGIN` muss exakt der Ã¶ffentlich aufgerufenen HTTPS-Adresse
ohne abschlieÃŸenden SchrÃ¤gstrich entsprechen. AnschlieÃŸend neu starten:

```bash
docker compose up -d --build
docker compose run --rm bssmap npm run setup
```

Der zweite Befehl ist nur einmal fÃ¼r den ersten Admin erforderlich. Damit Port
8080 auf einem Ã¶ffentlichen Server nicht direkt erreichbar ist, kann in
`compose.yaml` die Portfreigabe auf den lokalen Rechner beschrÃ¤nkt werden:

```yaml
ports:
  - "127.0.0.1:8080:8080"
```

## Nativ auf einem Linux-Server betreiben

Diese Variante nutzt Node.js direkt und startet die Anwendung Ã¼ber systemd.
Im Beispiel liegt der Code unter `/opt/bssmap`, wÃ¤hrend alle verÃ¤nderlichen
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
`command -v node` lÃ¤sst sich der Pfad zur Node-BinÃ¤rdatei prÃ¼fen. AnschlieÃŸend
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

Der Redaktionsmodus soll Ã¶ffentlich ausschlieÃŸlich Ã¼ber HTTPS erreichbar sein.
Der Node-Prozess bleibt dabei auf `127.0.0.1:8080`; Caddy oder Nginx Ã¼bernimmt
TLS und leitet Anfragen intern weiter.

Minimale Caddy-Konfiguration:

```caddyfile
karte.example.org {
  reverse_proxy 127.0.0.1:8080
}
```

Entsprechender Ausschnitt fÃ¼r Nginx innerhalb eines HTTPS-`server`-Blocks:

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

TLS-Zertifikat, DNS und die allgemeine HÃ¤rtung des Reverse-Proxys gehÃ¶ren zur
Serveradministration und sind nicht Bestandteil dieser Anwendung.

## Konfiguration des Servers

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `BSSMAP_HOST` | `127.0.0.1` | Adresse, auf der der Node-Server lauscht |
| `BSSMAP_PORT` | `8080` | HTTP-Port des Node-Servers |
| `BSSMAP_DATA_DIR` | `var` | Verzeichnis fÃ¼r SQLite und hochgeladene Fotos |
| `BSSMAP_SECURE_COOKIES` | abhÃ¤ngig von `NODE_ENV` | `true` erzwingt HTTPS-Session-Cookies |
| `BSSMAP_PUBLIC_ORIGIN` | leer | erlaubter Browser-Origin, zum Beispiel `https://karte.example.org` |
| `NODE_ENV` | nicht gesetzt | im Ã¶ffentlichen Betrieb auf `production` setzen |

`--host` und `--port` kÃ¶nnen beim manuellen Start alternativ als Argumente
Ã¼bergeben werden, zum Beispiel `npm start -- --host 0.0.0.0 --port 8081`.

## Daten sichern und wiederherstellen

Im nativen Betrieb enthÃ¤lt das Datenverzeichnis:

```text
var/bssmap.sqlite    Benutzer, Sitzungen, Beschreibungen und Fotometadaten
var/photos/          verarbeitete Uploads und Vorschaubilder
```

Bei abweichendem `BSSMAP_DATA_DIR` liegen beide Bestandteile dort. Datenbank
und Fotoordner mÃ¼ssen immer gemeinsam und konsistent gesichert werden.

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

Bei Docker befindet sich alles im Volume `bssmap-data`. FÃ¼r eine einfache
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
sollte regelmÃ¤ÃŸig auÃŸerhalb des Servers aufbewahrt werden. Vor einer
Wiederherstellung mÃ¼ssen Anwendung und Datenbank vollstÃ¤ndig gestoppt sein.

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
Test-Upload prÃ¼fen. Vor Ã„nderungen an einer produktiven Installation sollte
ein aktuelles Backup vorhanden sein.

## Bedienung

- **Objektkarte / Detailkarte**: Kartenansicht umschalten
- Ziehen: Kartenausschnitt verschieben
- Mausrad oder Zwei-Finger-Geste: zoomen
- Doppelklick oder Doppeltipp: hineinzoomen
- `+` / `-`: Zoom Ã¤ndern
- `0`: Standardansicht der aktiven Karte Ã¶ffnen
- `F`: Vollbildansicht umschalten
- `â—Ž`: Tauchziele Ã¶ffnen und durchsuchen
- `âœŽ`: Redaktion Ã¶ffnen, sofern der Servermodus aktiv ist
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

Bestehende Links ohne `map` bleiben gÃ¼ltig und Ã¶ffnen die Objektkarte:

```text
?object=segelboot
```

Unbekannte Karten-IDs fallen auf die Objektkarte zurÃ¼ck. Fehlt einem Objekt die
Position auf der gewÃ¤hlten Karte, wird es dort weder in der Liste noch als
Marker angeboten.

## In eine bestehende Webseite einbetten

Die verÃ¶ffentlichte Karte kann ohne merklichen Performance-Nachteil in einem
`iframe` eingebunden werden. Der Viewer lÃ¤dt weiterhin nur die fÃ¼r den
sichtbaren Ausschnitt benÃ¶tigten Kacheln:

```html
<iframe
  src="https://stefanmoers.github.io/bssmap/?map=object-map"
  title="Interaktive Tauchplatzkarte Blausteinsee"
  loading="lazy"
  allow="fullscreen"
  style="width: 100%; height: min(80vh, 900px); border: 0;"
></iframe>
```

FÃ¼r eine produktive Einbindung kann statt der GitHub-Pages-Adresse die private
Serveradresse eingesetzt werden. Damit Anmeldung und Cookies zuverlÃ¤ssig
funktionieren, sollten einbettende Webseite und Kartenserver mÃ¶glichst unter
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

Zum Erfassen einer Position die gewÃ¼nschte Karte im Bearbeitungsmodus Ã¶ffnen:

```text
http://localhost:8080/?map=detail-map&edit=1
```

Nach einem Klick auf die tatsÃ¤chliche Objektposition erzeugt der Editor einen
JSON-Eintrag mit der aktiven Karten-ID.

### Fotos ergÃ¤nzen

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

Im Servermodus kÃ¶nnen Redakteure Fotos direkt in der Detailansicht eines
Tauchziels hochladen. Erlaubt sind JPEG, PNG und WebP bis 10 MB. Der Server
erzeugt automatisch ein groÃŸes WebP mit maximal 2.000 Pixeln sowie ein
Vorschaubild mit maximal 500 Pixeln. Metadaten wie EXIF- und GPS-Daten werden
nicht Ã¼bernommen. Statische und hochgeladene Fotos erscheinen gemeinsam in
derselben Galerie.

Bearbeitete Beschreibungen werden als Server-Override in SQLite gespeichert.
Die unverÃ¤nderte Beschreibung aus `data/objects.json` bleibt der Fallback fÃ¼r
GitHub Pages.

## Sicherheitsmodell

- PasswÃ¶rter werden mit scrypt und individuellem Salt gehasht.
- Sitzungen verwenden zufÃ¤llige, serverseitig gespeicherte Tokens und
  `HttpOnly`-/`SameSite`-Cookies.
- Schreibzugriffe benÃ¶tigen Anmeldung, passende Rolle und CSRF-Token.
- Wiederholte fehlgeschlagene Anmeldungen werden begrenzt.
- Uploads werden dekodiert, neu als WebP geschrieben und verlieren dadurch
  eingebettete EXIF- und GPS-Metadaten.

Das ersetzt keine Serverwartung: Betriebssystem, Node.js, Docker und
Reverse-Proxy mÃ¼ssen aktuell gehalten werden. Der Ordner `var/`, die Datei
`.env`, Backups und sonstige Zugangsdaten dÃ¼rfen nicht verÃ¶ffentlicht oder in
Git committed werden.

## Kacheln reproduzierbar erzeugen

Voraussetzung ist Node.js 24.4 oder neuer. AbhÃ¤ngigkeiten installieren:

```bash
npm install
```

Die Detailkarte basiert auf
`2026-08-11b_Blausteinsee-sz.ohne-Details.erweitert.pdf`. Die einzige relevante
PDF-Seite wurde verlustfrei mit 400 dpi als PNG mit `7997 Ã— 11414` Pixeln
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

Das temporÃ¤re PNG wird nicht committed. Das Skript ersetzt dagegen bewusst die
angegebene `.dzi`-Datei und den zugehÃ¶rigen `_files`-Ordner. Die Objektkarte
wurde unverÃ¤ndert nach `maps/object-map/` verschoben und nicht neu erzeugt.

OpenSeadragon wird lokal ausgeliefert und kontrolliert aktualisiert mit:

```bash
npm install
npm run copy-vendor
```

## PrÃ¼fung

```bash
npm test
git diff --check
```

Der Validator prÃ¼ft beide Kartendefinitionen, DZI-Abmessungen, vollstÃ¤ndige
Kachelpyramiden, kartenspezifische Objektpositionen, eindeutige IDs und alle
Fotoreferenzen. `npm test` fÃ¼hrt auÃŸerdem die Servertests fÃ¼r Anmeldung,
Berechtigungen, Beschreibung, Upload, Bildverarbeitung und LÃ¶schen aus.

## Projektstruktur

```text
index.html                         Viewer-Seite und Kartenumschalter
styles.css                        Responsive OberflÃ¤che und Marker
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
Objektlinks und statische Fotos bleiben vollstÃ¤ndig nutzbar.

Die Karten, Symbole, Texte und Fotos bleiben Eigentum ihrer jeweiligen Urheber;
vor einer Ã¶ffentlichen VerÃ¶ffentlichung sind Freigaben und Bildrechte zu
prÃ¼fen. OpenSeadragon wird unter der BSD-3-Clause-Lizenz ausgeliefert.