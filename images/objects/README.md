# Objektfotos

Fotos werden pro Tauchziel in einem eigenen Unterordner abgelegt, zum Beispiel:

```text
images/objects/segelboot/segelboot-01.jpg
images/objects/segelboot/segelboot-02.jpg
```

Anschließend werden sie in `data/objects.json` beim jeweiligen Objekt ergänzt:

```json
"photos": [
  {
    "src": "images/objects/segelboot/segelboot-01.jpg",
    "alt": "Segelboot auf dem Grund des Blausteinsees",
    "caption": "Aufnahme von der Steuerbordseite"
  }
]
```

Empfehlungen:

- JPEG oder WebP für Unterwasserfotos
- etwa 1.600 bis 2.000 Pixel Breite
- möglichst unter 500 KB pro Bild
- aussagekräftiger Alternativtext
- Urheber und Freigabe vor Veröffentlichung klären

## Upload im Servermodus

Freigeschaltete Redakteure können Fotos auch direkt in der Objektansicht
hochladen. Diese Dateien werden nicht in diesem Ordner und nicht im Git-
Repository gespeichert, sondern unter `var/photos/` beziehungsweise im
konfigurierten `BSSMAP_DATA_DIR`.

Der Server akzeptiert JPEG, PNG und WebP bis 10 MB, prüft das tatsächliche
Bildformat und erzeugt zwei WebP-Dateien:

- Galeriebild mit maximal 2.000 x 2.000 Pixeln
- Vorschaubild mit maximal 500 x 500 Pixeln

EXIF- und GPS-Metadaten werden nicht in die erzeugten Dateien übernommen. Ein
Alternativtext ist verpflichtend. Die SQLite-Datenbank und der Fotoordner
müssen gemeinsam gesichert werden.
