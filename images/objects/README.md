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
