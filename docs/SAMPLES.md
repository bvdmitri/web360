# Samples and fixtures

## Private samples

Real recordings for local measurements go in `samples/`, which git ignores except for its README.
They often show people, places and camera serial numbers, so none of it is ever committed.

`samples/catalogue.json` lists what must not leak. The repository checks (`tools/checks`) refuse
a commit whose files, paths or message contain any of its terms:

```json
{
  "samples": [{ "files": ["VID_..._00_001.insv", "VID_..._10_001.insv"], "serial": "..." }],
  "terms": ["a folder name", "a person's name"]
}
```

A missing catalogue checks nothing (a fresh clone has no private samples); an unreadable one fails
the check.

## Committed fixtures

Test fixtures live in `test/fixtures/`, stored with Git LFS (`.gitattributes`). Each is either
built synthetically by `tools/fixtures`, or derived from a real recording so that it keeps no
faces or identifying details. A derived fixture is one of two kinds: a short clip cut losslessly,
or a structural extract that keeps a recording's container and metadata but drops the picture
entirely (so it has no frames and no faces), with the embedded thumbnails zeroed and the camera
serial replaced. Every fixture has an entry in `test/fixtures/manifest.json` naming its origin, its
licence and what it covers.
