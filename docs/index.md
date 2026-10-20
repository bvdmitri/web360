---
layout: home

hero:
  name: web360
  text: Raw 360 recordings, stitched and stabilized in the browser
  tagline: Open an Insta360 or GoPro recording from the files a user picked, and get stabilized equirectangular VideoFrames, rendered on WebGPU and decoded with WebCodecs.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/bvdmitri/web360

features:
  - title: Insta360, stitched
    details: The two fisheye lenses of an .insv recording stitched with measured optics, the seam matched in exposure and colour, rolling shutter corrected.
  - title: GoPro, read out
    details: A GoPro MAX or MAX2 .360 recording's in-camera cube map rendered on the GPU, its chapters joined into one recording.
  - title: Stabilized
    details: The camera's gyro integrated and levelled, with a level horizon facing a smoothed heading by default, or a fixed world, a smoothed follow, or as recorded.
  - title: In the browser
    details: Nothing leaves the user's machine. Recordings are read in place from the picked files, never loaded whole into memory.
---
